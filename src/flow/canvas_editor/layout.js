/**
 * The canvas editor's geometry — PURE: no DOM, runs under plain node.
 *
 *   CANVAS_NODE      a node's box: its width, its header's height and the
 *                    height of one row of ports. The edges are anchored by
 *                    ARITHMETIC over these, never by measuring, so the
 *                    stylesheet must agree with them — `flow_canvas_css` reads
 *                    the sheet and holds it to them.
 *   portAnchor       where a port's line starts or ends
 *   nodeBottom       where a node's drawn box ends
 *   isReturnEdge     is this line a loop's body going back round?
 *   layoutGraph      ARRANGE: every step's place, left to right in run order
 *   pathPoints       a drawn line's path, as the points along it
 *   pathMidpoint     the point halfway along a drawn line, where its label sits
 */

import { arrange } from '../../canvas/edge_router.js';

export const CANVAS_NODE = Object.freeze({ width: 208, header: 34, row: 22 });

/** The space under a node's last row of ports (its findings, its run line). */
const FOOT = 12;

const inputsOf = (catalogue, node) => (catalogue?.inputs ? catalogue.inputs(node?.type) : []);
const outputsOf = (catalogue, node) => (catalogue?.outputs ? catalogue.outputs(node?.type) : []);
const roleOf = (catalogue, node) => (catalogue?.role ? catalogue.role(node?.type) : 'step');

/**
 * The point a line meets `node`'s port `portName`: an input on the node's
 * left edge, an output on its right, one row of ports down from the header
 * per port before it — in the order the type DECLARES its ports, the order
 * they are drawn in. A port the type does not have anchors at the first row.
 */
export function portAnchor(catalogue, node, portName, direction, box = CANVAS_NODE) {
    const list = direction === 'input' ? inputsOf(catalogue, node) : outputsOf(catalogue, node);
    const i = Math.max(0, list.findIndex((p) => p.name === portName));
    return {
        x: node.position.x + (direction === 'input' ? 0 : box.width),
        y: node.position.y + box.header + box.row * i + box.row / 2,
        side: direction === 'input' ? 'left' : 'right',
    };
}

/** Where `node`'s drawn box ends — computed, because jsdom and a node not yet
 *  laid out both answer 0 for `offsetHeight`. */
export function nodeBottom(catalogue, node, box = CANVAS_NODE) {
    const rows = Math.max(inputsOf(catalogue, node).length, outputsOf(catalogue, node).length, 1);
    return node.position.y + box.header + box.row * rows + FOOT;
}

/**
 * Is `connection` a loop's body handing back to its loop — a line into a
 * `loop`-role step on any input but the one the loop is ENTERED by
 * (`loopEntry`)? The editor's reading of the shape, for drawing it; whether
 * the graph is a valid loop is the consumer's validator's.
 */
export function isReturnEdge(connection, target, catalogue, loopEntry = 'in') {
    return Boolean(target) && roleOf(catalogue, target) === 'loop' && connection.targetPort !== loopEntry;
}

/**
 * ARRANGE: where every step goes, left to right in the order a run takes them.
 * Returns a Map of node id → `{x, y}` from (0, 0); the editor anchors it at
 * the graph's current corner, so arranging never throws the graph off screen.
 *
 * It is the kernel's `arrange` (a layered layout), given what that function
 * needs and does not check for:
 *
 *  - **lines REVERSED.** `arrange` puts an edge's `from` one column right of
 *    its `to` (a reference points at what it references); a flow's line points
 *    at what runs NEXT, so `source → target` is handed over as
 *    `{from: target, to: source}`.
 *  - **a label on every node.** `arrange` sorts each column with
 *    `a.label.localeCompare`, which throws on a missing one. The label handed
 *    over is an ORDER KEY — a step's place in a breadth-first walk from the
 *    start step(s) that follows each step's outputs in the order its type
 *    declares them — so a condition's first arm sits above its second
 *    whatever the two steps are called.
 *  - **a loop's return lines left out.** The line from a loop's body back into
 *    the loop is the loop, not a dependency; followed, it would pull the body
 *    left of the loop that runs it. Any other cycle is broken by `arrange`.
 */
