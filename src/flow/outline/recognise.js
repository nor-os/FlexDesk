/**
 * THE OUTLINE IS A VIEW OVER THE GRAPH (36 §6.1, §6.3). PURE: no DOM.
 *
 *     outlineFromGraph(graph, catalogue, blocks) → {ok: true, tree} | {ok: false, code, message, node_id}
 *     graphFromOutline(tree)                     → {nodes, connections}
 *
 * The recogniser reads the graph a consumer's validator, publish and runtime
 * already read, and either finds the block structure that IS that graph or
 * refuses it with a sentence. It never repairs: a graph that is not
 * block-shaped is refused, and the editor opens it read-only.
 *
 * ══ THE GRAMMAR ════════════════════════════════════════════════════════
 *
 *   Flow   := Start Seq
 *   Seq    := Item*        an item's continuation is the next item, or the Seq's EXIT
 *   Item   := Step | Branch | Fanout | Loop | End
 *   Step   := an ordinary step: its continue port leads to its continuation;
 *             each other FLOW output is an ARM whose target is that continuation
 *   Branch := one ARM per FLOW output, in declared order
 *   Fanout := an ARM per line out of the fanout, closed by ONE join every arm
 *             that does not end reaches; its continuation is the join's output
 *   Loop   := its body ARM, whose exit is the loop's Next; its continuation is Done
 *   End    := the last item of its Seq
 *   ARM    := a Seq whose EXIT is
 *               rejoin   the owning item's continuation (an empty arm: the port goes straight there)
 *               next     the innermost loop's Next, when that is not already the rejoin
 *               end      its last item is an End
 *               open     the last port is unconnected (the mapping says what that means)
 *
 * ══ WHERE A BRANCH CARRIES ON ══════════════════════════════════════════
 *
 * A Branch's continuation is the first step EVERY ARM THAT MEETS ANOTHER
 * reaches: the earliest node common to the reach of those arms, over FLOW
 * lines with each loop's body set aside (a loop is one node from outside) and
 * its return lines sent to a virtual end of body. An arm that ends on its own —
 * at an End, at a port left unconnected, at a loop's Next — meets no other
 * and does not decide it. That is the immediate post-dominator over the arms
 * that meet; it differs from the textbook post-dominator only where an arm
 * ends, which is exactly where the textbook one would pull every step after
 * the block into the other arm (an error port's "stop here" inside a branch
 * would otherwise nest the rest of the flow). When the arms meet nowhere,
 * the branch has no continuation: the arm that goes on holds the rest of its
 * Seq. A graph cannot say more than that — "Otherwise: stop; then go on" and
 * "Then: go on; Otherwise: stop" are the same lines.
 *
 * ══ EVERY LINE IS EXPLAINED ONCE ═══════════════════════════════════════
 *
 * Every node is placed exactly once and every FLOW line out of a placed node
 * is read exactly once — as the line into the next item, an arm's first
 * line, an exit, or a refusal. `graphFromOutline` writes the lines back from
 * the tree alone, so `graphFromOutline(outlineFromGraph(g).tree)` equal to
 * `g` as sets (I1) is the proof that nothing was lost or invented. Lines
 * between non-flow ports are not part of the outline: they are kept as they
 * are (`tree.extra`).
 */

import { createStrings, say } from '../kit/strings.js';
import { OUTLINE_STRINGS } from './strings.js';
import { createBlockMapping, displayName } from './mapping.js';

/** A refusal: a code, the sentence, the node it names (null only when there is no node to name). */
class Refusal extends Error {
    constructor(code, message, nodeId) {
        super(message);
        this.code = code;
        this.nodeId = nodeId ?? null;
    }
}

const E = (loopId) => `\u0000E:${loopId}`;
const isE = (key) => typeof key === 'string' && key.startsWith('\u0000E:');
const loopOfE = (key) => key.slice(3);

/**
 * @param {object} graph       `{nodes, connections}` (the logic-graph shape)
 * @param {object} catalogue   `createStepCatalogue`'s
 * @param {object} [blocks]    the block mapping (36 §6.2), raw or `createBlockMapping`'s
 * @param {object} [options]
 * @param {object} [options.strings]
 */
