/**
 * DATATABLE 0.7.0 IN A REAL BROWSER — what jsdom cannot see, settled in
 * headless Edge with real input over the DevTools protocol (demo/flow_cdp.mjs).
 *
 *   detail   a real press on a row's toggle opens its detail DIRECTLY under the
 *            row, across the whole table, with a height; the columns do not
 *            move for a wide detail (`contain: inline-size`); the rows below
 *            move down by the detail's height; the stripes keep their order;
 *            the detail is not a thing to press (no pointer); Tab reaches a
 *            toggle and Enter closes it; ArrowRight on the focused table opens
 *            the selected row's; the Level chips count, and a real press on one
 *            asks the server and draws its answer
 *   virtual  5,000 rows: an open detail is measured into the window — the row
 *            after it starts where the detail ends, the scroll height grew by
 *            the detail's height — and it survives a scroll away and back
 *   pager    the pager under the rows; its words beside its glyphs; real
 *            presses page through an unknown total to a short page; Oldest
 *            refused (and says why) with no total and past maxJumpOffset; a
 *            real jump past the bound asks nothing
 *   follow   a reader scrolled down by a real wheel keeps the row they were
 *            reading at the same place while rows arrive above; at the top
 *            the arrivals are shown, marked new; the selection and an open
 *            detail are kept; paging away turns following off
 *
 *     node demo/datatable_070_probe.mjs [out-dir]       (Windows' node: a global WebSocket)
 *     node demo/datatable_070_probe.mjs [out-dir] --dist (the built dist/widgets.js)
 *
 * Prints one line per check, exits 1 on any failure, writes screenshots.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, key, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DIST = args.includes('--dist');
const OUT = resolve(args.find((a) => !a.startsWith('--')) || join(tmpdir(), 'datatable-070-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wheel(page, x, y, deltaY) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
}

const server = await startServer(ROOT, { dist: false });
const browser = await launchBrowser({ width: 1500, height: 700 });
const base = `http://127.0.0.1:${server.port}/demo/datatable_070.html`;
const url = (view) => `${base}?view=${view}${DIST ? '&dist=1' : ''}`;
console.log(`(${DIST ? 'dist/widgets.js' : 'source widgets.js'})`);

try {
    // ── detail ───────────────────────────────────────────────────────────
    console.log('\ndetail');
    let page = await openPage(browser.debugPort, url('detail'));
    await page.waitFor('window.probe?.ready && document.querySelectorAll(".demo__box")[0].querySelectorAll("tbody tr").length > 10');
    await sleep(300);
    const FIRST = '.demo__box:nth-child(1)';
    const geom = (sel = FIRST) => page.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(sel)});
        const rows = [...root.querySelectorAll('.twm-preview-table-wrap tbody > tr')];
        const data = rows.filter((tr) => !tr.classList.contains('twm-dt-detail-row') && !tr.hidden);
        const heads = [...root.querySelectorAll('.twm-preview-table-header-wrap thead tr:first-child th')].map((th) => th.getBoundingClientRect().width);
        const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }; };
        const detail = root.querySelector('.twm-dt-detail-row');
        return {
            heads,
            rows: data.slice(0, 8).map((tr) => ({ ...r(tr), text: tr.children[0].textContent, bg: getComputedStyle(tr).backgroundColor })),
            detail: detail ? { ...r(detail), prev: detail.previousElementSibling.children[0].textContent,
                               cursor: getComputedStyle(detail.firstElementChild).cursor,
                               ws: getComputedStyle(detail.firstElementChild).whiteSpace } : null,
            table: r(root.querySelector('.twm-preview-table-wrap table')),
        };
    })()`);
    const before = await geom();
    // A row with no detail (every fifth) keeps the toggle's room: the text
    // of its first cell starts where the others' does.
    const align = await page.evaluate(`(() => {
        const rows = [...document.querySelectorAll('${FIRST} tbody > tr')].filter((tr) => tr.__rowIndex !== undefined);
        const textLeft = (tr) => { const r = document.createRange(); const td = tr.children[0];
            const node = [...td.childNodes].find((n) => n.nodeType === 3); r.selectNodeContents(node); return r.getBoundingClientRect().left; };
        const without = rows.find((tr) => !tr.querySelector('.twm-dt-detail-toggle'));
        const withOne = rows.find((tr) => tr.querySelector('.twm-dt-detail-toggle'));
        return { without: textLeft(without), with: textLeft(withOne) };
    })()`);
    check('a row with no detail lines its text up with the rows that have one', near(align.without, align.with, 0.5), JSON.stringify(align));
    const toggleSel = `${FIRST} tbody tr:nth-child(2) .twm-dt-detail-toggle`;
    const t = await centre(page, toggleSel);
    check('the second row\'s toggle is drawn and on top at its centre', t && t.w > 0 && t.hit, JSON.stringify(t));
    await click(page, t.x, t.y);
    await sleep(150);
    const after = await geom();
    check('a real press opened a detail with a height', after.detail && after.detail.height > 40, JSON.stringify(after.detail));
    check('…directly under its row', after.detail && near(after.detail.top, after.rows[1].bottom), `${after.detail?.top} vs ${after.rows[1].bottom}`);
    check('…across the whole table', after.detail && near(after.detail.width, after.table.width, 2), `${after.detail?.width} vs ${after.table.width}`);
    check('the columns did not move for a wide detail', JSON.stringify(after.heads.map(Math.round)) === JSON.stringify(before.heads.map(Math.round)),
          `${before.heads.map(Math.round)} -> ${after.heads.map(Math.round)}`);
    check('the row after it moved down by the detail\'s height', near(after.rows[2].top - before.rows[2].top, after.detail.height, 1.5),
          `${after.rows[2].top - before.rows[2].top} vs ${after.detail.height}`);
    check('the stripes keep their order', JSON.stringify(after.rows.map((r) => r.bg)) === JSON.stringify(before.rows.map((r) => r.bg)),
          JSON.stringify([before.rows.map((r) => r.bg), after.rows.map((r) => r.bg)]));
    check('the detail is not a thing to press, and wraps', after.detail.cursor === 'auto' && after.detail.ws === 'normal',
          `${after.detail.cursor} ${after.detail.ws}`);
    check('the press neither selected nor opened the row',
          await page.evaluate(`window.probe.log.getSelection().length === 0 && !document.getElementById('status').textContent`));
    await page.screenshot(join(OUT, 'detail-open.png'));
    // Keyboard: the toggle has focus after the press; Enter closes it.
    await page.evaluate(`document.querySelector(${JSON.stringify(toggleSel)}).focus()`);
    await key(page, 'Enter');
    await sleep(100);
    check('Enter on the focused toggle closes it', await page.evaluate(`!document.querySelector('${FIRST} .twm-dt-detail-row')`));
    // ArrowRight on the focused table opens the selected row's detail.
    const r4 = await centre(page, `${FIRST} tbody tr:nth-child(4) td:nth-child(3)`);
    await click(page, r4.x, r4.y);
    await sleep(80);
    await key(page, 'ArrowRight');
    await sleep(120);
    check('ArrowRight on the focused table opens the selected row\'s detail',
          await page.evaluate(`document.querySelector('${FIRST} .twm-dt-detail-row')?.previousElementSibling === document.querySelector('${FIRST} tbody tr.selected')`));
    await key(page, 'ArrowLeft');
    await sleep(80);
    check('ArrowLeft closes it', await page.evaluate(`!document.querySelector('${FIRST} .twm-dt-detail-row')`));
    // Chips: counts, and a real press filters through the server.
    const counts = await page.evaluate(`[...document.querySelectorAll('${FIRST} .twm-dt-filter-chip')].map((b) => [b.dataset.value, b.querySelector('.twm-dt-filter-chip__count').textContent])`);
    check('the Level chips carry the server\'s counts', counts.every(([, n]) => /^\d+$/.test(n)) && counts[0][1] === '240', JSON.stringify(counts));
    const warn = await centre(page, `${FIRST} .twm-dt-filter-chip[data-value="warn"]`);
    check('the Warn chip is drawn and on top', warn && warn.hit, JSON.stringify(warn));
    await click(page, warn.x, warn.y);
    await page.waitFor(`window.probe.log.getQuery()?.filters?.[0]?.value === 'warn' && !document.querySelector('${FIRST} .twm-data-table__loading')`);
    await sleep(100);
    const levels = await page.evaluate(`[...document.querySelectorAll('${FIRST} tbody tr')].filter((tr) => tr.__rowIndex !== undefined).map((tr) => tr.children[1].textContent)`);
    check('a real press on Warn: the server\'s warn rows', levels.length > 0 && levels.every((l) => l === 'warn'), JSON.stringify(levels.slice(0, 5)));
    check('…and Warn is pressed', await page.evaluate(`document.querySelector('${FIRST} .twm-dt-filter-chip[data-value="warn"]').getAttribute('aria-pressed') === 'true'`));
    await page.screenshot(join(OUT, 'detail-chips.png'));

    // ── virtual ──────────────────────────────────────────────────────────
    console.log('\nvirtual');
    const SECOND = '.demo__box:nth-child(2)';
    const vt = await page.evaluate(`(() => {
        const t = window.probe.virtual;
        const wrap = t.scrollElement;
        const h0 = wrap.scrollHeight;
        t.setRowExpanded('e4996', true);     // the 5th row (newest first)
        return { h0 };
    })()`);
    await sleep(200);
    const v1 = await page.evaluate(`(() => {
        const root = document.querySelector('${SECOND}');
        const t = window.probe.virtual;
        const wrap = t.scrollElement;
        const d = root.querySelector('.twm-dt-detail-row');
        const next = d?.nextElementSibling?.nextElementSibling;
        return { h1: wrap.scrollHeight, dh: d?.getBoundingClientRect().height, dBottom: d?.getBoundingClientRect().bottom,
                 nextTop: next?.getBoundingClientRect().top, measured: t._detailHeights.get('e4996') };
    })()`);
    check('the open detail was measured', v1.measured > 40 && near(v1.measured, v1.dh, 1), JSON.stringify(v1));
    check('the scroll height grew by the detail\'s height', near(v1.h1 - vt.h0, v1.dh, 2), `${v1.h1 - vt.h0} vs ${v1.dh}`);
    check('the row after it starts where the detail ends', near(v1.nextTop, v1.dBottom, 1), `${v1.nextTop} vs ${v1.dBottom}`);
    const vbox = await centre(page, `${SECOND} .twm-preview-table-wrap`);
    for (let i = 0; i < 6; i++) await wheel(page, vbox.x, vbox.y, 2000);
    await sleep(250);
    check('scrolled away: the detail left the window', await page.evaluate(`!document.querySelector('${SECOND} .twm-dt-detail-row') && window.probe.virtual.scrollElement.scrollTop > 5000`));
    for (let i = 0; i < 8; i++) await wheel(page, vbox.x, vbox.y, -3000);
    await sleep(250);
    const v2 = await page.evaluate(`(() => {
        const d = document.querySelector('${SECOND} .twm-dt-detail-row');
        return d ? { prev: d.previousElementSibling.__rowKey ?? null, top: d.getBoundingClientRect().top, rowBottom: d.previousElementSibling.getBoundingClientRect().bottom } : null;
    })()`);
    check('scrolled back: it is there again, under its row', v2 && near(v2.top, v2.rowBottom, 1), JSON.stringify(v2));
    await page.screenshot(join(OUT, 'virtual-detail.png'));
    page.close();

    // ── pager ────────────────────────────────────────────────────────────
    console.log('\npager');
    page = await openPage(browser.debugPort, url('pager'));
    await page.waitFor('window.probe?.ready && document.querySelector(".demo__box .twm-pagination-controls")');
    await sleep(250);
    const P = '.demo__box:nth-child(1)';
    const pg = await page.evaluate(`(() => {
        const root = document.querySelector('${P}');
        const pager = root.querySelector('.twm-pagination-controls');
        const wrap = root.querySelector('.twm-preview-table-wrap');
        return { pagerTop: pager.getBoundingClientRect().top, wrapBottom: wrap.getBoundingClientRect().bottom,
                 info: pager.querySelector('.twm-pagination-info').textContent,
                 words: [...pager.querySelectorAll('.twm-pagination-btn__label')].map((s) => s.textContent),
                 oldest: { disabled: pager.querySelector('[data-pager="last"]').disabled, why: pager.querySelector('[data-pager="last"]').dataset.refusal } };
    })()`);
    check('the pager sits under the rows', pg.pagerTop >= pg.wrapBottom - 0.5, `${pg.pagerTop} vs ${pg.wrapBottom}`);
    check('its words', JSON.stringify(pg.words) === JSON.stringify(['Newest', 'Newer', 'Older', 'Oldest']), JSON.stringify(pg.words));
    check('no total: "Rows 1–100", no "of"', pg.info === 'Rows 1–100', pg.info);
    check('Oldest refused, and says why', pg.oldest.disabled && pg.oldest.why === 'No total, so no last page.', JSON.stringify(pg.oldest));
    for (const name of ['first', 'prev', 'next', 'last']) {
        const c = await centre(page, `${P} [data-pager="${name}"]`);
        check(`${name} is drawn and on top at its centre`, c && c.w > 20 && c.hit, JSON.stringify(c));
    }
    for (let i = 0; i < 2; i++) {
        const older = await centre(page, `${P} [data-pager="next"]`);
        await click(page, older.x, older.y);
        await page.waitFor(`!document.querySelector('${P} .twm-data-table__loading')`);
        await sleep(120);
    }
    const p3 = await page.evaluate(`(() => { const p = document.querySelector('${P} .twm-pagination-controls');
        return { info: p.querySelector('.twm-pagination-info').textContent, page: p.querySelector('.twm-pagination-page').textContent,
                 older: p.querySelector('[data-pager="next"]').disabled }; })()`);
    check('two real presses on Older: a short third page', p3.info === 'Rows 201–250' && p3.page === 'Page 3', JSON.stringify(p3));
    check('…and Older is now disabled', p3.older);
    await page.screenshot(join(OUT, 'pager-unknown-total.png'));
    const D = '.demo__box:nth-child(2)';
    const deep = await page.evaluate(`(() => { const b = document.querySelector('${D} [data-pager="last"]');
        return { disabled: b.disabled, why: b.dataset.refusal, title: b.title,
                 info: document.querySelector('${D} .twm-pagination-info').textContent,
                 // The words in the BROWSER's locale (the table writes them with toLocaleString).
                 max: (50000).toLocaleString(), total: (1000000).toLocaleString() }; })()`);
    check('a known total past the bound: Oldest refused, and says why',
          deep.disabled && deep.why === `Past ${deep.max} rows. Narrow the filters first.` && deep.title === deep.why, JSON.stringify(deep));
    check('…with the 0.6 words for a known total', deep.info === `Rows 1–100 of ${deep.total}`, deep.info);
    const box = await centre(page, `${D} .twm-pagination-input`);
    await click(page, box.x, box.y);
    await type(page, '60001');
    const asked = await page.evaluate(`window.probe.deep.getQuery().offset`);
    const go = await centre(page, `${D} [data-pager="go"]`);
    await click(page, go.x, go.y);
    await sleep(150);
    const jump = await page.evaluate(`(() => { const i = document.querySelector('${D} .twm-pagination-input');
        return { invalid: i.getAttribute('aria-invalid'), why: i.dataset.refusal, offset: window.probe.deep.getQuery().offset }; })()`);
    check('a real jump past the bound asks nothing and says why',
          jump.invalid === 'true' && jump.why === `Past ${deep.max} rows. Narrow the filters first.` && jump.offset === asked, JSON.stringify(jump));
    await page.screenshot(join(OUT, 'pager-refusals.png'));
    page.close();

    // ── follow ───────────────────────────────────────────────────────────
    console.log('\nfollow');
    page = await openPage(browser.debugPort, url('follow'));
    await page.waitFor('window.probe?.ready && document.querySelectorAll(".demo__box tbody tr").length > 20');
    await sleep(250);
    const F = '.demo__box:nth-child(1)';
    // At the top: arrivals are shown, marked new.
    await page.evaluate('window.probe.feed.grow(3)');
    await page.waitFor(`document.querySelectorAll('${F} tr.twm-dt-row--new').length === 3`, 3000);
    const top = await page.evaluate(`(() => { const t = window.probe.follow;
        return { scrollTop: t.scrollElement.scrollTop, first: t.config.rows[0][0] === document.querySelector('${F} tbody tr').children[0].textContent || true,
                 newKeys: [...document.querySelectorAll('${F} tr.twm-dt-row--new')].map((tr) => tr.__rowKey) }; })()`);
    check('at the top: the three arrivals are shown, marked new', top.scrollTop === 0 && top.newKeys.join() === 'e303,e302,e301', JSON.stringify(top));
    // Select a row and open a detail, by real presses.
    const sel = await centre(page, `${F} tbody tr:nth-child(12) td:nth-child(3)`);
    await click(page, sel.x, sel.y);
    await page.evaluate(`window.probe.follow.setRowExpanded('e291', true)`);
    // Scrolled down by a real wheel: the row being read stays where it is.
    const fb = await centre(page, `${F} .twm-preview-table-wrap`);
    await wheel(page, fb.x, fb.y, 300);
    await sleep(200);
    const reading = await page.evaluate(`(() => { const t = window.probe.follow; const wrap = t.scrollElement;
        const top = wrap.getBoundingClientRect().top;
        const tr = [...wrap.querySelectorAll('tbody > tr')].find((r) => r.__rowIndex !== undefined && r.getBoundingClientRect().bottom > top + 0.5);
        return { key: tr.__rowKey, at: tr.getBoundingClientRect().top - top, scrollTop: wrap.scrollTop,
                 selected: t.getSelection().map((i) => t._rowKey(t.config.rows[i], i)) }; })()`);
    check('a real wheel scrolled the body', reading.scrollTop > 100, JSON.stringify(reading));
    await page.evaluate('window.probe.feed.grow(5)');
    await page.waitFor(`document.querySelectorAll('${F} tr.twm-dt-row--new').length === 5`, 3000);
    await sleep(50);
    const kept = await page.evaluate(`(() => { const t = window.probe.follow; const wrap = t.scrollElement;
        const top = wrap.getBoundingClientRect().top;
        const tr = [...wrap.querySelectorAll('tbody > tr')].find((r) => r.__rowKey === ${JSON.stringify(reading.key)});
        const d = wrap.querySelector('.twm-dt-detail-row');
        return { at: tr.getBoundingClientRect().top - top, scrollTop: wrap.scrollTop,
                 selected: t.getSelection().map((i) => t._rowKey(t.config.rows[i], i)),
                 detailUnder: d?.previousElementSibling?.__rowKey }; })()`);
    check('five arrived above: the row being read is where it was', near(kept.at, reading.at, 1), `${reading.at} -> ${kept.at}`);
    check('…because the scroll moved instead', kept.scrollTop > reading.scrollTop + 50, `${reading.scrollTop} -> ${kept.scrollTop}`);
    check('the selection is the same row', JSON.stringify(kept.selected) === JSON.stringify(reading.selected), JSON.stringify([reading.selected, kept.selected]));
    check('the open detail is still under its row', kept.detailUnder === 'e291', String(kept.detailUnder));
    await page.screenshot(join(OUT, 'follow-kept.png'));
    const older = await centre(page, `${F} [data-pager="next"]`);
    await click(page, older.x, older.y);
    await sleep(300);
    const off = await page.evaluate(`({ following: window.probe.follow.isFollowing(), status: document.getElementById('status').textContent })`);
    check('a real press on Older turns following off, and says so', !off.following && off.status === 'following: false', JSON.stringify(off));
    page.close();
} finally {
    await browser.close();
    await server.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
console.log(`screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
