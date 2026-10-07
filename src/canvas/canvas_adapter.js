/**
 * The canvas kernel — BASE LAYER (36 §4.2).
 *
 * Pan, zoom, rubber-band selection, grid snap, viewport events and
 * `clientToCanvas`. Nothing here knows what a node IS: a schema diagram, a
 * flow editor and a forms designer can all stand on it, and a forms designer
 * would use ONLY this layer, with no ports and no edges. That is the test of
 * whether the split is real.
 *
 * Moved into FlexDesk with its behaviour intact; only the class names changed
 * (`twm-canvas`, `twm-canvas__surface`, `__edges`, `__nodes`, `__marquee`), and
 * the one question it asks about the embedder's elements — "is this press on a
 * node?" — no longer names the embedder's class: a node is anything the
 * embedder put in `nodeLayer` (or what `nodeSelector` names, when given).
 *
 * KNOWN GAP, recorded rather than discovered in an accessibility review:
 * everything here is `mousedown`/`pointerdown` with button checks. There is no
 * touch support and no keyboard navigation of the graph; an editor on top of
 * it supplies its own (the canvas editor's nodes are focusable).
 */

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

/** A brighter rule every N cells, so distance across the surface is readable
 *  without counting identical lines. */
const COARSE_GRID_EVERY = 5;

/**
 * Below this many screen pixels, `bringIntoView` does not move at all.
 *
 * A pan nobody can see is not a pan, and this method's contract is that it
 * moves only when it must — so half a pixel is on the "must not" side of it by
 * definition, not by rounding policy.
 *
 * It is also insurance on the one arithmetic that could break that contract:
 * the shift lands the near edge ON the padding, and `edge * scale + translate`
 * recomputed from the new translate need not come back exactly equal to it. An
 * ulp the wrong way would make the next identical request pan again — moving
 * the diagram by a ten-thousandth of a pixel and scheduling a layout save for
 * it. Excluded because excluding it costs one comparison.
 */
const SUB_PIXEL = 0.5;

export class CanvasAdapter {
    /**
     * @param {object} o
     * @param {HTMLElement} o.container        the box the canvas fills (it needs a height)
     * @param {number} [o.gridSize]           the snap grid, in canvas pixels; 0 = no snap
     * @param {(viewport) => void} [o.onViewportChange]  after every pan and zoom — and once,
     *        synchronously, from this constructor
     * @param {(event: MouseEvent) => void} [o.onBackgroundMenu]  a right-CLICK on the empty surface
     * @param {string|null} [o.nodeSelector]  what a node is, when it is not simply "an element of
     *        `nodeLayer`"; a press inside one is the embedder's, never a pan or a marquee
     */
    constructor({ container, gridSize = 16, onViewportChange, onBackgroundMenu, nodeSelector = null } = {}) {
        this.container = container;
        this.gridSize = gridSize;
        this.onViewportChange = onViewportChange;
        /**
         * A RIGHT-CLICK ON THE EMPTY SURFACE, handed on rather than swallowed.
         *
         * The listener below has always suppressed the browser's menu on the
         * background, and the argument for that is written where it happens:
         * the background is where this class claims the right button, so a
         * press there is a gesture and a gesture does not open a menu. What it
         * could not do was let the embedder put something in its place —
         * `contextmenu` never left this class, so an embedder wanting a canvas
         * menu had to bind its own listener and then race this one for the
         * right-drag flag, which `consumeRightDrag` clears as it reads. Whoever
         * lost the race opened a menu at the end of a pan.
         *
         * So the decision stays here, where the flag is, and the CONTENT of the
         * menu goes to the embedder. Omitted, nothing changes: the event is
         * suppressed and no menu appears. The kernel still knows nothing about
         * what a node or a command is.
         */
        this.onBackgroundMenu = onBackgroundMenu;
        this.nodeSelector = nodeSelector;
        this.scale = 1;
        this.tx = 0;
        this.ty = 0;
        this.selection = new Set();

        this.root = document.createElement('div');
        this.root.className = 'twm-canvas';
        this.root.tabIndex = 0;

        this.surface = document.createElement('div');
        this.surface.className = 'twm-canvas__surface';

        this.edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.edgeLayer.setAttribute('class', 'twm-canvas__edges');
        this.edgeLayer.setAttribute('overflow', 'visible');

        this.nodeLayer = document.createElement('div');
        this.nodeLayer.className = 'twm-canvas__nodes';

        this.marquee = document.createElement('div');
        this.marquee.className = 'twm-canvas__marquee';
        this.marquee.hidden = true;

        this.surface.append(this.edgeLayer, this.nodeLayer);
        this.root.append(this.surface, this.marquee);
        container.appendChild(this.root);

        this._bind();
        this._apply();
    }

