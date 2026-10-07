/**
 * A DATA FLOW'S JSON AND EVERY EDIT THE LANE EDITOR MAKES TO IT, PURE
 * (36 §7.1, §7.4, §7.6).
 *
 *   §1  serialisePipeline is byte-stable: the mock opened and saved is the
 *       same text, config keys sorted all the way down, unknown keys KEPT,
 *       a position kept and never invented, a label top-level
 *   §2  connection ids are deterministic: the lowest free `cN`
 *   §3  "+" splices: A → new → B, the new step going ON in A's lane (a fork
 *       of A stays a fork), a sink joined beside, a feeder's last card spliced
 *       into its feed, a new step's id from the catalogue's stem
 *   §4  remove reconnects the lane input to what the step led to, keeping the
 *       lines' ids; a removed source leaves its lane unconnected; a removed
 *       join drops its other lanes' lines
 *   §5  a join's input set in settings: the line already there keeps its id,
 *       a new one takes the lowest free, empty removes it, a cycle is refused;
 *       the candidates are every step with an output that is not downstream,
 *       in lane order
 *   §6  upstream, nearest first; parameters keep their place
 *
 *     node tests/flow_lanes_pipeline.test.mjs        (plain node; no DOM)
 */
import { assertions } from './flow_env.mjs';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';
import { layoutLanes } from '../src/flow/lanes/layout.js';
import {
    addSource, addStepAfter, inputCandidates, laneFeedOf, nextConnectionId, normalisePipeline, removeParameter,
    removeStep, serialisePipeline, setInput, setParameter, upstreamOf,
} from '../src/flow/lanes/pipeline.js';
import { CATEGORIES, MOCK_PIPELINE, TYPES } from './fixtures/flow_lanes_fixture.mjs';

const t = assertions('flow lanes — the flow\'s JSON');
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES, idBase: (type) => type.type_id.replace(/^(read|write)-/, '') });
const fresh = () => normalisePipeline(MOCK_PIPELINE);
const lanes = (p) => layoutLanes(p, catalogue).lanes.map((l) => l.steps.map((s) => s.id));
const edges = (p) => p.connections.map((c) => `${c.id}:${c.sourceId}.${c.sourcePort}>${c.targetId}.${c.targetPort}`);

t.section('§1 byte-stable');
{
    const text = serialisePipeline(MOCK_PIPELINE);
    t.check('opened and saved with no edit: the identical text', serialisePipeline(JSON.parse(text)), text);
    t.check('…and again', serialisePipeline(normalisePipeline(JSON.parse(text))), text);
    const shuffled = { parameters: { b: { description: 'B', default: 1, type: 'number' }, a: { type: 'text' } },
                       connections: [{ targetPort: 'in', targetId: 'y', sourcePort: 'out', sourceId: 'x', id: 'c1', note: 'kept' }],
                       nodes: [{ position: { y: 2, x: 1 }, config: { z: { b: 1, a: 2 }, a: [{ y: 1, x: 2 }] }, label: 'X', type: 't', id: 'x',
                                 notes: 'kept too' }],
                       version: 3 };
    t.check('known keys in order, config sorted all the way down, unknown keys kept and sorted after',
            serialisePipeline(shuffled),
            '{"nodes":[{"id":"x","type":"t","label":"X","config":{"a":[{"x":2,"y":1}],"z":{"a":2,"b":1}},'
            + '"position":{"x":1,"y":2},"notes":"kept too"}],"connections":[{"id":"c1","sourceId":"x","sourcePort":"out",'
            + '"targetId":"y","targetPort":"in","note":"kept"}],"parameters":{"b":{"type":"number","default":1,'
            + '"description":"B"},"a":{"type":"text"}},"version":3}');
    t.ok('parameters keep their stored order (b before a)', serialisePipeline(shuffled).indexOf('"b":') < serialisePipeline(shuffled).indexOf('"a":{"type"'));
    t.check('a node with no position is given none', 'position' in normalisePipeline({ nodes: [{ id: 'a', type: 't' }] }).nodes[0], false);
    t.check('an empty label is no label', 'label' in normalisePipeline({ nodes: [{ id: 'a', type: 't', label: '' }] }).nodes[0], false);
    t.check('nothing at all is an empty flow', serialisePipeline(null), '{"nodes":[],"connections":[],"parameters":{}}');
}

