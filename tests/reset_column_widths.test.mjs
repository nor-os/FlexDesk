/**
 * 0.5.0 `resetColumnWidths()` — MEASURE THE COLUMNS AGAIN.
 *
 * A column a person dragged, or a double-click fitted, is PINNED: every later
 * sync honours it verbatim. When the content changes size under it — a zoom, a
 * font — the pins are wrong, and there was no public way to drop them: the
 * first consumer wrote `table._colWidths = {}` and `table._colWidthsSig = null`
 * into the component's private state after every zoom.
 *
 *   §0  pins survive a re-render (0.4: that is what a pin is for)
 *   §1  resetColumnWidths() drops every pin and the next render measures
 *   §2  the persisted widths are cleared too, so a reload does not bring them back
 *   §3  it answers false on a table that is not drawn, and still forgets
 *
 * Against 0.4.7, §1–§3 fail (no such method).
 *
 *     node tests/reset_column_widths.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('reset column widths');
const { DataTable, check, ok, section, mount } = T;

const headers = ['Name', 'Value', 'Note'];
const rows = [['a', 1, 'x'], ['b', 2, 'y']];
/** new + render(), not `mount`: this suite must fail against 0.4.7 on what it is ABOUT. */
const build = (host, cfg) => { const t = new DataTable(host, cfg); t.render(); return t; };
const pinned = (host) => [...host.querySelectorAll('.twm-preview-table-header-wrap thead > tr:first-child > th')]
    .map((th) => th.style.width);

function store() {
    const saved = new Map();
    return {
        saved,
        ready: () => Promise.resolve(),
        get: (k) => saved.get(k) ?? null,
        set: (k, v) => { saved.set(k, JSON.parse(JSON.stringify(v))); },
    };
}

section('§0 a pin survives a re-render');
{
    const s = store();
    s.saved.set('kept', { sortColumn: null, sortAscending: true, filters: [], colWidths: { 1: 200 } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = build(host, { headers, rows, persistKey: 'kept', stateStore: s });
    table.render();
    table._syncHeaderWidths();
    check('the pinned column keeps its width; the others are measured', pinned(host), ['40px', '200px', '40px']);
}

section('§1 resetColumnWidths drops every pin');
{
    // Pins restored from a store, as a reload brings them back: 200px each.
    const s = store();
    s.saved.set('wide', { sortColumn: null, sortAscending: true, filters: [], colWidths: { 0: 200, 1: 200, 2: 200 } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = build(host, { headers, rows, persistKey: 'wide', stateStore: s });
    table._syncHeaderWidths();                  // what the first frame does
    check('every column is pinned at 200px', pinned(host), ['200px', '200px', '200px']);
    ok('resetColumnWidths is a method', typeof table.resetColumnWidths === 'function');
    check('it answers true on a drawn table', table.resetColumnWidths?.(), true);
    // jsdom lays nothing out, so a MEASURED column comes back at the 40px floor:
    // anything but 200 is the measure, not the pin.
    check('every column is measured again', pinned(host), ['40px', '40px', '40px']);
    table.render();
    table._syncHeaderWidths();
    check('a render after it does not bring the pins back', pinned(host), ['40px', '40px', '40px']);
}

section('§2 the persisted widths go too');
{
    const s = store();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = build(host, { headers, rows, persistKey: 'people', stateStore: s });
    table.autoSizeColumns();
    check('the pins were persisted', Object.keys(s.saved.get('people').colWidths).length, 3);
    table.resetColumnWidths?.();
    check('…and are cleared', s.saved.get('people').colWidths, {});
    const again = build(document.body.appendChild(document.createElement('div')),
                                  { headers, rows, persistKey: 'people', stateStore: s });
    again._syncHeaderWidths();
    check('a table built from the store starts unpinned', [...again.container.querySelectorAll('.twm-preview-table-header-wrap thead > tr:first-child > th')].map((th) => th.style.width), ['40px', '40px', '40px']);
}

section('§3 a table that is not drawn');
{
    const host = document.createElement('div');
    const table = new DataTable(host, { headers, rows });
    table._colWidths = { 0: 99 };
    check('answers false', table.resetColumnWidths?.(), false);
    check('and still forgets the pins', Object.keys(table._colWidths).length, 0);
}

T.done();
