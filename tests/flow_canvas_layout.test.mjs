/**
 * THE CANVAS EDITOR'S GEOMETRY, PURE (36 §5.3) — runs under plain node.
 * Ported from the designer's graph-model suite, against a neutral catalogue.
 *
 *   §1  CANVAS_NODE is 208 × 34 + 22 a row, frozen — the numbers the stylesheet
 *       is held to (flow_canvas_css) and the edges are anchored by
 *   §2  portAnchor: inputs on the left, outputs on the right, a row per port in
 *       DECLARED order; nodeBottom computed, never measured
 *   §3  isReturnEdge: a line into a loop step's input other than its entry
 *   §4  Arrange (layoutGraph) reads left to right, a condition's FIRST arm
 *       above its second whatever their ids, a merge right of its longer
 *       branch, a loop's return line ignored, a cycle not hung on, and steps of
 *       no known type still placed (the localeCompare trap)
 *   §5  the logic graph's refusals still hold on this catalogue, and a step's
 *       id stem is the catalogue's `idBase`
 *
 *     node tests/flow_canvas_layout.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { CANVAS_NODE, isReturnEdge, layoutGraph, nodeBottom, portAnchor } from '../src/flow/canvas_editor/layout.js';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';
import * as G from '../src/flow/kit/logic_graph.js';

const t = assertions('flow canvas — geometry');

const out = (name, extra = {}) => ({ name, direction: 'output', port_type: 'FLOW', ...extra });
const inp = (name = 'in', extra = {}) => ({ name, direction: 'input', port_type: 'FLOW', ...extra });
const catalogue = createStepCatalogue([
    { type_id: 'begin', label: 'Begin', role: 'start', ports: [out('out')] },
    { type_id: 'finish', label: 'Finish', role: 'end', ports: [inp()] },
    { type_id: 'note', label: 'Note', role: 'step', ports: [inp(), out('out')] },
    { type_id: 'fetch', label: 'Fetch', role: 'step',
      ports: [inp(), out('out'), out('error'), { name: 'answer', direction: 'output', port_type: 'DATA' }] },
    { type_id: 'decide', label: 'Decide', role: 'branch', ports: [inp(), out('yes'), out('no')] },
    { type_id: 'gather', label: 'Gather', role: 'join', ports: [inp('in', { multiple: true }), out('out')] },
    { type_id: 'repeat', label: 'Repeat', role: 'loop', ports: [inp(), inp('again'), out('each'), out('after')] },
    { type_id: 'fan', label: 'Fan', role: 'fanout', ports: [inp(), out('out', { multiple: true })] },
], { idBase: (type) => type.type_id.replace(/^x-/, '') });
const node = (id, type, x = 0, y = 0) => ({ id, type, config: {}, position: { x, y } });
const edge = (source, target, sourcePort = 'out', targetPort = 'in') => ({ source, target, sourcePort, targetPort });

t.section('§1 the node box');
t.check('CANVAS_NODE', { ...CANVAS_NODE }, { width: 208, header: 34, row: 22 });
t.ok('frozen', Object.isFrozen(CANVAS_NODE));

t.section('§2 anchors and the bottom of a node');
{
    const f = node('f', 'fetch', 100, 50);
    t.check('the input on the left edge, its row\'s middle', portAnchor(catalogue, f, 'in', 'input'), { x: 100, y: 50 + 34 + 11, side: 'left' });
    t.check('the second output one row further down, on the right edge', portAnchor(catalogue, f, 'error', 'output'),
            { x: 308, y: 50 + 34 + 22 + 11, side: 'right' });
    t.check('a port the type does not have anchors at the first row', portAnchor(catalogue, f, 'gone', 'output').y, 95);
    t.check('a custom box is honoured', portAnchor(catalogue, f, 'error', 'output', { width: 100, header: 20, row: 10 }),
            { x: 200, y: 50 + 20 + 10 + 5, side: 'right' });
    t.check('nodeBottom: the header, a row per port of the longer side, and a foot', nodeBottom(catalogue, f), 50 + 34 + 22 * 3 + 12);
    t.check('a node of no known type still has one row', nodeBottom(catalogue, node('x', 'nope', 0, 0)), 34 + 22 + 12);
}

t.section('§3 a loop\'s return line');
{
    const loop = node('r', 'repeat');
    t.ok('into the loop\'s other input: a return', isReturnEdge(edge('b', 'r', 'out', 'again'), loop, catalogue));
    t.ok('into its entry: not', !isReturnEdge(edge('b', 'r', 'out', 'in'), loop, catalogue));
    t.ok('the entry port is the consumer\'s to name', isReturnEdge(edge('b', 'r', 'out', 'in'), loop, catalogue, 'again'));
    t.ok('into a step that is no loop: not', !isReturnEdge(edge('b', 'n', 'out', 'x'), node('n', 'note'), catalogue));
    t.ok('to nothing: not', !isReturnEdge(edge('b', 'zz', 'out', 'x'), null, catalogue));
}

t.section('§4 Arrange lays a run out left to right');
{
    const line = { nodes: [node('end', 'finish', 0, 900), node('read', 'note', 50, 20), node('go', 'begin', 700, 300)],
                   connections: [edge('go', 'read'), edge('read', 'end')] };
    const at = layoutGraph(line, catalogue);
    t.ok('begin → note → finish reads left to right', at.get('go').x < at.get('read').x && at.get('read').x < at.get('end').x,
         JSON.stringify([...at]));
    t.ok('on one line', at.get('go').y === at.get('read').y && at.get('read').y === at.get('end').y);
    t.ok('from the origin', at.get('go').x === 0 && at.get('go').y === 0);
    t.ok('columns are a node\'s width + the gap apart', at.get('read').x === 208 + 96);

    // The first arm is named so that it would sort BELOW the second by name.
    const branch = { nodes: [node('go', 'begin'), node('if', 'decide'), node('zz-yes', 'note'), node('aa-no', 'note'),
                             node('yes-2', 'note'), node('join', 'gather'), node('end', 'finish')],
                     connections: [edge('go', 'if'), edge('if', 'aa-no', 'no'), edge('if', 'zz-yes', 'yes'),
                                   edge('zz-yes', 'yes-2'), edge('yes-2', 'join'), edge('aa-no', 'join'), edge('join', 'end')] };
    const b = layoutGraph(branch, catalogue);
    t.ok('a branch\'s FIRST declared arm sits above its second, whatever their ids',
         b.get('zz-yes').x === b.get('aa-no').x && b.get('zz-yes').y < b.get('aa-no').y, JSON.stringify([...b]));
    t.ok('a merge after arms of unequal length sits right of the longer one',
         b.get('join').x > b.get('yes-2').x && b.get('end').x > b.get('join').x);

    const loop = { nodes: [node('go', 'begin'), node('each', 'repeat'), node('body', 'note'), node('end', 'finish')],
                   connections: [edge('go', 'each'), edge('each', 'body', 'each'), edge('body', 'each', 'out', 'again'),
                                 edge('each', 'end', 'after')] };
    const l = layoutGraph(loop, catalogue);
    t.ok('a loop\'s return line does not pull its body left of it', l.get('body').x > l.get('each').x
         && l.get('each').x > l.get('go').x, JSON.stringify([...l]));
    t.ok('its body is above what runs when it is done', l.get('body').y < l.get('end').y);
    const named = layoutGraph({ ...loop, connections: [edge('go', 'each', 'out', 'again'), edge('each', 'body', 'each'),
                                                       edge('body', 'each', 'out', 'in'), edge('each', 'end', 'after')] },
                              catalogue, { loopEntry: 'again' });
    t.ok('the loop\'s entry port is a setting', named.get('body').x > named.get('each').x, JSON.stringify([...named]));

    const cycle = { nodes: [node('a', 'note'), node('b', 'note')], connections: [edge('a', 'b'), edge('b', 'a')] };
    const c = layoutGraph(cycle, catalogue);
    t.ok('a cycle does not hang, and every step gets a place', c.size === 2 && c.has('a') && c.has('b'));
    const unknown = layoutGraph({ nodes: [node('x', 'nope', 5, 5), node('y', 'also-nope')], connections: [] },
                                createStepCatalogue([]));
    t.ok('steps of no known type, and no labels, still get places (the localeCompare trap)',
         unknown.size === 2 && [...unknown.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    t.ok('no graph at all is no places', layoutGraph(null, catalogue).size === 0);
}

t.section('§5 the logic graph on this catalogue');
{
    const g = G.emptyGraph();
    G.addNode(g, 'begin', {}, { id: 'go', catalogue });
    G.addNode(g, 'fetch', {}, { id: 'get', catalogue });
    G.addNode(g, 'finish', {}, { id: 'end', catalogue });
    t.check('a new id stem is the catalogue\'s idBase', G.addNode(g, 'x-note', null, { catalogue }).id, 'note');
    const refuse = (e, needle) => {
        const v = G.canConnect(g, catalogue, e);
        t.ok(`refused: ${needle}`, !v.ok && v.reason.includes(needle), v.reason);
    };
    refuse(edge('get', 'get', 'out', 'in'), 'itself');
    refuse(edge('go', 'get', 'nope', 'in'), 'no output called nope');
    refuse(edge('get', 'end', 'answer', 'in'), 'Only flow ports');
    t.ok('a flow edge connects', G.connect(g, catalogue, edge('go', 'get')).ok);
    refuse(edge('go', 'get'), 'already connected');
    refuse(edge('go', 'end'), 'takes one connection');
}

t.done();
