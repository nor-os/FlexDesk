/**
 * LIVE VALUES AND FOLDED NODES ON THE CANVAS (STORY-0083) — what the host
 * paints onto the nodes while something runs, and a node folded to its header.
 * Each is a way the editor could be wrong without throwing:
 *
 *   §1  a consumer that uses neither sees nothing new: no fold button, no
 *       badge, no port value in the DOM, the same text out — and a graph that
 *       carries `collapsed: true` is drawn unfolded and handed back unchanged
 *   §2  ten `setNodeValues` calls a second (a real 100 ms timer) each put the
 *       new badge text and port values on the SAME node, and a field being
 *       typed into in the settings panel keeps its focus and its selection
 *   §3  `setNodeValues` records nothing: no undo entry, no onChange, the same
 *       snapshot; a type's own `update` reads them as `ctx.values`, runs for the
 *       nodes whose values changed, and cannot write from there; null clears
 *       them and their elements go
 *   §4  with `collapsible`, the header's button folds the node: its ports are
 *       hidden (the class, and the sheet's rule), its lines end on the header's
 *       middle on both sides, it is ONE `flow:node:collapse` entry, and Ctrl+Z
 *       unfolds it with its lines back on their ports; read only refuses it
 *   §5  `collapsed: true` survives serialise → load; an unfolded node writes no
 *       `collapsed` key; and the pure geometry folds a node the same way
 *
 *     node tests/flow_canvas_live_values.test.mjs
 */
