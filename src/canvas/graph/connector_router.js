/**
 * The canvas kernel — GRAPH LAYER: the edge model and its legality guard
 * (36 §4.3).
 *
 * THE POINT OF THIS FILE IS THAT A DROP IS REFUSED — OR BETTER, NEGOTIATED —
 * BEFORE ANY NETWORK CALL. A gesture that produces a round trip and then a
 * server error reads as a broken editor; the same gesture producing an
 * immediate reason reads as an editor that knows the rules.
 *
 * GENERIC. `canConnect` makes the refusals every graph shares, in this order:
 *
 *   1. an end is gone        — a node the platform no longer has
 *   2. a port is gone        — a port its node no longer has
 *   3. a disabled port       — `port.disabled`, refused with `port.disabledReason`
 *                              when it carries one (by default at either end;
 *                              `disabledEnds: ['source']` asks only of the source)
 *   4. a self-reference      — unless `selfReference: true`
 *   5. capacity              — a port with `maxConnections` (or `allowMultiple:
 *                              false`, which is one) that already carries that many
 *
 * and THEN asks the embedder's `policy(ctx)`, which is where a domain's own rules
 * live — and its sentences. A policy returns a verdict, or nothing for "allowed".
 *
 * SELF-REFERENCES ARE OPT-IN PER ROUTER rather than blanket-refused:
 * `employee.manager_id → employee` is the most common recursive relationship
 * in business schemas, and a diagram of them needs it on; a graph that must be
 * a DAG leaves it off. There is no cycle detection here at all — mutual
 * references are legal and common, and a graph that needs a DAG says so in
 * its policy.
 *
 * A verdict is `{ok: true, selfReference, …}` or `{ok: false, reason}`. A policy
 * may answer `{ok: true, offer: {…}}`: a drop that is legal once something
 * else changes too is an OFFER, not a failure.
 *
 * An edge is the embedder's object with at least `{id, from, to}`; which PORT
 * each end uses is read through `endsOf(edge) → {from, to}` (port ids, or null
 * for an end that names none), by default `edge.fromPort` and `edge.toPort`.
 */

export const CONNECTOR_STRINGS = Object.freeze({
    nodeGone: 'That node is no longer on the canvas.',
    portGone: 'That port is no longer on the canvas.',
    portDisabled: 'That port cannot be connected.',
    selfReference: 'A node cannot connect to itself on this canvas.',
    portFull: (max) => (max === 1 ? 'That port already carries its one connection.'
        : `That port already carries its ${max} connections.`),
});

const say = (strings, key, ...args) => {
    const s = strings[key];
    return typeof s === 'function' ? s(...args) : String(s);
};

const defaultEndsOf = (edge) => ({ from: edge?.fromPort ?? null, to: edge?.toPort ?? null });

/** The most connections a port may carry: `maxConnections`, else one when it allows no more. */
function capacityOf(port) {
    if (Number.isFinite(port?.maxConnections)) return port.maxConnections;
    if (port?.allowMultiple === false) return 1;
    return Infinity;
}

export class ConnectorRouter {
    /**
     * @param {object} o
     * @param {object} o.platform                        a `NodePlatform`
     * @param {boolean} [o.selfReference]                may a node connect to itself
     * @param {(ctx: object) => object|null|undefined} [o.policy]  the embedder's rules, asked last
     * @param {(edge: object) => {from, to}} [o.endsOf]  the port ids an edge uses at each end
     * @param {('source'|'target')[]} [o.disabledEnds]   which ends a disabled port refuses
     * @param {object} [o.strings]                       the generic refusals' words
     */
    constructor({ platform, selfReference = false, policy = null, endsOf = null,
                  disabledEnds = ['source', 'target'], strings = null } = {}) {
        this.platform = platform;
        this.selfReference = selfReference;
        this.policy = typeof policy === 'function' ? policy : null;
        this.endsOf = typeof endsOf === 'function' ? endsOf : defaultEndsOf;
        this.disabledEnds = new Set(disabledEnds);
        this.strings = Object.freeze({ ...CONNECTOR_STRINGS, ...(strings || {}) });
        /** @type {Map<string, object>} edge id -> edge */
        this.edges = new Map();
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
        if (!fromNode || !toNode) return { ok: false, reason: say(S, 'nodeGone') };
        const fromPort = this.platform.port(source.nodeId, source.portId);
        const toPort = this.platform.port(target.nodeId, target.portId);
        if (!fromPort || !toPort) return { ok: false, reason: say(S, 'portGone') };
        if (fromPort.disabled && this.disabledEnds.has('source')) {
            return { ok: false, reason: fromPort.disabledReason || say(S, 'portDisabled') };
        }
        if (toPort.disabled && this.disabledEnds.has('target')) {
            return { ok: false, reason: toPort.disabledReason || say(S, 'portDisabled') };
        }
        const selfReference = fromNode.id === toNode.id;
        if (selfReference && !this.selfReference) return { ok: false, reason: say(S, 'selfReference') };
        for (const [node, port] of [[fromNode, fromPort], [toNode, toPort]]) {
            const max = capacityOf(port);
            if (max !== Infinity && this.connectionsAt(node.id, port.id, { pendingEdges }) >= max) {
                return { ok: false, reason: say(S, 'portFull', max) };
            }
        }
        if (this.policy) {
            const verdict = this.policy({
                source, target, fromNode, toNode, fromPort, toPort, pendingEdges, selfReference,
                edges: [...this.edges.values()], router: this,
            });
            if (verdict && typeof verdict === 'object') return verdict;
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
        const ends = typeof endsOf === 'function' ? endsOf : this.endsOf;
        const available = new Set(portIds);
        let remapped = 0;
        const removed = [];
        for (const [id, edge] of [...this.edges]) {
            const at = ends(edge) || {};
            const touches = [];
            if (edge.from === nodeId && at.from !== null && at.from !== undefined) touches.push(at.from);
            if (edge.to === nodeId && at.to !== null && at.to !== undefined) touches.push(at.to);
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
}