    // ── coordinates ─────────────────────────────────────────────────────
    /** Client (screen) point -> canvas point. */
    clientToCanvas(clientX, clientY) {
        const box = this.root.getBoundingClientRect();
        return {
            x: (clientX - box.left - this.tx) / this.scale,
            y: (clientY - box.top - this.ty) / this.scale,
        };
    }

    canvasToClient(x, y) {
        const box = this.root.getBoundingClientRect();
        return {
            x: x * this.scale + this.tx + box.left,
            y: y * this.scale + this.ty + box.top,
        };
    }

    snap(value) {
        return this.gridSize ? Math.round(value / this.gridSize) * this.gridSize : value;
    }

    // ── viewport ────────────────────────────────────────────────────────
    setViewport({ scale, tx, ty }) {
        if (scale !== undefined) this.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
        if (tx !== undefined) this.tx = tx;
        if (ty !== undefined) this.ty = ty;
        this._apply();
    }

    viewport() {
        return { scale: this.scale, tx: this.tx, ty: this.ty };
    }

    /**
     * Did the right button just PAN rather than click — and clear the answer.
     *
     * Right-drag pans (see `_bind`), so the `contextmenu` that arrives when the
     * button comes back up is the tail of a gesture, not a request for a menu.
     * The kernel's own root listener has always known this. Nothing else could
     * ask, and everything else needs to: a `contextmenu` handler on a node or an
     * edge is on the TARGET, and target-phase listeners run before the root's,
     * so an embedder that opens a menu opens it at the end of every pan that
     * happens to finish over one of its elements.
     *
     * CONSUMING, not peeking, and that is the whole design. An embedder's
     * element handler will often call `stopPropagation()` — deliberately, so one
     * press never opens two menus — which means the root listener below may
     * never run to do the clearing. A plain getter would therefore leave the
     * flag `true` and suppress the NEXT right-click, turning one wrong menu into
     * a menu that has stopped working. Whoever reads it first clears it; nobody
     * sees it twice; there is no ordering left to get wrong.
     *
     * An embedder that consumes a `true` should still `preventDefault()` and
     * show nothing — suppressing the browser's menu is the root listener's job
     * and it has just been cut out of the loop.
     */
    consumeRightDrag() {
        const dragged = this._rightDragged;
        this._rightDragged = false;
        return dragged;
    }

    zoomAt(clientX, clientY, factor) {
        const before = this.clientToCanvas(clientX, clientY);
        this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
        const after = this.clientToCanvas(clientX, clientY);
        // Keep the point under the cursor fixed: pan by the difference the zoom
        // introduced. Zooming to the centre instead makes a large graph
        // impossible to navigate.
        this.tx += (after.x - before.x) * this.scale;
        this.ty += (after.y - before.y) * this.scale;
        this._apply();
    }

    fit(bounds, { padding = 60 } = {}) {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const box = this.root.getBoundingClientRect();
        const scale = clamp(
            Math.min((box.width - padding * 2) / bounds.width,
                     (box.height - padding * 2) / bounds.height),
            MIN_SCALE, MAX_SCALE);
        this.scale = scale;
        this.tx = (box.width - bounds.width * scale) / 2 - bounds.x * scale;
        this.ty = (box.height - bounds.height * scale) / 2 - bounds.y * scale;
        this._apply();
    }

    /** What is on screen, in CANVAS coordinates. The inverse of the transform
     *  `_apply` writes, and the only honest way for an embedder to ask "is this
     *  already visible" without duplicating the arithmetic. */
    visibleBox() {
        const view = this.root.getBoundingClientRect();
        return {
            x: -this.tx / this.scale,
            y: -this.ty / this.scale,
            width: view.width / this.scale,
            height: view.height / this.scale,
        };
    }

