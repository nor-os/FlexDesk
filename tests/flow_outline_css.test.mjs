/**
 * EVERY CLASS THE OUTLINE SETS HAS A RULE, AND EVERY RULE NAMES A CLASS THE
 * OUTLINE SETS (36 §3.12, §8) — the defect family "a class one side knows and
 * the other has never heard of", which no jsdom suite can see, because jsdom
 * applies no stylesheet.
 *
 * The classes the outline sets are gathered two ways, and both are checked:
 *
 *   RUNTIME — the editor mounted in every state it draws (a draft with every
 *     block, a step's panel, findings in both tones, a run with every pill
 *     tone and an untaken arm, a find, folds, a refused and a consumer's
 *     read-only, a drag with its ghost and a refused drop, the step menu with
 *     its flyout, an action refused and one busy) and every `twm-` class in
 *     the DOM collected;
 *   SOURCE — every quoted `twm-flow-outline…` name in an outline module, and
 *     each block `toneClass(block, …)` is called with, times the six tones.
 *
 *   §1  each class the outline sets has a rule — a `twm-flow-outline` one in
 *       the OUTLINE section, any other (the kit's, FlexDesk's button) in the sheet
 *   §2  each class an OUTLINE rule names is one the outline sets
 *   §3  the numbers the module and the sheet share: 22px a level, the guides
 *   §4  base.css's OUTLINE section is flexdesk.css's (the hand-mirror)
 *
 *     node tests/flow_outline_css.test.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowEnv } from './flow_env.mjs';
import { stripComments } from './css_rules.mjs';

const t = await flowEnv('flow outline — css');
const { BLOCKS, catalogue, entry } = await import('./flow_outline_fixtures.mjs');
const kit = await import('../src/flow/kit/index.js');
const { createOutlineEditor, OUTLINE_INDENT } = await import('../src/flow/outline/index.js');
const { document, window } = t;

const section = (sheet) => {
    const start = sheet.indexOf('/* ══ FLOW · OUTLINE ');
    const end = sheet.indexOf('/* ══ end FLOW · OUTLINE ══ */');
    return sheet.slice(start, end + '/* ══ end FLOW · OUTLINE ══ */'.length);
};
const FLEX = t.css('flexdesk.css');
const BASE = t.css('base.css');
const OUTLINE = stripComments(section(FLEX));
const ALL = stripComments(FLEX);
const classesIn = (css) => {
    const out = new Set();
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
    }
    return out;
};
const outlineRules = classesIn(OUTLINE);
const allRules = classesIn(ALL);

// ── RUNTIME: mount everything ───────────────────────────────────────────
const seen = new Set();
const harvest = (root) => {
    if (!root) return;
    for (const n of [root, ...root.querySelectorAll('*')]) for (const c of n.classList || []) seen.add(c);
};
const cat = catalogue();
const SYNC = entry('sync-applications').graph;
const mount = (graph, opts = {}) => {
    const host = t.host();
    const ed = createOutlineEditor(host, {
        catalogue: cat, widgets: kit.createWidgetRegistry(), blocks: BLOCKS,
        references: { template: kit.TEMPLATE_REFERENCES, formula: kit.FORMULA_REFERENCES },
        values: async () => [], summarise: (n) => (n.type === 'condition' ? { text: 'x > 0', mono: true } : 'a line'),
        actions: [{ id: 'save', label: 'Save' }, { id: 'publish', label: 'Publish', primary: true, icon: 'publish' }],
        slots: { toolbarEnd: (b) => b.append('acts as'), stepPanel: (b) => b.append('last run') }, ...opts,
    });
    ed.load({ graph: structuredClone(graph) });
    return { ed, host };
};
{
    const { ed, host } = mount(SYNC);
    harvest(host);
    ed.select('check');
    harvest(host);
    ed.setFindings([{ node_id: 'invite', field: 'url', message: 'e', severity: 'error' },
                    { node_id: 'check', message: 'w', severity: 'warning' }, { message: 'flow', severity: 'error' }]);
    ed.setActionState('publish', { disabled: true, reason: 'Fix it first' });
    ed.setActionState('save', { busy: true });
    ed.setStatus('draft');
    harvest(host);
    ed.setRunOverlay({ banner: 'Drawn on version 4.', steps: {
        fetch: { state: 'completed' }, portaldown: { state: 'skipped' }, save: { state: 'running' },
        check: { state: 'failed' }, checkfail: { state: 'completed', tone: 'warn' }, tell: { state: 'cancelled' },
        merged: { state: 'completed', line: 'both' } },
        ports: { fetch: { error: { taken: false } }, check: { error: { taken: true, count: 2 } }, each: { next: { count: 3 } } } });
    harvest(host);
    ed.setRunOverlay(null);
    ed.setFolds(['each']);
    harvest(host);
    ed.setFolds([]);
    const find = host.querySelector('.twm-flow-outline__find');
    t.typeInto(find, 'invitation');
    harvest(host);
    t.typeInto(find, 'zebra');
    harvest(host);
    t.typeInto(find, '');
    // the step menu, its flyout, a refused and a dangerous verb
    t.press(host.querySelector('[data-step="invite"] > .twm-flow-outline__row .twm-flow-outline__menu'));
    harvest(kit.openFlowPopover());
    t.press(kit.openFlowPopover().querySelector('[data-item="wrap"]'));
    harvest(kit.openFlowPopover());
    kit.closeFlowPopovers();
    // a drag: the ghost, the line, a refused place
    let layout = 0;
    const real = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function r() {
        if (host.contains(this) && this.classList.contains('twm-flow-outline__row')) {
            const i = [...host.querySelectorAll('.twm-flow-outline__row')].indexOf(this);
            return { left: 0, top: i * 40, right: 440, bottom: i * 40 + 40, width: 440, height: 40 };
        }
        layout += 1;
        return real.call(this);
    };
    const pointer = (type, target, y) => target.dispatchEvent(new window.MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 20, clientY: y }));
    const rows = () => [...host.querySelectorAll('.twm-flow-outline__row')];
    const at = (id) => rows().indexOf(host.querySelector(`[data-step="${id}"] > .twm-flow-outline__row`)) * 40;
    pointer('pointerdown', host.querySelector('[data-step="tell"] .twm-flow-outline__grip'), at('tell') + 20);
    pointer('pointermove', document, at('summary') + 38);
    harvest(document.body);
    pointer('pointercancel', document, 0);
    pointer('pointerdown', host.querySelector('[data-step="check"] .twm-flow-outline__grip'), at('check') + 20);
    pointer('pointermove', document, at('portaldown') + 38);
    harvest(document.body);
    pointer('pointercancel', document, 0);
    window.HTMLElement.prototype.getBoundingClientRect = real;
    void layout;
    ed.destroy();
}
{
    const { ed, host } = mount(entry('refuse-jump-between-branches').graph);
    harvest(host);
    ed.destroy();
    const ro = mount(SYNC, { readOnly: { reason: 'A run.' } });
    harvest(ro.host);
    ro.ed.destroy();
    const empty = mount(entry('empty-flow').graph);
    harvest(empty.host);
    empty.ed.destroy();
    // A branch arm: Then, Otherwise; a consumer tone the sheet does not know is the plain arm.
    const toned = mount(SYNC, { blocks: { ...BLOCKS, branch: { ...BLOCKS.branch, arms: { true: { label: 'Yes', tone: 'pink' }, false: 'No' } } } });
    harvest(toned.host);
    toned.ed.destroy();
}
const runtime = [...seen].filter((c) => c.startsWith('twm-'));

