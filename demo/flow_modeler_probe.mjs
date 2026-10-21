/**
 * THE MODELER DEMO IN A REAL BROWSER (STORY-0084) — demo/flow_modeler.html,
 * the canvas editor with every modeler option on, driven in headless Edge with
 * real input over the DevTools protocol, each step measured:
 *
 *   opens      a real click on demo/index.html's link opens the page
 *   shows      custom node bodies (drawn at their own size, below their
 *              ports), data connections whose lines start on their output
 *              dots and whose arrowheads end on their input dots (within
 *              1px), the group frame round both sources, a note, a dashed
 *              line (computed dash pattern) and a label on its line's
 *              midpoint that is the element at its own centre
 *   live       the badges change at least once in every second while a real
 *              click has put the focus in a settings field, which keeps it
 *   connect    a real pointer drag from Mix's Out onto Meter's In: one line
 *              more, drawn from dot to dot, one undo entry
 *   group      a real click and Shift+click pick Scale and Mix, a real Ctrl+G
 *              draws a second frame, round both of them and nothing else
 *   paste      real Ctrl+C, Ctrl+V: two new steps, two grid steps right and
 *              down of the originals on the screen, with the line between them
 *   arrange    a real click on Arrange: every line runs left to right, the
 *              sources are in the first column and the displays in the last,
 *              no two steps overlap, one undo entry
 *   undo       a real Ctrl+Z after each of the four, last first: the steps are
 *              back where they were on the screen, the copies are gone, the
 *              second frame is gone, the dragged line is gone, and the graph
 *              is the text it was before each step
 *
 *     node demo/flow_modeler_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to
 * out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, key, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-modeler-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NODE = (id) => `.twm-flow-graph__node[data-node-id="${id}"]`;
const PORT = (id, port, dir) => `${NODE(id)} .twm-flow-graph__port[data-port="${port}"][data-direction="${dir}"]`;

/** Every line's two ends against its ports' dots, in viewport pixels. */
const ANCHORS = `(() => {
    const dot = (nodeId, port, dir) => {
        const d = document.querySelector('.twm-flow-graph__node[data-node-id="' + nodeId + '"] .twm-flow-graph__port[data-port="'
            + port + '"][data-direction="' + dir + '"] .twm-flow-graph__port-dot').getBoundingClientRect();
        return { x: d.left + d.width / 2, y: d.top + d.height / 2, r: d.width / 2 };
    };
    const screen = (p, len) => { const m = p.getScreenCTM(); const q = p.getPointAtLength(len);
        return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
    const off = (p, d) => Math.round(Math.max(0, Math.hypot(p.x - d.x, p.y - d.y) - d.r) * 10) / 10;
    const g = window.__flowModeler.editor.getGraph();
    const lines = [...document.querySelectorAll('path.twm-flow-graph__edge')];
    const heads = [...document.querySelectorAll('path.twm-flow-graph__edge-arrow')];
    return g.connections.map((c, i) => {
        const a = dot(c.source, c.sourcePort, 'output');
        const b = dot(c.target, c.targetPort, 'input');
        return { edge: c.source + '.' + c.sourcePort + '>' + c.target + '.' + c.targetPort,
                 // the line leaves its output dot; its arrowhead's tip is on the input dot's centre line, at the node's edge
                 start: off(screen(lines[i], 0), a), startY: Math.round(Math.abs(screen(lines[i], 0).y - a.y) * 10) / 10,
                 tipY: heads[i] ? Math.round(Math.abs(screen(heads[i], 0).y - b.y) * 10) / 10 : null,
                 tipX: heads[i] ? Math.round(Math.abs(screen(heads[i], 0).x - b.x) * 10) / 10 : null };
    });
})()`;
const anchored = (list) => list.every((a) => a.start <= 1 && a.startY <= 1 && a.tipY !== null && a.tipY <= 1 && a.tipX <= 8);

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1500, height: 900 });
let page;
try {
    console.log('\nopens — from demo/index.html');
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/index.html`);
    const link = await centre(page, 'a[href="./flow_modeler.html"]');
    check('index.html shows the link, and it is the element at its own centre', link?.hit === true, JSON.stringify(link));
    const loaded = new Promise((ok) => page.on('Page.loadEventFired', ok));
    await click(page, link.x, link.y);
    await loaded;
    await page.waitFor('window.__flowModeler && window.__flowModeler.ready');
    await sleep(400);                                      // the load's requestAnimationFrame fit
    check('a real click on it opens the modeler page',
          (await page.evaluate('location.pathname')) === '/demo/flow_modeler.html');
    await page.screenshot(join(OUT, '1-opened.png'));
    const graphText = () => page.evaluate('window.__flowModeler.editor.serialise()');
    const graph = async () => JSON.parse(await graphText());
    const depth = () => page.evaluate('window.__flowModeler.editor.history.depth');
    const rects = () => page.evaluate(`Object.fromEntries([...document.querySelectorAll('.twm-flow-graph__node')].map((n) => {
        const r = n.getBoundingClientRect();
        return [n.dataset.nodeId, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }];
    }))`);
    /** The same boxes in canvas coordinates: where the steps are, whatever the view (Arrange moves the view). */
    const placed = () => page.evaluate(`(() => { const c = window.__flowModeler.editor.canvas;
        return Object.fromEntries([...document.querySelectorAll('.twm-flow-graph__node')].map((n) => {
            const r = n.getBoundingClientRect(); const a = c.clientToCanvas(r.left, r.top); const b = c.clientToCanvas(r.right, r.bottom);
            return [n.dataset.nodeId, { left: a.x, top: a.y, right: b.x, bottom: b.y }];
        })); })()`);
    const frames = () => page.evaluate(`[...document.querySelectorAll('.twm-flow-graph__group')].map((f) => {
        const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    })`);
    const inside = (b, f) => b.left > f.left && b.top > f.top && b.right < f.right && b.bottom < f.bottom;
    const lineCount = () => page.evaluate('document.querySelectorAll("path.twm-flow-graph__edge").length');

    console.log('\nshows — bodies, data connections, a group, a note and styled lines');
    const bodies = await page.evaluate(`(() => {
        const scale = window.__flowModeler.editor.canvas.scale;
        const box = (id) => { const n = document.querySelector('.twm-flow-graph__node[data-node-id="' + id + '"]');
            const r = n.getBoundingClientRect(); const body = n.querySelector('.twm-flow-graph__node-body');
            const rows = n.querySelectorAll('.twm-flow-graph__node-row');
            return { w: r.width / scale, h: r.height / scale, body: Boolean(body),
                     below: Boolean(body) && body.getBoundingClientRect().top >= rows[rows.length - 1].getBoundingClientRect().bottom - 0.5,
                     control: body ? body.firstElementChild?.tagName : null }; };
        return { gain: box('scale'), display: box('scope') };
    })()`);
    check('Scale draws its own body, a slider, below its ports, at its 224×132 box',
          bodies.gain.body && bodies.gain.below && Math.abs(bodies.gain.w - 224) <= 1 && Math.abs(bodies.gain.h - 132) <= 1,
          JSON.stringify(bodies.gain));
    check('Scope draws its own readout, below its port, at its 200×112 box',
          bodies.display.body && bodies.display.below && bodies.display.control === 'OUTPUT'
          && Math.abs(bodies.display.w - 200) <= 1 && Math.abs(bodies.display.h - 112) <= 1, JSON.stringify(bodies.display));
    const anchors0 = await page.evaluate(ANCHORS);
    check('four data connections, each from its output dot to an arrowhead on its input dot (within 1px)',
          anchors0.length === 4 && anchored(anchors0), JSON.stringify(anchors0));
    const r0 = await rects();
    const f0 = await frames();
    check('one group frame, round both sources and nothing else', f0.length === 1 && inside(r0.wave, f0[0]) && inside(r0.drift, f0[0])
          && !inside(r0.scale, f0[0]) && !inside(r0.mix, f0[0]), JSON.stringify({ f0, wave: r0.wave, drift: r0.drift }));
    const note = await centre(page, '.twm-flow-graph__note');
    check('a note, the element at its own centre', note?.hit === true, JSON.stringify(note));
    const dash = await page.evaluate(`[...document.querySelectorAll('path.twm-flow-graph__edge')].map((p) => getComputedStyle(p).strokeDasharray)`);
    check('the subtracted line is dashed, the others are not', dash.filter((d) => d && d !== 'none').length === 1, JSON.stringify(dash));
    const label = await centre(page, '.twm-flow-graph__edge-label');
    check('the gain\'s line carries its factor, the element at its own centre', label?.hit === true
          && (await page.evaluate('document.querySelector(".twm-flow-graph__edge-label").textContent')) === '× 1.50', JSON.stringify(label));

    console.log('\nlive — badges at least once a second, the focus kept');
    const waveTitle = await centre(page, `${NODE('wave')} .twm-flow-graph__node-title`);
    await click(page, waveTitle.x, waveTitle.y);
    await sleep(80);
    const field = await centre(page, '.twm-flow-panel [data-field="period"] input');
    await click(page, field.x, field.y);
    await sleep(50);
    const focusedIs = () => page.evaluate(`document.activeElement === document.querySelector('.twm-flow-panel [data-field="period"] input')`);
    check('a real click put the focus in a settings field', await focusedIs());
    const samples = [];
    for (let i = 0; i <= 15; i += 1) {
        samples.push({ at: i * 200, badge: await page.evaluate(`document.querySelector('${NODE('mix')} .twm-flow-graph__node-badge')?.textContent`) });
        await sleep(200);
    }
    const seconds = [0, 1, 2].map((s) => new Set(samples.filter((x) => x.at >= s * 1000 && x.at <= (s + 1) * 1000).map((x) => x.badge)).size);
    check('the badge changed in each of three seconds', seconds.every((n) => n >= 2), JSON.stringify({ seconds, samples }));
    check('the settings field kept the focus throughout', await focusedIs());
    check('and the live values made no undo entry', (await depth()) === 0 && (await page.evaluate('window.__flowModeler.changes')) === 0);
    await page.screenshot(join(OUT, '2-live.png'));
    // The rest measures geometry: the badges keep changing, nothing moves for them.
    const empty = await page.evaluate(`(() => { const r = document.querySelector('.twm-canvas').getBoundingClientRect(); return { x: r.left + 24, y: r.bottom - 24 }; })()`);
    await click(page, empty.x, empty.y);
    await sleep(50);

    console.log('\nconnect — a real drag from an output onto an input');
    const before1 = await graphText();
    const rBefore1 = await placed();
    // Pressed on the output and moved past the drag threshold, the line
    // starts; only then is the input aimed at, where it is drawn NOW (the
    // gesture line above the canvas has just appeared and moved everything
    // under it down), as a reader's eye would aim.
    const out = await centre(page, `${PORT('mix', 'out', 'output')} .twm-flow-graph__port-dot`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: out.x, y: out.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: out.x, y: out.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i += 1) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: out.x + 8 * i, y: out.y + 8 * i, button: 'left', buttons: 1 });
    }
    await sleep(50);
    const drawing = await page.evaluate('document.querySelectorAll("path.twm-flow-graph__edge--draft").length');
    const into = await centre(page, `${PORT('meter', 'in', 'input')} .twm-flow-graph__port-dot`);
    const canDrop = await page.evaluate(`document.querySelector('${PORT('meter', 'in', 'input')}').classList.contains('twm-flow-graph__port--can-drop')`);
    check('a real press and move on Mix\'s Out draws a line, and Meter\'s In may take it', drawing === 1 && canDrop && into?.hit === true,
          JSON.stringify({ drawing, canDrop, into }));
    for (let i = 1; i <= 10; i += 1) {
        const x = out.x + 32 + ((into.x - out.x - 32) * i) / 10;
        const y = out.y + 32 + ((into.y - out.y - 32) * i) / 10;
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: into.x, y: into.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(80);
    const g1 = await graph();
    const anchors1 = await page.evaluate(ANCHORS);
    check('one line more, Mix\'s Out to Meter\'s In', g1.connections.length === 5
          && g1.connections.some((c) => c.source === 'mix' && c.sourcePort === 'out' && c.target === 'meter' && c.targetPort === 'in'),
          JSON.stringify(g1.connections));
    check('drawn from its output dot to an arrowhead on Meter\'s input dot (within 1px), as every other line is',
          (await lineCount()) === 5 && anchored(anchors1), JSON.stringify(anchors1));
    check('as one undo entry', (await depth()) === 1, String(await depth()));
    await page.screenshot(join(OUT, '3-connected.png'));

    console.log('\ngroup — two steps picked by real clicks, a real Ctrl+G');
    const before2 = await graphText();
    const scaleTitle = await centre(page, `${NODE('scale')} .twm-flow-graph__node-title`);
    const mixTitle = await centre(page, `${NODE('mix')} .twm-flow-graph__node-title`);
    await click(page, scaleTitle.x, scaleTitle.y);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mixTitle.x, y: mixTitle.y, modifiers: 8 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mixTitle.x, y: mixTitle.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mixTitle.x, y: mixTitle.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
    await sleep(50);
    const picked = await page.evaluate('[...document.querySelectorAll(".twm-flow-graph__node--picked")].map((n) => n.dataset.nodeId)');
    check('a real click and Shift+click pick Scale and Mix', JSON.stringify(picked) === JSON.stringify(['scale', 'mix']), JSON.stringify(picked));
    await key(page, 'g', { mods: ['ctrl'] });
    await sleep(80);
    const g2 = await graph();
    const r2 = await rects();
    const f2 = await frames();
    const second = f2.find((f) => inside(r2.scale, f));
    check('the graph has a second group of exactly Scale and Mix', g2.groups.length === 2
          && JSON.stringify(g2.groups[1].nodes) === JSON.stringify(['scale', 'mix']), JSON.stringify(g2.groups));
    check('a second frame is drawn round both and round nothing else', f2.length === 2 && second && inside(r2.mix, second)
          && ['wave', 'drift', 'scope', 'meter'].every((id) => !inside(r2[id], second)), JSON.stringify({ f2, r2 }));
    check('as one undo entry', (await depth()) === 2, String(await depth()));
    await page.screenshot(join(OUT, '4-grouped.png'));

    console.log('\npaste — real Ctrl+C and Ctrl+V');
    const before3 = await graphText();
    await key(page, 'c', { mods: ['ctrl'] });
    await sleep(30);
    await key(page, 'v', { mods: ['ctrl'] });
    await sleep(80);
    const g3 = await graph();
    const made = g3.nodes.map((n) => n.id).filter((id) => !JSON.parse(before3).nodes.some((n) => n.id === id));
    const r3 = await rects();
    const shift = await page.evaluate('window.__flowModeler.editor.canvas.gridSize * 2 * window.__flowModeler.editor.canvas.scale');
    const copyOf = (id) => made.find((m) => g3.nodes.find((n) => n.id === m).type === JSON.parse(before3).nodes.find((n) => n.id === id).type);
    const sGain = copyOf('scale');
    const sMix = copyOf('mix');
    check('two new steps, a gain and a sum', made.length === 2 && Boolean(sGain) && Boolean(sMix), JSON.stringify(made));
    check('on the screen two grid steps right of and below the originals (within 1px)',
          [['scale', sGain], ['mix', sMix]].every(([a, b]) => r3[b] && Math.abs(r3[b].left - r3[a].left - shift) <= 1
                                                    && Math.abs(r3[b].top - r3[a].top - shift) <= 1),
          JSON.stringify({ shift, scale: r3.scale, copy: r3[sGain], mix: r3.mix, mixCopy: r3[sMix] }));
    const anchors3 = await page.evaluate(ANCHORS);
    check('with the line between them, drawn dot to dot', g3.connections.some((c) => c.source === sGain && c.target === sMix
          && c.targetPort === 'a') && (await lineCount()) === g3.connections.length && anchored(anchors3), JSON.stringify(anchors3));
    check('as one undo entry', (await depth()) === 3, String(await depth()));
    await page.screenshot(join(OUT, '5-pasted.png'));

    console.log('\narrange — a real click on Arrange');
    await key(page, 'Escape');
    await sleep(30);
    const before4 = await graphText();
    const rBefore4 = await placed();
    const arrange = await centre(page, '.twm-flow-graph__toolbar [data-action="arrange"]');
    await click(page, arrange.x, arrange.y);
    await sleep(120);
    const g4 = await graph();
    const r4 = await rects();
    const ltr = g4.connections.filter((c) => !(r4[c.source].right < r4[c.target].left));
    check('every line runs left to right', ltr.length === 0, JSON.stringify(ltr));
    const lefts = Object.values(r4).map((r) => r.left);
    const sources = g4.nodes.filter((n) => n.type === 'source').map((n) => n.id);
    const displays = g4.nodes.filter((n) => n.type === 'display').map((n) => n.id);
    check('the sources are in the first column, the displays in the last',
          sources.every((id) => Math.abs(r4[id].left - Math.min(...lefts)) <= 1)
          && displays.every((id) => Math.abs(r4[id].left - Math.max(...lefts)) <= 1), JSON.stringify(r4));
    const ids = Object.keys(r4);
    const overlaps = ids.flatMap((a, i) => ids.slice(i + 1).filter((b) => r4[a].left < r4[b].right && r4[b].left < r4[a].right
                                                                     && r4[a].top < r4[b].bottom && r4[b].top < r4[a].bottom).map((b) => `${a}/${b}`));
    check('no two steps overlap', overlaps.length === 0, JSON.stringify(overlaps));
    check('the lines still meet their dots', anchored(await page.evaluate(ANCHORS)));
    check('as one undo entry', (await depth()) === 4 && (await page.evaluate('window.__flowModeler.editor.history.undoAction')) === 'flow:arrange',
          String(await depth()));
    await page.screenshot(join(OUT, '6-arranged.png'));

    console.log('\nundo — a real Ctrl+Z after each, last first');
    const same = (a, b) => Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every((id) => b[id] && ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[id][k] - b[id][k]) <= 0.5));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(80);
    check('Ctrl+Z: every step is drawn back where it was on the canvas, the graph as before Arrange',
          (await graphText()) === before4 && same(await placed(), rBefore4));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(80);
    const u3 = await rects();
    check('Ctrl+Z: the copies and their line are gone, the graph as before the paste',
          (await graphText()) === before3 && !u3[sGain] && !u3[sMix] && (await lineCount()) === 5, JSON.stringify(Object.keys(u3)));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(80);
    const u2 = await frames();
    check('Ctrl+Z: the second frame is gone, the first still round the sources, the graph as before Ctrl+G',
          (await graphText()) === before2 && u2.length === 1 && inside((await rects()).wave, u2[0]), JSON.stringify(u2));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(80);
    const anchorsU = await page.evaluate(ANCHORS);
    check('Ctrl+Z: the dragged line is gone, the graph as it opened, the steps where they were',
          (await graphText()) === before1 && (await lineCount()) === 4 && anchored(anchorsU) && same(await placed(), rBefore1),
          JSON.stringify(anchorsU));
    check('and nothing is left to undo', (await depth()) === 0, String(await depth()));
    await page.screenshot(join(OUT, '7-undone.png'));
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow modeler probe: ${failures} FAILED (screenshots in ${OUT})`
    : `\nflow modeler probe: every check held (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
