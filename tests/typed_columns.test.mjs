/**
 * 0.5.0 — SORT AND FILTER BY THE REAL VALUE, SHOW THE WORDS: a `sortValue`
 * hook, and columns typed 'date', 'datetime' and 'duration' whose dates are
 * drawn ISO by default (`dateFormat`, `dateTimeFormat`, `durationFormat`).
 *
 * DataTable sorted a text column by its lower-cased TEXT, and consumers handed
 * it text they had already formatted — so "10/5/2026" sorted before
 * "9/30/2026", "3.2 s" before "850 ms", and "5 Oct" before "30 Sep". The first
 * consumer had eight private date formatters writing three formats, and a
 * duration column whose whole purpose was "sort it and read the top row".
 *
 * Its product owner on the default: *"Flexdesk default should be the ISO
 * date"* — YYYY-MM-DD, and YYYY-MM-DD HH:mm for a timestamp — with any other
 * pattern a consumer's choice, per column.
 *
 * Run in America/New_York on purpose: a date-only value read the naive way
 * (`Date.parse('2026-10-05')` is UTC midnight) is drawn as the 4th there.
 *
 *   §0  without types or the hook: text sorts as text, exactly as 0.4
 *   §1  sortValue: for every column, per column (object or array), a Date key,
 *       `undefined` falling back, nulls last both ways
 *   §2  'date': ISO strings, Dates and epoch ms drawn YYYY-MM-DD, a calendar
 *       date never moved by the zone, sorted by time
 *   §3  'datetime': YYYY-MM-DD HH:mm, zones honoured, sorted to the second
 *   §4  dateFormat / dateTimeFormat: a pattern, per column, a function, UTC
 *   §5  'duration': 850 ms < 3.2 s < 2m 5s; text durations parsed; 'clock'
 *   §6  filters by the value: periods, operators, ranges, words; a half-typed
 *       operand filters nothing; durations with units
 *   §7  a copy carries the drawn words; the filter row and its dropdown speak
 *       dates and durations
 *   §8  the helpers are exported for a consumer that draws a value elsewhere
 *   §9  getColumnType keeps its 0.4 meaning: 'date' returned there is a CLASS
 *       NAME (formatValue draws, text sorts, text filters), and a new
 *       getColumnType alone waits for the next rows; a new columnTypes does not
 *   §10 a date filter TYPED ONE KEY AT A TIME narrows as it goes — never an
 *       empty table at `2`, `202`, `2026-` — and words drawn by a non-ISO
 *       pattern (`5 Oct`, `30 Sep`) find their rows
 *   §11 ISO, a Date or epoch ms, or it is text: `5`, `12`, `1/2` are drawn as
 *       they came, not as dates in 2001; a date that does not exist
 *       (`2026-02-31`) is not rolled into March; `0001-01-01` is year 1
 *
 * Against 0.4.7, §1–§8, §10, §11 and §9's columnTypes half fail; against the
 * first 0.5.0 build, §9–§11.
 *
 *     node tests/typed_columns.test.mjs
 */
process.env.TZ = 'America/New_York';
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('typed columns');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const col = (host, i) => bodyRows(host).map((tr) => tr.children[i].textContent);
async function typeFilter(host, colIdx, text) {
    const input = host.querySelectorAll('.twm-data-table__filter-input')[colIdx];
    input.value = text;
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
}

section('§0 without types or the hook: 0.4');
{
    const { host, table } = mount({
        headers: ['Name', 'Modified'], sortable: true,
        rows: [['x', '9/30/2026'], ['y', '10/5/2026'], ['z', '1/2/2027']],
    });
    table.sortBy(1, true);
    check('formatted text sorts as text', col(host, 1), ['1/2/2027', '10/5/2026', '9/30/2026']);
    check('and is drawn as given', col(host, 0), ['z', 'y', 'x']);
}

