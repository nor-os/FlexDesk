/**
 * 0.5.0 `fitContent` / `maxHeight` — A TABLE AS TALL AS ITS ROWS.
 *
 * DataTable's wrapper is `height:100%` and its body `flex:1 1 0`. That is right
 * in a pane that has a height and wrong in a flowing page: against an `auto`
 * parent the percentage resolves to nothing, the body gets ZERO, and the table
 * draws a header over every `<tr>` it holds with no box to show them in. The
 * first consumer hand-sized twenty-one holders from a row count to get round it.
 *
 * jsdom has no layout, so this suite holds the CONTRACT — the styles the two
 * boxes are given — and the layout itself (a fitted table shows every row; a
 * capped one scrolls under its header; the default in the same flowing box
 * shows none) was proved in headless Edge for 0.5.0.
 *
 *   §0  without the keys: the 0.4 boxes, byte for byte (height:100%, flex:1 1 0)
 *   §1  fitContent: the wrapper is height:auto and the body grows with its rows
 *   §2  maxHeight caps the wrapper (a number is px, a string is CSS) and
 *       implies fitContent
 *   §3  the empty-state body is fitted too, and setData keeps the fit
 *
 * Against 0.4.7, §1–§3 fail.
 *
 *     node tests/fit_content.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('fit content');
const { check, ok, section, mount, bodyRows } = T;

const headers = ['Name', 'Value'];
const rows = Array.from({ length: 5 }, (_, i) => [`r${i}`, i]);
const boxes = (host) => ({
    wrapper: host.querySelector('.twm-data-table-component'),
    body: host.querySelector('.twm-preview-table-wrap'),
});

section('§0 without the keys: the 0.4 boxes');
{
    const { host } = mount({ headers, rows });
    const { wrapper, body } = boxes(host);
    check('the wrapper is height:100%', wrapper.style.height, '100%');
    check('the wrapper has no max-height', wrapper.style.maxHeight, '');
    check('the body takes the remaining space (flex 1 1 0)',
          [body.style.flexGrow, body.style.flexShrink, body.style.flexBasis], ['1', '1', '0px']);
    ok('no --fit modifier', !wrapper.classList.contains('twm-data-table-component--fit'));
}

section('§1 fitContent: as tall as its rows');
{
    const { host } = mount({ headers, rows, fitContent: true });
    const { wrapper, body } = boxes(host);
    check('the wrapper is height:auto', wrapper.style.height, 'auto');
    ok('the wrapper carries the --fit modifier', wrapper.classList.contains('twm-data-table-component--fit'));
    check('the wrapper is still a flex column', [wrapper.style.display, wrapper.style.flexDirection], ['flex', 'column']);
    check('the body grows with its content and may shrink (flex 0 1 auto)',
          [body.style.flexGrow, body.style.flexShrink, body.style.flexBasis], ['0', '1', 'auto']);
    check('the body still scrolls (overflow:auto)', body.style.overflow, 'auto');
    check('every row is drawn', bodyRows(host).length, 5);
}

section('§2 maxHeight caps it, and implies fitContent');
{
    const { host } = mount({ headers, rows, maxHeight: 240 });
    const { wrapper, body } = boxes(host);
    check('a number is px', wrapper.style.maxHeight, '240px');
    check('…and the table is fitted without asking', wrapper.style.height, 'auto');
    check('the body is the part that gives way under the cap',
          [body.style.flexShrink, body.style.minHeight], ['1', '0']);
}
{
    const { host } = mount({ headers, rows, fitContent: true, maxHeight: '40vh' });
    check('a string is CSS, verbatim', boxes(host).wrapper.style.maxHeight, '40vh');
}
{
    const { host } = mount({ headers, rows, maxHeight: 0 });
    check('maxHeight 0 is not a cap (and does not fit)', boxes(host).wrapper.style.height, '100%');
}

section('§3 the empty state is fitted too, and setData keeps it');
{
    const { host, table } = mount({ headers, rows: [], fitContent: true });
    let { wrapper, body } = boxes(host);
    check('empty: the wrapper is height:auto', wrapper.style.height, 'auto');
    check('empty: the body is flex 0 1 auto',
          [body.style.flexGrow, body.style.flexBasis], ['0', 'auto']);
    ok('empty: the empty row is drawn', host.querySelector('.data-table__empty-row'));
    table.setData({ rows });
    ({ wrapper, body } = boxes(host));
    check('after setData: still fitted', wrapper.style.height, 'auto');
    check('after setData: every row is drawn', bodyRows(host).length, 5);
}

T.done();
