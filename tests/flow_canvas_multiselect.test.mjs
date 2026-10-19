/**
 * THE CANVAS EDITOR WITH MANY PICKED (`multiSelect: true`, STORY-0076) — the
 * pick becomes a set, and every gesture on it is ONE undo entry:
 *
 *   §0  without the option nothing changes: no align verbs, a marquee picks
 *       nothing, Ctrl+A, the arrows, Escape and Tab are not the editor's, a
 *       Shift-click picks one, and the graph serialises as before
 *   §1  a marquee over three picks those three and onSelect says
 *       `{kind: 'many', ids}`; one picked still says `{kind: 'step', id}`;
 *       Shift/Ctrl+click adds and takes away; Ctrl+A; Escape; `select([...])`
 *   §2  dragging one of three moves all three (`flow:nodes:move`), the click
 *       after the drag keeps the three, and ONE Ctrl+Z puts all three back
 *   §3  Delete removes every picked node and their lines (`flow:nodes:remove`,
 *       never a start step), and one undo brings them back
 *   §4  align and distribute: the toolbar and `editor.align(kind)` /
 *       `editor.distribute(axis)`, refused in place with fewer than two
 *       (three) picked, each one `flow:nodes:align`
 *   §5  an arrow nudges by gridSize, Shift+arrow by ten steps, a held arrow is
 *       one entry; Tab and Shift+Tab walk the nodes and let go at the ends
 *   §6  read only: no gesture changes the graph
 *   §7  an undo that takes away a picked node lets go of it
 *   §8  bindFlowKeys: Ctrl/⌘+A is selectAll, and only when handled
 *   §9  Delete on many picked keeps the mark of a surviving node whose body threw
 *
 * The 300-node timing is `demo/flow_canvas_probe.mjs`'s (a real browser).
 *
 *     node tests/flow_canvas_multiselect.test.mjs
 */
import { flowEnv } from './flow_env.mjs';
import { bindFlowKeys } from '../src/flow/kit/keys.js';

