/**
 * ══ STORY-0031. AN EMBEDDER CAN DISABLE OR REBIND THE WINDOW MANAGER'S CHORDS ═
 *
 * `installKeymap` hard-bound F1..F12, Backspace, Ctrl/Shift+Arrows and
 * Ctrl+Tab and swallowed bare Alt+letter; importing the help modal added a `?`
 * listener nobody could remove. Now `createShell({ keymap: { bindings } })`
 * changes the chords, the handler leaves an event a component already handled
 * alone, the shell installs `?` (and its disposer takes it off), and the
 * palette's *Keyboard shortcuts* lists the bindings in effect.
 *
 *   §1  importing the help module installs no document listener
 *   §2  {'F1': false}: F1 reaches the app's own handler, no top-nav click
 *   §3  {'F2': 'nav:0'}: F2 opens the first top-nav kind (default F2: the second)
 *   §4  {'Backspace': false}: Backspace outside inputs never calls navigateBack
 *   §5  a component that prevents Backspace keeps it; the WM does not go back
 *   §6  the shell's `?` opens help, and shell.dispose() removes it
 *   §7  an unknown chord id (or action) is warned about once and ignored
 *   §8  the shortcuts help reflects the effective bindings
 *   §9  a function binding; chord spelling; installHelpShortcut's disposer
 *   §10 with no bindings every default chord still does what it did — read
 *       as loosely as 0.16 read it, checked against 0.16's handler for every
 *       key and all 16 modifier sets, in and out of a field
 *   §11 the *Keyboard shortcuts* hint names the keys that open help
 *   §12 createShell refuses a `keymap` that is not `{ bindings }`
 *
 *     node tests/keymap_bindings.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
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
    console.log('keymap bindings: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'DragEvent', 'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.log(`  FAIL ${what}${why ? ` — ${why}` : ''}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// Every listener added to `document`, by type — recorded BEFORE any FlexDesk
// module is imported, so an import-time side effect cannot hide.
const docListeners = [];
{
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, fn, opts) => { docListeners.push({ type, fn }); add(type, fn, opts); };
    document.removeEventListener = (type, fn, opts) => {
        const i = docListeners.findIndex((l) => l.type === type && l.fn === fn);
        if (i >= 0) docListeners.splice(i, 1);
        remove(type, fn, opts);
    };
}

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 importing the help module installs no document listener');
const helpModule = await import('../src/help/help_modal.js');
const { HelpModal, installHelpShortcut } = helpModule;
ok('no document listener after importing help_modal.js', docListeners.length === 0,
   docListeners.map((l) => l.type).join(','));
{
    const e = new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    await tick();
    ok('`?` with no shell opens nothing', !HelpModal.getActive() && !document.querySelector('.help-modal'));
    ok('…and is not prevented', !e.defaultPrevented);
}

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const wmEntry = await import('../wm.js');
const widgetsEntry = await import('../widgets.js');

const key = (k, mods = {}, target = document.body) => {
    const e = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
    target.dispatchEvent(e);
    return e;
};

/** A shell with two top-nav kinds, in a fresh root and nav bar each time. */
async function buildShell(extra = {}) {
    document.body.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'twm-global-top-bar';
    const nav = document.createElement('div');
    nav.className = 'twm-bar-center';
    bar.appendChild(nav);
    const root = document.createElement('div');
    document.body.append(bar, root);
    const shell = await createShell({
        root,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({
            root: 'home',
            kinds: {
                home: { label: 'Home', icon: 'home' },
                alpha: { label: 'Alpha', icon: 'a', isTopNav: true, order: 0 },
                beta: { label: 'Beta', icon: 'b', isTopNav: true, order: 1 },
            },
        }),
        content: {
            home: (h) => { h.textContent = 'home'; return {}; },
            alpha: (h) => { h.textContent = 'alpha'; return {}; },
            beta: (h) => { h.textContent = 'beta'; return {}; },
        },
        panels: { left: false, right: false, bottom: false },
        chrome: { topNav: nav },
        ...extra,
    });
    const clicks = [];
    nav.querySelectorAll('.twm-top-nav__btn').forEach((b) =>
        b.addEventListener('click', () => clicks.push(b.dataset.kind)));
    let backs = 0;
    const realBack = shell.wm.navigateBack.bind(shell.wm);
    shell.wm.navigateBack = (...a) => { backs++; return realBack(...a); };
    const primaryKind = () => {
        const tree = shell.wm.desktops.active().tree;
        return tree.get(tree.primaryLeafId())?.content?.kind ?? null;
    };
    return { shell, nav, root, clicks, backs: () => backs, primaryKind };
}

