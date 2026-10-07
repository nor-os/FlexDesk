/**
 * THE CANVAS EDITOR, MOUNTED (36 §5) — the designer's render cases, ported to a
 * neutral catalogue. Each is a way the editor could be wrong without throwing:
 *
 *   §1  opening is not editing: `load` calls no onChange and leaves nothing to undo
 *   §2  a refusal is on the SCREEN: an unavailable step greyed with its
 *       sentence under it, a refused consumer verb with its reason printed, a
 *       data port a disabled control saying how it is read
 *   §3  click-then-click connects, the node pressed is the node still there
 *       (no rebuild), the edit reaches onChange; Escape cancels; an input first
 *       says what to do
 *   §4  load → serialise is byte-identical even when the keys come back in
 *       another order, and getGraph is a copy
 *   §5  the consumer's findings where they apply: on the node, under the
 *       field, in the strip, and *Go to it* selects and focuses
 *   §6  undo and redo: a baseline at load, Undo refused in place; byte-for-byte
 *       undo; Ctrl+Z stops at the root even in a text field (a tile on `window`
 *       never hears it); a move is one entry; typing a name is one entry; a
 *       removed step comes back with its line and focus is not stranded; an
 *       undo reaches onChange (`via`); a consumer's publish is a baseline;
 *       keep/adopt onto the same bytes only; a reshaping <select>'s focus is
 *       put back and Ctrl+Z there is the editor's; a run overlay rebuilds no
 *       field; a repaint keeps the caret where it was
 *   §7  a palette drag adds exactly ONE step where it is dropped, swallows the
 *       click after it, and Escape, a miss and a destroy each clean up; nothing
 *       is `draggable` and nothing calls setPointerCapture
 *   §8  Arrange lays the run out left to right from the graph's own corner, as
 *       one undo entry; refused with one step
 *   §9  Fit never zooms in past natural size; a press on Fit frames ALL of it
 *   §10 a loop's return line: dashed, under both steps, saying so on hover in
 *       the consumer's words; and the run overlay — a step's line as given,
 *       a port's count, the taken and untaken lines, the banner — changing
 *       nothing in the graph
 *   §11 keys: Delete removes (never a start step), Backspace is NOT the
 *       editor's, Enter opens a focused node's settings, F2 renames, Enter on a
 *       port is the port's own
 *   §12 read only: the reason on screen, every verb refused in place, no
 *       gesture writes
 *   §13 the flow's own settings and the consumer's slots
 *   §14 Insert a value asks the consumer with the steps that ALWAYS run before
 *       and the loops around
 *   §15 destroy removes what it opened
 *
 * jsdom computes no layout and starts no native drag: where things are drawn,
 * and the real-pointer palette drag, are `demo/flow_canvas_probe.mjs`'s.
 *
 *     node tests/flow_canvas_editor.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — editor');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, CANVAS_ACTIONS, createStepCatalogue, openFlowPopover, closeFlowPopovers,
        TEMPLATE_REFERENCES } = flow;

// Real pointer capture would retarget the release — none may be asked for.
let captured = 0;
w.Element.prototype.setPointerCapture = function setPointerCapture() { captured += 1; };
let dragstarts = 0;
document.addEventListener('dragstart', () => { dragstarts += 1; }, true);

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', icon: 'play_arrow',
      ports: [F('out', 'output')], config_schema: { type: 'object', properties: {} } },
    { type_id: 'end', label: 'End', category: 'control', role: 'end', icon: 'flag',
      ports: [F('in', 'input')], config_schema: { type: 'object', properties: { outcome: { type: 'string', enum: ['ok', 'bad'] } } } },
    { type_id: 'read-items', label: 'Read items', category: 'data', icon: 'table', description: 'Reads items from a source.',
      ports: [F('in', 'input'), F('out', 'output'), { name: 'items', direction: 'output', port_type: 'DATA', label: 'Items' }],
      config_schema: { type: 'object', required: ['source', 'limit'], properties: {
          source: { type: 'string', title: 'Source', enum: ['north', 'south'] },
          mode: { type: 'string', title: 'Mode', enum: ['simple', 'advanced'] },
          query: { type: 'string', title: 'Query', 'x-ui-when': { field: 'mode', in: ['advanced'] } },
          note: { type: 'string', title: 'Note' },
          message: { type: 'string', title: 'Message', 'x-ui-widget': 'template' },
          limit: { type: 'integer', minimum: 1 },
      } } },
    { type_id: 'note', label: 'Note', category: 'utility', icon: 'notes',
      ports: [F('in', 'input'), F('out', 'output')], config_schema: { type: 'object', properties: {} } },
    { type_id: 'repeat', label: 'Repeat', category: 'control', role: 'loop', icon: 'repeat',
      ports: [F('in', 'input'), F('next', 'input', { label: 'Next' }), F('body', 'output', { label: 'Body' }),
              F('done', 'output', { label: 'Done' })], config_schema: { type: 'object', properties: {} } },
    { type_id: 'fax', label: 'Send a fax', category: 'integration', icon: 'fax', ports: [],
      config_schema: { type: 'object', properties: {} }, unavailable: 'Send a fax arrives with the telephony steps.' },
];
const CATEGORIES = [{ id: 'control', label: 'Flow', tone: 'violet' }, { id: 'data', label: 'Data', tone: 'teal' },
                    { id: 'integration', label: 'Integration', tone: 'amber' }, { id: 'utility', label: 'Utility', tone: 'grey' }];
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES, idBase: (type) => type.type_id.replace(/^read-/, '') });

const GRAPH = {
    nodes: [
        { id: 'start', type: 'start', config: {}, position: { x: 80, y: 120 } },
        { id: 'read', type: 'read-items', config: { limit: 10, source: 'north' }, position: { x: 400, y: 120 } },
    ],
    connections: [],
};
const EMPTY = { nodes: [], connections: [] };
/** A server's view of a document: every object's keys in another order. */
const reorder = (v) => (Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reorder(v[k])])) : v);

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const host = t.host();
    const changes = [];
    const selects = [];
    const editor = createCanvasEditor(host, {
        catalogue, onChange: (c) => changes.push(c), onSelect: (s) => selects.push(s),
        dataPortRead: (n, p) => `{{steps.${n.id}.${p.name}}}`, ...opts });
    editor.load({ graph: structuredClone(graph) });
    mounted.push(editor);
    return { editor, host, changes, selects, el: editor.el };
}
const mouseAt = (type, init = {}) => new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
const keyOn = (target, init) => {
    const e = new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};
