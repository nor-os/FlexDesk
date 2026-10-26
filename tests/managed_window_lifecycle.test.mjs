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
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

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
    ok('a modal on top closes on Esc with focus outside it', !modal.isVisible);
    ok('…and only the modal closes', under.isVisible);
    under.close();
    outside.remove();
}

console.log('\n§5 a modal UNDER a non-modal window still answers Esc (review 5)\n');
{
    const outside = doc.createElement('textarea'); doc.body.appendChild(outside);
    const modal = openWin({ id: 'm1', modal: true });
    const floating = openWin({ id: 'm2' });
    ok('the non-modal window is on top of the modal', floating.zIndex > modal.zIndex && modal.isVisible);
    const inModal = modal.contentContainer.querySelector('.name');
    inModal.focus();
    esc(inModal);
    ok('Esc with focus inside the modal under it closes the modal', !modal.isVisible);
    ok('…and not the non-modal on top', floating.isVisible);

    const modal2 = openWin({ id: 'm3', modal: true });
    const floating2 = openWin({ id: 'm4' });
    outside.focus();
    esc(outside);
    ok('with focus in no window, the topmost modal answers', !modal2.isVisible);
    ok('…and a non-modal that does not hold focus does not', floating2.isVisible && floating.isVisible);

    const modal3 = openWin({ id: 'm5', modal: true });
    const floating3 = openWin({ id: 'm6' });
    floating3.contentContainer.querySelector('.name').focus();
    esc(doc.activeElement);
    ok('with focus in the non-modal on top, that window answers', !floating3.isVisible);
    ok('…and the modal under it stays', modal3.isVisible);
    modal3.close(); floating2.close(); floating.close();
    outside.remove();
}

console.log('\n§6 an Esc answered inside the window is not the window\'s (review 4)\n');
{
    const { AutocompleteField } = await import('../src/ui/components/autocomplete_field.js');
    // jsdom has no scrollIntoView; the list scrolls its active row with it.
    dom.window.Element.prototype.scrollIntoView ??= function () {};
    const ac = new AutocompleteField({ fieldId: 'ac-in-window',
                                       provider: () => [{ label: 'alpha', value: 'alpha' }, { label: 'beta', value: 'beta' }] });
    const host = doc.createElement('div');
    host.appendChild(ac.render());
    const w = new ManagedWindow({ id: 'ac', title: 'AC', content: host });
    w.show();
    ok('the autocomplete input has focus', doc.activeElement === ac.input);
    ac.input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    ok('ArrowDown opens its list', ac._isOpen === true);
    esc(ac.input);
    ok('the first Esc closes the list', ac._isOpen === false);
    ok('…and leaves the window open', w.isVisible);
    esc(ac.input);
    ok('the next Esc closes the window', !w.isVisible);

    const w2 = openWin({ id: 'ime' });
    w2.contentContainer.querySelector('.name').dispatchEvent(new dom.window.KeyboardEvent(
        'keydown', { key: 'Escape', bubbles: true, isComposing: true }));
    ok('an Esc that ends an IME composition does not close the window', w2.isVisible);
    w2.close();
}

console.log('\n§7 legacy geometry: minted ids are purged, stable ids kept (review 1)\n');
{
    localStorage.clear();
    const legacy = { 'settings-window': { x: 11, y: 40, width: 500, height: 300 },
                     'about': { x: 22, y: 40, width: 500, height: 300 } };
    for (let i = 0; i < 60; i++) legacy[`twm-mw-k${i}-abc`] = { x: i, y: 40, width: 500, height: 300 };
    localStorage.setItem(KEY, JSON.stringify(legacy));
    ManagedWindow.configure();      // drops the cache, so the next read is from storage
    const w = new ManagedWindow({ id: 'fresh', content: form() }); w.show(); w.close();
    const keys = Object.keys(saved());
    ok('no twm-mw-* entry survives', !keys.some((k) => k.startsWith('twm-mw-')), JSON.stringify(keys));
    ok('both stable legacy ids keep their geometry',
       saved()['settings-window']?.x === 11 && saved()['about']?.x === 22);
    ok('…and are stamped in the order they were stored, older than the new save',
       saved()['settings-window'].u < saved()['about'].u && saved()['about'].u < saved().fresh.u);
    const back = new ManagedWindow({ id: 'settings-window', content: form() }); back.show();
    ok('a stable legacy id still restores its geometry', back.x === 11, `x = ${back.x}`);
    back.close();

    // Under a cap the legacy ids rank as the oldest real ones, LRU from there.
    localStorage.setItem(KEY, JSON.stringify(legacy));
    ManagedWindow.configure({ maxSavedWindows: 3 });
    for (const id of ['n1', 'n2']) { const x = new ManagedWindow({ id, content: form() }); x.show(); x.close(); }
    ok('with a cap of 3, the oldest-stored legacy id goes first, not the minted junk',
       JSON.stringify(Object.keys(saved()).sort()) === JSON.stringify(['about', 'n1', 'n2']),
       JSON.stringify(Object.keys(saved())));
    ManagedWindow.configure();
    localStorage.clear();
}