section('§1 sortValue');
{
    const rows = [['x', '9/30/2026'], ['y', '10/5/2026'], ['z', null], ['w', '1/2/2027']];
    const toTime = (v) => (v == null ? null : new Date(v));
    let { host, table } = mount({ headers: ['Name', 'Modified'], rows, sortable: true, sortValue: (v, c) => (c === 1 ? toTime(v) : undefined) });
    table.sortBy(1, true);
    check('a Date key sorts by time', col(host, 0), ['x', 'y', 'w', 'z']);
    table.sortBy(1, false);
    check('descending; the null is still last', col(host, 0), ['w', 'y', 'x', 'z']);
    table.sortBy(0, true);
    check('undefined falls back to the column\'s own rule', col(host, 0), ['w', 'x', 'y', 'z']);
    ({ host, table } = mount({ headers: ['Name', 'Modified'], rows, sortable: true, sortValue: { 1: toTime } }));
    table.sortBy(1, true);
    check('per column, as an object', col(host, 0), ['x', 'y', 'w', 'z']);
    ({ host, table } = mount({ headers: ['Name', 'Size'], sortable: true,
        rows: [['a', '2 KB'], ['b', '900 B'], ['c', '1 MB']],
        sortValue: [null, (v) => ({ B: 1, KB: 1e3, MB: 1e6 })[v.split(' ')[1]] * parseFloat(v)] }));
    table.sortBy(1, true);
    check('per column, as an array', col(host, 1), ['900 B', '2 KB', '1 MB']);
}

section('§2 date');
{
    const rows = [
        ['iso', '2026-10-05'],
        ['instant', '2026-09-30T23:30:00Z'],      // 19:30 on the 30th in New York
        ['date', new Date(2027, 0, 2, 9, 0)],
        ['epoch', Date.UTC(2026, 0, 15, 12)],
        ['none', null],
        ['junk', 'not a date'],
    ];
    const { host, table } = mount({ headers: ['What', 'When'], rows, sortable: true, columnTypes: [null, 'date'] });
    check('drawn ISO; a calendar date stays its day; junk is shown as it came',
          col(host, 1), ['2026-10-05', '2026-09-30', '2027-01-02', '2026-01-15', '-', 'not a date']);
    table.sortBy(1, true);
    check('sorted by time, the unreadable last', col(host, 0), ['epoch', 'instant', 'iso', 'date', 'none', 'junk']);
    table.sortBy(1, false);
    check('descending', col(host, 0), ['date', 'iso', 'instant', 'epoch', 'none', 'junk']);
    ok('the cell carries its type class', bodyRows(host)[0].children[1].classList.contains('date'));
}

section('§3 datetime');
{
    const rows = [
        ['a', '2026-10-05T14:05:09+02:00'],      // 08:05 in New York
        ['b', '2026-10-05 08:05:10'],            // wall clock, read in New York
        ['c', '2026-10-05T12:05:08Z'],           // 08:05:08 in New York
    ];
    const { host, table } = mount({ headers: ['Run', 'Started'], rows, sortable: true, columnTypes: [null, 'datetime'] });
    check('YYYY-MM-DD HH:mm, each in this zone', col(host, 1), ['2026-10-05 08:05', '2026-10-05 08:05', '2026-10-05 08:05']);
    table.sortBy(1, true);
    check('sorted to the second, though all three READ the same', col(host, 0), ['c', 'a', 'b']);
}

section('§4 dateFormat and dateTimeFormat');
{
    const rows = [['2026-10-05', '2026-10-05T14:30:00Z']];
    let { host } = mount({ headers: ['Due', 'At'], rows, columnTypes: ['date', 'datetime'],
        dateFormat: 'DD.MM.YYYY', dateTimeFormat: 'D MMM YYYY, h:mm a' });
    check('patterns', col(host, 0).concat(col(host, 1)), ['05.10.2026', '5 Oct 2026, 10:30 am']);
    ({ host } = mount({ headers: ['A', 'B'], rows: [['2026-10-05', '2026-12-24']], columnTypes: ['date', 'date'],
        dateFormat: [null, 'ddd D MMMM [week]'] }));
    check('per column; a null keeps ISO; [literal] text', [col(host, 0)[0], col(host, 1)[0]], ['2026-10-05', 'Thu 24 December week']);
    ({ host } = mount({ headers: ['A'], rows: [['2026-10-05']], columnTypes: ['date'],
        dateFormat: (d) => `Y${d.getFullYear()}` }));
    check('a function', col(host, 0), ['Y2026']);
    ({ host } = mount({ headers: ['At'], rows: [['2026-10-05T23:30:00Z']], columnTypes: ['datetime'], dateTimeZone: 'UTC' }));
    check('UTC', col(host, 0), ['2026-10-05 23:30']);
}

