/**
 * BUILDING A MODELER ON THE CANVAS EDITOR — the demo page that uses every
 * modeler option together (EPIC-0073): a small signal-flow diagram of
 * sources, gains, a sum and displays, wired by their data ports.
 *
 *   node bodies     a Gain draws its own slider (`render`/`update`, `size`,
 *                   `accent`) and writes through `ctx.setConfig`; a Display
 *                   draws its value large from `ctx.values`
 *   connections     `dataPorts: 'connect'` with typed ports (`provides`/
 *                   `accepts`), one line per input (`maxConnections`), and a
 *                   host `policy` that refuses a line feeding a block its own
 *                   output
 *   many picked     `multiSelect`: marquee, bulk move, align and distribute
 *   clipboard       `clipboard: true` and a `prepareCopy` that restarts a
 *                   copied source's phase
 *   groups, notes   `groups`, `notes`: the two sources are a group, and a note
 *                   says what to try
 *   layout          `layout: 'layered'` with the types' `rank` hints
 *   lines           `edgeStyle` (tone, dash, width, arrow, label),
 *                   `routing: 'obstacles'`, `hoverHighlight`
 *   viewport        `zoomControls`, `minimap`, and a viewport the PAGE keeps
 *                   (`onViewportChange`), reopened by its Reload verb
 *   in place        `renameInPlace`, and a source's amplitude `inline`
 *   live values     `setNodeValues` four times a second from the page's own
 *                   evaluation of the diagram, and `collapsible`
 *
 * Everything here is the page's own data in the page's own words; the editor
 * names none of it and stores nothing. `window.__flowModeler` is what
 * `flow_modeler_probe.mjs` and `tests/flow_modeler_demo.test.mjs` read.
 */
import { createCanvasEditor, createStepCatalogue } from '../flow.js';

/** A data port: every port in this diagram carries a number. */
const D = (name, direction, extra = {}) => ({ name, direction, port_type: 'DATA', ...extra });
const IN = (name, label) => D(name, 'input', { label, accepts: ['number'], maxConnections: 1 });
const OUT = D('out', 'output', { label: 'Out', provides: ['number'] });
const fmt = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : '—');

/** The gain's slider: built once, kept on every repaint, written through ctx. */
function renderGain(body, node, ctx) {
    const wrap = document.createElement('label');
    wrap.className = 'modeler-gain';
    const value = document.createElement('span');
    value.className = 'modeler-gain__value';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '-2';
    range.max = '2';
    range.step = '0.1';
    range.setAttribute('aria-label', 'Gain factor');
    range.addEventListener('change', () => ctx.setConfig({ k: Number(range.value) }));
    wrap.append(value, range);
    body.append(wrap);
}
function updateGain(body, node, ctx) {
    const k = node.config.k ?? 1;
    const range = body.querySelector('input');
    if (document.activeElement !== range) range.value = String(k);
    range.disabled = ctx.readOnly;
    body.querySelector('.modeler-gain__value').textContent = `× ${fmt(k)}`;
}
/** The display's readout: what the page last painted on it. */
function renderDisplay(body) {
    const out = document.createElement('output');
    out.className = 'modeler-readout';
    body.append(out);
}
function updateDisplay(body, node, ctx) {
    body.querySelector('output').textContent = ctx.values?.badge ?? '—';
}

const TYPES = [
    { type_id: 'source', label: 'Source', category: 'sources', icon: 'waves', rank: 'source', inline: ['amplitude'],
      description: 'A sine wave.',
      ports: [OUT],
      config_schema: { type: 'object', properties: {
          amplitude: { type: 'number', default: 1, title: 'Amplitude' },
          period: { type: 'number', minimum: 0.5, default: 4, title: 'Period (seconds)' },
          phase: { type: 'number', default: 0, title: 'Phase (radians)' } } } },
    { type_id: 'gain', label: 'Gain', category: 'blocks', icon: 'tune', accent: 'amber', size: { w: 224, h: 132 },
      description: 'Multiplies its input by a factor.',
      ports: [IN('in', 'In'), OUT], render: renderGain, update: updateGain,
      config_schema: { type: 'object', properties: { k: { type: 'number', default: 1, title: 'Factor' } } } },
    { type_id: 'sum', label: 'Sum', category: 'blocks', icon: 'add',
      description: 'Adds its two inputs, or takes the second from the first.',
      ports: [IN('a', 'A'), IN('b', 'B'), OUT],
      config_schema: { type: 'object', properties: {
          signs: { type: 'string', enum: ['++', '+-'], default: '++', title: 'Signs' } } } },
    { type_id: 'display', label: 'Display', category: 'displays', icon: 'monitor', rank: 'sink', accent: 'violet',
      size: { w: 200, h: 112 }, description: 'Shows its input.',
      ports: [IN('in', 'In')], render: renderDisplay, update: updateDisplay },
];
const CATEGORIES = [
    { id: 'sources', label: 'Sources', tone: 'teal' }, { id: 'blocks', label: 'Blocks', tone: 'amber' },
    { id: 'displays', label: 'Displays', tone: 'violet' },
];
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES });

