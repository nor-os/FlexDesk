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
 *   §3  a 3D chart type shows the Z axis and disables the extra Y axes
 *   §4  the series picker shows suggestions from seriesProvider
 *   §5  a seriesProvider that rejects (or throws) shows no suggestions and
 *       keeps the typed text
 *   §6  dispose() disposes every AutocompleteField it created; a redraw
 *       disposes the old ones; a disposed field writes nothing on its late blur
 *   §7  the rest of the editor: axis fields, x axis, reference lines, shaded
 *       bands, transforms, extraSeriesFields, overlay sources
 *   §8  it fits PlotPopoutWindow's configRenderer slot
 *   §9  the barrel, the stylesheet
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
const { makeDefaultSubplot } = await import('../src/charts/plot_config.js');
const { AutocompleteField } = await import('../src/ui/components/autocomplete_field.js');
const { PlotPopoutWindow } = await import('../src/charts/plot_popout_window.js');
const barrel = await import('../charts.js');

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
}

// ════════════════════════════════════════════════════════════════════════
// §8 IT FITS PlotPopoutWindow's configRenderer SLOT
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§8 PlotPopoutWindow configRenderer');
    const config = oneByOne();
    config.subplots[0].yAxes[0].series.push({ id: 'a', variable: 'a', label: 'A' });
    let win = null;
    let editor = null;
    win = new PlotPopoutWindow({
        id: 'editor-popout', title: 'Editor',
        plotConfig: config,
        getResults: () => ({ time: [0, 1, 2], series: { a: [1, 2, 3] } }),
        services: { eventBus: { on: () => ({ dispose() {} }), emit() {} } },
        configRenderer: (el) => {
            editor = renderPlotConfigEditor(el, config, { onChange: () => win.updateConfig(config) });
        },
    });
    await win.show();
    await ticks();
    const cells = () => win._contentEl.querySelectorAll('.twm-plot-grid > .twm-plot-grid__cell').length;
    check('the window starts with one cell', cells(), 1);
    const panel = win._contentEl.querySelector('.twm-plot-tab-content[data-tab="config"]');
    ok('the editor is drawn in the Config tab', !!panel?.querySelector('.twm-plot-config'));
    click(buttonText(panel, 'Side by side'));
    await ticks(20);
    check('choosing 1x2 in the editor redraws the window with two cells', cells(), 2);
    editor.dispose();
    win.close();
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
    const readme = readFileSync(resolvePath(HERE, '../README.md'), 'utf8');
    ok('the README documents it in a 0.17.0 section', /## .*renderPlotConfigEditor.*\(0\.17\.0\)/.test(readme));
}

await ticks();
check('no unhandled rejections', unhandled, 0);

if (failures) {
    console.error(`\nplot config editor: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
