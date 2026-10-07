/**
 * The outline editor's demo page (36 §6, §8): the mocks' "Sync applications
 * from the portal" drawn as an outline — blocks, arms, feet, folding, find,
 * "+" with the step picker, the step menu, the grip drag, the settings panel
 * with ports drawn as settings, *Insert a value* fed by the steps that always
 * run before, findings on the row, the field and the strip — and a run drawn
 * on it (the Run mock), and a flow that is not block-shaped, opened read-only.
 *
 * Everything here is the demo's own data in the demo's own words: the step
 * types, the reference scopes (`steps.`, `row.`, `run.`), the values each step
 * offers, every summary and every finding are handed in, as a consumer would.
 * `window.__outlineDemo` is what `flow_outline_probe.mjs` reads.
 */
import {
    createOutlineEditor, createReferenceSyntax, createStepCatalogue, createWidgetRegistry, FORMULA_REFERENCES,
    TEMPLATE_REFERENCES, el,
} from '../flow.js';

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', label: name, ...extra });
const D = (name, label) => ({ name, direction: 'output', port_type: 'DATA', label });
const IN = F('in', 'input', { multiple: true });
const OUT = F('out', 'output');
const RETRY = { type: 'object', title: 'Retries', 'x-ui-fold': true, properties: {
    max_attempts: { type: 'integer', minimum: 1, maximum: 10, title: 'Attempts' },
    backoff: { type: 'string', enum: ['fixed', 'doubling'], title: 'Backoff' } } };

