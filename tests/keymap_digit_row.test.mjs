/**
 * ══ BUG-0046. ALT+SHIFT+1..9 FROM A REAL KEY PRESS ═════════════════════════
 *
 * The keymap read `e.key` for the digit chords. With Shift held a browser
 * reports the character the key TYPES: Alt+Shift+2 is `key: "@"` on a US
 * keyboard and `key: '"'` on a German one, so "move the focused tile to desktop
 * N" never fired from the keyboard and worked only from the palette or the tile
 * menu. Every existing test dispatched `key: '2'`, which no keyboard sends with
 * Shift held, and so hid it. The same read left AZERTY's Alt+1..9 dead (its
 * unshifted digit row types "&", "é"; only Shift types the digits) and a Mac's
 * Option+digit (which types "™", "€") dead.
 *
 * Reading the position must not take typing away. A German, French or Spanish
 * layout types `{ [ ] | @ #` on its digit row with AltGr (Windows: Ctrl+Alt) and,
 * on a Mac, with a bare Option, which is an `altKey` event like any Alt chord.
 * The Alt chords work in fields, so without a guard those characters would be
 * swallowed and a desktop switched (§5, §8). The guard for the Mac is the
 * platform, not the shape of `key`: a US Windows Alt+Shift+2 is `key: "@"` too.
 *
 * Every event here carries the `key` AND `code` pair a real keyboard sends.
 *
 *   §1  a real shell: Alt+Shift+2 from a US keyboard moves the tile to desktop 2
 *   §2  every digit, on the US, German, French AZERTY and Mac US layouts, with
 *       and without Shift: the chord is the key's position
 *   §3  an event with only a `key` (a synthetic one) is still read by `key`
 *   §4  the numpad: its digits as before, and as arrows when NumLock is off
 *   §5  AltGr types characters on the digit row and keeps typing them
 *   §6  a chord an embedder disabled or rebound still matches a real key press
 *   §7  letters are still named by the character they type, not by position
 *   §8  Option on a Mac types characters (German Option+8 is "{"): in a field
 *       they are typed, not read as a desktop chord; elsewhere they are chords
 *
 *     node tests/keymap_digit_row.test.mjs
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
    console.log('keymap digit row: SKIPPED — needs jsdom '
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
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.log(`  FAIL ${what}${why ? ` — ${why}` : ''}`);
}

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { installKeymap } = await import('../wm.js');

/** A keydown as a keyboard sends it: the character AND the key's position. */
const press = (init, target = document.body) => {
    const e = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};
const ALT = { altKey: true };
const ALT_SHIFT = { altKey: true, shiftKey: true };

/** Run `fn` as if the browser were on `platform` (`navigator.platform`), with
 *  `uaPlatform` as `navigator.userAgentData.platform` when given. jsdom reports
 *  neither, so every other section runs as "not a Mac". */
function onPlatform(platform, fn, uaPlatform) {
    Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
    if (uaPlatform !== undefined) {
        Object.defineProperty(navigator, 'userAgentData', { value: { platform: uaPlatform }, configurable: true });
    }
    try { return fn(); } finally {
        delete navigator.platform;
        delete navigator.userAgentData;
    }
}

