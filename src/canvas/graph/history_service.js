/**
 * The canvas kernel — GRAPH LAYER: undo and redo over recorded edits, behind a
 * CLOSED action list (36 §4.3).
 *
 * GENERIC. An entry is `{action, …payload}` — typically `before` and `after` —
 * and putting one back is the embedder's `apply(entry, direction)`: the
 * service knows the stack, the batch, the hydration gate and the closed list,
 * never what an entry means. (A whole-snapshot history, for a graph small
 * enough to copy, is `@flexdesk/flow`'s `FlowHistory`; this one records
 * DELTAS, for a diagram too large to snapshot on every move.)
 *
 * ══ THE CLOSED LIST ════════════════════════════════════════════════════
 *
 * The only actions that exist are the ones the embedder declares, and
 * `record()` REJECTS anything else — loudly, with `refusal(action)`'s
 * sentence. An embedder whose Ctrl+Z must never reach something (a change
 * already applied to a server, say) enforces that structurally: the action
 * that would touch it cannot be recorded by accident; it has to be added on
 * purpose, to a list the embedder's own comment says not to add it to.
 *
 * ══ TWO TRAPS THIS IS BUILT AGAINST ════════════════════════════════════
 *
 *   1. A MISSING DEPENDENCY FAILS LOUDLY, AT CONSTRUCTION. An undo engine
 *      constructed with the wrong dependency set does nothing and reports
 *      nothing — every restore path quietly returns — and the symptom, "undo
 *      does nothing", says nothing about the cause. So `actions` and `apply`
 *      are required, and `requires` lets a subclass name its own
 *      (`{platform, router, plan}`): each must be present, or the constructor
 *      throws naming it.
 *   2. THE HYDRATION GATE. Loading a drawing must not itself be undoable —
 *      otherwise the first Ctrl+Z after opening "undoes" the opening. Nothing is
 *      recorded until `hydrated()`.
 */

const DEFAULT_LIMIT = 200;

const missing = (name) => new Error(
    `HistoryService needs ${name}. Constructing it without the full dependency set is how an undo `
  + 'engine ends up silently doing nothing.');

export class HistoryService {
    /**
     * @param {object} o
     * @param {readonly string[]} o.actions  the only actions `record` accepts
     * @param {(entry: object, direction: 'undo'|'redo') => void} o.apply  puts one entry back (or forward)
     * @param {(state: {canUndo, canRedo, depth}) => void} [o.onState]
     * @param {number} [o.limit]   entries kept; the oldest goes first
     * @param {object} [o.requires]  `{name: value}` a subclass cannot work without; each is checked
     * @param {(action: string) => string} [o.refusal]  the sentence a refused `record` throws
     */
    constructor({ actions, apply, onState, limit = DEFAULT_LIMIT, requires = null, refusal = null } = {}) {
        // Loudly, at construction — see the header.
        for (const [name, value] of Object.entries(requires || {})) {
            if (!value) throw missing(name);
        }
        if (!Array.isArray(actions) || !actions.length) throw missing('actions (its closed list)');
        if (typeof apply !== 'function') throw missing('apply(entry, direction)');
        this.actions = Object.freeze([...actions]);
        this._applyEntry = apply;
        this.onState = onState;
        this.limit = limit;
        this.refusal = typeof refusal === 'function' ? refusal : null;
        this.undoStack = [];
        this.redoStack = [];
        // The hydration gate. Recording starts only once a drawing is loaded.
        this.recording = false;
        this.batch = null;
    }

    /** The drawing has been loaded: the stacks start empty, and recording starts. */
    hydrated() {
        this.undoStack = [];
        this.redoStack = [];
        this.recording = true;
        this._publish();
    }

    /** Group what is recorded until `endBatch` into one entry. */
    startBatch(label) {
        if (!this.recording) return;
        this.batch = { action: 'batch', label, entries: [] };
    }

    endBatch() {
        if (!this.batch) return;
        const batch = this.batch;
        this.batch = null;
        if (batch.entries.length) this._push(batch);
    }

    record(action, payload) {
        if (!this.recording) return;
        if (!this.actions.includes(action)) {
            throw new Error(this.refusal
                ? this.refusal(action)
                : `${action} is not an undoable action here; the ones that are: ${this.actions.join(', ')}.`);
        }
        const entry = { action, ...payload };
        if (this.batch) { this.batch.entries.push(entry); return; }
        this._push(entry);
    }

    undo() {
        const entry = this.undoStack.pop();
        if (!entry) return false;
        this._apply(entry, 'undo');
        this.redoStack.push(entry);
        this._publish();
        return true;
    }

    redo() {
        const entry = this.redoStack.pop();
        if (!entry) return false;
        this._apply(entry, 'redo');
        this.undoStack.push(entry);
        this._publish();
        return true;
    }

    reset() {
        this.undoStack = [];
        this.redoStack = [];
        this._publish();
    }

    /**
     * Take over the undo and redo stacks of a torn-down view whose state this
     * one has just taken on, entry for entry and in the same order. Nothing new
     * becomes undoable: every entry was recorded through a `record` whose action
     * list is closed, so a stack can only carry what that list allows. Call it
     * after `hydrated()`.
     */
    adopt({ undo = [], redo = [] } = {}) {
        if (!this.recording) return;
        this.undoStack = [...undo].slice(-this.limit);
        this.redoStack = [...redo];
        this._publish();
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    _push(entry) {
        this.undoStack.push(entry);
        // A new action invalidates the redo branch. Keeping it would let a user
        // redo their way into a state that never existed.
        this.redoStack = [];
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this._publish();
    }

    _publish() {
        this.onState?.({
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            depth: this.undoStack.length,
        });
    }

    _apply(entry, direction) {
        if (entry.action === 'batch') {
            const entries = direction === 'undo'
                ? [...entry.entries].reverse() : entry.entries;
            for (const child of entries) this._apply(child, direction);
            return;
        }
        this._applyEntry(entry, direction);
    }
}
