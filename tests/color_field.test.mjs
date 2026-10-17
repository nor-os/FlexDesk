/**
 * ══ COLOUR FIELDS: `ColorField`, `ColorListField`, and openForm's
 *    `type: 'color'` / `type: 'colorList'` ═════════════════════════════════
 *
 * STORY-0044. `FieldTypes.COLOR` and the settings schema's `colorList` were
 * declared and nothing rendered them. This suite is their contract:
 *
 *   §1  `normalizeHex` / `isHexColor`: `#rgb`, `#rrggbb` and `rgb()` in, one
 *       lowercase `#rrggbb` out; anything else is not a colour.
 *   §2  A standalone ColorField: picking in the swatch writes the hex box,
 *       typing a valid hex moves the swatch, an invalid one does not and marks
 *       the field; presets write the box; an `rgb()` value shows as hex.
 *   §3  openForm `type: 'color'`: the rgb() default shows as hex, an invalid
 *       hex is a field error and the form does not resolve, a pick submits
 *       `#rrggbb`; `required` is the form's; `api.get` / `api.set` work.
 *   §4  A standalone ColorListField and openForm `type: 'colorList'`: add,
 *       remove, reorder (buttons and the list's drag order), and the submit
 *       is the ordered array of hex strings; an invalid row blocks it.
 *   §5  `validateField` checks hex for `FieldTypes.COLOR`.
 *   §6  Both components are exported from the widgets entry.
 *
 *     node tests/color_field.test.mjs
 *
 * Imports `../src/...` DIRECTLY, never `dist/`. jsdom is borrowed from the
 * sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('color field: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage', 'Range']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
// Node's own `Event` is refused by jsdom's `dispatchEvent`; the fields dispatch.
globalThis.Event = dom.window.Event;

const { ColorField, normalizeHex, isHexColor } = await import('../src/ui/components/color_field.js');
const { ColorListField } = await import('../src/ui/components/color_list_field.js');
const { openForm } = await import('../src/ui/components/modal.js');
const { validateField, FieldTypes } = await import('../src/tiles/config_schema.js');

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
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
/** Type into a box the way a user does: value, input, then change. */
const typeInto = (el, value, { commit = true } = {}) => {
    el.value = value;
    fire(el, 'input');
    if (commit) fire(el, 'change');
};
/** Pick in a native colour input: the browser sets the value, fires input, then change. */
const pick = (swatch, value) => { swatch.value = value; fire(swatch, 'input'); fire(swatch, 'change'); };