const tool = (m, id) => m.el.querySelector(`.twm-flow-graph__toolbar [data-action="${id}"]`);
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const nodeIds = (m) => [...m.el.querySelectorAll('.twm-flow-graph__node[data-node-id]')].map((n) => n.dataset.nodeId);
const at = (m, id) => ({ x: parseFloat(nodeEl(m, id).style.left), y: parseFloat(nodeEl(m, id).style.top) });
const paletteItem = (m, type) => m.el.querySelector(`.twm-flow-graph__palette-item[data-type="${type}"]`);
const canvasOf = (m) => m.el.querySelector('.twm-canvas');
const portOf = (m, id, name, direction) => nodeEl(m, id)
    .querySelector(`.twm-flow-graph__port[data-port="${name}"][data-direction="${direction}"]`);
const connectPorts = (m, from, out, to, inp) => {
    portOf(m, from, out, 'output').click();
    portOf(m, to, inp, 'input').click();
};
const edges = (m) => [...m.el.querySelectorAll('path.twm-flow-graph__edge')];
const panelEl = (m) => m.el.querySelector('.twm-flow-panel');
const field = (m, key) => panelEl(m).querySelector(`[data-field="${key}"]`);
const titleInput = (m) => panelEl(m).querySelector('.twm-flow-panel__title-input');
const view = (m) => {
    const x = /translate\(([-\d.e+]+)px, ([-\d.e+]+)px\) scale\(([-\d.e+]+)\)/
        .exec(m.el.querySelector('.twm-canvas__surface').style.transform);
    return x ? { tx: Number(x[1]), ty: Number(x[2]), scale: Number(x[3]) } : { tx: NaN, ty: NaN, scale: NaN };
};
const rect = (m, r) => { canvasOf(m).getBoundingClientRect = () => ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }); };
const snap = (v) => Math.round(v / 16) * 16;

t.section('§0 the action list is the contract\'s');
t.check('CANVAS_ACTIONS', [...CANVAS_ACTIONS], ['flow:node:add', 'flow:node:remove', 'flow:node:move', 'flow:edge:connect',
    'flow:edge:disconnect', 'flow:node:label', 'flow:node:config', 'flow:settings', 'flow:arrange']);
t.ok('frozen, and the editor\'s history holds exactly it', Object.isFrozen(CANVAS_ACTIONS)
     && JSON.stringify(mount().editor.history.actions) === JSON.stringify(CANVAS_ACTIONS));

t.section('§1 opening is not editing');
{
    const m = mount();
    t.ok('both steps are drawn', nodeIds(m).join() === 'start,read');
    t.ok('load called no onChange', m.changes.length === 0);
    t.ok('Undo is refused in place, with its reason', tool(m, 'undo').disabled
         && tool(m, 'undo').dataset.refusal === 'There is nothing to undo.');
    t.ok('and so is Redo', tool(m, 'redo').disabled && tool(m, 'redo').dataset.refusal === 'There is nothing to redo.');
    t.check('the toolbar: Undo, Redo, Arrange, Fit, in that order',
            [...m.el.querySelectorAll('.twm-flow-graph__toolbar [data-action]')].map((b) => b.dataset.action),
            ['undo', 'redo', 'arrange', 'fit']);
    t.ok('the canvas is an application, named', canvasOf(m).getAttribute('role') === 'application'
         && canvasOf(m).getAttribute('aria-label') === 'Flow canvas');
    t.ok('a node is a focusable group named by its label', nodeEl(m, 'read').getAttribute('role') === 'group'
         && nodeEl(m, 'read').tabIndex === 0 && nodeEl(m, 'read').getAttribute('aria-label') === 'Read items');
    t.ok('each port is a button', [...nodeEl(m, 'read').querySelectorAll('.twm-flow-graph__port')].every((b) => b.tagName === 'BUTTON'));
    t.ok('the panel is the flow\'s when nothing is picked', panelEl(m).textContent.includes('The flow'));
}

