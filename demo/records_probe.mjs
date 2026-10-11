/**
 * RECORD LISTS AND FACT SHEETS IN A REAL BROWSER (0.7.0) — what jsdom cannot
 * see, settled in headless Edge with real input over the DevTools protocol.
 *
 *   boxes    no list, record, sheet or row has zero height; nothing is wider
 *            than its card (no horizontal overflow)
 *   wrap     a long fact line wraps onto several lines inside its record; a
 *            long value, a connection string and a JSON value wrap inside the
 *            sheet's value column while the label stays on one line;
 *            `facts: 'ellipsis'` keeps one line and clips
 *   verbs    `elementFromPoint` at each verb's centre returns that verb, a
 *            refused one included; a real press on an enabled verb runs it
 *            and does not open the record; a refusal line is drawn with a
 *            height and in the warning colour; a switched-off record dims
 *            its words and not its verbs
 *   open     a real press on a record's name opens it and moves the accent
 *            edge; real Tab, ArrowDown and Enter open the next record
 *   narrow   at 300px the verbs go under the record's words, inside the card,
 *            and are still clickable at their centres
 *
 *     node demo/records_probe.mjs [out-dir]      (a node with a global WebSocket)
 *     FLOW_DIST=1 node demo/records_probe.mjs [out-dir]   (the built dist/)
 *
 * Prints one line per check, exits 1 on any failure, and writes screenshots
 * to out-dir.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, key, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'records-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In the page: the number of rendered lines of an element's text. */
const LINES = `window.__lines = (el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
    return tops.size;
};`;

