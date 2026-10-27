/**
 * ══ WINDOW CHROME: BROWSER, NATIVE FRAME, CUSTOM FRAME ══
 *
 * WindowChromeController against fake hosts in jsdom.
 *
 *   §1  no host / native chrome: nothing is added to the page
 *   §2  custom chrome: buttons drawn where the embedder says, handles, body class
 *   §3  the buttons drive the host, the maximise icon follows the state
 *   §4  drags and resizes go to the host's native gestures, with a JS fallback
 *   §5  dispose takes everything back out
 *
 *     node tests/window_chrome_controller.test.mjs
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
    const candidates = [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ];
    for (const c of candidates) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('window chrome controller: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const PAGE = `<!doctype html><body>
  <div class="app-bar"><span class="brand">App</span><button class="tool">Tool</button><div class="app-bar__right"></div></div>
</body>`;
const dom = new JSDOM(PAGE, { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { WindowChromeController } = await import('../src/ui/controllers/window_chrome_controller.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const quiet = { info() {}, warn() {} };

/** A host window whose calls the test records. */
function fakeWindow({ chrome = 'custom', native = true } = {}) {
    const calls = [];
    let max = false;
    const w = {
        calls,
        chrome: () => Promise.resolve(chrome),
        minimize: () => calls.push('minimize'),
        close: () => calls.push('close'),
        isMaximized: async () => max,
        setMaximized: async (on) => { calls.push(`setMaximized:${on}`); max = !!on; return max; },
        isFullscreen: async () => false,
        toggleFullscreen: async () => false,
        getBounds: async () => ({ x: 10, y: 20, width: 800, height: 600 }),
        setBounds: (b) => calls.push(`setBounds:${JSON.stringify(b)}`),
        snap() { max = true; },
    };
    if (native) {
        w.startNativeDrag = async () => { calls.push('startNativeDrag'); return true; };
        w.startNativeResize = async (edge) => { calls.push(`startNativeResize:${edge}`); return true; };
    }
    return w;
}
// The controller listens for pointer events where the page has them, and for
// mouse events otherwise (jsdom has none): send whichever it listens for.
const POINTER = 'onpointerdown' in dom.window;
const pointer = (type, init = {}) => new dom.window.MouseEvent(POINTER ? type : type.replace('pointer', 'mouse'),
    { bubbles: true, cancelable: true, button: 0, clientX: 300, clientY: 10, ...init });
const bodyBare = () => !document.querySelector('.twm-resize-handle, .twm-window-controls')
    && !document.body.classList.contains('twm-custom-chrome');

// ── §1 browser tab / native frame ───────────────────────────────────────
{
    const none = new WindowChromeController({ host: {}, logger: quiet, topBar: '.app-bar' });
    check('no window capability (a browser tab): not initialised', await none.initialize(), false);
    ok('…and nothing added to the page', bodyBare());
    const native = new WindowChromeController({ host: { window: fakeWindow({ chrome: 'native' }) }, logger: quiet, topBar: '.app-bar' });
    check('native chrome (the OS draws the frame): not initialised', await native.initialize(), false);
    ok('…and nothing added to the page', bodyBare());
    const sync = new WindowChromeController({ host: { window: { ...fakeWindow(), chrome: () => 'native' } }, logger: quiet });
    check('a synchronous chrome() still works', await sync.initialize(), false);
}

// ── §2–§4 custom chrome ─────────────────────────────────────────────────
const win = fakeWindow();
const ctl = new WindowChromeController({
    host: { window: win }, logger: quiet, topBar: '.app-bar', controls: '.app-bar__right', noDrag: '.brand',
});
check('custom chrome: initialised', await ctl.initialize(), true);
await tick();
const right = document.querySelector('.app-bar__right');
check('buttons drawn in the container the embedder named',
    [...right.querySelectorAll('.twm-window-controls button')].map((b) => b.id), ['win-minimize', 'win-maximize', 'win-close']);
check('eight resize handles', document.querySelectorAll('.twm-resize-handle').length, 8);
ok('the body says custom chrome', document.body.classList.contains('twm-custom-chrome'));

