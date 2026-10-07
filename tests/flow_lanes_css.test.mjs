/**
 * EVERY CLASS THE LANE EDITOR SETS HAS A RULE, AND EVERY RULE NAMES A CLASS IT
 * SETS (36 §3.12, §8) — the defect family "a class one side knows and the
 * other has never heard of", which no jsdom suite can see because jsdom
 * applies no stylesheet. And THE CARD SIZES IN THE SHEET ARE THE LAYOUT'S:
 * the layout places cards and draws wires from `LANE_GEOMETRY`, the sheet
 * sizes and clips them, and nothing else holds the two together.
 *
 * The classes the editor sets are gathered two ways:
 *
 *   RUNTIME — the editor mounted in many states (every role, every tone, a
 *     chosen card, a finding of each severity, an unconnected lane, a cycle,
 *     read only, both popovers, the dock's three tabs and its three states,
 *     the flow's own tab, the small size, the compact strip) and every `twm-`
 *     class in the DOM collected;
 *   SOURCE — every quoted `twm-flow-lanes…` name in a lanes module.
 *
 *   §1  each class the editor sets has a rule — a `twm-flow-lanes` one in the
 *       LANES section, any other (the kit's, FlexDesk's own) somewhere
 *   §2  each `twm-flow-lanes` class a LANES rule names is one the editor sets,
 *       and the section styles no other block's class the editor does not draw
 *   §3  the sizes: each size's card width, height and notch in the sheet are
 *       LANE_GEOMETRY's
 *   §4  [hidden] wins inside the editor
 *
 *     node tests/flow_lanes_css.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowEnv } from './flow_env.mjs';
import { stripComments } from './css_rules.mjs';

const t = await flowEnv('flow lanes — css');
const kit = await import('../src/flow/kit/index.js');
const { createLaneEditor, LANE_GEOMETRY } = await import('../src/flow/lanes/index.js');
const { CATEGORIES, MOCK_DESCRIBE, MOCK_PIPELINE, MOCK_PREVIEW, MOCK_RUN, SUMMARIES, TYPES } = await import('./fixtures/flow_lanes_fixture.mjs');
const { window } = t;

const sheet = t.css('flexdesk.css');
const LANES = stripComments(sheet.slice(sheet.indexOf('/* ══ FLOW · LANES '), sheet.indexOf('/* ══ end FLOW · LANES ══ */')));
const ALL = stripComments(sheet);
const classesIn = (css) => {
    const out = new Set();
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
    }
    return out;
};
const lanesRules = classesIn(LANES);
const allRules = classesIn(ALL);

