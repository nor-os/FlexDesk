/**
 * THE CANVAS KERNEL'S EDGE ROUTER (36 §4.2) — every export, moved with its
 * signature: routeEdge, footAnchor, crowsFoot, cardinality, selfLoop,
 * returnEdge, arrange, OBSTACLE_ROUTING_NODE_LIMIT.
 *
 *   §1  routeEdge: a horizontal lead-out; the direct curve; around an
 *       obstacle; past the node limit (and `simple`) the direct curve always
 *   §2  the six crow's-foot ends, as SHAPES — asserted on the elements drawn,
 *       not on the class name, because the class name can be right while the
 *       drawing is wrong — and the marker's twm- class
 *   §3  footAnchor stops the line at the MAXIMUM, the ring further out still
 *   §4  cardinality: the two ends a reference implies, never "one or many"
 *   §5  selfLoop bulges right of the node, more for ports further apart
 *   §6  returnEdge: from the body step to the loop's port, below both ends
 *       whatever floor is given
 *   §7  arrange: an edge points child → parent, a column is sorted by label,
 *       a cycle is broken rather than hung on
 *
 *     node tests/canvas_edge_router.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('canvas kernel — edge router');
const R = await import('../src/canvas/edge_router.js');
const kernel = await import('../src/canvas/index.js');
const numbers = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const ysOf = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));

t.section('§0 every export, and the barrel carries them');
t.check('the edge router\'s exports', Object.keys(R).sort(),
        ['OBSTACLE_ROUTING_NODE_LIMIT', 'arrange', 'cardinality', 'crowsFoot', 'footAnchor', 'returnEdge', 'routeEdge',
         'selfLoop']);
t.ok('@flexdesk/canvas re-exports each of them, and the generic graph layer',
     Object.keys(R).every((k) => kernel[k] === R[k])
     && ['CanvasAdapter', 'NodePlatform', 'ConnectorRouter', 'HistoryService'].every((k) => typeof kernel[k] === 'function'));
t.ok('the node limit is 60', R.OBSTACLE_ROUTING_NODE_LIMIT === 60);

t.section('§1 routeEdge');
{
    const from = { x: 0, y: 0, side: 'right' };
    const to = { x: 400, y: 100, side: 'left' };
    const direct = R.routeEdge(from, to);
    t.check('the direct curve, leading out 90px each side', direct, 'M 0 0 C 90 0, 310 100, 400 100');
    const short = R.routeEdge(from, { x: 20, y: 50, side: 'left' });
    t.ok('the lead-out is at least 28px', numbers(short)[2] === 28, short);
    const wall = { x: 150, y: -50, width: 100, height: 300 };
    const around = R.routeEdge(from, to, { obstacles: [wall] });
    t.ok('a node in the way bends the line round it', around !== direct && around.includes(' S '), around);
    const midY = numbers(around)[7];
    t.ok('…through a midpoint outside the obstacle', midY < wall.y || midY > wall.y + wall.height, String(midY));
    t.ok('simple draws the direct curve whatever is in the way', R.routeEdge(from, to, { obstacles: [wall], simple: true }) === direct);
    const crowd = Array.from({ length: 61 }, () => wall);
    t.ok('past the node limit the direct curve, without looking', R.routeEdge(from, to, { obstacles: crowd }) === direct);
}

t.section('§2 the six ends, as shapes');
{
    const shapeOf = (kind) => [...R.crowsFoot({ x: 0, y: 0 }, 'right', kind).childNodes].map((el) => el.tagName).join('+');
    t.check('"exactly one" is a single bar', shapeOf('exactly-one'), 'line');
    t.check('"zero or one" is that bar with a ring behind it', shapeOf('zero-or-one'), 'line+circle');
    t.check('"one or many" keeps its bar, because it stands behind a foot', shapeOf('one-or-many'), 'line+line+line+line');
    t.check('"zero or many" is the foot with a ring', shapeOf('zero-or-many'), 'line+line+line+circle');
    t.check('"many" alone is the foot', shapeOf('many'), 'line+line+line');
    t.check('"one" alone is the bar', shapeOf('one'), 'line');
    t.check('an unknown kind falls back to the bar rather than throwing', shapeOf('sideways'), 'line');
    const derivable = ['zero-or-many', 'one-or-many', 'zero-or-one', 'exactly-one'];
    t.ok('the four derivable ends stay pairwise distinguishable', new Set(derivable.map(shapeOf)).size === 4);
    const g = R.crowsFoot({ x: 10, y: 20 }, 'left', 'zero-or-many');
    t.check('the group is twm-edge__marker, with its kind', g.getAttribute('class'),
            'twm-edge__marker twm-edge__marker--zero-or-many');
    t.ok('an SVG group', g.namespaceURI === 'http://www.w3.org/2000/svg' && g.tagName === 'g');
    t.ok('laid out AWAY from the box, on the side the line leaves by',
         [...g.querySelectorAll('line')].every((l) => Number(l.getAttribute('x1')) <= 10 && Number(l.getAttribute('x2')) <= 10));
}

t.section('§3 footAnchor stops the line at the maximum');
{
    const apex = R.footAnchor({ x: 0, y: 0 }, 'right', 'zero-or-many').x;
    const ringAt = Number(R.crowsFoot({ x: 0, y: 0 }, 'right', 'zero-or-many').querySelector('circle').getAttribute('cx'));
    t.ok('the line begins at the foot\'s apex', apex > 0);
    t.ok('and the ring is further out still, so it lands on the line', ringAt > apex, `${ringAt} vs ${apex}`);
    t.ok('the offset follows the side the line leaves by', R.footAnchor({ x: 0, y: 0 }, 'left', 'zero-or-many').x === -apex);
    const bar = R.footAnchor({ x: 0, y: 0 }, 'right', 'exactly-one').x;
    t.ok('a bar end is a shorter offset than a foot end', bar < apex && bar > 0);
    t.check('`side` is carried through, because routeEdge reads it', R.footAnchor({ x: 5, y: 6 }, 'left', 'exactly-one'),
            { x: 5 - 9 * 0.45, y: 6, side: 'left' });
}

t.section('§4 cardinality');
t.check('a plain reference: zero or many children, exactly one parent', R.cardinality({ kind: '1:N', optional: false }),
        { child: 'zero-or-many', parent: 'exactly-one' });
t.check('an optional one: zero or one parent', R.cardinality({ kind: '1:N', optional: true }),
        { child: 'zero-or-many', parent: 'zero-or-one' });
t.check('a unique one: zero or one child', R.cardinality({ kind: '1:1' }), { child: 'zero-or-one', parent: 'exactly-one' });
t.check('a junction: many at both ends', R.cardinality({ kind: 'N:M', optional: false }),
        { child: 'zero-or-many', parent: 'zero-or-many' });
t.ok('"one or many" is never derived', ['1:N', '1:1', 'N:M'].flatMap((kind) => [true, false]
    .map((optional) => R.cardinality({ kind, optional }))).every((c) => c.child !== 'one-or-many' && c.parent !== 'one-or-many'));
t.check('no argument at all is a plain reference', R.cardinality(), { child: 'zero-or-many', parent: 'exactly-one' });

t.section('§5 selfLoop');
{
    const near = R.selfLoop({ x: 200, y: 40 }, { x: 200, y: 60 }, { nodeRight: 210 });
    const far = R.selfLoop({ x: 200, y: 40 }, { x: 200, y: 200 }, { nodeRight: 210 });
    t.ok('it starts and ends at the two ports', near.startsWith('M 200 40') && near.endsWith('200 60'), near);
    t.ok('it bulges right of the node', numbers(near)[2] > 210, near);
    t.ok('further for ports further apart', numbers(far)[2] > numbers(near)[2]);
}

t.section('§6 returnEdge');
{
    const d = R.returnEdge({ x: 600, y: 150, side: 'right' }, { x: 300, y: 178, side: 'left' }, { floor: 260 });
    t.ok('it runs below both steps', Math.max(...ysOf(d)) >= 260, d);
    t.ok('it starts at the body step and ends in the loop\'s port', d.startsWith('M 600 150') && d.trimEnd().endsWith('300 178'), d);
    const low = R.returnEdge({ x: 600, y: 150, side: 'right' }, { x: 300, y: 400, side: 'left' }, { floor: 0 });
    t.ok('never above the lower of the two ends, whatever floor is given', Math.max(...ysOf(low)) >= 400, low);
    const none = R.returnEdge({ x: 600, y: 150 }, { x: 300, y: 178 });
    t.ok('with no floor, the lower end is the floor', Math.max(...ysOf(none)) === 178, none);
}

t.section('§7 arrange');
{
    const nodes = [{ id: 'child', label: 'b' }, { id: 'parent', label: 'a' }, { id: 'grand', label: 'c' }];
    const at = R.arrange(nodes, [{ from: 'child', to: 'parent' }, { from: 'parent', to: 'grand' }]);
    t.ok('an edge points child → parent: the parent is LEFT of the child',
         at.get('grand').x < at.get('parent').x && at.get('parent').x < at.get('child').x, JSON.stringify([...at]));
    t.ok('columns are columnGap apart, from 0', at.get('grand').x === 0 && at.get('parent').x === 340 && at.get('child').x === 680);
    const col = R.arrange([{ id: 'z', label: 'zz', height: 50 }, { id: 'a', label: 'aa', height: 70 }], [], { rowGap: 10 });
    t.ok('a column is sorted by label, stacked by height + rowGap', col.get('a').y === 0 && col.get('z').y === 80,
         JSON.stringify([...col]));
    const cyc = R.arrange([{ id: 'p', label: 'p' }, { id: 'q', label: 'q' }], [{ from: 'p', to: 'q' }, { from: 'q', to: 'p' }]);
    t.ok('a cycle is broken, not hung on: both placed', cyc.size === 2);
    const self = R.arrange([{ id: 's', label: 's' }], [{ from: 's', to: 's' }, { from: 's', to: 'gone' }]);
    t.ok('a self edge and an edge to nothing are ignored', self.get('s').x === 0);
    t.throws('a node without a label throws — the quirk the header states', () => R.arrange([{ id: 'x' }, { id: 'y' }], []),
             /localeCompare|undefined/);
}

t.done();
