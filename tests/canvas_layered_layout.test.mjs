/**
 * THE KERNEL'S LAYERED LAYOUT, PURE — runs under plain node.
 *
 *   §1  a chain A→B→C is three columns, left to right, on one line; an empty
 *       graph is an empty Map; unknown ends, self lines and repeats are ignored
 *   §2  rank hints: 'sink' in the last column, 'source' in the first, even
 *       against the lines
 *   §3  crossing reduction: a crossing-prone two-layer fixture ends with fewer
 *       crossings than the order it was given in; a cycle does not hang
 *   §4  components: two disconnected ones do not overlap, the larger on top
 *   §5  measured sizes: a column is as wide as its widest node, rows `rowGap`
 *       apart, columns `columnGap` apart
 *   §6  300 nodes and 400 edges in under 200 ms
 *
 *     node tests/canvas_layered_layout.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { layeredLayout } from '../canvas.js';

const t = assertions('canvas — layered layout');

const n = (id, extra = {}) => ({ id, ...extra });
const e = (from, to) => ({ from, to });
/** The pairs of lines between two columns whose ends come in opposite vertical orders. */
const crossings = (pos, edges) => {
    let k = 0;
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const a = edges[i];
            const b = edges[j];
            if ((pos.get(a.from).y - pos.get(b.from).y) * (pos.get(a.to).y - pos.get(b.to).y) < 0) k++;
        }
    }
    return k;
};
const overlap = (p, sp, q, sq) => p.x < q.x + sq.width && q.x < p.x + sp.width
    && p.y < q.y + sq.height && q.y < p.y + sp.height;

t.section('§1 a chain');
{
    const at = layeredLayout([n('C'), n('A'), n('B')], [e('A', 'B'), e('B', 'C')]);
    const [a, b, c] = ['A', 'B', 'C'].map((id) => at.get(id));
    t.ok('three columns, left to right', a.x < b.x && b.x < c.x, JSON.stringify([a, b, c]));
    t.check('three distinct columns', new Set([a.x, b.x, c.x]).size, 3);
    t.ok('on one line', a.y === b.y && b.y === c.y);
    t.check('from the origin', a, { x: 0, y: 0 });
    t.check('an empty graph is an empty Map', layeredLayout([], []).size, 0);
    const odd = layeredLayout([n('A'), n('B'), n('A')], [e('A', 'B'), e('A', 'B'), e('A', 'A'), e('A', 'gone')]);
    t.check('a repeated id, a repeated line, a self line and an unknown end are ignored', [...odd.keys()], ['A', 'B']);
    t.ok('and the one real line still orders them', odd.get('A').x < odd.get('B').x);
}

t.section('§2 rank hints');
{
    // P feeds both A and the chain; S is a sink hanging off A, the first node;
    // Z is a source that something points INTO.
    const nodes = [n('S', { r: 'sink' }), n('A'), n('B'), n('C'), n('D'), n('Z', { r: 'source' })];
    const edges = [e('A', 'S'), e('A', 'B'), e('B', 'C'), e('C', 'D'), e('D', 'Z')];
    const at = layeredLayout(nodes, edges, { rank: (x) => x.r });
    const xs = nodes.map((x) => at.get(x.id).x);
    t.check('the sink is in the last column', at.get('S').x, Math.max(...xs));
    t.ok('alone there', xs.filter((x) => x === at.get('S').x).length === 1);
    t.check('the source is in the first column, though a line points into it', at.get('Z').x, Math.min(...xs));
    t.ok('and the chain still reads left to right', at.get('A').x < at.get('B').x && at.get('B').x < at.get('C').x
         && at.get('C').x < at.get('D').x);
    const none = layeredLayout(nodes, edges, { rank: () => 'middle' });
    t.ok('any other answer is no hint', none.get('S').x === none.get('B').x);
}