    /** Is all of `box` (canvas coordinates) inside the viewport, with `padding`
     *  screen pixels to spare on every side? */
    contains(box, { padding = 0 } = {}) {
        if (!box) return false;
        const view = this.root.getBoundingClientRect();
        // The same tolerance `bringIntoView` refuses to move for: a box it has
        // just brought in must not then be reported as still outside.
        return box.x * this.scale + this.tx >= padding - SUB_PIXEL
            && box.y * this.scale + this.ty >= padding - SUB_PIXEL
            && (box.x + box.width) * this.scale + this.tx <= view.width - padding + SUB_PIXEL
            && (box.y + box.height) * this.scale + this.ty <= view.height - padding + SUB_PIXEL;
    }

    /**
     * PAN — AND ONLY PAN — UNTIL `box` IS IN VIEW. `this.scale` is never read
     * for a decision and never written.
     *
     * `fit` is the other way to put something on screen and it is a DIFFERENT
     * gesture: it derives a scale from the box and applies it, up to the 4×
     * ceiling. So "take me to this node" arrived as a zoom in until one node
     * filled the pane, and "take me to this line" as whatever scale happened to
     * frame two boxes — in either direction. The reader's complaint was *"do not
     * zoom in, just move viewport if required"*, and it is two complaints, not
     * one:
     *
     *   * THE SCALE IS THE USER'S. They set it by scrolling; nothing that is
     *     merely navigation may overwrite it. Zooming OUT "to help" fit a wide
     *     pair breaks the same rule as zooming in.
     *   * ALREADY VISIBLE MEANS NOTHING HAPPENS. `fit` centres unconditionally,
     *     so asking for a node you are already looking at slid the whole drawing
     *     under the cursor. A pan that was not required is not a smaller version
     *     of the right behaviour; it is the wrong one. Hence the first branch of
     *     `_panShift`, and hence `_apply()` below is not called at all when both
     *     deltas are zero — no transform is rewritten, no `onViewportChange`
     *     fires, and so no layout save is scheduled.
     *
     * Otherwise the move is the MINIMUM that brings the box inside: the near
     * edge lands on the padding and the far edge is left wherever it falls.
     * Centring would travel further for no gain.
     *
     * ── WHEN THE BOX IS BIGGER THAN THE WINDOW AT THIS SCALE ──
     *
     * It cannot be brought in, and zooming out is exactly what the rule
     * forbids, so `fallback` names a smaller box worth preferring — for a line,
     * the end nearest what is already on screen. Per axis and independently,
     * because two nodes side by side are usually too wide and perfectly fine
     * vertically. With no fallback (or one that is itself oversized) the rule is
     * "fill the window with as much of it as possible": if the window already
     * lies entirely within the box, nothing can be gained by moving and nothing
     * moves; otherwise the box is pulled across until the dead space on one
     * side is gone.
     *
     * @param {{x, y, width, height}} box — canvas coordinates.
     * @param {{padding?: number, fallback?: object}} [options]
     * @returns {{moved: boolean, contained: boolean}} `contained` reports
     *          whether ALL of `box` ended up on screen, so a caller can say why
     *          half of what it named is still not visible rather than leaving
     *          the user to conclude the click failed.
     */
    bringIntoView(box, { padding = 40, fallback = null } = {}) {
        if (!box || box.width < 0 || box.height < 0) {
            return { moved: false, contained: false };
        }
        const view = this.root.getBoundingClientRect();
        const dx = ignoreSubPixel(
            this._panShift(box.x, box.width, view.width, this.tx, padding,
                           fallback && { start: fallback.x, size: fallback.width }));
        const dy = ignoreSubPixel(
            this._panShift(box.y, box.height, view.height, this.ty, padding,
                           fallback && { start: fallback.y, size: fallback.height }));
        const moved = dx !== 0 || dy !== 0;
        if (moved) {
            this.tx += dx;
            this.ty += dy;
            this._apply();
        }
        return { moved, contained: this.contains(box) };
    }

    /**
     * One axis of `bringIntoView`, in SCREEN pixels: how far the translate has
     * to move. Positive is right/down. Returns 0 for "already in view", which is
     * the branch the whole method exists for.
     */
    _panShift(start, size, viewportSize, translate, padding, fallback) {
        // A padding wider than half the window would put the two limits the
        // wrong way round and turn every case below into nonsense. A pane can be
        // that narrow while it is being dragged.
        const pad = Math.min(padding, Math.max(0, (viewportSize - 1) / 2));
        const low = pad;
        const high = viewportSize - pad;
        const near = start * this.scale + translate;
        const far = (start + size) * this.scale + translate;
        if (near >= low && far <= high) return 0;               // nothing to do
        if (far - near <= high - low) {                         // it fits: minimum move
            return near < low ? low - near : high - far;
        }
        if (fallback) {
            return this._panShift(fallback.start, fallback.size, viewportSize,
                                  translate, padding, null);
        }
        if (near <= low && far >= high) return 0;               // the window is full of it
        return near > low ? low - near : high - far;
    }

