/**
 * ══ THE TILE CONFIG FORM (0.17.0, STORY-0064, BUG-0021) ══
 *
 * `src/tiles/tile_config_form.js` draws a `TileBase.getConfigSchema()` as a form,
 * and `openTileConfig` is the opt-in listener for the grid's
 * `grid:config-modal-show`. What this suite pins:
 *
 *   §1  one control per field, for every `FieldTypes` entry
 *   §2  an edit calls onChange(key, value, config) with the field's key
 *   §3  a number below min shows an inline error and is not applied
 *   §4  visibleWhen toggles the row without rebuilding the focused control
 *   §5  a consumer renderer for type 'variable' is used for that field
 *   §6  BUG-0021: the built-in schemas use key/description, so validateConfig
 *       sees them — validateConfig({decimals: 99}, KpiTile schema) fails
 *   §7  readonly, options via getFieldOptions, mergeWithDefaults, setValues,
 *       dispose, and a field with no key throws
 *   §8  openTileConfig: a slide-out saves each valid edit; a modal on Save;
 *       a request while a modal is open is ignored; stop() leaves an open
 *       modal working
 *
 *     node tests/tile_config_form.test.mjs
 *     node tests/run.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('tile config form: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

const { mountTileConfigForm, openTileConfig } = await import('../src/tiles/tile_config_form.js');
const { FieldTypes, validateConfig } = await import('../src/tiles/config_schema.js');
const { KpiTile, ChartTile } = await import('../src/tiles/chart_tiles.js');
const { ListTile, PeopleTile } = await import('../src/tiles/list_tiles.js');
const { EventBus } = await import('../src/core/event_bus.js');
const barrel = await import('../tiles.js');

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
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };

const host = () => { const h = document.createElement('div'); document.getElementById('root').append(h); return h; };
const row = (h, key) => h.querySelector(`.fd-tile-config__row[data-field="${key}"]`);
const input = (h, key) => row(h, key)?.querySelector('input, select');
const type = (el, value, ev = 'input') => { el.value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); };

const EVERY = {
    fields: [
        { key: 'name', type: FieldTypes.TEXT, label: 'Name', description: 'What it is called' },
        { key: 'count', type: FieldTypes.NUMBER, label: 'Count', min: 1, max: 10, default: 3 },
        { key: 'on', type: FieldTypes.CHECKBOX, label: 'On' },
        { key: 'kind', type: FieldTypes.SELECT, label: 'Kind',
          options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' },
        { key: 'tags', type: FieldTypes.MULTISELECT, label: 'Tags',
          options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }] },
        { key: 'tint', type: FieldTypes.COLOR, label: 'Tint', default: '#336699' },
        { key: 'level', type: FieldTypes.RANGE, label: 'Level', min: 0, max: 100, default: 50 },
    ],
};

console.log('§1 one control per field');
{
    const h = host();
    const form = mountTileConfigForm(h, { schema: EVERY, config: {} });
    const rows = h.querySelectorAll('.fd-tile-config__row');
    check('one row per field', rows.length, EVERY.fields.length);
    check('…in schema order, keyed by the field key',
        [...rows].map((r) => r.getAttribute('data-field')), EVERY.fields.map((f) => f.key));
    check('every FieldTypes entry is covered by the schema',
        Object.values(FieldTypes).sort(), [...new Set(EVERY.fields.map((f) => f.type))].sort());
    check('one control in each row', [...rows].map((r) => r.querySelectorAll('input, select').length),
        EVERY.fields.map(() => 1));
    check('the controls match the types',
        EVERY.fields.map((f) => { const c = input(h, f.key); return c.tagName === 'SELECT' ? (c.multiple ? 'multi' : 'select') : c.type; }),
        ['text', 'number', 'checkbox', 'select', 'multi', 'color', 'range']);
    check('the label reads field.label', row(h, 'name').querySelector('.fd-tile-config__label').textContent, 'Name');
    check('the description is shown', row(h, 'name').querySelector('.fd-tile-config__help')?.textContent, 'What it is called');
    check('mergeWithDefaults fills the defaults', form.getValues(),
        { count: 3, kind: 'a', tint: '#336699', level: 50 });
    check('the controls show the defaults', [input(h, 'count').value, input(h, 'kind').selectedIndex, input(h, 'level').value],
        ['3', 0, '50']);
    form.dispose();
    ok('dispose removes the form', !h.querySelector('.fd-tile-config'));
}

console.log('§2 onChange(key, value, config)');
{
    const h = host();
    const calls = [];
    const form = mountTileConfigForm(h, { schema: EVERY, config: { name: 'old' },
        onChange: (k, v, cfg) => calls.push([k, v, cfg]) });
    type(input(h, 'name'), 'new');
    type(input(h, 'count'), '7');
    input(h, 'on').checked = true; input(h, 'on').dispatchEvent(new Event('change'));
    input(h, 'kind').selectedIndex = 1; input(h, 'kind').dispatchEvent(new Event('change'));
    const tags = input(h, 'tags'); tags.options[0].selected = true; tags.options[2].selected = true;
    tags.dispatchEvent(new Event('change'));
    type(input(h, 'level'), '80');
    check('each edit names its field key', calls.map((c) => c[0]), ['name', 'count', 'on', 'kind', 'tags', 'level']);
    check('…with the typed value', calls.map((c) => c[1]), ['new', 7, true, 'b', ['x', 'z'], 80]);
    check('…and the whole config', calls.at(-1)[2],
        { name: 'new', count: 7, kind: 'b', tint: '#336699', level: 80, on: true, tags: ['x', 'z'] });
    ok('nothing is written under "undefined"', calls.every((c) => !('undefined' in c[2])));
    check('getValues agrees', form.getValues().count, 7);
    form.dispose();
}

console.log('§3 a number below min');
{
    const h = host();
    const calls = [];
    const form = mountTileConfigForm(h, { schema: EVERY, config: { count: 4 }, onChange: (...a) => calls.push(a) });
    type(input(h, 'count'), '0');
    const err = row(h, 'count').querySelector('.fd-tile-config__error');
    ok('an inline error is shown', !err.hidden && err.textContent === 'Count must be at least 1', err.textContent);
    ok('the row is marked invalid', row(h, 'count').classList.contains('fd-tile-config__row--invalid'));
    check('onChange is not called', calls.length, 0);
    check('the value is not applied', form.getValues().count, 4);
    type(input(h, 'count'), '5');
    ok('a valid value clears the error', err.hidden && !row(h, 'count').classList.contains('fd-tile-config__row--invalid'));
    check('…and is applied', [calls.length, form.getValues().count], [1, 5]);
    form.dispose();
}

console.log('§4 visibleWhen without a rebuild');
{
    const h = host();
    const schema = { fields: [
        { key: 'mode', type: 'select', label: 'Mode', options: [{ value: 'plain', label: 'Plain' }, { value: 'fancy', label: 'Fancy' }] },
        { key: 'caption', type: 'text', label: 'Caption' },
        { key: 'flourish', type: 'text', label: 'Flourish', visibleWhen: { field: 'mode', in: ['fancy'] } },
        { key: 'plain_note', type: 'text', label: 'Note', visibleWhen: { field: 'mode', equals: 'plain' } },
    ] };
    const form = mountTileConfigForm(h, { schema, config: { mode: 'plain' } });
    ok('hidden while the other field does not match', row(h, 'flourish').hidden);
    ok('equals is honoured', !row(h, 'plain_note').hidden);
    const caption = input(h, 'caption');
    const modeSel = input(h, 'mode');
    caption.focus();
    modeSel.selectedIndex = 1; modeSel.dispatchEvent(new Event('change'));
    ok('shown once it matches', !row(h, 'flourish').hidden && row(h, 'plain_note').hidden);
    ok('the focused control is the same element', input(h, 'caption') === caption && caption.isConnected);
    ok('…and keeps the focus', document.activeElement === caption);
    ok('the other controls were not rebuilt either', input(h, 'mode') === modeSel);
    form.dispose();
}

console.log('§5 a custom renderer for "variable"');
{
    const h = host();
    let ctxSeen = null;
    let setTo = null;
    let disposed = 0;
    const renderers = {
        variable: (ctx) => {
            ctxSeen = ctx;
            const box = document.createElement('div');
            box.className = 'my-variable-picker';
            return { element: box, setValue: (v) => { setTo = v; }, dispose: () => { disposed++; } };
        },
    };
    const calls = [];
    const schema = { fields: [{ key: 'series', type: 'variable', label: 'Series', required: true }] };
    const form = mountTileConfigForm(h, { schema, config: { series: 'a' }, data: { any: 1 }, renderers,
        onChange: (...a) => calls.push(a) });
    ok('the renderer\'s element is in the field\'s row', !!row(h, 'series').querySelector('.my-variable-picker'));
    check('it is handed the field, the value and the data', [ctxSeen.key, ctxSeen.value, ctxSeen.data], ['series', 'a', { any: 1 }]);
    check('commit runs the field check', ctxSeen.commit(''), { valid: false, error: 'Series is required' });
    ok('…and shows the error inline', row(h, 'series').querySelector('.fd-tile-config__error').textContent === 'Series is required');
    check('a valid commit is applied', [ctxSeen.commit('b'), calls.at(-1)?.slice(0, 2)], [{ valid: true }, ['series', 'b']]);
    form.setValues({ series: 'c' });
    check('setValues reaches the renderer', setTo, 'c');
    form.dispose();
    check('dispose reaches the renderer', disposed, 1);
}

console.log('§6 BUG-0021: the built-in schemas');
{
    const kpi = new KpiTile({ id: 'k' });
    check('validateConfig({decimals: 99}, KpiTile schema) reports the decimals error',
        validateConfig({ decimals: 99 }, kpi.getConfigSchema()),
        { valid: false, errors: { decimals: 'Decimals must be at most 6' } });
    for (const T of [ChartTile, KpiTile, ListTile, PeopleTile]) {
        const fields = new T({ id: 't' }).getConfigSchema().fields;
        ok(`${T.name}: every field has a key and no name/help`,
            fields.every((f) => typeof f.key === 'string' && !('name' in f) && !('help' in f)));
        const h = host();
        const calls = [];
        const form = mountTileConfigForm(h, { schema: { fields }, config: new T({ id: 't' }).config,
            onChange: (k) => calls.push(k) });
        const first = input(h, fields[0].key);
        type(first, 'Hello');
        check(`${T.name}: the form writes the title to "title"`, [calls[0], form.getValues().title], ['title', 'Hello']);
        form.dispose();
    }
    const h = host();
    const form = mountTileConfigForm(h, { schema: kpi.getConfigSchema(), config: kpi.config });
    check('a KPI field\'s description is shown', row(h, 'unit').querySelector('.fd-tile-config__help')?.textContent,
        'Shown after the number, e.g. "pts".');
    form.dispose();
}

console.log('§7 readonly, dynamic options, setValues, a missing key');
{
    const h = host();
    const calls = [];
    const schema = { fields: [
        { key: 'locked', type: 'text', label: 'Locked', readonly: true },
        { key: 'pick', type: 'select', label: 'Pick', options: 'variables' },
    ] };
    const form = mountTileConfigForm(h, { schema, config: { locked: 'fixed' },
        data: { stocks: { s1: [] }, flows: { f1: [] } }, onChange: (...a) => calls.push(a) });
    ok('a readonly control is disabled', input(h, 'locked').disabled && input(h, 'locked').value === 'fixed');
    type(input(h, 'locked'), 'changed');
    check('…and an event on it changes nothing', [calls.length, form.getValues().locked], [0, 'fixed']);
    check('options come from getFieldOptions(field, data)',
        [...input(h, 'pick').options].map((o) => o.textContent), ['s1', 'f1']);
    form.setValues({ locked: 'other', pick: 'f1' });
    check('setValues writes the controls', [input(h, 'locked').value, input(h, 'pick').selectedIndex], ['other', 1]);
    check('…without calling onChange', calls.length, 0);
    form.dispose();

    // a consumer renderer on a readonly field: its commit applies nothing
    const h2 = host();
    let roCtx = null;
    const roCalls = [];
    const roForm = mountTileConfigForm(h2, {
        schema: { fields: [{ key: 'series', type: 'variable', label: 'Series', readonly: true }] },
        config: { series: 'a' }, renderers: { variable: (ctx) => { roCtx = ctx; return document.createElement('div'); } },
        onChange: (...a) => roCalls.push(a) });
    ok('a renderer is told the field is readonly', roCtx.readonly === true);
    const roResult = roCtx.commit('b');
    check('a commit on a readonly custom field changes nothing',
        [roResult.valid, typeof roResult.error, roCalls.length, roForm.getValues().series], [false, 'string', 0, 'a']);
    roForm.dispose();

    let threw = null;
    try { mountTileConfigForm(host(), { schema: { fields: [{ name: 'title', type: 'text', label: 'Tile title' }] } }); }
    catch (err) { threw = err; }
    ok('a field with no key throws, naming it', threw instanceof TypeError && /Tile title/.test(threw.message), threw?.message);
    threw = null;
    try { mountTileConfigForm(host(), { schema: { fields: [{ key: 'v', type: 'variable' }] } }); }
    catch (err) { threw = err; }
    ok('a type with no control and no renderer throws', threw instanceof TypeError && /variable/.test(threw.message), threw?.message);
}

console.log('§8 openTileConfig');
{
    ok('both are exported from the tiles barrel',
        barrel.mountTileConfigForm === mountTileConfigForm && barrel.openTileConfig === openTileConfig);

    // slide-out: each valid edit is saved at once
    const bus = new EventBus();
    const panelHost = host();
    const saves = [];
    const stop = openTileConfig(bus, { mode: 'slide-out', host: panelHost });
    check('it listens to grid:config-modal-show', bus.listenerCount('grid:config-modal-show'), 1);
    const kpi = new KpiTile({ id: 'k1' });
    bus.emit('grid:config-modal-show', { tileId: 'k1', tileType: 'flexdesk.kpi', config: kpi.config,
        schema: kpi.getConfigSchema(), data: null, onSave: (cfg) => saves.push(cfg) });
    const body = panelHost.querySelector('.twm-slide-out-panel__body');
    ok('the form is in the slide-out', !!body?.querySelector('.fd-tile-config'));
    ok('…and the panel is open', panelHost.querySelector('.twm-slide-out-panel')?.classList.contains('twm-slide-out-panel--open'));
    type(input(body, 'decimals'), '9');
    check('an invalid edit is not saved', saves.length, 0);
    type(input(body, 'decimals'), '2');
    check('a valid edit is saved with the whole config', [saves.length, saves[0]?.decimals, saves[0]?.format], [1, 2, 'number']);
    stop();
    check('the returned function unsubscribes', bus.listenerCount('grid:config-modal-show'), 0);
    ok('…and removes the panel', !panelHost.querySelector('.twm-slide-out-panel'));

    // modal: saved on Save, not on Cancel
    const bus2 = new EventBus();
    const stop2 = openTileConfig(bus2, { mode: 'modal', title: (d) => `Configure ${d.tileType}` });
    const modalSaves = [];
    const open = () => bus2.emit('grid:config-modal-show', { tileType: 'flexdesk.kpi', config: kpi.config,
        schema: kpi.getConfigSchema(), onSave: (cfg) => modalSaves.push(cfg) });
    const button = (label) => [...document.querySelectorAll('.twm-modal__actions button')].find((b) => b.textContent === label);

    open();
    await ticks();
    let field = document.querySelector('.fd-tile-config-host .fd-tile-config__row[data-field="label"] input');
    ok('the modal shows the form', !!field);
    type(field, 'Open bugs');
    check('an edit in a modal is not saved yet', modalSaves.length, 0);
    button('Cancel').click();
    await ticks();
    check('Cancel saves nothing', modalSaves.length, 0);
    ok('…and the form is gone', !document.querySelector('.fd-tile-config-host .fd-tile-config'));

    open();
    await ticks();
    field = document.querySelector('.fd-tile-config-host .fd-tile-config__row[data-field="label"] input');
    type(field, 'Open bugs');
    button('Save').click();
    await ticks();
    check('Save saves the edited config', modalSaves.map((c) => c.label), ['Open bugs']);

    // a second request while a modal is open is ignored
    open();
    await ticks();
    field = document.querySelector('.fd-tile-config-host .fd-tile-config__row[data-field="label"] input');
    type(field, 'First');
    open();
    await ticks();
    check('a second request while a modal is open opens no second modal', document.querySelectorAll('.fd-tile-config-host').length, 1);
    ok('…and leaves the first form as it was',
        document.querySelector('.fd-tile-config-host .fd-tile-config__row[data-field="label"] input') === field && field.value === 'First');

    // stop() while a modal is open: the modal keeps its form and Save still saves
    stop2();
    check('stop() unsubscribes the modal mode', bus2.listenerCount('grid:config-modal-show'), 0);
    await ticks();
    ok('…and the open modal keeps its form',
        document.querySelector('.fd-tile-config-host .fd-tile-config__row[data-field="label"] input') === field);
    type(field, 'After stop');
    button('Save').click();
    await ticks();
    check('…whose Save still saves', modalSaves.map((c) => c.label), ['Open bugs', 'After stop']);
    ok('…and dismissing it removes the form', !document.querySelector('.fd-tile-config-host .fd-tile-config'));
    open();
    await ticks();
    ok('after stop() a request opens nothing', !document.querySelector('.fd-tile-config-host'));

    let threw = null;
    try { openTileConfig(new EventBus(), { mode: 'slide-out' }); } catch (err) { threw = err; }
    ok('a slide-out with no host throws', threw instanceof TypeError);
}

console.log(failures === 0 ? '\nall assertions passed\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
