/**
 * BUG-0025 — `SplitPaneContainer`, `EditorPane` and `NotebookSearchBar` ship
 * with their CSS. Before the fix none of `.split-pane*`, `.editor-pane*` or
 * `.nb-search-bar*` had a rule in any FlexDesk stylesheet, so with only
 * FlexDesk CSS a split stacked its panes, the divider had zero width and could
 * not be grabbed, and the search bar was unstyled.
 *
 * The steps to reproduce, run: with `tokens.css` + `reset.css` + `flexdesk.css`
 * and nothing else in the document, a split `SplitPaneContainer` of two
 * `EditorPane`s is mounted and a `NotebookSearchBar` is opened in one of them.
 *
 *   §1  every class the three components set has a rule (the harvest is from
 *       the mounted DOM, in every state the bug names), in BOTH `flexdesk.css`
 *       and `base.css`, the sheet it is extracted from
 *   §2  the layout the bug expected: panes side by side, a divider with a
 *       width that does not shrink and a col-resize cursor, a search bar hidden
 *       until it is opened — read through jsdom's cascade where jsdom has one
 *       (`display`, `flex-direction`, `cursor`, `position`) and from the rule
 *       text where it does not (flex shorthands, `var()` colours)
 *   §3  the pane's tab bar is a fixed row, not the tile strip's `height: 100%`
 *       that would leave the body no height
 *   §4  the divider still drags: a mousedown/move/up changes the ratio
 *
 * And one defect the harvest found: `SplitPaneContainer.setPanes()` replaced
 * a pane's classes with `split-pane`, so an `EditorPane` lost `.editor-pane`
 * the moment it was placed; it now adds the class (§2).
 *
 *     node tests/editor_panes_css.test.mjs
 */
import { flowEnv } from './flow_env.mjs';
import { ruleBody, stripComments, specificity, compareSpecificity } from './css_rules.mjs';

const t = await flowEnv('editor panes — css');
const { document, window } = t;
const { SplitPaneContainer, EditorPane, NotebookSearchBar } = await import('../editor.js');

const FLEX = t.css('flexdesk.css');
const BASE = t.css('base.css');
for (const name of ['tokens.css', 'reset.css', 'flexdesk.css']) {
    const style = document.createElement('style');
    style.textContent = t.css(name);
    document.head.appendChild(style);
}

// ── the steps to reproduce ──────────────────────────────────────────────
const root = t.host();
const split = new SplitPaneContainer();
split.mount(root);
const left = new EditorPane('left', {});
const right = new EditorPane('right', {});
const leftEl = left.mount();
const rightEl = right.mount();
split.setPanes(leftEl, rightEl);
left.setFocused(true);
left.syncTabBar([{ filePath: 'a.txt', fileType: 'text', isDirty: false }], 'a.txt');
right.syncTabBar([{ filePath: 'b.txt', fileType: 'text', isDirty: false }], 'b.txt');

const editorContainer = leftEl.querySelector('.notebook-editor-container');
const bar = new NotebookSearchBar(editorContainer, {
    getCells: () => [], getCellRenderer: () => null, getCellElement: () => null, scrollToCell: () => {},
});
const barEl = editorContainer.querySelector('.nb-search-bar');
const closedDisplay = barEl && window.getComputedStyle(barEl).display;
bar.open(true);
// Every toggle once, so `--active` is in the DOM.
for (const a of ['case', 'word', 'regex']) barEl.querySelector(`[data-action="${a}"]`).click();
// A query with no match, so `--no-results` is too.
t.typeInto(barEl.querySelector('.nb-search-bar__find-input'), 'zzz');
t.fire(barEl.querySelector('.nb-search-bar__find-input'), 'input');
const divider = root.querySelector('.split-pane-divider');
t.mouse('mousedown', divider);

// ── §1 every class has a rule ──────────────────────────────────────────
t.section('§1 every class the three components set has a rule');
const OWN = /^(split-pane|editor-pane|nb-search-bar|notebook-editor-container$)/;
// Hooks the JS queries by and never styles: they sit beside a styled class
// on the same element (`__btn`, `__input`).
const HOOKS = new Set(['nb-search-bar__toggle-replace', 'nb-search-bar__find-input', 'nb-search-bar__replace-input']);
const seen = new Set();
for (const n of [root, ...root.querySelectorAll('*')]) for (const c of n.classList) if (OWN.test(c)) seen.add(c);
const classesIn = (css) => {
    const out = new Set();
    for (const m of stripComments(css).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
    }
    return out;
};
const inFlex = classesIn(FLEX);
const inBase = classesIn(BASE);
t.ok('the harvest found the three components at work', seen.size >= 20, `${seen.size} classes`);
for (const c of ['split-pane-container', 'split-pane-container--split', 'split-pane', 'split-pane-divider',
                 'split-pane-divider--active', 'editor-pane', 'editor-pane--focused', 'editor-pane__body',
                 'nb-search-bar', 'nb-search-bar--open', 'nb-search-bar__btn--active',
                 'nb-search-bar__match-info--no-results']) {
    t.ok(`the mounted DOM carries .${c}`, seen.has(c));
}
for (const c of [...seen].sort()) {
    if (HOOKS.has(c)) continue;
    t.ok(`.${c} has a rule in flexdesk.css`, inFlex.has(c));
    t.ok(`.${c} has a rule in base.css`, inBase.has(c));
}

