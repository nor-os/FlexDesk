/**
 * A CANVAS NODE THAT DRAWS ITSELF (STORY-0074) — a catalogue type's own body,
 * box and accent, and types registered while the editor is open. Each is a way
 * the editor could be wrong without throwing:
 *
 *   §1  a type without the new keys is drawn exactly as before: no body, no
 *       accent, no fixed height, the box's width — and the same markup whether
 *       or not a type beside it has a body of its own
 *   §2  a type's `render` fills a body BELOW its ports, once; `update` runs on
 *       every repaint onto the SAME element, so a focused input inside it
 *       keeps its focus and its value across ten repaints
 *   §3  `ctx.setConfig` from a body control is ONE `flow:node:config` undo
 *       entry, reaches onChange, and Ctrl+Z puts the config back; read only
 *       refuses it, and so does a call from inside `update`; a patch holding
 *       a value that cannot be cloned is refused whole and changes nothing
 *   §4  a custom `size`: the node is that box, its outputs are anchored at its
 *       own width, and every line in the SVG starts and ends on the anchors
 *       (the browser half is `demo/flow_canvas_probe.mjs`'s "bodies"); an
 *       `accent` marks the node; a bad `size`, `accent` or hook is a line in
 *       the catalogue's `problems`, never a throw
 *   §5  a type registered after `load` (`setCatalogue`) appears in the
 *       palette and its nodes draw without reloading the graph; the graph and
 *       the history are untouched; a node whose type's definition did not
 *       change is not rebuilt, even from a NEW catalogue of equal types (a
 *       body being typed into keeps its focus and value), and one whose
 *       definition did change (label, ports, render) is
 *   §6  a `render` that throws leaves that node drawn with the default body
 *       and says so through the editor's findings — on the node and in the
 *       strip, beside the consumer's — without breaking any other node
 *   §7  the geometry: `canvasNodeWidth`, `canvasNodeBottom` with `size.h`,
 *       and Arrange spacing its columns by the widest node
 *
 *     node tests/flow_canvas_node_body.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — node bodies');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue, CANVAS_NODE, canvasNodeWidth, canvasNodeBottom,
        canvasPortAnchor, arrangeCanvasGraph } = flow;

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const PLAIN = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', ports: [F('out', 'output')] },
    { type_id: 'step', label: 'Step', category: 'control', ports: [F('in', 'input'), F('out', 'output')] },
];
const CATEGORIES = [{ id: 'control', label: 'Flow', tone: 'violet' }];

/** A body with a number box: what a modeler's value node looks like. */
const calls = { render: 0, update: 0, seen: [] };
const DIAL = {
    type_id: 'dial', label: 'Dial', category: 'control', accent: 'teal', size: { w: 260, h: 150 },
    ports: [F('in', 'input'), F('a', 'output', { label: 'A' }), F('b', 'output', { label: 'B' })],
    render(body, node, ctx) {
        calls.render += 1;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'dial-value';
        input.addEventListener('change', () => ctx.setConfig({ value: Number(input.value) }));
        const shown = document.createElement('span');
        shown.className = 'dial-shown';
        body.append(input, shown);
    },
    update(body, node, ctx) {
        calls.update += 1;
        calls.seen.push(node.config.value);
        body.querySelector('.dial-shown').textContent = String(node.config.value ?? '');
        body.querySelector('.dial-value').disabled = ctx.readOnly;
    },
};

const GRAPH = {
    nodes: [
        { id: 'start', type: 'start', config: {}, position: { x: 80, y: 112 } },
        { id: 'dial', type: 'dial', config: { value: 3 }, position: { x: 400, y: 112 } },
        { id: 'step', type: 'step', config: {}, position: { x: 800, y: 112 } },
    ],
    connections: [
        { source: 'start', target: 'dial', sourcePort: 'out', targetPort: 'in' },
        { source: 'dial', target: 'step', sourcePort: 'b', targetPort: 'in' },
    ],
};

