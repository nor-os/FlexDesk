/**
 * THE LANE LAYOUT — a data flow drawn as lanes, left to right (36 §7.3).
 * PURE: no DOM, no clock; runs under plain node.
 *
 *     const layout = layoutLanes(pipeline, catalogue);
 *     const placed = placeLanes(layout, 'regular');     // or 'small', 'strip'
 *
 * The flow is the pipeline JSON — `{nodes, connections: [{id, sourceId,
 * sourcePort, targetId, targetPort}], parameters}` — and the catalogue is the
 * kit's (`createStepCatalogue`), read for each step's FLOW ports in their
 * DECLARED order: a step's first input is its LANE input, every further input
 * takes a lane from elsewhere (a join's second side), and its first output is
 * its continuation.
 *
 * ══ THE RULES ══════════════════════════════════════════════════════════
 *
 *  1. ROOTS are the steps with nothing connected to their lane input — the
 *     sources, and any step left unconnected (its lane flagged), in `nodes`
 *     order.
 *  2. A LANE starts at a root and follows the step that takes its output ON
 *     ITS LANE INPUT. A step belongs to the lane that feeds its lane input —
 *     never to whichever lane reached it first. An output that feeds several
 *     steps' lane inputs is a FORK: the first, in connection order, goes on in
 *     the lane, and each other starts a lane below. An output that feeds
 *     another step's OTHER input makes this lane a FEEDER of that join.
 *  3. COLUMNS: a root is column 0 and every other step is one more than the
 *     latest of the steps that feed it. Then each feeder lane is SHIFTED RIGHT
 *     as a whole until the card that feeds the join sits one column before it
 *     — never left of where the first pass put it, and never so far that the
 *     join itself would move. Forks and nested feeders are re-settled until
 *     nothing moves.
 *  4. LANE ORDER, top to bottom: the root lanes in `nodes` order, each followed
 *     directly by its feeders (by their join's column), then its forks (by
 *     their fork's column), each of those followed by its own, recursively.
 *  5. WIRES are computed from the grid, never measured from the page: `lane`,
 *     card to next card; `join`, from the feeding card right and then up into
 *     the join's bottom; `fork`, from the forking card's bottom down and then
 *     right into the new lane's first card.
 *
 * ══ TWO DEFECTS OF THE EARLIER LAYOUT, LEFT BEHIND ═════════════════════
 *
 * The lane layout this ports gave a join to WHICHEVER LANE REACHED IT FIRST,
 * which depended on the order of the nodes array: list the feeding source
 * first and the join, and everything after it, moved into the feeder's lane.
 * Rule 2 is the fix. And it measured its wires from the page after every
 * rebuild, so nothing about them could be tested without a browser; rule 5 is
 * the fix, and `placeLanes` is what the stylesheet is held to.
 *
 * ══ WHAT IT REFUSES ════════════════════════════════════════════════════
 *
 * Three shapes cannot be drawn honestly as lanes, and each is a `problem`
 * that opens the editor READ-ONLY with its sentence (the graph is drawn as
 * best it can be, and never repaired): a step whose lane input two
 * connections feed (`lanes_two_inputs`), a cycle (`lanes_cycle`, broken for
 * drawing at the first step of it in `nodes` order), and two steps with one id
 * (`lanes_duplicate_step`; the second is not drawn).
 */

/** The three sizes a lane is drawn at — each the numbers of the mock it comes from. */
export const LANE_GEOMETRY = Object.freeze({
    /** The lane editor. `x = left + column·(width + gap)`, `laneTop = lane·(height + 2·lanePad + laneGap)`. */
    regular: Object.freeze({
        name: 'regular', width: 200, height: 62, gap: 30, lanePad: 12, laneGap: 26, left: 12, right: 12,
        notch: 12, tipInset: 4, wireIn: 12, radius: 10, portDot: true,
    }),
    /** The lane editor in a narrower host (two lines a card). */
    small: Object.freeze({
        name: 'small', width: 160, height: 50, gap: 24, lanePad: 8, laneGap: 18, left: 10, right: 10,
        notch: 10, tipInset: 4, wireIn: 10, radius: 10, portDot: true,
    }),
    /** The compact strip: a title a card, nothing to press. */
    strip: Object.freeze({
        name: 'strip', width: 92, height: 26, gap: 10, lanePad: 0, laneGap: 14, left: 0, right: 0,
        notch: 8, tipInset: 2, wireIn: 6, radius: 10, portDot: false,
    }),
});

