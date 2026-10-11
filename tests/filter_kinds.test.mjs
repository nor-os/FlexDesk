/**
 * 0.7.0 `filterKinds` and `setFilterCounts` (#37) — filter controls that are
 * not text boxes.
 *
 * A column filter was one text box with an operator dropdown. The first
 * consumer's audit log needed four that are not: Level chips that COUNT what
 * each would show, a When strip, a Who picker over people, a What box that
 * means "starts with". What those mean is the consumer's; the hook to put a
 * control in a column, hand its value to the server or match it on the
 * client, and give it counts is the table's.
 *
 *   §0  without `filterKinds`: the text box, as in 0.6
 *   §1  the built-in chips: drawn in the filter cell, "All" pressed; a chip
 *       filters the rows (client), pressed again it clears
 *   §2  `setFilterCounts`: a badge per chip, dimmed at zero, kept across a
 *       render and given to a control built later
 *   §3  the control is built ONCE: the same element after every render
 *   §4  `multiple` chips: one of several values
 *   §5  a consumer's own control (a date range): `ctx.setValue` filters by the
 *       default range rule; focus inside it survives a render
 *   §6  `dataSource`: the values are forwarded AS THEY ARE, and an answer's
 *       `filterCounts` reach the chips
 *   §7  `onFilterChange`, `getFilters`, `setFilter`, `clearFilters`
 *   §8  new headers: the controls are destroyed and rebuilt
 *   §9  `filterKinds` as a function, and a control's own `match`
 *   §10 `createChipsFilter` on its own
 *   §11 a control is in the column-width measure; its narrowest width is the
 *       column's floor in the fit pass
 *
 * Against 0.6.0 every column draws the text box: §1 fails at once.
 *
 *     node tests/filter_kinds.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('filter kinds');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const headers = ['When', 'Level', 'Who'];
const rows = [
    ['2026-10-01', 'info', 'ann'],
    ['2026-10-03', 'warn', 'bob'],
    ['2026-10-05', 'error', 'ann'],
    ['2026-10-07', 'info', 'cy'],
    ['2026-10-09', 'warn', 'ann'],
];
const LEVELS = {
    kind: 'chips',
    options: [
        { value: '', label: 'All', icon: 'list_alt' },
        { value: 'info', label: 'Info', icon: 'info' },
        { value: 'warn', label: 'Warn', icon: 'warning' },
        { value: 'error', label: 'Error', icon: 'error' },
    ],
};
const chip = (host, v) => host.querySelector(`.twm-dt-filter-chip[data-value="${v}"]`);
const pressed = (host) => [...host.querySelectorAll('.twm-dt-filter-chip')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.value);
const levelsShown = (host) => bodyRows(host).map((tr) => tr.children[1].textContent);

/** A date range: two boxes, the value `{from, to}`. */
function dateRange(ctx) {
    const el = document.createElement('div');
    el.className = 'range';
    const from = document.createElement('input');
    const to = document.createElement('input');
    el.append(from, to);
    const send = () => ctx.setValue({ from: from.value || null, to: to.value || null });
    from.addEventListener('change', send);
    to.addEventListener('change', send);
    let destroyed = 0;
    return {
        el,
        setValue(v) { from.value = v?.from || ''; to.value = v?.to || ''; },
        destroy() { destroyed++; },
        get destroyed() { return destroyed; },
        inputs: { from, to },
    };
}

section('§0 without filterKinds: the text box');
{
    const { host, table } = mount({ headers, rows, filterable: true });
    check('a text box per column', host.querySelectorAll('.twm-data-table__filter-input').length, 3);
    ok('no control cell', !host.querySelector('.data-table__filter-cell--control'));
    table.dispose();
}

section('§1 the built-in chips');
{
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: LEVELS } });
    check('two text boxes, and the chips in the Level column',
          [host.querySelectorAll('.twm-data-table__filter-input').length,
           host.querySelectorAll('.twm-data-table__filter-row th')[1].querySelectorAll('.twm-dt-filter-chip').length], [2, 4]);
    const group = host.querySelector('.twm-dt-filter-chips');
    check('a labelled group', [group.getAttribute('role'), group.getAttribute('aria-label')], ['group', 'Level']);
    check('"All" pressed: no filter', pressed(host), ['']);
    check('counts unknown: a dash', chip(host, 'warn').querySelector('.twm-dt-filter-chip__count').textContent, '–');
    check('the glyph is hidden from the name', chip(host, 'warn').querySelector('.twm-dt-filter-chip__icon').getAttribute('aria-hidden'), 'true');
    click(chip(host, 'warn'));
    check('Warn: only warn rows', levelsShown(host), ['warn', 'warn']);
    check('pressed: Warn', pressed(host), ['warn']);
    check('the filter value is the option\'s', table.getFilters(), [{ column: 1, header: 'Level', value: 'warn' }]);
    click(chip(host, 'warn'));
    check('pressed again: cleared', [levelsShown(host).length, pressed(host)], [5, ['']]);
    click(chip(host, 'error'));
    click(chip(host, ''));
    check('All clears', [levelsShown(host).length, pressed(host)], [5, ['']]);
    table.dispose();
}