// ── §2 ───────────────────────────────────────────────────────────────────
console.log('§2 {F1: false}');
{
    const s = await buildShell({ keymap: { bindings: { F1: false } } });
    ok('the top nav has two buttons', s.nav.querySelectorAll('.twm-top-nav__btn').length === 2);
    const seen = [];
    const appHandler = (e) => seen.push({ key: e.key, prevented: e.defaultPrevented });
    document.addEventListener('keydown', appHandler);
    const e = key('F1');
    await tick();
    ok("F1 reaches the app's own handler", seen.length === 1 && seen[0].key === 'F1', JSON.stringify(seen));
    ok('…unprevented', seen[0] && seen[0].prevented === false && !e.defaultPrevented);
    ok('no top-nav button is clicked', s.clicks.length === 0, s.clicks.join(','));
    ok('the primary tile still shows the root kind', s.primaryKind() === 'home', s.primaryKind());
    // Control: F2 is untouched and does click.
    key('F2');
    await tick();
    ok('F2, not rebound, still clicks the second button', s.clicks.join(',') === 'beta', s.clicks.join(','));
    document.removeEventListener('keydown', appHandler);
    s.shell.dispose();
}

// ── §3 ───────────────────────────────────────────────────────────────────
console.log("§3 {F2: 'nav:0'}");
{
    const s = await buildShell({ keymap: { bindings: { F2: 'nav:0' } } });
    const e = key('F2');
    await tick();
    ok('F2 clicks the first top-nav button', s.clicks.join(',') === 'alpha', s.clicks.join(','));
    ok('…and opens the first top-nav kind in the primary tile', s.primaryKind() === 'alpha', s.primaryKind());
    ok('…and is prevented', e.defaultPrevented);
    s.shell.dispose();
    const d = await buildShell();
    key('F2');
    await tick();
    ok('control: by default F2 opens the second kind', d.primaryKind() === 'beta', d.primaryKind());
    d.shell.dispose();
}

// ── §4 ───────────────────────────────────────────────────────────────────
console.log('§4 {Backspace: false}');
{
    const s = await buildShell({ keymap: { bindings: { Backspace: false } } });
    const div = document.createElement('div');
    s.root.appendChild(div);
    const e1 = key('Backspace');
    const e2 = key('Backspace', {}, div);
    const e3 = key('Backspace', { shiftKey: true });
    await tick();
    ok('Backspace outside inputs never calls navigateBack', s.backs() === 0, String(s.backs()));
    ok('…and is left unprevented', !e1.defaultPrevented && !e2.defaultPrevented && !e3.defaultPrevented);
    s.shell.dispose();
    const d = await buildShell();
    key('Backspace');
    await tick();
    ok('control: by default Backspace calls navigateBack', d.backs() === 1, String(d.backs()));
    d.shell.dispose();
}

// ── §5 ───────────────────────────────────────────────────────────────────
console.log('§5 a component that prevents Backspace keeps it');
{
    const s = await buildShell();
    const list = document.createElement('div');
    list.tabIndex = 0;
    let removed = 0;
    list.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') { e.preventDefault(); removed++; }
    });
    s.root.appendChild(list);
    key('Backspace', {}, list);
    await tick();
    ok('the component ran its own behaviour', removed === 1, String(removed));
    ok('the WM did not navigate back', s.backs() === 0, String(s.backs()));
    // A component handler registered on document BEFORE the shell would also
    // run first; prove the rule is "already prevented", not "inside root".
    const other = document.createElement('div');
    s.root.appendChild(other);
    key('Backspace', {}, other);
    await tick();
    ok('control: an unhandled Backspace in the same root does go back', s.backs() === 1, String(s.backs()));
    const e = new window.KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    await tick();
    ok('an already-prevented F1 clicks no top-nav button', s.clicks.length === 0, s.clicks.join(','));
    s.shell.dispose();
}

