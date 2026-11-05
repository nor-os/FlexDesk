/**
 * THE GIT PANEL, GRAPH AND DIFF VIEWER IN A REAL BROWSER (0.18.0) — what jsdom
 * cannot see, settled in headless Edge with real input.
 *
 *   boxes    the panel's parts and the graph's rows have height; a graph row is
 *            22 pixels; every gutter in a graph is the same width
 *   lanes    the edges and nodes take their colour from the lane tokens; a lane
 *            passing through a row is drawn from its top to its bottom
 *   list     a file's actions appear on hover and press at their centres; the
 *            press stages the file and does not open its diff
 *   menu     a real press on the branch opens its menu, inside the window
 *   typing   what is in the commit box survives a status change
 *   diff     the viewer's views switch on a real press; the lines' numbers line
 *            up; a long line scrolls rather than wraps
 *   window   a press on a file opens the diff window, which shows the diff and
 *            scrolls inside itself
 *
 *     node demo/git_probe.mjs [out-dir]            (a node with a global WebSocket)
 *     FLOW_DIST=1 node demo/git_probe.mjs [out-dir]   (the built dist/)
 *
 * Prints one line per check, exits 1 on any failure, writes screenshots to out-dir.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'git-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, file) {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
    console.log(`  (screenshot ${join(OUT, file)})`);
}

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1300, height: 800 });
try {
    const page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/git.html`);
    await page.waitFor('window.ready === true');
    await sleep(200);
    await shot(page, 'git-wide.png');

    console.log('\nboxes');
    const boxes = await page.evaluate(`(() => {
        const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height);
        const rows = [...document.querySelectorAll('#graph .twm-git-graph__row')];
        return {
            bar: h('.twm-git-panel__bar'), box: h('.twm-git-panel__commit-box'), file: h('.twm-git-panel__file'),
            rows: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
            widths: [...new Set(rows.map((r) => r.querySelector('svg').getBoundingClientRect().width))],
        };
    })()`);
    check('the bar, the commit box and a file have height', boxes.bar > 20 && boxes.box > 20 && boxes.file > 14, JSON.stringify(boxes));
    check('every graph row is 22 pixels', boxes.rows.length === 8 && boxes.rows.every((r) => r === 22), JSON.stringify(boxes.rows));
    check('every gutter is the same width', boxes.widths.length === 1, JSON.stringify(boxes.widths));

    console.log('\nlanes');
    const lanes = await page.evaluate(`(() => {
        const token = (name) => {
            const probe = document.createElement('div');
            probe.style.color = 'var(' + name + ')';
            document.body.appendChild(probe);
            const c = getComputedStyle(probe).color;
            probe.remove();
            return c;
        };
        const rows = [...document.querySelectorAll('#graph .twm-git-graph__row')];
        const edge = rows[0].querySelector('.twm-git-lane--1');
        const node = rows[0].querySelector('circle');
        const passing = [...rows[1].querySelectorAll('.twm-git-graph__edge')].map((e) => e.getAttribute('d'));
        return {
            edgeStroke: getComputedStyle(edge).stroke, lane1: token('--twm-git-lane-1'),
            nodeFill: getComputedStyle(node).fill, surface: token('--surface-0'),
            edgeFill: getComputedStyle(edge).fill, passing,
        };
    })()`);
    check('an edge reads its lane token', lanes.edgeStroke === lanes.lane1, JSON.stringify(lanes));
    check('a node is filled with the surface', lanes.nodeFill === lanes.surface, JSON.stringify(lanes));
    check('an edge is not filled', lanes.edgeFill === 'none', lanes.edgeFill);
    check('a lane passing through runs top to bottom', lanes.passing.some((d) => /^M16\.5,0 L16\.5,22$/.test(d)), JSON.stringify(lanes.passing));

    console.log('\nlist');
    const rect = await centre(page, '.twm-git-panel__file');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await sleep(50);
    const stage = await page.evaluate(`(() => {
        const row = document.querySelector('.twm-git-panel__file');
        const b = row.querySelector('[aria-label="Stage"]');
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x, y, shown: r.width > 0, hit: document.elementFromPoint(x, y).closest('button') === b };
    })()`);
    check('hovering a file shows its actions, on top', stage.shown && stage.hit, JSON.stringify(stage));
    await click(page, stage.x, stage.y);
    await sleep(100);
    const after = await page.evaluate(`({
        staged: window.adapter.status().files[0].staged,
        windowOpen: !!document.querySelector('.twm-diff-window'),
        unstage: !!document.querySelector('.twm-git-panel__file [aria-label="Unstage"]'),
    })`);
    check('a real press stages the file', after.staged && after.unstage, JSON.stringify(after));
    check('and does not open its diff', !after.windowOpen);

    console.log('\nmenu');
    const branch = await centre(page, '.twm-git-panel__branch');
    await click(page, branch.x, branch.y);
    await sleep(100);
    const menu = await page.evaluate(`(() => {
        const m = [...document.querySelectorAll('.twm-action-dropdown-menu')].find((x) => !x.hidden);
        if (!m) return null;
        const r = m.getBoundingClientRect();
        return { labels: [...m.querySelectorAll('.twm-option-label')].map((o) => o.textContent), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    })()`);
    check('a press on the branch opens its menu, inside the window', menu?.inside && menu.labels.includes('feature/layout'), JSON.stringify(menu));
    await shot(page, 'git-branch-menu.png');
    await click(page, 900, 700);
    await sleep(50);

    console.log('\ntyping');
    await page.evaluate(`(async () => {
        const box = document.querySelector('.twm-git-panel__commit-box');
        box.value = 'half a thought';
        window.adapter.status = () => ({ ok: true, branch: 'main', files: [], ahead: 5, behind: 0, hasUpstream: true });
        await window.panel.refresh();
    })()`);
    await sleep(50);
    const typed = await page.evaluate(`({ value: document.querySelector('.twm-git-panel__commit-box').value,
        badge: document.querySelector('.twm-git-panel__badge').textContent })`);
    check('the commit box survives a status change', typed.value === 'half a thought' && typed.badge === '↑5', JSON.stringify(typed));

    console.log('\ndiff');
    const views = await page.evaluate(`[...document.querySelectorAll('#diff .twm-diff__view')].map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, pressed: b.getAttribute('aria-pressed') };
    })`);
    check('three views, Fields pressed first', views.map((v) => v.label).join() === 'Fields,Text,Raw' && views[0].pressed === 'true', JSON.stringify(views));
    await shot(page, 'git-diff-fields.png');
    await click(page, views[1].x, views[1].y);
    await sleep(50);
    const text = await page.evaluate(`(() => {
        const rows = [...document.querySelectorAll('#diff .twm-diff__line')].filter((r) => r.querySelector('.twm-diff__text'));
        const texts = rows.map((r) => Math.round(r.querySelector('.twm-diff__text').getBoundingClientRect().left));
        return { count: rows.length, gap: !!document.querySelector('#diff .twm-diff__line--gap'), lefts: [...new Set(texts)], heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))] };
    })()`);
    check('a real press shows Text, with a gap', text.count > 4 && text.gap, JSON.stringify(text));
    check('every line starts at the same x and is one line high', text.lefts.length === 1 && text.heights.length === 1, JSON.stringify(text));
    await shot(page, 'git-diff-text.png');
    await page.evaluate(`window.viewer.update({ before: 'x', after: 'y'.repeat(2000) })`);
    await sleep(50);
    const longLine = await page.evaluate(`(() => {
        const body = document.querySelector('#diff .twm-diff__body');
        const row = document.querySelector('#diff .twm-diff__line--add');
        return { scrolls: body.scrollWidth > body.clientWidth, height: Math.round(row.getBoundingClientRect().height), filled: row.getBoundingClientRect().width > body.clientWidth };
    })()`);
    check('a long line scrolls and its colour runs with it', longLine.scrolls && longLine.height === 19 && longLine.filled, JSON.stringify(longLine));

    console.log('\nwindow');
    await page.evaluate(`(async () => {
        window.adapter.status = () => ({ ok: true, branch: 'main', files: [{ path: 'src/long.txt', status: 'M', staged: false }], ahead: 0, behind: 0, hasUpstream: true });
        window.adapter.diffFile = () => ({ ok: true, before: '', after: Array.from({ length: 200 }, (_, i) => 'line ' + i).join('\\n') });
        await window.panel.refresh();
    })()`);
    await sleep(50);
    const file = await centre(page, '.twm-git-panel__file-name');
    await click(page, file.x, file.y);
    await sleep(200);
    const win = await page.evaluate(`(() => {
        const w = document.querySelector('.twm-diff-window');
        if (!w) return null;
        const b = w.querySelector('.twm-diff__body');
        const r = w.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), rows: w.querySelectorAll('.twm-diff__line').length,
            scrolls: b.scrollHeight > b.clientHeight, bodyH: Math.round(b.getBoundingClientRect().height) };
    })()`);
    check('a press on a file opens the diff window, drawing the diff', win?.rows === 200, JSON.stringify(win));
    check('and it scrolls inside itself', win?.scrolls && win.bodyH > 100, JSON.stringify(win));
    await shot(page, 'git-diff-window.png');
} finally {
    await browser.close?.();
    server.close?.();
}

console.log(failures === 0 ? '\ngit probe: OK' : `\ngit probe: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
