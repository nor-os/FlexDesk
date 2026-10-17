/**
 * ══ openForm: OPTIONS THAT CHANGE, THAT ARE UNAVAILABLE, THAT ARE GROUPED;
 *    A CHECKLIST AND A RADIO FIELD ══════════════════════════════════════
 *
 * STORY-0041. `openForm` drew a select's options once, flat, with no way to
 * say one was unavailable, and read every value back as a string. This suite
 * is the contract for what replaced that:
 *
 *   §1  `api.setOptions(name, options)` replaces a select's options while the
 *       form is open and keeps the current value when the new list has it —
 *       a checklist's, a radio's and a combobox's too.
 *   §2  A disabled option shows its reason and is never the submitted value:
 *       not by a default, not by `api.set`, not by the reader, and a submit
 *       that finds one selected anyway is refused on the field.
 *   §3  `{ group, options }` renders as an `<optgroup>` under its heading.
 *   §4  `type: 'checklist'` submits the array of the checked values; required
 *       means at least one, and nothing checked is a field error on submit.
 *   §5  Option values come back with their own type: a select of numbers
 *       resolves numbers, from the submit and from `api.get`.
 *   §6  `type: 'radio'`: one row per choice with its description; submits the
 *       chosen value, or null; required means one is chosen.
 *   §7  The select, chips and radios ARE the flow kit's: one implementation.
 *
 *     node tests/open_form_choices.test.mjs
 *
 * It imports `../src/ui/components/modal.js` DIRECTLY, never `dist/`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
    console.log('open form choices: SKIPPED — needs jsdom '
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

async function open(opts) {
    const before = new Set(document.querySelectorAll('.twm-modal__form'));
    const result = openForm(opts);
    const form = [...document.querySelectorAll('.twm-modal__form')].find((f) => !before.has(f));
    const q = (sel) => form.querySelector(sel);
    const row = (name) => q(`[data-field-row="${name}"]`);
    const field = (name) => q(`[name="${name}"]`);
    const type = (name, value) => {
        const el = field(name);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const chips = (name) => [...row(name).querySelectorAll('.twm-flow-togglechip')];
    const radios = (name) => [...row(name).querySelectorAll('input[type="radio"]')];
    const optionTexts = (name) => [...field(name).options].map((o) => o.textContent);
    const fieldError = (name) => {
        const e = q(`[data-field-error="${name}"]`);
        return e && !e.hidden ? e.textContent : null;
    };
    const submit = async () => { q('button[type="submit"]').click(); await tick(); await tick(); };
    const cancel = async () => { q('[data-action="cancel"]').click(); return result; };
    let settled = false;
    result.then(() => { settled = true; });
    return { form, q, row, field, type, chips, radios, optionTexts, fieldError, submit, cancel, result,
             settled: () => settled };
}

/** A hook that only keeps hold of the api, so a test can drive it. */
function grab() {
    const box = { api: null, calls: [] };
    box.hook = (name, value, api) => { box.api = api; box.calls.push([name, value]); };
    return box;
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 setOptions replaces the options while the form is open');
{
    const g = grab();
    const f = await open({
        fields: [{ name: 'city', label: 'City', type: 'select', options: ['Oslo', 'Rome', 'Lima'] }],
        defaults: { city: 'Rome' },
        onFieldChange: g.hook,
    });
    const selectEl = f.field('city');
    g.api.setOptions('city', ['Lima', 'Rome', 'Kyiv', 'Pune']);
    check('the select now offers the new list', f.optionTexts('city'), ['Lima', 'Rome', 'Kyiv', 'Pune']);
    ok('it is the same control, so its listeners stay', f.field('city') === selectEl);
    check('the current value is kept, because the new list has it', g.api.get('city'), 'Rome');
    check('setOptions does not call the hook back', g.calls.length, 1);
    g.api.setOptions('city', ['Kyiv', 'Pune']);
    check('a value the new list lacks falls to its first option', g.api.get('city'), 'Kyiv');
    f.type('city', 'Pune');
    check('the reader picks from the new list, and the hook hears it', g.calls.at(-1), ['city', 'Pune']);
    await f.submit();
    check('…and the new list\'s value is submitted', await f.result, { city: 'Pune' });
}
{
    // A dependent select: the hook refills one field from another.
    const towns = { no: ['Oslo', 'Bergen'], it: ['Rome', 'Milan'] };
    const f = await open({
        fields: [
            { name: 'country', label: 'Country', type: 'select', options: ['no', 'it'] },
            { name: 'town', label: 'Town', type: 'select', options: [] },
        ],
        defaults: { country: 'no' },
        onFieldChange: (name, value, api) => {
            if (name === null || name === 'country') api.setOptions('town', towns[api.get('country')]);
        },
    });
    check('filled on open from the default', f.optionTexts('town'), ['Oslo', 'Bergen']);
    f.type('country', 'it');
    check('refilled when the other field changes', f.optionTexts('town'), ['Rome', 'Milan']);
    await f.submit();
    check('the dependent value submits', await f.result, { country: 'it', town: 'Rome' });
}
{
    const g = grab();
    const f = await open({
        fields: [
            { name: 'tags', label: 'Tags', type: 'checklist', options: ['a', 'b', 'c'] },
            { name: 'size', label: 'Size', type: 'radio', options: ['s', 'm', 'l'] },
            { name: 'kind', label: 'Kind', type: 'select', create: true, options: ['x'] },
        ],
        defaults: { tags: ['a', 'c'], size: 'm' },
        onFieldChange: g.hook,
    });
    g.api.setOptions('tags', ['c', 'd']);
    check('a checklist keeps the checked values the new list has', g.api.get('tags'), ['c']);
    check('…drawn as the new chips', f.chips('tags').map((b) => b.textContent), ['c', 'd']);
    g.api.setOptions('size', ['m', 'xl']);
    check('a radio keeps its value when the new list has it', g.api.get('size'), 'm');
    g.api.setOptions('size', ['xl']);
    check('…and has none when it does not', g.api.get('size'), null);
    g.api.setOptions('kind', ['x', 'y']);
    check('a combobox\'s suggestions are replaced',
          [...f.q('[data-datalist-for="kind"]').options].map((o) => o.value), ['x', 'y']);
    f.type('kind', 'y');
    ok('…and a value from the new list is not announced as new',
       f.q('.twm-combobox__hint[data-for="kind"]') === null
       || f.q('.twm-combobox__hint[data-for="kind"]').hidden);
    await f.cancel();
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 a disabled option shows its reason and is never the submitted value');
{
    const g = grab();
    const f = await open({
        fields: [{ name: 'plan', label: 'Plan', type: 'select', options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro', disabled: true, reason: 'needs a licence' },
            { value: 'team', label: 'Team' },
        ] }],
        defaults: { plan: 'pro' },
        onFieldChange: g.hook,
    });
    const pro = [...f.field('plan').options][1];
    ok('the option is disabled', pro.disabled);
    ok('its text shows the reason', pro.textContent.includes('needs a licence'), pro.textContent);
    check('…and so does its tooltip', pro.title, 'needs a licence');
    check('a default naming it does not select it: the first enabled option is', g.api.get('plan'), 'free');
    g.api.set('plan', 'pro');
    check('api.set to it does not select it: the select is cleared', g.api.get('plan'), undefined);
    g.api.set('plan', 'free');
    check('(api.set to an enabled one selects it)', g.api.get('plan'), 'free');
    // A script (or a browser that lets it through) selects it anyway.
    f.field('plan').value = 'pro';
    await f.submit();
    ok('a submit that finds it selected is refused', !f.settled());
    ok('…on the field, naming the reason', (f.fieldError('plan') || '').includes('needs a licence'),
       String(f.fieldError('plan')));
    f.type('plan', 'team');
    ok('choosing another clears the error', f.fieldError('plan') === null);
    await f.submit();
    check('…and that one submits', await f.result, { plan: 'team' });
}
{
    const f = await open({
        fields: [{ name: 'plan', label: 'Plan', type: 'select', options: [
            { value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B', disabled: true, reason: 'gone' },
        ] }],
    });
    await f.submit();
    ok('a select whose every option is disabled cannot submit one', !f.settled() && f.fieldError('plan') !== null);
    await f.cancel();
}
{
    const g = grab();
    const f = await open({
        fields: [
            { name: 'tags', label: 'Tags', type: 'checklist', options: [
                'a', { value: 'b', label: 'b', disabled: true, reason: 'archived' }] },
            { name: 'size', label: 'Size', type: 'radio', options: [
                { value: 's', label: 'Small' }, { value: 'l', label: 'Large', disabled: true, reason: 'sold out' }] },
        ],
        defaults: { tags: ['a', 'b'], size: 'l' },
        onFieldChange: g.hook,
    });
    const [, b] = f.chips('tags');
    ok('a disabled chip cannot be pressed', b.disabled);
    ok('…and shows its reason', b.textContent.includes('archived') && b.title === 'archived');
    check('a default naming it does not check it', g.api.get('tags'), ['a']);
    b.disabled = false; b.click();                  // force it: still not chosen
    check('a disabled chip does not toggle', g.api.get('tags'), ['a']);
    g.api.set('tags', ['b']);
    check('api.set does not check it either', g.api.get('tags'), []);
    const [, large] = f.radios('size');
    ok('a disabled radio is disabled', large.disabled);
    ok('…and its reason is under it',
       large.closest('.twm-flow-choice').querySelector('.twm-choice__reason')?.textContent === 'sold out');
    check('a default naming it chooses nothing', g.api.get('size'), null);
    large.checked = true;                           // a script checks it anyway
    await f.submit();
    ok('the submit is refused on the radio', !f.settled() && (f.fieldError('size') || '').includes('sold out'),
       String(f.fieldError('size')));
    f.radios('size')[0].click();
    await f.submit();
    check('a checklist and a radio submit only what is available', await f.result, { tags: [], size: 's' });
}
{
    const f = await open({
        fields: [{ name: 'who', label: 'Who', type: 'select', create: true, options: [
            'ann', { value: 'bob', label: 'bob', disabled: true, reason: 'left' }] }],
    });
    check('a combobox does not suggest a disabled option',
          [...f.q('datalist').options].map((o) => o.value), ['ann']);
    f.type('who', 'bob');
    await f.submit();
    ok('typing it is refused on the field', !f.settled() && (f.fieldError('who') || '').includes('left'));
    await f.cancel();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 grouped options render under their headings');
{
    const f = await open({
        fields: [{ name: 'fruit', label: 'Fruit', type: 'select', options: [
            'none',
            { group: 'Citrus', options: ['lemon', { value: 'lime', label: 'Lime' }] },
            { group: 'Berries', options: [{ value: 'straw', label: 'Strawberry', disabled: true, reason: 'out of season' },
                                          'blue'] },
        ] }],
        defaults: { fruit: 'lime' },
    });
    const groups = [...f.field('fruit').querySelectorAll('optgroup')];
    check('one optgroup per group, labelled with its heading', groups.map((g) => g.label), ['Citrus', 'Berries']);
    check('each group holds its own options', groups.map((g) => [...g.children].map((o) => o.textContent)),
          [['lemon', 'Lime'], ['Strawberry — out of season', 'blue']]);
    check('an ungrouped option stays at the top level', f.field('fruit').children[0].textContent, 'none');
    ok('a default inside a group is selected', f.field('fruit').selectedOptions[0].textContent === 'Lime');
    f.type('fruit', 'blue');
    await f.submit();
    check('a grouped option submits its value', await f.result, { fruit: 'blue' });
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 a checklist submits an array of the checked values');
{
    const g = grab();
    const f = await open({
        fields: [{ name: 'days', label: 'Days', type: 'checklist',
                   options: [{ value: 'mon', label: 'Monday' }, { value: 'tue', label: 'Tuesday' },
                             { value: 'wed', label: 'Wednesday' }] }],
        defaults: { days: ['wed'] },
        onFieldChange: g.hook,
    });
    const [mon, tue, wed] = f.chips('days');
    check('one chip per option, labelled', [mon, tue, wed].map((b) => b.textContent),
          ['Monday', 'Tuesday', 'Wednesday']);
    check('the default is checked', [mon, tue, wed].map((b) => b.getAttribute('aria-pressed')),
          ['false', 'false', 'true']);
    mon.click();
    check('the hook hears a check, with the array', g.calls.at(-1), ['days', ['mon', 'wed']]);
    tue.click(); tue.click();
    await f.submit();
    check('the checked values, in the list\'s order', await f.result, { days: ['mon', 'wed'] });
}
{
    const f = await open({ fields: [{ name: 'days', label: 'Days', type: 'checklist', options: ['a', 'b'] }] });
    await f.submit();
    check('nothing checked, not required: an empty array', await f.result, { days: [] });
}
section('§4 a required checklist with nothing checked is a field error on submit');
{
    const f = await open({
        fields: [{ name: 'days', label: 'Days', type: 'checklist', options: ['a', 'b'], required: true }],
    });
    await f.submit();
    ok('the submit does not resolve', !f.settled());
    check('the field says so', f.fieldError('days'), 'Required.');
    ok('…and its row is marked invalid', f.row('days').classList.contains('twm-is-invalid'));
    f.chips('days')[1].click();
    ok('checking one clears the error', f.fieldError('days') === null);
    await f.submit();
    check('one is enough', await f.result, { days: ['b'] });
}
{
    let api = null;
    const f = await open({
        fields: [
            { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
            { name: 'days', label: 'Days', type: 'checklist', options: ['x'], required: true },
        ],
        defaults: { kind: 'a' },
        onFieldChange: (_n, _v, a) => { api = a; a.setVisible('days', a.get('kind') === 'b'); },
    });
    await f.submit();
    check('a hidden required checklist is not asked about', await f.result, { kind: 'a', days: [] });
    ok('(api was handed over)', api !== null);
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 a select whose option values are numbers resolves numbers');
{
    const g = grab();
    const f = await open({
        fields: [
            { name: 'n', label: 'N', type: 'select', options: [1, 2, 3] },
            { name: 'level', label: 'Level', type: 'select',
              options: [{ value: 0, label: 'Off' }, { value: 10, label: 'Low' }, { value: 20, label: 'High' }] },
            { name: 'flag', label: 'Flag', type: 'radio', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] },
            { name: 'ids', label: 'Ids', type: 'checklist', options: [7, 8, 9] },
        ],
        defaults: { n: 2, level: '20', flag: false, ids: [9] },
        onFieldChange: g.hook,
    });
    check('a number default selects its option', g.api.get('n'), 2);
    check('a default given as text selects the number of the same text', g.api.get('level'), 20);
    check('api.get gives the number, not its text', typeof g.api.get('n'), 'number');
    f.type('n', '3');
    check('the hook hears a number', g.calls.at(-1), ['n', 3]);
    f.chips('ids')[0].click();
    await f.submit();
    const out = await f.result;
    check('every value submits as its own type', out, { n: 3, level: 20, flag: false, ids: [7, 9] });
    check('…typeof each', [typeof out.n, typeof out.level, typeof out.flag, typeof out.ids[0]],
          ['number', 'number', 'boolean', 'number']);
}
{
    const f = await open({
        fields: [{ name: 'n', label: 'N', type: 'select', create: true, options: [1, 2] }],
    });
    f.type('n', '2');
    await f.submit();
    check('a combobox entry that is a number option\'s text submits the number', await f.result, { n: 2 });
}

// ── §6 ──────────────────────────────────────────────────────────────────
section("§6 type: 'radio' with per-choice descriptions");
{
    const g = grab();
    const f = await open({
        fields: [{ name: 'mode', label: 'Mode', type: 'radio', options: [
            { value: 'fast', label: 'Fast', description: 'Skips the checks.' },
            { value: 'safe', label: 'Safe' },
        ] }],
        defaults: { mode: 'safe' },
        onFieldChange: g.hook,
    });
    const rows = [...f.row('mode').querySelectorAll('.twm-flow-choice')];
    check('one row per choice, with its label', rows.map((r) => r.querySelector('.twm-flow-choice__label').textContent),
          ['Fast', 'Safe']);
    check('the description under the choice that has one',
          rows.map((r) => r.querySelector('.twm-flow-choice__sub')?.textContent ?? null), ['Skips the checks.', null]);
    ok('one radio group', f.radios('mode')[0].name === f.radios('mode')[1].name);
    ok('the row is not a <label> (it holds several controls)', f.row('mode').tagName === 'DIV');
    ok('the default is chosen', f.radios('mode')[1].checked);
    f.radios('mode')[0].click();
    check('the hook hears the choice', g.calls.at(-1), ['mode', 'fast']);
    await f.submit();
    check('the chosen value submits', await f.result, { mode: 'fast' });
}
{
    const f = await open({ fields: [{ name: 'mode', label: 'Mode', type: 'radio', options: ['a', 'b'], required: true }] });
    await f.submit();
    ok('a required radio with nothing chosen does not submit', !f.settled() && f.fieldError('mode') === 'Required.');
    f.radios('mode')[0].click();
    await f.submit();
    check('…until one is', await f.result, { mode: 'a' });
}
{
    const a = await open({ fields: [{ name: 'mode', label: 'Mode', type: 'radio', options: ['a', 'b'] }] });
    const b = await open({ fields: [{ name: 'mode', label: 'Mode', type: 'radio', options: ['a', 'b'] }],
                           defaults: { mode: 'b' } });
    ok('two open forms\' radios are separate groups', a.radios('mode')[0].name !== b.radios('mode')[0].name);
    a.radios('mode')[0].click();
    ok('…so choosing in one leaves the other alone', b.radios('mode')[1].checked);
    await a.cancel(); await b.cancel();
}

// ── §7 ──────────────────────────────────────────────────────────────────
section('§7 one implementation: the flow kit\'s controls');
{
    const read = (p) => readFileSync(resolvePath(HERE, '..', p), 'utf8');
    const modal = read('src/ui/components/modal.js');
    const kit = read('src/flow/kit/widgets.js');
    ok('openForm draws them with choice_controls.js',
       /import \{[^}]*selectBox[^}]*\} from '\.\/choice_controls\.js'/.test(modal));
    ok('…and so do the kit\'s widgets',
       /import \{[^}]*choiceList[^}]*selectBox[^}]*toggleChips[^}]*\} from '\.\.\/\.\.\/ui\/components\/choice_controls\.js'/
           .test(kit));
    ok('the kit no longer has its own select, chips or radio list',
       !/function (selectBox|toggleChips)\b/.test(kit) && !/radio\.type = 'radio'/.test(kit));
    ok('openForm no longer writes its own <select> markup', !/<select name=/.test(modal));
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
