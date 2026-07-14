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
        this.#headerIcon.className = 'material-symbols-outlined';

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

    /** Pin the panel to the right edge of its host's *visible* frame
     *  using `position: fixed`. Re-run on every scroll/resize so the
     *  panel always overlays the host correctly even when the host
     *  itself sits inside a scrolled ancestor. */
    #trackGeometry = () => {
        if (!this.#open || !this.#panel || !this.#container) return;
        const r = this.#container.getBoundingClientRect();
        const s = this.#panel.style;
        s.position = 'fixed';
        s.top      = `${Math.round(r.top)}px`;
        s.left     = `${Math.round(r.right - this.#width)}px`;
        s.right    = 'auto';
        s.height   = `${Math.round(r.height)}px`;
    };
}
