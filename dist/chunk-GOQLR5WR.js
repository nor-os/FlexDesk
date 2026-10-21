// src/canvas/canvas_adapter.js
var MIN_SCALE = 0.15;
var MAX_SCALE = 4;
var COARSE_GRID_EVERY = 5;
var SUB_PIXEL = 0.5;
var CanvasAdapter = class {
  /** The zoom limits every `setViewport`, `zoomAt` and `fit` clamps to, for an
   *  embedder whose own zoom controls must stop where the kernel stops. */
  static MIN_SCALE = MIN_SCALE;
  static MAX_SCALE = MAX_SCALE;
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

// src/canvas/layered_layout.js
var DEFAULT_SIZE = Object.freeze({ width: 160, height: 80 });
var defaultSizeOf = (node) => ({
  width: Number(node?.width) || DEFAULT_SIZE.width,
  height: Number(node?.height) || DEFAULT_SIZE.height
});
function crossingsBetween(pairs) {
  let n = 0;
  for (let i = 0; i < pairs.length; i++) {
    const [a1, b1] = pairs[i];
    for (let j = i + 1; j < pairs.length; j++) {
      const [a2, b2] = pairs[j];
      if ((a1 - a2) * (b1 - b2) < 0) n++;
    }
  }
  return n;
}
function layeredLayout(nodes, edges, {
  rank = null,
  sizeOf = null,
  columnGap = 64,
  rowGap = 32,
  componentGap = 80,
  passes = 8
} = {}) {
  const list = [];
  const index = /* @__PURE__ */ new Map();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || node.id === void 0 || node.id === null || index.has(String(node.id))) continue;
    index.set(String(node.id), list.length);
    list.push(node);
  }
  const count = list.length;
  const positions = /* @__PURE__ */ new Map();
  if (!count) return positions;
  const hint = list.map((n) => {
    const r = typeof rank === "function" ? rank(n) : null;
    return r === "source" || r === "sink" ? r : null;
  });
  const measure = typeof sizeOf === "function" ? sizeOf : defaultSizeOf;
  const size = list.map((n) => {
    const s = measure(n) || {};
    return { width: Math.max(0, Number(s.width) || 0), height: Math.max(0, Number(s.height) || 0) };
  });
  const out = Array.from({ length: count }, () => []);
  const near = Array.from({ length: count }, () => []);
  const seen = /* @__PURE__ */ new Set();
  const lines = [];
  for (const e of Array.isArray(edges) ? edges : []) {
    const u = index.get(String(e?.from));
    const v = index.get(String(e?.to));
    if (u === void 0 || v === void 0 || u === v) continue;
    const key = `${u}>${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out[u].push(v);
    lines.push([u, v]);
    if (!seen.has(`${u}~${v}`)) {
      seen.add(`${u}~${v}`);
      seen.add(`${v}~${u}`);
      near[u].push(v);
      near[v].push(u);
    }
  }
  const componentOf = new Int32Array(count).fill(-1);
  const components = [];
  for (let s = 0; s < count; s++) {
    if (componentOf[s] >= 0) continue;
    const members = [];
    const stack = [s];
    componentOf[s] = components.length;
    while (stack.length) {
      const u = stack.pop();
      members.push(u);
      for (const v of near[u]) if (componentOf[v] < 0) {
        componentOf[v] = components.length;
        stack.push(v);
      }
    }
    members.sort((a, b) => a - b);
    components.push(members);
  }
  const ordered = components.map((m, i) => ({ m, i })).sort((a, b) => b.m.length - a.m.length || a.i - b.i);
  const linesOf = components.map(() => []);
  for (const line of lines) linesOf[componentOf[line[0]]].push(line);
  const reversed = /* @__PURE__ */ new Set();
  const state = new Uint8Array(count);
  for (let s = 0; s < count; s++) {
    if (state[s]) continue;
    const stack = [[s, 0]];
    state[s] = 1;
    while (stack.length) {
      const top2 = stack[stack.length - 1];
      const [u, k] = top2;
      if (k < out[u].length) {
        top2[1] = k + 1;
        const v = out[u][k];
        if (state[v] === 1) reversed.add(`${u}>${v}`);
        else if (state[v] === 0) {
          state[v] = 1;
          stack.push([v, 0]);
        }
      } else {
        state[u] = 2;
        stack.pop();
      }
    }
  }
  const preds = Array.from({ length: count }, () => []);
  const succs = Array.from({ length: count }, () => []);
  for (const [u0, v0] of lines) {
    const [u, v] = reversed.has(`${u0}>${v0}`) ? [v0, u0] : [u0, v0];
    if (hint[v] === "source" || hint[u] === "sink") continue;
    preds[v].push(u);
    succs[u].push(v);
  }
  const layer = new Int32Array(count);
  const waiting = preds.map((p) => p.length);
  const queue = [];
  for (let u = 0; u < count; u++) if (!waiting[u]) queue.push(u);
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of succs[u]) {
      if (layer[u] + 1 > layer[v]) layer[v] = layer[u] + 1;
      if (--waiting[v] === 0) queue.push(v);
    }
  }
  let top = 0;
  for (const { m, i: c } of ordered) {
    let last = -1;
    for (const u of m) if (hint[u] !== "sink") last = Math.max(last, hint[u] === "source" ? 0 : layer[u]);
    for (const u of m) {
      if (hint[u] === "source") layer[u] = 0;
      else if (hint[u] === "sink") layer[u] = last + 1;
    }
    const used = [...new Set(m.map((u) => layer[u]))].sort((a, b) => a - b);
    const renumber = new Map(used.map((l, i) => [l, i]));
    const columns = used.map(() => []);
    for (const u of m) {
      layer[u] = renumber.get(layer[u]);
      columns[layer[u]].push(u);
    }
    const place = /* @__PURE__ */ new Map();
    const remember = () => {
      for (const c2 of columns) c2.forEach((u, i) => place.set(u, i));
    };
    remember();
    const between = columns.map(() => []);
    for (const [u, v] of linesOf[c]) {
      const a = Math.min(layer[u], layer[v]);
      if (Math.abs(layer[u] - layer[v]) === 1) between[a].push(layer[u] < layer[v] ? [u, v] : [v, u]);
    }
    const crossings = () => {
      let n = 0;
      for (let l = 0; l + 1 < columns.length; l++) {
        n += crossingsBetween(between[l].map(([u, v]) => [place.get(u), place.get(v)]));
      }
      return n;
    };
    const sweep = (l, from) => {
      const column = columns[l];
      const centre = /* @__PURE__ */ new Map();
      for (const u of column) {
        let sum = 0;
        let k = 0;
        for (const v of near[u]) {
          if (from(layer[v])) {
            sum += place.get(v);
            k++;
          }
        }
        centre.set(u, k ? sum / k : place.get(u));
      }
      column.sort((a, b) => centre.get(a) - centre.get(b) || place.get(a) - place.get(b));
      column.forEach((u, i) => place.set(u, i));
    };
    let best = crossings();
    let bestColumns = columns.map((c2) => [...c2]);
    for (let p = 0; p < passes && best > 0; p++) {
      for (let l = 1; l < columns.length; l++) sweep(l, (x2) => x2 < l);
      for (let l = columns.length - 2; l >= 0; l--) sweep(l, (x2) => x2 > l);
      const now = crossings();
      if (now < best) {
        best = now;
        bestColumns = columns.map((c2) => [...c2]);
      }
    }
    const widths = bestColumns.map((c2) => Math.max(0, ...c2.map((u) => size[u].width)));
    const heights = bestColumns.map((c2) => c2.reduce((h, u) => h + size[u].height, 0) + rowGap * Math.max(0, c2.length - 1));
    const tallest = Math.max(0, ...heights);
    let x = 0;
    bestColumns.forEach((c2, l) => {
      let y = top + (tallest - heights[l]) / 2;
      for (const u of c2) {
        positions.set(String(list[u].id), { x, y });
        y += size[u].height + rowGap;
      }
      x += widths[l] + columnGap;
    });
    top += tallest + componentGap;
  }
  return positions;
}

// src/canvas/graph/node_platform.js
var NodePlatform = class {
  /**
   * @param {object} [options]
   * @param {(node: object) => object[]} [options.collapsedPorts]  the ports a COLLAPSED node
   *        still offers; by default none
   */
  constructor({ collapsedPorts = null } = {}) {
    this.nodes = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.collapsedPorts = typeof collapsedPorts === "function" ? collapsedPorts : null;
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event).delete(handler);
  }
  emit(event, payload) {
    for (const handler of this.listeners.get(event) || []) handler(payload);
  }
  /**
   * Replace the whole graph. Hydration, not an edit — see `HistoryService`.
   *
   * Each node is `{id, position?, size?, collapsed?, ports?, …}`: the position
   * is copied (a missing one is (0, 0)), `size` is `{w, h}` or null, `ports`
   * an array (none when absent), and every other key is kept as it is.
   */
  hydrate(nodes) {
    this.nodes.clear();
    for (const raw of Array.isArray(nodes) ? nodes : []) {
      if (!raw || raw.id === void 0 || raw.id === null) continue;
      const id = raw.id;
      this.nodes.set(id, {
        ...raw,
        id,
        // `size` and `collapsed` are in the snapshot, not derived: at
        // hundreds of nodes a node showing forty ports is unreadable, and
        // a collapsed node's ports fold away.
        position: raw.position ? { x: raw.position.x, y: raw.position.y } : { x: 0, y: 0 },
        size: raw.size ? { w: raw.size.w, h: raw.size.h } : null,
        collapsed: Boolean(raw.collapsed),
        ports: Array.isArray(raw.ports) ? raw.ports : []
      });
    }
    this.emit("hydrated", { count: this.nodes.size });
  }
  get(id) {
    return this.nodes.get(id);
  }
  all() {
    return [...this.nodes.values()];
  }
  port(nodeId, portId) {
    return this.nodes.get(nodeId)?.ports.find((p) => p.id === portId) || null;
  }
  setPosition(id, position, { silent = false } = {}) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const before = { ...node.position };
    node.position = { ...position };
    if (!silent) this.emit("moved", { id, before, after: { ...position } });
    return before;
  }
  setCollapsed(id, collapsed, { silent = false } = {}) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const before = node.collapsed;
    node.collapsed = Boolean(collapsed);
    if (!silent) this.emit("collapsed", { id, before, after: node.collapsed });
    return before;
  }
  /**
   * Ports that are visible right now.
   *
   * A collapsed node offers only what `collapsedPorts` says it keeps (by
   * default nothing). Answering from one place is what stops a renderer and
   * the legality guard disagreeing about what can be dropped on.
   */
  visiblePorts(id) {
    const node = this.nodes.get(id);
    if (!node) return [];
    if (node.collapsed) return this.collapsedPorts ? this.collapsedPorts(node) : [];
    return node.ports;
  }
};

// src/canvas/graph/connector_router.js
var CONNECTOR_STRINGS = Object.freeze({
  nodeGone: "That node is no longer on the canvas.",
  portGone: "That port is no longer on the canvas.",
  portDisabled: "That port cannot be connected.",
  selfReference: "A node cannot connect to itself on this canvas.",
  portFull: (max) => max === 1 ? "That port already carries its one connection." : `That port already carries its ${max} connections.`
});
var say = (strings, key, ...args) => {
  const s = strings[key];
  return typeof s === "function" ? s(...args) : String(s);
};
var defaultEndsOf = (edge) => ({ from: edge?.fromPort ?? null, to: edge?.toPort ?? null });
function capacityOf(port) {
  if (Number.isFinite(port?.maxConnections)) return port.maxConnections;
  if (port?.allowMultiple === false) return 1;
  return Infinity;
}
var ConnectorRouter = class {
  /**
   * @param {object} o
   * @param {object} o.platform                        a `NodePlatform`
   * @param {boolean} [o.selfReference]                may a node connect to itself
   * @param {(ctx: object) => object|null|undefined} [o.policy]  the embedder's rules, asked last
   * @param {(edge: object) => {from, to}} [o.endsOf]  the port ids an edge uses at each end
   * @param {('source'|'target')[]} [o.disabledEnds]   which ends a disabled port refuses
   * @param {object} [o.strings]                       the generic refusals' words
   */
  constructor({
    platform,
    selfReference = false,
    policy = null,
    endsOf = null,
    disabledEnds = ["source", "target"],
    strings = null
  } = {}) {
    this.platform = platform;
    this.selfReference = selfReference;
    this.policy = typeof policy === "function" ? policy : null;
    this.endsOf = typeof endsOf === "function" ? endsOf : defaultEndsOf;
    this.disabledEnds = new Set(disabledEnds);
    this.strings = Object.freeze({ ...CONNECTOR_STRINGS, ...strings || {} });
    this.edges = /* @__PURE__ */ new Map();
  }
  hydrate(edges) {
    this.edges.clear();
    for (const edge of edges) this.edges.set(edge.id, edge);
  }
  /** Every edge already touching this node, in either direction. */
  edgesFor(nodeId) {
    return [...this.edges.values()].filter((e) => e.from === nodeId || e.to === nodeId);
  }
  /** How many edges (applied and `pending`) already use this port at this node. */
  connectionsAt(nodeId, portId, { pendingEdges = [] } = {}) {
    let n = 0;
    for (const edge of [...this.edges.values(), ...pendingEdges]) {
      const ends = this.endsOf(edge) || {};
      if (edge.from === nodeId && ends.from === portId) n += 1;
      if (edge.to === nodeId && ends.to === portId) n += 1;
    }
    return n;
  }
  /**
   * Can this drop become an edge?
   *
   * `source` and `target` are `{nodeId, portId}`. The answer is a verdict the
   * caller can render directly — the reason strings ARE the notice text, so a
   * policy should name the objects rather than describe the rule.
   */
  canConnect(source, target, { pendingEdges = [] } = {}) {
    const S = this.strings;
    const fromNode = this.platform.get(source.nodeId);
    const toNode = this.platform.get(target.nodeId);
    if (!fromNode || !toNode) return { ok: false, reason: say(S, "nodeGone") };
    const fromPort = this.platform.port(source.nodeId, source.portId);
    const toPort = this.platform.port(target.nodeId, target.portId);
    if (!fromPort || !toPort) return { ok: false, reason: say(S, "portGone") };
    if (fromPort.disabled && this.disabledEnds.has("source")) {
      return { ok: false, reason: fromPort.disabledReason || say(S, "portDisabled") };
    }
    if (toPort.disabled && this.disabledEnds.has("target")) {
      return { ok: false, reason: toPort.disabledReason || say(S, "portDisabled") };
    }
    const selfReference = fromNode.id === toNode.id;
    if (selfReference && !this.selfReference) return { ok: false, reason: say(S, "selfReference") };
    for (const [node, port] of [[fromNode, fromPort], [toNode, toPort]]) {
      const max = capacityOf(port);
      if (max !== Infinity && this.connectionsAt(node.id, port.id, { pendingEdges }) >= max) {
        return { ok: false, reason: say(S, "portFull", max) };
      }
    }
    if (this.policy) {
      const verdict = this.policy({
        source,
        target,
        fromNode,
        toNode,
        fromPort,
        toPort,
        pendingEdges,
        selfReference,
        edges: [...this.edges.values()],
        router: this
      });
      if (verdict && typeof verdict === "object") return verdict;
    }
    return { ok: true, selfReference };
  }
  /**
   * Record a STAGED edge. Nothing here talks to a server — the embedder turns
   * a staged edge into whatever its own write is, and only that makes it real.
   */
  stage(edge) {
    this.edges.set(edge.id, edge);
    return edge;
  }
  unstage(id) {
    const edge = this.edges.get(id);
    this.edges.delete(id);
    return edge || null;
  }
  /**
   * Re-map edges when a node's port set is rebuilt.
   *
   * A node gains or loses a port constantly in a live diagram. Matches by port
   * id, drops what cannot be mapped, and reports both — a silently dropped
   * edge is a line that vanished from the drawing while what it stands for
   * still exists. `endsOf` (else the router's own) names the ports an edge
   * uses; an end that names none is not checked.
   */
  remapNodeConnections(nodeId, portIds, { endsOf = null } = {}) {
    const ends = typeof endsOf === "function" ? endsOf : this.endsOf;
    const available = new Set(portIds);
    let remapped = 0;
    const removed = [];
    for (const [id, edge] of [...this.edges]) {
      const at = ends(edge) || {};
      const touches = [];
      if (edge.from === nodeId && at.from !== null && at.from !== void 0) touches.push(at.from);
      if (edge.to === nodeId && at.to !== null && at.to !== void 0) touches.push(at.to);
      if (edge.from !== nodeId && edge.to !== nodeId) continue;
      if (touches.every((portId) => available.has(portId))) {
        remapped += 1;
        continue;
      }
      this.edges.delete(id);
      removed.push(edge);
    }
    return { remapped, removed };
  }
};

export {
  CanvasAdapter,
  OBSTACLE_ROUTING_NODE_LIMIT,
  routeEdge,
  footAnchor,
  crowsFoot,
  cardinality,
  selfLoop,
  returnEdge,
  arrange,
  layeredLayout,
  NodePlatform,
  CONNECTOR_STRINGS,
  ConnectorRouter
};
//# sourceMappingURL=chunk-GOQLR5WR.js.map