/** The window manager calls a keymap makes, recorded instead of performed. */
function stubKeymap(extra = {}) {
    const log = [];
    const rec = (name) => (...a) => { log.push(`${name}(${a.join(',')})`); };
    const wm = Object.fromEntries(['navigateBack', 'cycleFocusedTab', 'cycleDesktop', 'split',
        'splitFocusedWith', 'openFocusedInTab', 'openFocusedInWindow', 'closeFocused',
        'toggleManagedFocused', 'focusDir', 'moveFocused', 'switchDesktop', 'moveFocusedToDesktop']
        .map((n) => [n, rec(n)]));
    const palette = { toggle: () => {}, isOpen: () => false, close: () => {} };
    const off = installKeymap({ wm, palette, ...extra });
    return { log, off };
}

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 a real shell: Alt+Shift+2 from a US keyboard moves the focused tile');
{
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const shell = await createShell({
        root,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({
            kinds: { home: { label: 'Home' }, table: { label: 'Table', topNav: 'home' } },
            root: 'home' }),
        content: {
            home: (host) => { host.textContent = 'ground'; return {}; },
            table: (host, ctx) => { host.textContent = `table ${ctx?.props?.id ?? ''}`; return {}; },
        },
        panels: { left: false, right: false, bottom: false },
    });
    const { wm } = shell;
    wm.addDesktop();
    const tree0 = wm.desktops.desktops[0].tree;
    const leaf0 = tree0.primaryLeafId();
    tree0.setLeafContent(leaf0, { kind: 'table', props: { id: 'a' } }, 'A');
    tree0.focus(leaf0);
    const idOn = (i) => {
        const t = wm.desktops.desktops[i].tree;
        return t.get(t.primaryLeafId())?.content?.props?.id ?? null;
    };
    ok('before: the tile is on desktop 1 and desktop 2 shows no table', idOn(0) === 'a' && idOn(1) === null,
       `${idOn(0)} / ${idOn(1)}`);

    const e = press({ key: '@', code: 'Digit2', ...ALT_SHIFT });
    ok('Alt+Shift+2 (key "@", code Digit2) is prevented', e.defaultPrevented);
    ok('…and the tile is now on desktop 2', idOn(1) === 'a', `desktop 2 shows ${idOn(1)}`);
    ok('…and no longer on desktop 1', idOn(0) !== 'a', `desktop 1 shows ${idOn(0)}`);

    // Alt+2 on its own already worked; it must keep switching to that desktop.
    press({ key: '2', code: 'Digit2', ...ALT });
    ok('Alt+2 (key "2") still switches to desktop 2', wm.desktops.activeIdx === 1, `active ${wm.desktops.activeIdx}`);
    shell.dispose();
}

// ── §2 ───────────────────────────────────────────────────────────────────
console.log('§2 every digit on four layouts, with and without Shift');
{
    // [name, what each digit key types with no modifier but Alt, with Alt+Shift,
    //  navigator.platform]. The target is the body, not a field: a Mac's Option
    //  types in a field, which §8 covers.
    const LAYOUTS = [
        ['US', ['1', '2', '3', '4', '5', '6', '7', '8', '9'], ['!', '@', '#', '$', '%', '^', '&', '*', '('], 'Win32'],
        ['German', ['1', '2', '3', '4', '5', '6', '7', '8', '9'], ['!', '"', '§', '$', '%', '&', '/', '(', ')'], 'Win32'],
        ['French AZERTY', ['&', 'é', '"', "'", '(', '-', 'è', '_', 'ç'], ['1', '2', '3', '4', '5', '6', '7', '8', '9'], 'Linux x86_64'],
        ['Mac US, Option', ['¡', '™', '£', '¢', '∞', '§', '¶', '•', 'ª'], ['⁄', '€', '‹', '›', 'ﬁ', 'ﬂ', '‡', '°', '·'], 'MacIntel'],
    ];
    const { log, off } = stubKeymap();
    for (const [layout, plain, shifted, platform] of LAYOUTS) {
        const got = { switched: [], moved: [], prevented: true };
        onPlatform(platform, () => {
            for (let d = 1; d <= 9; d++) {
                log.length = 0;
                const a = press({ key: plain[d - 1], code: `Digit${d}`, ...ALT });
                got.switched.push(log.join(';'));
                got.prevented &&= a.defaultPrevented;
                log.length = 0;
                const s = press({ key: shifted[d - 1], code: `Digit${d}`, ...ALT_SHIFT });
                got.moved.push(log.join(';'));
                got.prevented &&= s.defaultPrevented;
            }
        });
        const wantSwitch = Array.from({ length: 9 }, (_, i) => `switchDesktop(${i})`);
        const wantMove = Array.from({ length: 9 }, (_, i) => `moveFocusedToDesktop(${i})`);
        ok(`${layout}: Alt+1..9 switch to desktops 1..9`, got.switched.join('|') === wantSwitch.join('|'),
           got.switched.join('|'));
        ok(`${layout}: Alt+Shift+1..9 move the tile to desktops 1..9`, got.moved.join('|') === wantMove.join('|'),
           got.moved.join('|'));
        ok(`${layout}: every one is prevented`, got.prevented);
    }
    // A Shift-only press is not a chord, and neither is 0, which is not bound.
    log.length = 0;
    const bare = press({ key: '@', code: 'Digit2', shiftKey: true });
    ok('Shift+2 with no Alt does nothing and is left to the page', log.length === 0 && !bare.defaultPrevented,
       log.join(';'));
    const zero = press({ key: '0', code: 'Digit0', ...ALT });
    const zeroShift = press({ key: ')', code: 'Digit0', ...ALT_SHIFT });
    ok('Alt+0 and Alt+Shift+0 bind nothing', log.length === 0 && !zero.defaultPrevented && !zeroShift.defaultPrevented,
       log.join(';'));
    log.length = 0;
    const field = document.createElement('input');
    document.body.append(field);
    const inField = press({ key: '@', code: 'Digit2', ...ALT_SHIFT }, field);
    ok('the Alt chords still work while focus is in a field',
       log.join(';') === 'moveFocusedToDesktop(1)' && inField.defaultPrevented, log.join(';'));
    field.remove();
    off();
}