t.section('§2 connection ids');
{
    t.check('the lowest free cN', nextConnectionId({ connections: [{ id: 'c1' }, { id: 'c3' }, { id: 'x9' }] }), 'c2');
    t.check('after c1…c6', nextConnectionId(fresh()), 'c7');
    t.check('none yet', nextConnectionId({ connections: [] }), 'c1');
}

t.section('§3 "+" splices');
{
    const p = fresh();
    const n = addStepAfter(p, catalogue, 'intake', 'rename');
    t.check('the new step takes the catalogue\'s stem, numbered when it is taken', n.id, 'rename-2');
    t.check('intake → new → join: the moved line keeps its id, the new one takes c7 and sits where it was',
            edges(p), ['c1:src.out>intake.in', 'c7:intake.out>rename-2.in', 'c2:rename-2.out>join.in',
                       'c3:prog.out>join.in_right', 'c4:join.out>tidy.in', 'c5:tidy.out>rename.in', 'c6:rename.out>sink.in']);
    t.check('…and the new step goes on in the lane', lanes(p)[0], ['src', 'intake', 'rename-2', 'join', 'tidy', 'rename', 'sink']);
    t.check('a new node has no position and an empty config', [Object.keys(n).sort(), n.config], [['config', 'id', 'type'], {}]);

    const f = normalisePipeline({ nodes: [{ id: 's', type: 'read-system' }, { id: 'a', type: 'filter' }, { id: 'k', type: 'write-table' },
                                          { id: 'b', type: 'rename' }],
                                  connections: [{ id: 'c1', sourceId: 's', targetId: 'a' }, { id: 'c2', sourceId: 'a', targetId: 'k' },
                                                { id: 'c3', sourceId: 'a', targetId: 'b' }] });
    t.check('a fork before the add: k goes on in the lane, b is the fork', lanes(f), [['s', 'a', 'k'], ['b']]);
    addStepAfter(f, catalogue, 'a', 'add-columns');
    t.check('add after a: the new step splices the LANE line (into k), the fork stays a fork', lanes(f), [['s', 'a', 'add-columns', 'k'], ['b']]);

    const g = fresh();
    addStepAfter(g, catalogue, 'tidy', 'write-table');
    t.check('a sink is joined BESIDE what the step leads to, never spliced (it has no output)',
            edges(g).slice(-2), ['c6:rename.out>sink.in', 'c7:tidy.out>table.in']);
    t.check('…and so starts a fork', lanes(g), [['src', 'intake', 'join', 'tidy', 'rename', 'sink'], ['prog'], ['table']]);

    const h = fresh();
    addStepAfter(h, catalogue, 'prog', 'filter');
    t.check('after a feeder\'s last card: spliced INTO its feed — prog → new → join\'s other input',
            edges(h).filter((e) => e.includes('prog') || e.includes('filter')), ['c7:prog.out>filter.in', 'c3:filter.out>join.in_right']);
    t.check('…the feeder lane grows; the join does not move', layoutLanes(h, catalogue).lanes.map((l) => l.steps.map((s) => [s.id, s.column])),
            [[['src', 0], ['intake', 1], ['join', 2], ['tidy', 3], ['rename', 4], ['sink', 5]], [['prog', 0], ['filter', 1]]]);

    const e = normalisePipeline({ nodes: [{ id: 's', type: 'read-system' }], connections: [] });
    addStepAfter(e, catalogue, 's', 'filter');
    t.check('after a card that leads nowhere: only the new line', edges(e), ['c1:s.out>filter.in']);
    t.check('a step that is not there adds nothing', addStepAfter(fresh(), catalogue, 'nope', 'filter'), null);
    const s = fresh();
    const src = addSource(s, catalogue, 'read-table');
    t.check('a source is the last node and starts the last lane', [s.nodes.at(-1).id, lanes(s).at(-1)], [src.id, [src.id]]);
}

