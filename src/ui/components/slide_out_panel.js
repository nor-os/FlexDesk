/**
 * SlideOutPanel
 *
 * Reusable inline slide-out config panel that overlays its host container
 * from the right edge. Used by pages to show element-specific config
 * (plot config, widget config, ETL node config) without the global right panel.
 *
 * Host container must have `position: relative; overflow: hidden`.
 */
import { ComponentBase } from '../base/component_base.js';

export class SlideOutPanel extends ComponentBase {

    /** @type {HTMLElement} */  #container = null;
    /** @type {HTMLElement} */  #backdrop = null;
    /** @type {HTMLElement} */  #panel = null;
    /** @type {HTMLElement} */  #headerIcon = null;
    /** @type {HTMLElement} */  #headerTitle = null;
    /** @type {HTMLElement} */  #body = null;
    /** @type {number} */       #width;
    /** @type {Function|null} */#onClose;
    /** @type {boolean} */      #open = false;
    /** @type {ResizeObserver|null} */ #hostObserver = null;

    /**
     * @param {object}   opts
     * @param {number}   [opts.width=380]  Panel width in px.
     * @param {Function} [opts.onClose]    Called after the panel closes.
     */
    constructor({ width = 700, onClose } = {}) {
        super();
        this.#width = width;
        this.#onClose = onClose ?? null;
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Mount the panel DOM into a host container.
     * @param {HTMLElement} container  Must have position:relative; overflow:hidden.
     */
    mount(container) {
        if (this._mounted) return;
        this.#container = container;

        // Backdrop (transparent click-catcher)
        this.#backdrop = document.createElement('div');
        this.#backdrop.className = 'twm-slide-out-panel__backdrop';
        this.#backdrop.addEventListener('click', this.#handleBackdropClick);

        // Panel
        this.#panel = document.createElement('div');
        this.#panel.className = 'twm-slide-out-panel';
        this.#panel.style.width = `${this.#width}px`;

        // Header
        const header = document.createElement('div');
        header.className = 'twm-slide-out-panel__header';

        this.#headerIcon = document.createElement('span');
        this.#headerIcon.className = 'twm-slide-out-panel__icon material-symbols-outlined';

        this.#headerTitle = document.createElement('span');
        this.#headerTitle.className = 'twm-slide-out-panel__title';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'twm-slide-out-panel__close twm-btn-icon';
        closeBtn.type = 'button';
        closeBtn.title = 'Close';
        closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        closeBtn.addEventListener('click', this.#handleCloseClick);

        header.append(this.#headerIcon, this.#headerTitle, closeBtn);

        // Body (scrollable content area)
        this.#body = document.createElement('div');
        this.#body.className = 'twm-slide-out-panel__body';

        this.#panel.append(header, this.#body);
        this.#container.append(this.#backdrop, this.#panel);

        this._mounted = true;
    }

    dispose() {
        this.close();
        this.#backdrop?.remove();
        this.#panel?.remove();
        this.#backdrop = null;
        this.#panel = null;
        this.#body = null;
        this.#container = null;
        super.dispose();
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** The inner content element — callers render config into this. */
    get contentEl() { return this.#body; }

    get isOpen() { return this.#open; }

    /**
     * Open (or re-open) the panel with a new title/icon.
     * Clears previous content. Returns contentEl for rendering.
     * @param {string} title
     * @param {string} icon  Material Symbols icon name.
     * @returns {HTMLElement} contentEl
     */
    open(title, icon) {
        if (!this._mounted) return null;

        this.#body.innerHTML = '';
        this.#headerIcon.textContent = icon || '';
        this.#headerIcon.style.display = icon ? '' : 'none';
        this.#headerTitle.textContent = title || '';

        if (!this.#open) {
            this.#open = true;
            this.#backdrop.classList.add('twm-slide-out-panel__backdrop--visible');
            this.#panel.classList.add('twm-slide-out-panel--open');
            document.addEventListener('keydown', this.#handleEsc);

            // The host may be a scroll container — absolutely-positioned
            // descendants of one DO scroll along with the content
            // (Web spec: a position:absolute element is clipped + offset
            // by its containing scroll context). We escape that by
            // switching the panel to `position: fixed` while open and
            // tracking the host's bounding rect on scroll / resize, so
            // the panel stays pinned to the host's visible frame at
            // full height regardless of how the user scrolls inside.
            this.#trackGeometry();
            window.addEventListener('scroll', this.#trackGeometry, true);
            window.addEventListener('resize', this.#trackGeometry);
            this.#observeHost();
        }

        return this.#body;
    }

    /** Close the panel and clear content. */
    close() {
        if (!this.#open) return;
        this.#open = false;

        this.#panel.classList.remove('twm-slide-out-panel--open');
        this.#backdrop.classList.remove('twm-slide-out-panel__backdrop--visible');
        document.removeEventListener('keydown', this.#handleEsc);
        window.removeEventListener('scroll', this.#trackGeometry, true);
        window.removeEventListener('resize', this.#trackGeometry);
        this.#hostObserver?.disconnect();
        this.#hostObserver = null;
        // Leave the inline position:fixed geometry in place. The panel
        // slides off-screen via the transform animation (translateX
        // 100%); the next open() re-runs #trackGeometry which will
        // refresh top/left/height from the host's current rect.

        this.#body.innerHTML = '';
        this.#onClose?.();
    }

    // ─── Event handlers (arrow fns for stable `this`) ───────────────────────

    #handleBackdropClick = () => { this.close(); };

    #handleCloseClick = () => { this.close(); };

    #handleEsc = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.close();
        }
    };

    /** The host moves or resizes without any window event when a tile
     *  splitter is dragged or a dock panel toggles, and the fixed geometry
     *  would then stay at the old coordinates. Observe the host AND each
     *  ancestor: a host can move without changing size of its own (a dock
     *  panel toggling beside a fixed-width tile shrinks the content area,
     *  an ancestor, and the tile only shifts). The callback runs
     *  synchronously, after layout and before paint, so the panel follows
     *  a drag without a frame of lag; it only writes the panel's own
     *  `position: fixed` geometry, which is out of flow and resizes
     *  nothing observed, so it cannot loop. */
    #observeHost() {
        this.#hostObserver = new ResizeObserver(this.#trackGeometry);
        for (let el = this.#container; el; el = el.parentElement) {
            this.#hostObserver.observe(el);
        }
    }

    /** Pin the panel to the right edge of its host's *visible* frame
     *  using `position: fixed`. Re-run on every window scroll/resize and
     *  every host resize (#observeHost) so the panel always overlays the
     *  host correctly even when the host itself sits inside a scrolled
     *  ancestor.
     *
     *  UNDER A CSS `zoom` (the shell's content zoom scales a tile body),
     *  `getBoundingClientRect()` answers in screen pixels, which already
     *  carry the zoom, while the panel's own `top`/`left`/`height` are
     *  CSS pixels that the same zoom multiplies again. Copied across
     *  unchanged, every length was scaled twice: at 150% the panel landed
     *  right of and below its host, at 50% it was half the host's height.
     *  So the rect is divided by the panel's effective zoom
     *  (`currentCSSZoom`: 1 when nothing above it zooms, `undefined` in an
     *  engine that predates it), and the width subtracted is the panel's
     *  laid-out one, which `min-width` may hold above the requested
     *  width. Rounding happens in screen pixels, so at 100% the output is
     *  exactly what it always was.
     *
     *  NEVER WIDER THAN THE HOST (BUG-0035). The right edge is pinned, so a
     *  panel wider than its host (700px by default, `min-width: 400px`)
     *  reached past the host's left edge across the neighbouring pane. The
     *  host's width, in the panel's CSS pixels, goes on the panel as
     *  `--twm-slide-out-host-w`, which the stylesheet uses as `max-width`
     *  and as the ceiling of the 400px `min-width`; it is set BEFORE the
     *  width is read so the read sees the capped layout, and the width is
     *  capped here too for an engine that lays nothing out. */
    #trackGeometry = () => {
        if (!this.#open || !this.#panel || !this.#container) return;
        const r = this.#container.getBoundingClientRect();
        const zoom = this.#panel.currentCSSZoom || 1;
        const hostWidth = r.width / zoom;
        const s = this.#panel.style;
        s.setProperty('--twm-slide-out-host-w', `${hostWidth}px`);
        const width = Math.min(this.#panel.offsetWidth || this.#width, hostWidth);
        s.position = 'fixed';
        s.top      = `${Math.round(r.top) / zoom}px`;
        s.left     = `${Math.round(r.right - width * zoom) / zoom}px`;
        s.right    = 'auto';
        s.height   = `${Math.round(r.height) / zoom}px`;
    };
}