export function outlineFromGraph(graph, catalogue, blocks = {}, { strings = null } = {}) {
    const map = createBlockMapping(blocks, catalogue);
    const S = createStrings(OUTLINE_STRINGS, strings);
    try {
        const tree = new Recogniser(graph, catalogue, map, S).run();
        return { ok: true, tree };
    } catch (err) {
        if (err instanceof Refusal) return { ok: false, code: err.code, message: err.message, node_id: err.nodeId };
        throw err;
    }
}

class Recogniser {
    constructor(graph, catalogue, map, S) {
        this.graph = graph && typeof graph === 'object' ? graph : { nodes: [], connections: [] };
        this.cat = catalogue;
        this.map = map;
        this.S = S;
        this.nodes = Array.isArray(this.graph.nodes) ? this.graph.nodes : [];
        this.conns = Array.isArray(this.graph.connections) ? this.graph.connections : [];
        this.byId = new Map(this.nodes.map((n) => [String(n.id), n]));
        this.rank = new Map();
        this.reachMemo = new Map();
        this.placed = new Map();          // id → the item that placed it
        this.ancestors = new Set();       // what runs before the current position on its every path
        this.returnsSeen = new Set();
    }

    // ── names and refusals ──────────────────────────────────────────────
    name(id) { return displayName(this.byId.get(id), this.cat) || String(id); }
    refuse(code, nodeId, ...args) {
        throw new Refusal(code, say(this.S, code, ...args), nodeId);
    }
    refuseWith(code, key, nodeId, ...args) {
        throw new Refusal(code, say(this.S, key, ...args), nodeId);
    }

    kind(id) { return this.map.kindOf(this.byId.get(id)?.type); }
    typeOf(id) { return this.byId.get(id)?.type; }
    isNext(id, port) { return this.kind(id) === 'loop' && port === this.map.loopPorts.next; }

    // ── the graph, read once ────────────────────────────────────────────
    index() {
        const starts = this.nodes.filter((n) => this.map.kindOf(n.type) === 'start');
        if (starts.length === 0) this.refuse('outline_no_start', null);
        if (starts.length > 1) this.refuse('outline_two_starts', String(starts[1].id));
        this.startId = String(starts[0].id);

        for (const n of this.nodes) {
            if (!this.cat?.has?.(n.type)) this.refuse('outline_unknown_type', String(n.id), String(n.type));
        }

        this.flow = [];
        this.extra = [];
        this.out = new Map(this.nodes.map((n) => [String(n.id), []]));
        this.into = new Map(this.nodes.map((n) => [String(n.id), []]));
        for (const c of this.conns) {
            const s = String(c.source);
            const t = String(c.target);
            // An absent port name reads as `out` / `in`, as the graph's own
            // reader (`normalise`) and the consumer's server read it.
            const sourcePort = String(c.sourcePort || 'out');
            const targetPort = String(c.targetPort || 'in');
            if (!this.byId.has(s)) this.refuse('outline_broken_line', this.byId.has(t) ? t : null, s);
            if (!this.byId.has(t)) this.refuse('outline_broken_line', s, t);
            const sp = this.cat.port(this.typeOf(s), sourcePort, 'output');
            const tp = this.cat.port(this.typeOf(t), targetPort, 'input');
            if (!sp) this.refuse('outline_unknown_port', s, this.name(s), sourcePort);
            if (!tp) this.refuse('outline_unknown_port', t, this.name(t), targetPort);
            if ((sp.port_type || 'FLOW') !== 'FLOW' || (tp.port_type || 'FLOW') !== 'FLOW') {
                this.extra.push(c);
                continue;
            }
            // A line from a step into itself (a loop's body straight into its own
            // Next included) is a cycle of one, and says so in its own words.
            if (s === t) this.refuseWith('outline_cycle', 'selfLine', s, this.name(s));
            const edge = { source: s, target: t, sourcePort, targetPort, raw: c };
            this.flow.push(edge);
            this.out.get(s).push(edge);
            this.into.get(t).push(edge);
        }
    }

    outOf(id, port) { return this.out.get(id).filter((e) => e.sourcePort === port); }

    /** Every node is reached from Start, over any flow line. */
    reachability() {
        const seen = new Set([this.startId]);
        const queue = [this.startId];
        while (queue.length) {
            const id = queue.shift();
            for (const e of this.out.get(id)) {
                if (!seen.has(e.target)) { seen.add(e.target); queue.push(e.target); }
            }
        }
        for (const n of this.nodes) {
            if (!seen.has(String(n.id))) this.refuse('outline_unreachable', String(n.id), this.name(String(n.id)));
        }
    }

