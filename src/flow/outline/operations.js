/**
 * EVERY EDIT IS AN OPERATION ON THE GRAPH (36 §6.6). PURE: no DOM.
 *
 * The outline holds no second model. An operation takes the graph, changes
 * its nodes and lines — and nothing else — and the outline is read from the
 * result again. So an operation is checked the only way that cannot drift
 * from the drawing: the graph it leaves must be block-shaped, or the
 * operation is REFUSED with a sentence and the graph is left as it was.
 *
 *     const ops = createOutlineOperations({ catalogue, blocks, strings, references });
 *     const r = ops.insert(graph, { before: 'check' }, 'http-request');
 *     // → { ok: true, graph, select } | { ok: false, reason }
 *
 * Every operation works on a COPY and returns it; the graph passed in is
 * never changed. A new step's position is (0, 0), the position a graph
 * without one is read with (I2).
 *
 * ══ WHERE ════════════════════════════════════════════════════════════════
 *
 * A place in the outline is an ANCHOR, named by the steps around it so that
 * it survives the edit that makes room for it:
 *
 *     { before: id }   in the Seq that holds `id`, just before it
 *     { after: id }    … just after it
 *     { into: ref }    at the start of a Seq — the only place in an empty one —
 *                      where `ref` is 'top', {arm: owner, port}, {body: loop}
 *                      or {fanout: parallel, first: id | null}
 *
 * A GAP is an anchor read against an outline: the lines arriving there (each
 * a `{source, port}`, with or without a line yet) and the place they go on
 * to (`succ`, or null where nothing follows).
 *
 * ══ A BLOCK IN, A BLOCK OUT ══════════════════════════════════════════════
 *
 * Inserting splices: every line arriving at the gap goes to the new step's
 * input instead, and each of the new step's exits goes on to where those
 * lines went. A block arrives with its arms empty, each connected straight to
 * what follows; a loop with its body and Next unconnected, which the server
 * reports until a step is added; a parallel with its one empty branch into
 * its join. Removing is the reverse: what arrived at a step goes on to its
 * continuation, and the step goes with everything inside it.
 */

import { addNode } from '../kit/logic_graph.js';
import { createStrings, say } from '../kit/strings.js';
import { OUTLINE_STRINGS } from './strings.js';
import { createBlockMapping, displayName } from './mapping.js';
import { outlineFromGraph, indexTree, subtreeIds } from './recognise.js';

const portOf = (c, side) => String((side === 'source' ? c.sourcePort : c.targetPort)
    || (side === 'source' ? 'out' : 'in'));
const sameRef = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => structuredClone(v);

class OpRefusal extends Error {}

/**
 * @param {object} o
 * @param {object} o.catalogue    `createStepCatalogue`'s
 * @param {object} [o.blocks]     the block mapping (36 §6.2)
 * @param {object} [o.strings]
 * @param {object} [o.references] syntax name → syntax, for renaming references in a paste
 */