const mounted = [];
function mount(types, graph = GRAPH, opts = {}) {
    const host = t.host();
    const changes = [];
    const editor = createCanvasEditor(host, {
        catalogue: createStepCatalogue(types, { categories: CATEGORIES }), onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) });
    mounted.push(editor);
    return { editor, host, changes, el: editor.el };
}
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const bodyOf = (m, id) => nodeEl(m, id)?.querySelector('.twm-flow-graph__node-body') ?? null;
const paletteItem = (m, type) => m.el.querySelector(`.twm-flow-graph__palette-item[data-type="${type}"]`);
const keyOn = (target, init) => target.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
/** A line's two ends, read off its `d`: the first point and the last. */
const ends = (path) => {
    const nums = path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
    return { from: { x: nums[0], y: nums[1] }, to: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
};

t.section('§1 a type without the new keys is drawn exactly as before');
{
    const plain = mount(PLAIN, { nodes: GRAPH.nodes.filter((n) => n.type !== 'dial'), connections: [] });
    const mixed = mount([...PLAIN, DIAL], { nodes: GRAPH.nodes.filter((n) => n.type !== 'dial'), connections: [] });
    const n = nodeEl(plain, 'step');
    t.ok('no body of its own', bodyOf(plain, 'step') === null);
    t.ok('no accent, no fixed height, not sized', !('accent' in n.dataset) && n.style.height === ''
         && !n.classList.contains('twm-flow-graph__node--sized'));
    t.check('the box\'s own width', n.style.width, `${CANVAS_NODE.width}px`);
    t.check('the same markup whether or not another type has a body', nodeEl(mixed, 'step').outerHTML, n.outerHTML);
    t.check('and the same text out', mixed.editor.serialise(), plain.editor.serialise());
}

t.section('§2 render once, update on every repaint, onto the same element');
{
    calls.render = 0; calls.update = 0; calls.seen = [];
    const m = mount([...PLAIN, DIAL]);
    const body = bodyOf(m, 'dial');
    const n = nodeEl(m, 'dial');
    t.ok('the body is there, with the type\'s own DOM', body?.querySelector('.dial-value') !== null);
    const rows = [...n.querySelectorAll('.twm-flow-graph__node-row')];
    t.ok('below its ports: after the last port row', rows.length === 2
         && (rows[rows.length - 1].compareDocumentPosition(body) & w.Node.DOCUMENT_POSITION_FOLLOWING) !== 0
         && body.previousElementSibling === rows[rows.length - 1]);
    t.check('render ran once', calls.render, 1);
    t.ok('update ran after it, with the node\'s config', calls.update >= 1 && calls.seen.at(-1) === 3
         && body.querySelector('.dial-shown').textContent === '3');
    const input = body.querySelector('.dial-value');
    input.focus();
    input.value = '42';
    const before = calls.update;
    for (let i = 0; i < 10; i += 1) {
        if (i % 2) m.editor.setRunOverlay({ steps: { dial: { state: 'running', line: `pass ${i}` } } });
        else m.editor.setFindings([{ code: 'x', message: `note ${i}`, severity: 'warning', node_id: 'step' }]);
    }
    t.check('update ran on each of the ten repaints', calls.update - before, 10);
    t.ok('the body is the same element', bodyOf(m, 'dial') === body && nodeEl(m, 'dial') === n);
    t.ok('the focused input inside it still has the focus', document.activeElement === input);
    t.check('and still holds what was typed', input.value, '42');
    t.check('render still ran only once', calls.render, 1);
}

t.section('§3 ctx.setConfig is one undo entry; Ctrl+Z puts the config back');
{
    const m = mount([...PLAIN, DIAL]);
    const body = bodyOf(m, 'dial');
    const input = body.querySelector('.dial-value');
    t.check('nothing to undo after load', m.editor.history.depth, 0);
    input.value = '7';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    t.check('exactly one undo entry', m.editor.history.depth, 1);
    t.check('a flow:node:config edit', m.editor.history.undoAction, 'flow:node:config');
    t.check('onChange heard it once, as that action', m.changes.map((c) => c.action), ['flow:node:config']);
    t.check('the graph holds the new value', m.editor.getGraph().nodes.find((x) => x.id === 'dial').config, { value: 7 });
    t.check('and the body was brought up to date', body.querySelector('.dial-shown').textContent, '7');
    keyOn(nodeEl(m, 'dial'), { key: 'z', ctrlKey: true });
    t.check('Ctrl+Z restores the previous config', m.editor.getGraph().nodes.find((x) => x.id === 'dial').config, { value: 3 });
    t.ok('onto the same body, which shows it', bodyOf(m, 'dial') === body && body.querySelector('.dial-shown').textContent === '3');
    t.check('and the undo reached onChange', m.changes.at(-1).via, 'undo');

    m.editor.setReadOnly({ reason: 'Locked.' });
    t.ok('update sees read only', input.disabled === true);
    input.value = '9';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    t.check('read only: setConfig writes nothing', m.editor.getGraph().nodes.find((x) => x.id === 'dial').config, { value: 3 });
    m.editor.setReadOnly(false);

    let answer = null;
    const echo = { ...DIAL, type_id: 'echo', render() {}, update(_b, _n, ctx) { if (answer === null) answer = ctx.setConfig({ value: 1 }); } };
    const e = mount([...PLAIN, echo], { nodes: [{ id: 'echo', type: 'echo', config: {}, position: { x: 0, y: 0 } }], connections: [] });
    t.ok('a setConfig from inside update is refused and records nothing', answer === false && e.editor.history.depth === 0
         && e.changes.length === 0);

    let held = null;
    const grab = { ...DIAL, type_id: 'grab', render(_b, _n, ctx) { held = ctx; }, update() {} };
    const g = mount([...PLAIN, grab], { nodes: [{ id: 'grab', type: 'grab', config: { value: 3 }, position: { x: 0, y: 0 } }], connections: [] });
    // Both orders: the bad key sorting first, and a good key sorting before it.
    let threw = false;
    const bad = [];
    for (const patch of [{ ok: 1, bad: () => 0 }, { a: 1, b: () => 0 }]) {
        try { bad.push(held.setConfig(patch)); } catch { threw = true; }
    }
    t.ok('a patch holding a value that cannot be cloned is refused', threw === false && bad.every((x) => x === false));
    t.check('and changes nothing: the config is as it was', g.editor.getGraph().nodes.find((x) => x.id === 'grab').config, { value: 3 });
    t.check('no undo entry', g.editor.history.depth, 0);
    t.check('no onChange', g.changes.length, 0);
    t.ok('a good patch after it still lands as one entry', held.setConfig({ ok: 1 }) === true && g.editor.history.depth === 1
         && g.editor.getGraph().nodes.find((x) => x.id === 'grab').config.ok === 1 && g.changes.length === 1);
}

t.section('§4 a custom size and an accent');
{
    const m = mount([...PLAIN, DIAL]);
    const n = nodeEl(m, 'dial');
    t.check('the node is the type\'s box', [n.style.width, n.style.height], ['260px', '150px']);
    t.ok('marked sized and in its accent', n.classList.contains('twm-flow-graph__node--sized') && n.dataset.accent === 'teal');
    const cat = createStepCatalogue([...PLAIN, DIAL]);
    const dial = GRAPH.nodes[1];
    t.check('an output is anchored at the node\'s own width', canvasPortAnchor(cat, dial, 'b', 'output').x, 400 + 260);
    t.check('an input at its left edge', canvasPortAnchor(cat, dial, 'in', 'input').x, 400);
    const lines = [...m.el.querySelectorAll('path.twm-flow-graph__edge')];
    t.check('both lines are drawn', lines.length, 2);
    const byId = new Map(GRAPH.nodes.map((x) => [x.id, x]));
    const off = GRAPH.connections.map((c, i) => {
        const { from, to } = ends(lines[i]);
        const a = canvasPortAnchor(cat, byId.get(c.source), c.sourcePort, 'output');
        const b = canvasPortAnchor(cat, byId.get(c.target), c.targetPort, 'input');
        return Math.max(Math.abs(from.x - a.x), Math.abs(from.y - a.y), Math.abs(to.x - b.x), Math.abs(to.y - b.y));
    });
    t.ok('every line starts and ends on its ports\' anchors', off.every((d) => d < 1), JSON.stringify(off));

    const bad = createStepCatalogue([
        { type_id: 'a', size: { w: -1 } }, { type_id: 'b', size: 'big' }, { type_id: 'c', accent: 'pink' },
        { type_id: 'd', render: 'draw' }, { type_id: 'e', size: { h: 90 }, accent: 'amber' },
    ]);
    t.check('a bad size, accent or hook is a problem, and is not used',
            bad.problems.map((p) => p.type_id), ['a', 'b', 'c', 'd']);
    t.ok('…and nothing of it is used', bad.size('a') === null && bad.size('b') === null && bad.accent('c') === null
         && bad.body('d') === null);
    t.ok('a good one is', bad.size('e').h === 90 && bad.size('e').w === null && bad.accent('e') === 'amber');
}

t.section('§5 a type registered after load');
{
    const late = { type_id: 'late', label: 'Late arrival', category: 'control', size: { w: 240 },
                   ports: [F('in', 'input'), F('out', 'output')],
                   render(body) { body.append(Object.assign(document.createElement('b'), { className: 'late-mark', textContent: 'late' })); } };
    const graph = { nodes: [{ id: 'step', type: 'step', config: {}, position: { x: 0, y: 0 } },
                            { id: 'late', type: 'late', config: { k: 1 }, position: { x: 320, y: 0 } }],
                    connections: [{ source: 'step', target: 'late', sourcePort: 'out', targetPort: 'in' }] };
    const m = mount(PLAIN, graph);
    const text = m.editor.serialise();
    t.ok('before: not in the palette, and its node says the type is unknown', paletteItem(m, 'late') === null
         && nodeEl(m, 'late').textContent.includes('There is no step type "late".'));
    m.editor.setCatalogue(createStepCatalogue([...PLAIN, late], { categories: CATEGORIES }));
    t.ok('after: it is in the palette', paletteItem(m, 'late')?.textContent.includes('Late arrival'));
    t.ok('its node draws, with its body and its box, without a reload', bodyOf(m, 'late')?.querySelector('.late-mark') !== null
         && !nodeEl(m, 'late').textContent.includes('There is no step type') && nodeEl(m, 'late').style.width === '240px');
    t.ok('the graph and the history are untouched', m.editor.serialise() === text && m.editor.history.depth === 0
         && m.changes.length === 0);
    t.ok('the line into it is still drawn', m.el.querySelectorAll('path.twm-flow-graph__edge').length === 1);
    m.editor.setCatalogue([...PLAIN, late]);
    t.ok('a raw list of types is taken as well', paletteItem(m, 'late') !== null);
    paletteItem(m, 'late').click();
    t.ok('and a step of it can be added from the palette', m.editor.getGraph().nodes.filter((x) => x.type === 'late').length === 2
         && m.editor.history.depth === 1);
    t.throws('a catalogue that is not one is refused', () => m.editor.setCatalogue({}), /step catalogue/);
}
{
    // The same catalogue object handed back: no node is rebuilt.
    const cat = createStepCatalogue([...PLAIN, DIAL], { categories: CATEGORIES });
    const host = t.host();
    const editor = createCanvasEditor(host, { catalogue: cat });
    mounted.push(editor);
    editor.load({ graph: structuredClone(GRAPH) });
    const m = { el: editor.el };
    const before = [nodeEl(m, 'start'), nodeEl(m, 'dial'), bodyOf(m, 'dial')];
    calls.render = 0;
    editor.setCatalogue(cat);
    t.ok('the same types again rebuild no node and render no body again',
         nodeEl(m, 'start') === before[0] && nodeEl(m, 'dial') === before[1] && bodyOf(m, 'dial') === before[2]
         && calls.render === 0);
    // A NEW catalogue of the same types plus one more: the README's own
    // registration call. Nothing is rebuilt, and the input being typed into
    // keeps its focus and its value.
    const input = bodyOf(m, 'dial').querySelector('.dial-value');
    input.focus();
    input.value = '42';
    const added = { type_id: 'extra', label: 'Extra', category: 'control', ports: [] };
    editor.setCatalogue(createStepCatalogue([...PLAIN, DIAL, added], { categories: CATEGORIES }));
    t.ok('a new catalogue of the same types plus one keeps every node and body (===) and renders no body again',
         nodeEl(m, 'start') === before[0] && nodeEl(m, 'dial') === before[1] && bodyOf(m, 'dial') === before[2]
         && nodeEl(m, 'step') !== null && calls.render === 0);
    t.ok('…the typed-into input keeps its focus and its value',
         document.activeElement === input && input.value === '42');
    t.ok('…and the new type is in the palette', paletteItem(m, 'extra')?.textContent.includes('Extra'));
    // Equal copies of the types (new objects, same functions) are the same build too.
    editor.setCatalogue(createStepCatalogue([...PLAIN, DIAL, added].map((x) => ({ ...x, ports: x.ports.map((p) => ({ ...p })) })),
                                            { categories: CATEGORIES }));
    t.ok('equal copies of the definitions rebuild nothing', nodeEl(m, 'dial') === before[1] && calls.render === 0);
    // A new size or accent is applied in place.
    editor.setCatalogue(createStepCatalogue([...PLAIN, { ...DIAL, size: { w: 300, h: 160 }, accent: 'amber' }],
                                            { categories: CATEGORIES }));
    t.ok('a new size and accent are applied without a rebuild', nodeEl(m, 'dial') === before[1] && calls.render === 0
         && nodeEl(m, 'dial').style.width === '300px' && nodeEl(m, 'dial').style.height === '160px'
         && nodeEl(m, 'dial').dataset.accent === 'amber');
    // A definition that did change rebuilds that node, and only that one.
    editor.setCatalogue(createStepCatalogue([...PLAIN.map((x) => (x.type_id === 'step' ? { ...x, label: 'Renamed' } : x)), DIAL],
                                            { categories: CATEGORIES }));
    t.ok('a changed label rebuilds that node only', nodeEl(m, 'step').textContent.includes('Renamed')
         && nodeEl(m, 'start') === before[0] && nodeEl(m, 'dial') === before[1]);
    const stepBefore = nodeEl(m, 'step');
    editor.setCatalogue(createStepCatalogue([...PLAIN.map((x) => (x.type_id === 'step'
        ? { ...x, label: 'Renamed', ports: [...x.ports, F('extra', 'output')] } : x)), DIAL], { categories: CATEGORIES }));
    t.ok('a changed port list rebuilds that node', nodeEl(m, 'step') !== stepBefore
         && nodeEl(m, 'step').querySelectorAll('.twm-flow-graph__port').length === 3 && nodeEl(m, 'dial') === before[1]);
    editor.setCatalogue(createStepCatalogue([...PLAIN, { ...DIAL, render(body, node, ctx) { DIAL.render(body, node, ctx); } }],
                                            { categories: CATEGORIES }));
    t.ok('a new render function rebuilds that node and renders its body again',
         nodeEl(m, 'dial') !== before[1] && bodyOf(m, 'dial') !== before[2] && calls.render === 1);
}

t.section('§6 a render that throws');
{
    const broken = { ...DIAL, type_id: 'broken', label: 'Broken', size: undefined, accent: undefined,
                     render() { throw new Error('no canvas for the gauge'); }, update() { throw new Error('never called'); } };
    const graph = { nodes: [...GRAPH.nodes, { id: 'broken', type: 'broken', config: {}, position: { x: 400, y: 400 } }],
                    connections: [...GRAPH.connections, { source: 'broken', target: 'step', sourcePort: 'a', targetPort: 'in' }] };
    let m;
    try { m = mount([...PLAIN, DIAL, broken], graph); } catch (err) { m = null; t.ok(`load did not throw (${err.message})`, false); }
    if (m) {
        const n = nodeEl(m, 'broken');
        const plain = mount([...PLAIN, { ...broken, render: undefined, update: undefined }], graph);
        t.ok('the node is drawn', n !== null && n.querySelectorAll('.twm-flow-graph__port').length === 3);
        t.ok('with the default body: none of its own', bodyOf(m, 'broken') === null);
        t.check('…the same rows as a type with no render', n.querySelectorAll('.twm-flow-graph__node-row').length,
                nodeEl(plain, 'broken').querySelectorAll('.twm-flow-graph__node-row').length);
        t.ok('marked in error, with the reason on it', n.classList.contains('twm-flow-graph__node--error')
             && n.querySelector('.twm-flow-graph__node-findings').textContent
                 === 'Broken could not draw its body: no canvas for the gauge');
        const strip = m.el.querySelector('.twm-flow-strip');
        t.ok('and in the strip', !strip.hidden && strip.textContent.includes('Broken could not draw its body'));
        t.ok('every other node still draws, with its own body', bodyOf(m, 'dial') !== null && nodeEl(m, 'step') !== null
             && nodeEl(m, 'start') !== null);
        t.check('every line is drawn', m.el.querySelectorAll('path.twm-flow-graph__edge').length, 3);
        m.editor.setFindings([{ code: 'mine', message: 'Nothing ends this flow.', severity: 'error' }]);
        t.ok('the consumer\'s findings stand beside it', strip.textContent.includes('Nothing ends this flow.')
             && strip.textContent.includes('Broken could not draw its body'));
        t.check('nothing was recorded', [m.editor.history.depth, m.changes.length], [0, 0]);
        m.editor.setCatalogue(createStepCatalogue([...PLAIN, DIAL, { ...broken, render(body) { body.textContent = 'fixed'; },
                                                                     update() {} }], { categories: CATEGORIES }));
        t.ok('a fixed type draws its body and the finding goes', bodyOf(m, 'broken')?.textContent === 'fixed'
             && !strip.textContent.includes('could not draw') && strip.textContent.includes('Nothing ends this flow.')
             && !nodeEl(m, 'broken').classList.contains('twm-flow-graph__node--error'));
    }
    const flaky = { ...DIAL, type_id: 'flaky', label: 'Flaky', render() {}, update(_b, node) { if (node.config.bad) throw new Error('bad value'); } };
    const f = mount([...PLAIN, flaky], { nodes: [{ id: 'flaky', type: 'flaky', config: { bad: true }, position: { x: 0, y: 0 } }], connections: [] });
    t.ok('an update that throws keeps the body and says so', bodyOf(f, 'flaky') !== null
         && nodeEl(f, 'flaky').textContent.includes('Flaky could not bring its body up to date: bad value'));
    f.editor.load({ graph: { nodes: [{ id: 'flaky', type: 'flaky', config: {}, position: { x: 0, y: 0 } }], connections: [] } });
    t.ok('…and the finding goes once it succeeds', !nodeEl(f, 'flaky').textContent.includes('could not')
         && f.el.querySelector('.twm-flow-strip').hidden);
}

t.section('§7 the geometry');
{
    const cat = createStepCatalogue([...PLAIN, DIAL, { type_id: 'tall', size: { h: 300 }, ports: [F('in', 'input')] }]);
    t.check('canvasNodeWidth: the type\'s own, else the box\'s', [canvasNodeWidth(cat, { type: 'dial' }),
            canvasNodeWidth(cat, { type: 'step' }), canvasNodeWidth(cat, { type: 'tall' })], [260, CANVAS_NODE.width, CANVAS_NODE.width]);
    t.check('canvasNodeBottom: a type with size.h is exactly that tall',
            canvasNodeBottom(cat, { type: 'tall', position: { x: 0, y: 40 } }), 340);
    t.check('…and one without is the arithmetic box as before',
            canvasNodeBottom(cat, { type: 'step', position: { x: 0, y: 40 } }), 40 + CANVAS_NODE.header + CANVAS_NODE.row + 12);
    const g = { nodes: [{ id: 'a', type: 'step', position: { x: 0, y: 0 } }, { id: 'b', type: 'dial', position: { x: 0, y: 0 } },
                        { id: 'c', type: 'step', position: { x: 0, y: 0 } }],
                connections: [{ source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' },
                              { source: 'b', target: 'c', sourcePort: 'a', targetPort: 'in' }] };
    const plainAt = arrangeCanvasGraph({ ...g, nodes: g.nodes.map((n) => ({ ...n, type: 'step' })) }, cat);
    const at = arrangeCanvasGraph(g, cat);
    t.ok('Arrange spaces its columns by the widest node', at.get('b').x - at.get('a').x > plainAt.get('b').x - plainAt.get('a').x
         && at.get('b').x - at.get('a').x >= 260);
    t.ok('…so a wide node does not reach the next column', at.get('c').x - at.get('b').x > 260);
}

for (const ed of mounted) ed.destroy();
t.done();
