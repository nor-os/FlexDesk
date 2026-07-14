/**
 * Plotly.js Wrapper
 *
 * Provides lazy loading of Plotly.js and helper functions for chart operations.
 * Supports streaming updates via Plotly.extendTraces() and Plotly.react().
 */

import { createRafResizeObserver } from '../ui/utils/raf_resize_observer.js';

// Where Plotly lives is the CONSUMER's business, not the library's.
//
// This was `const PLOTLY_LOCAL = 'vendor/plotly/plotly-2.35.2.min.js'` — a
// relative path into one particular application's directory tree. It happens to
// work for EcoAgent and would 404 for anyone else, and the failure would arrive
// as an empty chart with a console error, at runtime, only on the screens that
// plot something.
//
// Plotly stays a PEER dependency: 4.4 MB that @flexdesk/charts refuses to bundle.
//
// There is NO DEFAULT. Leaving one in place would only have meant leaving
// EcoAgent's exact versioned filename in the library — the same bug wearing a
// setter — and it would fail for everyone else as an empty chart and a console
// error, at runtime, on the screens that plot something.
//
// ensurePlotly() short-circuits when `window.Plotly` is already defined, which is
// how EcoAgent works: it preloads Plotly with a <script> tag in index.html and
// never reaches the loader below. A consumer that does not preload calls
// setPlotlySource() instead. A consumer that does neither now gets told so.
let _plotlySrc = null;

/** Point the loader at your copy of Plotly. Call before the first chart renders. */
export function setPlotlySource(src) {
    if (typeof src === 'string' && src) _plotlySrc = src;
}

// Loading promise for singleton pattern
let _plotlyLoadPromise = null;

// Workarounds for Plotly.js 2.35.x running in Chromium-based pywebview.
let _plotlyPatchesInstalled = false;
function _installPlotlyPatches() {
    if (_plotlyPatchesInstalled) return;
    _plotlyPatchesInstalled = true;

    // Plotly's internal mousemove handler assigns event.target which is
    // read-only in modern browsers.  Replace the native getter with a
    // getter/setter pair so the assignment succeeds silently.
    const targetDesc = Object.getOwnPropertyDescriptor(Event.prototype, 'target');
    if (targetDesc && targetDesc.get && !targetDesc.set) {
        const origGetter = targetDesc.get;
        Object.defineProperty(Event.prototype, 'target', {
            configurable: true,
            enumerable: true,
            get() {
                return this._plotlyTarget ?? origGetter.call(this);
            },
            set(v) {
                this._plotlyTarget = v;
            }
        });
    }

    // Plotly calls getImageData() repeatedly on 2D canvases without the
    // willReadFrequently hint, triggering a Chromium performance warning.
    // Patch getContext to inject the hint for all 2D contexts.
    const _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (type === '2d') {
            attrs = Object.assign({ willReadFrequently: true }, attrs);
        }
        return _origGetContext.call(this, type, attrs);
    };
}

// Run immediately on module import so the patches are active before any Plotly
// chart is created (including during workspace hydration) — but ONLY in a DOM.
//
// Unguarded, this monkey-patched HTMLCanvasElement.prototype at module scope, so
// `import '@flexdesk/charts'` threw `ReferenceError: HTMLCanvasElement is not defined`
// the instant anything imported it outside a browser. That is the third module in
// this library caught doing DOM work on import (see inline_renamer.js and
// tooltip_service.js), and all three were found by the same test: one that does
// nothing but import each entry point. A library whose entry point cannot be
// imported without a DOM cannot be unit-tested, server-rendered, or loaded in a
// worker.
if (typeof HTMLCanvasElement !== 'undefined') {
    _installPlotlyPatches();
}

/**
 * Dark theme layout defaults matching EcoSim UI
 */
