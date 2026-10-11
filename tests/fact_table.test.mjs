/**
 * 0.7.0 `createFactTable` — a sheet of facts: a name and its value, with no
 * header row, nothing truncated and no height of its own; before/after pairs;
 * a header row and several columns when asked.
 *
 *   §1  the default sheet: no thead, the label a row header, the value as
 *       given — text, a number, false, a node, an object as JSON, null empty
 *       (or `nullDisplay`)
 *   §2  monospace for the sheet or one row; tabular numerals for a row or a
 *       column
 *   §3  `compare`: label, before, arrow, after; changed / same / added /
 *       removed worked out from the two sides (objects by their JSON, a node
 *       always changed), `status` overriding it, an absent side drawn as
 *       `missing`, a plain value spanning both sides, three header names
 *       over four columns
 *   §4  `headers` and positional rows: the header row, a short row's last
 *       cell spanning the rest, a numeric column's header and cells
 *   §5  rowClass, rowAttrs, a row's key, getRow, labelColumn:false,
 *       wrapLabels, label (aria-label), className
 *   §6  the empty state, setRows, dispose, and the barrel
 *   §7  the stylesheet: in base.css AND flexdesk.css; values WRAP (pre-wrap,
 *       overflow-wrap: anywhere) and nothing in the sheet ellipsises, hides
 *       overflow or sets a height; labels stay on one line unless wrapLabels;
 *       the header row's look is not the row headers' look
 *
 *     node tests/fact_table.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const T = await dataTableEnv('fact table');
const { check, ok, section, css, done } = T;
const { createFactTable, FactTable } = await import('../src/ui/components/fact_table.js');

const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };
const rowsOf = (t) => [...t.element.tBodies[0].rows];
const cells = (tr) => [...tr.cells].map((c) => [c.tagName.toLowerCase(), c.className, c.textContent]);

section('§1 the default sheet');
{
    const link = document.createElement('a');
    link.textContent = 'open';
    const h = host();
    const t = createFactTable(h, {
        rows: [
            { label: 'Server', value: 'db-main-01.internal' },
            { label: 'Port', value: 5432 },
            { label: 'TLS', value: false },
            { label: 'Console', value: link },
            { label: 'Options', value: { sslmode: 'verify-full', pool: [1, 2] } },
            { label: 'Replica', value: null },
        ],
    });
    ok('an instance of FactTable, appended to the host', t instanceof FactTable && t.element.parentNode === h);
    check('a <table class="twm-facts">', [t.element.tagName, t.element.className], ['TABLE', 'twm-facts']);
    ok('NO header row', !t.element.tHead);
    const [server, port, tls, consoleRow, options, replica] = rowsOf(t);
    check('the label is a row header; the value a cell', cells(server),
        [['th', 'twm-facts__label', 'Server'], ['td', 'twm-facts__value', 'db-main-01.internal']]);
    check('…scope="row"', server.cells[0].scope, 'row');
    check('a number', port.cells[1].textContent, '5432');
    check('false reads as false', tls.cells[1].textContent, 'false');
    ok('a node is kept as a node', consoleRow.cells[1].firstChild === link);
    check('an object is indented JSON', options.cells[1].textContent,
        '{\n  "sslmode": "verify-full",\n  "pool": [\n    1,\n    2\n  ]\n}');
    check('null is an empty cell', [replica.cells[1].textContent, replica.cells[1].classList.contains('twm-facts__null')], ['', false]);
    const nd = createFactTable(null, { nullDisplay: '—', rows: [{ label: 'Replica', value: null }] });
    check('nullDisplay', [rowsOf(nd)[0].cells[1].textContent, rowsOf(nd)[0].cells[1].className], ['—', 'twm-facts__value twm-facts__null']);
    check('a row that is a string is a label', cells(rowsOf(createFactTable(null, { rows: ['alone'] }))[0]),
        [['th', 'twm-facts__label', 'alone'], ['td', 'twm-facts__value', '']]);
    check('labelTitle', rowsOf(createFactTable(null, { rows: [{ label: 'Amount', labelTitle: 'amount', value: 1 }] }))[0].cells[0].title, 'amount');
    const long = 'x'.repeat(4000);
    check('a long value is in the DOM WHOLE (no truncation)', rowsOf(createFactTable(null, { rows: [{ label: 'Long', value: long }] }))[0]
        .cells[1].textContent.length, 4000);
}

section('§2 monospace and figures');
{
    const t = createFactTable(null, { rows: [{ label: 'A', value: 'a', mono: true }, { label: 'B', value: 12, numeric: true }, { label: 'C', value: 'c' }] });
    const [a, b, c] = rowsOf(t);
    ok('mono on one row', a.cells[1].classList.contains('twm-facts__mono') && !c.cells[1].classList.contains('twm-facts__mono'));
    ok('numeric on one row', b.cells[1].classList.contains('twm-facts__num'));
    ok('the sheet is not mono', !t.element.classList.contains('twm-facts--mono'));
    ok('mono on the whole sheet', createFactTable(null, { mono: true, rows: [] }).element.classList.contains('twm-facts--mono'));
}

section('§3 before and after');
{
    const node = document.createElement('b');
    const t = createFactTable(null, {
        compare: true,
        headers: ['Field', 'Before', 'After'],
        rows: [
            { label: 'Amount', before: 10, after: 12 },
            { label: 'Name', before: 'Ada', after: 'Ada' },
            { label: 'Tags', before: ['a', 'b'], after: ['a', 'b'] },
            { label: 'Meta', before: { x: 1 }, after: { x: 2 } },
            { label: 'Added', after: 'new' },
            { label: 'Dropped', before: 'old' },
            { label: 'Node', before: 'x', after: node },
            { label: 'Forced', before: 1, after: 1, status: 'changed' },
            { label: 'Id', value: 42 },
            { label: 'Zero', before: 0, after: '0' },
        ],
    });
    check('three header names over four columns (the arrow\'s is empty)',
        [...t.element.tHead.rows[0].cells].map((c) => c.textContent), ['Field', 'Before', '', 'After']);
    const r = rowsOf(t);
    check('label, before, arrow, after', cells(r[0]), [['th', 'twm-facts__label', 'Amount'], ['td', 'twm-facts__value twm-facts__before', '10'],
        ['td', 'twm-facts__arrow', '→'], ['td', 'twm-facts__value twm-facts__after', '12']]);
    check('the arrow is hidden from a screen reader', r[0].cells[2].getAttribute('aria-hidden'), 'true');
    check('statuses', r.map((tr) => tr.dataset.status ?? null),
        ['changed', 'same', 'same', 'changed', 'added', 'removed', 'changed', 'changed', null, 'changed']);
    ok('…as classes', r[0].classList.contains('twm-facts__row--changed') && r[1].classList.contains('twm-facts__row--same')
        && r[4].classList.contains('twm-facts__row--added') && r[5].classList.contains('twm-facts__row--removed'));
    check('an absent side reads as `missing`', [r[4].cells[1].textContent, r[4].cells[1].className],
        ['—', 'twm-facts__value twm-facts__missing twm-facts__before']);
    check('a plain value spans before, arrow and after', [r[8].cells.length, r[8].cells[1].colSpan, r[8].cells[1].textContent], [2, 3, '42']);
    check('missing: a word of your own', rowsOf(createFactTable(null, { compare: true, missing: 'not stored', rows: [{ label: 'a', after: 1 }] }))[0]
        .cells[1].textContent, 'not stored');
    ok('without compare, before/after are ignored and value is drawn', rowsOf(createFactTable(null, { rows: [{ label: 'a', before: 1, after: 2, value: 'v' }] }))[0]
        .cells.length === 2);
}

section('§4 a header row and several columns');
{
    const t = createFactTable(null, {
        headers: ['Schema', 'Provisioned', 'Tables'],
        numeric: [2],
        rows: [['app', 'yes', 14], ['meta', 'yes', 9], ['an']],
    });
    check('the header row', [...t.element.tHead.rows[0].cells].map((c) => [c.textContent, c.scope, c.className]),
        [['Schema', 'col', ''], ['Provisioned', 'col', ''], ['Tables', 'col', 'twm-facts__num']]);
    const [app, , an] = rowsOf(t);
    check('a positional row', cells(app), [['th', 'twm-facts__label', 'app'], ['td', 'twm-facts__value', 'yes'],
        ['td', 'twm-facts__value twm-facts__num', '14']]);
    check('a short row\'s last cell spans the rest', [an.cells.length, an.cells[0].colSpan], [1, 3]);
    const wide = createFactTable(null, { rows: [['a', 'b', 'c'], { label: 'x', value: 'y' }] });
    check('an object row in a wider sheet spans the value across', rowsOf(wide)[1].cells[1].colSpan, 2);
}

section('§5 hooks and options');
{
    const t = createFactTable(null, {
        rows: [{ label: 'a', value: 1, key: 'k-a' }, ['b', 2]],
        rowClass: (row, i) => (i ? ['second', 'x'] : 'first'),
        rowAttrs: (row, i) => ({ 'data-i': i, 'data-skip': null, 'data-on': i === 0 }),
        label: 'Connection',
        className: 'my-sheet',
    });
    const [a, b] = rowsOf(t);
    ok('rowClass', a.classList.contains('first') && b.classList.contains('second') && b.classList.contains('x'));
    check('rowAttrs', [a.getAttribute('data-i'), a.hasAttribute('data-skip'), a.getAttribute('data-on'), b.hasAttribute('data-on')],
        ['0', false, '', false]);
    check('a row\'s key', a.dataset.key, 'k-a');
    check('getRow', [t.getRow(1), t.getRow(5)], [b, null]);
    check('label → aria-label', t.element.getAttribute('aria-label'), 'Connection');
    ok('className', t.element.classList.contains('my-sheet'));
    const plain = createFactTable(null, { labelColumn: false, rows: [{ label: 'a', value: 1 }, ['x', 'y']] });
    check('labelColumn:false: the first column is an ordinary cell', rowsOf(plain).map((tr) => tr.cells[0].tagName), ['TD', 'TD']);
    ok('…and the sheet says so', plain.element.classList.contains('twm-facts--no-label'));
    ok('wrapLabels', createFactTable(null, { wrapLabels: true }).element.classList.contains('twm-facts--wrap-labels'));
}

section('§6 empty, setRows, dispose, the barrel');
{
    const h = host();
    const t = createFactTable(h, { rows: [], emptyState: 'No settings.' });
    const empty = t.element.querySelector('td.twm-facts__empty');
    check('the empty state spans the sheet', [empty?.textContent, empty?.colSpan], ['No settings.', 2]);
    ok('the sheet says it is empty', t.element.classList.contains('twm-facts--empty'));
    check('getRow does not return the empty row', t.getRow(0), null);
    t.setRows([{ label: 'a', value: 1 }]);
    ok('setRows draws the rows and drops the empty state', rowsOf(t).length === 1 && !t.element.querySelector('.twm-facts__empty')
        && !t.element.classList.contains('twm-facts--empty'));
    check('getRows', t.getRows(), [{ label: 'a', value: 1 }]);
    const node = document.createElement('i'); node.textContent = 'none';
    check('a node empty state', createFactTable(null, { emptyState: () => node }).element.querySelector('.twm-facts__empty i')?.textContent, 'none');
    ok('no emptyState → no row at all', rowsOf(createFactTable(null, {})).length === 0);
    t.dispose();
    ok('dispose takes it off the page', !h.contains(t.element));
    const barrel = await import('../widgets.js');
    ok('@flexdesk/widgets exports createFactTable and FactTable', barrel.createFactTable === createFactTable && barrel.FactTable === FactTable);
}

section('§7 the stylesheet');
{
    const base = css('base.css');
    const flexdesk = css('flexdesk.css');
    const block = (sheet) => {
        const from = sheet.indexOf('/* ══ RECORD LIST & FACT SHEET (0.7.0)');
        const to = sheet.indexOf('/* ══ end RECORD LIST & FACT SHEET ══ */');
        return from >= 0 && to > from ? sheet.slice(from, to) : null;
    };
    check('mirrored byte for byte into flexdesk.css', block(flexdesk), block(base));
    const sheet = stripComments(block(base) || '');
    const factRules = sheet.slice(sheet.indexOf('.twm-facts {'));
    ok('the fact-sheet rules were found', sheet.includes('.twm-facts {') && factRules.length > 200);
    ok('nothing in the sheet ellipsises, hides overflow or sets a height',
        !/text-overflow|overflow\s*:\s*hidden|(^|[\s;{])(max-)?height\s*:/.test(factRules));
    const cell = ruleBody(base, '.twm-facts tbody td, .twm-facts tbody th') || '';
    ok('values keep their line breaks and wrap', /white-space:\s*pre-wrap/.test(cell) && /overflow-wrap:\s*anywhere/.test(cell));
    ok('cells are top-aligned, so a long value does not float its label', /vertical-align:\s*top/.test(cell));
    ok('labels stay on one line', /white-space:\s*nowrap/.test(ruleBody(base, '.twm-facts tbody th.twm-facts__label') || ''));
    ok('…unless wrapLabels', /white-space:\s*normal/.test(ruleBody(base, '.twm-facts.twm-facts--wrap-labels tbody th.twm-facts__label') || ''));
    ok('the header row is styled under thead only (row headers are not header-row text)',
        ruleBody(base, '.twm-facts thead th') && !ruleBody(base, '.twm-facts th'));
    ok('mono reads the token', /font-family-mono/.test(ruleBody(base, '.twm-facts.twm-facts--mono tbody td.twm-facts__value, .twm-facts tbody td.twm-facts__mono') || ''));
    ok('the table is full width and collapses its borders', /width:\s*100%/.test(ruleBody(base, '.twm-facts') || '')
        && /border-collapse:\s*collapse/.test(ruleBody(base, '.twm-facts') || ''));
}

done();
