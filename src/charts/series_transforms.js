/**
 * series_transforms.js — derived series an embedder supplies: a trend, a moving
 * average, a decomposition. @flexdesk/charts ships none of its own.
 *
 * A transform is a description plus an async function:
 *
 *     const seriesTransforms = {
 *         movingAverage: {
 *             label: 'Moving average',
 *             params: { window: { label: 'Window', default: 5, min: 1, step: 1 } },
 *             outputs: {
 *                 mean: { label: 'Mean', suffix: ' (MA)', lineStyle: 'dashed' },
 *             },
 *             run: async (y, params) => ({ mean: rollingMean(y, params.window) }),
 *         },
 *     };
 *
 * `run(y, params, context)` resolves `{ [output]: number[] }`. It is called
 * ONCE per eligible trace (a 2-D line/scatter trace) for each transform with at
 * least one output switched on, and every switched-on output it returns is
 * drawn as an extra trace in the source trace's colour, named
 * `<source name><suffix>`, with the output's `lineStyle` (solid | dashed |
 * dotted) and `lineWidth`.
 *
 * `y` is the drawn values (after the subplot's NaN handling and whatever the
 * embedder's `resolveSeries` did, such as a rebase). `context` (0.17.8) says
 * which series they are:
 *
 *     { series,          // the subplot's series entry the trace was drawn from
 *                        //   (its variable, scenario, ...); null when unknown
 *       subplot,         // the subplot config
 *       results,         // the results the figure was drawn from, or null
 *       resolveSeries }  // the `(series, results, subplot) => { y, x? }` the
 *                        //   figure was drawn with, or null
 *
 * so a transform can look the same series up elsewhere (a baseline scenario)
 * and resolve it the same way. renderPlotGrid (and so PlotPopoutWindow) runs
 * transforms only on the traces of the subplot's own series, never on
 * overlays or derived traces. A transform written as `run(y, params)` ignores
 * the third argument and works as before.
 *
 * A parameter is a number field by default:
 *
 *     window: { label: 'Window', default: 5, min: 1, step: 1 }
 *
 * or, declared `type: 'choice'` (0.17.8), a select over `options`: an array of
 * `{ value, label }`, or a function `(subplot) => [{ value, label }]` called
 * when the controls are drawn (and when the parameter needs its default):
 *
 *     baseline: { label: 'Compare with', type: 'choice',
 *                 options: () => scenarios.map((s) => ({ value: s.id, label: s.name })) }
 *
 * The chosen value is saved and passed to `run` like a number. Without a
 * `default` and with nothing saved, a choice is its first enabled option.
 *
 * What is switched on lives in the subplot, under `subplot.transforms`:
 *
 *     subplot.transforms = { movingAverage: { outputs: { mean: true }, params: { window: 7 } } }
 *
 * A transform that throws, rejects or resolves something that is not an object
 * is skipped for that trace; the figure is drawn without it.
 */

import { buildTrace } from './chart_types.js';
import { selectBox } from '../ui/components/choice_controls.js';

/** Whether a parameter spec is a choice (a select) rather than a number. */
const isChoice = (spec) => spec?.type === 'choice';

/** A choice parameter's options for `subplot`: its array, or what its function returns. */
function choiceOptions(spec, subplot) {
    const options = typeof spec.options === 'function' ? spec.options(subplot) : spec.options;
    return Array.isArray(options) ? options : [];
}

/** A choice parameter's value when none is declared or saved: its first enabled option's. */
function firstChoice(spec, subplot) {
    const first = choiceOptions(spec, subplot)
        .find((o) => !(o !== null && typeof o === 'object' && o.disabled));
    return first !== null && typeof first === 'object' ? first.value : first;
}

