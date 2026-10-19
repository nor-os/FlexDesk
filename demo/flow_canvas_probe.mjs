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
 *   many       (`multiSelect`, on a 300-step graph of its own) a real marquee
 *              over three steps picks those three; a real drag of one moves
 *              all three and one real Ctrl+Z puts them back; a bulk move of
 *              50 picked steps, and its undo, each finish in under 100 ms
 *   bodies     a type registered while the editor is open (`setCatalogue`)
 *              with its own body, a 280×170 box and an accent: it is in the
 *              palette, its node is drawn that size with its body below its
 *              ports, and every line into and out of it starts and ends at
 *              its ports' dots, measured as above
 *   viewport   the zoom buttons pass the same layout check; the minimap sits
 *              over the canvas's lower right corner, ABOVE the steps
 *              (`elementFromPoint` at its centre is the minimap); a real
 *              click on a step's box in it centres the view on that step, at
 *              the same scale, with one viewport report; a real click on −
 *              zooms out one step
 *   in place   (`renameInPlace`) a real double-click on a step's name opens a
 *              text box over it, focused, the whole name selected; real keys
 *              replace it and a real click on the empty canvas (the box's
 *              blur) commits ONE `flow:node:label` entry that a real Ctrl+Z
 *              takes back; (`inline`) the request's timeout drawn on its node
 *              takes real keys, the panel shows each value, focus stays on
 *              the node's control, the panel's own box writes back to the
 *              node, and `editor.undo()` with the node's control focused
 *              redraws it with the restored value
 *   narrow     at 700px the canvas takes the editor's whole width (the
 *              container query), and the minimap's frame takes the canvas's
 *              new shape (its ResizeObserver)
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
import { centre, click, dblclick, drag, key, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

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
        ['Zoom out', '.twm-flow-graph__toolbar [data-action="zoom-out"]'],
        ['Zoom in', '.twm-flow-graph__toolbar [data-action="zoom-in"]'],
        ['100%', '.twm-flow-graph__toolbar [data-action="zoom-reset"]'],
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
    const ANCHORS = `(() => {
        const out = [];
        const dot = (nodeId, port, dir) => {
            const b = document.querySelector('.twm-flow-graph__node[data-node-id="' + nodeId + '"] .twm-flow-graph__port[data-port="' + port + '"][data-direction="' + dir + '"]');
            const r = b.getBoundingClientRect();
            return { x: dir === 'input' ? r.left + 6 : r.right - 6, y: r.top + r.height / 2,
                     dot: (() => { const d = b.querySelector('.twm-flow-graph__port-dot').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, r: d.width / 2 }; })() };
        };
        const off = (p, d) => Math.round(Math.max(0, Math.hypot(p.x - d.x, p.y - d.y) - d.r) * 10) / 10;
        const g = window.__flowCanvas.editor.getGraph();
        const paths = [...document.querySelectorAll('path.twm-flow-graph__edge')];
        g.connections.forEach((c, i) => {
            const p = paths[i]; const m = p.getScreenCTM();
            const at = (len) => { const q = p.getPointAtLength(len); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
            const s = at(0); const e = at(p.getTotalLength());
            const a = dot(c.source, c.sourcePort, 'output'); const b = dot(c.target, c.targetPort, 'input');
            out.push({ edge: c.source + '.' + c.sourcePort + '→' + c.target + '.' + c.targetPort,
                       start: Math.round(Math.abs(s.y - a.dot.y) * 10) / 10, end: Math.round(Math.abs(e.y - b.dot.y) * 10) / 10,
                       startX: Math.round(Math.abs(s.x - a.dot.x)), endX: Math.round(Math.abs(e.x - b.dot.x)),
                       // how far outside the dot's disc each end lies (0: on it)
                       startOff: off(s, a.dot), endOff: off(e, b.dot) });
        });
        return out;
    })()`;
    const anchors = await page.evaluate(ANCHORS);
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

    console.log('\nmany — multiSelect on a 300-step graph');
    // Its own editor over the demo's, built from the same barrel, and gone
    // again before the narrow check.
    await page.evaluate(`(async () => {
        const { createCanvasEditor, createStepCatalogue } = await import('/flow.js');
        const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
        const catalogue = createStepCatalogue([{ type_id: 'task', label: 'Task', category: 'work',
            ports: [F('in', 'input'), F('out', 'output')] }], { categories: [{ id: 'work', label: 'Work' }] });
        const nodes = [];
        const connections = [];
        for (let i = 0; i < 300; i += 1) {
            nodes.push({ id: 's' + i, type: 'task', config: {}, position: { x: 96 + (i % 20) * 272, y: 96 + Math.floor(i / 20) * 128 } });
            if (i) connections.push({ source: 's' + (i - 1), sourcePort: 'out', target: 's' + i, targetPort: 'in' });
        }
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;background:var(--twm-surface, #fff)';
        document.body.appendChild(host);
        window.__picks = [];
        const editor = createCanvasEditor(host, { catalogue, multiSelect: true, onSelect: (s) => window.__picks.push(s) });
        editor.el.style.flex = '1';
        editor.load({ graph: { nodes, connections } }, { fit: false });
        editor.canvas.setViewport({ scale: 0.5, tx: 0, ty: 0 });
        window.__many = { editor, host };
        return true;
    })()`);
    await sleep(100);
    const toClient = (x, y) => page.evaluate(`window.__many.editor.canvas.canvasToClient(${x}, ${y})`);
    const a = await toClient(60, 60);
    const b = await toClient(96 + 2 * 272 + 40, 140);
    await drag(page, a, b, 10);
    await sleep(60);
    const picks = await page.evaluate('JSON.stringify(window.__picks.at(-1))');
    check('a real marquee over three steps picks those three', picks === JSON.stringify({ kind: 'many', ids: ['s0', 's1', 's2'] }), picks);
    const where = () => page.evaluate(`JSON.stringify(['s0', 's1', 's2', 's3'].map((id) => window.__many.editor.getGraph().nodes.find((n) => n.id === id).position))`);
    const w0 = await where();
    const head1 = await centre(page, '.twm-flow-graph__node[data-node-id="s1"] .twm-flow-graph__node-title');
    await drag(page, { x: head1.x, y: head1.y }, { x: head1.x + 80, y: head1.y + 48 }, 12);
    await sleep(60);
    const w1 = JSON.parse(await where());
    const was = JSON.parse(w0);
    check('a real drag of one moves all three by the same travel, and not the fourth',
          [0, 1, 2].every((i) => w1[i].x - was[i].x === w1[0].x - was[0].x && w1[i].y - was[i].y === w1[0].y - was[0].y)
          && w1[0].x !== was[0].x && w1[3].x === was[3].x, JSON.stringify({ was, w1 }));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(60);
    check('one real Ctrl+Z puts all three back', (await where()) === w0);
    const timing = await page.evaluate(`(() => {
        const { editor } = window.__many;
        const ids = Array.from({ length: 50 }, (_, i) => 's' + (i * 6));
        editor.select(ids);
        const head = document.querySelector('.twm-flow-graph__node[data-node-id="s0"] .twm-flow-graph__node-head');
        const r = head.getBoundingClientRect();
        const at = (dx) => ({ bubbles: true, cancelable: true, button: 0, isPrimary: true, clientX: r.left + 20 + dx, clientY: r.top + 10 });
        const before = editor.serialise();
        const t0 = performance.now();
        head.dispatchEvent(new PointerEvent('pointerdown', at(0)));
        window.dispatchEvent(new PointerEvent('pointermove', at(120)));
        window.dispatchEvent(new PointerEvent('pointerup', at(120)));
        document.body.getBoundingClientRect();
        const move = performance.now() - t0;
        const moved = editor.getGraph().nodes.filter((n, i) => JSON.stringify(n.position) !== JSON.stringify(JSON.parse(before).nodes[i].position)).length;
        const t1 = performance.now();
        editor.undo();
        document.body.getBoundingClientRect();
        const undo = performance.now() - t1;
        return { move, undo, moved, back: editor.serialise() === before, action: editor.history.redoAction };
    })()`);
    check('a bulk move of 50 picked steps (of 300) finishes in under 100 ms', timing.moved === 50 && timing.move < 100,
          JSON.stringify(timing));
    check('and its undo, which puts all 50 back, in under 100 ms', timing.back && timing.undo < 100
          && timing.action === 'flow:nodes:move', JSON.stringify(timing));
    console.log(`       (move ${timing.move.toFixed(1)} ms, undo ${timing.undo.toFixed(1)} ms)`);
    await page.screenshot(join(OUT, '5-many.png'));
    await page.evaluate('(() => { window.__many.editor.destroy(); window.__many.host.remove(); return true; })()');

    console.log('\nbodies — a type registered while open, with its own body, box and accent');
    const bodies = await page.evaluate(`(() => {
        const fc = window.__flowCanvas;
        const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
        const gauge = { type_id: 'gauge', label: 'Gauge', category: 'utility', icon: 'speed', accent: 'teal',
            size: { w: 280, h: 170 },
            ports: [F('in', 'input'), F('low', 'output', { label: 'Low' }), F('high', 'output', { label: 'High' })],
            render(body, node, ctx) {
                const i = document.createElement('input');
                i.type = 'range'; i.min = '0'; i.max = '100'; i.className = 'probe-gauge';
                i.addEventListener('change', () => ctx.setConfig({ level: Number(i.value) }));
                body.append(i);
            },
            update(body, node) { body.querySelector('.probe-gauge').value = String(node.config.level ?? 50); } };
        fc.editor.setCatalogue(fc.createStepCatalogue([...fc.types, gauge], { categories: fc.categories }));
        const inPalette = Boolean(document.querySelector('.twm-flow-graph__palette-item[data-type="gauge"]'));
        const g = fc.editor.getGraph();
        g.nodes.push({ id: 'before', type: 'log', label: 'Before the gauge', config: {}, position: { x: 48, y: 560 } },
                     { id: 'gauge', type: 'gauge', config: { level: 30 }, position: { x: 352, y: 528 } },
                     { id: 'after', type: 'log', label: 'After the gauge', config: {}, position: { x: 736, y: 528 } });
        g.connections.push({ source: 'before', target: 'gauge', sourcePort: 'out', targetPort: 'in' },
                           { source: 'gauge', target: 'after', sourcePort: 'low', targetPort: 'in' },
                           { source: 'gauge', target: 'nothing', sourcePort: 'high', targetPort: 'in' });
        fc.editor.load({ graph: g }, { baseline: false, fit: false });
        fc.editor.fit({ whole: true });
        const n = document.querySelector('[data-node-id="gauge"]');
        const r = n.getBoundingClientRect();
        const body = n.querySelector('.twm-flow-graph__node-body');
        const rows = n.querySelectorAll('.twm-flow-graph__node-row');
        return { inPalette, scale: fc.editor.canvas.scale, w: r.width, h: r.height, accent: n.dataset.accent,
                 stripe: getComputedStyle(n, '::before').backgroundColor,
                 below: Boolean(body) && body.getBoundingClientRect().top >= rows[rows.length - 1].getBoundingClientRect().bottom - 0.5,
                 value: body ? body.querySelector('.probe-gauge').value : null };
    })()`);
    check('the type registered while open is in the palette', bodies.inPalette, JSON.stringify(bodies));
    check('its node is drawn 280×170 (at the canvas\'s scale)', Math.abs(bodies.w - 280 * bodies.scale) <= 1
          && Math.abs(bodies.h - 170 * bodies.scale) <= 1, JSON.stringify(bodies));
    check('with its body below its ports, brought up to date', bodies.below && bodies.value === '30', JSON.stringify(bodies));
    check('and marked in its accent', bodies.accent === 'teal' && bodies.stripe && bodies.stripe !== 'rgba(0, 0, 0, 0)',
          JSON.stringify(bodies));
    const sized = (await page.evaluate(ANCHORS)).filter((a) => a.edge.includes('gauge'));
    check('three lines meet the sized node', sized.length === 3, JSON.stringify(sized));
    check('every one begins on its output dot\'s centre line (within 1px)', sized.every((a) => a.start <= 1), JSON.stringify(sized));
    check('…and ends on its input dot\'s (within 1px)', sized.every((a) => a.end <= 1), JSON.stringify(sized));
    check('…at the node\'s edge, beside the dot (within 8px)', sized.every((a) => a.startX <= 8 && a.endX <= 8), JSON.stringify(sized));
    check('every line end meets its port dot (within 1px of the dot)', sized.every((a) => a.startOff <= 1 && a.endOff <= 1),
          JSON.stringify(sized));
    await page.screenshot(join(OUT, '6-bodies.png'));
    console.log('\nviewport — the minimap and the zoom buttons');
    const placed = await page.evaluate(`(() => {
        const m = document.querySelector('.twm-flow-graph__minimap').getBoundingClientRect();
        const c = document.querySelector('.twm-canvas').getBoundingClientRect();
        return { right: Math.round(c.right - m.right), bottom: Math.round(c.bottom - m.bottom),
                 inside: m.left >= c.left && m.top >= c.top && m.right <= c.right && m.bottom <= c.bottom,
                 w: Math.round(m.width), h: Math.round(m.height) };
    })()`);
    check('the minimap is over the canvas\'s lower right corner', placed.inside && placed.right >= 0 && placed.right <= 20
          && placed.bottom >= 0 && placed.bottom <= 20 && placed.w > 100 && placed.h > 60, JSON.stringify(placed));
    // A step dragged under it first: the minimap must be drawn over the steps.
    const fitBtn = await centre(page, '.twm-flow-graph__toolbar [data-action="fit"]');
    await click(page, fitBtn.x, fitBtn.y);
    await sleep(80);
    const mc = await centre(page, '.twm-flow-graph__minimap');
    const mover = await page.evaluate(`(() => [...document.querySelectorAll('.twm-flow-graph__node')].map((n) => n.dataset.nodeId)
        .find((id) => { const t = document.querySelector('[data-node-id="' + id + '"] .twm-flow-graph__node-title').getBoundingClientRect();
                        const h = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
                        return h && h.closest('[data-node-id]') && h.closest('[data-node-id]').dataset.nodeId === id; }))()`);
    const under = await centre(page, `.twm-flow-graph__node[data-node-id="${mover}"] .twm-flow-graph__node-title`);
    await drag(page, { x: under.x, y: under.y }, { x: mc.x, y: mc.y }, 12);
    await sleep(60);
    const covers = await page.evaluate(`(() => {
        const m = document.querySelector('.twm-flow-graph__minimap'); const b = m.getBoundingClientRect();
        const n = document.querySelector('[data-node-id="${mover}"]').getBoundingClientRect();
        const overlap = n.left < b.right && n.right > b.left && n.top < b.bottom && n.bottom > b.top;
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { overlap, hit: Boolean(hit && m.contains(hit)), hitIs: hit && String(hit.getAttribute('class')),
                 node: [n.left, n.top, n.right, n.bottom].map(Math.round), mini: [b.left, b.top, b.right, b.bottom].map(Math.round) };
    })()`);
    check('a step under the minimap: the minimap is the element at its own centre', covers.overlap && covers.hit,
          JSON.stringify({ mover, covers }));
    await key(page, 'z', { mods: ['ctrl'] });                 // the step goes back
    await sleep(60);
    await click(page, fitBtn.x, fitBtn.y);
    await sleep(80);
    const aim = await page.evaluate(`(() => {
        const g = window.__flowCanvas.editor.getGraph();
        const boxes = [...document.querySelectorAll('.twm-flow-graph__minimap-node')];
        const frame = document.querySelector('.twm-flow-graph__minimap-view').getBoundingClientRect();
        const fx = frame.left + frame.width / 2, fy = frame.top + frame.height / 2;
        let best = null;
        boxes.forEach((r, i) => { const b = r.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
            const d = Math.hypot(x - fx, y - fy); if (!best || d > best.d) best = { d, x, y, id: g.nodes[i].id }; });
        return { ...best, scale: window.__flowCanvas.editor.canvas.scale, views: window.__flowCanvas.views };
    })()`);
    await click(page, Math.round(aim.x), Math.round(aim.y));
    await sleep(80);
    const centred = await page.evaluate(`(() => {
        const c = document.querySelector('.twm-canvas').getBoundingClientRect();
        const n = document.querySelector('.twm-flow-graph__node[data-node-id="${aim.id}"]').getBoundingClientRect();
        return { dx: Math.round(n.left + n.width / 2 - (c.left + c.width / 2)), dy: Math.round(n.top + n.height / 2 - (c.top + c.height / 2)),
                 scale: window.__flowCanvas.editor.canvas.scale, views: window.__flowCanvas.views };
    })()`);
    // The click lands on a whole pixel of a map drawn at a fraction of the scale.
    const slack = 2 / (await page.evaluate('(() => { const r = document.querySelector(".twm-flow-graph__minimap-view"); return Number(r.getAttribute("width")) / document.querySelector(".twm-canvas").getBoundingClientRect().width; })()'));
    check('a real click on a step\'s box in the minimap centres the view on that step', Math.abs(centred.dx) <= slack
          && Math.abs(centred.dy) <= slack, JSON.stringify({ aim, centred, slack }));
    check('at the same scale, with one viewport report', centred.scale === aim.scale && centred.views === aim.views + 1,
          JSON.stringify({ aim, centred }));
    const zoomOut = await centre(page, '.twm-flow-graph__toolbar [data-action="zoom-out"]');
    await click(page, zoomOut.x, zoomOut.y);
    await sleep(60);
    const outScale = await page.evaluate('window.__flowCanvas.editor.canvas.scale');
    check('a real click on Zoom out makes the scale smaller', outScale < centred.scale, `${centred.scale} → ${outScale}`);
    await page.screenshot(join(OUT, '7-minimap.png'));

    console.log('\nin place — a name and a setting edited on the node');
    await page.evaluate('window.__flowCanvas.editor.fit(), true');
    await sleep(120);
    const named = await centre(page, '.twm-flow-graph__node[data-node-id="save"] .twm-flow-graph__node-title');
    check('the step\'s name is the element at its centre', named?.hit, JSON.stringify(named));
    await dblclick(page, named.x, named.y);
    await sleep(60);
    const box = await page.evaluate(`(() => {
        const b = document.querySelector('.twm-flow-graph__node[data-node-id="save"] .twm-flow-graph__node-title-input');
        const t = document.querySelector('.twm-flow-graph__node[data-node-id="save"] .twm-flow-graph__node-title');
        return b && { value: b.value, focused: document.activeElement === b, start: b.selectionStart, end: b.selectionEnd,
                      titleHidden: t.hidden, depth: window.__flowCanvas.editor.history.depth };
    })()`);
    check('a real double-click opens a text box holding the name', box?.value === 'Save the applications' && box.titleHidden,
          JSON.stringify(box));
    check('focused, the whole name selected', box?.focused && box.start === 0 && box.end === 'Save the applications'.length,
          JSON.stringify(box));
    await type(page, 'Stored');
    // The empty canvas: a point inside it that no step, line or control is drawn at.
    const empty = await page.evaluate(`(() => {
        const c = document.querySelector('.twm-flow-graph__canvas').getBoundingClientRect();
        for (let y = c.top + 40; y < c.bottom - 40; y += 24) for (let x = c.left + 40; x < c.right - 40; x += 24) {
            const hit = document.elementFromPoint(x, y);
            if (hit && hit.closest('.twm-flow-graph__canvas') && !hit.closest('.twm-flow-graph__node, .twm-flow-graph__minimap, button')
                && !hit.closest('path')) return { x, y };
        }
        return null;
    })()`);
    check('the canvas has an empty point to click', Boolean(empty));
    if (empty) await click(page, empty.x, empty.y);
    await sleep(60);
    const renamed = await page.evaluate(`(() => {
        const ed = window.__flowCanvas.editor;
        const n = document.querySelector('.twm-flow-graph__node[data-node-id="save"]');
        return { label: ed.getGraph().nodes.find((x) => x.id === 'save').label, open: Boolean(n.querySelector('.twm-flow-graph__node-title-input')),
                 title: n.querySelector('.twm-flow-graph__node-title').textContent, depth: ed.history.depth, action: ed.history.undoAction };
    })()`);
    check('real keys replace the selected name, a real click away commits it', renamed.label === 'Stored' && !renamed.open
          && renamed.title === 'Stored', JSON.stringify(renamed));
    check('as ONE flow:node:label entry', renamed.depth === box.depth + 1 && renamed.action === 'flow:node:label',
          JSON.stringify({ before: box.depth, renamed }));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(60);
    const unnamed = await page.evaluate(`window.__flowCanvas.editor.getGraph().nodes.find((x) => x.id === 'save').label`);
    check('a real Ctrl+Z puts the name back', unnamed === 'Save the applications', String(unnamed));

    const requestHead = await centre(page, '.twm-flow-graph__node[data-node-id="fetch"] .twm-flow-graph__node-head');
    await click(page, requestHead.x, requestHead.y);
    await sleep(60);
    const INLINE = '.twm-flow-graph__node[data-node-id="fetch"] .twm-flow-graph__node-inline [data-field="timeout_seconds"] input';
    const PANEL = '.twm-flow-graph__aside [data-field="timeout_seconds"] input';
    const control = await centre(page, INLINE);
    check('the timeout is drawn on the request\'s node, and is the element at its centre', control?.hit, JSON.stringify(control));
    await click(page, control.x, control.y);
    await key(page, 'a', { mods: ['ctrl'], commands: ['selectAll'] });
    await type(page, '45');
    await sleep(60);
    const typed = await page.evaluate(`(() => {
        const ed = window.__flowCanvas.editor;
        const i = document.querySelector(${JSON.stringify(INLINE)});
        return { value: ed.getGraph().nodes.find((x) => x.id === 'fetch').config.timeout_seconds,
                 panel: document.querySelector(${JSON.stringify(PANEL)})?.value, focused: document.activeElement === i,
                 action: ed.history.undoAction };
    })()`);
    check('real keys on the node\'s control: the graph holds the value', typed.value === 45, JSON.stringify(typed));
    check('the panel shows it, and the node\'s control keeps the focus', typed.panel === '45' && typed.focused,
          JSON.stringify(typed));
    check('as a flow:node:config entry', typed.action === 'flow:node:config', JSON.stringify(typed));
    const panelBox = await centre(page, PANEL);
    await click(page, panelBox.x, panelBox.y);
    await key(page, 'a', { mods: ['ctrl'], commands: ['selectAll'] });
    await type(page, '60');
    await sleep(60);
    const fromPanel = await page.evaluate(`document.querySelector(${JSON.stringify(INLINE)}).value`);
    check('real keys in the panel: the node\'s control shows them', fromPanel === '60', String(fromPanel));
    await click(page, control.x, control.y);
    const undone = await page.evaluate(`(() => {
        const ed = window.__flowCanvas.editor;
        ed.undo();
        const i = document.querySelector(${JSON.stringify(INLINE)});
        return { value: ed.getGraph().nodes.find((x) => x.id === 'fetch').config.timeout_seconds, shown: i.value,
                 panel: document.querySelector(${JSON.stringify(PANEL)})?.value, focused: document.activeElement === i };
    })()`);
    check('editor.undo() with the node\'s control focused: the node shows the restored value',
          undone.value === 45 && undone.shown === '45' && undone.panel === '45', JSON.stringify(undone));
    check('and the node\'s control keeps the focus', undone.focused, JSON.stringify(undone));
    await page.screenshot(join(OUT, '8-in-place.png'));

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
    const shape = await page.evaluate(`(() => {
        const r = document.querySelector('.twm-flow-graph__minimap-view');
        const c = document.querySelector('.twm-canvas').getBoundingClientRect();
        return { frame: Number(r.getAttribute('width')) / Number(r.getAttribute('height')), canvas: c.width / c.height };
    })()`);
    check('the minimap\'s frame took the resized canvas\'s shape, with no pan', Math.abs(shape.frame - shape.canvas) < 0.02,
          JSON.stringify(shape));
    await page.screenshot(join(OUT, '9-narrow.png'));
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow canvas probe: ${failures} FAILED (screenshots in ${OUT})` : `\nflow canvas probe: every check held (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