export const DARK_THEME_LAYOUT = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {
        family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        size: 11,
        color: '#cccccc'
    },
    margin: { l: 50, r: 20, t: 30, b: 40 },
    legend: {
        bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cccccc' }
    },
    xaxis: {
        gridcolor: '#333333',
        linecolor: '#444444',
        tickcolor: '#666666',
        zerolinecolor: '#444444'
    },
    yaxis: {
        gridcolor: '#333333',
        linecolor: '#444444',
        tickcolor: '#666666',
        zerolinecolor: '#444444'
    },
    // Hover tooltip styling for dark theme
    hoverlabel: {
        bgcolor: '#1e2228',
        bordercolor: '#444444',
        font: {
            family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            size: 12,
            color: '#e0e0e0'
        }
    },
    // 3D scene defaults
    scene: {
        xaxis: {
            gridcolor: '#333333',
            linecolor: '#444444',
            backgroundcolor: 'rgba(0,0,0,0)'
        },
        yaxis: {
            gridcolor: '#333333',
            linecolor: '#444444',
            backgroundcolor: 'rgba(0,0,0,0)'
        },
        zaxis: {
            gridcolor: '#333333',
            linecolor: '#444444',
            backgroundcolor: 'rgba(0,0,0,0)'
        },
        bgcolor: 'rgba(0,0,0,0)'
    }
};

/**
 * Default Plotly config options
 */
export const DEFAULT_CONFIG = {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,  // Hide modebar completely
    scrollZoom: true,       // Allow zoom with scroll wheel instead
    toImageButtonOptions: {
        format: 'png',
        filename: 'ecosim_chart',
        scale: 2
    }
};

/**
 * Load Plotly.js from CDN.
 * Uses singleton pattern to avoid multiple loads.
 * @returns {Promise<Plotly>} The Plotly library object
 */
export async function ensurePlotly() {
    // Already loaded
    if (typeof Plotly !== 'undefined') {
        return Plotly;
    }

    // Loading in progress
    if (_plotlyLoadPromise) {
        return _plotlyLoadPromise;
    }

    if (!_plotlySrc) {
        throw new Error(
            '[twm/charts] Plotly is not loaded and no source is configured. '
            + 'Either load Plotly yourself (a <script> tag that sets window.Plotly), '
            + 'or call setPlotlySource("/path/to/plotly.min.js") before rendering a chart.');
    }

    // Start loading — temporarily hide AMD define so Plotly sets window.Plotly
    // instead of registering itself as an AMD module (conflicts with Monaco loader).
    _plotlyLoadPromise = new Promise((resolve, reject) => {
        const savedDefine = window.define;
        window.define = undefined;

        const script = document.createElement('script');
        script.src = _plotlySrc;
        script.async = true;

        script.onload = () => {
            window.define = savedDefine;
            if (typeof Plotly !== 'undefined') {
                console.log('[PlotlyWrapper] Plotly.js loaded successfully');
                resolve(Plotly);
            } else {
                reject(new Error('Plotly.js loaded but Plotly global not found'));
            }
        };

        script.onerror = () => {
            window.define = savedDefine;
            reject(new Error(`Failed to load Plotly.js from ${_plotlySrc} — `
                + 'call setPlotlySource() with the path to your copy.'));
        };

        document.head.appendChild(script);
    });

    return _plotlyLoadPromise;
}

/**
 * Create a new Plotly chart.
 * @param {HTMLElement} container - Container element for the chart
 * @param {Array} data - Array of trace objects
 * @param {Object} layout - Layout configuration
 * @param {Object} config - Plotly config options
 * @returns {Promise<HTMLElement>} The chart element
 */
export async function createChart(container, data, layout = {}, config = {}) {
    const Plotly = await ensurePlotly();

    const mergedLayout = {
        ...DARK_THEME_LAYOUT,
        ...layout
    };

    const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...config
    };

    return Plotly.newPlot(container, data, mergedLayout, mergedConfig);
}

/**
 * Update chart data and layout efficiently.
 * Uses Plotly.react() which is optimized for updates.
 * @param {HTMLElement} container - Chart container
 * @param {Array} data - New trace data
 * @param {Object} layout - Layout updates
 */
export async function updateChart(container, data, layout = {}) {
    const Plotly = await ensurePlotly();

    const mergedLayout = {
        ...DARK_THEME_LAYOUT,
        ...layout
    };

    return Plotly.react(container, data, mergedLayout);
}

/**
 * Extend traces with new data points (for streaming).
 * More efficient than full update for appending data.
 * @param {HTMLElement} container - Chart container
 * @param {Object} update - Data to extend: { x: [[...]], y: [[...]] }
 * @param {Array<number>} traceIndices - Which traces to extend
 * @param {number} maxPoints - Maximum points to keep (optional)
 */
