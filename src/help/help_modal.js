/**
 * HelpModal - Modal dialog for displaying help content
 *
 * Features:
 * - Topics as trusted HTML (`topic.html`) or as markdown (`topic.markdown`),
 *   rendered safe by `renderMarkdown` with the provider's `markdownOptions`
 *   (a highlighter, math, extension rules)
 * - A table of contents for a topic with two or more headings, markdown or
 *   html alike: its headings, listed and numbered, the one in view marked,
 *   a click that scrolls to one (`createDocumentOutline`)
 * - Topic search
 * - Category browsing
 * - Keyboard navigation (Escape to close)
 */

import { helpProvider, helpCategories, helpCopy } from './help_registry.js';
import { renderMarkdown } from '../ui/utils/markdown.js';
import { createDocumentOutline } from '../ui/components/document_outline.js';

/** The headings a topic's table of contents lists. */
const TOC_HEADINGS = 'h1, h2, h3, h4, h5, h6';
/** Fewer headings than this, and a topic shows no table of contents. */
const TOC_MIN_HEADINGS = 2;

// ═══════════════════════════════════════════════════════════════════════════
// HelpModal Class
// ═══════════════════════════════════════════════════════════════════════════

let _activeModal = null;

export class HelpModal {
    /** The application's help, resolved at use time. */
    get _service() { return helpProvider(); }

    get _categories() { return helpCategories(); }

    get _copy() { return helpCopy(); }

    constructor() {
        // Read LAZILY, not here. A HelpModal can be constructed at boot (the
        // command palette holds one) before the application has registered its
        // help, and a constructor read would freeze the empty default forever.
        this._overlay = null;
        this._modal = null;
        this._currentTopic = null;
        this._searchQuery = '';
        this._fallback = null;
        this._toc = null;
        this._boundKeyHandler = this._handleKeyDown.bind(this);
    }

    /**
     * Open the help modal.
     * @param {string} [topicId] - Initial topic to display
     * @param {Object} [options]
     * @param {{title: string, html: string}} [options.fallback] - Shown for
     *   `topicId` when the provider has no such topic (its `loadTopic` answers
     *   null). A library-owned topic, such as the palette's keyboard shortcuts,
     *   uses it so that an application's own topic of that id still wins.
     */
    async open(topicId = null, { fallback = null } = {}) {
        this._fallback = topicId && fallback ? { id: topicId, topic: fallback } : null;
        // Close any existing modal
        if (_activeModal && _activeModal !== this) {
            _activeModal.close();
        }
        _activeModal = this;

        this._createModal();
        document.body.appendChild(this._overlay);

        // Add keyboard handler
        document.addEventListener('keydown', this._boundKeyHandler);

        // Focus search input
        const searchInput = this._modal.querySelector('.help-search-input');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }

