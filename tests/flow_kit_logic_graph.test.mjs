/**
 * THE LOGIC-GRAPH HELPERS (36 §3.14) — moved from Tables' designer graph model.
 *
 *   §1  serialise is BYTE-STABLE: key order fixed, config keys sorted, nodes
 *       and connections in the order drawn, and a round trip is the identical
 *       text; normalise keeps only what the graph carries
 *   §2  nextId and addNode: the catalogue's stem, `-2`, `-3`; a wanted id that
 *       is taken or malformed is not used; a new step is at (0, 0)
 *   §3  canConnect refuses only what cannot be drawn honestly, each refusal a
 *       sentence — and the consumer's words for reading a data port go in it
 *   §4  removeNode takes its connections with it; disconnect one exact edge
 *   §5  inputNamesOf: the names one scope of a syntax reads, first-seen order
 *
 * Pure: no jsdom.   node tests/flow_kit_logic_graph.test.mjs
 */
import { assertions } from './flow_env.mjs';
import * as G from '../src/flow/kit/logic_graph.js';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';
import { TEMPLATE_REFERENCES } from '../src/flow/kit/references.js';

const t = assertions('flow kit — logic graph');
const flow = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const cat = createStepCatalogue([
    { type_id: 'start', role: 'start', ports: [flow('out', 'output')] },
    { type_id: 'http-request', ports: [flow('in', 'input', { multiple: true }), flow('out', 'output'),
                                       flow('error', 'output'),
                                       { name: 'response', direction: 'output', port_type: 'DATA' }] },
    { type_id: 'parallel', role: 'fanout', ports: [flow('in', 'input'), flow('out', 'output', { multiple: true })] },
    { type_id: 'prefix-read', ports: [flow('in', 'input'), flow('out', 'output')] },
], { idBase: (type) => type.type_id.replace(/^prefix-/, '') });

t.section('§1 serialise is byte-stable');
{
    const g = {
        nodes: [{ id: 'b', type: 'http-request', config: { z: 1, a: { y: 2, b: [{ d: 1, c: 2 }] } },
                  position: { x: 10.4, y: 20.6 }, label: 'Fetch', extra: 'dropped' },
                { id: 'a', type: 'start', position: { x: 0 } }],
        connections: [{ source: 'a', target: 'b' }],
    };
    const text = G.serialise(g);
    t.check('the text', text, '{"nodes":[{"id":"b","type":"http-request","label":"Fetch","config":{"a":{"b":[{"c":2,"d":1}],'
            + '"y":2},"z":1},"position":{"x":10,"y":21}},{"id":"a","type":"start","config":{},"position":{"x":0,"y":0}}],'
            + '"connections":[{"source":"a","target":"b","sourcePort":"out","targetPort":"in"}]}');
    t.check('a round trip is the identical text', G.serialise(JSON.parse(text)), text);
    t.check('normalise drops what the graph does not carry', Object.keys(G.normalise(g).nodes[0]),
            ['id', 'type', 'label', 'config', 'position']);
    t.ok('normalise copies the config, deep', G.normalise(g).nodes[0].config.a !== g.nodes[0].config.a);
    t.check('nothing is the empty graph', G.serialise(null), '{"nodes":[],"connections":[]}');
}

t.section('§2 nextId and addNode');
{
    const g = G.emptyGraph();
    t.check('the catalogue\'s stem', G.addNode(g, 'prefix-read', null, { catalogue: cat }).id, 'read');
    t.check('then -2', G.addNode(g, 'prefix-read', null, { catalogue: cat }).id, 'read-2');
    t.check('with no catalogue, the type id made safe', G.nextId(g, 'a b/c'), 'a-b-c');
    t.check('a wanted id is used when free', G.addNode(g, 'start', null, { id: 'begin' }).id, 'begin');
    t.check('…not when taken', G.addNode(g, 'start', null, { id: 'begin' }).id, 'start');
    t.check('…nor when malformed', G.addNode(g, 'start', null, { id: 'has space' }).id, 'start-2');
    t.check('a new step is at (0, 0) with an empty config', [g.nodes[0].position, g.nodes[0].config],
            [{ x: 0, y: 0 }, {}]);
    const n = G.addNode(g, 'http-request', { x: 3.6, y: 1.2 }, { label: 'Call', config: { url: 'x' } });
    t.check('a label, a config and a rounded position', [n.label, n.config, n.position], ['Call', { url: 'x' }, { x: 4, y: 1 }]);
}

