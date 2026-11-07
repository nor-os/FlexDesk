/**
 * ONE SURFACE LADDER (0.18.3).
 *
 * FlexDesk's components paint one ladder of fills, lightest on top:
 *
 *     page          --surface-0       a tab, a window's body, a settings page
 *     bar, group    --surface-1       a header strip, a sidebar, a tile, a card
 *     raised        --surface-2       a row or card over a group
 *     sunken        --surface-well    a well below the page
 *     control       --surface-control / --border-control
 *
 * An application on FlexDesk found its screens inverted where FlexDesk's own
 * rules broke it: a tile header darker than its tile, a settings page lighter
 * than its sidebar, a chat shell painting over its host, the landing's and the
 * modal's palette (#1a1a1a chrome under a #212121 body) and a managed window
 * (#1a1a1a) off the ladder, a sortable row in a #2a2a2c literal, and a select
 * and a combobox in --surface-3 beside the flow kit's controls in
 * --twm-flow-control-bg. An embedder may not restyle FlexDesk's classes, so
 * the fix is here. jsdom resolves no `var()`, so this suite holds the text.
 *
 *   §1  tokens.css: the ladder is ordered, the control pair exists, and the
 *       kit's and the `--ea-*` aliases point at it
 *   §2  a tile's header takes the tile's fill
 *   §3  the settings view is a page with a bar beside it
 *   §4  the chat shell paints no fill of its own
 *   §5  a managed window, a modal, the landing and a sortable row are on it
 *   §6  every text box, select and combobox is a control, and no rule paints
 *       one in --surface-3
 *
 *     node tests/surface_ladder.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ruleBody, stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = readFileSync(resolve(HERE, '../css/tokens.css'), 'utf8');
const FLEX = readFileSync(resolve(HERE, '../css/flexdesk.css'), 'utf8');

let failures = 0;
const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const check = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** The value of `prop` in a rule body, or null. */
const decl = (body, prop) => {
    const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`).exec(stripComments(body || ''));
    return m ? m[1].trim() : null;
};
/** What a `:root` token is declared as in tokens.css. */
const token = (name) => decl(ruleBody(TOKENS, ':root'), name);
/** A token's hex, through any chain of `var(--x)` aliases. */
const hex = (name) => {
    let v = token(name);
    for (let i = 0; v && i < 8; i++) {
        const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
        if (!m) break;
        v = token(m[1]);
    }
    return v;
};
const luminance = (h) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return NaN;
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const bg = (selector) => decl(ruleBody(FLEX, selector), 'background');

// ── §1 ─────────────────────────────────────────────────────────────────────
console.log('§1 the ladder in tokens.css');
{
    const rungs = ['--surface-well', '--surface-0', '--surface-1', '--surface-2'];
    for (const r of [...rungs, '--surface-control', '--border-control']) {
        ok(`${r} is a colour`, /^#[0-9a-f]{6}$/i.test(token(r) || ''), String(token(r)));
    }
    for (let i = 1; i < rungs.length; i++) {
        ok(`${rungs[i - 1]} is darker than ${rungs[i]}`,
           luminance(hex(rungs[i - 1])) < luminance(hex(rungs[i])));
    }
    ok('a control is lighter than the page it sits on',
       luminance(hex('--surface-control')) > luminance(hex('--surface-0')));
    check('the kit\'s control fill is the control', token('--twm-flow-control-bg'), 'var(--surface-control)');
    check('the kit\'s control border is the control\'s', token('--twm-flow-control-border'), 'var(--border-control)');
    check('--ea-bg-chrome is a bar', token('--ea-bg-chrome'), 'var(--surface-1)');
    check('--ea-bg-content is a page', token('--ea-bg-content'), 'var(--surface-0)');
    check('--ea-bg-well is sunken', token('--ea-bg-well'), 'var(--surface-well)');
    check('--ea-input-bg is a control', token('--ea-input-bg'), 'var(--surface-control)');
}

// ── §2 ─────────────────────────────────────────────────────────────────────
console.log('\n§2 a tile and its header');
check('a tile is a group', bg('.tile'), 'var(--surface-1)');
check('its header takes the tile\'s fill', bg('.tile-header'), 'transparent');

// ── §3 ─────────────────────────────────────────────────────────────────────
console.log('\n§3 the settings view');
check('the settings are the page', bg('.twm-settings'), 'var(--surface-0)');
check('the sidebar is a bar beside it', bg('.twm-settings__sidebar'), 'var(--surface-1)');

// ── §4 ─────────────────────────────────────────────────────────────────────
console.log('\n§4 the chat shell');
check('it paints no fill of its own', bg('.twm-chat-shell'), 'transparent');

// ── §5 ─────────────────────────────────────────────────────────────────────
console.log('\n§5 windows, the modal, the landing, a sortable row');
check('a managed window\'s body is a page', bg('.twm-managed-window'), 'var(--surface-0)');
check('its title bar is a bar', bg('.twm-managed-window__topbar'), 'var(--surface-1)');
check('a modal is a page', bg('.twm-managed-window.twm-managed-window--modal'), 'var(--ea-bg-content)');
check('a modal\'s content is a page', bg('.twm-managed-window--modal .twm-managed-window__content'), 'var(--ea-bg-content)');
ok('a modal\'s title strip is a bar',
   /var\(--ea-bg-chrome\)\s*$/.test(bg('.twm-managed-window--modal .twm-managed-window__topbar') || ''));
check('a modal\'s actions strip is a bar', bg('.twm-managed-window--modal .twm-modal__actions'), 'var(--ea-bg-chrome)');
check('the landing is a page', bg('.twm-landing'), 'var(--ea-bg-content)');
check('a landing pane\'s head is a bar', bg('.twm-landing__pane-head'), 'var(--ea-bg-chrome)');
check('a landing table is a page', bg('.twm-landing__table'), 'var(--ea-bg-content)');
check('a landing table\'s head is a bar', bg('.twm-landing__table thead th'), 'var(--ea-bg-chrome)');
check('the landing\'s actions strip is a bar', bg('.twm-landing__actions'), 'var(--ea-bg-chrome)');
check('a sortable row is raised', bg('.twm-sortable-list__row'), 'var(--surface-2)');
check('the add button is raised', bg('.twm-sortable-list__add'), 'var(--surface-2)');
ok('the sortable list reads no literal fill',
   !['.twm-sortable-list__row', '.twm-sortable-list__add', '.twm-sortable-list__empty']
       .some((s) => /#[0-9a-f]{3,6}\b|rgba?\(/i.test(bg(s) || '')));

// ── §6 ─────────────────────────────────────────────────────────────────────
console.log('\n§6 every control is the control');
{
    const MODAL_INPUTS = ['input[type="text"]', 'input[type="number"]', 'input[type="password"]',
        'input[type="search"]', 'input[type="email"]', 'select', 'textarea'];
    const CONTROLS = [
        '.twm-select',
        '.twm-combobox__input',
        '.twm-tag-input',
        '.twm-chat__input',
        '.twm-sortable-list__input',
        '.nb-search-bar__input',
        '.twm-plot-config__input',
        '.twm-plot-config .twm-color-field__hex',
        '.twm-series-transforms__param',
        MODAL_INPUTS.map((s) => `.twm-managed-window--modal .twm-modal__row ${s}`).join(', '),
        MODAL_INPUTS.map((s) => `.twm-modal__row ${s}`).join(', '),
    ];
    for (const sel of CONTROLS) {
        const body = ruleBody(FLEX, sel);
        const name = sel.length > 60 ? `${sel.slice(0, 57)}...` : sel;
        ok(`${name} has a rule`, body !== null);
        check(`${name} fills as a control`, decl(body, 'background'), 'var(--surface-control)');
        ok(`${name} is bordered as a control`, /var\(--border-control\)/.test(decl(body, 'border') || ''),
           String(decl(body, 'border')));
    }
    // The flow kit and the settings view read the control through their
    // aliases (§1); each still reads its alias.
    check('.twm-flow-input fills through the kit\'s alias', bg('.twm-flow-input'), 'var(--twm-flow-control-bg)');
    check('a settings field fills through --ea-input-bg',
          bg('.twm-settings__select, .twm-settings__number, .twm-settings__text'), 'var(--ea-input-bg)');

    // No rule paints a text box, select or combobox in --surface-3, the fill
    // the select and the combobox had. A hover over a control is not one.
    const CONTROL_SELECTOR = /(?:^|[\s.>_-])(?:input|textarea|select|combobox)(?:\b|_)/;
    const offenders = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    const text = stripComments(FLEX);
    let m;
    while ((m = re.exec(text)) !== null) {
        const selectors = m[1].trim().split(/\s*,\s*/).filter((s) => !/:hover|:active/.test(s));
        if (!selectors.some((s) => CONTROL_SELECTOR.test(s))) continue;
        const fill = decl(m[2], 'background') || decl(m[2], 'background-color') || '';
        if (/var\(--surface-3\b/.test(fill)) offenders.push(m[1].trim().replace(/\s+/g, ' '));
    }
    ok('no control is painted --surface-3', offenders.length === 0, offenders.join(' | '));
}

if (failures) {
    console.error(`\nsurface_ladder: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\nsurface_ladder: all passed');
