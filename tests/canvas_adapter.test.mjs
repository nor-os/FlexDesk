/**
 * THE CANVAS KERNEL'S BASE LAYER (36 §4.2) — `CanvasAdapter`, moved with its
 * behaviour intact. jsdom computes no layout, so the root's box is stated.
 *
 *   §1  what it builds: the twm-canvas classes, the seven background layers,
 *       and the constructor's synchronous onViewportChange
 *   §2  coordinates, snap, setViewport's clamp, zoomAt keeping the point under
 *       the cursor, fit, visibleBox, contains
 *   §3  bringIntoView PANS and never zooms: already visible moves nothing and
 *       fires nothing; otherwise the minimum move; an oversized box takes its
 *       fallback; a window already inside the box does not move
 *   §4  a press on a NODE is the embedder's — "a node" is any element of the
 *       node layer, or what `nodeSelector` names — and starts no marquee; a
 *       press on the background starts one and clears the selection
 *   §5  the right button: a background right-click is suppressed and handed to
 *       onBackgroundMenu; a right-DRAG pans, and the menu at its end is not a
 *       click; consumeRightDrag is consuming; a node keeps its own menu; a new
 *       press clears a flag left armed by a gesture that ended elsewhere
 *   §6  clear() empties both layers; destroy() takes the root away
 *
 *     node tests/canvas_adapter.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('canvas kernel — base layer');
const { window: w, document } = t;
const { CanvasAdapter } = await import('../src/canvas/canvas_adapter.js');

const BOX = { left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650, x: 100, y: 50 };
const make = (opts = {}) => {
    const host = t.host();
    const views = [];
    const canvas = new CanvasAdapter({ container: host, onViewportChange: (v) => views.push(v), ...opts });
    canvas.root.getBoundingClientRect = () => BOX;
    return { host, canvas, views };
};
const pointer = (type, target, init = {}) => target.dispatchEvent(new w.MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0, ...init }));
const menu = (target) => {
    const e = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    target.dispatchEvent(e);
    return e;
};

t.section('§1 what it builds');
{
    const { host, canvas, views } = make();
    t.check('the root and its layers carry the twm-canvas classes',
            [canvas.root.className, canvas.surface.className, canvas.edgeLayer.getAttribute('class'),
             canvas.nodeLayer.className, canvas.marquee.className],
            ['twm-canvas', 'twm-canvas__surface', 'twm-canvas__edges', 'twm-canvas__nodes', 'twm-canvas__marquee']);
    t.ok('the root is in its container, focusable', canvas.root.parentNode === host && canvas.root.tabIndex === 0);
    t.ok('the marquee starts hidden', canvas.marquee.hidden === true);
    t.ok('the edge layer is an SVG with overflow visible', canvas.edgeLayer.namespaceURI === 'http://www.w3.org/2000/svg'
         && canvas.edgeLayer.getAttribute('overflow') === 'visible');
    t.check('the constructor reports the viewport once, synchronously', views, [{ scale: 1, tx: 0, ty: 0 }]);
    t.ok('SEVEN background sizes, the stylesheet\'s seven layers', canvas.root.style.backgroundSize.split(',').length === 7,
         canvas.root.style.backgroundSize);
    // jsdom's style object refuses a seven-layer background-position (it reads
    // back ''), so what `_apply` WRITES is caught on its way in.
    let written = '';
    Object.defineProperty(canvas.root.style, 'backgroundPosition', {
        configurable: true, get: () => written, set: (v) => { written = v; } });
    canvas.setViewport({ tx: 3, ty: 4 });
    t.check('and seven positions, only the four grid layers following the pan', written.split(', '),
            ['0 0', '0 0', '3px 4px', '3px 4px', '3px 4px', '3px 4px', '0 0']);
    canvas.setViewport({ tx: 0, ty: 0 });
    t.ok('the surface is transformed', canvas.surface.style.transform === 'translate(0px, 0px) scale(1)',
         canvas.surface.style.transform);
}

t.section('§2 coordinates and the viewport');
{
    const { canvas } = make();
    t.check('clientToCanvas at scale 1', canvas.clientToCanvas(150, 80), { x: 50, y: 30 });
    canvas.setViewport({ scale: 2, tx: 10, ty: 20 });
    t.check('…and after a pan and a zoom', canvas.clientToCanvas(150, 80), { x: 20, y: 5 });
    t.check('canvasToClient is its inverse', canvas.canvasToClient(20, 5), { x: 150, y: 80 });
    t.check('snap to the 16px grid', [canvas.snap(7), canvas.snap(8), canvas.snap(25)], [0, 16, 32]);
    const free = make({ gridSize: 0 }).canvas;
    t.ok('gridSize 0 snaps nothing', free.snap(7.3) === 7.3);
    canvas.setViewport({ scale: 99 });
    t.ok('the scale is clamped to 4×', canvas.scale === 4);
    canvas.setViewport({ scale: 0.001 });
    t.ok('…and to 0.15×', canvas.scale === 0.15);
    canvas.setViewport({ scale: 1, tx: 0, ty: 0 });
    const before = canvas.clientToCanvas(400, 300);
    canvas.zoomAt(400, 300, 2);
    const after = canvas.clientToCanvas(400, 300);
    t.ok('zoomAt keeps the point under the cursor fixed', Math.abs(before.x - after.x) < 1e-9
         && Math.abs(before.y - after.y) < 1e-9 && canvas.scale === 2, JSON.stringify([before, after]));
    canvas.fit({ x: 0, y: 0, width: 340, height: 120 });
    t.ok('fit frames a box with 60px padding', canvas.scale === 2 && canvas.tx === 60 && canvas.ty === 180,
         JSON.stringify(canvas.viewport()));
    canvas.fit({ x: 0, y: 0, width: 0, height: 10 });
    t.ok('an empty box is not fitted', canvas.scale === 2);
    canvas.setViewport({ scale: 2, tx: -100, ty: -50 });
    t.check('visibleBox is what is on screen, in canvas coordinates', canvas.visibleBox(),
            { x: 50, y: 25, width: 400, height: 300 });
    t.ok('contains: inside', canvas.contains({ x: 60, y: 30, width: 10, height: 10 }));
    t.ok('contains: outside', !canvas.contains({ x: 0, y: 0, width: 10, height: 10 }));
    t.ok('contains: padding counts', !canvas.contains({ x: 50, y: 25, width: 10, height: 10 }, { padding: 20 }));
}

t.section('§3 bringIntoView pans, and only when it must');
{
    const { canvas, views } = make();
    canvas.setViewport({ scale: 1.5, tx: 0, ty: 0 });
    const fired = views.length;
    const still = canvas.bringIntoView({ x: 100, y: 100, width: 50, height: 50 });
    t.check('already visible: nothing moves', still, { moved: false, contained: true });
    t.ok('…and onViewportChange does not fire (no layout save)', views.length === fired);
    t.ok('the scale is the user\'s, untouched', canvas.scale === 1.5);
    const r = canvas.bringIntoView({ x: 600, y: 10, width: 50, height: 50 });
    t.ok('off to the right: moved, and now contained', r.moved && r.contained, JSON.stringify(r));
    t.ok('the minimum move: the far edge lands on the padding', Math.abs((600 + 50) * 1.5 + canvas.tx - (800 - 40)) < 1e-9,
         String(canvas.tx));
    t.ok('the scale is still the user\'s', canvas.scale === 1.5);
    canvas.setViewport({ tx: 0, ty: 0 });
    const huge = canvas.bringIntoView({ x: 300, y: 0, width: 2000, height: 40 },
                                      { fallback: { x: 300, y: 0, width: 100, height: 40 } });
    t.ok('an oversized box takes its fallback, per axis', huge.moved && !huge.contained
         && canvas.contains({ x: 300, y: 0, width: 100, height: 40 }), JSON.stringify(huge));
    canvas.setViewport({ tx: -100, ty: 0 });
    const inside = canvas.bringIntoView({ x: 0, y: 100, width: 5000, height: 40 });
    t.ok('a window already lying inside an oversized box does not move', !inside.moved && canvas.tx === -100);
    t.check('a box with a negative size is refused', canvas.bringIntoView({ x: 0, y: 0, width: -1, height: 1 }),
            { moved: false, contained: false });
}

t.section('§4 a press on a node is the embedder\'s');
{
    const { canvas } = make();
    const node = document.createElement('div');
    const inner = document.createElement('span');
    node.appendChild(inner);
    canvas.nodeLayer.appendChild(node);
    let cleared = 0;
    canvas.onSelectionChange = () => { cleared += 1; };
    pointer('pointerdown', inner, { clientX: 200, clientY: 200 });
    t.ok('a press inside an element of the node layer starts no marquee', canvas.marquee.hidden && cleared === 0);
    pointer('pointerup', window);
    canvas.selection.add('x');
    pointer('pointerdown', canvas.root, { clientX: 200, clientY: 200 });
    t.ok('a press on the background starts the marquee and clears the selection', !canvas.marquee.hidden
         && cleared === 1 && canvas.selection.size === 0);
    let box = null;
    canvas.onMarquee = (b) => { box = b; };
    pointer('pointermove', window, { clientX: 300, clientY: 260 });
    t.check('the marquee reports its box in canvas coordinates', box, { x: 100, y: 150, width: 100, height: 60 });
    pointer('pointerup', window);
    t.ok('and hides on release', canvas.marquee.hidden);

    const picky = make({ nodeSelector: '.my-node' }).canvas;
    const loose = document.createElement('div');
    picky.nodeLayer.appendChild(loose);
    let marquees = 0;
    picky.onSelectionChange = () => { marquees += 1; };
    pointer('pointerdown', loose, { clientX: 200, clientY: 200 });
    pointer('pointerup', window);
    t.ok('with nodeSelector, an element of the node layer that is not a node is background', marquees === 1);
    const mine = document.createElement('div');
    mine.className = 'my-node';
    picky.nodeLayer.appendChild(mine);
    pointer('pointerdown', mine, { clientX: 200, clientY: 200 });
    pointer('pointerup', window);
    t.ok('…and one the selector names is a node', marquees === 1);
}

t.section('§5 the right button');
{
    const { canvas } = make();
    const opened = [];
    canvas.onBackgroundMenu = (e) => opened.push(e.type);
    const node = canvas.nodeLayer.appendChild(document.createElement('div'));
    const bg = menu(canvas.root);
    t.ok('a right-click on the background is suppressed and handed on', bg.defaultPrevented
         && opened.join() === 'contextmenu');
    const onNode = menu(node);
    t.ok('a right-click on a node keeps the browser\'s (or the embedder\'s) menu', !onNode.defaultPrevented
         && opened.length === 1);
    pointer('pointerdown', canvas.root, { button: 2, clientX: 200, clientY: 200 });
    pointer('pointermove', window, { clientX: 260, clientY: 240 });
    t.ok('a right-drag pans', canvas.tx === 60 && canvas.ty === 40, JSON.stringify(canvas.viewport()));
    pointer('pointerup', window);
    const tail = menu(node);
    t.ok('the menu at the end of a pan, even over a node, is suppressed and opens nothing',
         tail.defaultPrevented && opened.length === 1);
    pointer('pointerdown', canvas.root, { button: 2, clientX: 200, clientY: 200 });
    pointer('pointermove', window, { clientX: 260, clientY: 240 });
    pointer('pointerup', window);
    t.ok('consumeRightDrag answers true once', canvas.consumeRightDrag() === true);
    t.ok('…and false after, so the next right-click is not eaten', canvas.consumeRightDrag() === false);
    pointer('pointerdown', canvas.root, { button: 2, clientX: 200, clientY: 200 });
    pointer('pointermove', window, { clientX: 202, clientY: 201 });
    pointer('pointerup', window);
    t.ok('a shaky right-click (≤ 3px) is still a click', canvas.consumeRightDrag() === false);
    // A pan that ended over something outside the canvas leaves the flag armed;
    // the next press — anywhere, a node included — is a new gesture.
    pointer('pointerdown', canvas.root, { button: 2, clientX: 200, clientY: 200 });
    pointer('pointermove', window, { clientX: 300, clientY: 300 });
    pointer('pointerup', window);
    pointer('pointerdown', node, { button: 2 });
    t.ok('a new press, even on a node, clears a flag left armed', canvas.consumeRightDrag() === false);
    pointer('pointerdown', canvas.root, { button: 0, shiftKey: true, clientX: 200, clientY: 200 });
    const tx = canvas.tx;
    pointer('pointermove', window, { clientX: 210, clientY: 200 });
    pointer('pointerup', window);
    t.ok('Shift + the left button pans as well', canvas.tx === tx + 10);
    let wheel = new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 5, deltaY: 7 });
    const at = canvas.viewport();
    canvas.root.dispatchEvent(wheel);
    t.ok('the wheel pans, and takes the event', wheel.defaultPrevented && canvas.tx === at.tx - 5 && canvas.ty === at.ty - 7);
    wheel = new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1, ctrlKey: true, clientX: 300, clientY: 300 });
    canvas.root.dispatchEvent(wheel);
    t.ok('Ctrl + the wheel zooms', Math.abs(canvas.scale - 1.12) < 1e-9, String(canvas.scale));
}

t.section('§6 clear and destroy');
{
    const { host, canvas } = make();
    canvas.nodeLayer.appendChild(document.createElement('div'));
    canvas.edgeLayer.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    canvas.clear();
    t.ok('clear empties both layers', !canvas.nodeLayer.childNodes.length && !canvas.edgeLayer.childNodes.length);
    canvas.destroy();
    t.ok('destroy takes the root out of its container', !host.contains(canvas.root));
}

t.done();
