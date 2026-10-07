/**
 * The flow-editor kit's demo page (36 §8): the settings panel on the mocks'
 * "Send the invitation" step, the findings strip, the step picker, *Insert a
 * value* fed by `alwaysBefore`, undo and redo over the step, and spike S-chip
 * — the kit's chip input beside a naive `contenteditable` whose chips are NOT
 * `contenteditable="false"`.
 *
 * Everything here is the demo's own data in the demo's own words. The kit
 * names none of it: the step types, the reference scopes (`steps.`, `row.`,
 * `run.`), the values each step offers and every finding are handed in, as a
 * consumer would. `window.__flowDemo` is what `flow_kit_probe.mjs` reads.
 */
import {
    alwaysBefore, bindFlowKeys, button, createChipInput, createFindingsStrip, createReferenceSyntax,
    createSettingsPanel, createStepCatalogue, createWidgetRegistry, enclosingArms, enclosingLoops, FlowHistory,
    FORMULA_REFERENCES, openStepPicker, TEMPLATE_REFERENCES,
} from '../flow.js';

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const HTTP_SCHEMA = {
    type: 'object', required: ['url'], properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET', title: 'Method' },
        url: { type: 'string', 'x-ui-widget': 'template', title: 'Url',
               'x-ui-placeholder': 'Type an address, or insert a value' },
        headers: { type: 'object', 'x-ui-widget': 'key-value-map', 'x-ui-add-label': 'Add header',
                   description: 'A value may come from a vault; the secret never appears in a run\'s record.' },
        body: { type: ['string', 'object', 'array'], 'x-ui-widget': 'json-body', title: 'Body',
                description: 'JSON. A value that is exactly one reference keeps its type.',
                'x-ui-when': { field: 'method', in: ['POST', 'PUT'] } },
        timeout_seconds: { type: 'integer', minimum: 1, maximum: 300, default: 30, title: 'Timeout (seconds)' },
        tags: { type: 'array', 'x-ui-widget': 'enum-chips', title: 'Columns to update',
                items: { type: 'string', enum: ['name', 'email', 'programme'],
                         'x-ui-enum-labels': { name: 'Name', email: 'Email', programme: 'Programme' } },
                description: 'Empty updates every mapped column.' },
        retry: { type: 'object', title: 'Retries', 'x-ui-fold': true, properties: {
            max_attempts: { type: 'integer', minimum: 1, title: 'Attempts' },
            backoff: { type: 'string', enum: ['fixed', 'doubling'], title: 'Backoff' } } },
    },
};
const TYPES = [
    { type_id: 'start', label: 'Start', role: 'start', category: 'control', icon: 'play_arrow', ports: [F('out', 'output')] },
    { type_id: 'http-request', label: 'HTTP request', role: 'step', category: 'integration', icon: 'public',
      description: 'Calls an address on the web and hands its answer to the steps after it.',
      ports: [F('in', 'input', { multiple: true }), F('out', 'output'), F('error', 'output', { label: 'Error' }),
              { name: 'response', direction: 'output', port_type: 'DATA', label: 'Response' }],
      config_schema: HTTP_SCHEMA },
    { type_id: 'upsert-rows', label: 'Insert or update rows', category: 'data', icon: 'sync',
      ports: [F('in', 'input', { multiple: true }), F('out', 'output')] },
    { type_id: 'condition', label: 'Condition', role: 'branch', category: 'control', icon: 'call_split',
      ports: [F('in', 'input'), F('true', 'output'), F('false', 'output')] },
    { type_id: 'loop-over-rows', label: 'Loop over rows', role: 'loop', category: 'control', icon: 'repeat',
      ports: [F('in', 'input'), F('next', 'input', { multiple: true }), F('body', 'output'), F('done', 'output')] },
    { type_id: 'log', label: 'Log', category: 'utility', icon: 'notes', ports: [F('in', 'input', { multiple: true }), F('out', 'output')] },
    { type_id: 'end', label: 'End', role: 'end', category: 'control', icon: 'flag', ports: [F('in', 'input', { multiple: true })] },
];
const CATEGORIES = [
    { id: 'control', label: 'Flow', tone: 'violet' }, { id: 'data', label: 'Data', tone: 'teal', layout: 'grid' },
    { id: 'integration', label: 'Integration', tone: 'amber', layout: 'grid' },
    { id: 'utility', label: 'Utility', tone: 'grey', layout: 'grid' },
];
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES });
const node = (id, type, label, config = {}) => ({ id, type, label, config, position: { x: 0, y: 0 } });
const edge = (source, target, sourcePort = 'out', targetPort = 'in') => ({ source, target, sourcePort, targetPort });
const graph = {
    nodes: [node('start', 'start', 'Start'), node('fetch', 'http-request', 'Fetch new applications', { url: 'https://portal.example.org/api/applications?since=${run.since}' }),
            node('portaldown', 'end', 'Stop: the portal is down'), node('save', 'upsert-rows', 'Save the applications'),
            node('anynew', 'condition', 'Anything new?'), node('each', 'loop-over-rows', 'For each new application'),
            node('check', 'http-request', 'Check eligibility', { method: 'POST', url: 'https://eligibility.example.org/v1/check' }),
            node('checkfail', 'log', 'Note it and move on'),
            node('invite', 'http-request', 'Send the invitation', { method: 'POST',
                 body: { to: '${row.email}', template: 'interview-invite' }, headers: { Accept: 'application/json', Retries: 3 } }),
            node('nothing', 'end', 'Stop: nothing new')],
    connections: [edge('start', 'fetch'), edge('fetch', 'portaldown', 'error'), edge('fetch', 'save'), edge('save', 'anynew'),
                  edge('anynew', 'each', 'true'), edge('anynew', 'nothing', 'false'), edge('each', 'check', 'body'),
                  edge('check', 'checkfail', 'error'), edge('checkfail', 'each', 'out', 'next'), edge('check', 'invite'),
                  edge('invite', 'each', 'out', 'next')],
};
const byId = (id) => graph.nodes.find((n) => n.id === id);