const TYPES = [
    { type_id: 'start', label: 'Start', category: 'control', role: 'start', icon: 'play_arrow', ports: [OUT] },
    { type_id: 'end', label: 'End', category: 'control', role: 'end', icon: 'flag', ports: [IN],
      description: 'Ends the run here, as a success or a failure, and says what it returns.',
      config_schema: { type: 'object', properties: {
          outcome: { type: 'string', enum: ['success', 'failed'], default: 'success', title: 'Outcome' },
          message: { type: 'string', title: 'Message', 'x-ui-widget': 'template', 'x-ui-placeholder': 'Optional' },
          output: { type: 'object', title: 'Run output', 'x-ui-widget': 'key-value-map', 'x-ui-add-label': 'Add a value',
                    description: 'Values the run returns; references allowed.' } } } },
    { type_id: 'condition', label: 'Condition', category: 'control', role: 'branch', icon: 'call_split',
      description: 'Asks a yes-or-no question, then runs the steps under Then or the steps under Otherwise.',
      ports: [IN, F('true', 'output', { label: 'True' }), F('false', 'output', { label: 'False' })],
      config_schema: { type: 'object', required: ['expression'], properties: {
          expression: { type: 'string', minLength: 1, title: 'Formula', 'x-ui-widget': 'expression',
                        description: 'A blank answer counts as false.' }, retry: RETRY } } },
    { type_id: 'loop-over-rows', label: 'Loop over rows', category: 'control', role: 'loop', icon: 'repeat',
      description: 'Reads a table a page at a time and runs the steps inside it once for every row.',
      ports: [IN, F('next', 'input', { multiple: true, label: 'Next' }), F('body', 'output', { label: 'Body' }),
              F('done', 'output', { label: 'Done' })],
      config_schema: { type: 'object', required: ['table'], properties: {
          table: { type: 'string', enum: ['Applications', 'Programmes', 'Students'], title: 'Table' },
          page_size: { type: 'integer', minimum: 1, maximum: 5000, default: 500, title: 'Rows per page' } } } },
    { type_id: 'parallel', label: 'Parallel', category: 'control', role: 'fanout', icon: 'account_tree',
      description: 'Runs its branches side by side, then carries on when they finish.',
      ports: [IN, F('out', 'output', { multiple: true })], config_schema: { type: 'object', properties: {} } },
    { type_id: 'merge', label: 'Merge', category: 'control', role: 'join', icon: 'merge',
      ports: [IN, OUT], config_schema: { type: 'object', properties: {
          join: { type: 'string', enum: ['all', 'any'], default: 'all', title: 'Wait for' } } } },
    { type_id: 'read-rows', label: 'Read rows', category: 'data', icon: 'table_view',
      description: 'Reads rows from a table.',
      ports: [IN, OUT, F('empty', 'output', { label: 'No rows' }), D('rows', 'Rows')],
      config_schema: { type: 'object', required: ['table'], properties: {
          table: { type: 'string', enum: ['Applications', 'Programmes', 'Students'], title: 'Table' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, title: 'At most' } } } },
    { type_id: 'insert-rows', label: 'Insert rows', category: 'data', icon: 'add_box',
      description: 'Writes a list of rows into a table.', ports: [IN, OUT, D('result', 'Result')],
      config_schema: { type: 'object', required: ['table', 'rows'], properties: {
          table: { type: 'string', enum: ['Applications', 'Programmes', 'Students'], title: 'Table' },
          rows: { type: ['string', 'array'], title: 'Rows', 'x-ui-widget': 'template' } } } },
    { type_id: 'upsert-rows', label: 'Insert or update rows', category: 'data', icon: 'sync',
      description: 'Writes a list of rows into a table: a row whose match column already exists is updated, any other is inserted.',
      ports: [IN, OUT, D('result', 'Result')],
      config_schema: { type: 'object', required: ['table', 'rows', 'match'], properties: {
          table: { type: 'string', enum: ['Applications', 'Programmes', 'Students'], title: 'Table' },
          rows: { type: ['string', 'array'], title: 'Rows', 'x-ui-widget': 'template', description: 'A list of objects.' },
          match: { type: 'string', title: 'Match on (a unique column)' },
          update: { type: 'array', title: 'Columns to update', 'x-ui-widget': 'enum-chips',
                    items: { type: 'string', enum: ['name', 'email', 'programme'],
                             'x-ui-enum-labels': { name: 'Name', email: 'Email', programme: 'Programme' } },
                    description: 'Empty updates every mapped column.' },
          compensate: { type: 'string', enum: ['auto', 'none'], default: 'auto', title: 'If a later step fails',
                        'x-ui-widget': 'choice-cards',
                        'x-ui-enum-labels': { auto: 'Undo the rows this step wrote', none: 'Leave them standing' } } } } },
    { type_id: 'delete-rows', label: 'Delete rows', category: 'data', icon: 'delete', ports: [IN, OUT],
      config_schema: { type: 'object', properties: { table: { type: 'string', title: 'Table' } } } },
    { type_id: 'set-variable', label: 'Set variable', category: 'data', icon: 'data_object', ports: [IN, OUT],
      description: 'Assigns the run\'s variables, from a value or a formula.',
      config_schema: { type: 'object', properties: { assignments: { type: 'array', title: 'Assignments',
          'x-ui-widget': 'key-value-list', items: { type: 'object', properties: {
              variable: { type: 'string' }, value: {}, expression: { type: 'string' } } } } } } },
    { type_id: 'http-request', label: 'HTTP request', category: 'integration', icon: 'public',
      description: 'Calls an address on the web and hands its answer to the steps after it.',
      ports: [IN, OUT, F('error', 'output', { label: 'Error' }), D('response', 'Response')],
      config_schema: { type: 'object', required: ['url'], properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET', title: 'Method' },
          url: { type: 'string', minLength: 1, title: 'Url', 'x-ui-widget': 'template',
                 'x-ui-placeholder': 'Type an address, or insert a value' },
          headers: { type: 'object', title: 'Headers', 'x-ui-widget': 'key-value-map', 'x-ui-add-label': 'Add header',
                     description: 'A value may come from the vault; the secret never appears in a run\'s record.' },
          body: { type: ['string', 'object', 'array'], title: 'Body', 'x-ui-widget': 'json-body',
                  description: 'JSON. A value that is exactly one reference keeps its type.' },
          timeout_seconds: { type: 'integer', minimum: 1, maximum: 60, default: 30, title: 'Timeout (seconds)' },
          retry: RETRY } } },
    { type_id: 'log', label: 'Log', category: 'utility', icon: 'notes', ports: [IN, OUT],
      description: 'Writes a line to the run\'s log.',
      config_schema: { type: 'object', required: ['message'], properties: {
          level: { type: 'string', enum: ['info', 'warning', 'error'], default: 'info', title: 'Level' },
          message: { type: 'string', minLength: 1, title: 'Message', 'x-ui-widget': 'template' },
          fields: { type: 'object', title: 'Fields', 'x-ui-widget': 'key-value-map', 'x-ui-add-label': 'Add field' } } } },
    { type_id: 'send-email', label: 'Send an email', category: 'integration', icon: 'mail', ports: [IN, OUT],
      unavailable: 'Sending email is not built yet.' },
];
const CATEGORIES = [
    { id: 'control', label: 'Flow', tone: 'violet' }, { id: 'data', label: 'Data', tone: 'teal', layout: 'grid' },
    { id: 'integration', label: 'Integration', tone: 'amber', layout: 'grid' },
    { id: 'utility', label: 'Utility', tone: 'grey', layout: 'grid' },
];
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES,
    idBase: (t) => ({ 'http-request': 'request', 'upsert-rows': 'upsert', 'loop-over-rows': 'loop' }[t.type_id] ?? t.type_id) });

