import {
  CanvasAdapter,
  OBSTACLE_ROUTING_NODE_LIMIT,
  arrange,
  cardinality,
  crowsFoot,
  footAnchor,
  returnEdge,
  routeEdge,
  selfLoop
} from "./chunk-SN4LSOAR.js";
import "./chunk-JYWURG5T.js";

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

// src/canvas/graph/history_service.js
var DEFAULT_LIMIT = 200;
var missing = (name) => new Error(
  `HistoryService needs ${name}. Constructing it without the full dependency set is how an undo engine ends up silently doing nothing.`
);
var HistoryService = class {
  /**
   * @param {object} o
   * @param {readonly string[]} o.actions  the only actions `record` accepts
   * @param {(entry: object, direction: 'undo'|'redo') => void} o.apply  puts one entry back (or forward)
   * @param {(state: {canUndo, canRedo, depth}) => void} [o.onState]
   * @param {number} [o.limit]   entries kept; the oldest goes first
   * @param {object} [o.requires]  `{name: value}` a subclass cannot work without; each is checked
   * @param {(action: string) => string} [o.refusal]  the sentence a refused `record` throws
   */
  constructor({ actions, apply, onState, limit = DEFAULT_LIMIT, requires = null, refusal = null } = {}) {
    for (const [name, value] of Object.entries(requires || {})) {
      if (!value) throw missing(name);
    }
    if (!Array.isArray(actions) || !actions.length) throw missing("actions (its closed list)");
    if (typeof apply !== "function") throw missing("apply(entry, direction)");
    this.actions = Object.freeze([...actions]);
    this._applyEntry = apply;
    this.onState = onState;
    this.limit = limit;
    this.refusal = typeof refusal === "function" ? refusal : null;
    this.undoStack = [];
    this.redoStack = [];
    this.recording = false;
    this.batch = null;
  }
  /** The drawing has been loaded: the stacks start empty, and recording starts. */
  hydrated() {
    this.undoStack = [];
    this.redoStack = [];
    this.recording = true;
    this._publish();
  }
  /** Group what is recorded until `endBatch` into one entry. */
  startBatch(label) {
    if (!this.recording) return;
    this.batch = { action: "batch", label, entries: [] };
  }
  endBatch() {
    if (!this.batch) return;
    const batch = this.batch;
    this.batch = null;
    if (batch.entries.length) this._push(batch);
  }
  record(action, payload) {
    if (!this.recording) return;
    if (!this.actions.includes(action)) {
      throw new Error(this.refusal ? this.refusal(action) : `${action} is not an undoable action here; the ones that are: ${this.actions.join(", ")}.`);
    }
    const entry = { action, ...payload };
    if (this.batch) {
      this.batch.entries.push(entry);
      return;
    }
    this._push(entry);
  }
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this._apply(entry, "undo");
    this.redoStack.push(entry);
    this._publish();
    return true;
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this._apply(entry, "redo");
    this.undoStack.push(entry);
    this._publish();
    return true;
  }
  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this._publish();
  }
  /**
   * Take over the undo and redo stacks of a torn-down view whose state this
   * one has just taken on, entry for entry and in the same order. Nothing new
   * becomes undoable: every entry was recorded through a `record` whose action
   * list is closed, so a stack can only carry what that list allows. Call it
   * after `hydrated()`.
   */
  adopt({ undo = [], redo = [] } = {}) {
    if (!this.recording) return;
    this.undoStack = [...undo].slice(-this.limit);
    this.redoStack = [...redo];
    this._publish();
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  _push(entry) {
    this.undoStack.push(entry);
    this.redoStack = [];
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this._publish();
  }
  _publish() {
    this.onState?.({
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      depth: this.undoStack.length
    });
  }
  _apply(entry, direction) {
    if (entry.action === "batch") {
      const entries = direction === "undo" ? [...entry.entries].reverse() : entry.entries;
      for (const child of entries) this._apply(child, direction);
      return;
    }
    this._applyEntry(entry, direction);
  }
};
export {
  CONNECTOR_STRINGS,
  CanvasAdapter,
  ConnectorRouter,
  HistoryService,
  NodePlatform,
  OBSTACLE_ROUTING_NODE_LIMIT,
  arrange,
  cardinality,
  crowsFoot,
  footAnchor,
  returnEdge,
  routeEdge,
  selfLoop
};
//# sourceMappingURL=canvas.js.map