/** The regular card's numbers, by the names the mock gives them. */
export const CW = LANE_GEOMETRY.regular.width;
export const CH = LANE_GEOMETRY.regular.height;
export const GAP = LANE_GEOMETRY.regular.gap;
export const LANE_PAD = LANE_GEOMETRY.regular.lanePad;
export const LANE_GAP = LANE_GEOMETRY.regular.laneGap;

export const LAYOUT_STRINGS = Object.freeze({
    lanes_two_inputs: (name) => `‘${name}’ takes its lane from two steps at once, so the flow cannot be drawn `
        + 'as lanes.',
    lanes_cycle: (name) => `‘${name}’ leads back to itself through the steps after it, so the flow cannot be `
        + 'drawn as lanes.',
    lanes_duplicate_step: (id) => `Two steps are called ‘${id}’, so the flow cannot be drawn as lanes.`,
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function unique(list) {
    return [...new Set(list)];
}

/**
 * A step's FLOW ports as a lane reads them: `{known, role, laneInput, inputs,
 * continuation, outputs}`. A type the catalogue does not know is read from the
 * connections it has, in connection order.
 */
export function stepPorts(catalogue, node, connections = []) {
    const type = catalogue?.get?.(node?.type) ?? null;
    const conns = Array.isArray(connections) ? connections : [];
    let inputs;
    let outputs;
    if (type) {
        inputs = catalogue.inputs(node.type, { flow: true }).map((p) => p.name);
        outputs = catalogue.outputs(node.type, { flow: true }).map((p) => p.name);
    } else {
        inputs = unique(conns.filter((c) => c.targetId === node?.id).map((c) => String(c.targetPort ?? 'in')));
        outputs = unique(conns.filter((c) => c.sourceId === node?.id).map((c) => String(c.sourcePort ?? 'out')));
    }
    return {
        known: Boolean(type),
        role: type ? (type.role || 'transform') : null,
        laneInput: inputs[0] ?? null,
        inputs,
        continuation: outputs[0] ?? null,
        outputs,
    };
}

/** A step's name for a sentence: its label, its type's label, its id. */
function nameOf(catalogue, node) {
    return node?.label || catalogue?.get?.(node?.type)?.label || String(node?.id ?? '');
}

/**
 * Lay a data flow out as lanes.
 *
 * @param {{nodes: object[], connections: object[]}} pipeline
 * @param {object} catalogue   the kit's step catalogue
 * @param {object} [o]
 * @param {object} [o.strings] the problems' sentences (`LAYOUT_STRINGS` by default)
 * @returns {{lanes: {index, steps: {id, column}[], feeds: {from, to, port}[], forkOf: string|null,
 *            unconnected: boolean, parent: number|null, kind: 'root'|'fork'|'feeder'}[],
 *           wires: {kind: 'lane'|'join'|'fork', from, to, toPort, connection, slot?, slots?, cycle?}[],
 *           at: Object<string, {lane, column, position}>, columns: number,
 *           problems: {code, node_id, message}[]}}
 */
export function layoutLanes(pipeline, catalogue, { strings = null } = {}) {
    const S = { ...LAYOUT_STRINGS, ...(isObject(strings) ? strings : {}) };
    const problems = [];

    // ── the steps, once each ─────────────────────────────────────────────
    const nodes = [];
    const byId = new Map();
    for (const n of Array.isArray(pipeline?.nodes) ? pipeline.nodes : []) {
        if (!isObject(n)) continue;
        const id = String(n.id);
        if (byId.has(id)) {
            if (!problems.some((p) => p.code === 'lanes_duplicate_step' && p.node_id === id)) {
                problems.push({ code: 'lanes_duplicate_step', node_id: id, message: S.lanes_duplicate_step(id) });
            }
            continue;
        }
        byId.set(id, n);
        nodes.push(n);
    }
    const order = new Map(nodes.map((n, i) => [String(n.id), i]));
    const ids = nodes.map((n) => String(n.id));

    // ── the connections whose ends are both steps ────────────────────────
    const conns = [];
    (Array.isArray(pipeline?.connections) ? pipeline.connections : []).forEach((c, index) => {
        if (!isObject(c)) return;
        const source = String(c.sourceId);
        const target = String(c.targetId);
        if (!byId.has(source) || !byId.has(target)) return;
        conns.push({ index, id: c.id ?? null, source, target, sourcePort: String(c.sourcePort ?? 'out'),
                     targetPort: String(c.targetPort ?? 'in'), ignored: false });
    });
    const rawConns = conns.map((c) => ({ id: c.id, sourceId: c.source, targetId: c.target,
                                         sourcePort: c.sourcePort, targetPort: c.targetPort }));
    const ports = new Map(nodes.map((n) => [String(n.id), stepPorts(catalogue, n, rawConns)]));

    // ── the order steps run in, breaking a cycle where it must be ────────
    const incoming = new Map(ids.map((id) => [id, []]));
    const outgoing = new Map(ids.map((id) => [id, []]));
    for (const c of conns) {
        incoming.get(c.target).push(c);
        outgoing.get(c.source).push(c);
    }
    const indeg = new Map(ids.map((id) => [id, incoming.get(id).length]));
    const topo = [];
    const done = new Set();
    const ready = ids.filter((id) => indeg.get(id) === 0);
    const release = (id) => {
        done.add(id);
        topo.push(id);
        for (const c of outgoing.get(id)) {
            if (c.ignored) continue;
            indeg.set(c.target, indeg.get(c.target) - 1);
            if (indeg.get(c.target) === 0 && !done.has(c.target)) ready.push(c.target);
        }
    };
    while (topo.length < ids.length) {
        if (ready.length) {
            const id = ready.shift();
            if (!done.has(id)) release(id);
            continue;
        }
        // Nothing is ready: the steps left wait on each other. Break the cycle at
        // the first of them in `nodes` order, by setting aside every line into it
        // from a step that has not run yet.
        const first = ids.find((id) => !done.has(id));
        for (const c of incoming.get(first)) {
            if (!done.has(c.source) && !c.ignored) {
                c.ignored = true;
                indeg.set(first, indeg.get(first) - 1);
            }
        }
        problems.push({ code: 'lanes_cycle', node_id: first, message: S.lanes_cycle(nameOf(catalogue, byId.get(first))) });
        if (indeg.get(first) === 0) ready.push(first);
    }

    // ── which line feeds each step's lane input ──────────────────────────
    const laneFeed = new Map();
    for (const id of ids) {
        const lane = ports.get(id).laneInput;
        if (lane === null) continue;
        const into = incoming.get(id).filter((c) => c.targetPort === lane);
        if (into.length > 1) {
            problems.push({ code: 'lanes_two_inputs', node_id: id,
                            message: S.lanes_two_inputs(nameOf(catalogue, byId.get(id))) });
        }
        const feed = into.find((c) => !c.ignored);
        if (feed) laneFeed.set(id, feed);
    }
    const successors = new Map(ids.map((id) => [id, []]));
    for (const [target, c] of [...laneFeed.entries()].sort((a, b) => a[1].index - b[1].index)) {
        successors.get(c.source).push(target);
    }

    // ── the lanes, in the order they are found ───────────────────────────
    const laneOf = new Map();
    const created = [];
    const build = (root, forkOf) => {
        const lane = {
            steps: [], feeds: [], forkOf, parent: null, kind: forkOf === null ? 'root' : 'fork',
            unconnected: ports.get(root).laneInput !== null && !laneFeed.has(root),
        };
        created.push(lane);
        const forks = [];
        let current = root;
        while (current !== null && !laneOf.has(current)) {
            laneOf.set(current, lane);
            lane.steps.push(current);
            const next = successors.get(current).filter((t) => !laneOf.has(t));
            for (const f of next.slice(1)) forks.push([current, f]);
            current = next[0] ?? null;
        }
        for (const [from, to] of forks) if (!laneOf.has(to)) build(to, from);
    };
    for (const id of ids) if (!laneFeed.has(id) && !laneOf.has(id)) build(id, null);
    for (const id of ids) if (!laneOf.has(id)) build(id, null);

    // ── feeds: a line into any input but the lane's ──────────────────────
    const feedsInto = new Map();
    for (const c of conns) {
        if (laneFeed.get(c.target) === c) continue;
        laneOf.get(c.source).feeds.push({ from: c.source, to: c.target, port: c.targetPort, index: c.index });
        if (!feedsInto.has(c.target)) feedsInto.set(c.target, []);
        feedsInto.get(c.target).push(c);
    }
    for (const lane of created) {
        if (lane.forkOf !== null) {
            lane.parent = laneOf.get(lane.forkOf);
            continue;
        }
        const out = lane.feeds.find((f) => laneOf.get(f.to) !== lane);
        if (out) {
            lane.parent = laneOf.get(out.to);
            lane.kind = 'feeder';
        }
    }

    // ── columns: longest path, then the feeders pulled right ─────────────
    const preds = new Map(ids.map((id) => [id, incoming.get(id).filter((c) => !c.ignored).map((c) => c.source)]));
    const settle = (floor) => {
        const col = new Map();
        for (const id of topo) {
            let c = floor.get(id) ?? 0;
            for (const p of preds.get(id)) c = Math.max(c, col.get(p) + 1);
            col.set(id, c);
        }
        return col;
    };
    let floor = new Map();
    let col = settle(floor);
    let moved = true;
    for (let pass = 0; moved && pass <= ids.length + 1; pass += 1) {
        moved = false;
        for (const lane of created) {
            const out = lane.feeds.filter((f) => laneOf.get(f.to) !== lane && !isIgnored(conns, f));
            if (!out.length) continue;
            let want = Infinity;
            for (const f of out) want = Math.min(want, col.get(f.to) - 1 - col.get(f.from));
            for (let shift = want; shift >= 1; shift -= 1) {
                const trial = new Map(floor);
                for (const id of lane.steps) trial.set(id, col.get(id) + shift);
                const next = settle(trial);
                // A feeder may move up to its join, never move the join.
                if (out.every((f) => next.get(f.to) === col.get(f.to))) {
                    floor = trial;
                    col = next;
                    moved = true;
                    break;
                }
            }
        }
    }

    // ── lane order: each lane, then its feeders, then its forks ──────────
    const created_ = new Map(created.map((l, i) => [l, i]));
    const children = new Map(created.map((l) => [l, []]));
    for (const l of created) if (l.parent && l.parent !== l) children.get(l.parent).push(l);
    const attach = (l) => {
        if (l.kind === 'fork') return col.get(l.forkOf);
        const f = l.feeds.find((x) => laneOf.get(x.to) === l.parent);
        return f ? col.get(f.to) : 0;
    };
    const ordered = [];
    const placed = new Set();
    const visit = (lane) => {
        if (placed.has(lane)) return;
        placed.add(lane);
        ordered.push(lane);
        const kids = children.get(lane).slice().sort((a, b) => ((a.kind === 'fork') - (b.kind === 'fork'))
            || (attach(a) - attach(b)) || (created_.get(a) - created_.get(b)));
        for (const k of kids) visit(k);
    };
    for (const l of created) if (!l.parent) visit(l);
    // A lane whose parents lead round in a circle (each feeds the other) has
    // no top: the first of them found is put at the top.
    for (const l of created) if (!placed.has(l)) visit(l);
    const indexOf = new Map(ordered.map((l, i) => [l, i]));

    const at = {};
    const lanes = ordered.map((l, index) => {
        l.steps.forEach((id, position) => { at[id] = { lane: index, column: col.get(id), position }; });
        return {
            index,
            steps: l.steps.map((id) => ({ id, column: col.get(id) })),
            feeds: l.feeds.map((f) => ({ from: f.from, to: f.to, port: f.port })),
            forkOf: l.forkOf,
            unconnected: l.unconnected,
            parent: l.parent && l.parent !== l ? indexOf.get(l.parent) : null,
            kind: l.kind,
        };
    });

    // ── the wires, one a connection, in connection order ─────────────────
    const wires = [];
    for (const c of conns) {
        const base = { from: c.source, to: c.target, toPort: c.targetPort, connection: c.id };
        if (laneFeed.get(c.target) === c) {
            const a = at[c.source];
            const b = at[c.target];
            const next = a.lane === b.lane && b.position === a.position + 1;
            wires.push({ kind: next ? 'lane' : 'fork', ...base });
            continue;
        }
        const others = ports.get(c.target).inputs.filter((p) => p !== ports.get(c.target).laneInput);
        for (const x of feedsInto.get(c.target) || []) if (!others.includes(x.targetPort)) others.push(x.targetPort);
        const slot = Math.max(0, others.indexOf(c.targetPort));
        wires.push({ kind: 'join', ...base, slot, slots: Math.max(1, others.length), ...(c.ignored ? { cycle: true } : {}) });
    }

    const columns = ids.length ? Math.max(...ids.map((id) => col.get(id))) + 1 : 0;
    return { lanes, wires, at, columns, problems };
}

function isIgnored(conns, feed) {
    return conns.some((c) => c.ignored && c.index === feed.index);
}

// ── coordinates ──────────────────────────────────────────────────────────

const num = (v) => {
    const r = Math.round(v * 10) / 10;
    return Object.is(r, -0) ? '0' : String(r);
};

/**
 * An orthogonal path through `points`, each inner corner rounded by `radius`
 * (never more than half of either segment it joins).
 */
export function roundedPath(points, radius = 10) {
    const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
    if (!pts.length) return '';
    let d = `M${num(pts[0].x)} ${num(pts[0].y)}`;
    for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i];
        const prev = pts[i - 1];
        const next = pts[i + 1];
        if (!next) {
            d += p.x === prev.x ? `V${num(p.y)}` : p.y === prev.y ? `H${num(p.x)}` : `L${num(p.x)} ${num(p.y)}`;
            break;
        }
        const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
        const outLen = Math.hypot(next.x - p.x, next.y - p.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        const ux = Math.sign(p.x - prev.x);
        const uy = Math.sign(p.y - prev.y);
        const vx = Math.sign(next.x - p.x);
        const vy = Math.sign(next.y - p.y);
        const a = { x: p.x - ux * r, y: p.y - uy * r };
        const b = { x: p.x + vx * r, y: p.y + vy * r };
        d += a.x === prev.x ? `V${num(a.y)}` : a.y === prev.y ? `H${num(a.x)}` : `L${num(a.x)} ${num(a.y)}`;
        d += `Q${num(p.x)} ${num(p.y)} ${num(b.x)} ${num(b.y)}`;
        pts[i] = b;   // the next segment starts where the corner ends
    }
    return d;
}

/**
 * Put a layout on a grid: every band, card and wire in pixels.
 *
 * @param {ReturnType<typeof layoutLanes>} layout
 * @param {'regular'|'small'|'strip'|object} [geometry]  a name, or numbers over the regular ones
 * @returns {{geometry, width, height,
 *            bands: {index, top, height, unconnected}[],
 *            cards: {id, lane, column, x, y, w, h}[],
 *            wires: {kind, from, to, toPort, connection, d, points, port: {x, y}|null, cycle?}[]}}
 */
export function placeLanes(layout, geometry = 'regular') {
    const g = typeof geometry === 'string'
        ? (LANE_GEOMETRY[geometry] ?? LANE_GEOMETRY.regular)
        : { ...LANE_GEOMETRY.regular, ...(isObject(geometry) ? geometry : {}) };
    const band = g.height + 2 * g.lanePad;
    const colX = (c) => g.left + c * (g.width + g.gap);
    const laneTop = (l) => l * (band + g.laneGap);
    const cardY = (l) => laneTop(l) + g.lanePad;
    const mid = (l) => cardY(l) + g.height / 2;

    const bands = layout.lanes.map((l) => ({ index: l.index, top: laneTop(l.index), height: band,
                                             unconnected: l.unconnected }));
    const cards = [];
    for (const l of layout.lanes) {
        for (const s of l.steps) {
            cards.push({ id: s.id, lane: l.index, column: s.column, x: colX(s.column), y: cardY(l.index),
                         w: g.width, h: g.height });
        }
    }
    const wires = layout.wires.map((w) => {
        const a = layout.at[w.from];
        const b = layout.at[w.to];
        let points;
        let port = null;
        if (w.kind === 'lane') {
            points = [{ x: colX(a.column) + g.width - g.tipInset, y: mid(a.lane) },
                      { x: colX(b.column) + g.wireIn, y: mid(b.lane) }];
        } else if (w.kind === 'fork') {
            const fx = colX(a.column) + g.width / 2;
            const down = b.lane > a.lane;
            const fy = down ? cardY(a.lane) + g.height : cardY(a.lane);
            points = [{ x: fx, y: fy }, { x: fx, y: mid(b.lane) }, { x: colX(b.column) + g.wireIn, y: mid(b.lane) }];
        } else {
            const tx = colX(b.column) + (g.width * (w.slot + 1)) / (w.slots + 1);
            const sx = colX(a.column) + g.width - g.tipInset;
            if (a.lane > b.lane && tx > sx) {
                port = { x: tx, y: cardY(b.lane) + g.height };
                points = [{ x: sx, y: mid(a.lane) }, { x: tx, y: mid(a.lane) }, port];
            } else if (a.lane < b.lane && tx > sx) {
                port = { x: tx, y: cardY(b.lane) };
                points = [{ x: sx, y: mid(a.lane) }, { x: tx, y: mid(a.lane) }, port];
            } else {
                // The same lane, or a line that runs back (a cycle): under the
                // source's lane, along the gap, and up into the join's bottom.
                const gy = laneTop(a.lane) + band + g.laneGap / 2;
                const fx = colX(a.column) + g.width / 2;
                port = { x: tx, y: b.lane > a.lane ? cardY(b.lane) : cardY(b.lane) + g.height };
                points = [{ x: fx, y: cardY(a.lane) + g.height }, { x: fx, y: gy }, { x: tx, y: gy }, port];
            }
        }
        return { ...w, points, d: roundedPath(points, g.radius), port: g.portDot ? port : null };
    });
    const width = layout.columns ? colX(layout.columns - 1) + g.width + g.right : 0;
    const height = layout.lanes.length ? laneTop(layout.lanes.length - 1) + band : 0;
    return { geometry: g, width, height, bands, cards, wires };
}
