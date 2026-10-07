/**
 * The canvas kernel — edge routing, crow's-foot decoration, a loop's return
 * line and a layered "Arrange" (36 §4.2). Every export is a pure function of
 * points and boxes; only `crowsFoot` builds DOM (an SVG group), so the rest
 * runs under plain node.
 *
 * The router is an obstacle-avoiding multi-strategy model reduced to the two
 * strategies that hold up at a dense diagram's scale — 40 nodes averaging 12
 * ports each, 480 ports — with the node count at which it degrades made
 * explicit rather than discovered.
 *
 * Crow's-foot notation is general diagram vocabulary (an entity-relationship
 * drawing's ends), and it moved with the rest; the cardinality decoration was
 * written rather than lifted, because the router it descends from drew a
 * plain path with no markers at all.
 */

/** Above this, routing time becomes visible; fall back to direct curves. */
export const OBSTACLE_ROUTING_NODE_LIMIT = 60;

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A line between two port anchors `{x, y, side: 'left'|'right'}`, as an SVG
 * path `d`. `simple` (or more than `OBSTACLE_ROUTING_NODE_LIMIT` obstacles)
 * draws the direct curve and never looks at an obstacle.
 */
export function routeEdge(from, to, { obstacles = [], simple = false } = {}) {
    // Orthogonal-ish routing with a horizontal lead-out, which is what makes a
    // dense diagram readable: edges leave a port sideways and meet the target
    // sideways, so parallel lines stack instead of crossing.
    const dx = to.x - from.x;
    const lead = Math.max(28, Math.min(Math.abs(dx) / 2, 90));
    const outX = from.side === 'right' ? from.x + lead : from.x - lead;
    const inX = to.side === 'right' ? to.x + lead : to.x - lead;

    if (simple || obstacles.length > OBSTACLE_ROUTING_NODE_LIMIT) {
        return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${inX} ${to.y}, ${to.x} ${to.y}`;
    }

    // Try the direct cubic first; if it crosses a node box, step the midpoint
    // out of the way and try again. Two strategies, not five — at 480 ports the
    // extra strategies cost more than they buy.
    const direct = `M ${from.x} ${from.y} C ${outX} ${from.y}, ${inX} ${to.y}, ${to.x} ${to.y}`;
    if (!crossesAny(from, to, obstacles)) return direct;

    const midY = midpointClear(from, to, obstacles);
    return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${outX} ${midY}, `
         + `${(from.x + to.x) / 2} ${midY} S ${inX} ${to.y}, ${to.x} ${to.y}`;
}

function crossesAny(from, to, obstacles) {
    for (const box of obstacles) {
        if (segmentIntersectsBox(from, to, box)) return true;
    }
    return false;
}

function midpointClear(from, to, obstacles) {
    const base = (from.y + to.y) / 2;
    for (let offset = 0; offset < 400; offset += 40) {
        for (const candidate of [base - offset, base + offset]) {
            const point = { x: (from.x + to.x) / 2, y: candidate };
            if (!obstacles.some((box) => pointInBox(point, box))) return candidate;
        }
    }
    return base;
}

function pointInBox(point, box) {
    return point.x >= box.x && point.x <= box.x + box.width
        && point.y >= box.y && point.y <= box.y + box.height;
}

function segmentIntersectsBox(a, b, box) {
    // Cheap AABB rejection first; the exact test is not worth it at this scale.
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    if (right < box.x || left > box.x + box.width) return false;
    if (bottom < box.y || top > box.y + box.height) return false;
    return true;
}

/**
 * The six crow's-foot ends, and what each one asserts.
 *
 * `maximum` is the symbol nearest the box; `minimum` is the one further out
 * along the line. `null` means "do not draw one", which is the pre-cardinality
 * behaviour and is kept only so the two legacy kinds below still render.
 */
const FOOT_ENDS = {
    // The two a diagram draws when it does not know optionality. Kept because a
    // caller that knows only the maximum should draw only the maximum rather
    // than guessing at a minimum it has no evidence for.
    many: { maximum: 'many', minimum: null },
    one: { maximum: 'one', minimum: null },
    // The four a diagram can actually derive from a foreign key.
    'zero-or-many': { maximum: 'many', minimum: 'zero' },
    'one-or-many': { maximum: 'many', minimum: 'one' },
    'zero-or-one': { maximum: 'one', minimum: 'zero' },
    'exactly-one': { maximum: 'one', minimum: 'one' },
};

/**
 * THE NOTATION'S ONE NUMBER. Everything below is a multiple of it, so a mark
 * that has to grow grows in proportion instead of drifting apart.
 */
const FOOT_SIZE = 9;
/**
 * Where each symbol lives, measured OUTWARD FROM THE BOX in multiples of
 * `FOOT_SIZE`, and the reason the line can now be told where to stop.
 *
 * `MAXIMUM_ENDS_AT` is the far side of the symbol touching the box: the crow's
 * foot's toes start ON the box and converge one unit out, so its far side is 1;
 * the bar is a single stroke standing 0.45 out, clear of the node's own border
 * without reading as a second border.
 *
 * `MINIMUM_SITS_AT`, keyed by the maximum it stands behind, is where the ring or
 * the second bar is CENTRED — far enough out to clear the foot's apex, which is
 * why the two entries differ.
 */
const MAXIMUM_ENDS_AT = { many: 1, one: 0.45 };
const MINIMUM_SITS_AT = { many: 1.5, one: 0.95 };
const RING_RADIUS = 0.33;

/**
 * WHERE THE LINE STARTS, which is where the mark ENDS.
 *
 * "The line routing should have the line connector after the cardinality
 * indicator. Currently the line connects directly to the box and the
 * cardinality indicator is on top." It did: `crowsFoot` draws at the box edge
 * and `routeEdge` was handed the same point, so the connector ran the whole
 * depth of the mark underneath it — three toes with a line through their middle
 * read as an arrowhead somebody had drawn over, not as one symbol.
 *
 * The offset is the MAXIMUM's depth and deliberately not the whole end's. IE
 * notation is read outward from the box — maximum first, then minimum — and the
 * minimum is a mark ON the line, not before it: a ring is a bead on a string and
 * a second bar is a tick across it. Stopping the line beyond the ring instead
 * would leave the ring hanging off the tip with a gap behind it, which is the
 * same defect in the other direction.
 *
 * Takes and returns the `{x, y, side}` shape `routeEdge` and `selfLoop` consume,
 * so a caller offsets an endpoint by wrapping it rather than by doing this
 * arithmetic itself — which is how a diagram and a dialog's preview of one of
 * its lines stay in step. `side` is the direction the line LEAVES the box, exactly
 * as `crowsFoot` means it.
 */
export function footAnchor(point, side, kind) {
    const { maximum } = FOOT_ENDS[kind] || FOOT_ENDS.one;
    const direction = side === 'right' ? 1 : -1;
    return { ...point, side, x: point.x + direction * FOOT_SIZE * MAXIMUM_ENDS_AT[maximum] };
}

/**
 * Crow's-foot decoration.
 *
 * A foreign key is many-to-one from child to parent, so the child end gets the
 * foot and the parent end gets the bar. Getting these the right way round is the
 * whole information content of the notation.
 *
 * ── AN END IS TWO SYMBOLS, NOT ONE ──
 *
 * IE/Barker notation is read OUTWARD FROM THE BOX: the symbol touching the box
 * is the *maximum* (a foot for many, a bar for one) and the symbol further along
 * the line is the *minimum* (a ring for zero, a bar for one). "Zero or many" is
 * therefore a foot with a ring behind it. Drawing only the maximum — which is all
 * this function could do before — says how many children a parent may have and
 * stays silent on whether a child must have a parent, which is the half of a
 * schema diagram people actually argue about.
 *
 * The one place this stops short of the textbook is "exactly one", which the
 * books draw as two bars and this draws as one. The argument is at the bar
 * itself, below; the short version is that at 9px the second bar is not a second
 * symbol, and the ring already carries the whole of the minimum.
 *
 * `side` is the direction the LINE LEAVES THE BOX, so both symbols are laid out
 * away from it. Passing the opposite side draws the whole end underneath the
 * node, which is opaque and painted above the edge layer, so it disappears
 * without a trace.
 *
 * The group is `twm-edge__marker twm-edge__marker--<kind>`; its strokes take the
 * stylesheet's `.twm-edge__marker line` and `circle` rules.
 *
 * @param {string} kind one of the keys of `FOOT_ENDS`.
 */
export function crowsFoot(point, side, kind) {
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('class', `twm-edge__marker twm-edge__marker--${kind}`);
    const direction = side === 'right' ? 1 : -1;
    // Unknown kinds fall back to the bar rather than throwing: a diagram that
    // draws one end slightly wrong is recoverable, one that throws out of
    // `draw()` renders no edges at all.
    const { maximum, minimum } = FOOT_ENDS[kind] || FOOT_ENDS.one;

    const bar = (offset) => {
        const line = document.createElementNS(SVG, 'line');
        line.setAttribute('x1', point.x + direction * FOOT_SIZE * offset);
        line.setAttribute('y1', point.y - FOOT_SIZE * 0.7);
        line.setAttribute('x2', point.x + direction * FOOT_SIZE * offset);
        line.setAttribute('y2', point.y + FOOT_SIZE * 0.7);
        group.appendChild(line);
    };

    if (maximum === 'many') {
        // The toes touch the box and the three lines converge on the connector,
        // which is the way round every ERD tool draws it — and the way round
        // that leaves the minimum symbol room to sit behind the foot rather
        // than floating in the middle of the line belonging to nothing.
        for (const dy of [-FOOT_SIZE * 0.8, 0, FOOT_SIZE * 0.8]) {
            const line = document.createElementNS(SVG, 'line');
            line.setAttribute('x1', point.x + direction * FOOT_SIZE * MAXIMUM_ENDS_AT.many);
            line.setAttribute('y1', point.y);
            line.setAttribute('x2', point.x);
            line.setAttribute('y2', point.y + dy);
            group.appendChild(line);
        }
    } else {
        bar(MAXIMUM_ENDS_AT.one);
    }

    if (minimum === 'zero') {
        const ring = document.createElementNS(SVG, 'circle');
        ring.setAttribute('cx', point.x + direction * FOOT_SIZE * MINIMUM_SITS_AT[maximum]);
        ring.setAttribute('cy', point.y);
        ring.setAttribute('r', FOOT_SIZE * RING_RADIUS);
        group.appendChild(ring);
    } else if (minimum === 'one' && maximum === 'many') {
        // ── "TO ONE" IS ONE BAR, NOT TWO ──
        //
        // Textbook IE draws mandatory-one as two bars, the outer one asserting
        // the minimum. At this size it cannot: the two strokes land 4px apart,
        // which at 9px and 1.4px of stroke is not a pair of bars but a thick
        // one — and a thick bar is what "many" reads as when the foot is small.
        // The report was "on a `to one` cardinality I would expect a single
        // vertical bar, not two", and that is the eye reading the drawing
        // correctly.
        //
        // OF THE TWO RULES THE SECOND BAR WAS EXPRESSING, THE MAXIMUM WINS. It
        // is the symbol nearest the box, it is the one the notation is read
        // from, and it is the one that cannot be inferred from anything else.
        // The minimum is not lost with it: optionality is carried by the RING,
        // whose presence means zero and whose absence means one, so `exactly-one`
        // is a bar with nothing behind it and `zero-or-one` is a bar with a ring
        // on the line behind it. Every one of the six ends stays distinguishable
        // and each is now one legible mark.
        //
        // `one-or-many` keeps its bar, because there it stands behind a FOOT and
        // the two shapes cannot be confused for one another.
        bar(MINIMUM_SITS_AT[maximum]);
    }
    return group;
}

/**
 * The two ends a foreign key implies, named in the vocabulary `crowsFoot` takes.
 *
 * ONE PLACE, because a diagram and any preview of one of its lines have to
 * agree: a preview drawn with this function and `crowsFoot` cannot disagree
 * with the canvas — it is not expressible rather than merely unlikely.
 *
 * Both facts come off the physical constraint and nothing else, which is why
 * only these two are derivable:
 *
 *  * **the parent end** — how many parents one child row has — is settled by the
 *    child column's NULLABILITY. `NOT NULL` is exactly one; nullable is zero or
 *    one. The caller passes it as `optional`.
 *  * **the child end** — how many children one parent row has — is settled by
 *    the child column's UNIQUENESS. A single-column `UNIQUE` makes it zero or
 *    one (`kind: '1:1'`); without it, zero or many (`kind: '1:N'`).
 *
 * "One or many" is deliberately never returned. No foreign key can require a
 * parent to have at least one child — that is a business rule living in a
 * trigger or nowhere — and inventing it on a schema diagram would be worse than
 * saying less.
 *
 * @param {{kind?: string, optional?: boolean}} edge
 * @returns {{child: string, parent: string}}
 */
export function cardinality({ kind, optional } = {}) {
    // `N:M` is a junction drawn as ONE line between its two ends rather than as
    // a three-box picture. Many at both ends is what that line means; the
    // parent end's `optional` describes a column the junction has not got yet.
    if (kind === 'N:M') return { child: 'zero-or-many', parent: 'zero-or-many' };
    return {
        child: kind === '1:1' ? 'zero-or-one' : 'zero-or-many',
        parent: optional ? 'zero-or-one' : 'exactly-one',
    };
}

/**
 * A SELF-REFERENCING edge: `employee.manager_id → employee`.
 *
 * A first-class thing a user creates on day one — a manager, a parent category,
 * a predecessor task. `routeEdge` cannot draw it: source and target are on the
 * same node, so a cubic between them is a line of zero visible length hidden
 * behind the node body.
 *
 * The shape is a loop out of the right edge and back into it, bulging by an
 * amount that grows with the vertical distance between the two ports so a node
 * with several self-references does not stack them on top of each other.
 */
export function selfLoop(from, to, { nodeRight, gap = 46 } = {}) {
    const right = Math.max(nodeRight ?? from.x, from.x, to.x);
    const span = Math.abs(to.y - from.y);
    const bulge = right + gap + Math.min(span / 2, 60);
    return `M ${from.x} ${from.y} C ${bulge} ${from.y}, ${bulge} ${to.y}, ${to.x} ${to.y}`;
}

/**
 * A RETURN edge: a loop's body handing control back to one of the loop step's
 * own inputs, for its next pass.
 *
 * The body sits RIGHT of its loop and that input is on the loop's LEFT edge, so
 * `routeEdge` draws the line doubling back across both nodes, where it reads
 * as one more forward step. This one leaves the body step rightwards, drops to
 * `floor` (the caller passes a line below both nodes), runs back left under
 * them, and rises into the port from its left side — the shape a reader
 * recognises as "and round again". It is never higher than the lower of the
 * two ends, whatever `floor` is.
 */
export function returnEdge(from, to, { floor = null, lead = 36 } = {}) {
    const bottom = Math.max(Number.isFinite(floor) ? floor : -Infinity, from.y, to.y);
    const outX = from.x + lead;
    const inX = to.x - lead;
    return `M ${from.x} ${from.y} C ${outX} ${from.y}, ${outX} ${bottom}, ${from.x} ${bottom} `
         + `L ${to.x} ${bottom} C ${inX} ${bottom}, ${inX} ${to.y}, ${to.x} ${to.y}`;
}

/**
 * Dagre-free layered auto-layout — "Arrange".
 *
 * Rank by dependency depth, then pack within a rank. `nodes` are
 * `{id, label, height?}` and `edges` `{from, to}`; returns a Map of id →
 * `{x, y}` from (0, 0).
 *
 * ── ITS TWO QUIRKS, KEPT AND STATED, because callers rely on both ──
 *
 *  * **AN EDGE POINTS FROM CHILD TO PARENT.** A node with no outgoing edge is
 *    at rank 0, and each node sits one rank RIGHT of its deepest `to` — which
 *    lays a schema out the way people draw one, a foreign key pointing
 *    leftwards at what it references. A flow, whose lines point at what runs
 *    NEXT, hands its connections over REVERSED (`{from: target, to: source}`).
 *  * **EVERY NODE NEEDS A `label`.** Each column is sorted with
 *    `a.label.localeCompare(b.label)`, which throws on a missing one. A caller
 *    that wants another order within a column passes an order key as the label
 *    (the canvas editor passes a zero-padded breadth-first index).
 *
 * A cycle is broken (its back edge read as rank 0) rather than hung on.
 */
export function arrange(nodes, edges, { columnGap = 340, rowGap = 40 } = {}) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parents = new Map(nodes.map((n) => [n.id, []]));
    for (const edge of edges) {
        if (byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to) {
            parents.get(edge.from).push(edge.to);
        }
    }

    const rank = new Map();
    const visiting = new Set();
    const rankOf = (id) => {
        if (rank.has(id)) return rank.get(id);
        if (visiting.has(id)) return 0;      // a cycle: break it rather than hang
        visiting.add(id);
        const value = parents.get(id).length
            ? Math.max(...parents.get(id).map(rankOf)) + 1
            : 0;
        visiting.delete(id);
        rank.set(id, value);
        return value;
    };
    for (const node of nodes) rankOf(node.id);

    const columns = new Map();
    for (const node of nodes) {
        const column = rank.get(node.id) ?? 0;
        if (!columns.has(column)) columns.set(column, []);
        columns.get(column).push(node);
    }

    const positions = new Map();
    for (const [column, members] of [...columns].sort((a, b) => a[0] - b[0])) {
        members.sort((a, b) => a.label.localeCompare(b.label));
        let y = 0;
        for (const node of members) {
            positions.set(node.id, { x: column * columnGap, y });
            y += (node.height || 120) + rowGap;
        }
    }
    return positions;
}
