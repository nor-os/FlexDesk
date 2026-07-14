/**
 * NotebookUndoManager
 *
 * Command-pattern undo/redo for notebook cell operations.
 *
 * Each command: { description: string, undo: () => (void | Promise), redo: () => (void | Promise) }
 *
 * Operations tracked by NotebookEditor:
 *   - Cell add
 *   - Cell delete
 *   - Cell move (up/down, drag-reorder)
 *   - Cell config change (debounced per-cell snapshot)
 */
export class NotebookUndoManager {

    /** @type {Array<{ description: string, undo: Function, redo: Function }>} */
    #undoStack = [];

    /** @type {Array<{ description: string, undo: Function, redo: Function }>} */
    #redoStack = [];

    /** @type {number} */
    #maxSize;

    /** @type {Function|null} Called with (canUndo: boolean, canRedo: boolean) after each change */
    #onStateChange;

    /** @type {boolean} Prevents re-entrant undo/redo */
    #applying = false;

    /**
     * @param {{ maxSize?: number, onStateChange?: Function }} opts
     */
    constructor({ maxSize = 100, onStateChange = null } = {}) {
        this.#maxSize = maxSize;
        this.#onStateChange = onStateChange;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    get canUndo() { return this.#undoStack.length > 0; }
    get canRedo() { return this.#redoStack.length > 0; }

    /**
     * Record a new command.  Clears the redo stack.
     * Should NOT be called from inside undo/redo callbacks.
     *
     * @param {{ description: string, undo: Function, redo: Function }} command
     */
    push(command) {
        if (this.#applying) return; // ignore changes triggered by undo/redo
        this.#undoStack.push(command);
        if (this.#undoStack.length > this.#maxSize) {
            this.#undoStack.shift();
        }
        this.#redoStack = [];
        this.#notify();
    }

    /**
     * Undo the last command.
     * @returns {Promise<boolean>} true if something was undone
     */
    async undo() {
        const cmd = this.#undoStack.pop();
        if (!cmd) return false;
        this.#applying = true;
        try {
            await cmd.undo();
        } finally {
            this.#applying = false;
        }
        this.#redoStack.push(cmd);
        this.#notify();
        return true;
    }

    /**
     * Redo the last undone command.
     * @returns {Promise<boolean>} true if something was redone
     */
    async redo() {
        const cmd = this.#redoStack.pop();
        if (!cmd) return false;
        this.#applying = true;
        try {
            await cmd.redo();
        } finally {
            this.#applying = false;
        }
        this.#undoStack.push(cmd);
        this.#notify();
        return true;
    }

    /** Reset both stacks (e.g., after file load). */
    clear() {
        this.#undoStack = [];
        this.#redoStack = [];
        this.#notify();
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #notify() {
        this.#onStateChange?.(this.canUndo, this.canRedo);
    }
}
