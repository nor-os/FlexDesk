/**
 * A LOGIC FLOW'S GRAPH, as the canvas and the outline both edit it — PURE: no
 * DOM, runs under plain node (36 §3.14). Moved from Tables' designer graph
 * model, minus everything that was Tables'.
 *
 * The shape is the consumer server's:
 *
 *     { nodes: [{ id, type, label?, config, position: {x, y} }],
 *       connections: [{ source, target, sourcePort, targetPort }] }
 *
 * **The editors decide nothing a publish depends on.** Whether a graph is a
 * valid flow is the consumer's validator, drawn as findings. What `canConnect`
 * refuses is only what an editor cannot DRAW honestly — a port that does not
 * exist, a flow line into a data port, a second line out of a port that
 * carries one, a step connected to itself — and every refusal is a sentence,
 * returned, never thrown into a console.
 *
 * `serialise` is byte-stable: node keys in the order `id, type, label?, config,
 * position`, config keys sorted, nodes and connections in the order they were
 * drawn — so a graph opened and saved with no edit is the identical text.
 */

import { createStrings } from './strings.js';

/** The node ids a server accepts: letters, digits, `-` and `_`, at most 64. */
export const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

export const LOGIC_GRAPH_STRINGS = Object.freeze({
    connectSelf: 'A step cannot connect to itself.',
    connectMissing: 'Both ends must be steps in this flow.',
    connectNoOutput: (port) => `This step has no output called ${port}.`,
    connectNoInput: (port) => `That step has no input called ${port}.`,
    connectNotFlow: (how) => (how
        ? `Only flow ports connect; a data port is read as ${how}.`
        : 'Only flow ports connect; a data port is read, not connected.'),
    connectTwice: 'These two are already connected.',
    connectOneLine: (port) => `The ${port} port takes one connection; `
        + 'use a step that runs several branches.',
});

export function emptyGraph() {
    return { nodes: [], connections: [] };
}

/** A deep copy with every field the graph carries, and nothing else. */
export function normalise(graph) {
    const g = graph && typeof graph === 'object' ? graph : emptyGraph();
    return {
        nodes: (Array.isArray(g.nodes) ? g.nodes : []).map((n) => ({
            id: String(n.id),
            type: String(n.type),
            ...(n.label ? { label: String(n.label) } : {}),
            config: n.config && typeof n.config === 'object' ? structuredClone(n.config) : {},
            position: { x: Math.round(Number(n.position?.x) || 0), y: Math.round(Number(n.position?.y) || 0) },
        })),
        connections: (Array.isArray(g.connections) ? g.connections : []).map((c) => ({
            source: String(c.source),
            target: String(c.target),
            sourcePort: String(c.sourcePort || 'out'),
            targetPort: String(c.targetPort || 'in'),
        })),
    };
}

function sortedKeys(value) {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys(value[k])]));
    }
    return value;
}

/** The text a save sends and a reload must reproduce exactly. */
export function serialise(graph) {
    const g = normalise(graph);
    return JSON.stringify({
        nodes: g.nodes.map((n) => ({
            id: n.id, type: n.type, ...(n.label ? { label: n.label } : {}),
            config: sortedKeys(n.config), position: n.position,
        })),
        connections: g.connections.map((c) => ({
            source: c.source, target: c.target, sourcePort: c.sourcePort, targetPort: c.targetPort,
        })),
    });
}

/**
 * A new id for a step of `typeId`: `stem`, `stem-2`, … — readable inside a
 * reference. The stem is the catalogue's `idBase` when a catalogue is given,
 * else the type id, made safe for an id.
 */
export function nextId(graph, typeId, { catalogue = null } = {}) {
    const base = catalogue?.idBase
        ? catalogue.idBase(typeId)
        : (String(typeId || 'step').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'step');
    const taken = new Set((graph?.nodes || []).map((n) => n.id));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i += 1) {
        if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    }
}

/**
 * Append a step of `typeId`. A wanted `id` is used when it is a valid id nobody
 * holds; otherwise `nextId`. A step with no position is at (0, 0), the
 * position `normalise` gives one.
 */