// ── §3 ───────────────────────────────────────────────────────────────────
console.log('§3 an event with only a key is still read by key');
{
    const { log, off } = stubKeymap();
    for (let d = 1; d <= 9; d++) {
        log.length = 0;
        const a = press({ key: String(d), ...ALT });
        const aOk = log.join(';') === `switchDesktop(${d - 1})` && a.defaultPrevented;
        log.length = 0;
        const s = press({ key: String(d), ...ALT_SHIFT });
        const sOk = log.join(';') === `moveFocusedToDesktop(${d - 1})` && s.defaultPrevented;
        ok(`key "${d}" alone: Alt+${d} switches, Alt+Shift+${d} moves`, aOk && sOk, log.join(';'));
    }
    // The legacy loose read (Ctrl and Meta ignored while Alt is held) is unchanged.
    log.length = 0;
    press({ key: '3', code: 'Digit3', altKey: true, ctrlKey: true });
    ok('Ctrl+Alt+3 on a US keyboard is still Alt+3', log.join(';') === 'switchDesktop(2)', log.join(';'));
    off();
}

// ── §4 ───────────────────────────────────────────────────────────────────
console.log('§4 the numpad');
{
    const { log, off } = stubKeymap();
    press({ key: '2', code: 'Numpad2', ...ALT });
    ok('Alt+numpad 2 with NumLock on switches to desktop 2', log.join(';') === 'switchDesktop(1)', log.join(';'));
    log.length = 0;
    press({ key: '2', code: 'Numpad2', ...ALT_SHIFT });
    ok('…and with Shift, where the OS keeps the digit, moves the tile', log.join(';') === 'moveFocusedToDesktop(1)',
       log.join(';'));
    log.length = 0;
    press({ key: 'ArrowDown', code: 'Numpad2', ...ALT });
    ok('Alt+numpad 2 with NumLock off is an arrow and moves focus down, not desktop 2',
       log.join(';') === 'focusDir(down)', log.join(';'));
    off();
}

// ── §5 ───────────────────────────────────────────────────────────────────
console.log('§5 AltGr types characters on the digit row and keeps typing them');
{
    const { log, off } = stubKeymap();
    const field = document.createElement('input');
    document.body.append(field);
    // Windows reports AltGr as Ctrl+Alt; a German AltGr+7 types "{", a French
    // AZERTY AltGr+4 types "{" too, and a Spanish AltGr+2 types "@".
    for (const [what, key, code] of [['German AltGr+7', '{', 'Digit7'], ['German AltGr+8', '[', 'Digit8'],
                                    ['French AltGr+4', '{', 'Digit4'], ['Spanish AltGr+2', '@', 'Digit2']]) {
        log.length = 0;
        const e = press({ key, code, altKey: true, ctrlKey: true }, field);
        ok(`${what} (Ctrl+Alt) types "${key}": nothing runs, nothing is prevented`,
           log.length === 0 && !e.defaultPrevented, `${log.join(';')} prevented=${e.defaultPrevented}`);
    }
    // A browser that says so with the modifier state instead.
    log.length = 0;
    const viaState = press({ key: '{', code: 'Digit7', altKey: true, modifierAltGraph: true }, field);
    ok('AltGraph reported by getModifierState alone is the same', log.length === 0 && !viaState.defaultPrevented,
       `${log.join(';')} prevented=${viaState.defaultPrevented}`);
    field.remove();
    off();
}

