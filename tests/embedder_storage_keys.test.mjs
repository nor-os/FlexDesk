/**
 * STORY-0038 — STORAGE KEYS, THE TAB DRAG MIME AND THE OTHER NAMES ARE THE
 * EMBEDDER'S.
 *
 * The library used to write settings under one application's key, window
 * geometry under another, and drag editor tabs under that application's MIME.
 * Each is an option now, with a generic FlexDesk default:
 *
 *   §1  a settings binding configured with storageKey 'app.settings' reads and
 *       writes only that localStorage key — also when registerSettings() comes
 *       first, and when the key changes after the binding was in use
 *   §2  ManagedWindow configured with storageKey 'app.windows' restores the
 *       geometry saved under that key, and saves there
 *   §3  an embedder that passes no keys gets the documented defaults, and no
 *       console warning
 *   §4  the tab drag MIME: a tab dragged out of one EditorPane carries the
 *       configured MIME, and another pane admits it on that MIME alone
 *
 * The editor theme names and the chart export filename have their own suite
 * (embedder_editor_names.test.mjs): they need no DOM.
 *
 *     node tests/embedder_storage_keys.test.mjs
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
    console.log('embedder storage keys: SKIPPED — needs jsdom');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'CSS',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

// A localStorage that remembers every key anything asked it about.
const store = new Map();
const touched = [];
const spyStorage = {
    getItem(k) { touched.push(k); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { touched.push(k); store.set(k, String(v)); },
    removeItem(k) { touched.push(k); store.delete(k); },
    clear() { store.clear(); },
    key(i) { return [...store.keys()][i] ?? null; },
    get length() { return store.size; },
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: spyStorage });
const reset = () => { store.clear(); touched.length = 0; };
const keysTouched = () => [...new Set(touched)].sort();

// Warnings and errors, counted while a section runs.
const warned = [];
const realWarn = console.warn;
const realError = console.error;
console.warn = (...a) => { warned.push(['warn', a.map(String).join(' ')]); };
console.error = (...a) => { warned.push(['error', a.map(String).join(' ')]); };

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; realError(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

// Each case gets its own instance of the settings module: the binding is one
// per document, and a fresh import is a fresh document as far as it knows.
let instance = 0;
const freshSettings = () => import(`../src/core/settings.js?case=${++instance}`);

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('§1 a settings binding configured with storageKey \'app.settings\' touches only that key');
{
    reset();
    store.set('flexdesk.settings.v1', JSON.stringify({ window: { macShadows: false } }));
    store.set('app.settings', JSON.stringify({ window: { animateMinimize: false } }));
    touched.length = 0;
    const s = await freshSettings();
    check('importing the module reads no storage', keysTouched(), []);
    s.configureSettings({ storageKey: 'app.settings' });
    check('getSettingsStorageKey() answers the configured key', s.getSettingsStorageKey(), 'app.settings');
    check('a value saved under app.settings is read back', s.getSetting('window.animateMinimize'), false);
    check('a value saved under the default key is NOT read', s.getSetting('window.macShadows'), true);
    s.setSetting('notifications.durationMs', 5000);
    const saved = JSON.parse(store.get('app.settings'));
    check('the write lands under app.settings, beside what was there',
        [saved.notifications?.durationMs, saved.window?.animateMinimize], [5000, false]);
    check('the default key is left as it was',
        JSON.parse(store.get('flexdesk.settings.v1')), { window: { macShadows: false } });
    s.resetAllSettings();
    check('a reset clears app.settings', store.has('app.settings'), false);
    check('every key the binding touched is app.settings', keysTouched(), ['app.settings']);
}
{
    reset();
    store.set('app.settings', JSON.stringify({ myapp: { colour: 'teal' } }));
    touched.length = 0;
    const s = await freshSettings();
    s.registerSettings({
        defaults: { myapp: { colour: 'grey' } },
        schema: { 'myapp.colour': { type: 'text', category: 'general', label: 'Colour', defaultValue: 'grey' } },
    });
    s.configureSettings({ storageKey: 'app.settings' });
    check('registerSettings() before configureSettings(): the slice is restored from app.settings',
        s.getSetting('myapp.colour'), 'teal');
    s.setSetting('myapp.colour', 'red');
    check('…and written back there', JSON.parse(store.get('app.settings')).myapp, { colour: 'red' });
    check('…and nothing else was touched', keysTouched(), ['app.settings']);
}
{
    reset();
    store.set('app.settings', JSON.stringify({ window: { macShadows: false } }));
    const s = await freshSettings();
    const events = [];
    s.registerSettingsEventBus({ emit: (name, payload) => events.push([name, payload]) });
    check('used before configuring: the default key', s.getSetting('window.macShadows'), true);
    events.length = 0;
    touched.length = 0;
    s.configureSettings({ storageKey: 'app.settings' });
    check('configured later: the binding moves to the new key', s.getSetting('window.macShadows'), false);
    check('…and says so once, as after a reset', events, [['settings:changed', { path: null }]]);
    check('…touching only the new key', keysTouched(), ['app.settings']);
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('§2 ManagedWindow configured with storageKey \'app.windows\' restores geometry saved there');
const { ManagedWindow, DEFAULT_WINDOW_STORAGE_KEY } = await import('../src/ui/components/managed_window.js');
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
globalThis.innerWidth = 1600;
globalThis.innerHeight = 1000;
{
    reset();
    store.set('app.windows', JSON.stringify({
        editor: { x: 120, y: 140, width: 640, height: 480, maximized: false },
    }));
    store.set(DEFAULT_WINDOW_STORAGE_KEY, JSON.stringify({
        editor: { x: 5, y: 50, width: 300, height: 300, maximized: false },
    }));
    touched.length = 0;
    ManagedWindow.configure({ storageKey: 'app.windows' });
    check('ManagedWindow.storageKey answers the configured key', ManagedWindow.storageKey, 'app.windows');
    const win = new ManagedWindow({ id: 'editor', title: 'Editor', content: document.createElement('div'),
                                    defaultWidth: 400, defaultHeight: 300 });
    win.show();
    check('the window opens at the geometry saved under app.windows',
        [win.x, win.y, win.width, win.height], [120, 140, 640, 480]);
    win.x = 200;
    win.close({ force: true });
    check('closing saves under app.windows',
        JSON.parse(store.get('app.windows')).editor,
        // `u` is the use stamp that bounds the entry (BUG-0053, 0.17.16): the
        // unstamped entry stored above is stamped 1 first, then saved as 2.
        { x: 200, y: 140, width: 640, height: 480, maximized: false, u: 2 });
    check('the default key is left as it was',
        JSON.parse(store.get(DEFAULT_WINDOW_STORAGE_KEY)).editor.x, 5);
    check('every key the windows touched is app.windows', keysTouched(), ['app.windows']);
    win.destroy?.();
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('§3 no keys passed: the documented defaults, and no console warning');
{
    reset();
    warned.length = 0;
    const s = await freshSettings();
    check('DEFAULT_SETTINGS_STORAGE_KEY is the documented default',
        s.DEFAULT_SETTINGS_STORAGE_KEY, 'flexdesk.settings.v1');
    check('the binding uses it', s.getSettingsStorageKey(), 'flexdesk.settings.v1');
    s.getSetting('window.macShadows');
    s.setSetting('window.macShadows', false);
    check('settings are written under flexdesk.settings.v1',
        JSON.parse(store.get('flexdesk.settings.v1')).window, { macShadows: false });
    check('…and under no other key', keysTouched(), ['flexdesk.settings.v1']);

    ManagedWindow.configure();
    touched.length = 0;
    check('DEFAULT_WINDOW_STORAGE_KEY is the documented default',
        DEFAULT_WINDOW_STORAGE_KEY, 'flexdesk.managedWindows.v1');
    check('ManagedWindow.configure() with no key goes back to it', ManagedWindow.storageKey, 'flexdesk.managedWindows.v1');
    const win = new ManagedWindow({ id: 'plain', title: 'Plain', content: document.createElement('div') });
    win.show();
    win.close({ force: true });
    check('window geometry is written under flexdesk.managedWindows.v1',
        Object.keys(JSON.parse(store.get('flexdesk.managedWindows.v1'))), ['plain']);
    check('…and under no other key', keysTouched(), ['flexdesk.managedWindows.v1']);

    const tabBar = await import('../src/editor/notebook_tab_bar.js');
    check('the tab drag MIME default', tabBar.getTabDragMime(), 'application/x-flexdesk-tab');
    check('DEFAULT_TAB_DRAG_MIME is that default', tabBar.DEFAULT_TAB_DRAG_MIME, 'application/x-flexdesk-tab');
    check('no console warning or error on the default path', warned, []);
}

// ── §4 ──────────────────────────────────────────────────────────────────
console.log('§4 a dragged editor tab carries the configured MIME, and a pane admits it on that MIME');
{
    const { EditorPane, setTabDragMime, getTabDragMime } = await import('../editor.js');
    function fakeTransfer() {
        const data = {};
        return {
            types: [], dropEffect: 'none', effectAllowed: 'all',
            setData(k, v) { data[k] = v; if (!this.types.includes(k)) this.types.push(k); },
            getData(k) { return data[k] ?? ''; },
            setDragImage() {},
        };
    }
    function dragEvent(type, dt) {
        const ev = new window.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: dt });
        return ev;
    }
    const drops = [];
    const left = new EditorPane('left', {});
    const right = new EditorPane('right', { onDropFromOtherPane: (id, path) => drops.push([id, path]) });
    document.body.appendChild(left.mount());
    document.body.appendChild(right.mount());
    left.syncTabBar([{ filePath: 'a.txt', fileType: 'text', isDirty: false }], 'a.txt');
    right.syncTabBar([{ filePath: 'b.txt', fileType: 'text', isDirty: false }], 'b.txt');

    setTabDragMime('application/x-app-tab');
    check('getTabDragMime() answers the configured MIME', getTabDragMime(), 'application/x-app-tab');
    const dt = fakeTransfer();
    left.element.querySelector('.tab').dispatchEvent(dragEvent('dragstart', dt));
    check('the dragged tab carries application/x-app-tab', dt.getData('application/x-app-tab'), 'a.txt');
    check('…and not the default MIME', dt.types.includes('application/x-flexdesk-tab'), false);

    const over = dragEvent('dragover', dt);
    right.editorContainer.dispatchEvent(over);
    check('the other pane admits it', over.defaultPrevented, true);
    right.editorContainer.dispatchEvent(dragEvent('drop', dt));
    check('…and the drop names the tab', drops, [['right', 'a.txt']]);

    const foreign = fakeTransfer();
    foreign.setData('application/x-flexdesk-tab', 'x.txt');
    const overForeign = dragEvent('dragover', foreign);
    right.editorContainer.dispatchEvent(overForeign);
    check('a drag carrying only the default MIME is not admitted', overForeign.defaultPrevented, false);
    left.element.querySelector('.tab').dispatchEvent(dragEvent('dragend', dt));

    setTabDragMime();
    check('setTabDragMime() with no MIME goes back to the default', getTabDragMime(), 'application/x-flexdesk-tab');
}

console.warn = realWarn;
console.error = realError;
if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nembedder storage keys: all checks passed');
