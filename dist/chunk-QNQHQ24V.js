import {
  DragReorder
} from "./chunk-WVFGV5FT.js";

// src/editor/notebook_tab_bar.js
var TAB_MIME = "application/x-ecosim-tab";
var NotebookTabBar = class _NotebookTabBar {
  /** @type {HTMLElement} */
  #container = null;
  /** @type {object[]} [{filePath, label, fileType, isDirty}] */
  #tabs = [];
  /** @type {string|null} */
  #activeTab = null;
  /** @type {object} callbacks */
  #callbacks = {};
  // ─── Context menu ────────────────────────────────────────────────────────
  /** @type {HTMLElement|null} */
  #contextMenuEl = null;
  /** @type {Function|null} */
  #boundHideContextMenu = null;
  // ─── Drag and drop ───────────────────────────────────────────────────────
  /** Same-pane reorder. Cross-pane drops stay in this class's own
   *  container handlers (#onStripDrag*).
   *  @type {DragReorder|null} */
  #dragReorder = null;
  mount(container, callbacks = {}) {
    this.#container = container;
    this.#callbacks = callbacks;
    this.#container.className = "tabs notebook-tabs";
    this.#boundHideContextMenu = () => this.#hideContextMenu();
    this.#installStripDnDHandlers();
    this.#dragReorder = new DragReorder({
      container: this.#container,
      itemSelector: ".tab",
      keyAttr: "path",
      axis: "x",
      draggableGuard: (e) => {
        if (e.target.closest(".twm-tab-close")) return false;
        const title = e.target.closest(".tab")?.querySelector(".twm-tab-title");
        return title?.getAttribute("contenteditable") !== "true";
      },
      onDragStart: (e, key, item) => {
        try {
          e.dataTransfer.setData(TAB_MIME, key);
        } catch (_) {
        }
        try {
          this.#callbacks.onDragStart?.(e, key, item);
        } catch (err) {
          console.error("[tab-bar] onDragStart threw", err);
        }
      },
      onReorder: (order) => this.#callbacks.onReorder?.(order)
    });
    this.#render();
  }
  /**
   * Sync tabs from ProjectModel state.
   * @param {Array<{ filePath: string, fileType: string, isDirty: boolean }>} tabs
   * @param {string|null} activeFilePath
   */
  update(tabs, activeFilePath) {
    this.#tabs = tabs;
    this.#activeTab = activeFilePath;
    this.#render();
  }
  markDirty(filePath, isDirty) {
    const tab = this.#tabs.find((t) => t.filePath === filePath);
    if (tab) {
      tab.isDirty = isDirty;
      this.#render();
    }
  }
  dispose() {
    this.#hideContextMenu();
    this.#removeStripDnDHandlers();
    this.#dragReorder?.destroy();
    this.#dragReorder = null;
    this.#container = null;
  }
  // Material symbol per file kind, merged over the generic set. The map used to
  // hardcode EcoAgent's kinds — `scenario`, `dashboard`, `model` — so a generic
  // tab bar knew one application's file taxonomy. Pass `fileTypeIcons` to add
  // your own.
  static #FILE_TYPE_ICONS = {
    module: "extension",
    test: "fact_check",
    diff: "difference",
    unknown: "description"
  };
  static #EXTRA_ICONS = {};
  /**
   * Add your application's file kinds to the tab-bar icon map.
   *
   * The map used to hardcode `scenario: 'science'`, `dashboard: 'dashboard'` and
   * `model: 'schema'` — EcoAgent's file taxonomy, baked into a generic tab bar.
   *
   * @param {Object.<string, string>} icons fileType -> material symbol name
   */
  static setFileTypeIcons(icons = {}) {
    _NotebookTabBar.#EXTRA_ICONS = { ...icons };
  }
  static #iconFor(fileType) {
    return _NotebookTabBar.#EXTRA_ICONS[fileType] ?? _NotebookTabBar.#FILE_TYPE_ICONS[fileType] ?? _NotebookTabBar.#FILE_TYPE_ICONS.unknown;
  }
  // ═════════════════════════════════════════════════════════════════════════
  //  Rendering
  // ═════════════════════════════════════════════════════════════════════════
  #render() {
    if (!this.#container) return;
    this.#container.innerHTML = "";
    for (const tab of this.#tabs) {
      const isActive = tab.filePath === this.#activeTab;
      const rawPath = tab.filePath.replace(/^(diff|builtin):\/\//, "");
      const label = tab.label ?? (tab.fileType === "diff" ? `\u2194 ${rawPath.split("/").pop()}` : rawPath.split("/").pop().replace(/\.[^.]+$/, ""));
      const icon = _NotebookTabBar.#iconFor(tab.fileType);
      const tabEl = document.createElement("div");
      tabEl.className = `tab${isActive ? " active" : ""}${tab.isPreview ? " tab--preview" : ""}`;
      tabEl.dataset.path = tab.filePath;
      tabEl.title = tab.filePath;
      tabEl.innerHTML = `
                <span class="material-symbols-outlined tab-icon">${icon}</span>
                <span class="twm-tab-title">${this.#escHtml(label)}</span>
                ${tab.isDirty ? '<span class="tab-dirty">\u25CF</span>' : ""}
                ${tab.readonly ? "" : '<button class="twm-tab-close" title="Close tab" aria-label="Close tab">\xD7</button>'}
            `;
      tabEl.addEventListener("click", (e) => {
        if (e.target.closest(".twm-tab-close")) return;
        if (tabEl.querySelector(".twm-tab-title")?.getAttribute("contenteditable") === "true") return;
        this.#callbacks.onActivate?.(tab.filePath);
      });
      tabEl.querySelector(".twm-tab-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.#callbacks.onClose?.(tab.filePath);
      });
      tabEl.addEventListener("dblclick", (e) => {
        if (e.target.closest(".twm-tab-close")) return;
        this.#beginInlineRename(tab.filePath);
      });
      tabEl.addEventListener("keydown", (e) => {
        if (e.key === "F2") {
          e.preventDefault();
          this.#beginInlineRename(tab.filePath);
        }
      });
      tabEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#showContextMenu(e.clientX, e.clientY, tab.filePath);
      });
      this.#container.appendChild(tabEl);
    }
    this.#dragReorder?.attach();
  }
  // ═════════════════════════════════════════════════════════════════════════
  //  Drag and drop reordering (same-pane + cross-pane)
  // ═════════════════════════════════════════════════════════════════════════
  #installStripDnDHandlers() {
    if (!this.#container) return;
    this.#container.addEventListener("dragover", this.#onStripDragOver);
    this.#container.addEventListener("drop", this.#onStripDrop);
    this.#container.addEventListener("dragleave", this.#onStripDragLeave);
  }
  #removeStripDnDHandlers() {
    if (!this.#container) return;
    this.#container.removeEventListener("dragover", this.#onStripDragOver);
    this.#container.removeEventListener("drop", this.#onStripDrop);
    this.#container.removeEventListener("dragleave", this.#onStripDragLeave);
  }
  /** Check whether a drag event carries a cross-pane tab (not from this bar).
   *
   *  C33. A HOST MAY NAME A SECOND MIME, at mount, as
   *  `callbacks.externalTabMimes` — the tile renderer's tabs are not editor
   *  tabs and do not carry `application/x-ecosim-tab`, so without this the
   *  strip in tile B would refuse a tab dragged out of tile A's strip. Empty
   *  by default, so every existing consumer keeps exactly today's admission
   *  test.
   *
   *  THE `isActive()` EARLY RETURN STAYS FIRST AND STAYS UNCHANGED. It is the
   *  one line that keeps this bar's own reorder from being read as a foreign
   *  drop, and no widening of the MIME list may be allowed to reach past it.
   *
   *  Only `types` is consulted, never `getData` — under the HTML5 protected
   *  mode `getData` returns the empty string for every event except `drop`,
   *  so a payload read here would find nothing and arm nothing. */
  #isExternalTabDrag(e) {
    if (this.#dragReorder?.isActive()) return false;
    const extra = Array.isArray(this.#callbacks.externalTabMimes) ? this.#callbacks.externalTabMimes : [];
    try {
      const types = e.dataTransfer.types;
      return types.includes(TAB_MIME) || extra.some((m) => types.includes(m));
    } catch {
      return false;
    }
  }
  // Same-pane reorder is handled by the shared DragReorder module (set
  // up in mount()). These container handlers cover ONLY cross-pane tab
  // drops — gated on `#isExternalTabDrag`, which defers while our own
  // reorder drag is active.
  #onStripDragOver = (e) => {
    if (this.#isExternalTabDrag(e)) {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (_) {
      }
      this.#container.classList.add("notebook-tabs--drop-target");
    }
  };
  #onStripDrop = (e) => {
    if (this.#isExternalTabDrag(e)) {
      e.preventDefault();
      this.#container.classList.remove("notebook-tabs--drop-target");
      const filePath = e.dataTransfer.getData(TAB_MIME) || e.dataTransfer.getData("text/plain");
      if (filePath) {
        this.#callbacks.onDropFromOtherPane?.(filePath);
      }
    }
  };
  #onStripDragLeave = (e) => {
    if (!this.#container.contains(e.relatedTarget)) {
      this.#container.classList.remove("notebook-tabs--drop-target");
    }
  };
  // ═════════════════════════════════════════════════════════════════════════
  //  Context menu
  // ═════════════════════════════════════════════════════════════════════════
  #showContextMenu(x, y, filePath) {
    this.#hideContextMenu();
    const idx = this.#tabs.findIndex((t) => t.filePath === filePath);
    const total = this.#tabs.length;
    const allItems = [
      { label: "Rename", icon: "edit", action: "rename", shortcut: "F2" },
      { label: "Duplicate", icon: "content_copy", action: "duplicate" },
      { separator: true },
      { label: "Split Right", icon: "vertical_split", action: "split-right", shortcut: "Ctrl+\\" },
      { label: "Move to Other Pane", icon: "swap_horiz", action: "move-to-other" },
      { separator: true },
      { label: "Close", icon: "close", action: "close", danger: true },
      { label: "Close Others", icon: "close_fullscreen", action: "close-others", danger: true, disabled: total <= 1 },
      { label: "Close to the Right", icon: "tab_close", action: "close-right", danger: true, disabled: idx === -1 || idx >= total - 1 },
      { label: "Close All", icon: "tab_close_inactive", action: "close-all", danger: true },
      { label: "Close Saved", icon: "check_circle", action: "close-saved", danger: true },
      { separator: true },
      { label: "Reveal in Explorer", icon: "folder_open", action: "reveal" }
    ];
    const menuFilter = this.#callbacks.menuFilter;
    const items = menuFilter ? allItems.filter((item) => item.separator || menuFilter(item.action, filePath) !== false) : allItems;
    const cleaned = [];
    for (const item of items) {
      if (item.separator) {
        if (cleaned.length > 0 && !cleaned[cleaned.length - 1].separator) cleaned.push(item);
      } else {
        cleaned.push(item);
      }
    }
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].separator) cleaned.pop();
    const menu = document.createElement("div");
    menu.className = "nb-context-menu";
    for (const item of cleaned) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "nb-context-menu__separator";
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "nb-context-menu__item";
      if (item.danger) btn.classList.add("nb-context-menu__item--danger");
      if (item.disabled) btn.classList.add("nb-context-menu__item--disabled");
      btn.innerHTML = `<span class="material-symbols-outlined">${item.icon}</span><span>${this.#escHtml(item.label)}</span>${item.shortcut ? `<span class="nb-context-menu__shortcut">${item.shortcut}</span>` : ""}`;
      if (!item.disabled) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.#hideContextMenu();
          this.#handleContextMenuAction(item.action, filePath);
        });
      }
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    this.#contextMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top = `${Math.max(0, top)}px`;
    requestAnimationFrame(() => menu.classList.add("visible"));
    setTimeout(() => {
      document.addEventListener("click", this.#boundHideContextMenu, true);
      document.addEventListener("contextmenu", this.#boundHideContextMenu, true);
    }, 0);
    document.addEventListener("keydown", this.#onKeyDown);
  }
  #hideContextMenu() {
    if (!this.#contextMenuEl) return;
    this.#contextMenuEl.remove();
    this.#contextMenuEl = null;
    document.removeEventListener("click", this.#boundHideContextMenu, true);
    document.removeEventListener("contextmenu", this.#boundHideContextMenu, true);
    document.removeEventListener("keydown", this.#onKeyDown);
  }
  #onKeyDown = (e) => {
    if (e.key === "Escape") this.#hideContextMenu();
  };
  #handleContextMenuAction(action, filePath) {
    switch (action) {
      case "rename":
        this.#beginInlineRename(filePath);
        break;
      case "duplicate":
        this.#callbacks.onDuplicate?.(filePath);
        break;
      case "close":
        this.#callbacks.onClose?.(filePath);
        break;
      case "close-others":
        this.#callbacks.onCloseOthers?.(filePath);
        break;
      case "close-right":
        this.#callbacks.onCloseToRight?.(filePath);
        break;
      case "close-all":
        this.#callbacks.onCloseAll?.();
        break;
      case "close-saved":
        this.#callbacks.onCloseSaved?.();
        break;
      case "split-right":
        this.#callbacks.onSplitRight?.(filePath);
        break;
      case "move-to-other":
        this.#callbacks.onMoveToOtherPane?.(filePath);
        break;
      case "reveal":
        this.#callbacks.onRevealInExplorer?.(filePath);
        break;
    }
  }
  // ═════════════════════════════════════════════════════════════════════════
  //  Inline rename (contenteditable on tab title)
  // ═════════════════════════════════════════════════════════════════════════
  #beginInlineRename(filePath) {
    const tabEl = this.#container?.querySelector(`.tab[data-path="${CSS.escape(filePath)}"]`);
    if (!tabEl) return;
    const title = tabEl.querySelector(".twm-tab-title");
    if (!title || title.getAttribute("contenteditable") === "true") return;
    const tab = this.#tabs.find((t) => t.filePath === filePath);
    if (!tab) return;
    if (tab.fileType === "model") return;
    if (filePath.startsWith("builtin://")) return;
    if (tab.readonly) return;
    const original = title.textContent || "";
    title.setAttribute("contenteditable", "true");
    title.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {
    }
    let committed = false;
    const finish = (commit) => {
      if (committed) return;
      committed = true;
      const newName = (title.textContent || "").trim();
      title.removeAttribute("contenteditable");
      title.removeEventListener("keydown", onKeyDown);
      title.removeEventListener("blur", onBlur, true);
      try {
        window.getSelection()?.removeAllRanges?.();
      } catch (_) {
      }
      if (commit && newName && newName !== original && /^[\w][\w.-]*$/.test(newName)) {
        title.textContent = newName;
        const dir = filePath.split("/").slice(0, -1).join("/");
        const ext = filePath.split(".").pop();
        const newPath = `${dir}/${newName}.${ext}`;
        this.#callbacks.onRename?.(filePath, newPath);
      } else {
        title.textContent = original;
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
      e.stopPropagation();
    };
    const onBlur = () => finish(true);
    title.addEventListener("keydown", onKeyDown);
    title.addEventListener("blur", onBlur, true);
  }
  #escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
};

export {
  NotebookTabBar
};
//# sourceMappingURL=chunk-QNQHQ24V.js.map