export function layoutGraph(graph, catalogue, { width = CANVAS_NODE.width, header = CANVAS_NODE.header,
                                                row = CANVAS_NODE.row, gap = 96, rowGap = 40,
                                                loopEntry = 'in' } = {}) {
    const nodes = graph?.nodes || [];
    const connections = graph?.connections || [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const portOrder = (n, port) => {
        const outs = outputsOf(catalogue, n);
        const i = outs.findIndex((p) => p.name === port);
        return i < 0 ? outs.length : i;
    };
    const isReturn = (c) => isReturnEdge(c, byId.get(c.target), catalogue, loopEntry);

    // The order key: breadth first from the start step(s), outputs in port order.
    const order = new Map();
    const queue = nodes.filter((n) => roleOf(catalogue, n) === 'start').map((n) => n.id);
    for (const id of queue) order.set(id, order.size);
    while (queue.length) {
        const id = queue.shift();
        const out = connections
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => c.source === id && byId.has(c.target) && !isReturn(c))
            .sort((a, b) => (portOrder(byId.get(id), a.c.sourcePort) - portOrder(byId.get(id), b.c.sourcePort))
                || (a.i - b.i));
        for (const { c } of out) {
            if (!order.has(c.target)) { order.set(c.target, order.size); queue.push(c.target); }
        }
    }
    for (const n of nodes) if (!order.has(n.id)) order.set(n.id, order.size);

    const rows = (n) => Math.max(inputsOf(catalogue, n).length, outputsOf(catalogue, n).length);
    return arrange(
        nodes.map((n) => ({ id: n.id, label: String(order.get(n.id)).padStart(6, '0'),
                            height: header + row * rows(n) + 24 })),
        connections.filter((c) => !isReturn(c)).map((c) => ({ from: c.target, to: c.source })),
        { columnGap: width + gap, rowGap },
    );
}

/** Points per curve segment of a sampled path: enough that a label's place
 *  and a crossing test agree with what the browser draws to within a pixel. */
const CURVE_STEPS = 24;

/**
 * The points along an SVG path `d`, as the kernel writes them: absolute `M`,
 * `L`, `C`, `S` and `Z`, numbers separated by spaces or commas. Each curve is
 * sampled at `steps` points; a straight run is its two ends. Computed rather
 * than asked of the browser (`getPointAtLength`), because jsdom has no
 * geometry and a label must sit in the same place in both.
 */
export function pathPoints(d, { steps = CURVE_STEPS } = {}) {
    const tokens = String(d || '').match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?|[A-Za-z]/g) || [];
    const points = [];
    let at = null;
    let lastControl = null;
    let opened = null;
    let i = 0;
    const num = () => Number(tokens[i++]);
    const cubic = (c1, c2, end) => {
        for (let k = 1; k <= steps; k += 1) {
            const t = k / steps;
            const u = 1 - t;
            points.push({
                x: u * u * u * at.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
                y: u * u * u * at.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
            });
        }
        lastControl = c2;
        at = end;
    };
    while (i < tokens.length) {
        const command = tokens[i++];
        if (command === 'M') {
            at = { x: num(), y: num() };
            opened = at;
            points.push(at);
            lastControl = null;
        } else if (command === 'Z') {
            at = opened;
            points.push(at);
            lastControl = null;
        } else if (command === 'L') {
            at = { x: num(), y: num() };
            points.push(at);
            lastControl = null;
        } else if (command === 'C') {
            const c1 = { x: num(), y: num() };
            const c2 = { x: num(), y: num() };
            cubic(c1, c2, { x: num(), y: num() });
        } else if (command === 'S') {
            const c1 = lastControl ? { x: 2 * at.x - lastControl.x, y: 2 * at.y - lastControl.y } : at;
            const c2 = { x: num(), y: num() };
            cubic(c1, c2, { x: num(), y: num() });
        } else {
            throw new Error(`pathPoints reads M, L, C, S and Z only, not "${command}".`);
        }
    }
    return points;
}

/** The point halfway along `d`, by length. */
export function pathMidpoint(d) {
    const points = pathPoints(d);
    if (points.length < 2) return points[0] ? { ...points[0] } : { x: 0, y: 0 };
    const lengths = [0];
    for (let k = 1; k < points.length; k += 1) {
        lengths.push(lengths[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
    }
    const half = lengths[lengths.length - 1] / 2;
    let k = 1;
    while (k < lengths.length - 1 && lengths[k] < half) k += 1;
    const span = lengths[k] - lengths[k - 1];
    const t = span > 0 ? (half - lengths[k - 1]) / span : 0;
    return { x: points[k - 1].x + (points[k].x - points[k - 1].x) * t,
             y: points[k - 1].y + (points[k].y - points[k - 1].y) * t };
}
