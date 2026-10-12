/**
 * STORY-0010 `keyboardNav` / `onRowKeyDown` / `focus()` — A LIST DRIVEN FROM
 * THE KEYBOARD.
 *
 * 0.9.1 opens a row on Enter (`activateOn: 'enter'`), and nothing else on the
 * keyboard reaches a row: no arrow moves the selection, and Enter with a
 * modifier — Ctrl+Enter, "open it somewhere else" — is refused outright, as is
 * any other key a consumer wants on the row (Alt+T: in a tab). BugDesk's
 * private DataTable copy had both; these are what replace it.
 *
 *   §0  without the keys: the arrows move nothing, and their default is not
 *       prevented (0.9.1)
 *   §1  keyboardNav: Up/Down/Home/End move the one selected row through the
 *       page in the order shown, and onSelectionChange hears it
 *   §2  …Shift selects the range from the anchor; 'single' never extends; the
 *       arrows stay on the page shown
 *   §3  onRowKeyDown(rowIdx, row, ev): the current row (the one Enter opens)
 *       for every key; `true` takes the key (default prevented, nothing after
 *       it in the table — Enter's activation included — nor the page sees it)
 *   §4  the chords a consumer maps through it: Ctrl+Enter, Alt+T, Alt+N,
 *       Alt+Shift+H, Alt+Shift+V
 *   §5  focus() puts the focus on the body
 *
 * Against 0.9.1, §1–§5 fail.
 *
 *     node tests/row_keys.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('row keys');
const { check, ok, section, mount, bodyRows, click, key, document } = T;

const headers = ['Id', 'Value'];
const rows = Array.from({ length: 12 }, (_, i) => [`r${i}`, (i * 5) % 12]);
const bodyTable = (host) => host.querySelector('.twm-preview-table-wrap table');
const ids = (table) => table.getSelection().map((i) => rows[i][0]);

section('§0 without the keys');
{
    const { host, table } = mount({ headers, rows });
    click(bodyRows(host)[2]);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    bodyTable(host).dispatchEvent(ev);
    check('the selection stays', ids(table), ['r2']);
    ok('the page scrolls as it would', !ev.defaultPrevented);
    table.dispose();
}

section('§1 keyboardNav moves the selection in the order shown');
{
    const heard = [];
    const { host, table } = mount({ headers, rows, keyboardNav: true, sortable: true,
                                    onSelectionChange: (sel) => heard.push(sel) });
    table.sortBy(1);                                   // shown by Value: r0 (0), r5 (1), r10 (2) …
    const t = bodyTable(host);
    key(t, 'ArrowDown');
    check('nothing selected: ArrowDown takes the first row shown', ids(table), ['r0']);
    key(t, 'ArrowDown');
    key(t, 'ArrowDown');
    check('…then the next ones, in the sorted order', ids(table), ['r10']);
    key(t, 'ArrowUp');
    check('ArrowUp goes back', ids(table), ['r5']);
    key(t, 'End');
    check('End: the last row shown', ids(table), [rows.find((r) => r[1] === 11)[0]]);
    key(t, 'ArrowDown');
    check('…and stays there', ids(table), [rows.find((r) => r[1] === 11)[0]]);
    key(t, 'Home');
    check('Home: the first', ids(table), ['r0']);
    ok('onSelectionChange heard each move', heard.length >= 7);
    click(bodyRows(host)[4]);
    key(t, 'ArrowDown');
    check('after a click, the arrows go on from the row clicked',
          ids(table), [bodyRows(host)[5].children[0].textContent]);
    key(t, 'ArrowDown', { ctrlKey: true });
    check('not with Ctrl', ids(table), [bodyRows(host)[5].children[0].textContent]);
    table.dispose();
}

section('§2 Shift, single, pages');
{
    const { host, table } = mount({ headers, rows, keyboardNav: true });
    const t = bodyTable(host);
    click(bodyRows(host)[3]);
    key(t, 'ArrowDown', { shiftKey: true });
    key(t, 'ArrowDown', { shiftKey: true });
    check('Shift+Down: the range from the anchor', ids(table), ['r3', 'r4', 'r5']);
    key(t, 'ArrowUp', { shiftKey: true });
    check('Shift+Up shrinks it', ids(table), ['r3', 'r4']);
    key(t, 'ArrowDown');
    check('without Shift: one row again, where the range ended', ids(table), ['r5']);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, keyboardNav: true, selectable: 'single' });
    click(bodyRows(host)[3]);
    key(bodyTable(host), 'ArrowDown', { shiftKey: true });
    check('single: Shift moves, never extends', ids(table), ['r4']);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, keyboardNav: true, pageSize: 5 });
    table.goToPage(1);
    const t = bodyTable(host);
    key(t, 'ArrowDown');
    check('on page 2: its first row', ids(table), ['r5']);
    key(t, 'End');
    key(t, 'ArrowDown');
    check('…and the arrows stay on the page', ids(table), ['r9']);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, keyboardNav: true, selectable: false });
    key(bodyTable(host), 'ArrowDown');
    check('needs selectable', ids(table), []);
    table.dispose();
}

section('§3 onRowKeyDown');
{
    const calls = [];
    let take = false;
    const opened = [];
    const { host, table } = mount({
        headers, rows, activateOn: ['dblclick', 'enter'], keyboardNav: true,
        onRowActivate: (i) => opened.push(i),
        onRowKeyDown: (i, row, ev) => { calls.push([i, row?.[0] ?? null, ev.key]); return take; },
    });
    const t = bodyTable(host);
    key(t, 'x');
    check('nothing selected: (null, null, ev)', calls.at(-1), [null, null, 'x']);
    click(bodyRows(host)[2]);
    key(t, 'Enter');
    check('the row Enter opens, for every key', calls.at(-1), [2, 'r2', 'Enter']);
    check('…and not taken: Enter still opens it', opened, [2]);
    take = true;
    let outside = 0;
    const listen = () => outside++;
    document.body.addEventListener('keydown', listen);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    t.dispatchEvent(ev);
    check('taken: the table does nothing more with it', opened, [2]);
    ok('…its default is prevented', ev.defaultPrevented);
    check('…and the page never hears it', outside, 0);
    key(t, 'ArrowDown');
    check('a taken arrow does not move the selection', ids(table), ['r2']);
    document.body.removeEventListener('keydown', listen);
    take = false;
    table.dispose();
}
{
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    const { host, table } = mount({ headers, rows, keyboardNav: true,
                                    onRowKeyDown: () => { throw new Error('boom'); } });
    try { key(bodyTable(host), 'ArrowDown'); } finally { console.error = orig; }
    ok('a hook that throws is reported', errors.some((e) => e.includes('[DataTable] onRowKeyDown threw')));
    check('…and the table\'s own key still works', ids(table), ['r0']);
    table.dispose();
}

section('§4 the chords a consumer maps');
{
    const HOW = (ev) => {
        const k = String(ev.key).toLowerCase();
        const mod = ev.ctrlKey || ev.metaKey;
        if (k === 'enter' && !ev.altKey && !ev.shiftKey) return mod ? 'modified' : 'default';
        if (!ev.altKey || mod) return null;
        if (!ev.shiftKey && k === 't') return 'tab';
        if (!ev.shiftKey && k === 'n') return 'window';
        if (ev.shiftKey && k === 'h') return 'split-h';
        if (ev.shiftKey && k === 'v') return 'split-v';
        return null;
    };
    const opened = [];
    const { host, table } = mount({
        headers, rows,
        onRowKeyDown: (i, row, ev) => {
            const how = i == null ? null : HOW(ev);
            if (!how) return false;
            opened.push([row[0], how]);
            return true;
        },
    });
    click(bodyRows(host)[6]);
    const t = bodyTable(host);
    key(t, 'Enter');
    key(t, 'Enter', { ctrlKey: true });
    key(t, 't', { altKey: true });
    key(t, 'n', { altKey: true });
    key(t, 'H', { altKey: true, shiftKey: true });
    key(t, 'V', { altKey: true, shiftKey: true });
    key(t, 'q', { altKey: true });
    check('each chord opens the selected row its way',
          opened, [['r6', 'default'], ['r6', 'modified'], ['r6', 'tab'], ['r6', 'window'], ['r6', 'split-h'], ['r6', 'split-v']]);
    table.dispose();
}

section('§5 focus()');
{
    const { host, table } = mount({ headers, rows });
    ok('focus() says it focused', table.focus());
    ok('…the body table', document.activeElement === bodyTable(host));
    table.dispose();
    const fresh = new T.DataTable(document.createElement('div'), { headers, rows });
    check('nothing drawn: false', fresh.focus(), false);
}

T.done();