async function shot(page, file) {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
    console.log(`  (screenshot ${join(OUT, file)})`);
}

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1400, height: 1100 });
try {
    const page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/records.html`);
    await page.waitFor('window.ready === true');
    await page.evaluate(LINES);
    await sleep(150);
    await shot(page, 'records-wide.png');

    console.log('\nboxes');
    const boxes = await page.evaluate(`(() => {
        const h = (el) => Math.round(el.getBoundingClientRect().height);
        const out = { zero: [], overflow: [] };
        for (const el of document.querySelectorAll('.twm-record-list, .twm-record, .twm-facts, .twm-facts tr, .twm-record-list__empty')) {
            if (h(el) === 0) out.zero.push(el.className || el.tagName);
        }
        for (const card of document.querySelectorAll('.demo__card')) {
            if (card.scrollWidth > card.clientWidth + 1) out.overflow.push(card.id + ':' + card.scrollWidth + '>' + card.clientWidth);
        }
        out.records = document.querySelectorAll('.twm-record').length;
        out.rows = document.querySelectorAll('.twm-facts tbody tr').length;
        return out;
    })()`);
    check(`no record list, record, sheet or row has zero height (${boxes.records} records, ${boxes.rows} rows)`,
          boxes.zero.length === 0 && boxes.records === 7 && boxes.rows === 15, JSON.stringify(boxes.zero));
    check('no card overflows sideways', boxes.overflow.length === 0, JSON.stringify(boxes.overflow));

    console.log('\nwrap');
    const wrap = await page.evaluate(`(() => {
        const rec = (list, key) => document.querySelector(list + ' .twm-record[data-record-key="' + key + '"]');
        const k1 = rec('#keys', 'k1');
        const d1 = rec('#narrow', 'd1');
        const row = (sheet, label) => [...document.querySelectorAll(sheet + ' tbody tr')].find((tr) => tr.cells[0].textContent === label);
        const conn = row('#facts', 'Connection string');
        const opts = row('#facts', 'Options');
        const note = row('#facts', 'Note');
        const desc = row('#compare', 'Description');
        const clip = document.querySelector('#clip .twm-record__facts');
        const inside = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5; };
        return {
            k1Facts: __lines(k1.querySelector('.twm-record__facts')),
            k1Inside: inside(k1.querySelector('.twm-record__facts'), k1),
            d1Facts: __lines(d1.querySelector('.twm-record__facts')),
            d1Inside: inside(d1, document.getElementById('narrow-card')),
            connValue: __lines(conn.cells[1]), connLabel: __lines(conn.cells[0]),
            connInside: inside(conn.cells[1], document.getElementById('facts-card')),
            optsValue: __lines(opts.cells[1]),
            noteValue: __lines(note.cells[1]),
            descAfter: __lines(desc.cells[3]), descLabel: __lines(desc.cells[0]),
            arrow: desc.cells[2].textContent,
            clipLines: __lines(clip), clipCut: clip.scrollWidth > clip.clientWidth, clipTitle: clip.title,
            facts: getComputedStyle(conn.cells[1]).whiteSpace + ' ' + getComputedStyle(conn.cells[1]).overflowWrap,
        };
    })()`);
    check(`a long fact line wraps inside its record (${wrap.k1Facts} lines at 620px)`, wrap.k1Facts >= 2 && wrap.k1Inside, JSON.stringify(wrap));
    check(`a long URL in a fact wraps inside a 360px card (${wrap.d1Facts} lines)`, wrap.d1Facts >= 3 && wrap.d1Inside);
    check(`the connection string wraps inside the value column (${wrap.connValue} lines) and its label stays on one`,
          wrap.connValue >= 2 && wrap.connLabel === 1 && wrap.connInside);
    check(`a JSON value keeps its line breaks (${wrap.optsValue} lines)`, wrap.optsValue >= 7);
    check(`a long sentence wraps, never an ellipsis (${wrap.noteValue} lines; ${wrap.facts})`,
          wrap.noteValue >= 2 && wrap.facts === 'pre-wrap anywhere');
    check(`a before/after value wraps beside its arrow (${wrap.descAfter} lines, label ${wrap.descLabel})`,
          wrap.descAfter >= 2 && wrap.descLabel === 1 && wrap.arrow === '→');
    check('facts: "ellipsis" keeps one line, clipped, with the whole line on its title',
          wrap.clipLines === 1 && wrap.clipCut && wrap.clipTitle.startsWith('Held through Finance'), JSON.stringify(wrap));

    console.log('\nverbs');
    const verbs = await page.evaluate(`[...document.querySelectorAll('.twm-record__verb')].map((b, i) => {
        b.dataset.probe = String(i);
        return { i, label: b.textContent, disabled: b.disabled, key: b.closest('.twm-record').dataset.recordKey };
    })`);
    const hits = [];
    for (const v of verbs) {
        const c = await centre(page, `.twm-record__verb[data-probe="${v.i}"]`);
        hits.push({ ...v, hit: c.hit, w: Math.round(c.w), h: Math.round(c.h) });
    }
    check(`every verb (${hits.length}, ${hits.filter((h) => h.disabled).length} refused) is what elementFromPoint finds at its centre`,
          hits.length === 7 && hits.every((h) => h.hit && h.w > 0 && h.h > 0), JSON.stringify(hits.filter((h) => !h.hit)));
    const pause = hits.find((h) => h.label === 'Pause' && h.key === 'k1');
    let c = await centre(page, `.twm-record__verb[data-probe="${pause.i}"]`);
    await click(page, c.x, c.y);
    await sleep(50);
    let events = await page.evaluate('window.events.slice()');
    check('a real press on Pause runs it, and does not open the record', JSON.stringify(events) === '["verb Pause k1"]', JSON.stringify(events));
    const replay = hits.find((h) => h.label === 'Replay');
    c = await centre(page, `.twm-record__verb[data-probe="${replay.i}"]`);
    await click(page, c.x, c.y);
    await sleep(50);
    events = await page.evaluate('window.events.slice()');
    check('a real press on Replay (360px card) runs it', events.at(-1) === 'verb Replay d1', JSON.stringify(events));
    const revoked = hits.find((h) => h.label === 'Revoke' && h.key === 'k3');
    c = await centre(page, `.twm-record__verb[data-probe="${revoked.i}"]`);
    await click(page, c.x, c.y);
    await sleep(50);
    const after = await page.evaluate('window.events.length');
    check('a real press on a refused verb runs nothing and opens nothing', after === events.length);
    const refusal = await page.evaluate(`(() => {
        const k3 = document.querySelector('#keys .twm-record[data-record-key="k3"]');
        const line = k3.querySelector('.twm-record__refusal');
        const r = line.getBoundingClientRect();
        return { text: line.textContent, h: r.height, color: getComputedStyle(line).color,
                 main: getComputedStyle(k3.querySelector('.twm-record__main')).opacity,
                 verbs: getComputedStyle(k3.querySelector('.twm-record__verbs')).opacity,
                 described: k3.querySelector('.twm-record__verb').getAttribute('aria-describedby') === line.id };
    })()`);
    check(`the refusal is a visible line in the warning colour ("${refusal.text}", ${Math.round(refusal.h)}px, ${refusal.color})`,
          refusal.h > 0 && refusal.color === 'rgb(255, 152, 0)' && refusal.described && refusal.text.startsWith('This key is revoked'));
    check(`a switched-off record dims its words (${refusal.main}) and not its verbs (${refusal.verbs})`,
          refusal.main === '0.55' && refusal.verbs === '1');

    console.log('\nopen');
    c = await centre(page, '#keys .twm-record[data-record-key="k2"] .twm-record__name');
    await click(page, c.x, c.y);
    await sleep(50);
    const open = await page.evaluate(`({ last: window.events.at(-1),
        active: [...document.querySelectorAll('#keys .twm-record--active')].map((li) => li.dataset.recordKey),
        edge: getComputedStyle(document.querySelector('#keys .twm-record--active')).boxShadow })`);
    check(`a real press on a record's name opens it and moves the accent edge (${open.edge})`,
          open.last === 'open k2' && JSON.stringify(open.active) === '["k2"]' && /0, 122, 204/.test(open.edge), JSON.stringify(open));
    // Tab from a button before the list: the records are ONE tab stop (the
    // open one, k2), and each enabled verb keeps its own — so Tab passes
    // k1's two verbs, then lands on k2.
    await page.evaluate("document.getElementById('start').focus()");
    const path = [];
    for (let i = 0; i < 6; i += 1) {
        await key(page, 'Tab');
        const at = await page.evaluate(`(() => { const a = document.activeElement;
            return a.classList.contains('twm-record') ? 'record ' + a.dataset.recordKey
                : (a.dataset.verb || a.tagName) + ' of ' + (a.closest('.twm-record')?.dataset.recordKey || '-'); })()`);
        path.push(at);
        if (at.startsWith('record')) break;
    }
    await key(page, 'ArrowDown');
    const focused2 = await page.evaluate('document.activeElement.dataset.recordKey || document.activeElement.tagName');
    await key(page, 'Enter');
    await sleep(50);
    const last = await page.evaluate('window.events.at(-1)');
    check(`real Tab: ${path.join(' → ')}; ArrowDown moves to ${focused2}; Enter opens (${last})`,
          JSON.stringify(path) === '["Pause of k1","Revoke of k1","record k2"]' && focused2 === 'k3' && last === 'open k3');
    await key(page, 'Tab');
    const tabbedOn = await page.evaluate(`(() => { const a = document.activeElement;
        return a.classList.contains('twm-record') ? 'record ' + a.dataset.recordKey : (a.dataset.verb || a.tagName); })()`);
    check(`no second record is a tab stop: Tab from k3 goes on to the next list's (${tabbedOn})`,
          !tabbedOn.startsWith('record k'), tabbedOn);
    await shot(page, 'records-after-input.png');

    console.log('\nnarrow');
    await page.evaluate("document.getElementById('keys-card').style.width = '300px'");
    await sleep(100);
    const narrow = await page.evaluate(`(() => {
        const k1 = document.querySelector('#keys .twm-record[data-record-key="k1"]');
        const m = k1.querySelector('.twm-record__main').getBoundingClientRect();
        const v = k1.querySelector('.twm-record__verbs').getBoundingClientRect();
        const card = document.getElementById('keys-card');
        const cr = card.getBoundingClientRect();
        return { under: v.top >= m.bottom - 1, mainW: Math.round(m.width), right: v.right <= cr.right + 0.5,
                 overflow: card.scrollWidth > card.clientWidth + 1 };
    })()`);
    check(`at 300px the verbs go under the words (main ${narrow.mainW}px wide), inside the card`,
          narrow.under && narrow.right && !narrow.overflow && narrow.mainW > 150, JSON.stringify(narrow));
    const narrowHits = [];
    for (const v of verbs.filter((x) => ['k1', 'k2', 'k3'].includes(x.key))) {
        narrowHits.push((await centre(page, `.twm-record__verb[data-probe="${v.i}"]`)).hit);
    }
    check('…and every verb there is still found at its centre', narrowHits.length === 6 && narrowHits.every(Boolean));
    await shot(page, 'records-narrow.png');
} finally {
    await browser.close();
    await server.close();
}

console.log(failures ? `\nrecords probe: ${failures} check(s) FAILED` : '\nrecords probe: all checks passed');
process.exit(failures ? 1 : 0);