async function open(opts) {
    const before = new Set(document.querySelectorAll('.twm-modal__form'));
    const result = openForm(opts);
    const form = [...document.querySelectorAll('.twm-modal__form')].find((f) => !before.has(f));
    const q = (sel) => form.querySelector(sel);
    const row = (name) => q(`[data-field-row="${name}"]`);
    const fieldError = (name) => q(`[data-field-error="${name}"]`);
    const submit = async () => { q('button[type="submit"]').click(); await tick(); await tick(); };
    const cancel = async () => { q('[data-action="cancel"]').click(); return result; };
    let settled = false;
    let value;
    result.then((v) => { settled = true; value = v; });
    return { form, q, row, fieldError, submit, cancel, result,
             settled: () => settled, value: () => value };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 normalizeHex / isHexColor');
check('#rrggbb is lowercased', normalizeHex('#1F77B4'), '#1f77b4');
check('#rgb is expanded', normalizeHex('#AbC'), '#aabbcc');
check('rgb() becomes its hex', normalizeHex('rgb(31, 119, 180)'), '#1f77b4');
check('rgba() drops the alpha', normalizeHex('rgba(255,0,0,0.5)'), '#ff0000');
check('space syntax and percentages', normalizeHex('rgb(100% 0% 50% / 0.3)'), '#ff0080');
check('out-of-range channel is not a colour', normalizeHex('rgb(256, 0, 0)'), null);
check('a name is not a colour', normalizeHex('red'), null);
check('#12345 is not a colour', normalizeHex('#12345'), null);
check('a non-string is not a colour', normalizeHex(42), null);
check('isHexColor: #rgb and #rrggbb only',
      ['#abc', '#A1B2C3', 'abc', '#abcd', 'rgb(1,2,3)', '', null].map(isHexColor),
      [true, true, false, false, false, false, false]);

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 a standalone ColorField');
{
    const seen = [];
    const field = new ColorField({
        value: 'rgb(31, 119, 180)', presets: ['#ff0000', 'nonsense', 'rgb(0,255,0)'],
        onChange: (v, meta) => seen.push([v, meta.commit]),
    });
    const root = field.render();
    document.body.appendChild(root);
    const swatch = root.querySelector('.twm-color-field__swatch');
    const hex = root.querySelector('.twm-color-field__hex');

    check('an rgb() value shows as its hex in the box', hex.value, '#1f77b4');
    check('… and in the swatch', swatch.value, '#1f77b4');
    check('getValue is the hex', field.getValue(), '#1f77b4');

    pick(swatch, '#336699');
    check('picking a colour updates the hex text', hex.value, '#336699');
    check('… and the value', field.getValue(), '#336699');
    check('… with an edit and a commit reported', seen.slice(-2), [['#336699', false], ['#336699', true]]);

    typeInto(hex, '#C0FFEE', { commit: false });
    check('typing a valid hex updates the swatch', swatch.value, '#c0ffee');
    typeInto(hex, '#0f0', { commit: false });
    check('a short hex updates the swatch too', swatch.value, '#00ff00');
    fire(hex, 'change');
    check('on commit the box shows the canonical form', hex.value, '#00ff00');

    typeInto(hex, '#12zz', { commit: false });
    check('an invalid hex leaves the swatch on the last good colour', swatch.value, '#00ff00');
    check('… makes getValue null', field.getValue(), null);
    ok('… and marks the field invalid', root.classList.contains('twm-color-field--invalid'));
    typeInto(hex, '#123456');
    ok('a valid hex clears the mark', !root.classList.contains('twm-color-field--invalid'));

    const presets = [...root.querySelectorAll('.twm-color-field__preset')];
    check('presets that are not colours are left out', presets.map((b) => b.title), ['#ff0000', '#00ff00']);
    presets[1].click();
    check('a preset writes the box', hex.value, '#00ff00');
    check('… and the swatch', swatch.value, '#00ff00');
    check('… and commits', seen.at(-1), ['#00ff00', true]);

    const before = seen.length;
    field.setValue('rgb(1, 2, 3)');
    check('setValue converts rgb() and moves the swatch', [hex.value, swatch.value], ['#010203', '#010203']);
    check('… without reporting a change', seen.length, before);

    typeInto(hex, '');
    check('an empty box is the empty value, not an invalid one', field.getValue(), '');
    field.dispose();
    root.remove();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 openForm type: color');
{
    const f = await open({
        title: 'Colour',
        fields: [
            { name: 'accent', label: 'Accent', type: 'color', default: 'rgb(255, 127, 14)',
              presets: ['#1f77b4'] },
            { name: 'name', label: 'Name' },
        ],
    });
    const hex = f.q('input[name="accent"]');
    const swatch = f.row('accent').querySelector('input[type="color"]');
    ok('the row carries a swatch and a named hex box', !!hex && !!swatch
       && hex.classList.contains('twm-color-field__hex'));
    check('an rgb() default is shown as its hex equivalent', hex.value, '#ff7f0e');
    check('… in the swatch too', swatch.value, '#ff7f0e');

    typeInto(hex, '#ggg');
    await f.submit();
    ok('an invalid hex shows a field error',
       f.row('accent').classList.contains('twm-is-invalid')
       && !f.fieldError('accent').hidden
       && /hex colour/.test(f.fieldError('accent').textContent),
       `error: "${f.fieldError('accent').textContent}"`);
    ok('… and the form is not submitted', !f.settled());

    typeInto(hex, '#ABC', { commit: false });
    ok('typing clears the field error', f.fieldError('accent').hidden
       && !f.row('accent').classList.contains('twm-is-invalid'));
    check('typing a valid hex updates the swatch', swatch.value, '#aabbcc');

    pick(swatch, '#102030');
    check('picking a colour updates the hex text', hex.value, '#102030');
    await f.submit();
    ok('a valid colour submits', f.settled());
    check('… as lowercase #rrggbb', f.value(), { accent: '#102030', name: '' });
}
{
    const f = await open({
        fields: [{ name: 'c', label: 'C', type: 'color', default: '#ABC' }],
    });
    await f.submit();
    check('an untouched #rgb default submits as #rrggbb', f.value(), { c: '#aabbcc' });
}
{
    const f = await open({
        fields: [
            { name: 'c', label: 'C', type: 'color', required: true },
            { name: 'o', label: 'O', type: 'color' },
        ],
    });
    ok('required is not left to the browser', !f.q('input[name="c"]').required);
    await f.submit();
    check('an empty required colour is "Required."', f.fieldError('c').textContent, 'Required.');
    ok('… and blocks the submit', !f.settled());
    typeInto(f.q('input[name="c"]'), '#000');
    await f.submit();
    check('an empty optional colour submits as ""', f.value(), { c: '#000000', o: '' });
}
{
    const calls = [];
    let api = null;
    const f = await open({
        fields: [
            { name: 'a', label: 'A', type: 'color', default: '#111111' },
            { name: 'b', label: 'B', type: 'color', default: '#222222' },
        ],
        onFieldChange: (name, value, a) => { api = a; calls.push([name, value]); },
    });
    pick(f.row('a').querySelector('input[type="color"]'), '#abcdef');
    check('a pick reaches onFieldChange with the hex text', calls.at(-1), ['a', '#abcdef']);
    check('api.get reads the box', api.get('b'), '#222222');
    const n = calls.length;
    api.set('b', 'rgb(0, 0, 255)');
    check('api.set converts and moves the swatch',
          [f.q('input[name="b"]').value, f.row('b').querySelector('input[type="color"]').value],
          ['#0000ff', '#0000ff']);
    check('… without calling the hook back', calls.length, n);
    let validated = null;
    await f.cancel();
    check('cancel resolves null', await f.result, null);
    // A caller's validator still runs, after the hex check passes.
    const g = await open({
        fields: [{ name: 'c', label: 'C', type: 'color', default: '#ffffff',
                   validator: (v) => { validated = v; return v === '#ffffff' ? 'Not white.' : null; } }],
    });
    await g.submit();
    check('a caller validator sees the normalised hex', validated, '#ffffff');
    check('… and its message is shown', g.fieldError('c').textContent, 'Not white.');
    ok('… and blocks the submit', !g.settled());
    await g.cancel();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 ColorListField and openForm type: colorList');
const rowsOf = (root) => [...root.querySelectorAll('.twm-sortable-list__row')];
const hexes = (root) => rowsOf(root).map((r) => r.querySelector('.twm-color-field__hex').value);
const moveBtn = (root, i, label) => rowsOf(root)[i]
    .querySelector(`.twm-color-list__move[aria-label="${label}"]`);
{
    const seen = [];
    const list = new ColorListField({
        value: ['#1f77b4', 'rgb(255, 127, 14)', '#2CA02C'],
        onChange: (v, meta) => seen.push([v, meta.commit]),
    });
    const root = list.render();
    document.body.appendChild(root);
    check('rgb() and upper-case defaults are shown as hex', hexes(root), ['#1f77b4', '#ff7f0e', '#2ca02c']);
    check('getValue is the ordered hex array', list.getValue(), ['#1f77b4', '#ff7f0e', '#2ca02c']);
    ok('the first row cannot move up, the last cannot move down',
       moveBtn(root, 0, 'Move up').disabled && moveBtn(root, 2, 'Move down').disabled
       && !moveBtn(root, 1, 'Move up').disabled);

    moveBtn(root, 2, 'Move up').click();
    check('Move up reorders', list.getValue(), ['#1f77b4', '#2ca02c', '#ff7f0e']);
    check('… and reports a commit', seen.at(-1), [['#1f77b4', '#2ca02c', '#ff7f0e'], true]);
    moveBtn(root, 0, 'Move down').click();
    check('Move down reorders', list.getValue(), ['#2ca02c', '#1f77b4', '#ff7f0e']);

    root.querySelector('.twm-sortable-list__add').click();
    check('Add appends a row on the new colour', list.getValue(), ['#2ca02c', '#1f77b4', '#ff7f0e', '#000000']);
    pick(rowsOf(root)[3].querySelector('input[type="color"]'), '#d62728');
    check('picking in a row updates its value', list.getValue(), ['#2ca02c', '#1f77b4', '#ff7f0e', '#d62728']);

    rowsOf(root)[1].querySelector('.twm-sortable-list__remove').click();
    check('Remove drops the row', list.getValue(), ['#2ca02c', '#ff7f0e', '#d62728']);

    typeInto(rowsOf(root)[1].querySelector('.twm-color-field__hex'), 'nope', { commit: false });
    check('an invalid row makes getValue null', list.getValue(), null);
    check('… and invalidIndexes names it', list.invalidIndexes(), [1]);
    check('… and an uncommitted edit is reported as such', seen.at(-1), [null, false]);
    check('getTexts reads the rows as they stand', list.getTexts(), ['#2ca02c', 'nope', '#d62728']);

    list.setValue(['#000', 'rgb(255,255,255)']);
    check('setValue converts and replaces the rows', hexes(root), ['#000000', '#ffffff']);
    list.dispose();
    root.remove();
}
{
    const f = await open({
        title: 'Palette',
        fields: [{ name: 'palette', label: 'Palette', type: 'colorList',
                   default: ['#aa0000', 'rgb(0, 170, 0)', '#0000aa'], presets: ['#123456'] }],
    });
    const root = f.row('palette');
    ok('the colorList row is a group, not a label', root.tagName === 'DIV' && root.getAttribute('role') === 'group');
    check('defaults are shown as hex', hexes(root), ['#aa0000', '#00aa00', '#0000aa']);
    ok('presets are offered on every row',
       rowsOf(root).every((r) => r.querySelector('.twm-color-field__preset')?.title === '#123456'));

    // Reorder with the buttons: the last to the top.
    moveBtn(root, 2, 'Move up').click();
    moveBtn(root, 1, 'Move up').click();
    check('the rows are reordered', hexes(root), ['#0000aa', '#aa0000', '#00aa00']);

    // An invalid row: field error, no submit.
    typeInto(rowsOf(root)[1].querySelector('.twm-color-field__hex'), '#zzz');
    await f.submit();
    ok('an invalid row shows a field error',
       !f.fieldError('palette').hidden && /row 2/.test(f.fieldError('palette').textContent),
       `error: "${f.fieldError('palette').textContent}"`);
    ok('… and the form is not submitted', !f.settled());
    typeInto(rowsOf(root)[1].querySelector('.twm-color-field__hex'), '#AA0000');
    ok('fixing it clears the field error', f.fieldError('palette').hidden);

    await f.submit();
    ok('the form submits', f.settled());
    check('a colorList field returns an ordered array of hex strings after reordering',
          f.value(), { palette: ['#0000aa', '#aa0000', '#00aa00'] });
}
{
    // A reorder by drag lands in the same place: the SortableList's drop order.
    const list = new ColorListField({ value: ['#111111', '#222222', '#333333'] });
    const root = list.render();
    list.list._dragReorder.onReorder(['2', '0', '1']);
    check('a drag reorder is reflected in getValue', list.getValue(), ['#333333', '#111111', '#222222']);
    list.dispose();
}
{
    let api = null;
    const calls = [];
    const f = await open({
        fields: [{ name: 'p', label: 'P', type: 'colorList', required: true }],
        onFieldChange: (name, value, a) => { api = a; calls.push([name, value]); },
    });
    await f.submit();
    check('an empty required list is "Required."', f.fieldError('p').textContent, 'Required.');
    f.row('p').querySelector('.twm-sortable-list__add').click();
    check('adding a row reaches onFieldChange with the rows', calls.at(-1), ['p', ['#000000']]);
    ok('… and clears the field error', f.fieldError('p').hidden);
    api.set('p', ['#fff', '#000']);
    check('api.set replaces the rows', api.get('p'), ['#ffffff', '#000000']);
    await f.submit();
    check('the set rows submit', f.value(), { p: ['#ffffff', '#000000'] });
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 validateField checks hex for FieldTypes.COLOR');
{
    const field = { key: 'c', label: 'Colour', type: FieldTypes.COLOR };
    check('#rrggbb is valid', validateField('#1f77b4', field), { valid: true });
    check('#rgb is valid', validateField('#abc', field), { valid: true });
    check('empty is valid when not required', validateField('', field), { valid: true });
    check('a non-hex is invalid',
          validateField('blue', field),
          { valid: false, error: 'Colour must be a hex colour (#rgb or #rrggbb)' });
    check('required still comes first',
          validateField('', { ...field, required: true }),
          { valid: false, error: 'Colour is required' });
}

// ── §6 ──────────────────────────────────────────────────────────────────
section('§6 the widgets entry exports both');
{
    const widgets = await import('../widgets.js');
    ok('ColorField, ColorListField, normalizeHex and isHexColor are exported',
       widgets.ColorField === ColorField && widgets.ColorListField === ColorListField
       && widgets.normalizeHex === normalizeHex && widgets.isHexColor === isHexColor);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
