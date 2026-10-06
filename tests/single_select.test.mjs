/**
 * 0.5.0 `selectable: 'single'` — A LIST YOU CHOOSE ONE ENTRY FROM.
 *
 * `selectable` always allowed several rows: Shift ranged, Ctrl toggled, Ctrl+A
 * took everything. A list whose verbs act on ONE entry (restore this revision,
 * pin this moment) had to take "the last index" of whatever came back and hope
 * the highlight agreed — three highlighted rows and a Restore that used one.
 *
 *   §0  selectable: true is unchanged — Shift ranges, Ctrl adds, Ctrl+A all
 *   §1  'single': a click selects one row; Shift and Ctrl do not extend it
 *   §2  'single': Ctrl on the selected row takes it off
 *   §3  'single': Ctrl+A selects nothing (and is not the page's select-all)
 *   §4  'single': setSelection keeps the LAST index it is given; the change
 *       callback hears one index
 *
 * Against 0.4.7, §1–§4 fail.
 *
 *     node tests/single_select.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('single select');
const { check, section, mount, bodyRows, click, key } = T;

const headers = ['Rev', 'When'];
const rows = Array.from({ length: 5 }, (_, i) => [`r${i}`, i]);
const tableEl = (host) => host.querySelector('.twm-preview-table-wrap table');
const selectedRows = (host) => bodyRows(host).filter((tr) => tr.classList.contains('selected'))
    .map((tr) => tr.__rowIndex);

section('§0 selectable: true, as in 0.4');
{
    const { host, table } = mount({ headers, rows, selectable: true });
    click(bodyRows(host)[1]);
    click(bodyRows(host)[3], { shiftKey: true });
    check('Shift ranges', table.getSelection(), [1, 2, 3]);
    click(bodyRows(host)[0], { ctrlKey: true });
    check('Ctrl adds', table.getSelection(), [0, 1, 2, 3]);
    key(tableEl(host), 'a', { ctrlKey: true });
    check('Ctrl+A takes every row', table.getSelection(), [0, 1, 2, 3, 4]);
}

section('§1 single: one row, whatever the modifiers');
{
    const heard = [];
    const { host, table } = mount({ headers, rows, selectable: 'single',
                                    onSelectionChange: (s) => heard.push(s) });
    click(bodyRows(host)[1]);
    click(bodyRows(host)[3], { shiftKey: true });
    check('Shift does not range', table.getSelection(), [3]);
    click(bodyRows(host)[0], { ctrlKey: true });
    check('Ctrl does not add', table.getSelection(), [0]);
    check('…and the highlight agrees', selectedRows(host), [0]);
    check('every change was heard as ONE index', heard, [[1], [3], [0]]);
}

section('§2 single: Ctrl on the chosen row un-chooses it');
{
    const { host, table } = mount({ headers, rows, selectable: 'single' });
    click(bodyRows(host)[2]);
    click(bodyRows(host)[2], { ctrlKey: true });
    check('nothing selected', table.getSelection(), []);
    click(bodyRows(host)[2]);
    check('a plain click on it again selects it', table.getSelection(), [2]);
}

section('§3 single: Ctrl+A selects nothing');
{
    const { host, table } = mount({ headers, rows, selectable: 'single' });
    click(bodyRows(host)[4]);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    tableEl(host).dispatchEvent(ev);
    check('the selection is untouched', table.getSelection(), [4]);
    check('and the page\'s select-all is prevented', ev.defaultPrevented, true);
}

section('§4 single: setSelection keeps the last index');
{
    const heard = [];
    const { host, table } = mount({ headers, rows, selectable: 'single',
                                    onSelectionChange: (s) => heard.push(s) });
    table.setSelection([0, 2, 3]);
    check('one row: the last', table.getSelection(), [3]);
    check('…painted', selectedRows(host), [3]);
    check('…and heard as one', heard, [[3]]);
    table.setSelection([]);
    check('an empty list clears it', table.getSelection(), []);
}

T.done();