import { readFile } from 'node:fs/promises';
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — live values and folded nodes');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue, CANVAS_NODE, canvasPortAnchor, canvasNodeBottom, serialise: serialiseLogicGraph } = flow;

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const updates = { calls: 0, seen: [], wrote: [] };
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'step', label: 'Step', category: 'control', ports: [F('in', 'input'), F('a', 'output'), F('b', 'output')],
      config_schema: { type: 'object', properties: { note: { type: 'string', title: 'Note' } } } },
    { type_id: 'gauge', label: 'Gauge', category: 'control', ports: [F('in', 'input'), F('out', 'output')],
      render(body) { body.appendChild(document.createElement('output')); },
      update(body, node, ctx) {
          updates.calls += 1;
          updates.seen.push(ctx.values);
          updates.wrote.push(ctx.setConfig({ shown: 1 }));
          body.querySelector('output').textContent = ctx.values?.badge ?? '';
      } },
];
const catalogue = createStepCatalogue(TYPES, { categories: [{ id: 'control', label: 'Flow', tone: 'violet' }] });
const GRAPH = {
    nodes: [
        { id: 'start', type: 'start', config: {}, position: { x: 80, y: 96 } },
        { id: 'step', type: 'step', config: {}, position: { x: 400, y: 96 } },
        { id: 'gauge', type: 'gauge', config: {}, position: { x: 720, y: 96 } },
    ],
    connections: [
        { source: 'start', target: 'step', sourcePort: 'out', targetPort: 'in' },
        { source: 'step', target: 'gauge', sourcePort: 'b', targetPort: 'in' },
    ],
};

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const host = t.host();
    const changes = [];
    const editor = createCanvasEditor(host, { catalogue, onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) });
    mounted.push(editor);
    return { editor, host, changes, el: editor.el };
}
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const badgeOf = (m, id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-head .twm-flow-graph__node-badge');
const portValue = (m, id, name, direction) => nodeEl(m, id)
    .querySelector(`.twm-flow-graph__port[data-port="${name}"][data-direction="${direction}"] .twm-flow-graph__port-value`);
const foldOf = (m, id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-head .twm-flow-graph__node-fold');
const field = (m, key) => m.el.querySelector(`.twm-flow-panel [data-field="${key}"]`);
const keyOn = (target, init) => target.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
const lines = (m) => [...m.el.querySelectorAll('path.twm-flow-graph__edge')];
/** A line's two ends, read off its `d`: the first point and the last. */
const ends = (path) => {
    const nums = path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
    return { from: { x: nums[0], y: nums[1] }, to: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
};
const near = (p, q) => Math.abs(p.x - q.x) <= 1 && Math.abs(p.y - q.y) <= 1;
const mouseAt = (type, init = {}) => new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

t.section('§1 a consumer that uses neither sees nothing new');
{
    const m = mount();
    const before = m.el.querySelector('.twm-canvas').innerHTML;
    t.ok('no fold button on any header', m.el.querySelector('.twm-flow-graph__node-fold') === null);
    t.ok('no badge and no port value', m.el.querySelector('.twm-flow-graph__node-badge, .twm-flow-graph__port-value') === null);
    m.editor.setNodeValues(null);
    m.editor.setNodeValues({});
    t.check('an empty setNodeValues changes no markup', m.el.querySelector('.twm-canvas').innerHTML, before);
    t.check('the text out is the graph\'s, no new key', m.editor.serialise(), serialiseLogicGraph(GRAPH));
    t.ok('no collapsed key anywhere', !m.editor.serialise().includes('collapsed'));
    t.check('setCollapsed is refused without the option', m.editor.setCollapsed('step', true), false);
    t.check('and wrote nothing', m.editor.history.depth, 0);

    const folded = structuredClone(GRAPH);
    folded.nodes[1].collapsed = true;
    const f = mount({}, folded);
    t.ok('a collapsed flag without the option is drawn unfolded',
         !nodeEl(f, 'step').classList.contains('twm-flow-graph__node--collapsed')
         && nodeEl(f, 'step').querySelectorAll('.twm-flow-graph__port').length === 3);
    const a = canvasPortAnchor(catalogue, folded.nodes[1], 'b', 'output', { ...CANVAS_NODE, folded: () => false });
    t.ok('and its lines meet its ports', lines(f).some((p) => near(ends(p).from, a)));
    t.ok('the flag is carried through untouched', f.editor.getGraph().nodes[1].collapsed === true
         && f.editor.serialise() === serialiseLogicGraph(folded));
}

t.section('§2 ten setNodeValues a second: the badge moves, the panel keeps its focus');
{
    const m = mount();
    nodeEl(m, 'step').click();
    const note = field(m, 'note').querySelector('input');
    note.focus();
    t.typeInto(note, 'Typing');
    note.setSelectionRange(1, 4);
    const node = nodeEl(m, 'step');
    const shown = [];
    let focused = 0;
    let kept = 0;
    const started = Date.now();
    for (let i = 1; i <= 10; i += 1) {
        await sleep(100);
        m.editor.setNodeValues({ step: { badge: i * 1.5, tone: i % 2 ? 'teal' : 'amber', ports: { a: `a=${i}`, in: i } } });
        shown.push(badgeOf(m, 'step')?.textContent);
        if (document.activeElement === note) focused += 1;
        if (note.selectionStart === 1 && note.selectionEnd === 4) kept += 1;
    }
    const took = Date.now() - started;
    t.ok('ten calls over about a second', took >= 900 && took < 3000, `${took} ms`);
    t.check('each call put its value on the badge', shown, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => String(i * 1.5)));
    t.check('the panel field had the focus after every one', focused, 10);
    t.check('with its selection where it was', kept, 10);
    t.ok('the text box is the same element, still holding what was typed', note.isConnected && note.value === 'Typing');
    t.ok('the node is the same element', nodeEl(m, 'step') === node);
    t.check('the badge is in the tone given', badgeOf(m, 'step').dataset.tone, 'amber');
    t.ok('the badge sits in the header, before the id tag',
         badgeOf(m, 'step').nextElementSibling?.classList.contains('twm-flow-graph__node-tag'));
    t.check('port values beside their ports', [portValue(m, 'step', 'a', 'output')?.textContent,
                                              portValue(m, 'step', 'in', 'input')?.textContent], ['a=10', '10']);
    t.ok('a port without a value has no value element', portValue(m, 'step', 'b', 'output') === null);
    m.editor.setNodeValues({ step: { badge: 'x', tone: 'not-a-tone' } });
    t.ok('an unknown tone is dropped', !('tone' in badgeOf(m, 'step').dataset));
    t.ok('and a port left out loses its value', portValue(m, 'step', 'a', 'output') === null);
    m.editor.setRunOverlay({ steps: { step: { state: 'running', line: 'running' } } });
    t.check('a repaint keeps the values', badgeOf(m, 'step')?.textContent, 'x');
}

t.section('§3 setNodeValues records nothing; a body reads them through ctx.values');
{
    const m = mount();
    const snap = m.editor.snapshot();
    updates.calls = 0; updates.seen = []; updates.wrote = [];
    for (let i = 0; i < 10; i += 1) m.editor.setNodeValues({ gauge: { badge: `${i}%` }, step: { badge: i } });
    t.check('no undo entry', [m.editor.history.depth, m.editor.history.canUndo], [0, false]);
    t.check('no onChange', m.changes.length, 0);
    t.check('the same snapshot and text', m.editor.snapshot(), snap);
    t.check('the body\'s update ran once per change of its values', updates.calls, 10);
    t.check('and read them as ctx.values', updates.seen.at(-1), { badge: '9%', tone: null, ports: {} });
    t.ok('a setConfig from there is refused', updates.wrote.every((x) => x === false));
    t.check('the body shows it', nodeEl(m, 'gauge').querySelector('.twm-flow-graph__node-body output').textContent, '9%');
    m.editor.setNodeValues({ gauge: { badge: '9%' }, step: { badge: 10 } });
    t.check('values that did not change run no update', updates.calls, 10);
    m.editor.setNodeValues(null);
    t.ok('null clears them: no badge left', m.el.querySelector('.twm-flow-graph__node-badge') === null);
    t.ok('and the body heard it', updates.calls === 11 && updates.seen.at(-1) === null);
    t.check('still nothing recorded', [m.editor.history.depth, m.changes.length], [0, 0]);
    m.editor.setNodeValues({ ghost: { badge: 1 } });
    t.ok('a value for a node that is not there is harmless', m.el.querySelector('.twm-flow-graph__node-badge') === null);
}

t.section('§4 collapsible: folding to the header, one entry, Ctrl+Z unfolds');
{
    const m = mount({ collapsible: true });
    const n = nodeEl(m, 'step');
    const fold = foldOf(m, 'step');
    t.ok('each header has a fold button', fold !== null && m.el.querySelectorAll('.twm-flow-graph__node-fold').length === 3);
    t.check('which says the node is open', fold.getAttribute('aria-expanded'), 'true');
    const node = m.editor.getGraph().nodes[1];
    const box = { ...CANVAS_NODE, folded: () => false };
    const portIn = canvasPortAnchor(catalogue, node, 'in', 'input', box);
    const portOut = canvasPortAnchor(catalogue, node, 'b', 'output', box);
    t.ok('before: its lines meet its ports', lines(m).some((p) => near(ends(p).to, portIn))
         && lines(m).some((p) => near(ends(p).from, portOut)));

    const press = (target) => {
        target.dispatchEvent(mouseAt('pointerdown', { clientX: 5, clientY: 5 }));
        w.dispatchEvent(mouseAt('pointermove', { clientX: 205, clientY: 105 }));
        w.dispatchEvent(mouseAt('pointerup', { clientX: 205, clientY: 105 }));
    };
    const control = mount({ collapsible: true });
    press(nodeEl(control, 'step').querySelector('.twm-flow-graph__node-title'));
    t.ok('(the same press on the title drags the node)', control.editor.getGraph().nodes[1].position.x !== 400);
    press(fold);
    fold.click();
    t.ok('the press on the button dragged nothing', m.editor.getGraph().nodes[1].position.x === 400);
    t.ok('folded: the node is marked collapsed', n.classList.contains('twm-flow-graph__node--collapsed'));
    t.ok('the same element, not rebuilt', nodeEl(m, 'step') === n && foldOf(m, 'step') === fold);
    t.check('the button says so', [fold.getAttribute('aria-expanded'), fold.title],
            ['false', 'Show this step\'s ports again']);
    const mid = node.position.y + CANVAS_NODE.header / 2;
    const headIn = { x: node.position.x, y: mid };
    const headOut = { x: node.position.x + CANVAS_NODE.width, y: mid };
    t.ok('the line in ends on the header\'s middle, left', lines(m).some((p) => near(ends(p).to, headIn)),
         lines(m).map((p) => p.getAttribute('d')).join(' | '));
    t.ok('the line out starts on the header\'s middle, right', lines(m).some((p) => near(ends(p).from, headOut)));
    t.check('both lines are still drawn', lines(m).length, 2);
    t.check('one undo entry', [m.editor.history.depth, m.editor.history.undoAction], [1, 'flow:node:collapse']);
    t.check('onChange heard it once', m.changes.map((c) => c.action), ['flow:node:collapse']);
    t.ok('the graph says collapsed', m.editor.getGraph().nodes[1].collapsed === true);
    m.editor.setNodeValues({ step: { badge: 42 } });
    t.check('a folded header still shows its badge', badgeOf(m, 'step')?.textContent, '42');

    keyOn(n, { key: 'z', ctrlKey: true });
    t.ok('Ctrl+Z unfolds it', !nodeEl(m, 'step').classList.contains('twm-flow-graph__node--collapsed')
         && !('collapsed' in m.editor.getGraph().nodes[1]));
    t.ok('its lines are back on their ports', lines(m).some((p) => near(ends(p).to, portIn))
         && lines(m).some((p) => near(ends(p).from, portOut)));
    t.check('the undo reached onChange', m.changes.at(-1).via, 'undo');
    keyOn(n, { key: 'y', ctrlKey: true });
    t.ok('and Ctrl+Y folds it again', nodeEl(m, 'step').classList.contains('twm-flow-graph__node--collapsed'));

    t.check('setCollapsed: no change is refused', m.editor.setCollapsed('step', true), false);
    t.ok('setCollapsed unfolds, one more entry', m.editor.setCollapsed('step', false) === true
         && m.editor.history.depth === 2 && m.editor.history.undoAction === 'flow:node:collapse');
    m.editor.setReadOnly({ reason: 'Locked.' });
    t.ok('read only: the button is disabled', foldOf(m, 'step').disabled === true);
    t.check('and setCollapsed is refused', m.editor.setCollapsed('step', true), false);
    t.check('the graph is as it was', m.editor.getGraph().nodes[1].collapsed, undefined);

    const sheet = await readFile(new URL('../css/flexdesk.css', import.meta.url), 'utf8');
    t.ok('the sheet hides everything under a folded header',
         /\.twm-flow-graph__node--collapsed > :not\(\.twm-flow-graph__node-head\) \{ display: none; \}/.test(sheet));
    const base = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
    t.ok('and so does base.css', base.includes('.twm-flow-graph__node--collapsed > :not(.twm-flow-graph__node-head) { display: none; }'));
}

t.section('§5 the collapsed flag through serialise and load');
{
    const m = mount({ collapsible: true });
    m.editor.setCollapsed('gauge', true);
    const text = m.editor.serialise();
    const nodes = JSON.parse(text).nodes;
    t.check('the folded node writes collapsed: true', nodes[2].collapsed, true);
    t.ok('the unfolded ones write no collapsed key', !('collapsed' in nodes[0]) && !('collapsed' in nodes[1]));
    t.check('after position, the last key', Object.keys(nodes[2]), ['id', 'type', 'config', 'position', 'collapsed']);
    const again = mount({ collapsible: true }, JSON.parse(text));
    t.ok('loaded again it is folded', nodeEl(again, 'gauge').classList.contains('twm-flow-graph__node--collapsed'));
    t.check('and the text is the same', again.editor.serialise(), text);
    again.editor.setCollapsed('gauge', false);
    t.ok('unfolded, the key is gone', !again.editor.serialise().includes('collapsed'));
    t.check('…and the text is what it was before any fold', again.editor.serialise(), serialiseLogicGraph(GRAPH));
    const odd = structuredClone(GRAPH);
    odd.nodes[0].collapsed = false;
    odd.nodes[1].collapsed = 'yes';
    t.ok('anything but true writes no key', !serialiseLogicGraph(odd).includes('collapsed'));

    const row = { type: 'step', position: { x: 10, y: 20 }, collapsed: true };
    t.check('canvasPortAnchor: a folded node\'s ports meet its header', canvasPortAnchor(catalogue, row, 'b', 'output'),
            { x: 10 + CANVAS_NODE.width, y: 20 + CANVAS_NODE.header / 2, side: 'right' });
    t.check('canvasNodeBottom: a folded node is its header', canvasNodeBottom(catalogue, row), 20 + CANVAS_NODE.header);
    t.check('unfolded, as before', canvasNodeBottom(catalogue, { ...row, collapsed: undefined }),
            20 + CANVAS_NODE.header + 2 * CANVAS_NODE.row + 12);
}

for (const ed of mounted) ed.destroy();
t.done();
