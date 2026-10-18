/**
 * THE CANVAS EDITOR'S `connections` OPTION (STORY-0075) — data ports that
 * connect under the host's rules, port types, drag-to-connect and the step
 * picker on an empty drop. Each is a way the editor could be wrong without
 * throwing:
 *
 *   §1  without the option nothing is drawn or bound: a data port stays a
 *       disabled control, a drag on an output draws no line, no offer box, no
 *       can-drop class, and the flow refusals keep their words
 *   §2  `dataPorts: 'connect'`: one output connects to two inputs; a data port
 *       never to a flow port; the router's capacity (`maxConnections`) in words
 *   §3  port types: `accepts: ['number']` refuses `provides: ['text']`, the
 *       reason a sentence on the screen
 *   §4  a policy's `{ok: true, offer}`: shown with Accept and Not now; Accept
 *       makes the line and runs `apply` as ONE undo entry; Not now adds nothing;
 *       a refusal from the policy is its own sentence
 *   §5  a drag from an output: only the inputs it may end on carry
 *       `--can-drop`; released on an input it connects, the click after it is
 *       swallowed; Escape cancels; no setPointerCapture
 *   §6  a drag released on the empty canvas: the picker offers only the types
 *       with a compatible input; picking adds the step AND the line as one undo
 *       entry; cancelling adds nothing
 *   §7  read only: no drag starts
 *
 *     node tests/flow_canvas_connections.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — connections');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue, canConnect, openFlowPopover, closeFlowPopovers } = flow;

let captured = 0;
w.Element.prototype.setPointerCapture = function setPointerCapture() { captured += 1; };

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const D = (name, direction, extra = {}) => ({ name, direction, port_type: 'DATA', ...extra });
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'source', label: 'Source', category: 'data',
      ports: [F('in', 'input'), F('out', 'output'), D('value', 'output', { label: 'Value', provides: ['number'] }),
              D('name', 'output', { label: 'Name', provides: ['text'] })] },
    { type_id: 'sum', label: 'Sum', category: 'data',
      ports: [F('in', 'input'), F('out', 'output'), D('a', 'input', { label: 'A', accepts: ['number'] }),
              D('b', 'input', { label: 'B', accepts: ['number'] })] },
    { type_id: 'caption', label: 'Caption', category: 'show',
      ports: [D('text', 'input', { label: 'Text', accepts: ['text'], maxConnections: 1 })] },
    { type_id: 'gate', label: 'Gate', category: 'show', ports: [D('level', 'input', { label: 'Level', accepts: ['number'] })] },
    { type_id: 'fax', label: 'Fax', category: 'show', unavailable: 'Not yet.',
      ports: [D('text', 'input', { accepts: ['text'] })] },
];
const catalogue = createStepCatalogue(TYPES, {
    categories: [{ id: 'control', label: 'Flow' }, { id: 'data', label: 'Data' }, { id: 'show', label: 'Show' }] });

const GRAPH = {
    nodes: [
        { id: 'src', type: 'source', config: {}, position: { x: 40, y: 40 } },
        { id: 'x', type: 'sum', config: {}, position: { x: 400, y: 40 } },
        { id: 'y', type: 'sum', config: {}, position: { x: 400, y: 240 } },
        { id: 'cap', type: 'caption', config: {}, position: { x: 400, y: 440 } },
        { id: 'g', type: 'gate', config: {}, position: { x: 700, y: 40 } },
    ],
    connections: [],
};

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const host = t.host();
    const changes = [];
    const editor = createCanvasEditor(host, { catalogue, onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) }, { fit: false });
    mounted.push(editor);
    return { editor, host, changes, el: editor.el };
}
const LINK = { connections: { dataPorts: 'connect' } };
const ev = (type, init = {}) => new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const portOf = (m, id, name, direction) => nodeEl(m, id)
    .querySelector(`.twm-flow-graph__port[data-port="${name}"][data-direction="${direction}"]`);
const connectPorts = (m, from, out, to, inp) => {
    portOf(m, from, out, 'output').click();
    portOf(m, to, inp, 'input').click();
};
const lines = (m) => m.editor.getGraph().connections.map((c) => `${c.source}.${c.sourcePort}>${c.target}.${c.targetPort}`);
const message = (m) => m.el.querySelector('.twm-flow-graph__message');
const offerBox = (m) => m.el.querySelector('.twm-flow-graph__offer');
const canDrop = (m) => [...m.el.querySelectorAll('.twm-flow-graph__port--can-drop')]
    .map((b) => `${b.closest('[data-node-id]').dataset.nodeId}.${b.dataset.port}`).sort();
const undo = (m) => m.el.querySelector('.twm-flow-graph__toolbar [data-action="undo"]').click();
/** Press an output and travel past the drag threshold. */
const dragFrom = (m, id, port) => {
    portOf(m, id, port, 'output').dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 100 }));
    w.dispatchEvent(ev('pointermove', { clientX: 104, clientY: 101 }));
    w.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 220 }));
};
const releaseOn = (target) => target.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 220 }));

