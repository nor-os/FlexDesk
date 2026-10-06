/**
 * WHICH STEPS ALWAYS RUN BEFORE THIS ONE — the one place the rule lives
 * (36 §3.7). PURE: no DOM, runs under plain node.
 *
 * *Insert a value* lists only the steps that ALWAYS run before the step being
 * edited, so a reference to a step that may not have run — the other arm of a
 * condition, a step that ends the run on an error — cannot be picked. The
 * answer is computed over FLOW edges with every loop's RETURN edges set aside
 * (an edge into a loop step's input other than its entry port is the line back
 * from the body, not a way in):
 *
 *  - a step's DOMINATORS from the start step — the steps on EVERY path to it;
 *  - EXCEPT that a fanout whose join waits for ALL its branches makes every
 *    step that always runs on each branch run before the join (and before
 *    everything after it): dominators read a parallel's branches as
 *    alternatives, and they are not. A join that goes on when the FIRST branch
 *    finishes contributes only the fanout, which dominates it anyway;
 *  - a step inside a loop's body has the loop before it, and the body steps
 *    before it on every path; a BODY STEP IS NEVER BEFORE A STEP AFTER THE
 *    LOOP, because the loop may visit no row;
 *  - a step in an arm has the arm's earlier steps, the block's head and
 *    whatever runs before the block — never a sibling arm's steps (which is
 *    what dominators give).
 *
 * The answer is nearest first: by the length of the shortest flow path from
 * each step to this one, then in the graph's node order.
 *
 * Roles are the catalogue's: `start`, `fanout`, `join`, `loop`. Which input a
 * loop is entered by, and which output its body leaves from, are the
 * consumer's port names (`loopPorts`); whether a join waits for every branch is
 * the consumer's setting (`waitsForAll`).
 */

export const DEFAULT_LOOP_PORTS = Object.freeze({ entry: 'in', next: 'next', body: 'body', done: 'done' });

const defaultWaitsForAll = (node) => (node?.config?.join ?? 'all') !== 'any';

function isFlowPort(catalogue, typeId, name, direction) {
    const port = catalogue?.port ? catalogue.port(typeId, name, direction) : null;
    return port ? (port.port_type || 'FLOW') === 'FLOW' : true;
}

/** The graph's flow structure: successors and predecessors, return edges left out. */
export function flowStructure(graph, catalogue, { loopPorts = DEFAULT_LOOP_PORTS } = {}) {
    const ports = { ...DEFAULT_LOOP_PORTS, ...loopPorts };
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const role = (id) => (catalogue?.role ? catalogue.role(byId.get(id)?.type) : 'step');
    const succ = new Map(nodes.map((n) => [n.id, []]));
    const pred = new Map(nodes.map((n) => [n.id, []]));
    const returns = [];
    for (const c of Array.isArray(graph?.connections) ? graph.connections : []) {
        const from = byId.get(c.source);
        const to = byId.get(c.target);
        if (!from || !to) continue;
        if (!isFlowPort(catalogue, from.type, c.sourcePort, 'output')
            || !isFlowPort(catalogue, to.type, c.targetPort, 'input')) continue;
        if (role(c.target) === 'loop' && c.targetPort !== ports.entry) { returns.push(c); continue; }
        succ.get(c.source).push({ id: c.target, port: c.sourcePort });
        pred.get(c.target).push({ id: c.source, port: c.sourcePort });
    }
    return { nodes, byId, role, succ, pred, returns, ports };
}

/** Every node reachable from `roots`, not entering `stop`. */
function reach(roots, succ, stop = null) {
    const seen = new Set();
    const queue = [...roots].filter((r) => r !== stop);
    for (const r of queue) seen.add(r);
    while (queue.length) {
        const id = queue.shift();
        for (const s of succ.get(id) || []) {
            if (s.id === stop || seen.has(s.id)) continue;
            seen.add(s.id);
            queue.push(s.id);
        }
    }
    return seen;
}

/**
 * Dominator sets over the nodes reachable from `roots` (several roots behave
 * as one virtual root above them). Map: node → Set of its dominators, itself
 * included. The iterative set-intersection form — a flow is a few dozen steps.
 */
function dominators(roots, succ, pred) {
    const live = reach(roots, succ);
    const rootSet = new Set(roots);
    const order = [...live];
    const dom = new Map();
    for (const id of order) dom.set(id, rootSet.has(id) ? new Set([id]) : new Set(order));
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of order) {
            if (rootSet.has(id)) continue;
            let acc = null;
            for (const p of pred.get(id) || []) {
                if (!live.has(p.id)) continue;
                const d = dom.get(p.id);
                acc = acc === null ? new Set(d) : new Set([...acc].filter((x) => d.has(x)));
            }
            const next = new Set(acc ?? []);
            next.add(id);
            const cur = dom.get(id);
            if (next.size !== cur.size || [...next].some((x) => !cur.has(x))) {
                dom.set(id, next);
                changed = true;
            }
        }
    }
    return dom;
}

