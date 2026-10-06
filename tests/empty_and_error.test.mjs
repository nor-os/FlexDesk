/**
 * 0.5.0 `emptyState` and `setError` — THE BOX SAYS WHAT IS GOING ON, AND A
 * FAILURE DOES NOT BLANK THE LIST.
 *
 * `emptyMessage` is a string in italics. A list whose empty state needs a link
 * ("Create the first one") or a sentence that wraps had to swap the whole table
 * out for a paragraph of its own; and a list whose refresh FAILED had no state
 * at all — so it either kept stale rows with nothing saying so, or threw them
 * away for an error paragraph and lost the reader's place.
 *
 *   §0  without the keys: the 0.4 italic emptyMessage, inline-styled
 *   §1  emptyState as text, as a node (with its listeners), and as a function
 *       called on each render
 *   §2  emptyState is quiet while setLoading(true): empty-and-loading is not
 *       empty
 *   §3  setError with rows: the rows STAY, under a banner (role="alert")
 *   §4  setError with no rows: the failure takes the empty row; an Error's
 *       message; setError(null) and setData({rows}) clear it; it ends loading
 *   §5  setLoading on a table WITHOUT an emptyState leaves 0.4's wrapper alone:
 *       the loading class is for the one rule that reads it
 *   §6  THE CASCADE: the empty, failed and NULL cells are often a row's first
 *       cell, which the time column's `td:first-child` (grey, weight 500),
 *       `firstColumn: 'plain'` and the compact padding also reach. Each of
 *       their rules must OUT-SPECIFY all three — a tie goes to whichever comes
 *       later, and drew a failure grey, like an empty state, with 2px of
 *       padding (measured in headless Edge). jsdom applies no cascade, so this
 *       reads the selectors and compares their specificity
 *
 * Against 0.4.7, §1–§4 and §6 fail; against the first 0.5.0 build, §5 and §6.
 *
 *     node tests/empty_and_error.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { compareSpecificity, specificity, stripComments } from './css_rules.mjs';

const T = await dataTableEnv('empty and error');
const { check, ok, section, mount, bodyRows, click } = T;

const headers = ['Name', 'Value'];
const rows = [['a', 1], ['b', 2]];
const emptyCell = (host) => host.querySelector('.data-table__empty-row td');

section('§0 without the keys: 0.4');
{
    const { host } = mount({ headers, rows: [], emptyMessage: 'Nothing yet' });
    check('the message', emptyCell(host)?.textContent, 'Nothing yet');
    check('in italics, inline', emptyCell(host)?.style.fontStyle, 'italic');
    ok('no state class', !emptyCell(host)?.classList.contains('twm-data-table__empty-cell--state'));
}

section('§1 emptyState: text, a node, a function');
{
    let { host } = mount({ headers, rows: [], emptyState: 'No keys. Mint one to give a program access.' });
    check('text', emptyCell(host)?.textContent, 'No keys. Mint one to give a program access.');
    ok('styled by class, not inline italics',
       emptyCell(host)?.classList.contains('twm-data-table__empty-cell--state') && !emptyCell(host)?.style.fontStyle);
    let pressed = 0;
    const node = document.createElement('div');
    node.innerHTML = 'Nothing here. <button type="button">Create the first one</button>';
    node.querySelector('button').addEventListener('click', () => { pressed++; });
    ({ host } = mount({ headers, rows: [], emptyState: node }));
    ok('a node is placed in the box', emptyCell(host)?.contains(node));
    click(emptyCell(host).querySelector('button'));
    check('…with its listeners', pressed, 1);
    let calls = 0;
    const { host: h3, table } = mount({ headers, rows: [], emptyState: () => { calls++; return `drawn ${calls}`; } });
    check('a function is called', emptyCell(h3)?.textContent, 'drawn 1');
    table.render();
    check('…on each render', emptyCell(h3)?.textContent, 'drawn 2');
}

section('§2 quiet while loading');
{
    const { host, table } = mount({ headers, rows: [], emptyState: 'No rows' });
    table.setLoading(true);
    const wrapper = host.querySelector('.twm-data-table-component');
    ok('the wrapper says it is loading', wrapper.classList.contains('twm-data-table-component--loading'));
    ok('the spinner is up', host.querySelector('.twm-data-table__loading'));
    const sheet = T.css('flexdesk.css');
    ok('and the stylesheet hides the empty state under that class',
       /\.twm-data-table-component--loading \.twm-preview-table td\.twm-data-table__empty-cell--state\s*\{\s*visibility:\s*hidden;/.test(sheet));
    table.setLoading(false);
    ok('loading over: the class is off', !wrapper.classList.contains('twm-data-table-component--loading'));
}

section('§3 setError with rows: the rows stay');
{
    const { host, table } = mount({ headers, rows, emptyMessage: 'none' });
    table.setError('Could not refresh: the server did not answer.');
    const banner = host.querySelector('.twm-data-table__error');
    ok('a banner', banner);
    check('saying what failed', banner?.querySelector('.twm-data-table__error-text')?.textContent,
          'Could not refresh: the server did not answer.');
    check('as an alert', banner?.getAttribute('role'), 'alert');
    check('the rows are still there', bodyRows(host).map((tr) => tr.children[0].textContent), ['a', 'b']);
    const wrapper = host.querySelector('.twm-data-table-component');
    ok('the banner sits above the header', banner.compareDocumentPosition(
        host.querySelector('.twm-preview-table-header-wrap')) & T.window.Node.DOCUMENT_POSITION_FOLLOWING);
    ok('inside the table\'s own box', wrapper.contains(banner));
    check('getError', table.getError(), 'Could not refresh: the server did not answer.');
    table.setError(null);
    ok('setError(null) clears it', !host.querySelector('.twm-data-table__error'));
}

section('§4 setError with no rows; what clears it');
{
    const { host, table } = mount({ headers, rows: [], emptyState: 'No rows' });
    table.setLoading(true);
    table.setError(new Error('403: you may not read this list'));
    check('an Error is its message, in the empty row', emptyCell(host)?.textContent, '403: you may not read this list');
    ok('marked as the error state', emptyCell(host)?.classList.contains('twm-data-table__empty-cell--error'));
    check('…as an alert', emptyCell(host)?.getAttribute('role'), 'alert');
    ok('a failure ends loading', !host.querySelector('.twm-data-table__loading'));
    table.setData({ rows });
    ok('new rows are an answer: the failure is over', !host.querySelector('.twm-data-table__error')
       && table.getError() === null);
    check('…and they are drawn', bodyRows(host).length, 2);
}

section('§5 setLoading without an emptyState: the 0.4 wrapper');
{
    const { host, table } = mount({ headers, rows: [] });
    const wrapper = host.querySelector('.twm-data-table-component');
    const before = wrapper.className;
    table.setLoading(true);
    check('no loading class on the wrapper', wrapper.className, before);
    ok('…the spinner is up, as in 0.4', host.querySelector('.twm-data-table__loading'));
    table.setLoading(false);
    check('and none after', wrapper.className, before);
}

section('§6 the cascade: these cells out-specify the first column and the density');
{
    // Every rule that reaches a body cell for the first column or the density.
    const rivals = [
        '.twm-preview-table td:first-child',
        '.twm-preview-table.twm-dt--first-plain td:first-child',
        '.twm-data-table-component--compact .twm-preview-table td',
    ];
    for (const sheet of ['base.css', 'flexdesk.css']) {
        const text = stripComments(T.css(sheet)) + stripComments(sheet === 'base.css' ? T.css('overrides.css') : '');
        for (const r of rivals) ok(`${sheet}: the rival ${r} exists`, text.replace(/\s+/g, ' ').includes(r));
        const ours = [];
        const re = /([^{}]+)\{([^{}]*)\}/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            for (const sel of m[1].split(',').map((x) => x.replace(/\s+/g, ' ').trim())) {
                if (/twm-data-table__empty-cell--(state|error)|twm-dt-cell--null/.test(sel)
                    && /(color|padding)\s*:/.test(m[2])) ours.push(sel);
            }
        }
        ok(`${sheet}: the empty, failed and NULL cells' colour and padding rules are there`, ours.length >= 3);
        const weak = ours.filter((sel) => rivals.some((r) => compareSpecificity(specificity(sel), specificity(r)) <= 0));
        check(`${sheet}: each one beats every rival outright`, weak, []);
    }
}

T.done();
