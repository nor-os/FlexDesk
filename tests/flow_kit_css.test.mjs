/**
 * EVERY CLASS THE KIT SETS HAS A RULE, AND EVERY RULE NAMES A CLASS THE KIT
 * SETS (36 §3.12, §8) — the defect family "a class one side knows and the other
 * has never heard of", which no jsdom suite can see, because jsdom applies no
 * stylesheet.
 *
 * The classes the kit sets are gathered two ways, and both are checked:
 *
 *   RUNTIME — every kit component is mounted in many states (each widget, a
 *     folded group, findings, actions, read-only, every tone, an unknown chip,
 *     both pickers at their every level, the strip in both tones) and every
 *     `twm-` class in the DOM is collected;
 *   SOURCE — every quoted `twm-flow-…` name in a kit module, and each block
 *     `toneClass(block, …)` is called with, times the six tones.
 *
 *   §1  each class the kit sets has a rule — a `twm-flow-` one in the KIT
 *       section, any other (FlexDesk's own `twm-btn`) somewhere in the sheet
 *   §2  each `twm-flow-` class a KIT rule names is one the kit sets
 *   §3  the [hidden] rule wins over the blocks' `display: flex`
 *
 *     node tests/flow_kit_css.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowEnv } from './flow_env.mjs';
import { stripComments } from './css_rules.mjs';

const t = await flowEnv('flow kit — css');
const kit = await import('../src/flow/kit/index.js');
const { document, window } = t;

const sheet = t.css('flexdesk.css');
const start = sheet.indexOf('/* ══ FLOW · KIT ');
const end = sheet.indexOf('/* ══ end FLOW · KIT ══ */');
const KIT = stripComments(sheet.slice(start, end));
const ALL = stripComments(sheet);
const classesIn = (css) => {
    const out = new Set();
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
    }
    return out;
};
const kitRules = classesIn(KIT);
const allRules = classesIn(ALL);

// ── RUNTIME: mount everything ───────────────────────────────────────────
const seen = new Set();
const harvest = (root) => {
    for (const n of [root, ...root.querySelectorAll('*')]) for (const c of n.classList || []) seen.add(c);
};
const widgets = kit.createWidgetRegistry();
const refs = { template: kit.TEMPLATE_REFERENCES, formula: kit.FORMULA_REFERENCES };
const describe = kit.createReferenceSyntax({ name: 't', pattern: kit.TEMPLATE_REFERENCES.pattern,
    format: kit.TEMPLATE_REFERENCES.format, describe: (m) => ({ label: m.path, tone: m.path, known: m.path !== 'gone' }) });
{
    const host = t.host();
    const panel = kit.createSettingsPanel({ widgets, references: { template: describe, formula: kit.FORMULA_REFERENCES },
        host, values: async () => [], columns: () => [{ name: 'id', type: 'integer' }] });
    const schema = { type: 'object', required: ['url'], properties: {
        method: { type: 'string', enum: ['GET', 'POST'] }, flag: { type: 'boolean' }, n: { type: 'integer' },
        note: { type: 'string', 'x-ui-multiline': true }, name: { type: 'string' },
        url: { type: 'string', 'x-ui-widget': 'template', description: 'Where.' },
        expr: { type: 'string', 'x-ui-widget': 'expression' }, body: { 'x-ui-widget': 'json-body' },
        map: { 'x-ui-widget': 'key-value-map' }, list: { 'x-ui-widget': 'key-value-list' },
        strs: { 'x-ui-widget': 'string-list' },
        chips: { 'x-ui-widget': 'enum-chips', items: { enum: ['a', 'b'] } },
        cards: { enum: ['x', 'y'], 'x-ui-widget': 'choice-cards', 'x-ui-enum-descriptions': { x: 'A sentence.' } },
        col: { 'x-ui-widget': 'upstream-column' }, cols: { 'x-ui-widget': 'upstream-columns' },
        unknown: { 'x-ui-widget': 'nobody-has-this' }, arr: { type: 'array' },
        retry: { type: 'object', 'x-ui-fold': true, properties: { max: { type: 'integer' } } },
    } };
    const value = { url: 'a ${violet} ${teal} ${amber} ${grey} ${blue} ${indigo} ${gone}', map: { k: 'v' },
                    list: [{ variable: 'x', value: 1 }, { variable: 'y', expression: '[a]' }], strs: ['s'],
                    chips: ['a', 'zz'], cols: ['id', 'missing'] };
    for (const tone of kit.TONES) {
        panel.show({ step: { id: 's', type: 'x', config: value }, type: { config_schema: schema }, title: 'T', typeLabel: 'Type',
                     where: 'Here', description: 'D', idLine: 'I', icon: 'public', tone, rename: true,
                     extra: [{ note: 'A note.' }, { note: 'Careful.', tone: 'warning' }, { note: 'Info.', tone: 'info' }],
                     actions: [{ id: 'a', label: 'Act' }, { id: 'b', label: 'No', disabled: true, reason: 'Why not.' }],
                     slots: { before: (b) => b.append('x'), after: (b) => b.append('y') } });
        panel.setFindings([{ node_id: 's', field: 'url', message: 'e', severity: 'error' },
                           { node_id: 's', field: 'name', message: 'w', severity: 'warning' },
                           { node_id: 's', message: 'loose', severity: 'error' },
                           { node_id: 's', message: 'loose w', severity: 'warning' }]);
        harvest(panel.el);
    }
    panel.setReadOnly({ reason: 'Read only.' });
    harvest(panel.el);
    host.querySelector('[contenteditable]').replaceChildren();
    const empty = kit.createChipInput({ value: '', placeholder: 'p', multiline: true, mono: true });
    harvest(empty.el);
    panel.destroy();
}
{
    const anchor = document.body.appendChild(document.createElement('button'));
    const p = kit.openStepPicker({ anchor, paste: {}, where: 'w', categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', layout: 'grid' }],
        entries: [...kit.TONES.map((tone, i) => ({ id: `e${i}`, label: 'E', sub: 's', description: 'd', tone, category: i % 2 ? 'b' : 'a' })),
                  { id: 'r', label: 'R', refusal: 'No.', category: 'a' }] });
    const pop = kit.openFlowPopover();
    harvest(pop);
    t.typeInto(pop.querySelector('input'), 'zebra');
    harvest(pop);
    kit.closeFlowPopovers();
    await p;
    const v = kit.openValuePicker({ anchor, note: 'n', groups: [
        { id: 'g', label: 'G', sub: 's', layout: 'grid', items: [{ label: 'a', type: 't', ref: '${a}' }] },
        { id: 'h', label: 'H', items: [{ label: 'b', ref: '${b}', children: [{ label: 'c', ref: '${b.c}' }] }] },
        { id: 'e', label: 'E', items: [], empty: 'none' }] });
    const vp = kit.openFlowPopover();
    harvest(vp);
    t.press([...vp.querySelectorAll('[role="option"]')].find((o) => o.textContent.startsWith('b')));
    harvest(vp);
    t.typeInto(vp.querySelector('input'), 'zebra');
    harvest(vp);
    kit.closeFlowPopovers();
    await v;
    const strip = kit.createFindingsStrip({ onGoTo: () => {} });
    strip.set([{ message: 'a', severity: 'error', node_id: 'x' }, { message: 'b', severity: 'warning' }]);
    harvest(strip.el);
    strip.set([{ message: 'b', severity: 'warning' }]);
    harvest(strip.el);
}
const runtime = [...seen].filter((c) => c.startsWith('twm-'));