// ── §6 ───────────────────────────────────────────────────────────────────
console.log('§6 a disabled or rebound chord still matches a real key press');
{
    const US2 = { key: '@', code: 'Digit2', ...ALT_SHIFT };
    const US3 = { key: '#', code: 'Digit3', ...ALT_SHIFT };

    // {'Alt+Shift+2': false}: the chord is the page's, so the event is not prevented.
    {
        const { log, off } = stubKeymap({ bindings: { 'Alt+Shift+2': false } });
        const seen = [];
        const page = (e) => seen.push(e.defaultPrevented);
        document.addEventListener('keydown', page);
        const e = press(US2);
        ok('disabled: Alt+Shift+2 runs nothing and is not prevented', log.length === 0 && !e.defaultPrevented,
           `${log.join(';')} prevented=${e.defaultPrevented}`);
        log.length = 0;
        press(US3);
        ok('…and Alt+Shift+3, not disabled, still moves the tile', log.join(';') === 'moveFocusedToDesktop(2)',
           log.join(';'));
        document.removeEventListener('keydown', page);
        off();
    }
    // A function bound under another spelling of the chord.
    {
        const calls = [];
        const { log, off } = stubKeymap({ bindings: {
            'option+SHIFT+2': (e) => { calls.push(e.key); },
        } });
        const e = press(US2);
        ok('function: runs on the real press, once, with the event',
           calls.join('|') === '@' && log.length === 0 && e.defaultPrevented, `${calls.join('|')} / ${log.join(';')}`);
        off();
    }
    // Rebound to another built-in action, from an AZERTY Alt+3 (key `"`).
    {
        const { log, off } = stubKeymap({ bindings: { 'Alt+3': 'toDesktop:0', 'Alt+Shift+2': 'desktop:7' } });
        press({ key: '"', code: 'Digit3', ...ALT });
        const first = log.join(';');
        log.length = 0;
        press(US2);
        ok('action names: AZERTY Alt+3 runs toDesktop:0 and US Alt+Shift+2 runs desktop:7',
           first === 'moveFocusedToDesktop(0)' && log.join(';') === 'switchDesktop(7)', `${first} / ${log.join(';')}`);
        off();
    }
}

// ── §7 ───────────────────────────────────────────────────────────────────
console.log('§7 letters are still named by the character they type');
{
    const { log, off } = stubKeymap();
    // On AZERTY the key at QWERTY's W position types "z", and the key at Z's types "w".
    const z = press({ key: 'z', code: 'KeyW', ...ALT });
    ok('AZERTY: the key that types "z" is not Alt+W (it is a swallowed Alt+letter)',
       log.length === 0 && z.defaultPrevented, log.join(';'));
    log.length = 0;
    press({ key: 'w', code: 'KeyZ', ...ALT });
    ok('AZERTY: the key that types "w" is Alt+W and closes the tile', log.join(';') === 'closeFocused()', log.join(';'));
    log.length = 0;
    press({ key: 'H', code: 'KeyH', ...ALT_SHIFT });
    ok('Alt+Shift+H (key "H") still opens a split', log.join(';') === 'splitFocusedWith(h)', log.join(';'));
    off();
}