/** The block mapping, in the mocks' words (36 §6.2). */
const BLOCKS = {
    start: { role: 'start', label: 'When it runs' },
    end: { role: 'end', entry: { label: 'End the run', sub: 'End', description: 'Stop here, as a success or a failure.' } },
    step: { input: 'in', continue: 'out' },
    branch: { role: 'branch', arms: { true: 'Then', false: 'Otherwise' }, unconnected: 'stop',
              entry: { label: 'If … otherwise', sub: 'Condition',
                       description: 'Ask a yes-or-no question; run one set of steps or the other.' },
              note: 'True runs the steps under Then; false runs the steps under Otherwise. Either may be empty, '
                  + 'and the run carries on with the step after the block.' },
    fanout: { role: 'fanout', join: { role: 'join', type: 'merge', input: 'in', output: 'out', field: 'join',
                                      foot: { all: 'Then wait for every branch', any: 'Then go on when the first finishes' } },
              arm: 'Branch {n}', addArm: 'Add a branch',
              entry: { label: 'At the same time', sub: 'Parallel + Merge',
                       description: 'Run branches side by side, then wait for them.' } },
    loop: { role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
            foot: 'Next row', skip: 'Go on with the next row', addInside: 'Add a step to the loop',
            entry: { label: 'For each row', sub: 'Loop over rows',
                     description: 'Run the steps inside it once for every row of a table.' },
            note: 'Rows added after the loop starts are not visited. Rows the loop has finished stand, even if a later step fails.' },
    arms: {
        error: { label: (step) => `If ${step.label} fails`, unconnected: 'fail',
                 setting: { label: 'If it fails', unconnected: 'Fail the run',
                            connected: (arm) => `Run the steps under “${arm}”`, after: 'timeout_seconds' } },
        empty: { label: 'If there are no rows', unconnected: 'stop',
                 setting: { label: 'If there are no rows', unconnected: 'Stop here',
                            connected: (arm) => `Run the steps under “${arm}”` } },
    },
    types: { 'http-request': { arms: { error: { label: 'If the request fails',
                                                setting: { label: 'If the request fails', after: 'body' } } } } },
};

