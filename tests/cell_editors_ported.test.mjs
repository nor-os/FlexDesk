/**
 * STORY-0087 — THE GENERIC BEHAVIOUR OF TABLES' GRID EDITOR TESTS, PORTED.
 *
 * Tables checks its own cell editors (web/js/grid/editors.js, in
 * grid/render.test.mjs §13 and the comments that pin `createEditor`'s
 * behaviour). What in them is about any editable grid — not Tables' columns,
 * API or record form — is asserted here against FlexDesk's built-in editors
 * and `CellEditorHost`, with nothing imported from Tables:
 *
 *   §1  an editor ends ONCE: Escape cancels, and the blur its removal causes
 *       commits nothing; a checkbox's change and the blur after it are one
 *       commit
 *   §2  a key pressed in an editor is the editor's: it never reaches the
 *       grid beneath; a right-click in it keeps the browser's own menu
 *   §3  the number box is a text box, so '1.234,56' survives being typed
 *   §4  multitext: Enter is a new line, Ctrl/Cmd+Enter commits
 *   §5  the choice autocomplete: on screen at once, its options listed and
 *       shown, the box holding labels, never values; nothing committed while
 *       typing; a pick commits the VALUE; a term that resolves to no option
 *       commits nothing; an emptied box commits null; taking the editor down
 *       takes its list off document.body
 *
 *     node tests/cell_editors_ported.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell editors ported');
const { check, ok, section, key, tick, done, window, document } = T;
const { CellEditorHost } = await import('../src/ui/components/cell_editor_host.js');
const { CELL_EDITORS } = await import('../src/ui/components/cell_editors.js');

/** A host over one cell in a grid-like parent that counts the keys it hears. */
function harness() {
    const grid = document.createElement('table');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'shown';
    tr.appendChild(td);
    grid.appendChild(tr);
    document.body.appendChild(grid);
    const log = [];
    const heard = [];
    grid.addEventListener('keydown', (ev) => heard.push(ev.key));
    const host = new CellEditorHost({
        onCommit: (s, value, move) => log.push(['commit', value, move]),
        onCancel: () => log.push(['cancel']),
        onRefuse: (s, error, text) => log.push(['refuse', error, text]),
    });
    const openWith = (type, value, column = {}) => host.open({
        td, factory: CELL_EDITORS[type].create, value, row: [value], rowIdx: 0, colIdx: 0,
        column: { index: 0, header: 'X', type, ...column }, args: { locale: 'de-DE' },
    });
    const remove = () => grid.remove();
    return { grid, td, host, log, heard, openWith, remove };
}
const blurOut = (el) => el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
const type = (el, text) => {
    el.value = text;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const COLOURS = [{ value: 'u-1', label: 'North' }, { value: 'u-2', label: 'North East' }, { value: 'u-3', label: 'South' }];

section('§1 an editor ends once');
for (const t of ['text', 'multitext', 'number', 'datetime', 'bool', 'choice']) {
    const h = harness();
    h.openWith(t, t === 'bool' ? true : null, t === 'choice' ? { options: COLOURS } : {});
    const field = h.td.querySelector('input, textarea');
    if (field.type !== 'checkbox') type(field, t === 'number' ? '12' : t === 'datetime' ? '2026-01-01' : 'North');
    if (t === 'choice') {
        // With its list open, Escape is the list's: it closes the list only.
        key(field, 'Escape');
        ok('choice: the first Escape closes the list, the editor stays', !!h.host.session && h.log.length === 0);
    }
    key(field, 'Escape');
    blurOut(field);           // what a browser does to a focused node taken out
    key(field, 'Enter');
    check(`${t}: Escape cancels, and the blur after it commits nothing`, h.log, [['cancel']]);
    check(`${t}: …the cell drawn as it was`, h.td.textContent, 'shown');
    h.remove();
}
{
    const h = harness();
    h.openWith('bool', false);
    const box = h.td.querySelector('input');
    box.click();
    blurOut(box);
    check('a checkbox\'s change and the blur after it are one commit', h.log, [['commit', true, null]]);
    h.remove();
}

section('§2 the editor\'s keys are its own; the browser keeps its menu');
{
    const h = harness();
    h.openWith('text', 'a');
    const input = h.td.querySelector('input');
    for (const k of ['ArrowLeft', 'ArrowDown', 'a', 'Home', 'Delete']) key(input, k);
    key(input, 'Escape');
    check('no key pressed in the editor reaches the grid, Escape included', h.heard, []);
    h.openWith('text', 'a');
    const again = h.td.querySelector('input');
    let gridMenus = 0;
    h.grid.addEventListener('contextmenu', () => { gridMenus++; });
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    again.dispatchEvent(ev);
    ok('a right-click in an open editor is not the grid\'s', gridMenus === 0);
    ok('…and is not prevented: the field\'s own menu shows', !ev.defaultPrevented);
    ok('…and the editor is still open', h.host.session && again.isConnected);
    key(again, 'Escape');
    h.remove();
}

section('§3 the number box is a text box');
{
    const h = harness();
    h.openWith('number', null);
    const input = h.td.querySelector('input');
    check('not type=number', input.type, 'text');
    type(input, '1.234,56');
    check('…so \'1.234,56\' survives typing', input.value, '1.234,56');
    key(input, 'Enter');
    check('…and commits 1234.56 under de-DE, moving down', h.log, [['commit', 1234.56, 'down']]);
    h.remove();
}

section('§4 multitext');
{
    const h = harness();
    h.openWith('multitext', 'one');
    const area = h.td.querySelector('textarea');
    const ev = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(ev);
    ok('Enter is left to the text area (a new line)', !ev.defaultPrevented && h.log.length === 0);
    type(area, 'one\ntwo');
    key(area, 'Enter', { metaKey: true });
    check('Cmd+Enter commits', h.log, [['commit', 'one\ntwo', 'down']]);
    h.openWith('multitext', 'x');
    key(h.td.querySelector('textarea'), 'Enter', { ctrlKey: true });
    check('…as does Ctrl+Enter (left as it was: the value it was given)', h.log.at(-1), ['commit', 'x', 'down']);
    h.remove();
}

section('§5 the choice autocomplete');
{
    const before = document.querySelectorAll('.twm-autocomplete-field__dropdown').length;
    let h = harness();
    h.openWith('choice', null, { options: COLOURS });
    const input = h.td.querySelector('.twm-autocomplete-field__input');
    ok('the autocomplete is on screen at once', !!input && input.isConnected);
    type(input, 'North');
    const items = () => [...document.querySelectorAll('.twm-autocomplete-field__dropdown.visible .twm-autocomplete-field__item')];
    check('the matching options are listed', items().length, 2);
    ok('…and the list is SHOWN (`visible`)', items().length && items()[0].closest('.visible'));
    check('the list holds labels, never values', items().map((el) => el.querySelector('.twm-autocomplete-field__label').textContent),
        ['North', 'North East']);
    check('nothing is committed while typing', h.log, []);
    items()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('a pick commits the option\'s VALUE', h.log, [['commit', 'u-2', null]]);
    check('…and its list is gone from the page', document.querySelectorAll('.twm-autocomplete-field__dropdown').length, before);

    h.openWith('choice', 'u-1', { options: COLOURS });
    const box = h.td.querySelector('.twm-autocomplete-field__input');
    check('the box opens on the label, not the value', box.value, 'North');
    type(box, 'Nor');
    blurOut(box);
    check('a term that resolves to no option commits nothing', h.log.slice(1), [['refuse', 'Not one of the options', 'Nor']]);

    h.openWith('choice', 'u-1', { options: COLOURS });
    const clear = h.td.querySelector('.twm-autocomplete-field__input');
    type(clear, '');
    key(clear, 'Enter');
    check('an emptied box commits null', h.log.at(-1), ['commit', null, 'down']);

    h.openWith('choice', 'u-1', { options: COLOURS });
    ok('an open choice has its list on document.body', document.querySelectorAll('.twm-autocomplete-field__dropdown').length === before + 1);
    h.host.cancel('dispose');   // what the table does when the cell goes away
    check('taking the editor down takes its list off document.body', document.querySelectorAll('.twm-autocomplete-field__dropdown').length, before);
    h.remove();
    await tick(200);            // the widget's own blur timer finds nothing to do
    check('…and nothing late is committed', h.log.length, 4);
}

done();