const t = await flowEnv('flow canvas — many picked');
const { window: w } = t;
const { createCanvasEditor, createStepCatalogue, canvasNodeBottom } = await import('../flow.js');

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'task', label: 'Task', category: 'work', ports: [F('in', 'input'), F('out', 'output')] },
    { type_id: 'tall', label: 'Tall', category: 'work',
      ports: [F('in', 'input'), F('a', 'output'), F('b', 'output'), F('c', 'output')] },
];
const catalogue = createStepCatalogue(TYPES, { categories: [{ id: 'control', label: 'Flow' }, { id: 'work', label: 'Work' }] });
const node = (id, x, y, type = 'task') => ({ id, type, config: {}, position: { x, y } });
const GRAPH = {
    nodes: [node('start', 0, 0, 'start'), node('a', 96, 160), node('b', 400, 176, 'tall'), node('c', 704, 208),
            node('far', 96, 800)],
    connections: [{ source: 'start', sourcePort: 'out', target: 'a', targetPort: 'in' },
                  { source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
                  { source: 'b', sourcePort: 'a', target: 'c', targetPort: 'in' },
                  { source: 'c', sourcePort: 'out', target: 'far', targetPort: 'in' }],
};

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const changes = [];
    const selects = [];
    const editor = createCanvasEditor(t.host(), {
        catalogue, onChange: (c) => changes.push(c), onSelect: (s) => selects.push(s), ...opts });
    editor.load({ graph: structuredClone(graph) }, { fit: false });
    editor.canvas.setViewport({ scale: 1, tx: 0, ty: 0 });
    mounted.push(editor);
    return { editor, changes, selects, el: editor.el };
}
const ev = (Kind, type, init = {}) => new Kind(type, { bubbles: true, cancelable: true, button: 0, ...init });
const keyOn = (target, key, init = {}) => {
    const e = ev(w.KeyboardEvent, 'keydown', { key, ...init });
    target.dispatchEvent(e);
    return e;
};
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const headOf = (m, id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-head');
const canvasOf = (m) => m.el.querySelector('.twm-canvas');
const tool = (m, id) => m.el.querySelector(`.twm-flow-graph__toolbar [data-action="${id}"]`);
const toolIds = (m) => [...m.el.querySelectorAll('.twm-flow-graph__toolbar [data-action]')].map((b) => b.dataset.action);
const pos = (m, id) => m.editor.getGraph().nodes.find((n) => n.id === id)?.position;
const picked = (m) => [...m.el.querySelectorAll('.twm-flow-graph__node--picked')].map((n) => n.dataset.nodeId);
/** A left press on the empty surface, dragged from canvas point a to b. */
const marquee = (m, a, b) => {
    canvasOf(m).dispatchEvent(ev(w.MouseEvent, 'pointerdown', { clientX: a.x, clientY: a.y }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: b.x, clientY: b.y }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', { clientX: b.x, clientY: b.y }));
};
/** A header drag the way a browser reports it: the press, moves, the release, and its click. */
const drag = (m, id, dx, dy, init = {}) => {
    const head = headOf(m, id);
    head.dispatchEvent(ev(w.MouseEvent, 'pointerdown', { clientX: 10, clientY: 10, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: 10 + dx / 2, clientY: 10 + dy / 2, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
    head.dispatchEvent(ev(w.MouseEvent, 'click', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
};
/** A click on a node's header, with or without a modifier. */
const clickNode = (m, id, init = {}) => {
    headOf(m, id).dispatchEvent(ev(w.MouseEvent, 'pointerdown', init));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', init));
    headOf(m, id).dispatchEvent(ev(w.MouseEvent, 'click', init));
};

t.section('§0 without the option nothing changes');
{
    const m = mount();
    const before = m.editor.serialise();
    t.check('the toolbar is Undo, Redo, Arrange, Fit', toolIds(m), ['undo', 'redo', 'arrange', 'fit']);
    t.ok('no align or distribute method does anything', m.editor.align('left') === false
         && m.editor.distribute('horizontal') === false);
    marquee(m, { x: 50, y: 100 }, { x: 1000, y: 400 });
    t.check('a marquee picks nothing', [picked(m), m.selects.filter((s) => s.kind).length], [[], 0]);
    m.editor.select('a');
    const all = keyOn(canvasOf(m), 'a', { ctrlKey: true });
    t.check('Ctrl+A is not the editor\'s', [all.defaultPrevented, picked(m)], [false, ['a']]);
    const arrow = keyOn(nodeEl(m, 'a'), 'ArrowRight');
    t.check('an arrow is not the editor\'s', [arrow.defaultPrevented, pos(m, 'a')], [false, { x: 96, y: 160 }]);
    const esc = keyOn(nodeEl(m, 'a'), 'Escape');
    t.check('Escape keeps the pick and is not prevented', [esc.defaultPrevented, picked(m)], [false, ['a']]);
    const tab = keyOn(nodeEl(m, 'a'), 'Tab');
    t.ok('Tab is the browser\'s', !tab.defaultPrevented);
    clickNode(m, 'b', { shiftKey: true });
    t.check('a Shift-click picks that one alone', [picked(m), m.selects.at(-1)], [['b'], { kind: 'step', id: 'b' }]);
    m.editor.select(['a', 'b']);
    t.check('select([...]) is not a pick of many', picked(m), ['b']);
    t.check('nothing was written', [m.changes.length, m.editor.serialise() === before], [0, true]);
    t.ok('no pick box', m.el.querySelector('[data-action="remove-steps"]') === null);
}

t.section('§1 a marquee, Shift/Ctrl+click, Ctrl+A, Escape');
{
    const m = mount({ multiSelect: true });
    m.editor.select('far');
    t.check('one picked still says the old shape', m.selects.at(-1), { kind: 'step', id: 'far' });
    // a (96,160), b (400,176), c (704,208): the box touches those three only.
    marquee(m, { x: 120, y: 150 }, { x: 760, y: 220 });
    t.check('the three are picked', picked(m), ['a', 'b', 'c']);
    t.check('onSelect says {kind: \'many\', ids}', m.selects.at(-1), { kind: 'many', ids: ['a', 'b', 'c'] });
    t.ok('reported once for the three, not once per pointer move',
         m.selects.filter((s) => s.kind === 'many' && s.ids.length === 3).length === 1);
    t.ok('the panel says how many, with their Remove', /3 steps picked/.test(m.el.textContent)
         && m.el.querySelector('[data-action="remove-steps"]')?.textContent.includes('Remove 3 steps'));
    t.ok('the align verbs are on, distribute too', !tool(m, 'align-left').disabled && !tool(m, 'distribute-vertical').disabled);
    clickNode(m, 'b', { ctrlKey: true });
    t.check('Ctrl+click takes one away', m.selects.at(-1), { kind: 'many', ids: ['a', 'c'] });
    clickNode(m, 'far', { shiftKey: true });
    t.check('Shift+click adds one', m.selects.at(-1), { kind: 'many', ids: ['a', 'c', 'far'] });
    clickNode(m, 'a', { metaKey: true });
    clickNode(m, 'c', { metaKey: true });
    t.check('down to one, it is a step again', m.selects.at(-1), { kind: 'step', id: 'far' });
    t.ok('and distribute is refused in place', tool(m, 'distribute-horizontal').disabled
         && tool(m, 'distribute-horizontal').title === 'Pick three steps or more to distribute them.');
    const all = keyOn(canvasOf(m), 'a', { ctrlKey: true });
    t.check('Ctrl+A picks every node', [all.defaultPrevented, picked(m)], [true, ['start', 'a', 'b', 'c', 'far']]);
    clickNode(m, 'b');
    t.check('a plain click narrows to that one', m.selects.at(-1), { kind: 'step', id: 'b' });
    m.editor.select(['a', 'c']);
    t.check('select([...]) picks several', m.selects.at(-1), { kind: 'many', ids: ['a', 'c'] });
    const esc = keyOn(nodeEl(m, 'a'), 'Escape');
    t.check('Escape lets go of them', [esc.defaultPrevented, picked(m), m.selects.at(-1)],
            [true, [], { kind: null, id: null }]);
    t.check('picking writes nothing', m.changes.length, 0);
}

t.section('§2 dragging one of three moves all three; one Ctrl+Z puts them back');
{
    const m = mount({ multiSelect: true });
    const before = m.editor.serialise();
    m.editor.select(['a', 'b', 'c']);
    const was = ['a', 'b', 'c', 'far'].map((id) => pos(m, id));
    drag(m, 'b', 64, 32);
    t.check('all three moved by the travel, snapped; the rest stayed', ['a', 'b', 'c', 'far'].map((id) => pos(m, id)),
            [{ x: 160, y: 192 }, { x: 464, y: 208 }, { x: 768, y: 240 }, was[3]]);
    t.check('drawn where they are', ['a', 'b', 'c'].map((id) => nodeEl(m, id).style.left), ['160px', '464px', '768px']);
    t.check('one edit, flow:nodes:move', [m.changes.length, m.changes.at(-1).action], [1, 'flow:nodes:move']);
    t.check('the click after the drag keeps the three', picked(m), ['a', 'b', 'c']);
    t.check('one undo entry', m.editor.history.depth, 1);
    const z = keyOn(canvasOf(m), 'z', { ctrlKey: true });
    t.ok('one Ctrl+Z puts all three back, byte for byte', z.defaultPrevented && m.editor.serialise() === before);
    t.check('drawn back too', ['a', 'b', 'c'].map((id) => nodeEl(m, id).style.left), ['96px', '400px', '704px']);
    drag(m, 'far', 32, 0);
    t.check('a node outside the pick drags alone, as flow:node:move', [picked(m), m.changes.at(-1).action, pos(m, 'a')],
            [['far'], 'flow:node:move', { x: 96, y: 160 }]);
}

t.section('§3 Delete removes every picked node and their lines, as one entry');
{
    const m = mount({ multiSelect: true });
    const before = m.editor.serialise();
    keyOn(canvasOf(m), 'a', { ctrlKey: true });
    const del = keyOn(nodeEl(m, 'b'), 'Delete');
    const g = m.editor.getGraph();
    t.check('every removable picked node is gone; the start step stays', [del.defaultPrevented, g.nodes.map((n) => n.id)],
            [true, ['start']]);
    t.check('and every line of theirs', g.connections.length, 0);
    t.check('one edit, flow:nodes:remove', [m.changes.length, m.changes.at(-1).action, m.editor.history.depth],
            [1, 'flow:nodes:remove', 1]);
    m.editor.undo();
    t.ok('one undo brings back the nodes and the lines', m.editor.serialise() === before);
    m.editor.select(['a', 'c']);
    m.el.querySelector('[data-action="remove-steps"]').click();
    t.check('the pick box\'s Remove does the same', m.editor.getGraph().nodes.map((n) => n.id), ['start', 'b', 'far']);
    m.editor.undo();
    m.editor.select(['start']);
    t.check('a start step alone stays', [keyOn(nodeEl(m, 'start'), 'Delete').defaultPrevented, m.editor.getGraph().nodes.length],
            [false, 5]);
}

t.section('§4 align and distribute');
{
    const m = mount({ multiSelect: true });
    t.check('the verbs follow Fit, in order', toolIds(m), ['undo', 'redo', 'arrange', 'fit', 'align-left', 'align-center',
        'align-right', 'align-top', 'align-middle', 'align-bottom', 'distribute-horizontal', 'distribute-vertical']);
    t.ok('refused in place with nothing picked, the reason on the button', tool(m, 'align-left').disabled
         && tool(m, 'align-left').dataset.refusal === 'Pick two steps or more to align them.');
    t.ok('and in the API', m.editor.align('left') === false && m.changes.length === 0);
    t.throws('an unknown kind is a programming error', () => m.editor.align('diagonal'), /left, center, right/);
    t.throws('so is an unknown axis', () => m.editor.distribute('z'), /horizontal, vertical/);
    m.editor.select(['a', 'b', 'c']);
    tool(m, 'align-left').click();
    t.check('Align left: every picked node at the leftmost x', ['a', 'b', 'c'].map((id) => pos(m, id).x), [96, 96, 96]);
    t.check('their y kept; one flow:nodes:align', [['a', 'b', 'c'].map((id) => pos(m, id).y), m.changes.at(-1).action,
                                                    m.editor.history.depth], [[160, 176, 208], 'flow:nodes:align', 1]);
    m.editor.undo();
    t.ok('align right lines up the right edges', m.editor.align('right')
         && new Set(['a', 'b', 'c'].map((id) => pos(m, id).x)).size === 1 && pos(m, 'a').x === 704);
    m.editor.undo();
    m.editor.align('top');
    t.check('top', ['a', 'b', 'c'].map((id) => pos(m, id).y), [160, 160, 160]);
    m.editor.undo();
    // b is the tall one: bottoms line up, so its top sits higher.
    m.editor.align('bottom');
    const box = (id) => nodeEl(m, id);
    const hA = editorBottom(m, 'a') - pos(m, 'a').y;
    const hB = editorBottom(m, 'b') - pos(m, 'b').y;
    t.ok('bottom: equal bottoms, across heights', hB > hA && editorBottom(m, 'a') === editorBottom(m, 'b')
         && editorBottom(m, 'b') === editorBottom(m, 'c'), JSON.stringify([hA, hB, box('a').style.top]));
    m.editor.undo();
    m.editor.align('center');
    t.check('centre', ['a', 'b', 'c'].map((id) => pos(m, id).x), [400, 400, 400]);
    m.editor.undo();
    m.editor.align('middle');
    const mids = ['a', 'b', 'c'].map((id) => pos(m, id).y + (editorBottom(m, id) - pos(m, id).y) / 2);
    t.ok('middle: the middles within a pixel', Math.max(...mids) - Math.min(...mids) <= 1, JSON.stringify(mids));
    m.editor.undo();

    // Uneven: a at 96, b at 200, c at 704 (all the same width).
    m.editor.load({ graph: { nodes: [node('a', 96, 160), node('b', 200, 300), node('q', 450, 90), node('c', 703, 208)],
                             connections: [] } }, { fit: false });
    m.editor.select(['a', 'b', 'q', 'c']);
    tool(m, 'distribute-horizontal').click();
    const xs = ['a', 'b', 'q', 'c'].map((id) => pos(m, id).x);
    const width = parseFloat(nodeEl(m, 'a').style.width);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] + width));
    t.ok('distribute horizontally: the ends stay, the gaps equal within 1 px', xs[0] === 96 && xs[3] === 703
         && Math.max(...gaps) - Math.min(...gaps) <= 1, JSON.stringify({ xs, gaps }));
    t.check('one flow:nodes:align', [m.changes.at(-1).action, m.editor.history.depth], ['flow:nodes:align', 1]);
    m.editor.distribute('vertical');
    const order = ['q', 'a', 'c', 'b'];
    const ys = order.map((id) => pos(m, id).y);
    const vgaps = ys.slice(1).map((y, i) => y - editorBottom(m, order[i]));
    t.ok('distribute vertically: equal gaps within 1 px', ys[0] === 90 && ys[3] === 300
         && Math.max(...vgaps) - Math.min(...vgaps) <= 1, JSON.stringify({ ys, vgaps }));
    m.editor.select(['a', 'b']);
    t.ok('two picked: align on, distribute refused', !tool(m, 'align-top').disabled && tool(m, 'distribute-vertical').disabled
         && m.editor.distribute('vertical') === false);
}

/** A node's bottom as the editor draws it. */
function editorBottom(m, id) {
    return canvasNodeBottom(catalogue, m.editor.getGraph().nodes.find((x) => x.id === id));
}

t.section('§5 arrows nudge, Tab walks the nodes');
{
    let clock = 0;
    const m = mount({ multiSelect: true, gridSize: 16, history: { now: () => clock } });
    m.editor.select(['a', 'c']);
    const right = keyOn(nodeEl(m, 'a'), 'ArrowRight');
    t.check('→ moves the pick one grid step', [right.defaultPrevented, pos(m, 'a'), pos(m, 'c')],
            [true, { x: 112, y: 160 }, { x: 720, y: 208 }]);
    t.check('drawn there', nodeEl(m, 'c').style.left, '720px');
    keyOn(nodeEl(m, 'a'), 'ArrowDown', { shiftKey: true });
    t.check('Shift+↓ moves it ten steps', [pos(m, 'a'), pos(m, 'c')], [{ x: 112, y: 320 }, { x: 720, y: 368 }]);
    keyOn(nodeEl(m, 'a'), 'ArrowLeft');
    keyOn(nodeEl(m, 'a'), 'ArrowUp');
    t.check('held arrows are one entry, flow:nodes:move', [m.editor.history.depth, m.changes.at(-1).action],
            [1, 'flow:nodes:move']);
    clock = 5000;
    keyOn(nodeEl(m, 'a'), 'ArrowLeft');
    t.check('a later nudge is another', m.editor.history.depth, 2);
    m.editor.select('b');
    keyOn(nodeEl(m, 'b'), 'ArrowRight');
    t.check('one picked nudges as flow:node:move', [pos(m, 'b'), m.changes.at(-1).action], [{ x: 416, y: 176 }, 'flow:node:move']);
    const inPanel = m.el.querySelector('.twm-flow-graph__aside button');
    const r = keyOn(inPanel, 'ArrowRight');
    t.check('an arrow outside the canvas is not a nudge', [r.defaultPrevented, pos(m, 'b')], [false, { x: 416, y: 176 }]);

    const focused = () => w.document.activeElement?.dataset?.nodeId ?? null;
    nodeEl(m, 'a').focus();
    const tab = keyOn(nodeEl(m, 'a'), 'Tab');
    t.check('Tab moves focus to the next node, and picks it', [tab.defaultPrevented, focused(), picked(m)], [true, 'b', ['b']]);
    keyOn(nodeEl(m, 'b'), 'Tab');
    t.check('and the next', focused(), 'c');
    keyOn(nodeEl(m, 'c'), 'Tab', { shiftKey: true });
    t.check('Shift+Tab goes back', focused(), 'b');
    const fromPort = nodeEl(m, 'b').querySelector('.twm-flow-graph__port');
    fromPort.focus();
    keyOn(fromPort, 'Tab');
    t.check('from a node\'s port, the next node', focused(), 'c');
    nodeEl(m, 'far').focus();
    t.ok('past the last node Tab is the browser\'s', !keyOn(nodeEl(m, 'far'), 'Tab').defaultPrevented);
    t.ok('before the first, Shift+Tab is', !keyOn(nodeEl(m, 'start'), 'Tab', { shiftKey: true }).defaultPrevented);
    canvasOf(m).focus();
    keyOn(canvasOf(m), 'Tab');
    t.check('from the canvas itself, Tab goes to the first node', focused(), 'start');
    m.editor.select(['a', 'c']);
    nodeEl(m, 'c').focus();
    t.check('focus arriving on a picked node keeps the pick', picked(m), ['a', 'c']);
}
{
    // A press that never becomes the node's own click leaves nothing behind:
    // Tab onto the node afterwards still picks it, and the arrow moves it.
    const m = mount({ multiSelect: true, gridSize: 16 });
    const focused = () => w.document.activeElement?.dataset?.nodeId ?? null;
    const tabOntoC = () => {
        m.editor.select('b');
        nodeEl(m, 'b').focus();
        keyOn(nodeEl(m, 'b'), 'Tab');
        return [focused(), picked(m)];
    };
    const out = nodeEl(m, 'c').querySelector('.twm-flow-graph__port[data-direction="output"]');
    out.dispatchEvent(ev(w.MouseEvent, 'pointerdown'));
    out.dispatchEvent(ev(w.MouseEvent, 'click'));
    keyOn(nodeEl(m, 'c'), 'Escape');
    t.check('after a port click, Tab onto the node picks it', tabOntoC(), ['c', ['c']]);
    keyOn(nodeEl(m, 'c'), 'ArrowRight');
    t.check('and the arrow moves it', pos(m, 'c'), { x: 720, y: 208 });
    headOf(m, 'c').dispatchEvent(ev(w.MouseEvent, 'pointerdown', { button: 2 }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', { button: 2 }));
    t.check('after a right-click, Tab onto the node picks it', tabOntoC(), ['c', ['c']]);
    keyOn(nodeEl(m, 'c'), 'ArrowRight');
    t.check('and the arrow moves it', pos(m, 'c'), { x: 736, y: 208 });
    headOf(m, 'c').dispatchEvent(ev(w.MouseEvent, 'pointerdown'));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup'));
    t.check('after a press let go off the node, Tab onto it picks it', tabOntoC(), ['c', ['c']]);
    keyOn(nodeEl(m, 'c'), 'ArrowRight');
    t.check('and the arrow moves it', pos(m, 'c'), { x: 752, y: 208 });
}

t.section('§6 read only: no gesture changes the graph');
{
    const m = mount({ multiSelect: true, readOnly: { reason: 'Published.' } });
    const before = m.editor.serialise();
    marquee(m, { x: 120, y: 150 }, { x: 760, y: 220 });
    t.check('a marquee still picks (it writes nothing)', picked(m), ['a', 'b', 'c']);
    drag(m, 'b', 64, 32);
    keyOn(nodeEl(m, 'b'), 'Delete');
    keyOn(nodeEl(m, 'b'), 'ArrowRight');
    keyOn(nodeEl(m, 'b'), 'ArrowDown', { shiftKey: true });
    t.ok('the verbs are refused with the reason', ['align-left', 'distribute-horizontal']
        .every((id) => tool(m, id).disabled && tool(m, id).dataset.refusal === 'Published.'));
    t.ok('and in the API', m.editor.align('left') === false && m.editor.distribute('horizontal') === false);
    m.editor.select(['a', 'b']);
    t.ok('the pick box\'s Remove is disabled', m.el.querySelector('[data-action="remove-steps"]').disabled);
    t.check('nothing was written', [m.changes.length, m.editor.serialise() === before, m.editor.history.depth], [0, true, 0]);
    m.editor.setReadOnly(false);
    keyOn(nodeEl(m, 'b'), 'ArrowRight');
    t.check('writable again, the nudge works', m.changes.at(-1)?.action, 'flow:nodes:move');
}

t.section('§7 an undo that takes a picked node away lets go of it');
{
    const m = mount({ multiSelect: true });
    m.editor.load({ graph: { nodes: [node('a', 0, 0), node('b', 300, 0)], connections: [] } }, { fit: false });
    m.el.querySelector('.twm-flow-graph__palette-item[data-type="task"]').click();
    const added = m.editor.getGraph().nodes.at(-1).id;
    m.editor.select(['a', added]);
    m.editor.undo();
    t.check('down to the one that is left', [picked(m), m.selects.at(-1)], [['a'], { kind: 'step', id: 'a' }]);
}

t.section('§8 bindFlowKeys: Ctrl/⌘+A is selectAll, and only when handled');
{
    const root = t.host();
    let calls = 0;
    const off = bindFlowKeys(root, { selectAll: () => { calls += 1; } });
    t.check('Ctrl+A and ⌘+A', [keyOn(root, 'a', { ctrlKey: true }).defaultPrevented,
                               keyOn(root, 'A', { metaKey: true }).defaultPrevented, calls], [true, true, 2]);
    const field = w.document.createElement('input');
    root.appendChild(field);
    t.check('inside a text field it is the field\'s', [keyOn(field, 'a', { ctrlKey: true }).defaultPrevented, calls], [false, 2]);
    off();
    const bare = t.host();
    const off2 = bindFlowKeys(bare, {});
    t.ok('with no handler it is not prevented', !keyOn(bare, 'a', { ctrlKey: true }).defaultPrevented);
    off2();
}

t.section('§9 Delete on many picked keeps a body\'s finding');
{
    const broken = { type_id: 'broken', label: 'Broken', category: 'work', ports: [F('in', 'input')],
                     render() { throw new Error('no canvas'); } };
    const withBroken = createStepCatalogue([...TYPES, broken]);
    const graph = { nodes: [node('p', 0, 0), node('q', 300, 0), node('b', 600, 0, 'broken')], connections: [] };
    const m = mount({ catalogue: withBroken, multiSelect: true }, graph);
    const marked = () => nodeEl(m, 'b').classList.contains('twm-flow-graph__node--error')
        && nodeEl(m, 'b').querySelector('.twm-flow-graph__node-findings').textContent.includes('no canvas');
    t.ok('(the node whose body threw is marked)', marked());
    m.editor.select(['p', 'q']);
    keyOn(nodeEl(m, 'p'), 'Delete');
    t.check('(the two picked are gone)', m.editor.getGraph().nodes.map((n) => n.id), ['b']);
    t.ok('after Delete the survivor is still marked', marked());
}

for (const e of mounted) e.destroy();
t.done();
