/**
 * plot_config_editor.js — edit a plot config (plot_config.js: `{ layout, subplots }`)
 * in place.
 *
 *     const editor = renderPlotConfigEditor(el, plotConfig, {
 *         onChange: () => grid.update({ plotConfig }),
 *         seriesProvider: ({ value, role, subplot }) => myNames(value),  // or a promise
 *     });
 *     editor.dispose();
 *
 * It draws a layout picker, a tab per subplot slot (when the layout has more
 * than one) and, for the subplot in front: its title; its chart type, legend,
 * interpolation, NaN handling and data points; its x axis (time, or a series);
 * its y axes (label, scale, position, min, max, step) and their series (each a
 * block: a header line of picker, label and remove over one label column of
 * colour, width, dash, stack group, the embedder's own fields
 * and, with `overlaySources`, an overlay source); its z axis while the chart
 * type is 3D; its reference lines and shaded bands; and the toggles of any
 * injected `seriesTransforms` (series_transforms.js).
 *
 * Every edit writes the config object it was given and then calls
 * `onChange(config)`. A layout with more slots than the config has subplots
 * gets default subplots (makeDefaultSubplot) for the new slots; a layout with
 * fewer keeps the extra subplots, unseen, so switching back restores them.
 *
 * A 3D chart type gives the subplot a z axis and uses its first y axis only:
 * while one is chosen the other y axes are shown disabled and no y axis can be
 * added. A 2D chart type removes the z axis (`zAxis: null`, as in
 * makeDefaultSubplot).
 *
 * Series names come from `seriesProvider`, through an AutocompleteField per
 * picker: it is asked `{ value, role, subplot }` (`role` is 'series', 'x' or
 * 'z') and answers AutocompleteField items (`{ label, insertText?, type? }`)
 * or a promise of them. One that throws or rejects shows no suggestions and
 * leaves what was typed as it is. Nothing here knows what a series is.
 *
 * It fits PlotPopoutWindow's `configRenderer` slot, which disposes what the
 * renderer returns when the window closes (openPlotPopoutWindow is async):
 *
 *     const win = await openPlotPopoutWindow({ id, title, plotConfig, getResults, services,
 *         configRenderer: (el) => renderPlotConfigEditor(el, plotConfig,
 *                                     { onChange: () => win.updateConfig(plotConfig) }) });
 */

import { AutocompleteField } from '../ui/components/autocomplete_field.js';
import { ColorField } from '../ui/components/color_field.js';
import { ToggleField } from '../ui/components/toggle_field.js';
import { selectBox } from '../ui/components/choice_controls.js';
import { createTabs } from '../ui/components/tabs.js';
import { CHART_TYPES_2D, CHART_TYPES_3D, is3DChart } from './chart_types.js';
import { PLOT_LAYOUTS, makeDefaultSubplot, makeDefaultYAxis, makeDefaultSeries } from './plot_config.js';
import { renderSeriesTransformControls } from './series_transforms.js';

