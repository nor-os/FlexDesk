/**
 * THE HELP MODAL IS STYLED BY FLEXDESK ITSELF (BUG-0026).
 *
 * `HelpModal` set `help-modal-overlay`, `help-modal`, `help-index…` and the rest,
 * and no rule anywhere in css/ named one of them: with only FlexDesk's sheets
 * loaded, `?` appended unstyled content at the end of the body instead of a
 * centred dialog on a dimmed overlay. jsdom applies no stylesheet, so this
 * holds the contract on the sheet's TEXT:
 *
 *   §1  the overlay covers the viewport, dims it, and centres the dialog; the
 *       dialog is a bounded, opaque column
 *   §2  every class the modal sets — index, topic, search results, no results,
 *       a topic that fails to load, a collapsed category, an active topic —
 *       has a rule in the HELP MODAL section
 *   §3  every class a HELP MODAL rule names is one the modal sets (or the
 *       icon class it renders with)
 *   §4  base.css's HELP MODAL section is flexdesk.css's (the hand-mirror)
 *
 *     node tests/help_modal_css.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await dataTableEnv('help modal — css');
const { check, ok, section, done, tick, document } = t;
const { HelpModal } = await import('../src/help/help_modal.js');
const { setHelpProvider } = await import('../src/help/help_registry.js');

const OPEN = '/* ══ HELP MODAL ';
const CLOSE = '/* ══ end HELP MODAL ══ */';
const helpSection = (sheet) => {
    const start = sheet.indexOf(OPEN);
    const end = sheet.indexOf(CLOSE);
    return start >= 0 && end > start ? sheet.slice(start, end + CLOSE.length) : null;
};
const FLEX = helpSection(t.css('flexdesk.css'));
const BASE = helpSection(t.css('base.css'));
ok('flexdesk.css has a HELP MODAL section', FLEX);
ok('base.css has a HELP MODAL section', BASE);
const HELP = stripComments(FLEX || '');

const decl = (body, prop) => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body || '');
    return m ? m[1].trim() : null;
};

// ── §1 the overlay and the dialog ─────────────────────────────────────────
section('§1 a centred dialog on a dimmed overlay');
const overlay = ruleBody(HELP, '.help-modal-overlay');
ok('.help-modal-overlay has a rule', overlay);
check('overlay position', decl(overlay, 'position'), 'fixed');
check('overlay covers the viewport', decl(overlay, 'inset'), '0');
check('overlay display', decl(overlay, 'display'), 'flex');
check('overlay centres vertically', decl(overlay, 'align-items'), 'center');
check('overlay centres horizontally', decl(overlay, 'justify-content'), 'center');
ok('overlay dims what is under it', /rgba\(0, 0, 0, 0\.\d+\)/.test(decl(overlay, 'background') || ''));
ok('overlay draws over managed windows', decl(overlay, 'z-index') === 'var(--z-over-windows)');
const dialog = ruleBody(HELP, '.help-modal');
ok('.help-modal has a rule', dialog);
check('dialog is a column', decl(dialog, 'flex-direction'), 'column');
ok('dialog has a bounded width', decl(dialog, 'max-width'));
ok('dialog has a bounded height', decl(dialog, 'max-height'));
ok('dialog is opaque', /^var\(--surface-/.test(decl(dialog, 'background') || ''));
const content = ruleBody(HELP, '.help-modal__content');
check('content pane scrolls', decl(content, 'overflow-y'), 'auto');
check('collapsed category hides its topics',
      decl(ruleBody(HELP, '.help-category.collapsed .help-category__topics'), 'display'), 'none');

// ── mount the modal in every state, collecting each class it sets ─────────
const TOPICS = [
    { id: 'a', title: 'Alpha', category: 'one' },
    { id: 'b', title: 'Beta', category: 'one' },
    { id: 'c', title: 'Gamma', category: 'one' },
    { id: 'd', title: 'Delta', category: 'one' },
    { id: 'e', title: 'Epsilon', category: 'two' },
];
setHelpProvider({
    getCategories: () => ['one', 'two'],
    getTopicsByCategory: (c) => TOPICS.filter((x) => x.category === c),
    loadTopic: async (id) => {
        if (id === 'broken') throw new Error('no such topic');
        const x = TOPICS.find((y) => y.id === id);
        return { ...x, html: '<h2>Heading</h2><p>Text <code>x</code></p><table><tr><td>1</td></tr></table>' };
    },
    searchTopics: (q) => TOPICS.filter((x) => x.title.toLowerCase().includes(q.toLowerCase())),
}, { one: { label: 'One', icon: 'folder' }, two: { label: 'Two', icon: 'book' } });

const seen = new Set();
const harvest = () => {
    for (const n of document.body.querySelectorAll('*')) for (const c of n.classList) seen.add(c);
};
const modal = new HelpModal();
await modal.open();
harvest();                                           // index
ok('the overlay is the body\'s child and holds the dialog',
   document.body.lastElementChild?.matches('.help-modal-overlay')
   && document.body.lastElementChild.firstElementChild?.matches('.help-modal'));
document.querySelector('.help-category__header').click();
harvest();                                           // collapsed category
await modal._loadTopic('a');
harvest();                                           // a topic, active in the sidebar
modal._handleSearch('a');
harvest();                                           // search results
modal._handleSearch('zzz');
harvest();                                           // no results
await modal._loadTopic('broken');
harvest();                                           // a topic that fails
const loading = modal._loadTopic('b');
harvest();                                           // loading
await loading;
modal.close();
await tick(120);

const set = [...seen].filter((c) => c.startsWith('help-'));
const ruled = new Set();
for (const m of HELP.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) ruled.add(c[1]);
}

// ── §2 every class the modal sets has a rule ──────────────────────────────
section('§2 every class the modal sets has a rule');
ok('the harvest found the modal\'s classes', set.length >= 30);
for (const c of set.sort()) ok(`.${c} has a rule`, ruled.has(c));

// ── §3 every class a rule names is one the modal sets ─────────────────────
section('§3 every class a HELP MODAL rule names is one the modal sets');
const ALSO = new Set(['material-symbols-outlined', 'collapsed', 'active']);
for (const c of [...ruled].sort()) ok(`.${c} is set by the modal`, seen.has(c) || ALSO.has(c));

// ── §4 the hand-mirror ────────────────────────────────────────────────────
section('§4 the hand-mirror');
check('base.css carries the same HELP MODAL section, byte for byte', BASE, FLEX);

done();
