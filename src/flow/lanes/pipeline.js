/**
 * A DATA FLOW'S JSON, AND EVERY EDIT THE LANE EDITOR MAKES TO IT (36 §7.1).
 * PURE: no DOM; runs under plain node.
 *
 *     { nodes:       [{ id, type, label?, config, position? }],
 *       connections: [{ id, sourceId, sourcePort, targetId, targetPort }],
 *       parameters:  { name: { type, default?, description? } } }
 *
 * Two rules on top of the shape, each for a reason:
 *
 *  - **A step's name is a top-level `label`**, never a key inside `config`:
 *    a consumer may hash the config (a cache key), and renaming a step must
 *    not change what it computes.
 *  - **Connection ids are deterministic** — `c1`, `c2`, … the lowest free
 *    number — never a clock-derived id, so the same edits give the same bytes.
 *
 * A node's `position`, when present, is kept and never used; a new node has
 * none. Keys this module does not know — on the flow, a step or a connection —
 * are KEPT, never dropped: the editor is a view over the JSON, not a repair of
 * it.
 *
 * `serialisePipeline` is byte-stable: known keys in a fixed order, `config`
 * keys sorted (all the way down), any other key sorted after the known ones,
 * steps, connections and parameters in their stored order. A flow opened and
 * saved with no edit is the identical text.
 */

import { stepPorts } from './layout.js';

/** The edits the lane editor records — anything else is refused by its history. */
export const LANE_ACTIONS = Object.freeze([
    'flow:step:add', 'flow:step:remove', 'flow:step:label', 'flow:step:config', 'flow:join:set',
    'flow:source:add', 'flow:parameter:add', 'flow:parameter:change', 'flow:parameter:remove', 'flow:settings',
]);

/** A parameter's name: what a reference to it can spell. */
export const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The step ids a server accepts: letters, digits, `-` and `_`, at most 64. */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

const NODE_KEYS = ['id', 'type', 'label', 'config', 'position'];
const CONN_KEYS = ['id', 'sourceId', 'sourcePort', 'targetId', 'targetPort'];
const PARAM_KEYS = ['type', 'default', 'description'];
const TOP_KEYS = ['nodes', 'connections', 'parameters'];

export function emptyPipeline() {
    return { nodes: [], connections: [], parameters: {} };
}

/** A deep copy with every field the flow carries, defaults filled in. */
export function normalisePipeline(pipeline) {
    const p = isObject(pipeline) ? pipeline : emptyPipeline();
    const out = {
        nodes: (Array.isArray(p.nodes) ? p.nodes : []).filter(isObject).map((n) => {
            const node = { id: String(n.id), type: String(n.type ?? '') };
            if (n.label !== undefined && n.label !== null && String(n.label) !== '') node.label = String(n.label);
            node.config = isObject(n.config) ? clone(n.config) : {};
            if (n.position !== undefined && n.position !== null) node.position = clone(n.position);
            for (const k of Object.keys(n)) if (!NODE_KEYS.includes(k)) node[k] = clone(n[k]);
            return node;
        }),
        connections: (Array.isArray(p.connections) ? p.connections : []).filter(isObject).map((c) => {
            const conn = {};
            if (c.id !== undefined && c.id !== null) conn.id = String(c.id);
            conn.sourceId = String(c.sourceId);
            conn.sourcePort = String(c.sourcePort ?? 'out');
            conn.targetId = String(c.targetId);
            conn.targetPort = String(c.targetPort ?? 'in');
            for (const k of Object.keys(c)) if (!CONN_KEYS.includes(k)) conn[k] = clone(c[k]);
            return conn;
        }),
        parameters: isObject(p.parameters) ? clone(p.parameters) : {},
    };
    for (const k of Object.keys(p)) if (!TOP_KEYS.includes(k)) out[k] = clone(p[k]);
    return out;
}

function sortedKeys(value) {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys(value[k])]));
    return value;
}

/** Known keys first, in their order; every other key sorted after them. */
function ordered(obj, known, transform = {}) {
    const out = {};
    for (const k of known) {
        if (obj[k] === undefined) continue;
        out[k] = transform[k] ? transform[k](obj[k]) : obj[k];
    }
    for (const k of Object.keys(obj).filter((x) => !known.includes(x)).sort()) out[k] = sortedKeys(obj[k]);
    return out;
}

/** The text a save sends and a reload must reproduce exactly. */
export function serialisePipeline(pipeline) {
    const p = normalisePipeline(pipeline);
    const top = {
        nodes: p.nodes.map((n) => ordered(n, NODE_KEYS, { config: sortedKeys, position: sortedKeys })),
        connections: p.connections.map((c) => ordered(c, CONN_KEYS)),
        parameters: Object.fromEntries(Object.entries(p.parameters)
            .map(([k, v]) => [k, isObject(v) ? ordered(v, PARAM_KEYS, { default: sortedKeys }) : sortedKeys(v)])),
    };
    for (const k of Object.keys(p).filter((x) => !TOP_KEYS.includes(x)).sort()) top[k] = sortedKeys(p[k]);
    return JSON.stringify(top);
}

