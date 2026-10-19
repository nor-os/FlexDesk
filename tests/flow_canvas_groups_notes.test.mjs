/**
 * THE CANVAS EDITOR'S GROUPS AND NOTES (`groups: true`, `notes: true`,
 * STORY-0078) — flat, named, toned frames behind their nodes, and free text on
 * the canvas, each edit ONE undo entry:
 *
 *   §0  a graph without groups or notes serialises to exactly the bytes it
 *       did before (a literal), with or without the options; without them
 *       nothing is drawn or bound, and a graph's groups and notes are kept
 *   §1  Ctrl+G on two nodes draws one frame round both; dragging its title
 *       bar moves both as one `flow:nodes:move`, and one Ctrl+Z puts both back
 *   §2  grouping a node that is in a group moves it to the new one: a node is
 *       never in two groups (the editor, `setGroupMembers` and `normalise`)
 *   §3  removing a grouped node shrinks its group; the last member takes the
 *       group with it, and one undo brings both back
 *   §4  a note is added (the toolbar's Note), edited in place, moved, and each
 *       step undone; Escape cancels an edit, Enter opens one, Delete removes
 *   §5  a marquee picks notes and nodes together; a drag and a Delete take
 *       them all, each one entry
 *   §6  groups and notes survive serialise -> load unchanged, label, tone and
 *       size included; a group renames in place
 *   §7  Ctrl+Shift+G ungroups; read only refuses every one of these
 *   §8  bindFlowKeys: Ctrl/⌘+G is `group`, Ctrl/⌘+Shift+G `ungroup`
 *   §9  copy and paste (`clipboard`, STORY-0077) carry the picked notes under
 *       fresh ids and make again, round the copies, each group wholly inside
 *       the copy; a cut takes them and the paste after it puts them back;
 *       notes alone copy, cut and duplicate; without the options neither is
 *       carried
 *  §10 a group and a note may share an id (separate namespaces): typing in
 *       note 'x' does not stop group 'x''s title bar dragging, nor does
 *       renaming group 'x' stop note 'x' dragging
 *
 *     node tests/flow_canvas_groups_notes.test.mjs
 */
import { flowEnv } from './flow_env.mjs';
import { bindFlowKeys } from '../src/flow/kit/keys.js';