// ── SOURCE: every quoted name, and every toned block ────────────────────
const KIT_DIR = join(t.root, 'src/flow/kit');
const source = readdirSync(KIT_DIR).filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(KIT_DIR, f), 'utf8')).join('\n');
const quoted = new Set();
for (const m of source.matchAll(/['"`]([^'"`\n]*)['"`]/g)) {
    for (const c of m[1].matchAll(/(?:^|\s)(twm-flow-[a-z0-9_-]*[a-z0-9])(?=\s|$)/g)) quoted.add(c[1]);
}
const toned = new Set();
for (const m of source.matchAll(/toneClass\(\s*'([^']+)'/g)) for (const tone of kit.TONES) toned.add(`${m[1]}--${tone}`);
const fromSource = [...quoted, ...toned];

t.section('§1 every class the kit sets has a rule');
t.ok('the harvest found the kit at work', runtime.length > 120, `${runtime.length} classes`);
t.check('runtime: a twm-flow class without a rule in the KIT section',
        runtime.filter((c) => c.startsWith('twm-flow-') && !kitRules.has(c)), []);
t.check('runtime: any other twm class without a rule in the sheet',
        runtime.filter((c) => !c.startsWith('twm-flow-') && !allRules.has(c)), []);
t.check('source: a quoted twm-flow name without a rule', fromSource.filter((c) => !kitRules.has(c)), []);
t.ok('source: the toned blocks were found', toned.size >= 18, `${toned.size}`);

t.section('§2 every rule names a class the kit sets');
{
    const sets = new Set([...runtime, ...fromSource]);
    t.check('a twm-flow class in a KIT rule that no kit module sets',
            [...kitRules].filter((c) => c.startsWith('twm-flow-') && !sets.has(c)), []);
    t.check('the KIT section styles no other block\'s classes but FlexDesk\'s button and the icon font',
            [...kitRules].filter((c) => !c.startsWith('twm-flow-')).sort(),
            ['material-symbols-outlined', 'twm-btn', 'twm-btn__glyph']);
}

t.section('§3 [hidden] wins');
{
    const rule = /([^{}]*)\{\s*display:\s*none\s*!important;?\s*\}/.exec(KIT);
    const selectors = rule ? rule[1].split(',').map((s) => s.trim()) : [];
    t.ok('one !important rule hides [hidden] inside the panel, the popover and the strip',
         ['.twm-flow-panel [hidden]', '.twm-flow-popover [hidden]', '.twm-flow-strip[hidden]'].every((s) => selectors.includes(s)),
         selectors.join(' | '));
}

void window;
t.done();
