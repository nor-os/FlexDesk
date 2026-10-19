/**
 * THE CANVAS EDITOR'S STYLED LINES IN A REAL BROWSER (STORY-0081) — what
 * `tests/flow_canvas_edge_style.test.mjs` cannot see under jsdom, settled in
 * headless Edge over the DevTools protocol. It opens the canvas demo's page
 * (for its stylesheets), takes the demo's editor away and mounts its own, with
 * `edgeStyle`, `routing` and `hoverHighlight`:
 *
 *   dash       a `dashed: true` line has a computed dash pattern; a plain one none
 *   arrow      `marker: 'arrow'`: the arrowhead's tip is on the input port's dot
 *              and the line ends at its base
 *   label      a `label` sits at the line's midpoint (getPointAtLength), over a
 *              step: `elementFromPoint` at its centre is the label, not the step
 *   routing    `routing: 'obstacles'`: no point of the line lies inside the
 *              DRAWN box of the step between its ends; above the kernel's node
 *              limit the strip says the lines are plain curves
 *   hover      a real pointer over a node highlights its lines (a computed
 *              stroke change), and moving off takes it away
 *
 *     node demo/flow_canvas_edges_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to
 * out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-canvas-edges-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mounts the probe's own editor: `mode` is 'styled', 'routed' or 'crowded'. */
const MOUNT = `window.__mountEdges = async (mode) => {
    const flow = await import('../flow.js');
    const { OBSTACLE_ROUTING_NODE_LIMIT } = await import('../canvas.js');
    window.__flowCanvas?.editor?.destroy?.();
    document.querySelector('.demo')?.remove();
    window.__edges?.destroy();
    document.querySelector('#edges-host')?.remove();
    const host = document.createElement('div');
    host.id = 'edges-host';
    host.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column';
    document.body.appendChild(host);
    const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
    const catalogue = flow.createStepCatalogue([
        { type_id: 'start', label: 'Start', role: 'start', category: 'a', icon: 'play_arrow', ports: [F('out', 'output')] },
        { type_id: 'step', label: 'Step', category: 'a', icon: 'notes', ports: [F('in', 'input'), F('out', 'output')] },
    ], { categories: [{ id: 'a', label: 'A', tone: 'teal' }] });
    const node = (id, x, y, type = 'step') => ({ id, type, config: {}, position: { x, y } });
    const edge = (source, target) => ({ source, target, sourcePort: 'out', targetPort: 'in' });
    const graph = { nodes: [node('a', 0, 0, 'start'), node('b', 700, 0), node('c', 350, 0)],
                    connections: [edge('a', 'b'), edge('c', 'b')] };
    if (mode === 'crowded') for (let i = 0; i < OBSTACLE_ROUTING_NODE_LIMIT; i += 1) graph.nodes.push(node('n' + i, (i % 10) * 260, 300 + Math.floor(i / 10) * 140));
    const opts = { catalogue, hoverHighlight: true };
    if (mode === 'styled') opts.edgeStyle = (c) => (c.source === 'a' ? { dashed: true, tone: 'amber', marker: 'arrow', label: 'feeds' } : null);
    else opts.routing = 'obstacles';
    window.__edges = flow.createCanvasEditor(host, opts);
    window.__edges.load({ graph }, { fit: false });
    window.__edges.canvas.setViewport({ scale: 1, tx: 30, ty: 140 });
    return true;
};`;

