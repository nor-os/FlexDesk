/**
 * ══ A PLOT-CONFIG EDITOR: renderPlotConfigEditor (0.17.0, STORY-0061) ══
 *
 * `@flexdesk/charts` owned the plot config model, and renderPlotGrid could
 * draw it, but nothing could edit it: every embedder wrote its own panel.
 * `renderPlotConfigEditor(container, config, options)` edits `{ layout,
 * subplots }` in place. What this suite pins:
 *
 *   §1  choosing layout 1x2 creates a second subplot tab with a default subplot
 *   §2  adding a series calls onChange and the series is in the config
 *   §3  a 3D chart type shows the Z axis and disables the extra Y axes; an
 *       added y axis is plot_config's makeDefaultYAxis
 *   §4  the series picker shows suggestions from seriesProvider
 *   §5  a seriesProvider that rejects (or throws) shows no suggestions and
 *       keeps the typed text
 *   §6  dispose() disposes every AutocompleteField it created; a redraw
 *       disposes the old ones; a disposed field writes nothing on its late blur
 *   §7  the rest of the editor: axis fields, x axis, reference lines, shaded
 *       bands, transforms, extraSeriesFields (a handle whose dispose()
 *       throws is reported to the logger), overlay sources; an added series
 *       is plot_config's makeDefaultSeries
 *   §8  it fits PlotPopoutWindow's configRenderer slot
 *   §9  the barrel, the stylesheet
 *   §10 the body holds its sections and nothing else: a 2D subplot writes no
 *       stray "null" text where the Z axis section would be, nor where the
 *       Derived series section would be without seriesTransforms (BUG-0041)
 *   §11 interpolation 'auto' is a listed choice: a subplot saved with it opens
 *       with Auto chosen (not "auto (not found)"), keeps it unchanged, can be
 *       picked again, and is drawn as 'linear' (BUG-0042)
 *   §12 a series is one block: a header line (picker, label, remove) over
 *       label-column fields (colour as a ColorField, width, dash, stack group,
 *       the embedder's fields, overlay); extraSeriesFields may draw with the
 *       `field` helper or return field specs; opening a fully specified series
 *       writes nothing, and each control writes its own key only (BUG-0052)
 *   §13 review fixes: an invalid hex still shows; a hint is outside the
 *       control's label and describes it; a bad spec is skipped with a
 *       warning; only an array is specs; a bare series opens unchanged; an
 *       overlay's colour field is disposed when its details redraw (BUG-0052)
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/plot_config_editor.test.mjs       # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly. Plotly is a FAKE on `globalThis`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly rather
 * than passing.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { ruleBody, specificity, compareSpecificity, stripComments } from './css_rules.mjs';

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
    console.log('plot config editor: SKIPPED — needs jsdom '
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
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get: () => 400 });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get: () => 300 });

const Plotly = {
    reacts: [],
    async react(gd, data, layout) { Plotly.reacts.push({ gd, data, layout }); return gd; },
    async newPlot(gd, data, layout) { return Plotly.react(gd, data, layout); },
    purge() {},
    relayout() { return Promise.resolve(); },
    Plots: { resize() { return Promise.resolve(); } },
};
globalThis.Plotly = Plotly;
dom.window.Plotly = Plotly;

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

const { renderPlotConfigEditor } = await import('../src/charts/plot_config_editor.js');
const { makeDefaultSubplot, makeDefaultYAxis, makeDefaultSeries, migrateSingleChart } = await import('../src/charts/plot_config.js');
const { AutocompleteField } = await import('../src/ui/components/autocomplete_field.js');
const { PlotPopoutWindow, openPlotPopoutWindow } = await import('../src/charts/plot_popout_window.js');
const barrel = await import('../charts.js');
const { buildTrace } = await import('../src/charts/chart_types.js');

// Every AutocompleteField that renders, and every one that is disposed.
const fields = [];
const disposedFields = new Set();
{
    const render = AutocompleteField.prototype.render;
    const dispose = AutocompleteField.prototype.dispose;
    AutocompleteField.prototype.render = function patchedRender(...a) {
        if (!this.root) fields.push(this);
        return render.apply(this, a);
    };
    AutocompleteField.prototype.dispose = function patchedDispose(...a) {
        disposedFields.add(this);
        return dispose.apply(this, a);
    };
}

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}
const oneByOne = () => ({ layout: '1x1', subplots: [makeDefaultSubplot(0)] });

/** Open an editor that counts onChange calls. */
function open(config, options = {}) {
    const el = host();
    const calls = [];
    const editor = renderPlotConfigEditor(el, config, {
        onChange: (c) => calls.push(c),
        ...options,
    });
    return { el, calls, editor, config };
}

const sectionOf = (root, title) => [...root.querySelectorAll('.twm-plot-config__section')]
    .find((s) => s.querySelector('.twm-plot-config__heading')?.textContent === title) ?? null;