const node = (id, type, label, x, y, config = {}) => ({ id, type, label, config, position: { x, y } });
const line = (source, target, targetPort = 'in') => ({ source, target, sourcePort: 'out', targetPort });
const GRAPH = {
    nodes: [node('wave', 'source', 'Fast wave', 64, 96, { amplitude: 1, period: 2 }),
            node('drift', 'source', 'Slow drift', 64, 384, { amplitude: 0.5, period: 9 }),
            node('scale', 'gain', 'Scale', 416, 96, { k: 1.5 }),
            node('mix', 'sum', 'Mix', 752, 240, { signs: '+-' }),
            node('scope', 'display', 'Scope', 1072, 224),
            node('meter', 'display', 'Meter', 1072, 448)],
    connections: [line('wave', 'scale'), line('scale', 'mix', 'a'), line('drift', 'mix', 'b'), line('mix', 'scope')],
    groups: [{ id: 'group', label: 'Inputs', tone: 'teal', nodes: ['wave', 'drift'] }],
    notes: [{ id: 'note', text: 'Drag Mix\'s Out onto Meter\'s In. Pick two blocks and press Ctrl+G; '
              + 'Ctrl+C and Ctrl+V copy them; Arrange lays the diagram out.', position: { x: 416, y: 560 } }],
};

/** Whether `to` is reached by following lines out of `from` (a line to=>from would close a loop). */
function reaches(graph, from, to) {
    const seen = new Set();
    const walk = (id) => {
        if (id === to) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return graph.connections.some((c) => c.source === id && walk(c.target));
    };
    return walk(from);
}

/** The page's own evaluation: every block's value at time `t` (seconds). */
function evaluate(graph, t) {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const into = new Map(graph.connections.map((c) => [`${c.target}:${c.targetPort}`, c.source]));
    const memo = new Map();
    const value = (id, visiting = new Set()) => {
        if (memo.has(id)) return memo.get(id);
        if (visiting.has(id)) return NaN;
        visiting.add(id);
        const n = byId.get(id);
        const input = (port) => (into.has(`${id}:${port}`) ? value(into.get(`${id}:${port}`), visiting) : NaN);
        const c = n?.config || {};
        let v = NaN;
        if (n?.type === 'source') v = (c.amplitude ?? 1) * Math.sin((2 * Math.PI * t) / Math.max(0.5, c.period ?? 4) + (c.phase ?? 0));
        else if (n?.type === 'gain') v = (c.k ?? 1) * input('in');
        else if (n?.type === 'sum') v = input('a') + ((c.signs ?? '++') === '+-' ? -1 : 1) * input('b');
        else if (n?.type === 'display') v = input('in');
        memo.set(id, v);
        return v;
    };
    return new Map(graph.nodes.map((n) => [n.id, value(n.id)]));
}

let changes = 0;
let views = 0;
let kept = null;                                  // the viewport, kept by the page, never by the editor
let ticks = 0;
let editor = null;
const host = document.getElementById('host');
const status = () => `${changes} edit${changes === 1 ? '' : 's'} · ${kept ? `${Math.round(kept.scale * 100)}%` : 'fitted'}`
    + ' · nothing is saved: a demo';
editor = createCanvasEditor(host, {
    catalogue,
    label: 'A signal-flow diagram',
    connections: {
        dataPorts: 'connect',
        policy: ({ connection, graph }) => (reaches(graph, connection.target, connection.source)
            ? { ok: false, reason: 'That line would feed a block its own output: signals here run one way.' } : null),
    },
    multiSelect: true,
    clipboard: true,
    prepareCopy: (copy) => { if (copy.type === 'source') copy.config.phase = 0; },
    groups: true,
    notes: true,
    layout: 'layered',
    edgeStyle: (c, { source, target }) => {
        const style = { marker: 'arrow', width: 2 };
        if (source.type === 'source') style.tone = 'teal';
        if (source.type === 'gain') { style.tone = 'amber'; style.label = `× ${fmt(source.config.k ?? 1)}`; }
        if (target.type === 'sum' && c.targetPort === 'b' && (target.config.signs ?? '++') === '+-') style.dashed = true;
        return style;
    },
    routing: 'obstacles',
    hoverHighlight: true,
    zoomControls: true,
    minimap: true,
    renameInPlace: true,
    collapsible: true,
    onViewportChange: (v) => { views += 1; kept = v; editor?.setStatus(status()); },
    onChange: () => { changes += 1; editor.setStatus(status()); },
    actions: [
        { id: 'reload', label: 'Reload', icon: 'refresh', title: 'Open the diagram again where you left the view',
          run: (ed) => ed.load({ graph: ed.getGraph() }, kept ? { viewport: kept } : {}) },
    ],
    slots: { toolbarEnd: (box) => { const who = document.createElement('span'); who.className = 'demo__who'; who.textContent = 'Live values from the page'; box.appendChild(who); } },
});
editor.load({ graph: GRAPH });
editor.setStatus(status());

/** Paint what the diagram computes now: a badge on every block, the value beside its output. */
function paint() {
    ticks += 1;
    const graph = editor.getGraph();
    const values = evaluate(graph, performance.now() / 1000);
    const shown = {};
    for (const [id, v] of values) {
        if (!Number.isFinite(v)) continue;
        shown[id] = { badge: fmt(v), tone: v < 0 ? 'amber' : 'teal',
                      ports: graph.nodes.find((n) => n.id === id).type === 'display' ? {} : { out: fmt(v) } };
    }
    editor.setNodeValues(shown);
}
paint();
let timer = setInterval(paint, 250);

window.__flowModeler = {
    editor, catalogue, types: TYPES, graph: GRAPH, evaluate,
    get changes() { return changes; }, get views() { return views; }, get viewport() { return kept; },
    get ticks() { return ticks; },
    stop() { clearInterval(timer); timer = null; },
    ready: true,
};