    /**
     * The structure the continuations are read on: a loop's body lines set
     * aside (a loop is one node from outside), a line into a loop's Next sent
     * to that loop's virtual end of body. A cycle here is a line back that is
     * not a loop's Next.
     */
    structure() {
        this.succ = new Map();
        const add = (from, to) => {
            if (!this.succ.has(from)) this.succ.set(from, []);
            if (!this.succ.get(from).includes(to)) this.succ.get(from).push(to);
        };
        for (const n of this.nodes) add(String(n.id), null);
        for (const e of this.flow) {
            if (this.isNext(e.target, e.targetPort)) { add(e.source, E(e.target)); continue; }
            if (this.kind(e.source) === 'loop' && e.sourcePort === this.map.loopPorts.body) continue;
            add(e.source, e.target);
        }
        for (const [k, list] of this.succ) this.succ.set(k, list.filter((x) => x !== null));
        // Topological order (and the cycle a line back that is not a Next makes).
        const state = new Map();
        const order = [];
        const visit = (id, from) => {
            const st = state.get(id);
            if (st === 1) this.refuse('outline_cycle', from, this.name(from), this.name(id));
            if (st === 2) return;
            state.set(id, 1);
            for (const s of this.succ.get(id) || []) if (!isE(s)) visit(s, id);
            state.set(id, 2);
            order.push(id);
        };
        for (const n of this.nodes) visit(String(n.id), String(n.id));
        order.reverse().forEach((id, i) => this.rank.set(id, i));
        for (const n of this.nodes) {
            if (this.kind(String(n.id)) === 'loop') this.rank.set(E(String(n.id)), this.nodes.length + this.rank.get(String(n.id)));
        }
    }

    /** Every key reachable from `key` (itself not included). */
    reach(key) {
        if (key === null || key === undefined) return new Set();
        if (this.reachMemo.has(key)) return this.reachMemo.get(key);
        const out = new Set();
        const stack = [...(this.succ.get(key) || [])];
        while (stack.length) {
            const k = stack.pop();
            if (out.has(k)) continue;
            out.add(k);
            for (const s of this.succ.get(k) || []) stack.push(s);
        }
        this.reachMemo.set(key, out);
        return out;
    }

    /** A line's target as a key of the structure: a node, or a loop's end of body. */
    keyOf(edge) { return this.isNext(edge.target, edge.targetPort) ? E(edge.target) : edge.target; }

    /**
     * Where a Branch carries on: a key, or null. The first step the arms that
     * meet all reach; and where they meet nowhere, the place the branch's own
     * Seq goes on to (`T`) when an arm goes there — that arm rejoins it, and
     * the branch is the last item of its Seq.
     */
    branchContinuation(id, T) {
        const arms = [];
        for (const port of this.map.armPorts(this.typeOf(id))) {
            const es = this.outOf(id, port);
            if (es.length > 1) this.refuse('outline_two_continuations', id, this.name(id));
            if (!es.length) { arms.push(new Set()); continue; }
            const k = this.keyOf(es[0]);
            arms.push(new Set([k, ...this.reach(k)]));
        }
        const live = arms.filter((r, i) => arms.some((q, j) => j !== i && [...r].some((x) => q.has(x))));
        const common = live.length ? [...live[0]].filter((x) => live.every((r) => r.has(x))) : [];
        if (common.length) {
            common.sort((a, b) => (this.rank.get(a) ?? Infinity) - (this.rank.get(b) ?? Infinity));
            return common[0];
        }
        if (T?.kind === 'node' && arms.some((r) => r.has(T.id))) return T.id;
        if (T?.kind === 'next' && arms.some((r) => r.has(E(T.loop)))) return E(T.loop);
        if (T?.kind === 'join') {
            const joins = new Set(arms.map((r) => this.firstOpenJoin(r)).filter(Boolean));
            if (joins.size === 1) return [...joins][0];
        }
        return null;
    }

