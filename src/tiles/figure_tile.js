/**
 * figure_tile.js — a tile that draws ONE Plotly figure, and owns the lifecycle
 * of drawing it.
 *
 * A subclass says WHAT to draw and nothing else. It overrides one method:
 *
 *     class SpreadTile extends FigureTile {
 *         static TYPE = 'myapp.spread';
 *         static TITLE = 'Spread';
 *         figure(data) {
 *             if (!data?.values?.length) return null;          // the empty state
 *             return {
 *                 traces: [buildHistogramTrace({ x: data.values })],
 *                 layout: { margin: { l: 48, r: 16, t: 8, b: 36 } },
 *             };
 *         }
 *     }
 *
 * `figure(data)` answers `{traces, layout?, config?, frames?}` or `null`, and is
 * synchronous: it computes, it does not wait. Everything else is the base's:
 *
 *   - it awaits `ensurePlotly()`, so a page that loads Plotly lazily through
 *     `setPlotlySource` draws on first view instead of skipping the draw;
 *   - it draws through `createChart` (the theme defaults, `scrollZoom` off — a
 *     tile sits on a scrolling board — and the mode bar hidden; `config` from
 *     the figure goes over those), then adds `frames` when there are any;
 *   - a draw that finishes after a newer one, or after the tile went empty,
 *     loading, errored or disposed, is discarded and its figure purged;
 *   - `null` is the empty state (`static EMPTY_MESSAGE`). A subclass that wants
 *     to say WHY calls `this.showEmpty(message)` itself and returns `null`;
 *   - a `figure()` that throws, or a draw that fails (Plotly absent included),
 *     is the error state plus `tile:render-failed {tileId, message}` on the
 *     event bus — never an unhandled rejection;
 *   - one relayout when a resize settles (`onResize`), none while drawing;
 *   - Download PNG in the ⋯ menu, through the host's `dialogs.saveFile` when the
 *     grid was given a host, else a browser download;
 *   - Expand opens `openRawTracesWindow` with the last figure drawn;
 *   - `onPointClick({customdata, point, tile})` on a click on a mark.
 *
 * `menuItems()` here EXTENDS `TileBase.menuItems()` with Download PNG; a
 * subclass extends these the same way (`[...super.menuItems(), …]`) and routes
 * its own actions through `_onMenuAction`, calling `super` for the rest.
 *
 * ══ EVERY STATE CHANGE INVALIDATES THE FIGURE ═══════════════════════════
 *
 * `showEmpty`, `showLoading` and `showError` replace the content with
 * `innerHTML`, which detaches the Plotly div without telling Plotly. So each of
 * them here first purges the figure, drops the reference, marks it not drawn,
 * and bumps `_drawSeq` — and a draw still in flight finds itself stale and
 * purges its own figure instead of marking it drawn.
 */

import { TileBase } from './tile_base.js';
import { createChart, ensurePlotly, purge, resize as resizePlot } from '../charts/plotly_wrapper.js';

/** What every tile's figure is drawn with; a figure's own `config` goes over it. */
const FIGURE_CONFIG = Object.freeze({
    scrollZoom: false,
    displayModeBar: false,
    responsive: true,
});

const DOWNLOAD_PNG = Object.freeze({ action: 'download-png', label: 'Download PNG', icon: 'image' });

export class FigureTile extends TileBase {
    static TYPE = 'flexdesk.figure';
    static TITLE = 'Figure';
    static EXPANDABLE = true;
    /** The empty state's text when `figure()` answers `null`. */
    static EMPTY_MESSAGE = 'No data to show.';

    /**
     * @param {Object} options - TileBase's, plus:
     * @param {Function} [options.onPointClick] - `({customdata, point, tile})`
     *        on a click on a mark. Also assignable later as `tile.onPointClick`.
     */
    constructor(options = {}) {
        super(options);
        this.onPointClick = typeof options.onPointClick === 'function' ? options.onPointClick : null;
        this._plotEl = null;
        this._drawn = false;
        this._drawSeq = 0;
        /** The figure on screen, once drawn; what Expand opens. */
        this._figure = null;
    }

    /**
     * The one override: what to draw for `data`.
     * @param {*} _data
     * @returns {{traces: Array, layout?: Object, config?: Object, frames?: Array}|null}
     */
    figure(_data) {
        throw new Error(`${this.constructor.name}.figure() must be implemented by the subclass`);
    }

    /**
     * Hand this tile its data. Unlike `update()`, an empty or null value is
     * drawn — as the empty state — rather than ignored.
     */
    setData(data) {
        if (this._disposed) return;
        this.data = data ?? null;
        if (this.contentElement) this.render(this.data);
    }

    /**
     * Kick off the draw and return. Deliberately not `async`: nothing awaits
     * `render`, so a returned promise would be a rejection nobody catches.
     */
    render(data) {
        this._draw(data);
    }

    /** One relayout when a resize settles; nothing while a draw is in flight. */
    onResize() {
        if (!this._plotEl || !this._drawn) return;
        resizePlot(this._plotEl).catch(() => {});
    }

    menuItems() {
        return [...super.menuItems(), ...this._figureMenuItems()];
    }

    /** The entries this class adds to the menu: Download PNG. For a subclass
     *  that wants them WITHOUT `TileBase`'s own. @protected */
    _figureMenuItems() {
        return [{ ...DOWNLOAD_PNG }];
    }

    _onMenuAction(action) {
        if (action === DOWNLOAD_PNG.action) this._downloadPng();
        else super._onMenuAction(action);
    }

