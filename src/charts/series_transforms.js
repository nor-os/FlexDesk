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
 * `run(y, params)` resolves `{ [output]: number[] }`. It is called ONCE per
 * eligible trace (a 2-D line/scatter trace) for each transform with at least one
 * output switched on, and every switched-on output it returns is drawn as an
 * extra trace in the source trace's colour, named `<source name><suffix>`, with
 * the output's `lineStyle` (solid | dashed | dotted) and `lineWidth`.
 *
 * What is switched on lives in the subplot, under `subplot.transforms`:
 *
 *     subplot.transforms = { movingAverage: { outputs: { mean: true }, params: { window: 7 } } }
 *
 * A transform that throws, rejects or resolves something that is not an object
 * is skipped for that trace; the figure is drawn without it.
 */

import { buildTrace } from './chart_types.js';

/** A transform's parameter values: its declared defaults under the subplot's own. */
function resolveParams(transform, state) {
    const params = {};
    for (const [name, spec] of Object.entries(transform.params ?? {})) {
        params[name] = spec?.default;
    }
    return { ...params, ...(state?.params ?? {}) };
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
 * @returns {Promise<Object[]>} The extra traces, in transform then trace order.
 */
async function deriveSeriesTraces(traces, subplot, seriesTransforms, { onError } = {}) {
    const derived = [];
    if (!seriesTransforms) return derived;
    const sources = traces.filter(isEligible);

    for (const [transformId, transform] of Object.entries(seriesTransforms)) {
        const state = subplot?.transforms?.[transformId];
        const outputs = enabledOutputs(transform, state);
        if (!outputs.length || typeof transform?.run !== 'function') continue;
        const params = resolveParams(transform, state);

        for (const source of sources) {
            let result;
            try {
                result = await transform.run(source.y, params);
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
 * toggle for each output and a number field for each parameter. They edit
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
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'twm-series-transforms__param';
            for (const attr of ['min', 'max', 'step']) {
                if (spec?.[attr] != null) input[attr] = String(spec[attr]);
            }
            const current = subplot.transforms?.[transformId]?.params?.[name] ?? spec?.default;
            input.value = current == null ? '' : String(current);
            input.addEventListener('change', () => {
                const value = parseFloat(input.value);
                const state = stateOf(transformId);
                const params = { ...(state.params ?? {}) };
                if (Number.isFinite(value)) params[name] = value;
                else delete params[name];
                state.params = params;
                onChange?.();
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