    /**
     * The first join in `keys` that no fanout among them closes first: walked
     * in run order, a fanout opens one and a join closes the innermost open
     * one, so a parallel nested inside an arm keeps its own Merge.
     */
    firstOpenJoin(keys) {
        let depth = 0;
        const ordered = [...keys].filter((k) => !isE(k) && !this.placed.has(k))
            .sort((a, b) => (this.rank.get(a) ?? Infinity) - (this.rank.get(b) ?? Infinity));
        for (const k of ordered) {
            const kind = this.kind(k);
            if (kind === 'fanout') depth += 1;
            else if (kind === 'join') {
                if (depth === 0) return k;
                depth -= 1;
            }
        }
        return null;
    }

    // ── the parse ───────────────────────────────────────────────────────
    run() {
        this.index();
        this.reachability();
        this.structure();
        const start = this.startId;
        this.place(start, null);
        const startItem = { kind: 'start', id: start, input: null, cont: this.map.cont(this.typeOf(start)), arms: [] };
        this.placed.set(start, startItem);
        const contEdges = startItem.cont ? this.outOf(start, startItem.cont) : [];
        if (contEdges.length > 1) this.refuse('outline_two_continuations', start, this.name(start));
        const contPos = contEdges.length ? this.position(contEdges[0]) : null;
        const T = this.targetOf(contPos);
        const ctx0 = { depth: 0, loops: [], guards: [], targets: [], kind: 'top' };
        startItem.arms = this.parseArms(start, T, ctx0, 'arm');
        const top = this.parseSeq(contPos, { kind: 'none' }, ctx0);
        top.entry = { source: start, port: startItem.cont };
        top.ref = 'top';
        // Every line was read when its source was placed; a node no line placed
        // was refused as unreachable. The flow is block-shaped.
        return {
            start: startItem,
            top,
            nodes: this.nodes,
            extra: this.extra,
            loopNext: this.map.loopPorts.next,
        };
    }

    place(id, item) {
        this.placed.set(id, item);
        this.ancestors.add(id);
    }

    position(edge) {
        return { t: edge.target, tp: edge.targetPort, src: edge.source, edge };
    }

    /** A continuation position as an arm's exit target. */
    targetOf(pos) {
        if (!pos) return { kind: 'none' };
        if (this.isNext(pos.t, pos.tp)) return { kind: 'next', loop: pos.t };
        return { kind: 'node', id: pos.t };
    }

    child(ctx, T, kind, extraGuard = null) {
        const guards = extraGuard ? [...ctx.guards, extraGuard] : ctx.guards;
        return { depth: ctx.depth + 1, loops: ctx.loops, guards, targets: [...ctx.targets, T], kind };
    }

    afterGuard(T) {
        if (T.kind !== 'node') return null;
        return { set: this.reach(T.id), tag: 'after' };
    }

    /** The arms of an ordinary step (or a loop's other outputs, or Start's), each targeting `T`. */
    parseArms(id, T, ctx, kind) {
        const arms = [];
        for (const port of this.map.armPorts(this.typeOf(id))) {
            const es = this.outOf(id, port);
            if (es.length > 1) this.refuse('outline_two_continuations', id, this.name(id));
            const sub = this.child(ctx, T, 'step', this.afterGuard(T));
            const seq = es.length ? this.parseSeq(this.position(es[0]), T, sub)
                : this.emptySeq(T, 'open');
            seq.entry = { source: id, port };
            seq.ref = { arm: id, port };
            arms.push({ port, role: kind, seq });
        }
        return arms;
    }

    emptySeq(T, exit) {
        return { items: [], exit, T: T.kind === 'node' ? { id: T.id } : T.kind === 'next' ? { id: T.loop, next: true } : null };
    }

