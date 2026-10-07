/**
 * The lane editor's demo page (36 §8): the approved `Pipeline` mock's flow in
 * the editor, with a preview and a description that answer from the mock's own
 * data after a short wait, the last run, and the consumer's toolbar verbs; or
 * (`?view=small`) the same at the small size with no step tabs, the way a data
 * flow is edited from inside another flow; or (`?view=strip`) the compact
 * strip a step's settings show as "What it does, left to right".
 *
 * Everything here is the demo's own data in the demo's own words; the editor
 * names none of it. `window.__lanesDemo` is what `flow_lanes_probe.mjs` reads.
 */
import {
    FORMULA_REFERENCES, PARAMETER_REFERENCES, TEMPLATE_REFERENCES, createLaneEditor, createStepCatalogue,
} from '../flow.js';
import {
    CATEGORIES, MOCK_DESCRIBE, MOCK_PIPELINE, MOCK_PREVIEW, MOCK_RUN, SUMMARIES, TYPES,
} from '../tests/fixtures/flow_lanes_fixture.mjs';

const view = new URLSearchParams(location.search).get('view') || 'editor';
const host = document.getElementById('host');
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES, idBase: (t) => t.type_id.replace(/^(read|write)-/, '') });
const references = { formula: FORMULA_REFERENCES, parameter: PARAMETER_REFERENCES, template: TEMPLATE_REFERENCES };
const demo = { view, requests: [], dropped: 0, changes: [], dragstarts: 0, ready: false };
window.__lanesDemo = demo;
document.addEventListener('dragstart', () => { demo.dragstarts += 1; }, true);

const wait = (ms, signal) => new Promise((resolve, reject) => {
    const h = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(h); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
});

/** The preview: the mock's answer for the mock's steps; a step it has never seen reads its lane input's. */
async function preview({ pipeline, signal, seq }) {
    demo.requests.push({ kind: 'preview', seq, at: performance.now() });
    await wait(demo.previewDelay ?? 120, signal);
    const nodes = {};
    const feed = (id) => pipeline.connections.find((c) => c.targetId === id && c.targetPort === 'in')?.sourceId;
    const answer = (id, depth = 0) => {
        if (MOCK_PREVIEW.nodes[id]) return MOCK_PREVIEW.nodes[id];
        const from = depth < 20 ? feed(id) : null;
        if (!from) return { status: 'success', rows: 0, columns: [], head: [] };
        const up = answer(from, depth + 1);
        return { ...up, caption: undefined, rejects: undefined };
    };
    for (const n of pipeline.nodes) nodes[n.id] = answer(n.id);
    return { nodes };
}

async function describe({ pipeline, signal }) {
    await wait(60, signal);
    const nodes = {};
    for (const n of pipeline.nodes) if (MOCK_DESCRIBE.nodes[n.id]) nodes[n.id] = MOCK_DESCRIBE.nodes[n.id];
    return { nodes };
}

if (view === 'strip') {
    document.getElementById('title').textContent = 'A step that runs a data flow';
    const step = document.createElement('div');
    step.className = 'demo__step';
    step.innerHTML = '<div><b>Import the applications</b> · Run a data flow</div>'
        + '<div class="demo__what"><span class="demo__what-label">What it does, left to right</span>'
        + '<div class="demo__what-scroll" id="strip"></div></div>';
    host.appendChild(step);
    demo.editor = createLaneEditor(document.getElementById('strip'), { catalogue, compact: true, graph: MOCK_PIPELINE,
                                                                       label: 'What it does, left to right' });
} else {
    const small = view === 'small';
    document.getElementById('title').textContent = small ? 'Nightly admissions › Import the applications › Applications from the portal'
        : 'Applications from the portal';
    demo.editor = createLaneEditor(host, {
        catalogue, references, size: small ? 'small' : 'regular', stepTabs: !small,
        summarise: (n) => SUMMARIES[n.id] ?? '',
        preview, describe,
        lastRun: async () => { await wait(80); return MOCK_RUN; },
        actions: [{ id: 'save', label: 'Save', run: () => demo.changes.push({ action: 'save' }) },
                  { id: 'validate', label: 'Validate', run: () => demo.editor.setFindings([
                      { code: 'join_key_missing', node_id: 'join', field: 'on', message: 'Match on names a column the joined lane lacks.', severity: 'error' },
                      { code: 'parameter_unused', message: 'The parameter region is never read.', severity: 'warning' }]) },
                  { id: 'publish', label: small ? 'Publish the flow' : 'Publish', primary: true, run: () => {} },
                  { id: 'run', label: 'Run now', icon: 'play_arrow', run: () => {} }],
        slots: {
            toolbarStart: small ? (el) => { el.innerHTML = '<span class="demo__label">Data flow</span>'; } : null,
            toolbarEnd: (el) => { el.innerHTML = '<span class="demo__chip">Runs as its own identity</span>'; },
        },
        onChange: (c) => demo.changes.push({ action: c.action, key: c.key }),
        select: 'join',
    });
    demo.editor.load({ graph: MOCK_PIPELINE });
    demo.editor.setStatus('draft v3 · every change is saved · v2 published');
}
demo.ready = true;
