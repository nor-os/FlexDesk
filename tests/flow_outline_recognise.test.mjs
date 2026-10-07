/**
 * THE OUTLINE IS THE GRAPH (36 §6.3, §6.4) — the recogniser over the corpus.
 *
 *   §1  every block-shaped graph in the corpus is recognised AS THE TREE THE
 *       CORPUS STATES (written by hand, not by the recogniser)
 *   §2  I1 — graphFromOutline(tree) equals the graph AS SETS: nodes by id and
 *       deep-equal, lines as (source, port, target, port); and the lines are
 *       written back from the tree's structure, not copied
 *   §3  I4 — every graph that is not block-shaped is REFUSED with the code
 *       and the step the corpus states, a sentence naming it, and the graph
 *       untouched by the attempt
 *   §4  every refusal code of 36 §6.3 is exercised by at least one graph
 *   §5  spike S-outline: the four demo workflows of the first consumer are
 *       block-shaped, and a line jumping from one branch into another IS
 *       refused `outline_jump_out`
 *   §6  declared port order is meaning: arms come in the order the type
 *       declares its ports, never the alphabet; a fanout's in the order its
 *       lines were drawn
 *   §7  the mapping is the consumer's: a catalogue whose roles are spelled
 *       differently is read through `role` names in the mapping
 *   §8  a line from a step into itself — a loop's body straight into its
 *       own Next among them — is refused `outline_cycle` in its own words
 *
 * Pure: no jsdom.   node tests/flow_outline_recognise.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { BLOCKS, CORPUS, catalogue, entry } from './flow_outline_fixtures.mjs';
import {
    outlineFromGraph, graphFromOutline, sameGraphAsSets, describeOutline, runOrder,
} from '../src/flow/outline/recognise.js';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';

const t = assertions('flow outline — the recogniser');
const cat = catalogue();
const shaped = CORPUS.graphs.filter((g) => g.expect.tree);
const refused = CORPUS.graphs.filter((g) => g.expect.refused);

t.section('§1 each block-shaped graph is the tree the corpus states');
t.ok('the corpus holds block-shaped graphs and refusals', shaped.length >= 12 && refused.length >= 15,
     `${shaped.length} shaped, ${refused.length} refused`);
for (const g of shaped) {
    const r = outlineFromGraph(structuredClone(g.graph), cat, BLOCKS);
    t.ok(`${g.name}: recognised`, r.ok, r.ok ? '' : `${r.code}: ${r.message}`);
    if (r.ok) t.check(`${g.name}: its outline`, describeOutline(r.tree), g.expect.tree);
}

t.section('§2 I1 — the tree written back is the graph, as sets');
for (const g of shaped) {
    const r = outlineFromGraph(structuredClone(g.graph), cat, BLOCKS);
    if (!r.ok) continue;
    const back = graphFromOutline(r.tree);
    t.ok(`${g.name}: graphFromOutline(tree) equals the graph`, sameGraphAsSets(back, g.graph),
         JSON.stringify(back.connections));
    t.check(`${g.name}: as many lines as the graph has`, back.connections.length, g.graph.connections.length);
    t.check(`${g.name}: every node placed once, in run order`,
            [...runOrder(r.tree)].sort(), g.graph.nodes.map((n) => n.id).sort());
}
{
    // The lines are the TREE's: drop one from a recognised tree's Seq and the
    // graph written back loses exactly that line.
    const g = entry('failing-grades').graph;
    const r = outlineFromGraph(structuredClone(g), cat, BLOCKS);
    const loop = r.tree.top.items.find((i) => i.kind === 'loop');
    loop.body.seq.items.pop();                              // tally
    const back = graphFromOutline(r.tree);
    t.ok('a tree edited by hand writes back a different graph (the lines are derived, not stored)',
         !sameGraphAsSets(back, g));
    t.ok('… with raise now going straight to the loop\'s next',
         back.connections.some((c) => c.source === 'raise' && c.target === 'failing' && c.targetPort === 'next'));
}
t.ok('sameGraphAsSets tells a moved line from the original',
     !sameGraphAsSets({ nodes: [], connections: [{ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' }] },
                      { nodes: [], connections: [{ source: 'a', sourcePort: 'error', target: 'b', targetPort: 'in' }] }));
t.ok('… and a changed setting', !sameGraphAsSets({ nodes: [{ id: 'a', config: { x: 1 } }], connections: [] },
                                                { nodes: [{ id: 'a', config: { x: 2 } }], connections: [] }));

t.section('§3 I4 — refused with a code and a step, never repaired');
for (const g of refused) {
    const before = JSON.stringify(g.graph);
    const graph = structuredClone(g.graph);
    const r = outlineFromGraph(graph, cat, BLOCKS);
    t.ok(`${g.name}: refused`, !r.ok, r.ok ? describeOutline(r.tree).join(' / ') : '');
    if (r.ok) continue;
    t.check(`${g.name}: the code and the step it names`, { code: r.code, node_id: r.node_id }, g.expect.refused);
    t.ok(`${g.name}: a sentence`, typeof r.message === 'string' && r.message.length > 10 && !r.message.includes('undefined'),
         r.message);
    if (r.node_id) {
        const n = g.graph.nodes.find((x) => x.id === r.node_id);
        const name = n?.label || cat.get(n?.type)?.label || r.node_id;
        // Three sentences name something else on purpose: the second Start is
        // "two Start steps", an unknown type names the TYPE, and a broken line
        // names the id that is missing (the step it names is the line's other end).
        t.ok(`${g.name}: the sentence names the step it is about`, r.message.includes(name)
             || ['outline_two_starts', 'outline_unknown_type', 'outline_broken_line'].includes(r.code), r.message);
    }
    t.ok(`${g.name}: the graph is exactly as it was`, JSON.stringify(graph) === before);
}

t.section('§4 every refusal of 36 §6.3 has a graph');
{
    const codes = new Set(refused.map((g) => g.expect.refused.code));
    for (const code of ['outline_no_start', 'outline_two_starts', 'outline_unknown_type', 'outline_unreachable',
                        'outline_shared_step', 'outline_jump_out', 'outline_two_continuations',
                        'outline_parallel_unjoined', 'outline_merge_unpaired', 'outline_loop_shape', 'outline_cycle']) {
        t.ok(`${code} is exercised`, codes.has(code));
    }
    const loopShapes = refused.filter((g) => g.expect.refused.code === 'outline_loop_shape').map((g) => g.name);
    t.ok('the loop refusals: a body that never returns, a Next from outside, a body that leaks',
         ['refuse-loop-never-returns', 'refuse-loop-next-from-outside', 'refuse-loop-body-leaks'].every((n) => loopShapes.includes(n)),
         loopShapes.join(', '));
    const leak = outlineFromGraph(structuredClone(entry('refuse-loop-body-leaks').graph), cat, BLOCKS);
    t.ok('a leaking body says where it leaks to', /reaches ‘After’/.test(leak.message), leak.message);
}

t.section('§5 spike S-outline');
for (const name of ['enrolment-health', 'failing-grades', 'close-applications', 'withdrawn-still-enrolled']) {
    t.ok(`demo workflow ${name} is block-shaped`, outlineFromGraph(structuredClone(entry(name).graph), cat, BLOCKS).ok);
}
{
    const r = outlineFromGraph(structuredClone(entry('refuse-jump-between-branches').graph), cat, BLOCKS);
    t.check('a line from one branch into another is refused outline_jump_out', r.code, 'outline_jump_out');
    t.ok('… naming the line\'s step and where it went', r.message === 'A line from ‘H’ leaves its block for ‘A’.', r.message);
}

t.section('§6 declared port order is meaning');
{
    // A branch type whose ports are declared false-first is drawn false-first.
    const types = structuredClone(CORPUS_TYPES());
    const cond = types.find((x) => x.type_id === 'condition');
    cond.ports = [cond.ports[0], cond.ports[2], cond.ports[1]];
    const c2 = createStepCatalogue(types, { categories: [] });
    const g = entry('failing-grades').graph;
    const r = outlineFromGraph(structuredClone(g), c2, BLOCKS);
    const branch = r.tree.top.items[1].body.seq.items[0];
    t.check('arms in the type\'s declared order', branch.arms.map((a) => a.port), ['false', 'true']);
    // A switch-like branch with ports z, a, m keeps z, a, m.
    const sw = { type_id: 'switch', label: 'Switch', role: 'branch',
                 ports: [{ name: 'in', direction: 'input' }, { name: 'z', direction: 'output' },
                         { name: 'a', direction: 'output' }, { name: 'm', direction: 'output' }] };
    const c3 = createStepCatalogue([...CORPUS_TYPES(), sw]);
    const r3 = outlineFromGraph({ nodes: [{ id: 's', type: 'start', config: {} }, { id: 'w', type: 'switch', config: {} },
                                          { id: 'e', type: 'end', config: {} }],
                                  connections: [{ source: 's', target: 'w', sourcePort: 'out', targetPort: 'in' },
                                                { source: 'w', target: 'e', sourcePort: 'a', targetPort: 'in' },
                                                { source: 'w', target: 'e', sourcePort: 'm', targetPort: 'in' },
                                                { source: 'w', target: 'e', sourcePort: 'z', targetPort: 'in' }] }, c3, BLOCKS);
    t.check('a switch\'s arms are z, a, m — declared, not sorted', r3.tree.top.items[0].arms.map((a) => a.port), ['z', 'a', 'm']);
    // A fanout's arms are in the order its lines were drawn.
    const e = entry('enrolment-health').graph;
    const g2 = structuredClone(e);
    const idx = g2.connections.findIndex((c) => c.source === 'counts' && c.target === 'graded');
    const [moved] = g2.connections.splice(idx, 1);
    g2.connections.push(moved);
    const r2 = outlineFromGraph(g2, cat, BLOCKS);
    t.check('a fanout\'s branches follow the order its lines were drawn',
            r2.tree.top.items[0].arms.map((a) => a.seq.items[0].id), ['below', 'unmarked', 'graded']);
}

t.section('§7 the roles are the mapping\'s');
{
    const types = CORPUS_TYPES().map((x) => ({ ...x, role: { branch: 'decision', loop: 'repeat' }[x.role] ?? x.role }));
    const c4 = createStepCatalogue(types, { categories: [] });
    const g = entry('failing-grades').graph;
    t.ok('with the catalogue\'s own role words unmapped, a decision is an ordinary step and the flow is refused',
         !outlineFromGraph(structuredClone(g), c4, BLOCKS).ok);
    const mapped = { ...BLOCKS, branch: { ...BLOCKS.branch, role: 'decision' }, loop: { ...BLOCKS.loop, role: 'repeat' } };
    const r = outlineFromGraph(structuredClone(g), c4, mapped);
    t.ok('mapped, it is the same outline', r.ok && describeOutline(r.tree).join('\n') === entry('failing-grades').expect.tree.join('\n'));
}

t.section('§8 a line from a step into itself');
{
    const node = (id, type) => ({ id, type, config: {}, position: { x: 0, y: 0 } });
    const line = (source, sourcePort, target, targetPort) => ({ source, sourcePort, target, targetPort });
    for (const [name, nodes, lines, id] of [
        ['a loop whose body goes straight into its own Next', [node('s', 'start'), node('l', 'loop-over-rows')],
         [line('s', 'out', 'l', 'in'), line('l', 'body', 'l', 'next')], 'l'],
        ['an ordinary step into itself', [node('s', 'start'), node('x', 'log')],
         [line('s', 'out', 'x', 'in'), line('x', 'out', 'x', 'in')], 'x'],
    ]) {
        const graph = { nodes, connections: lines };
        const before = JSON.stringify(graph);
        const r = outlineFromGraph(graph, cat, BLOCKS);
        t.check(`${name}: refused as a cycle naming the step`, r.ok ? 'accepted' : [r.code, r.node_id], ['outline_cycle', id]);
        t.ok(`${name}: the sentence says it connects to itself, not that only a Next may lead back`,
             !r.ok && r.message.includes('itself') && !r.message.includes('only a loop'), r.message);
        t.ok(`${name}: never repaired`, JSON.stringify(graph) === before);
    }
}

function CORPUS_TYPES() {
    return structuredClone(JSON.parse(JSON.stringify(cat.list())));
}

t.done();
