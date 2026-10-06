/**
 * 0.5.0 `nullDisplay` — A NULL IS SHOWN AS ONE.
 *
 * DataTable draws `null` and `undefined` as '-', which in a database browser is
 * indistinguishable from a cell holding the text "-". A consumer that needed
 * NULL to read as NULL — on screen AND on the clipboard — wrote a `formatValue`
 * for it, and then had to reproduce the default number formatting it replaced.
 *
 *   §0  without the key: '-' (0.4), and no marker class
 *   §1  nullDisplay: the text, and twm-dt-cell--null on the cell
 *   §2  a copy carries it too
 *   §3  a consumer's formatValue still formats every value that is NOT null,
 *       and renderCell still owns the cells it draws
 *
 * Against 0.4.7, §1–§3 fail.
 *
 *     node tests/null_display.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('null display');
const { check, ok, section, mount, bodyRows } = T;

const headers = ['Name', 'Note', 'Score'];
const rows = [['a', null, 1.5], ['b', 'kept', undefined]];
const cells = (host) => bodyRows(host).map((tr) => [...tr.children].map((td) => td.textContent));

section('§0 without the key: 0.4');
{
    const { host } = mount({ headers, rows });
    check('null and undefined are "-"', cells(host), [['a', '-', '1.5'], ['b', 'kept', '-']]);
    ok('no marker class', !host.querySelector('.twm-dt-cell--null'));
}

section('§1 nullDisplay');
{
    const { host } = mount({ headers, rows, nullDisplay: 'NULL' });
    check('drawn as NULL', cells(host), [['a', 'NULL', '1.5'], ['b', 'kept', 'NULL']]);
    check('and marked as a null, not as the text', [...host.querySelectorAll('.twm-dt-cell--null')].length, 2);
    ok('a value is never marked', !bodyRows(host)[1].children[1].classList.contains('twm-dt-cell--null'));
    ok('the stylesheet draws the marker', /td\.twm-dt-cell--null\s*\{[^}]*font-style:\s*italic/.test(T.css('flexdesk.css')));
}

section('§2 a copy carries it');
{
    const copied = [];
    globalThis.navigator.clipboard = { writeText: async (t) => { copied.push(t); } };
    const { table } = mount({ headers, rows, nullDisplay: 'NULL' });
    table.setSelection([0, 1]);
    await table.copyToClipboard('tsv');
    check('TSV', copied[0], 'Name\tNote\tScore\na\tNULL\t1.5\nb\tkept\tNULL');
}

section('§3 formatValue and renderCell keep their cells');
{
    const { host } = mount({
        headers, rows, nullDisplay: '∅',
        formatValue: (v) => `<${v}>`,
    });
    check('formatValue formats every value that is not null', cells(host), [['<a>', '∅', '<1.5>'], ['<b>', '<kept>', '∅']]);
    const drawn = mount({
        headers, rows, nullDisplay: 'NULL',
        renderCell: (td, v, colIdx) => { if (colIdx !== 1) return false; td.textContent = v ?? '(none)'; return true; },
    }).host;
    check('renderCell owns what it draws', bodyRows(drawn)[0].children[1].textContent, '(none)');
    ok('…and is not marked for it', !bodyRows(drawn)[0].children[1].classList.contains('twm-dt-cell--null'));
    check('the cells it leaves still get NULL', bodyRows(drawn)[1].children[2].textContent, 'NULL');
}

T.done();