// ── §8 ───────────────────────────────────────────────────────────────────
console.log('§8 Option on a Mac types characters: in a field they are typed, not switched');
{
    // [what, key, code, modifiers, the chord the position stands for outside a
    // field]. These are the characters a programmer reaches with Option (or
    // Option+Shift) on the digit row of a non-US Mac layout, and the US ones.
    const OPT = ALT;
    const OPT_SHIFT = ALT_SHIFT;
    const MAC_TYPES = [
        ['German Mac Option+5 types "["', '[', 'Digit5', OPT, 'switchDesktop(4)'],
        ['German Mac Option+6 types "]"', ']', 'Digit6', OPT, 'switchDesktop(5)'],
        ['German Mac Option+7 types "|"', '|', 'Digit7', OPT, 'switchDesktop(6)'],
        ['German Mac Option+8 types "{"', '{', 'Digit8', OPT, 'switchDesktop(7)'],
        ['German Mac Option+9 types "}"', '}', 'Digit9', OPT, 'switchDesktop(8)'],
        ['German Mac Option+Shift+7 types a backslash', '\\', 'Digit7', OPT_SHIFT, 'moveFocusedToDesktop(6)'],
        ['Spanish or Swedish Mac Option+2 types "@"', '@', 'Digit2', OPT, 'switchDesktop(1)'],
        ['Spanish Mac Option+3 types "#"', '#', 'Digit3', OPT, 'switchDesktop(2)'],
        ['French Mac Option+5 types "{"', '{', 'Digit5', OPT, 'switchDesktop(4)'],
        ['US Mac Option+2 types "™"', '™', 'Digit2', OPT, 'switchDesktop(1)'],
        ['US Mac Option+Shift+2 types "€"', '€', 'Digit2', OPT_SHIFT, 'moveFocusedToDesktop(1)'],
        ['a dead key on the digit row (it composes with the next character)', 'Dead', 'Digit6', OPT, 'switchDesktop(5)'],
    ];
    const mkText = (tag) => {
        const el = document.createElement(tag);
        if (tag === 'div') el.setAttribute('contenteditable', 'true');
        document.body.append(el);
        return el;
    };
    const fields = { 'an input': mkText('input'), 'a textarea': mkText('textarea'), 'a contenteditable': mkText('div') };
    const plain = document.createElement('div');
    document.body.append(plain);
    const { log, off } = stubKeymap();

    onPlatform('MacIntel', () => {
        for (const [what, key, code, mods, chord] of MAC_TYPES) {
            for (const [where, el] of Object.entries(fields)) {
                log.length = 0;
                const e = press({ key, code, ...mods }, el);
                ok(`${what}, in ${where}: typed, nothing runs and nothing is prevented`,
                   log.length === 0 && !e.defaultPrevented, `${log.join(';')} prevented=${e.defaultPrevented}`);
            }
            // Out of a field nothing is typed, so the position is the chord.
            log.length = 0;
            const e = press({ key, code, ...mods }, plain);
            ok(`${what}, outside a field: the position is the chord`,
               log.join(';') === chord && e.defaultPrevented, `${log.join(';')} prevented=${e.defaultPrevented}`);
        }
        // A synthetic event whose key is the digit is a chord anywhere.
        log.length = 0;
        const synthetic = press({ key: '3', ...ALT }, fields['an input']);
        ok('a Mac event with key "3" and no code is Alt+3 in a field too',
           log.join(';') === 'switchDesktop(2)' && synthetic.defaultPrevented, log.join(';'));
    });

    // The platform is what tells Option from Alt, so each way a browser names
    // a Mac is read: navigator.platform, userAgentData, and an iPad.
    for (const [how, platform, uaPlatform] of [
        ['navigator.platform "MacIntel"', 'MacIntel', undefined],
        ['navigator.platform "iPad"', 'iPad', undefined],
        ['userAgentData.platform "macOS", navigator.platform absent', '', 'macOS'],
    ]) {
        onPlatform(platform, () => {
            log.length = 0;
            const e = press({ key: '{', code: 'Digit8', ...ALT }, fields['an input']);
            ok(`${how}: Option+8 types "{" in a field`, log.length === 0 && !e.defaultPrevented,
               `${log.join(';')} prevented=${e.defaultPrevented}`);
        }, uaPlatform);
    }

    // The same presses on a platform where Alt does not type are the very chords
    // this bug is about, and in a field too: it is the platform that decides,
    // not the shape of `key` ("@" is a printable character on a US keyboard).
    const ALT_CHORDS = [
        ['US Alt+Shift+2 types "@"', { key: '@', code: 'Digit2', ...ALT_SHIFT }, 'moveFocusedToDesktop(1)'],
        ['German Alt+Shift+2 types a double quote', { key: '"', code: 'Digit2', ...ALT_SHIFT }, 'moveFocusedToDesktop(1)'],
        ['French AZERTY Alt+2 types "é"', { key: 'é', code: 'Digit2', ...ALT }, 'switchDesktop(1)'],
        ['French AZERTY Alt+Shift+2 types "2"', { key: '2', code: 'Digit2', ...ALT_SHIFT }, 'moveFocusedToDesktop(1)'],
    ];
    for (const platform of ['Win32', 'Linux x86_64', '']) {
        onPlatform(platform, () => {
            for (const [what, init, chord] of ALT_CHORDS) {
                for (const [where, el] of Object.entries(fields)) {
                    log.length = 0;
                    const e = press(init, el);
                    ok(`${platform || 'no platform'}: ${what}, in ${where}, is the chord`,
                       log.join(';') === chord && e.defaultPrevented, `${log.join(';')} prevented=${e.defaultPrevented}`);
                }
            }
        });
    }

    // A rebound or disabled chord still decides, on a Mac outside a field.
    off();
    onPlatform('MacIntel', () => {
        const { log: l2, off: off2 } = stubKeymap({ bindings: { 'Alt+8': false } });
        const e = press({ key: '{', code: 'Digit8', ...ALT }, plain);
        ok('{ "Alt+8": false } on a Mac outside a field leaves the press to the page',
           l2.length === 0 && !e.defaultPrevented, l2.join(';'));
        off2();
    });
    for (const el of [...Object.values(fields), plain]) el.remove();
}

if (failures) {
    console.log(`\nkeymap digit row: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nkeymap digit row: all passed');
process.exit(0);
