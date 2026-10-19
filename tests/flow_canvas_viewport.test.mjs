/**
 * THE CANVAS EDITOR'S VIEWPORT (STORY-0082) — where the reader looks is the
 * consumer's to keep, and the editor stores none of it:
 *
 *   §1  opt-in: an editor given none of the options has no zoom buttons, no
 *       minimap, the toolbar it always had, and serialises the same bytes
 *   §2  `viewport` (the option, and `load`'s) opens there and does not fit;
 *       `getViewport` / `setViewport` read and set it, clamped, unreported
 *   §3  `onViewportChange` fires ONCE per finished gesture — a pan's release,
 *       a run of wheel turns once still, Fit, a zoom button, *Go to it* — never
 *       per pointer move, never for what the consumer set itself, never for a
 *       gesture that ended where it began; a waiting wheel report is handed on
 *       by the next press and by destroy
 *   §4  `zoomControls: true`: −, + and 100% after Fit; fixed steps, about the
 *       centre of the view; refused, with the sentence, at the kernel's limits
 *   §5  `minimap: true`: the steps and the view's frame drawn small; a click
 *       centres the view on that point and is reported once; it follows edits
 *       and pans, and the canvas changing size; destroy takes it away
 *
 * jsdom computes no layout: each canvas is given a rectangle. Where the
 * minimap and the zoom buttons are drawn on screen, and a real click on the
 * minimap, are checked in headless Edge by `demo/flow_canvas_probe.mjs`.
 *
 *     node tests/flow_canvas_viewport.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — viewport');
const { window: w } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue } = flow;
const { CanvasAdapter } = await import('../canvas.js');

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const catalogue = createStepCatalogue([
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'note', label: 'Note', category: 'control', ports: [F('in', 'input'), F('out', 'output')] },
], { categories: [{ id: 'control', label: 'Flow', tone: 'violet' }] });
const GRAPH = {
    nodes: [{ id: 'start', type: 'start', config: {}, position: { x: 80, y: 120 } },
            { id: 'jot', type: 'note', config: {}, position: { x: 400, y: 120 } },
            { id: 'far', type: 'note', config: {}, position: { x: 1200, y: 600 } }],
    connections: [{ source: 'start', target: 'jot', sourcePort: 'out', targetPort: 'in' }],
};
const RECT = { left: 100, top: 50, width: 800, height: 600 };

function mount(opts = {}, { graph = GRAPH, load = {} } = {}) {
    const host = t.host();
    const views = [];
    const editor = createCanvasEditor(host, { catalogue, onViewportChange: (v) => views.push(v), ...opts });
    const canvasEl = editor.el.querySelector('.twm-canvas');
    canvasEl.getBoundingClientRect = () => ({ ...RECT, x: RECT.left, y: RECT.top, right: RECT.left + RECT.width,
                                              bottom: RECT.top + RECT.height });
    editor.load({ graph: structuredClone(graph) }, load);
    return { editor, host, views, el: editor.el, canvasEl };
}
const view = (m) => {
    const x = /translate\(([-\d.e+]+)px, ([-\d.e+]+)px\) scale\(([-\d.e+]+)\)/
        .exec(m.el.querySelector('.twm-canvas__surface').style.transform);
    return x ? { tx: Number(x[1]), ty: Number(x[2]), scale: Number(x[3]) } : null;
};
const tool = (m, id) => m.el.querySelector(`.twm-flow-graph__toolbar [data-action="${id}"]`);
const toolIds = (m) => [...m.el.querySelectorAll('.twm-flow-graph__toolbar [data-action]')].map((b) => b.dataset.action);
const pointer = (type, init = {}) => new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
const wheel = (init = {}) => new w.WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
const near = (a, b) => Math.abs(a - b) < 1e-9;

t.section('§1 none of the options: nothing changes');
{
    const plain = createCanvasEditor(t.host(), { catalogue });
    plain.load({ graph: structuredClone(GRAPH) });
    const withAll = mount({ zoomControls: true, minimap: true, viewport: { scale: 0.5, tx: 10, ty: 20 } });
    t.check('the toolbar is Undo, Redo, Arrange, Fit', toolIds({ el: plain.el }), ['undo', 'redo', 'arrange', 'fit']);
    t.ok('no minimap in the DOM', plain.el.querySelector('.twm-flow-graph__minimap') === null
         && plain.el.querySelector('[class*="minimap"]') === null);
    t.ok('the same bytes as an editor given every option', plain.serialise() === withAll.editor.serialise()
         && plain.snapshot() === withAll.editor.snapshot());
    t.ok('and no undo entry for opening at a viewport', withAll.editor.history.canUndo === false);
    plain.destroy();
    withAll.editor.destroy();
}

t.section('§2 a viewport to open at, and getViewport / setViewport');
{
    const at = { scale: 0.5, tx: -30, ty: 45 };
    const m = mount({ viewport: at });
    t.check('the option: opened at that scale and position', m.editor.getViewport(), at);
    await t.tick(40);                                     // the frame a fit would have taken
    t.check('and no fit came after it', view(m), { tx: at.tx, ty: at.ty, scale: at.scale });
    t.ok('nothing reported: the consumer set it', m.views.length === 0);
    m.editor.load({ graph: structuredClone(GRAPH) });
    await t.tick(40);
    t.ok('the option is the FIRST load\'s; a later load fits as before', view(m).scale !== 0.5 || view(m).tx !== -30,
         JSON.stringify(view(m)));

    const l = mount({}, { load: { viewport: { scale: 2, tx: 5, ty: 6 } } });
    await t.tick(40);
    t.check('load(…, {viewport}) opens there and does not fit', view(l), { tx: 5, ty: 6, scale: 2 });
    t.ok('unreported', l.views.length === 0);
    const f = mount();
    await t.tick(40);
    t.ok('without one, load fits as it always did', !near(view(f).tx, 0) || !near(view(f).ty, 0), JSON.stringify(view(f)));
    t.ok('and a fit on opening is not reported either', f.views.length === 0);

    const s = mount();
    t.ok('setViewport answers true', s.editor.setViewport({ scale: 1.5, tx: 1, ty: 2 }) === true);
    await t.tick(40);
    t.check('setViewport before the opening fit\'s frame: the fit is dropped', s.editor.getViewport(),
            { scale: 1.5, tx: 1, ty: 2 });
    s.editor.setViewport({ scale: 99, tx: 0, ty: 0 });
    t.ok('clamped to the kernel\'s ceiling', s.editor.getViewport().scale === CanvasAdapter.MAX_SCALE);
    s.editor.setViewport({ scale: 0.001, tx: 0, ty: 0 });
    t.ok('and its floor', s.editor.getViewport().scale === CanvasAdapter.MIN_SCALE);
    t.ok('a broken viewport is refused and changes nothing', s.editor.setViewport({ scale: 'x' }) === false
         && s.editor.setViewport(null) === false && s.editor.getViewport().scale === CanvasAdapter.MIN_SCALE);
    t.ok('getViewport is a copy', (() => { const v = s.editor.getViewport(); v.scale = 3; return s.editor.getViewport().scale; })()
         === CanvasAdapter.MIN_SCALE);
    t.ok('none of it reported', s.views.length === 0);
    for (const x of [m, l, f, s]) x.editor.destroy();
}

t.section('§3 one report per finished gesture');
{
    const m = mount({ viewport: { scale: 1, tx: 0, ty: 0 } });
    const c = m.canvasEl;
    c.dispatchEvent(pointer('pointerdown', { button: 1, clientX: 300, clientY: 300 }));
    for (let i = 1; i <= 12; i += 1) w.dispatchEvent(pointer('pointermove', { clientX: 300 + i * 10, clientY: 300 + i * 5 }));
    t.ok('a pan in progress: twelve moves, no report', m.views.length === 0);
    t.ok('the view did move', view(m).tx === 120 && view(m).ty === 60);
    w.dispatchEvent(pointer('pointerup', { clientX: 420, clientY: 360 }));
    t.check('released: ONE report, where it ended', m.views, [{ scale: 1, tx: 120, ty: 60 }]);
    w.dispatchEvent(pointer('pointerup', {}));
    t.ok('a second release reports nothing', m.views.length === 1);

    c.dispatchEvent(pointer('pointerdown', { button: 1, clientX: 300, clientY: 300 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 340, clientY: 300 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 300 }));
    w.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 300 }));
    t.ok('a pan that ends where it began is no change', m.views.length === 1);

    c.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 300, clientY: 300 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 380, clientY: 380 }));
    w.dispatchEvent(pointer('pointerup', { clientX: 380, clientY: 380 }));
    t.ok('a marquee moves no view and reports nothing', m.views.length === 1);

    for (let i = 0; i < 6; i += 1) c.dispatchEvent(wheel({ deltaY: -100, ctrlKey: true, clientX: 500, clientY: 350 }));
    t.ok('six wheel turns: no report while they come', m.views.length === 1);
    await t.tick(500);
    t.ok('once the wheel is still, ONE', m.views.length === 2 && near(m.views[1].scale, view(m).scale) && view(m).scale > 1,
         JSON.stringify(m.views));

    c.dispatchEvent(wheel({ deltaY: 40 }));
    c.dispatchEvent(pointer('pointerdown', { button: 1, clientX: 300, clientY: 300 }));
    t.ok('a press hands on a wheel report still waiting, at once', m.views.length === 3 && m.views[2].ty === view(m).ty);
    w.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 300 }));
    await t.tick(500);
    t.ok('and it is not reported twice', m.views.length === 3);

    tool(m, 'fit').click();
    t.ok('Fit is one report', m.views.length === 4);
    tool(m, 'fit').click();
    t.ok('a second Fit, nothing moved, none', m.views.length === 4);
    m.editor.fit({ whole: false });
    m.editor.setViewport({ scale: 1, tx: 3, ty: 3 });
    t.ok('the consumer\'s own fit() and setViewport are not reported back', m.views.length === 4);
    const was = JSON.stringify(m.editor.getViewport());
    tool(m, 'arrange').click();
    const moved = JSON.stringify(m.editor.getViewport()) !== was;
    t.ok('Arrange frames what it laid out: one report', moved && m.views.length === 5, `${moved} ${m.views.length}`);

    // a node's header press moves the node, not the view
    const before = m.views.length;
    const head = m.el.querySelector('.twm-flow-graph__node[data-node-id="jot"] .twm-flow-graph__node-head');
    head.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 90, clientY: 10 }));
    w.dispatchEvent(pointer('pointerup', { clientX: 90, clientY: 10 }));
    t.ok('moving a step reports no viewport', m.views.length === before);

    c.dispatchEvent(wheel({ deltaY: 30 }));
    m.editor.destroy();
    t.ok('destroy hands on a wheel report still waiting', m.views.length === before + 1);
    await t.tick(500);
    t.ok('and nothing after it', m.views.length === before + 1);
}

t.section('§4 the zoom buttons');
{
    const m = mount({ zoomControls: true, viewport: { scale: 1, tx: 0, ty: 0 } });
    t.check('after Fit: −, +, 100%', toolIds(m), ['undo', 'redo', 'arrange', 'fit', 'zoom-out', 'zoom-in', 'zoom-reset']);
    t.ok('labelled', tool(m, 'zoom-out').textContent.includes('Zoom out') && tool(m, 'zoom-in').textContent.includes('Zoom in')
         && tool(m, 'zoom-reset').textContent.includes('100%'));
    const centre = () => m.editor.canvas.clientToCanvas(RECT.left + RECT.width / 2, RECT.top + RECT.height / 2);
    const c0 = centre();
    tool(m, 'zoom-in').click();
    t.ok('+ is one fixed step: 100% → 125%', view(m).scale === 1.25);
    t.ok('about the centre of the view', near(centre().x, c0.x) && near(centre().y, c0.y), JSON.stringify([centre(), c0]));
    t.check('and one report', m.views.map((v) => v.scale), [1.25]);
    tool(m, 'zoom-in').click();
    tool(m, 'zoom-out').click();
    t.ok('− steps back down the same ladder', view(m).scale === 1.25);
    const ups = [];
    for (let i = 0; i < 20; i += 1) { tool(m, 'zoom-in').click(); ups.push(view(m).scale); }
    t.check('up to the kernel\'s ceiling, and no further', [...new Set(ups)], [1.5, 2, 3, CanvasAdapter.MAX_SCALE]);
    t.ok('+ is refused there, with its sentence', tool(m, 'zoom-in').disabled
         && tool(m, 'zoom-in').dataset.refusal === 'This is as large as the flow is drawn.');
    t.ok('− is not', !tool(m, 'zoom-out').disabled);
    const reports = m.views.length;
    tool(m, 'zoom-in').click();
    t.ok('a refused press reports nothing', m.views.length === reports);
    const downs = [];
    for (let i = 0; i < 20; i += 1) { tool(m, 'zoom-out').click(); downs.push(view(m).scale); }
    t.check('down to the kernel\'s floor, and no further', [...new Set(downs)],
            [3, 2, 1.5, 1.25, 1, 0.8, 0.67, 0.5, 0.33, 0.25, CanvasAdapter.MIN_SCALE]);
    t.ok('− is refused there', tool(m, 'zoom-out').disabled
         && tool(m, 'zoom-out').dataset.refusal === 'This is as small as the flow is drawn.');
    tool(m, 'zoom-reset').click();
    t.ok('100% is natural size', view(m).scale === 1 && !tool(m, 'zoom-out').disabled && !tool(m, 'zoom-in').disabled);
    m.editor.setViewport({ scale: 0.9, tx: 0, ty: 0 });
    tool(m, 'zoom-in').click();
    t.ok('from a scale the wheel left between steps, + goes to the next step', view(m).scale === 1);
    m.editor.setViewport({ scale: 0.9, tx: 0, ty: 0 });
    tool(m, 'zoom-out').click();
    t.ok('and − to the one below', view(m).scale === 0.8);
    m.editor.setViewport({ scale: 4, tx: 0, ty: 0 });
    t.ok('a limit reached by setViewport refuses + too', tool(m, 'zoom-in').disabled);
    m.editor.setReadOnly({ reason: 'Look only.' });
    t.ok('read only still zooms: looking is not editing', !tool(m, 'zoom-out').disabled);
    m.editor.destroy();
    const own = createCanvasEditor(t.host(), { catalogue, actions: [{ id: 'zoom-in', label: 'Mine', run() {} }] });
    t.ok('without zoomControls a consumer\'s verb may be called zoom-in', own.el.querySelector('[data-action="zoom-in"]')
         ?.textContent.includes('Mine'));
    own.destroy();
}

t.section('§5 the minimap');
{
    const m = mount({ minimap: true, viewport: { scale: 1, tx: 0, ty: 0 } });
    const mini = m.el.querySelector('.twm-flow-graph__minimap');
    t.ok('there, inside the canvas column and outside the kernel\'s root', mini && mini.parentElement
         === m.el.querySelector('.twm-flow-graph__canvas') && !m.canvasEl.contains(mini));
    const svg = mini.querySelector('svg.twm-flow-graph__minimap-map');
    t.ok('one box per step, and the view\'s frame', svg.querySelectorAll('.twm-flow-graph__minimap-node').length === 3
         && svg.querySelectorAll('.twm-flow-graph__minimap-view').length === 1);
    t.ok('says what a click does', mini.title === 'Click to move the view there');
    const box = (cls) => { const r = svg.querySelector(cls); return ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k))); };
    // the frame is the visible box: (0,0) 800×600 at scale 1; the far step's box starts at (1200,600)
    const [fx, fy, fw] = box('.twm-flow-graph__minimap-view');
    const k = fw / 800;
    const far = [...svg.querySelectorAll('.twm-flow-graph__minimap-node')][2];
    const mapX = (cx) => fx + cx * k;
    const mapY = (cy) => fy + cy * k;
    t.ok('drawn to one scale', near(Number(far.getAttribute('x')), mapX(1200)) && near(Number(far.getAttribute('y')), mapY(600)));

    svg.getBoundingClientRect = () => ({ left: 700, top: 500, width: 180, height: 120, right: 880, bottom: 620, x: 700, y: 500 });
    const target = { x: 1304, y: 640 };
    mini.dispatchEvent(pointer('click', { clientX: 700 + mapX(target.x), clientY: 500 + mapY(target.y) }));
    const centre = m.editor.canvas.clientToCanvas(RECT.left + RECT.width / 2, RECT.top + RECT.height / 2);
    t.ok('a click centres the view on that point', Math.abs(centre.x - target.x) < 1e-6 && Math.abs(centre.y - target.y) < 1e-6,
         JSON.stringify(centre));
    t.ok('at the scale it was', view(m).scale === 1);
    t.check('one report', m.views.length, 1);
    const [nx] = box('.twm-flow-graph__minimap-view');
    t.ok('the frame followed', nx !== fx);

    m.editor.setViewport({ scale: 2, tx: 0, ty: 0 });
    const [, , w2] = box('.twm-flow-graph__minimap-view');
    t.ok('a zoom redraws the frame', near(w2 / k, 400) || w2 !== fw);
    const head = m.el.querySelector('.twm-flow-graph__node[data-node-id="far"] .twm-flow-graph__node-head');
    const x0 = Number(far.getAttribute('x'));
    head.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 410, clientY: 10 }));
    w.dispatchEvent(pointer('pointerup', { clientX: 410, clientY: 10 }));
    const farNow = [...svg.querySelectorAll('.twm-flow-graph__minimap-node')][2];
    t.ok('a moved step moves on the minimap', Number(farNow.getAttribute('x')) !== x0);
    m.editor.load({ graph: { nodes: [], connections: [] } });
    t.ok('an empty flow: no step boxes', svg.querySelectorAll('.twm-flow-graph__minimap-node').length === 0);
    const reports = m.views.length;
    mini.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 710, clientY: 510 }));
    w.dispatchEvent(pointer('pointermove', { clientX: 760, clientY: 560 }));
    w.dispatchEvent(pointer('pointerup', { clientX: 760, clientY: 560 }));
    t.ok('a press on the minimap is no pan and no marquee of the kernel', m.views.length === reports
         && m.el.querySelector('.twm-canvas__marquee').hidden);
    m.editor.destroy();
    t.ok('destroy takes it away', !mini.isConnected);
}

t.section('§5 the minimap follows the canvas\'s size');
{
    // A ResizeObserver that this suite fires by hand: jsdom has none of its own.
    const observers = [];
    const Stub = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
        constructor(cb) { this.cb = cb; this.targets = []; this.live = true; observers.push(this); }
        observe(el) { this.targets.push(el); }
        unobserve() {}
        disconnect() { this.live = false; this.targets = []; }
    };
    const plain = createCanvasEditor(t.host(), { catalogue });
    t.ok('without the minimap, the editor watches nothing for it', !observers.some((o) => o.targets.length));
    plain.destroy();
    observers.length = 0;

    const host = t.host();
    const editor = createCanvasEditor(host, { catalogue, minimap: true });
    const canvasEl = editor.el.querySelector('.twm-canvas');
    let rect = { left: 0, top: 0, width: 0, height: 0 };
    canvasEl.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width,
                                              bottom: rect.top + rect.height });
    editor.load({ graph: structuredClone(GRAPH) }, { viewport: { scale: 1, tx: 0, ty: 0 } });
    const svg = editor.el.querySelector('svg.twm-flow-graph__minimap-map');
    const frame = () => { const r = svg.querySelector('.twm-flow-graph__minimap-view');
        return r && { w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) }; };
    const watching = observers.filter((o) => o.targets.includes(canvasEl));
    t.check('the minimap watches the kernel\'s root', watching.length, 1);
    const fire = () => watching[0].cb([{ target: canvasEl }]);
    t.ok('built before it was laid out: no frame yet', frame() === null);

    rect = { left: 100, top: 50, width: 800, height: 600 };
    fire();
    const a = frame();
    t.ok('laid out: the frame is drawn, the view\'s shape', a && near(a.w / a.h, 800 / 600), JSON.stringify(a));
    rect = { left: 100, top: 50, width: 1600, height: 600 };
    fire();
    const b = frame();
    t.ok('the canvas twice as wide: the frame\'s width follows, its height does not grow',
         b && b.w > a.w && b.h <= a.h && near(b.w / b.h, 1600 / 600), JSON.stringify({ a, b }));
    rect = { left: 100, top: 50, width: 400, height: 900 };
    fire();
    const c = frame();
    t.ok('taller and narrower: the frame\'s height follows', c && near(c.w / c.h, 400 / 900) && c.h > b.h,
         JSON.stringify({ b, c }));
    editor.destroy();
    t.ok('destroy disconnects it', watching[0].live === false);
    globalThis.ResizeObserver = Stub;
}

t.done();