t.section('§2 refusals are on the screen');
{
    const runs = [];
    const m = mount({ actions: [{ id: 'run', label: 'Run', icon: 'play_arrow', run: (ed) => runs.push(ed) },
                                { id: 'save', label: 'Save', icon: 'save', primary: true, run: () => runs.push('save') }] });
    const fax = paletteItem(m, 'fax');
    t.ok('an unavailable step is greyed', fax?.disabled === true && fax.dataset.refusal === 'Send a fax arrives with the telephony steps.');
    t.ok('and its sentence is printed under it', m.el.querySelector('.twm-flow-graph__palette').textContent
        .includes('arrives with the telephony steps'));
    t.ok('an available step is not', paletteItem(m, 'repeat').disabled === false && !paletteItem(m, 'repeat').dataset.refusal);
    t.ok('a start-role step is not offered in the palette', paletteItem(m, 'start') === null);
    t.check('the palette is grouped by category, in the catalogue\'s order',
            [...m.el.querySelectorAll('.twm-flow-graph__palette-group')].map((h) => h.textContent), ['Flow', 'Data', 'Integration', 'Utility']);
    t.check('the consumer\'s verbs come after the editor\'s', [...m.el.querySelectorAll('.twm-flow-graph__toolbar [data-action]')]
        .map((b) => b.dataset.action), ['undo', 'redo', 'arrange', 'fit', 'run', 'save']);
    tool(m, 'run').click();
    t.ok('a verb runs, handed the editor', runs[0] === m.editor);
    m.editor.setActionState('run', { disabled: true, reason: 'Publish the flow before running it.' });
    t.ok('a refused verb carries its reason on the control', tool(m, 'run').disabled
         && tool(m, 'run').dataset.refusal === 'Publish the flow before running it.');
    t.ok('and the reason is printed beside the toolbar', m.el.querySelector('.twm-flow-graph__why').textContent
        === 'Publish the flow before running it.' && !m.el.querySelector('.twm-flow-graph__why').hidden);
    tool(m, 'run').click();
    t.ok('a refused verb does not run', runs.length === 1);
    m.editor.setActionState('save', { busy: true });
    t.ok('a busy verb says so', tool(m, 'save').getAttribute('aria-busy') === 'true'
         && tool(m, 'save').classList.contains('twm-flow-graph__tool--busy'));
    m.editor.setActionState('run', {});
    t.ok('and a verb given back is enabled, its reason gone', !tool(m, 'run').disabled
         && m.el.querySelector('.twm-flow-graph__why').hidden);
    const data = portOf(m, 'read', 'items', 'output');
    t.ok('a data port cannot start a line', data.disabled === true && data.classList.contains('twm-flow-graph__port--data'));
    t.check('and says how it is read, in the consumer\'s syntax', data.title, 'Read it in a later step as {{steps.read.items}}');
    m.editor.setStatus('draft v5 · every change is saved');
    t.ok('setStatus', m.el.querySelector('.twm-flow-graph__status').textContent === 'draft v5 · every change is saved');
}

t.section('§3 click-then-click connects');
{
    const m = mount();
    const nodeBefore = nodeEl(m, 'read');
    portOf(m, 'read', 'in', 'input').click();
    t.ok('an input first says what to do', m.el.querySelector('.twm-flow-graph__message').textContent
        === 'Click an output first, then this input.');
    portOf(m, 'start', 'out', 'output').click();
    t.ok('picking an output marks the source', nodeEl(m, 'start').classList.contains('twm-flow-graph__node--connect-source')
         && m.el.classList.contains('twm-flow-graph--connecting'));
    const esc = keyOn(canvasOf(m), { key: 'Escape' });
    t.ok('Escape cancels it, and takes the key', esc.defaultPrevented && !m.el.classList.contains('twm-flow-graph--connecting'));
    t.ok('…and with nothing to cancel Escape is left alone', !keyOn(canvasOf(m), { key: 'Escape' }).defaultPrevented);
    connectPorts(m, 'start', 'out', 'read', 'in');
    t.ok('a line is drawn', edges(m).length === 1);
    t.ok('the node the press landed on is still the node (no rebuild)', nodeBefore.isConnected && nodeEl(m, 'read') === nodeBefore);
    t.check('the edit reached onChange, once, with its action', m.changes.map((c) => c.action), ['flow:edge:connect']);
    t.ok('with the graph and its text', m.changes[0].graph.connections.length === 1
         && JSON.parse(m.changes[0].text).graph.connections[0].target === 'read');
    connectPorts(m, 'start', 'out', 'read', 'in');
    t.ok('a second line out of a one-line port is refused, in words', m.el.querySelector('.twm-flow-graph__message').textContent
        .includes('already connected') && edges(m).length === 1);
    t.ok('a refusal is no edit', m.changes.length === 1);
}

t.section('§4 load → serialise is byte-identical');
{
    const a = mount();
    connectPorts(a, 'start', 'out', 'read', 'in');
    const sent = a.editor.serialise();
    const b = mount({}, reorder(JSON.parse(sent)));
    t.ok('a graph read back with its keys reordered serialises to the identical text', b.editor.serialise() === sent,
         `${b.editor.serialise()}\n${sent}`);
    t.ok('and loading it is not an edit', b.changes.length === 0);
    const g = b.editor.getGraph();
    g.nodes.push({ id: 'zz' });
    t.ok('getGraph is a copy', b.editor.serialise() === sent);
}

t.section('§5 findings where they apply');
{
    const m = mount();
    m.editor.setFindings({ errors: [{ code: 'source_unreadable', message: 'The run cannot read north.', severity: 'error',
                                      node_id: 'read', field: 'source' },
                                    { code: 'no_end', message: 'Nothing ends this flow.', severity: 'error' }], warnings: [] });
    const read = nodeEl(m, 'read');
    t.ok('the node is marked', read.classList.contains('twm-flow-graph__node--error'));
    t.ok('and says what is wrong', read.textContent.includes('The run cannot read north.'));
    const strip = m.el.querySelector('.twm-flow-strip');
    t.ok('the strip counts them and lists both', !strip.hidden && strip.textContent.includes('2 things to fix')
         && strip.textContent.includes('Nothing ends this flow.') && strip.textContent.includes('Read items — The run cannot read north.'));
    read.click();
    t.ok('and on its field', field(m, 'source')?.classList.contains('twm-flow-field--error')
         && field(m, 'source').textContent.includes('The run cannot read north.'));
    m.editor.select(null);
    t.press([...strip.querySelectorAll('.twm-flow-strip__go')].find((b) => b.closest('li').dataset.node === 'read'));
    t.ok('Go to it selects the step and focuses the field', nodeEl(m, 'read').classList.contains('twm-flow-graph__node--picked')
         && field(m, 'source').contains(document.activeElement), document.activeElement?.outerHTML?.slice(0, 80));
    m.editor.setFindings([{ code: 'w', message: 'Slow.', severity: 'warning', node_id: 'start' }]);
    t.ok('a warning marks its node as a warning', nodeEl(m, 'start').classList.contains('twm-flow-graph__node--warning')
         && !nodeEl(m, 'start').classList.contains('twm-flow-graph__node--error') && !nodeEl(m, 'read').classList.contains('twm-flow-graph__node--error'));
    m.editor.setFindings([{ code: 'gone', message: 'Was here.', severity: 'error', node_id: 'nobody' }]);
    t.ok('a finding naming a step the graph does not have still reaches the strip', strip.textContent.includes('Was here.'));
    m.editor.setFindings([]);
    t.ok('no findings, no strip', strip.hidden);
}