/** The control of the field labelled `label` inside `scope`. */
const control = (scope, label) => {
    const f = [...scope.querySelectorAll('.twm-plot-config__field')]
        .find((x) => x.querySelector('.twm-plot-config__label')?.textContent === label);
    return f?.querySelector('select, input') ?? null;
};
const buttonText = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent === text) ?? null;
const click = (b) => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
/** Pick the option shown as `text` in a selectBox and fire its change. */
function pick(box, text) {
    const i = [...box.options].findIndex((o) => o.textContent === text);
    if (i < 0) throw new Error(`no option "${text}" in [${[...box.options].map((o) => o.textContent)}]`);
    box.selectedIndex = i;
    box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
function type(input, text) {
    input.value = text;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
const commit = (input) => input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const tabsOf = (root) => [...root.querySelectorAll('.twm-plot-config__tabs [role="tab"]')];
const fieldFor = (input) => fields.find((f) => f.input === input);
const shownItems = (input) => {
    const f = fieldFor(input);
    if (!f?.dropdown?.classList.contains('visible')) return [];
    return [...f.dropdown.querySelectorAll('.twm-autocomplete-field__label')].map((n) => n.textContent);
};

console.log('\ncharts: renderPlotConfigEditor\n');

// ════════════════════════════════════════════════════════════════════════
// §1 LAYOUT 1x2 CREATES A SECOND SUBPLOT TAB WITH A DEFAULT SUBPLOT
// ════════════════════════════════════════════════════════════════════════
{
    console.log('§1 layout');
    const { el, calls, editor, config } = open(oneByOne());
    const tabsHost = el.querySelector('.twm-plot-config__tabs');
    ok('1x1: the subplot strip is hidden', tabsHost.hidden === true);
    check('1x1: one tab', tabsOf(el).length, 1);
    const sideBySide = buttonText(el, 'Side by side');
    check('1x1 is the pressed layout',
          [...el.querySelectorAll('.twm-plot-config__layout[aria-pressed="true"]')].map((b) => b.textContent),
          ['Single']);

    click(sideBySide);
    check('1x2: the config has layout 1x2', config.layout, '1x2');
    check('1x2: two subplots', config.subplots.length, 2);
    const fresh = config.subplots[1];
    const def = makeDefaultSubplot(1);
    check('the second subplot is a default subplot (same fields)', Object.keys(fresh).sort(), Object.keys(def).sort());
    check('... with the default chart type, axes and no series',
          [fresh.chartType, fresh.legendPosition, fresh.yAxes.length, fresh.yAxes[0].series.length, fresh.zAxis],
          [def.chartType, def.legendPosition, 1, 0, null]);
    ok('... and its own id', typeof fresh.id === 'string' && fresh.id !== config.subplots[0].id);
    check('1x2: two tabs', tabsOf(el).map((t) => t.querySelector('.twm-tabs__label')?.textContent), ['Subplot 1', 'Subplot 2']);
    ok('1x2: the strip is shown', tabsHost.hidden === false);
    check('onChange was called once, with the config', [calls.length, calls[0] === config], [1, true]);

    click(tabsOf(el)[1]);
    check('the second tab brings subplot 2 to the front', editor.activeSubplot, 1);
    const title = control(sectionOf(el, 'Subplot'), 'Title');
    type(title, 'Second');
    check('its fields edit subplot 2', [config.subplots[1].displayName, config.subplots[0].displayName], ['Second', '']);

    click(buttonText(el, 'Single'));
    check('back to 1x1: the extra subplot is kept', [config.layout, config.subplots.length], ['1x1', 2]);
    check('... and subplot 1 is in front', editor.activeSubplot, 0);
    check('... one tab, strip hidden', [tabsOf(el).length, tabsHost.hidden], [1, true]);
    click(buttonText(el, '2×2 Grid'));
    check('2x2: four subplots, the kept one reused', [config.subplots.length, config.subplots[1].displayName], [4, 'Second']);
    check('2x2: four tabs', tabsOf(el).length, 4);
    const before = calls.length;
    click(buttonText(el, '2×2 Grid'));
    check('choosing the current layout again changes nothing', calls.length, before);
    editor.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// §2 ADDING A SERIES CALLS onChange AND THE SERIES IS IN THE CONFIG
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§2 adding a series');
    const { el, calls, editor, config } = open(oneByOne());
    const axis = () => config.subplots[0].yAxes[0];
    ok('no series to start with, and the editor says so',
       axis().series.length === 0 && !!el.querySelector('.twm-plot-config__empty'));
    click(buttonText(el, 'Add series'));
    check('onChange was called', calls.length, 1);
    check('the axis has one series', axis().series.length, 1);
    const s = axis().series[0];
    ok('the series has an id, a colour and the default line', typeof s.id === 'string' && /^#|rgb/.test(s.color)
       && s.lineWidth === 2 && s.lineStyle === 'solid' && s.variable === '');
    check('a row is drawn for it', el.querySelectorAll('.twm-plot-config__series').length, 1);

    const row = el.querySelector('.twm-plot-config__series');
    const picker = row.querySelector('.twm-autocomplete-field__input');
    type(picker, 'gdp');
    commit(picker);
    check('typing a name and committing writes series.variable', s.variable, 'gdp');
    const label = row.querySelector('input[aria-label="Legend label"]');
    type(label, 'GDP');
    const width = row.querySelector('input[aria-label="Line width"]');
    width.value = '4'; commit(width);
    pick(row.querySelector('select[aria-label="Dash"]'), 'Dotted');
    type(row.querySelector('input[aria-label="Stack group"]'), 'g1');
    const hex = row.querySelector('.twm-color-field__hex');
    type(hex, '#123456');
    check('label, width, dash, stack group and colour are written',
          [s.label, s.lineWidth, s.lineStyle, s.stackGroup, s.color], ['GDP', 4, 'dotted', 'g1', '#123456']);

    click(buttonText(el, 'Add series'));
    check('a second series gets the next palette colour', axis().series[1].color !== s.color, true);
    click(el.querySelectorAll('.twm-plot-config__series button[aria-label="Remove series"]')[0]);
    check('removing the first leaves the second', axis().series.map((x) => x.id), [axis().series[0].id]);
    ok('... and it is not the removed one', axis().series[0] !== s);
    editor.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// §3 A 3D CHART TYPE SHOWS THE Z AXIS AND DISABLES EXTRA Y AXES
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§3 3D chart types');
    const { el, editor, config } = open(oneByOne());
    const sp = config.subplots[0];
    click(buttonText(el, 'Add Y axis'));
    check('two y axes', sp.yAxes.length, 2);
    const keys = (o) => Object.keys(o).sort();
    check('an added y axis has the keys of a default subplot\'s axis',
          keys(sp.yAxes[1]), keys(makeDefaultSubplot(0).yAxes[0]));
    check('... and the defaults of makeDefaultYAxis, on the right',
          { ...sp.yAxes[1], id: null }, { ...makeDefaultYAxis(1), id: null });
    ok('2D: no Z axis section', sectionOf(el, 'Z axis') === null);
    ok('2D: Add Y axis is enabled', buttonText(el, 'Add Y axis').disabled === false);

    pick(control(sectionOf(el, 'Display'), 'Chart type'), '3D Scatter');
    check('the chart type is written', sp.chartType, 'scatter3d');
    const z = sectionOf(el, 'Z axis');
    ok('3D: the Z axis section is shown', !!z);
    ok('3D: the subplot has a z axis', sp.zAxis && typeof sp.zAxis === 'object');
    ok('3D: the Z axis has a series picker', !!z?.querySelector('.twm-autocomplete-field__input'));
    ok('3D: Add Y axis is disabled', buttonText(el, 'Add Y axis').disabled === true);
    const axes = [...el.querySelectorAll('.twm-plot-config__axis')];
    check('3D: the first Y axis is enabled, the second disabled',
          axes.map((a) => [a.disabled, a.classList.contains('twm-plot-config__axis--disabled')]),
          [[false, false], [true, true]]);
    const yCount = sp.yAxes.length;
    click(buttonText(el, 'Add Y axis'));
    check('3D: a click on the disabled Add Y axis adds nothing', sp.yAxes.length, yCount);

    const zLabel = control(z, 'Label');
    type(zLabel, 'Depth');
    const zMax = control(z, 'Max');
    zMax.value = '9'; commit(zMax);
    check('the Z axis fields edit sp.zAxis', [sp.zAxis.label, sp.zAxis.max], ['Depth', 9]);

    pick(control(sectionOf(el, 'Display'), 'Chart type'), 'Line');
    ok('back to 2D: the Z axis section is gone', sectionOf(el, 'Z axis') === null);
    check('back to 2D: zAxis is null again', sp.zAxis, null);
    ok('back to 2D: every y axis is enabled again',
       [...el.querySelectorAll('.twm-plot-config__axis')].every((a) => !a.disabled));
    ok('back to 2D: Add Y axis is enabled', buttonText(el, 'Add Y axis').disabled === false);

    // A config that is already 3D opens with the Z axis.
    const three = oneByOne();
    three.subplots[0].chartType = 'surface';
    const t = open(three);
    ok('a subplot saved as 3D opens with the Z axis section', !!sectionOf(t.el, 'Z axis'));
    ok('... and a z axis in the config', !!three.subplots[0].zAxis);
    t.editor.dispose();
    editor.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// §4 THE SERIES PICKER SHOWS SUGGESTIONS FROM seriesProvider
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§4 seriesProvider suggestions');
    const asked = [];
    const names = ['alpha', 'beta', 'gamma'];
    const config = oneByOne();
    config.subplots[0].yAxes[0].series.push({ id: 's1', variable: '', label: '' });
    const { el, calls, editor } = open(config, {
        seriesProvider: (q) => {
            asked.push(q);
            return names.filter((n) => n.startsWith(q.value)).map((n) => ({ label: n }));
        },
    });
    const picker = el.querySelector('.twm-plot-config__series .twm-autocomplete-field__input');
    type(picker, 'a');
    check('a synchronous provider: its matches are shown', shownItems(picker), ['alpha']);
    const q = asked.at(-1);
    check('it is asked the typed text and role "series"', [q.value, q.role], ['a', 'series']);
    ok('... and the subplot', q.subplot === config.subplots[0]);

    const f = fieldFor(picker);
    const item = f.dropdown.querySelector('.twm-autocomplete-field__item');
    click(item);
    check('choosing a suggestion writes series.variable', config.subplots[0].yAxes[0].series[0].variable, 'alpha');
    ok('... and calls onChange', calls.length >= 1);

    // A provider that answers later.
    const slow = oneByOne();
    slow.subplots[0].yAxes[0].series.push({ id: 's2', variable: '', label: '' });
    const s = open(slow, {
        seriesProvider: async ({ value }) => { await ticks(2); return names.filter((n) => n.includes(value)).map((n) => ({ label: n })); },
    });
    const p2 = s.el.querySelector('.twm-plot-config__series .twm-autocomplete-field__input');
    type(p2, 'm');
    check('an async provider: nothing until it answers', shownItems(p2), []);
    await ticks();
    check('an async provider: its answer is shown', shownItems(p2), ['gamma']);

    // The x and z pickers ask with their own roles.
    const xz = oneByOne();
    xz.subplots[0].chartType = 'line3d';
    xz.subplots[0].xAxis = { useTime: false, variable: '' };
    const roles = [];
    const r = open(xz, { seriesProvider: ({ role }) => { roles.push(role); return []; } });
    type(sectionOf(r.el, 'X axis').querySelector('.twm-autocomplete-field__input'), 'x');
    type(sectionOf(r.el, 'Z axis').querySelector('.twm-autocomplete-field__input'), 'z');
    check('the x and z pickers ask with roles "x" and "z"', roles, ['x', 'z']);
    r.editor.dispose();
    s.editor.dispose();
    editor.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// §5 A REJECTING seriesProvider: NO SUGGESTIONS, THE TYPED TEXT STAYS
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§5 a provider that rejects');
    const warned = [];
    const config = oneByOne();
    const s = { id: 's1', variable: '', label: '' };
    config.subplots[0].yAxes[0].series.push(s);
    let mode = 'ok';
    const { el, editor } = open(config, {
        logger: { warn: (...a) => warned.push(a) },
        seriesProvider: async ({ value }) => {
            if (mode === 'reject') throw new Error('backend down');
            return [{ label: `${value}-1` }];
        },
    });
    const picker = el.querySelector('.twm-plot-config__series .twm-autocomplete-field__input');
    type(picker, 'Fo');
    await ticks();
    check('while it answers, suggestions are shown', shownItems(picker), ['Fo-1']);

    mode = 'reject';
    type(picker, 'Foo');
    await ticks();
    check('after a rejection no suggestions are shown', shownItems(picker), []);
    check('the typed text is kept', picker.value, 'Foo');
    ok('the rejection is reported to the logger', warned.length >= 1);
    commit(picker);
    check('committing writes the typed text', s.variable, 'Foo');

    const t = oneByOne();
    t.subplots[0].yAxes[0].series.push({ id: 's9', variable: '', label: '' });
    const thrown = open(t, { seriesProvider: () => { throw new Error('sync boom'); } });
    const p2 = thrown.el.querySelector('.twm-plot-config__series .twm-autocomplete-field__input');
    type(p2, 'Ba');
    await ticks();
    check('a provider that throws: no suggestions', shownItems(p2), []);
    check('... and the typed text is kept', p2.value, 'Ba');
    thrown.editor.dispose();
    editor.dispose();
    await ticks();
}

// ════════════════════════════════════════════════════════════════════════
// §6 dispose() DISPOSES EVERY AutocompleteField IT CREATED
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§6 dispose');
    const start = fields.length;
    const config = oneByOne();
    const sp = config.subplots[0];
    sp.chartType = 'scatter3d';
    sp.xAxis = { useTime: false, variable: 'x0' };
    sp.yAxes[0].series.push({ id: 'a', variable: 'one', label: '' }, { id: 'b', variable: 'two', label: '' });
    const { el, calls, editor } = open(config);
    const firstDraw = fields.slice(start);
    check('pickers for x, z and both series', firstDraw.length, 4);
    check('their dropdowns are in the body', document.querySelectorAll('.twm-autocomplete-field__dropdown').length,
          4 + fields.slice(0, start).filter((f) => !disposedFields.has(f)).length);

    click(buttonText(el, 'Add series'));
    ok('a redraw disposes the fields of the draw before it', firstDraw.every((f) => disposedFields.has(f)));
    click(buttonText(el, 'Side by side'));
    click(tabsOf(el)[1]);
    click(tabsOf(el)[0]);

    // A field the redraw disposed while it had focus reports a value on its
    // late blur; that must not wipe what it edited.
    const picker = el.querySelector('.twm-plot-config__series .twm-autocomplete-field__input');
    picker.dispatchEvent(new dom.window.Event('blur'));
    click(buttonText(el, 'Add series'));
    await wait(200);
    check('a disposed field writes nothing on its late blur', sp.yAxes[0].series[0].variable, 'one');

    const created = fields.slice(start);
    ok('several fields were created over the redraws', created.length > 8, `created ${created.length}`);
    editor.dispose();
    const left = created.filter((f) => !disposedFields.has(f));
    check('after dispose(), every AutocompleteField it created is disposed', left.length, 0);
    check('no dropdown of its fields is left in the body',
          [...document.querySelectorAll('.twm-autocomplete-field__dropdown')]
              .filter((d) => created.some((f) => f.dropdown === d)).length, 0);
    ok('the editor is removed from its container', el.querySelector('.twm-plot-config') === null);
    const n = calls.length;
    editor.dispose();
    editor.refresh();
    check('a second dispose() and a refresh() after it do nothing', calls.length, n);
}

// ════════════════════════════════════════════════════════════════════════
// §7 THE REST OF THE EDITOR
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§7 axes, x axis, reference lines, bands, transforms, hooks, overlays');
    const config = oneByOne();
    const sp = config.subplots[0];
    sp.yAxes[0].series.push({ id: 'a', variable: 'one', label: '' });
    const hooked = [];
    let hookDisposed = 0;
    const transforms = {
        trend: { label: 'Trend', params: { k: { label: 'K', default: 3 } },
                 outputs: { mean: { label: 'Mean' } }, run: async (y) => ({ mean: y }) },
    };
    const { el, calls, editor } = open(config, {
        seriesTransforms: transforms,
        extraSeriesFields: (box, series, ctx) => {
            hooked.push({ box, series, ctx });
            const input = document.createElement('input');
            input.className = 'my-scenario';
            input.addEventListener('input', () => { series.scenario = input.value; ctx.onChange(); });
            box.appendChild(input);
            return { dispose() { hookDisposed += 1; } };
        },
        overlaySources: async () => {
            return [{ group: 'Imported', options: [{ value: 'gdp-actual', label: 'GDP (actual)' }] }];
        },
    });

    // y axis fields
    const axis = el.querySelector('.twm-plot-config__axis');
    type(control(axis, 'Label'), 'Billions');
    pick(control(axis, 'Scale'), 'Log');
    pick(control(axis, 'Position'), 'Right');
    const min = control(axis, 'Min');
    min.value = '-1.5'; commit(min);
    const step = control(axis, 'Step');
    step.value = '2'; commit(step);
    check('the y axis fields write the axis',
          [sp.yAxes[0].label, sp.yAxes[0].scale, sp.yAxes[0].position, sp.yAxes[0].min, sp.yAxes[0].step],
          ['Billions', 'log', 'right', -1.5, 2]);
    min.value = ''; commit(min);
    check('an emptied number is null', sp.yAxes[0].min, null);

    // display fields
    const display = sectionOf(el, 'Display');
    pick(control(display, 'Legend'), 'Bottom');
    pick(control(display, 'Interpolation'), 'Step');
    pick(control(display, 'Missing values'), 'Hold last value');
    click(display.querySelector('.twm-toggle__input'));
    check('legend, interpolation, NaN handling and data points',
          [sp.legendPosition, sp.interpolation, sp.nanHandling, sp.showDataPoints], ['bottom', 'step', 'hold', true]);

    // x axis: time or series
    pick(control(sectionOf(el, 'X axis'), 'Against'), 'Series');
    check('x against a series', sp.xAxis.useTime, false);
    const xPicker = sectionOf(el, 'X axis').querySelector('.twm-autocomplete-field__input');
    ok('... shows an x series picker', !!xPicker);
    type(xPicker, 'price'); commit(xPicker);
    check('... which writes xAxis.variable', sp.xAxis.variable, 'price');
    pick(control(sectionOf(el, 'X axis'), 'Against'), 'Time');
    ok('back to time: no x picker', !sectionOf(el, 'X axis').querySelector('.twm-autocomplete-field__input'));

    // reference lines
    click(buttonText(el, 'Add Y axis'));
    click(buttonText(el, 'Add reference line'));
    check('a reference line is added on the first axis',
          [sp.referenceLines.length, sp.referenceLines[0].yAxisId], [1, sp.yAxes[0].id]);
    const refRow = sectionOf(el, 'Reference lines').querySelector('.twm-plot-config__row');
    pick(refRow.querySelector('select[aria-label="Axis"]'), 'Y axis 2');
    const value = refRow.querySelector('input[aria-label="Value"]');
    value.value = '100'; commit(value);
    type(refRow.querySelector('input[aria-label="Label"]'), 'Target');
    check('its axis, value and label', [sp.referenceLines[0].yAxisId, sp.referenceLines[0].value, sp.referenceLines[0].label],
          [sp.yAxes[1].id, 100, 'Target']);
    click(sectionOf(el, 'Reference lines').querySelector('button[aria-label="Remove"]'));
    check('removed', sp.referenceLines.length, 0);

    // shaded bands
    click(buttonText(el, 'Add shaded band'));
    const bandRow = sectionOf(el, 'Shaded bands').querySelector('.twm-plot-config__row');
    const from = bandRow.querySelector('input[aria-label="From"]');
    const to = bandRow.querySelector('input[aria-label="To"]');
    from.value = '2008'; commit(from);
    to.value = '2009'; commit(to);
    type(bandRow.querySelector('.twm-color-field__hex'), '#ff0000');
    check('a shaded band from, to and colour', [sp.shadedBands[0].x0, sp.shadedBands[0].x1, sp.shadedBands[0].color],
          [2008, 2009, '#ff0000']);

    // transforms
    const derived = sectionOf(el, 'Derived series');
    ok('the transforms section is drawn', !!derived?.querySelector('.twm-series-transforms'));
    const box = derived.querySelector('input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    check('its toggle writes subplot.transforms', sp.transforms?.trend?.outputs?.mean, true);

    // extraSeriesFields
    const last = hooked.at(-1);
    ok('extraSeriesFields gets a box, the series and its subplot and axis',
       last && last.series === sp.yAxes[0].series[0] && last.ctx.subplot === sp && last.ctx.axis === sp.yAxes[0]
       && el.contains(last.box));
    const n = calls.length;
    type(el.querySelector('.my-scenario'), 'base');
    check('its fields write the series and call onChange', [sp.yAxes[0].series[0].scenario, calls.length], ['base', n + 1]);
    const disposedBefore = hookDisposed;
    click(buttonText(el, 'Add series'));
    ok('a redraw disposes what the hook returned', hookDisposed > disposedBefore);
    const added = sp.yAxes[0].series.at(-1);
    check('an added series has the defaults of makeDefaultSeries (coloured by its place)',
          { ...added, id: null }, { ...makeDefaultSeries(sp.yAxes[0].series.length - 1), id: null });
    const legacy = migrateSingleChart({ series: [{ variable: 'v' }] }).yAxes[0];
    check('a migrated legacy series has the same keys as an added one',
          Object.keys(legacy.series[0]).sort(), Object.keys(added).sort());
    check('a migrated legacy axis has the same keys as a default one',
          Object.keys(legacy).sort(), Object.keys(makeDefaultYAxis(0)).sort());

    // overlay sources
    await ticks();
    const row = el.querySelector('.twm-plot-config__series');
    const source = control(row.querySelector('.twm-plot-config__overlay'), 'Overlay');
    ok('the overlay source select lists the sources', !!source
       && [...source.options].map((o) => o.textContent).join('|') === 'None|GDP (actual)');
    pick(source, 'GDP (actual)');
    check('choosing one writes series.overlay.source', sp.yAxes[0].series[0].overlay, { source: 'gdp-actual' });
    const ovFields = row.querySelector('.twm-plot-config__overlay-fields');
    type(control(ovFields, 'Label'), 'Observed');
    pick(control(ovFields, 'Mode'), 'Markers');
    check('the overlay fields write the overlay', [sp.yAxes[0].series[0].overlay.label, sp.yAxes[0].series[0].overlay.mode],
          ['Observed', 'markers']);
    pick(source, 'None');
    check('None removes the overlay', 'overlay' in sp.yAxes[0].series[0], false);

    const many = oneByOne();
    for (const id of ['r1', 'r2', 'r3']) many.subplots[0].yAxes[0].series.push({ id, variable: id, label: '' });
    let manyCalls = 0;
    const m = open(many, { overlaySources: () => { manyCalls += 1; return [{ value: 'x', label: 'X' }]; } });
    await ticks();
    check('overlaySources is asked once per draw, not once per series row',
          [manyCalls, m.el.querySelectorAll('.twm-plot-config__overlay select').length], [1, 3]);
    m.editor.dispose();

    const bad = oneByOne();
    bad.subplots[0].yAxes[0].series.push({ id: 'q', variable: 'v', label: '' });
    const b = open(bad, { overlaySources: () => Promise.reject(new Error('nope')) });
    await ticks();
    ok('overlay sources that reject: the row says so',
       b.el.querySelector('.twm-plot-config__overlay-source--error')?.textContent === 'Could not load overlay sources.');
    b.editor.dispose();

    const plain = open(oneByOne());
    ok('without transforms there is no Derived series section', sectionOf(plain.el, 'Derived series') === null);
    plain.config.subplots[0].yAxes[0].series.push({ id: 'z', variable: 'v', label: '' });
    plain.editor.refresh();
    ok('without overlaySources there are no overlay controls; refresh() redraws from the config',
       plain.el.querySelectorAll('.twm-plot-config__series').length === 1
       && !plain.el.querySelector('.twm-plot-config__overlay'));
    plain.editor.dispose();
    const hd = hookDisposed;
    editor.dispose();
    ok('dispose() disposes what the hook returned', hookDisposed > hd);

    // A hook handle whose dispose() throws is reported; the other fields are still disposed.
    const throwing = oneByOne();
    throwing.subplots[0].yAxes[0].series.push({ id: 't1', variable: 'one', label: '' },
                                              { id: 't2', variable: 'two', label: '' });
    const warnings = [];
    const tStart = fields.length;
    let otherDisposed = 0;
    let rows = 0;
    const t = open(throwing, {
        logger: { warn: (...a) => warnings.push(a) },
        extraSeriesFields: () => {
            rows += 1;
            return rows % 2 === 1
                ? { dispose() { throw new Error('boom'); } }
                : { dispose() { otherDisposed += 1; } };
        },
    });
    const tFields = fields.slice(tStart);
    ok('two series rows, two hooks, two pickers', rows === 2 && tFields.length === 2, `rows ${rows}, fields ${tFields.length}`);
    t.editor.dispose();
    ok('a throwing extraSeriesFields handle is reported through logger.warn',
       warnings.some((w) => /plot config editor/.test(String(w[0])) && w[1]?.message === 'boom'));
    check('... and the other hook handle is still disposed', otherDisposed, 1);
    check('... and every picker is still disposed', tFields.filter((f) => !disposedFields.has(f)).length, 0);
    ok('... and the editor is still removed', t.el.querySelector('.twm-plot-config') === null);
}

// ════════════════════════════════════════════════════════════════════════
// §8 IT FITS PlotPopoutWindow's configRenderer SLOT
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§8 PlotPopoutWindow configRenderer');
    const config = oneByOne();
    config.subplots[0].yAxes[0].series.push({ id: 'a', variable: 'a', label: 'A' });
    const id = 'editor-popout';
    const title = 'Editor';
    const plotConfig = config;
    const getResults = () => ({ time: [0, 1, 2], series: { a: [1, 2, 3] } });
    const services = { eventBus: { on: () => ({ dispose() {} }), emit() {} } };
    const dropdowns = () => document.body.querySelectorAll('.twm-autocomplete-field__dropdown').length;
    const before = dropdowns();
    // The README's example, as written.
    const win = await openPlotPopoutWindow({ id, title, plotConfig, getResults, services,
        configRenderer: (el) => renderPlotConfigEditor(el, plotConfig,
                                    { onChange: () => win.updateConfig(plotConfig) }) });
    await ticks();
    ok('openPlotPopoutWindow resolves to the window', win instanceof PlotPopoutWindow);
    const cells = () => win._contentEl.querySelectorAll('.twm-plot-grid > .twm-plot-grid__cell').length;
    check('the window starts with one cell', cells(), 1);
    const panel = win._contentEl.querySelector('.twm-plot-tab-content[data-tab="config"]');
    ok('the editor is drawn in the Config tab', !!panel?.querySelector('.twm-plot-config'));
    ok('the editor put its pickers\' dropdowns in document.body', dropdowns() > before);
    click(buttonText(panel, 'Side by side'));
    await ticks(20);
    check('choosing 1x2 in the editor redraws the window with two cells', cells(), 2);
    win.close();
    await ticks();
    check('closing the window disposes the editor: none of its dropdowns is left in document.body',
          dropdowns(), before);

    // A renderer that returns nothing still draws, and closing is quiet.
    let drawn = false;
    const plain = await openPlotPopoutWindow({ id: 'editor-popout-void', title, plotConfig: oneByOne(),
        getResults, services, configRenderer: (el) => { drawn = true; el.textContent = 'mine'; } });
    ok('a renderer that returns nothing is drawn', drawn);
    let threw = null;
    try { plain.close(); } catch (error) { threw = error; }
    ok('a window whose renderer returned nothing closes without an error', threw === null);

    // A handle whose dispose() throws is reported through the logger; the window still closes.
    const warned = [];
    const noisy = new PlotPopoutWindow({ id: 'editor-popout-noisy', title, plotConfig: oneByOne(), getResults,
        services: { ...services, logger: { warn: (...args) => warned.push(args) } },
        configRenderer: () => ({ dispose() { throw new Error('boom'); } }) });
    await noisy.show();
    threw = null;
    try { noisy.close(); } catch (error) { threw = error; }
    ok('a config handle whose dispose() throws does not stop the close', threw === null && !noisy.isVisible);
    ok('logger.warn hears that the config panel failed to dispose',
       warned.some(([msg, err]) => /config panel failed to dispose/.test(msg) && err?.message === 'boom'));
}