/** A transform's parameter values: its declared defaults under the subplot's own. */
function resolveParams(transform, state, subplot) {
    const saved = state?.params ?? {};
    const params = {};
    for (const [name, spec] of Object.entries(transform.params ?? {})) {
        params[name] = spec?.default;
        if (isChoice(spec) && spec.default === undefined && saved[name] === undefined) {
            params[name] = firstChoice(spec, subplot);
        }
    }
    return { ...params, ...saved };
}

/** The output names of `transform` that `state` switches on, in declared order. */
function enabledOutputs(transform, state) {
    return Object.keys(transform.outputs ?? {}).filter((name) => state?.outputs?.[name] === true);
}

/** A trace a transform may run on: 2-D, line or scatter, with a y array. */
function isEligible(trace) {
    const type = trace.type ?? 'scatter';
    return (type === 'scatter' || type === 'scattergl') && Array.isArray(trace.y);
}

/**
 * The derived traces for one subplot's figure.
 *
 * @param {Object[]} traces - The figure's Plotly traces so far (not modified).
 * @param {Object} subplot - The subplot config; reads `subplot.transforms`.
 * @param {Object|null} seriesTransforms - `{ [id]: transform }`, or null for none.
 * @param {Object} [options]
 * @param {Function} [options.onError] - `({ transformId, traceName, error })`,
 *        called for each skipped run.
 * @param {Function} [options.seriesOf] - `(trace) => series | null`: the series
 *        config a trace was drawn from. Given, transforms run only on the traces
 *        it names a series for, and `context.series` is that series; without
 *        it every eligible trace is a source and `context.series` is null.
 * @param {Object} [options.results] - The results the figure was drawn from
 *        (`context.results`).
 * @param {Function} [options.resolveSeries] - The resolver the figure was drawn
 *        with (`context.resolveSeries`).
 * @returns {Promise<Object[]>} The extra traces, in transform then trace order.
 */
async function deriveSeriesTraces(traces, subplot, seriesTransforms,
                                  { onError, seriesOf, results, resolveSeries } = {}) {
    const derived = [];
    if (!seriesTransforms) return derived;
    const sources = traces.filter(isEligible)
        .map((trace) => ({ trace, series: typeof seriesOf === 'function' ? (seriesOf(trace) ?? null) : null }))
        .filter(({ series }) => typeof seriesOf !== 'function' || series !== null);

    for (const [transformId, transform] of Object.entries(seriesTransforms)) {
        const state = subplot?.transforms?.[transformId];
        const outputs = enabledOutputs(transform, state);
        if (!outputs.length || typeof transform?.run !== 'function') continue;
        const params = resolveParams(transform, state, subplot);

        for (const { trace: source, series } of sources) {
            const context = { series, subplot, results: results ?? null, resolveSeries: resolveSeries ?? null };
            let result;
            try {
                result = await transform.run(source.y, params, context);
            } catch (error) {
                onError?.({ transformId, traceName: source.name, error });
                continue;
            }
            if (!result || typeof result !== 'object') {
                onError?.({ transformId, traceName: source.name,
                            error: new Error(`transform "${transformId}" resolved no outputs`) });
                continue;
            }
            const color = source.line?.color || source.marker?.color;
            for (const name of outputs) {
                const y = result[name];
                if (!Array.isArray(y)) continue;
                const spec = transform.outputs[name];
                derived.push({
                    ...buildTrace({
                        chartType: 'line',
                        x: source.x,
                        y,
                        name: `${source.name}${spec.suffix ?? ` (${spec.label ?? name})`}`,
                        color,
                        lineWidth: spec.lineWidth ?? 2,
                        lineStyle: spec.lineStyle ?? 'solid',
                        yAxisId: source.yaxis || 'y',
                    }),
                    showlegend: true,
                });
            }
        }
    }
    return derived;
}

