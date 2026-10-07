/**
 * The canvas editor's demo page (36 §8): the mocks' "Sync applications from
 * the portal" flow drawn as nodes and lines — a request whose error port ends
 * the run, a condition, a loop whose body goes back round, a log — with the
 * consumer's verbs (Validate draws findings, Run draws a run on the canvas),
 * the flow's own settings, *Insert a value*, and a status line.
 *
 * Everything here is the demo's own data in the demo's own words; the editor
 * names none of it. Nothing is saved: `onChange` only counts.
 * `window.__flowCanvas` is what `flow_canvas_probe.mjs` reads.
 */
import {
    createCanvasEditor, createReferenceSyntax, createStepCatalogue, enclosingLoops, TEMPLATE_REFERENCES,
} from '../flow.js';

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const TYPES = [
    { type_id: 'start', label: 'Start', role: 'start', category: 'start', icon: 'play_arrow', ports: [F('out', 'output')] },
    { type_id: 'http-request', label: 'HTTP request', category: 'integration', icon: 'public',
      description: 'Calls an address on the web and hands its answer to the steps after it.',
      ports: [F('in', 'input', { multiple: true }), F('out', 'output'), F('error', 'output', { label: 'Error' }),
              { name: 'response', direction: 'output', port_type: 'DATA', label: 'Response' }],
      config_schema: { type: 'object', required: ['url'], properties: {
          method: { type: 'string', enum: ['GET', 'POST'], default: 'GET', title: 'Method' },
          url: { type: 'string', 'x-ui-widget': 'template', title: 'Url', 'x-ui-placeholder': 'Type an address, or insert a value' },
          timeout_seconds: { type: 'integer', minimum: 1, maximum: 300, default: 30, title: 'Timeout (seconds)' } } } },
    { type_id: 'upsert-rows', label: 'Insert or update rows', category: 'data', icon: 'sync',
      ports: [F('in', 'input', { multiple: true }), F('out', 'output'),
              { name: 'saved', direction: 'output', port_type: 'DATA', label: 'Saved' }],
      config_schema: { type: 'object', properties: { match_on: { type: 'string', title: 'Match on' } } } },
    { type_id: 'condition', label: 'Condition', role: 'branch', category: 'control', icon: 'call_split',
      ports: [F('in', 'input'), F('true', 'output', { label: 'True' }), F('false', 'output', { label: 'False' })],
      config_schema: { type: 'object', properties: { expression: { type: 'string', 'x-ui-widget': 'expression', title: 'When' } } } },
    { type_id: 'loop-over-rows', label: 'Loop over rows', role: 'loop', category: 'control', icon: 'repeat',
      ports: [F('in', 'input'), F('next', 'input', { label: 'Next', multiple: true }), F('body', 'output', { label: 'Body' }),
              F('done', 'output', { label: 'Done' })] },
    { type_id: 'log', label: 'Log', category: 'utility', icon: 'notes', ports: [F('in', 'input', { multiple: true }), F('out', 'output')],
      config_schema: { type: 'object', properties: { message: { type: 'string', 'x-ui-widget': 'template', title: 'Message' } } } },
    { type_id: 'end', label: 'End', role: 'end', category: 'control', icon: 'flag', ports: [F('in', 'input', { multiple: true })],
      config_schema: { type: 'object', properties: { outcome: { type: 'string', enum: ['success', 'failed'], title: 'Outcome' } } } },
    { type_id: 'send-fax', label: 'Send a fax', category: 'integration', icon: 'fax', ports: [],
      unavailable: 'Send a fax arrives with the telephony steps.' },
];
const CATEGORIES = [
    { id: 'start', label: 'Start', tone: 'blue' }, { id: 'control', label: 'Flow', tone: 'violet' },
    { id: 'data', label: 'Data', tone: 'teal' }, { id: 'integration', label: 'Integration', tone: 'amber' },
    { id: 'utility', label: 'Utility', tone: 'grey' },
];
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES });
const node = (id, type, label, x, y, config = {}) => ({ id, type, label, config, position: { x, y } });
const edge = (source, target, sourcePort = 'out', targetPort = 'in') => ({ source, target, sourcePort, targetPort });
const GRAPH = {
    nodes: [node('start', 'start', 'Start', 48, 160),
            node('fetch', 'http-request', 'Fetch new applications', 320, 160, { url: 'https://portal.example.org/api/applications?since=${run.since}' }),
            node('portaldown', 'end', 'Stop: the portal is down', 608, 352, { outcome: 'failed' }),
            node('save', 'upsert-rows', 'Save the applications', 608, 160),
            node('anynew', 'condition', 'Anything new?', 896, 160),
            node('each', 'loop-over-rows', 'For each new application', 1184, 96),
            node('note', 'log', 'Note it', 1472, 96, { message: 'Seen ${row.email}' }),
            node('nothing', 'end', 'Stop: nothing new', 1184, 352)],
    connections: [edge('start', 'fetch'), edge('fetch', 'portaldown', 'error'), edge('fetch', 'save'), edge('save', 'anynew'),
                  edge('anynew', 'each', 'true'), edge('anynew', 'nothing', 'false'), edge('each', 'note', 'body'),
                  edge('note', 'each', 'out', 'next')],
};
const refs = createReferenceSyntax({
    name: 'template', pattern: TEMPLATE_REFERENCES.pattern, format: TEMPLATE_REFERENCES.format, stepScope: 'steps',
    describe: (m) => ({ label: m.path.split('.').join(' › '), tone: 'blue' }),
});