// ════════════════════════════════════════════════════════════════════════
// §9 THE BARREL, THE STYLESHEET
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§9 barrel and stylesheet');
    ok('@flexdesk/charts exports renderPlotConfigEditor', barrel.renderPlotConfigEditor === renderPlotConfigEditor);
    const src = readFileSync(resolvePath(HERE, '../src/charts/plot_config_editor.js'), 'utf8');
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const used = [...new Set(src.match(/twm-plot-config(?:__[a-z-]+)?(?:--[a-z-]+)?/g))]
        // A class built at runtime from a prefix is no class.
        .filter((c) => !c.endsWith('-'));
    const unstyled = used.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    check('every editor class the source writes is in flexdesk.css', unstyled, []);
    ok('the root rule is a column of sections', /flex-direction:\s*column/.test(ruleBody(css, '.twm-plot-config') ?? ''));
    const docs = readFileSync(resolvePath(HERE, '../docs/components/charts.md'), 'utf8');
    ok('the docs document it in a 0.17.0 section', /## .*renderPlotConfigEditor.*\(0\.17\.0\)/.test(docs));
}

// ════════════════════════════════════════════════════════════════════════
// §10 THE BODY HOLDS ITS SECTIONS AND NOTHING ELSE (BUG-0041)
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§10 no stray text between the sections');
    const bodyOf = (root) => root.querySelector('.twm-plot-config__body');
    /** Every child node of the body that is not a section: text, or anything else. */
    const strays = (root) => [...bodyOf(root).childNodes]
        .filter((n) => !(n.nodeType === 1 && n.classList.contains('twm-plot-config__section')))
        .map((n) => (n.nodeType === 3 ? `text "${n.textContent}"` : n.nodeName));
    const headings = (root) => [...bodyOf(root).children]
        .map((s) => s.querySelector(':scope > .twm-plot-config__heading')?.textContent);
    const transforms = {
        trend: { label: 'Trend', params: {}, outputs: { mean: { label: 'Mean' } }, run: (y) => ({ mean: y }) },
    };

    const plain = open(oneByOne());
    check('2D, no seriesTransforms: the body is sections only', strays(plain.el), []);
    check('... Reference lines follows Y axes', headings(plain.el),
          ['Subplot', 'Display', 'X axis', 'Y axes', 'Reference lines', 'Shaded bands']);
    ok('... and no "null" is written anywhere in the editor',
       !/null/.test(plain.el.querySelector('.twm-plot-config').textContent));

    pick(control(sectionOf(plain.el, 'Display'), 'Chart type'), '3D Scatter');
    check('3D, no seriesTransforms: sections only', strays(plain.el), []);
    check('... with the Z axis after the Y axes', headings(plain.el),
          ['Subplot', 'Display', 'X axis', 'Y axes', 'Z axis', 'Reference lines', 'Shaded bands']);
    pick(control(sectionOf(plain.el, 'Display'), 'Chart type'), 'Line');
    check('back to 2D (a redraw): sections only', strays(plain.el), []);
    plain.editor.dispose();

    const derived = open(oneByOne(), { seriesTransforms: transforms });
    check('2D with seriesTransforms: sections only', strays(derived.el), []);
    check('... ending with Derived series', headings(derived.el),
          ['Subplot', 'Display', 'X axis', 'Y axes', 'Reference lines', 'Shaded bands', 'Derived series']);
    derived.editor.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// §11 INTERPOLATION 'auto' IS A LISTED CHOICE (BUG-0042)
