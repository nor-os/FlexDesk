/**
 * WHICH STEPS ALWAYS RUN BEFORE THIS ONE (36 §3.7, §8) — the one rule behind
 * *Insert a value*. The suite that finds defects here is the negative one: a
 * step the picker must NOT offer.
 *
 *   §1  the InsertValue mock: from "Send the invitation" the list is
 *       Check eligibility, the loop, Anything new?, Save, Fetch, Start —
 *       nearest first — and NOT "Stop: the portal is down" (an error arm that
 *       ends), NOT "Note it and move on" (the sibling arm), NOT "Stop: nothing
 *       new" (the other arm of the condition)
 *   §2  the parallel case: a merge that waits for EVERY branch makes each
 *       branch's steps run before it; one that goes on with the FIRST does not
 *   §3  the loop case: a step after the loop never has a body step before it,
 *       though the loop itself is; a step in the body has the loop before it
 *   §4  arms: never a sibling arm's steps; a nested parallel inside a branch
 *   §5  the edges of the rule: an unknown step, an unreachable one, a return
 *       edge that is not a way in, no start step
 *
 * Pure: no jsdom.   node tests/flow_kit_always_before.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { alwaysBefore, enclosingLoops } from '../src/flow/kit/always_before.js';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';

const t = assertions('flow kit — always before');
const fixture = JSON.parse(t.read('tests/fixtures/flow_kit_insert_value.json'));
const cat = createStepCatalogue(fixture.types);
const g = fixture.graph;
const clone = (x) => JSON.parse(JSON.stringify(x));

t.section('§1 the InsertValue mock');
t.check('from Send the invitation', alwaysBefore(g, cat, 'invite'), ['check', 'each', 'anynew', 'save', 'fetch', 'start']);
{
    const before = alwaysBefore(g, cat, 'invite');
    t.ok('not "Stop: the portal is down" — the error arm that ends', !before.includes('portaldown'));
    t.ok('not "Note it and move on" — the sibling arm', !before.includes('checkfail'));
    t.ok('not "Stop: nothing new" — the other arm', !before.includes('nothing'));
}
t.check('the loop it is inside', enclosingLoops(g, cat, 'invite'), ['each']);
t.check('from the error arm\'s step: the same, without Send the invitation', alwaysBefore(g, cat, 'checkfail'),
        ['check', 'each', 'anynew', 'save', 'fetch', 'start']);
t.check('from the first step: only Start', alwaysBefore(g, cat, 'fetch'), ['start']);
t.check('from Start: nothing', alwaysBefore(g, cat, 'start'), []);

t.section('§2 the parallel case');
t.check('a merge that waits for every branch: both branches run before Finish', alwaysBefore(g, cat, 'done'),
        ['join', 'tell', 'summary', 'report', 'each', 'anynew', 'save', 'fetch', 'start']);
t.check('…and before the merge itself', alwaysBefore(g, cat, 'join'),
        ['tell', 'summary', 'report', 'each', 'anynew', 'save', 'fetch', 'start']);
t.check('inside a branch, never the other branch', alwaysBefore(g, cat, 'summary'),
        ['report', 'each', 'anynew', 'save', 'fetch', 'start']);
{
    const any = clone(g);
    any.nodes.find((n) => n.id === 'join').config.join = 'any';
    t.check('a merge that goes on with the FIRST: the branches are not before it', alwaysBefore(any, cat, 'done'),
            ['join', 'report', 'each', 'anynew', 'save', 'fetch', 'start']);
    t.check('the consumer decides what "wait for every branch" reads',
            alwaysBefore(g, cat, 'done', { waitsForAll: () => false }).includes('tell'), false);
}

t.section('§3 the loop case');
{
    const after = alwaysBefore(g, cat, 'report');
    t.ok('the loop runs before a step after it', after.includes('each'));
    t.ok('its body never does — the loop may visit no row', !after.includes('check') && !after.includes('invite'));
    t.check('a body step has the loop and the steps before it', alwaysBefore(g, cat, 'check'),
            ['each', 'anynew', 'save', 'fetch', 'start']);
    t.check('a step after the loop is inside no loop', enclosingLoops(g, cat, 'report'), []);
    t.check('the loop is not inside itself', enclosingLoops(g, cat, 'each'), []);
    // A loop whose body is the ONLY way on (a body that runs straight on, past
    // its Next): the after-step is still never handed a body step.
    const nested = clone(g);
    nested.nodes.push({ id: 'inner', type: 'loop-over-rows', config: {} }, { id: 'deep', type: 'log', config: {} });
    nested.connections = nested.connections.filter((c) => !(c.source === 'invite' && c.target === 'each'));
    nested.connections.push(
        { source: 'invite', target: 'inner', sourcePort: 'out', targetPort: 'in' },
        { source: 'inner', target: 'deep', sourcePort: 'body', targetPort: 'in' },
        { source: 'deep', target: 'inner', sourcePort: 'out', targetPort: 'next' },
        { source: 'inner', target: 'each', sourcePort: 'done', targetPort: 'next' },
    );
    t.check('a loop inside a loop: innermost first', enclosingLoops(nested, cat, 'deep'), ['inner', 'each']);
    t.check('the inner body has both loops before it', alwaysBefore(nested, cat, 'deep'),
            ['inner', 'invite', 'check', 'each', 'anynew', 'save', 'fetch', 'start']);
}

t.section('§4 arms and a nested parallel');
{
    const F = (name, direction, multiple = false) => ({ name, direction, port_type: 'FLOW', multiple });
    const c = createStepCatalogue([
        { type_id: 'start', role: 'start', ports: [F('out', 'output')] },
        { type_id: 'step', ports: [F('in', 'input', true), F('out', 'output')] },
        { type_id: 'if', role: 'branch', ports: [F('in', 'input'), F('true', 'output'), F('false', 'output')] },
        { type_id: 'par', role: 'fanout', ports: [F('in', 'input'), F('out', 'output', true)] },
        { type_id: 'merge', role: 'join', ports: [F('in', 'input', true), F('out', 'output')] },
    ]);
    const node = (id, type) => ({ id, type, config: {} });
    const e = (source, target, sourcePort = 'out', targetPort = 'in') => ({ source, target, sourcePort, targetPort });
    const arms = { nodes: [node('s', 'start'), node('q', 'if'), node('t1', 'step'), node('t2', 'step'),
                           node('e1', 'step'), node('after', 'step')],
                   connections: [e('s', 'q'), e('q', 't1', 'true'), e('t1', 't2'), e('q', 'e1', 'false'),
                                 e('t2', 'after'), e('e1', 'after')] };
    t.check('an arm has its earlier steps and the head', alwaysBefore(arms, c, 't2'), ['t1', 'q', 's']);
    t.check('after the block: neither arm', alwaysBefore(arms, c, 'after'), ['q', 's']);
    const par = { nodes: [node('s', 'start'), node('f', 'par'), node('a', 'step'), node('f2', 'par'), node('x', 'step'),
                          node('y', 'step'), node('j2', 'merge'), node('c', 'step'), node('b', 'step'),
                          node('j', 'merge'), node('z', 'step')],
                  connections: [e('s', 'f'), e('f', 'a'), e('f', 'b'), e('a', 'f2'), e('f2', 'x'), e('f2', 'y'),
                                e('x', 'j2'), e('y', 'j2'), e('j2', 'c'), e('c', 'j'), e('b', 'j'), e('j', 'z')] };
    t.check('a parallel inside a branch: every step of every branch, nested ones included',
            [...alwaysBefore(par, c, 'z')].sort(), ['a', 'b', 'c', 'f', 'f2', 'j', 'j2', 's', 'x', 'y']);
    t.check('…nearest first', alwaysBefore(par, c, 'z').slice(0, 3), ['j', 'c', 'b']);
}

t.section('§5 the edges of the rule');
t.check('an unknown step: nothing', alwaysBefore(g, cat, 'nope'), []);
{
    const lonely = clone(g);
    lonely.nodes.push({ id: 'island', type: 'log', config: {} });
    t.check('a step nothing leads to: nothing', alwaysBefore(lonely, cat, 'island'), []);
    const noStart = { nodes: g.nodes.filter((n) => n.id !== 'start'),
                      connections: g.connections.filter((c) => c.source !== 'start') };
    t.check('no start step: the steps nothing leads to are the roots', alwaysBefore(noStart, cat, 'save'), ['fetch']);
    const data = clone(g);
    data.connections.push({ source: 'fetch', target: 'invite', sourcePort: 'response', targetPort: 'in' });
    t.check('a DATA edge is not a flow edge', alwaysBefore(data, cat, 'invite'),
            ['check', 'each', 'anynew', 'save', 'fetch', 'start']);
}

t.done();
