/**
 * THE CANVAS EDITOR'S `layout` OPTION, MOUNTED — what drives Arrange.
 *
 *   §1  no `layout`: the flow layout and its tooltip, as before; an unknown
 *       value throws at construction
 *   §2  `layout: 'layered'`: a chain A→B→C in three columns, left to right,
 *       from the graph's own corner, as ONE undo entry; a type's `rank`
 *       ('source' / 'sink') puts its steps in the first / last column
 *   §3  `arrange({ids})`: with two steps named, only those two move, as ONE
 *       undo entry that one Ctrl+Z takes back; fewer than two is refused
 *   §3b `multiSelect`: with two steps picked by Shift-click, the toolbar's
 *       Arrange moves only those two, as ONE undo entry; with one picked it
 *       arranges the whole graph
 *   §4  `layout: fn(graph, ctx)`: handed a copy of what is arranged and the
 *       context, its Map is applied; a step it leaves out stays put;
 *       anything but a Map, or a place that is not finite {x, y}, throws
 *   §5  read only: Arrange moves nothing
 *
 *     node tests/flow_canvas_layered.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — layout option');
const { window: w } = t;
const { createCanvasEditor, createStepCatalogue, layeredLayout: fromFlow } = await import('../flow.js');
const { layeredLayout } = await import('../canvas.js');

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const catalogue = createStepCatalogue([
    { type_id: 'begin', label: 'Begin', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'pass', label: 'Pass', ports: [F('in', 'input'), F('out', 'output')] },
    { type_id: 'feed', label: 'Feed', rank: 'source', ports: [F('in', 'input'), F('out', 'output')] },
    { type_id: 'show', label: 'Show', rank: 'sink', ports: [F('in', 'input'), F('out', 'output')] },
]);
const node = (id, type, x, y) => ({ id, type, config: {}, position: { x, y } });
const line = (source, target) => ({ source, target, sourcePort: 'out', targetPort: 'in' });
const CHAIN = {
    nodes: [node('C', 'pass', 64, 480), node('A', 'pass', 720, 32), node('B', 'pass', 400, 304)],
    connections: [line('A', 'B'), line('B', 'C')],
};

const mounted = [];
function mount(opts = {}, graph = CHAIN) {
    const changes = [];
    const editor = createCanvasEditor(t.host(), { catalogue, onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) });
    mounted.push(editor);
    return { editor, changes, el: editor.el };
}
const tool = (m, id) => m.el.querySelector(`.twm-flow-graph__toolbar [data-action="${id}"]`);
const at = (m, id) => m.editor.getGraph().nodes.find((n) => n.id === id).position;
const drawnAt = (m, id) => {
    const n = m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
    return { x: parseFloat(n.style.left), y: parseFloat(n.style.top) };
};
const ev = (Kind, type, init = {}) => new Kind(type, { bubbles: true, cancelable: true, button: 0, ...init });
/** A click on a node's header the way a browser reports it, with or without a modifier. */
const clickNode = (m, id, init = {}) => {
    const head = m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"] .twm-flow-graph__node-head`);
    head.dispatchEvent(ev(w.MouseEvent, 'pointerdown', init));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', init));
    head.dispatchEvent(ev(w.MouseEvent, 'click', init));
};
const ctrlZ = (m) => m.el.querySelector('.twm-canvas').dispatchEvent(
    new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true }));

t.section('§1 no layout option');
{
    const m = mount();
    t.check('the flow layout\'s tooltip', tool(m, 'arrange').title, 'Lay the steps out left to right, in the order a run takes them');
    t.throws('an unknown layout throws at construction', () => createCanvasEditor(null, { catalogue, layout: 'radial' }),
             /layout is 'flow', 'layered' or a function/);
    t.ok('layeredLayout is on the canvas entry, not the flow barrel', typeof layeredLayout === 'function' && fromFlow === undefined);
}