/** A loop's body: what its body port leads to, not passing back through the loop. */
function bodyOf(structure, loopId) {
    const starts = (structure.succ.get(loopId) || [])
        .filter((s) => s.port === structure.ports.body).map((s) => s.id);
    return reach(starts, structure.succ, loopId);
}

/** Every loop and its body, for the loops in the graph. */
function loopBodies(structure) {
    const out = new Map();
    for (const n of structure.nodes) {
        if (structure.role(n.id) === 'loop') out.set(n.id, bodyOf(structure, n.id));
    }
    return out;
}

/**
 * The ids of the steps that always run before `stepId`, nearest first.
 *
 * @param {object} graph       `{nodes, connections}` (the logic-graph shape)
 * @param {object} catalogue   `createStepCatalogue`'s
 * @param {string} stepId
 * @param {object} [options]
 * @param {object} [options.loopPorts]          `{entry, next, body, done}`
 * @param {(node: object) => boolean} [options.waitsForAll]  does this join wait for every branch?
 */
export function alwaysBefore(graph, catalogue, stepId, { loopPorts = DEFAULT_LOOP_PORTS,
                                                         waitsForAll = defaultWaitsForAll } = {}) {
    const st = flowStructure(graph, catalogue, { loopPorts });
    if (!st.byId.has(stepId)) return [];
    let roots = st.nodes.filter((n) => st.role(n.id) === 'start').map((n) => n.id);
    if (!roots.length) roots = st.nodes.filter((n) => !(st.pred.get(n.id) || []).length).map((n) => n.id);
    const dom = dominators(roots, st.succ, st.pred);
    if (!dom.has(stepId)) return [];

    /** The nearest dominator of `id` (by `domMap`) whose role is `fanout`. */
    const nearestFanout = (id, domMap) => {
        const mine = domMap.get(id);
        if (!mine) return null;
        let best = null;
        for (const d of mine) {
            if (d === id || st.role(d) !== 'fanout') continue;
            if (best === null || domMap.get(d).size > domMap.get(best).size) best = d;
        }
        return best;
    };

    // What always runs on the branches of the fanout a join closes, memoised.
    const branchMemo = new Map();
    const branchSteps = (joinId, domMap) => {
        if (branchMemo.has(joinId)) return branchMemo.get(joinId);
        branchMemo.set(joinId, new Set());                       // a cycle guard
        const out = new Set();
        const fan = nearestFanout(joinId, domMap);
        if (fan !== null && waitsForAll(st.byId.get(joinId))) {
            for (const s of st.succ.get(fan) || []) {
                if (s.id === joinId) continue;                   // an empty branch
                const sub = dominators([s.id], st.succ, st.pred);
                const onEvery = sub.get(joinId);
                if (!onEvery) continue;                          // this branch never reaches the join
                for (const x of onEvery) {
                    if (x === joinId) continue;
                    out.add(x);
                    if (st.role(x) === 'join') for (const y of branchSteps(x, sub)) out.add(y);
                }
            }
        }
        branchMemo.set(joinId, out);
        return out;
    };

    const before = new Set([...dom.get(stepId)].filter((x) => x !== stepId));
    for (const j of [...before, stepId]) {
        if (st.role(j) === 'join') for (const x of branchSteps(j, dom)) if (x !== stepId) before.add(x);
    }

    // A body step is never before a step after (or outside) its loop.
    for (const [, body] of loopBodies(st)) {
        if (body.has(stepId)) continue;
        for (const b of body) before.delete(b);
    }

    // Nearest first: the shortest flow path from each step to this one.
    const dist = new Map([[stepId, 0]]);
    const queue = [stepId];
    while (queue.length) {
        const id = queue.shift();
        for (const p of st.pred.get(id) || []) {
            if (dist.has(p.id)) continue;
            dist.set(p.id, dist.get(id) + 1);
            queue.push(p.id);
        }
    }
    const index = new Map(st.nodes.map((n, i) => [n.id, i]));
    return [...before].sort((a, b) => ((dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))
        || (index.get(a) - index.get(b)));
}

/** The loops `stepId` is inside, innermost first. */
export function enclosingLoops(graph, catalogue, stepId, { loopPorts = DEFAULT_LOOP_PORTS } = {}) {
    const st = flowStructure(graph, catalogue, { loopPorts });
    const around = [];
    for (const [loopId, body] of loopBodies(st)) {
        if (body.has(stepId)) around.push({ loopId, size: body.size });
    }
    return around.sort((a, b) => a.size - b.size).map((x) => x.loopId);
}
