/**
 * THE CANVAS EDITOR IN A REAL BROWSER (36 §8) — what jsdom cannot see,
 * settled in headless Edge with real input over the DevTools protocol.
 *
 *   layout     `elementFromPoint` at each primary control's centre returns
 *              that control (Undo, Arrange, Fit, the consumer's Run, a palette
 *              item, a node's header, a port, the panel's name box and its
 *              first field); the panel is not covered; the canvas has a size
 *   anchors    the stylesheet draws the box the edges are anchored by: each
 *              line STARTS at its output port's dot and ENDS at its input
 *              port's dot, measured (getScreenCTM over getPointAtLength)
 *   return     the loop's return line runs below both of its steps, dashed
 *   drag       a REAL pointer drag from the palette onto the canvas adds
 *              exactly ONE step where it is dropped, with a `dragstart`
 *              counter that stays at 0 and no ghost left behind; a drag that
 *              ends off the canvas adds nothing
 *   connect    a real click on an output, then on an input, draws one line
 *   move       a real drag of a node's header moves it by the pointer's
 *              travel, snapped; a real Ctrl+Z puts it back; a real Backspace
 *              removes nothing; a real Delete removes the picked step
 *   narrow     at 700px the canvas takes the editor's whole width (the
 *              container query)
 *
 *     node demo/flow_canvas_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to
 * out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, drag, key, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-canvas-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1500, height: 900 });
let page;
try {
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_canvas.html`);
    await page.waitFor('window.__flowCanvas && window.__flowCanvas.ready');
    await sleep(300);                                  // the load's requestAnimationFrame fit
    await page.evaluate(`(() => { window.__dragstarts = 0;
        document.addEventListener('dragstart', () => { window.__dragstarts += 1; }, true); return true; })()`);
    await page.screenshot(join(OUT, '1-page.png'));
    const nodes = () => page.evaluate('[...document.querySelectorAll(".twm-flow-graph__node")].map((n) => n.dataset.nodeId)');
    const lines = () => page.evaluate('document.querySelectorAll("path.twm-flow-graph__edge").length');

    console.log('\nlayout — elementFromPoint at each primary control');
    const sizes = await page.evaluate(`(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
        return { canvas: r('.twm-flow-graph__canvas'), palette: r('.twm-flow-graph__palette'), aside: r('.twm-flow-graph__aside') };
    })()`);
    check('the canvas, the palette and the settings each have a size', sizes.canvas[0] > 600 && sizes.canvas[1] > 400
          && sizes.palette[0] > 100 && sizes.aside[0] > 200, JSON.stringify(sizes));
    for (const [name, sel] of [
        ['Undo', '.twm-flow-graph__toolbar [data-action="undo"]'],
        ['Arrange', '.twm-flow-graph__toolbar [data-action="arrange"]'],
        ['Fit', '.twm-flow-graph__toolbar [data-action="fit"]'],
        ['the consumer\'s Run', '.twm-flow-graph__toolbar [data-action="run"]'],
        ['a palette item', '.twm-flow-graph__palette-item[data-type="log"]'],
        ['a node\'s header', '.twm-flow-graph__node[data-node-id="fetch"] .twm-flow-graph__node-head'],
        ['a port', '.twm-flow-graph__node[data-node-id="fetch"] .twm-flow-graph__port[data-port="error"]'],
        ['the flow panel\'s first field', '.twm-flow-panel [data-field="name"] input'],
    ]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its own centre`, c?.hit === true, JSON.stringify(c));
    }
    const fetchHead = await centre(page, '.twm-flow-graph__node[data-node-id="fetch"] .twm-flow-graph__node-title');
    await click(page, fetchHead.x, fetchHead.y);
    await sleep(50);
    for (const [name, sel] of [['the step panel\'s name box', '.twm-flow-panel__title-input'],
                               ['its first field', '.twm-flow-panel [data-field="method"] select'],
                               ['its Remove step', '.twm-flow-panel [data-action="remove"]']]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its own centre`, c?.hit === true, JSON.stringify(c));
    }
    const covered = await page.evaluate(`(() => {
        const p = document.querySelector('.twm-flow-panel'); const b = p.getBoundingClientRect();
        const pts = [[b.left + 10, b.top + 10], [b.left + b.width / 2, b.top + Math.min(b.height / 2, 300)], [b.right - 10, b.top + 40]];
        return pts.map(([x, y]) => p.contains(document.elementFromPoint(x, y)));
    })()`);
    check('the panel is not covered', covered.every(Boolean), JSON.stringify(covered));
    await page.screenshot(join(OUT, '2-step-picked.png'));

    console.log('\nanchors — every line starts and ends at its ports\' dots');
    const anchors = await page.evaluate(`(() => {
        const out = [];
        const dot = (nodeId, port, dir) => {
            const b = document.querySelector('.twm-flow-graph__node[data-node-id="' + nodeId + '"] .twm-flow-graph__port[data-port="' + port + '"][data-direction="' + dir + '"]');
            const r = b.getBoundingClientRect();
            return { x: dir === 'input' ? r.left + 6 : r.right - 6, y: r.top + r.height / 2,
                     dot: (() => { const d = b.querySelector('.twm-flow-graph__port-dot').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2 }; })() };
        };
        const g = window.__flowCanvas.editor.getGraph();
        const paths = [...document.querySelectorAll('path.twm-flow-graph__edge')];
        g.connections.forEach((c, i) => {
            const p = paths[i]; const m = p.getScreenCTM();
            const at = (len) => { const q = p.getPointAtLength(len); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
            const s = at(0); const e = at(p.getTotalLength());
            const a = dot(c.source, c.sourcePort, 'output'); const b = dot(c.target, c.targetPort, 'input');
            out.push({ edge: c.source + '.' + c.sourcePort + '→' + c.target + '.' + c.targetPort,
                       start: Math.round(Math.abs(s.y - a.dot.y) * 10) / 10, end: Math.round(Math.abs(e.y - b.dot.y) * 10) / 10,
                       startX: Math.round(Math.abs(s.x - a.dot.x)), endX: Math.round(Math.abs(e.x - b.dot.x)) });
        });
        return out;
    })()`);
    check('every line begins on its output dot\'s centre line (within 1px)', anchors.every((a) => a.start <= 1), JSON.stringify(anchors));
    check('…and ends on its input dot\'s (within 1px)', anchors.every((a) => a.end <= 1), JSON.stringify(anchors));
    check('…at the node\'s edge, beside the dot (within 8px)', anchors.every((a) => a.startX <= 8 && a.endX <= 8), JSON.stringify(anchors));

    console.log('\nreturn — the loop\'s line back runs under both steps');
    const back = await page.evaluate(`(() => {
        const p = document.querySelector('path.twm-flow-graph__edge--back'); const b = p.getBoundingClientRect();
        const each = document.querySelector('[data-node-id="each"]').getBoundingClientRect();
        const note = document.querySelector('[data-node-id="note"]').getBoundingClientRect();
        return { bottom: b.bottom, under: Math.max(each.bottom, note.bottom), dash: getComputedStyle(p).strokeDasharray };
    })()`);
    check('below both steps', back.bottom > back.under, JSON.stringify(back));
    check('dashed', back.dash && back.dash !== 'none', back.dash);

    console.log('\ndrag — a real pointer drag from the palette');
    const before = await nodes();
    const item = await centre(page, '.twm-flow-graph__palette-item[data-type="log"]');
    const canvasBox = await page.evaluate('(() => { const b = document.querySelector(".twm-canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()');
    const drop = { x: Math.round(canvasBox.x + canvasBox.w * 0.45), y: Math.round(canvasBox.y + canvasBox.h * 0.8) };
    await drag(page, { x: item.x, y: item.y }, drop, 16);
    await sleep(80);
    const after = await nodes();
    const added = after.filter((id) => !before.includes(id));
    check('exactly ONE step was added', added.length === 1, JSON.stringify(added));
    const landed = await page.evaluate(`(() => {
        const id = ${JSON.stringify(added[0] || '')};
        const n = document.querySelector('.twm-flow-graph__node[data-node-id="' + id + '"]');
        if (!n) return null;
        const h = n.querySelector('.twm-flow-graph__node-head').getBoundingClientRect();
        return { cx: h.left + h.width / 2, cy: h.top + h.height / 2, ghost: Boolean(document.querySelector('.twm-flow-graph__ghost')),
                 drops: document.querySelectorAll('.twm-flow-graph__canvas--drop').length, dragstarts: window.__dragstarts,
                 draggable: document.querySelectorAll('[draggable]').length };
    })()`);
    check('where it was dropped (its header centred on the pointer, within a grid cell)', landed
          && Math.abs(landed.cx - drop.x) <= 16 && Math.abs(landed.cy - drop.y) <= 16, JSON.stringify({ landed, drop }));
    check('no native drag ever started', landed?.dragstarts === 0 && landed?.draggable === 0, JSON.stringify(landed));
    check('and no ghost, no drop outline left behind', landed && !landed.ghost && landed.drops === 0);
    await page.screenshot(join(OUT, '3-dropped.png'));
    const n1 = (await nodes()).length;
    const toolbar = await centre(page, '.twm-flow-graph__toolbar');
    await drag(page, { x: item.x, y: item.y }, { x: toolbar.x, y: toolbar.y }, 10);
    await sleep(60);
    check('a drag that ends off the canvas adds nothing', (await nodes()).length === n1);
    check('and says where to drop', (await page.evaluate('document.querySelector(".twm-flow-graph__message").textContent'))
          === 'Drop a step on the canvas to add it.');

    console.log('\nconnect — click an output, then an input');
    const l0 = await lines();
    const outPort = await centre(page, '.twm-flow-graph__node[data-node-id="nothing"] .twm-flow-graph__port[data-direction="input"]');
    const src = await centre(page, `.twm-flow-graph__node[data-node-id="${added[0]}"] .twm-flow-graph__port[data-direction="output"]`);
    await click(page, src.x, src.y);
    await sleep(30);
    await click(page, outPort.x, outPort.y);
    await sleep(60);
    check('one line more', (await lines()) === l0 + 1, `${l0} → ${await lines()}`);

    console.log('\nmove — a real drag of a node\'s header, then the keys');
    const pos = () => page.evaluate('(() => { const n = document.querySelector(\'[data-node-id="save"]\'); return { x: parseFloat(n.style.left), y: parseFloat(n.style.top) }; })()');
    const p0 = await pos();
    const scale = await page.evaluate('window.__flowCanvas.editor.canvas.scale');
    const head = await centre(page, '.twm-flow-graph__node[data-node-id="save"] .twm-flow-graph__node-title');
    await drag(page, { x: head.x, y: head.y }, { x: head.x + 96, y: head.y + 64 }, 12);
    await sleep(60);
    const p1 = await pos();
    check('the node moved by the pointer\'s travel, snapped', Math.abs(p1.x - p0.x - 96 / scale) <= 16 && Math.abs(p1.y - p0.y - 64 / scale) <= 16,
          JSON.stringify({ p0, p1, scale }));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(60);
    const p2 = await pos();
    check('a real Ctrl+Z puts it back', p2.x === p0.x && p2.y === p0.y, JSON.stringify({ p0, p2 }));
    await click(page, head.x, head.y);
    await sleep(30);
    await key(page, 'Backspace');
    await sleep(30);
    check('a real Backspace removes nothing', (await nodes()).includes('save'));
    await key(page, 'Delete');
    await sleep(60);
    check('a real Delete removes the picked step', !(await nodes()).includes('save'));
    const focus = await page.evaluate('document.activeElement && document.activeElement.className');
    check('and the focus is on the canvas', focus === 'twm-canvas', String(focus));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(60);
    check('Ctrl+Z brings it back', (await nodes()).includes('save'));

    console.log('\nthe run, and the findings');
    const run = await centre(page, '.twm-flow-graph__toolbar [data-action="run"]');
    await click(page, run.x, run.y);
    const validate = await centre(page, '.twm-flow-graph__toolbar [data-action="validate"]');
    await click(page, validate.x, validate.y);
    await sleep(80);
    const drawn = await page.evaluate(`({ line: document.querySelector('[data-node-id="note"] .twm-flow-graph__node-run').textContent,
        banner: document.querySelector('.twm-flow-graph__banner').getBoundingClientRect().height,
        strip: document.querySelector('.twm-flow-strip').getBoundingClientRect().height,
        marked: document.querySelector('[data-node-id="fetch"]').classList.contains('twm-flow-graph__node--error') })`);
    check('the run\'s line, the banner and the strip are drawn with a size', drawn.line === 'completed ×63' && drawn.banner > 10
          && drawn.strip > 10 && drawn.marked, JSON.stringify(drawn));
    const goTo = await centre(page, '.twm-flow-strip__go');
    check('Go to it is the element at its own centre', goTo?.hit === true, JSON.stringify(goTo));
    await page.screenshot(join(OUT, '4-run-and-findings.png'));

    console.log('\nnarrow — the container query');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    const narrow = await page.evaluate(`(() => {
        const ed = document.querySelector('.twm-flow-graph').getBoundingClientRect();
        const cv = document.querySelector('.twm-flow-graph__canvas').getBoundingClientRect();
        const pa = document.querySelector('.twm-flow-graph__palette').getBoundingClientRect();
        return { editor: Math.round(ed.width), canvas: Math.round(cv.width), canvasBottom: Math.round(cv.bottom), paletteTop: Math.round(pa.top) };
    })()`);
    check('at 700px the canvas takes the whole width, over the palette', Math.abs(narrow.canvas - narrow.editor) <= 2
          && narrow.paletteTop >= narrow.canvasBottom - 2, JSON.stringify(narrow));
    await page.screenshot(join(OUT, '5-narrow.png'));
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow canvas probe: ${failures} FAILED (screenshots in ${OUT})` : `\nflow canvas probe: every check held (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
