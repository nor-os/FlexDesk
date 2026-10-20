/**
 * A LAYERED LAYOUT for any directed graph — PURE: no DOM, runs under plain node.
 *
 *     layeredLayout(nodes, edges, {rank, sizeOf, columnGap, rowGap, componentGap})
 *       → Map of node id → {x, y}, the top-left corner of each node's box, from (0, 0)
 *
 * The kernel's `arrange` stays what Tables' diagrams were built on (an edge
 * from child to parent, columns sorted by label). This one reads an edge the
 * way a diagram is read — `{from, to}` puts `from` LEFT of `to` — and, in
 * order:
 *
 *  1. **separate components.** Nodes no line joins are laid out on their own
 *     and stacked top to bottom, the largest first, `componentGap` apart, so
 *     two of them never overlap.
 *  2. **cycles broken.** A depth-first walk in the order the nodes are given
 *     turns each line back to a node still on the walk round; nothing hangs.
 *  3. **longest-path columns.** A node sits one column right of the furthest
 *     of the nodes that lead to it.
 *  4. **rank hints.** `rank(node)` may answer `'source'` (the first column) or
 *     `'sink'` (the last column of its component); a line INTO a source or OUT
 *     of a sink then pulls nothing. Anything else is no hint.
 *  5. **crossing reduction.** Barycentre sweeps, down the columns and back,
 *     each node to the mean place of its neighbours in the column it is swept
 *     from (a node with none keeps its place, the sort is stable). The order
 *     with the FEWEST crossings between neighbouring columns is kept — the
 *     order the nodes were given included, so a sweep never makes it worse.
 *  6. **measured sizes.** `sizeOf(node)` → `{width, height}` (default: the
 *     node's own `width`/`height`, else 160 × 80). A column is as wide as its
 *     widest node, `columnGap` before the next; a column's nodes are
 *     `rowGap` apart and the column is centred on its component's height.
 *
 * Unknown ends, a node's line to itself and a repeated line are ignored. A
 * second node with an id already seen is left out.
 */

const DEFAULT_SIZE = Object.freeze({ width: 160, height: 80 });

const defaultSizeOf = (node) => ({ width: Number(node?.width) || DEFAULT_SIZE.width,
                                   height: Number(node?.height) || DEFAULT_SIZE.height });

/** Crossings between two neighbouring columns: the pairs of lines whose ends come in opposite orders. */
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

/**
 * @param {{id: string}[]} nodes
 * @param {{from: string, to: string}[]} edges  `from` is laid out left of `to`
 * @param {object} [options]
 * @param {(node: object) => ('source'|'sink'|null|undefined)} [options.rank]
 * @param {(node: object) => {width: number, height: number}} [options.sizeOf]
 * @param {number} [options.columnGap=64]     between the widest node of a column and the next column
 * @param {number} [options.rowGap=32]        between two nodes of a column
 * @param {number} [options.componentGap=80]  between two components, stacked top to bottom
 * @param {number} [options.passes=8]         barycentre sweeps (each one down and back)
 * @returns {Map<string, {x: number, y: number}>}
 */