export function createOutlineOperations({ catalogue, blocks = {}, strings = null, references = {} } = {}) {
    const map = createBlockMapping(blocks, catalogue);
    const S = createStrings(OUTLINE_STRINGS, strings);
    const syntaxes = Object.values(references || {}).filter((x) => x && typeof x.rename === 'function');

    const refuse = (reason) => { throw new OpRefusal(reason); };
    const nameOf = (graph, id) => displayName(graph.nodes.find((n) => n.id === id), catalogue) || String(id);

    /** The outline of `graph`, with its index; `null` when it is not block-shaped. */
    function read(graph) {
        const r = outlineFromGraph(graph, catalogue, map, { strings });
        if (!r.ok) return { ok: false, refusal: r };
        return { ok: true, tree: r.tree, index: indexTree(r.tree), graph };
    }

    // ── reading places ───────────────────────────────────────────────────
    function seqOf(view, ref) {
        const { tree, index } = view;
        if (ref === 'top') return tree.top;
        if (ref?.arm !== undefined) {
            const place = index.at.get(ref.arm);
            const arms = place?.item?.arms || [];
            return arms.find((a) => a.port === ref.port)?.seq ?? null;
        }
        if (ref?.body !== undefined) {
            const item = index.at.get(ref.body)?.item;
            return item?.kind === 'loop' ? item.body.seq : null;
        }
        if (ref?.fanout !== undefined) {
            const item = index.at.get(ref.fanout)?.item;
            if (item?.kind !== 'fanout') return null;
            return item.arms.find((a) => (a.seq.items[0]?.id ?? null) === (ref.first ?? null))?.seq ?? null;
        }
        return null;
    }

    function placeOf(view, id) {
        const p = view.index.at.get(id);
        if (!p || p.seq === null) return null;
        return p;
    }

    /** An anchor as a Seq and an index in it, or null. */
    function locate(view, anchor) {
        if (!anchor) return null;
        if (anchor.before !== undefined || anchor.after !== undefined) {
            const p = placeOf(view, anchor.before ?? anchor.after);
            if (!p || p.join) return p && p.join && anchor.after !== undefined
                ? { seq: p.seq, index: p.index + 1 } : null;
            return { seq: p.seq, index: p.index + (anchor.after !== undefined ? 1 : 0) };
        }
        if (anchor.into !== undefined) {
            const seq = seqOf(view, anchor.into);
            return seq ? { seq, index: 0 } : null;
        }
        return null;
    }

    function inputOf(id, graph) {
        return map.input(graph.nodes.find((n) => n.id === id)?.type);
    }

    /** Where a Seq's last continuation goes. */
    function exitTarget(seq, graph) {
        if (seq.exit === 'next') return seq.to;
        if (seq.exit !== 'rejoin' || !seq.T) return null;
        if (seq.to && seq.to.id === seq.T.id) return seq.to;
        return seq.T.next ? { id: seq.T.id, port: map.loopPorts.next } : { id: seq.T.id, port: inputOf(seq.T.id, graph) };
    }

    /** The ports an item carries on by: its continuation, and its arms that rejoin it. */
    function outsOf(item) {
        const rejoins = (arms) => arms.flatMap((a) => (a.seq.exit !== 'rejoin' ? []
            : a.seq.items.length ? outsOf(a.seq.items[a.seq.items.length - 1]) : [a.seq.entry]));
        switch (item.kind) {
            case 'start':
            case 'step': return [...(item.cont ? [{ source: item.id, port: item.cont }] : []), ...rejoins(item.arms)];
            case 'loop': return [{ source: item.id, port: item.done }, ...rejoins(item.arms)];
            case 'fanout': return item.join?.cont ? [{ source: item.join.id, port: item.join.cont }] : [];
            case 'branch': return rejoins(item.arms);
            default: return [];
        }
    }

    /** The innermost loop around a Seq, or null. */
    function loopAround(view, seq) {
        const s = view.index.seqs.find((x) => x.seq === seq);
        if (!s) return null;
        for (let i = s.path.length - 1; i >= 0; i -= 1) if (s.path[i].arm.role === 'body') return s.path[i].owner.id;
        return null;
    }

    /** A gap's facts: what arrives, where it goes on to, the loop around it. */
    function gapAt(view, seq, index) {
        const items = seq.items;
        const last = items[items.length - 1];
        let succ = index < items.length ? { id: items[index].id, port: items[index].input } : exitTarget(seq, view.graph);
        // An empty body: the first step put in it closes it onto the loop's Next.
        if (!succ && !items.length && seq.ref?.body !== undefined) succ = { id: seq.ref.body, port: map.loopPorts.next };
        const arriving = index === 0 ? [seq.entry] : outsOf(items[index - 1]);
        return {
            seq, index, succ, arriving,
            loop: loopAround(view, seq),
            afterEnd: index === items.length && last?.kind === 'end',
            atEnd: index === items.length,
        };
    }

    // ── changing lines ───────────────────────────────────────────────────
    function addLine(graph, source, sourcePort, target, targetPort) {
        if (source === target) return;
        if (graph.connections.some((c) => c.source === source && portOf(c, 'source') === sourcePort
                                        && c.target === target && portOf(c, 'target') === targetPort)) return;
        graph.connections.push({ source, target, sourcePort, targetPort });
    }

    function dropLine(graph, source, sourcePort, to) {
        graph.connections = graph.connections.filter((c) => !(c.source === source && portOf(c, 'source') === sourcePort
            && (!to || (c.target === to.id && portOf(c, 'target') === to.port))));
    }

    /** Put `frag` (its nodes already in the graph) into a gap. */
    function splice(graph, gap, frag) {
        if (gap.afterEnd) refuse(say(S, 'nothingAfterEnd', nameOf(graph, gap.seq.items[gap.seq.items.length - 1].id)));
        if (!gap.arriving.length) {
            const prev = gap.seq.items[gap.index - 1];
            refuse(say(S, 'unreachableHere', prev ? nameOf(graph, prev.id) : ''));
        }
        // A fragment that never goes on (an End; a branch every arm of which
        // ends) would leave what follows it unreachable: it can only be last.
        const goesOn = frag.exits.some((x) => x.kind === 'cont');
        if (!goesOn && !gap.atEnd) {
            refuse(say(S, frag.endsHere ? 'endNotLast' : 'endsNotLast', nameOf(graph, frag.head.id)));
        }
        // … and at the end of an arm it may not take the LAST line into what
        // follows the arm's block: nothing would reach it any more.
        if (!goesOn && gap.succ && !gap.addOnly) {
            const from = new Set(gap.arriving.map((a) => `${a.source}\u0000${a.port}`));
            const others = graph.connections.filter((c) => c.target === gap.succ.id && portOf(c, 'target') === gap.succ.port
                && !from.has(`${c.source}\u0000${portOf(c, 'source')}`));
            if (!others.length) refuse(say(S, 'wouldOrphan', nameOf(graph, gap.succ.id)));
        }
        if (frag.exits.some((x) => x.kind === 'next') && !gap.loop) refuse(say(S, 'nextOutsideLoop', nameOf(graph, frag.head.id)));
        if (gap.loop) {
            const end = frag.ids.find((id) => map.kindOf(graph.nodes.find((n) => n.id === id)?.type) === 'end');
            if (end) refuse(say(S, 'endInLoop', nameOf(graph, end), nameOf(graph, gap.loop)));
        }
        for (const a of gap.arriving) {
            if (gap.succ && !gap.addOnly) dropLine(graph, a.source, a.port, gap.succ);
            addLine(graph, a.source, a.port, frag.head.id, frag.head.input);
        }
        for (const x of frag.exits) {
            const to = x.kind === 'next' ? { id: gap.loop, port: map.loopPorts.next } : gap.succ;
            if (to) addLine(graph, x.source, x.port, to.id, to.port);
        }
        for (const l of frag.internal) addLine(graph, l.source, portOf(l, 'source'), l.target, portOf(l, 'target'));
    }

    /** A new step (or a block's steps) of `typeId`, added to the graph; its fragment. */
    function freshFragment(graph, typeId) {
        const type = catalogue.get(typeId);
        if (!type) refuse(say(S, 'outline_unknown_type', typeId));
        if (type.unavailable) refuse(String(type.unavailable));
        const kind = map.kindOf(typeId);
        if (kind === 'start' || kind === 'join') refuse(say(S, 'outline_unknown_type', typeId));
        const node = addNode(graph, typeId, null, { catalogue });
        const head = { id: node.id, input: map.input(typeId) };
        const exit = (port) => ({ source: node.id, port, kind: 'cont' });
        switch (kind) {
            case 'end': return { head, exits: [], internal: [], ids: [node.id], endsHere: true };
            case 'branch': return { head, exits: map.armPorts(typeId).map(exit), internal: [], ids: [node.id] };
            case 'loop': return { head, exits: [exit(map.loopPorts.done)], internal: [], ids: [node.id] };
            case 'fanout': {
                const joinType = map.joinType();
                if (!joinType) refuse(say(S, 'noJoinType'));
                const join = addNode(graph, joinType, null, { catalogue });
                const out = catalogue.outputs(typeId, { flow: true })[0]?.name ?? 'out';
                return {
                    head, ids: [node.id, join.id],
                    internal: [{ source: node.id, sourcePort: out, target: join.id, targetPort: map.input(joinType) }],
                    exits: [{ source: join.id, port: map.cont(joinType), kind: 'cont' }],
                };
            }
            default: return { head, exits: map.cont(typeId) ? [exit(map.cont(typeId))] : [], internal: [], ids: [node.id] };
        }
    }

    /**
     * The fragment an item is: its nodes, the lines among them, and its exits
     * — the ports that carry on (`cont`) and those that go on with the next
     * item of a loop outside it (`next`).
     */
    function fragmentOf(view, id) {
        const place = placeOf(view, id);
        if (!place) refuse(say(S, 'outline_unreachable', nameOf(view.graph, id)));
        const item = place.item;
        const ids = subtreeIds(item);
        const inside = new Set(ids);
        const internal = view.graph.connections.filter((c) => inside.has(c.source) && inside.has(c.target));
        const exits = outsOf(item).map((o) => ({ ...o, kind: 'cont' }));
        const walk = (seq) => {
            if (seq.exit === 'next' && !inside.has(seq.loop)) {
                const outs = seq.items.length ? outsOf(seq.items[seq.items.length - 1]) : [seq.entry];
                for (const o of outs) exits.push({ ...o, kind: 'next' });
            }
            for (const it of seq.items) {
                if (it.kind === 'loop') walk(it.body.seq);
                for (const a of it.arms || []) walk(a.seq);
            }
        };
        if (item.kind === 'loop') walk(item.body.seq);
        for (const a of item.arms || []) walk(a.seq);
        return {
            head: { id: item.id, input: item.input }, ids, internal: internal.map(clone), exits,
            endsHere: item.kind === 'end', kind: item.kind, item, place,
            nodes: view.graph.nodes.filter((n) => inside.has(n.id)).map(clone),
        };
    }

    /**
     * Take an item out of its place: what arrived there goes on to its
     * continuation. Its nodes and the lines among them stay in the graph
     * (unless `drop`), its lines to the outside go.
     */
    function detach(graph, view, id, { drop = false } = {}) {
        const frag = fragmentOf(view, id);
        const { seq, index } = frag.place;
        const before = gapAt(view, seq, index);
        const after = gapAt(view, seq, index + 1);
        const inside = new Set(frag.ids);
        graph.connections = graph.connections.filter((c) => {
            const a = inside.has(c.source);
            const b = inside.has(c.target);
            return drop ? !a && !b : a === b;
        });
        if (drop) graph.nodes = graph.nodes.filter((n) => !inside.has(n.id));
        for (const a of before.arriving) {
            if (after.succ && !(after.succ.id === a.source)) addLine(graph, a.source, a.port, after.succ.id, after.succ.port);
        }
        return frag;
    }

    /** The graph without a fragment's nodes and inner lines — what to read places from while it is lifted out. */
    function without(graph, ids) {
        const out = new Set(ids);
        return { nodes: graph.nodes.filter((n) => !out.has(n.id)),
                 connections: graph.connections.filter((c) => !out.has(c.source) && !out.has(c.target)) };
    }

    /** A fragment copied under new ids, its references to its own steps renamed; nodes added to `graph`. */
    function freshCopy(graph, frag) {
        const taken = new Set(graph.nodes.map((n) => n.id));
        const ids = new Map();
        for (const n of frag.nodes) {
            const base = String(n.id).replace(/-\d+$/, '') || 'step';
            let id = base;
            for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
            taken.add(id);
            ids.set(n.id, id);
        }
        const rename = (v) => {
            if (typeof v === 'string') return syntaxes.reduce((text, s) => s.rename(text, ids), v);
            if (Array.isArray(v)) return v.map(rename);
            if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]));
            return v;
        };
        for (const n of frag.nodes) {
            graph.nodes.push({ ...clone(n), id: ids.get(n.id), config: rename(clone(n.config ?? {})),
                               position: { x: 0, y: 0 } });
        }
        const m = (id) => ids.get(id) ?? id;
        return {
            head: { id: m(frag.head.id), input: frag.head.input },
            ids: frag.ids.map(m),
            internal: frag.internal.map((c) => ({ ...c, source: m(c.source), target: m(c.target) })),
            exits: frag.exits.map((x) => ({ ...x, source: m(x.source) })),
            endsHere: frag.endsHere,
        };
    }

    // ── running an operation ─────────────────────────────────────────────
    /** Run `fn` on a copy; keep the copy only when it is block-shaped. */
    function attempt(graph, fn) {
        const g = clone(graph);
        g.nodes = Array.isArray(g.nodes) ? g.nodes : [];
        g.connections = Array.isArray(g.connections) ? g.connections : [];
        const view = read(g);
        if (!view.ok) return { ok: false, reason: view.refusal.message };
        try {
            const select = fn(g, view);
            const check = read(g);
            if (!check.ok) return { ok: false, reason: say(S, 'notBlockShaped', check.refusal.message) };
            return { ok: true, graph: g, select: select ?? null, view: check };
        } catch (err) {
            if (err instanceof OpRefusal) return { ok: false, reason: err.message };
            throw err;
        }
    }

    /**
     * The place a gap really is. After a branch whose arms meet nowhere, the
     * only lines that go on come from the arms that rejoin; when ONE arm does,
     * "after the block" and "at the end of that arm" are the same lines, and
     * the outline reads them as the arm — so that is where the gap is.
     */
    function canonical(view, seq, index) {
        for (;;) {
            const prev = seq.items[index - 1];
            if (!prev || prev.kind !== 'branch' || index !== seq.items.length) return { seq, index };
            // The arms that hand a line on to what follows — an arm can rejoin and
            // still hand none on, when its last block ends on its own.
            const live = prev.arms.filter((a) => (a.seq.exit !== 'rejoin' ? false
                : a.seq.items.length ? outsOf(a.seq.items[a.seq.items.length - 1]).length > 0 : true));
            if (live.length !== 1) return { seq, index };
            seq = live[0].seq;
            index = seq.items.length;
        }
    }

    function gapFor(view, anchor) {
        const at = locate(view, anchor);
        if (!at) refuse(say(S, 'dropNowhere'));
        const c = canonical(view, at.seq, at.index);
        return gapAt(view, c.seq, c.index);
    }

    /** Is `anchor` inside the item `id` (or right where it is already)? */
    function insideOf(view, id, anchor) {
        const ids = new Set(subtreeIds(placeOf(view, id).item));
        const refIds = [anchor.before, anchor.after, anchor.into?.arm, anchor.into?.body, anchor.into?.fanout]
            .filter((x) => x !== undefined);
        return refIds.some((x) => ids.has(x) && !(x === id && (anchor.before !== undefined || anchor.after !== undefined)));
    }

    // ── the operations ───────────────────────────────────────────────────
    const ops = {
        map, strings: S, read, locate, gapAt, outsOf, fragmentOf,

        /** Insert a new step of `typeId` (a block's steps, for a block) at `anchor`. */
        insert(graph, anchor, typeId) {
            return attempt(graph, (g, view) => {
                const gap = gapFor(view, anchor);
                const frag = freshFragment(g, typeId);
                splice(g, gap, frag);
                return frag.head.id;
            });
        },

        /** Remove a step and everything inside it. */
        remove(graph, id) {
            return attempt(graph, (g, view) => {
                const place = placeOf(view, id);
                if (!place) refuse(say(S, 'outline_unreachable', nameOf(g, id)));
                const { seq, index } = place;
                const holder = view.index.seqs.find((x) => x.seq === seq);
                if (holder?.arm?.role === 'fanout' && seq.items.length === 1 && !holder.owner.join
                    && holder.owner.arms.length === 1) refuse(say(S, 'lastBranch', nameOf(g, holder.owner.id)));
                const nextId = seq.items[index + 1]?.id ?? seq.items[index - 1]?.id ?? view.index.seqs
                    .find((x) => x.seq === seq)?.owner?.id ?? null;
                detach(g, view, place.item.id, { drop: true });
                return nextId;
            });
        },

        /** Move a step (with what is inside it) to `anchor`, keeping its id. */
        move(graph, id, anchor) {
            return attempt(graph, (g, view) => {
                const place = placeOf(view, id);
                if (!place) refuse(say(S, 'outline_unreachable', nameOf(g, id)));
                const itemId = place.item.id;
                if (insideOf(view, itemId, anchor)) refuse(say(S, 'intoItself', nameOf(g, itemId)));
                const frag = detach(g, view, itemId);
                const lifted = read(without(g, frag.ids));
                if (!lifted.ok) refuse(lifted.refusal.message);
                splice(g, gapFor({ ...lifted, graph: g }, anchor), frag);
                return itemId;
            });
        },

        moveUp(graph, id) {
            const view = read(graph);
            if (!view.ok) return { ok: false, reason: view.refusal.message };
            const p = placeOf(view, id);
            if (!p) return { ok: false, reason: say(S, 'readOnlyRefusal') };
            if (p.index === 0) return { ok: false, reason: say(S, 'alreadyFirst', seqName(view, p.seq)) };
            return ops.move(graph, id, { before: p.seq.items[p.index - 1].id });
        },

        moveDown(graph, id) {
            const view = read(graph);
            if (!view.ok) return { ok: false, reason: view.refusal.message };
            const p = placeOf(view, id);
            if (!p) return { ok: false, reason: say(S, 'readOnlyRefusal') };
            const items = p.seq.items;
            if (p.index >= items.length - 1) return { ok: false, reason: say(S, 'alreadyLast', seqName(view, p.seq)) };
            const anchor = p.index + 2 < items.length ? { before: items[p.index + 2].id } : { after: items[p.index + 1].id };
            return ops.move(graph, id, anchor);
        },

        moveOut(graph, id) {
            const view = read(graph);
            if (!view.ok) return { ok: false, reason: view.refusal.message };
            const p = placeOf(view, id);
            if (!p) return { ok: false, reason: say(S, 'readOnlyRefusal') };
            if (!p.owner || p.owner.kind === 'start') return { ok: false, reason: say(S, 'alreadyTop') };
            return ops.move(graph, id, { after: p.owner.id });
        },

        /** Wrap a step in a new block of `typeId`: it becomes the block's first arm (or its body). */
        wrap(graph, id, typeId) {
            return attempt(graph, (g, view) => {
                const place = placeOf(view, id);
                if (!place) refuse(say(S, 'outline_unreachable', nameOf(g, id)));
                const itemId = place.item.id;
                const { seq, index } = place;
                // The only step of a parallel's branch leaves that branch empty, and
                // an empty branch is named by having no first step.
                const emptyRef = seq.ref?.fanout !== undefined ? { fanout: seq.ref.fanout, first: null } : seq.ref;
                const anchor = index > 0 ? { after: seq.items[index - 1].id }
                    : seq.items[index + 1] ? { before: seq.items[index + 1].id } : { into: emptyRef };
                const frag = detach(g, view, itemId);
                const lifted = read(without(g, frag.ids));
                if (!lifted.ok) refuse(lifted.refusal.message);
                const kind = map.kindOf(typeId);
                if (!['branch', 'loop', 'fanout'].includes(kind)) refuse(say(S, 'outline_unknown_type', typeId));
                const goesOn = frag.exits.some((x) => x.kind === 'cont');
                if (kind === 'loop' && !goesOn) refuse(say(S, 'wrapLoopNeverReturns', nameOf(g, itemId)));
                const block = freshFragment(g, typeId);
                if (kind === 'fanout' && !goesOn) {
                    // Its one branch ends on its own: nothing to wait for, no Merge.
                    const join = block.ids[1];
                    g.nodes = g.nodes.filter((n) => n.id !== join);
                    block.ids = [block.ids[0]];
                    block.internal = [];
                    block.exits = [];
                }
                splice(g, gapFor({ ...lifted, graph: g }, anchor), block);
                const withBlock = read(without(g, frag.ids));
                if (!withBlock.ok) refuse(withBlock.refusal.message);
                const inner = kind === 'branch' ? { arm: block.head.id, port: map.armPorts(typeId)[0] }
                    : kind === 'loop' ? { body: block.head.id } : { fanout: block.head.id, first: null };
                if (kind === 'fanout' && !block.exits.length) {
                    const port = catalogue.outputs(typeId, { flow: true })[0]?.name ?? 'out';
                    splice(g, { seq: { items: [] }, index: 0, arriving: [{ source: block.head.id, port }], succ: null,
                                loop: loopAround(withBlock, withBlock.index.at.get(block.head.id).seq),
                                atEnd: true, afterEnd: false }, frag);
                    return block.head.id;
                }
                splice(g, gapFor({ ...withBlock, graph: g }, { into: inner }), frag);
                return block.head.id;
            });
        },

        /** A copy of a step (and what is inside it) right after it. */
        duplicate(graph, id) {
            return attempt(graph, (g, view) => {
                const frag = fragmentOf(view, id);
                if (frag.endsHere) refuse(say(S, 'nothingAfterEnd', nameOf(g, frag.head.id)));
                const copy = freshCopy(g, frag);
                splice(g, gapFor(view, { after: frag.head.id }), copy);
                return copy.head.id;
            });
        },

        /** What Copy keeps: a step's fragment, as plain data. */
        copy(graph, id) {
            const view = read(graph);
            if (!view.ok) return null;
            try {
                const f = fragmentOf(view, id);
                return { head: f.head, ids: f.ids, internal: f.internal, exits: f.exits, endsHere: f.endsHere,
                         nodes: f.nodes, label: displayName(f.nodes[0], catalogue), kind: f.kind };
            } catch (err) {
                if (err instanceof OpRefusal) return null;
                throw err;
            }
        },

        /** Paste a copied fragment at `anchor`, under new ids. */
        paste(graph, anchor, copied) {
            if (!copied) return { ok: false, reason: say(S, 'nothingCopied') };
            return attempt(graph, (g, view) => {
                const gap = gapFor(view, anchor);
                const copy = freshCopy(g, copied);
                splice(g, gap, copy);
                return copy.head.id;
            });
        },

        /** An ordinary step's arm port: connected straight to the step's continuation, or not at all. */
        setArm(graph, id, port, connected) {
            return attempt(graph, (g, view) => {
                const place = placeOf(view, id);
                const arm = place?.item?.arms?.find((a) => a.port === port);
                if (!arm) refuse(say(S, 'outline_unknown_port', nameOf(g, id), port));
                if (connected) {
                    if (arm.seq.exit !== 'open' || arm.seq.items.length) return id;
                    const after = gapAt(view, place.seq, place.index + 1).succ;
                    if (!after) refuse(say(S, 'armNoContinuation', nameOf(g, id)));
                    addLine(g, id, port, after.id, after.port);
                } else {
                    const inside = new Set(arm.seq.items.flatMap(subtreeIds));
                    g.nodes = g.nodes.filter((n) => !inside.has(n.id));
                    g.connections = g.connections.filter((c) => !inside.has(c.source) && !inside.has(c.target)
                        && !(c.source === id && portOf(c, 'source') === port));
                }
                return id;
            });
        },

        /** Where an arm inside a loop goes after its steps: on with the step after, or the loop's next item. */
        setArmExit(graph, id, port, exit) {
            return attempt(graph, (g, view) => {
                const place = placeOf(view, id);
                const arm = place?.item?.arms?.find((a) => a.port === port);
                if (!arm || !['rejoin', 'next'].includes(arm.seq.exit)) refuse(say(S, 'readOnlyRefusal'));
                if (arm.seq.exit === exit) return id;
                const loop = loopAround(view, place.seq);
                const cont = gapAt(view, place.seq, place.index + 1).succ;
                if (!loop || !cont) refuse(say(S, 'nextOutsideLoop', nameOf(g, id)));
                const from = exit === 'next' ? cont : { id: loop, port: map.loopPorts.next };
                const to = exit === 'next' ? { id: loop, port: map.loopPorts.next } : cont;
                const outs = arm.seq.items.length ? outsOf(arm.seq.items[arm.seq.items.length - 1]) : [arm.seq.entry];
                for (const o of outs) {
                    dropLine(g, o.source, o.port, from);
                    addLine(g, o.source, o.port, to.id, to.port);
                }
                return id;
            });
        },

        /** A new branch of a parallel step, holding one new step of `typeId`. */
        addBranch(graph, fanoutId, typeId) {
            return attempt(graph, (g, view) => {
                const item = placeOf(view, fanoutId)?.item;
                if (item?.kind !== 'fanout') refuse(say(S, 'readOnlyRefusal'));
                const port = catalogue.outputs(g.nodes.find((n) => n.id === fanoutId).type, { flow: true })[0]?.name ?? 'out';
                const frag = freshFragment(g, typeId);
                const gap = { seq: { items: [] }, index: 0, arriving: [{ source: fanoutId, port }], loop: loopAround(view, placeOf(view, fanoutId).seq),
                              succ: item.join ? { id: item.join.id, port: item.join.input } : null, atEnd: true, afterEnd: false,
                              // the parallel's other lines out stay: a new branch is one more of them
                              addOnly: true };
                splice(g, gap, frag);
                return frag.head.id;
            });
        },

        /** Remove one branch of a parallel step and everything in it. */
        removeBranch(graph, fanoutId, armIndex) {
            return attempt(graph, (g, view) => {
                const item = placeOf(view, fanoutId)?.item;
                if (item?.kind !== 'fanout') refuse(say(S, 'readOnlyRefusal'));
                if (item.arms.length <= 1) refuse(say(S, 'lastBranch', nameOf(g, fanoutId)));
                const arm = item.arms[armIndex];
                if (!arm) refuse(say(S, 'readOnlyRefusal'));
                // The join must still be reached: by a branch that goes on to it.
                if (item.join && !item.arms.some((a, i) => i !== armIndex && a.seq.exit === 'rejoin')) {
                    refuse(say(S, 'branchToJoinNeeded', nameOf(g, fanoutId), nameOf(g, item.join.id)));
                }
                const inside = new Set(arm.seq.items.flatMap(subtreeIds));
                const first = arm.seq.items[0];
                g.nodes = g.nodes.filter((n) => !inside.has(n.id));
                g.connections = g.connections.filter((c) => !inside.has(c.source) && !inside.has(c.target)
                    && !(c.source === fanoutId && portOf(c, 'source') === arm.port
                         && (first ? c.target === first.id : c.target === item.join?.id)));
                return fanoutId;
            });
        },

        /** The parallel's join setting (`all` / `any`), written to its join step's config. */
        setJoin(graph, fanoutId, value) {
            return attempt(graph, (g, view) => {
                const item = placeOf(view, fanoutId)?.item;
                if (item?.kind !== 'fanout' || !item.join) refuse(say(S, 'readOnlyRefusal'));
                const node = g.nodes.find((n) => n.id === item.join.id);
                node.config = { ...(node.config || {}), [map.joinField]: value };
                return fanoutId;
            });
        },

        /** Is the anchor somewhere `id` could be moved to? (A drag's drop targets ask.) */
        canMoveTo(view, id, anchor) {
            return !insideOf(view, placeOf(view, id)?.item?.id ?? id, anchor);
        },
    };

    // ── words for places ─────────────────────────────────────────────────
    function armWords(graph, owner, arm, i) {
        const node = graph.nodes.find((n) => n.id === owner.id);
        if (arm.role === 'body') return displayName(node, catalogue);
        if (arm.role === 'fanout') return map.fanoutArmLabel(i + 1);
        if (owner.kind === 'branch') return map.branchArmLabel(node, arm.port);
        return map.armLabel(node, arm.port);
    }

    /** The steps and arms around a Seq, as words: ["Anything new?", "Then", "For each …"]. */
    function pathWords(view, seq) {
        const s = view.index.seqs.find((x) => x.seq === seq);
        if (!s) return [];
        const out = [];
        for (const step of s.path) {
            const i = step.owner.arms ? step.owner.arms.indexOf(step.arm) : -1;
            if (step.arm.role === 'body') out.push(displayName(view.graph.nodes.find((n) => n.id === step.owner.id), catalogue));
            else {
                out.push(displayName(view.graph.nodes.find((n) => n.id === step.owner.id), catalogue));
                out.push(armWords(view.graph, step.owner, step.arm, i));
            }
        }
        return out;
    }

    function seqName(view, seq) {
        if (seq === view.tree.top) return say(S, 'theTopLevel');
        const s = view.index.seqs.find((x) => x.seq === seq);
        if (!s) return '';
        const last = s.path[s.path.length - 1];
        const i = last.owner.arms ? last.owner.arms.indexOf(last.arm) : -1;
        return armWords(view.graph, last.owner, last.arm, i);
    }

    /** Where a step is: "Top level", or "Inside Anything new? › Then › For each new application". */
    ops.whereText = (view, id) => {
        const p = view.index.at.get(id);
        if (!p || !p.seq) return '';
        if (p.seq === view.tree.top) {
            const items = p.seq.items;
            if (items.length > 1 && p.index === 0) return say(S, 'topLevelFirst');
            if (items.length > 1 && p.index === items.length - 1) return say(S, 'topLevelLast');
            return say(S, 'topLevel');
        }
        return say(S, 'insidePath', pathWords(view, p.seq).join(say(S, 'pathJoin')));
    };

    /** Where a step put in a gap lands, for the step picker: "inside For each …, after Check eligibility". */
    ops.gapWords = (view, seq, index) => {
        const where = seq === view.tree.top ? say(S, 'gapTop')
            : say(S, 'gapInside', pathWords(view, seq).join(say(S, 'pathJoin')));
        const prev = seq.items[index - 1];
        const next = seq.items[index];
        if (prev) return say(S, 'gapAfter', where, nameOf(view.graph, prev.id));
        if (next) return say(S, 'gapBefore', where, nameOf(view.graph, next.id));
        return say(S, 'gapFirst', where);
    };

    /** A drop target's label: "Into Otherwise · before Stop: nothing new". */
    ops.dropWords = (view, seq, index) => {
        const where = seq === view.tree.top ? say(S, 'dropTop') : say(S, 'dropInto', seqName(view, seq));
        const next = seq.items[index];
        const prev = seq.items[index - 1];
        const at = next ? say(S, 'dropBefore', nameOf(view.graph, next.id))
            : prev ? say(S, 'dropAfter', nameOf(view.graph, prev.id)) : say(S, 'dropFirst');
        return say(S, 'dropLabel', where, at);
    };

    /** An anchor as the Seq and index an operation will use (`canonical`'s), or null. */
    ops.resolve = (view, anchor) => {
        const at = locate(view, anchor);
        return at ? canonical(view, at.seq, at.index) : null;
    };
    /** Is this gap its own canonical place (rather than another name for one)? */
    ops.isCanonical = (view, seq, index) => {
        const c = canonical(view, seq, index);
        return c.seq === seq && c.index === index;
    };
    ops.seqName = seqName;
    ops.armWords = armWords;
    ops.anchorOf = (seq, index) => {
        if (index < seq.items.length) return { before: seq.items[index].id };
        if (index > 0) return { after: seq.items[index - 1].id };
        return { into: seq.ref };
    };
    ops.sameRef = sameRef;
    ops.loopAround = loopAround;
    return ops;
}
