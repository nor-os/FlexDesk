/**
 * NotebookSearchBar — VS Code-style find/replace bar for notebook-level search.
 *
 * Searches across all cells using getSearchableText(), highlights matches
 * via cell-specific applySearchHighlights(), and supports replace for
 * Monaco-based cells (code, documentation).
 *
 * Mounted at the top of the notebook-editor-container (sticky positioned).
 */

// ─── Match descriptor ────────────────────────────────────────────────────────

/**
 * @typedef {{ cellId: string, indexInCell: number, charOffset: number }} SearchMatch
 */

// ─── Component ───────────────────────────────────────────────────────────────

export class NotebookSearchBar {
    /** @type {HTMLElement} parent container (.notebook-editor-container) */
    #parent = null;
    /** @type {HTMLElement} the search bar root element */
    #el = null;
    /** @type {HTMLInputElement} */
    #searchInput = null;
    /** @type {HTMLInputElement} */
    #replaceInput = null;
    /** @type {HTMLElement} match info label */
    #matchInfo = null;

    // State
    #isOpen = false;
    #showReplace = false;
    #caseSensitive = false;
    #wholeWord = false;
    #useRegex = false;

    // Match tracking
    /** @type {SearchMatch[]} */
    #matches = [];
    #currentIndex = -1;

    // Callbacks into NotebookEditor
    #getCells = null;       // () => [{ id, type }]
    #getCellRenderer = null; // (id) => CellBase|null
    #getCellElement = null;  // (id) => HTMLElement|null
    #scrollToCell = null;    // (id) => void

    /**
     * @param {HTMLElement} parent  — .notebook-editor-container
     * @param {{ getCells, getCellRenderer, getCellElement, scrollToCell }} callbacks
     */
    constructor(parent, { getCells, getCellRenderer, getCellElement, scrollToCell }) {
        this.#parent = parent;
        this.#getCells = getCells;
        this.#getCellRenderer = getCellRenderer;
        this.#getCellElement = getCellElement;
        this.#scrollToCell = scrollToCell;

        this.#render();
    }