/** The lowest free `cN`. */
export function nextConnectionId(pipeline) {
    const taken = new Set((pipeline?.connections || []).map((c) => String(c.id)));
    for (let i = 1; ; i += 1) if (!taken.has(`c${i}`)) return `c${i}`;
}

/** A new step id for `typeId`: the catalogue's stem, then `stem-2`, `stem-3`, … */
export function nextStepId(pipeline, typeId, catalogue = null) {
    const base = catalogue?.idBase
        ? catalogue.idBase(typeId)
        : (String(typeId || 'step').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'step');
    const taken = new Set((pipeline?.nodes || []).map((n) => String(n.id)));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

const findNode = (p, id) => p.nodes.find((n) => n.id === id) ?? null;

/** A step's lane ports (`stepPorts` over this flow's connections). */
export function portsOf(pipeline, catalogue, id) {
    const node = findNode(pipeline, id);
    return node ? stepPorts(catalogue, node, pipeline.connections) : null;
}

/** The connection that feeds a step's lane input (the first, in connection order), or null. */
export function laneFeedOf(pipeline, catalogue, id) {
    const ports = portsOf(pipeline, catalogue, id);
    if (!ports || ports.laneInput === null) return null;
    return pipeline.connections.find((c) => c.targetId === id && c.targetPort === ports.laneInput) ?? null;
}

/** The connection into `id` at `port`, or null. */
export function inputOf(pipeline, id, port) {
    return pipeline.connections.find((c) => c.targetId === id && c.targetPort === port) ?? null;
}

/** Every step `id` leads to, by any line (not `id` itself, unless a cycle comes back to it). */
export function downstreamOf(pipeline, id) {
    const seen = new Set();
    const todo = [id];
    while (todo.length) {
        const at = todo.shift();
        for (const c of pipeline.connections) {
            if (c.sourceId !== at || seen.has(c.targetId)) continue;
            seen.add(c.targetId);
            todo.push(c.targetId);
        }
    }
    return seen;
}

/** Every step whose output reaches `id`, NEAREST FIRST (then in `nodes` order). */
export function upstreamOf(pipeline, id) {
    const dist = new Map();
    const todo = [[id, 0]];
    while (todo.length) {
        const [at, d] = todo.shift();
        for (const c of pipeline.connections) {
            if (c.targetId !== at || dist.has(c.sourceId) || c.sourceId === id) continue;
            dist.set(c.sourceId, d + 1);
            todo.push([c.sourceId, d + 1]);
        }
    }
    const order = new Map(pipeline.nodes.map((n, i) => [n.id, i]));
    return [...dist.keys()].sort((a, b) => (dist.get(a) - dist.get(b)) || ((order.get(a) ?? 0) - (order.get(b) ?? 0)));
}

function newNode(pipeline, catalogue, typeId, { id = null, label = null, config = null } = {}) {
    const nid = id && ID_OK.test(id) && !findNode(pipeline, id) ? id : nextStepId(pipeline, typeId, catalogue);
    return { id: nid, type: typeId, ...(label ? { label: String(label) } : {}),
             config: isObject(config) ? clone(config) : {} };
}

/**
 * Add a step of `typeId` after `afterId`, SPLICED between it and what it led
 * to (`A → new → B`): the line that went on in A's lane (else A's first line
 * out of its continuation) now leaves the new step, and a new line joins A to
 * the new step's lane input — put where the moved line was, so the new step
 * goes on in A's lane rather than starting a fork. A step with no output (a
 * sink) is not spliced: it is joined to A, beside what A already leads to.
 * Returns the new node, or null when `afterId` is not a step.
 */
export function addStepAfter(pipeline, catalogue, afterId, typeId, opts = {}) {
    const after = findNode(pipeline, afterId);
    if (!after) return null;
    const node = newNode(pipeline, catalogue, typeId, opts);
    pipeline.nodes.push(node);
    const a = stepPorts(catalogue, after, pipeline.connections);
    const n = stepPorts(catalogue, node, pipeline.connections);
    if (a.continuation === null || n.laneInput === null) return node;
    const outs = pipeline.connections.filter((c) => c.sourceId === afterId && c.sourcePort === a.continuation);
    const isLaneFeed = (c) => laneFeedOf(pipeline, catalogue, c.targetId) === c;
    const splice = n.continuation === null ? null : (outs.find(isLaneFeed) ?? outs[0] ?? null);
    const join = { id: nextConnectionId(pipeline), sourceId: afterId, sourcePort: a.continuation,
                   targetId: node.id, targetPort: n.laneInput };
    if (splice) {
        const at = pipeline.connections.indexOf(splice);
        splice.sourceId = node.id;
        splice.sourcePort = n.continuation;
        pipeline.connections.splice(at, 0, join);
    } else {
        pipeline.connections.push(join);
    }
    return node;
}

/** Add a source: a new step at the end of `nodes`, which starts the last lane. */
export function addSource(pipeline, catalogue, typeId, opts = {}) {
    const node = newNode(pipeline, catalogue, typeId, opts);
    pipeline.nodes.push(node);
    return node;
}

/**
 * Remove a step. Its LANE INPUT is reconnected to everything it led to — each
 * of its lines out keeps its id and its target, and now leaves the step that
 * fed this one — and every other line into it goes. A step nothing fed (a
 * source) leaves the steps after it unconnected, each the start of a lane
 * flagged so. Returns whether anything was removed.
 */
export function removeStep(pipeline, catalogue, id) {
    if (!findNode(pipeline, id)) return false;
    const feed = laneFeedOf(pipeline, catalogue, id);
    const kept = [];
    for (const c of pipeline.connections) {
        if (c.targetId === id) continue;
        if (c.sourceId === id) {
            if (!feed || feed.sourceId === c.targetId) continue;
            const twin = kept.some((k) => k.sourceId === feed.sourceId && k.sourcePort === feed.sourcePort
                && k.targetId === c.targetId && k.targetPort === c.targetPort);
            if (twin) continue;
            c.sourceId = feed.sourceId;
            c.sourcePort = feed.sourcePort;
        }
        kept.push(c);
    }
    pipeline.connections = kept;
    pipeline.nodes = pipeline.nodes.filter((n) => n.id !== id);
    return true;
}

/** May `sourceId` feed `stepId` without making a cycle? */
export function mayFeed(pipeline, stepId, sourceId) {
    if (!sourceId || sourceId === stepId) return false;
    return !downstreamOf(pipeline, stepId).has(sourceId);
}

/**
 * Feed `stepId`'s input `port` from `sourceId`'s continuation, or (`null`)
 * leave it unconnected. The line already there keeps its id; a new one takes
 * the lowest free. Refuses (returns false) a source that would make a cycle.
 */
export function setInput(pipeline, catalogue, stepId, port, sourceId) {
    if (!findNode(pipeline, stepId)) return false;
    const existing = pipeline.connections.filter((c) => c.targetId === stepId && c.targetPort === port);
    if (!sourceId) {
        if (!existing.length) return false;
        pipeline.connections = pipeline.connections.filter((c) => !existing.includes(c));
        return true;
    }
    const source = findNode(pipeline, sourceId);
    if (!source || !mayFeed(pipeline, stepId, sourceId)) return false;
    const out = stepPorts(catalogue, source, pipeline.connections).continuation ?? 'out';
    if (existing.length === 1 && existing[0].sourceId === sourceId && existing[0].sourcePort === out) return false;
    if (existing.length) {
        existing[0].sourceId = sourceId;
        existing[0].sourcePort = out;
        pipeline.connections = pipeline.connections.filter((c) => c === existing[0] || !existing.includes(c));
    } else {
        pipeline.connections.push({ id: nextConnectionId(pipeline), sourceId, sourcePort: out, targetId: stepId,
                                    targetPort: port });
    }
    return true;
}

/**
 * The steps that may feed `stepId`'s input — every step with an output that
 * would not make a cycle — in LANE order (lane by lane, left to right).
 */
export function inputCandidates(pipeline, catalogue, layout, stepId) {
    const below = downstreamOf(pipeline, stepId);
    const ok = (id) => id !== stepId && !below.has(id)
        && portsOf(pipeline, catalogue, id)?.continuation !== null;
    const out = [];
    for (const lane of layout?.lanes || []) {
        for (const s of lane.steps) if (ok(s.id)) out.push({ id: s.id, lane: lane.index, column: s.column });
    }
    return out;
}

// ── parameters ───────────────────────────────────────────────────────────

/**
 * Set a parameter, keeping its place among the others; `rename` gives it a new
 * name in the same place. `definition` is `{type, default?, description?}`.
 */
export function setParameter(pipeline, name, definition, { rename = null } = {}) {
    const def = {};
    if (definition?.type !== undefined) def.type = definition.type;
    if (definition?.default !== undefined) def.default = clone(definition.default);
    if (definition?.description !== undefined && definition.description !== '') def.description = definition.description;
    const from = rename ?? name;
    const entries = Object.entries(pipeline.parameters || {});
    const at = entries.findIndex(([k]) => k === from);
    if (at >= 0) entries.splice(at, 1, [name, def]);
    else entries.push([name, def]);
    pipeline.parameters = Object.fromEntries(entries.filter(([k], i) => k !== name || entries.findIndex(([x]) => x === k) === i));
    return pipeline.parameters[name];
}

export function removeParameter(pipeline, name) {
    if (!pipeline.parameters || !(name in pipeline.parameters)) return false;
    const { [name]: _gone, ...rest } = pipeline.parameters;
    pipeline.parameters = rest;
    return true;
}
