/**
 * ══ SORTABLELIST: DRAG A ROW BY ITS HANDLE AND IT MOVES (BUG-0016) ══
 *
 *   §1  every row is draggable (DragReorder's selector matches the row class)
 *   §2  dragging the first of three rows to the end reorders the list and
 *       fires onChange with the new order
 *   §3  a drag that did not start on the handle is cancelled; nothing moves
 *   §4  mountAttributeListEditor's rows are draggable too, and reorder
 *
 * The drags are dispatched the way a browser does it: `mousedown` at the
 * element under the pointer (the handle), then `dragstart` at the DRAGGABLE
 * element (the row), never at the handle.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/sortable_list_reorder.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
                     resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js')]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('sortable list reorder: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { SortableList } = await import('../src/ui/components/sortable_list.js');
const { mountAttributeListEditor } = await import('../src/ui/components/attribute_list_editor.js');

let failures = 0;
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok   ${what}`);
    else { failures += 1; console.log(`  FAIL ${what}\n       expected ${e}, got ${a}`); }
}

const ROW = '.twm-sortable-list__row';
const HANDLE = '.twm-sortable-list__handle';
const ROW_HEIGHT = 20;

/** jsdom lays nothing out: give each row of `listEl` a stacked box. */
function layOut(listEl) {
    [...listEl.querySelectorAll(ROW)].forEach((row, i) => {
        row.getBoundingClientRect = () => ({
            top: i * ROW_HEIGHT, bottom: (i + 1) * ROW_HEIGHT, height: ROW_HEIGHT,
            left: 0, right: 100, width: 100,
        });
    });
}

function dragEvent(type, init = {}) {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(e, 'dataTransfer', {
        value: { effectAllowed: 'none', dropEffect: 'none', setData() {}, getData() { return ''; } },
    });
    return e;
}

/** Press on `pressEl`, drag `row`, drop over `listEl` at clientY. */
function drag(listEl, row, pressEl, clientY) {
    pressEl.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const start = dragEvent('dragstart');
    row.dispatchEvent(start);
    if (start.defaultPrevented) return false;
    listEl.dispatchEvent(dragEvent('dragover', { clientY }));
    listEl.dispatchEvent(dragEvent('drop', { clientY }));
    row.dispatchEvent(dragEvent('dragend'));
    return true;
}

const names = (listEl) => [...listEl.querySelectorAll(ROW)]
    .map((r) => r.querySelector('input')?.value);

// ── §1 + §2 ──────────────────────────────────────────────────────────
console.log('\n§1/§2 a SortableList of three rows reorders by its handle');
{
    const changes = [];
    const list = new SortableList({
        items: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }],
        onChange: (next) => changes.push(next.map((it) => it.id)),
    });
    document.body.appendChild(list.render());
    const listEl = list.listEl;
    const rows = [...listEl.querySelectorAll(ROW)];
    check('three rows rendered', rows.length, 3);
    check('every row is draggable', rows.map((r) => r.getAttribute('draggable')),
          ['true', 'true', 'true']);

    layOut(listEl);
    const started = drag(listEl, rows[0], rows[0].querySelector(HANDLE), 2.5 * ROW_HEIGHT + 5);
    check('the drag from the handle starts', started, true);
    check('onChange fired once with the new order', changes, [['b', 'c', 'a']]);
    check('getItems() reflects the new order', list.getItems().map((it) => it.id), ['b', 'c', 'a']);
    check('the rendered rows follow', names(listEl), ['b', 'c', 'a']);
    check('the rebuilt rows are draggable again',
          [...listEl.querySelectorAll(ROW)].map((r) => r.getAttribute('draggable')),
          ['true', 'true', 'true']);

    // A second drag on the rebuilt rows: the last row to the top.
    layOut(listEl);
    const again = [...listEl.querySelectorAll(ROW)];
    drag(listEl, again[2], again[2].querySelector(HANDLE), 1);
    check('a second drag reorders again', list.getItems().map((it) => it.id), ['a', 'b', 'c']);
    check('onChange fired for it', changes.length, 2);

    // ── §3 ───────────────────────────────────────────────────────────
    console.log('\n§3 a drag that did not start on the handle is cancelled');
    layOut(listEl);
    const rows3 = [...listEl.querySelectorAll(ROW)];
    const fromContent = drag(listEl, rows3[0],
                             rows3[0].querySelector('.twm-sortable-list__content'),
                             2.5 * ROW_HEIGHT + 5);
    check('dragstart from the content is prevented', fromContent, false);
    check('nothing moved', list.getItems().map((it) => it.id), ['a', 'b', 'c']);
    check('no onChange', changes.length, 2);

    // A handle press that was not followed by a drag does not license a later one.
    rows3[0].querySelector(HANDLE).dispatchEvent(
        new dom.window.MouseEvent('mousedown', { bubbles: true }));
    rows3[0].querySelector('.twm-sortable-list__content').dispatchEvent(
        new dom.window.MouseEvent('mousedown', { bubbles: true }));
    const late = dragEvent('dragstart');
    rows3[0].dispatchEvent(late);
    check('a stale handle press is forgotten on the next press', late.defaultPrevented, true);

    list.dispose();
}

// ── §4 ───────────────────────────────────────────────────────────────
console.log('\n§4 mountAttributeListEditor rows reorder');
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    const changes = [];
    const editor = mountAttributeListEditor(host, {
        items: [{ name: 'x', type: 'string' }, { name: 'y', type: 'string' },
                { name: 'z', type: 'string' }],
        onChange: (next) => changes.push(next.map((it) => it.name)),
    });
    const listEl = host.querySelector('.twm-sortable-list__items');
    const rows = [...listEl.querySelectorAll(ROW)];
    check('three draggable rows', rows.map((r) => r.getAttribute('draggable')),
          ['true', 'true', 'true']);
    layOut(listEl);
    drag(listEl, rows[0], rows[0].querySelector(HANDLE), 2.5 * ROW_HEIGHT + 5);
    check('onChange carries the new order', changes, [['y', 'z', 'x']]);
    check('items() follows', editor.items().map((it) => it.name), ['y', 'z', 'x']);
    editor.dispose();
}

if (failures) {
    console.error(`\nsortable list reorder: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