section('§2 setFilterCounts');
{
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: LEVELS } });
    table.setFilterCounts(1, { '': 5, info: 2, warn: 2, error: 0 });
    check('badges', ['', 'info', 'warn', 'error'].map((v) => chip(host, v).querySelector('.twm-dt-filter-chip__count').textContent),
          ['5', '2', '2', '0']);
    ok('a zero is dimmed, not hidden', chip(host, 'error').classList.contains('twm-dt-filter-chip--empty'));
    table.setData({ rows: rows.slice(0, 3) });
    check('kept across a render', chip(host, 'info').querySelector('.twm-dt-filter-chip__count').textContent, '2');
    check('getFilterCounts', table.getFilterCounts(1), { '': 5, info: 2, warn: 2, error: 0 });
    table.setFilterCounts({ 1: { '': 9, info: 9 } });
    check('the object form, and an unknown count is a dash again',
          [chip(host, 'info').querySelector('.twm-dt-filter-chip__count').textContent,
           chip(host, 'warn').querySelector('.twm-dt-filter-chip__count').textContent], ['9', '–']);
    table.dispose();
    // Counts set before the control exists reach it when it is built.
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const t2 = new T.DataTable(host2, { headers, rows, filterable: true, filterKinds: { 1: LEVELS } });
    t2.setFilterCounts(1, { warn: 7 });
    t2.render();
    check('given to a control built later', chip(host2, 'warn').querySelector('.twm-dt-filter-chip__count').textContent, '7');
    t2.dispose();
}

section('§3 built once: the same element every render');
{
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: LEVELS }, sortable: true });
    const first = host.querySelector('.twm-dt-filter-chips');
    table.sortBy(0, false);
    table.setData({ rows: [...rows] });
    ok('the same element', host.querySelector('.twm-dt-filter-chips') === first);
    table.dispose();
}

section('§4 multiple chips');
{
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: { ...LEVELS, multiple: true } } });
    click(chip(host, 'warn'));
    click(chip(host, 'error'));
    check('warn or error', levelsShown(host), ['warn', 'error', 'warn']);
    check('both pressed', pressed(host), ['warn', 'error']);
    check('the value is a list', table.getFilters()[0].value, ['warn', 'error']);
    click(chip(host, 'warn'));
    check('one taken out', levelsShown(host), ['error']);
    table.dispose();
}

section('§5 a consumer\'s own control: a date range');
{
    let built = null;
    const { host, table } = mount({
        headers, rows, filterable: true, sortable: true,
        filterKinds: { 0: { create: (ctx) => (built = dateRange(ctx)) } },
    });
    ok('drawn in the When column', host.querySelectorAll('.twm-data-table__filter-row th')[0].contains(built.el));
    ok('marked as a filter control', built.el.classList.contains('twm-dt-filter-control'));
    built.inputs.from.value = '2026-10-03';
    built.inputs.to.value = '2026-10-07';
    built.inputs.from.dispatchEvent(new T.window.Event('change'));
    check('the default range rule: dates, inclusive', bodyRows(host).map((tr) => tr.children[0].textContent),
          ['2026-10-03', '2026-10-05', '2026-10-07']);
    built.inputs.to.focus();
    built.inputs.to.setSelectionRange(2, 4);
    table.sortBy(0, false);
    ok('focus inside it survives a render', document.activeElement === built.inputs.to);
    check('…with its selection', [built.inputs.to.selectionStart, built.inputs.to.selectionEnd], [2, 4]);
    table.clearFilters();
    check('clearFilters tells the control', [built.inputs.from.value, built.inputs.to.value], ['', '']);
    table.dispose();
    check('dispose destroys it', built.destroyed, 1);
}