/**
 * The controls for `seriesTransforms` in a subplot's config: per transform, a
 * toggle for each output and, for each parameter, a number field or, for a
 * `type: 'choice'` parameter, a select (choice_controls' selectBox). They edit
 * `subplot.transforms` in place and call `onChange()` after every edit. With no
 * transforms (null or `{}`) nothing is rendered.
 *
 * @param {HTMLElement} container
 * @param {Object} subplot
 * @param {Object|null} seriesTransforms
 * @param {Object} [options]
 * @param {Function} [options.onChange]
 * @returns {{ dispose: Function }}
 */
function renderSeriesTransformControls(container, subplot, seriesTransforms, { onChange } = {}) {
    const entries = Object.entries(seriesTransforms ?? {});
    if (!entries.length) return { dispose() {} };

    const root = document.createElement('div');
    root.className = 'twm-series-transforms';

    const stateOf = (transformId) => {
        subplot.transforms ??= {};
        subplot.transforms[transformId] ??= {};
        return subplot.transforms[transformId];
    };

    for (const [transformId, transform] of entries) {
        const group = document.createElement('fieldset');
        group.className = 'twm-series-transforms__group';
        const legend = document.createElement('legend');
        legend.className = 'twm-series-transforms__label';
        legend.textContent = transform.label ?? transformId;
        group.appendChild(legend);

        const paramInputs = [];
        const syncDisabled = () => {
            const on = enabledOutputs(transform, subplot.transforms?.[transformId]).length > 0;
            for (const input of paramInputs) input.disabled = !on;
        };

        for (const [name, spec] of Object.entries(transform.outputs ?? {})) {
            const row = document.createElement('label');
            row.className = 'twm-series-transforms__row';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = subplot.transforms?.[transformId]?.outputs?.[name] === true;
            box.addEventListener('change', () => {
                const state = stateOf(transformId);
                state.outputs = { ...(state.outputs ?? {}), [name]: box.checked };
                syncDisabled();
                onChange?.();
            });
            const text = document.createElement('span');
            text.textContent = spec?.label ?? name;
            row.append(box, text);
            group.appendChild(row);
        }

        for (const [name, spec] of Object.entries(transform.params ?? {})) {
            const row = document.createElement('label');
            row.className = 'twm-series-transforms__row';
            const text = document.createElement('span');
            text.textContent = spec?.label ?? name;
            const writeParam = (value) => {
                const state = stateOf(transformId);
                const params = { ...(state.params ?? {}) };
                if (value === undefined) delete params[name];
                else params[name] = value;
                state.params = params;
                onChange?.();
            };
            const saved = subplot.transforms?.[transformId]?.params?.[name];

            if (isChoice(spec)) {
                const current = saved ?? spec.default ?? firstChoice(spec, subplot);
                const choice = selectBox(choiceOptions(spec, subplot), current, {
                    label: spec?.label ?? name,
                    valueAttr: 'value',
                    className: 'twm-series-transforms__param twm-series-transforms__select',
                });
                choice.box.addEventListener('change', () => {
                    const value = choice.valueOf();
                    // Redrawn with the chosen value, as settings do: a stale
                    // '(not found)' entry goes once an offered option is picked.
                    choice.setOptions(choiceOptions(spec, subplot), value);
                    writeParam(value);
                });
                paramInputs.push(choice.box);
                row.append(text, choice.box);
                group.appendChild(row);
                continue;
            }

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'twm-series-transforms__param';
            for (const attr of ['min', 'max', 'step']) {
                if (spec?.[attr] != null) input[attr] = String(spec[attr]);
            }
            const current = saved ?? spec?.default;
            input.value = current == null ? '' : String(current);
            input.addEventListener('change', () => {
                const value = parseFloat(input.value);
                writeParam(Number.isFinite(value) ? value : undefined);
            });
            paramInputs.push(input);
            row.append(text, input);
            group.appendChild(row);
        }

        syncDisabled();
        root.appendChild(group);
    }

    container.appendChild(root);
    return { dispose() { root.remove(); } };
}

export { deriveSeriesTraces, renderSeriesTransformControls };
