/**
 * staged_history.js — STORY-0088. Ctrl+Z and Ctrl+Y over a grid's STAGED
 * edits, and over nothing else. No DOM: the ring decides WHAT to reverse, and
 * the grid that owns the staged cells decides HOW (`apply`).
 *
 * ══ STAGED, NEVER COMMITTED ══════════════════════════════════════════════
 *
 * Ctrl+Z takes back what was typed and not yet committed. It never reaches a
 * commit: once a batch has gone to the consumer, `reset()` empties the ring,
 * so an undo or a redo after a commit does nothing. `ACTIONS` lists the only
 * thing the ring knows how to reverse, and `record()` refuses anything else —
 * an undoable action that writes somewhere cannot be added by accident.
 *
 * ══ A DELTA, NOT A SNAPSHOT ══════════════════════════════════════════════
 *
 * An entry is the change itself: one cell's `before` and `after`. A paste of
 * 20,000 cells is one group of 20,000 deltas, held once — not 20,000 entries'
 * worth of copies of the staged set. `limit` counts ENTRIES (a group is one).
 *
 * Each side is `{has, value}`, not just a value, because a staged cell has
 * three states: absent (no change), staged as null, staged as something. A
 * side that held only the value could not tell the first two apart, and undoing
 * a cell staged as null would leave a staged null behind instead of no change.
 */

/** The only action that exists: one cell's staged state changed.
 *  `{action: 'cell:stage', row, col, before: {has, value}, after: {has, value}}`. */
export const ACTIONS = Object.freeze(['cell:stage']);

/** Entries kept when no `limit` is given. */
export const DEFAULT_HISTORY_LIMIT = 100;

export class StagedHistory {
    /**
     * @param {object} cfg
     * @param {(entry, direction: 'undo'|'redo') => void} cfg.apply  writes one
     *   leaf entry's `before` (undo) or `after` (redo) into the staged cells.
     *   Called once per leaf; the ring holds no reference to those cells.
     * @param {({canUndo, canRedo, depth}) => void} [cfg.onState]  after every
     *   change of the stacks.
     * @param {number} [cfg.limit=100]  entries kept; the oldest fall off.
     */
    constructor({ apply, onState = null, limit = DEFAULT_HISTORY_LIMIT } = {}) {
        if (typeof apply !== 'function') {
            throw new Error('StagedHistory needs an `apply(entry, direction)`: a ring with no '
                + 'writer would report every undo as done and change nothing.');
        }
        this.apply = apply;
        this.onState = onState;
        this.limit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_HISTORY_LIMIT;
        this.undoStack = [];
        this.redoStack = [];
        this.group = null;
        /** Groups nest; only the outermost `endGroup` closes one. */
        this.depthOpen = 0;
        /** Set while `apply` runs: a record from inside it is ignored, so an
         *  undo that writes through the grid's own staging cannot record its
         *  own inverse. */
        this.applying = false;
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
    get depth() { return this.undoStack.length; }

    /** Open a group: everything recorded until the matching `endGroup` is one
     *  undo (a fill, a paste). */
    beginGroup(label = '') {
        this.depthOpen += 1;
        if (this.depthOpen === 1) this.group = { action: 'batch', label, entries: [] };
    }

    /** Close a group. An empty one is dropped, so it costs no undo step; one
     *  holding a single entry is that entry. */
    endGroup() {
        if (!this.depthOpen) return;
        this.depthOpen -= 1;
        if (this.depthOpen) return;
        const group = this.group;
        this.group = null;
        if (!group) return;
        if (group.entries.length === 1) this._push(group.entries[0]);
        else if (group.entries.length) this._push(group);
    }

    /** Record one delta. Returns whether it was recorded (false while an
     *  entry is being applied). Throws on an action that is not in `ACTIONS`. */
    record(entry) {
        if (this.applying) return false;
        if (!entry || !ACTIONS.includes(entry.action)) {
            throw new Error(`${entry?.action} is not an undoable action: the ring reverses `
                + 'staged cells only, never a commit.');
        }
        if (this.group) { this.group.entries.push(entry); return true; }
        this._push(entry);
        return true;
    }

    undo() {
        this._closeOpenGroup();
        const entry = this.undoStack.pop();
        if (!entry) return false;
        this._run(entry, 'undo');
        this.redoStack.push(entry);
        this._publish();
        return true;
    }

    redo() {
        this._closeOpenGroup();
        const entry = this.redoStack.pop();
        if (!entry) return false;
        this._run(entry, 'redo');
        this.undoStack.push(entry);
        this._publish();
        return true;
    }

    /** Forget everything — after a commit or a discard, whose cells the
     *  entries no longer describe. An open group is closed with it. */
    reset() {
        this.undoStack = [];
        this.redoStack = [];
        this.group = null;
        this.depthOpen = 0;
        this._publish();
    }

    /** A group left open (a caller that threw) is closed before an undo, so it
     *  cannot swallow every later entry. */
    _closeOpenGroup() {
        if (!this.depthOpen) return;
        this.depthOpen = 1;
        this.endGroup();
    }

    _push(entry) {
        this.undoStack.push(entry);
        // A new edit after an undo ends the redo branch.
        this.redoStack = [];
        if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
        this._publish();
    }

    _publish() {
        try {
            this.onState?.({ canUndo: this.canUndo, canRedo: this.canRedo, depth: this.undoStack.length });
        } catch (err) {
            console.error('[StagedHistory] onState threw', err);
        }
    }

    _run(entry, direction) {
        this.applying = true;
        try {
            this._applyOne(entry, direction);
        } finally {
            this.applying = false;
        }
    }

    /** A group replays in REVERSE on the way back (two writes to one cell must
     *  unwind last first) and in order on the way forward. */
    _applyOne(entry, direction) {
        if (entry.action === 'batch') {
            const entries = direction === 'undo' ? [...entry.entries].reverse() : entry.entries;
            for (const child of entries) this._applyOne(child, direction);
            return;
        }
        this.apply(entry, direction);
    }
}