t.section('§4 remove');
{
    const p = fresh();
    removeStep(p, catalogue, 'tidy');
    t.check('mid-lane: the lane input is reconnected to what it led to, the line out keeping its id',
            edges(p), ['c1:src.out>intake.in', 'c2:intake.out>join.in', 'c3:prog.out>join.in_right', 'c5:join.out>rename.in',
                       'c6:rename.out>sink.in']);
    const q = fresh();
    removeStep(q, catalogue, 'src');
    t.check('a source: its lines go, and the steps after it are a lane flagged not connected',
            [lanes(q)[0], layoutLanes(q, catalogue).lanes[0].unconnected], [['intake', 'join', 'tidy', 'rename', 'sink'], true]);
    const r = fresh();
    removeStep(r, catalogue, 'join');
    t.check('a join: its lane input goes on to the next step, its other lane\'s line is dropped',
            edges(r), ['c1:src.out>intake.in', 'c4:intake.out>tidy.in', 'c5:tidy.out>rename.in', 'c6:rename.out>sink.in']);
    t.check('…and Programmes is a lane of its own', lanes(r), [['src', 'intake', 'tidy', 'rename', 'sink'], ['prog']]);
    t.check('nothing to remove', removeStep(fresh(), catalogue, 'nope'), false);
}

t.section('§5 a join\'s input, set in settings');
{
    const p = fresh();
    const layout = layoutLanes(p, catalogue);
    t.check('the candidates: every step with an output, not downstream of the join, in lane order',
            inputCandidates(p, catalogue, layout, 'join').map((c) => [c.id, c.lane]), [['src', 0], ['intake', 0], ['prog', 1]]);
    t.ok('a step downstream, or a sink, is never offered', !inputCandidates(p, catalogue, layout, 'join').some((c) => ['tidy', 'rename', 'sink', 'join'].includes(c.id)));
    t.check('set to src: the line keeps its id', [setInput(p, catalogue, 'join', 'in_right', 'src'), edges(p)[2]],
            [true, 'c3:src.out>join.in_right']);
    t.check('the same again changes nothing', setInput(p, catalogue, 'join', 'in_right', 'src'), false);
    t.check('a cycle is refused', [setInput(p, catalogue, 'join', 'in_right', 'tidy'), edges(p)[2]], [false, 'c3:src.out>join.in_right']);
    t.check('itself is refused', setInput(p, catalogue, 'join', 'in_right', 'join'), false);
    t.check('empty removes it', [setInput(p, catalogue, 'join', 'in_right', null), p.connections.some((c) => c.targetPort === 'in_right')], [true, false]);
    t.check('set again: a new line, the lowest free id', [setInput(p, catalogue, 'join', 'in_right', 'prog'), edges(p).at(-1)],
            [true, 'c3:prog.out>join.in_right']);
    t.check('the lane feed is the first line into the lane input', laneFeedOf(p, catalogue, 'join').id, 'c2');
}

t.section('§6 upstream, parameters');
{
    const p = fresh();
    t.check('upstream of the sink, nearest first', upstreamOf(p, 'sink'), ['rename', 'tidy', 'join', 'intake', 'prog', 'src']);
    t.check('a source has none', upstreamOf(p, 'src'), []);
    setParameter(p, 'region', { type: 'text', default: 'EU' });
    setParameter(p, 'year', { type: 'integer', default: 2027, description: 'The intake.' }, { rename: 'intake' });
    t.check('a rename keeps its place; a new one goes last', Object.keys(p.parameters), ['year', 'region']);
    t.check('…with the definition in fixed key order', JSON.stringify(p.parameters.year), '{"type":"integer","default":2027,"description":"The intake."}');
    t.check('an empty description is no description', JSON.stringify(setParameter(p, 'region', { type: 'text', description: '' })), '{"type":"text"}');
    t.check('removed', [removeParameter(p, 'region'), Object.keys(p.parameters)], [true, ['year']]);
    t.check('nothing to remove', removeParameter(p, 'nope'), false);
}

t.done();
