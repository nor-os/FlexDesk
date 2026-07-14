/**
 * Chart Types and Trace Configurations
 *
 * Defines trace configurations for Plotly.js and provides mapping
 * from Chart.js options to Plotly equivalents.
 */

import { getSeriesColor, hexToRgba } from './plotly_wrapper.js';

/**
 * Available 2D chart types
 */
export const CHART_TYPES_2D = Object.freeze([
    { value: 'line', label: 'Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'scatter', label: 'Scatter' },
    { value: 'area', label: 'Area' },
    { value: 'area-stacked', label: 'Area (Stacked %)' },
    { value: 'phase', label: 'Phase' },
]);

/**
 * Available 3D chart types
 */
export const CHART_TYPES_3D = Object.freeze([
    { value: 'scatter3d', label: '3D Scatter' },
    { value: 'line3d', label: '3D Line' },
    { value: 'surface', label: '3D Surface' },
]);

/**
 * All chart types combined
 */
export const ALL_CHART_TYPES = Object.freeze([...CHART_TYPES_2D, ...CHART_TYPES_3D]);

/**
 * Check if chart type is 3D
 * @param {string} chartType
 * @returns {boolean}
 */
export function is3DChart(chartType) {
    return ['scatter3d', 'line3d', 'surface'].includes(chartType);
}

/**
 * Line style mapping (Chart.js borderDash to Plotly dash)
 */
const LINE_DASH_MAP = {
    solid: 'solid',
    dashed: 'dash',
    dotted: 'dot',
};

/**
 * Interpolation mapping (Chart.js to Plotly line shape)
 */
const INTERPOLATION_MAP = {
    linear: 'linear',
    step: 'hv',      // horizontal-vertical step
    cubic: 'spline', // smooth spline
    auto: 'linear',
};

/**
 * Build a Plotly trace from series configuration.
 * @param {Object} options
 * @param {string} options.chartType - Chart type (line, bar, scatter, area, scatter3d, etc.)
 * @param {Array} options.x - X-axis data
 * @param {Array} options.y - Y-axis data
 * @param {Array} [options.z] - Z-axis data (for 3D charts)
 * @param {string} options.name - Series name/label
 * @param {string} [options.color] - Series color (hex)
 * @param {number} [options.lineWidth] - Line width in pixels
 * @param {string} [options.lineStyle] - Line style: solid, dashed, dotted
 * @param {string} [options.interpolation] - Interpolation: linear, step, cubic
 * @param {string} [options.yAxisId] - Y-axis identifier (y, y2, y3, etc.)
 * @param {boolean} [options.showMarkers] - Show data point markers
 * @param {number} [options.seriesIndex] - Index for default color selection
 * @returns {Object} Plotly trace object
 */
export function buildTrace(options) {
    const {
        chartType = 'line',
        x = [],
        y = [],
        z = null,
        name = 'Series',
        color = null,
        lineWidth = 2,
        lineStyle = 'solid',
        interpolation = 'linear',
        yAxisId = 'y',
        showMarkers = false,
        seriesIndex = 0,
        stackGroup = null,
    } = options;

    const seriesColor = color || getSeriesColor(seriesIndex);

    // Determine Plotly trace type and mode
    let plotlyType, mode;
    switch (chartType) {
        case 'line':
            plotlyType = 'scatter';
            mode = showMarkers ? 'lines+markers' : 'lines';
            break;
        case 'scatter':
            plotlyType = 'scatter';
            mode = 'markers';
            break;
        case 'area':
        case 'area-stacked':
            plotlyType = 'scatter';
            mode = showMarkers ? 'lines+markers' : 'lines';
            break;
        case 'phase':
            plotlyType = 'scatter';
            mode = 'lines+markers';
            break;
        case 'bar':
            plotlyType = 'bar';
            mode = undefined;
            break;
        case 'scatter3d':
            plotlyType = 'scatter3d';
            mode = 'markers';
            break;
        case 'line3d':
            plotlyType = 'scatter3d';
            mode = showMarkers ? 'lines+markers' : 'lines';
            break;
        case 'surface':
            plotlyType = 'surface';
            mode = undefined;
            break;
        default:
            plotlyType = 'scatter';
            mode = showMarkers ? 'lines+markers' : 'lines';
    }

    // Build base trace
    const trace = {
        type: plotlyType,
        name,
        x,
        y,
    };

    // Add mode if applicable
    if (mode) {
        trace.mode = mode;
    }

    // Add z-axis data for 3D charts
    if (z && is3DChart(chartType)) {
        // Surface charts require z to be a 2D array
        // If z is 1D (time series data), use mesh3d with Delaunay triangulation
        if (chartType === 'surface') {
            const zIs2D = Array.isArray(z) && z.length > 0 && Array.isArray(z[0]);
            if (zIs2D) {
                trace.z = z;
            } else {
                // Use mesh3d with Delaunay triangulation for 1D scattered points
                console.info('[chart_types] Surface chart with 1D z data - using mesh3d with Delaunay triangulation');
                trace.type = 'mesh3d';
                trace.x = x;
                trace.y = y;
                trace.z = z;
                trace.alphahull = 0; // Delaunay triangulation (convex hull = -1, 0 = Delaunay)
                trace.opacity = 0.8;
                trace.color = seriesColor;
                trace.flatshading = true;
                trace.lighting = {
                    ambient: 0.6,
                    diffuse: 0.5,
                    specular: 0.2,
                };
                // Skip surface-specific config below
                return trace;
            }
        } else {
            trace.z = z;
        }
    }

    // Phase chart: line with small markers
    if (chartType === 'phase') {
        trace.line = {
            color: seriesColor,
            width: lineWidth,
            dash: LINE_DASH_MAP[lineStyle] || 'solid',
        };
        trace.marker = {
            color: seriesColor,
            size: 3,
        };
        return trace;
    }

    // Line configuration (for line/area charts)
    if (['line', 'area', 'area-stacked', 'line3d'].includes(chartType)) {
        trace.line = {
            color: seriesColor,
            width: lineWidth,
            dash: LINE_DASH_MAP[lineStyle] || 'solid',
            shape: INTERPOLATION_MAP[interpolation] || 'linear',
        };
    }

    // Marker configuration
    if (['scatter', 'scatter3d'].includes(chartType) || showMarkers) {
        trace.marker = {
            color: seriesColor,
            size: chartType === 'scatter3d' ? 4 : 6,
        };
    }

    // Normalized stacked area: each Y-axis is its own stack group, each summing to 1.
    if (chartType === 'area-stacked') {
        trace.stackgroup = yAxisId;
        trace.groupnorm = 'fraction';
        trace.fillcolor = hexToRgba(seriesColor, 0.5);
        trace.line = { ...(trace.line || {}), width: 0.5, color: seriesColor };
        trace.mode = 'lines';
    }
    // Fill for area charts (non-stacked)
    else if (chartType === 'area' && !stackGroup) {
        trace.fill = 'tozeroy';
        trace.fillcolor = hexToRgba(seriesColor, 0.3);
    }
    // Stacked area via explicit stackGroup on any chart type
    else if (stackGroup) {
        trace.stackgroup = stackGroup;
        trace.fillcolor = hexToRgba(seriesColor, 0.5);
        trace.line = { ...(trace.line || {}), width: 0.5, color: seriesColor };
        trace.mode = 'lines';
    }

    // Bar color
    if (chartType === 'bar') {
        trace.marker = {
            color: seriesColor,
        };
    }

    // Surface colorscale
    if (chartType === 'surface') {
        trace.colorscale = 'Viridis';
        trace.showscale = true;
    }

    // Y-axis assignment (for multi-axis support)
    if (!is3DChart(chartType) && yAxisId && yAxisId !== 'y') {
        trace.yaxis = yAxisId;
    }

    return trace;
}

/**
 * Build layout for Y-axis based on configuration.
 * @param {Object} options
 * @param {string} options.axisId - Axis identifier (y, y2, y3, etc.)
 * @param {string} [options.title] - Axis title
 * @param {string} [options.position] - Axis position: left or right
 * @param {string} [options.scaleType] - Scale type: linear or log
 * @param {number} [options.min] - Minimum value
 * @param {number} [options.max] - Maximum value
 * @param {number} [options.step] - Tick step size
 * @param {boolean} [options.showGrid] - Show grid lines
 * @param {number|null} [options.axisPosition] - Explicit position in normalized coords (0-1), null for default
 * @returns {Object} Plotly axis layout object
 */
export function buildYAxisLayout(options) {
    const {
        axisId = 'yaxis',
        title = '',
        position = 'left',
        scaleType = 'linear',
        min = null,
        max = null,
        step = null,
        showGrid = true,
        axisPosition = null,
    } = options;

    const layout = {
        title: { text: title },
        type: scaleType === 'log' ? 'log' : 'linear',
        side: position,
        gridcolor: 'rgba(255,255,255,0.05)',
        linecolor: 'rgba(255,255,255,0.08)',
        tickcolor: 'rgba(255,255,255,0.3)',
        zerolinecolor: 'rgba(255,255,255,0.06)',
        showgrid: showGrid,
        automargin: true, // Auto-expand margin for tick labels
    };

    // Set range if min/max provided.
    // Both bounds: fixed range (autorange off).
    // One-sided: use autorangeoptions so Plotly auto-ranges within data but respects the cap/floor.
    // Plotly does not accept null in a range array — [null, max] silently sets the lower bound to 0.
    if (min !== null && max !== null) {
        layout.autorange = false;
        layout.range = [min, max];
    } else if (min !== null || max !== null) {
        layout.autorange = true;
        layout.autorangeoptions = {};
        if (min !== null) layout.autorangeoptions.minallowed = min;
        if (max !== null) layout.autorangeoptions.maxallowed = max;
    }

    // Set tick step if provided
    if (step !== null && step > 0) {
        layout.dtick = step;
    }

    // For secondary axes, overlay on the first y-axis
    if (axisId !== 'yaxis') {
        layout.overlaying = 'y';
        layout.anchor = 'free';

        // Use explicit position if provided (for proper multi-axis layout)
        // axisPosition is in normalized figure coordinates (0-1)
        if (axisPosition !== null) {
            layout.position = axisPosition;
        } else {
            // Fallback: position at domain edge (0 for left, 1 for right)
            layout.position = position === 'left' ? 0 : 1;
        }
    }

    return layout;
}

/**
 * Build X-axis layout.
 * @param {Object} options
 * @param {string} [options.title] - Axis title
 * @param {string} [options.scaleType] - Scale type: linear or log
 * @param {number} [options.min] - Minimum value
 * @param {number} [options.max] - Maximum value
 * @returns {Object} Plotly xaxis layout object
 */
export function buildXAxisLayout(options) {
    const {
        title = 'Time',
        scaleType = 'linear',
        min = null,
        max = null,
    } = options;

    const layout = {
        title: { text: title },
        type: scaleType === 'log' ? 'log' : 'linear',
        gridcolor: 'rgba(255,255,255,0.05)',
        linecolor: 'rgba(255,255,255,0.08)',
        tickcolor: 'rgba(255,255,255,0.3)',
        zerolinecolor: 'rgba(255,255,255,0.06)',
        automargin: true,
    };

    if (min !== null || max !== null) {
        layout.range = [min, max];
    }

    return layout;
}

/**
 * Build 3D scene layout.
 * @param {Object} options
 * @param {string} [options.xTitle] - X-axis title
 * @param {string} [options.yTitle] - Y-axis title
 * @param {string} [options.zTitle] - Z-axis title
 * @param {string} [options.zScale] - Z-axis scale type: 'linear' or 'log'
 * @param {number} [options.zMin] - Z-axis minimum value
 * @param {number} [options.zMax] - Z-axis maximum value
 * @param {number} [options.zStep] - Z-axis tick step size
 * @returns {Object} Plotly scene layout object
 */
export function build3DSceneLayout(options) {
    const {
        xTitle = 'X',
        yTitle = 'Y',
        zTitle = 'Z',
        zScale = 'linear',
        zMin = null,
        zMax = null,
        zStep = null,
    } = options;

    const zaxis = {
        title: { text: zTitle },
        type: zScale === 'log' ? 'log' : 'linear',
        gridcolor: 'rgba(255,255,255,0.05)',
        linecolor: 'rgba(255,255,255,0.08)',
        backgroundcolor: 'rgba(0,0,0,0)',
    };

    // Set range if min/max provided
    if (zMin !== null || zMax !== null) {
        zaxis.range = [zMin, zMax];
    }

    // Set tick step if provided
    if (zStep !== null && zStep > 0) {
        zaxis.dtick = zStep;
    }

    return {
        xaxis: {
            title: { text: xTitle },
            gridcolor: 'rgba(255,255,255,0.05)',
            linecolor: 'rgba(255,255,255,0.08)',
            backgroundcolor: 'rgba(0,0,0,0)',
        },
        yaxis: {
            title: { text: yTitle },
            gridcolor: 'rgba(255,255,255,0.05)',
            linecolor: 'rgba(255,255,255,0.08)',
            backgroundcolor: 'rgba(0,0,0,0)',
        },
        zaxis,
        bgcolor: 'rgba(0,0,0,0)',
    };
}

/**
 * Build legend layout.
 * @param {string} position - Legend position: top, bottom, left, right, hidden
 * @returns {Object} Plotly legend layout
 */
export function buildLegendLayout(position) {
    if (position === 'hidden') {
        return { showlegend: false };
    }

    const baseLayout = {
        showlegend: true,
        bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cccccc' },
    };

    switch (position) {
        case 'top':
            return {
                ...baseLayout,
                legend: {
                    ...baseLayout,
                    orientation: 'h',
                    y: 1.1,
                    yanchor: 'bottom',
                    x: 0.5,
                    xanchor: 'center',
                },
            };
        case 'bottom':
            return {
                ...baseLayout,
                legend: {
                    ...baseLayout,
                    orientation: 'h',
                    y: -0.15,
                    yanchor: 'top',
                    x: 0.5,
                    xanchor: 'center',
                },
            };
        case 'left':
            return {
                ...baseLayout,
                legend: {
                    ...baseLayout,
                    orientation: 'v',
                    x: -0.15,
                    xanchor: 'right',
                    y: 0.5,
                    yanchor: 'middle',
                },
            };
        case 'right':
        default:
            return {
                ...baseLayout,
                legend: {
                    ...baseLayout,
                    orientation: 'v',
                    x: 1.02,
                    xanchor: 'left',
                    y: 0.5,
                    yanchor: 'middle',
                },
            };
    }
}

/**
 * Build Plotly layout shapes + annotations for reference lines and shaded x-bands.
 *
 * @param {Object} opts
 * @param {Array<{yAxisId?:string, value:number, label?:string, color?:string, lineStyle?:string, lineWidth?:number, labelX?:number}>} [opts.referenceLines]
 *   Horizontal threshold lines drawn across the plot, anchored to a specific Y axis.
 *   `yAxisId` matches an axis id in sp.yAxes[].id; omitted → first axis.
 * @param {Array<{x0:number, x1:number, label?:string, color?:string, opacity?:number, labelY?:number, labelColor?:string}>} [opts.shadedBands]
 *   Vertical stripes (rectangles spanning full y range) to mark policy/recession periods.
 * @param {Object<string,string>} [opts.yRefByAxisId]
 *   Mapping from subplot yAxes[i].id → Plotly yref ('y', 'y2', ...).
 * @returns {{shapes: Array, annotations: Array}}
 */
export function buildOverlayShapes(opts = {}) {
    const { referenceLines = [], shadedBands = [], yRefByAxisId = {} } = opts;
    const shapes = [];
    const annotations = [];
    const dashMap = { solid: 'solid', dashed: 'dash', dotted: 'dot', dashdot: 'dashdot' };

    for (const band of shadedBands) {
        if (band.x0 == null || band.x1 == null) continue;
        shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: band.x0,
            x1: band.x1,
            y0: 0,
            y1: 1,
            fillcolor: band.color || 'rgba(255, 200, 0, 0.08)',
            line: { width: 0 },
            opacity: band.opacity ?? 1,
            layer: 'below',
        });
        if (band.label) {
            annotations.push({
                x: (band.x0 + band.x1) / 2,
                y: band.labelY ?? 1.0,
                xref: 'x',
                yref: 'paper',
                text: band.label,
                showarrow: false,
                font: { size: 9, color: band.labelColor || 'rgba(255,255,255,0.55)' },
                xanchor: 'center',
                yanchor: 'bottom',
            });
        }
    }

    const firstYRef = Object.values(yRefByAxisId)[0] || 'y';
    for (const ref of referenceLines) {
        if (ref.value == null || !Number.isFinite(ref.value)) continue;
        const yRef = (ref.yAxisId && yRefByAxisId[ref.yAxisId]) || firstYRef;
        const color = ref.color || 'rgba(255, 120, 120, 0.75)';
        shapes.push({
            type: 'line',
            xref: 'paper',
            yref: yRef,
            x0: 0,
            x1: 1,
            y0: ref.value,
            y1: ref.value,
            line: {
                color,
                width: ref.lineWidth ?? 1.5,
                dash: dashMap[ref.lineStyle || 'dashed'] || 'dash',
            },
            layer: 'above',
        });
        if (ref.label) {
            annotations.push({
                x: ref.labelX ?? 0.015,
                y: ref.value,
                xref: 'paper',
                yref: yRef,
                text: ref.label,
                showarrow: false,
                font: { size: 10, color },
                xanchor: 'left',
                yanchor: 'bottom',
                bgcolor: 'rgba(20,22,26,0.6)',
                borderpad: 2,
            });
        }
    }

    return { shapes, annotations };
}