    /** The last figure drawn, for the expand window; `null` while there is none. */
    getExpandData() {
        const fig = this._figure;
        if (!fig) return null;
        return {
            title: this.config.title || this.constructor.TITLE,
            // Copies: Plotly writes onto the trace and layout objects it draws.
            traces: fig.traces.map((t) => ({ ...t })),
            layout: { ...(fig.layout || {}) },
            frames: Array.isArray(fig.frames) ? fig.frames : undefined,
        };
    }

    // ── the three states: each one invalidates the figure ───────────────

    showLoading() {
        this._invalidate();
        super.showLoading();
    }

    showEmpty(message) {
        this._invalidate();
        super.showEmpty(message);
    }

    showError(message) {
        this._invalidate();
        super.showError(message);
    }

    /** Release the figure BEFORE the element goes — `TileBase.dispose` nulls it. */
    dispose() {
        this._invalidate();
        super.dispose();
    }

    /** Any draw in flight is now stale, and the figure on screen is released. */
    _invalidate() {
        this._drawSeq += 1;
        this._releasePlot();
    }

    /** Hand the current figure back to Plotly and forget it. Idempotent, and
     *  not awaited: a rejected purge (Plotly absent, already purged) must not
     *  surface as an unhandled rejection. */
    _releasePlot() {
        const el = this._plotEl;
        this._plotEl = null;
        this._drawn = false;
        this._figure = null;
        if (el) purge(el).catch(() => {});
    }

    /**
     * The nodes the content holds while `plotEl` draws `fig`: the plot alone
     * here. A subclass adds what sits around the figure (a note, a caption).
     * @param {HTMLElement} plotEl
     * @param {Object} _fig - what `figure()` answered
     * @returns {HTMLElement[]}
     * @protected
     */
    _figureContent(plotEl, _fig) {
        return [plotEl];
    }

    // ── the draw ────────────────────────────────────────────────────────

    async _draw(data) {
        this._drawSeq += 1;
        const seq = this._drawSeq;
        const content = this.contentElement;
        if (!content) return;
        const stale = () => this._disposed || seq !== this._drawSeq;

        // Every path below replaces the content, so the figure there now is
        // about to be orphaned whichever way this goes.
        this._releasePlot();

        let fig;
        try {
            fig = this.figure(data);
            if (fig != null && (typeof fig !== 'object' || !Array.isArray(fig.traces))) {
                throw new Error('figure() must answer {traces, layout} or null');
            }
        } catch (err) {
            this._failed(err);
            return;
        }
        if (!fig) {
            // A subclass that already said why (showEmpty) has bumped the sequence.
            if (!stale()) this.showEmpty(this.constructor.EMPTY_MESSAGE);
            return;
        }

        const host = document.createElement('div');
        host.className = 'fd-figure-tile';
        content.replaceChildren(...this._figureContent(host, fig));
        this._plotEl = host;
        this._drawn = false;

        try {
            const P = await ensurePlotly();
            // Data that changed while Plotly was loading: draw only the latest.
            if (stale()) return;
            await createChart(host, fig.traces, fig.layout || {}, { ...FIGURE_CONFIG, ...(fig.config || {}) });
            if (Array.isArray(fig.frames) && fig.frames.length && !stale()) {
                await P.addFrames(host, fig.frames);
            }
        } catch (err) {
            if (stale()) return;
            this._failed(err);
            return;
        }
        if (stale()) {
            // A newer draw or a state change has already replaced the content;
            // this figure is detached, and purging it releases its listeners.
            purge(host).catch(() => {});
            return;
        }
        this._drawn = true;
        this._figure = fig;
        this._wireClick(host);
    }

    /** Plotly's click, reduced to the point's own `customdata`. A pie's point
     *  carries its slice index as `pointNumber` (older builds: `pointIndex`),
     *  and its `customdata` is read off the trace by that index. */
    _wireClick(host) {
        if (typeof host.on !== 'function') return;
        host.on('plotly_click', (ev) => {
            const point = ev?.points?.[0];
            if (!point || typeof this.onPointClick !== 'function') return;
            const trace = point.data || {};
            let customdata = point.customdata;
            if (trace.type === 'pie' || customdata === undefined) {
                const i = point.pointNumber ?? point.pointIndex;
                if (Array.isArray(trace.customdata) && i != null) customdata = trace.customdata[i];
            }
            try {
                this.onPointClick({ customdata, point, tile: this });
            } catch (err) {
                console.error(`[${this.constructor.name}] onPointClick threw:`, err);
            }
        });
    }

    async _downloadPng() {
        if (!this._plotEl || !this._drawn) return;
        try {
            const P = await ensurePlotly();
            const uri = await P.toImage(this._plotEl, { format: 'png', scale: 2 });
            const filename = `${slug(this.config.title || this.constructor.TITLE)}.png`;
            // The native Save dialog when the host has one (a desktop window).
            // `saveFile` answers null when there is no dialog behind it, which
            // means "download it yourself", not a failed save.
            const dialogs = this.host?.dialogs;
            const result = dialogs
                ? await dialogs.saveFile({ data: uri.split(',')[1], filename, kind: 'png' })
                : null;
            if (result) {
                if (result.ok) this._notify('Download', `Chart saved to ${result.path}`, 'success');
                else if (!result.cancelled) this._notify('Download failed', result.error || 'The image could not be saved', 'error');
                return;
            }
            const a = document.createElement('a');
            a.href = uri;
            a.download = filename;
            a.click();
        } catch (err) {
            this._notify('Download failed', `The image could not be made: ${err?.message || err}`, 'error');
        }
    }

    _failed(err) {
        if (this._disposed) return;
        this.showError(`This chart could not be drawn: ${err?.message || err}`);
        this.eventBus?.emit?.('tile:render-failed', {
            tileId: this.id,
            message: err?.message || String(err),
        });
    }
}

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
}

export default FigureTile;
