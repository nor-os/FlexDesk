/**
 * 0.7.0 — a pager for an unknown total (#35): `pagerLabels`, a total that is
 * not known (Next until a short page, no last page), `maxJumpOffset`, and
 * `pagerPosition`.
 *
 * The 0.6 strip needs a total: it prints "of N", sizes Last from it and, for a
 * server-paged table given none, takes the page in hand as the whole. A log
 * that counts nothing has no N; the first consumer's audit pager drew its own
 * Newest / Newer / Older / Oldest with an Oldest that REFUSES — "No total, so
 * no last page", or past fifty thousand rows "Narrow the filters first" —
 * rather than invent a number or be slow.
 *
 *   §0  with none of the new options a server-paged strip is the 0.6 strip
 *   §1  `dataSource` with `total: null`: no "of N", Next while a page is full,
 *       Last refused with its reason on the control
 *   §2  an explicit `hasMore: false` ends it even on a full page
 *   §3  `pagerLabels`: the words on the buttons, and the consumer's refusal
 *   §4  `maxJumpOffset`: Last refused past it; Go-to-row refused past it
 *       (nothing asked); under it Last goes to the last page
 *   §5  `onPageChange` with `totalCount: null` and `hasMore`: the same pager
 *   §6  an empty later page says so, and keeps the way back
 *   §7  `pagerPosition: 'bottom'`
 *   §8  a client-paged table with `pagerLabels`: the 0.6 words for a known
 *       total
 *
 * Against 0.6.0 §1–§8 fail: there is no `data-pager`, Last is never refused,
 * and the info line always says "of N".
 *
 *     node tests/pager_unknown_total.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('pager unknown total');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const headers = ['Id', 'What'];
const make = (n, from = 1) => Array.from({ length: n }, (_, i) => [from + i, `e${from + i}`]);
const info = (host) => host.querySelector('.twm-pagination-controls span')?.textContent;
const btn = (host, name) => host.querySelector(`[data-pager="${name}"]`);

/** An unknown-total source over `n` rows (`total: null`). */
function source(n, { hasMore } = {}) {
    const calls = [];
    const fetch = async (q) => {
        calls.push(q);
        const rows = make(Math.max(0, Math.min(q.limit, n - q.offset)), q.offset + 1);
        return hasMore === undefined ? { rows, total: null } : { rows, total: null, hasMore };
    };
    return { fetch, calls };
}

section('§0 the 0.6 strip, untouched, without the new options');
{
    const pages = [];
    const { host, table } = mount({ headers, rows: make(100), totalCount: 1000, offset: 0,
                                    onPageChange: (o) => pages.push(o) });
    check('its info line', info(host), 'Rows 1–100 of 1,000');
    ok('no data-pager attribute (the old buttons)', !host.querySelector('[data-pager]'));
    check('its page words', [...host.querySelectorAll('.twm-pagination-controls > span')]
        .map((s) => s.textContent).find((t) => t.startsWith('Page')), 'Page 1 of 10');
    ok('no labelled button, no new class', !host.querySelector('.twm-pagination-btn--labelled, .twm-pagination-page, .twm-pagination-info'));
    table.dispose();
}

section('§1 total unknown: no "of N", Next while full, Last refused');
{
    const s = source(250);
    const { host, table } = mount({ headers, dataSource: s.fetch });
    await tick();
    check('info: the rows, no total', info(host), 'Rows 1–100');
    check('page: no "of q"', host.querySelector('.twm-pagination-page').textContent, 'Page 1');
    ok('Previous and First disabled on the first page', btn(host, 'prev').disabled && btn(host, 'first').disabled);
    ok('Next enabled: the page was full', !btn(host, 'next').disabled);
    const last = btn(host, 'last');
    ok('Last is refused', last.disabled);
    check('…and says why, on the control', last.dataset.refusal, 'The total is not known, so there is no last page.');
    check('…in its tooltip too', last.getAttribute('data-tooltip'), last.dataset.refusal);
    ok('the jump box has no max', !host.querySelector('.twm-pagination-input').hasAttribute('max'));
    click(btn(host, 'next'));
    await tick();
    click(btn(host, 'next'));
    await tick();
    check('third page: a short one', info(host), 'Rows 201–250');
    ok('Next disabled after a short page', btn(host, 'next').disabled);
    check('Page 3', host.querySelector('.twm-pagination-page').textContent, 'Page 3');
    click(btn(host, 'prev'));
    await tick();
    check('Previous goes back a page', s.calls.at(-1).offset, 100);
    table.dispose();
}

section('§2 hasMore: false ends it, even on a full page');
{
    const s = source(100, { hasMore: false });
    const { host, table } = mount({ headers, dataSource: s.fetch });
    await tick();
    ok('a full first page, and nothing more: no strip at all', !host.querySelector('.twm-pagination-controls'));
    table.dispose();
    const s2 = source(1000, { hasMore: true });
    const t2 = mount({ headers, dataSource: s2.fetch, pageSize: 50 });
    await tick();
    ok('hasMore: true with a page size of 50: Next', !btn(t2.host, 'next').disabled);
    check('limit is the page size', s2.calls[0].limit, 50);
    t2.table.dispose();
}