// ── §2 the layout the bug expected ──────────────────────────────────────
t.section('§2 side-by-side panes, a draggable divider, a styled search bar');
const cs = (el) => window.getComputedStyle(el);
t.check('the container is a flex row', [cs(root).display, cs(root).flexDirection], ['flex', 'row']);
t.check('the split is pane, divider, pane',
    [...root.children].map((c) => ['split-pane', 'split-pane-divider'].find((k) => c.classList.contains(k))),
    ['split-pane', 'split-pane-divider', 'split-pane']);
// `setPanes()` used to ASSIGN `className = 'split-pane'`, wiping `.editor-pane`
// off the pane it was handed — and with it every rule below that reaches a
// pane by it (the fixed tab-bar row, the focus mark).
t.check('setPanes() keeps the pane\'s own class', [leftEl, rightEl].map((p) => p.classList.contains('editor-pane')), [true, true]);
split.unsplit();
split.setPanes(leftEl);
t.ok('a single pane keeps it too', leftEl.classList.contains('editor-pane') && leftEl.classList.contains('split-pane'));
split.setPanes(leftEl, rightEl);
t.check('each pane is a flex column', [cs(leftEl).display, cs(leftEl).flexDirection], ['flex', 'column']);
t.check('the divider shows a col-resize cursor', cs(divider).cursor, 'col-resize');
const dividerRule = ruleBody(FLEX, '.split-pane-divider');
t.ok('the divider has a width', /(^|;)\s*width:\s*4px/.test(dividerRule), dividerRule);
t.ok('the divider never shrinks', /flex:\s*0 0 4px/.test(dividerRule), dividerRule);
t.ok('the divider has a wider hit target', /inset:\s*0 -3px/.test(ruleBody(FLEX, '.split-pane-divider::before') || ''));
t.ok('the divider lights while dragged',
    /background:\s*var\(--accent-bright/.test(ruleBody(FLEX, '.split-pane-divider:hover, .split-pane-divider--active') || ''));
t.check('the body anchors the editor container', cs(leftEl.querySelector('.editor-pane__body')).position, 'relative');
t.check('the editor container fills the body', cs(editorContainer).position, 'absolute');
t.check('the search bar is hidden until opened', closedDisplay, 'none');
t.check('the open search bar is a flex column', [cs(barEl).display, cs(barEl).flexDirection], ['flex', 'column']);
t.check('the open search bar sticks to the top', cs(barEl).position, 'sticky');
t.check('its rows are flex rows', cs(barEl.querySelector('.nb-search-bar__find-row')).display, 'flex');
const btn = barEl.querySelector('.nb-search-bar__btn');
t.check('its buttons are square, borderless-looking icon buttons',
    [cs(btn).display, cs(btn).cursor], ['inline-flex', 'pointer']);
t.ok('its buttons read tokens', /var\(--radius-sm\)/.test(ruleBody(FLEX, '.nb-search-bar__btn') || ''));
t.ok('its inputs read tokens', /var\(--surface-3\)/.test(ruleBody(FLEX, '.nb-search-bar__input') || ''));
// The icon rule must out-rank Google's single-class `.material-symbols-outlined`.
t.ok('the button glyph wins the Material Symbols tie',
    compareSpecificity(specificity('.nb-search-bar__btn .material-symbols-outlined'),
                       specificity('.material-symbols-outlined')) > 0
    && ruleBody(FLEX, '.nb-search-bar__btn .material-symbols-outlined') !== null);
t.ok('the section reads no literal colour (#hex, rgb(), hsl()) outside a var() fallback', (() => {
    const s = FLEX.slice(FLEX.indexOf('/* ══ EDITOR · PANES'), FLEX.indexOf('/* ══ end EDITOR · PANES'));
    // Drop every var(--token[, fallback]) first; whatever colour is left is hard-coded.
    const bare = stripComments(s).replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, '');
    return !/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(bare);
})());

// ── §3 the tab bar is a fixed row inside a pane ─────────────────────────
t.section('§3 the pane tab bar does not take the body\'s height');
const tabs = leftEl.firstElementChild;
t.check('the pane\'s first child is the tab bar', tabs.className, 'tabs notebook-tabs');
const tabsRule = ruleBody(FLEX, '.editor-pane > .tabs.notebook-tabs');
t.ok('a pane tab bar is a fixed 26px row', /flex:\s*0 0 auto/.test(tabsRule || '') && /height:\s*26px/.test(tabsRule || ''), tabsRule);
t.ok('it out-ranks the strip rule\'s height: 100%',
    compareSpecificity(specificity('.editor-pane > .tabs.notebook-tabs'), specificity('.tabs.notebook-tabs')) > 0);
t.ok('the focused pane is marked only in a split',
    ruleBody(FLEX, '.split-pane-container--split .editor-pane--focused > .tabs.notebook-tabs') !== null);

// ── §4 the divider still drags ──────────────────────────────────────────
t.section('§4 the divider drags');
root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1004, height: 400, right: 1004, bottom: 400 });
Object.defineProperty(divider, 'offsetWidth', { value: 4, configurable: true });
t.fire(document, 'mousemove', { clientX: 702 }, window.MouseEvent);
t.mouse('mouseup', document);
t.check('the ratio followed the pointer', Math.round(split.ratio * 100), 70);
t.check('the panes carry it', [leftEl.style.flexGrow, rightEl.style.flexGrow].map((v) => Math.round(Number(v) * 10)), [7, 3]);
t.ok('the drag ended', !divider.classList.contains('split-pane-divider--active'));

bar.dispose();
split.dispose();
t.done();