t.section('§6 undo and redo');
{
    // a/b. A palette click, undone and redone, byte for byte.
    const e = mount();
    const before = e.editor.serialise();
    paletteItem(e, 'note').click();
    t.ok('a click adds a step', nodeIds(e).includes('note'));
    t.ok('the new step is picked', nodeEl(e, 'note').classList.contains('twm-flow-graph__node--picked'));
    t.ok('Undo is offered, with its key in the tooltip', !tool(e, 'undo').disabled && tool(e, 'undo').title === 'Undo (Ctrl+Z)');
    tool(e, 'undo').click();
    t.ok('Undo takes it away, byte for byte', !nodeIds(e).includes('note') && e.editor.serialise() === before);
    t.check('and the consumer is told, as an undo', [e.changes.at(-1).action, e.changes.at(-1).via], [null, 'undo']);
    t.ok('with the undone text — the consumer autosaves it', JSON.stringify(JSON.parse(e.changes.at(-1).text).graph) === before);
    tool(e, 'redo').click();
    t.ok('Redo brings back the same step', nodeIds(e).includes('note') && e.changes.at(-1).via === 'redo');

    // c. Ctrl+Z on the canvas, and it goes no further than the editor.
    let leaked = 0;
    const spy = () => { leaked += 1; };
    w.addEventListener('keydown', spy);
    connectPorts(e, 'start', 'out', 'read', 'in');
    const z = keyOn(canvasOf(e), { key: 'z', ctrlKey: true });
    t.ok('Ctrl+Z takes the line away', edges(e).length === 0);
    t.ok('and claims the key', z.defaultPrevented === true);
    t.ok('which never reaches window (a diagram beside it listens there)', leaked === 0, String(leaked));
    keyOn(canvasOf(e), { key: 'y', ctrlKey: true });
    t.ok('Ctrl+Y redoes', edges(e).length === 1);
    keyOn(canvasOf(e), { key: 'z', ctrlKey: true });
    keyOn(canvasOf(e), { key: 'Z', ctrlKey: true, shiftKey: true });
    t.ok('and so does Ctrl+Shift+Z', edges(e).length === 1);

    // d. A move is one entry, restored exactly.
    const was = at(e, 'read');
    nodeEl(e, 'read').querySelector('.twm-flow-graph__node-head').dispatchEvent(mouseAt('pointerdown', { clientX: 500, clientY: 200 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 260 }));
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 260 }));
    t.ok('the step moved', at(e, 'read').x !== was.x || at(e, 'read').y !== was.y);
    t.ok('as one edit', e.changes.at(-1).action === 'flow:node:move');
    keyOn(canvasOf(e), { key: 'z', ctrlKey: true });
    t.ok('one Ctrl+Z puts it back exactly', at(e, 'read').x === was.x && at(e, 'read').y === was.y,
         `${JSON.stringify(at(e, 'read'))} vs ${JSON.stringify(was)}`);

    // e. Typing a name is ONE entry; Ctrl+Z inside the box is the box's.
    nodeEl(e, 'read').click();
    const beforeLabel = e.editor.serialise();
    for (const text of ['S', 'Sc', 'Sco']) t.typeInto(titleInput(e), text);
    t.ok('the name is on the node', nodeEl(e, 'read').querySelector('.twm-flow-graph__node-title').textContent === 'Sco');
    const inField = keyOn(titleInput(e), { key: 'z', ctrlKey: true });
    t.ok('Ctrl+Z inside the box leaves the graph alone', e.editor.serialise().includes('"label":"Sco"') && inField.defaultPrevented === false);
    t.ok('…and does not reach window either', leaked === 0);
    keyOn(canvasOf(e), { key: 'z', ctrlKey: true });
    t.ok('three keystrokes are undone by ONE Ctrl+Z', e.editor.serialise() === beforeLabel, e.editor.serialise());
    w.removeEventListener('keydown', spy);

    // f. A removed step comes back WITH its line, and focus is not stranded.
    nodeEl(e, 'read').click();
    const remove = panelEl(e).querySelector('[data-action="remove"]');
    remove.focus();
    remove.click();
    t.ok('the step and its line are gone', !nodeIds(e).includes('read') && edges(e).length === 0);
    t.ok('focus went back to the canvas, where the keys arrive', document.activeElement === canvasOf(e),
         document.activeElement?.className);
    keyOn(document.activeElement, { key: 'z', ctrlKey: true });
    t.ok('undo brings the step back with its line', nodeIds(e).includes('read') && edges(e).length === 1);

    // h. A consumer's publish is a baseline: nothing to undo after it.
    e.editor.history.baseline(e.editor.snapshot());
    t.ok('after a baseline there is nothing to undo', tool(e, 'undo').disabled && tool(e, 'undo').dataset.refusal === 'There is nothing to undo.');

    // i. The stacks survive a destroy — onto the same bytes only.
    const k1 = mount();
    const k1Before = k1.editor.serialise();
    paletteItem(k1, 'note').click();
    const kept = k1.editor.history.keep();
    const saved = k1.editor.getGraph();
    k1.editor.destroy();
    const k2 = mount({}, saved);
    t.ok('a successor that loaded the same bytes takes the stacks', k2.editor.history.adopt(kept, k2.editor.snapshot())
         && !tool(k2, 'undo').disabled);
    tool(k2, 'undo').click();
    t.ok('and undoing it takes the step away', !nodeIds(k2).includes('note') && k2.editor.serialise() === k1Before);
    const k3 = mount({}, GRAPH);
    t.ok('a successor that loaded something else refuses them', !k3.editor.history.adopt(kept, k3.editor.snapshot())
         && tool(k3, 'undo').disabled);

    // k. A reshaping <select>: focus on the rebuilt control, and its Ctrl+Z is the editor's.
    const q = mount();
    let leak = 0;
    const leakSpy = () => { leak += 1; };
    w.addEventListener('keydown', leakSpy);
    nodeEl(q, 'read').click();
    const mode = () => field(q, 'mode').querySelector('select');
    mode().focus();
    t.change(mode(), '2');
    t.ok('the mode is picked', q.editor.serialise().includes('"mode":"advanced"'));
    t.ok('the field it reveals is drawn (a reshape)', field(q, 'query') !== null);
    t.ok('focus is on the REBUILT select, not the body', document.activeElement === mode(),
         `${document.activeElement?.tagName}.${document.activeElement?.className}`);
    const zPick = keyOn(document.activeElement, { key: 'z', ctrlKey: true });
    t.ok('Ctrl+Z from there undoes the pick', !q.editor.serialise().includes('"mode"'), q.editor.serialise());
    t.ok('and claims the key', zPick.defaultPrevented === true);
    t.ok('which never reaches window', leak === 0, String(leak));
    w.removeEventListener('keydown', leakSpy);

    // p. A run overlay repaints the overlay and the consumer's slot, never a field.
    let slotted = 0;
    const p = mount({ slots: { stepPanel: (box, n) => { slotted += 1; box.textContent = `In the last run: ${n.id}`; } } });
    nodeEl(p, 'read').click();
    const note = field(p, 'note').querySelector('input');
    note.focus();
    t.typeInto(note, 'Scores the term');
    note.setSelectionRange(2, 6);
    const slots = slotted;
    p.editor.setRunOverlay({ steps: { read: { state: 'running', line: 'running' } } });
    p.editor.setRunOverlay({ steps: { read: { state: 'completed', line: 'completed ×2' } } });
    t.ok('the slot was redrawn', slotted === slots + 2 && panelEl(p).textContent.includes('In the last run: read'));
    t.ok('the text box is the SAME node, still focused', note.isConnected && document.activeElement === note);
    t.ok('with its selection where it was', note.selectionStart === 2 && note.selectionEnd === 6,
         `${note.selectionStart}–${note.selectionEnd}`);

    // q. A repaint the reader did not ask for gives the rebuilt box its caret back.
    note.setSelectionRange(1, 1);
    p.editor.repaintPanel();
    const again = field(p, 'note').querySelector('input');
    t.ok('the repaint rebuilt the field', again !== note && !note.isConnected);
    t.ok('focus is on the rebuilt box, the caret where it was', document.activeElement === again
         && again.selectionStart === 1 && again.selectionEnd === 1, `${again.selectionStart}–${again.selectionEnd}`);
    titleInput(p).focus();
    t.typeInto(titleInput(p), 'Scores');
    titleInput(p).setSelectionRange(3, 3);
    p.editor.repaintPanel();
    t.ok('…and the name box too', document.activeElement === titleInput(p) && titleInput(p).selectionStart === 3);
}