t.section('§2 layout: \'layered\'');
{
    const m = mount({ layout: 'layered' });
    const before = m.editor.serialise();
    t.check('its own tooltip', tool(m, 'arrange').title, 'Lay the steps out left to right, following their connections');
    tool(m, 'arrange').click();
    const [a, b, c] = ['A', 'B', 'C'].map((id) => at(m, id));
    t.ok('A → B → C in three columns, left to right', a.x < b.x && b.x < c.x, JSON.stringify([a, b, c]));
    t.ok('on one line', a.y === b.y && b.y === c.y);
    t.ok('from the corner the graph already had', a.x === 64 && a.y === 32, JSON.stringify(a));
    t.check('drawn where the graph says', drawnAt(m, 'C'), { x: c.x, y: c.y });
    t.ok('as ONE edit', m.changes.length === 1 && m.changes[0].action === 'flow:arrange');
    ctrlZ(m);
    t.ok('one Ctrl+Z restores the layout exactly', m.editor.serialise() === before);

    const hinted = mount({ layout: 'layered' }, {
        nodes: [node('S', 'show', 0, 0), node('A', 'pass', 0, 200), node('B', 'pass', 0, 400),
                node('C', 'pass', 0, 600), node('Z', 'feed', 0, 800)],
        connections: [line('A', 'S'), line('A', 'B'), line('B', 'C'), line('C', 'Z')],
    });
    hinted.editor.arrange();
    const xs = ['S', 'A', 'B', 'C', 'Z'].map((id) => at(hinted, id).x);
    t.check('a type ranked \'sink\' lands in the last column', at(hinted, 'S').x, Math.max(...xs));
    t.check('a type ranked \'source\' in the first, though a line points into it', at(hinted, 'Z').x, Math.min(...xs));
}

t.section('§3 arrange({ids}): the selection only');
{
    const g = {
        nodes: [node('A', 'pass', 400, 400), node('B', 'pass', 96, 96), node('C', 'pass', 800, 32), node('D', 'pass', 32, 800)],
        connections: [line('A', 'B'), line('B', 'C'), line('C', 'D')],
    };
    for (const layout of ['flow', 'layered']) {
        const m = mount({ layout }, g);
        const before = m.editor.serialise();
        const c0 = { ...at(m, 'C') };
        const d0 = { ...at(m, 'D') };
        t.ok(`${layout}: arranging two named steps succeeds`, m.editor.arrange({ ids: ['A', 'B'] }) === true);
        t.ok(`${layout}: those two moved, A left of B on one line`, at(m, 'A').x < at(m, 'B').x
             && at(m, 'A').y === at(m, 'B').y, JSON.stringify([at(m, 'A'), at(m, 'B')]));
        t.ok(`${layout}: from the corner the two had`, at(m, 'A').x === 96 && at(m, 'A').y === 96, JSON.stringify(at(m, 'A')));
        t.ok(`${layout}: nothing else moved`, JSON.stringify(at(m, 'C')) === JSON.stringify(c0)
             && JSON.stringify(at(m, 'D')) === JSON.stringify(d0));
        t.ok(`${layout}: as ONE edit`, m.changes.length === 1 && m.changes[0].action === 'flow:arrange');
        t.ok(`${layout}: one undo entry`, m.editor.history.canUndo);
        ctrlZ(m);
        t.ok(`${layout}: one Ctrl+Z puts both back`, m.editor.serialise() === before && !m.editor.history.canUndo);
        t.ok(`${layout}: one step (or an unknown one) is refused`, m.editor.arrange({ ids: ['A', 'nope'] }) === false
             && m.changes.length === 2);
    }
}

