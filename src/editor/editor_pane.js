/**
 * EditorPane — one half (or whole) of the split editor.
 *
 * Each pane owns:
 *   - A NotebookTabBar instance
 *   - An editor container where the active file's editor is mounted
 *   - A list of file paths assigned to this pane
 *   - The active file path within this pane
 *
 * The pane does NOT mount editors itself — it delegates to the parent
 * (NotebookPage) via callbacks, since editor mounting requires access to
 * ProjectModel, symbol index, plot controller, etc.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  [Tab1] [Tab2]              │  ← NotebookTabBar
 *   ├──────────────────────────────┤
 *   │                              │
 *   │  Editor content              │  ← editorContainer
 *   │                              │
 *   └──────────────────────────────┘
 */

import { NotebookTabBar } from './notebook_tab_bar.js';

export class EditorPane {
    /** @type {string} */
    #id;

    /** @type {HTMLElement} root element */
    #el = null;

    /** @type {NotebookTabBar} */
    #tabBar = null;

    /** @type {HTMLElement} */
    #editorContainer = null;

    /** @type {string[]} file paths in tab order */
    #filePaths = [];

    /** @type {string|null} */
    #activeFilePath = null;

    /** @type {string|null} file path of the preview (transient) tab, if any */
    #previewFilePath = null;

    /** @type {object} callbacks from parent */
    #callbacks = {};

    /** @type {boolean} whether this pane is the focused/active pane */
    #focused = false;

    /**
     * @param {string} id — unique pane identifier ('left' or 'right')
     * @param {object} callbacks
     * @param {Function} callbacks.onActivate — (paneId, filePath) => void
     * @param {Function} callbacks.onClose — (paneId, filePath) => void
     * @param {Function} callbacks.onCloseOthers — (paneId, filePath) => void
     * @param {Function} callbacks.onCloseToRight — (paneId, filePath) => void
     * @param {Function} callbacks.onCloseAll — (paneId) => void
     * @param {Function} callbacks.onCloseSaved — (paneId) => void
     * @param {Function} callbacks.onRename — (oldPath, newPath) => void
     * @param {Function} callbacks.onDuplicate — (filePath) => void
     * @param {Function} callbacks.onReorder — (paneId, orderedPaths) => void
     * @param {Function} callbacks.onRevealInExplorer — (filePath) => void
     * @param {Function} callbacks.onFocus — (paneId) => void
     * @param {Function} callbacks.onSplitRight — (paneId, filePath) => void
     * @param {Function} callbacks.onMoveToOtherPane — (paneId, filePath) => void
     */
    constructor(id, callbacks = {}) {
        this.#id = id;
        this.#callbacks = callbacks;
    }

