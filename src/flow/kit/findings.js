/**
 * FINDINGS — what the consumer's validator said, drawn where it applies
 * (36 §3.8). The kit decides none of them.
 *
 * A finding is the server's shape: `{code, message, severity: 'error' |
 * 'warning', node_id?, field?}`.
 *
 *  - one with a `node_id` is drawn ON THAT STEP (each editor draws its own
 *    mark) and, while that step's settings are open, under its field;
 *  - one without a `node_id` is drawn in the STRIP;
 *  - the strip lists every one of them, with *Go to it*;
 *  - one naming a step the graph no longer has goes to the strip as well —
 *    never nowhere.
 */

import { button, el } from './dom.js';
import { createStrings, say } from './strings.js';

/** A list, or a validator result `{errors, warnings}`, as one list. */
export function findingsList(input) {
    if (Array.isArray(input)) return input.filter((f) => f && typeof f === 'object');
    if (input && typeof input === 'object') {
        return [...(input.errors || []), ...(input.warnings || [])].filter((f) => f && typeof f === 'object');
    }
    return [];
}

/**
 * The findings grouped by the step they are drawn on: a Map keyed by
 * `node_id`, `null` for the flow. With `graph`, a finding naming a step the
 * graph no longer has is filed under `null`.
 */
export function groupFindings(input, { graph = null } = {}) {
    const ids = graph ? new Set((graph.nodes || []).map((n) => n.id)) : null;
    const out = new Map();
    for (const f of findingsList(input)) {
        let key = f.node_id ?? null;
        if (key !== null && ids && !ids.has(key)) key = null;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(f);
    }
    return out;
}

/** Is `prefix` a path prefix of `path` at a segment boundary? */
export function isPathPrefix(prefix, path) {
    if (!prefix || !path) return false;
    if (path === prefix) return true;
    if (!path.startsWith(prefix)) return false;
    const next = path[prefix.length];
    return next === '.' || next === '[';
}

/**
 * The field a finding is drawn under: the LONGEST of `paths` that is a
 * segment-boundary prefix of the finding's `field`, or null.
 */
export function matchFindingField(paths, field) {
    if (!field) return null;
    let best = null;
    for (const p of paths) {
        if (isPathPrefix(p, field) && (best === null || p.length > best.length)) best = p;
    }
    return best;
}

/** `error` before `warning`, otherwise as given. */
function bySeverity(list) {
    return list.map((f, i) => ({ f, i }))
        .sort((a, b) => ((a.f.severity === 'warning') - (b.f.severity === 'warning')) || (a.i - b.i))
        .map((x) => x.f);
}

/**
 * The strip: "N things to fix before this can be published." and one line per
 * finding with *Go to it*. `aria-live="polite"`, hidden while empty.
 *
 * @param {object} [o]
 * @param {(finding: object) => void} [o.onGoTo]   select the step and focus the field
 * @param {(nodeId: string|null) => string} [o.nameOf]   a step's name for its line
 * @param {object} [o.strings]
 */
export function createFindingsStrip({ onGoTo = null, nameOf = null, strings = null } = {}) {
    const S = createStrings(strings);
    const root = el('div', 'twm-flow-strip');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.hidden = true;
    let list = [];

    const paint = () => {
        root.replaceChildren();
        root.hidden = list.length === 0;
        if (!list.length) return;
        const errors = list.filter((f) => f.severity !== 'warning').length;
        root.classList.toggle('twm-flow-strip--warning', errors === 0);
        const head = el('div', 'twm-flow-strip__head');
        head.append(el('span', 'twm-flow-strip__icon material-symbols-outlined', errors ? 'error' : 'warning'),
                    el('span', 'twm-flow-strip__title', errors
                        ? say(S, 'toFix', errors) : say(S, 'toLookAt', list.length)));
        head.firstChild.setAttribute('aria-hidden', 'true');
        root.appendChild(head);
        const lines = el('ul', 'twm-flow-strip__list');
        for (const f of bySeverity(list)) {
            const li = el('li', `twm-flow-strip__line${f.severity === 'warning' ? ' twm-flow-strip__line--warning' : ''}`);
            li.dataset.code = String(f.code ?? '');
            if (f.node_id !== undefined && f.node_id !== null) li.dataset.node = String(f.node_id);
            const where = f.node_id ? (nameOf?.(f.node_id) || String(f.node_id)) : (nameOf?.(null) || '');
            li.appendChild(el('span', 'twm-flow-strip__text', say(S, 'findingLine', where, String(f.message ?? ''))));
            if (onGoTo) {
                li.appendChild(button({ label: say(S, 'goToIt'), className: 'twm-flow-strip__go',
                                        onClick: () => onGoTo(f) }));
            }
            lines.appendChild(li);
        }
        root.appendChild(lines);
    };

    return {
        el: root,
        /** Draw `input` (a list or `{errors, warnings}`). */
        set(input) {
            list = findingsList(input);
            paint();
        },
        get findings() { return [...list]; },
        destroy() { root.remove(); },
    };
}
