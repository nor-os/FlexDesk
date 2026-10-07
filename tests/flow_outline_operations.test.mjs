/**
 * EVERY EDIT IS AN OPERATION ON THE GRAPH (36 §6.6), and I3: every operation
 * on a block-shaped graph yields a block-shaped graph whose tree is the one
 * the operation names — or is refused, with a sentence, and changes nothing.
 *
 *   §1  insert: a step, an End, each block — where the anchor says, a block
 *       with its arms empty and connected straight to what follows
 *   §2  remove: what arrived goes on to the continuation; a block goes whole
 *   §3  move up, down and out, and move to an anchor; each refusal a sentence
 *   §4  wrap in a condition, a loop, a parallel
 *   §5  duplicate, copy and paste: new ids, references to pasted steps renamed,
 *       nothing else renamed
 *   §6  ports as settings: an arm on and off, an arm's exit inside a loop, a
 *       parallel's branches and its join setting
 *   §7  refusals change nothing — not the graph passed in, not the result
 *   §8  I3 — random operation sequences over the corpus (a fixed seed)
 *   §9  operations touch only the nodes they name; a new step is at (0, 0)
 *
 * Pure: no jsdom.   node tests/flow_outline_operations.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { BLOCKS, CORPUS, catalogue, entry } from './flow_outline_fixtures.mjs';
import { createOutlineOperations } from '../src/flow/outline/operations.js';
import { describeOutline, subtreeIds, sameGraphAsSets } from '../src/flow/outline/recognise.js';
import { createReferenceSyntax, TEMPLATE_REFERENCES, FORMULA_REFERENCES } from '../src/flow/kit/references.js';
import { serialise } from '../src/flow/kit/logic_graph.js';

const t = assertions('flow outline — operations');
const cat = catalogue();
const nodesRef = createReferenceSyntax({ name: 'template', pattern: TEMPLATE_REFERENCES.pattern,
                                         format: TEMPLATE_REFERENCES.format, stepScope: 'nodes' });
const formulaRef = createReferenceSyntax({ name: 'formula', pattern: FORMULA_REFERENCES.pattern,
                                           format: FORMULA_REFERENCES.format, stepScope: 'nodes' });
const ops = createOutlineOperations({ catalogue: cat, blocks: BLOCKS, references: { template: nodesRef, formula: formulaRef } });
const g = (name) => structuredClone(entry(name).graph);
const tree = (graph) => describeOutline(ops.read(graph).tree);
const place = (graph, id) => ops.read(graph).index.at.get(id);
const ok = (name, r) => { t.ok(name, r.ok, r.reason || ''); return r; };

t.section('§1 insert');
{
    const r = ok('a step after Save', ops.insert(g('sync-applications'), { after: 'save' }, 'log'));
    const lines = tree(r.graph);
    t.check('it is the item after Save, before Anything new?', lines.slice(5, 8), ['step save', 'step log', 'branch anynew']);
    t.ok('the new step is selected', r.select === 'log');
    t.ok('save → log → anynew', r.graph.connections.some((c) => c.source === 'save' && c.target === 'log')
         && r.graph.connections.some((c) => c.source === 'log' && c.target === 'anynew')
         && !r.graph.connections.some((c) => c.source === 'save' && c.target === 'anynew'));

    const b = ok('a condition before Save', ops.insert(g('sync-applications'), { before: 'save' }, 'condition'));
    const cond = b.select;
    t.check('both arms are empty and go straight to Save', b.graph.connections.filter((c) => c.source === cond)
        .map((c) => `${c.sourcePort}->${c.target}`).sort(), ['false->save', 'true->save']);
    t.check('drawn as a block with two empty arms rejoining', tree(b.graph).slice(5, 11),
            ['branch condition', '  arm true', '    = rejoin', '  arm false', '    = rejoin', 'step save']);

    const l = ok('a loop at the top level', ops.insert(g('empty-flow'), { into: 'top' }, 'loop-over-rows'));
    t.check('its body is empty and open, its Done unconnected', tree(l.graph),
            ['start start', 'loop loop-over-rows', '  body', '    = open', '= rejoin']);
    const inBody = ok('a step into the empty body', ops.insert(l.graph, { into: { body: 'loop-over-rows' } }, 'log'));
    t.check('it closes the body onto the loop\'s Next', tree(inBody.graph),
            ['start start', 'loop loop-over-rows', '  body', '    step log', '    = rejoin', '= rejoin']);

    const p = ok('a parallel', ops.insert(g('empty-flow'), { into: 'top' }, 'parallel'));
    t.check('one entry, two steps: the parallel and its merge, one empty branch', tree(p.graph),
            ['start start', 'fanout parallel join merge', '  branch', '    = rejoin', '= rejoin']);
    t.ok('… the merge is the fixture mapping\'s join type', p.graph.nodes.some((n) => n.id === 'merge' && n.type === 'merge'));

    const into = ok('a step into an arm', ops.insert(b.graph, { into: { arm: cond, port: 'false' } }, 'log'));
    t.ok('it is the arm\'s only step, rejoining', tree(into.graph).join('\n')
        .includes('  arm false\n    step log\n    = rejoin\nstep save'), tree(into.graph).join(' / '));

    const end = ok('an End at the end of an arm', ops.insert(b.graph, { into: { arm: cond, port: 'false' } }, 'end'));
    t.ok('the arm now ends', tree(end.graph).includes('    end end'));
    const mid = ops.insert(g('sync-applications'), { after: 'fetch' }, 'end');
    t.ok('an End in the middle of a list is refused', !mid.ok);
    t.check('… saying why', mid.reason, '‘End’ ends the run, so it can only be the last step here.');
    const after = ops.insert(g('sync-applications'), { after: 'portaldown' }, 'log');
    t.check('nothing goes after an End', after.reason, 'Nothing runs after ‘Stop: the portal is down’.');
    const un = ops.insert(g('sync-applications'), { after: 'save' }, 'send-email');
    t.check('an unavailable type is refused with its own sentence', un.reason, 'Sending email is not built yet.');
    const top = ops.insert(g('sync-applications'), { after: 'anynew' }, 'log');
    t.check('after a block whose arms all end, a step could never be reached', top.reason,
            'Every way through ‘Anything new?’ ends, so nothing would reach a step after it.');
}

t.section('§2 remove');
{
    const r = ok('remove Save', ops.remove(g('sync-applications'), 'save'));
    t.ok('fetch now goes straight to Anything new?', r.graph.connections.some((c) => c.source === 'fetch' && c.sourcePort === 'out' && c.target === 'anynew'));
    t.ok('Save is gone, with its lines', !r.graph.nodes.some((n) => n.id === 'save') && !r.graph.connections.some((c) => c.source === 'save' || c.target === 'save'));
    t.check('the next step is selected', r.select, 'anynew');
    const loop = ok('remove the loop', ops.remove(g('sync-applications'), 'each'));
    t.ok('… with everything in its body', ['each', 'check', 'checkfail', 'invite'].every((id) => !loop.graph.nodes.some((n) => n.id === id)));
    t.ok('… and Then now goes on to At the same time', loop.graph.connections.some((c) => c.source === 'anynew' && c.sourcePort === 'true' && c.target === 'report'));
    const par = ok('remove the parallel', ops.remove(g('sync-applications'), 'report'));
    t.ok('… its merge goes with it', !par.graph.nodes.some((n) => ['report', 'tell', 'summary', 'merged'].includes(n.id)));
    t.ok('… and the loop\'s Done goes on to Finish', par.graph.connections.some((c) => c.source === 'each' && c.sourcePort === 'done' && c.target === 'done'));
    const only = ok('remove the only step of a loop\'s body', ops.remove(g('nested-loops'), 's'));
    t.check('the body is empty and open again — no line from the loop to itself', tree(only.graph),
            ['start start', 'loop outer', '  body', '    loop inner', '      body', '        = open', '    = rejoin', 'end fin', '= end']);
    const e = ok('remove an End that ends an arm', ops.remove(g('stop-inside-branch'), 'stop'));
    t.check('the error port is unconnected again', e.graph.connections.filter((c) => c.source === 'h').map((c) => c.sourcePort), ['out']);
    const j = ok('removing a parallel by its merge removes the parallel', ops.remove(g('enrolment-health'), 'counted'));
    t.ok('… all of it', !j.graph.nodes.some((n) => ['counts', 'graded', 'counted'].includes(n.id)));
}

t.section('§3 move');
{
    const up = ok('Move up', ops.moveUp(g('sync-applications'), 'save'));
    t.check('Save is above Fetch', tree(up.graph).slice(1, 3), ['step save', 'step fetch']);
    t.check('Move up of the first step', ops.moveUp(g('sync-applications'), 'fetch').reason, 'already first in the top level');
    t.check('Move down of the last step in the loop', ops.moveDown(g('sync-applications'), 'invite').reason,
            'already last in For each new application');
    const down = ok('Move down', ops.moveDown(g('sync-applications'), 'check'));
    t.check('Check eligibility is below Send the invitation, its arm with it', tree(down.graph).slice(10, 18),
            ['        step invite', '          arm error', '            = open', '        step check', '          arm error',
             '            step checkfail', '            = rejoin', '        = rejoin']);
    // Its arm now REJOINS: the loop's next item is what follows Check eligibility now.
    const out = ok('Move out of the loop', ops.moveOut(g('sync-applications'), 'invite'));
    t.ok('Send the invitation is after the loop, inside Then', tree(out.graph).join('\n')
        .includes('        = rejoin\n    step invite\n      arm error\n        = open\n    fanout report'));
    t.check('Move out at the top level', ops.moveOut(g('sync-applications'), 'save').reason, 'already at the top level');
    const into = ops.move(g('sync-applications'), 'each', { before: 'check' });
    t.check('a step cannot go inside itself', into.reason, '‘For each new application’ cannot go inside itself.');
    const endDown = ops.moveDown(g('stop-inside-branch'), 'after');
    t.check('nothing moves past an End', endDown.reason, 'Nothing runs after ‘Finish’.');
    const drag = ok('move to an anchor in another block', ops.move(g('sync-applications'), 'summary', { into: { arm: 'anynew', port: 'false' } }));
    t.check('Write a summary is the first step of Otherwise, before its Stop', tree(drag.graph).slice(-5),
            ['  arm false', '    step summary', '    end nothing', '    = end', '= rejoin']);
    t.check('the branch it left is empty, not gone', ops.read(drag.graph).index.at.get('report').item.arms
        .map((a) => a.seq.items.length), [1, 0]);
    t.check('… and the moved step keeps its id', drag.select, 'summary');
}

t.section('§4 wrap');
{
    const c = ok('wrap in a condition', ops.wrap(g('sync-applications'), 'save', 'condition'));
    t.check('Save is the first arm of a new condition, where Save was', tree(c.graph).slice(5, 12),
            ['branch condition', '  arm true', '    step save', '    = rejoin', '  arm false', '    = rejoin', 'branch anynew']);
    const l = ok('wrap in a loop', ops.wrap(g('sync-applications'), 'save', 'loop-over-rows'));
    t.check('Save is the body of a new loop, closing it', tree(l.graph).slice(5, 10),
            ['loop loop-over-rows', '  body', '    step save', '    = rejoin', 'branch anynew']);
    const p = ok('wrap in a parallel', ops.wrap(g('sync-applications'), 'save', 'parallel'));
    t.check('Save is the one branch of a new parallel', tree(p.graph).slice(5, 10),
            ['fanout parallel join merge', '  branch', '    step save', '    = rejoin', 'branch anynew']);
    const only = ok('wrap the only step of a parallel\'s branch', ops.wrap(g('sync-applications'), 'tell', 'condition'));
    t.ok('… the branch now holds the condition', tree(only.graph).join('\n').includes('      branch\n        branch condition\n'));
    const end = ok('wrap an End in a condition', ops.wrap(g('sync-applications'), 'portaldown', 'condition'));
    t.ok('… the End is in Then, and Otherwise stops', tree(end.graph).join('\n').includes(
        '  arm error\n    branch condition\n      arm true\n        end portaldown\n        = end\n'
        + '      arm false\n        = rejoin\n    = open'), tree(end.graph).join(' / '));
}

t.section('§5 duplicate, copy, paste');
{
    const d = ok('duplicate Save', ops.duplicate(g('sync-applications'), 'save'));
    t.check('a copy right after it, under a new id', tree(d.graph).slice(5, 8), ['step save', 'step save-2', 'branch anynew']);
    const copy = d.graph.nodes.find((n) => n.id === 'save-2');
    const orig = d.graph.nodes.find((n) => n.id === 'save');
    t.check('same type, label and settings', [copy.type, copy.label, copy.config], [orig.type, orig.label, orig.config]);
    t.check('a new step is at (0, 0)', copy.position, { x: 0, y: 0 });
    const block = ok('duplicate the loop', ops.duplicate(g('sync-applications'), 'each'));
    const ids = ['each-2', 'check-2', 'checkfail-2', 'invite-2'];
    t.ok('every step inside is copied under a new id', ids.every((id) => block.graph.nodes.some((n) => n.id === id)), JSON.stringify(block.graph.nodes.map((n) => n.id)));
    const cf = block.graph.nodes.find((n) => n.id === 'checkfail-2');
    t.check('a reference to a copied step points at its copy', cf.config.message, 'Could not check ${loop.item.name}: ${nodes.check-2.error.message}');
    const inv = block.graph.nodes.find((n) => n.id === 'invite-2');
    t.check('a reference to anything else is left alone', inv.config.body.to, '${loop.item.email}');
    t.check('the copied loop\'s body returns to the COPY\'s Next', block.graph.connections.filter((c) => c.target === 'each-2' && c.targetPort === 'next')
        .map((c) => c.source).sort(), ['checkfail-2', 'invite-2']);
    const kept = ops.copy(g('sync-applications'), 'checkfail');
    t.ok('a copied step carries on wherever it is pasted (its own continuation is not "the next row")',
         kept && kept.exits.length === 1 && kept.exits[0].kind === 'cont');
    const arm = ops.copy(g('withdrawn-still-enrolled'), 'enrolled');
    t.ok('… but an arm INSIDE it that goes on with the next row keeps saying so', arm.exits.some((x) => x.kind === 'next'));
    const top = ops.paste(g('sync-applications'), { after: 'save' }, ops.copy(g('withdrawn-still-enrolled'), 'enrolled'));
    t.check('a fragment that goes on with a loop\'s next item cannot be pasted outside a loop', top.reason,
            '‘Still enrolled?’ goes on with the next item of a loop, so it can only go inside one.');
    const inside = ok('… and can be pasted inside one', ops.paste(g('sync-applications'), { before: 'invite' }, ops.copy(g('withdrawn-still-enrolled'), 'enrolled')));
    t.ok('… its empty arm going on with THIS loop\'s next row', inside.graph.connections.some((c) => c.source === 'enrolled'
        && c.sourcePort === 'empty' && c.target === 'each' && c.targetPort === 'next'));
    t.check('nothing to paste', ops.paste(g('sync-applications'), { after: 'save' }, null).reason, 'nothing is copied');
    const cfg = ok('a formula reference to a pasted step is renamed too', ops.duplicate(g('enrolment-health'), 'rate'));
    t.check('… only when the step it names was copied', cfg.graph.nodes.find((n) => n.id === 'rate-2').config.assignments[0].expression,
            '[nodes.graded.count]');
}

t.section('§6 ports as settings');
{
    const on = ok('connect Send the invitation\'s error port', ops.setArm(g('sync-applications'), 'invite', 'error', true));
    t.ok('it goes straight to the loop\'s next (the step\'s continuation)', on.graph.connections.some((c) => c.source === 'invite' && c.sourcePort === 'error'
        && c.target === 'each' && c.targetPort === 'next'));
    t.ok('… drawn as an empty arm that rejoins', tree(on.graph).join('\n').includes('        step invite\n          arm error\n            = rejoin'));
    const offr = ok('disconnect Check eligibility\'s error arm', ops.setArm(g('sync-applications'), 'check', 'error', false));
    t.ok('the step under it goes too', !offr.graph.nodes.some((n) => n.id === 'checkfail'));
    t.check('connecting an arm of a step with nothing after it', ops.setArm(g('arm-stops-before-the-step-after'), 'n', 'out', true).reason,
            '‘Next’ has no port called out.');
    const last = ops.setArm(g('sync-applications'), 'tell', 'error', true);
    t.ok('an arm of a branch\'s step connects to its merge', last.ok && last.graph.connections.some((c) => c.source === 'tell' && c.sourcePort === 'error' && c.target === 'merged'));
    const exit = ok('an arm in a loop: carry on instead of the next row', ops.setArmExit(g('sync-applications'), 'check', 'error', 'rejoin'));
    t.ok('… Note it and move on now goes on to Send the invitation', exit.graph.connections.some((c) => c.source === 'checkfail' && c.target === 'invite'));
    const back = ok('… and back to the next row', ops.setArmExit(exit.graph, 'check', 'error', 'next'));
    t.ok('… the same lines as before', sameGraphAsSets(back.graph, g('sync-applications')));
    t.ok('outside a loop there is no next row to go on with', !ops.setArmExit(g('stop-inside-branch'), 'h', 'error', 'next').ok);
    const add = ok('add a branch', ops.addBranch(g('sync-applications'), 'report', 'log'));
    t.check('a third branch, its step going on to the merge', ops.read(add.graph).index.at.get('report').item.arms.length, 3);
    const rem = ok('remove a branch', ops.removeBranch(g('sync-applications'), 'report', 1));
    t.ok('… Write a summary is gone', !rem.graph.nodes.some((n) => n.id === 'summary'));
    t.check('the last branch stays', ops.removeBranch(rem.graph, 'report', 0).reason, '‘At the same time’ needs at least one branch.');
    const join = ok('wait for the first branch', ops.setJoin(g('sync-applications'), 'report', 'any'));
    t.check('written to the merge\'s config', join.graph.nodes.find((n) => n.id === 'merged').config, { join: 'any' });
}

t.section('§7 a refusal changes nothing');
{
    const graph = g('sync-applications');
    const before = JSON.stringify(graph);
    const r = ops.insert(graph, { after: 'fetch' }, 'end');
    t.ok('refused', !r.ok && !r.graph);
    t.ok('the graph passed in is untouched', JSON.stringify(graph) === before);
    const ok2 = ops.insert(graph, { after: 'save' }, 'log');
    t.ok('and an operation that succeeds does not touch it either', ok2.ok && JSON.stringify(graph) === before);
    const bad = g('refuse-cycle');
    t.ok('an operation on a graph that is not block-shaped is refused with its reason',
         ops.insert(bad, { after: 'a' }, 'log').reason === '‘B’ leads back to ‘A’, and only a loop\'s Next may.');
}

t.section('§8 I3 — random operation sequences');
{
    let seed = 20261006;
    const rnd = () => {                                   // mulberry32
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const types = ['log', 'http-request', 'table-read', 'condition', 'loop-over-rows', 'parallel', 'end', 'set-variable'];
    const blocksT = ['condition', 'loop-over-rows', 'parallel'];
    const gaps = (view) => {
        const out = [];
        for (const s of view.index.seqs) for (let i = 0; i <= s.seq.items.length; i += 1) out.push({ seq: s.seq, index: i });
        return out;
    };
    const items = (view) => [...view.index.at.values()].filter((p) => p.seq && !p.join).map((p) => p.item.id);
    let accepted = 0; let refusedN = 0; let failures = 0; let byNet = 0;
    const NET = ops.strings.notBlockShaped('').trim();
    const fail = (msg) => { failures += 1; if (failures < 6) console.error(`  FAIL I3 ${msg}`); };
    const startGraphs = CORPUS.graphs.filter((x) => x.expect.tree).map((x) => x.name);
    for (let run = 0; run < 60; run += 1) {
        let graph = g(pick(startGraphs));
        let clip = null;
        for (let step = 0; step < 25; step += 1) {
            const view = ops.read(graph);
            if (!view.ok) { fail(`run ${run} step ${step}: the graph stopped being block-shaped`); break; }
            const ids = items(view);
            const kind = pick(['insert', 'insert', 'remove', 'up', 'down', 'out', 'move', 'wrap', 'dup', 'copy', 'paste', 'arm', 'branch']);
            let r = null; let expect = null;
            const before = serialise(graph);
            if (kind === 'insert' || kind === 'paste') {
                const gap = pick(gaps(view));
                const anchor = ops.anchorOf(gap.seq, gap.index);
                r = kind === 'insert' ? ops.insert(graph, anchor, pick(types)) : ops.paste(graph, anchor, clip);
                expect = { anchor, id: () => r.select };
            } else if (kind === 'copy' && ids.length) {
                clip = ops.copy(graph, pick(ids));
                continue;
            } else if (ids.length && kind === 'remove') {
                const id = pick(ids);
                const gone = subtreeIds(view.index.at.get(id).item);
                r = ops.remove(graph, id);
                if (r.ok && gone.some((x) => r.graph.nodes.some((n) => n.id === x))) fail(`remove ${id} left a step behind`);
            } else if (ids.length && ['up', 'down', 'out'].includes(kind)) {
                const id = pick(ids);
                r = kind === 'up' ? ops.moveUp(graph, id) : kind === 'down' ? ops.moveDown(graph, id) : ops.moveOut(graph, id);
            } else if (ids.length && kind === 'move') {
                const id = pick(ids);
                const gap = pick(gaps(view));
                const anchor = ops.anchorOf(gap.seq, gap.index);
                r = ops.move(graph, id, anchor);
                expect = { anchor, id: () => id };
            } else if (ids.length && kind === 'wrap') {
                const id = pick(ids);
                r = ops.wrap(graph, id, pick(blocksT));
                if (r.ok) {
                    const v = ops.read(r.graph);
                    const block = v.index.at.get(r.select).item;
                    const first = block.kind === 'loop' ? block.body.seq.items[0] : block.arms[0].seq.items[0];
                    if (first?.id !== (view.index.at.get(id).join ? view.index.at.get(id).item.id : id)) fail(`wrap ${id}: not the block's first step`);
                }
            } else if (ids.length && kind === 'dup') {
                const id = pick(ids);
                r = ops.duplicate(graph, id);
                expect = r.ok ? { anchor: { after: view.index.at.get(id).item.id }, id: () => r.select } : null;
            } else if (ids.length && kind === 'arm') {
                const steps = ids.map((id) => view.index.at.get(id).item).filter((it) => it.kind === 'step' && it.arms.length);
                if (!steps.length) continue;
                const it = pick(steps);
                const arm = pick(it.arms);
                r = rnd() < 0.5 ? ops.setArm(graph, it.id, arm.port, arm.seq.exit === 'open')
                    : ops.setArmExit(graph, it.id, arm.port, arm.seq.exit === 'next' ? 'rejoin' : 'next');
            } else if (ids.length && kind === 'branch') {
                const fans = ids.map((id) => view.index.at.get(id).item).filter((it) => it.kind === 'fanout');
                if (!fans.length) continue;
                const f = pick(fans);
                r = rnd() < 0.6 ? ops.addBranch(graph, f.id, pick(types)) : ops.removeBranch(graph, f.id, Math.floor(rnd() * f.arms.length));
            } else continue;
            if (!r) continue;
            if (!r.ok) {
                refusedN += 1;
                if (r.reason.startsWith(NET)) byNet += 1;
                if (serialise(graph) !== before) fail(`a refused ${kind} changed the graph`);
                if (typeof r.reason !== 'string' || !r.reason) fail(`a refused ${kind} gave no sentence`);
                continue;
            }
            accepted += 1;
            const after = ops.read(r.graph);
            if (!after.ok) { fail(`${kind} gave a graph that is not block-shaped: ${after.refusal.message}`); break; }
            if (expect) {
                const id = expect.id();
                const p = after.index.at.get(id);
                let a = expect.anchor;
                // Where the operation itself said the step goes — after a branch
                // whose arms meet nowhere, the end of its one live arm (`resolve`).
                // A move resolves on the graph with the step lifted out, so its
                // "after a branch" may also land at the end of that branch's arm.
                let firstOf = null;
                if (kind !== 'move') {
                    const at = ops.resolve(view, a);
                    const prev = at && at.seq.items[at.index - 1];
                    if (prev) a = { after: prev.id };
                    else if (at && at.index === 0 && a.into === undefined) {
                        const s = view.index.seqs.find((x) => x.seq === at.seq);
                        firstOf = { owner: s?.owner?.id ?? null, port: s?.arm?.port ?? null };
                    }
                }
                // A condition whose arms meet nowhere takes what follows it into its
                // one live arm: "B, then X" and "B, with X inside its live arm" are
                // the same lines, and the outline reads the second. So "after B"
                // may be inside B, and "before Y" may have Y inside the new block.
                const within = (place, ownerId) => Boolean(place?.path?.some((s) => s.owner.id === ownerId));
                const intoArmOf = p && ((a.after !== undefined && after.index.at.get(a.after)?.item?.kind === 'branch'
                                         && within(p, a.after))
                    || (a.before !== undefined && p.item.kind === 'branch' && within(after.index.at.get(a.before), id)));
                if (!p) fail(`${kind}: ${id} is not in the outline`);
                else if (intoArmOf) { /* the end of the branch's one live arm */ }
                else if (firstOf) {
                    if (p.index !== 0 || (p.owner?.id ?? null) !== firstOf.owner || (p.arm?.port ?? null) !== firstOf.port) {
                        fail(`${kind}: ${id} is not first under ${firstOf.owner} ${firstOf.port}`);
                    }
                }
                else if (a.before !== undefined || a.after !== undefined) {
                    const ref = after.index.at.get(a.before ?? a.after);
                    if (!ref || ref.seq !== p.seq || p.index !== ref.index + (a.before !== undefined ? -1 : 1)) {
                        fail(`${kind}: ${id} is not ${a.before !== undefined ? 'before' : 'after'} ${a.before ?? a.after}`
                             + `\n      before: ${describeOutline(view.tree).join(' / ')}`
                             + `\n      after:  ${describeOutline(after.tree).join(' / ')}`);
                    }
                } else if (p.index !== 0) fail(`${kind}: ${id} is not first in ${JSON.stringify(a.into)}`);
            }
            graph = r.graph;
        }
    }
    t.ok(`I3 held over ${accepted} accepted operations (and ${refusedN} refused ones changed nothing)`, failures === 0,
         `${failures} failure(s)`);
    t.check('every refusal was said up front, by its own rule — none fell through to the block-shape check', byNet, 0);
    t.ok('the sequences did real work', accepted > 400 && refusedN > 50, `${accepted} accepted, ${refusedN} refused`);
}

t.section('§9 an operation touches only what it names');
{
    const graph = g('sync-applications');
    const r = ops.insert(graph, { after: 'save' }, 'log');
    for (const n of graph.nodes) {
        const m = r.graph.nodes.find((x) => x.id === n.id);
        if (JSON.stringify(m) !== JSON.stringify(n)) t.ok(`${n.id} unchanged`, false, JSON.stringify(m));
    }
    t.ok('every existing node is byte-identical after an insert', graph.nodes.every((n) => JSON.stringify(r.graph.nodes.find((x) => x.id === n.id)) === JSON.stringify(n)));
    t.check('nodes keep their order; the new one is last', r.graph.nodes.map((n) => n.id), [...graph.nodes.map((n) => n.id), 'log']);
    t.check('a new step has no label and an empty config, at (0, 0)', r.graph.nodes.at(-1), { id: 'log', type: 'log', config: {}, position: { x: 0, y: 0 } });
    const m = ops.move(graph, 'save', { before: 'fetch' });
    t.check('a move keeps the node array as it was', m.graph.nodes.map((n) => JSON.stringify(n)), graph.nodes.map((n) => JSON.stringify(n)));
}

t.done();