/** Every point of the first line, in viewport pixels. */
const SAMPLE = `(() => {
    const p = document.querySelectorAll('path.twm-flow-graph__edge')[0];
    const m = p.getScreenCTM(); const len = p.getTotalLength();
    const at = (l) => { const q = p.getPointAtLength(l); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
    return { points: Array.from({ length: 201 }, (_, i) => at((len * i) / 200)), mid: at(len / 2) };
})()`;

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1500, height: 900 });
let page;
try {
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_canvas.html`);
    await page.waitFor('window.__flowCanvas && window.__flowCanvas.ready');
    await page.evaluate(MOUNT);
    await page.evaluate('window.__mountEdges("styled")');
    await sleep(200);
    await page.screenshot(join(OUT, '1-styled.png'));

    console.log('\ndash — a dashed line has a dash pattern');
    const dash = await page.evaluate(`[...document.querySelectorAll('path.twm-flow-graph__edge')]
        .map((p) => getComputedStyle(p).strokeDasharray)`);
    check('the dashed line has one', dash[0] && dash[0] !== 'none', JSON.stringify(dash));
    check('the plain line has none', dash[1] === 'none', JSON.stringify(dash));
    const strokes = await page.evaluate(`[...document.querySelectorAll('path.twm-flow-graph__edge')]
        .map((p) => [getComputedStyle(p).stroke, getComputedStyle(p).strokeWidth])`);
    check('the toned line takes its tone; the plain one keeps the old stroke and width',
          strokes[0][0] !== strokes[1][0] && strokes[1][0] === 'rgb(143, 180, 216)' && strokes[1][1] === '1.6px',
          JSON.stringify(strokes));

    console.log('\narrow — the arrowhead ends the line at the input port');
    const arrow = await page.evaluate(`(() => {
        const head = document.querySelector('.twm-flow-graph__edge-arrow');
        const m = head.getScreenCTM(); const tip = head.getPointAtLength(0);
        const dot = document.querySelector('.twm-flow-graph__node[data-node-id="b"] .twm-flow-graph__port[data-direction="input"] .twm-flow-graph__port-dot').getBoundingClientRect();
        const line = document.querySelector('path.twm-flow-graph__edge'); const lm = line.getScreenCTM();
        const end = line.getPointAtLength(line.getTotalLength());
        return { tip: { x: m.a * tip.x + m.e, y: m.d * tip.y + m.f }, dot: { y: dot.top + dot.height / 2, left: dot.left },
                 end: { x: lm.a * end.x + lm.e, y: lm.d * end.y + lm.f },
                 port: document.querySelector('.twm-flow-graph__node[data-node-id="b"]').getBoundingClientRect().left,
                 fill: getComputedStyle(head).fill };
    })()`);
    check('its tip is at the node\'s edge, beside the input dot (within 8px), on its centre line (within 1px)',
          Math.abs(arrow.tip.x - arrow.port) <= 8 && Math.abs(arrow.tip.y - arrow.dot.y) <= 1, JSON.stringify(arrow));
    check('the line ends at its base, 9px out', Math.abs(arrow.tip.x - arrow.end.x - 9) <= 1 && Math.abs(arrow.end.y - arrow.tip.y) <= 1,
          JSON.stringify(arrow));
    check('it is filled in the line\'s tone', arrow.fill === strokes[0][0], JSON.stringify(arrow.fill));

    console.log('\nlabel — at the midpoint, over the step the line crosses');
    const line = await page.evaluate(SAMPLE);
    const tag = await centre(page, '.twm-flow-graph__edge-label');
    check('the label is centred on the line\'s midpoint (within 1.5px)',
          Math.abs(tag.x - line.mid.x) <= 1.5 && Math.abs(tag.y - line.mid.y) <= 1.5, JSON.stringify({ tag, mid: line.mid }));
    const under = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-graph__node[data-node-id="c"]').getBoundingClientRect();
        return ${JSON.stringify(line.mid)}.x > r.left && ${JSON.stringify(line.mid)}.x < r.right
            && ${JSON.stringify(line.mid)}.y > r.top && ${JSON.stringify(line.mid)}.y < r.bottom; })()`);
    check('the midpoint is over a step', under);
    check('the label is the element at its own centre: no step hides it', tag?.hit === true, JSON.stringify(tag));

    console.log('\nhover — a real pointer over a node');
    const head = await centre(page, '.twm-flow-graph__node[data-node-id="a"] .twm-flow-graph__node-title');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: head.x, y: head.y });
    await sleep(50);
    const lit = await page.evaluate(`[...document.querySelectorAll('path.twm-flow-graph__edge')]
        .map((p) => [p.classList.contains('twm-flow-graph__edge--highlighted'), getComputedStyle(p).stroke, getComputedStyle(p).strokeWidth])`);
    check('its line is highlighted, and drawn so', lit[0][0] && !lit[1][0] && lit[0][1] !== strokes[0][0], JSON.stringify(lit));
    await page.screenshot(join(OUT, '2-hover.png'));
    const empty = await page.evaluate(`(() => { const r = document.querySelector('.twm-canvas').getBoundingClientRect(); return { x: r.left + 40, y: r.bottom - 40 }; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: empty.x, y: empty.y });
    await sleep(50);
    const off = await page.evaluate(`[...document.querySelectorAll('path.twm-flow-graph__edge')]
        .map((p) => [p.classList.contains('twm-flow-graph__edge--highlighted'), getComputedStyle(p).stroke])`);
    check('moving off takes the highlight away', !off[0][0] && off[0][1] === strokes[0][0], JSON.stringify(off));

    console.log('\nrouting — round the step between its ends');
    await page.evaluate('window.__mountEdges("routed")');
    await sleep(200);
    await page.screenshot(join(OUT, '3-routed.png'));
    const routed = await page.evaluate(SAMPLE);
    const box = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-graph__node[data-node-id="c"]').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
    const inside = routed.points.filter((p) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom);
    check('no point of the line is inside the step\'s drawn box', inside.length === 0, JSON.stringify({ box, inside: inside.slice(0, 3) }));
    const strip = await page.evaluate('document.querySelectorAll(".twm-flow-strip__line").length');
    check('under the limit the strip says nothing', strip === 0, String(strip));
    await page.evaluate('window.__mountEdges("crowded")');
    await sleep(200);
    const said = await page.evaluate(`(() => { const l = document.querySelector('.twm-flow-strip__line[data-code="canvas-routing-simple"]');
        if (!l) return null; const r = l.getBoundingClientRect(); return { text: l.textContent, h: r.height }; })()`);
    check('above the limit the strip says the lines are plain curves, drawn with a size', Boolean(said) && said.h > 0,
          JSON.stringify(said));
    await page.screenshot(join(OUT, '4-crowded.png'));
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow canvas edges probe: ${failures} FAILED (screenshots in ${OUT})`
    : `\nflow canvas edges probe: every check held (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
