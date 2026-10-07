import {
  modalHost
} from "./chunk-6NG7YVBG.js";

// src/help/help_registry.js
var EMPTY_PROVIDER = Object.freeze({
  getCategories: () => [],
  getTopicsByCategory: () => [],
  loadTopic: async () => null,
  searchTopics: () => []
});
var DEFAULT_COPY = Object.freeze({
  title: "Help",
  welcome: "Select a topic from the sidebar or browse the categories below."
});
var _provider = EMPTY_PROVIDER;
var _categories = Object.freeze({});
var _copy = DEFAULT_COPY;
function setHelpProvider(provider, categories = {}, copy = {}) {
  _provider = provider ?? EMPTY_PROVIDER;
  _categories = Object.freeze({ ...categories });
  _copy = Object.freeze({ ...DEFAULT_COPY, ...copy });
}
function helpProvider() {
  return _provider;
}
function helpCategories() {
  return _categories;
}
function helpCopy() {
  return _copy;
}

// src/help/help_modal.js
var _activeModal = null;
var HelpModal = class _HelpModal {
  /** The application's help, resolved at use time. */
  get _service() {
    return helpProvider();
  }
  get _categories() {
    return helpCategories();
  }
  get _copy() {
    return helpCopy();
  }
  constructor() {
    this._overlay = null;
    this._modal = null;
    this._currentTopic = null;
    this._searchQuery = "";
    this._boundKeyHandler = this._handleKeyDown.bind(this);
  }
  /**
   * Open the help modal.
   * @param {string} [topicId] - Initial topic to display
   */
  async open(topicId = null) {
    if (_activeModal && _activeModal !== this) {
      _activeModal.close();
    }
    _activeModal = this;
    this._createModal();
    document.body.appendChild(this._overlay);
    document.addEventListener("keydown", this._boundKeyHandler);
    const searchInput = this._modal.querySelector(".help-search-input");
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
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
      document.removeEventListener("keydown", this._boundKeyHandler);
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
    this._overlay = document.createElement("div");
    this._overlay.className = "help-modal-overlay";
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) this.close();
    });
    this._modal = document.createElement("div");
    this._modal.className = "help-modal";
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
    const closeBtn = this._modal.querySelector(".help-modal__close");
    closeBtn.addEventListener("click", () => this.close());
    const searchInput = this._modal.querySelector(".help-search-input");
    searchInput.addEventListener("input", (e) => this._handleSearch(e.target.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (e.target.value) {
          e.target.value = "";
          this._handleSearch("");
          e.stopPropagation();
        }
      }
    });
    this._buildSidebar();
    this._overlay.appendChild(this._modal);
  }
  /**
   * Build the sidebar navigation.
   * @private
   */
  _buildSidebar() {
    const container = this._modal.querySelector(".help-sidebar__categories");
    const categories = this._service.getCategories();
    const categoryOrder = Object.keys(this._categories);
    categories.sort((a, b) => {
      const orderA = categoryOrder.indexOf(a);
      const orderB = categoryOrder.indexOf(b);
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
    });
    container.innerHTML = categories.map((category) => {
      const topics = this._service.getTopicsByCategory(category);
      const label = this._categories[category]?.label || category;
      const icon = this._categories[category]?.icon || "folder";
      return `
                <div class="help-category" data-category="${category}">
                    <div class="help-category__header">
                        <span class="material-symbols-outlined">${icon}</span>
                        <span>${label}</span>
                    </div>
                    <ul class="help-category__topics">
                        ${topics.map((topic) => `
                            <li class="help-topic-item" data-topic="${topic.id}">
                                ${topic.title}
                            </li>
                        `).join("")}
                    </ul>
                </div>
            `;
    }).join("");
    container.querySelectorAll(".help-topic-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._loadTopic(item.dataset.topic);
      });
    });
    container.querySelectorAll(".help-category__header").forEach((header) => {
      header.addEventListener("click", () => {
        header.parentElement.classList.toggle("collapsed");
      });
    });
  }
  /**
   * Show the help index page.
   * @private
   */
  _showIndex() {
    const content = this._modal.querySelector(".help-modal__content");
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
                    ${categories.map((category) => {
      const topics = this._service.getTopicsByCategory(category);
      const label = this._categories[category]?.label || category;
      const icon = this._categories[category]?.icon || "folder";
      return `
                            <div class="help-index__category" data-category="${category}">
                                <div class="help-index__category-header">
                                    <span class="material-symbols-outlined">${icon}</span>
                                    <span>${label}</span>
                                </div>
                                <ul class="help-index__topics">
                                    ${topics.slice(0, 3).map((topic) => `
                                        <li class="help-index__topic" data-topic="${topic.id}">
                                            ${topic.title}
                                        </li>
                                    `).join("")}
                                    ${topics.length > 3 ? `<li class="help-index__more">+${topics.length - 3} more</li>` : ""}
                                </ul>
                            </div>
                        `;
    }).join("")}
                </div>
            </div>
        `;
    content.querySelectorAll(".help-index__topic").forEach((item) => {
      item.addEventListener("click", () => {
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
    const content = this._modal.querySelector(".help-modal__content");
    content.innerHTML = '<div class="help-content__loading">Loading...</div>';
    this._modal.querySelectorAll(".help-topic-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.topic === topicId);
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
      content.querySelector(".help-breadcrumb__home").addEventListener("click", (e) => {
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
    const content = this._modal.querySelector(".help-modal__content");
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
                <p class="help-search-count">${results.length} result${results.length !== 1 ? "s" : ""} for "${query}"</p>
                <ul class="help-search-list">
                    ${results.map((topic) => `
                        <li class="help-search-item" data-topic="${topic.id}">
                            <span class="help-search-item__title">${topic.title}</span>
                            <span class="help-search-item__category">${this._categories[topic.category]?.label || topic.category}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    content.querySelectorAll(".help-search-item").forEach((item) => {
      item.addEventListener("click", () => {
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
    if (event.key === "Escape") {
      this.close();
    }
  }
  /**
   * Static method to open help modal.
   * @param {string} [topicId] - Initial topic
   * @returns {HelpModal}
   */
  static open(topicId = null) {
    const modal = new _HelpModal();
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
};
function setupGlobalHelpShortcut() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "?") return;
    const t = event.target;
    if (t?.closest?.(
      'input, textarea, select, [contenteditable="true"]'
    )) return;
    event.preventDefault();
    if (_activeModal) {
      _activeModal.close();
    } else {
      HelpModal.open();
    }
  });
}
if (typeof document !== "undefined") {
  setupGlobalHelpShortcut();
}