    get id() { return this.#id; }
    get activeFilePath() { return this.#activeFilePath; }
    get filePaths() { return [...this.#filePaths]; }
    get editorContainer() { return this.#editorContainer; }
    get element() { return this.#el; }
    get isEmpty() { return this.#filePaths.length === 0; }

    /**
     * Build DOM and mount the tab bar.
     * @returns {HTMLElement} the root element (to be placed in SplitPaneContainer)
     */
    mount() {
        this.#el = document.createElement('div');
        this.#el.className = 'editor-pane';
        this.#el.dataset.paneId = this.#id;

        // Focus tracking — clicking anywhere in the pane focuses it
        this.#el.addEventListener('mousedown', () => {
            this.#callbacks.onFocus?.(this.#id);
        }, true);

        // Tab bar
        const tabBarEl = document.createElement('div');
        this.#el.appendChild(tabBarEl);

        this.#tabBar = new NotebookTabBar();
        this.#tabBar.mount(tabBarEl, {
            onActivate:        (path) => this.#callbacks.onActivate?.(this.#id, path),
            onClose:           (path) => this.#callbacks.onClose?.(this.#id, path),
            onCloseOthers:     (path) => this.#callbacks.onCloseOthers?.(this.#id, path),
            onCloseToRight:    (path) => this.#callbacks.onCloseToRight?.(this.#id, path),
            onCloseAll:        ()     => this.#callbacks.onCloseAll?.(this.#id),
            onCloseSaved:      ()     => this.#callbacks.onCloseSaved?.(this.#id),
            onRename:          (o, n) => this.#callbacks.onRename?.(o, n),
            onDuplicate:       (path) => this.#callbacks.onDuplicate?.(path),
            onReorder:         (paths) => this.#callbacks.onReorder?.(this.#id, paths),
            onRevealInExplorer:(path) => this.#callbacks.onRevealInExplorer?.(path),
            onSplitRight:      (path) => this.#callbacks.onSplitRight?.(this.#id, path),
            onMoveToOtherPane: (path) => this.#callbacks.onMoveToOtherPane?.(this.#id, path),
            onDropFromOtherPane: (path) => this.#callbacks.onDropFromOtherPane?.(this.#id, path),
        });

        // Editor body wrapper — positioned container that fills remaining
        // flex space.  The actual editor container is absolutely positioned
        // inside, so its height is ALWAYS the wrapper's height, regardless
        // of content.  This makes the scroll chain bulletproof — no flex
        // ancestor chain needed for the scrollbar to work.
        const body = document.createElement('div');
        body.className = 'editor-pane__body';
        this.#el.appendChild(body);

        // Editor container (absolutely positioned inside wrapper)
        this.#editorContainer = document.createElement('div');
        this.#editorContainer.className = 'notebook-editor-container';
        body.appendChild(this.#editorContainer);

        // Accept cross-pane tab drops on the editor area too
        this.#editorContainer.addEventListener('dragover', (e) => {
            if (this.#isExternalTabDrag(e)) {
                e.preventDefault();
                try { e.dataTransfer.dropEffect = 'move'; } catch {}
                this.#editorContainer.classList.add('notebook-editor-container--drop-target');
            }
        });
        this.#editorContainer.addEventListener('drop', (e) => {
            if (this.#isExternalTabDrag(e)) {
                e.preventDefault();
                this.#editorContainer.classList.remove('notebook-editor-container--drop-target');
                const filePath = e.dataTransfer.getData('application/x-ecosim-tab')
                    || e.dataTransfer.getData('text/plain');
                if (filePath) {
                    this.#callbacks.onDropFromOtherPane?.(this.#id, filePath);
                }
            }
        });
        this.#editorContainer.addEventListener('dragleave', (e) => {
            if (!this.#editorContainer.contains(e.relatedTarget)) {
                this.#editorContainer.classList.remove('notebook-editor-container--drop-target');
            }
        });

        return this.#el;
    }

    /**
     * Update the file list and active tab.
     * @param {Array<{filePath: string, fileType: string, isDirty: boolean}>} tabs
     * @param {string|null} activeFilePath
     */
    syncTabBar(tabs, activeFilePath) {
        this.#tabBar?.update(tabs, activeFilePath);
    }

    /**
     * Set the files assigned to this pane.
     * @param {string[]} filePaths
     */
    setFilePaths(filePaths) {
        this.#filePaths = [...filePaths];
    }

    /**
     * Add a file to this pane's tabs (at end).
     * @param {string} filePath
     */
    addFile(filePath) {
        if (!this.#filePaths.includes(filePath)) {
            this.#filePaths.push(filePath);
        }
    }

    /**
     * Remove a file from this pane's tabs.
     * @param {string} filePath
     */
    removeFile(filePath) {
        this.#filePaths = this.#filePaths.filter(p => p !== filePath);
        if (this.#previewFilePath === filePath) this.#previewFilePath = null;
        if (this.#activeFilePath === filePath) {
            this.#activeFilePath = this.#filePaths.length > 0
                ? this.#filePaths[this.#filePaths.length - 1]
                : null;
        }
    }

    hasFile(filePath) {
        return this.#filePaths.includes(filePath);
    }

    setActiveFile(filePath) {
        this.#activeFilePath = filePath;
    }

    setFocused(focused) {
        this.#focused = focused;
        this.#el?.classList.toggle('editor-pane--focused', focused);
    }

    markDirty(filePath, isDirty) {
        this.#tabBar?.markDirty(filePath, isDirty);
    }

    reorderFiles(orderedPaths) {
        // Keep only paths that belong to this pane
        const valid = orderedPaths.filter(p => this.#filePaths.includes(p));
        // Append any missing (shouldn't happen)
        for (const p of this.#filePaths) {
            if (!valid.includes(p)) valid.push(p);
        }
        this.#filePaths = valid;
    }

    renameFile(oldPath, newPath) {
        const idx = this.#filePaths.indexOf(oldPath);
        if (idx !== -1) this.#filePaths[idx] = newPath;
        if (this.#activeFilePath === oldPath) this.#activeFilePath = newPath;
        if (this.#previewFilePath === oldPath) this.#previewFilePath = newPath;
    }

    // ─── Preview (transient) tab ──────────────────────────────────────────────

    /** @returns {string|null} the preview file path, or null if no preview tab */
    get previewFilePath() { return this.#previewFilePath; }

    /** Mark a file as the preview tab. Only one preview tab per pane. */
    setPreview(filePath) { this.#previewFilePath = filePath; }

    /** Whether a file is the preview (transient) tab. */
    isPreview(filePath) { return this.#previewFilePath === filePath; }

    /** Pin the preview tab (promote to permanent). */
    pinPreview() { this.#previewFilePath = null; }

    /** Check if a drag event is carrying a tab from another pane. */
    #isExternalTabDrag(e) {
        try { return e.dataTransfer.types.includes('application/x-ecosim-tab'); } catch { return false; }
    }

    dispose() {
        this.#tabBar?.dispose();
        this.#tabBar = null;
        this.#el?.remove();
        this.#el = null;
        this.#editorContainer = null;
        this.#filePaths = [];
        this.#activeFilePath = null;
        this.#previewFilePath = null;
    }
}