section('§5 duration');
{
    const rows = [['q1', 125000], ['q2', 850], ['q3', 3200], ['q4', '45 ms'], ['q5', null]];
    const { host, table } = mount({ headers: ['Query', 'For'], rows, sortable: true, columnTypes: [null, 'duration'] });
    check('drawn for a person', col(host, 1), ['2m 5s', '850 ms', '3.2 s', '45 ms', '-']);
    table.sortBy(1, false);
    check('sorted by milliseconds: the longest first, the empty last', col(host, 0), ['q1', 'q3', 'q2', 'q4', 'q5']);
    const clock = mount({ headers: ['For'], rows: [[3725000]], columnTypes: ['duration'], durationFormat: 'clock' }).host;
    check('clock', col(clock, 0), ['1:02:05']);
}

section('§6 filters by the value');
{
    const rows = [
        ['a', '2026-09-30', 850],
        ['b', '2026-10-05', 3200],
        ['c', '2026-10-31', 125000],
        ['d', '2027-02-01', 45],
        ['e', null, null],
    ];
    const opts = { headers: ['Id', 'Due', 'For'], rows, filterable: true, columnTypes: [null, 'date', 'duration'] };
    const { host } = mount(opts);
    const ids = () => col(host, 0);
    await typeFilter(host, 1, '2026-10');
    check('a period with no operator: in October', ids(), ['b', 'c']);
    await typeFilter(host, 1, '>2026-10');
    check('>2026-10: after October', ids(), ['d']);
    await typeFilter(host, 1, '>=2026-10-05');
    check('>=2026-10-05: from the 5th', ids(), ['b', 'c', 'd']);
    await typeFilter(host, 1, '<=2026-10-05');
    check('<=2026-10-05: up to the END of the 5th', ids(), ['a', 'b']);
    await typeFilter(host, 1, '2026-09..2026-10-05');
    check('a range, end inclusive at its precision', ids(), ['a', 'b']);
    await typeFilter(host, 1, '!=2026');
    check('!=2026: not in 2026 (a row with no date matches no operator, as for numbers)', ids(), ['d']);
    await typeFilter(host, 1, '>20');
    check('a half-typed operand filters nothing yet', ids(), ['a', 'b', 'c', 'd', 'e']);
    await typeFilter(host, 1, '');
    await typeFilter(host, 2, '>1s');
    check('duration: >1s', ids(), ['b', 'c']);
    await typeFilter(host, 2, '<500ms');
    check('duration: <500ms', ids(), ['d']);
    await typeFilter(host, 2, '1s..1m');
    check('duration: 1s..1m', ids(), ['b']);
    await typeFilter(host, 2, 'ms');
    check('duration: words match what is drawn', ids(), ['a', 'd']);
    const words = mount({ ...opts, dateFormat: 'D MMM YYYY' }).host;
    const input = words.querySelectorAll('.twm-data-table__filter-input')[1];
    input.value = 'oct';
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
    check('date: words match what is drawn (MMM)', col(words, 0), ['b', 'c']);
}

section('§7 copy, the filter row and its dropdown');
{
    const copied = [];
    globalThis.navigator.clipboard = { writeText: async (t) => { copied.push(t); } };
    const { host, table } = mount({ headers: ['Due', 'For'], rows: [['2026-10-05T12:00:00Z', 3200]],
                                    filterable: true, columnTypes: ['datetime', 'duration'] });
    table.setSelection([0]);
    await table.copyToClipboard('tsv');
    check('a copy carries the drawn words', copied[0], 'Due\tFor\n2026-10-05 08:00\t3.2 s');
    const inputs = host.querySelectorAll('.twm-data-table__filter-input');
    check('the filter row says how to filter each', [inputs[0].placeholder, inputs[1].placeholder],
          ['e.g. >2026-01-01', 'e.g. >1s']);
    click(host.querySelectorAll('.twm-data-table__filter-dropdown-btn')[0]);
    const panel = document.querySelector('.twm-data-table__filter-dropdown');
    check('a date column\'s operators read as dates',
          [...panel.querySelectorAll('option')].map((o) => o.textContent).slice(2, 6),
          ['After', 'On or after', 'Before', 'On or before']);
    const select = panel.querySelector('select');
    select.value = '>';
    panel.querySelector('.twm-data-table__filter-dropdown-input').value = '2026-10-01';
    click(panel.querySelector('.twm-data-table__filter-dropdown-btn-action--apply'));
    check('Apply composes an operator over a date', host.querySelectorAll('.twm-data-table__filter-input')[0].value,
          '>2026-10-01');
}