export function addNode(graph, typeId, position = null, { id = null, label = null, config = null,
                                                          catalogue = null } = {}) {
    const nid = id && ID_OK.test(id) && !graph.nodes.some((n) => n.id === id)
        ? id : nextId(graph, typeId, { catalogue });
    const node = {
        id: nid, type: typeId, ...(label ? { label } : {}),
        config: config && typeof config === 'object' ? structuredClone(config) : {},
        position: { x: Math.round(position?.x || 0), y: Math.round(position?.y || 0) },
    };
    graph.nodes.push(node);
    return node;
}

export function removeNode(graph, nodeId) {
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    graph.connections = graph.connections.filter((c) => c.source !== nodeId && c.target !== nodeId);
}

export function moveNode(graph, nodeId, position) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) node.position = { x: Math.round(position.x), y: Math.round(position.y) };
}

export const sameEdge = (a, b) => a.source === b.source && a.target === b.target
    && a.sourcePort === b.sourcePort && a.targetPort === b.targetPort;

function portOf(catalogue, node, name, direction) {
    if (!node) return null;
    if (catalogue?.port) return catalogue.port(node.type, name, direction);
    const def = catalogue?.get?.(node.type);
    return def?.ports?.find((p) => p.name === name && p.direction === direction) || null;
}

/**
 * May `source.sourcePort` connect to `target.targetPort`? `{ok: true}` or
 * `{ok: false, reason}` — the editor shows the reason where the gesture failed.
 * `dataRead` is the consumer's words for how a data port is read instead
 * (`syntax.format(...)`), put in the refusal.
 */
export function canConnect(graph, catalogue, { source, sourcePort, target, targetPort },
                           { strings = null, dataRead = null } = {}) {
    const S = createStrings(LOGIC_GRAPH_STRINGS, strings);
    if (source === target) return { ok: false, reason: S.connectSelf };
    const from = graph.nodes.find((n) => n.id === source);
    const to = graph.nodes.find((n) => n.id === target);
    if (!from || !to) return { ok: false, reason: S.connectMissing };
    const out = portOf(catalogue, from, sourcePort, 'output');
    const inp = portOf(catalogue, to, targetPort, 'input');
    if (!out) return { ok: false, reason: S.connectNoOutput(sourcePort) };
    if (!inp) return { ok: false, reason: S.connectNoInput(targetPort) };
    if ((out.port_type || 'FLOW') !== 'FLOW' || (inp.port_type || 'FLOW') !== 'FLOW') {
        return { ok: false, reason: S.connectNotFlow(dataRead) };
    }
    if (graph.connections.some((c) => c.source === source && c.sourcePort === sourcePort
                                    && c.target === target && c.targetPort === targetPort)) {
        return { ok: false, reason: S.connectTwice };
    }
    if (!out.multiple && graph.connections.some((c) => c.source === source && c.sourcePort === sourcePort)) {
        return { ok: false, reason: S.connectOneLine(out.label || sourcePort) };
    }
    return { ok: true };
}

/** Connect when `canConnect` allows it; returns its verdict either way. */
export function connect(graph, catalogue, edge, options = {}) {
    const verdict = canConnect(graph, catalogue, edge, options);
    if (verdict.ok) {
        graph.connections.push({ source: edge.source, target: edge.target,
                                 sourcePort: edge.sourcePort, targetPort: edge.targetPort });
    }
    return verdict;
}

export function disconnect(graph, edge) {
    graph.connections = graph.connections.filter((c) => !sameEdge(c, edge));
}

/**
 * The names a graph reads from one SCOPE of a reference syntax — every
 * reference whose path starts `scope.` in any step's config, the segment after
 * it, in first-seen order. (`inputNamesOf(graph, TEMPLATE_REFERENCES, 'run')`
 * lists what a run must be given.)
 */
export function inputNamesOf(graph, syntax, scope) {
    const names = new Set();
    const prefix = `${scope}.`;
    const walk = (value) => {
        if (typeof value === 'string') {
            for (const m of syntax.find(value)) {
                if (!m.path.startsWith(prefix)) continue;
                const rest = m.path.slice(prefix.length);
                const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)?.[0];
                if (name) names.add(name);
            }
        } else if (Array.isArray(value)) {
            value.forEach(walk);
        } else if (value && typeof value === 'object') {
            Object.values(value).forEach(walk);
        }
    };
    for (const n of graph?.nodes || []) walk(n.config);
    return [...names];
}
