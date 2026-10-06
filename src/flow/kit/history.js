/**
 * UNDO AND REDO OVER WHOLE SNAPSHOTS, BEHIND A CLOSED ACTION LIST (36 §3.9).
 * PURE: no DOM, runs under plain node.
 *
 * Generalised from Tables' designer history in exactly one respect: the
 * closed list of actions is the EDITOR's, passed in, and `commit` still throws
 * on any other. Everything else is kept, behaviour and reason.
 *
 * ══ WHY SNAPSHOTS ══════════════════════════════════════════════════════
 *
 * A flow is small — a few dozen steps and their settings — and one serialised
 * snapshot IS the whole flow (its graph and its own settings), so "undo" is
 * "put the text back" and there is no inverse to get wrong.
 *
 * ══ THE CLOSED LIST ════════════════════════════════════════════════════
 *
 * A future mutation path that forgets to name its action cannot silently fold
 * itself into the next entry; it fails the first test that drives it. Loading
 * a flow and a consumer's publish are absent from every list BY DESIGN: they
 * are BASELINES (both stacks cleared), never entries — the first Ctrl+Z after
 * opening must not "undo" the opening, and a publish is the boundary.
 *
 * ══ MERGING ════════════════════════════════════════════════════════════
 *
 * Typing a label is one edit to a reader, not one per keystroke. A commit with
 * a `key` equal to the top entry's, within `mergeMs` of that entry's last
 * commit, and with no undo or redo since, updates the top entry instead of
 * pushing a new one — so the entry still restores the text from BEFORE the
 * typing began. A merge that lands back on that text drops the entry: a label
 * typed and deleted again is no edit. The first commit after an undo or a redo
 * never merges, even inside the window: the entry it would merge into is an
 * older one the undo exposed, and the next undo would skip a state.
 *
 * ══ SURVIVING A DESTROY ════════════════════════════════════════════════
 *
 * A host may destroy an editor on a tab switch. `keep()` hands the stacks to
 * the caller; `adopt(kept, state)` takes them back only when the state the
 * successor loaded is BYTE-IDENTICAL to the state the stacks were settled on.
 * Bytes are this class's half of the rule: a consumer whose publish turns a
 * draft into a published version byte-identical to it must also check that
 * the successor holds the SAME DRAFT — a fact only the consumer can see — and
 * check it before calling `adopt`.
 */

export class FlowHistory {
    /**
     * @param {object} options
     * @param {readonly string[]} options.actions  the edits this editor records — anything else throws
     * @param {(state: string) => void} options.restore  puts a snapshot back
     * @param {() => void} [options.onState]  after every change to the stacks
     * @param {number} [options.limit]  entries kept; the oldest goes first
     * @param {number} [options.mergeMs]  how close two keyed commits must be
     * @param {() => number} [options.now]  the clock, for a test
     */
    constructor({ actions, restore, onState = null, limit = 100, mergeMs = 1000, now = () => Date.now() } = {}) {
        if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a) => typeof a === 'string')) {
            throw new Error('FlowHistory needs its editor\'s closed list of actions: an edit nobody named '
                            + 'must fail rather than fold itself into the next entry.');
        }
        if (typeof restore !== 'function') {
            throw new Error('FlowHistory needs a restore(state) function: undo has nothing to put back without one.');
        }
        this.actions = Object.freeze([...actions]);
        this._restore = restore;
        this._onState = onState;
        this._limit = limit;
        this._mergeMs = mergeMs;
        this._now = now;
        this._undo = [];
        this._redo = [];
        this._settled = null;
        this._travelled = true;
        this.applying = false;
    }

    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    get depth() { return this._undo.length; }
    /** The state the stacks describe the present as. */
    get settled() { return this._settled; }
    /** The action the next undo would undo, or null. */
    get undoAction() { return this._undo[this._undo.length - 1]?.action ?? null; }
    /** The action the next redo would redo, or null. */
    get redoAction() { return this._redo[this._redo.length - 1]?.action ?? null; }

    /** The hydration gate: `state` is where history starts, and nothing before it is undoable. */
    baseline(state) {
        this._undo = [];
        this._redo = [];
        this._settled = state;
        this._travelled = true;
        this._changed();
    }

    /**
     * Record that the flow is now `state`, by `action`. A no-op when nothing
     * changed or while a restore is being applied. Returns whether the stacks moved.
     */
    commit(state, action, key = null) {
        if (!this.actions.includes(action)) {
            throw new Error(`"${action}" is not an edit this editor records (its actions are `
                            + `${this.actions.join(', ')}).`);
        }
        if (this.applying || state === this._settled) return false;
        const at = this._now();
        const top = this._undo[this._undo.length - 1];
        if (key !== null && top && top.key === key && !this._travelled && at - top.at < this._mergeMs) {
            top.at = at;
            // Typed, then typed away again: the entry changes nothing.
            if (top.before === state) this._undo.pop();
        } else {
            this._undo.push({ action, key, at, before: this._settled });
            if (this._undo.length > this._limit) this._undo.shift();
        }
        this._redo = [];
        this._settled = state;
        this._travelled = false;
        this._changed();
        return true;
    }

    undo() {
        const entry = this._undo.pop();
        if (!entry) return false;
        this._redo.push({ action: entry.action, after: this._settled });
        this._travel(entry.before);
        return true;
    }

    redo() {
        const entry = this._redo.pop();
        if (!entry) return false;
        this._undo.push({ action: entry.action, key: null, at: 0, before: this._settled });
        this._travel(entry.after);
        return true;
    }

    /** The stacks, to be handed back to a successor through `adopt`. */
    keep() {
        return {
            undo: this._undo.map((e) => ({ ...e })),
            redo: this._redo.map((e) => ({ ...e })),
            settled: this._settled,
        };
    }

    /** Take `kept`'s stacks when they were settled on exactly `state`. */
    adopt(kept, state) {
        if (!kept || typeof kept.settled !== 'string' || kept.settled !== state) return false;
        this._undo = (kept.undo || []).map((e) => ({ ...e }));
        this._redo = (kept.redo || []).map((e) => ({ ...e }));
        this._settled = state;
        this._travelled = true;
        this._changed();
        return true;
    }

    _travel(state) {
        this._settled = state;
        this._travelled = true;
        this.applying = true;
        try {
            this._restore(state);
        } finally {
            this.applying = false;
        }
        this._changed();
    }

    _changed() {
        this._onState?.();
    }
}