t.section('§7 a step dragged from the palette');
{
    const m = mount();
    await t.tick(40);                                   // the requestAnimationFrame fit
    rect(m, { left: 200, top: 100, width: 800, height: 600 });
    const ghost = () => document.querySelector('.twm-flow-graph__ghost');
    const item = paletteItem(m, 'note');
    const count = () => nodeIds(m).length;
    const n0 = count();
    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 62, clientY: 81 }));
    t.ok('a press that travels under 4px draws no ghost', ghost() === null);
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 400 }));
    t.ok('past it, the ghost follows the pointer, on the body', ghost()?.parentNode === document.body);
    t.ok('and the canvas says it will take the drop', m.el.querySelector('.twm-flow-graph__canvas')
        .classList.contains('twm-flow-graph__canvas--drop'));
    const v = view(m);
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 400 }));
    item.dispatchEvent(mouseAt('click'));               // what a browser may send after the release
    t.ok('a drop adds exactly one step', count() === n0 + 1, `${n0} → ${count()}`);
    const want = { x: snap((600 - 200 - v.tx) / v.scale - 104), y: snap((400 - 100 - v.ty) / v.scale - 17) };
    t.ok('where it was dropped', nodeIds(m).includes('note') && at(m, 'note').x === want.x && at(m, 'note').y === want.y,
         `${JSON.stringify(at(m, 'note'))} vs ${JSON.stringify(want)}`);
    t.ok('the ghost is gone, and the canvas no longer says drop', ghost() === null && !m.el.querySelector('.twm-flow-graph__canvas--drop'));
    t.ok('the click after the drag added nothing', count() === n0 + 1);
    keyOn(canvasOf(m), { key: 'z', ctrlKey: true });
    t.ok('and one undo takes the dropped step away', count() === n0);
    await t.tick();

    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 120, clientY: 60 }));
    w.dispatchEvent(mouseAt('pointerup', { clientX: 120, clientY: 60 }));
    t.ok('a drop off the canvas adds nothing', count() === n0);
    t.ok('and says where to drop', m.el.querySelector('.twm-flow-graph__message').textContent === 'Drop a step on the canvas to add it.');
    await t.tick();

    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointerup', { clientX: 60, clientY: 80 }));
    t.ok('a plain press and release draws no ghost', ghost() === null);
    item.dispatchEvent(mouseAt('click'));
    t.ok('and its click still adds the step, at the centre', count() === n0 + 1);
    await t.tick();

    const fax = paletteItem(m, 'fax');
    fax.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 300 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 400 }));
    t.ok('an unavailable step never starts a drag', ghost() === null);
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 400 }));

    const n1 = count();
    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 400 }));
    keyOn(document.body, { key: 'Escape' });
    t.ok('Escape mid-drag takes the ghost away', ghost() === null && !m.el.querySelector('.twm-flow-graph__canvas--drop'));
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 400 }));
    item.dispatchEvent(mouseAt('click'));
    t.ok('and neither the release nor its click adds anything', count() === n1);
    await t.tick();

    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 400 }));
    w.dispatchEvent(mouseAt('pointercancel', { clientX: 600, clientY: 400 }));
    t.ok('pointercancel takes it away', ghost() === null);
    item.dispatchEvent(mouseAt('pointerdown', { clientX: 60, clientY: 80 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 400 }));
    t.ok('a ghost, again', ghost() !== null);
    m.editor.destroy();
    t.ok('a destroy mid-drag takes it away', ghost() === null);
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 400 }));
    t.ok('nothing in the editor is draggable, and nothing asked for pointer capture',
         mounted.every((ed) => !ed.el.querySelector('[draggable]')) && captured === 0 && dragstarts === 0);
}

