/**
 * EVERY CLASS THE KERNEL AND THE CANVAS EDITOR SET HAS A RULE, AND EVERY RULE
 * NAMES A CLASS THEY SET (36 §3.12, §8) — the defect family "a class one side
 * knows and the other has never heard of", which no jsdom suite can see,
 * because jsdom applies no stylesheet. And the node box the edges are anchored
 * by is the box the stylesheet draws.
 *
 * The classes are gathered two ways, and both are checked: RUNTIME (the
 * editor mounted in every state it has — a palette with a refusal, nodes
 * picked, connecting, in error and in warning, a run overlay, a picked line, a
 * drag's ghost, read only — and every class in the DOM collected) and SOURCE
 * (every quoted twm-canvas / twm-edge / twm-flow-graph name in the modules,
 * and each block `toneClass` is called with, times the six tones).
 *
 *   §1  each class set has a rule — an own one in the CANVAS section, any other
 *       (the kit's, FlexDesk's button) somewhere in the sheet
 *   §2  each own class a CANVAS rule names is one a module sets, and the
 *       section styles no other block's classes
 *   §3  the node box: the width, the header and a row of ports in the sheet
 *       are CANVAS_NODE's — the edges are anchored by arithmetic over them
 *   §4  the ground is SEVEN background layers, the seven `_apply` sizes
 *   §5  [hidden] wins inside the editor
 *
 *     node tests/flow_canvas_css.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowEnv } from './flow_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await flowEnv('flow canvas — css');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue, CANVAS_NODE, TONES } = flow;
const { crowsFoot } = await import('../src/canvas/index.js');

const sheet = t.css('flexdesk.css');
const start = sheet.indexOf('/* ══ FLOW · CANVAS ');
const end = sheet.indexOf('/* ══ end FLOW · CANVAS ══ */');
const SECTION = stripComments(sheet.slice(start, end));
const ALL = stripComments(sheet);
const classesIn = (css) => {
    const out = new Set();
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
    }
    return out;
};
const sectionRules = classesIn(SECTION);
const allRules = classesIn(ALL);
const OWN = /^twm-(canvas|edge|flow-graph)(?:$|[_-])/;

// ── RUNTIME ─────────────────────────────────────────────────────────────
const seen = new Set();
const harvest = (root) => {
    for (const n of [root, ...root.querySelectorAll('*')]) {
        const cls = n.getAttribute?.('class');
        if (cls) for (const c of cls.split(/\s+/).filter(Boolean)) seen.add(c);
    }
};
const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const categories = TONES.map((tone) => ({ id: tone, label: tone, tone }));
const types = [
    { type_id: 'start', label: 'Start', role: 'start', category: 'violet', ports: [F('out', 'output')] },
    ...TONES.map((tone) => ({ type_id: `t-${tone}`, label: tone, category: tone, icon: 'notes',
                              ports: [F('in', 'input'), F('out', 'output'), F('error', 'output'),
                                      { name: 'data', direction: 'output', port_type: 'DATA' }] })),
    { type_id: 'loop', label: 'Loop', role: 'loop', category: 'violet', ports: [F('in', 'input'), F('next', 'input'), F('body', 'output')] },
    { type_id: 'off', label: 'Off', category: 'grey', ports: [], unavailable: 'Not here.' },
];
const catalogue = createStepCatalogue(types, { categories });
const graph = {
    nodes: [{ id: 'start', type: 'start', config: {}, position: { x: 0, y: 0 } },
            ...TONES.map((tone, i) => ({ id: tone, type: `t-${tone}`, config: {}, position: { x: 300, y: i * 120 } })),
            { id: 'each', type: 'loop', config: {}, position: { x: 600, y: 0 } },
            { id: 'ghost', type: 'unknown', config: {}, position: { x: 900, y: 0 } }],
    connections: [{ source: 'start', target: 'violet', sourcePort: 'out', targetPort: 'in' },
                  { source: 'violet', target: 'teal', sourcePort: 'error', targetPort: 'in' },
                  { source: 'teal', target: 'each', sourcePort: 'out', targetPort: 'next' },
                  { source: 'amber', target: 'grey', sourcePort: 'out', targetPort: 'in' }],
};
{
    const host = t.host();
    const ed = createCanvasEditor(host, { catalogue, summarise: (n) => `about ${n.id}`,
        actions: [{ id: 'go', label: 'Go', run() {} }], slots: { toolbarEnd: (b) => b.append('end') } });
    ed.load({ graph });
    harvest(ed.el);
    ed.setFindings([{ node_id: 'violet', message: 'e', severity: 'error' }, { node_id: 'teal', message: 'w', severity: 'warning' },
                    { message: 'flow', severity: 'error' }]);
    ed.setRunOverlay({ banner: 'b', steps: { violet: { state: 'completed', line: 'done' }, teal: { state: 'skipped', line: 's' } },
                       ports: { violet: { out: { taken: false }, error: { taken: true, count: 2 } } } });
    ed.setActionState('go', { busy: true });
    ed.setMessage('careful', 'warning');
    harvest(ed.el);
    ed.setMessage('fine', 'ok');
    harvest(ed.el);
    ed.el.querySelector('.twm-flow-graph__port[data-direction="output"]').click();     // connecting
    harvest(ed.el);
    ed.el.querySelector('.twm-flow-graph__node[data-node-id="violet"]').click();
    harvest(ed.el);
    ed.el.querySelector('.twm-flow-graph__edge-hit').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
    harvest(ed.el);
    // a drag's ghost and the canvas taking a drop
    ed.el.querySelector('.twm-flow-graph__canvas .twm-canvas').getBoundingClientRect = () => (
        { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 });
    const item = ed.el.querySelector('.twm-flow-graph__palette-item:not(:disabled)');
    item.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 }));
    harvest(ed.el);
    harvest(document.querySelector('.twm-flow-graph__ghost'));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 300, clientY: 300 }));
    ed.setReadOnly({ reason: 'No.' });
    harvest(ed.el);
    ed.destroy();
    for (const kind of ['many', 'one', 'zero-or-many', 'one-or-many', 'zero-or-one', 'exactly-one']) {
        harvest(crowsFoot({ x: 0, y: 0 }, 'right', kind));
    }
}
const runtime = [...seen].filter((c) => c.startsWith('twm-'));