// ════════════════════════════════════════════════════════════════════════
{
    console.log("\n§11 interpolation 'auto'");
    const shown = (box) => box.options[box.selectedIndex]?.textContent;
    const fresh = open(oneByOne());
    const freshBox = control(sectionOf(fresh.el, 'Display'), 'Interpolation');
    check('the Interpolation select offers Auto, Linear, Step and Cubic spline',
          [...freshBox.options].map((o) => o.textContent), ['Auto', 'Linear', 'Step', 'Cubic spline']);
    check('a default subplot still shows Linear', shown(freshBox), 'Linear');
    fresh.editor.dispose();

    // A config saved by an embedder (EcoSim) with interpolation 'auto'.
    const saved = { layout: '1x1', subplots: [{ ...makeDefaultSubplot(0), interpolation: 'auto' }] };
    const { el, calls, editor, config } = open(saved);
    const box = control(sectionOf(el, 'Display'), 'Interpolation');
    check("a subplot saved with 'auto' opens with Auto chosen", shown(box), 'Auto');
    ok('... and no "(not found)" option', ![...box.options].some((o) => /not found/.test(o.textContent)));
    check("... and the config still says 'auto'", config.subplots[0].interpolation, 'auto');
    check('... and opening it is no edit', calls.length, 0);

    pick(box, 'Step');
    check('picking Step writes step', config.subplots[0].interpolation, 'step');
    pick(control(sectionOf(el, 'Display'), 'Interpolation'), 'Auto');
    check("picking Auto writes 'auto'", config.subplots[0].interpolation, 'auto');
    editor.dispose();

    const shape = (interpolation) => buildTrace({ chartType: 'line', x: [0, 1], y: [1, 2], interpolation }).line?.shape;
    check("'auto' is drawn as 'linear' (Plotly shape linear)", shape('auto'), shape('linear'));
    check('... which is the shape linear', shape('auto'), 'linear');
}