t.section('§3 canConnect refuses only what cannot be drawn honestly');
{
    const g = { nodes: [{ id: 's', type: 'start' }, { id: 'h', type: 'http-request' }, { id: 'h2', type: 'http-request' },
                        { id: 'p', type: 'parallel' }], connections: [] };
    const edge = (source, sourcePort, target, targetPort = 'in') => ({ source, sourcePort, target, targetPort });
    t.check('itself', G.canConnect(g, cat, edge('h', 'out', 'h')).reason, 'A step cannot connect to itself.');
    t.check('a missing end', G.canConnect(g, cat, edge('h', 'out', 'zz')).reason, 'Both ends must be steps in this flow.');
    t.check('no such output', G.canConnect(g, cat, edge('h', 'nope', 'h2')).reason, 'This step has no output called nope.');
    t.check('no such input', G.canConnect(g, cat, edge('h', 'out', 'h2', 'nope')).reason, 'That step has no input called nope.');
    t.check('a data port, in the consumer\'s words',
            G.canConnect(g, cat, edge('h', 'response', 'h2'), { dataRead: '${steps.h.response}' }).reason,
            'Only flow ports connect; a data port is read as ${steps.h.response}.');
    t.ok('a legal connection', G.connect(g, cat, edge('s', 'out', 'h')).ok && g.connections.length === 1);
    t.check('twice', G.canConnect(g, cat, edge('s', 'out', 'h')).reason, 'These two are already connected.');
    t.ok('a one-line port refuses a second line', /takes one connection/.test(G.canConnect(g, cat, edge('s', 'out', 'h2')).reason));
    G.connect(g, cat, edge('p', 'out', 'h'));
    t.ok('a multiple port takes a second', G.connect(g, cat, edge('p', 'out', 'h2')).ok);
    t.check('a refused connect changes nothing', [G.connect(g, cat, edge('h', 'out', 'h')).ok, g.connections.length], [false, 3]);
    t.check('the consumer\'s sentences win', G.canConnect(g, cat, edge('h', 'out', 'h'), { strings: { connectSelf: 'Nope.' } }).reason, 'Nope.');
}

t.section('§4 remove and disconnect');
{
    const g = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
                connections: [{ source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' },
                              { source: 'b', target: 'c', sourcePort: 'out', targetPort: 'in' },
                              { source: 'a', target: 'c', sourcePort: 'out', targetPort: 'in' }] };
    G.disconnect(g, { source: 'a', target: 'c', sourcePort: 'out', targetPort: 'in' });
    t.check('one exact edge goes', g.connections.length, 2);
    G.removeNode(g, 'b');
    t.check('a removed step takes its connections', [g.nodes.map((n) => n.id), g.connections], [['a', 'c'], []]);
}

t.section('§5 inputNamesOf');
{
    const g = { nodes: [
        { id: 'a', config: { url: 'https://x/${run.since}?q=${run.query.text}', headers: { k: '${run.since}' } } },
        { id: 'b', config: { list: ['${other.x}', { deep: '${run.limit}' }], n: 5 } },
    ] };
    t.check('first-seen order, once each, one scope only', G.inputNamesOf(g, TEMPLATE_REFERENCES, 'run'),
            ['since', 'query', 'limit']);
    t.check('nothing read is nothing', G.inputNamesOf(G.emptyGraph(), TEMPLATE_REFERENCES, 'run'), []);
}

t.done();
