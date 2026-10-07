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
export function flowStructure(graph, catalogue, { loopPorts = DEFAULT_LOOP_PORTS, kindOf = null } = {}) {
    const ports = { ...DEFAULT_LOOP_PORTS, ...loopPorts };
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // `kindOf` (optional) reads a type's role through a consumer's mapping —
    // an outline whose catalogue spells its roles differently (36 §6.2).
    const role = typeof kindOf === 'function'
        ? (id) => kindOf(byId.get(id)?.type)
        : (id) => (catalogue?.role ? catalogue.role(byId.get(id)?.type) : 'step');
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

/** The roots a flow is walked from: its start steps, else the steps nothing leads to. */
function rootsOf(st) {
    const roots = st.nodes.filter((n) => st.role(n.id) === 'start').map((n) => n.id);
    return roots.length ? roots : st.nodes.filter((n) => !(st.pred.get(n.id) || []).length).map((n) => n.id);
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
    const dom = dominators(rootsOf(st), st.succ, st.pred);
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

/**
 * THE ARMS `stepId` IS INSIDE, innermost first: `[{head, port}]` (36 §3.7).
 *
 * *Insert a value* must know when the step being edited sits in an arm taken
 * on its head's FAILURE: there the head ran and failed, and on failure a
 * step's data output is empty — so the consumer offers that head by its error
 * output alone. The kit only REPORTS the port; which port means failure is
 * the consumer's mapping (an outline's `arms.error`).
 *
 * An arm is a line out of a step that is not the step's continuation: every
 * output of a branch, every line out of a fanout, a loop's outputs but `done`
 * (its `body` included), and an ordinary step's FLOW outputs but its continue
 * port. `stepId` is inside the arm `(head, port)` when EVERY flow path from
 * the start to it leaves `head` by that line (each loop's return lines set
 * aside, as `alwaysBefore` sets them aside) and it is not past the Merge that
 * closes the block — the run reaches it only after the head left by `port`.
 * So a step after the place the arms meet is inside none of them, and where a
 * branch's other arms all END, the rest of the flow is inside its live arm:
 * what the outline draws (36 §6.3).
 *
 * Over a block-shaped graph this IS the outline's nesting (the recogniser
 * suite holds the two equal over its corpus); over any other graph it is
 * still true of every run, which is why the canvas editor passes it too.
 *
 * @param {object} graph       `{nodes, connections}` (the logic-graph shape)
 * @param {object} catalogue   `createStepCatalogue`'s
 * @param {string} stepId
 * @param {object} [options]
 * @param {object} [options.loopPorts]          `{entry, next, body, done}`
 * @param {string|((node: object) => string|null)} [options.continuePort]  an ordinary step's
 *        continuation (default: its `out` FLOW output, else its first)
 * @param {(typeId: string) => string} [options.kindOf]  a type's role — `start`, `branch`, `fanout`,
 *        `join`, `loop`, or anything else for an ordinary step; default the catalogue's `role`
 */
export function enclosingArms(graph, catalogue, stepId, { loopPorts = DEFAULT_LOOP_PORTS, continuePort = null,
                                                         kindOf = null } = {}) {
    const st = flowStructure(graph, catalogue, { loopPorts, kindOf });
    if (!st.byId.has(stepId)) return [];
    const flowOutputs = (typeId) => (catalogue?.outputs ? catalogue.outputs(typeId, { flow: true }) : [])
        .map((p) => p.name);
    const cont = (node) => {
        if (typeof continuePort === 'function') return continuePort(node);
        if (typeof continuePort === 'string') return continuePort;
        const outs = flowOutputs(node?.type);
        return outs.includes('out') ? 'out' : (outs[0] ?? 'out');
    };
    const isArm = (headId, port) => {
        const r = st.role(headId);
        if (r === 'branch' || r === 'fanout') return true;
        if (r === 'loop') return port !== st.ports.done;
        return port !== cont(st.byId.get(headId));
    };

    // Each flow line becomes a node of its own, so that a LINE can dominate a step.
    const LINE = '\u0000line:';
    const succ = new Map();
    const pred = new Map();
    const lines = new Map();
    for (const n of st.nodes) { succ.set(n.id, []); pred.set(n.id, []); }
    for (const n of st.nodes) {
        for (const s of st.succ.get(n.id) || []) {
            const key = `${LINE}${lines.size}`;
            lines.set(key, { head: n.id, port: s.port });
            succ.set(key, [{ id: s.id }]);
            pred.set(key, [{ id: n.id }]);
            succ.get(n.id).push({ id: key });
            pred.get(s.id).push({ id: key });
        }
    }
    const dom = dominators(rootsOf(st), succ, pred);
    const mine = dom.get(stepId);
    if (!mine) return [];

    const out = [];
    for (const key of mine) {
        const line = lines.get(key);
        if (!line || !isArm(line.head, line.port)) continue;
        // Walk from the line down to the step: a Merge met with no Parallel
        // opened below the line closes the block, and the step is past it.
        const chain = [...mine].filter((x) => !lines.has(x) && dom.get(x).has(key))
            .sort((a, b) => dom.get(a).size - dom.get(b).size);
        let depth = 0;
        let past = false;
        for (const x of chain) {
            const r = st.role(x);
            if (r === 'join') {
                if (depth === 0) { past = true; break; }
                depth -= 1;
            } else if (r === 'fanout' && x !== stepId) depth += 1;
        }
        if (past || out.some((a) => a.head === line.head && a.port === line.port)) continue;
        out.push({ head: line.head, port: line.port, depth: dom.get(key).size });
    }
    return out.sort((a, b) => b.depth - a.depth).map(({ head, port }) => ({ head, port }));
}