// ── §6 ───────────────────────────────────────────────────────────────────
console.log('§6 the shell installs `?` and dispose() removes it');
{
    const before = docListeners.filter((l) => l.type === 'keydown').length;
    const s = await buildShell();
    key('?', { shiftKey: true });
    await tick();
    ok('`?` opens the help modal', !!HelpModal.getActive() && !!document.querySelector('.help-modal'));
    key('?', { shiftKey: true });
    await tick();
    ok('a second `?` closes it', !HelpModal.getActive() && !document.querySelector('.help-modal'));
    const input = document.createElement('input');
    s.root.appendChild(input);
    key('?', { shiftKey: true }, input);
    await tick();
    ok('`?` typed into an input opens nothing', !HelpModal.getActive());
    s.shell.dispose();
    ok('dispose() leaves no keydown listener of the shell on document',
       docListeners.filter((l) => l.type === 'keydown').length === before,
       `${before} before, ${docListeners.filter((l) => l.type === 'keydown').length} after`);
    const e = key('?', { shiftKey: true });
    await tick();
    ok('after dispose() `?` opens nothing', !HelpModal.getActive() && !document.querySelector('.help-modal'));
    ok('…and is not prevented', !e.defaultPrevented);
    const g = await buildShell({ keymap: { bindings: { '?': false } } });
    key('?', { shiftKey: true });
    await tick();
    ok("{'?': false} leaves `?` to the application", !HelpModal.getActive());
    g.shell.dispose();
}

// ── §7 ───────────────────────────────────────────────────────────────────
console.log('§7 an unknown chord id is warned about once and ignored');
{
    const warnings = [];
    const logger = { info() {}, debug() {}, error() {}, warn: (...a) => warnings.push(a.join(' ')) };
    const s = await buildShell({
        logger,
        keymap: { bindings: { 'Ctrl+Q': 'nav:0', 'Hyper+F1': false, F3: 'no-such-action', F2: 'nav:0' } },
    });
    const about = (s1) => warnings.filter((w) => w.includes(s1));
    ok('one warning for "Ctrl+Q"', about('Ctrl+Q').length === 1, warnings.join(' | '));
    ok('one warning for "Hyper+F1"', about('Hyper+F1').length === 1, warnings.join(' | '));
    ok('one warning for the unknown action', about('no-such-action').length === 1, warnings.join(' | '));
    ok('no other warnings', warnings.length === 3, warnings.join(' | '));
    const q = key('q', { ctrlKey: true });
    await tick();
    ok('Ctrl+Q is ignored: nothing clicked, not prevented', s.clicks.length === 0 && !q.defaultPrevented);
    key('F1');
    await tick();
    ok('F1 keeps its default (the bad id did not disable it)', s.clicks.join(',') === 'alpha', s.clicks.join(','));
    key('F2');
    await tick();
    ok('the valid binding beside them still applies', s.clicks.join(',') === 'alpha,alpha', s.clicks.join(','));
    for (let i = 0; i < 5; i++) key('q', { ctrlKey: true });
    await tick();
    ok('pressing it again warns no more', warnings.length === 3, String(warnings.length));
    s.shell.dispose();

    // Without a logger the keymap warns on the console, still once.
    const realWarn = console.warn;
    const consoleWarnings = [];
    console.warn = (...a) => consoleWarnings.push(a.join(' '));
    try {
        const c = await buildShell({ keymap: { bindings: { 'Ctrl+Q': false } } });
        key('q', { ctrlKey: true });
        c.shell.dispose();
    } finally { console.warn = realWarn; }
    ok('no logger: one console warning', consoleWarnings.filter((w) => w.includes('Ctrl+Q')).length === 1,
       consoleWarnings.join(' | '));
}