console.log('\n§8 a press inside a window keeps focus in it (review 2)\n');
{
    const outside = doc.createElement('textarea'); doc.body.appendChild(outside);
    const w = openWin({ id: 'press', focusOnOpen: false });
    ok('the window element is focusable by script, never by Tab', w.element.tabIndex === -1);
    outside.focus();
    const topbar = w.element.querySelector('.twm-managed-window__topbar');
    topbar.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    doc.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
    ok('a press on the title bar moves focus into the window', doc.activeElement === w.element);
    esc(doc.activeElement);
    ok('…so Esc then closes it', !w.isVisible);

    const w2 = openWin({ id: 'press2' });
    const name = w2.contentContainer.querySelector('.name');
    name.focus();
    w2.contentContainer.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    ok('a press inside a window that already holds focus leaves it where it is', doc.activeElement === name);
    w2.close();
    outside.remove();

    const { readFileSync } = await import('node:fs');
    const { ruleBody } = await import('./css_rules.mjs');
    for (const sheet of ['base.css', 'flexdesk.css']) {
        const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
        ok(`${sheet}: the focused frame draws no outline (its focus-within border shows it)`,
           /outline:\s*none/.test(ruleBody(css, '.twm-managed-window:focus') || ''));
    }
}

console.log('\n§9 progress windows do not put focus on a button that cancels (review 3)\n');
{
    const { showComputingWindow } = await import('../src/ui/components/computing_status_window.js');
    const { showRunProgressDialog } = await import('../src/ui/components/confirm_dialog.js');
    const editor = doc.createElement('textarea'); doc.body.appendChild(editor);
    editor.focus();
    const status = showComputingWindow({ message: 'Working', onCancel: () => {} });
    ok('the computing status window leaves focus where the user is', doc.activeElement === editor);
    status.complete?.({ ok: true });
    doc.querySelectorAll('.twm-managed-window').forEach((el) => el.remove());

    editor.focus();
    const run = showRunProgressDialog({ onCancel: () => {} });
    const win = doc.activeElement?.closest?.('.twm-managed-window');
    ok('the run progress dialog takes focus', !!win);
    ok('…on the window itself, not on Stop or a button',
       doc.activeElement?.classList.contains('twm-managed-window'),
       doc.activeElement?.className);
    let enterCancelled = false;
    run.result.then((r) => { enterCancelled = r?.status === 'cancelled'; });
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    ok('a stray Enter does not cancel the run', !enterCancelled);
    run.complete({ ok: true });
    editor.remove();
}

console.log('\n§10 a wizard in a window opens with focus on the step\'s field (review 6)\n');
{
    const { Wizard } = await import('../src/ui/components/wizard.js');
    const wiz = new Wizard({ data: {}, steps: [
        { id: 'a', label: 'A', render(body) { const i = doc.createElement('input'); i.className = 'step-field'; body.appendChild(i); } },
        { id: 'b', label: 'B', render(body) { body.textContent = 'b'; } },
    ] });
    const w = wiz.openInWindow({ id: 'wiz', modal: true });
    ok('focus is on the first step\'s field, not on the stepper',
       doc.activeElement?.classList.contains('step-field'), doc.activeElement?.className);
    wiz.dispose();
    ok('disposing closes the window', !w.isVisible);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