// ── the flow: the Main mock's ───────────────────────────────────────────
const node = (id, type, label, config = {}) => ({ id, type, ...(label ? { label } : {}), config, position: { x: 0, y: 0 } });
const edge = (source, target, sourcePort = 'out', targetPort = 'in') => ({ source, target, sourcePort, targetPort });
const DRAFT = {
    nodes: [
        node('start', 'start', 'Start'),
        node('fetch', 'http-request', 'Fetch new applications', {
            method: 'GET', url: 'https://portal.example.org/api/applications?since=${run.since}',
            headers: { Authorization: '${vault.portal_key}', Accept: 'application/json' }, timeout_seconds: 30 }),
        node('portaldown', 'end', 'Stop: the portal is down', { outcome: 'failed',
            message: 'The portal did not answer: ${steps.fetch.error.message}' }),
        node('save', 'upsert-rows', 'Save the applications', { table: 'Applications', rows: '${steps.fetch.body.items}',
            match: 'Application id', update: ['name', 'email', 'programme'] }),
        node('anynew', 'condition', 'Anything new?', { expression: '[steps.save.inserted] > 0' }),
        node('each', 'loop-over-rows', 'For each new application', { table: 'Applications', page_size: 200 }),
        node('check', 'http-request', 'Check eligibility', { method: 'POST', url: 'https://eligibility.example.org/v1/check',
            body: { applicant: '${row.applicant_id}', programme: '${row.programme}' }, timeout_seconds: 20 }),
        node('checkfail', 'log', 'Note it and move on', { level: 'warning',
            message: 'Could not check ${row.name}: ${steps.check.error.message}' }),
        node('invite', 'http-request', 'Send the invitation', { method: 'POST',
            body: { to: '${row.email}', template: 'interview-invite' } }),
        node('nothing', 'end', 'Stop: nothing new', { outcome: 'success', message: 'No new applications since ${run.since}' }),
        node('report', 'parallel', 'At the same time'),
        node('tell', 'http-request', 'Tell admissions', { method: 'POST', url: 'https://hooks.example.org/admissions',
            body: { text: 'Saved ${steps.save.inserted} new applications' } }),
        node('summary', 'log', 'Write a summary', { level: 'info',
            message: 'Saved ${steps.save.inserted} new and ${steps.save.updated} changed applications.' }),
        node('merged', 'merge', null, { join: 'all' }),
        node('done', 'end', 'Finish', { outcome: 'success', output: { saved: '${steps.save.inserted}', checked: '${steps.each.rows}' } }),
    ],
    connections: [
        edge('start', 'fetch'), edge('fetch', 'save'), edge('fetch', 'portaldown', 'error'), edge('save', 'anynew'),
        edge('anynew', 'each', 'true'), edge('anynew', 'nothing', 'false'), edge('each', 'check', 'body'),
        edge('check', 'invite'), edge('check', 'checkfail', 'error'), edge('checkfail', 'each', 'out', 'next'),
        edge('invite', 'each', 'out', 'next'), edge('each', 'report', 'done'), edge('report', 'tell'),
        edge('report', 'summary'), edge('tell', 'merged'), edge('summary', 'merged'), edge('merged', 'done'),
    ],
};
/** Version 4, the one run 57 used: the draft without "Send the invitation". */
const V4 = (() => {
    const g = structuredClone(DRAFT);
    g.nodes = g.nodes.filter((n) => n.id !== 'invite');
    g.connections = g.connections.filter((c) => c.source !== 'invite' && c.target !== 'invite');
    g.connections.push(edge('check', 'each', 'out', 'next'));
    return g;
})();
/** A flow the outline cannot draw: a line from one branch jumps into the other. */
const TANGLED = (() => {
    const g = structuredClone(DRAFT);
    g.connections = g.connections.filter((c) => !(c.source === 'checkfail'));
    g.connections.push(edge('checkfail', 'nothing'));
    return g;
})();

const FLOW_SETTINGS = {
    title: 'Sync applications from the portal', typeLabel: 'Flow', where: 'The whole flow',
    description: 'What this flow is, and what a run asks for when it starts.',
    idLine: 'Steps read what a run is given as ${run.…}',
    schema: { type: 'object', required: ['name'], properties: {
        name: { type: 'string', title: 'Name' },
        description: { type: 'string', title: 'Description', 'x-ui-multiline': true } } },
    value: { name: 'Sync applications from the portal',
             description: 'Pulls the applications submitted on the portal since a date, saves them, checks each new one and invites those who are eligible.' },
};

// ── what each step offers to read, in the demo's words ──────────────────
let editor = null;
const current = () => editor?.getGraph() ?? DRAFT;
const byId = (id) => current().nodes.find((n) => n.id === id);
const nameOf = (id) => byId(id)?.label || catalogue.get(byId(id)?.type)?.label || id;
const ROW = [['Applicant id', 'text', 'applicant_id'], ['Name', 'text', 'name'], ['Email', 'text', 'email'],
             ['Programme', 'choice', 'programme'], ['Status', 'choice', 'status']];
