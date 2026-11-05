/**
 * git_ops.js — what the panel and the graph share about calling an adapter.
 * Internal to @flexdesk/git: not exported from its barrel.
 */

import { openForm } from '../ui/components/modal.js';
import { reportBridgeError } from '../ui/components/toast.js';
import { openGitDiffWindow } from './diff_window.js';

/**
 * Call an adapter method. A failure, an `{ ok: false, error }` answer or a
 * throw alike, is an error toast carrying the backend's words; a stop on
 * conflicts is said to be that.
 * @param {string} opName - As the toast names it: 'Git push'.
 * @param {() => Promise<Object>} fn
 * @returns {Promise<Object|null>} The answer, or null when it failed.
 */
export async function callGit(opName, fn) {
    let result;
    try {
        result = await fn();
    } catch (e) {
        reportBridgeError(`${opName} failed`, e instanceof Error ? e : new Error(String(e)));
        return null;
    }
    const title = result?.conflicts ? `${opName} stopped on conflicts` : `${opName} failed`;
    return reportBridgeError(title, result) ? (result ?? { ok: true }) : null;
}

/**
 * Ask for text values in a FlexDesk form.
 * @param {string} title
 * @param {string} submitLabel
 * @param {Array<[string, string]>} fields - `[name, label]` pairs, all required.
 * @returns {Promise<Object|null>} The trimmed values, or null when cancelled or left blank.
 */
export async function askFor(title, submitLabel, fields) {
    const values = await openForm({
        title,
        submitLabel,
        fields: fields.map(([name, label]) => ({ name, label, type: 'text', required: true })),
    });
    if (!values) return null;
    const trimmed = Object.fromEntries(fields.map(([name]) => [name, String(values[name] ?? '').trim()]));
    return Object.values(trimmed).every(Boolean) ? trimmed : null;
}

/**
 * What opening a file's diff does: the consumer's callback, else a diff window
 * when the adapter has `diffFile`.
 * @param {() => Object|null} getAdapter
 * @param {Function|null|undefined} onOpenDiff
 * @returns {(file: {path: string, status: string, ref?: string}) => void}
 */
export function openDiffHandler(getAdapter, onOpenDiff) {
    if (onOpenDiff) return onOpenDiff;
    return ({ path, status, ref }) => {
        const adapter = getAdapter();
        if (adapter?.diffFile) openGitDiffWindow({ adapter, path, status, ref });
    };
}