// ── §8 ───────────────────────────────────────────────────────────────────
console.log('§8 the shortcuts help reflects the effective bindings');
{
    const { keymapShortcuts, KEYMAP_SHORTCUTS } = wmEntry;
    ok('@flexdesk/wm exports keymapShortcuts', typeof keymapShortcuts === 'function');
    const plain = keymapShortcuts();
    ok('no bindings: the table is KEYMAP_SHORTCUTS', plain.length === KEYMAP_SHORTCUTS.length
       && plain.every((r, i) => r === KEYMAP_SHORTCUTS[i]));
    const t = keymapShortcuts({ F1: false, F2: 'nav:0', Backspace: false, '?': false });
    const keys = t.map((r) => r.keys);
    ok('a disabled F1 is not listed', !keys.includes('F1') && !keys.includes('F1..F8'), keys.join('|'));
    ok('F2 is listed with its new action', t.find((r) => r.keys === 'F2')?.action === 'Jump to top-nav page 1',
       JSON.stringify(t.find((r) => r.keys === 'F2')));
    ok('F3 keeps its default', t.find((r) => r.keys === 'F3')?.action === 'Jump to top-nav page 3');
    ok('a disabled Backspace and ? are not listed', !keys.includes('Backspace') && !keys.includes('?'));
    ok('untouched rows stay as they are', keys.includes('Ctrl+K') && keys.includes('Alt+H / Alt+V'));
    ok('the table is frozen', Object.isFrozen(t) && t.every((r) => Object.isFrozen(r)));

    // Through the real palette: Ctrl+K, type, run.
    const s = await buildShell({ keymap: { bindings: { F1: false, F2: 'nav:0' } } });
    key('k', { ctrlKey: true });
    await tick();
    const input = document.querySelector('.twm-cmdpal__input');
    input.value = 'shortcuts';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await tick();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick(); await tick();
    const shown = [...document.querySelectorAll('.help-shortcuts tbody tr')].map((tr) =>
        [...tr.children].map((td) => td.textContent.trim()));
    ok('the palette command shows the effective table', shown.length > 0
       && !shown.some(([k]) => k === 'F1' || k === 'F1..F8')
       && shown.some(([k, a]) => k === 'F2' && a === 'Jump to top-nav page 1'),
       JSON.stringify(shown.slice(0, 6)));
    HelpModal.getActive()?.close();
    s.shell.dispose();
}

// ── §9 ───────────────────────────────────────────────────────────────────
console.log('§9 a function binding, chord spelling, installHelpShortcut');
{
    const calls = [];
    const s = await buildShell({ keymap: { bindings: {
        'alt+w': (e, ctx) => { calls.push([e.key, !!ctx.wm, !!ctx.palette]); },
        'Shift+Alt+H': (e) => { calls.push(['pass', e.key]); return false; },
    } } });
    const w = key('w', { altKey: true });
    ok('a function bound to Alt+W runs, with wm and palette', JSON.stringify(calls[0]) === JSON.stringify(['w', true, true]),
       JSON.stringify(calls));
    ok('…and the event is prevented', w.defaultPrevented);
    const h = key('H', { altKey: true, shiftKey: true });
    ok('a function returning false leaves the event unprevented', calls[1]?.[0] === 'pass' && !h.defaultPrevented);
    ok('the binding is listed as the application\'s', keymapShortcutsHas('Alt+W', 'Defined by the application'));
    s.shell.dispose();

    ok('@flexdesk/widgets exports installHelpShortcut', typeof widgetsEntry.installHelpShortcut === 'function');
    const kd = () => docListeners.filter((l) => l.type === 'keydown').length;
    const before = kd();
    const off = installHelpShortcut();
    ok('installHelpShortcut adds one keydown listener', kd() === before + 1, `${before} -> ${kd()}`);
    key('?', { shiftKey: true });
    await tick();
    ok('installHelpShortcut binds `?`', !!HelpModal.getActive());
    HelpModal.getActive()?.close();
    off();
    key('?', { shiftKey: true });
    await tick();
    ok('…and its disposer takes it off', !HelpModal.getActive());
    ok('…and removes its listener', kd() === before, `${before} -> ${kd()}`);
}