// src/ui/components/context_menu.js
var _activeMenu = null;
var _returnFocusTo = null;
function showContextMenu(x, y, items, onAction) {
  hideContextMenu();
  _returnFocusTo = document.activeElement;
  const menu = document.createElement("div");
  menu.className = "twm-context-menu ea-context-menu";
  menu.setAttribute("role", "menu");
  for (const it of items) {
    if (it.separator) {
      const sep = document.createElement("div");
      sep.className = "twm-context-menu__separator";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.setAttribute("role", "menuitem");
    let cls = "twm-context-menu-item";
    if (it.danger) cls += " twm-delete-node";
    if (it.disabled) cls += " disabled";
    row.className = cls;
    if (it.disabled) {
      row.disabled = true;
      row.setAttribute("aria-disabled", "true");
    }
    if (it.title) row.title = it.title;
    row.innerHTML = `
            <span class="material-symbols-outlined">${it.icon || ""}</span>
            <span>${escapeHtml(it.label)}</span>
        `;
    if (!it.disabled) {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        hideContextMenu();
        onAction?.(it.action);
      });
    }
    menu.appendChild(row);
  }
  (modalHost() || document.body).appendChild(menu);
  menu.style.display = "block";
  _activeMenu = menu;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
  setTimeout(() => {
    document.addEventListener("mousedown", _outsideHandler, { once: true, capture: true });
  }, 0);
  document.addEventListener("keydown", _keyHandler);
  window.addEventListener("scroll", hideContextMenu, { once: true, capture: true });
  _enabledItems(menu)[0]?.focus({ preventScroll: true });
}
function hideContextMenu() {
  if (!_activeMenu) return;
  const returnTo = _returnFocusTo;
  const held = _activeMenu.contains(document.activeElement);
  _activeMenu.remove();
  _activeMenu = null;
  _returnFocusTo = null;
  document.removeEventListener("keydown", _keyHandler);
  if (held && returnTo?.isConnected) returnTo.focus?.({ preventScroll: true });
}
function _enabledItems(menu) {
  return [...menu.querySelectorAll(".twm-context-menu-item:not(.disabled)")];
}
function _keyHandler(e) {
  if (!_activeMenu) return;
  if (e.key === "Escape") {
    e.preventDefault();
    hideContextMenu();
    return;
  }
  const items = _enabledItems(_activeMenu);
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement);
  let next = null;
  if (e.key === "ArrowDown") next = items[(at + 1 + items.length) % items.length];
  else if (e.key === "ArrowUp") next = items[(at - 1 + items.length) % items.length];
  else if (e.key === "Home") next = items[0];
  else if (e.key === "End") next = items[items.length - 1];
  if (!next) return;
  e.preventDefault();
  next.focus({ preventScroll: true });
}
function _outsideHandler(e) {
  if (_activeMenu && !_activeMenu.contains(e.target)) hideContextMenu();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

export {
  setHelpProvider,
  helpProvider,
  helpCategories,
  helpCopy,
  HelpModal,
  showContextMenu,
  hideContextMenu
};
//# sourceMappingURL=chunk-H4LT43RS.js.map