    _apply() {
        this.surface.style.transform =
            `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
        // SEVEN background layers, in the order `.twm-canvas` declares them:
        // grain, lighting, coarse grid ×2, fine grid ×2, ground. Only the four
        // GRID layers follow the pan and the zoom — the grain is a material and
        // the lighting belongs to the window, and zooming either makes the
        // surface swim under the content instead of sitting behind it.
        //
        // The list length MUST match the stylesheet. A short list makes the
        // browser cycle it, so layer 5 silently takes layer 1's size. An
        // embedder that restyles the ground keeps seven layers, in this order.
        const fine = this.gridSize * this.scale;
        const coarse = fine * COARSE_GRID_EVERY;
        this.root.style.backgroundSize = [
            '160px 160px',                // grain — its own fixed scale
            'auto',                       // lighting — fills the element
            `${coarse}px ${coarse}px`,
            `${coarse}px ${coarse}px`,
            `${fine}px ${fine}px`,
            `${fine}px ${fine}px`,
            'auto',                       // the ground
        ].join(', ');
        const offset = `${this.tx}px ${this.ty}px`;
        this.root.style.backgroundPosition =
            ['0 0', '0 0', offset, offset, offset, offset, '0 0'].join(', ');
        this.onViewportChange?.(this.viewport());
    }

    /**
     * Is `target` inside one of the embedder's nodes? A node is whatever the
     * embedder put in the node layer — or, with `nodeSelector`, what that
     * selector names. A press there belongs to the embedder: it starts no pan
     * and no marquee, and its right-click keeps whatever menu the embedder (or,
     * failing that, the browser) gives it.
     */
    _onNode(target) {
        if (!target || typeof target.closest !== 'function') return false;
        if (this.nodeSelector) return Boolean(target.closest(this.nodeSelector));
        return target !== this.nodeLayer && this.nodeLayer.contains(target);
    }

    // ── input ───────────────────────────────────────────────────────────
    _bind() {
        this.root.addEventListener('wheel', (event) => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
            } else {
                this.tx -= event.deltaX;
                this.ty -= event.deltaY;
                this._apply();
            }
        }, { passive: false });

        // RIGHT-DRAG PANS, and the browser menu gets out of the way for it.
        //
        // Middle-drag is the canonical pan and most mice have the button; a
        // laptop trackpad does not, and Shift+drag is a chord you have to be
        // told about. Right-drag is what every map and every node editor does,
        // and it costs one `contextmenu` handler.
        //
        // ── AND THE BACKGROUND EATS THE MENU WHETHER OR NOT IT MOVED ──
        //
        // "Right-click on the canvas if nothing is behind should be blocked."
        // It was not: nothing on the empty surface calls `preventDefault`, so a
        // right-click there produced the BROWSER's menu — Back, Reload, Save as,
        // Inspect — over the drawing. Suppressing only after a drag made that
        // worse rather than better, because whether you got a browser menu at
        // the end of a pan then depended on having moved more than three pixels.
        //
        // THE RULE IS "SUPPRESS EXACTLY WHERE THIS CLASS CLAIMS THE RIGHT
        // BUTTON", and that is the same test `pointerdown` below already makes:
        // it bails out inside a node and pans everywhere else. So the background
        // is ours — right-press there is a gesture, and a gesture does not hand
        // the browser a menu — while a node is the embedder's, and one that has
        // no menu of its own KEEPS THE BROWSER'S. Taking a working menu away to
        // put nothing in its place is a loss, unless the press was already
        // spoken for.
        //
        // `rightDragged` still has to be consulted first. A pan that ends over a
        // node dispatches `contextmenu` with that node as the target on the
        // platforms that fire it on release, and the menu must not come back
        // just because the pointer finished somewhere else.
        //
        // Nothing is shown in the menu's place. An empty menu is worse than
        // none: it reads as a feature that has broken rather than as a surface
        // that has no commands.
        //
        // ── AND THE GUARD HAS TO BE REACHABLE FROM AN ELEMENT HANDLER ──
        //
        // A `contextmenu` listener bound to a NODE or an EDGE is on the target,
        // and target-phase listeners run BEFORE the ones bubbling to the root.
        // So an embedder's menu is already on screen by the time root gets to
        // consult the flag — and if that handler calls `stopPropagation()` root
        // never runs AT ALL, which leaves the flag stuck `true` and poisons the
        // NEXT right-click as well. Hence instance state with a CONSUMING reader
        // (`consumeRightDrag`): whichever handler reaches it first gets the
        // answer, and no second handler can see a stale `true`.
        this._rightDragged = false;
        this.root.addEventListener('contextmenu', (event) => {
            const afterDrag = this.consumeRightDrag();
            if (!afterDrag && this._onNode(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            // ONLY A CLICK, NEVER THE TAIL OF A PAN — the same test the two
            // lines above make, read once.
            if (!afterDrag) this.onBackgroundMenu?.(event);
        });

        this.root.addEventListener('pointerdown', (event) => {
            // ── THE RESET IS ABOVE THE NODE BAIL, AND THAT ORDER IS THE FIX ──
            //
            // A NEW PRESS MEANS THE LAST GESTURE IS OVER, wherever it landed.
            // Below the bail, a press inside a node would return before reaching
            // it — and once the flag is readable from a target handler, that
            // turns a dead bit into a swallowed menu. Two gestures reach it:
            //
            //   THE MENU IS NOT ALWAYS OURS TO CONSUME. An embedder's toolbar
            //   and side panels are siblings of the canvas, not descendants of
            //   `root`. Right-press the background, drag, release over one:
            //   `contextmenu` fires there, no listener of ours runs, and the
            //   flag stays armed.
            //
            //   AND ON WINDOWS/X11 `contextmenu` FIRES AT THE PRESS, not the
            //   release. So the only menu event of a right-drag pan has already
            //   been and gone — with the flag still false — by the time the drag
            //   sets it. Every pan on those platforms ends armed.
            //
            // Either way the next right-click on a node was eaten: its handler
            // consumed a `true` left over from a gesture that ended somewhere
            // else, suppressed the browser's menu and showed nothing.
            //
            // Clearing in `onUp` instead would be wrong, and quietly: on the
            // release-order platforms `contextmenu` arrives AFTER `pointerup`,
            // so the guard would be gone before the event it exists for.
            this._rightDragged = false;
            if (this._onNode(event.target)) return;
            // Middle button, right button or Shift-drag pans; left button
            // rubber-bands.
            const panning = event.button === 1 || event.button === 2 || event.shiftKey;
            const start = { x: event.clientX, y: event.clientY, tx: this.tx, ty: this.ty };
            const origin = this.clientToCanvas(event.clientX, event.clientY);

            if (!panning) {
                this.marquee.hidden = false;
                this.selection.clear();
                this.onSelectionChange?.(this.selection);
            }

            const onMove = (move) => {
                if (panning) {
                    // A few pixels of slop, so a right-click with a shaky hand
                    // is still a click and still gets its menu.
                    if (event.button === 2
                        && (Math.abs(move.clientX - start.x) > 3
                         || Math.abs(move.clientY - start.y) > 3)) {
                        this._rightDragged = true;
                    }
                    this.tx = start.tx + (move.clientX - start.x);
                    this.ty = start.ty + (move.clientY - start.y);
                    this._apply();
                    return;
                }
                const current = this.clientToCanvas(move.clientX, move.clientY);
                const box = {
                    x: Math.min(origin.x, current.x),
                    y: Math.min(origin.y, current.y),
                    width: Math.abs(current.x - origin.x),
                    height: Math.abs(current.y - origin.y),
                };
                const topLeft = this.canvasToClient(box.x, box.y);
                const root = this.root.getBoundingClientRect();
                this.marquee.style.left = `${topLeft.x - root.left}px`;
                this.marquee.style.top = `${topLeft.y - root.top}px`;
                this.marquee.style.width = `${box.width * this.scale}px`;
                this.marquee.style.height = `${box.height * this.scale}px`;
                this.onMarquee?.(box);
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                this.marquee.hidden = true;
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    clear() {
        this.nodeLayer.replaceChildren();
        this.edgeLayer.replaceChildren();
    }

    destroy() {
        this.root.remove();
    }
}

function clamp(value, low, high) {
    return Math.max(low, Math.min(value, high));
}

/** A pan nobody could see is not a pan. See `SUB_PIXEL`. */
function ignoreSubPixel(shift) {
    return Math.abs(shift) < SUB_PIXEL ? 0 : shift;
}