// ── §10 ──────────────────────────────────────────────────────────────────
console.log('§10 the default chords, unchanged');
{
    document.body.innerHTML = '<div class="twm-global-top-bar"><div class="twm-bar-center twm-top-nav">'
        + '<button class="twm-top-nav__btn" id="n0"></button></div></div>'
        + '<div class="twm-bp__tabs"><button class="twm-bp__tab twm-bp__tab--on" id="b0"></button>'
        + '<button class="twm-bp__tab" id="b1"></button></div><input id="in">';
    const log = [];
    const rec = (name) => (...a) => { log.push(`${name}(${a.join(',')})`); };
    const wm = Object.fromEntries(['navigateBack', 'cycleFocusedTab', 'cycleDesktop', 'split',
        'splitFocusedWith', 'openFocusedInTab', 'openFocusedInWindow', 'closeFocused',
        'toggleManagedFocused', 'focusDir', 'moveFocused', 'switchDesktop', 'moveFocusedToDesktop']
        .map((n) => [n, rec(n)]));
    let open = false;
    const palette = { toggle: () => { open = !open; log.push('toggle()'); }, isOpen: () => open,
                      close: () => { open = false; log.push('close()'); } };
    const navClicks = [];
    document.getElementById('n0').addEventListener('click', () => navClicks.push('n0'));
    const tabClicks = [];
    for (const id of ['b0', 'b1']) document.getElementById(id).addEventListener('click', () => tabClicks.push(id));
    const off = wmEntry.installKeymap({ wm, palette });
    const inp = document.getElementById('in');
    const cases = [
        ['k', { ctrlKey: true }, 'toggle()', true],
        ['k', { metaKey: true }, 'toggle()', true],
        ['Tab', { ctrlKey: true }, 'cycleFocusedTab(1)', true],
        ['Tab', { ctrlKey: true, shiftKey: true }, 'cycleFocusedTab(-1)', true],
        ['Backspace', {}, 'navigateBack()', true],
        ['ArrowRight', { ctrlKey: true }, 'cycleDesktop(1)', true],
        ['ArrowLeft', { ctrlKey: true }, 'cycleDesktop(-1)', true],
        ['h', { altKey: true }, 'split(h)', true],
        ['V', { altKey: true, shiftKey: true }, 'splitFocusedWith(v)', true],
        ['t', { altKey: true }, 'openFocusedInTab()', true],
        ['n', { altKey: true }, 'openFocusedInWindow()', true],
        ['w', { altKey: true }, 'closeFocused()', true],
        ['f', { altKey: true }, 'toggleManagedFocused()', true],
        ['ArrowUp', { altKey: true }, 'focusDir(up)', true],
        ['ArrowLeft', { altKey: true, shiftKey: true }, 'moveFocused(left)', true],
        ['3', { altKey: true }, 'switchDesktop(2)', true],
        ['2', { altKey: true, shiftKey: true }, 'moveFocusedToDesktop(1)', true],
    ];
    for (const [k, mods, want, prevented] of cases) {
        log.length = 0;
        const e = key(k, mods);
        ok(`${JSON.stringify(mods)} ${k} -> ${want}`, log.join(';') === want && e.defaultPrevented === prevented,
           `${log.join(';')} prevented=${e.defaultPrevented}`);
    }
    log.length = 0;
    const f1 = key('F1');
    ok('F1 clicks the first top-nav button', navClicks.join(',') === 'n0' && f1.defaultPrevented);
    const f2 = key('F2');
    ok('F2 with no second button does nothing and is not prevented', navClicks.length === 1 && !f2.defaultPrevented);
    key('ArrowRight', { shiftKey: true });
    ok('Shift+Right clicks the next bottom-panel tab', tabClicks.join(',') === 'b1', tabClicks.join(','));
    const q = key('q', { altKey: true });
    ok('an unbound Alt+letter is prevented and runs nothing', q.defaultPrevented && log.length === 0);
    const qIn = key('q', { altKey: true }, inp);
    ok('…but not in a field', !qIn.defaultPrevented);
    const bsIn = key('Backspace', {}, inp);
    ok('Backspace in a field is left to the field', !bsIn.defaultPrevented && log.length === 0, log.join(';'));
    const altIn = key('w', { altKey: true }, inp);
    ok('Alt chords still work in a field', altIn.defaultPrevented && log.join(';') === 'closeFocused()', log.join(';'));
    log.length = 0;
    key('k', { ctrlKey: true });
    const esc = key('Escape');
    ok('Esc closes an open palette, unprevented', log.join(';') === 'toggle();close()' && !esc.defaultPrevented,
       log.join(';'));
    off();
    log.length = 0;
    key('w', { altKey: true });
    ok('the disposer removes the keymap', log.length === 0);

    // The loose reads 0.16 had, named one by one.
    const offAgain = wmEntry.installKeymap({ wm, palette });
    const realToggle = HelpModal.toggle;
    HelpModal.toggle = () => { log.push('help()'); return null; };
    const loose = [
        ['Backspace', { shiftKey: true }, 'navigateBack()'],
        ['Backspace', { altKey: true }, 'navigateBack()'],
        ['Backspace', { altKey: true, shiftKey: true }, 'navigateBack()'],
        ['T', { altKey: true, shiftKey: true }, 'openFocusedInTab()'],
        ['N', { altKey: true, shiftKey: true }, 'openFocusedInWindow()'],
        ['W', { altKey: true, shiftKey: true }, 'closeFocused()'],
        ['F', { altKey: true, shiftKey: true }, 'toggleManagedFocused()'],
        ['k', { ctrlKey: true, metaKey: true }, 'toggle()'],
        ['k', { ctrlKey: true, altKey: true }, 'toggle()'],
        ['Tab', { ctrlKey: true, metaKey: true }, 'cycleFocusedTab(1)'],
        ['Tab', { metaKey: true, shiftKey: true }, 'cycleFocusedTab(-1)'],
        ['h', { altKey: true, ctrlKey: true }, 'split(h)'],
        ['1', { altKey: true, metaKey: true }, 'switchDesktop(0)'],
        ['ArrowLeft', { altKey: true, ctrlKey: true }, 'focusDir(left)'],
        ['?', { shiftKey: true, ctrlKey: true }, 'help()'],
    ];
    for (const [k, mods, want] of loose) {
        log.length = 0;
        open = false;
        const e = key(k, mods);
        ok(`${JSON.stringify(mods)} ${k} -> ${want}, as in 0.16`, log.join(';') === want && e.defaultPrevented,
           `${log.join(';')} prevented=${e.defaultPrevented}`);
    }
    log.length = 0;
    const tIn = key('T', { altKey: true, shiftKey: true }, inp);
    ok('Alt+Shift+T in a field still opens in a tab', log.join(';') === 'openFocusedInTab()' && tIn.defaultPrevented,
       log.join(';'));
    offAgain();

    // …and every other key: 0.16's handler (with its import-time `?`
    // listener) and this one, side by side, for every key and modifier set,
    // with the palette closed and open, on the page and in a field.
    const KEYS = [...'abcdefghijklmnopqrstuvwxyz', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789',
        ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`), 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Tab', 'Backspace', 'Escape', 'Enter', ' ', '?', '/', '!', 'Delete', 'Home'];
    const MODS = Array.from({ length: 16 }, (_, i) => ({
        ctrlKey: !!(i & 1), metaKey: !!(i & 2), altKey: !!(i & 4), shiftKey: !!(i & 8) }));
    const sweep = (install) => {
        const offs = install();
        const out = [];
        for (const target of [document.body, inp]) {
            for (const wasOpen of [false, true]) {
                for (const k of KEYS) {
                    for (const mods of MODS) {
                        log.length = 0;
                        open = wasOpen;
                        const e = key(k, mods, target);
                        out.push([`${target === inp ? 'field' : 'page'} open=${wasOpen} ${JSON.stringify(mods)} ${k}`,
                                  `${log.join(';')} prevented=${e.defaultPrevented}`]);
                    }
                }
            }
        }
        offs.forEach((f) => f());
        return out;
    };
    navClicks.length = 0;
    const before16 = sweep(() => [installKeymap016({ wm, palette }), installHelpShortcut016()]);
    const now = sweep(() => [wmEntry.installKeymap({ wm, palette })]);
    HelpModal.toggle = realToggle;
    const diffIdx = before16.map(([, got], i) => (now[i][1] !== got ? i : -1)).filter((i) => i >= 0);
    ok(`${before16.length} key presses do what 0.16 did`, diffIdx.length === 0,
       diffIdx.slice(0, 6).map((i) => `${before16[i][0]}: 0.16 "${before16[i][1]}", now "${now[i][1]}"`).join(' | '));
}

// ── §11 ──────────────────────────────────────────────────────────────────
console.log('§11 the Keyboard shortcuts hint names the keys that open help');
{
    // The flat layout draws the hint; the grouped one draws `shortcut` as a key cap.
    const rowFor = async (keymap, layout) => {
        const s = await buildShell({ ...(keymap ? { keymap } : {}), palette: { layout } });
        key('k', { ctrlKey: true });
        await tick();
        const input = document.querySelector('.twm-cmdpal__input');
        input.value = 'shortcuts';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        await tick();
        const row = [...document.querySelectorAll('.twm-cmdpal__item')]
            .find((r) => r.textContent.includes('Keyboard shortcuts'));
        const hint = row ? (row.querySelector('.twm-cmdpal__hint, .twm-cmdpal__context')?.textContent ?? '') : null;
        const kbd = row ? (row.querySelector('.twm-cmdpal__shortcut')?.textContent ?? '') : null;
        key('Escape');
        s.shell.dispose();
        return { hint, kbd };
    };
    const both = async (keymap) => ({ flat: await rowFor(keymap, 'flat'), grouped: await rowFor(keymap, 'grouped') });
    const cases = [
        ['by default the hint is `?`', null, 'Show all key bindings (?)', '?'],
        ['with `?` rebound to the palette, nothing is offered as the help key',
         { bindings: { '?': 'palette' } }, 'Show all key bindings', ''],
        ['with help moved to F9, the hint is F9', { bindings: { '?': false, F9: 'help' } },
         'Show all key bindings (F9)', 'F9'],
        ['with no key opening help, there is no help key', { bindings: { '?': false } }, 'Show all key bindings', ''],
    ];
    for (const [what, keymap, hint, kbd] of cases) {
        const got = await both(keymap);
        ok(what, got.flat.hint === hint && got.grouped.hint === hint && got.grouped.kbd === kbd,
           JSON.stringify(got));
    }
}

// ── §12 ──────────────────────────────────────────────────────────────────
console.log('§12 createShell refuses a keymap that is not { bindings }');
{
    for (const [what, keymap] of [
        ['a typo, { binding }', { binding: { F1: false } }],
        ['a string', 'x'],
        ['an array', [{ F1: false }]],
        ['bindings beside an unknown key', { bindings: { F1: false }, extra: 1 }],
    ]) {
        let err = null;
        try { await buildShell({ keymap }); } catch (e) { err = e; }
        ok(`${what} throws a TypeError`, err instanceof TypeError, String(err));
    }
    let err = null;
    let s = null;
    try { s = await buildShell({ keymap: {} }); } catch (e) { err = e; }
    ok('an empty keymap is the default keymap', !err, String(err));
    s?.shell.dispose();
}

// ══ 0.16, verbatim ══════════════════════════════════════════════════════
// The reference §10 compares against: installKeymap and the help module's
// import-time `?` listener as FlexDesk 0.16 shipped them (`palette`/`wm` calls
// only; the `?` listener's `HelpModal` toggle is `HelpModal.toggle`).
function installKeymap016({ wm, palette, ...opts } = {}) {
    const onKeyDown = (e) => {
        const inField = e.target?.closest?.('input, textarea, select, [contenteditable="true"]');
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
            e.preventDefault(); palette.toggle(); return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Tab') {
            e.preventDefault(); wm.cycleFocusedTab(e.shiftKey ? -1 : 1); return;
        }
        if (e.key === 'Escape') {
            if (palette.isOpen()) { palette.close(); return; }
        }
        if (e.key === 'Backspace' && !inField && !e.metaKey && !e.ctrlKey) {
            e.preventDefault(); wm.navigateBack?.(); return;
        }
        const fMatch = /^F([1-9]|1[0-2])$/.exec(e.key);
        if (fMatch && !inField && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            const btns = document.querySelectorAll(
                opts.navSelector || '.twm-global-top-bar .twm-bar-center.twm-top-nav .twm-top-nav__btn');
            const idx = Number(fMatch[1]) - 1;
            if (idx < btns.length) { e.preventDefault(); btns[idx].click(); return; }
        }
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !inField
            && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            const tabs = [...document.querySelectorAll('.twm-bp__tabs .twm-bp__tab')];
            if (tabs.length) {
                const cur = tabs.findIndex((t) => t.classList.contains('twm-bp__tab--on'));
                const dir = e.key === 'ArrowRight' ? 1 : -1;
                const next = ((cur < 0 ? 0 : cur) + dir + tabs.length) % tabs.length;
                e.preventDefault(); tabs[next].click(); return;
            }
        }
        if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !inField
            && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault(); wm.cycleDesktop(e.key === 'ArrowRight' ? 1 : -1); return;
        }
        if (!e.altKey) return;
        const key = e.key.toLowerCase();
        if (/^[1-9]$/.test(e.key)) {
            e.preventDefault();
            const idx = Number(e.key) - 1;
            if (e.shiftKey) wm.moveFocusedToDesktop(idx); else wm.switchDesktop(idx);
            return;
        }
        switch (key) {
            case 'h': e.preventDefault(); e.shiftKey ? wm.splitFocusedWith('h') : wm.split('h'); return;
            case 'v': e.preventDefault(); e.shiftKey ? wm.splitFocusedWith('v') : wm.split('v'); return;
            case 't': e.preventDefault(); wm.openFocusedInTab(); return;
            case 'n': e.preventDefault(); wm.openFocusedInWindow(); return;
            case 'w': e.preventDefault(); wm.closeFocused(); return;
            case 'f': e.preventDefault(); wm.toggleManagedFocused(); return;
            case 'arrowleft': e.preventDefault(); e.shiftKey ? wm.moveFocused('left') : wm.focusDir('left'); return;
            case 'arrowright': e.preventDefault(); e.shiftKey ? wm.moveFocused('right') : wm.focusDir('right'); return;
            case 'arrowup': e.preventDefault(); e.shiftKey ? wm.moveFocused('up') : wm.focusDir('up'); return;
            case 'arrowdown': e.preventDefault(); e.shiftKey ? wm.moveFocused('down') : wm.focusDir('down'); return;
        }
        if (key.length === 1 && /[a-z]/.test(key) && !inField) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}

function installHelpShortcut016() {
    const onKeyDown = (event) => {
        if (event.key !== '?') return;
        if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        HelpModal.toggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}

function keymapShortcutsHas(keys, action) {
    return wmEntry.keymapShortcuts({ 'Alt+W': () => {} }).some((r) => r.keys === keys && r.action === action);
}

if (failures) {
    console.log(`\nkeymap bindings: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nkeymap bindings: all passed');
process.exit(0);