let changes = 0;
const host = document.getElementById('host');
const editor = createCanvasEditor(host, {
    catalogue, references: { template: refs },
    label: 'Sync applications from the portal',
    strings: { returnLine: 'Back to the loop for the next row', connectedReturn: 'Continues with the next row.' },
    dataPortRead: (n, p) => refs.format(`steps.${n.id}.${p.name}`),
    summariseReads: (n) => `Later steps read it as ${refs.format(`steps.${n.id}.…`)}`,
    flowSettings: { title: 'Sync applications from the portal', value: { name: 'Sync applications from the portal' },
                    schema: { type: 'object', required: ['name'], properties: {
                        name: { type: 'string', title: 'Name' },
                        description: { type: 'string', title: 'Description', 'x-ui-multiline': true } } } },
    values: async ({ stepId, graph, before }) => {
        const loops = enclosingLoops(graph, catalogue, stepId);
        const groups = loops.map((id) => ({ id: `row:${id}`, label: 'This row', items: [{ label: 'email', ref: '${row.email}' },
                                                                                       { label: 'name', ref: '${row.name}' }] }));
        for (const id of before) {
            const n = graph.nodes.find((x) => x.id === id);
            if (n?.type === 'http-request') groups.push({ id, label: n.label, items: [{ label: 'status code', ref: `\${steps.${id}.status_code}` }] });
        }
        return { groups, note: 'Only steps that always run before this one are listed.' };
    },
    actions: [
        { id: 'validate', label: 'Validate', icon: 'rule', run: (ed) => {
            ed.setFindings([{ code: 'required', message: 'Url needs a value.', severity: 'error', node_id: 'fetch', field: 'url' },
                            { code: 'no_end', message: 'Nothing ends the loop\'s Done.', severity: 'warning' }]);
            ed.setMessage('2 things to look at.', 'warning');
        } },
        { id: 'run', label: 'Run', icon: 'play_arrow', primary: true, run: (ed) => {
            ed.setRunOverlay({
                banner: 'Drawn on version 4, the version this run used.',
                steps: { start: { state: 'completed', line: 'completed' }, fetch: { state: 'completed', line: 'completed · 200' },
                         save: { state: 'completed', line: 'completed' }, anynew: { state: 'completed', line: 'true → Then' },
                         each: { state: 'completed', line: '63 rows · 1 page' }, note: { state: 'completed', line: 'completed ×63', tone: 'ok' },
                         nothing: { state: 'skipped', line: 'not reached' }, portaldown: { state: 'skipped', line: 'not reached' } },
                ports: { fetch: { out: { taken: true, count: 1 }, error: { taken: false } },
                         anynew: { true: { taken: true, count: 1 }, false: { taken: false } }, each: { body: { taken: true, count: 63 } } },
            });
        } },
    ],
    slots: { toolbarEnd: (box) => { const who = document.createElement('span'); who.className = 'demo__who'; who.textContent = 'Acts as the app Admissions bot'; box.appendChild(who); } },
    onChange: () => { changes += 1; editor.setStatus(`${changes} edit${changes === 1 ? '' : 's'} · nothing is saved: a demo`); },
});
editor.load({ graph: GRAPH });
editor.setStatus('nothing is saved: a demo');

window.__flowCanvas = { editor, get changes() { return changes; }, ready: true };