const CHART_TYPE_OPTIONS = Object.freeze([
    { group: '2D', options: CHART_TYPES_2D },
    { group: '3D', options: CHART_TYPES_3D },
]);
const SCALES = Object.freeze([{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]);
const POSITIONS = Object.freeze([{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]);
const DASHES = Object.freeze([
    { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' },
]);
const LEGEND_POSITIONS = Object.freeze([
    { value: 'hidden', label: 'Hidden' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' },
    { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
]);
// 'auto' is drawn as 'linear' (buildTrace); it is listed so a config saved with it
// shows it and keeps it.
const INTERPOLATIONS = Object.freeze([
    { value: 'auto', label: 'Auto' },
    { value: 'linear', label: 'Linear' }, { value: 'step', label: 'Step' }, { value: 'cubic', label: 'Cubic spline' },
]);
const NAN_STRATEGIES = Object.freeze([
    { value: 'gap', label: 'Gap' }, { value: 'zero', label: 'Zero' },
    { value: 'hold', label: 'Hold last value' }, { value: 'interpolate', label: 'Interpolate' },
]);
const X_SOURCES = Object.freeze([{ value: 'time', label: 'Time' }, { value: 'series', label: 'Series' }]);
const OVERLAY_MODES = Object.freeze([
    { value: 'markers+lines', label: 'Markers and lines' }, { value: 'markers', label: 'Markers' },
    { value: 'lines', label: 'Lines' },
]);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
}

function button(text, onClick, { title = null, className = 'twm-btn twm-plot-config__add' } = {}) {
    const b = el('button', className, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', () => { if (!b.disabled) onClick(); });
    return b;
}

function removeButton(title, onClick) {
    const b = button('', onClick, { title, className: 'twm-btn-icon twm-plot-config__remove' });
    b.setAttribute('aria-label', title);
    b.appendChild(el('span', 'material-symbols-outlined', 'close'));
    return b;
}

let hintCount = 0;

/**
 * A labelled control on the editor's label column. A single input or select
 * is wrapped in a `<label>`; a compound one (a picker, a colour field) is not,
 * so a click on its text does not land on whichever of its inputs comes
 * first. A `hint` is drawn under the control, in the control's column, and
 * outside any `<label>`: the row is then a `<div>` whose label text is the
 * `<label for>` of a single control, and the hint describes the control
 * (`aria-describedby`) without being part of its name.
 */
function field(label, control, { hint = null } = {}) {
    const single = control.matches('input, select, textarea');
    const hinted = hint != null && hint !== '';
    if (!hinted) {
        const row = el(single ? 'label' : 'div', 'twm-plot-config__field');
        row.append(el('span', 'twm-plot-config__label', label), control);
        return row;
    }
    const row = el('div', 'twm-plot-config__field twm-plot-config__field--hinted');
    const text = el(single ? 'label' : 'span', 'twm-plot-config__label', label);
    const note = el('span', 'twm-plot-config__hint', hint);
    note.id = `twm-plot-config-hint-${++hintCount}`;
    if (single) {
        if (!control.id) control.id = `${note.id}-control`;
        text.htmlFor = control.id;
    }
    const target = single ? control : (control.querySelector('input, select, textarea') ?? control);
    const describedBy = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', describedBy ? `${describedBy} ${note.id}` : note.id);
    row.append(text, control, note);
    return row;
}

function textInput(value, onSet, { placeholder = '', label = null } = {}) {
    const input = el('input', 'twm-plot-config__input');
    input.type = 'text';
    input.value = value ?? '';
    input.placeholder = placeholder;
    if (label) input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onSet(input.value));
    return input;
}

/** A number box: empty (or not a number) sets null. */
function numberInput(value, onSet, { placeholder = 'Auto', label = null, min = null, max = null, step = 'any' } = {}) {
    const input = el('input', 'twm-plot-config__input twm-plot-config__input--number');
    input.type = 'number';
    input.step = String(step);
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
    input.value = value == null ? '' : String(value);
    input.placeholder = placeholder;
    if (label) input.setAttribute('aria-label', label);
    input.addEventListener('change', () => {
        const n = parseFloat(input.value);
        onSet(Number.isFinite(n) ? n : null);
    });
    return input;
}

/** A select over choice options; `onPick(value)` gets the option's own value. */
function select(options, value, onPick, { label = null, empty = null } = {}) {
    const s = selectBox(options, value, {
        label: label ?? '', empty,
        className: 'twm-plot-config__input twm-plot-config__input--select',
    });
    s.box.addEventListener('change', () => onPick(s.valueOf()));
    return s.box;
}

function makeZAxis() {
    return { label: '', scale: 'linear', min: null, max: null, step: null, variable: '' };
}

let editorCount = 0;

/**
 * Edit `config` in place.
 *
 * @param {HTMLElement} container - Receives one `.twm-plot-config` child.
 * @param {{ layout: string, subplots: Object[] }} config - Already migrated (migrateData).
 * @param {Object} [options]
 * @param {Function} [options.onChange] - `(config)` after every edit.
 * @param {Function} [options.seriesProvider] - `({ value, role, subplot }) => items |
 *        Promise<items>`: the pickers' suggestions (AutocompleteField items).
 * @param {Function} [options.overlaySources] - `() => options | Promise<options>`: choice
 *        options (`{ value, label }`, or `{ group, options }`) for a series' overlay
 *        source, written to `series.overlay.source`. Absent: no overlay controls.
 * @param {Object} [options.seriesTransforms] - `{ [id]: transform }` (series_transforms.js);
 *        their toggles are drawn per subplot.
 * @param {Function} [options.extraSeriesFields] - `(el, series, { subplot, axis, onChange, field })
 *        => { dispose? } | specs[] | void`: fields of the embedder's own in each series
 *        block, on the series' label column. It may draw into `el` (with
 *        `field(label, control, { hint })` for rows that line up) and return a handle,
 *        or return an ARRAY of field specs `{ label: string, control: HTMLElement,
 *        hint? }` / `{ label: string, render(slot) => { dispose? } | void, hint? }`,
 *        laid out after anything drawn into `el`. A bad spec is skipped with a warning.
 * @param {Object} [options.logger] - Given to every AutocompleteField (provider errors);
 *   its `warn` also hears a part (an `extraSeriesFields` handle, say) that throws on dispose.
 * @returns {{ dispose: Function, refresh: Function, selectSubplot: Function,
 *             readonly activeSubplot: number }}
 */
function renderPlotConfigEditor(container, config, options = {}) {
    const opts = {
        onChange: null,
        seriesProvider: null,
        overlaySources: null,
        seriesTransforms: null,
        extraSeriesFields: null,
        logger: null,
        ...options,
    };
    const editorId = `twm-plot-config-${++editorCount}`;
    let fieldCount = 0;
    let active = 0;
    let disposed = false;
    /** Teardown for everything the subplot body created; run before each redraw. */
    let bodyDisposers = [];
    /** Bumped on each body redraw, so an overlay-source answer for an old body is dropped. */
    let generation = 0;

    const notify = () => { if (!disposed) opts.onChange?.(config); };
    const track = (fn) => { bodyDisposers.push(fn); };
    const template = () => PLOT_LAYOUTS[config.layout] || PLOT_LAYOUTS['1x1'];
    const slots = () => template().slots;

    function ensureSubplots() {
        if (!Array.isArray(config.subplots)) config.subplots = [];
        while (config.subplots.length < slots()) {
            config.subplots.push(makeDefaultSubplot(config.subplots.length));
        }
    }

    const root = el('div', 'twm-plot-config');

    // ── layout picker ───────────────────────────────────────────────────
    const layoutButtons = new Map();
    const picker = el('div', 'twm-plot-config__layouts');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Layout');
    for (const [key, tmpl] of Object.entries(PLOT_LAYOUTS)) {
        const b = button(tmpl.label, () => setLayout(key), { className: 'twm-btn twm-plot-config__layout' });
        layoutButtons.set(key, b);
        picker.appendChild(b);
    }
    const syncLayoutButtons = () => {
        for (const [key, b] of layoutButtons) {
            const on = key === config.layout;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.classList.toggle('twm-plot-config__layout--on', on);
        }
    };
    root.appendChild(section('Layout', picker));

    // ── subplot tabs and the body ───────────────────────────────────────
    const tabsHost = el('div', 'twm-plot-config__tabs');
    const body = el('div', 'twm-plot-config__body');
    root.append(tabsHost, body);
    container.appendChild(root);

    ensureSubplots();
    const tabItems = () => Array.from({ length: slots() }, (_, i) => ({ id: i, label: `Subplot ${i + 1}` }));
    const tabs = createTabs(tabsHost, {
        items: tabItems(),
        active: 0,
        compact: true,
        label: 'Subplots',
        onSelect: (id) => {
            if (id == null || id === active) return;
            active = id;
            renderBody();
        },
    });
    const syncChrome = () => {
        syncLayoutButtons();
        tabs.update(tabItems(), active);
        tabsHost.hidden = slots() < 2;
    };

    function setLayout(key) {
        if (disposed || key === config.layout) return;
        config.layout = key;
        ensureSubplots();
        active = Math.min(active, slots() - 1);
        syncChrome();
        renderBody();
        notify();
    }

    function section(title, ...children) {
        const s = el('section', 'twm-plot-config__section');
        s.appendChild(el('h4', 'twm-plot-config__heading', title));
        for (const child of children) if (child) s.appendChild(child);
        return s;
    }

    function disposeBody() {
        generation += 1;
        const disposers = bodyDisposers;
        bodyDisposers = [];
        for (const fn of disposers) {
            try { fn(); } catch (error) {
                opts.logger?.warn?.('[plot config editor] a field failed to dispose', error);
            }
        }
    }

    // ── shared controls ─────────────────────────────────────────────────

    /** A series-name picker writing `target[key]`. */
    function seriesPicker(target, key, role, sp, placeholder) {
        let alive = true;
        const ac = new AutocompleteField({
            fieldId: `${editorId}-field-${++fieldCount}`,
            field: { placeholder, value: target[key] ?? '' },
            skipNamespacePrefix: true,
            logger: opts.logger,
            provider: ({ value }) => (opts.seriesProvider
                ? opts.seriesProvider({ value, role, subplot: sp })
                : []),
            onChange: (value) => {
                // The field reports its value again on blur, after a redraw
                // may have disposed it: a disposed field writes nothing.
                if (!alive || (target[key] ?? '') === value) return;
                target[key] = value;
                notify();
            },
        });
        track(() => { alive = false; ac.dispose(); });
        const node = ac.render();
        node.classList.add('twm-plot-config__picker');
        return node;
    }

    /** `keep` takes its teardown: the body's (track), or a narrower redraw's. */
    function colorField(value, onSet, label, keep = track) {
        const f = new ColorField({
            value: value ?? '',
            label,
            onChange: (v) => { if (v !== null) { onSet(v || null); notify(); } },
        });
        keep(() => f.dispose());
        return f.render();
    }

    function toggle(label, checked, onSet) {
        const t = new ToggleField({ label, checked, compact: true, onChange: (on) => { onSet(on); notify(); } });
        track(() => t.dispose());
        return t.render();
    }

    /** Rows of objects under `sp[key]`, each with a remove button, and an add button. */
    function listEditor(sp, key, { addLabel, makeItem, fields }) {
        if (!Array.isArray(sp[key])) sp[key] = [];
        const items = sp[key];
        const wrap = el('div', 'twm-plot-config__list');
        items.forEach((item, i) => {
            const row = el('div', 'twm-plot-config__row');
            row.append(...fields(item), removeButton('Remove', () => {
                items.splice(i, 1);
                renderBody();
                notify();
            }));
            wrap.appendChild(row);
        });
        wrap.appendChild(button(addLabel, () => {
            items.push(makeItem());
            renderBody();
            notify();
        }));
        return wrap;
    }

    // ── the subplot in front ────────────────────────────────────────────

    function normalise(sp) {
        if (!sp.xAxis) sp.xAxis = { useTime: true, variable: '' };
        if (!Array.isArray(sp.yAxes) || !sp.yAxes.length) sp.yAxes = [makeDefaultYAxis(0)];
        for (const axis of sp.yAxes) if (!Array.isArray(axis.series)) axis.series = [];
        if (is3DChart(sp.chartType) && !sp.zAxis) sp.zAxis = makeZAxis();
    }

    function renderBody() {
        if (disposed) return;
        disposeBody();
        body.replaceChildren();
        const sp = config.subplots[active];
        if (!sp) return;
        normalise(sp);
        const is3D = is3DChart(sp.chartType);
        let sources = null;
        const overlaySources = () => (sources ??= Promise.resolve().then(() => opts.overlaySources()));

        // Element.append() writes a null child as the text "null": a section the
        // subplot does not have (the z axis of a 2D chart, the transforms when
        // there are none) is left out, not appended.
        body.append(...[
            section('Subplot', field('Title', textInput(sp.displayName, (v) => { sp.displayName = v; notify(); },
                                                        { placeholder: 'Untitled' }))),
            section('Display', ...displayFields(sp)),
            section('X axis', ...xAxisFields(sp)),
            section('Y axes', yAxesEditor(sp, is3D, overlaySources)),
            is3D ? section('Z axis', ...zAxisFields(sp)) : null,
            section('Reference lines', referenceLinesEditor(sp)),
            section('Shaded bands', shadedBandsEditor(sp)),
            transformsSection(sp),
        ].filter(Boolean));
    }

    function displayFields(sp) {
        return [
            field('Chart type', select(CHART_TYPE_OPTIONS, sp.chartType ?? 'line', (v) => {
                const was3D = is3DChart(sp.chartType);
                sp.chartType = v;
                const now3D = is3DChart(v);
                if (now3D) sp.zAxis ??= makeZAxis();
                else sp.zAxis = null;
                if (was3D !== now3D) renderBody();
                notify();
            })),
            field('Legend', select(LEGEND_POSITIONS, sp.legendPosition ?? 'hidden',
                                   (v) => { sp.legendPosition = v; notify(); })),
            field('Interpolation', select(INTERPOLATIONS, sp.interpolation ?? 'linear',
                                          (v) => { sp.interpolation = v; notify(); })),
            field('Missing values', select(NAN_STRATEGIES, sp.nanHandling ?? 'gap',
                                           (v) => { sp.nanHandling = v; notify(); })),
            toggle('Data points', sp.showDataPoints === true, (on) => { sp.showDataPoints = on; }),
        ];
    }

    function xAxisFields(sp) {
        const useTime = sp.xAxis.useTime !== false;
        const out = [field('Against', select(X_SOURCES, useTime ? 'time' : 'series', (v) => {
            sp.xAxis.useTime = v === 'time';
            renderBody();
            notify();
        }))];
        if (!useTime) {
            out.push(
                field('Series', seriesPicker(sp.xAxis, 'variable', 'x', sp, 'X series')),
                field('Label', textInput(sp.xAxis.label, (v) => { sp.xAxis.label = v; notify(); },
                                         { placeholder: sp.xAxis.variable || 'Axis title' })),
            );
        }
        return out;
    }

    function zAxisFields(sp) {
        const z = sp.zAxis;
        return [
            field('Series', seriesPicker(z, 'variable', 'z', sp, 'Z series')),
            field('Label', textInput(z.label, (v) => { z.label = v; notify(); }, { placeholder: 'Axis title' })),
            field('Scale', select(SCALES, z.scale ?? 'linear', (v) => { z.scale = v; notify(); })),
            field('Min', numberInput(z.min, (v) => { z.min = v; notify(); })),
            field('Max', numberInput(z.max, (v) => { z.max = v; notify(); })),
            field('Step', numberInput(z.step, (v) => { z.step = v; notify(); })),
        ];
    }

    function yAxesEditor(sp, is3D, overlaySources) {
        const wrap = el('div', 'twm-plot-config__axes');
        sp.yAxes.forEach((axis, i) => wrap.appendChild(yAxisEditor(sp, axis, i, is3D, overlaySources)));
        const add = button('Add Y axis', () => {
            sp.yAxes.push(makeDefaultYAxis(sp.yAxes.length));
            renderBody();
            notify();
        }, { title: is3D ? 'A 3D chart has one Y axis' : null });
        add.disabled = is3D;
        wrap.appendChild(add);
        return wrap;
    }

    function yAxisEditor(sp, axis, index, is3D, overlaySources) {
        const group = el('fieldset', 'twm-plot-config__axis');
        const legend = el('legend', 'twm-plot-config__axis-title', `Y axis ${index + 1}`);
        group.appendChild(legend);
        if (sp.yAxes.length > 1) {
            // Inside the legend, so it stays usable while the axis is disabled.
            legend.appendChild(removeButton('Remove Y axis', () => {
                sp.yAxes.splice(index, 1);
                renderBody();
                notify();
            }));
        }
        if (is3D && index > 0) {
            group.disabled = true;
            group.classList.add('twm-plot-config__axis--disabled');
            group.title = 'A 3D chart uses the first Y axis only';
        }

        const fields = el('div', 'twm-plot-config__axis-fields');
        fields.append(
            field('Label', textInput(axis.label, (v) => { axis.label = v; notify(); }, { placeholder: 'Axis title' })),
            field('Scale', select(SCALES, axis.scale ?? 'linear', (v) => { axis.scale = v; notify(); })),
            field('Position', select(POSITIONS, axis.position ?? 'left', (v) => { axis.position = v; notify(); })),
            field('Min', numberInput(axis.min, (v) => { axis.min = v; notify(); })),
            field('Max', numberInput(axis.max, (v) => { axis.max = v; notify(); })),
            field('Step', numberInput(axis.step, (v) => { axis.step = v; notify(); })),
        );
        group.appendChild(fields);

        const list = el('div', 'twm-plot-config__series-list');
        if (!axis.series.length) list.appendChild(el('div', 'twm-plot-config__empty', 'No series.'));
        for (const s of axis.series) list.appendChild(seriesRow(sp, axis, s, overlaySources));
        group.appendChild(list);

        group.appendChild(button('Add series', () => {
            const count = sp.yAxes.reduce((n, a) => n + (a.series?.length ?? 0), 0);
            axis.series.push(makeDefaultSeries(count));
            renderBody();
            notify();
        }));
        return group;
    }

    /**
     * One series as a block: a header line (series picker, legend label,
     * remove) over its fields on the editor's label column (colour, width,
     * dash, stack group, the embedder's fields, overlay).
     */
    function seriesRow(sp, axis, s, overlaySources) {
        const row = el('div', 'twm-plot-config__series');
        const head = el('div', 'twm-plot-config__series-head');
        head.append(
            seriesPicker(s, 'variable', 'series', sp, 'Series'),
            textInput(s.label, (v) => { s.label = v; notify(); }, { placeholder: 'Legend label', label: 'Legend label' }),
            removeButton('Remove series', () => {
                const i = axis.series.indexOf(s);
                if (i >= 0) axis.series.splice(i, 1);
                renderBody();
                notify();
            }),
        );

        const fields = el('div', 'twm-plot-config__series-fields');
        fields.append(
            field('Colour', colorField(s.color, (v) => { if (v) s.color = v; else delete s.color; }, 'Colour')),
            field('Width', numberInput(s.lineWidth ?? 2, (v) => { s.lineWidth = v ?? 2; notify(); },
                                       { placeholder: '2', label: 'Line width', min: 1, max: 10, step: 1 })),
            field('Dash', select(DASHES, s.lineStyle ?? 'solid', (v) => { s.lineStyle = v; notify(); }, { label: 'Dash' })),
            field('Stack group', textInput(s.stackGroup, (v) => { s.stackGroup = v || null; notify(); },
                                           { placeholder: 'None', label: 'Stack group' })),
        );
        if (opts.extraSeriesFields) fields.appendChild(extraFields(sp, axis, s));
        if (opts.overlaySources) fields.appendChild(overlayEditor(s, overlaySources));
        row.append(head, fields);
        return row;
    }

    const warn = (...args) => (opts.logger?.warn ? opts.logger.warn(...args) : console.warn(...args));

    /**
     * The embedder's fields of a series: whatever `extraSeriesFields` draws
     * into the box (which sits in the series' field column), then, when it
     * returns an ARRAY, those field specs laid out by `field()`. Anything
     * else it returns is a handle, disposed when the row goes (`{ dispose }`).
     * A spec that is not `{ label, control: Element }` or
     * `{ label, render(slot) }` is skipped with a warning, as is a `render`
     * that throws: one bad field never leaves half a body.
     */
    function extraFields(sp, axis, s) {
        const extra = el('div', 'twm-plot-config__series-extra');
        const result = opts.extraSeriesFields(extra, s, { subplot: sp, axis, onChange: notify, field });
        if (!Array.isArray(result)) {
            if (typeof result?.dispose === 'function') track(() => result.dispose());
            return extra;
        }
        for (const spec of result) {
            const label = spec?.label;
            let control = null;
            if (typeof label !== 'string') {
                warn('[plot config editor] an extraSeriesFields spec has no label; skipped', spec);
                continue;
            }
            if (spec.control != null) {
                if (!(spec.control instanceof Element)) {
                    warn('[plot config editor] an extraSeriesFields spec control is not an Element; skipped', spec);
                    continue;
                }
                control = spec.control;
            } else if (typeof spec.render === 'function') {
                control = el('div', 'twm-plot-config__slot');
                try {
                    const handle = spec.render(control);
                    if (typeof handle?.dispose === 'function') track(() => handle.dispose());
                } catch (error) {
                    warn('[plot config editor] an extraSeriesFields spec failed to render; skipped', error);
                    continue;
                }
            } else {
                warn('[plot config editor] an extraSeriesFields spec has neither control nor render; skipped', spec);
                continue;
            }
            extra.appendChild(field(label, control, { hint: spec.hint }));
        }
        return extra;
    }

    function overlayEditor(s, overlaySources) {
        const wrap = el('div', 'twm-plot-config__overlay');
        const head = el('div', 'twm-plot-config__overlay-source', 'Loading overlay sources…');
        const details = el('div', 'twm-plot-config__overlay-fields');
        wrap.append(head, details);

        // The details' colour field is torn down on each redraw of the
        // details, not left for the body's next redraw.
        let detailDisposers = [];
        const disposeDetails = () => {
            const fns = detailDisposers;
            detailDisposers = [];
            for (const fn of fns) {
                try { fn(); } catch (error) {
                    opts.logger?.warn?.('[plot config editor] a field failed to dispose', error);
                }
            }
        };
        track(disposeDetails);
        const keep = (fn) => { detailDisposers.push(fn); };
        const drawDetails = () => {
            disposeDetails();
            details.replaceChildren();
            const ov = s.overlay;
            if (!ov) return;
            details.append(
                field('Label', textInput(ov.label, (v) => { ov.label = v; notify(); },
                                         { placeholder: `${s.label || s.variable || 'Series'} (actual)` })),
                field('Colour', colorField(ov.color, (v) => { if (v) ov.color = v; else delete ov.color; }, 'Overlay colour', keep)),
                field('Dash', select(DASHES, ov.lineStyle ?? 'dashed', (v) => { ov.lineStyle = v; notify(); })),
                field('Width', numberInput(ov.lineWidth ?? 2, (v) => { ov.lineWidth = v ?? 2; notify(); },
                                           { placeholder: '2', min: 1, max: 10, step: 1 })),
                field('Mode', select(OVERLAY_MODES, ov.mode ?? 'markers+lines', (v) => { ov.mode = v; notify(); })),
            );
        };

        const gen = generation;
        overlaySources().then((list) => {
            if (disposed || gen !== generation) return;
            head.replaceChildren(field('Overlay', select(Array.isArray(list) ? list : [], s.overlay?.source, (v) => {
                if (v === undefined) delete s.overlay;
                else s.overlay = { ...(s.overlay ?? {}), source: v };
                drawDetails();
                notify();
            }, { empty: 'None' })));
            drawDetails();
        }, () => {
            if (disposed || gen !== generation) return;
            head.textContent = 'Could not load overlay sources.';
            head.classList.add('twm-plot-config__overlay-source--error');
        });
        return wrap;
    }

    function referenceLinesEditor(sp) {
        const axisOptions = sp.yAxes.map((a, i) => ({ value: a.id, label: a.label || `Y axis ${i + 1}` }));
        return listEditor(sp, 'referenceLines', {
            addLabel: 'Add reference line',
            makeItem: () => ({ yAxisId: sp.yAxes[0].id, value: 0, label: '', lineStyle: 'dashed' }),
            fields: (line) => [
                select(axisOptions, line.yAxisId ?? sp.yAxes[0].id, (v) => { line.yAxisId = v; notify(); },
                       { label: 'Axis' }),
                numberInput(line.value, (v) => { line.value = v; notify(); }, { placeholder: 'Value', label: 'Value' }),
                textInput(line.label, (v) => { line.label = v; notify(); }, { placeholder: 'Label', label: 'Label' }),
                colorField(line.color, (v) => { if (v) line.color = v; else delete line.color; }, 'Colour'),
                select(DASHES, line.lineStyle ?? 'dashed', (v) => { line.lineStyle = v; notify(); }, { label: 'Dash' }),
            ],
        });
    }

    function shadedBandsEditor(sp) {
        return listEditor(sp, 'shadedBands', {
            addLabel: 'Add shaded band',
            makeItem: () => ({ x0: null, x1: null, label: '' }),
            fields: (band) => [
                numberInput(band.x0, (v) => { band.x0 = v; notify(); }, { placeholder: 'From', label: 'From' }),
                numberInput(band.x1, (v) => { band.x1 = v; notify(); }, { placeholder: 'To', label: 'To' }),
                textInput(band.label, (v) => { band.label = v; notify(); }, { placeholder: 'Label', label: 'Label' }),
                colorField(band.color, (v) => { if (v) band.color = v; else delete band.color; }, 'Colour'),
                numberInput(band.opacity, (v) => {
                    if (v == null) delete band.opacity; else band.opacity = v;
                    notify();
                }, { placeholder: 'Opacity', label: 'Opacity', min: 0, max: 1, step: 0.05 }),
            ],
        });
    }

    function transformsSection(sp) {
        if (!Object.keys(opts.seriesTransforms ?? {}).length) return null;
        const s = section('Derived series');
        const controls = renderSeriesTransformControls(s, sp, opts.seriesTransforms, { onChange: notify });
        track(() => controls.dispose());
        return s;
    }

    syncChrome();
    renderBody();

    return {
        /** Dispose every field it created and remove the editor. Later calls do nothing. */
        dispose() {
            if (disposed) return;
            disposed = true;
            disposeBody();
            tabs.destroy();
            root.remove();
        },
        /** Redraw from the config, after it was changed from outside. */
        refresh() {
            if (disposed) return;
            ensureSubplots();
            active = Math.min(active, slots() - 1);
            syncChrome();
            renderBody();
        },
        /** Bring subplot `index` to the front. */
        selectSubplot(index) {
            if (disposed || !Number.isInteger(index) || index < 0 || index >= slots()) return;
            tabs.select(index);
        },
        /** The index of the subplot in front. */
        get activeSubplot() { return active; },
    };
}

export { renderPlotConfigEditor };
