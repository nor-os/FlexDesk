/**
 * ══ BUG-0053: A CLOSED MANAGEDWINDOW LEAVES THE REGISTRY; FOCUS MOVES IN AND
 *    BACK; ESC CLOSES A NON-MODAL WINDOW ONLY FROM INSIDE IT ══════════════
 *
 *   §1  close() removes the window from the registry and releases its content
 *       and callbacks; get(id) answers null; reopening an id is a fresh window;
 *       saved geometry for a stable id still comes back.
 *   §2  saved geometry is capped to the most recently saved ids, and
 *       `persistGeometry: false` writes nothing.
 *   §3  `focusOnOpen` (default on) focuses the content's first focusable
 *       element and returns focus to the opener on close.
 *   §4  Esc closes a non-modal window only with focus inside it; a modal on
 *       top closes wherever focus is; one Esc closes one window.
 *
 *     node tests/managed_window_lifecycle.test.mjs        # from ../FlexDesk
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
    for (const c of [resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
                     resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js')]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('managed window lifecycle: SKIPPED — needs jsdom');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node',
                   'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator',
                   'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const { ManagedWindow, DEFAULT_MAX_SAVED_WINDOWS } =
    await import('../src/ui/components/managed_window.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const doc = dom.window.document;
Object.defineProperty(dom.window, 'innerWidth', { value: 1400, configurable: true });
Object.defineProperty(dom.window, 'innerHeight', { value: 900, configurable: true });
const KEY = ManagedWindow.storageKey;
const saved = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const esc = (target = doc) => target.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

function form() {
    const el = doc.createElement('div');
    el.innerHTML = '<p>text</p><input class="first" hidden><input class="name"><button class="ok">OK</button>';
    return el;
}
const openWin = (opts) => {
    const w = new ManagedWindow({ title: 'W', content: form(), ...opts });
    w.show();
    return w;
};

console.log('\n§1 a closed window leaves the registry and lets go of what it held\n');
{
    localStorage.clear();
    ManagedWindow.configure();
    let closed = 0;
    const content = form();
    const w = new ManagedWindow({ id: 'cfg', title: 'Config', content,
                                  onClose: () => { closed += 1; } });
    ok('a constructed window is registered', ManagedWindow.get('cfg') === w);
    w.show();
    ok('…and stays registered while open', ManagedWindow.get('cfg') === w
       && ManagedWindow.all().includes(w));
    w.x = 123; w.y = 140; w.width = 640; w.height = 420;
    w._applyPosition();
    w.close();
    ok('onClose ran once', closed === 1);
    ok('get(id) answers null after close', ManagedWindow.get('cfg') === null);
    ok('all() no longer lists it', !ManagedWindow.all().includes(w));
    ok('isClosed is true', w.isClosed === true);
    ok('the content, DOM and callbacks are released',
       w.content === null && w.element === null && w.contentContainer === null
       && w.onClose === null && w.beforeClose === null);
    ok('the element left the document', !doc.querySelector('[data-window-id="cfg"]'));
    const warn = console.warn; let warned = 0;
    console.warn = () => { warned += 1; };
    w.show();
    console.warn = warn;
    ok('show() on a closed window warns and shows nothing',
       warned === 1 && !doc.querySelector('[data-window-id="cfg"]'));

    const again = new ManagedWindow({ id: 'cfg', title: 'Config again', content: form() });
    again.show();
    ok('reopening the id builds a fresh window', again !== w && ManagedWindow.get('cfg') === again);
    ok('…which restores the geometry saved under the stable id',
       again.x === 123 && again.y === 140 && again.width === 640 && again.height === 420,
       JSON.stringify({ x: again.x, y: again.y, w: again.width, h: again.height }));
    again.close();

    // An older window closing must not unregister a newer one under its id.
    const a = new ManagedWindow({ id: 'dup', content: form() }); a.show();
    const b = new ManagedWindow({ id: 'dup', content: form() }); b.show();
    a.close();
    ok('closing a replaced window leaves its replacement registered', ManagedWindow.get('dup') === b);
    b.close();
    ok('…until that one closes', ManagedWindow.get('dup') === null);

    // A beforeClose guard that refuses keeps the window registered.
    const g = new ManagedWindow({ id: 'guarded', content: form(), beforeClose: () => false });
    g.show(); g.close();
    ok('a refused close keeps the window registered', ManagedWindow.get('guarded') === g && g.isVisible);
    g.close({ force: true });
    ok('…and a forced one removes it', ManagedWindow.get('guarded') === null);
}

console.log('\n§2 saved geometry is bounded\n');
{
    localStorage.clear();
    ok('the default cap is 50', DEFAULT_MAX_SAVED_WINDOWS === 50);
    ManagedWindow.configure({ maxSavedWindows: 3 });
    // Integer-like ids on purpose: a plain object sorts those first, so key
    // order alone could not say which is oldest.
    for (const id of ['w1', '200', 'w3', '10', 'w5']) {
        const w = new ManagedWindow({ id, content: form() }); w.show(); w.close();
    }
    ok('only the three most recently saved ids keep geometry',
       JSON.stringify(Object.keys(saved()).sort()) === JSON.stringify(['10', 'w3', 'w5']),
       JSON.stringify(Object.keys(saved())));
    const w3 = new ManagedWindow({ id: 'w3', content: form() }); w3.show(); w3.close();
    const w6 = new ManagedWindow({ id: 'w6', content: form() }); w6.show(); w6.close();
    ok('saving an id again makes it the newest, so the oldest other goes',
       JSON.stringify(Object.keys(saved()).sort()) === JSON.stringify(['w3', 'w5', 'w6']),
       JSON.stringify(Object.keys(saved())));

    // An entry from before the stamp existed is the oldest.
    localStorage.setItem(KEY, JSON.stringify({ legacy: { x: 1, y: 40, width: 500, height: 300 } }));
    ManagedWindow.configure({ maxSavedWindows: 2 });
    for (const id of ['n1', 'n2']) {
        const w = new ManagedWindow({ id, content: form() }); w.show(); w.close();
    }
    ok('an unstamped (pre-0.17.16) entry is dropped first',
       JSON.stringify(Object.keys(saved()).sort()) === JSON.stringify(['n1', 'n2']));

    ManagedWindow.configure();
    localStorage.clear();
    const eph = new ManagedWindow({ id: 'eph-123', content: form(), persistGeometry: false });
    eph.show(); eph.x = 300; eph._applyPosition(); eph.close();
    ok('persistGeometry: false writes no entry', !('eph-123' in saved()));
    localStorage.setItem(KEY, JSON.stringify({ 'eph-123': { x: 777, y: 300, width: 500, height: 300, u: 1 } }));
    ManagedWindow.configure();
    const eph2 = new ManagedWindow({ id: 'eph-123', content: form(), persistGeometry: false,
                                     defaultWidth: 500, defaultHeight: 300 });
    eph2.show();
    ok('…and restores none: it opens centred', eph2.x !== 777, `x = ${eph2.x}`);
    eph2.close();
}

console.log('\n§3 focus moves into the window and back\n');
{
    const opener = doc.createElement('button');
    opener.textContent = 'open';
    doc.body.appendChild(opener);
    opener.focus();
    const w = openWin({ id: 'f1' });
    const name = w.contentContainer.querySelector('.name');
    ok('focusOnOpen is on by default', w.focusOnOpen === true);
    ok('the first focusable element of the content has focus (a hidden one is skipped)',
       doc.activeElement === name, doc.activeElement?.className || doc.activeElement?.nodeName);
    w.close();
    ok('closing returns focus to the opener', doc.activeElement === opener);

    // Content with nothing focusable: the window takes focus itself.
    opener.focus();
    const bare = doc.createElement('div'); bare.textContent = 'just text';
    const w2 = new ManagedWindow({ id: 'f2', content: bare }); w2.show();
    ok('with nothing focusable, the window itself has focus', doc.activeElement === w2.element);
    w2.close();
    ok('…and focus returns to the opener', doc.activeElement === opener);

    // The user moved on before the window closed: focus stays where they are.
    opener.focus();
    const w3 = openWin({ id: 'f3' });
    const elsewhere = doc.createElement('input'); doc.body.appendChild(elsewhere);
    elsewhere.focus();
    w3.close();
    ok('a window closed while focus is elsewhere does not take it back', doc.activeElement === elsewhere);

    // The opener is gone by close time.
    const temp = doc.createElement('button'); doc.body.appendChild(temp); temp.focus();
    const w4 = openWin({ id: 'f4' });
    temp.remove();
    w4.close();
    ok('an opener no longer in the document is not focused', doc.activeElement !== temp);

    // Opt out.
    opener.focus();
    const w5 = openWin({ id: 'f5', focusOnOpen: false });
    ok('focusOnOpen: false leaves focus where it was', doc.activeElement === opener);
    w5.close();
    ok('…and does not move it on close', doc.activeElement === opener);

    // A restore from minimise is not an open.
    const w6 = openWin({ id: 'f6' });
    opener.focus();
    w6.minimize(); w6.show();
    ok('restoring a minimised window does not move focus', doc.activeElement === opener);
    w6.close({ force: true });
    opener.remove(); elsewhere.remove();
}

console.log('\n§4 Esc\n');
{
    const outside = doc.createElement('textarea'); doc.body.appendChild(outside);
    const w = openWin({ id: 'e1' });
    outside.focus();
    esc(outside);
    ok('Esc with focus outside a non-modal window leaves it open', w.isVisible);
    w.contentContainer.querySelector('.name').focus();
    esc(w.contentContainer.querySelector('.name'));
    ok('Esc with focus inside it closes it', !w.isVisible && w.isClosed);

    // Two non-modal windows: Esc closes the one holding focus, not the top one.
    const low = openWin({ id: 'e2' });
    const top = openWin({ id: 'e3' });
    ok('the second window is on top', top.zIndex > low.zIndex);
    low.contentContainer.querySelector('.name').focus();
    esc(low.contentContainer.querySelector('.name'));
    ok('Esc inside the lower window closes that window', !low.isVisible && top.isVisible);
    top.close();

    // One Esc closes one window, even when closing hands focus to another.
    const parent = openWin({ id: 'e4' });
    const inParent = parent.contentContainer.querySelector('.ok');
    inParent.focus();
    const child = openWin({ id: 'e5' });
    ok('the child took focus', child.element.contains(doc.activeElement));
    esc(doc.activeElement);
    ok('Esc closes the child', !child.isVisible);
    ok('focus went back into the parent', doc.activeElement === inParent);
    ok('…and the same Esc did not close the parent too', parent.isVisible);
    parent.close();

    // The order that needs the guard: the window that closes listens BEFORE
    // the one focus returns into, so the same event reaches that one next.
    // (Its opener is set by hand: a window opened first cannot have been
    // opened from one opened after it.)
    const first = openWin({ id: 'e8' });
    const second = openWin({ id: 'e9' });
    const inSecond = second.contentContainer.querySelector('.ok');
    first._returnFocusTo = inSecond;
    first.contentContainer.querySelector('.name').focus();
    esc(doc.activeElement);
    ok('Esc closes the window holding focus', !first.isVisible);
    ok('focus went to its opener in the window listening after it', doc.activeElement === inSecond);
    ok('…and that window ignored the Esc it had already been answered with', second.isVisible);
    second.close();

    // A modal on top answers Esc wherever focus is, as before.
    const under = openWin({ id: 'e6' });
    const modal = openWin({ id: 'e7', modal: true, focusOnOpen: false });
    outside.focus();
    esc(outside);
    ok('a modal closes on Esc with focus outside it', !modal.isVisible);
    ok('…and only the modal closes', under.isVisible);
    // A modal under a non-modal is not the top window: the top one decides.
    under.contentContainer.querySelector('.name').focus();
    esc(doc.activeElement);
    ok('the non-modal then closes on an Esc from inside it', !under.isVisible);
    outside.remove();
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