t.section('§8 Arrange');
{
    const SCRAMBLED = {
        nodes: [
            { id: 'end', type: 'end', config: {}, position: { x: 64, y: 480 } },
            { id: 'read', type: 'read-items', config: { limit: 1 }, position: { x: 720, y: 32 } },
            { id: 'start', type: 'start', config: {}, position: { x: 400, y: 304 } },
        ],
        connections: [
            { source: 'start', target: 'read', sourcePort: 'out', targetPort: 'in' },
            { source: 'read', target: 'end', sourcePort: 'out', targetPort: 'in' },
        ],
    };
    const m = mount({}, SCRAMBLED);
    const before = m.editor.serialise();
    t.ok('Arrange is offered', !tool(m, 'arrange').disabled && tool(m, 'arrange').title.startsWith('Lay the steps out'));
    tool(m, 'arrange').click();
    const [s, r, e] = ['start', 'read', 'end'].map((id) => at(m, id));
    t.ok('the run reads left to right', s.x < r.x && r.x < e.x, JSON.stringify([s, r, e]));
    t.ok('on one line', s.y === r.y && r.y === e.y);
    t.ok('from the corner the graph already had', s.x === 64 && s.y === 32, JSON.stringify(s));
    t.ok('as ONE edit', m.changes.filter((c) => c.action === 'flow:arrange').length === 1 && m.changes.length === 1);
    keyOn(canvasOf(m), { key: 'z', ctrlKey: true });
    t.ok('one Ctrl+Z restores the layout exactly', m.editor.serialise() === before);
    const lone = mount({}, { nodes: [GRAPH.nodes[0]], connections: [] });
    t.ok('with one step, Arrange is refused with its reason', tool(lone, 'arrange').disabled
         && tool(lone, 'arrange').dataset.refusal === 'Arrange needs two steps or more.');
}

t.section('§9 Fit');
{
    const m = mount({}, { nodes: [GRAPH.nodes[0]], connections: [] });
    rect(m, { left: 0, top: 0, width: 634, height: 600 });
    tool(m, 'fit').click();
    t.ok('a lone step is framed at natural size, not blown up', view(m).scale === 1, JSON.stringify(view(m)));
    t.ok('and at the left, with room to its right for the next step', view(m).tx === 40 - 80, String(view(m).tx));
    const WIDE = { nodes: Array.from({ length: 8 }, (_v, i) => ({ id: `s${i}`, type: i ? 'note' : 'start', config: {},
                                                                position: { x: 40 + 304 * i, y: 280 } })), connections: [] };
    const wd = mount({}, WIDE);
    rect(wd, { left: 0, top: 0, width: 734, height: 600 });
    tool(wd, 'fit').click();
    const f = view(wd);
    const right = (40 + 304 * 7 + 208) * f.scale + f.tx;
    t.ok('Fit frames the whole flow, even below 80%', f.scale < 0.8 && f.tx + 40 * f.scale >= 0 && right <= 734, JSON.stringify({ ...f, right }));
    t.ok('and says so', tool(wd, 'fit').dataset.tip === 'Show the whole flow');
    wd.editor.fit();
    t.ok('fit() without `whole` keeps a long flow readable', view(wd).scale === 0.8);
}