/**
 * Create a fan chart trace with confidence bands.
 * @param {Object} options
 * @param {Array} options.x - X-axis data (time)
 * @param {Array} options.upper - Upper bound data
 * @param {Array} options.lower - Lower bound data
 * @param {string} options.color - Band color
 * @param {number} options.opacity - Fill opacity
 * @param {string} [options.name] - Band name for legend
 * @returns {Array} Array of two traces (lower bound + fill to upper)
 */
export function buildFanBandTraces(options) {
    const { x, upper, lower, color, opacity = 0.2, name = '' } = options;

    // Lower bound line (invisible, for fill reference)
    const lowerTrace = {
        type: 'scatter',
        x,
        y: lower,
        mode: 'lines',
        line: { width: 0 },
        showlegend: false,
        hoverinfo: 'skip',
    };

    // Upper bound with fill to lower
    const upperTrace = {
        type: 'scatter',
        x,
        y: upper,
        mode: 'lines',
        line: { width: 0 },
        fill: 'tonexty',
        fillcolor: hexToRgba(color, opacity),
        name: name || `${(opacity * 100).toFixed(0)}% Band`,
        showlegend: !!name,
    };

    return [lowerTrace, upperTrace];
}

/**
 * Create a histogram trace.
 * @param {Object} options
 * @param {Array} options.x - Data values
 * @param {number} options.nbins - Number of bins
 * @param {string} options.color - Bar color
 * @param {string} [options.name] - Series name
 * @returns {Object} Plotly histogram trace
 */