    /**
     * One Seq, from `pos` (the line into its first item, or null for a port
     * left unconnected) until it reaches `T`.
     */
    parseSeq(pos, T, ctx) {
        const seq = { items: [], exit: null, T: null };
        seq.T = T.kind === 'node' ? { id: T.id } : T.kind === 'next' ? { id: T.loop, next: true } : null;
        const added = [];
        let cur = pos;
        const finish = (exit, extra = {}) => { seq.exit = exit; Object.assign(seq, extra); };
        for (;;) {
            if (!cur) {
                // The last port is unconnected: where nothing follows anyway it is
                // the Seq running to its end; elsewhere the path stops here.
                const ownPortOpen = seq.items.length === 0 && ctx.kind === 'step';
                finish(T.kind === 'none' && !ownPortOpen ? 'rejoin' : 'open');
                break;
            }
            const { t, tp, src } = cur;
            if (cur.edge && this.isNext(t, tp)) this.returnsSeen.add(cur.edge);
            // 1 — the Seq's own exit
            if (T.kind === 'node' && t === T.id && !this.isNext(t, tp)) { finish('rejoin', { to: { id: t, port: tp } }); break; }
            if (T.kind === 'join' && this.kind(t) === 'join' && !this.placed.has(t)) {
                finish('rejoin', { to: { id: t, port: tp }, join: t });
                break;
            }
            // 2 — a loop's Next
            if (this.isNext(t, tp)) {
                if (T.kind === 'next' && T.loop === t) { finish('rejoin', { to: { id: t, port: tp } }); break; }
                if (ctx.loops[0] === t) { finish('next', { to: { id: t, port: tp }, loop: t }); break; }
                if (ctx.loops.includes(t)) this.refuse('outline_loop_shape', ctx.loops[0], this.name(ctx.loops[0]));
                this.refuseWith('outline_loop_shape', 'loopNextOutside', src, this.name(src), this.name(t));
            }
            // 3 — a line that leaves its block
            for (const g of ctx.guards) {
                if (!g.set.has(t)) continue;
                if (g.tag === 'leak') this.refuseWith('outline_loop_shape', 'loopLeaks', g.loop, this.name(g.loop), this.name(t));
                this.refuse('outline_jump_out', src, this.name(src), this.name(t));
            }
            for (const target of ctx.targets) {
                if (target.kind === 'node' && target.id === t) this.refuse('outline_jump_out', src, this.name(src), this.name(t));
            }
            // 4 — a step already placed: on the way here (a line back), or by
            // another arm (a line out of an arm into what follows its block was
            // caught as leaving it, above)
            if (this.placed.has(t)) {
                if (this.ancestors.has(t)) this.refuse('outline_cycle', src, this.name(src), this.name(t));
                this.refuse('outline_shared_step', t, this.name(t));
            }
            // 5 — the next item
            const k = this.kind(t);
            let next = null;
            if (k === 'end') {
                const item = { kind: 'end', id: t, input: tp };
                this.place(t, item);
                added.push(t);
                const leaving = this.out.get(t)[0];
                if (leaving) this.refuse('outline_after_end', t, this.name(t), this.name(leaving.target));
                seq.items.push(item);
                finish('end');
                break;
            } else if (k === 'join') {
                this.refuse('outline_merge_unpaired', t, this.name(t));
            } else if (k === 'start') {
                this.refuse('outline_two_starts', t);
            } else if (k === 'branch') {
                next = this.parseBranch(t, tp, ctx, seq, added, T);
            } else if (k === 'fanout') {
                next = this.parseFanout(t, tp, ctx, seq, added);
            } else if (k === 'loop') {
                next = this.parseLoop(t, tp, ctx, seq, added);
            } else {
                next = this.parseStep(t, tp, ctx, seq, added);
            }
            cur = next;
        }
        for (const id of added) this.ancestors.delete(id);
        return seq;
    }

    parseStep(id, tp, ctx, seq, added) {
        const type = this.typeOf(id);
        const item = { kind: 'step', id, input: tp, cont: this.map.cont(type), arms: [] };
        this.place(id, item);
        added.push(id);
        seq.items.push(item);
        const es = item.cont ? this.outOf(id, item.cont) : [];
        if (es.length > 1) this.refuse('outline_two_continuations', id, this.name(id));
        const contPos = es.length ? this.position(es[0]) : null;
        item.arms = this.parseArms(id, this.targetOf(contPos), ctx, 'arm');
        return contPos;
    }

    parseBranch(id, tp, ctx, seq, added, seqT) {
        const item = { kind: 'branch', id, input: tp, arms: [] };
        this.place(id, item);
        added.push(id);
        seq.items.push(item);
        const key = this.branchContinuation(id, seqT);
        const T = key === null ? { kind: 'none' } : isE(key) ? { kind: 'next', loop: loopOfE(key) } : { kind: 'node', id: key };
        this.map.armPorts(this.typeOf(id)).forEach((port) => {
            const es = this.outOf(id, port);
            const sub = this.child(ctx, T, 'branch', this.afterGuard(T));
            const armSeq = es.length ? this.parseSeq(this.position(es[0]), T, sub)
                : this.emptySeq(T, T.kind === 'none' ? 'rejoin' : 'open');
            armSeq.entry = { source: id, port };
            armSeq.ref = { arm: id, port };
            item.arms.push({ port, role: 'branch', seq: armSeq });
        });
        if (key === null) return null;
        if (isE(key)) return { t: loopOfE(key), tp: this.map.loopPorts.next, src: id, edge: null };
        return { t: key, tp: this.map.input(this.typeOf(key)), src: id, edge: null };
    }