// ════════════════════════════════════════════════════════════════════════
// §12 A SERIES IS ONE BLOCK; EXTRA FIELDS SHARE ITS LAYOUT; DATA PARITY (BUG-0052)
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§12 series block, extraSeriesFields layout, data parity');
    const full = () => {
        const config = oneByOne();
        config.subplots[0].yAxes[0].series = [{
            id: 'a', variable: 'Banks::Assets[Cash]', label: 'Cash', color: '#1f77b4', lineWidth: 3,
            lineStyle: 'dashed', stackGroup: 'g1', scenario: 'base',
            overlay: { source: 'gdp', label: 'GDP actual', color: '#ff0000', lineStyle: 'dotted',
                       lineWidth: 4, mode: 'markers' },
        }];
        return config;
    };
    const scenarioSelect = (series, onChange) => {
        const box = document.createElement('select');
        box.className = 'my-scenario';
        for (const v of ['base', 'high']) box.appendChild(new dom.window.Option(v, v));
        box.value = series.scenario ?? '';
        box.addEventListener('change', () => { series.scenario = box.value; onChange(); });
        return box;
    };
    const overlaySources = async () => [{ value: 'gdp', label: 'GDP' }, { value: 'cpi', label: 'CPI' }];
    const labels = (scope) => [...scope.querySelectorAll(':scope > .twm-plot-config__field > .twm-plot-config__label, '
        + ':scope > .twm-plot-config__series-extra > .twm-plot-config__field > .twm-plot-config__label, '
        + ':scope > .twm-plot-config__overlay > .twm-plot-config__overlay-source > .twm-plot-config__field > .twm-plot-config__label')]
        .map((n) => n.textContent);

    // ── the layout, with specs returned by the embedder ─────────────────
    let rendered = 0;
    let slotDisposed = 0;
    const specs = open(full(), {
        overlaySources,
        extraSeriesFields: (box, series, { onChange, field }) => {
            ok('extraSeriesFields is handed the field helper', typeof field === 'function');
            return [
                { label: 'Scenario', control: scenarioSelect(series, onChange), hint: 'The run it is read from' },
                { label: 'Note', render: (slot) => { rendered += 1; slot.appendChild(document.createElement('input')); return { dispose() { slotDisposed += 1; } }; } },
            ];
        },
    });
    await ticks();
    const block = specs.el.querySelector('.twm-plot-config__series');
    const head = block.querySelector(':scope > .twm-plot-config__series-head');
    const fieldsCol = block.querySelector(':scope > .twm-plot-config__series-fields');
    ok('a series is a header line over a field column', !!head && !!fieldsCol && block.children.length === 2);
    ok('the header holds the picker, the legend label and the remove button',
       !!head.querySelector('.twm-autocomplete-field__input') && !!head.querySelector('input[aria-label="Legend label"]')
       && !!head.querySelector('button[aria-label="Remove series"]'));
    check('the fields are on one label column, the embedder\'s among them',
          labels(fieldsCol), ['Colour', 'Width', 'Dash', 'Stack group', 'Scenario', 'Note', 'Overlay']);
    ok('the colour is a ColorField (swatch + hex)',
       !!fieldsCol.querySelector('.twm-plot-config__field > .twm-color-field > .twm-color-field__swatch')
       && !!fieldsCol.querySelector('.twm-plot-config__field > .twm-color-field > .twm-color-field__hex'));
    const scenarioField = control(fieldsCol, 'Scenario').closest('.twm-plot-config__field');
    check('a spec hint is drawn under its control',
          scenarioField.querySelector('.twm-plot-config__hint')?.textContent, 'The run it is read from');
    ok('a render spec draws into a slot on the field line',
       rendered === 1 && !!control(fieldsCol, 'Note')?.closest('.twm-plot-config__slot'));
    ok('no old one-line row is left', !specs.el.querySelector('.twm-plot-config__series-main'));
    check('opening it writes nothing', specs.calls.length, 0);
    pick(control(fieldsCol, 'Scenario'), 'high');
    check('a spec control writes through the embedder', [specs.config.subplots[0].yAxes[0].series[0].scenario, specs.calls.length], ['high', 1]);
    specs.editor.dispose();
    check('what a render spec returns is disposed', slotDisposed, 1);

    // ── the helper, drawn into the box (the 0.17.0 form keeps working) ───
    const helper = open(full(), {
        extraSeriesFields: (box, series, { onChange, field }) => {
            box.appendChild(field('Scenario', scenarioSelect(series, onChange), { hint: 'hinted' }));
        },
    });
    const col = helper.el.querySelector('.twm-plot-config__series-fields');
    check('a row drawn with the field helper is a row of the column',
          labels(col), ['Colour', 'Width', 'Dash', 'Stack group', 'Scenario']);
    ok('... with its hint', !!col.querySelector('.twm-plot-config__field--hinted > .twm-plot-config__hint'));
    helper.editor.dispose();

    // ── data parity ─────────────────────────────────────────────────────
    const parity = open(full(), {
        overlaySources,
        extraSeriesFields: (box, series, { onChange, field }) => [
            { label: 'Scenario', control: scenarioSelect(series, onChange) },
        ],
    });
    await ticks();
    const before = JSON.parse(JSON.stringify(parity.config));
    const series = () => parity.config.subplots[0].yAxes[0].series[0];
    const scope = () => parity.el.querySelector('.twm-plot-config__series');
    check('opening a fully specified series writes nothing', parity.config, before);
    check('... and calls no onChange', parity.calls.length, 0);
    /** The series keys (and overlay keys, as `overlay.key`) that differ from `before`. */
    const changed = () => {
        const was = before.subplots[0].yAxes[0].series[0];
        const now = series();
        const out = [];
        for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
            if (k === 'overlay') {
                for (const o of new Set([...Object.keys(was.overlay ?? {}), ...Object.keys(now.overlay ?? {})])) {
                    if (JSON.stringify(was.overlay?.[o]) !== JSON.stringify(now.overlay?.[o])) out.push(`overlay.${o}`);
                }
            } else if (JSON.stringify(was[k]) !== JSON.stringify(now[k])) out.push(k);
        }
        const rest = JSON.parse(JSON.stringify(parity.config));
        rest.subplots[0].yAxes[0].series[0] = was;
        if (JSON.stringify(rest) !== JSON.stringify(before)) out.push('(outside the series)');
        return out.sort();
    };
    const reset = () => { Object.keys(series()).forEach((k) => delete series()[k]); Object.assign(series(), JSON.parse(JSON.stringify(before.subplots[0].yAxes[0].series[0]))); parity.editor.refresh(); };
    const edits = [
        ['the series picker', ['variable'], () => { const i = scope().querySelector('.twm-plot-config__series-head .twm-autocomplete-field__input'); type(i, 'Other'); commit(i); }],
        ['the legend label', ['label'], () => type(scope().querySelector('input[aria-label="Legend label"]'), 'Money')],
        ['the colour', ['color'], () => type(control(scope(), 'Colour').closest('.twm-plot-config__field').querySelector('.twm-color-field__hex'), '#00ff00')],
        ['the width', ['lineWidth'], () => { const i = control(scope(), 'Width'); i.value = '5'; commit(i); }],
        ['the dash', ['lineStyle'], () => pick(control(scope(), 'Dash'), 'Solid')],
        ['the stack group', ['stackGroup'], () => type(control(scope(), 'Stack group'), 'g2')],
        ['the embedder\'s scenario', ['scenario'], () => pick(control(scope(), 'Scenario'), 'high')],
        ['the overlay source', ['overlay.source'], () => pick(control(scope(), 'Overlay'), 'CPI')],
        ['the overlay label', ['overlay.label'], () => type(control(scope().querySelector('.twm-plot-config__overlay-fields'), 'Label'), 'x')],
        ['the overlay mode', ['overlay.mode'], () => pick(control(scope().querySelector('.twm-plot-config__overlay-fields'), 'Mode'), 'Lines')],
    ];
    for (const [what, keys, act] of edits) {
        reset();
        await ticks();
        const n = parity.calls.length;
        act();
        check(`editing ${what} writes only ${keys.join(', ')}`, changed(), keys);
        ok(`... and calls onChange`, parity.calls.length > n);
    }
    parity.editor.dispose();

    // ── the stylesheet ──────────────────────────────────────────────────
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    ok('the extra box is display: contents, so its rows join the column',
       /display:\s*contents/.test(ruleBody(css, '.twm-plot-config__series-extra') ?? ''));
    ok('the field column is a column', /flex-direction:\s*column/.test(ruleBody(css, '.twm-plot-config__series-fields') ?? ''));
    ok('the header line wraps (narrow windows)', /flex-wrap:\s*wrap/.test(ruleBody(css, '.twm-plot-config__series-head') ?? ''));
    const block2 = css.slice(css.indexOf('/* ══ PLOT CONFIG EDITOR'), css.indexOf('/* ══ end PLOT CONFIG EDITOR'));
    check('the editor\'s rules use no literal colours', block2.match(/#[0-9a-f]{3,6}\b|rgba?\(/gi) ?? [], []);
    const docs = readFileSync(resolvePath(HERE, '../docs/components/charts.md'), 'utf8');
    ok('the docs describe it in a 0.17.16 section', /## .*\(0\.17\.16\)/.test(docs) && /extraSeriesFields/.test(docs));
}

// ════════════════════════════════════════════════════════════════════════
// §13 BUG-0052 REVIEW FIXES
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§13 review fixes');
    const { ColorField } = await import('../src/ui/components/color_field.js');
    const css = stripComments(readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8'));

    // 1. an invalid hex keeps its invalid border inside the editor
    const well = '.twm-plot-config .twm-color-field__hex';
    const invalid = '.twm-plot-config .twm-color-field--invalid .twm-color-field__hex';
    ok('an invalid hex in the editor has a danger border',
       /border-color:\s*var\(--color-danger\)/.test(ruleBody(css, invalid) ?? ''));
    ok('... which beats the editor\'s well border (specificity)',
       compareSpecificity(specificity(invalid), specificity(well)) > 0);
    ok('... and comes after it', css.indexOf(`${invalid} {`) > css.indexOf(`${well} {`));

    // 2. a hint is outside the label, and describes the control
    const config = oneByOne();
    config.subplots[0].yAxes[0].series.push({ id: 'a', variable: 'v' });
    const warnings = [];
    const logger = { warn: (...a) => warnings.push(a) };
    const sel = document.createElement('select');
    sel.className = 'my-pick';
    sel.appendChild(new dom.window.Option('x', 'x'));
    const hinted = open(config, {
        logger,
        extraSeriesFields: () => [
            { label: 'Pick', control: sel, hint: 'A hint' },
            { label: 'Bad', control: 'not an element' },
            { control: document.createElement('input') },
            { label: 'Nothing' },
            null,
            { label: 'Throws', render: () => { throw new Error('nope'); } },
            { label: 'Last', control: Object.assign(document.createElement('input'), { className: 'my-last' }) },
        ],
    });
    const hintEl = hinted.el.querySelector('.twm-plot-config__hint');
    ok('the hint is not inside any <label>', !!hintEl && !hintEl.closest('label'));
    ok('the control is not inside a <label> holding the hint', !sel.closest('label'));
    const lbl = sel.closest('.twm-plot-config__field').querySelector('label.twm-plot-config__label');
    ok('the label text is the control\'s <label for>', !!lbl && lbl.htmlFor === sel.id && !!sel.id);
    check('the control is described by the hint', sel.getAttribute('aria-describedby'), hintEl.id);
    check('bad specs are skipped, the rest laid out',
          [...hinted.el.querySelectorAll('.twm-plot-config__series-extra > .twm-plot-config__field > .twm-plot-config__label')]
              .map((n) => n.textContent), ['Pick', 'Last']);
    check('... each with a warning', warnings.filter((w) => /extraSeriesFields spec/.test(String(w[0]))).length, 5);
    ok('... and the body is whole (overlay-less series fields, add buttons)',
       !!buttonText(hinted.el, 'Add series') && !!buttonText(hinted.el, 'Add shaded band'));

    // 5. a bare series opens unchanged, and after refresh()
    const bare = JSON.parse(JSON.stringify(config));
    check('a bare { id, variable } series is unchanged after open', config, bare);
    hinted.editor.refresh();
    await ticks();
    check('... and after refresh()', config, bare);
    check('... with no onChange', hinted.calls.length, 0);
    hinted.editor.dispose();

    // 4. only an array is specs: a 0.17.0 handle with a `fields` array is a handle
    let disposed = 0;
    const handle = open(oneByOne(), {
        extraSeriesFields: (box) => {
            box.appendChild(Object.assign(document.createElement('span'), { className: 'mine' }));
            return { fields: [{ label: 'Not a spec', control: document.createElement('input') }],
                     dispose() { disposed += 1; } };
        },
    });
    click(buttonText(handle.el, 'Add series'));
    ok('a handle with a fields array is not laid out as specs',
       !!handle.el.querySelector('.mine')
       && !handle.el.querySelector('.twm-plot-config__series-extra > .twm-plot-config__field'));
    handle.editor.dispose();
    ok('... and is still disposed', disposed === 1);

    // 6. the overlay's colour field is disposed when its details redraw
    const cfDisposed = new Set();
    const orig = ColorField.prototype.dispose;
    ColorField.prototype.dispose = function patched(...a) { cfDisposed.add(this); return orig.apply(this, a); };
    const cfRendered = [];
    const origRender = ColorField.prototype.render;
    ColorField.prototype.render = function patchedRender(...a) { cfRendered.push(this); return origRender.apply(this, a); };
    try {
        const ov = oneByOne();
        ov.subplots[0].yAxes[0].series.push({ id: 'a', variable: 'v' });
        const o = open(ov, { overlaySources: async () => [{ value: 'g', label: 'G' }, { value: 'c', label: 'C' }] });
        await ticks();
        const source = () => control(o.el.querySelector('.twm-plot-config__overlay'), 'Overlay');
        pick(source(), 'G');
        const first = cfRendered.at(-1);
        pick(source(), 'C');
        ok('choosing another source disposes the old overlay colour field', cfDisposed.has(first));
        const second = cfRendered.at(-1);
        pick(source(), 'None');
        ok('choosing None disposes the current one', cfDisposed.has(second));
        o.editor.dispose();
    } finally {
        ColorField.prototype.dispose = orig;
        ColorField.prototype.render = origRender;
    }
}

await ticks();
check('no unhandled rejections', unhandled, 0);

if (failures) {
    console.error(`\nplot config editor: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