document.getElementById('win-minimize').click();
document.getElementById('win-close').click();
check('minimise and close call the host', win.calls.splice(0), ['minimize', 'close']);
document.getElementById('win-maximize').click();
await tick(); await tick();
check('maximise toggles through the host', win.calls.splice(0), ['setMaximized:true']);
check('…and its icon and label show restore',
    [document.querySelector('#win-maximize .material-symbols-outlined').textContent, document.getElementById('win-maximize').getAttribute('aria-label')],
    ['filter_none', 'Restore']);
document.getElementById('win-maximize').click();
await tick(); await tick();
win.calls.splice(0);

const bar = document.querySelector('.app-bar');
bar.dispatchEvent(pointer('pointerdown'));
await tick(); await tick();
check('a press on the bar hands the drag to the host', win.calls.splice(0), ['startNativeDrag']);
document.querySelector('.app-bar .tool').dispatchEvent(pointer('pointerdown', { clientX: 900 }));
document.querySelector('.app-bar .brand').dispatchEvent(pointer('pointerdown', { clientX: 1200 }));
await tick();
check('…but not one on a button, or on what the embedder listed in noDrag', win.calls.splice(0), []);
{
    // A hamburger menu bar in the top bar: its open menu is inside the bar.
    const mb = document.createElement('div');
    mb.className = 'twm-menubar';
    mb.innerHTML = '<div class="twm-menubar__menu" role="menu"><div class="twm-menubar__separator" role="separator"></div></div>';
    bar.appendChild(mb);
    mb.querySelector('.twm-menubar__separator').dispatchEvent(pointer('pointerdown', { clientX: 600 }));
    await tick();
    check('…nor one inside a menu bar (a menu\'s separator)', win.calls.splice(0), []);
    mb.remove();
}

for (const [cls, edge] of [['right', 'e'], ['corner.tl', 'nw'], ['bottom', 's']]) {
    document.querySelector(`.twm-resize-handle.${cls}`).dispatchEvent(pointer('pointerdown'));
    await tick(); await tick();
    check(`a press on the ${cls} handle resizes natively (${edge})`, win.calls.splice(0), [`startNativeResize:${edge}`]);
}

win.snap();                                         // Win+↑, or a snap to the top edge
dom.window.dispatchEvent(new dom.window.Event('resize'));
await new Promise((r) => setTimeout(r, 120));
check('a maximise the page did not make still flips the icon',
    document.querySelector('#win-maximize .material-symbols-outlined').textContent, 'filter_none');
ok('…and hides the handles while maximised', document.body.classList.contains('twm-window-maximized'));

// ── §5 dispose ──────────────────────────────────────────────────────────
ctl.dispose();
ok('dispose removes the buttons, the handles and the body classes', bodyBare()
    && !document.body.classList.contains('twm-window-maximized'));

// ── JS fallback: a host without native gestures ─────────────────────────
{
    const js = fakeWindow({ native: false });
    const c2 = new WindowChromeController({ host: { window: js }, logger: quiet, topBar: '.app-bar' });
    check('custom chrome without native gestures: initialised', await c2.initialize(), true);
    check('…buttons fall back to the top bar itself', document.querySelector('.app-bar > .twm-window-controls') !== null, true);
    const h = document.querySelector('.twm-resize-handle.right');
    h.dispatchEvent(pointer('pointerdown', { screenX: 100, screenY: 100 }));
    await tick(); await tick();
    dom.window.dispatchEvent(pointer('pointermove', { screenX: 160, screenY: 100 }));
    await new Promise((r) => setTimeout(r, 40));
    dom.window.dispatchEvent(pointer('pointerup', { screenX: 160, screenY: 100 }));
    await tick();
    ok('…and a resize is done with setBounds', js.calls.some((c) => c.startsWith('setBounds:') && c.includes('"width":860')),
        js.calls.join(' | '));
    c2.dispose();
}

console.log(failures === 0 ? '\nall assertions passed\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