    parseFanout(id, tp, ctx, seq, added) {
        const item = { kind: 'fanout', id, input: tp, join: null, arms: [] };
        this.place(id, item);
        added.push(id);
        seq.items.push(item);
        const lines = this.out.get(id);
        if (!lines.length) this.refuse('outline_parallel_unjoined', id, this.name(id));
        const joins = new Set();
        const armNodes = [];
        lines.forEach((e, i) => {
            const before = new Set(this.placed.keys());
            const sub = this.child(ctx, { kind: 'join' }, 'fanout');
            const armSeq = this.parseSeq(this.position(e), { kind: 'join' }, sub);
            armSeq.entry = { source: id, port: e.sourcePort, line: i };
            armSeq.ref = { fanout: id, first: armSeq.items[0]?.id ?? null };
            if (armSeq.exit === 'rejoin') joins.add(armSeq.join);
            for (const k of this.placed.keys()) if (!before.has(k)) armNodes.push(k);
            item.arms.push({ port: e.sourcePort, role: 'fanout', seq: armSeq });
        });
        // Every branch ends on its own (an End, a port left unconnected, a
        // loop's Next): there is nothing to wait for and no continuation.
        if (joins.size === 0 && item.arms.every((a) => a.seq.exit !== 'rejoin')) return null;
        if (joins.size !== 1) this.refuse('outline_parallel_unjoined', id, this.name(id));
        const J = [...joins][0];
        // An arm that goes past the join without passing it left its block.
        const after = this.reach(J);
        for (const n of armNodes) {
            if (!after.has(n)) continue;
            const line = this.into.get(n).find((e) => armNodes.includes(e.source) && !after.has(e.source))
                ?? this.into.get(n)[0];
            this.refuse('outline_jump_out', line.source, this.name(line.source), this.name(n));
        }
        const joinType = this.typeOf(J);
        item.join = { id: J, input: this.map.input(joinType), cont: this.map.cont(joinType) };
        for (const a of item.arms) a.seq.T = { id: J };
        for (const port of this.map.armPorts(joinType)) {
            const extra = this.outOf(J, port)[0];
            if (extra) this.refuse('outline_two_continuations', J, this.name(J));
        }
        this.place(J, item);
        added.push(J);
        const es = item.join.cont ? this.outOf(J, item.join.cont) : [];
        if (es.length > 1) this.refuse('outline_two_continuations', J, this.name(J));
        return es.length ? this.position(es[0]) : null;
    }

    parseLoop(id, tp, ctx, seq, added) {
        const ports = this.map.loopPorts;
        if (tp !== ports.entry && tp !== this.map.input(this.typeOf(id))) {
            this.refuseWith('outline_loop_shape', 'loopEnteredByNext', id, this.name(id));
        }
        const item = { kind: 'loop', id, input: tp, done: ports.done, body: null, arms: [] };
        this.place(id, item);
        added.push(id);
        seq.items.push(item);
        const doneEdges = this.outOf(id, ports.done);
        if (doneEdges.length > 1) this.refuse('outline_two_continuations', id, this.name(id));
        const donePos = doneEdges.length ? this.position(doneEdges[0]) : null;
        const doneKey = donePos ? this.keyOf(donePos.edge) : null;
        const bodyEdges = this.outOf(id, ports.body);
        if (bodyEdges.length > 1) this.refuse('outline_two_continuations', id, this.name(id));
        const T = { kind: 'next', loop: id };
        const leak = doneKey === null ? null
            : { set: new Set([doneKey, ...this.reach(doneKey)]), tag: 'leak', loop: id };
        const sub = { ...this.child(ctx, T, 'body', leak), loops: [id, ...ctx.loops] };
        const bodySeq = bodyEdges.length ? this.parseSeq(this.position(bodyEdges[0]), T, sub)
            : this.emptySeq(T, 'open');
        bodySeq.entry = { source: id, port: ports.body };
        bodySeq.ref = { body: id };
        item.body = { port: ports.body, role: 'body', seq: bodySeq };
        const returns = this.into.get(id).filter((e) => e.targetPort === ports.next);
        for (const r of returns) {
            if (!this.returnsSeen.has(r)) this.refuseWith('outline_loop_shape', 'loopNextOutside', r.source, this.name(r.source), this.name(id));
        }
        if (bodySeq.items.length && !returns.length) this.refuse('outline_loop_shape', id, this.name(id));
        item.arms = this.parseArms(id, this.targetOf(donePos), ctx, 'arm');
        return donePos;
    }
}