section('§3 pagerLabels');
{
    const s = source(500);
    const { host, table } = mount({
        headers, dataSource: s.fetch,
        pagerLabels: { first: 'Newest', prev: 'Newer', next: 'Older', last: 'Oldest',
                       noLast: 'No total, so no last page.' },
    });
    await tick();
    check('the words on the buttons',
          ['first', 'prev', 'next', 'last'].map((n) => btn(host, n).querySelector('.twm-pagination-btn__label')?.textContent),
          ['Newest', 'Newer', 'Older', 'Oldest']);
    ok('labelled buttons are marked', btn(host, 'next').classList.contains('twm-pagination-btn--labelled'));
    ok('a labelled button is never narrower than its word (beats the skins\' min-width)',
       btn(host, 'next').style.getPropertyValue('min-width') === 'max-content'
       && btn(host, 'next').style.getPropertyPriority('min-width') === 'important'
       && btn(host, 'next').style.flexShrink === '0');
    check('the consumer\'s refusal', btn(host, 'last').dataset.refusal, 'No total, so no last page.');
    table.dispose();
}

section('§4 maxJumpOffset');
{
    const calls = [];
    const fetchBig = async (q) => { calls.push(q); return { rows: make(100, q.offset + 1), total: 1_000_000 }; };
    const { host, table } = mount({ headers, dataSource: fetchBig, maxJumpOffset: 50_000,
                                    pagerLabels: { tooDeep: (max) => `Past ${max.toLocaleString()} rows. Narrow the filters first.` } });
    await tick();
    check('known total: the 0.6 words', info(host), 'Rows 1–100 of 1,000,000');
    const last = btn(host, 'last');
    ok('Last refused past the bound', last.disabled);
    check('…with the reason', last.dataset.refusal, 'Past 50,000 rows. Narrow the filters first.');
    const jump = host.querySelector('.twm-pagination-input');
    jump.value = '60001';
    const asked = calls.length;
    click(btn(host, 'go'));
    await tick();
    check('Go past the bound asks nothing', calls.length, asked);
    check('…and says why on the box', jump.dataset.refusal, 'Past 50,000 rows. Narrow the filters first.');
    ok('…marked invalid', jump.getAttribute('aria-invalid') === 'true');
    jump.value = '4321';
    click(btn(host, 'go'));
    await tick();
    check('Go inside the bound goes', calls.at(-1).offset, 4300);
    table.dispose();
}
{
    const calls = [];
    const fetchSmall = async (q) => { calls.push(q); return { rows: make(Math.min(100, 3000 - q.offset), q.offset + 1), total: 3000 }; };
    const { host, table } = mount({ headers, dataSource: fetchSmall, maxJumpOffset: 50_000 });
    await tick();
    ok('a total inside the bound: Last enabled', !btn(host, 'last').disabled && !btn(host, 'last').dataset.refusal);
    click(btn(host, 'last'));
    await tick();
    check('…and goes to the last page', calls.at(-1).offset, 2900);
    ok('on it, Last and Next are disabled', btn(host, 'last').disabled && btn(host, 'next').disabled);
    table.dispose();
}

section('§5 onPageChange with no total and hasMore');
{
    const pages = [];
    const { host, table } = mount({ headers, rows: make(100), totalCount: null, hasMore: true, offset: 0,
                                    onPageChange: (o, l) => pages.push([o, l]) });
    check('unknown total', info(host), 'Rows 1–100');
    ok('Last refused', btn(host, 'last').dataset.refusal);
    click(btn(host, 'next'));
    check('Next asks the consumer', pages, [[100, 100]]);
    table.setData({ rows: make(30, 101), offset: 100, hasMore: false });
    check('its next page, short', info(host), 'Rows 101–130');
    ok('no more', btn(host, 'next').disabled);
    table.dispose();
}

section('§6 an empty later page keeps the way back');
{
    const s = source(200);
    const { host, table } = mount({ headers, dataSource: s.fetch, emptyState: 'Nothing here.' });
    await tick();
    table._sourceGoTo(300);
    await tick();
    check('it says which page holds nothing', info(host), 'Page 4 · no rows');
    ok('and Previous is there to go back', btn(host, 'prev') && !btn(host, 'prev').disabled);
    check('the rows: none', bodyRows(host).length, 0);
    table.dispose();
}

section('§7 pagerPosition: bottom');
{
    const s = source(400);
    const { host, table } = mount({ headers, dataSource: s.fetch, pagerPosition: 'bottom' });
    await tick();
    const wrapper = host.querySelector('.twm-data-table-component');
    const kids = [...wrapper.children];
    const pager = wrapper.querySelector('.twm-pagination-controls');
    ok('the pager is after the rows', kids.indexOf(pager) > kids.indexOf(wrapper.querySelector('.twm-preview-table-wrap')));
    ok('marked bottom', pager.classList.contains('twm-pagination-controls--bottom'));
    table.dispose();
}

section('§8 client paging with pagerLabels keeps the 0.6 words');
{
    const { host, table } = mount({ headers, rows: make(250), pagerLabels: { next: 'Next' } });
    check('known total', info(host), 'Rows 1–100 of 250');
    check('page words', host.querySelector('.twm-pagination-page').textContent, 'Page 1 of 3');
    click(btn(host, 'last'));
    check('Last goes to the last page', info(host), 'Rows 201–250 of 250');
    table.setFilter(1, 'e1');
    check('filtered: the 0.6 "(N total)" words', info(host), 'Rows 1–100 of 111 (250 total)');
    table.dispose();
}

T.done();
