// src/canvas/canvas_adapter.js
var MIN_SCALE = 0.15;
var MAX_SCALE = 4;
var COARSE_GRID_EVERY = 5;
var SUB_PIXEL = 0.5;
var CanvasAdapter = class {
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
    this.onBackgroundMenu = onBackgroundMenu;
    this.nodeSelector = nodeSelector;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.selection = /* @__PURE__ */ new Set();
    this.root = document.createElement("div");
    this.root.className = "twm-canvas";
    this.root.tabIndex = 0;
    this.surface = document.createElement("div");
    this.surface.className = "twm-canvas__surface";
    this.edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.edgeLayer.setAttribute("class", "twm-canvas__edges");
    this.edgeLayer.setAttribute("overflow", "visible");
    this.nodeLayer = document.createElement("div");
    this.nodeLayer.className = "twm-canvas__nodes";
    this.marquee = document.createElement("div");
    this.marquee.className = "twm-canvas__marquee";
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
      y: (clientY - box.top - this.ty) / this.scale
    };
  }
  canvasToClient(x, y) {
    const box = this.root.getBoundingClientRect();
    return {
      x: x * this.scale + this.tx + box.left,
      y: y * this.scale + this.ty + box.top
    };
  }
  snap(value) {
    return this.gridSize ? Math.round(value / this.gridSize) * this.gridSize : value;
  }
  // ── viewport ────────────────────────────────────────────────────────
  setViewport({ scale, tx, ty }) {
    if (scale !== void 0) this.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
    if (tx !== void 0) this.tx = tx;
    if (ty !== void 0) this.ty = ty;
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
    this.tx += (after.x - before.x) * this.scale;
    this.ty += (after.y - before.y) * this.scale;
    this._apply();
  }
  fit(bounds, { padding = 60 } = {}) {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const box = this.root.getBoundingClientRect();
    const scale = clamp(
      Math.min(
        (box.width - padding * 2) / bounds.width,
        (box.height - padding * 2) / bounds.height
      ),
      MIN_SCALE,
      MAX_SCALE
    );
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
      height: view.height / this.scale
    };
  }
  /** Is all of `box` (canvas coordinates) inside the viewport, with `padding`
   *  screen pixels to spare on every side? */
  contains(box, { padding = 0 } = {}) {
    if (!box) return false;
    const view = this.root.getBoundingClientRect();
    return box.x * this.scale + this.tx >= padding - SUB_PIXEL && box.y * this.scale + this.ty >= padding - SUB_PIXEL && (box.x + box.width) * this.scale + this.tx <= view.width - padding + SUB_PIXEL && (box.y + box.height) * this.scale + this.ty <= view.height - padding + SUB_PIXEL;
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
      this._panShift(
        box.x,
        box.width,
        view.width,
        this.tx,
        padding,
        fallback && { start: fallback.x, size: fallback.width }
      )
    );
    const dy = ignoreSubPixel(
      this._panShift(
        box.y,
        box.height,
        view.height,
        this.ty,
        padding,
        fallback && { start: fallback.y, size: fallback.height }
      )
    );
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
    const pad = Math.min(padding, Math.max(0, (viewportSize - 1) / 2));
    const low = pad;
    const high = viewportSize - pad;
    const near = start * this.scale + translate;
    const far = (start + size) * this.scale + translate;
    if (near >= low && far <= high) return 0;
    if (far - near <= high - low) {
      return near < low ? low - near : high - far;
    }
    if (fallback) {
      return this._panShift(
        fallback.start,
        fallback.size,
        viewportSize,
        translate,
        padding,
        null
      );
    }
    if (near <= low && far >= high) return 0;
    return near > low ? low - near : high - far;
  }
  _apply() {
    this.surface.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    const fine = this.gridSize * this.scale;
    const coarse = fine * COARSE_GRID_EVERY;
    this.root.style.backgroundSize = [
      "160px 160px",
      // grain — its own fixed scale
      "auto",
      // lighting — fills the element
      `${coarse}px ${coarse}px`,
      `${coarse}px ${coarse}px`,
      `${fine}px ${fine}px`,
      `${fine}px ${fine}px`,
      "auto"
      // the ground
    ].join(", ");
    const offset = `${this.tx}px ${this.ty}px`;
    this.root.style.backgroundPosition = ["0 0", "0 0", offset, offset, offset, offset, "0 0"].join(", ");
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
    if (!target || typeof target.closest !== "function") return false;
    if (this.nodeSelector) return Boolean(target.closest(this.nodeSelector));
    return target !== this.nodeLayer && this.nodeLayer.contains(target);
  }
  // ── input ───────────────────────────────────────────────────────────
  _bind() {
    this.root.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
      } else {
        this.tx -= event.deltaX;
        this.ty -= event.deltaY;
        this._apply();
      }
    }, { passive: false });
    this._rightDragged = false;
    this.root.addEventListener("contextmenu", (event) => {
      const afterDrag = this.consumeRightDrag();
      if (!afterDrag && this._onNode(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!afterDrag) this.onBackgroundMenu?.(event);
    });
    this.root.addEventListener("pointerdown", (event) => {
      this._rightDragged = false;
      if (this._onNode(event.target)) return;
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
          if (event.button === 2 && (Math.abs(move.clientX - start.x) > 3 || Math.abs(move.clientY - start.y) > 3)) {
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
          height: Math.abs(current.y - origin.y)
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
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        this.marquee.hidden = true;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }
  clear() {
    this.nodeLayer.replaceChildren();
    this.edgeLayer.replaceChildren();
  }
  destroy() {
    this.root.remove();
  }
};
function clamp(value, low, high) {
  return Math.max(low, Math.min(value, high));
}
function ignoreSubPixel(shift) {
  return Math.abs(shift) < SUB_PIXEL ? 0 : shift;
}

// src/canvas/edge_router.js
var OBSTACLE_ROUTING_NODE_LIMIT = 60;
var SVG = "http://www.w3.org/2000/svg";
function routeEdge(from, to, { obstacles = [], simple = false } = {}) {
  const dx = to.x - from.x;
  const lead = Math.max(28, Math.min(Math.abs(dx) / 2, 90));
  const outX = from.side === "right" ? from.x + lead : from.x - lead;
  const inX = to.side === "right" ? to.x + lead : to.x - lead;
  if (simple || obstacles.length > OBSTACLE_ROUTING_NODE_LIMIT) {
    return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${inX} ${to.y}, ${to.x} ${to.y}`;
  }
  const direct = `M ${from.x} ${from.y} C ${outX} ${from.y}, ${inX} ${to.y}, ${to.x} ${to.y}`;
  if (!crossesAny(from, to, obstacles)) return direct;
  const midY = midpointClear(from, to, obstacles);
  return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${outX} ${midY}, ${(from.x + to.x) / 2} ${midY} S ${inX} ${to.y}, ${to.x} ${to.y}`;
}
function crossesAny(from, to, obstacles) {
  for (const box of obstacles) {
    if (segmentIntersectsBox(from, to, box)) return true;
  }
  return false;
}
function midpointClear(from, to, obstacles) {
  const base = (from.y + to.y) / 2;
  for (let offset = 0; offset < 400; offset += 40) {
    for (const candidate of [base - offset, base + offset]) {
      const point = { x: (from.x + to.x) / 2, y: candidate };
      if (!obstacles.some((box) => pointInBox(point, box))) return candidate;
    }
  }
  return base;
}
function pointInBox(point, box) {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}
function segmentIntersectsBox(a, b, box) {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  if (right < box.x || left > box.x + box.width) return false;
  if (bottom < box.y || top > box.y + box.height) return false;
  return true;
}
var FOOT_ENDS = {
  // The two a diagram draws when it does not know optionality. Kept because a
  // caller that knows only the maximum should draw only the maximum rather
  // than guessing at a minimum it has no evidence for.
  many: { maximum: "many", minimum: null },
  one: { maximum: "one", minimum: null },
  // The four a diagram can actually derive from a foreign key.
  "zero-or-many": { maximum: "many", minimum: "zero" },
  "one-or-many": { maximum: "many", minimum: "one" },
  "zero-or-one": { maximum: "one", minimum: "zero" },
  "exactly-one": { maximum: "one", minimum: "one" }
};
var FOOT_SIZE = 9;
var MAXIMUM_ENDS_AT = { many: 1, one: 0.45 };
var MINIMUM_SITS_AT = { many: 1.5, one: 0.95 };
var RING_RADIUS = 0.33;
function footAnchor(point, side, kind) {
  const { maximum } = FOOT_ENDS[kind] || FOOT_ENDS.one;
  const direction = side === "right" ? 1 : -1;
  return { ...point, side, x: point.x + direction * FOOT_SIZE * MAXIMUM_ENDS_AT[maximum] };
}
function crowsFoot(point, side, kind) {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", `twm-edge__marker twm-edge__marker--${kind}`);
  const direction = side === "right" ? 1 : -1;
  const { maximum, minimum } = FOOT_ENDS[kind] || FOOT_ENDS.one;
  const bar = (offset) => {
    const line = document.createElementNS(SVG, "line");
    line.setAttribute("x1", point.x + direction * FOOT_SIZE * offset);
    line.setAttribute("y1", point.y - FOOT_SIZE * 0.7);
    line.setAttribute("x2", point.x + direction * FOOT_SIZE * offset);
    line.setAttribute("y2", point.y + FOOT_SIZE * 0.7);
    group.appendChild(line);
  };
  if (maximum === "many") {
    for (const dy of [-FOOT_SIZE * 0.8, 0, FOOT_SIZE * 0.8]) {
      const line = document.createElementNS(SVG, "line");
      line.setAttribute("x1", point.x + direction * FOOT_SIZE * MAXIMUM_ENDS_AT.many);
      line.setAttribute("y1", point.y);
      line.setAttribute("x2", point.x);
      line.setAttribute("y2", point.y + dy);
      group.appendChild(line);
    }
  } else {
    bar(MAXIMUM_ENDS_AT.one);
  }
  if (minimum === "zero") {
    const ring = document.createElementNS(SVG, "circle");
    ring.setAttribute("cx", point.x + direction * FOOT_SIZE * MINIMUM_SITS_AT[maximum]);
    ring.setAttribute("cy", point.y);
    ring.setAttribute("r", FOOT_SIZE * RING_RADIUS);
    group.appendChild(ring);
  } else if (minimum === "one" && maximum === "many") {
    bar(MINIMUM_SITS_AT[maximum]);
  }
  return group;
}
function cardinality({ kind, optional } = {}) {
  if (kind === "N:M") return { child: "zero-or-many", parent: "zero-or-many" };
  return {
    child: kind === "1:1" ? "zero-or-one" : "zero-or-many",
    parent: optional ? "zero-or-one" : "exactly-one"
  };
}
function selfLoop(from, to, { nodeRight, gap = 46 } = {}) {
  const right = Math.max(nodeRight ?? from.x, from.x, to.x);
  const span = Math.abs(to.y - from.y);
  const bulge = right + gap + Math.min(span / 2, 60);
  return `M ${from.x} ${from.y} C ${bulge} ${from.y}, ${bulge} ${to.y}, ${to.x} ${to.y}`;
}
function returnEdge(from, to, { floor = null, lead = 36 } = {}) {
  const bottom = Math.max(Number.isFinite(floor) ? floor : -Infinity, from.y, to.y);
  const outX = from.x + lead;
  const inX = to.x - lead;
  return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${outX} ${bottom}, ${from.x} ${bottom} L ${to.x} ${bottom} C ${inX} ${bottom}, ${inX} ${to.y}, ${to.x} ${to.y}`;
}
function arrange(nodes, edges, { columnGap = 340, rowGap = 40 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to) {
      parents.get(edge.from).push(edge.to);
    }
  }
  const rank = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  const rankOf = (id) => {
    if (rank.has(id)) return rank.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const value = parents.get(id).length ? Math.max(...parents.get(id).map(rankOf)) + 1 : 0;
    visiting.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const node of nodes) rankOf(node.id);
  const columns = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const column = rank.get(node.id) ?? 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }
  const positions = /* @__PURE__ */ new Map();
  for (const [column, members] of [...columns].sort((a, b) => a[0] - b[0])) {
    members.sort((a, b) => a.label.localeCompare(b.label));
    let y = 0;
    for (const node of members) {
      positions.set(node.id, { x: column * columnGap, y });
      y += (node.height || 120) + rowGap;
    }
  }
  return positions;
}

export {
  CanvasAdapter,
  OBSTACLE_ROUTING_NODE_LIMIT,
  routeEdge,
  footAnchor,
  crowsFoot,
  cardinality,
  selfLoop,
  returnEdge,
  arrange
};
//# sourceMappingURL=chunk-SN4LSOAR.js.map