const OFFERS = {
    'http-request': (id) => [{ label: 'status code', type: 'number', ref: `\${steps.${id}.status_code}` },
                             { label: 'body', ref: `\${steps.${id}.body}`, children: [
                                 { label: 'items', ref: `\${steps.${id}.body.items}` },
                                 { label: 'total', ref: `\${steps.${id}.body.total}` }] },
                             { label: 'content type', ref: `\${steps.${id}.content_type}` }],
    'upsert-rows': (id) => ['inserted', 'updated', 'row_ids', 'skipped']
        .map((k) => ({ label: k.replace('_', ' '), ref: `\${steps.${id}.${k}}` })),
    'read-rows': (id) => [{ label: 'rows', ref: `\${steps.${id}.rows}` }, { label: 'count', ref: `\${steps.${id}.count}` }],
    'condition': (id) => [{ label: 'result', ref: `\${steps.${id}.result}` }],
    'loop-over-rows': (id) => [{ label: 'rows', ref: `\${steps.${id}.rows}` }, { label: 'pages', ref: `\${steps.${id}.pages}` }],
};
// A step that FAILED hands on its error output and nothing else: on a failure
// its data output is empty.
const ERROR_OUTPUT = (id) => [{ label: 'error', ref: `\${steps.${id}.error}`, children: [
    { label: 'code', ref: `\${steps.${id}.error.code}` },
    { label: 'message', ref: `\${steps.${id}.error.message}` }] }];
async function values({ before, loops, arms = [] }) {
    // The steps whose error arm this one is in: they ran and failed (36 §3.7).
    const failed = new Set(arms.filter((a) => a.port === 'error').map((a) => a.head));
    const groups = loops.map((loopId) => ({
        id: `row:${loopId}`, label: 'This row', sub: nameOf(loopId), layout: 'grid',
        items: [...ROW.map(([label, type, key]) => ({ label, type, ref: `\${row.${key}}` })),
                { label: 'Its position', type: 'number', ref: '${row.index}' }] }));
    before.forEach((id, i) => {
        const n = byId(id);
        // A loop's own figures are read after it, never by the steps inside it.
        const offer = loops.includes(id) ? null : failed.has(id) ? ERROR_OUTPUT : OFFERS[n?.type];
        const sub = failed.has(id) ? 'it failed: its error only' : i === 0 ? 'the step before this one' : '';
        if (offer) groups.push({ id, label: nameOf(id), sub, items: offer(id) });
    });
    groups.push({ id: 'run', label: 'Run input', items: [{ label: 'since', ref: '${run.since}' }] });
    groups.push({ id: 'vars', label: 'Variables', items: [], empty: 'none yet; a Set variable step makes them.' });
    return { groups };
}

// The demo's reading of its own references, for the chips.
const ROW_WORDS = Object.fromEntries(ROW.map(([label, , key]) => [key, label]));
const template = createReferenceSyntax({
    name: 'template', pattern: TEMPLATE_REFERENCES.pattern, format: TEMPLATE_REFERENCES.format, stepScope: 'steps',
    describe: (m) => {
        const [scope, ...rest] = m.path.split('.');
        if (scope === 'row' && ROW_WORDS[rest[0]]) return { label: `This row › ${ROW_WORDS[rest[0]]}`, tone: 'blue' };
        if (scope === 'row' && rest[0] === 'index') return { label: 'This row › its position', tone: 'blue' };
        if (scope === 'run') return { label: `Run input › ${rest.join(' › ')}`, tone: 'blue' };
        if (scope === 'steps' && byId(rest[0])) return { label: [nameOf(rest[0]), ...rest.slice(1)].join(' › '), tone: 'blue' };
        if (scope === 'vault') return { label: `Vault · ${rest.join(' ')}`, tone: 'amber' };
        return { label: m.path, known: false };
    },
});
const formula = createReferenceSyntax({ name: 'formula', pattern: FORMULA_REFERENCES.pattern,
                                        format: FORMULA_REFERENCES.format, stepScope: 'steps' });