    get isOpen() { return this.#isOpen; }

    // ─── Public API ──────────────────────────────────────────────────────────

    open(showReplace = false) {
        this.#isOpen = true;
        this.#showReplace = showReplace;
        this.#el.classList.add('nb-search-bar--open');
        this.#el.querySelector('.nb-search-bar__replace-row').style.display =
            showReplace ? '' : 'none';
        this.#updateToggleIcon();

        // Pre-fill with current selection text (if any)
        const sel = window.getSelection()?.toString()?.trim();
        if (sel && sel.length < 200 && !sel.includes('\n')) {
            this.#searchInput.value = sel;
        }

        this.#searchInput.focus();
        this.#searchInput.select();

        if (this.#searchInput.value) this.#runSearch();
    }

    close() {
        this.#isOpen = false;
        this.#el.classList.remove('nb-search-bar--open');
        this.#clearAllHighlights();
        this.#matches = [];
        this.#currentIndex = -1;
        this.#updateMatchInfo();
    }

    dispose() {
        this.#clearAllHighlights();
        this.#el?.remove();
        this.#el = null;
    }

    // ─── Rendering ───────────────────────────────────────────────────────────

    #render() {
        const el = document.createElement('div');
        el.className = 'nb-search-bar';
        el.innerHTML = `
            <div class="nb-search-bar__find-row">
                <button class="nb-search-bar__btn nb-search-bar__toggle-replace" title="Toggle Replace">
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
                <div class="nb-search-bar__input-wrap">
                    <input class="nb-search-bar__input nb-search-bar__find-input"
                           type="text" placeholder="Find" spellcheck="false" />
                </div>
                <span class="nb-search-bar__match-info">No results</span>
                <button class="nb-search-bar__btn" data-action="prev" title="Previous Match (Shift+Enter)">
                    <span class="material-symbols-outlined">arrow_upward</span>
                </button>
                <button class="nb-search-bar__btn" data-action="next" title="Next Match (Enter)">
                    <span class="material-symbols-outlined">arrow_downward</span>
                </button>
                <div class="nb-search-bar__separator"></div>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="case"
                        title="Match Case (Alt+C)">Aa</button>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="word"
                        title="Match Whole Word (Alt+W)">
                    <span class="nb-search-bar__icon-word">ab</span>
                </button>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="regex"
                        title="Use Regular Expression (Alt+R)">.*</button>
                <div class="nb-search-bar__separator"></div>
                <button class="nb-search-bar__btn" data-action="close" title="Close (Escape)">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="nb-search-bar__replace-row" style="display:none">
                <div class="nb-search-bar__spacer"></div>
                <div class="nb-search-bar__input-wrap">
                    <input class="nb-search-bar__input nb-search-bar__replace-input"
                           type="text" placeholder="Replace" spellcheck="false" />
                </div>
                <button class="nb-search-bar__btn" data-action="replace" title="Replace (Ctrl+Shift+1)">
                    <span class="material-symbols-outlined">find_replace</span>
                </button>
                <button class="nb-search-bar__btn" data-action="replace-all" title="Replace All (Ctrl+Alt+Enter)">
                    <span class="material-symbols-outlined">swap_horiz</span>
                </button>
            </div>
        `;

        this.#el = el;
        this.#searchInput = el.querySelector('.nb-search-bar__find-input');
        this.#replaceInput = el.querySelector('.nb-search-bar__replace-input');
        this.#matchInfo = el.querySelector('.nb-search-bar__match-info');

        this.#bindEvents();
        this.#parent.prepend(el);
    }

    #bindEvents() {
        // Search input
        this.#searchInput.addEventListener('input', () => this.#runSearch());

        this.#searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.#navigateNext();
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                this.#navigatePrev();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });

        // Replace input
        this.#replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.#doReplace();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });

        // Buttons
        this.#el.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            switch (btn.dataset.action) {
                case 'prev':        this.#navigatePrev(); break;
                case 'next':        this.#navigateNext(); break;
                case 'close':       this.close(); break;
                case 'replace':     this.#doReplace(); break;
                case 'replace-all': this.#doReplaceAll(); break;
                case 'case':
                    this.#caseSensitive = !this.#caseSensitive;
                    btn.classList.toggle('nb-search-bar__btn--active', this.#caseSensitive);
                    this.#runSearch();
                    break;
                case 'word':
                    this.#wholeWord = !this.#wholeWord;
                    btn.classList.toggle('nb-search-bar__btn--active', this.#wholeWord);
                    this.#runSearch();
                    break;
                case 'regex':
                    this.#useRegex = !this.#useRegex;
                    btn.classList.toggle('nb-search-bar__btn--active', this.#useRegex);
                    this.#runSearch();
                    break;
            }
        });

        // Toggle replace row
        this.#el.querySelector('.nb-search-bar__toggle-replace').addEventListener('click', () => {
            this.#showReplace = !this.#showReplace;
            this.#el.querySelector('.nb-search-bar__replace-row').style.display =
                this.#showReplace ? '' : 'none';
            this.#updateToggleIcon();
        });

        // Alt shortcuts for toggles
        this.#el.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'c') {
                e.preventDefault();
                this.#caseSensitive = !this.#caseSensitive;
                this.#el.querySelector('[data-action="case"]').classList.toggle('nb-search-bar__btn--active', this.#caseSensitive);
                this.#runSearch();
            } else if (e.altKey && e.key === 'w') {
                e.preventDefault();
                this.#wholeWord = !this.#wholeWord;
                this.#el.querySelector('[data-action="word"]').classList.toggle('nb-search-bar__btn--active', this.#wholeWord);
                this.#runSearch();
            } else if (e.altKey && e.key === 'r') {
                e.preventDefault();
                this.#useRegex = !this.#useRegex;
                this.#el.querySelector('[data-action="regex"]').classList.toggle('nb-search-bar__btn--active', this.#useRegex);
                this.#runSearch();
            }
        });

        // Prevent keydown from bubbling to NotebookEditor (avoids undo/redo interference)
        // Also suppress browser Ctrl+F/Ctrl+H when the search bar already has focus
        this.#el.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.ctrlKey && (e.key === 'f' || e.key === 'h')) {
                e.preventDefault();
                if (e.key === 'h' && !this.#showReplace) {
                    this.#showReplace = true;
                    this.#el.querySelector('.nb-search-bar__replace-row').style.display = '';
                    this.#updateToggleIcon();
                }
            }
        });
    }

    #updateToggleIcon() {
        const icon = this.#el.querySelector('.nb-search-bar__toggle-replace .material-symbols-outlined');
        if (icon) icon.textContent = this.#showReplace ? 'expand_more' : 'chevron_right';
    }

    #updateMatchInfo() {
        if (!this.#matchInfo) return;
        if (this.#matches.length === 0) {
            const hasQuery = this.#searchInput?.value?.length > 0;
            this.#matchInfo.textContent = hasQuery ? 'No results' : '';
            this.#matchInfo.classList.toggle('nb-search-bar__match-info--no-results', hasQuery);
        } else {
            this.#matchInfo.textContent = `${this.#currentIndex + 1} of ${this.#matches.length}`;
            this.#matchInfo.classList.remove('nb-search-bar__match-info--no-results');
        }
    }

    // ─── Search logic ────────────────────────────────────────────────────────

    #buildQuery() {
        const raw = this.#searchInput.value;
        if (!raw) return null;

        let pattern;
        if (this.#useRegex) {
            try { pattern = raw; new RegExp(pattern); }
            catch { return null; } // invalid regex
        } else {
            pattern = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        if (this.#wholeWord) pattern = `\\b${pattern}\\b`;

        const flags = 'g' + (this.#caseSensitive ? '' : 'i');
        try { return new RegExp(pattern, flags); }
        catch { return null; }
    }

    #runSearch() {
        this.#clearAllHighlights();
        this.#matches = [];
        this.#currentIndex = -1;

        const query = this.#buildQuery();
        if (!query) {
            this.#updateMatchInfo();
            return;
        }

        const cells = this.#getCells();

        for (const { id } of cells) {
            const renderer = this.#getCellRenderer(id);
            if (!renderer) continue;

            const text = renderer.getSearchableText();
            if (!text) continue;

            query.lastIndex = 0;
            let m;
            let indexInCell = 0;
            while ((m = query.exec(text)) !== null) {
                this.#matches.push({ cellId: id, indexInCell, charOffset: m.index });
                indexInCell++;
                if (!query.global) break;
            }
        }

        if (this.#matches.length > 0) {
            this.#currentIndex = 0;
            this.#applyHighlights();
        }

        this.#updateMatchInfo();
    }

    // ─── Navigation ──────────────────────────────────────────────────────────

    #navigateNext() {
        if (this.#matches.length === 0) return;
        this.#currentIndex = (this.#currentIndex + 1) % this.#matches.length;
        this.#applyHighlights();
        this.#scrollToCurrentMatch();
        this.#updateMatchInfo();
    }

    #navigatePrev() {
        if (this.#matches.length === 0) return;
        this.#currentIndex = (this.#currentIndex - 1 + this.#matches.length) % this.#matches.length;
        this.#applyHighlights();
        this.#scrollToCurrentMatch();
        this.#updateMatchInfo();
    }

    #scrollToCurrentMatch() {
        const match = this.#matches[this.#currentIndex];
        if (!match) return;
        this.#scrollToCell(match.cellId);

        // Also scroll the specific highlight into view if possible
        requestAnimationFrame(() => {
            const cellEl = this.#getCellElement(match.cellId);
            if (!cellEl) return;
            const active = cellEl.querySelector('.nb-search-match--active');
            if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    // ─── Highlighting ────────────────────────────────────────────────────────

    #applyHighlights() {
        const query = this.#buildQuery();
        if (!query) return;

        // Group matches by cell
        const matchesByCell = new Map();
        for (const m of this.#matches) {
            if (!matchesByCell.has(m.cellId)) matchesByCell.set(m.cellId, []);
            matchesByCell.get(m.cellId).push(m);
        }

        const currentMatch = this.#matches[this.#currentIndex];

        // Apply highlights to each cell that has matches
        const cells = this.#getCells();
        for (const { id } of cells) {
            const renderer = this.#getCellRenderer(id);
            if (!renderer) continue;

            const cellEl = this.#getCellElement(id);

            if (matchesByCell.has(id)) {
                const activeOffset = (currentMatch?.cellId === id)
                    ? currentMatch.charOffset
                    : -1;
                renderer.applySearchHighlights(query, activeOffset);
                cellEl?.classList.add('notebook-cell--search-match');
                cellEl?.classList.toggle('notebook-cell--search-active', currentMatch?.cellId === id);
            } else {
                renderer.clearSearchHighlights();
                cellEl?.classList.remove('notebook-cell--search-match', 'notebook-cell--search-active');
            }
        }
    }

    #clearAllHighlights() {
        const cells = this.#getCells();
        for (const { id } of cells) {
            const renderer = this.#getCellRenderer(id);
            renderer?.clearSearchHighlights();
            const cellEl = this.#getCellElement(id);
            cellEl?.classList.remove('notebook-cell--search-match', 'notebook-cell--search-active');
        }
    }

    // ─── Replace ─────────────────────────────────────────────────────────────

    #doReplace() {
        if (this.#matches.length === 0 || this.#currentIndex < 0) return;

        const match = this.#matches[this.#currentIndex];
        const renderer = this.#getCellRenderer(match.cellId);
        if (!renderer) return;

        const query = this.#buildQuery();
        if (!query) return;

        const replacement = this.#replaceInput.value;
        const success = renderer.replaceMatch(query, match.indexInCell, replacement);

        if (success) {
            // Re-run search (match count changed), try to stay near same position
            const wasIndex = this.#currentIndex;
            this.#runSearch();
            if (this.#matches.length > 0) {
                this.#currentIndex = Math.min(wasIndex, this.#matches.length - 1);
                this.#applyHighlights();
                this.#scrollToCurrentMatch();
                this.#updateMatchInfo();
            }
        }
    }

    #doReplaceAll() {
        const query = this.#buildQuery();
        if (!query || this.#matches.length === 0) return;

        const replacement = this.#replaceInput.value;

        // Collect unique cell IDs that have matches
        const cellIds = [...new Set(this.#matches.map(m => m.cellId))];
        let totalReplaced = 0;

        for (const cellId of cellIds) {
            const renderer = this.#getCellRenderer(cellId);
            if (renderer) totalReplaced += renderer.replaceAll(query, replacement);
        }

        if (totalReplaced > 0) this.#runSearch();
    }
}
