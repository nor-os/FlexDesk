/**
 * The canvas kernel — GRAPH LAYER: the node and port model (36 §4.3).
 *
 * GENERIC. It holds nodes — each `{id, position, size, collapsed, ports}` plus
 * whatever else the embedder hangs on it — and answers which ports a node
 * offers. What a node IS (a table, a step, a form field) and which ports a
 * collapsed one keeps are the embedder's: a subclass builds the nodes and
 * calls `hydrate`, and the `collapsedPorts(node)` option decides what a folded
 * node shows.
 *
 * The genuinely reusable idea is the shape of a port descriptor — `{id, role,
 * direction, type, accepts, provides, allowMultiple, maxConnections, disabled,
 * disabledReason, meta}` — which is what lets one legality guard
 * (`ConnectorRouter`) serve a schema diagram, a flow graph and a form
 * designer. Nothing here requires any of those keys but `id`; the router reads
 * the ones it knows.
 *
 * DOM-free on purpose. It holds the graph; the embedder renders it. That split
 * is what makes the legality guard and the history service testable under
 * plain node.
 *
 * Events (`on(name, handler)` → an unsubscribe):
 *   `hydrated`   `{count}`                 after `hydrate`
 *   `moved`      `{id, before, after}`     after a `setPosition` that is not `silent`
 *   `collapsed`  `{id, before, after}`     after a `setCollapsed` that is not `silent`
 */

export class NodePlatform {
    /**
     * @param {object} [options]
     * @param {(node: object) => object[]} [options.collapsedPorts]  the ports a COLLAPSED node
     *        still offers; by default none
     */
    constructor({ collapsedPorts = null } = {}) {
        /** @type {Map<string, object>} node id -> snapshot */
        this.nodes = new Map();
        this.listeners = new Map();
        this.collapsedPorts = typeof collapsedPorts === 'function' ? collapsedPorts : null;
    }

    on(event, handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
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
            if (!raw || raw.id === undefined || raw.id === null) continue;
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
                ports: Array.isArray(raw.ports) ? raw.ports : [],
            });
        }
        this.emit('hydrated', { count: this.nodes.size });
    }

    get(id) { return this.nodes.get(id); }
    all() { return [...this.nodes.values()]; }

    port(nodeId, portId) {
        return this.nodes.get(nodeId)?.ports.find((p) => p.id === portId) || null;
    }

    setPosition(id, position, { silent = false } = {}) {
        const node = this.nodes.get(id);
        if (!node) return null;
        const before = { ...node.position };
        node.position = { ...position };
        if (!silent) this.emit('moved', { id, before, after: { ...position } });
        return before;
    }

    setCollapsed(id, collapsed, { silent = false } = {}) {
        const node = this.nodes.get(id);
        if (!node) return null;
        const before = node.collapsed;
        node.collapsed = Boolean(collapsed);
        if (!silent) this.emit('collapsed', { id, before, after: node.collapsed });
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
}