// ── one line per row, the panel's id line ──────────────────────────────
const host = (url) => String(url || '').replace(/^https?:\/\//, '').replace(/\?.*$/, '');
function summarise(n, type) {
    const c = n.config || {};
    switch (n.type) {
        case 'start': return 'Run or the API · asks for since';
        case 'http-request': return c.url ? `${c.method || 'GET'} ${host(c.url)}` : null;
        case 'end': return `Ends the run as ${c.outcome === 'failed' ? 'failed' : 'a success'}${c.output
            ? ` · returns ${Object.keys(c.output).join(', ')}` : ''}`;
        case 'upsert-rows': return [c.table, c.match ? `match on ${c.match}` : null,
                                    c.update ? `${c.update.length} columns` : null].filter(Boolean).join(' · ');
        case 'condition': return c.expression ? { text: c.expression, mono: true } : null;
        case 'loop-over-rows': return [c.table, c.page_size ? `${c.page_size} per page` : null].filter(Boolean).join(' · ');
        case 'parallel': {
            const g = current();
            const branches = g.connections.filter((x) => x.source === n.id).length;
            return `${branches} branch${branches === 1 ? '' : 'es'}`;
        }
        case 'log': return [c.level || 'info', c.message ? `${String(c.message).slice(0, 28)}…` : null].filter(Boolean).join(' · ');
        default: return type?.label ?? null;
    }
}
function summariseReads(n) {
    switch (n.type) {
        case 'end': return 'Ends the run — nothing after it can read it.';
        case 'log': return 'Writes to the run\'s log; it hands nothing on.';
        case 'parallel': return 'Holds branches; later steps read each branch\'s steps directly.';
        case 'loop-over-rows': return `Inside it: \${row.…}  ·  after it: \${steps.${n.id}.rows}`;
        default: return `Later steps read it as \${steps.${n.id}.…}`;
    }
}

// ── the run: what run 57's records keep ─────────────────────────────────
const RUN = {
    banner: 'Drawn on version 4, the version this run used. The draft has changed since — it adds Send the invitation.',
    steps: {
        start: { state: 'completed' }, fetch: { state: 'completed', line: 'completed · 200' },
        portaldown: { state: 'skipped' }, save: { state: 'completed', line: '63 new · 1 changed' },
        anynew: { state: 'completed', line: 'true → Then' }, each: { state: 'completed', line: '63 rows · 1 page' },
        check: { state: 'completed', line: 'completed ×63' }, checkfail: { state: 'completed', line: 'completed ×2', tone: 'warn' },
        nothing: { state: 'skipped' }, report: { state: 'completed', line: '2 of 2 branches' },
        tell: { state: 'completed', line: 'completed · 200' }, summary: { state: 'completed', line: 'completed' },
        merged: { state: 'completed', line: 'both finished' }, done: { state: 'completed', line: 'success' },
    },
    ports: {
        fetch: { error: { taken: false } }, anynew: { true: { taken: true }, false: { taken: false } },
        check: { error: { taken: true, count: 2 } }, each: { next: { count: 63 } },
    },
};

const FINDINGS = [{ code: 'required', message: 'Url needs a value.', severity: 'error', node_id: 'invite', field: 'url' }];

// ── the page ────────────────────────────────────────────────────────────
const bar = document.getElementById('bar');
const counts = { dragstart: 0, changes: 0, actions: [] };
document.addEventListener('dragstart', () => { counts.dragstart += 1; }, true);
let mode = 'draft';
let draft = structuredClone(DRAFT);
let findings = FINDINGS;
let folds = [];

function acting(box) {
    const chip = el('span', 'demo__acts');
    chip.append(el('span', 'material-symbols-outlined', 'person'), el('span', null, 'Runs as its own identity'));
    chip.firstChild.setAttribute('aria-hidden', 'true');
    box.appendChild(chip);
}
function lastRun(box, step) {
    const r = RUN.steps[step.id];
    const wrap = el('div', 'demo__run');
    wrap.appendChild(el('h2', null, 'In the last run'));
    if (!r) {
        wrap.appendChild(el('p', null, 'Not in version 4 — this step was added in the draft. Publish it, and the next run reaches it.'));
    } else {
        const stats = el('div', 'demo__stats');
        const stat = (n, l) => { const s = el('div', 'demo__stat'); s.append(el('b', null, n), el('span', null, l)); return s; };
        stats.append(stat(r.line || r.state, 'status'), stat('Run 57', 'today 09:12 · v4'));
        wrap.appendChild(stats);
    }
    const reads = el('div', 'demo__reads');
    reads.appendChild(el('code', null, summariseReads(step)));
    wrap.appendChild(reads);
    box.appendChild(wrap);
}

function mount() {
    editor?.destroy();
    const run = mode === 'run';
    editor = createOutlineEditor(document.getElementById('editor'), {
        catalogue, widgets: createWidgetRegistry(), blocks: BLOCKS,
        references: { template, formula }, values,
        valuesNote: 'Only steps that always run before this one are listed.',
        summarise, summariseReads, flowSettings: FLOW_SETTINGS,
        readOnly: run ? { reason: 'Run 57 is drawn as it ran; nothing in it can be edited.' } : false,
        actions: run ? [] : [
            { id: 'save', label: 'Save', run: () => status('Saved (a demo: nothing is sent).') },
            { id: 'validate', label: 'Validate', icon: 'task_alt', run: () => { editor.setFindings(findings); status('Validated.'); } },
            { id: 'publish', label: 'Publish', icon: 'publish', primary: true, run: () => status('Published (a demo).') },
            { id: 'run', label: 'Run', icon: 'play_arrow', run: () => show('run') },
        ],
        slots: { toolbarEnd: acting, stepPanel: (box, step) => lastRun(box, step) },
        initialFolds: folds,
        onFoldChange: (ids) => { folds = ids; },
        onChange: ({ action, graph }) => {
            counts.changes += 1;
            counts.actions.push(action);
            draft = graph;
            // The demo's "validator": a request with no url is the one thing to fix.
            findings = graph.nodes.filter((n) => n.type === 'http-request' && !n.config?.url)
                .map((n) => ({ code: 'required', message: 'Url needs a value.', severity: 'error', node_id: n.id, field: 'url' }));
            editor.setFindings(findings);
            publishState();
        },
    });
    if (run) {
        editor.load({ graph: structuredClone(V4) });
        editor.setRunOverlay(RUN);
        editor.setStatus('Run 57 · completed · version 4');
    } else if (mode === 'tangled') {
        editor.load({ graph: structuredClone(TANGLED) });
    } else {
        editor.load({ graph: draft });
        editor.setFindings(findings);
        editor.setStatus('draft v5 · every change is saved · v4 published');
        publishState();
    }
    window.__outlineDemo.editor = editor;
}
function publishState() {
    const errors = findings.filter((f) => f.severity !== 'warning').length;
    editor.setActionState('publish', { disabled: errors > 0,
        reason: errors ? `${errors} thing${errors === 1 ? '' : 's'} to fix first` : '' });
}
function status(text) { editor.setStatus(text); }
function show(next) { mode = next; mount(); paintBar(); }

const buttons = {};
for (const [id, label] of [['draft', 'The draft'], ['run', 'Run 57 on the outline'], ['tangled', 'A flow that is not block-shaped']]) {
    const b = el('button', 'twm-btn', label);
    b.type = 'button';
    b.dataset.demo = id;
    b.addEventListener('click', () => show(id));
    bar.appendChild(b);
    buttons[id] = b;
}
function paintBar() { for (const [id, b] of Object.entries(buttons)) b.classList.toggle('twm-btn--primary', id === mode); }

/** The draft as the page first drew it — what a probe starts each of its parts from. */
function reset() {
    draft = structuredClone(DRAFT);
    findings = FINDINGS;
    folds = [];
    show('draft');
}

window.__outlineDemo = { counts, catalogue, BLOCKS, DRAFT, V4, TANGLED, show, reset, get mode() { return mode; }, ready: false };
show('draft');
window.__outlineDemo.ready = true;