t.section('§3 crossing reduction');
{
    // Two columns joined as ONE component (a zigzag), the right one given in
    // the reverse of the order its lines want: nearly every pair crosses.
    const left = ['a1', 'a2', 'a3', 'a4', 'a5'];
    const right = ['b1', 'b2', 'b3', 'b4', 'b5'];
    const nodes = [...left, ...right].map((id) => n(id));
    const edges = [e('a1', 'b5'), e('a1', 'b4'), e('a2', 'b4'), e('a2', 'b3'), e('a3', 'b3'), e('a3', 'b2'),
                   e('a4', 'b2'), e('a4', 'b1'), e('a5', 'b1')];
    const given = new Map(nodes.map((x) => [x.id, { x: x.id[0] === 'a' ? 0 : 1, y: Number(x.id[1]) }]));
    const before = crossings(given, edges);
    const at = layeredLayout(nodes, edges);
    const after = crossings(at, edges);
    t.ok('two columns', left.every((id) => at.get(id).x === 0) && right.every((id) => at.get(id).x > 0));
    t.ok(`fewer crossings than the order given (${before} → ${after})`, after < before);
    t.check('none at all here', after, 0);
    t.check('with no sweeps the order given is kept, crossings and all', crossings(layeredLayout(nodes, edges, { passes: 0 }), edges),
            before);
    const unmoved = layeredLayout([n('a'), n('b'), n('c'), n('d')], [e('a', 'c'), e('b', 'd')]);
    t.ok('an order with no crossing is kept as given', unmoved.get('a').y < unmoved.get('b').y
         && unmoved.get('c').y < unmoved.get('d').y);
    const loop = layeredLayout([n('a'), n('b'), n('c')], [e('a', 'b'), e('b', 'c'), e('c', 'a')]);
    t.ok('a cycle is broken, not hung on', loop.size === 3 && loop.get('a').x < loop.get('b').x
         && loop.get('b').x < loop.get('c').x);
}

t.section('§4 separate components');
{
    const nodes = [n('x'), n('y'), n('p'), n('q'), n('r'), n('s')];
    const edges = [e('x', 'y'), e('p', 'q'), e('q', 'r'), e('p', 's')];
    const sizeOf = (x) => ({ width: 200, height: x.id === 'y' ? 300 : 90 });
    const at = layeredLayout(nodes, edges, { sizeOf, componentGap: 50 });
    let clash = null;
    for (const a of nodes) {
        for (const b of nodes) {
            if (a !== b && overlap(at.get(a.id), sizeOf(a), at.get(b.id), sizeOf(b))) clash = [a.id, b.id];
        }
    }
    t.ok('no two boxes overlap', clash === null, JSON.stringify(clash));
    const bottomOfBig = Math.max(...['p', 'q', 'r', 's'].map((id) => at.get(id).y + 90));
    const topOfSmall = Math.min(at.get('x').y, at.get('y').y);
    t.ok('the larger component on top', bottomOfBig <= topOfSmall);
    t.check('componentGap apart', topOfSmall - bottomOfBig, 50);
    t.check('each component from the left edge', [at.get('p').x, at.get('x').x], [0, 0]);
}

t.section('§5 measured sizes');
{
    const sizes = { a: { width: 100, height: 40 }, b: { width: 300, height: 60 }, c: { width: 120, height: 50 },
                    d: { width: 80, height: 30 } };
    const at = layeredLayout([n('a'), n('b'), n('c'), n('d')], [e('a', 'b'), e('a', 'c'), e('b', 'd'), e('c', 'd')],
                             { sizeOf: (x) => sizes[x.id], columnGap: 20, rowGap: 10 });
    t.check('column two starts after column one and the gap', at.get('b').x, 100 + 20);
    t.check('column three after the WIDEST of column two', at.get('d').x, 120 + 300 + 20);
    t.check('column two\'s nodes rowGap apart', Math.abs(at.get('c').y - at.get('b').y),
            at.get('b').y < at.get('c').y ? 60 + 10 : 50 + 10);
    t.check('a shorter column centred on the tallest', at.get('a').y, (60 + 50 + 10 - 40) / 2);
    const own = layeredLayout([n('a', { width: 50, height: 20 }), n('b')], [e('a', 'b')], { columnGap: 10 });
    t.check('by default a node\'s own width', own.get('b').x, 60);
}

t.section('§6 300 nodes and 400 edges');
{
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const nodes = Array.from({ length: 300 }, (_, i) => n(`n${i}`, { r: i % 50 === 0 ? 'source' : i % 61 === 0 ? 'sink' : null }));
    const edges = [];
    while (edges.length < 400) {
        const a = Math.floor(rnd() * 300);
        const b = Math.floor(rnd() * 300);
        if (a !== b) edges.push(e(`n${Math.min(a, b)}`, `n${Math.max(a, b)}`));
    }
    edges.push(e('n299', 'n0'), e('n150', 'n10')); // a cycle or two
    layeredLayout(nodes, edges, { rank: (x) => x.r }); // warm up
    const t0 = performance.now();
    const at = layeredLayout(nodes, edges, { rank: (x) => x.r });
    const ms = performance.now() - t0;
    t.check('every node placed', at.size, 300);
    t.ok(`in under 200 ms (${ms.toFixed(1)} ms)`, ms < 200);
}

t.done();
