/**
 * ══ ToggleField AND openForm's 'toggle' FIELD ═══════════════════════════════
 *
 * STORY-0043. There was no switch anywhere in FlexDesk, so every consumer
 * built its own. This suite is the contract of the one it now ships:
 *
 *   §1  THE SWITCH: track and knob over a real checkbox with role="switch";
 *       Space and Enter toggle the focused switch and aria-checked follows; a
 *       click on the track or the label toggles it; `onChange` hears a user
 *       toggle with a boolean and `set()` is silent; label, on/off text and
 *       the compact variant render; `dispose()` takes it down.
 *   §2  A DISABLED SWITCH ignores clicks and keys, and `setDisabled(false)`
 *       gives them back.
 *   §3  openForm `type: 'toggle'` mounts a ToggleField and resolves `true` or
 *       `false`; `onFieldChange`'s get/set read and write it as a boolean.
 *   §4  ITS CSS: every class the switch sets has a rule, and the section
 *       contains no hex literal — colours come from tokens.css; base.css
 *       mirrors the section byte for byte.
 *   §5  `@flexdesk/widgets` exports it.
 *
 *     node tests/toggle_field.test.mjs
 *
 * It imports the sources directly, never `dist/`. jsdom is borrowed from the
 * sibling Tables checkout; absent, this SKIPS loudly. jsdom applies no
 * stylesheet, so §4 reads the sheet's text.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody, stripComments } from './css_rules.mjs';

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
    console.log('toggle field: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.Event = dom.window.Event;

const { ToggleField } = await import('../src/ui/components/toggle_field.js');
const { openForm } = await import('../src/ui/components/modal.js');

// ── harness ─────────────────────────────────────────────────────────────
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
const section = (t) => console.log(`\n${t}`);

/** A key pressed on the focused element: keydown then keyup, as a user does. */
function press(key) {
    const el = document.activeElement;
    const down = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    el.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    return down;
}
function mount(opts) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const t = new ToggleField(opts);
    host.appendChild(t.render());
    return { t, host, input: t.input, q: (s) => host.querySelector(s) };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 the switch: a real input, Space and Enter, aria-checked follows');
{
    const heard = [];
    const { t, input, q } = mount({ label: 'Autosave', onText: 'On', offText: 'Off',
                                     onChange: (v) => heard.push(v) });
    ok('the root is a label.twm-toggle', t.root.tagName === 'LABEL' && t.root.classList.contains('twm-toggle'));
    ok('a real checkbox input', input.tagName === 'INPUT' && input.type === 'checkbox');
    check('with role="switch"', input.getAttribute('role'), 'switch');
    check('off by default, aria-checked="false"', [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    ok('track and knob drawn beside the input', !!q('.twm-toggle__control > .twm-toggle__track > .twm-toggle__knob'));
    check('the track is hidden from assistive technology', q('.twm-toggle__track').getAttribute('aria-hidden'), 'true');
    check('the label is shown', q('.twm-toggle__label').textContent, 'Autosave');
    check('the off text is shown', q('.twm-toggle__state').textContent, 'Off');

    input.focus();
    ok('the input takes focus', document.activeElement === input);
    const space = press(' ');
    check('Space turns it on and aria-checked follows', [t.get(), input.getAttribute('aria-checked')], [true, 'true']);
    ok('…and the browser\'s own Space activation is prevented (no double toggle)', space.defaultPrevented);
    check('…the on text is shown', q('.twm-toggle__state').textContent, 'On');
    const enter = press('Enter');
    check('Enter turns it off and aria-checked follows', [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    ok('…and does not submit a surrounding form', enter.defaultPrevented);
    press('Enter');
    check('Enter again turns it on', [t.get(), input.getAttribute('aria-checked')], [true, 'true']);
    press('a');
    press('Tab');
    check('other keys leave it alone', t.get(), true);
    check('onChange heard every user toggle, as booleans', heard, [true, false, true]);

    q('.twm-toggle__track').click();
    check('a click on the track toggles it', [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    q('.twm-toggle__label').click();
    check('a click on the label toggles it', t.get(), true);
    check('…and both were heard', heard.slice(3), [false, true]);

    t.set(false);
    check('set() writes the state and aria-checked', [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    check('…without calling onChange', heard.length, 5);
    t.dispose();
    ok('dispose() takes the switch out of the document', !q('.twm-toggle'));
    check('…and get() still answers', t.get(), false);
}
{
    const { t, input } = mount({ checked: true, compact: true, ariaLabel: 'Wrap lines' });
    ok('compact adds the variant class', t.root.classList.contains('twm-toggle--compact'));
    check('checked: true opens on, aria-checked="true"', [t.get(), input.getAttribute('aria-checked')], [true, 'true']);
    check('ariaLabel names a switch with no visible label', input.getAttribute('aria-label'), 'Wrap lines');
    ok('no state or label element unless asked for',
       !t.root.querySelector('.twm-toggle__state') && !t.root.querySelector('.twm-toggle__label'));
    ok('render() is idempotent', t.render() === t.root);
    t.dispose();
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 a disabled switch ignores clicks and keys');
{
    const heard = [];
    const { t, input, q } = mount({ disabled: true, label: 'Locked', onChange: (v) => heard.push(v) });
    ok('the input is disabled', input.disabled);
    ok('the root carries the disabled class', t.root.classList.contains('twm-toggle--disabled'));
    input.click();
    q('.twm-toggle__track').click();
    q('.twm-toggle__label').click();
    check('clicks on the input, the track and the label change nothing',
          [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    input.focus();
    // A disabled input cannot take focus in a browser; the keys are sent to
    // it regardless, the worst case.
    for (const key of [' ', 'Enter']) {
        input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        input.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    }
    check('Space and Enter change nothing', [t.get(), input.getAttribute('aria-checked')], [false, 'false']);
    check('onChange was never called', heard, []);

    t.setDisabled(false);
    ok('setDisabled(false) enables the input and drops the class',
       !input.disabled && !t.root.classList.contains('twm-toggle--disabled'));
    input.focus();
    press(' ');
    check('…and it toggles again', [t.get(), heard], [true, [true]]);
    t.setDisabled(true);
    q('.twm-toggle__track').click();
    check('setDisabled(true) disables it again', t.get(), true);
    t.dispose();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section("§3 openForm type: 'toggle' resolves true or false");
async function open(opts) {
    const before = new Set(document.querySelectorAll('.twm-modal__form'));
    const result = openForm(opts);
    const form = [...document.querySelectorAll('.twm-modal__form')].find((f) => !before.has(f));
    const q = (sel) => form.querySelector(sel);
    const submit = async () => { q('button[type="submit"]').click(); await tick(); await tick(); };
    return { form, q, submit, result };
}
{
    const f = await open({ fields: [{ name: 'autosave', label: 'Autosave', type: 'toggle' }] });
    const input = f.q('[name="autosave"]');
    ok('the field is a ToggleField switch in its row',
       !!f.q('[data-field-row="autosave"] .twm-toggle') && input.getAttribute('role') === 'switch');
    check('its accessible name is the field label', input.getAttribute('aria-label'), 'Autosave');
    check('the row shows the label', f.q('[data-field-row="autosave"] > span').textContent, 'Autosave');
    await f.submit();
    check('untouched, it resolves false', await f.result, { autosave: false });
}
{
    const f = await open({ fields: [{ name: 'autosave', label: 'Autosave', type: 'toggle' }] });
    const input = f.q('[name="autosave"]');
    input.focus();
    press(' ');
    check('Space in the form toggles it on', input.getAttribute('aria-checked'), 'true');
    await f.submit();
    check('toggled on, it resolves true', await f.result, { autosave: true });
}
{
    const changes = [];
    let api = null;
    const f = await open({
        fields: [
            { name: 'a', label: 'A', type: 'toggle', onText: 'Yes', offText: 'No' },
            { name: 'b', label: 'B', type: 'toggle', compact: true },
            { name: 'title', label: 'Title' },
        ],
        defaults: { a: true },
        onFieldChange: (name, value, x) => { api = x; changes.push([name, value]); },
    });
    const a = f.q('[name="a"]');
    const b = f.q('[name="b"]');
    check('a default of true opens it on', [a.checked, a.getAttribute('aria-checked')], [true, 'true']);
    check('onText / offText pass through', f.q('[data-field-row="a"] .twm-toggle__state').textContent, 'Yes');
    ok('compact passes through', b.closest('.twm-toggle').classList.contains('twm-toggle--compact'));
    check('api.get reads a toggle as a boolean', [api.get('a'), api.get('b')], [true, false]);
    f.q('[data-field-row="a"] .twm-toggle__track').click();
    check('a click fires onFieldChange with a boolean', changes.at(-1), ['a', false]);
    api.set('b', true);
    check('api.set writes it and aria-checked follows', [b.checked, b.getAttribute('aria-checked')], [true, 'true']);
    check('…without calling the hook back', changes.length, 2);
    await f.submit();
    check('both submit as booleans', await f.result, { a: false, b: true, title: '' });
}
{
    const f = await open({ fields: [{ name: 'x', label: 'X', type: 'toggle', disabled: true }],
                           defaults: { x: true } });
    f.q('[data-field-row="x"] .twm-toggle__track').click();
    await f.submit();
    check('a disabled toggle keeps its default and submits it', await f.result, { x: true });
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 its CSS: every class has a rule, and no hex literal');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const start = css.indexOf('/* ══ TOGGLE ');
    const end = css.indexOf('/* ══ end TOGGLE ══ */');
    ok('flexdesk.css has a TOGGLE section', start >= 0 && end > start);
    const sheet = stripComments(css.slice(start, end));
    const hex = sheet.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    check('the section contains no hex literal', hex, []);
    ok('nor an rgb()/hsl() literal', !/\b(rgba?|hsla?)\(/.test(sheet));

    const { t } = mount({ label: 'L', onText: 'On', offText: 'Off', compact: true, disabled: true });
    const seen = new Set();
    for (const n of [t.root, ...t.root.querySelectorAll('*')]) for (const c of n.classList) seen.add(c);
    seen.add('twm-modal__toggle');
    const missing = [...seen].filter((c) => !new RegExp(`\\.${c}(?![\\w-])[^{}]*\\{`).test(sheet));
    check('every class the switch and its form row set has a rule there', missing, []);
    ok('the checked state moves the knob',
       /transform/.test(ruleBody(sheet, '.twm-toggle__input:checked + .twm-toggle__track .twm-toggle__knob') || ''));
    ok('the focused input draws a ring on the track',
       /outline:\s*2px solid var\(--/.test(ruleBody(sheet, '.twm-toggle__input:focus-visible + .twm-toggle__track') || ''));
    t.dispose();

    const base = readFileSync(resolvePath(HERE, '../css/base.css'), 'utf8');
    const bStart = base.indexOf('/* ══ TOGGLE ');
    const bEnd = base.indexOf('/* ══ end TOGGLE ══ */');
    check('base.css carries the same TOGGLE section, byte for byte (the hand-mirror)',
          bStart >= 0 && bEnd > bStart ? base.slice(bStart, bEnd) : null, css.slice(start, end));
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 @flexdesk/widgets exports it');
{
    const barrel = readFileSync(resolvePath(HERE, '../widgets.js'), 'utf8');
    ok('widgets.js re-exports toggle_field.js',
       barrel.includes("export * from './src/ui/components/toggle_field.js';"));
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