section('§8 the helpers are exported');
{
    const { formatDate, parseDateValue, formatDuration, parseDuration, ISO_DATE, ISO_DATETIME } = T;
    check('ISO defaults', [ISO_DATE, ISO_DATETIME], ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm']);
    check('formatDate', formatDate('2026-10-05'), '2026-10-05');
    check('formatDate with a pattern', formatDate('2026-10-05T08:00:00', 'hh:mm A'), '08:00 AM');
    check('parseDateValue of a calendar date is local midnight',
          parseDateValue('2026-10-05'), new Date(2026, 9, 5).getTime());
    check('formatDuration', [formatDuration(850), formatDuration(3200), formatDuration(125000), formatDuration(7260000)],
          ['850 ms', '3.2 s', '2m 5s', '2h 1m']);
    check('parseDuration', [parseDuration('2m 5s'), parseDuration('1:02:05'), parseDuration('1.5 hours'), parseDuration('soon')].map(String),
          ['125000', '3725000', '5400000', 'NaN']);
}

section('§9 getColumnType keeps its 0.4 meaning');
{
    const copied = [];
    globalThis.navigator.clipboard = { writeText: async (t) => { copied.push(t); } };
    const rows = [['a', '2026-10-01T10:00:00Z'], ['b', '2026-09-30T23:00:00Z'], ['c', '2026-10-01T09:00:00Z']];
    const { host, table } = mount({
        headers: ['Id', 'When'], rows, sortable: true, filterable: true,
        getColumnType: (colIdx) => (colIdx === 1 ? 'date' : 'text'),
        formatValue: (v) => `fv:${v}`,
    });
    ok('the cell takes the class it returned', bodyRows(host)[0].children[1].classList.contains('date'));
    check('formatValue draws it, as in 0.4', col(host, 1)[0], 'fv:2026-10-01T10:00:00Z');
    check('the filter row offers text', host.querySelectorAll('.twm-data-table__filter-input')[1].placeholder,
          'Filter...');
    table.sortBy(1, false);
    check('it sorts as text', col(host, 0), ['fv:a', 'fv:c', 'fv:b']);
    table.setSelection([0]);
    await table.copyToClipboard('tsv');
    check('a copy carries formatValue\'s words', copied.at(-1).split('\n')[1], 'fv:a\tfv:2026-10-01T10:00:00Z');
}
{
    const { host, table } = mount({ headers: ['N'], rows: [['1'], ['2']] });
    check('detected', [...bodyRows(host)].map((tr) => tr.children[0].className), ['num', 'num']);
    table.setData({ getColumnType: () => 'text' });
    check('a new getColumnType alone waits for the next rows (0.4)',
          [...bodyRows(host)].map((tr) => tr.children[0].className), ['num', 'num']);
    table.setData({ rows: [['1'], ['2']] });
    check('…and applies with them', [...bodyRows(host)].map((tr) => tr.children[0].className), ['text', 'text']);
    table.setData({ columnTypes: ['duration'] });
    check('a new columnTypes applies at once', col(host, 0), ['1 ms', '2 ms']);
    table.setData({ columnTypes: null });
    check('…and so does clearing it', [...bodyRows(host)].map((tr) => tr.children[0].className), ['text', 'text']);
}

section('§10 a date filter typed one key at a time');
{
    const rows = [
        ['a', '2026-09-30T12:00:00'],
        ['b', '2026-10-05T14:30:00'],
        ['c', '2026-10-31T08:00:00'],
        ['d', '2027-02-01T09:15:00'],
        ['e', null],
    ];
    const { host } = mount({ headers: ['Id', 'When'], rows, filterable: true, columnTypes: [null, 'datetime'] });
    const steps = [];
    for (const text of ['2', '20', '202', '2026', '2026-', '2026-1', '2026-10', '2026-10-', '2026-10-0', '2026-10-05']) {
        await typeFilter(host, 1, text);
        steps.push(`${text}=${col(host, 0).join('')}`);
    }
    check('no operator: it narrows as it is typed, and never empties on the way',
          steps, ['2=abcd', '20=abcd', '202=abcd', '2026=abc', '2026-=abc', '2026-1=bc', '2026-10=bc',
                  '2026-10-=bc', '2026-10-0=b', '2026-10-05=b']);
    steps.length = 0;
    for (const text of ['>2', '>20', '>2026', '>2026-', '>2026-1', '>2026-10']) {
        await typeFilter(host, 1, text);
        steps.push(`${text}=${col(host, 0).join('')}`);
    }
    check('an operator over a half-typed date filters nothing until it is one',
          steps, ['>2=abcde', '>20=abcde', '>2026=d', '>2026-=abcde', '>2026-1=abcde', '>2026-10=d']);
}
{
    const rows = [
        ['a', '2026-09-30T08:00:00'],
        ['b', '2026-10-05T14:30:00'],
        ['c', '2026-10-15T10:00:00'],
    ];
    const { host } = mount({ headers: ['Id', 'When'], rows, filterable: true, columnTypes: [null, 'datetime'],
                             dateTimeFormat: 'D MMM YYYY, h:mm a' });
    check('drawn by the pattern', col(host, 1), ['30 Sep 2026, 8:00 am', '5 Oct 2026, 2:30 pm', '15 Oct 2026, 10:00 am']);
    const found = [];
    for (const text of ['5 Oct', '30 Sep', '5 Oct 2026', '15 Oct', 'Oct', '2:30']) {
        await typeFilter(host, 1, text);
        found.push(`${text}=${col(host, 0).join('')}`);
    }
    check('the words drawn find their rows', found,
          ['5 Oct=bc', '30 Sep=a', '5 Oct 2026=bc', '15 Oct=c', 'Oct=bc', '2:30=b']);
}

section('§11 ISO, a Date or epoch ms — or it is text');
{
    const rows = [['a', '5'], ['b', '12'], ['c', '1/2'], ['d', 'Mon, 05 Oct 2026 14:30:00 GMT'],
                  ['e', '2026-02-31'], ['f', '2026-04-31'], ['g', '2026-02-29'], ['h', '2024-02-29'],
                  ['i', '0001-01-01'], ['j', '2026-10-05']];
    const { host, table } = mount({ headers: ['Id', 'Due'], rows, sortable: true, filterable: true,
                                    columnTypes: [null, 'date'] });
    check('drawn as they came unless they are ISO dates that exist', col(host, 1),
          ['5', '12', '1/2', 'Mon, 05 Oct 2026 14:30:00 GMT', '2026-02-31', '2026-04-31', '2026-02-29',
           '2024-02-29', '0001-01-01', '2026-10-05']);
    table.sortBy(1, true);
    check('the dates sort by time; the text after them', col(host, 0).slice(0, 3), ['i', 'h', 'j']);
    await typeFilter(host, 1, '=2026-03-03');
    check('2026-02-31 is not the 3rd of March', col(host, 0), []);
    await typeFilter(host, 1, '2026-02-31');
    check('…it is text, and its words find it', col(host, 0), ['e']);
    const { parseDateValue, parseDatePeriod, formatDate } = T;
    check('parseDateValue: no Date.parse fallback',
          ['5', '12', '1/2', '5 Oct', 'Oct 5 2026', '2026-02-31', '2026-10-05 24:01'].map((v) => String(parseDateValue(v))),
          ['NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN']);
    check('…the end of a day is the next day', formatDate('2026-10-05 24:00', 'YYYY-MM-DD HH:mm'), '2026-10-06 00:00');
    check('year 1 is year 1', formatDate(parseDateValue('0001-01-01T00:00:00Z'), 'YYYY-MM-DD', { utc: true }), '0001-01-01');
    check('parseDatePeriod: an ISO prefix with two-digit parts, or nothing',
          ['2', '202', '2026-', '2026-1', '2026-10-5', '5 Oct', '2026-02-31', '2026-10-05 25'].map((v) => parseDatePeriod(v)),
          [null, null, null, null, null, null, null, null]);
    const oct = parseDatePeriod('2026-10');
    check('…and a month is the month', [oct.start, oct.end], [new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime()]);
}

T.done();