t.section('§1 without the option, nothing changes');
{
    const m = mount();
    const data = portOf(m, 'src', 'value', 'output');
    t.ok('a data port is still a disabled control', data.disabled === true && 'data' in data.dataset);
    t.ok('no offer box and no linking class', offerBox(m) === null && !m.el.classList.contains('twm-flow-graph--linking'));
    dragFrom(m, 'src', 'out');
    t.ok('a drag on an output draws no line and starts nothing',
         !m.el.querySelector('.twm-flow-graph__edge--draft') && !m.el.classList.contains('twm-flow-graph--connecting'));
    releaseOn(m.el.querySelector('.twm-canvas'));
    t.ok('and opens no picker', openFlowPopover() === null);
    connectPorts(m, 'src', 'out', 'x', 'in');
    t.ok('click-then-click still connects', lines(m).join() === 'src.out>x.in');
    portOf(m, 'src', 'out', 'output').click();
    t.ok('no can-drop class while connecting', canDrop(m).length === 0);
    portOf(m, 'y', 'in', 'input').click();
    t.check('a second line out of a flow port: the same words',
            message(m).textContent, 'The out port takes one connection; use a step that runs several branches.');
    const g = { nodes: GRAPH.nodes.slice(0, 2), connections: [] };
    t.check('canConnect without dataPorts: a data port is read, not connected',
            canConnect(g, catalogue, { source: 'src', sourcePort: 'value', target: 'x', targetPort: 'a' }).reason,
            'Only flow ports connect; a data port is read, not connected.');
}

t.section('§2 dataPorts: connect');
{
    const m = mount(LINK);
    const data = portOf(m, 'src', 'value', 'output');
    t.ok('a data port is an enabled control', data.disabled === false && !('data' in data.dataset)
         && data.classList.contains('twm-flow-graph__port--data'));
    connectPorts(m, 'src', 'value', 'x', 'a');
    connectPorts(m, 'src', 'value', 'y', 'a');
    t.check('one output connects to two different inputs', lines(m), ['src.value>x.a', 'src.value>y.a']);
    t.check('each one edit', m.changes.map((c) => c.action), ['flow:edge:connect', 'flow:edge:connect']);
    t.ok('both are drawn', m.el.querySelectorAll('path.twm-flow-graph__edge').length === 2);
    connectPorts(m, 'src', 'value', 'x', 'in');
    t.check('a data port never connects to a flow port, in words', message(m).textContent,
            'A flow port connects to a flow port, and a data port to a data port.');
    connectPorts(m, 'src', 'out', 'x', 'in');
    connectPorts(m, 'src', 'out', 'y', 'in');
    t.check('a flow output still carries one line', message(m).textContent,
            'The out port takes one connection; use a step that runs several branches.');
    connectPorts(m, 'src', 'name', 'cap', 'text');
    const before = lines(m).length;
    const m2 = mount(LINK, { nodes: [...GRAPH.nodes, { id: 'src2', type: 'source', config: {}, position: { x: 40, y: 400 } }],
                             connections: [{ source: 'src', target: 'cap', sourcePort: 'name', targetPort: 'text' }] });
    connectPorts(m2, 'src2', 'name', 'cap', 'text');
    t.check('the kernel router\'s capacity: an input with maxConnections 1 refuses a second, in words',
            message(m2).textContent, 'That port already carries its one connection.');
    t.ok('and nothing was added', lines(m2).length === 1 && lines(m).length === before);
}

t.section('§3 port types');
{
    const m = mount(LINK);
    connectPorts(m, 'src', 'name', 'x', 'a');
    const said = message(m).textContent;
    t.check('accepts [number] refuses provides [text], as a sentence', said,
            'A on Sum takes number, and Name on Source gives text.');
    t.ok('shown as a warning, and no line made', message(m).classList.contains('twm-flow-graph__message--warning')
         && lines(m).length === 0 && m.changes.length === 0);
    connectPorts(m, 'src', 'name', 'cap', 'text');
    t.check('a matching type connects', lines(m), ['src.name>cap.text']);
}