// ── what each step offers to read, in the demo's words ──────────────────
const ROW = [['Applicant id', 'text', 'applicant_id'], ['Name', 'text', 'name'], ['Email', 'text', 'email'],
             ['Programme', 'choice', 'programme'], ['Status', 'choice', 'status'], ['Its position', 'number', 'index']];
const OFFERS = {
    'http-request': (id) => [{ label: 'status code', ref: `\${steps.${id}.status_code}` },
                             { label: 'body', ref: `\${steps.${id}.body}`, children: [
                                 { label: 'items', ref: `\${steps.${id}.body.items}` },
                                 { label: 'total', ref: `\${steps.${id}.body.total}` }] },
                             { label: 'content type', ref: `\${steps.${id}.content_type}` }],
    'upsert-rows': (id) => ['inserted', 'updated', 'row_ids', 'skipped', 'quarantined']
        .map((k) => ({ label: k.replace('_', ' '), ref: `\${steps.${id}.${k}}` })),
};
// A step that FAILED hands on its error output and nothing else: on a failure
// its data output is empty.
const ERROR_OUTPUT = (id) => [{ label: 'error', ref: `\${steps.${id}.error}`, children: [
    { label: 'code', ref: `\${steps.${id}.error.code}` },
    { label: 'message', ref: `\${steps.${id}.error.message}` }] }];
async function values({ stepId }) {
    const before = alwaysBefore(graph, catalogue, stepId);
    const loops = enclosingLoops(graph, catalogue, stepId);
    // The steps whose error arm this one is in: they ran and failed (36 §3.7).
    const failed = new Set(enclosingArms(graph, catalogue, stepId).filter((a) => a.port === 'error').map((a) => a.head));
    const groups = loops.map((loopId) => ({
        id: `row:${loopId}`, label: 'This row', sub: byId(loopId).label, layout: 'grid',
        items: ROW.map(([label, type, key]) => ({ label, type, ref: `\${row.${key}}` })) }));
    before.forEach((id, i) => {
        const n = byId(id);
        const offer = failed.has(id) ? ERROR_OUTPUT : OFFERS[n.type];
        const sub = failed.has(id) ? 'it failed: its error only' : i === 0 ? 'the step before this one' : '';
        if (offer) groups.push({ id, label: n.label, sub, items: offer(id) });
    });
    if (before.includes('start')) groups.push({ id: 'run', label: 'Run input', items: [{ label: 'since', ref: '${run.since}' }] });
    groups.push({ id: 'vars', label: 'Variables', items: [], empty: 'none yet; a Set variable step makes them.' });
    return { groups, note: 'Only steps that always run before this one are listed — not “Stop: the portal is down”.' };
}