        // Load initial topic or show index
        if (topicId) {
            await this._loadTopic(topicId);
        } else {
            this._showIndex();
        }
    }

    /**
     * Close the help modal.
     */
    close() {
        this._disposeToc();
        if (this._overlay) {
            document.removeEventListener('keydown', this._boundKeyHandler);
            this._overlay.remove();
            this._overlay = null;
            this._modal = null;
        }
        if (_activeModal === this) {
            _activeModal = null;
        }
    }

    /**
     * Create the modal DOM structure.
     * @private
     */
    _createModal() {
        // Overlay
        this._overlay = document.createElement('div');
        this._overlay.className = 'help-modal-overlay';
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) this.close();
        });

        // Modal container
        this._modal = document.createElement('div');
        this._modal.className = 'help-modal';
        this._modal.innerHTML = `
            <div class="help-modal__header">
                <div class="help-modal__title">
                    <span class="material-symbols-outlined">help</span>
                    <span>Help</span>
                </div>
                <button class="help-modal__close" title="Close (Esc)">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="help-modal__search">
                <span class="material-symbols-outlined">search</span>
                <input type="text" class="help-search-input" placeholder="Search help topics..." autocomplete="off">
            </div>
            <div class="help-modal__body">
                <nav class="help-modal__sidebar">
                    <div class="help-sidebar__categories"></div>
                </nav>
                <main class="help-modal__content">
                    <div class="help-content__loading">Loading...</div>
                </main>
            </div>
        `;

        // Event handlers
        const closeBtn = this._modal.querySelector('.help-modal__close');
        closeBtn.addEventListener('click', () => this.close());

        const searchInput = this._modal.querySelector('.help-search-input');
        searchInput.addEventListener('input', (e) => this._handleSearch(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (e.target.value) {
                    e.target.value = '';
                    this._handleSearch('');
                    e.stopPropagation();
                }
            }
        });

        // Build sidebar
        this._buildSidebar();

        this._overlay.appendChild(this._modal);
    }

    /**
     * Build the sidebar navigation.
     * @private
     */
    _buildSidebar() {
        const container = this._modal.querySelector('.help-sidebar__categories');
        const categories = this._service.getCategories();

        // Sort categories by order
        const categoryOrder = Object.keys(this._categories);
        categories.sort((a, b) => {
            const orderA = categoryOrder.indexOf(a);
            const orderB = categoryOrder.indexOf(b);
            return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
        });

        container.innerHTML = categories.map(category => {
            const topics = this._service.getTopicsByCategory(category);
            const label = this._categories[category]?.label || category;
            const icon = this._categories[category]?.icon || 'folder';

            return `
                <div class="help-category" data-category="${escapeHtml(category)}">
                    <div class="help-category__header">
                        <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
                        <span>${escapeHtml(label)}</span>
                    </div>
                    <ul class="help-category__topics">
                        ${topics.map(topic => `
                            <li class="help-topic-item" data-topic="${escapeHtml(topic.id)}">
                                ${escapeHtml(topic.title)}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.help-topic-item').forEach(item => {
            item.addEventListener('click', () => {
                this._loadTopic(item.dataset.topic);
            });
        });

        container.querySelectorAll('.help-category__header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });
    }

    /**
     * Show the help index page.
     * @private
     */
    _showIndex() {
        this._disposeToc();
        const content = this._modal.querySelector('.help-modal__content');
        const categories = this._service.getCategories();

        const categoryOrder = Object.keys(this._categories);
        categories.sort((a, b) => {
            const orderA = categoryOrder.indexOf(a);
            const orderB = categoryOrder.indexOf(b);
            return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
        });

        content.innerHTML = `
            <div class="help-index">
                <h1>${this._copy.title}</h1>
                <p>${this._copy.welcome}</p>

                <div class="help-index__grid">
                    ${categories.map(category => {
                        const topics = this._service.getTopicsByCategory(category);
                        const label = this._categories[category]?.label || category;
                        const icon = this._categories[category]?.icon || 'folder';

                        return `
                            <div class="help-index__category" data-category="${escapeHtml(category)}">
                                <div class="help-index__category-header">
                                    <span class="material-symbols-outlined">${escapeHtml(icon)}</span>
                                    <span>${escapeHtml(label)}</span>
                                </div>
                                <ul class="help-index__topics">
                                    ${topics.slice(0, 3).map(topic => `
                                        <li class="help-index__topic" data-topic="${escapeHtml(topic.id)}">
                                            ${escapeHtml(topic.title)}
                                        </li>
                                    `).join('')}
                                    ${topics.length > 3 ? `<li class="help-index__more">+${topics.length - 3} more</li>` : ''}
                                </ul>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Add click handlers
        content.querySelectorAll('.help-index__topic').forEach(item => {
            item.addEventListener('click', () => {
                this._loadTopic(item.dataset.topic);
            });
        });
    }

    /**
     * Load and display a topic.
     * @param {string} topicId - Topic ID
     * @private
     */
    async _loadTopic(topicId) {
        this._disposeToc();
        const content = this._modal.querySelector('.help-modal__content');
        content.innerHTML = '<div class="help-content__loading">Loading...</div>';

        // Update sidebar selection
        this._modal.querySelectorAll('.help-topic-item').forEach(item => {
            item.classList.toggle('active', item.dataset.topic === topicId);
        });

        try {
            const topic = (await this._service.loadTopic(topicId))
                ?? (this._fallback?.id === topicId ? this._fallback.topic : null);
            // Closed (or closed and opened again) while the topic loaded.
            if (!this._modal?.contains(content)) return;
            this._currentTopic = topicId;

            if (!topic) {
                // An id nobody provides is not a load failure: say so plainly.
                content.innerHTML = `
                    <div class="help-content__error help-content__error--not-found">
                        <span class="material-symbols-outlined">search_off</span>
                        <p>Help topic not found.</p>
                    </div>
                `;
                return;
            }

            content.innerHTML = `
                <div class="help-content__article">
                    <div class="help-content__breadcrumb">
                        <a href="#" class="help-breadcrumb__home" title="Help Index">
                            <span class="material-symbols-outlined">home</span>
                        </a>
                        <span class="help-breadcrumb__separator">/</span>
                        <span class="help-breadcrumb__title">${escapeHtml(topic.title)}</span>
                    </div>
                    <div class="help-content__toc" hidden></div>
                    <article class="help-article">
                        ${this._articleHtml(topic)}
                    </article>
                </div>
            `;

            // Add breadcrumb handler
            content.querySelector('.help-breadcrumb__home').addEventListener('click', (e) => {
                e.preventDefault();
                this._showIndex();
            });

            this._buildToc(content);
        } catch (error) {
            content.innerHTML = `
                <div class="help-content__error">
                    <span class="material-symbols-outlined">error</span>
                    <p>Failed to load help topic.</p>
                </div>
            `;
        }
    }

    /**
     * The article body: a markdown topic rendered safe, else the provider's
     * own HTML, which is trusted by contract.
     * @private
     */
    _articleHtml(topic) {
        if (typeof topic.markdown === 'string') {
            return renderMarkdown(topic.markdown, this._service.markdownOptions ?? {});
        }
        return topic.html ?? '';
    }

    /**
     * The topic's table of contents: one entry per heading in the article, in
     * document order, its level the heading's. Built only when the article
     * has `TOC_MIN_HEADINGS` or more; the outline resolves each entry to its
     * heading ELEMENT, so the provider's markup needs no ids and the modal
     * adds none.
     * @param {HTMLElement} content - The scrolling content pane.
     * @private
     */
    _buildToc(content) {
        this._disposeToc();
        const host = content.querySelector('.help-content__toc');
        const headings = [...content.querySelectorAll(`.help-article :is(${TOC_HEADINGS})`)];
        if (!host || headings.length < TOC_MIN_HEADINGS) return;
        const byId = new Map(headings.map((heading, index) => [`heading-${index}`, heading]));
        const entries = [...byId].map(([id, heading]) => ({
            id,
            level: Number(heading.tagName.slice(1)),
            label: heading.textContent.trim(),
        }));
        host.hidden = false;
        this._toc = createDocumentOutline(host, {
            entries,
            numbering: true,
            scrollContainer: content,
            resolveTarget: (entry) => byId.get(entry.id) ?? null,
            label: 'Contents',
        });
    }

    /** @private */
    _disposeToc() {
        this._toc?.dispose();
        this._toc = null;
    }

    /**
     * Handle search input.
     * @param {string} query - Search query
     * @private
     */
    _handleSearch(query) {
        this._searchQuery = query;
        const content = this._modal.querySelector('.help-modal__content');

        if (!query.trim()) {
            this._showIndex();
            return;
        }

        this._disposeToc();
        const results = this._service.searchTopics(query);

        if (results.length === 0) {
            content.innerHTML = `
                <div class="help-search-results">
                    <h2>Search Results</h2>
                    <p class="help-search-empty">No results found for "${escapeHtml(query)}"</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="help-search-results">
                <h2>Search Results</h2>
                <p class="help-search-count">${results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"</p>
                <ul class="help-search-list">
                    ${results.map(topic => `
                        <li class="help-search-item" data-topic="${escapeHtml(topic.id)}">
                            <span class="help-search-item__title">${escapeHtml(topic.title)}</span>
                            <span class="help-search-item__category">${escapeHtml(this._categories[topic.category]?.label || topic.category)}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        // Add click handlers
        content.querySelectorAll('.help-search-item').forEach(item => {
            item.addEventListener('click', () => {
                this._loadTopic(item.dataset.topic);
            });
        });
    }

    /**
     * Handle keyboard events.
     * @param {KeyboardEvent} event
     * @private
     */
    _handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Static method to open help modal.
     * @param {string} [topicId] - Initial topic
     * @param {Object} [options] - As for the instance `open`.
     * @returns {HelpModal}
     */
    static open(topicId = null, options = {}) {
        const modal = new HelpModal();
        modal.open(topicId, options);
        return modal;
    }

    /**
     * Close the open help modal, or open the index when none is open — what
     * the `?` shortcut does.
     * @returns {HelpModal|null} the modal opened, or null when one was closed
     */
    static toggle() {
        if (_activeModal) {
            _activeModal.close();
            return null;
        }
        return HelpModal.open();
    }

    /**
     * Get the currently active modal.
     * @returns {HelpModal|null}
     */
    static getActive() {
        return _activeModal;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Text for an innerHTML template. Everything the modal interpolates — the
 * search query the user typed, and the topic ids, titles and categories the
 * provider hands back — is TEXT; only `topic.html` is markup, by contract
 * (and `topic.markdown` becomes markup through `renderMarkdown`).
 * Quotes are escaped too, because ids and categories land in attributes.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
// The `?` shortcut — installed, never imported
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bind `?` (outside editable fields) to `HelpModal.toggle()` on `target`, and
 * return the disposer that takes it off again.
 *
 * Importing this module binds nothing. It used to add a `document` listener as
 * a side effect of the import, which nobody could remove: a second shell in the
 * same page, or an application with its own `?`, got two handlers. A
 * `createShell()` shell binds `?` through its keymap (`installKeymap`), and
 * `shell.dispose()` takes it off; this is for a page that uses the help modal
 * without the shell.
 *
 * @param {object} [opts]
 * @param {EventTarget} [opts.target=document]
 * @returns {() => void}
 */
export function installHelpShortcut({ target = document } = {}) {
    const onKeyDown = (event) => {
        if (event.defaultPrevented || event.key !== '?') return;
        // Don't hijack `?` typed into a field (search boxes, editors).
        if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        HelpModal.toggle();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
}

export default HelpModal;
