/**
 * SplitPaneContainer — horizontal split with a draggable divider.
 *
 * Manages exactly 1 or 2 child panes. When only one pane exists, the divider
 * is hidden and the single pane fills the container. When split, both panes
 * share space according to a ratio (default 50/50), adjustable via drag.
 *
 * Usage:
 *   const split = new SplitPaneContainer();
 *   split.mount(parentEl);
 *   split.setPanes(leftEl);             // single pane
 *   split.setPanes(leftEl, rightEl);    // split view
 *   split.setRatio(0.6);               // 60/40 split
 *   split.unsplit();                    // collapse to single pane
 */

export class SplitPaneContainer {
    /** @type {HTMLElement} */
    #container = null;

    /** @type {HTMLElement} */
    #pane1 = null;

    /** @type {HTMLElement} */
    #pane2 = null;

    /** @type {HTMLElement} */
    #divider = null;

    /** @type {number} 0..1, fraction of width for pane 1 */
    #ratio = 0.5;

    /** @type {boolean} */
    #isSplit = false;

    /** @type {Function|null} */
    #onRatioChanged = null;

    // Drag state
    #dragging = false;
    #boundOnMouseMove = null;
    #boundOnMouseUp = null;

    /**
     * @param {{ onRatioChanged?: (ratio: number) => void }} opts
     */
    constructor(opts = {}) {
        this.#onRatioChanged = opts.onRatioChanged ?? null;
    }

    get isSplit() { return this.#isSplit; }
    get ratio()   { return this.#ratio; }

    mount(container) {
        this.#container = container;
        this.#container.classList.add('split-pane-container');
        this.#container.innerHTML = '';

        // Divider
        this.#divider = document.createElement('div');
        this.#divider.className = 'split-pane-divider';
        this.#divider.addEventListener('mousedown', (e) => this.#onDividerMouseDown(e));

        this.#applyLayout();
    }

    /**
     * Set pane elements. Pass one element for single view, two for split.
     * @param {HTMLElement} pane1
     * @param {HTMLElement} [pane2]
     */
    setPanes(pane1, pane2) {
        this.#pane1 = pane1;
        this.#pane2 = pane2 ?? null;
        this.#isSplit = !!pane2;
        this.#applyLayout();
    }

    /**
     * Set the split ratio (fraction for left pane).
     * @param {number} ratio — 0.2..0.8
     */
    setRatio(ratio) {
        this.#ratio = Math.max(0.2, Math.min(0.8, ratio));
        if (this.#isSplit) this.#applySizes();
    }

    /**
     * Collapse to single pane (left). Returns the removed right pane element.
     * @returns {HTMLElement|null}
     */
    unsplit() {
        if (!this.#isSplit) return null;
        const removed = this.#pane2;
        this.#pane2 = null;
        this.#isSplit = false;
        this.#applyLayout();
        return removed;
    }

    dispose() {
        this.#stopDrag();
        this.#container = null;
        this.#pane1 = null;
        this.#pane2 = null;
        this.#divider = null;
    }

    // ─── Layout ──────────────────────────────────────────────────────────────

    #applyLayout() {
        if (!this.#container) return;
        this.#container.innerHTML = '';

        if (!this.#pane1) return;

        if (!this.#isSplit) {
            // Single pane: fills container
            this.#pane1.className = 'split-pane';
            this.#pane1.style.flex = '1 1 0';
            this.#pane1.style.minWidth = '0';
            this.#container.appendChild(this.#pane1);
            this.#container.classList.remove('split-pane-container--split');
        } else {
            // Split view
            this.#pane1.className = 'split-pane';
            this.#pane2.className = 'split-pane';
            this.#pane1.style.minWidth = '0';
            this.#pane2.style.minWidth = '0';

            this.#container.appendChild(this.#pane1);
            this.#container.appendChild(this.#divider);
            this.#container.appendChild(this.#pane2);
            this.#container.classList.add('split-pane-container--split');

            this.#applySizes();
        }
    }

    #applySizes() {
        if (!this.#pane1 || !this.#pane2) return;
        // Use flex-grow proportional to ratio
        const r = this.#ratio;
        this.#pane1.style.flex = `${r} 1 0`;
        this.#pane2.style.flex = `${1 - r} 1 0`;
    }

    // ─── Divider drag ────────────────────────────────────────────────────────

    #onDividerMouseDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        this.#dragging = true;
        this.#divider.classList.add('split-pane-divider--active');
        document.body.style.cursor = 'col-resize';

        // Prevent text selection and iframes capturing mouse
        document.body.style.userSelect = 'none';
        this.#container.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = 'none');

        this.#boundOnMouseMove = (e) => this.#onMouseMove(e);
        this.#boundOnMouseUp = () => this.#onMouseUp();
        document.addEventListener('mousemove', this.#boundOnMouseMove);
        document.addEventListener('mouseup', this.#boundOnMouseUp);
    }

    #onMouseMove(e) {
        if (!this.#dragging || !this.#container) return;
        const rect = this.#container.getBoundingClientRect();
        const dividerWidth = this.#divider.offsetWidth;
        const usable = rect.width - dividerWidth;
        if (usable <= 0) return;

        const x = e.clientX - rect.left - dividerWidth / 2;
        const ratio = Math.max(0.2, Math.min(0.8, x / usable));
        this.#ratio = ratio;
        this.#applySizes();
    }

    #onMouseUp() {
        this.#stopDrag();
        this.#onRatioChanged?.(this.#ratio);
    }

    #stopDrag() {
        if (!this.#dragging) return;
        this.#dragging = false;
        this.#divider?.classList.remove('split-pane-divider--active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.#container?.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = '');
        document.removeEventListener('mousemove', this.#boundOnMouseMove);
        document.removeEventListener('mouseup', this.#boundOnMouseUp);
        this.#boundOnMouseMove = null;
        this.#boundOnMouseUp = null;
    }
}
