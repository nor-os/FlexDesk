/**
 * 0.5.0 `firstColumn: 'plain'` — THE FIRST COLUMN IS NOT A TIME COLUMN.
 *
 * DataTable was built around a time series, and its stylesheet still says so:
 * `.twm-preview-table td:first-child` pins the first column at 120px (150px in
 * the later copy of the rule), grey (#bbb) and weight 500 — for every table
 * drawn, whether its first column is a timestamp or a person's name. The first
 * consumer overrode it three times, and its organization page still drew its
 * lists' first column grey and bold.
 *
 * jsdom applies no stylesheet, so the CSS half is held as TEXT here — in both
 * sheets, which must agree (`css/flexdesk.css` is the shipped one, `base.css`
 * its source) — and the result was looked at in headless Edge for 0.5.0.
 *
 *   §0  without the key: no class, and the time rules are still in both
 *       sheets, untouched
 *   §1  'plain': both halves of the table carry twm-dt--first-plain, the
 *       empty-state table included
 *   §2  the plain rule: width auto, the ordinary 80px floor, no max, the
 *       body cell's weight and colour inherited, the header cell the
 *       header's — in both sheets, and one class MORE specific than the time
 *       rules so the order of the sheets cannot matter
 *
 * Against 0.4.7, §1 and §2 fail.
 *
 *     node tests/first_column_plain.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('first column plain');
const { check, ok, section, mount } = T;

const headers = ['Name', 'Role'];
const rows = [['Ada', 'Owner'], ['Grace', 'Viewer']];
const tables = (host) => [...host.querySelectorAll('table.twm-preview-table')];

section('§0 without the key: 0.4');
{
    const { host } = mount({ headers, rows });
    ok('no table carries the class', tables(host).every((t) => !t.classList.contains('twm-dt--first-plain')));
    for (const sheet of ['base.css', 'flexdesk.css']) {
        const css = T.css(sheet);
        const time = ruleBody(css, '.twm-preview-table th:first-child, .twm-preview-table td:first-child');
        ok(`${sheet}: the time rule is still there`, time && /color:\s*#bbb/.test(time) && /font-weight:\s*500/.test(time));
    }
}

section('§1 plain: the class on both halves');
{
    const { host } = mount({ headers, rows, firstColumn: 'plain' });
    check('header and body tables both carry it', tables(host).map((t) => t.classList.contains('twm-dt--first-plain')), [true, true]);
    const empty = mount({ headers, rows: [], firstColumn: 'plain' }).host;
    check('…and the empty-state tables', tables(empty).map((t) => t.classList.contains('twm-dt--first-plain')), [true, true]);
}

section('§2 the plain rule, in both sheets');
for (const sheet of ['base.css', 'flexdesk.css']) {
    const css = T.css(sheet);
    const both = ruleBody(css, '.twm-preview-table.twm-dt--first-plain th:first-child,\n.twm-preview-table.twm-dt--first-plain td:first-child');
    ok(`${sheet}: width auto, an 80px floor, no maximum`,
       both && /width:\s*auto;/.test(both) && /min-width:\s*80px;/.test(both) && /max-width:\s*none;/.test(both));
    const td = ruleBody(css, '.twm-preview-table.twm-dt--first-plain td:first-child');
    ok(`${sheet}: the body cell inherits its weight and colour`,
       td && /font-weight:\s*inherit;/.test(td) && /color:\s*inherit;/.test(td));
    const th = ruleBody(css, '.twm-preview-table.twm-dt--first-plain th:first-child');
    ok(`${sheet}: the header cell is drawn like every other header (600, #aaa)`,
       th && /font-weight:\s*600;/.test(th) && /color:\s*#aaa;/.test(th));
}
// (0,3,1) against the time rules' (0,2,1): `.twm-preview-table` + `.twm-dt--first-plain`
// + `:first-child`, against `.twm-preview-table` + `:first-child`.
check('the plain selector out-specifies the time selector by one class',
      ['.twm-preview-table.twm-dt--first-plain td:first-child', '.twm-preview-table td:first-child']
          .map((s) => (s.match(/\.[\w-]+|:[\w-]+/g) || []).length),
      [3, 2]);

T.done();
