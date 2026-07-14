/**
 * rAF-coalesced ResizeObserver.
 *
 * Running layout-mutating work — `Plotly.Plots.resize()`, Monaco's
 * `editor.layout()`, a canvas resize, or a re-render — *synchronously* inside a
 * ResizeObserver callback makes the engine emit the (spec-defined, benign but
 * console-error-level) "ResizeObserver loop completed with undelivered
 * notifications" warning: the callback mutates layout, which produces more
 * resize notifications it can't deliver in the same dispatch.
 *
 * Deferring the work to the next animation frame is the root-cause fix — the
 * engine delivers all pending notifications first, so there's nothing left
 * "undelivered" — and coalescing collapses a burst of resize events into a
 * single render.
 *
 * @param {(entries: ResizeObserverEntry[]) => void} callback
 * @returns {ResizeObserver}
 */
export function createRafResizeObserver(callback) {
    let scheduled = false;
    let latestEntries = [];
    return new ResizeObserver((entries) => {
        latestEntries = entries;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            callback(latestEntries);
        });
    });
}