// ── RUNTIME ─────────────────────────────────────────────────────────────
const seen = new Set();
const harvest = (root) => {
    if (!root) return;
    for (const n of [root, ...root.querySelectorAll('*')]) {
        const list = n.classList?.length ? [...n.classList] : String(n.getAttribute?.('class') || '').split(/\s+/);
        for (const c of list) if (c) seen.add(c);
    }
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const clock = { setTimeout: (fn) => setTimeout(fn, 0), clearTimeout: (h) => clearTimeout(h) };

// Every tone: one category a tone, so every step type draws a different one.
const tones = kit.TONES;
const types = TYPES.map((ty, i) => ({ ...ty, category: `c${i % tones.length}` }));
const categories = tones.map((tone, i) => ({ id: `c${i}`, label: tone, tone }));
const catalogue = kit.createStepCatalogue(types, { categories });
const references = { formula: kit.FORMULA_REFERENCES, parameter: kit.PARAMETER_REFERENCES };

for (const size of ['regular', 'small']) {
    const host = t.host();
    let answer = MOCK_PREVIEW;
    const editor = createLaneEditor(host, {
        catalogue, references, size, clock, summarise: (n) => SUMMARIES[n.id] ?? '',
        preview: async () => answer, describe: async () => MOCK_DESCRIBE, lastRun: async () => MOCK_RUN,
        flowSettings: { schema: { type: 'object', properties: { note: { type: 'string', title: 'Note' } } }, value: {} },
        actions: [{ id: 'save', label: 'Save' }, { id: 'publish', label: 'Publish', primary: true }],
        slots: { toolbarStart: (b) => b.append('x'), toolbarEnd: (b) => b.append('y') },
    });
    const root = editor.el;
    const withExtras = {
        ...MOCK_PIPELINE,
        nodes: [...MOCK_PIPELINE.nodes, { id: 'lost', type: 'filter', config: {} }, { id: 'u', type: 'union', config: {} },
                { id: 'b', type: 'archive', config: {} }],
        connections: [...MOCK_PIPELINE.connections, { id: 'c7', sourceId: 'src', sourcePort: 'out', targetId: 'u', targetPort: 'in' },
                      { id: 'c8', sourceId: 'u', sourcePort: 'out', targetId: 'b', targetPort: 'in' },
                      { id: 'c9', sourceId: 'b', sourcePort: 'out', targetId: 'u', targetPort: 'in_2' }],
    };
    editor.load({ graph: withExtras });   // a cycle: read only, a dashed line, the banner
    await flush();
    harvest(root);
    editor.load({ graph: { ...MOCK_PIPELINE, nodes: [...MOCK_PIPELINE.nodes, { id: 'lost', type: 'filter', config: {} }] } });
    await flush();
    editor.setActionState('save', { disabled: true, reason: 'Nothing to save.' });
    editor.setActionState('publish', { busy: true });
    editor.setStatus('draft v3');
    editor.setFindings([{ node_id: 'join', message: 'e', severity: 'error' }, { node_id: 'tidy', message: 'w', severity: 'warning' },
                        { message: 'flow', severity: 'warning' }]);
    await flush();
    for (const id of ['src', 'join', 'tidy', 'sink', 'flow']) {
        editor.select(id);
        harvest(root);
        for (const tab of root.querySelectorAll('.twm-flow-lanes__datatab')) {
            t.press(tab);
            harvest(root);
        }
    }
    editor.setStepsShow('run');
    await flush();
    harvest(root);
    editor.setRunOverlay({ steps: { src: { state: 'running', line: 'running' } } });
    harvest(root);
    editor.setStepsShow('preview');
    answer = { nodes: { ...MOCK_PREVIEW.nodes, src: { status: 'error', error: { message: 'no' } }, intake: { status: 'skipped' } } };
    editor.refreshPreview();
    await flush();
    harvest(root);
    answer = new Promise(() => {});
    editor.select('join');
    editor.refreshPreview();
    harvest(root);
    answer = Promise.reject(new Error('The preview failed.'));
    answer.catch(() => {});
    editor.refreshPreview();
    await flush();
    editor.select('src');
    harvest(root);
    // the popovers: a parameter's form (with its refusal), a card's menu, the pickers
    t.press(root.querySelector('.twm-flow-lanes__param'));
    let pop = kit.openFlowPopover();
    pop.querySelector('[data-field="name"]').value = '1bad';
    pop.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    harvest(pop);
    kit.closeFlowPopovers();
    root.querySelector('.twm-flow-lanes__card').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    harvest(kit.openFlowPopover());
    kit.closeFlowPopovers();
    t.press(root.querySelector('.twm-flow-lanes__add'));
    harvest(kit.openFlowPopover());
    kit.closeFlowPopovers();
    editor.setReadOnly({ reason: 'Read only.' });
    harvest(root);
    editor.destroy();
}
{
    const host = t.host();
    const strip = createLaneEditor(host, { catalogue, compact: true, graph: MOCK_PIPELINE });
    harvest(strip.el);
    strip.destroy();
    const small = createLaneEditor(t.host(), { catalogue, compact: { size: 'small' }, graph: MOCK_PIPELINE, height: 'auto' });
    harvest(small.el);
    small.destroy();
    const auto = createLaneEditor(t.host(), { catalogue, height: 'auto', graph: { nodes: [], connections: [] } });
    harvest(auto.el);
    auto.destroy();
}
const runtime = [...seen].filter((c) => c.startsWith('twm-'));

// ── SOURCE ──────────────────────────────────────────────────────────────
const DIR = join(t.root, 'src/flow/lanes');
const source = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
const quoted = new Set();
for (const m of source.matchAll(/['"`]([^'"`\n]*)['"`]/g)) {
    for (const c of m[1].matchAll(/(?:^|\s)(twm-flow-lanes[a-z0-9_-]*[a-z0-9])(?=\s|$)/g)) quoted.add(c[1]);
}

t.section('§1 every class the editor sets has a rule');
t.ok('the harvest found the editor at work', runtime.filter((c) => c.startsWith('twm-flow-lanes')).length > 100,
     `${runtime.filter((c) => c.startsWith('twm-flow-lanes')).length} classes`);
t.check('runtime: a twm-flow-lanes class without a rule in the LANES section',
        runtime.filter((c) => c.startsWith('twm-flow-lanes') && !lanesRules.has(c)).sort(), []);
t.check('runtime: any other twm class without a rule in the sheet',
        runtime.filter((c) => !c.startsWith('twm-flow-lanes') && !allRules.has(c)).sort(), []);
t.check('source: a quoted twm-flow-lanes name without a rule', [...quoted].filter((c) => !lanesRules.has(c)).sort(), []);
t.ok('every role and every tone was drawn', ['source', 'transform', 'operation', 'sink', ...tones]
    .every((x) => seen.has(`twm-flow-lanes__node--${x}`)));

t.section('§2 every rule names a class the editor sets');
{
    const sets = new Set([...runtime, ...quoted]);
    t.check('a twm-flow-lanes class in a LANES rule that the editor never sets',
            [...lanesRules].filter((c) => c.startsWith('twm-flow-lanes') && !sets.has(c)).sort(), []);
    t.check('the LANES section styles no other class but ones drawn inside the editor',
            [...lanesRules].filter((c) => !c.startsWith('twm-flow-lanes') && !seen.has(c)).sort(), []);
    t.check('…and these are they: FlexDesk\'s button, the kit\'s panel, the icon font',
            [...lanesRules].filter((c) => !c.startsWith('twm-flow-lanes')).sort(), ['material-symbols-outlined', 'twm-btn', 'twm-flow-panel']);
}

t.section('§3 the sheet\'s card sizes are the layout\'s');
{
    const vars = (selector) => {
        const m = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(LANES);
        const out = {};
        for (const d of (m?.[1] ?? '').matchAll(/(--twm-lanes-[a-z-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
        return out;
    };
    for (const size of ['regular', 'small', 'strip']) {
        const g = LANE_GEOMETRY[size];
        const v = vars(`.twm-flow-lanes--${size}`);
        t.check(`${size}: width, height and notch`, [v['--twm-lanes-card-w'], v['--twm-lanes-card-h'], v['--twm-lanes-notch']],
                [`${g.width}px`, `${g.height}px`, `${g.notch}px`]);
    }
    t.ok('a card is sized by those variables and nothing else', /\.twm-flow-lanes__node\s*\{[^}]*width:\s*var\(--twm-lanes-card-w\);[^}]*height:\s*var\(--twm-lanes-card-h\);/.test(LANES));
    t.ok('every shape clips by the notch', (LANES.match(/clip-path:[^;]*var\(--twm-lanes-notch\)/g) || []).length === 3);
}

t.section('§4 [hidden] wins');
t.ok('one !important rule hides [hidden] inside the editor', /\.twm-flow-lanes \[hidden\]\s*\{\s*display:\s*none !important;?\s*\}/.test(LANES));

t.done();