t.section('§10 a loop, and a run drawn on the canvas');
{
    const LOOP = {
        nodes: [
            { id: 'start', type: 'start', config: {}, position: { x: 80, y: 120 } },
            { id: 'each', type: 'repeat', config: {}, position: { x: 400, y: 120 } },
            { id: 'jot', type: 'note', config: {}, position: { x: 720, y: 120 } },
            { id: 'end', type: 'end', config: {}, position: { x: 720, y: 320 } },
        ],
        connections: [
            { source: 'start', target: 'each', sourcePort: 'out', targetPort: 'in' },
            { source: 'each', target: 'jot', sourcePort: 'body', targetPort: 'in' },
            { source: 'each', target: 'end', sourcePort: 'done', targetPort: 'in' },
        ],
    };
    const m = mount({ strings: { returnLine: 'Back to the loop for the next row', connectedReturn: 'Continues with the next row.' } }, LOOP);
    connectPorts(m, 'jot', 'out', 'each', 'next');
    t.ok('closing the body says what it means, in the consumer\'s words', m.el.querySelector('.twm-flow-graph__message').textContent
        === 'Continues with the next row.');
    const back = m.el.querySelectorAll('path.twm-flow-graph__edge--back');
    t.ok('the line into next is drawn as a return, and only that one', back.length === 1 && edges(m).length === 4);
    const ys = [...back[0].getAttribute('d').matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((x) => Number(x[1]));
    const loopBottom = 120 + 34 + 22 * 2;
    t.ok('running below both steps', Math.max(...ys) > loopBottom, back[0].getAttribute('d'));
    const titles = [...m.el.querySelectorAll('.twm-flow-graph__edge-hit title')].map((x) => x.textContent);
    t.check('and saying so on hover, on its hit path only', titles, ['Back to the loop for the next row']);
    const text = m.editor.serialise();
    const n = m.changes.length;
    m.editor.setRunOverlay({
        steps: { start: { state: 'completed', line: 'completed' }, each: { state: 'completed', line: '63 rows · 1 page' },
                 jot: { state: 'completed', count: 63, line: 'completed ×63', tone: 'ok' }, end: { state: 'skipped', line: 'skipped' } },
        ports: { each: { body: { taken: true, count: 63 }, done: { taken: false } } },
        banner: 'Drawn on version 4, the version this run used.',
    });
    const runLine = (id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-run');
    t.ok('a step says the consumer\'s line, as given', runLine('jot').textContent === 'completed ×63'
         && runLine('jot').dataset.state === 'completed' && runLine('jot').dataset.tone === 'ok');
    t.ok('a skipped step is dimmed', nodeEl(m, 'end').classList.contains('twm-flow-graph__node--skipped'));
    const body = portOf(m, 'each', 'body', 'output');
    t.ok('a taken port says how often', body.classList.contains('twm-flow-graph__port--taken')
         && body.querySelector('.twm-flow-graph__port-count').textContent === '×63');
    t.ok('an untaken one says so', portOf(m, 'each', 'done', 'output').classList.contains('twm-flow-graph__port--untaken')
         && portOf(m, 'each', 'done', 'output').textContent.includes('not taken'));
    t.ok('the lines out of them follow', m.el.querySelectorAll('path.twm-flow-graph__edge--taken').length === 1
         && m.el.querySelectorAll('path.twm-flow-graph__edge--untaken').length === 1);
    t.ok('the banner is the consumer\'s', m.el.querySelector('.twm-flow-graph__banner').textContent
        === 'Drawn on version 4, the version this run used.' && !m.el.querySelector('.twm-flow-graph__banner').hidden);
    t.ok('an overlay never changes the graph, and is no edit', m.editor.serialise() === text && m.changes.length === n);
    m.editor.setRunOverlay(null);
    t.ok('cleared, it draws nothing', runLine('jot').textContent === '' && m.el.querySelector('.twm-flow-graph__banner').hidden
         && !m.el.querySelector('.twm-flow-graph__port--taken'));
    const header = nodeEl(m, 'jot').querySelector('.twm-flow-graph__node-head');
    t.ok('a step\'s name and id are each named on hover, whatever the header cuts',
         header.querySelector('.twm-flow-graph__node-title').title === 'Note'
         && header.querySelector('.twm-flow-graph__node-tag').title === 'Step id: jot');
}

t.section('§11 keys');
{
    const m = mount();
    nodeEl(m, 'read').click();
    const bs = keyOn(nodeEl(m, 'read'), { key: 'Backspace' });
    t.ok('Backspace is never the editor\'s: not taken, nothing removed', !bs.defaultPrevented && nodeIds(m).includes('read'));
    nodeEl(m, 'start').focus();
    t.ok('focusing a node picks it', nodeEl(m, 'start').classList.contains('twm-flow-graph__node--picked'));
    const del = keyOn(nodeEl(m, 'start'), { key: 'Delete' });
    t.ok('Delete never removes a start step, and leaves the key alone', nodeIds(m).includes('start') && !del.defaultPrevented);
    t.ok('…which offers no Remove either', panelEl(m).querySelector('[data-action="remove"]') === null);
    nodeEl(m, 'read').focus();
    const enter = keyOn(nodeEl(m, 'read'), { key: 'Enter' });
    t.ok('Enter on a node opens its settings and focuses the first field', enter.defaultPrevented
         && field(m, 'source').contains(document.activeElement), document.activeElement?.tagName);
    nodeEl(m, 'read').focus();
    keyOn(nodeEl(m, 'read'), { key: 'F2' });
    t.ok('F2 renames: the name box takes the focus', document.activeElement === titleInput(m));
    const port = portOf(m, 'read', 'in', 'input');
    port.focus();
    t.ok('Enter on a port is the port\'s own', !keyOn(port, { key: 'Enter' }).defaultPrevented);
    nodeEl(m, 'read').focus();
    const gone = keyOn(nodeEl(m, 'read'), { key: 'Delete' });
    t.ok('Delete removes the picked step, and takes the key', gone.defaultPrevented && !nodeIds(m).includes('read'));
    t.ok('and focus is on the canvas', document.activeElement === canvasOf(m));
    const g = mount();
    connectPorts(g, 'start', 'out', 'read', 'in');
    g.el.querySelector('.twm-flow-graph__edge-hit').dispatchEvent(mouseAt('pointerdown'));
    t.ok('a line can be picked', g.el.querySelector('path.twm-flow-graph__edge--picked') !== null
         && g.el.querySelector('.twm-flow-graph__connection').textContent.includes('start · out → read · in'));
    t.check('and the consumer is told', g.selects.at(-1).kind, 'connection');
    keyOn(canvasOf(g), { key: 'Delete' });
    t.ok('Delete disconnects it', edges(g).length === 0 && g.changes.at(-1).action === 'flow:edge:disconnect');
}

t.section('§12 read only');
{
    const m = mount({ readOnly: { reason: 'Drawn on version 4; the draft is newer.' } });
    t.ok('the reason is on the screen', m.el.querySelector('.twm-flow-graph__readonly').textContent
        === 'Drawn on version 4; the draft is newer.' && !m.el.querySelector('.twm-flow-graph__readonly').hidden);
    t.ok('Undo, Redo and Arrange are refused with it', ['undo', 'redo', 'arrange'].every((id) => tool(m, id).disabled
         && tool(m, id).dataset.refusal === 'Drawn on version 4; the draft is newer.'));
    t.ok('Fit still works', !tool(m, 'fit').disabled);
    t.ok('the palette is shut', [...m.el.querySelectorAll('.twm-flow-graph__palette-item')].every((b) => b.disabled));
    paletteItem(m, 'note').click();
    t.ok('a palette click adds nothing', !nodeIds(m).includes('note'));
    t.ok('the ports are shut', [...m.el.querySelectorAll('.twm-flow-graph__port')].every((b) => b.disabled));
    const was = at(m, 'read');
    nodeEl(m, 'read').querySelector('.twm-flow-graph__node-head').dispatchEvent(mouseAt('pointerdown', { clientX: 500, clientY: 200 }));
    w.dispatchEvent(mouseAt('pointermove', { clientX: 600, clientY: 260 }));
    w.dispatchEvent(mouseAt('pointerup', { clientX: 600, clientY: 260 }));
    t.ok('a drag moves nothing, though it picks', at(m, 'read').x === was.x && nodeEl(m, 'read').classList.contains('twm-flow-graph__node--picked'));
    t.ok('the name box is read only', titleInput(m).readOnly === true);
    keyOn(nodeEl(m, 'read'), { key: 'Delete' });
    t.ok('Delete removes nothing', nodeIds(m).includes('read'));
    t.ok('nothing reached onChange', m.changes.length === 0);
    m.editor.setReadOnly(false);
    t.ok('given back, it edits again', !paletteItem(m, 'note').disabled && m.el.querySelector('.twm-flow-graph__readonly').hidden);
    paletteItem(m, 'note').click();
    t.ok('…and a click adds', nodeIds(m).includes('note'));
}

t.section('§13 the flow\'s own settings, and the consumer\'s slots');
{
    let toolbarEnd = null;
    let flowSlot = 0;
    const m = mount({
        flowSettings: { title: 'Score the term', value: { name: 'Score' },
                        schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', title: 'Name' },
                                                                                    description: { type: 'string', title: 'Description', 'x-ui-multiline': true } } } },
        slots: { toolbarEnd: (box) => { toolbarEnd = box; box.textContent = 'Acts as the app Admissions bot'; },
                 flowPanel: (box) => { flowSlot += 1; box.textContent = 'Runs: none yet.'; } },
    });
    t.ok('the toolbar end is the consumer\'s', toolbarEnd?.textContent === 'Acts as the app Admissions bot'
         && m.el.querySelector('.twm-flow-graph__toolbar').contains(toolbarEnd));
    t.ok('with nothing picked the panel is the flow\'s, with its title and fields', panelEl(m).textContent.includes('Score the term')
         && field(m, 'name').querySelector('input').value === 'Score' && field(m, 'description') !== null);
    t.ok('and the consumer\'s flow slot', flowSlot >= 1 && panelEl(m).textContent.includes('Runs: none yet.'));
    t.typeInto(field(m, 'name').querySelector('input'), 'Score it');
    const last = m.changes.at(-1);
    t.check('a flow setting is a flow:settings edit, keyed by its name', [last.action, last.key, last.flowSettings.name],
            ['flow:settings', 'settings:name', 'Score it']);
    t.ok('and part of the snapshot', JSON.parse(last.text).flowSettings.name === 'Score it');
    keyOn(canvasOf(m), { key: 'z', ctrlKey: true });
    t.ok('undone like any edit', m.editor.getFlowSettings().name === 'Score');
    m.editor.select('read');
    t.check('select(id) picks a step, and says so', m.selects.at(-1), { kind: 'step', id: 'read' });
    m.editor.select('flow');
    t.check('select("flow") the flow', m.selects.at(-1), { kind: 'flow', id: null });
    m.editor.select(null);
    t.check('select(null) nothing', m.selects.at(-1), { kind: null, id: null });
}