// ── SOURCE: every quoted name, and every toned block ────────────────────
const DIR = join(t.root, 'src/flow/outline');
const source = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
const quoted = new Set();
for (const m of source.matchAll(/['"`]([^'"`\n]*)['"`]/g)) {
    for (const c of m[1].matchAll(/(?:^|\s)(twm-flow-outline[a-z0-9_-]*[a-z0-9]|twm-flow-popover--[a-z]+)(?=\s|$)/g)) quoted.add(c[1]);
}
const toned = new Set();
for (const m of source.matchAll(/toneClass\(\s*'([^']+)'/g)) for (const tone of kit.TONES) toned.add(`${m[1]}--${tone}`);
const fromSource = [...quoted, ...toned];
const mine = (c) => c.startsWith('twm-flow-outline') || c === 'twm-flow-popover--menu';

t.section('§1 every class the outline sets has a rule');
t.ok('the harvest found the editor at work', runtime.filter(mine).length > 90, `${runtime.filter(mine).length} classes`);
t.check('runtime: an outline class without a rule in the OUTLINE section',
        runtime.filter((c) => mine(c) && !outlineRules.has(c)), []);
t.check('runtime: any other twm class without a rule in the sheet',
        runtime.filter((c) => !mine(c) && !allRules.has(c)), []);
t.check('source: a quoted outline name without a rule', fromSource.filter((c) => !outlineRules.has(c)), []);
t.ok('source: the toned blocks were found (the chips, the menu\'s chips)', toned.size >= 12, `${toned.size}`);
t.ok('an arm in a tone the sheet does not know draws no class for it', !seen.has('twm-flow-outline__row--pink'));

t.section('§2 every rule names a class the outline sets');
{
    const sets = new Set([...runtime, ...fromSource]);
    t.check('an outline class in an OUTLINE rule that no outline module sets',
            [...outlineRules].filter((c) => mine(c) && !sets.has(c)), []);
    t.check('the OUTLINE section styles no other block\'s classes but FlexDesk\'s button and the icon font',
            [...outlineRules].filter((c) => !mine(c)).sort(), ['material-symbols-outlined', 'twm-btn']);
}

t.section('§3 the numbers the module and the sheet share');
{
    const row = /\.twm-flow-outline__row\s*\{[^}]*padding-left:\s*calc\(8px \+ var\(--twm-outline-depth, 0\) \* (\d+)px\)/.exec(OUTLINE);
    t.check('a level is OUTLINE_INDENT px in the sheet', Number(row?.[1]), OUTLINE_INDENT);
    const guide = /\.twm-flow-outline__guide\s*\{[^}]*left:\s*calc\(14px \+ var\(--twm-outline-guide, 0\) \* (\d+)px\)/.exec(OUTLINE);
    t.check('a guide is a level apart too (the mock\'s 14px + 22px a level)', Number(guide?.[1]), OUTLINE_INDENT);
    for (const sel of ['twm-flow-outline__row--arm', 'twm-flow-outline__row--foot', 'twm-flow-outline__gap', 'twm-flow-outline__drop']) {
        const m = new RegExp(`\\.${sel}\\s*\\{[^}]*\\* (\\d+)px`).exec(OUTLINE);
        t.check(`${sel} indents by the same step`, Number(m?.[1]), OUTLINE_INDENT);
    }
    t.ok('[hidden] wins inside the outline and the menu', /\.twm-flow-outline \[hidden\][^{]*\{\s*display:\s*none !important/.test(OUTLINE));
}

t.section('§4 the hand-mirror');
t.check('base.css carries the same OUTLINE section, byte for byte', section(BASE), section(FLEX));

t.done();