const t = await flowEnv('flow canvas — groups and notes');
const { window: w } = t;
const { createCanvasEditor, createStepCatalogue, CANVAS_ACTIONS, CANVAS_NODE, canvasNodeBottom, normalise,
        serialise } = await import('../flow.js');

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'work', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'task', label: 'Task', category: 'work', ports: [F('in', 'input'), F('out', 'output')] },
];
const catalogue = createStepCatalogue(TYPES, { categories: [{ id: 'work', label: 'Work' }] });
const node = (id, x, y, type = 'task') => ({ id, type, config: {}, position: { x, y } });
const GRAPH = {
    nodes: [node('a', 96, 160), node('b', 400, 176), node('c', 704, 208), node('far', 96, 800)],
    connections: [{ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
                  { source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' }],
};
const ALL = { multiSelect: true, groups: true, notes: true };

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
const canvasOf = (m) => m.el.querySelector('.twm-canvas');
const tool = (m, id) => m.el.querySelector(`.twm-flow-graph__toolbar [data-action="${id}"]`);
const toolIds = (m) => [...m.el.querySelectorAll('.twm-flow-graph__toolbar [data-action]')].map((b) => b.dataset.action);
const pos = (m, id) => m.editor.getGraph().nodes.find((n) => n.id === id)?.position;
const frames = (m) => [...m.el.querySelectorAll('.twm-flow-graph__group')];
const frameOf = (m, id) => m.el.querySelector(`.twm-flow-graph__group[data-group-id="${id}"]`);
const noteEl = (m, id) => m.el.querySelector(`.twm-flow-graph__note[data-note-id="${id}"]`);
const px = (v) => Number(String(v).replace('px', ''));
const boxOf = (e) => ({ x: px(e.style.left), y: px(e.style.top), w: px(e.style.width), h: px(e.style.height) });
const groupsOf = (m) => m.editor.getGraph().groups;
const notesOf = (m) => m.editor.getGraph().notes;
const marquee = (m, a, b) => {
    canvasOf(m).dispatchEvent(ev(w.MouseEvent, 'pointerdown', { clientX: a.x, clientY: a.y }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: b.x, clientY: b.y }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', { clientX: b.x, clientY: b.y }));
};
/** A press on `target`, dragged by (dx, dy), the way a browser reports it. */
const dragBy = (target, dx, dy, init = {}) => {
    target.dispatchEvent(ev(w.MouseEvent, 'pointerdown', { clientX: 10, clientY: 10, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: 10 + dx / 2, clientY: 10 + dy / 2, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointermove', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
    target.dispatchEvent(ev(w.MouseEvent, 'click', { clientX: 10 + dx, clientY: 10 + dy, ...init }));
};
const headOf = (m, id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-head');
const clickNode = (m, id, init = {}) => {
    headOf(m, id).dispatchEvent(ev(w.MouseEvent, 'pointerdown', init));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup', init));
    headOf(m, id).dispatchEvent(ev(w.MouseEvent, 'click', init));
};
/** Does the frame stand round the node's whole box? */
const around = (f, nodeRow) => {
    const b = boxOf(f);
    const bottom = canvasNodeBottom(catalogue, nodeRow);
    return b.x < nodeRow.position.x && b.y < nodeRow.position.y && b.x + b.w > nodeRow.position.x + CANVAS_NODE.width
        && b.y + b.h > bottom;
};

// The text this graph serialised to before groups and notes existed (origin/main
// at 08cfd3b), with keys it does not know and empty `groups` and `notes`.
const OLD_GRAPH = {
    nodes: [{ id: 'b', type: 'task', label: 'Second', config: { z: 1, a: { y: 2, x: [3, { q: 1, p: 0 }] } },
              position: { x: 400.4, y: 10.6 }, extra: 'dropped' },
            { id: 'a', type: 'task', config: {}, position: { x: 0, y: 0 } }],
    connections: [{ source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in', extra: 1 }],
    groups: [], notes: [], other: 1,
};
const OLD_TEXT = '{"nodes":[{"id":"b","type":"task","label":"Second","config":{"a":{"x":[3,{"p":0,"q":1}],"y":2},"z":1},'
    + '"position":{"x":400,"y":11}},{"id":"a","type":"task","config":{},"position":{"x":0,"y":0}}],'
    + '"connections":[{"source":"a","target":"b","sourcePort":"out","targetPort":"in"}]}';

t.section('§0 without groups or notes, the same bytes; without the options, nothing new');
{
    t.check('serialise() of a graph without groups or notes is the old text', serialise(OLD_GRAPH), OLD_TEXT);
    t.check('normalise() carries no groups or notes key', Object.keys(normalise(OLD_GRAPH)), ['nodes', 'connections']);
    const plain = mount({}, OLD_GRAPH);
    const opted = mount(ALL, OLD_GRAPH);
    t.check('the editor without the options', plain.editor.serialise(), OLD_TEXT);
    t.check('the editor with them, on a graph that has none', opted.editor.serialise(), OLD_TEXT);
    t.check('getGraph() has no groups or notes key', Object.keys(opted.editor.getGraph()), ['nodes', 'connections']);
    t.check('the history holds that text', JSON.parse(opted.editor.snapshot()).graph, JSON.parse(OLD_TEXT));
    t.check('the toolbar without the options is Undo, Redo, Arrange, Fit', toolIds(plain), ['undo', 'redo', 'arrange', 'fit']);
    t.ok('Group, Ungroup and Note come after the align verbs with them',
         toolIds(opted).join(',').endsWith('distribute-vertical,group,ungroup,note'), toolIds(opted).join(','));
    t.check('the action list gains the eight ids', CANVAS_ACTIONS.slice(-8), ['flow:group:add', 'flow:group:remove',
        'flow:group:label', 'flow:group:members', 'flow:note:add', 'flow:note:remove', 'flow:note:edit', 'flow:note:move']);

    const m = mount({ multiSelect: true }, { ...GRAPH, groups: [{ id: 'g', label: 'Kept', nodes: ['a', 'b'] }],
                                            notes: [{ id: 'n', text: 'kept', position: { x: 0, y: 0 } }] });
    t.ok('without the options a graph\'s groups and notes are not drawn',
         frames(m).length === 0 && !m.el.querySelector('.twm-flow-graph__note'));
    t.check('and kept', [groupsOf(m), notesOf(m)], [[{ id: 'g', label: 'Kept', nodes: ['a', 'b'] }],
                                                    [{ id: 'n', text: 'kept', position: { x: 0, y: 0 } }]]);
    m.editor.select(['a', 'b']);
    const g = keyOn(nodeEl(m, 'a'), 'g', { ctrlKey: true });
    t.check('Ctrl+G is not the editor\'s', [g.defaultPrevented, m.changes.length], [false, 0]);
    t.ok('the node layer holds only the nodes (and no frame)', [...m.editor.canvas.nodeLayer.children]
         .every((c) => c.classList.contains('twm-flow-graph__node')));
    t.ok('the API refuses', m.editor.group(['a']) === null && m.editor.addNote() === null
         && m.editor.ungroup('g') === false);
}

t.section('§1 Ctrl+G on two nodes: one frame round both; its drag moves both, one undo entry');
{
    const m = mount(ALL);
    m.editor.select(['a', 'b']);
    const g = keyOn(nodeEl(m, 'a'), 'g', { ctrlKey: true });
    t.ok('Ctrl+G is the editor\'s', g.defaultPrevented);
    t.check('one group of the two', groupsOf(m), [{ id: 'group', nodes: ['a', 'b'] }]);
    t.check('one flow:group:add entry', [m.changes.map((c) => c.action), m.editor.history.depth], [['flow:group:add'], 1]);
    t.check('one frame', frames(m).length, 1);
    const f = frameOf(m, 'group');
    const graph = m.editor.getGraph();
    t.ok('round both nodes', around(f, graph.nodes[0]) && around(f, graph.nodes[1]), JSON.stringify(boxOf(f)));
    t.ok('and not round the third', !around(f, graph.nodes[2]));
    t.ok('behind every node: first in the node layer', m.editor.canvas.nodeLayer.firstElementChild === f);
    t.check('its title is the untitled word', f.querySelector('.twm-flow-graph__group-label').textContent, 'Group');
    const before = boxOf(f);
    m.editor.select(null);
    dragBy(f.querySelector('.twm-flow-graph__group-head'), 96, 48);
    t.check('both moved by the drag', [pos(m, 'a'), pos(m, 'b')], [{ x: 192, y: 208 }, { x: 496, y: 224 }]);
    t.check('the third did not', pos(m, 'c'), { x: 704, y: 208 });
    t.check('the frame followed', [boxOf(f).x - before.x, boxOf(f).y - before.y], [96, 48]);
    t.check('ONE entry, flow:nodes:move', [m.changes.at(-1).action, m.changes.length, m.editor.history.depth],
            ['flow:nodes:move', 2, 2]);
    t.check('the press picked the group\'s members', m.selects.at(-1), { kind: 'many', ids: ['a', 'b'] });
    keyOn(canvasOf(m), 'z', { ctrlKey: true });
    t.check('one Ctrl+Z puts both back', [pos(m, 'a'), pos(m, 'b')], [{ x: 96, y: 160 }, { x: 400, y: 176 }]);
    t.check('the group is still there, the frame back', [groupsOf(m), boxOf(frameOf(m, 'group'))],
            [[{ id: 'group', nodes: ['a', 'b'] }], before]);
    keyOn(canvasOf(m), 'z', { ctrlKey: true });
    t.ok('the next Ctrl+Z takes the group away', groupsOf(m) === undefined && frames(m).length === 0);
}

t.section('§2 a node is never in two groups');
{
    const m = mount(ALL);
    m.editor.select(['a', 'b']);
    keyOn(nodeEl(m, 'a'), 'g', { ctrlKey: true });
    m.editor.select(['b', 'c']);
    keyOn(nodeEl(m, 'b'), 'g', { ctrlKey: true });
    t.check('b moved to the new group', groupsOf(m), [{ id: 'group', nodes: ['a'] }, { id: 'group-2', nodes: ['b', 'c'] }]);
    t.check('two frames', frames(m).map((f) => f.dataset.groupId), ['group', 'group-2']);
    m.editor.select(['a', 'b', 'c']);
    keyOn(nodeEl(m, 'c'), 'g', { ctrlKey: true });
    t.check('grouping all three empties both old groups, which go', groupsOf(m), [{ id: 'group', nodes: ['a', 'b', 'c'] }]);
    t.check('one frame left', frames(m).length, 1);
    t.check('each regroup is one entry', m.changes.map((c) => c.action), ['flow:group:add', 'flow:group:add', 'flow:group:add']);

    t.ok('setGroupMembers takes a node from its group', m.editor.group(['far']) === 'group-2'
         && m.editor.setGroupMembers('group-2', ['far', 'c']));
    t.check('…and c is in the one group only', groupsOf(m), [{ id: 'group', nodes: ['a', 'b'] },
                                                             { id: 'group-2', nodes: ['c', 'far'] }]);
    t.check('as flow:group:members', m.changes.at(-1).action, 'flow:group:members');
    t.ok('no members removes the group', m.editor.setGroupMembers('group-2', [])
         && JSON.stringify(groupsOf(m)) === JSON.stringify([{ id: 'group', nodes: ['a', 'b'] }]));
    t.check('normalise keeps a node in the first group that names it, and drops ids that are not nodes',
            normalise({ ...GRAPH, groups: [{ id: 'x', nodes: ['a', 'b', 'gone'] }, { id: 'y', nodes: ['b'] },
                                          { id: 'z', nodes: ['b', 'c'] }, { id: 'x', nodes: ['far'] }] }).groups,
            [{ id: 'x', nodes: ['a', 'b'] }, { id: 'z', nodes: ['c'] }]);
}

t.section('§3 removing a grouped node shrinks its group; the last member takes it along');
{
    const m = mount(ALL);
    m.editor.select(['a', 'b']);
    keyOn(nodeEl(m, 'a'), 'g', { ctrlKey: true });
    const wide = boxOf(frameOf(m, 'group')).w;
    m.editor.select('b');
    keyOn(nodeEl(m, 'b'), 'Delete');
    t.check('the group is down to a', groupsOf(m), [{ id: 'group', nodes: ['a'] }]);
    t.ok('the frame shrank round a alone', boxOf(frameOf(m, 'group')).w < wide
         && around(frameOf(m, 'group'), m.editor.getGraph().nodes[0]));
    t.check('as the one flow:node:remove', [m.changes.at(-1).action, m.editor.history.depth], ['flow:node:remove', 2]);
    m.editor.select('a');
    keyOn(nodeEl(m, 'a'), 'Delete');
    t.ok('the last member took the group with it', groupsOf(m) === undefined && frames(m).length === 0);
    t.ok('and the graph has no groups key', !('groups' in m.editor.getGraph()));
    m.editor.undo();
    t.check('one undo brings a back, in its group', [Boolean(pos(m, 'a')), groupsOf(m), frames(m).length],
            [true, [{ id: 'group', nodes: ['a'] }], 1]);
    m.editor.select(['a', 'c']);
    keyOn(nodeEl(m, 'a'), 'Delete');
    t.ok('a bulk Delete takes the group along as well', groupsOf(m) === undefined
         && m.changes.at(-1).action === 'flow:nodes:remove');
}

t.section('§4 a note: added, edited in place, moved, each step undone');
{
    const m = mount(ALL);
    tool(m, 'note').click();
    t.check('the toolbar\'s Note adds one', notesOf(m)?.map((n) => n.id), ['note']);
    t.check('as flow:note:add, picked', [m.changes.at(-1).action, m.selects.at(-1)], ['flow:note:add', { kind: 'note', id: 'note' }]);
    const box = noteEl(m, 'note');
    t.ok('drawn on the canvas, in the node layer', box && box.parentElement === m.editor.canvas.nodeLayer);
    const input = box.querySelector('textarea.twm-flow-graph__note-input');
    t.ok('and opened for typing in place', input && w.document.activeElement === input);
    input.value = 'Remember the units';
    keyOn(input, 'Enter');
    t.ok('Enter is a new line, not the end', box.querySelector('textarea') === input);
    keyOn(input, 'Enter', { ctrlKey: true });
    t.check('Ctrl+Enter keeps it', [notesOf(m)[0].text, box.querySelector('textarea'),
                                    box.querySelector('.twm-flow-graph__note-text').textContent],
            ['Remember the units', null, 'Remember the units']);
    t.check('as flow:note:edit', m.changes.at(-1).action, 'flow:note:edit');
    const at = notesOf(m)[0].position;
    dragBy(box, 64, 32);
    t.check('a drag moves it', notesOf(m)[0].position, { x: at.x + 64, y: at.y + 32 });
    t.check('as flow:note:move', [m.changes.at(-1).action, m.editor.history.depth], ['flow:note:move', 3]);
    t.check('its box followed', [boxOf(box).x, boxOf(box).y], [at.x + 64, at.y + 32]);
    m.editor.undo();
    t.check('undo: back where it was', notesOf(m)[0].position, at);
    m.editor.undo();
    t.check('undo: its text gone again', [notesOf(m)[0].text, noteEl(m, 'note').querySelector('.twm-flow-graph__note-text')
        .classList.contains('twm-flow-graph__note-text--empty')], ['', true]);
    m.editor.undo();
    t.ok('undo: the note gone', notesOf(m) === undefined && !noteEl(m, 'note'));
    m.editor.redo();
    m.editor.redo();
    t.check('and redone', notesOf(m)[0].text, 'Remember the units');

    noteEl(m, 'note').dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    const again = noteEl(m, 'note').querySelector('textarea');
    again.value = 'thrown away';
    again.dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    t.ok('a double-click inside the open box (a word picked) keeps that box and its text',
         noteEl(m, 'note').querySelector('textarea') === again && again.value === 'thrown away'
         && notesOf(m)[0].text === 'Remember the units');
    keyOn(again, 'Escape');
    t.check('Escape puts the text back and writes nothing', [notesOf(m)[0].text, m.editor.history.depth], ['Remember the units', 2]);
    noteEl(m, 'note').focus();
    keyOn(noteEl(m, 'note'), 'Enter');
    const viaKey = noteEl(m, 'note').querySelector('textarea');
    t.ok('Enter on a focused note opens it', Boolean(viaKey));
    viaKey.value = 'by blur';
    viaKey.dispatchEvent(new w.FocusEvent('blur'));
    t.check('leaving the box keeps it', notesOf(m)[0].text, 'by blur');
    t.ok('the API edits and moves it', m.editor.editNote('note', 'by api') && m.editor.moveNote('note', { x: 8, y: 8 })
         && JSON.stringify(m.changes.slice(-2).map((c) => c.action)) === '["flow:note:edit","flow:note:move"]');
    m.editor.select(null);
    noteEl(m, 'note').dispatchEvent(ev(w.MouseEvent, 'pointerdown'));
    w.dispatchEvent(ev(w.MouseEvent, 'pointerup'));
    t.check('a press picks it; the panel says so', [m.selects.at(-1), Boolean(m.el.querySelector('[data-action="remove-note"]'))],
            [{ kind: 'note', id: 'note' }, true]);
    keyOn(noteEl(m, 'note'), 'Delete');
    t.ok('Delete removes it, as flow:note:remove', notesOf(m) === undefined && m.changes.at(-1).action === 'flow:note:remove');
    t.check('and lets go of it', m.selects.at(-1), { kind: null, id: null });
}

t.section('§5 a marquee picks notes and nodes together');
{
    const m = mount(ALL, { ...GRAPH, notes: [{ id: 'n1', text: 'one', position: { x: 304, y: 48 }, size: { w: 160, h: 60 } },
                                             { id: 'n2', text: 'two', position: { x: 300, y: 600 }, size: { w: 160, h: 60 } }] });
    marquee(m, { x: 80, y: 30 }, { x: 500, y: 200 });
    t.check('the box over a, b and n1 picks those three', m.selects.at(-1), { kind: 'many', ids: ['a', 'b'], notes: ['n1'] });
    t.ok('the note shows it is picked', noteEl(m, 'n1').classList.contains('twm-flow-graph__note--picked')
         && !noteEl(m, 'n2').classList.contains('twm-flow-graph__note--picked'));
    t.ok('the panel counts both', /2 steps and 1 note picked/.test(m.el.textContent));
    dragBy(headOf(m, 'a'), 32, 16);
    t.check('a drag of one node moves the note too', [pos(m, 'a'), pos(m, 'b'), notesOf(m)[0].position, notesOf(m)[1].position],
            [{ x: 128, y: 176 }, { x: 432, y: 192 }, { x: 336, y: 64 }, { x: 300, y: 600 }]);
    t.check('ONE flow:nodes:move', [m.changes.at(-1).action, m.editor.history.depth], ['flow:nodes:move', 1]);
    dragBy(noteEl(m, 'n1'), -32, -16);
    t.check('a drag of the note moves the nodes too', [pos(m, 'a'), notesOf(m)[0].position], [{ x: 96, y: 160 }, { x: 304, y: 48 }]);
    clickNode(m, 'c', { shiftKey: true });
    t.check('Shift+click adds a node and keeps the note', m.selects.at(-1), { kind: 'many', ids: ['a', 'b', 'c'], notes: ['n1'] });
    noteEl(m, 'n2').dispatchEvent(ev(w.MouseEvent, 'pointerdown', { shiftKey: true }));
    noteEl(m, 'n2').dispatchEvent(ev(w.MouseEvent, 'click', { shiftKey: true }));
    t.check('Shift+click adds a note', m.selects.at(-1), { kind: 'many', ids: ['a', 'b', 'c'], notes: ['n1', 'n2'] });
    const d0 = m.editor.history.depth;
    keyOn(canvasOf(m), 'ArrowRight');
    t.check('an arrow nudges the notes with the steps, one entry', [pos(m, 'a').x, notesOf(m)[0].position.x,
                                                                    notesOf(m)[1].position.x, m.editor.history.depth - d0,
                                                                    m.changes.at(-1).action],
            [112, 320, 316, 1, 'flow:nodes:move']);
    m.editor.undo();
    keyOn(canvasOf(m), 'Escape');
    t.check('Escape lets go of all', m.selects.at(-1), { kind: null, id: null });
    keyOn(canvasOf(m), 'a', { ctrlKey: true });
    t.check('Ctrl+A picks every node and note', m.selects.at(-1),
            { kind: 'many', ids: ['a', 'b', 'c', 'far'], notes: ['n1', 'n2'] });
    marquee(m, { x: 80, y: 30 }, { x: 500, y: 200 });
    const depth = m.editor.history.depth;
    keyOn(canvasOf(m), 'Delete');
    t.check('Delete removes the picked nodes and the note as ONE entry',
            [m.editor.getGraph().nodes.map((n) => n.id), notesOf(m).map((n) => n.id), m.editor.history.depth - depth],
            [['c', 'far'], ['n2'], 1]);
    m.editor.undo();
    t.check('one undo brings all three back', [m.editor.getGraph().nodes.length, notesOf(m).length], [4, 2]);
    marquee(m, { x: 280, y: 580 }, { x: 320, y: 620 });
    t.check('a marquee over a note alone picks the note', m.selects.at(-1), { kind: 'note', id: 'n2' });
}
{
    // the pick box counts only what is in the pick: no "0 steps"
    const titleOf = (m) => m.el.querySelector('.twm-flow-graph__connection-title')?.textContent;
    const m = mount(ALL, { nodes: [node('a', 96, 160)], connections: [],
                           notes: [{ id: 'n1', text: 'one', position: { x: 304, y: 48 }, size: { w: 160, h: 60 } },
                                   { id: 'n2', text: 'two', position: { x: 300, y: 600 }, size: { w: 160, h: 60 } }] });
    keyOn(canvasOf(m), 'a', { ctrlKey: true });
    t.check('Ctrl+A over one step and two notes: the pick box says so', [m.selects.at(-1), titleOf(m)],
            [{ kind: 'many', ids: ['a'], notes: ['n1', 'n2'] }, '1 step and 2 notes picked']);
    clickNode(m, 'a', { shiftKey: true });
    t.check('Shift+click takes the step out: "2 notes picked", no step count', [m.selects.at(-1), titleOf(m)],
            [{ kind: 'many', ids: [], notes: ['n1', 'n2'] }, '2 notes picked']);
    clickNode(m, 'a', { shiftKey: true });
    noteEl(m, 'n2').dispatchEvent(ev(w.MouseEvent, 'pointerdown', { shiftKey: true }));
    noteEl(m, 'n2').dispatchEvent(ev(w.MouseEvent, 'click', { shiftKey: true }));
    t.check('one step and one note: "1 step and 1 note picked"', [m.selects.at(-1), titleOf(m)],
            [{ kind: 'many', ids: ['a'], notes: ['n1'] }, '1 step and 1 note picked']);
}

t.section('§6 groups and notes survive serialise -> load unchanged; a group renames in place');
{
    const m = mount(ALL);
    m.editor.select(['a', 'b']);
    const gid = m.editor.group(null, { label: 'Inputs', tone: 'teal' });
    t.check('group(null, look) groups the pick with its look', groupsOf(m), [{ id: gid, label: 'Inputs', tone: 'teal', nodes: ['a', 'b'] }]);
    t.ok('the frame says its name in its tone', frameOf(m, gid).dataset.tone === 'teal'
         && frameOf(m, gid).querySelector('.twm-flow-graph__group-label').textContent === 'Inputs');
    m.editor.addNote({ text: 'Line one\nline two', position: { x: 33, y: 47 }, size: { w: 240, h: 90 } });
    m.editor.addNote({ text: 'Plain', position: { x: 600, y: 500 } });
    const text = m.editor.serialise();
    const saved = JSON.parse(text);
    t.check('the text carries them, after the connections', Object.keys(saved), ['nodes', 'connections', 'groups', 'notes']);
    t.check('the notes as written', saved.notes, [
        { id: 'note', text: 'Line one\nline two', position: { x: 33, y: 47 }, size: { w: 240, h: 90 } },
        { id: 'note-2', text: 'Plain', position: { x: 600, y: 500 } }]);
    const again = mount(ALL, saved);
    t.check('loaded again, the same text', again.editor.serialise(), text);
    t.check('and the same graph', again.editor.getGraph(), m.editor.getGraph());
    t.check('normalise and serialise are a fixed point', serialise(normalise(JSON.parse(text))), text);
    t.check('drawn: the frame and both notes', [frames(again).length, [...again.el.querySelectorAll('.twm-flow-graph__note')].length], [1, 2]);
    t.check('the sized note at its size', boxOf(noteEl(again, 'note')), { x: 33, y: 47, w: 240, h: 90 });
    t.check('nothing to undo after the load', again.editor.history.depth, 0);

    const head = frameOf(again, gid).querySelector('.twm-flow-graph__group-head');
    head.dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    const input = head.querySelector('input.twm-flow-graph__group-input');
    t.ok('a double-click on the title opens it for typing', input && input.value === 'Inputs');
    input.value = 'Sources';
    keyOn(input, 'Enter');
    t.check('Enter keeps the name, as flow:group:label', [groupsOf(again)[0].label, again.changes.at(-1).action,
                                                           head.querySelector('input')],
            ['Sources', 'flow:group:label', null]);
    t.ok('setGroup changes the tone', again.editor.setGroup(gid, { tone: 'amber' })
         && frameOf(again, gid).dataset.tone === 'amber' && groupsOf(again)[0].tone === 'amber');
    again.editor.undo();
    again.editor.undo();
    t.check('both undone', [groupsOf(again)[0].label, groupsOf(again)[0].tone], ['Inputs', 'teal']);
}

t.section('§7 Ctrl+Shift+G ungroups; read only refuses');
{
    const m = mount(ALL);
    m.editor.select(['a', 'b']);
    keyOn(nodeEl(m, 'a'), 'g', { ctrlKey: true });
    t.ok('Ungroup is on with a grouped node picked', !tool(m, 'ungroup').disabled);
    m.editor.select('c');
    t.ok('and refused in place with none', tool(m, 'ungroup').disabled
         && tool(m, 'ungroup').dataset.refusal === 'None of the picked steps is in a group.');
    m.editor.select('b');
    const off = keyOn(nodeEl(m, 'b'), 'G', { ctrlKey: true, shiftKey: true });
    t.ok('Ctrl+Shift+G ungroups the group b is in', off.defaultPrevented && groupsOf(m) === undefined
         && frames(m).length === 0 && m.changes.at(-1).action === 'flow:group:remove');
    t.check('the steps stay where they were', [pos(m, 'a'), pos(m, 'b')], [{ x: 96, y: 160 }, { x: 400, y: 176 }]);
    m.editor.undo();
    m.editor.addNote({ text: 'n', position: { x: 0, y: 600 } });

    m.editor.setReadOnly({ reason: 'Published.' });
    const before = m.editor.serialise();
    const depth = m.editor.history.depth;
    t.ok('Group, Ungroup and Note refused with the reason', ['group', 'ungroup', 'note']
        .every((id) => tool(m, id).disabled && tool(m, id).dataset.refusal === 'Published.'));
    m.editor.select(['a', 'b', 'c']);
    keyOn(nodeEl(m, 'c'), 'g', { ctrlKey: true });
    keyOn(nodeEl(m, 'c'), 'g', { ctrlKey: true, shiftKey: true });
    dragBy(frameOf(m, 'group').querySelector('.twm-flow-graph__group-head'), 64, 64);
    dragBy(noteEl(m, 'note'), 64, 64);
    noteEl(m, 'note').dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    frameOf(m, 'group').querySelector('.twm-flow-graph__group-head').dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    t.ok('no box opens for typing', !m.el.querySelector('.twm-flow-graph__note-input, .twm-flow-graph__group-input'));
    t.ok('the API refuses', m.editor.group(['c']) === null && m.editor.ungroup() === false && m.editor.addNote() === null
         && m.editor.editNote('note', 'x') === false && m.editor.moveNote('note', { x: 1, y: 1 }) === false
         && m.editor.removeNote('note') === false && m.editor.setGroup('group', { label: 'x' }) === false
         && m.editor.setGroupMembers('group', ['c']) === false);
    t.check('nothing was written', [m.editor.serialise() === before, m.editor.history.depth], [true, depth]);
}

t.section('§8 bindFlowKeys: Ctrl/⌘+G and Ctrl/⌘+Shift+G, only when handled');
{
    const root = t.host();
    const calls = [];
    const off = bindFlowKeys(root, { group: () => { calls.push('group'); }, ungroup: () => { calls.push('ungroup'); } });
    t.check('Ctrl+G, ⌘+G, Ctrl+Shift+G', [keyOn(root, 'g', { ctrlKey: true }).defaultPrevented,
                                          keyOn(root, 'g', { metaKey: true }).defaultPrevented,
                                          keyOn(root, 'G', { ctrlKey: true, shiftKey: true }).defaultPrevented, calls],
            [true, true, true, ['group', 'group', 'ungroup']]);
    const field = w.document.createElement('input');
    root.appendChild(field);
    t.check('inside a text field it is the field\'s', [keyOn(field, 'g', { ctrlKey: true }).defaultPrevented, calls.length], [false, 3]);
    off();
    const bare = t.host();
    const off2 = bindFlowKeys(bare, {});
    t.ok('with no handler it is not prevented', !keyOn(bare, 'g', { ctrlKey: true }).defaultPrevented
         && !keyOn(bare, 'g', { ctrlKey: true, shiftKey: true }).defaultPrevented);
    off2();
}

t.section('§9 copy and paste carry the notes, and the groups wholly inside the copy');
{
    const NOTES = [{ id: 'n1', text: 'one', position: { x: 304, y: 48 }, size: { w: 160, h: 60 } },
                   { id: 'n2', text: 'two', position: { x: 300, y: 600 }, size: { w: 160, h: 60 } }];
    const GROUPS = [{ id: 'g1', label: 'Pair', tone: 'teal', nodes: ['a', 'b'] }, { id: 'g2', nodes: ['c', 'far'] }];
    const board = { text: '' };
    const clipboard = { write: (text) => { board.text = text; }, read: () => board.text };
    const m = mount({ ...ALL, clipboard }, { ...GRAPH, groups: GROUPS, notes: NOTES });
    marquee(m, { x: 80, y: 30 }, { x: 500, y: 200 });
    clickNode(m, 'c', { shiftKey: true });
    t.check('a, b, c and the note n1 are picked', m.selects.at(-1), { kind: 'many', ids: ['a', 'b', 'c'], notes: ['n1'] });
    t.ok('Ctrl+C is the editor\'s', keyOn(canvasOf(m), 'c', { ctrlKey: true }).defaultPrevented);
    const copied = JSON.parse(board.text);
    t.check('the copy holds the steps, the note, and only the group wholly inside it (g2 has a member left out)',
            [copied.nodes.map((n) => n.id), copied.notes, copied.groups],
            [['a', 'b', 'c'], [NOTES[0]], [GROUPS[0]]]);
    t.ok('the message line counts steps and notes', /Copied 3 steps and 1 note\./.test(m.el.textContent));
    const before = m.editor.serialise();
    const depth = m.editor.history.depth;
    keyOn(canvasOf(m), 'v', { ctrlKey: true });
    const g = m.editor.getGraph();
    const fresh = g.nodes.slice(4).map((n) => n.id);
    t.check('the paste adds three steps under fresh ids', [fresh.length, fresh.some((id) => ['a', 'b', 'c', 'far'].includes(id))],
            [3, false]);
    t.check('the note is pasted under a fresh id, its text and size kept, two grid steps off',
            g.notes, [...NOTES, { id: 'note', text: 'one', position: { x: 336, y: 80 }, size: { w: 160, h: 60 } }]);
    t.check('the group is made again round the copies of its members, its name and tone kept; g2 is not',
            g.groups, [...GROUPS, { id: 'group', label: 'Pair', tone: 'teal', nodes: fresh.slice(0, 2) }]);
    t.ok('its frame stands round both copies', Boolean(frameOf(m, 'group')) && frames(m).length === 3
         && around(frameOf(m, 'group'), g.nodes[4]) && around(frameOf(m, 'group'), g.nodes[5]));
    t.check('the pick is what was pasted, the note too', m.selects.at(-1), { kind: 'many', ids: fresh, notes: ['note'] });
    t.check('ONE flow:paste entry', [m.editor.history.depth - depth, m.changes.at(-1).action], [1, 'flow:paste']);
    t.ok('a second paste makes fresh ids again', (() => {
        keyOn(canvasOf(m), 'v', { ctrlKey: true });
        const h = m.editor.getGraph();
        return h.notes.at(-1).id === 'note-2' && h.notes.at(-1).position.x === 368 && h.groups.at(-1).id === 'group-2'
            && new Set(h.groups.flatMap((gr) => gr.nodes)).size === h.groups.flatMap((gr) => gr.nodes).length;
    })());
    m.editor.undo();
    m.editor.undo();
    t.ok('one undo per paste puts the graph back', m.editor.serialise() === before && frames(m).length === 2);

    marquee(m, { x: 80, y: 30 }, { x: 500, y: 200 });
    const cutDepth = m.editor.history.depth;
    keyOn(canvasOf(m), 'x', { ctrlKey: true });
    t.check('Ctrl+X takes the steps, the note and their group, ONE entry',
            [m.editor.getGraph().nodes.map((n) => n.id), notesOf(m).map((n) => n.id), groupsOf(m).map((gr) => gr.id),
             m.editor.history.depth - cutDepth, m.changes.at(-1).action],
            [['c', 'far'], ['n2'], ['g2'], 1, 'flow:nodes:remove']);
    keyOn(canvasOf(m), 'v', { ctrlKey: true });
    t.check('the paste after it puts the note back where it was, and the group round the steps',
            [notesOf(m).at(-1), groupsOf(m).at(-1).label, groupsOf(m).at(-1).nodes.length,
             m.editor.getGraph().nodes.slice(2).map((n) => n.position)],
            [{ ...NOTES[0], id: 'note' }, 'Pair', 2, [{ x: 96, y: 160 }, { x: 400, y: 176 }]]);
    m.editor.undo();
    m.editor.undo();
    t.ok('two undos and the graph is as it was', m.editor.serialise() === before);

    marquee(m, { x: 280, y: 580 }, { x: 320, y: 620 });
    t.check('a note alone is picked', m.selects.at(-1), { kind: 'note', id: 'n2' });
    t.ok('Ctrl+D on it is the editor\'s', keyOn(canvasOf(m), 'd', { ctrlKey: true }).defaultPrevented);
    t.check('it duplicates the note beside it, ONE entry, the copy picked',
            [notesOf(m).at(-1), m.changes.at(-1).action, m.selects.at(-1)],
            [{ ...NOTES[1], id: 'note', position: { x: 332, y: 632 } }, 'flow:node:duplicate', { kind: 'note', id: 'note' }]);
    m.editor.undo();
    marquee(m, { x: 280, y: 580 }, { x: 320, y: 620 });
    keyOn(canvasOf(m), 'c', { ctrlKey: true });
    t.check('a note alone copies', [JSON.parse(board.text).nodes, JSON.parse(board.text).notes], [[], [NOTES[1]]]);
    t.ok('and says so', /Copied 1 note\./.test(m.el.textContent));
    const notesText = board.text;

    const off = mount({ multiSelect: true, clipboard });
    off.editor.select(['a', 'b']);
    keyOn(canvasOf(off), 'c', { ctrlKey: true });
    t.ok('without `groups` a copy carries no group', !('groups' in JSON.parse(board.text)));
    const offBefore = off.editor.serialise();
    t.check('without `notes` a paste of notes alone is refused, nothing written',
            [off.editor.paste(notesText).ok, off.editor.serialise() === offBefore], [false, true]);
    off.editor.paste(JSON.stringify({ ...JSON.parse(m.editor.serialise()) }));
    t.check('…and a paste of steps with notes and groups takes only the steps',
            [off.editor.getGraph().nodes.length, 'notes' in off.editor.getGraph(), 'groups' in off.editor.getGraph()],
            [8, false, false]);
}

t.section('§10 a group and a note with the same id: editing one never blocks the other');
{
    const SAME = { nodes: [node('a', 96, 160)], connections: [],
                   groups: [{ id: 'x', nodes: ['a'] }],
                   notes: [{ id: 'x', text: 'same id', position: { x: 96, y: 600 } }] };
    const m = mount(ALL, SAME);
    noteEl(m, 'x').dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    t.ok('note x is open for typing', Boolean(noteEl(m, 'x').querySelector('.twm-flow-graph__note-input')));
    const depth = m.editor.history.depth;
    dragBy(frameOf(m, 'x').querySelector('.twm-flow-graph__group-head'), 64, 32);
    t.check('group x\'s title bar still drags its node, one entry', [pos(m, 'a'), m.editor.history.depth - depth],
            [{ x: 160, y: 192 }, 1]);
    keyOn(noteEl(m, 'x').querySelector('textarea'), 'Escape');

    frameOf(m, 'x').querySelector('.twm-flow-graph__group-head').dispatchEvent(ev(w.MouseEvent, 'dblclick'));
    t.ok('group x is being renamed', Boolean(m.el.querySelector('.twm-flow-graph__group-input')));
    const at = notesOf(m)[0].position;
    const depth2 = m.editor.history.depth;
    dragBy(noteEl(m, 'x'), 48, 32);
    t.check('note x still drags, one entry', [notesOf(m)[0].position, m.editor.history.depth - depth2,
                                               m.changes.at(-1)?.action],
            [{ x: m.editor.canvas.snap(at.x + 48), y: m.editor.canvas.snap(at.y + 32) }, 1, 'flow:note:move']);
}

for (const e of mounted) e.destroy();
t.done();
