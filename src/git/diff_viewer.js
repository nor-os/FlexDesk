/**
 * diff_viewer.js — what changed, drawn three ways. Usable alone: it needs no
 * adapter and knows nothing of git beyond reading a unified diff.
 *
 *     FIELDS  named values, `Priority  low → high`. The consumer parses them;
 *             they arrive as `{ name, from, to }`
 *     TEXT    line by line, with old and new line numbers and no diff headers,
 *             from `before`/`after` (compared here) or else from `diff` (read)
 *     RAW     the `diff` text as it came
 *
 *     const viewer = createDiffViewer(el, { before, after, diff, fields });
 *     viewer.update({ before, after });
 *     viewer.setView('raw');
 *     viewer.destroy();
 *
 * A view is offered only when its data is there, and the buttons that switch
 * between views only when there are two or more. Which view shows: the one set
 * by `view`, `setView` or a click while it stays on offer, else Fields when a
 * field changed, else Text, else Raw. `setView(null)` hands the choice back.
 */

import { computeLineDiff, parseUnifiedDiff } from './line_diff.js';

const DEFAULT_LABELS = Object.freeze({
    fields: 'Fields',
    text: 'Text',
    raw: 'Raw',
    noChanges: 'No differences.',
    noFields: 'No field changes.',
    tooLong: 'Too long to compare here.',
    gap: (hidden) => `${hidden} unchanged line${hidden === 1 ? '' : 's'}`,
});

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** A field's value as drawn: an absent or empty one reads as a dash. */
const shownField = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s === '' ? '—' : s;
};

function lineRow(line, labels) {
    const row = el('div', `twm-diff__line twm-diff__line--${line.kind}`);
    if (line.kind === 'gap' || line.kind === 'hunk' || line.kind === 'meta' || line.kind === 'file') {
        row.textContent = line.kind === 'gap' ? labels.gap(line.hidden) : line.text;
        return row;
    }
    row.append(
        el('span', 'twm-diff__n', line.oldLine === null ? '' : String(line.oldLine)),
        el('span', 'twm-diff__n', line.newLine === null ? '' : String(line.newLine)),
        el('span', 'twm-diff__sign', line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ''),
        el('span', 'twm-diff__text', line.text),
    );
    return row;
}

/**
 * @param {HTMLElement} host
 * @param {Object} [options]
 * @param {string} [options.before] - The old text. With `after`, drawn by comparing the two.
 * @param {string} [options.after] - The new text.
 * @param {string} [options.diff] - A unified diff: the Raw view, and the Text view when there is no `before`/`after`.
 * @param {Array<{name: string, from?: *, to?: *}>} [options.fields] - The Fields view's rows.
 * @param {number} [options.beforeStart=1] - The line number of `before`'s first line.
 * @param {number} [options.afterStart=1] - The line number of `after`'s first line.
 * @param {number} [options.context=3] - Unchanged lines kept around each change.
 * @param {number} [options.maxLines] - Past this many differing lines a side, the texts are not compared.
 * @param {'fields'|'text'|'raw'} [options.view] - The view to show while it is on offer.
 * @param {Object} [options.labels] - Words to replace: `fields`, `text`, `raw`, `noChanges`, `noFields`, `tooLong`, `gap(hidden)`.
 * @param {(view: string) => void} [options.onViewChange] - Told when a click changes the view.
 * @returns {{ el: HTMLElement, update(data: Object): void, setView(view: string|null): void,
 *   view(): string|null, showMessage(text: string): void, destroy(): void }}
 */
export function createDiffViewer(host, options = {}) {
    const { context = 3, maxLines, onViewChange = null } = options;
    const labels = { ...DEFAULT_LABELS, ...options.labels };

    const root = el('div', 'twm-diff');
    const switcher = el('div', 'twm-diff__views');
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Diff view');
    const body = el('div', 'twm-diff__body');
    root.append(switcher, body);
    host.appendChild(root);

    let data = {};
    let chosen = options.view ?? null;
    let textLines;     // this data's Text view; undefined until first drawn
    let current = null;

    const hasPair = () => typeof data.before === 'string' || typeof data.after === 'string';

    const linesOfText = () => {
        if (textLines !== undefined) return textLines;
        textLines = hasPair()
            ? computeLineDiff(data.before, data.after, {
                context,
                ...(maxLines === undefined ? {} : { maxLines }),
                beforeStart: data.beforeStart ?? 1,
                afterStart: data.afterStart ?? 1,
            })
            : parseUnifiedDiff(data.diff);
        return textLines;
    };

    const offered = () => {
        const out = [];
        if (Array.isArray(data.fields)) out.push('fields');
        if (hasPair() || (typeof data.diff === 'string' && linesOfText().length > 0)) out.push('text');
        if (typeof data.diff === 'string') out.push('raw');
        return out;
    };

    const pick = (views) => {
        if (chosen && views.includes(chosen)) return chosen;
        if (views.includes('fields') && data.fields.length > 0) return 'fields';
        if (views.includes('text')) return 'text';
        return views[0] ?? null;
    };

    const message = (text) => {
        body.replaceChildren(el('div', 'twm-diff__message', text));
    };

    const drawFields = () => {
        if (data.fields.length === 0) { message(labels.noFields); return; }
        const grid = el('div', 'twm-diff__fields');
        for (const field of data.fields) {
            const values = el('span', 'twm-diff__field-values');
            const arrow = el('span', 'material-symbols-outlined twm-diff__field-arrow', 'arrow_forward');
            arrow.setAttribute('aria-hidden', 'true');
            values.append(
                el('span', 'twm-diff__field-from', shownField(field.from)),
                arrow,
                el('span', 'twm-diff__field-to', shownField(field.to)),
            );
            grid.append(el('span', 'twm-diff__field-name', String(field.name)), values);
        }
        body.replaceChildren(grid);
    };

    const drawText = () => {
        const lines = linesOfText();
        if (lines === null) {
            message(typeof data.diff === 'string' ? `${labels.tooLong} See ${labels.raw}.` : labels.tooLong);
            return;
        }
        if (lines.length === 0) { message(labels.noChanges); return; }
        const list = el('div', 'twm-diff__lines');
        list.append(...lines.map((line) => lineRow(line, labels)));
        body.replaceChildren(list);
    };

    const drawRaw = () => {
        if (data.diff === '') { message(labels.noChanges); return; }
        body.replaceChildren(el('pre', 'twm-diff__raw', data.diff));
    };

    const draw = () => {
        const views = offered();
        current = pick(views);
        switcher.replaceChildren(...(views.length > 1 ? views.map((v) => {
            const b = el('button', 'twm-diff__view', labels[v]);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(v === current));
            b.addEventListener('click', () => {
                chosen = v;
                draw();
                onViewChange?.(v);
            });
            return b;
        }) : []));
        switcher.hidden = views.length <= 1;
        if (current === 'fields') drawFields();
        else if (current === 'text') drawText();
        else if (current === 'raw') drawRaw();
        else message(labels.noChanges);
    };

    const update = (next) => {
        data = next ?? {};
        textLines = undefined;
        draw();
    };

    update(options);

    return {
        el: root,
        update,
        setView(view) {
            chosen = view;
            draw();
        },
        view: () => current,
        /** Words in place of the diff, while it loads or when it could not be read. The next update replaces them. */
        showMessage(text) {
            switcher.replaceChildren();
            switcher.hidden = true;
            current = null;
            message(text);
        },
        destroy() {
            root.remove();
        },
    };
}