t.section('§4 a policy\'s offer');
{
    const asked = [];
    const policy = (ctx) => {
        asked.push(ctx);
        if (ctx.toNode.type === 'gate') {
            return { ok: true, offer: { message: 'The gate opens only when it is on. Turn it on as well?', accept: 'Turn on',
                                        apply: (draft) => { draft.nodes.find((n) => n.id === ctx.connection.target).config.on = true; } } };
        }
        if (ctx.toNode.id === 'y') return { ok: false, reason: 'Y is reserved for the totals.' };
        return null;
    };
    const m = mount({ connections: { dataPorts: 'connect', policy } });
    connectPorts(m, 'src', 'value', 'g', 'level');
    const box = offerBox(m);
    t.ok('the offer is shown with its words', box && !box.hidden
         && box.querySelector('.twm-flow-graph__offer-text').textContent === 'The gate opens only when it is on. Turn it on as well?');
    const accept = box.querySelector('[data-action="accept-offer"]');
    t.ok('with its Accept label and Not now', accept?.textContent === 'Turn on'
         && box.querySelector('[data-action="dismiss-offer"]')?.textContent === 'Not now');
    t.ok('nothing is applied yet', lines(m).length === 0 && m.changes.length === 0);
    t.ok('the policy saw the line and a copy of the graph', asked.some((c) => c.connection.target === 'g'
         && c.connection.targetPort === 'level' && Array.isArray(c.graph.nodes) && c.fromPort.provides[0] === 'number'));
    accept.click();
    const g = m.editor.getGraph();
    t.ok('accepting applies it: the line and the offer\'s change', lines(m).join() === 'src.value>g.level'
         && g.nodes.find((n) => n.id === 'g').config.on === true);
    t.check('as one edit', m.changes.map((c) => c.action), ['flow:edge:connect']);
    t.ok('the offer is gone', offerBox(m).hidden);
    undo(m);
    t.ok('one undo takes back both', lines(m).length === 0 && !('on' in m.editor.getGraph().nodes.find((n) => n.id === 'g').config));

    connectPorts(m, 'src', 'value', 'g', 'level');
    offerBox(m).querySelector('[data-action="dismiss-offer"]').click();
    t.ok('Not now adds nothing', lines(m).length === 0 && offerBox(m).hidden);
    connectPorts(m, 'src', 'value', 'y', 'a');
    t.check('a policy\'s refusal is its own sentence', message(m).textContent, 'Y is reserved for the totals.');
    connectPorts(m, 'src', 'value', 'g', 'level');
    connectPorts(m, 'src', 'value', 'x', 'a');
    t.ok('another edit takes a pending offer away', offerBox(m).hidden && lines(m).join() === 'src.value>x.a');
}

t.section('§5 drag to connect');
{
    const m = mount({ connections: { dataPorts: 'connect', policy: (ctx) => (ctx.toNode.type === 'gate'
        ? { ok: true, offer: { message: 'Offer' } } : null) } });
    dragFrom(m, 'src', 'value');
    t.ok('a line is drawn while dragging', m.el.querySelector('path.twm-flow-graph__edge--draft') !== null
         && m.el.classList.contains('twm-flow-graph--connecting'));
    t.check('only the compatible inputs carry can-drop (an offer is compatible)', canDrop(m), ['g.level', 'x.a', 'x.b', 'y.a', 'y.b']);
    const target = portOf(m, 'x', 'b', 'input');
    releaseOn(target.querySelector('.twm-flow-graph__port-dot'));
    target.click();                                     // what a browser may send after the release
    t.check('released on an input it connects, once', lines(m), ['src.value>x.b']);
    t.ok('the draft line and the can-drop marks are gone', !m.el.querySelector('.twm-flow-graph__edge--draft')
         && canDrop(m).length === 0 && !m.el.classList.contains('twm-flow-graph--connecting'));
    await t.tick();

    dragFrom(m, 'src', 'name');
    t.check('a text output lights only the text input', canDrop(m), ['cap.text']);
    const esc = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(esc);
    t.ok('Escape cancels the drag', esc.defaultPrevented && !m.el.querySelector('.twm-flow-graph__edge--draft')
         && canDrop(m).length === 0);
    releaseOn(portOf(m, 'cap', 'text', 'input'));
    t.ok('and a release after it connects nothing', lines(m).length === 1);
    await t.tick();

    portOf(m, 'src', 'name', 'output').click();
    t.check('click-then-click marks the compatible inputs too', canDrop(m), ['cap.text']);
    portOf(m, 'cap', 'text', 'input').click();
    t.ok('and connects', lines(m).includes('src.name>cap.text'));

    dragFrom(m, 'src', 'value');
    releaseOn(nodeEl(m, 'x').querySelector('.twm-flow-graph__node-head'));
    t.check('released on a step but not an input: it says where', message(m).textContent, 'Drop the line on an input to connect it.');
    t.ok('no pointer capture was asked for', captured === 0);
    await t.tick();
}

