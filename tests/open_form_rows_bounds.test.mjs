/**
 * ══ openForm: NUMBER BOUNDS AND ROWS OF FIELDS ══════════════════════════════
 *
 * STORY-0042. A number field took only `step`, and two fields side by side (a
 * min beside a max) had to be built by hand. This suite is the contract for
 * the two additions:
 *
 *   §1  `min` / `max` on a `number` field: the input's own attributes, and a
 *       value outside them refused on submit with an error under THAT field —
 *       whether the browser's constraint check stops the submit first (its
 *       bubble is replaced by the field error) or the submit handler sees it.
 *       A hidden bounded field stands down, as `required` does.
 *   §2  `{ row: [field, ...] }`: the fields in one line, each its own row with
 *       its own label, hint, error, visibility, value and key. `setVisible` on
 *       one hides only that one. Side by side in a 600px dialog, stacked below
 *       360px — a container query, asserted on the sheet's text because jsdom
 *       lays nothing out.
 *   §3  A form with no rows and no bounds renders as before: no new markup, no
 *       new attribute, the same estimated size, and its form is not made a
 *       query container.
 *
 *     node tests/open_form_rows_bounds.test.mjs
 *
 * It imports `../src/ui/components/modal.js` DIRECTLY, never `dist/`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('open form rows and bounds: SKIPPED — needs jsdom '
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

/** Open a form and hand back its body, the pending result and some verbs. */
async function open(opts) {
    const before = new Set(document.querySelectorAll('.twm-modal__form'));
    const result = openForm(opts);
    const form = [...document.querySelectorAll('.twm-modal__form')].find((f) => !before.has(f));
    const q = (sel) => form.querySelector(sel);
    const row = (name) => q(`[data-field-row="${name}"]`);
    const field = (name) => q(`[name="${name}"]`);
    const error = (name) => q(`[data-field-error="${name}"]`);
    /** The text under a field, or null when its error line is hidden. */
    const errorText = (name) => (error(name).hidden ? null : error(name).textContent);
    const type = (name, value) => {
        const el = field(name);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    /** The submit button, clicked: jsdom runs constraint validation first. */
    const submit = async () => { q('button[type="submit"]').click(); await tick(); await tick(); };
    /** A `submit` event with no constraint check before it — the handler alone. */
    const dispatchSubmit = async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await tick(); await tick();
    };
    const cancel = async () => { q('[data-action="cancel"]').click(); return result; };
    const win = form.closest('.twm-managed-window');
    let settled = false;
    result.then(() => { settled = true; });
    return { form, win, q, row, field, error, errorText, type, submit, dispatchSubmit, cancel, result,
             settled: () => settled };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 min / max on a number field');
{
    const f = await open({
        fields: [
            { name: 'steps', label: 'Steps', type: 'number', min: 2, max: 200, step: 1 },
            { name: 'other', label: 'Other', type: 'number' },
        ],
        defaults: { steps: 50, other: 1 },
    });
    check('the input carries min and max', [f.field('steps').min, f.field('steps').max], ['2', '200']);
    ok('a field without them carries neither',
       !f.field('other').hasAttribute('min') && !f.field('other').hasAttribute('max'));

    let nativePrevented = null;
    f.field('steps').addEventListener('invalid', (e) => { nativePrevented = e.defaultPrevented; });
    f.type('steps', '1');
    await f.submit();
    ok('a value below min does not submit', !f.settled());
    check('…and says so under that field', f.errorText('steps'), 'Must be between 2 and 200.');
    ok('…on that row', f.row('steps').classList.contains('twm-is-invalid'));
    ok('…and under no other', f.errorText('other') === null && !f.row('other').classList.contains('twm-is-invalid'));
    check("the browser's own bubble was cancelled for the field error", nativePrevented, true);

    f.type('steps', '5');
    check('typing clears the error', f.errorText('steps'), null);

    f.type('steps', '201');
    await f.submit();
    ok('a value above max does not submit', !f.settled());
    check('…and says so under that field', f.errorText('steps'), 'Must be between 2 and 200.');

    // The submit handler refuses it too, with no constraint check before it.
    await f.dispatchSubmit();
    ok('a submit the browser did not check is refused as well', !f.settled());
    check('…with the same error under the field', f.errorText('steps'), 'Must be between 2 and 200.');

    f.type('steps', '200');
    await f.submit();
    check('a value on the bound submits, as a number', await f.result, { steps: 200, other: 1 });
}
{
    const f = await open({
        fields: [
            { name: 'lo', label: 'Lo', type: 'number', min: 0 },
            { name: 'hi', label: 'Hi', type: 'number', max: 1 },
        ],
    });
    f.type('lo', '-1');
    f.type('hi', '2');
    await f.dispatchSubmit();
    check('only a min: "at least"', f.errorText('lo'), 'Must be at least 0.');
    check('only a max: "at most"', f.errorText('hi'), 'Must be at most 1.');
    f.type('lo', '');
    f.type('hi', '');
    await f.submit();
    check('an empty, non-required bounded field is not out of range', await f.result, { lo: null, hi: null });
}
{
    let validated = 0;
    const f = await open({
        fields: [{ name: 'n', label: 'N', type: 'number', min: 1, max: 10,
                   validator: () => { validated++; return null; } }],
        defaults: { n: 99 },
    });
    await f.dispatchSubmit();
    check('the range is checked before the validator runs', validated, 0);
    await f.cancel();
}
{
    const f = await open({
        fields: [
            { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
            { name: 'n', label: 'N', type: 'number', min: 1, max: 10 },
        ],
        defaults: { kind: 'a', n: 99 },
        onFieldChange: (_n, _v, api) => api.setVisible('n', api.get('kind') === 'b'),
    });
    ok('a hidden bounded field carries no min / max',
       !f.field('n').hasAttribute('min') && !f.field('n').hasAttribute('max'));
    f.type('kind', 'b');
    check('shown again, its bounds come back', [f.field('n').min, f.field('n').max], ['1', '10']);
    await f.submit();
    ok('…and hold', !f.settled() && f.errorText('n') === 'Must be between 1 and 10.');
    f.type('kind', 'a');
    await f.submit();
    check('hidden, an out-of-range value neither blocks nor errors', await f.result, { kind: 'a', n: 99 });
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 { row: [...] } puts fields side by side, each its own field');
{
    const calls = [];
    let api = null;
    const f = await open({
        title: 'Range',
        fields: [
            { name: 'name', label: 'Name' },
            { row: [
                { name: 'lo', label: 'Min', type: 'number', min: 0, hint: 'lowest', required: true },
                { name: 'hi', label: 'Max', type: 'number', hint: 'highest',
                  validator: (v, all) => (v != null && all.lo != null && v < all.lo ? 'Below min.' : null) },
            ] },
            { name: 'flag', label: 'Flag', type: 'checkbox' },
        ],
        defaults: { name: 'x', lo: 1, hi: 5 },
        onFieldChange: (name, _v, a) => { calls.push(name); api = a; },
    });
    const group = f.q('.twm-modal__field-group');
    ok('the row is one group', group && f.form.querySelectorAll('.twm-modal__field-group').length === 1);
    check('…holding the two fields, in order',
          [...group.children].map((c) => c.dataset.fieldRow), ['lo', 'hi']);
    check('…in the field list where the entry was',
          [...f.q('.twm-modal__fields').children].map((c) => c.dataset.fieldRow || c.className),
          ['name', 'twm-modal__field-group', 'flag']);
    check('each keeps its own label',
          [f.row('lo'), f.row('hi')].map((r) => r.querySelector('span').textContent), ['Min', 'Max']);
    check('…its own hint',
          [f.row('lo'), f.row('hi')].map((r) => r.querySelector('.twm-modal__hint--field').textContent),
          ['lowest', 'highest']);
    ok('…its own error line', f.row('lo').contains(f.error('lo')) && f.row('hi').contains(f.error('hi')));
    check('…its own default', [f.field('lo').value, f.field('hi').value], ['1', '5']);
    ok('…and its own bounds', f.field('lo').min === '0' && !f.field('hi').hasAttribute('min'));
    ok('the row widens the dialog to the form layout that has room for it',
       f.win.style.width === '640px', `width: ${f.win.style.width}`);

    f.type('hi', '0');
    check('a field in a row fires onFieldChange by its own name', calls.at(-1), 'hi');
    await f.submit();
    check('an error in a row shows under that field only',
          [f.errorText('lo'), f.errorText('hi')], [null, 'Below min.']);
    f.type('lo', '');
    await f.submit();
    ok('a required field in a row is required as one', f.field('lo').required && !f.settled());

    api.setVisible('hi', false);
    ok('setVisible on one field in a row hides that field', f.row('hi').hidden && f.row('hi').style.display === 'none');
    ok('…and only that field: its neighbour and the group stay',
       !f.row('lo').hidden && f.row('lo').style.display === '' && !group.hidden && group.style.display === '');
    api.setVisible('hi', true);
    ok('shown again', !f.row('hi').hidden && f.row('hi').style.display === '');
    api.setVisible('lo', false);
    ok('hiding the other one leaves the first shown', f.row('lo').hidden && !f.row('hi').hidden);
    api.setVisible('lo', true);

    api.set('lo', 2);
    check('api.get reads a field in a row', api.get('lo'), '2');
    f.type('hi', '7');
    await f.submit();
    check('the row is layout only: each field submits under its own key',
          await f.result, { name: 'x', lo: 2, hi: 7, flag: false });
}
{
    const f = await open({
        fields: [{ row: [
            { name: 'kind', label: 'Kind', type: 'select', options: [1, 2] },
            { name: 'on', label: 'On', type: 'toggle' },
            { name: 'note', label: 'Note', type: 'textarea', rows: 2 },
        ] }],
        defaults: { kind: 2, on: true },
    });
    ok('a component field in a row is mounted in its own row',
       f.row('kind').querySelector('select') && f.row('on').querySelector('input[type="checkbox"]'));
    f.type('note', 'hi');
    await f.submit();
    check('…and submits as it would on its own line', await f.result, { kind: 2, on: true, note: 'hi' });
}
{
    const css = stripComments(readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8'));
    const group = ruleBody(css, '.twm-modal__field-group') || '';
    ok('a row lays its fields out side by side', /display:\s*flex/.test(group) && !/flex-direction:\s*column/.test(group),
       `rule body: ${JSON.stringify(group)}`);
    const cell = ruleBody(css, '.twm-modal__field-group > .twm-modal__row') || '';
    ok('…sharing the width', /flex:\s*1 1 0/.test(cell) && /min-width:\s*0/.test(cell));
    const container = ruleBody(css, '.twm-managed-window--modal .twm-modal__form:has(.twm-modal__field-group)') || '';
    ok('a form with a row is the query container', /container:\s*twm-form\s*\/\s*inline-size/.test(container));
    const q = css.match(/@container\s+twm-form\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?\}\s*)\}/);
    ok('there is a narrow-form query', !!q);
    check('…which applies below 360px and not at 600px', q && Number(q[1]), 359);
    ok('…and stacks the row', q && /\.twm-modal__field-group\s*\{[^}]*flex-direction:\s*column/.test(q[2]));
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 a form with no rows and no bounds renders as before');
{
    const fields = [
        { section: 'General' },
        { name: 't', label: 'T', hint: 'h' },
        { name: 'n', label: 'N', type: 'number', step: 0.5 },
        { name: 's', label: 'S', type: 'select', options: ['1'] },
        { name: 'c', label: 'C', type: 'checkbox' },
    ];
    const f = await open({ fields, defaults: { n: 1 } });
    ok('no row group', !f.q('.twm-modal__field-group'));
    ok('no min or max attribute on any input', !f.q('[min]') && !f.q('[max]'));
    check('the number input carries what it did', [...f.field('n').attributes].map((x) => `${x.name}=${x.value}`),
          ['name=n', 'type=number', 'value=1', 'step=0.5']);
    check('the field list is its entries, one child each',
          [...f.q('.twm-modal__fields').children].map((c) => c.dataset.fieldRow || c.className),
          ['twm-modal__section', 't', 'n', 's', 'c']);
    check('a section still makes the wide layout, as before', f.win.style.width, '640px');
    await f.submit();
    check('it submits as before', await f.result, { t: '', n: 1, s: '1', c: false });
}
{
    const f = await open({ fields: [{ name: 'a', label: 'A' }, { name: 'b', label: 'B', type: 'number' }] });
    check('a plain form is still 480px wide', f.win.style.width, '480px');
    await f.cancel();
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