// ── the way back ─────────────────────────────────────────────────────────

/**
 * The graph a tree describes: its nodes, and every line written back from
 * the tree's structure alone — an item's continuation into the next item or
 * its Seq's exit, an arm's first line, a fanout's lines into its join, a
 * loop's body and Done — plus the non-flow lines it kept.
 */
export function graphFromOutline(tree) {
    const connections = [];
    const add = (source, sourcePort, to) => {
        if (to) connections.push({ source, target: to.id, sourcePort, targetPort: to.port });
    };
    const head = (item) => ({ id: item.id, port: item.input });
    // Where a Seq's last continuation goes, given where its owner carries on.
    const exitTo = (seq, T) => {
        if (seq.exit === 'next') return seq.to;
        if (seq.exit !== 'rejoin' || !T) return null;
        // The port a line takes into the target is the one the recogniser read.
        return seq.to && seq.to.id === T.id ? seq.to : T;
    };
    const emitArm = (owner, port, seq, T) => {
        if (!seq.items.length) { add(owner, port, exitTo(seq, T)); return; }
        add(owner, port, head(seq.items[0]));
        emitSeq(seq, T);
    };
    const emitItem = (item, next) => {
        switch (item.kind) {
            case 'start':
            case 'step':
                if (item.cont) add(item.id, item.cont, next);
                for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
                break;
            case 'branch':
                for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
                break;
            case 'fanout':
                for (const arm of item.arms) {
                    emitArm(item.id, arm.port, arm.seq, item.join ? { id: item.join.id, port: item.join.input } : null);
                }
                if (item.join?.cont) add(item.join.id, item.join.cont, next);
                break;
            case 'loop':
                emitArm(item.id, item.body.port, item.body.seq, { id: item.id, port: tree.loopNext });
                add(item.id, item.done, next);
                for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
                break;
            default:
                break;
        }
    };
    function emitSeq(seq, T) {
        seq.items.forEach((item, i) => {
            const next = i + 1 < seq.items.length ? head(seq.items[i + 1]) : exitTo(seq, T);
            emitItem(item, next);
        });
    }
    const top = tree.top;
    emitItem(tree.start, top.items.length ? head(top.items[0]) : exitTo(top, null));
    emitSeq(top, null);
    return {
        nodes: tree.nodes.map((n) => structuredClone(n)),
        connections: [...connections, ...tree.extra.map((c) => ({ ...c }))],
    };
}

/** `a` and `b` as sets: nodes by id and deep-equal, connections as (source, port, target, port). */
export function sameGraphAsSets(a, b) {
    const nodeKey = (n) => JSON.stringify(sorted(n));
    // An absent port is `out` / `in`, as `normalise` reads it.
    const lineKey = (c) => JSON.stringify([String(c.source), String(c.sourcePort || 'out'), String(c.target),
                                           String(c.targetPort || 'in')]);
    const nodes = (g) => new Map((g?.nodes || []).map((n) => [String(n.id), nodeKey(n)]));
    const lines = (g) => new Set((g?.connections || []).map(lineKey));
    const na = nodes(a);
    const nb = nodes(b);
    if (na.size !== nb.size) return false;
    for (const [id, k] of na) if (nb.get(id) !== k) return false;
    const la = lines(a);
    const lb = lines(b);
    if (la.size !== lb.size) return false;
    for (const k of la) if (!lb.has(k)) return false;
    return true;
}

function sorted(v) {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
    return v;
}