t.section('§6 dropped on the empty canvas');
{
    const m = mount(LINK);
    const n0 = m.editor.getGraph().nodes.length;
    dragFrom(m, 'src', 'name');
    releaseOn(m.el.querySelector('.twm-canvas'));
    const pop = openFlowPopover();
    const offeredIds = pop ? [...pop.querySelectorAll('[role="option"]')].map((o) => o.dataset.entry) : [];
    t.check('the picker offers only types with a compatible input (no start, no unavailable)', offeredIds, ['caption']);
    t.ok('under its own title', pop?.textContent.includes('Add a step and connect it'));
    t.press(pop.querySelector('[data-entry="caption"]'));
    await t.tick();
    const g = m.editor.getGraph();
    const added = g.nodes.find((n) => n.type === 'caption' && n.id !== 'cap');
    t.ok('picking adds the step', g.nodes.length === n0 + 1 && Boolean(added));
    t.check('and the line to it', lines(m), [`src.name>${added?.id}.text`]);
    t.check('as one edit', m.changes.map((c) => c.action), ['flow:node:add']);
    t.ok('the new step is picked', nodeEl(m, added.id).classList.contains('twm-flow-graph__node--picked'));
    t.ok('the picker anchor is gone', !m.el.querySelector('.twm-flow-graph__drop-anchor'));
    undo(m);
    t.ok('one undo takes back the step and the line', m.editor.getGraph().nodes.length === n0 && lines(m).length === 0);
    await t.tick();

    dragFrom(m, 'src', 'value');
    releaseOn(m.el.querySelector('.twm-canvas'));
    const pop2 = openFlowPopover();
    t.check('a number output is offered the number inputs', [...pop2.querySelectorAll('[role="option"]')]
        .map((o) => o.dataset.entry).sort(), ['gate', 'sum']);
    const changes = m.changes.length;
    t.key(pop2.querySelector('input'), 'Escape');
    await t.tick();
    t.ok('cancelling the picker adds nothing', openFlowPopover() === null && m.editor.getGraph().nodes.length === n0
         && lines(m).length === 0 && m.changes.length === changes);
    t.ok('and leaves no anchor behind', !m.el.querySelector('.twm-flow-graph__drop-anchor'));
    await t.tick();

    const lone = mount(LINK, { nodes: [{ id: 'g', type: 'gate', config: {}, position: { x: 0, y: 0 } },
                                       { id: 'src', type: 'source', config: {}, position: { x: 300, y: 0 } }], connections: [] });
    const narrow = createStepCatalogue(TYPES.filter((x) => x.type_id === 'source'));
    const only = mount({ ...LINK, catalogue: narrow }, { nodes: [{ id: 'src', type: 'source', config: {}, position: { x: 0, y: 0 } }],
                                                         connections: [] });
    dragFrom(only, 'src', 'name');
    releaseOn(only.el.querySelector('.twm-canvas'));
    t.ok('with no type that fits, no picker and a sentence', openFlowPopover() === null
         && message(only).textContent === 'No step has an input this output can connect to.');
    t.ok('(a second editor is independent)', lone.changes.length === 0);
    closeFlowPopovers();
    await t.tick();
}

t.section('§7 read only');
{
    const m = mount({ ...LINK, readOnly: { reason: 'Locked.' } });
    dragFrom(m, 'src', 'value');
    t.ok('no drag starts', !m.el.querySelector('.twm-flow-graph__edge--draft') && canDrop(m).length === 0);
    releaseOn(m.el.querySelector('.twm-canvas'));
    t.ok('and no picker opens', openFlowPopover() === null && lines(m).length === 0);
}

for (const ed of mounted) ed.destroy();
t.done();