// The demo's reading of its own references, for the chips.
const ROW_WORDS = Object.fromEntries(ROW.map(([label, , key]) => [key, label]));
const refs = createReferenceSyntax({
    name: 'template', pattern: TEMPLATE_REFERENCES.pattern, format: TEMPLATE_REFERENCES.format, stepScope: 'steps',
    describe: (m) => {
        const [scope, ...rest] = m.path.split('.');
        if (scope === 'row' && ROW_WORDS[rest[0]]) return { label: `This row › ${ROW_WORDS[rest[0]]}`, tone: 'blue' };
        if (scope === 'run') return { label: `Run input › ${rest.join(' › ')}`, tone: 'blue' };
        if (scope === 'steps' && byId(rest[0])) return { label: [byId(rest[0]).label, ...rest.slice(1)].join(' › '), tone: 'blue' };
        if (scope === 'vault') return { label: `Vault · ${rest.join(' ')}`, tone: 'amber' };
        return { label: m.path, known: false };
    },
});

// ── the page ────────────────────────────────────────────────────────────
const root = document.getElementById('demo');
const bar = document.getElementById('bar');
const status = document.createElement('span');
status.className = 'demo__status';
let selected = 'invite';
const snapshot = () => JSON.stringify(graph.nodes.map((n) => [n.id, n.label, n.config]));
const history = new FlowHistory({
    actions: ['flow:step:config', 'flow:step:label'],
    restore: (state) => {
        for (const [id, label, config] of JSON.parse(state)) Object.assign(byId(id), { label, config });
        showPanel();
    },
    onState: () => paintBar(),
});
const undoBtn = button({ label: 'Undo', icon: 'undo', title: 'Undo (Ctrl+Z)', onClick: () => history.undo() });
const redoBtn = button({ label: 'Redo', icon: 'redo', title: 'Redo (Ctrl+Y)', onClick: () => history.redo() });
undoBtn.dataset.action = 'undo';
redoBtn.dataset.action = 'redo';
bar.append(undoBtn, redoBtn, status);
function paintBar() {
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
    status.textContent = `${history.depth} edit${history.depth === 1 ? '' : 's'} to undo · nothing is saved: a demo`;
}

const strip = createFindingsStrip({ nameOf: (id) => byId(id)?.label || '', onGoTo: (f) => {
    selected = f.node_id || selected;
    showPanel();
    panel.focusField(f.field || '');
} });
document.getElementById('strip').appendChild(strip.el);
let findings = [{ code: 'required', message: 'Url needs a value.', severity: 'error', node_id: 'invite', field: 'url' },
                { code: 'timeout', message: 'A timeout over 60 seconds holds a worker.', severity: 'warning', node_id: 'invite',
                  field: 'timeout_seconds' }];

const widgets = createWidgetRegistry();
const panel = createSettingsPanel({
    widgets, references: { template: refs, formula: FORMULA_REFERENCES }, values,
    host: document.getElementById('panel-host'),
    onChange: (id, key, value) => {
        const n = byId(id);
        if (value === undefined) delete n.config[key]; else n.config[key] = value;
        history.commit(snapshot(), 'flow:step:config', `config:${id}:${key}`);
        findings = findings.filter((f) => !(f.node_id === id && f.field === key && key === 'url' && value));
        strip.set(findings);
        panel.setFindings(findings);
    },
    onRename: (id, label) => {
        const n = byId(id);
        if (label) n.label = label; else delete n.label;
        history.commit(snapshot(), 'flow:step:label', `label:${id}`);
    },
    onFocusLost: () => document.getElementById('side').focus(),
});
let failArm = 'fail';
function showPanel() {
    const n = byId(selected);
    const type = catalogue.get(n.type);
    panel.show({
        step: n, type, title: n.label, typeLabel: type.label, icon: type.icon, tone: catalogue.tone(n.type),
        where: 'Inside Anything new? › Then › For each new application', description: type.description,
        idLine: `Later steps read it as \${steps.${n.id}.…}`, rename: true,
        extra: [{ key: 'arm:error', after: 'body', value: failArm, set: (v) => { failArm = v; },
                  spec: { type: 'string', enum: ['fail', 'arm'], title: 'If the request fails', 'x-ui-widget': 'choice-cards',
                          'x-ui-enum-labels': { fail: 'Fail the run', arm: 'Run the steps under “If the request fails”' },
                          'x-ui-enum-descriptions': { arm: 'Inside a loop, those steps may go on with the next row.' } } }],
        actions: [{ id: 'duplicate', label: 'Duplicate', icon: 'content_copy', run: () => { status.textContent = 'Duplicate (a demo: nothing happens)'; } },
                  { id: 'remove', label: 'Remove step', icon: 'delete', danger: true, disabled: true,
                    reason: 'The demo keeps its one step.' }],
    });
    panel.setFindings(findings);
}
showPanel();
strip.set(findings);
history.baseline(snapshot());