/**
 * Where every placed thing is in a tree: id → `{item, seq, index, arm, owner,
 * depth, path}`, where `path` lists the enclosing `{owner, arm}` pairs from
 * the top. A fanout's join is filed under its fanout's item. Every Seq is
 * listed too, with its parent item and depth.
 */
export function indexTree(tree) {
    const at = new Map();
    const seqs = [];
    const walkSeq = (seq, depth, path, owner, arm) => {
        seq.depth = depth;
        seqs.push({ seq, depth, path, owner, arm });
        seq.items.forEach((item, index) => {
            const place = { item, seq, index, arm, owner, depth, path };
            at.set(item.id, place);
            if (item.kind === 'fanout' && item.join) at.set(item.join.id, { ...place, join: true });
            const inner = (a) => walkSeq(a.seq, depth + 1, [...path, { owner: item, arm: a }], item, a);
            if (item.kind === 'loop') inner(item.body);
            for (const a of item.arms || []) inner(a);
        });
    };
    at.set(tree.start.id, { item: tree.start, seq: null, index: -1, arm: null, owner: null, depth: 0, path: [] });
    for (const a of tree.start.arms) walkSeq(a.seq, 1, [{ owner: tree.start, arm: a }], tree.start, a);
    walkSeq(tree.top, 0, [], null, null);
    return { at, seqs };
}

/** Every node of an item and everything inside it, the item's own id first. */
export function subtreeIds(item) {
    const out = [item.id];
    if (item.kind === 'fanout' && item.join) out.push(item.join.id);
    const seqIds = (seq) => seq.items.flatMap(subtreeIds);
    if (item.kind === 'loop') out.push(...seqIds(item.body.seq));
    for (const a of item.arms || []) out.push(...seqIds(a.seq));
    return out;
}

/** The ids in the order a run takes them: the tree's own order, depth first. */
export function runOrder(tree) {
    const out = [tree.start.id];
    for (const a of tree.start.arms) out.push(...a.seq.items.flatMap(subtreeIds));
    out.push(...tree.top.items.flatMap(subtreeIds));
    return out;
}

/** The order to list a graph that is not block-shaped in: breadth first from Start, then the rest. */
export function flatRunOrder(graph, catalogue, blocks = {}) {
    const map = createBlockMapping(blocks, catalogue);
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const ids = nodes.map((n) => String(n.id));
    const start = nodes.find((n) => map.kindOf(n.type) === 'start');
    const out = [];
    const seen = new Set();
    if (start) {
        const queue = [String(start.id)];
        seen.add(String(start.id));
        while (queue.length) {
            const id = queue.shift();
            out.push(id);
            for (const c of graph.connections || []) {
                if (String(c.source) !== id) continue;
                const t = String(c.target);
                if (!seen.has(t) && ids.includes(t)) { seen.add(t); queue.push(t); }
            }
        }
    }
    for (const id of ids) if (!seen.has(id)) out.push(id);
    return out;
}

/**
 * A tree as lines of text, two spaces a level — what the corpus states a
 * graph's outline to be, and a readable dump for anyone debugging one:
 *
 *     step fetch
 *       arm error
 *         end portaldown
 *         = end
 *     branch anynew
 *       arm true …
 *
 * An item is `step|end|branch|loop <id>` or `fanout <id> join <join>`; an arm
 * is `arm <port>`, a fanout's `branch`, a loop's `body`; each Seq closes with
 * `= rejoin|next|open|end`.
 */
export function describeOutline(tree) {
    const lines = [];
    const pad = (d) => '  '.repeat(d);
    const seq = (s, d) => {
        for (const item of s.items) itemLines(item, d);
        lines.push(`${pad(d)}= ${s.exit}`);
    };
    const arm = (a, d) => {
        lines.push(`${pad(d)}${a.role === 'fanout' ? 'branch' : a.role === 'body' ? 'body' : `arm ${a.port}`}`);
        seq(a.seq, d + 1);
    };
    function itemLines(item, d) {
        lines.push(`${pad(d)}${item.kind} ${item.id}${item.kind === 'fanout' && item.join ? ` join ${item.join.id}` : ''}`);
        if (item.kind === 'loop') arm(item.body, d + 1);
        for (const a of item.arms || []) arm(a, d + 1);
    }
    lines.push(`start ${tree.start.id}`);
    for (const a of tree.start.arms) arm(a, 1);
    seq(tree.top, 0);
    return lines;
}

export { Refusal };
