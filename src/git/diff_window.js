/**
 * diff_window.js — a diff in a window of its own: FlexDesk's modal around a
 * createDiffViewer, showing "Loading…" until the data arrives.
 */

import { openModal } from '../ui/components/modal.js';
import { createDiffViewer } from './diff_viewer.js';

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {() => Promise<Object>|Object} options.load - Answers what `createDiffViewer`'s `update` takes, or
 *   `{ ok: false, error }`; a throw is shown the same way.
 * @param {string} [options.icon='difference']
 * @param {number} [options.width=880]
 * @param {number} [options.height=600]
 * @param {Object} [options.labels] - As for createDiffViewer.
 * @returns {Promise<null>} Settles when the window closes.
 */
export function openDiffWindow({ title, load, icon = 'difference', width = 880, height = 600, labels } = {}) {
    const content = document.createElement('div');
    content.className = 'twm-diff-window';
    const viewer = createDiffViewer(content, { labels });
    viewer.showMessage('Loading…');
    const closed = openModal({ title, icon, content, width, height, maximizable: true });
    Promise.resolve()
        .then(load)
        .then((data) => {
            if (data?.ok === false) viewer.showMessage(data.error || 'The diff could not be read.');
            else viewer.update(data);
        })
        .catch((e) => viewer.showMessage(e?.message || String(e)));
    return closed;
}

/**
 * The diff of one file, from an adapter's `diffFile`, in a window.
 * @param {Object} options
 * @param {Object} options.adapter - A git adapter with `diffFile` (docs/components/git.md).
 * @param {string} options.path
 * @param {string} [options.status]
 * @param {string} [options.ref] - A commit: the file's change in that commit, not the uncommitted one.
 * @returns {Promise<null>}
 */
export function openGitDiffWindow({ adapter, path, status, ref }) {
    return openDiffWindow({
        title: path,
        load: () => adapter.diffFile({ path, status, ...(ref ? { ref } : {}) }),
    });
}