export async function extendTraces(container, update, traceIndices, maxPoints = null) {
    const Plotly = await ensurePlotly();

    if (maxPoints) {
        return Plotly.extendTraces(container, update, traceIndices, maxPoints);
    }
    return Plotly.extendTraces(container, update, traceIndices);
}

/**
 * Relayout chart (update layout only, no data change).
 * @param {HTMLElement} container - Chart container
 * @param {Object} layoutUpdate - Layout properties to update
 */
export async function relayout(container, layoutUpdate) {
    const Plotly = await ensurePlotly();
    return Plotly.relayout(container, layoutUpdate);
}

/**
 * Restyle traces (update trace properties without full redraw).
 * @param {HTMLElement} container - Chart container
 * @param {Object} styleUpdate - Style properties to update
 * @param {Array<number>} traceIndices - Which traces to update
 */
export async function restyle(container, styleUpdate, traceIndices) {
    const Plotly = await ensurePlotly();
    return Plotly.restyle(container, styleUpdate, traceIndices);
}

/**
 * Delete all traces and release resources.
 * @param {HTMLElement} container - Chart container
 */
export async function purge(container) {
    const Plotly = await ensurePlotly();
    return Plotly.purge(container);
}

/**
 * Check if container has a Plotly chart.
 * @param {HTMLElement} container - Container element
 * @returns {boolean}
 */
export function hasPlot(container) {
    return container && container._fullLayout !== undefined;
}

/**
 * Resize chart to fit container.
 * Call this when container size changes.
 * @param {HTMLElement} container - Chart container
 */
export async function resize(container) {
    const Plotly = await ensurePlotly();
    return Plotly.Plots.resize(container);
}

/**
 * Convert hex color to rgba.
 * @param {string} hex - Hex color code
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} rgba color string
 */
export function hexToRgba(hex, alpha = 1) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Solarized theme colors matching legacy plot_node.js
export const COLOR_PALETTE = [
    '#268bd2', // Solarized Blue
    '#d33682', // Solarized Magenta
    '#cb4b16', // Solarized Orange
    '#2aa198', // Solarized Cyan
    '#6a5acd', // SlateBlue/Purple
    '#7a7d80', // Gray
    '#9fb6cf', // Gray-Blue
];

/**
 * Get color from palette by index.
 * @param {number} index - Series index
 * @returns {string} Color hex code
 */
export function getSeriesColor(index) {
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

/**
 * Create a Plotly chart with deferred rendering support.
 * Handles zero-dimension containers by waiting for valid dimensions via ResizeObserver.
 * @param {HTMLElement} container - Container element for the chart
 * @param {Array} traces - Array of trace objects
 * @param {Object} layout - Layout configuration
 * @param {Object} config - Plotly config options
 * @returns {Promise<{element: HTMLElement, cleanup: Function}>} Chart element and cleanup function
 */
export async function createChartDeferred(container, traces, layout = {}, config = {}) {
    const Plotly = await ensurePlotly();

    const mergedLayout = {
        ...DARK_THEME_LAYOUT,
        ...layout
    };

    const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...config
    };

    const w = container.offsetWidth;
    const h = container.offsetHeight;

    // Cleanup function to return
    let resizeObserver = null;
    const cleanup = () => {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    };

    // If dimensions are valid, render immediately
    if (w > 0 && h > 0) {
        await Plotly.newPlot(container, traces, mergedLayout, mergedConfig);
        // Still set up resize observer for ongoing resizes
        resizeObserver = createRafResizeObserver(() => {
            if (hasPlot(container)) {
                Plotly.Plots.resize(container).catch(() => {});
            }
        });
        resizeObserver.observe(container);
        return { element: container, cleanup };
    }

    // Dimensions are zero - wait for valid dimensions via ResizeObserver
    return new Promise((resolve) => {
        let rendered = false;
        resizeObserver = createRafResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    if (!rendered) {
                        rendered = true;
                        Plotly.newPlot(container, traces, mergedLayout, mergedConfig).then(() => {
                            resolve({ element: container, cleanup });
                        }).catch(() => {
                            resolve({ element: container, cleanup });
                        });
                    } else if (hasPlot(container)) {
                        // Handle subsequent resizes
                        Plotly.Plots.resize(container).catch(() => {});
                    }
                }
            }
        });
        resizeObserver.observe(container);
    });
}
