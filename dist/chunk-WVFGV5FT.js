// src/ui/components/drag_reorder.js
var DragReorder = class {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container
   * @param {string}  [opts.itemSelector='.tab']  selector for reorderable items
   * @param {string}  [opts.keyAttr='path']       dataset key / data-attr identifying an item
   * @param {'x'|'y'} [opts.axis='x']
   * @param {string}  [opts.indicatorClass='tab-drop-indicator']
   * @param {boolean} [opts.autoScroll=true]
   * @param {(e: DragEvent, item: HTMLElement) => boolean} [opts.draggableGuard]
   *        return false to cancel a drag start (e.g. from a close button)
   * @param {(e: DragEvent, key: string, item: HTMLElement) => void} [opts.onDragStart]
   *        host hook to augment dataTransfer (e.g. add a cross-pane MIME)
   * @param {(order: string[]) => void} [opts.onReorder]
   */
  constructor(opts = {}) {
    this.container = opts.container || null;
    this.itemSelector = opts.itemSelector || ".tab";
    this.keyAttr = opts.keyAttr || "path";
    this.axis = opts.axis === "y" ? "y" : "x";
    this.indicatorClass = opts.indicatorClass || "twm-tab-drop-indicator";
    this.autoScroll = opts.autoScroll !== false;
    this.draggableGuard = opts.draggableGuard || null;
    this.onDragStart = opts.onDragStart || null;
    this.onReorder = opts.onReorder || null;
    this._draggingEl = null;
    this._indicatorEl = null;
    this._lastSnapshot = [];
    this._onOver = this._onOver.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onLeave = this._onLeave.bind(this);
    if (this.container) {
      this.container.addEventListener("dragover", this._onOver);
      this.container.addEventListener("drop", this._onDrop);
      this.container.addEventListener("dragleave", this._onLeave);
    }
  }
  /** Mark current items draggable + wire dragstart/dragend. Idempotent —
   *  call after every (re)render; already-wired items are skipped. */
  attach() {
    if (!this.container) return;
    for (const item of this.container.querySelectorAll(this.itemSelector)) {
      if (item.__dragReorder) continue;
      item.__dragReorder = true;
      item.setAttribute("draggable", "true");
      item.addEventListener("dragstart", (e) => this._start(e, item));
      item.addEventListener("dragend", () => this._end());
    }
  }
  /** True while this instance is mid-drag. */
  isActive() {
    return !!this._draggingEl;
  }
  destroy() {
    if (this.container) {
      this.container.removeEventListener("dragover", this._onOver);
      this.container.removeEventListener("drop", this._onDrop);
      this.container.removeEventListener("dragleave", this._onLeave);
    }
    this._removeIndicator();
    this._draggingEl = null;
  }
  // ── internals ───────────────────────────────────────────────────
  _key(el) {
    if (!el) return null;
    return el.dataset?.[this.keyAttr] ?? el.getAttribute?.(`data-${this.keyAttr}`) ?? null;
  }
  _items() {
    return Array.from(this.container.querySelectorAll(this.itemSelector));
  }
  _snapshot() {
    return this._items().map((el) => this._key(el)).filter((k) => k != null);
  }
  _centerOf(rect) {
    return this.axis === "y" ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
  }
  _start(e, item) {
    if (this.draggableGuard && !this.draggableGuard(e, item)) {
      e.preventDefault();
      return;
    }
    const key = this._key(item);
    this._draggingEl = item;
    this._lastSnapshot = this._snapshot();
    item.classList.add("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      if (key != null) e.dataTransfer.setData("text/plain", String(key));
    } catch {
    }
    this.onDragStart?.(e, key, item);
    this._ensureIndicator();
    this._positionByNearest(this._centerOf(item.getBoundingClientRect()));
  }
  _end() {
    if (!this._draggingEl) return;
    this._draggingEl.classList.remove("dragging");
    this._draggingEl = null;
    this._removeIndicator();
    this._commitIfChanged();
  }
  _onOver(e) {
    if (!this._draggingEl) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {
    }
    const coord = this.axis === "y" ? e.clientY : e.clientX;
    this._positionByNearest(coord);
    if (this.autoScroll) this._autoScrollEdge(coord);
  }
  _onDrop(e) {
    if (!this._draggingEl) return;
    e.preventDefault();
    const indicator = this._ensureIndicator();
    if (indicator?.parentElement) {
      this.container.insertBefore(this._draggingEl, indicator);
    }
    this._finalize();
  }
  _onLeave(e) {
    if (!this._draggingEl) return;
    if (e.currentTarget !== this.container) return;
    if (this.container.contains(e.relatedTarget)) return;
    this._finalize();
  }
  _finalize() {
    if (this._draggingEl) this._draggingEl.classList.remove("dragging");
    this._removeIndicator();
    this._draggingEl = null;
    this._commitIfChanged();
  }
  _commitIfChanged() {
    const order = this._snapshot();
    if (!order.length) return;
    if (this._lastSnapshot.join("\0") === order.join("\0")) return;
    this._lastSnapshot = order;
    this.onReorder?.(order);
  }
  _ensureIndicator() {
    if (!this._indicatorEl) {
      this._indicatorEl = document.createElement("div");
      this._indicatorEl.className = this.indicatorClass;
      this._indicatorEl.setAttribute("aria-hidden", "true");
    }
    if (!this._indicatorEl.parentElement) {
      this.container.appendChild(this._indicatorEl);
    }
    return this._indicatorEl;
  }
  _removeIndicator() {
    this._indicatorEl?.remove();
  }
  _positionByNearest(coord) {
    if (!this.container || !this._indicatorEl || !this._draggingEl) return;
    const items = this._items().filter((t) => t !== this._draggingEl);
    if (!items.length) return;
    let best = null;
    let bestDist = Infinity;
    for (const it of items) {
      const center = this._centerOf(it.getBoundingClientRect());
      const dist = Math.abs(coord - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = { it, center };
      }
    }
    if (!best) return;
    const after = coord >= best.center;
    const ref = after ? best.it.nextElementSibling : best.it;
    this.container.insertBefore(this._indicatorEl, ref || null);
  }
  _autoScrollEdge(coord) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const edge = 24;
    const step = 16;
    if (this.axis === "y") {
      if (coord - rect.top < edge) {
        this.container.scrollTop = Math.max(0, this.container.scrollTop - step);
      } else if (rect.bottom - coord < edge) {
        this.container.scrollTop = Math.min(
          this.container.scrollHeight,
          this.container.scrollTop + step
        );
      }
    } else {
      if (coord - rect.left < edge) {
        this.container.scrollLeft = Math.max(0, this.container.scrollLeft - step);
      } else if (rect.right - coord < edge) {
        this.container.scrollLeft = Math.min(
          this.container.scrollWidth,
          this.container.scrollLeft + step
        );
      }
    }
  }
};

export {
  DragReorder
};
//# sourceMappingURL=chunk-WVFGV5FT.js.map