t.section('§14 Insert a value asks the consumer, with what always runs before');
{
    const asked = [];
    const LOOPED = {
        nodes: [{ id: 'start', type: 'start', config: {}, position: { x: 0, y: 0 } },
                { id: 'each', type: 'repeat', config: {}, position: { x: 300, y: 0 } },
                { id: 'read', type: 'read-items', config: {}, position: { x: 600, y: 0 } }],
        connections: [{ source: 'start', target: 'each', sourcePort: 'out', targetPort: 'in' },
                      { source: 'each', target: 'read', sourcePort: 'body', targetPort: 'in' },
                      { source: 'read', target: 'each', sourcePort: 'out', targetPort: 'next' }],
    };
    const m = mount({
        references: { template: TEMPLATE_REFERENCES },
        values: async (q) => { asked.push(q); return { groups: [{ id: 'row', label: 'This row', items: [{ label: 'email', ref: '${row.email}' }] }],
                                                      note: 'Only steps that always run before this one are listed.' }; },
    }, LOOPED);
    nodeEl(m, 'read').click();
    t.press(field(m, 'message').querySelector('.twm-flow-refbox__insert'));
    await t.tick(0);
    t.check('the consumer is asked for this step and field, with the steps before it, nearest first, and its loops',
            asked.map((q) => [q.stepId, q.field, q.before, q.loops, q.graph.nodes.length]), [['read', 'message', ['each', 'start'], ['each'], 3]]);
    const pop = openFlowPopover();
    t.ok('the picker is open, with the consumer\'s note', pop?.textContent.includes('Only steps that always run before'));
    t.press(pop.querySelector('[role="option"]'));
    t.ok('the picked reference is the setting, as text', m.editor.getGraph().nodes[2].config.message === '${row.email}');
    closeFlowPopovers();
}

t.section('§15 destroy');
{
    const m = mount({ values: async () => [] });
    nodeEl(m, 'read').click();
    t.press(field(m, 'message').querySelector('.twm-flow-refbox__insert'));
    await t.tick(0);
    const host = m.host;
    m.editor.destroy();
    t.ok('the editor is gone from its host', !host.contains(m.el) && !m.el.isConnected);
    t.ok('and so is a picker it opened', openFlowPopover() === null);
    const n = m.changes.length;
    keyOn(m.el, { key: 'z', ctrlKey: true });
    t.ok('its keys are unbound', m.changes.length === n);
    m.editor.destroy();
    t.ok('a second destroy is harmless', true);
}

for (const ed of mounted) ed.destroy();
t.done();
