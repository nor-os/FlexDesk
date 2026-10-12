/**
 * ══ openForm: A FIELD-CHANGE HOOK, A PICKER, A CREATABLE SELECT ═════════════
 *
 * STORY-0011. BugDesk carried its own copy of `modal.js` for four additions to
 * `openForm`; this suite is the contract that lets it delete the copy:
 *
 *   §1  A FORM USING NONE OF THEM IS 0.9.1. No hook, no picker, no named
 *       section: the markup carries nothing new, the submit resolves the same
 *       data, and an object `create` spec still creates and still announces.
 *   §2  `onFieldChange(name, value, api)` runs once on open and after every
 *       change; its api hides and shows fields and named sections and reads
 *       and writes values — and a write does not call the hook back.
 *   §3  A HIDDEN ROW STAYS HIDDEN, whatever the field — the attribute, an
 *       inline style, and the stylesheet's `[hidden]` rule, because
 *       `.twm-modal__row` is a grid and a grid beats the UA's `display: none`.
 *       A hidden row is not asked about: its `required` and its validator
 *       stand down, and come back when it is shown.
 *   §4  `type: 'picker'`: read-only display + search button; the button
 *       awaits `pick()`, shows the label and submits the value.
 *   §5  `create: true` on a select: a typed value outside the options is
 *       submitted as typed, with no "will create" promise.
 *
 *     node tests/open_form.test.mjs
 *
 * It imports `../src/ui/components/modal.js` DIRECTLY, never `dist/`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly. jsdom
 * applies no stylesheet, so §3's CSS half is asserted on the sheet's text.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody } from './css_rules.mjs';

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
    console.log('open form: SKIPPED — needs jsdom '
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
// Node 18+ has an `Event` of its own, which jsdom's `dispatchEvent` refuses —
// and the picker dispatches one. jsdom's wins here.
globalThis.Event = dom.window.Event;

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

/** Open a form and hand back its body, the pending result and some verbs. */
async function open(opts) {
    const before = new Set(document.querySelectorAll('.twm-modal__form'));
    const result = openForm(opts);
    const form = [...document.querySelectorAll('.twm-modal__form')].find((f) => !before.has(f));
    const q = (sel) => form.querySelector(sel);
    const row = (name) => q(`[data-field-row="${name}"]`);
    const field = (name) => q(`[name="${name}"]`);
    /** Type into a control the way a user does: value, input, then change. */
    const type = (name, value) => {
        const el = field(name);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    /** The submit button, clicked: jsdom runs constraint validation first. */
    const submit = async () => { q('button[type="submit"]').click(); await tick(); await tick(); };
    const cancel = async () => { q('[data-action="cancel"]').click(); return result; };
    let settled = false;
    result.then(() => { settled = true; });
    return { form, q, row, field, type, submit, cancel, result, settled: () => settled };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 a form using none of the additions behaves as in 0.9.1');
{
    let created = null;
    const f = await open({
        title: 'Plain',
        fields: [
            { section: 'General' },
            { name: 'name', label: 'Name', required: true },
            { name: 'count', label: 'Count', type: 'number' },
            { name: 'on', label: 'On', type: 'checkbox' },
            { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
            { name: 'asset', label: 'Asset', type: 'select', options: ['x'],
              create: { onCreate: async (v) => { created = v; return `id:${v}`; }, hint: 'new asset' } },
        ],
        defaults: { name: 'n', count: 3, on: true, kind: 'b' },
    });
    ok('no hidden input anywhere in the form', !f.q('input[type="hidden"]'));
    ok('an unnamed section is not addressable', !f.q('.twm-modal__section[data-field-row]'));
    ok('no picker markup', !f.q('.twm-picker'));
    f.type('asset', 'y');
    ok('an object create spec still announces what it will create',
       f.q('.twm-combobox__hint[data-for="asset"]').textContent.includes('new asset'));
    await f.submit();
    check('the submit resolves the same data, the new value created by onCreate',
          await f.result, { name: 'n', count: 3, on: true, kind: 'b', asset: 'id:y' });
    check('onCreate saw the typed value', created, 'y');
}
{
    const f = await open({ fields: [{ name: 'name', label: 'Name', required: true }] });
    await f.submit();
    ok('a required empty field still blocks the submit', !f.settled());
    check('cancel still resolves null', await f.cancel(), null);
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 onFieldChange: once on open, after every change, with an api');
{
    const calls = [];
    const f = await open({
        fields: [
            { name: 'type', label: 'Type', type: 'select', options: ['bug', 'story'] },
            { section: 'Story', name: 'story_section' },
            { name: 'points', label: 'Points', type: 'number' },
            { name: 'flag', label: 'Flag', type: 'checkbox' },
            { name: 'title', label: 'Title' },
        ],
        defaults: { type: 'bug', title: 'hello' },
        onFieldChange: (name, value, api) => {
            calls.push([name, value]);
            const story = api.get('type') === 'story';
            api.setVisible('story_section', story);
            api.setVisible('points', story);
            if (name === 'type') api.set('title', `${value}: ${api.get('title')}`);
        },
    });
    check('called once on open, with no field name', calls, [[null, undefined]]);
    ok('the open call already hid the story-only field', f.row('points').hidden);
    ok('…and the named section', f.row('story_section').hidden);
    f.type('type', 'story');
    check('called after the change with the field and its value', calls.at(-1), ['type', 'story']);
    ok('setVisible(true) shows the field again', !f.row('points').hidden);
    ok('…and the section', !f.row('story_section').hidden);
    check('get read and set wrote', f.field('title').value, 'story: hello');
    check('set did not call the hook back (two calls: open, type)', calls.length, 2);
    f.field('flag').click();
    check('a checkbox change fires with a boolean', calls.at(-1), ['flag', true]);
    f.type('points', '5');
    await f.submit();
    check('everything is submitted', await f.result,
          { type: 'story', points: 5, flag: true, title: 'story: hello' });
}
{
    const real = console.error; console.error = () => {};
    const f = await open({
        fields: [{ name: 'a', label: 'A' }],
        onFieldChange: () => { throw new Error('boom'); },
    });
    f.type('a', 'x');
    console.error = real;
    await f.submit();
    check('a hook that throws does not break the form', await f.result, { a: 'x' });
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 a hidden row stays hidden, whatever the field type');
{
    const types = [
        { name: 't', label: 'T' },
        { name: 'n', label: 'N', type: 'number' },
        { name: 's', label: 'S', type: 'select', options: ['1'] },
        { name: 'ta', label: 'TA', type: 'textarea' },
        { name: 'c', label: 'C', type: 'checkbox' },
        { name: 'cb', label: 'CB', type: 'select', options: ['1'], create: true },
        { name: 'p', label: 'P', type: 'picker', pick: async () => null },
    ];
    let api = null;
    const f = await open({ fields: types, onFieldChange: (_n, _v, a) => { api = a; } });
    for (const t of types) api.setVisible(t.name, false);
    for (const t of types) {
        const r = f.row(t.name);
        ok(`${t.type || 'text'}: hidden and display none inline`, r.hidden && r.style.display === 'none');
    }
    for (const t of types) api.setVisible(t.name, true);
    ok('shown again: no attribute, no inline display',
       types.every((t) => !f.row(t.name).hidden && f.row(t.name).style.display === ''));
    await f.cancel();

    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const rule = ruleBody(css, '.twm-modal__row[hidden], .twm-modal__section[hidden]') || '';
    ok('the stylesheet forces display: none over the row grid',
       /display:\s*none\s*!important/.test(rule), `rule body: ${JSON.stringify(rule)}`);
}
{
    let validated = 0;
    const f = await open({
        fields: [
            { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
            { name: 'only_b', label: 'Only B', required: true,
              validator: () => { validated++; return 'never valid'; } },
        ],
        defaults: { kind: 'a' },
        onFieldChange: (_n, _v, api) => api.setVisible('only_b', api.get('kind') === 'b'),
    });
    ok('a hidden required control is not required', !f.field('only_b').required);
    await f.submit();
    check('a hidden row neither blocks the submit nor runs its validator',
          [await f.result, validated], [{ kind: 'a', only_b: '' }, 0]);
}
{
    const f = await open({
        fields: [
            { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
            { name: 'only_b', label: 'Only B', required: true },
        ],
        defaults: { kind: 'a' },
        onFieldChange: (_n, _v, api) => api.setVisible('only_b', api.get('kind') === 'b'),
    });
    f.type('kind', 'b');
    ok('shown again, it is required again', f.field('only_b').required);
    await f.submit();
    ok('…and blocks the submit while empty', !f.settled());
    await f.cancel();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section("§4 type: 'picker'");
{
    let asked = null;
    let answer = { value: 'EPIC-0002', label: 'EPIC-0002 — Billing' };
    const changes = [];
    const f = await open({
        fields: [{ name: 'parent', label: 'Parent', type: 'picker',
                   pick: async (current) => { asked = current; await tick(); return answer; },
                   displayFor: (v) => (v ? `${v} — Auth` : '') }],
        defaults: { parent: 'EPIC-0001' },
        onFieldChange: (name, value) => changes.push([name, value]),
    });
    const display = f.q('[data-picker-display="parent"]');
    ok('the display is read-only', display.readOnly);
    check('it opens on displayFor(value)', display.value, 'EPIC-0001 — Auth');
    ok('the value rides in a hidden input', f.field('parent').type === 'hidden');
    const btn = f.q('[data-picker="parent"]');
    ok('there is a search button', btn && btn.type === 'button');
    btn.click();
    await tick(); await tick();
    check('pick() was handed the current value', asked, 'EPIC-0001');
    check('the label it returned is shown', display.value, 'EPIC-0002 — Billing');
    check('onFieldChange heard it', changes.at(-1), ['parent', 'EPIC-0002']);
    answer = null;
    display.click();
    await tick(); await tick();
    check('a cancelled pick (null) leaves the field alone', display.value, 'EPIC-0002 — Billing');
    await f.submit();
    check('the picked value is submitted', await f.result, { parent: 'EPIC-0002' });
}
{
    const f = await open({
        fields: [{ name: 'who', label: 'Who', type: 'picker', required: true, pick: async () => 'bob' }],
    });
    await f.submit();
    ok('a required picker with no value does not submit', !f.settled());
    ok('…and says so on its row', f.row('who').classList.contains('twm-is-invalid'));
    f.q('[data-picker="who"]').click();
    await tick(); await tick();
    check('a bare value from pick() is shown as itself', f.q('[data-picker-display="who"]').value, 'bob');
    await f.submit();
    check('…and submitted', await f.result, { who: 'bob' });
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 create: true on a select');
{
    const f = await open({
        fields: [{ name: 'name', label: 'Your name', type: 'select', create: true,
                   options: ['alice', 'bob'], required: true }],
    });
    f.type('name', 'carol');
    ok('no "will create" promise for a value that creates nothing',
       f.q('.twm-combobox__hint[data-for="name"]').hidden);
    await f.submit();
    check('the typed value is submitted as typed', await f.result, { name: 'carol' });
}
{
    const f = await open({
        fields: [{ name: 'name', label: 'Your name', type: 'select', create: true, options: ['alice'] }],
    });
    f.type('name', 'alice');
    await f.submit();
    check('an existing option is submitted too', await f.result, { name: 'alice' });
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
