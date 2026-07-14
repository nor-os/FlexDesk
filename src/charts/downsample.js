/**
 * downsample.js
 *
 * Client-side time-series decimation for the render path. A long live run
 * accumulates thousands of points per series; feeding all of them to
 * Plotly.react() every refresh is what makes a running dashboard crawl.
 * These helpers cap the points actually drawn while preserving the visual
 * shape.
 *
 * Two strategies, mirroring EcoSim (App/downsampler.py = LTTB,
 * streaming/server.py = stride decimation):
 *
 *   • strideDownsampleShared — one set of indices applied to the shared x
 *     axis and EVERY series. Cheap, gap-safe (nulls keep their slot), and
 *     alignment-safe (all series sample the same x), so it works for
 *     stacked/area charts and multi-series subplots. This is the default
 *     used by the dashboard tiles.
 *
 *   • lttb — Largest-Triangle-Three-Buckets for a single (x, y) line.
 *     Higher visual fidelity (keeps peaks/troughs) but each series picks
 *     its own x, so it's only safe for independent line/scatter traces
 *     with finite y. Offered for callers that want it.
 */

/**
 * Pick ~targetPoints evenly-spaced indices out of [0, n), always including
 * the first and last. Returns an ascending Int array; returns null when no
 * decimation is needed (n <= targetPoints) so callers can skip the copy.
 *
 * @param {number} n
 * @param {number} targetPoints
 * @returns {number[]|null}
 */
export function strideIndices(n, targetPoints) {
    if (!Number.isFinite(n) || n <= 0) return null;
    const target = Math.max(2, Math.floor(targetPoints) || 0);
    if (n <= target) return null;
    const step = (n - 1) / (target - 1);
    const idx = new Array(target);
    for (let i = 0; i < target; i++) idx[i] = Math.round(i * step);
    idx[target - 1] = n - 1;           // pin the last point exactly
    // Dedupe (rounding can collide on dense targets) while staying ascending.
    let w = 0;
    for (let r = 0; r < idx.length; r++) {
        if (w === 0 || idx[r] > idx[w - 1]) idx[w++] = idx[r];
    }
    idx.length = w;
    return idx;
}

/**
 * Decimate a shared x axis plus a set of aligned series using one common
 * set of indices, so every series stays sampled at the same x (alignment-
 * and gap-safe). No-op (returns the inputs untouched) when under threshold.
 *
 * @param {Array<number>} time — shared x values
 * @param {Object<string, Array>} series — name → aligned value array
 * @param {number} targetPoints
 * @returns {{ time: Array<number>, series: Object<string, Array> }}
 */
export function strideDownsampleShared(time, series, targetPoints) {
    const idx = strideIndices(time?.length ?? 0, targetPoints);
    if (!idx) return { time, series };
    const dsTime = idx.map((i) => time[i]);
    const dsSeries = {};
    for (const [name, arr] of Object.entries(series || {})) {
        if (!Array.isArray(arr)) { dsSeries[name] = arr; continue; }
        dsSeries[name] = idx.map((i) => (i < arr.length ? arr[i] : null));
    }
    return { time: dsTime, series: dsSeries };
}

/**
 * Largest-Triangle-Three-Buckets for one line. Preserves the first and
 * last points and the most "feature-bearing" point per bucket. Assumes
 * ascending, finite x; y entries that are null/NaN are treated as 0 for
 * the area math (callers with gappy series should prefer the stride path).
 *
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @param {number} threshold — target point count
 * @returns {{ x: Array<number>, y: Array<number> }}
 */
export function lttb(x, y, threshold) {
    const n = Math.min(x?.length ?? 0, y?.length ?? 0);
    const target = Math.floor(threshold) || 0;
    if (target <= 0 || target >= n) return { x: x.slice(0, n), y: y.slice(0, n) };
    if (target < 3) return { x: [x[0], x[n - 1]], y: [y[0], y[n - 1]] };

    const num = (v) => (Number.isFinite(v) ? v : 0);
    const outX = [x[0]];
    const outY = [y[0]];
    const bucketSize = (n - 2) / (target - 2);
    let a = 0;

    for (let i = 0; i < target - 2; i++) {
        let nextStart = Math.floor((i + 1) * bucketSize) + 1;
        let nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
        if (nextEnd <= nextStart) nextEnd = Math.min(nextStart + 1, n);
        let avgX = 0, avgY = 0;
        const count = nextEnd - nextStart;
        for (let j = nextStart; j < nextEnd; j++) { avgX += x[j]; avgY += num(y[j]); }
        avgX /= count; avgY /= count;

        const curStart = Math.floor(i * bucketSize) + 1;
        const curEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);
        const ax = x[a], ay = num(y[a]);
        let maxArea = -1, chosen = curStart;
        for (let j = curStart; j < curEnd; j++) {
            const area = Math.abs((ax - avgX) * (num(y[j]) - ay) - (ax - x[j]) * (avgY - ay));
            if (area > maxArea) { maxArea = area; chosen = j; }
        }
        outX.push(x[chosen]); outY.push(y[chosen]);
        a = chosen;
    }

    outX.push(x[n - 1]); outY.push(y[n - 1]);
    return { x: outX, y: outY };
}