section('§6 dataSource: values forwarded as they are; counts from the answer');
{
    const asked = [];
    const fetch = async (q) => {
        asked.push(q);
        return { rows: rows.slice(0, 2), total: 2, filterCounts: { 1: { '': 42, warn: 4, error: 0 } } };
    };
    let range = null;
    const { host, table } = mount({
        headers, dataSource: fetch, filterable: true,
        filterKinds: { 1: LEVELS, 0: { create: (ctx) => (range = dateRange(ctx)) } },
    });
    await tick(); await tick();
    check('the answer\'s counts reached the chips', chip(host, '').querySelector('.twm-dt-filter-chip__count').textContent, '42');
    click(chip(host, 'warn'));
    await tick();
    range.inputs.from.value = '2026-10-02';
    range.inputs.from.dispatchEvent(new T.window.Event('change'));
    await tick();
    check('both forwarded, the range as an object', asked.at(-1).filters, [
        { column: 0, header: 'When', value: { from: '2026-10-02', to: null } },
        { column: 1, header: 'Level', value: 'warn' },
    ]);
    check('…and not matched here: the server\'s rows drawn as given', levelsShown(host), ['info', 'warn']);
    table.dispose();
}

section('§7 onFilterChange, getFilters, setFilter, clearFilters');
{
    const heard = [];
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: LEVELS },
                                    onFilterChange: (f) => heard.push(f.map((x) => [x.column, x.value])) });
    table.setFilter(1, 'error');
    check('setFilter presses the chip', pressed(host), ['error']);
    table.setFilter(2, 'ann');
    check('…and fills a text box', host.querySelectorAll('.twm-data-table__filter-input')[1].value, 'ann');
    check('both apply', levelsShown(host), ['error']);
    check('getFilters', table.getFilters().map((f) => [f.column, f.value]), [[1, 'error'], [2, 'ann']]);
    table.clearFilters();
    check('clearFilters: All pressed again', pressed(host), ['']);
    check('onFilterChange heard each', heard, [[[1, 'error']], [[1, 'error'], [2, 'ann']], []]);
    table.dispose();
}

section('§8 new headers: the controls are rebuilt');
{
    let made = 0;
    let last = null;
    const { host, table } = mount({ headers, rows, filterable: true,
                                    filterKinds: { 0: { create: (ctx) => { made++; return (last = dateRange(ctx)); } } } });
    const first = last;
    table.setData({ rows });
    check('same headers: built once', made, 1);
    table.setData({ headers: ['Day', 'Level', 'Who'], rows });
    check('new headers: built again', made, 2);
    check('…and the old one destroyed', first.destroyed, 1);
    ok('the new one is drawn', host.contains(last.el) && !host.contains(first.el));
    table.dispose();
}

section('§9 filterKinds as a function, and a control\'s own match');
{
    const kinds = (col, header) => (header === 'Who' ? {
        create: (ctx) => {
            const el = document.createElement('button');
            el.textContent = 'pick';
            el.addEventListener('click', () => ctx.setValue({ sub: 'ann' }));
            return { el, match: (cell, value) => cell === value.sub };
        },
    } : null);
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: kinds });
    check('a control only where the function said', host.querySelectorAll('.twm-data-table__filter-input').length, 2);
    click(host.querySelector('.twm-data-table__filter-row th:nth-child(3) button'));
    check('its own match decided', bodyRows(host).map((tr) => tr.children[2].textContent), ['ann', 'ann', 'ann']);
    table.dispose();
}

section('§10 createChipsFilter on its own');
{
    const out = [];
    const c = T.createChipsFilter({ header: 'Level' }, { ...LEVELS, onChange: (v) => out.push(v) });
    document.body.appendChild(c.el);
    c.el.querySelector('[data-value="info"]').click();
    c.el.querySelector('[data-value="info"]').click();
    check('it reports its value', out, ['info', null]);
    c.setValue('error');
    check('setValue', c.getValue(), 'error');
    c.el.remove();
}

section('§11 a control is in the width measure, and its narrowest width is a floor');
{
    const { host, table } = mount({ headers, rows, filterable: true, filterKinds: { 1: LEVELS } });
    ok('the row holding a control is marked for the measure',
       host.querySelector('.twm-data-table__filter-row')?.classList.contains('twm-data-table__filter-row--controls'));
    // The fit pass: three columns of 200px wanted in 300px, the middle one
    // floored at 150 (its widest chip) — it keeps 150, the others shrink.
    const w = table._fitColumnWidths([200, 200, 200], 300, { firstIdx: 0, floors: [0, 150, 0] });
    ok('a floored column is never squeezed under its floor', w[1] >= 150);
    const plain = table._fitColumnWidths([200, 200, 200], 300, { firstIdx: 0 });
    ok('without floors the squeeze is as before', plain[1] < 150);
    table.dispose();
    const t2 = mount({ headers, rows, filterable: true });
    ok('no control, no mark', !t2.host.querySelector('.twm-data-table__filter-row--controls'));
    t2.table.dispose();
}

T.done();