t.section('§3b multiSelect: the toolbar arranges the pick');
{
    const g = {
        nodes: [node('A', 'pass', 400, 400), node('B', 'pass', 96, 96), node('C', 'pass', 800, 32), node('D', 'pass', 32, 800)],
        connections: [line('A', 'B'), line('B', 'C'), line('C', 'D')],
    };
    for (const layout of ['flow', 'layered']) {
        const selects = [];
        const m = mount({ layout, multiSelect: true, onSelect: (s) => selects.push(s) }, g);
        const before = m.editor.serialise();
        const c0 = { ...at(m, 'C') };
        const d0 = { ...at(m, 'D') };
        clickNode(m, 'A');
        clickNode(m, 'B', { shiftKey: true });
        t.check(`${layout}: two steps picked`, selects.at(-1), { kind: 'many', ids: ['A', 'B'] });
        t.ok(`${layout}: Arrange is offered`, !tool(m, 'arrange').disabled);
        tool(m, 'arrange').click();
        t.ok(`${layout}: the two moved, A left of B on one line`, at(m, 'A').x < at(m, 'B').x
             && at(m, 'A').y === at(m, 'B').y, JSON.stringify([at(m, 'A'), at(m, 'B')]));
        t.ok(`${layout}: from the corner the two had`, at(m, 'A').x === 96 && at(m, 'A').y === 96, JSON.stringify(at(m, 'A')));
        t.ok(`${layout}: nothing else moved`, JSON.stringify(at(m, 'C')) === JSON.stringify(c0)
             && JSON.stringify(at(m, 'D')) === JSON.stringify(d0));
        t.ok(`${layout}: as ONE edit`, m.changes.length === 1 && m.changes[0].action === 'flow:arrange');
        ctrlZ(m);
        t.ok(`${layout}: one Ctrl+Z puts both back`, m.editor.serialise() === before && !m.editor.history.canUndo);

        clickNode(m, 'A');
        t.check(`${layout}: one step picked`, selects.at(-1), { kind: 'step', id: 'A' });
        tool(m, 'arrange').click();
        t.ok(`${layout}: with one picked, Arrange lays out the whole graph`,
             JSON.stringify(at(m, 'C')) !== JSON.stringify(c0) || JSON.stringify(at(m, 'D')) !== JSON.stringify(d0));
    }
}

t.section('§4 layout: a function');
{
    const calls = [];
    const layout = (graph, ctx) => {
        calls.push({ graph, ctx });
        return new Map(graph.nodes.map((n, i) => [n.id, { x: 0, y: i * 160 }]));
    };
    const m = mount({ layout });
    m.editor.arrange({ ids: ['B', 'C'] });
    const [{ graph, ctx }] = calls;
    t.check('handed what is arranged', graph.nodes.map((n) => n.id).sort(), ['B', 'C']);
    t.check('and only the lines between it', graph.connections.map((c) => `${c.source}>${c.target}`), ['B>C']);
    t.check('ctx.ids names it', ctx.ids, ['C', 'B']);
    t.ok('ctx carries the catalogue, the node box, sizeOf and layeredLayout', ctx.catalogue === catalogue
         && ctx.node.width === 208 && ctx.sizeOf(graph.nodes[0]).height > 0 && ctx.layeredLayout === layeredLayout);
    graph.nodes[0].position.x = 9999;
    t.ok('a copy: changing it changes nothing', at(m, 'B').x !== 9999);
    t.check('its Map applied from the corner the two had', [at(m, 'C'), at(m, 'B')],
            [{ x: 64, y: 304 }, { x: 64, y: 464 }]);
    m.editor.arrange();
    t.check('without ids, ctx.ids is null', calls[1].ctx.ids, null);
    const bad = mount({ layout: () => ({ A: { x: 0, y: 0 } }) });
    t.throws('anything but a Map throws', () => bad.editor.arrange(), /must return a Map/);
    for (const [name, place] of [['{x: NaN}', { x: NaN, y: 0 }], ["{x: '10'}", { x: '10', y: 0 }],
                                 ['{y: Infinity}', { x: 0, y: Infinity }], ['null', null]]) {
        const m2 = mount({ layout: () => new Map([['A', { x: 0, y: 0 }], ['B', place]]) });
        const before = m2.editor.serialise();
        t.throws(`a place of ${name} throws`, () => m2.editor.arrange(), /must be finite numbers/);
        t.ok(`  and nothing moved or was committed`, m2.editor.serialise() === before && m2.changes.length === 0);
    }
    const part = mount({ layout: () => new Map([['A', { x: 0, y: 0 }], ['B', { x: 320, y: 0 }]]) });
    const c0 = { ...at(part, 'C') };
    t.ok('a step the Map leaves out stays where it was', part.editor.arrange() === true
         && JSON.stringify(at(part, 'C')) === JSON.stringify(c0));
}

t.section('§5 read only');
{
    const m = mount({ layout: 'layered', readOnly: { reason: 'Locked.' } });
    const before = m.editor.serialise();
    t.ok('arrange() is refused', m.editor.arrange() === false && m.editor.arrange({ ids: ['A', 'B'] }) === false);
    t.ok('nothing moved, nothing reported', m.editor.serialise() === before && m.changes.length === 0);
}

for (const ed of mounted) ed.destroy();
t.done();
