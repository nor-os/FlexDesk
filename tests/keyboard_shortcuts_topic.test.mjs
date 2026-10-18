/**
 * ══ BUG-0008. THE PALETTE'S "KEYBOARD SHORTCUTS" OPENS A TOPIC THAT EXISTS ═
 *
 * The palette always offers a built-in *Keyboard shortcuts* command, which
 * opened `HelpModal.open('keyboard-shortcuts')`. With no help provider — or one
 * that defines no such topic — `loadTopic` answered null, the modal read
 * `topic.title` on it and showed "Failed to load help topic."
 *
 *   §1  no provider: Ctrl+K, type 'shortcuts', run it → the window manager's
 *       bindings are listed, and no error
 *   §2  a provider that defines `keyboard-shortcuts` still wins
 *   §3  a provider without that id gets the built-in list too
 *   §4  an unknown topic id says "not found" instead of throwing
 *   §5  the table is `KEYMAP_SHORTCUTS`, exported from @flexdesk/wm
 *
 *     node tests/keyboard_shortcuts_topic.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('keyboard shortcuts topic: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

const { createCommandPalette } = await import('../src/tiling/command_palette.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { installKeymap } = await import('../src/tiling/keymap.js');
const { HelpModal } = await import('../src/help/help_modal.js');
const { setHelpProvider } = await import('../src/help/help_registry.js');
const wmEntry = await import('../wm.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.log(`  FAIL ${what}${why ? ` — ${why}` : ''}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const taxonomy = createTaxonomy({
    root: 'home',
    kinds: { home: { label: 'Home', icon: 'home', isTopNav: true, order: 0 } },
});
const catalog = createEntityCatalog({ sources: [] });
const wm = {
    openInPrimary: () => {},
    isPanelOpen: () => false,
    togglePanel: () => {},
    content: { has: () => true },
};
const palette = createCommandPalette({ wm, api: {}, taxonomy, catalog });
const disposeKeymap = installKeymap({ wm, palette });

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const content = () => $('.help-modal__content');

/** The bug's steps: Ctrl+K, type 'shortcuts', run it. */
async function runShortcutsCommand() {
    HelpModal.getActive()?.close();
    document.body.dispatchEvent(new window.KeyboardEvent('keydown',
        { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    await tick();
    const input = $('.twm-cmdpal__input');
    input.value = 'shortcuts';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await tick();
    const labels = $$('.twm-cmdpal__item .twm-cmdpal__label').map((l) => l.textContent.trim());
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick(); await tick();
    return labels;
}
const shortcutKeys = () => $$('.help-shortcuts tbody tr td:first-child').map((td) => td.textContent.trim());

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 no help provider');
{
    const labels = await runShortcutsCommand();
    ok('the palette offers Keyboard shortcuts', labels[0] === 'Keyboard shortcuts', labels.join('|'));
    ok('the palette closed and the help modal opened', !$('#twm-cmdpal') && !!$('.help-modal'));
    ok('no "Failed to load help topic."', !/Failed to load/.test(content().textContent), content().textContent.trim());
    ok('the breadcrumb names the topic',
       $('.help-breadcrumb__title')?.textContent.trim() === 'Keyboard shortcuts');
    const keys = shortcutKeys();
    for (const k of ['Ctrl+K', '?', 'F1..F8', 'Backspace', 'Alt+H / Alt+V', 'Alt+T', 'Alt+N', 'Alt+W',
                     'Ctrl+Left / Ctrl+Right', 'Alt+1..9']) {
        ok(`lists ${k}`, keys.includes(k), keys.join('|'));
    }
    ok('every row has an action', $$('.help-shortcuts tbody tr td:nth-child(2)').every((td) => td.textContent.trim()));
}

// ── §2 ───────────────────────────────────────────────────────────────────
console.log('§2 the application\'s own topic wins');
{
    setHelpProvider({
        getCategories: () => [],
        getTopicsByCategory: () => [],
        loadTopic: async (id) => (id === 'keyboard-shortcuts'
            ? { id, title: 'App keys', html: '<p class="app-keys">the app\'s own list</p>' } : null),
        searchTopics: () => [],
    });
    await runShortcutsCommand();
    ok('the provider\'s topic is shown', !!$('.help-modal .app-keys')
       && $('.help-breadcrumb__title')?.textContent.trim() === 'App keys');
    ok('the built-in table is not', !$('.help-shortcuts'));
}

// ── §3 ───────────────────────────────────────────────────────────────────
console.log('§3 a provider without the topic');
{
    setHelpProvider({
        getCategories: () => ['guide'],
        getTopicsByCategory: () => [{ id: 'intro', title: 'Intro' }],
        loadTopic: async (id) => (id === 'intro' ? { id, title: 'Intro', html: '<p>hi</p>' } : null),
        searchTopics: () => [],
    });
    await runShortcutsCommand();
    ok('the built-in table is shown', shortcutKeys().includes('Ctrl+K'));
    ok('and no error', !/Failed to load/.test(content().textContent));
}

// ── §4 ───────────────────────────────────────────────────────────────────
console.log('§4 an unknown topic id');
{
    HelpModal.getActive()?.close();
    setHelpProvider(null);
    const m = new HelpModal();
    let threw = null;
    try { await m.open('no-such-topic'); } catch (e) { threw = e; }
    ok('opening it does not throw', !threw, String(threw));
    ok('it says the topic was not found', /Help topic not found\./.test(content().textContent),
       content().textContent.trim());
    ok('not "Failed to load"', !/Failed to load/.test(content().textContent));
    m.close();

    // A fallback is for its own id only.
    const m2 = new HelpModal();
    await m2.open('keyboard-shortcuts', { fallback: { title: 'X', html: '<p class="fb">fb</p>' } });
    ok('a fallback is used for its id', !!$('.help-modal .fb'));
    await m2._loadTopic('other');
    ok('…and not for another id', /Help topic not found\./.test(content().textContent));
    m2.close();
}

// ── §5 ───────────────────────────────────────────────────────────────────
console.log('§5 exports');
{
    ok('@flexdesk/wm exports KEYMAP_SHORTCUTS', Array.isArray(wmEntry.KEYMAP_SHORTCUTS)
       && wmEntry.KEYMAP_SHORTCUTS.length > 0 && Object.isFrozen(wmEntry.KEYMAP_SHORTCUTS));
    ok('@flexdesk/wm exports keyboardShortcutsTopic', typeof wmEntry.keyboardShortcutsTopic === 'function');
    ok('@flexdesk/wm exports KEYBOARD_SHORTCUTS_TOPIC_ID', wmEntry.KEYBOARD_SHORTCUTS_TOPIC_ID === 'keyboard-shortcuts');
    const t = wmEntry.keyboardShortcutsTopic([{ keys: '<b>', action: 'a & b' }]);
    ok('the topic escapes what it draws', t.html.includes('&lt;b&gt;') && t.html.includes('a &amp; b')
       && !t.html.includes('<b>'));
}

disposeKeymap();
HelpModal.getActive()?.close();

if (failures) {
    console.log(`\nkeyboard shortcuts topic: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nkeyboard shortcuts topic: all passed');
process.exit(0);
