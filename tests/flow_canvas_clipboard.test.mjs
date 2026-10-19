/**
 * THE CANVAS EDITOR'S COPY, CUT, PASTE AND DUPLICATE (`clipboard`, STORY-0077)
 * — the picked steps and the lines among them, pasted under fresh ids, set
 * off and picked, each gesture ONE undo entry:
 *
 *   §0  without the option nothing changes: Ctrl+C, X, V and D are not the
 *       editor's, the methods do nothing, and the graph serialises as before
 *   §1  copy then paste of two connected steps: two new ids, the line between
 *       them, the copy set off from the original and picked; one undo; a
 *       second paste of the same is set off one step more
 *   §2  a line to a step outside the pick is not copied, nor a start step
 *   §3  Ctrl+D duplicates the pick (`flow:node:duplicate`, derived labels) and
 *       ONE Ctrl+Z takes the whole duplicate away; the clipboard is untouched
 *   §4  `prepareCopy` clears a config key on the copy; the original keeps it
 *   §5  a consumer's `clipboard: {read, write}` hears the copied JSON and
 *       supplies what is pasted, a promise too; what is not steps is refused
 *   §6  read only: Paste, Cut and Duplicate are refused with the reason and
 *       change nothing; Copy still copies
 *   §7  Cut: one remove entry, and the paste after it lands where they were
 *   §8  without `multiSelect`: one step copied and pasted is picked as a step
 *
 *     node tests/flow_canvas_clipboard.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — clipboard');
const { window: w } = t;
const { createCanvasEditor, createStepCatalogue, CANVAS_ACTIONS } = await import('../flow.js');

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'task', label: 'Task', category: 'work', ports: [F('in', 'input'), F('out', 'output')] },
];
const catalogue = createStepCatalogue(TYPES, { categories: [{ id: 'control', label: 'Flow' }, { id: 'work', label: 'Work' }] });
const node = (id, x, y, type = 'task', config = {}) => ({ id, type, config, position: { x, y } });
const GRAPH = {
    nodes: [node('start', 0, 0, 'start'), node('a', 96, 160, 'task', { secret: 's3', keep: 1 }),
            node('b', 400, 160), node('c', 704, 160)],
    connections: [{ source: 'start', sourcePort: 'out', target: 'a', targetPort: 'in' },
                  { source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
                  { source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' }],
};

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const changes = [];
    const selects = [];
    const editor = createCanvasEditor(t.host(), {
        catalogue, onChange: (c) => changes.push(c), onSelect: (s) => selects.push(s), ...opts });
    editor.load({ graph: structuredClone(graph) }, { fit: false });
    mounted.push(editor);
    return { editor, changes, selects, el: editor.el };
}
const keyOn = (target, key, init = {}) => {
    const e = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};
const canvasOf = (m) => m.el.querySelector('.twm-canvas');
const ctrl = (m, key) => keyOn(canvasOf(m), key, { ctrlKey: true });
const ids = (m) => m.editor.getGraph().nodes.map((n) => n.id);
const nodeOf = (m, id) => m.editor.getGraph().nodes.find((n) => n.id === id);
const edges = (m) => m.editor.getGraph().connections.map((c) => `${c.source}.${c.sourcePort}>${c.target}.${c.targetPort}`);
const picked = (m) => [...m.el.querySelectorAll('.twm-flow-graph__node--picked')].map((n) => n.dataset.nodeId);
const messageOf = (m) => m.el.querySelector('.twm-flow-graph__message').textContent;
const fresh = (m, before) => ids(m).filter((id) => !before.includes(id));

t.section('§0 without the option nothing changes');
{
    const m = mount({ multiSelect: true });
    const before = m.editor.serialise();
    m.editor.select(['a', 'b']);
    const keys = ['c', 'x', 'v', 'd'].map((k) => ctrl(m, k).defaultPrevented);
    t.check('Ctrl+C, X, V and D are not the editor\'s', keys, [false, false, false, false]);
    t.check('the methods do nothing and say nothing',
            [m.editor.copy(), m.editor.cut(), m.editor.paste('{"nodes":[]}'), m.editor.duplicate()],
            [{ ok: false, reason: null }, { ok: false, reason: null }, { ok: false, reason: null }, { ok: false, reason: null }]);
    t.check('nothing was written', [m.changes.length, m.editor.serialise() === before, messageOf(m)], [0, true, '']);
    t.ok('the new actions are on the closed list', CANVAS_ACTIONS.includes('flow:paste')
         && CANVAS_ACTIONS.includes('flow:node:duplicate'));
    t.throws('a clipboard that is neither true nor {read, write} is refused at once',
             () => createCanvasEditor(null, { catalogue, clipboard: { read: () => '' } }));
}

t.section('§1 copy then paste of two connected steps');
{
    const m = mount({ multiSelect: true, clipboard: true });
    const before = ids(m);
    m.editor.select(['a', 'b']);
    t.ok('Ctrl+C is the editor\'s', ctrl(m, 'c').defaultPrevented);
    t.check('it says what it copied, and writes nothing', [messageOf(m), m.changes.length], ['Copied 2 steps.', 0]);
    t.ok('Ctrl+V is the editor\'s', ctrl(m, 'v').defaultPrevented);
    const made = fresh(m, before);
    t.check('two new ids', made.length, 2);
    t.ok('neither is an id the flow had', made.every((id) => !before.includes(id)));
    const [a2, b2] = made;
    t.ok('the line between them came along', edges(m).includes(`${a2}.out>${b2}.in`));
    t.check('the copy is set off two grid steps, right and down',
            [nodeOf(m, a2).position, nodeOf(m, b2).position], [{ x: 128, y: 192 }, { x: 432, y: 192 }]);
    t.check('the originals did not move', [nodeOf(m, 'a').position, nodeOf(m, 'b').position],
            [{ x: 96, y: 160 }, { x: 400, y: 160 }]);
    t.check('the copy is picked', [picked(m), m.selects.at(-1)], [made, { kind: 'many', ids: made }]);
    t.check('a label the flow has is derived', [nodeOf(m, a2).label, nodeOf(m, b2).label], ['Task (copy)', 'Task (copy 2)']);
    t.check('one flow:paste entry', [m.changes.length, m.changes.at(-1).action], [1, 'flow:paste']);
    ctrl(m, 'z');
    t.check('one Ctrl+Z takes both copies and their line away', [ids(m), edges(m).length], [before, 3]);
    ctrl(m, 'y');
    m.editor.paste();
    const again = fresh(m, [...before, ...made]);
    t.check('a second paste of the same is set off one step more', again.map((id) => nodeOf(m, id).position),
            [{ x: 160, y: 224 }, { x: 464, y: 224 }]);
}

t.section('§2 a line to a step outside the pick is not copied');
{
    let text = null;
    const m = mount({ multiSelect: true, clipboard: { read: () => text, write: (x) => { text = x; } } });
    const before = ids(m);
    const beforeEdges = edges(m);
    m.editor.select(['start', 'a', 'b']);
    m.editor.copy();
    const copied = JSON.parse(text);
    t.check('the copied JSON holds the two and the one line between them',
            [copied.nodes.map((n) => n.id), copied.connections],
            [['a', 'b'], [{ source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }]]);
    m.editor.paste();
    const made = fresh(m, before);
    const added = edges(m).filter((e) => !beforeEdges.includes(e));
    t.check('the paste added exactly that one line', added, [`${made[0]}.out>${made[1]}.in`]);
    t.ok('no line from start or into c was made for the copy',
         !edges(m).some((e) => made.some((id) => e === `start.out>${id}.in` || e === `${id}.out>c.in`)));
    m.editor.select('start');
    t.check('a start step alone cannot be copied', m.editor.copy(),
            { ok: false, reason: 'None of the picked steps can be copied.' });
}

t.section('§3 Ctrl+D duplicates the pick, and one Ctrl+Z removes the whole duplicate');
{
    let writes = 0;
    const m = mount({ multiSelect: true, clipboard: { read: () => null, write: () => { writes += 1; } } });
    const before = ids(m);
    const serialised = m.editor.serialise();
    m.editor.select(['a', 'b']);
    t.ok('Ctrl+D is the editor\'s', ctrl(m, 'd').defaultPrevented);
    const made = fresh(m, before);
    t.check('two copies, with their line, picked', [made.length, edges(m).includes(`${made[0]}.out>${made[1]}.in`), picked(m)],
            [2, true, made]);
    t.check('beside the originals', made.map((id) => nodeOf(m, id).position), [{ x: 128, y: 192 }, { x: 432, y: 192 }]);
    t.check('labels derived the same way', made.map((id) => nodeOf(m, id).label), ['Task (copy)', 'Task (copy 2)']);
    t.check('one flow:node:duplicate entry, the clipboard untouched',
            [m.changes.length, m.changes.at(-1).action, writes], [1, 'flow:node:duplicate', 0]);
    ctrl(m, 'z');
    t.check('one Ctrl+Z: the flow is as it was', [m.editor.serialise() === serialised, ids(m)], [true, before]);
    t.ok('and nothing more to undo', !m.editor.history.canUndo);
    m.editor.select(null);
    t.ok('with nothing picked Ctrl+D is not the editor\'s', !ctrl(m, 'd').defaultPrevented);
}

t.section('§4 prepareCopy clears a config key on the copy; the original keeps it');
{
    const seen = [];
    const m = mount({ multiSelect: true, clipboard: true,
                      prepareCopy: (n, how) => { seen.push({ ...how, id: n.id }); delete n.config.secret; } });
    const before = ids(m);
    m.editor.select('a');
    m.editor.copy();
    m.editor.paste();
    const [copy] = fresh(m, before);
    t.check('the copy has no secret, the rest of its config is kept', nodeOf(m, copy).config, { keep: 1 });
    t.check('the original keeps it', nodeOf(m, 'a').config, { secret: 's3', keep: 1 });
    t.check('the hook was told where the copy came from', seen, [{ from: 'a', via: 'paste', id: copy }]);
    m.editor.select('a');
    const r = m.editor.duplicate();
    t.check('a duplicate goes through it too', [nodeOf(m, r.ids[0]).config, seen.at(-1).via], [{ keep: 1 }, 'duplicate']);
    const stuck = mount({ multiSelect: true, clipboard: true, prepareCopy: () => { throw new Error('no'); } });
    const text = stuck.editor.serialise();
    stuck.editor.select('a');
    stuck.editor.copy();
    t.throws('a hook that throws is the consumer\'s error', () => stuck.editor.paste());
    t.check('and changed nothing', [stuck.editor.serialise() === text, stuck.changes.length], [true, 0]);
}

t.section('§5 a host clipboard hears the copied JSON and supplies what is pasted');
{
    const written = [];
    let supply = null;
    const m = mount({ multiSelect: true, clipboard: { read: () => supply, write: (x) => written.push(x) } });
    m.editor.select(['b', 'c']);
    ctrl(m, 'c');
    t.check('write() heard the JSON once', written.length, 1);
    t.check('it is the graph\'s own text of the two and their line', JSON.parse(written[0]), {
        nodes: [{ id: 'b', type: 'task', config: {}, position: { x: 400, y: 160 } },
                { id: 'c', type: 'task', config: {}, position: { x: 704, y: 160 } }],
        connections: [{ source: 'b', target: 'c', sourcePort: 'out', targetPort: 'in' }] });
    supply = JSON.stringify({ nodes: [{ id: 'elsewhere', type: 'task', label: 'From afar', config: { n: 7 },
                                        position: { x: 32, y: 640 } }], connections: [] });
    const before = ids(m);
    ctrl(m, 'v');
    const [got] = fresh(m, before);
    t.check('what read() supplied is pasted, under a fresh id', [got !== 'elsewhere', nodeOf(m, got).label, nodeOf(m, got).config],
            [true, 'From afar', { n: 7 }]);
    t.check('picked, as one step', m.selects.at(-1), { kind: 'step', id: got });

    supply = 'just some words';
    const text = m.editor.serialise();
    const r = m.editor.paste();
    t.check('what is not steps is refused with its reason', [r, messageOf(m)],
            [{ ok: false, reason: 'What is on the clipboard is not steps of a flow.' }, 'What is on the clipboard is not steps of a flow.']);
    supply = JSON.stringify({ nodes: [{ id: 'x', type: 'nope', config: {}, position: { x: 0, y: 0 } }], connections: [] });
    t.check('a type the flow does not have is refused', m.editor.paste().reason, 'There is no step type "nope".');
    supply = null;
    t.check('an empty clipboard is nothing to paste', m.editor.paste().reason, 'There is nothing to paste.');
    t.ok('and none of them changed the flow', m.editor.serialise() === text);

    const later = mount({ multiSelect: true, clipboard: { read: () => Promise.resolve(written[0]), write: () => {} } });
    const ahead = ids(later);
    const answer = await later.editor.paste();
    t.check('a read() that is a promise is waited for', [answer.ok, fresh(later, ahead).length, later.changes.at(-1).action],
            [true, 2, 'flow:paste']);
}

t.section('§6 read only: Paste and Cut are refused with a reason and change nothing');
{
    const written = [];
    const m = mount({ multiSelect: true, clipboard: { read: () => written.at(-1) ?? null, write: (x) => written.push(x) } });
    m.editor.select(['a', 'b']);
    m.editor.copy();
    m.editor.setReadOnly({ reason: 'This flow is published.' });
    const text = m.editor.serialise();
    m.editor.select(['a', 'b']);
    const paste = ctrl(m, 'v');
    t.check('Ctrl+V is refused with the reason', [paste.defaultPrevented, messageOf(m)], [true, 'This flow is published.']);
    m.editor.setMessage('');
    const cut = ctrl(m, 'x');
    t.check('Ctrl+X is refused with the reason', [cut.defaultPrevented, messageOf(m)], [true, 'This flow is published.']);
    t.check('the methods say why', [m.editor.paste(), m.editor.cut(), m.editor.duplicate()],
            [{ ok: false, reason: 'This flow is published.' }, { ok: false, reason: 'This flow is published.' },
             { ok: false, reason: 'This flow is published.' }]);
    t.check('nothing changed', [m.editor.serialise() === text, m.changes.length, picked(m)], [true, 0, ['a', 'b']]);
    t.check('copy still copies', [m.editor.copy().ok, written.length], [true, 2]);
    const bare = mount({ clipboard: true, readOnly: true });
    bare.editor.select('a');
    t.check('the default reason without one of its own', bare.editor.cut().reason, 'This flow is read only.');
}

t.section('§7 cut, then paste where they were');
{
    const named = structuredClone(GRAPH);
    named.nodes[1].label = 'Alpha';
    named.nodes[2].label = 'Beta';
    const m = mount({ multiSelect: true, clipboard: true }, named);
    const before = ids(m);
    m.editor.select(['a', 'b']);
    t.ok('Ctrl+X is the editor\'s', ctrl(m, 'x').defaultPrevented);
    t.check('the two and their lines are gone', [ids(m), edges(m)], [['start', 'c'], []]);
    t.check('one remove entry', [m.changes.length, m.changes.at(-1).action], [1, 'flow:nodes:remove']);
    m.editor.paste();
    const made = fresh(m, ['start', 'c']);
    t.check('the first paste after a cut lands where they were, with their names',
            made.map((id) => [nodeOf(m, id).position, nodeOf(m, id).label ?? null]),
            [[{ x: 96, y: 160 }, 'Alpha'], [{ x: 400, y: 160 }, 'Beta']]);
    m.editor.paste();
    t.check('the next is set off, its names derived now the flow has them',
            fresh(m, ids(m).slice(0, 4)).map((id) => [nodeOf(m, id).position, nodeOf(m, id).label]),
            [[{ x: 128, y: 192 }, 'Alpha (copy)'], [{ x: 432, y: 192 }, 'Beta (copy)']]);
    ctrl(m, 'z');
    t.ok('their line between them is back', edges(m).includes(`${made[0]}.out>${made[1]}.in`));
    ctrl(m, 'z');
    ctrl(m, 'z');
    t.check('two undos: the flow as it was', ids(m), before);
}

t.section('§8 without multiSelect: one step copied and pasted is picked');
{
    const m = mount({ clipboard: true });
    const before = ids(m);
    m.editor.select('c');
    ctrl(m, 'c');
    ctrl(m, 'v');
    const [made] = fresh(m, before);
    t.check('a fresh copy, picked as a step', [Boolean(made), m.selects.at(-1), picked(m)], [true, { kind: 'step', id: made }, [made]]);
    t.check('with no line (none among one)', edges(m).filter((e) => e.includes(made)), []);
}

for (const e of mounted) e.destroy();
t.done();