const add = document.getElementById('add');
add.addEventListener('click', async () => {
    const entries = [
        { id: 'if', label: 'If … otherwise', sub: 'Condition', description: 'Ask a yes-or-no question; run one set of steps or the other.',
          category: 'control', tone: 'violet', icon: 'call_split' },
        { id: 'loop', label: 'For each row', sub: 'Loop over rows', description: 'Run the steps inside it once for every row of a table.',
          category: 'control', tone: 'violet', icon: 'repeat' },
        { id: 'parallel', label: 'At the same time', sub: 'Parallel + Merge', description: 'Run branches side by side, then wait for them.',
          category: 'control', tone: 'violet', icon: 'alt_route' },
        { id: 'end', label: 'End the run', sub: 'End', description: 'Stop here, as a success or a failure.', category: 'control',
          tone: 'violet', icon: 'flag', refusal: 'Something follows this place, and nothing may follow an End.' },
        ...['Read rows', 'Insert rows', 'Insert or update rows', 'Delete rows', 'Set variable'].map((label, i) => ({
            id: `data-${i}`, label, category: 'data', tone: 'teal', icon: ['table', 'add_box', 'sync', 'delete', 'data_object'][i] })),
        { id: 'http-request', label: 'HTTP request', category: 'integration', tone: 'amber', icon: 'public' },
        { id: 'log', label: 'Log', category: 'utility', tone: 'grey', icon: 'notes' },
    ];
    const r = await openStepPicker({ anchor: add, entries, categories: CATEGORIES, paste: {},
                                     where: 'inside For each new application, after Check eligibility' });
    status.textContent = r?.entry ? `Picked: ${r.entry.label}` : r?.paste ? 'Picked: paste' : 'Picker closed';
});

bindFlowKeys(root, { undo: () => history.undo(), redo: () => history.redo(), escape: () => {} });

// ── spike S-chip ────────────────────────────────────────────────────────
const spikeOut = document.getElementById('spike-out');
const spike = createChipInput({
    value: 'Hi ${row.name}, see ${steps.check.body}', syntaxes: [refs], label: 'Spike', placeholder: 'Type',
    onInput: (v) => { spikeOut.textContent = JSON.stringify(v); },
});
spike.el.id = 'spike';
const spikeBox = document.createElement('div');
spikeBox.className = 'twm-flow-refbox';
spikeBox.appendChild(spike.el);
document.getElementById('spike-host').appendChild(spikeBox);
spikeOut.textContent = JSON.stringify(spike.getValue());
const naive = document.getElementById('naive');
naive.innerHTML = 'Hi <span class="twm-flow-chip twm-flow-chip--blue" data-ref="${row.name}">This row › Name</span>, see';
const naiveOut = document.getElementById('naive-out');
const readNaive = () => [...naive.childNodes].map((n) => (n.nodeType === 3 ? n.data
    : n.dataset?.ref !== undefined ? (n.textContent === 'This row › Name' ? n.dataset.ref : `«broken chip: ${n.textContent}»`)
        : n.textContent)).join('');
naive.addEventListener('input', () => { naiveOut.textContent = JSON.stringify(readNaive()); });
naiveOut.textContent = JSON.stringify(readNaive());

window.__flowDemo = { panel, history, spike, naive, readNaive, graph, strip, catalogue, ready: true };