export function layeredLayout(nodes, edges, { rank = null, sizeOf = null, columnGap = 64, rowGap = 32,
                                              componentGap = 80, passes = 8 } = {}) {
    const list = [];
    const index = new Map();
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (!node || node.id === undefined || node.id === null || index.has(String(node.id))) continue;
        index.set(String(node.id), list.length);
        list.push(node);
    }
    const count = list.length;
    const positions = new Map();
    if (!count) return positions;

    const hint = list.map((n) => {
        const r = typeof rank === 'function' ? rank(n) : null;
        return r === 'source' || r === 'sink' ? r : null;
    });
    const measure = typeof sizeOf === 'function' ? sizeOf : defaultSizeOf;
    const size = list.map((n) => {
        const s = measure(n) || {};
        return { width: Math.max(0, Number(s.width) || 0), height: Math.max(0, Number(s.height) || 0) };
    });

    // ── the lines, deduplicated, both ways ─────────────────────────────
    const out = Array.from({ length: count }, () => []);
    const near = Array.from({ length: count }, () => []);
    const seen = new Set();
    const lines = [];
    for (const e of Array.isArray(edges) ? edges : []) {
        const u = index.get(String(e?.from));
        const v = index.get(String(e?.to));
        if (u === undefined || v === undefined || u === v) continue;
        const key = `${u}>${v}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out[u].push(v);
        lines.push([u, v]);
        if (!seen.has(`${u}~${v}`)) {
            seen.add(`${u}~${v}`); seen.add(`${v}~${u}`);
            near[u].push(v); near[v].push(u);
        }
    }

    // ── 1. components, the largest first, then in the order given ─────
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
            for (const v of near[u]) if (componentOf[v] < 0) { componentOf[v] = components.length; stack.push(v); }
        }
        members.sort((a, b) => a - b);
        components.push(members);
    }
    const ordered = components.map((m, i) => ({ m, i })).sort((a, b) => (b.m.length - a.m.length) || (a.i - b.i));
    const linesOf = components.map(() => []);
    for (const line of lines) linesOf[componentOf[line[0]]].push(line);

    // ── 2. cycles broken: a line back onto the walk is turned round ────
    const reversed = new Set();
    const state = new Uint8Array(count); // 0 new, 1 on the walk, 2 done
    for (let s = 0; s < count; s++) {
        if (state[s]) continue;
        const stack = [[s, 0]];
        state[s] = 1;
        while (stack.length) {
            const top = stack[stack.length - 1];
            const [u, k] = top;
            if (k < out[u].length) {
                top[1] = k + 1;
                const v = out[u][k];
                if (state[v] === 1) reversed.add(`${u}>${v}`);
                else if (state[v] === 0) { state[v] = 1; stack.push([v, 0]); }
            } else {
                state[u] = 2;
                stack.pop();
            }
        }
    }

    // The lines that decide columns: acyclic, none into a source or out of a sink.
    const preds = Array.from({ length: count }, () => []);
    const succs = Array.from({ length: count }, () => []);
    for (const [u0, v0] of lines) {
        const [u, v] = reversed.has(`${u0}>${v0}`) ? [v0, u0] : [u0, v0];
        if (hint[v] === 'source' || hint[u] === 'sink') continue;
        preds[v].push(u);
        succs[u].push(v);
    }

    // ── 3. longest path, in topological order ──────────────────────────
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
        // ── 4. rank hints: sources first, sinks last, no empty column ─
        let last = -1;
        for (const u of m) if (hint[u] !== 'sink') last = Math.max(last, hint[u] === 'source' ? 0 : layer[u]);
        for (const u of m) {
            if (hint[u] === 'source') layer[u] = 0;
            else if (hint[u] === 'sink') layer[u] = last + 1;
        }
        const used = [...new Set(m.map((u) => layer[u]))].sort((a, b) => a - b);
        const renumber = new Map(used.map((l, i) => [l, i]));
        const columns = used.map(() => []);
        for (const u of m) { layer[u] = renumber.get(layer[u]); columns[layer[u]].push(u); }

        // ── 5. crossing reduction ──────────────────────────────────────
        const place = new Map();
        const remember = () => { for (const c of columns) c.forEach((u, i) => place.set(u, i)); };
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
            const centre = new Map();
            for (const u of column) {
                let sum = 0;
                let k = 0;
                for (const v of near[u]) {
                    if (from(layer[v])) { sum += place.get(v); k++; }
                }
                centre.set(u, k ? sum / k : place.get(u));
            }
            column.sort((a, b) => (centre.get(a) - centre.get(b)) || (place.get(a) - place.get(b)));
            column.forEach((u, i) => place.set(u, i));
        };
        let best = crossings();
        let bestColumns = columns.map((c) => [...c]);
        for (let p = 0; p < passes && best > 0; p++) {
            for (let l = 1; l < columns.length; l++) sweep(l, (x) => x < l);
            for (let l = columns.length - 2; l >= 0; l--) sweep(l, (x) => x > l);
            const now = crossings();
            if (now < best) { best = now; bestColumns = columns.map((c) => [...c]); }
        }

        // ── 6. measured sizes ─────────────────────────────────────────
        const widths = bestColumns.map((c) => Math.max(0, ...c.map((u) => size[u].width)));
        const heights = bestColumns.map((c) => c.reduce((h, u) => h + size[u].height, 0)
                                               + rowGap * Math.max(0, c.length - 1));
        const tallest = Math.max(0, ...heights);
        let x = 0;
        bestColumns.forEach((c, l) => {
            let y = top + (tallest - heights[l]) / 2;
            for (const u of c) {
                positions.set(String(list[u].id), { x, y });
                y += size[u].height + rowGap;
            }
            x += widths[l] + columnGap;
        });
        top += tallest + componentGap;
    }
    return positions;
}
