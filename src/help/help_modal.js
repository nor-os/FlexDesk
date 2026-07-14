/**
 * HelpModal - Modal dialog for displaying help content
 *
 * Features:
 * - Markdown rendering with syntax highlighting
 * - Table of contents navigation
 * - Topic search
 * - Category browsing
 * - Keyboard navigation (Escape to close)
 */

import { helpProvider, helpCategories, helpCopy } from './help_registry.js';

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
        this._boundKeyHandler = this._handleKeyDown.bind(this);
    }

    /**
     * Open the help modal.
     * @param {string} [topicId] - Initial topic to display
     */
    async open(topicId = null) {
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
                <div class="help-category" data-category="${category}">
                    <div class="help-category__header">
                        <span class="material-symbols-outlined">${icon}</span>
                        <span>${label}</span>
                    </div>
                    <ul class="help-category__topics">
                        ${topics.map(topic => `
                            <li class="help-topic-item" data-topic="${topic.id}">
                                ${topic.title}
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
                            <div class="help-index__category" data-category="${category}">
                                <div class="help-index__category-header">
                                    <span class="material-symbols-outlined">${icon}</span>
                                    <span>${label}</span>
                                </div>
                                <ul class="help-index__topics">
                                    ${topics.slice(0, 3).map(topic => `
                                        <li class="help-index__topic" data-topic="${topic.id}">
                                            ${topic.title}
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
        const content = this._modal.querySelector('.help-modal__content');
        content.innerHTML = '<div class="help-content__loading">Loading...</div>';

        // Update sidebar selection
        this._modal.querySelectorAll('.help-topic-item').forEach(item => {
            item.classList.toggle('active', item.dataset.topic === topicId);
        });

        try {
            const topic = await this._service.loadTopic(topicId);
            this._currentTopic = topicId;

            content.innerHTML = `
                <div class="help-content__article">
                    <div class="help-content__breadcrumb">
                        <a href="#" class="help-breadcrumb__home" title="Help Index">
                            <span class="material-symbols-outlined">home</span>
                        </a>
                        <span class="help-breadcrumb__separator">/</span>
                        <span class="help-breadcrumb__title">${topic.title}</span>
                    </div>
                    <article class="help-article">
                        ${topic.html}
                    </article>
                </div>
            `;

            // Add breadcrumb handler
            content.querySelector('.help-breadcrumb__home').addEventListener('click', (e) => {
                e.preventDefault();
                this._showIndex();
            });
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

        const results = this._service.searchTopics(query);

        if (results.length === 0) {
            content.innerHTML = `
                <div class="help-search-results">
                    <h2>Search Results</h2>
                    <p class="help-search-empty">No results found for "${query}"</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="help-search-results">
                <h2>Search Results</h2>
                <p class="help-search-count">${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"</p>
                <ul class="help-search-list">
                    ${results.map(topic => `
                        <li class="help-search-item" data-topic="${topic.id}">
                            <span class="help-search-item__title">${topic.title}</span>
                            <span class="help-search-item__category">${this._categories[topic.category]?.label || topic.category}</span>
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
     * @returns {HelpModal}
     */
    static open(topicId = null) {
        const modal = new HelpModal();
        modal.open(topicId);
        return modal;
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
// Global Help Shortcut
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open help modal with the `?` key. (F1 is reserved for top-nav Home.)
 */
function setupGlobalHelpShortcut() {
    document.addEventListener('keydown', (event) => {
        if (event.key !== '?') return;
        // Don't hijack `?` typed into a field (search boxes, editors).
        const t = event.target;
        if (t?.closest?.(
            'input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        if (_activeModal) {
            _activeModal.close();
        } else {
            HelpModal.open();
        }
    });
}

// Initialize global shortcut
if (typeof document !== 'undefined') {
    setupGlobalHelpShortcut();
}

export default HelpModal;