export function buildHistogramTrace(options) {
    const { x, nbins = 20, color, name = 'Distribution' } = options;

    return {
        type: 'histogram',
        x,
        nbinsx: nbins,
        marker: { color },
        name,
    };
}

/**
 * Create a box plot trace.
 * @param {Object} options
 * @param {Array} options.y - Data values
 * @param {string} [options.x] - Category/time label
 * @param {string} options.color - Box color
 * @param {string} [options.name] - Series name
 * @returns {Object} Plotly box trace
 */
export function buildBoxTrace(options) {
    const { y, x = null, color, name = '' } = options;

    const trace = {
        type: 'box',
        y,
        marker: { color },
        name,
        boxpoints: false, // Don't show individual points
    };

    if (x !== null) {
        trace.x = Array.isArray(x) ? x : [x];
    }

    return trace;
}

/**
 * Create a heatmap trace.
 * @param {Object} options
 * @param {Array} options.z - 2D array of values
 * @param {Array} [options.x] - X labels
 * @param {Array} [options.y] - Y labels
 * @param {string} [options.colorscale] - Plotly colorscale name
 * @returns {Object} Plotly heatmap trace
 */
export function buildHeatmapTrace(options) {
    const { z, x = null, y = null, colorscale = 'RdBu' } = options;

    const trace = {
        type: 'heatmap',
        z,
        colorscale,
        showscale: true,
    };

    if (x) trace.x = x;
    if (y) trace.y = y;

    return trace;
}