// ── SOURCE ──────────────────────────────────────────────────────────────
const sources = ['src/canvas', 'src/canvas/graph', 'src/flow/canvas_editor'].flatMap((dir) => readdirSync(join(t.root, dir))
    .filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(t.root, dir, f), 'utf8'))).join('\n');
const quoted = new Set();
for (const m of sources.matchAll(/['"`]([^'"`\n]*)['"`]/g)) {
    for (const c of m[1].matchAll(/(?:^|\s)(twm-(?:canvas|edge|flow-graph)[a-z0-9_-]*[a-z0-9])(?=\s|$)/g)) quoted.add(c[1]);
}
const toned = new Set();
for (const m of sources.matchAll(/toneClass\(\s*'([^']+)'/g)) for (const tone of TONES) toned.add(`${m[1]}--${tone}`);
const fromSource = [...quoted, ...toned];

/** A crow's foot's KIND modifier is a hook a consumer reads (and may style) — the
 *  marker's strokes are styled by `.twm-edge__marker line|circle`, whatever its kind. */
const HOOKS = /^twm-edge__marker--/;

t.section('§1 every class set has a rule');
t.ok('the harvest found the editor at work', runtime.filter((c) => OWN.test(c)).length > 60,
     `${runtime.filter((c) => OWN.test(c)).length} classes`);
t.check('runtime: an own class without a rule in the CANVAS section',
        runtime.filter((c) => OWN.test(c) && !HOOKS.test(c) && !sectionRules.has(c)), []);
t.check('runtime: any other twm class without a rule in the sheet',
        runtime.filter((c) => !OWN.test(c) && !allRules.has(c)), []);
t.check('source: a quoted own name without a rule', fromSource.filter((c) => !HOOKS.test(c) && !sectionRules.has(c)), []);
t.ok('source: the toned blocks were found', toned.size === 12, `${toned.size}`);
t.ok('the six kind hooks are what the crow\'s feet set', runtime.filter((c) => HOOKS.test(c)).length === 6);

t.section('§2 every rule names a class a module sets');
{
    const sets = new Set([...runtime, ...fromSource]);
    t.check('an own class in a CANVAS rule that no module sets', [...sectionRules].filter((c) => OWN.test(c) && !sets.has(c)), []);
    t.check('the CANVAS section styles no other block\'s classes but FlexDesk\'s button glyph and the icon font',
            [...sectionRules].filter((c) => !OWN.test(c)).sort(), ['material-symbols-outlined', 'twm-btn__glyph']);
}

t.section('§3 the node box is CANVAS_NODE');
{
    const px = (body, prop) => {
        const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*var\\(--twm-canvas-node-[a-z]+,\\s*(\\d+)px\\)`).exec(body || '');
        return m ? Number(m[1]) : null;
    };
    t.check('a node\'s width', px(ruleBody(SECTION, '.twm-flow-graph__node'), 'width'), CANVAS_NODE.width);
    t.check('its header\'s height', px(ruleBody(SECTION, '.twm-flow-graph__node-head'), 'height'), CANVAS_NODE.header);
    t.check('a row of ports', px(ruleBody(SECTION, '.twm-flow-graph__node-row'), 'height'), CANVAS_NODE.row);
    t.check('a port as tall as its row', px(ruleBody(SECTION, '.twm-flow-graph__port'), 'height'), CANVAS_NODE.row);
    t.ok('the header and the row are border-box, so a border does not move a port',
         /box-sizing:\s*border-box/.test(ruleBody(SECTION, '.twm-flow-graph__node-head'))
         && /box-sizing:\s*border-box/.test(ruleBody(SECTION, '.twm-flow-graph__node-row')));
    const editor = readFileSync(join(t.root, 'src/flow/canvas_editor/editor.js'), 'utf8');
    t.ok('and the editor sets the same three properties when a consumer changes the box',
         ['width', 'header', 'row'].every((p) => editor.includes(`'--twm-canvas-node-${p}'`)));
}

t.section('§4 the ground is seven layers');
{
    const body = ruleBody(SECTION, '.twm-canvas') || '';
    const image = /background-image:([\s\S]*?);\s*background-blend-mode/.exec(body)?.[1] || '';
    let depth = 0;
    let layers = 1;
    for (const ch of image) {
        if (ch === '(') depth += 1; else if (ch === ')') depth -= 1; else if (ch === ',' && depth === 0) layers += 1;
    }
    t.check('seven background images', layers, 7);
    t.check('seven blend modes', (/background-blend-mode:\s*([^;]+);/.exec(body)?.[1] || '').split(',').length, 7);
    t.ok('the edge layer takes no pointer, and a hit path opts back in',
         /pointer-events:\s*none/.test(ruleBody(SECTION, '.twm-canvas__edges'))
         && /pointer-events:\s*stroke/.test(ruleBody(SECTION, '.twm-flow-graph__edge-hit')));
    t.ok('the ghost never takes the pointer', /pointer-events:\s*none/.test(ruleBody(SECTION, '.twm-flow-graph__ghost')));
}

t.section('§5 [hidden] wins');
t.ok('one !important rule hides [hidden] inside the editor', /\.twm-flow-graph \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(SECTION));

t.done();
