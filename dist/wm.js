import {
  HelpModal,
  openForm,
  showContextMenu
} from "./chunk-ELXVW542.js";
import {
  ManagedWindow
} from "./chunk-LH5TSOZW.js";
import "./chunk-FL5KFNQH.js";
import {
  NotebookTabBar
} from "./chunk-QNQHQ24V.js";
import "./chunk-WVFGV5FT.js";
import "./chunk-JYWURG5T.js";

// src/tiling/command_palette.js
var ROOT_ID = "twm-cmdpal";
var STATIC_COMMANDS = [
  {
    kind: "command",
    id: "shortcuts",
    label: "Keyboard shortcuts",
    hint: "Show all key bindings (?)",
    icon: "keyboard",
    action: () => HelpModal.open("keyboard-shortcuts")
  }
];
function createCommandPalette({
  wm,
  api,
  taxonomy,
  catalog,
  placeholder = "Search\u2026",
  onPick = null
}) {
  if (!taxonomy) throw new Error("createCommandPalette: a taxonomy is required");
  if (!catalog) throw new Error("createCommandPalette: an entity catalog is required");
  let overlay = null;
  let entities = [];
  const isOpen = () => !!overlay;
  const close = () => {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  };
  const toggle = () => {
    isOpen() ? close() : open();
  };
  const open = async () => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = ROOT_ID;
    overlay.className = "twm-cmdpal-overlay";
    overlay.innerHTML = _markup(taxonomy, placeholder, wm);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const input = overlay.querySelector(".twm-cmdpal__input");
    const list = overlay.querySelector('[data-role="list"]');
    const chipSlot = overlay.querySelector('[data-role="type-chip"]');
    const chips = overlay.querySelectorAll("[data-shortcut]");
    const toggles = overlay.querySelectorAll("[data-toggle]");
    for (const btn of toggles) {
      const which = btn.dataset.toggle;
      btn.classList.toggle("twm-chip--on", wm.isPanelOpen(which));
    }
    chips.forEach((btn) => btn.addEventListener("click", () => {
      const kind = btn.dataset.shortcut;
      wm.openInPrimary(kind);
      close();
    }));
    toggles.forEach((btn) => btn.addEventListener("click", () => {
      const which = btn.dataset.toggle;
      wm.togglePanel(which);
      btn.classList.toggle("twm-chip--on", wm.isPanelOpen(which));
    }));
    let filtered = [];
    let active = 0;
    let typeFilter = null;
    let typeFilterLabel = null;
    const renderChip = () => {
      if (!typeFilter) {
        chipSlot.innerHTML = "";
        return;
      }
      const head = typeFilter[0];
      const meta = taxonomy.meta(head);
      const label = typeFilterLabel || meta?.label || head;
      chipSlot.innerHTML = `
                <span class="twm-cmdpal__type-chip" title="Filtering by ${_esc(label)} (${typeFilter.length} kind${typeFilter.length === 1 ? "" : "s"})">
                    <span class="material-symbols-outlined twm-cmdpal__type-chip-icon">${meta?.icon || "arrow_right"}</span>
                    <span class="twm-cmdpal__type-chip-label">${_esc(label)}</span>
                    <button type="button" class="twm-cmdpal__type-chip-x"
                            data-action="clear-type"
                            aria-label="Clear type filter">\xD7</button>
                </span>
            `;
      chipSlot.querySelector('[data-action="clear-type"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        typeFilter = null;
        typeFilterLabel = null;
        renderChip();
        input.focus();
        refilter();
      });
    };
    const render = () => {
      list.innerHTML = filtered.slice(0, 200).map((e, i) => `
                <div class="twm-cmdpal__item${i === active ? " twm-cmdpal__item--active" : ""}"
                     data-idx="${i}">
                    <span class="material-symbols-outlined twm-cmdpal__icon">${e.icon || "arrow_right"}</span>
                    <span class="twm-cmdpal__label">${_esc(e.label || e.id)}</span>
                    <span class="twm-cmdpal__kind">${e.kind}</span>
                    <span class="twm-cmdpal__hint">${_esc(e.hint || "")}</span>
                </div>
            `).join("") || "";
      list.querySelectorAll("[data-idx]").forEach((el) => {
        el.addEventListener("click", () => commit(Number(el.dataset.idx)));
      });
    };
    const commit = (i) => {
      const pick = filtered[i];
      if (!pick) return;
      close();
      if (pick.action) {
        try {
          pick.action();
        } catch (err) {
          console.error(err);
        }
        return;
      }
      if (onPick) {
        let handled = false;
        try {
          handled = onPick(pick) ?? false;
        } catch (err) {
          console.error("[cmdpal] onPick threw", err);
        }
        if (handled) return;
      }
      wm.openInPrimary(pick.kind, pick.props || { id: pick.id, label: pick.label });
    };
    const tryConsumePrefix = () => {
      if (typeFilter) return false;
      const m = input.value.match(/^([a-zA-Z][a-zA-Z0-9_-]*):/);
      if (!m) return false;
      const kinds = catalog.resolveTypePrefix(m[1]);
      if (!kinds || kinds.length === 0) return false;
      typeFilter = kinds;
      typeFilterLabel = _titleCase(m[1]);
      input.value = input.value.slice(m[0].length);
      renderChip();
      return true;
    };
    const refilter = () => {
      tryConsumePrefix();
      const q = input.value.trim().toLowerCase();
      const filterSet = typeFilter ? new Set(typeFilter) : null;
      const pool = filterSet ? entities.filter((e) => filterSet.has(e.kind)) : entities;
      if (!q) {
        filtered = typeFilter ? pool.slice().sort((a, b) => String(a.label || a.id).localeCompare(b.label || b.id)) : [];
      } else {
        filtered = _search(pool, q);
      }
      active = 0;
      render();
    };
    input.addEventListener("input", refilter);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active = Math.min(filtered.length - 1, active + 1);
        render();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(0, active - 1);
        render();
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit(active);
      } else if (e.key === "Escape") {
        close();
      } else if (e.key === "Backspace" && input.value === "" && typeFilter) {
        e.preventDefault();
        typeFilter = null;
        typeFilterLabel = null;
        renderChip();
        refilter();
      }
    });
    input.focus();
    entities = _decorateIcons(STATIC_COMMANDS.slice(), taxonomy);
    if (api) {
      try {
        entities = _decorateIcons(
          [...STATIC_COMMANDS, ...await catalog.loadAll(api)],
          taxonomy
        );
        if (input.value) refilter();
      } catch (err) {
        console.warn("[cmdpal] entity load failed", err);
      }
    }
  };
  return { open, close, toggle, isOpen };
}
function _markup(taxonomy, placeholder, wm) {
  const PANEL_CHIPS = [
    { side: "left", icon: "menu", label: "Left nav" },
    { side: "right", icon: "dock_to_left", label: "Right panel" },
    { side: "bottom", icon: "dock_to_bottom", label: "Bottom panel" }
  ];
  const panelToggles = PANEL_CHIPS.filter((p) => wm.content?.has?.(`panel:${p.side}`) !== false).map((p) => `
                <button class="twm-chip" data-toggle="${p.side}">
                    <span class="material-symbols-outlined">${p.icon}</span>
                    ${p.label}
                </button>`).join("");
  const chips = taxonomy.topNavEntries().map((k) => `
        <button class="twm-chip" data-shortcut="${k.kind}">
            <span class="material-symbols-outlined">${k.icon}</span>
            ${k.label}
        </button>
    `).join("");
  return `
        <div class="twm-cmdpal" role="dialog" aria-label="Command palette">
            <div class="twm-cmdpal__inputrow">
                <span class="twm-cmdpal__type-chip-slot" data-role="type-chip"></span>
                <input type="text" class="twm-cmdpal__input"
                       placeholder="${_esc(placeholder)}"
                       autocomplete="off" />
            </div>
            <div class="twm-cmdpal__chips">${chips}</div>
            <div class="twm-cmdpal__toggles">${panelToggles}</div>
            <div class="twm-cmdpal__list" data-role="list"></div>
            <div class="twm-cmdpal__footer">
                <span><kbd>\u2191</kbd><kbd>\u2193</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
            </div>
        </div>
    `;
}
function _decorateIcons(rows, taxonomy) {
  return rows.map((r) => {
    if (r.icon) return r;
    const meta = taxonomy.meta(r.kind);
    return { ...r, icon: meta?.icon || "arrow_right" };
  });
}
function _search(entities, q) {
  const scored = [];
  for (const e of entities) {
    const id = String(e.id || "").toLowerCase();
    const label = String(e.label || "").toLowerCase();
    const hint = String(e.hint || "").toLowerCase();
    let r;
    if (id === q || label === q) r = 0;
    else if (id.startsWith(q)) r = 1;
    else if (label.startsWith(q)) r = 2;
    else if (id.includes(q)) r = 3;
    else if (label.includes(q)) r = 4;
    else if (hint.includes(q)) r = 5;
    else continue;
    scored.push({ e, r });
  }
  scored.sort((a, b) => a.r - b.r || a.e.label.localeCompare(b.e.label));
  return scored.map((x) => x.e);
}
function _esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
function _titleCase(s) {
  const str = String(s || "").replace(/[_-]+/g, " ").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// src/tiling/content_registry.js
var PLACEHOLDER_KIND = "window-placeholder";
function windowPlaceholderFactory(hostEl, props, ctx) {
  hostEl.innerHTML = `
        <div class="twm-window-placeholder">
            <span class="material-symbols-outlined twm-window-placeholder__icon">open_in_new</span>
            <div class="twm-window-placeholder__title">${_esc2(props.originalTitle || props.originalKind || "content")}</div>
            <div class="twm-window-placeholder__hint">is open in a managed window</div>
            <button class="twm-window-placeholder__btn" data-action="bring-back">
                Bring back to this tile
            </button>
        </div>
    `;
  hostEl.querySelector('[data-action="bring-back"]')?.addEventListener("click", () => {
    ctx.wm?.bringBackWindow?.(props.windowId);
  });
  return { title: `${props.originalTitle || props.originalKind} (window)` };
}
function createContentRegistry(map = {}) {
  if (!map || typeof map !== "object") {
    throw new TypeError("createContentRegistry: `content` must be an object of kind -> factory");
  }
  for (const [kind, factory] of Object.entries(map)) {
    if (typeof factory !== "function") {
      throw new TypeError(
        `createContentRegistry: factory for "${kind}" must be a function`
      );
    }
  }
  const factories = new Map(Object.entries(map));
  if (!factories.has(PLACEHOLDER_KIND)) {
    factories.set(PLACEHOLDER_KIND, windowPlaceholderFactory);
  }
  return Object.freeze({
    has: (kind) => factories.has(kind),
    mount: (kind, hostEl, props, ctx) => {
      const factory = factories.get(kind) || _placeholder(kind);
      try {
        return factory(hostEl, props || {}, ctx || {}) || {};
      } catch (err) {
        console.error("[content_registry] mount failed for", kind, err);
        hostEl.innerHTML = `<div class="twm-tile-error">Mount failed: ${err && err.message || err}</div>`;
        return {};
      }
    }
  });
}
function _placeholder(kind) {
  return (hostEl) => {
    hostEl.innerHTML = `
            <div class="tile-placeholder">
                <div class="tile-placeholder__title">${kind}</div>
                <div class="tile-placeholder__hint">no factory registered yet</div>
            </div>
        `;
    return { title: kind };
  };
}
function _esc2(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// src/tiling/tile_tree.js
var _idCounter = 1;
function _newId(prefix) {
  return `${prefix}-${_idCounter++}`;
}
function _isPanel(leaf) {
  return String(leaf?.content?.kind || "").startsWith("panel:");
}
function _syncActiveTab(leaf) {
  if (!leaf || leaf.kind !== "leaf") return;
  const tabs = leaf.tabs || [];
  if (tabs.length === 0) {
    leaf.content = null;
    leaf.title = leaf.title || "";
    leaf.activeTabIdx = 0;
    return;
  }
  if (leaf.activeTabIdx == null || leaf.activeTabIdx < 0 || leaf.activeTabIdx >= tabs.length) {
    leaf.activeTabIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
  }
  const t = tabs[leaf.activeTabIdx];
  leaf.content = { kind: t.kind, props: t.props || {} };
  leaf.title = t.title || t.kind || "";
}
function makeLeaf({ content = null, title = "" } = {}) {
  const leaf = {
    id: _newId("leaf"),
    kind: "leaf",
    parentId: null,
    // Tabs are the source of truth; content/title mirror tabs[active].
    tabs: content ? [{ kind: content.kind, props: content.props || {}, title: title || content.kind || "" }] : [],
    activeTabIdx: content ? 0 : 0,
    content,
    title,
    // Per-top-nav-page tab archive. When a top-nav button switches
    // this leaf to another page, the current `tabs` + `activeTabIdx`
    // get stashed here under the LEAVING page's key, and the target
    // page's archived list (if any) gets restored. This is what
    // makes a tile remember its tab set when the user clicks away to
    // another top-nav page and back. Keyed by top-nav kind — see the
    // taxonomy's `topNavFor`.
    pageTabs: {}
  };
  _syncActiveTab(leaf);
  return leaf;
}
function makeSplit({ dir = "h", children = [], sizes = null } = {}) {
  return {
    id: _newId("split"),
    kind: "split",
    parentId: null,
    dir,
    children: children.slice(),
    sizes: sizes ? sizes.slice() : children.map(() => 1)
  };
}
var TileTree = class _TileTree {
  constructor() {
    this.nodes = /* @__PURE__ */ new Map();
    this.rootId = null;
    this.focusedLeafId = null;
    this.focusStack = [];
  }
  // ── Read helpers ────────────────────────────────────────────────
  get(id) {
    return this.nodes.get(id) || null;
  }
  root() {
    return this.rootId ? this.get(this.rootId) : null;
  }
  focused() {
    return this.focusedLeafId ? this.get(this.focusedLeafId) : null;
  }
  leaves() {
    const out = [];
    const walk = (id) => {
      const n = this.get(id);
      if (!n) return;
      if (n.kind === "leaf") out.push(n);
      else n.children.forEach(walk);
    };
    if (this.rootId) walk(this.rootId);
    return out;
  }
  // ── Construction ───────────────────────────────────────────────
  setRoot(node) {
    this._register(node);
    this.rootId = node.id;
    if (node.kind === "leaf") {
      this.focus(node.id);
    }
    return node.id;
  }
  _register(node) {
    this.nodes.set(node.id, node);
    if (node.kind === "split") {
      for (const cid of node.children) {
        const c = this.get(cid);
        if (c) c.parentId = node.id;
      }
    }
  }
  // ── Focus ───────────────────────────────────────────────────────
  focus(leafId) {
    if (!this.nodes.has(leafId)) return;
    const node = this.get(leafId);
    if (node.kind !== "leaf") return;
    this.focusedLeafId = leafId;
    this.focusStack = this.focusStack.filter((id) => id !== leafId);
    this.focusStack.unshift(leafId);
  }
  /** The leaf where "open content" should land — top of focus stack,
   *  skipping panel:* tiles which are chrome, not content. */
  primaryLeafId() {
    for (const id of this.focusStack) {
      const n = this.nodes.get(id);
      if (n && n.kind === "leaf" && !_isPanel(n)) return id;
    }
    for (const leaf of this.leaves()) {
      if (!_isPanel(leaf)) return leaf.id;
    }
    return null;
  }
  // ── Mutations ───────────────────────────────────────────────────
  /** Replace the leaf's tab list with a single tab carrying `content`.
   *  Closes any existing tabs in that leaf — this is the "open in
   *  place" / "replace tile" path that the WM has always used. */
  setLeafContent(leafId, content, title = "") {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    if (content) {
      n.tabs = [{
        kind: content.kind,
        props: content.props || {},
        title: title || content.kind || ""
      }];
      n.activeTabIdx = 0;
    } else {
      n.tabs = [];
      n.activeTabIdx = 0;
    }
    _syncActiveTab(n);
    if (title) n.title = title;
    return true;
  }
  /** Page-aware swap: archive the leaf's current tab list under its
   *  current top-nav key, then restore the target top-nav's archived
   *  list (or initialize one with the requested kind/props). Used
   *  by top-nav / palette navigation so each top-nav page keeps its
   *  own tab set across page switches.
   *
   *  Parameters:
   *    leafId         The primary leaf.
   *    target         { kind, props, title } — what the user clicked.
   *    currentTopNav  Top-nav of the leaf's current page (may be null).
   *    targetTopNav   Top-nav of the target kind (must be set).
   *
   *  When `currentTopNav === targetTopNav` (already on the right
   *  page), the swap is skipped and we either focus an existing
   *  matching tab or replace the active one. This is what makes
   *  clicking the top-nav button for the page you're already on
   *  feel like "Home for this page" without resetting tabs. */
  swapToPage(leafId, target, currentTopNav, targetTopNav, opts = {}) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    if (!target || !target.kind) return false;
    n.pageTabs = n.pageTabs || {};
    const recordHistory = opts.recordHistory !== false;
    const _pushPrev = (history, prev, next, extra) => {
      if (!recordHistory || !prev || !prev.kind) return history;
      const last = history[history.length - 1];
      const sameAsPrev = last && last.kind === prev.kind && String(last.props?.id ?? "") === String(prev.props?.id ?? "");
      const sameAsTarget = next && prev.kind === next.kind && String(prev.props?.id ?? "") === String(next.props?.id ?? "");
      if (!sameAsPrev && !sameAsTarget) {
        history.push({
          kind: prev.kind,
          props: prev.props || {},
          title: prev.title || "",
          ...extra || {}
        });
      }
      return history;
    };
    const same = currentTopNav && currentTopNav === targetTopNav;
    if (same) {
      const tabs = n.tabs || [];
      const matchIdx = tabs.findIndex((t) => t.kind === target.kind && String(t.props?.id ?? "") === String(target.props?.id ?? ""));
      if (matchIdx >= 0) {
        n.activeTabIdx = matchIdx;
      } else if (tabs.length === 0) {
        n.tabs = [{
          kind: target.kind,
          props: target.props || {},
          title: target.title || target.kind,
          history: []
        }];
        n.activeTabIdx = 0;
      } else {
        const prev = tabs[n.activeTabIdx];
        const history = Array.isArray(prev?.history) ? prev.history : [];
        _pushPrev(history, prev, target, null);
        tabs[n.activeTabIdx] = {
          kind: target.kind,
          props: target.props || {},
          title: target.title || target.kind,
          history
        };
      }
      _syncActiveTab(n);
      return true;
    }
    const srcTabs = Array.isArray(n.tabs) ? n.tabs : [];
    const srcActive = srcTabs[n.activeTabIdx];
    const sourceEntry = currentTopNav && srcActive?.kind ? {
      kind: srcActive.kind,
      props: srcActive.props || {},
      title: srcActive.title || "",
      topNav: currentTopNav
    } : null;
    if (currentTopNav && srcTabs.length > 0) {
      const archived = srcTabs.filter((t) => !t.transient).map((t) => ({
        kind: t.kind,
        props: { ...t.props || {} },
        title: t.title,
        history: Array.isArray(t.history) ? t.history.slice() : []
      }));
      n.pageTabs[currentTopNav] = {
        tabs: archived,
        activeTabIdx: Math.max(0, Math.min(archived.length - 1, n.activeTabIdx || 0))
      };
    }
    const saved = n.pageTabs[targetTopNav];
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
      n.tabs = saved.tabs.map((t) => ({
        kind: t.kind,
        props: { ...t.props || {} },
        title: t.title,
        history: Array.isArray(t.history) ? t.history.slice() : []
      }));
      n.activeTabIdx = Math.max(
        0,
        Math.min(n.tabs.length - 1, saved.activeTabIdx || 0)
      );
      const wantsTarget = target.props?.id != null || target.kind !== targetTopNav;
      if (wantsTarget) {
        const wantId = target.props?.id != null;
        const matchIdx = n.tabs.findIndex((t) => t.kind === target.kind && (!wantId || String(t.props?.id ?? "") === String(target.props.id)));
        if (matchIdx >= 0) {
          n.activeTabIdx = matchIdx;
        } else {
          const history = [];
          if (sourceEntry) _pushPrev(history, sourceEntry, target, { topNav: currentTopNav });
          n.tabs.push({
            kind: target.kind,
            props: target.props || {},
            title: target.title || target.kind,
            history
          });
          n.activeTabIdx = n.tabs.length - 1;
        }
      }
    } else {
      const history = [];
      if (sourceEntry) _pushPrev(history, sourceEntry, target, { topNav: currentTopNav });
      n.tabs = [{
        kind: target.kind,
        props: target.props || {},
        title: target.title || target.kind,
        history
      }];
      n.activeTabIdx = 0;
    }
    _syncActiveTab(n);
    return true;
  }
  /** Update any tab whose (kind, props.id) matches the given pair to
   *  reflect a new label. Called from the WM in response to the
   *  embedder's entity-renamed bus event, so tab titles stay live as
   *  the underlying entity is renamed. */
  renameMatchingTabs(kind, id, newLabel) {
    if (!kind || !id || !newLabel) return false;
    let touched = false;
    const visit = (tabs) => {
      if (!Array.isArray(tabs)) return;
      for (const t of tabs) {
        if (t.kind === kind && String(t.props?.id ?? "") === String(id)) {
          t.title = String(newLabel);
          if (t.props) t.props.label = String(newLabel);
          touched = true;
        }
      }
    };
    for (const n of this.nodes.values()) {
      if (n.kind !== "leaf") continue;
      visit(n.tabs);
      if (n.pageTabs) {
        for (const arc of Object.values(n.pageTabs)) visit(arc?.tabs);
      }
      _syncActiveTab(n);
    }
    return touched;
  }
  /** Replace the active tab's content in place, preserving every
   *  other tab in the leaf. This is the "in-tile navigation" path:
   *  clicking a row on a landing page, walking back via Backspace,
   *  or clicking a breadcrumb segment should swap THIS tab's
   *  content without disturbing the user's other open tabs.
   *
   *  By default the previous content is pushed onto the active
   *  tab's `history` stack so the user can Backspace through their
   *  own click-path (per-tab "browser back"). Callers that are
   *  themselves popping the history pass `{ recordHistory: false }`
   *  so we don't double-record. Same applies to programmatic loads
   *  that aren't user navigations.
   *
   *  Falls back to `setLeafContent` for empty leaves so the WM
   *  never has to special-case the initial load. Returns true on
   *  success. */
  replaceActiveTabContent(leafId, content, title = "", opts = {}) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = Array.isArray(n.tabs) ? n.tabs : [];
    if (tabs.length === 0) {
      return this.setLeafContent(leafId, content, title);
    }
    if (!content) return false;
    const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
    const prev = tabs[idx];
    const recordHistory = opts.recordHistory !== false;
    const history = Array.isArray(prev?.history) ? prev.history : [];
    if (recordHistory && prev && prev.kind) {
      const last = history[history.length - 1];
      const sameAsPrev = last && last.kind === prev.kind && String(last.props?.id ?? "") === String(prev.props?.id ?? "");
      const sameAsTarget = prev.kind === content.kind && String(prev.props?.id ?? "") === String(content.props?.id ?? "");
      if (!sameAsPrev && !sameAsTarget) {
        history.push({
          kind: prev.kind,
          props: prev.props || {},
          title: prev.title || ""
        });
      }
    }
    tabs[idx] = {
      kind: content.kind,
      props: content.props || {},
      title: title || content.kind || "",
      history
    };
    _syncActiveTab(n);
    return true;
  }
  /** Merge `patch` into the active tab's `props`. Used when an
   *  in-tile editor surfaces metadata that should be captured in
   *  history snapshots (e.g. which sub-tab is open) so Backspace
   *  restores the user's view, not the default landing. Does not
   *  re-render or push history — pure metadata write. */
  updateActiveTabProps(leafId, patch) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = Array.isArray(n.tabs) ? n.tabs : [];
    if (tabs.length === 0) return false;
    const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
    const cur = tabs[idx];
    if (!cur) return false;
    cur.props = { ...cur.props || {}, ...patch || {} };
    return true;
  }
  /** Pop one entry off the active tab's history stack and return it,
   *  or null when empty. Doesn't mutate the tab beyond the stack —
   *  the caller is expected to apply the returned content via
   *  `replaceActiveTabContent(..., { recordHistory: false })`. */
  popActiveTabHistory(leafId) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return null;
    const tabs = Array.isArray(n.tabs) ? n.tabs : [];
    if (tabs.length === 0) return null;
    const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
    const cur = tabs[idx];
    const history = Array.isArray(cur?.history) ? cur.history : [];
    if (history.length === 0) return null;
    return history.pop();
  }
  /** Inspect the active tab's history stack without popping. Used
   *  by the keymap to show / hide the back affordance and for
   *  diagnostics. */
  activeTabHistory(leafId) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return [];
    const tabs = Array.isArray(n.tabs) ? n.tabs : [];
    if (tabs.length === 0) return [];
    const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
    const cur = tabs[idx];
    return Array.isArray(cur?.history) ? cur.history : [];
  }
  /** Append a new tab to a leaf and focus it. Returns the new tab's
   *  index, or -1 on failure. Panel tiles never grow tabs (they're
   *  chrome). */
  appendLeafTab(leafId, content, title = "", opts = {}) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return -1;
    if (_isPanel(n)) return -1;
    if (!content) return -1;
    const tab = {
      kind: content.kind,
      props: content.props || {},
      title: title || content.kind || "",
      // Transient tabs (e.g. an add-row form) are not persisted /
      // restored — see serialize() + the pageTabs archive.
      ...opts.transient ? { transient: true } : {}
    };
    n.tabs = Array.isArray(n.tabs) ? n.tabs : [];
    n.tabs.push(tab);
    n.activeTabIdx = n.tabs.length - 1;
    _syncActiveTab(n);
    return n.activeTabIdx;
  }
  /** Switch the active tab on a leaf. No-op if `idx` is out of range. */
  setActiveLeafTab(leafId, idx) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    if (!Array.isArray(n.tabs) || idx < 0 || idx >= n.tabs.length) return false;
    n.activeTabIdx = idx;
    _syncActiveTab(n);
    return true;
  }
  /** Remove a tab. If the active tab was removed, the previous one
   *  becomes active. If the last tab was removed, the leaf's content
   *  drops to null (and the WM should treat that as an empty tile —
   *  same as before tabs existed). Returns the (possibly clamped)
   *  active index after the operation, or -1 on failure. */
  removeLeafTab(leafId, idx) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return -1;
    if (!Array.isArray(n.tabs) || idx < 0 || idx >= n.tabs.length) return -1;
    n.tabs.splice(idx, 1);
    if (n.tabs.length === 0) {
      n.activeTabIdx = 0;
      _syncActiveTab(n);
      return 0;
    }
    if (idx < n.activeTabIdx) n.activeTabIdx -= 1;
    else if (idx === n.activeTabIdx) n.activeTabIdx = Math.max(0, idx - 1);
    _syncActiveTab(n);
    return n.activeTabIdx;
  }
  /** Bulk-close every tab in a leaf except the one at `keepIdx`.
   *  Used by the tab right-click "Close others" action. */
  closeOtherTabs(leafId, keepIdx) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = n.tabs || [];
    if (keepIdx < 0 || keepIdx >= tabs.length) return false;
    n.tabs = [tabs[keepIdx]];
    n.activeTabIdx = 0;
    _syncActiveTab(n);
    return true;
  }
  /** Close every tab after `idx`. */
  closeTabsAfter(leafId, idx) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = n.tabs || [];
    if (idx < 0 || idx >= tabs.length - 1) return false;
    n.tabs = tabs.slice(0, idx + 1);
    if (n.activeTabIdx > idx) n.activeTabIdx = idx;
    _syncActiveTab(n);
    return true;
  }
  /** Close every tab before `idx`. */
  closeTabsBefore(leafId, idx) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = n.tabs || [];
    if (idx <= 0 || idx >= tabs.length) return false;
    n.tabs = tabs.slice(idx);
    n.activeTabIdx = Math.max(0, n.activeTabIdx - idx);
    _syncActiveTab(n);
    return true;
  }
  /** Reorder a tab from `from` to `to` within the same leaf. */
  moveLeafTab(leafId, from, to) {
    const n = this.get(leafId);
    if (!n || n.kind !== "leaf") return false;
    const tabs = n.tabs || [];
    if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return false;
    const moved = tabs.splice(from, 1)[0];
    tabs.splice(to, 0, moved);
    if (n.activeTabIdx === from) n.activeTabIdx = to;
    else if (from < n.activeTabIdx && to >= n.activeTabIdx) n.activeTabIdx -= 1;
    else if (from > n.activeTabIdx && to <= n.activeTabIdx) n.activeTabIdx += 1;
    _syncActiveTab(n);
    return true;
  }
  /**
   * C33. MOVE ONE TAB FROM ONE LEAF TO ANOTHER, AS ONE MUTATION.
   *
   * Every other tab operation on this class takes ONE `leafId`, and that was
   * a complete description of the model until a tab could be dragged into a
   * different tile: `appendLeafTab`, `removeLeafTab`, `moveLeafTab` and the
   * three bulk closes all begin and end inside a single leaf. The renderer's
   * refusal to wire `onDropFromOtherPane` named this absence as one of its
   * two reasons (`tile_renderer.js`, `_topTabCallbacks`); this is that half.
   *
   * ONE FUNCTION RATHER THAN A COMPOSE, and that is why it lives here rather
   * than in the WM. `removeLeafTab` then `appendLeafTab` is two mutations
   * with a moment between them in which the tab exists nowhere — and the
   * second can FAIL (a panel destination refuses tabs), which leaves the tree
   * short one tab and nothing on screen saying where it went. Every guard is
   * therefore taken before the first splice.
   *
   * TWO NODES ARE RE-SYNCED, WHICH IS WHAT MAKES THIS DIFFERENT. `tabs` is
   * the source of truth and `content`/`title` mirror `tabs[active]`
   * (`_syncActiveTab`). Every existing mutation touches one leaf, so one
   * re-sync is right; this one touches two, and skipping the SOURCE's leaves
   * a pane whose chrome still names — and whose body still mounts — a tab it
   * no longer holds. That is the mistake this operation invites, and it is
   * what `web/js/shell/tab_drop.test.mjs` asserts against in the consumer.
   *
   * A same-leaf call is a REORDER and delegates, so there is one
   * implementation of "a tab changed position within its strip" rather than
   * two that will disagree about the active-index clamp.
   *
   * @param {string} fromLeafId
   * @param {number} fromIdx
   * @param {string} toLeafId
   * @param {number} [toIdx=-1]  where to insert; -1 (or past the end) appends
   * @returns {{ok: boolean, toIdx: number, emptied: boolean}|null} null when
   *   the move was refused. `emptied` tells the caller the source pane now
   *   holds nothing, which is its cue to re-seed rather than leave a blank
   *   tile — the never-empty-tile invariant is the WM's to keep, not this
   *   class's.
   */
  moveTabToLeaf(fromLeafId, fromIdx, toLeafId, toIdx = -1) {
    const from = this.get(fromLeafId);
    const to = this.get(toLeafId);
    if (!from || from.kind !== "leaf") return null;
    if (!to || to.kind !== "leaf") return null;
    const tabs = Array.isArray(from.tabs) ? from.tabs : [];
    if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= tabs.length) return null;
    if (_isPanel(to)) return null;
    if (fromLeafId === toLeafId) {
      const dest = !Number.isInteger(toIdx) || toIdx < 0 || toIdx >= tabs.length ? tabs.length - 1 : toIdx;
      if (!this.moveLeafTab(fromLeafId, fromIdx, dest)) return null;
      return { ok: true, toIdx: dest, emptied: false };
    }
    const [moved] = from.tabs.splice(fromIdx, 1);
    if (from.tabs.length === 0) from.activeTabIdx = 0;
    else if (fromIdx < from.activeTabIdx) from.activeTabIdx -= 1;
    else if (fromIdx === from.activeTabIdx) from.activeTabIdx = Math.max(0, fromIdx - 1);
    to.tabs = Array.isArray(to.tabs) ? to.tabs : [];
    const at = !Number.isInteger(toIdx) || toIdx < 0 || toIdx > to.tabs.length ? to.tabs.length : toIdx;
    to.tabs.splice(at, 0, moved);
    to.activeTabIdx = at;
    _syncActiveTab(from);
    _syncActiveTab(to);
    return { ok: true, toIdx: at, emptied: from.tabs.length === 0 };
  }
  /**
   * Split a leaf in the given direction; existing content stays in the
   * original leaf, a new empty leaf is added next to it. Returns the
   * new leaf id, or null on failure.
   */
  split(leafId, dir) {
    const leaf = this.get(leafId);
    if (!leaf || leaf.kind !== "leaf") return null;
    const newLeaf = makeLeaf();
    if (!leaf.parentId) {
      const wrap2 = makeSplit({ dir, children: [leaf.id, newLeaf.id] });
      this._register(newLeaf);
      this._register(wrap2);
      this.rootId = wrap2.id;
      leaf.parentId = wrap2.id;
      newLeaf.parentId = wrap2.id;
      this.focus(newLeaf.id);
      return newLeaf.id;
    }
    const parent = this.get(leaf.parentId);
    const idx = parent.children.indexOf(leaf.id);
    if (idx < 0) return null;
    if (parent.dir === dir) {
      parent.children.splice(idx + 1, 0, newLeaf.id);
      const avg = parent.sizes.reduce((a, b) => a + b, 0) / parent.children.length;
      parent.sizes.splice(idx + 1, 0, avg);
      newLeaf.parentId = parent.id;
      this._register(newLeaf);
      this.focus(newLeaf.id);
      return newLeaf.id;
    }
    const wrap = makeSplit({ dir, children: [leaf.id, newLeaf.id] });
    wrap.parentId = parent.id;
    parent.children[idx] = wrap.id;
    leaf.parentId = wrap.id;
    newLeaf.parentId = wrap.id;
    this._register(newLeaf);
    this._register(wrap);
    this.focus(newLeaf.id);
    return newLeaf.id;
  }
  /**
   * Close a leaf, collapsing any single-child splits that result. If
   * the last leaf is closed, leaves an empty tree (no root) — caller
   * is expected to repopulate.
   */
  close(leafId) {
    const leaf = this.get(leafId);
    if (!leaf || leaf.kind !== "leaf") return false;
    if (!leaf.parentId) {
      this.nodes.clear();
      this.rootId = null;
      this.focusedLeafId = null;
      this.focusStack = [];
      return true;
    }
    const parent = this.get(leaf.parentId);
    const idx = parent.children.indexOf(leaf.id);
    parent.children.splice(idx, 1);
    parent.sizes.splice(idx, 1);
    this.nodes.delete(leaf.id);
    this.focusStack = this.focusStack.filter((id) => id !== leaf.id);
    this._collapse(parent);
    if (this.focusedLeafId === leaf.id) {
      const remaining = this.leaves();
      this.focusedLeafId = remaining.length ? remaining[0].id : null;
      if (this.focusedLeafId) this.focus(this.focusedLeafId);
    }
    return true;
  }
  _collapse(node) {
    if (!node || node.kind !== "split") return;
    if (node.children.length > 1) return;
    if (node.children.length === 0) {
      if (!node.parentId) {
        this.nodes.delete(node.id);
        this.rootId = null;
        return;
      }
      const gp = this.get(node.parentId);
      const idx = gp.children.indexOf(node.id);
      gp.children.splice(idx, 1);
      gp.sizes.splice(idx, 1);
      this.nodes.delete(node.id);
      this._collapse(gp);
      return;
    }
    const only = this.get(node.children[0]);
    if (!node.parentId) {
      this.rootId = only.id;
      only.parentId = null;
    } else {
      const gp = this.get(node.parentId);
      const idx = gp.children.indexOf(node.id);
      gp.children[idx] = only.id;
      only.parentId = gp.id;
    }
    this.nodes.delete(node.id);
  }
  // ── Directional focus ──────────────────────────────────────────
  /**
   * Move focus from current leaf in the given direction. Walks up the
   * tree looking for an ancestor split whose direction matches the
   * move (h for left/right, v for up/down) and which has a sibling on
   * the requested side; then descends along the matching edge.
   */
  focusDir(dir) {
    const cur = this.focused();
    if (!cur) return false;
    const wantDir = dir === "left" || dir === "right" ? "h" : "v";
    const forward = dir === "right" || dir === "down";
    let child = cur;
    let parent = child.parentId ? this.get(child.parentId) : null;
    while (parent) {
      if (parent.dir === wantDir) {
        const idx = parent.children.indexOf(child.id);
        const sibIdx = forward ? idx + 1 : idx - 1;
        if (sibIdx >= 0 && sibIdx < parent.children.length) {
          const target = this._descendEdge(
            parent.children[sibIdx],
            wantDir,
            !forward
          );
          if (target) {
            this.focus(target);
            return true;
          }
        }
      }
      child = parent;
      parent = child.parentId ? this.get(child.parentId) : null;
    }
    return false;
  }
  /**
   * Walk down to a leaf. For the matching direction we take the
   * `edge` end (first/last). For the orthogonal direction we just
   * take the first child.
   */
  _descendEdge(nodeId, matchDir, takeFirst) {
    let n = this.get(nodeId);
    while (n && n.kind !== "leaf") {
      const idx = n.dir === matchDir ? takeFirst ? 0 : n.children.length - 1 : 0;
      n = this.get(n.children[idx]);
    }
    return n ? n.id : null;
  }
  // ── Move tile ──────────────────────────────────────────────────
  /**
   * Move the focused leaf one position in the given direction. Simple
   * version: swap with the immediate sibling in the matching parent;
   * if no such sibling, no-op (deep moves come later if needed).
   */
  moveDir(dir) {
    const cur = this.focused();
    if (!cur || !cur.parentId) return false;
    const wantDir = dir === "left" || dir === "right" ? "h" : "v";
    const forward = dir === "right" || dir === "down";
    let child = cur;
    let parent = this.get(child.parentId);
    while (parent && parent.dir !== wantDir) {
      child = parent;
      parent = child.parentId ? this.get(child.parentId) : null;
    }
    if (!parent) return false;
    const idx = parent.children.indexOf(child.id);
    const swap = forward ? idx + 1 : idx - 1;
    if (swap < 0 || swap >= parent.children.length) return false;
    [parent.children[idx], parent.children[swap]] = [parent.children[swap], parent.children[idx]];
    [parent.sizes[idx], parent.sizes[swap]] = [parent.sizes[swap], parent.sizes[idx]];
    return true;
  }
  // ── Resize ──────────────────────────────────────────────────────
  setSplitSizes(splitId, sizes) {
    const n = this.get(splitId);
    if (!n || n.kind !== "split") return false;
    if (sizes.length !== n.children.length) return false;
    n.sizes = sizes.slice();
    return true;
  }
  // ── Serialization (for desktops persistence) ──────────────────
  serialize() {
    if (!this.rootId) return null;
    const dump = (id) => {
      const n = this.get(id);
      if (n.kind === "leaf") {
        const liveTabs = (Array.isArray(n.tabs) ? n.tabs : []).filter((t) => !t.transient).map((t) => ({ kind: t.kind, props: t.props, title: t.title }));
        return {
          kind: "leaf",
          title: n.title,
          content: n.content,
          tabs: liveTabs,
          activeTabIdx: Math.max(0, Math.min(liveTabs.length - 1, n.activeTabIdx || 0)),
          // Page-archive: per-top-nav-kind saved tab lists so
          // switching to a previously-visited page restores
          // its tabs across reloads.
          pageTabs: n.pageTabs ? Object.fromEntries(
            Object.entries(n.pageTabs).map(([k, v]) => {
              const pt = (v.tabs || []).filter((t) => !t.transient).map((t) => ({ kind: t.kind, props: t.props, title: t.title }));
              return [k, {
                tabs: pt,
                activeTabIdx: Math.max(0, Math.min(pt.length - 1, v.activeTabIdx || 0))
              }];
            })
          ) : {}
        };
      }
      return {
        kind: "split",
        dir: n.dir,
        sizes: n.sizes.slice(),
        children: n.children.map(dump)
      };
    };
    return {
      root: dump(this.rootId),
      focusedTitle: this.focused()?.title || null
    };
  }
  static deserialize(blob) {
    const t = new _TileTree();
    if (!blob || !blob.root) return t;
    const build = (raw) => {
      if (raw.kind === "leaf") {
        const leaf = makeLeaf({ content: raw.content, title: raw.title });
        if (Array.isArray(raw.tabs) && raw.tabs.length > 0) {
          leaf.tabs = raw.tabs.map((tab) => ({
            kind: tab.kind,
            props: tab.props || {},
            title: tab.title || tab.kind || ""
          }));
          leaf.activeTabIdx = Math.max(
            0,
            Math.min(leaf.tabs.length - 1, raw.activeTabIdx || 0)
          );
          _syncActiveTab(leaf);
        }
        if (raw.pageTabs && typeof raw.pageTabs === "object") {
          leaf.pageTabs = {};
          for (const [k, v] of Object.entries(raw.pageTabs)) {
            if (!v || !Array.isArray(v.tabs)) continue;
            leaf.pageTabs[k] = {
              tabs: v.tabs.map((t2) => ({
                kind: t2.kind,
                props: t2.props || {},
                title: t2.title || t2.kind || ""
              })),
              activeTabIdx: v.activeTabIdx || 0
            };
          }
        }
        return leaf;
      }
      const children = raw.children.map(build);
      const split = makeSplit({
        dir: raw.dir,
        children: children.map((c) => c.id),
        sizes: raw.sizes
      });
      children.forEach((c) => t._register(c));
      return split;
    };
    const root = build(blob.root);
    t.setRoot(root);
    return t;
  }
};

// src/tiling/desktops.js
var DEFAULT_PANEL_STATE = {
  left: true,
  right: true,
  bottom: true
};
function _makeDesktop(label, seed, panelDefaults = DEFAULT_PANEL_STATE) {
  const tree = new TileTree();
  tree.setRoot(makeLeaf(seed()));
  return {
    id: `desk-${Math.random().toString(36).slice(2, 8)}`,
    label,
    tree,
    windows: [],
    // Boot default: whatever the embedder asked for, left + right + bottom
    // when it asked for nothing. Names are assigned by wm._canonicalize via
    // PANEL_TITLES.
    panels: { ...panelDefaults }
  };
}
var DesktopManager = class _DesktopManager {
  /**
   * @param {object}   opts
   * @param {function} opts.seed           builds the root leaf. Required.
   * @param {object}  [opts.panelDefaults] C14. Which panel tiles a fresh
   *   desktop opens with, merged over `DEFAULT_PANEL_STATE`. Omitted, every
   *   desktop opens with all three — today's behaviour, unchanged.
   */
  constructor({ seed, panelDefaults = null } = {}) {
    if (typeof seed !== "function") {
      throw new Error("DesktopManager: a `seed` function is required (the taxonomy root leaf)");
    }
    this.seed = seed;
    this.panelDefaults = { ...DEFAULT_PANEL_STATE, ...panelDefaults || {} };
    this.desktops = [_makeDesktop("1", seed, this.panelDefaults)];
    this.activeIdx = 0;
  }
  active() {
    return this.desktops[this.activeIdx];
  }
  switchTo(idx) {
    if (idx < 0 || idx >= this.desktops.length) return false;
    if (idx === this.activeIdx) return false;
    this.activeIdx = idx;
    return true;
  }
  ensureCount(n) {
    while (this.desktops.length < n) {
      this.desktops.push(_makeDesktop(
        String(this.desktops.length + 1),
        this.seed,
        this.panelDefaults
      ));
    }
  }
  addDesktop(label = null) {
    const d = _makeDesktop(
      label || String(this.desktops.length + 1),
      this.seed,
      this.panelDefaults
    );
    this.desktops.push(d);
    return d;
  }
  serialize() {
    return {
      activeIdx: this.activeIdx,
      desktops: this.desktops.map((d) => ({
        id: d.id,
        label: d.label,
        tree: d.tree.serialize(),
        panels: { ...d.panels }
        // windows serialized at WM level since we don't own
        // managed-window state in this module.
      }))
    };
  }
  static deserialize(blob, { seed, panelDefaults = null } = {}) {
    const m = new _DesktopManager({ seed, panelDefaults });
    if (!blob || !Array.isArray(blob.desktops) || blob.desktops.length === 0) return m;
    m.desktops = blob.desktops.map((raw) => ({
      id: raw.id || `desk-${Math.random().toString(36).slice(2, 8)}`,
      label: raw.label || "?",
      tree: raw.tree ? TileTree.deserialize(raw.tree) : new TileTree(),
      windows: [],
      // A RESTORED desktop's own answer wins over the default: the user
      // closed that panel, and re-opening it on every reload is the bug
      // this merge order avoids. The default only fills a key the stored
      // blob predates.
      panels: { ...m.panelDefaults, ...raw.panels || {} }
    }));
    for (const d of m.desktops) {
      if (!d.tree.rootId) d.tree.setRoot(makeLeaf(seed()));
    }
    m.activeIdx = Math.min(Math.max(0, blob.activeIdx | 0), m.desktops.length - 1);
    return m;
  }
};
var DESKTOPS_KEY = "desktops";
async function loadDesktops(state) {
  if (!state) return null;
  try {
    return await state.read(DESKTOPS_KEY);
  } catch (err) {
    console.warn("[desktops] load failed", err);
    return null;
  }
}
async function saveDesktops(state, blob) {
  if (!state) return false;
  try {
    await state.write(DESKTOPS_KEY, blob);
    return true;
  } catch (err) {
    console.warn("[desktops] save failed", err);
    return false;
  }
}

// src/tiling/entity_sources.js
function createEntityCatalog({ sources, aliases = {}, aggregate = null } = {}) {
  if (!Array.isArray(sources)) {
    throw new TypeError("createEntityCatalog: `sources` must be an array");
  }
  for (const s of sources) {
    if (!s?.navKind || typeof s.list !== "function" || typeof s.shape !== "function") {
      throw new TypeError(
        `createEntityCatalog: source '${s?.navKind ?? "?"}' needs navKind + list() + shape()`
      );
    }
  }
  if (aggregate != null && typeof aggregate !== "function") {
    throw new TypeError("createEntityCatalog: `aggregate` must be a function when present");
  }
  const _sources = Object.freeze(sources.map((s) => Object.freeze({ ...s })));
  const _byKind = new Map(_sources.map((s) => [s.navKind, s]));
  const _aliases = Object.freeze({ ...aliases });
  const get = (navKind) => _byKind.get(navKind) || null;
  const _extract = (src, raw) => {
    const list = src.pluck ? src.pluck(raw) : Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return Array.isArray(list) ? list : [];
  };
  const shapeRows = (navKind, rows) => {
    const src = _byKind.get(navKind);
    if (!src || !Array.isArray(rows)) return [];
    const out = [];
    for (const row of rows) {
      let shaped;
      try {
        shaped = src.shape(row);
      } catch (err) {
        console.warn("[entity-catalog]", navKind, "shape failed", err, row);
        continue;
      }
      if (!shaped || !shaped.id) continue;
      out.push(shaped);
    }
    return out;
  };
  const loadOne = async (navKind, api) => {
    const src = _byKind.get(navKind);
    if (!src || !api) return [];
    try {
      return _extract(src, await src.list(api));
    } catch (err) {
      console.warn("[entity-catalog]", navKind, "fetch failed", err);
      return [];
    }
  };
  const loadGrouped = async (api) => {
    const out = {};
    for (const s of _sources) out[s.navKind] = [];
    if (!api) return out;
    let bulk = null;
    if (aggregate) {
      try {
        bulk = await aggregate(api);
      } catch (err) {
        console.warn("[entity-catalog] aggregate failed, falling back to fan-out", err);
      }
      if (bulk && typeof bulk !== "object") bulk = null;
    }
    const missing = [];
    for (const src of _sources) {
      const raw = bulk ? bulk[src.navKind] : void 0;
      if (raw == null) {
        missing.push(src);
        continue;
      }
      out[src.navKind] = _extract(src, raw);
    }
    if (missing.length === 0) return out;
    await Promise.all(missing.map(async (src) => {
      out[src.navKind] = await loadOne(src.navKind, api);
    }));
    return out;
  };
  const loadAll = async (api) => {
    const grouped = await loadGrouped(api);
    const out = [];
    for (const src of _sources) {
      for (const shaped of shapeRows(src.navKind, grouped[src.navKind] || [])) {
        out.push({ kind: src.navKind, ...shaped });
      }
    }
    return out;
  };
  const resolveTypePrefix = (prefix) => {
    const p = String(prefix || "").toLowerCase().trim();
    if (!p) return null;
    if (_aliases[p]) return _aliases[p];
    for (const src of _sources) {
      if (src.navKind === p) return [src.navKind];
      if (src.navKind.replace(/-/g, "_") === p) return [src.navKind];
    }
    return null;
  };
  return Object.freeze({
    sources: _sources,
    get,
    loadOne,
    loadGrouped,
    loadAll,
    shapeRows,
    resolveTypePrefix
  });
}

// src/tiling/keymap.js
function installKeymap({ wm, palette, ...opts } = {}) {
  const onKeyDown = (e) => {
    const inField = e.target?.closest?.(
      'input, textarea, select, [contenteditable="true"]'
    );
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey) {
      e.preventDefault();
      palette.toggle();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === "Tab") {
      e.preventDefault();
      wm.cycleFocusedTab(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Escape") {
      if (palette.isOpen()) {
        palette.close();
        return;
      }
    }
    if (e.key === "Backspace" && !inField && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      wm.navigateBack?.();
      return;
    }
    const fMatch = /^F([1-9]|1[0-2])$/.exec(e.key);
    if (fMatch && !inField && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const btns = document.querySelectorAll(
        opts.navSelector || ".twm-global-top-bar .twm-bar-center.twm-top-nav .twm-top-nav__btn"
      );
      const idx = Number(fMatch[1]) - 1;
      if (idx < btns.length) {
        e.preventDefault();
        btns[idx].click();
        return;
      }
    }
    if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !inField && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const tabs = [...document.querySelectorAll(".twm-bp__tabs .twm-bp__tab")];
      if (tabs.length) {
        const cur = tabs.findIndex((t) => t.classList.contains("twm-bp__tab--on"));
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = ((cur < 0 ? 0 : cur) + dir + tabs.length) % tabs.length;
        e.preventDefault();
        tabs[next].click();
        return;
      }
    }
    if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !inField && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      wm.cycleDesktop(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (!e.altKey) return;
    const key = e.key.toLowerCase();
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const idx = Number(e.key) - 1;
      if (e.shiftKey) wm.moveFocusedToDesktop(idx);
      else wm.switchDesktop(idx);
      return;
    }
    switch (key) {
      // Plain Alt+H/V split into an empty pane; with Shift they open
      // the focused tile's own content in the new split.
      case "h":
        e.preventDefault();
        e.shiftKey ? wm.splitFocusedWith("h") : wm.split("h");
        return;
      case "v":
        e.preventDefault();
        e.shiftKey ? wm.splitFocusedWith("v") : wm.split("v");
        return;
      case "t":
        e.preventDefault();
        wm.openFocusedInTab();
        return;
      case "n":
        e.preventDefault();
        wm.openFocusedInWindow();
        return;
      case "w":
        e.preventDefault();
        wm.closeFocused();
        return;
      case "f":
        e.preventDefault();
        wm.toggleManagedFocused();
        return;
      case "arrowleft":
        e.preventDefault();
        e.shiftKey ? wm.moveFocused("left") : wm.focusDir("left");
        return;
      case "arrowright":
        e.preventDefault();
        e.shiftKey ? wm.moveFocused("right") : wm.focusDir("right");
        return;
      case "arrowup":
        e.preventDefault();
        e.shiftKey ? wm.moveFocused("up") : wm.focusDir("up");
        return;
      case "arrowdown":
        e.preventDefault();
        e.shiftKey ? wm.moveFocused("down") : wm.focusDir("down");
        return;
    }
    if (key.length === 1 && /[a-z]/.test(key) && !inField) {
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}

// src/tiling/kind_taxonomy.js
function createTaxonomy({ kinds, root } = {}) {
  if (!kinds || typeof kinds !== "object") {
    throw new TypeError("createTaxonomy: `kinds` must be an object of KindDefs");
  }
  if (!root || !kinds[root]) {
    throw new Error(`createTaxonomy: root kind '${root}' is not in the taxonomy`);
  }
  for (const [kind, def] of Object.entries(kinds)) {
    if (!def || typeof def !== "object") {
      throw new TypeError(`createTaxonomy: '${kind}' is not a KindDef`);
    }
    if (def.topNav && !kinds[def.topNav]) {
      throw new Error(
        `createTaxonomy: '${kind}' hangs off unknown topNav '${def.topNav}'`
      );
    }
    if (def.isTopNav && def.topNav) {
      throw new Error(
        `createTaxonomy: '${kind}' is both a top-nav kind and owned by one`
      );
    }
  }
  const _kinds = Object.freeze({ ...kinds });
  const meta = (kind) => _kinds[kind];
  const topNavFor = (kind) => {
    const m = _kinds[kind];
    if (!m) return void 0;
    return m.isTopNav ? kind : m.topNav;
  };
  const parentKindFor = (kind) => {
    if (kind === root) return null;
    const m = _kinds[kind];
    if (!m) return null;
    if (m.isTopNav) return root;
    return m.topNav || root;
  };
  const ancestors = (kind, props) => {
    const fn = _kinds[kind]?.ancestors;
    if (typeof fn !== "function") return [];
    let out;
    try {
      out = fn(props || {});
    } catch (err) {
      console.warn("[taxonomy] ancestors() threw for", kind, err);
      return [];
    }
    if (!Array.isArray(out)) return [];
    return out.filter((a) => a && a.kind).map((a) => ({ kind: a.kind, props: { id: a.id, label: a.label ?? a.id } }));
  };
  const parentOf = (kind, props) => {
    const chain = ancestors(kind, props);
    return chain.length ? chain[chain.length - 1] : null;
  };
  const labelOf = (kind, props) => {
    const fn = _kinds[kind]?.labelOf;
    if (typeof fn === "function") {
      try {
        const s = fn(props || {});
        if (s) return String(s);
      } catch (err) {
        console.warn("[taxonomy] labelOf() threw for", kind, err);
      }
    }
    if (props?.label) return String(props.label);
    return props?.id != null ? String(props.id) : "";
  };
  const sourcesFor = (kind) => {
    const s = _kinds[kind]?.sources ?? _kinds[root]?.sources;
    return Array.isArray(s) ? s : [];
  };
  const topNavEntries = () => Object.entries(_kinds).filter(([, m]) => m.isTopNav).sort((a, b) => (a[1].order ?? 1e3) - (b[1].order ?? 1e3)).map(([kind, m]) => ({
    kind,
    label: m.shortLabel || m.label,
    longLabel: m.label,
    icon: m.icon
  }));
  return Object.freeze({
    root,
    kinds: _kinds,
    meta,
    topNavFor,
    parentKindFor,
    ancestors,
    parentOf,
    labelOf,
    sourcesFor,
    topNavEntries
  });
}

// src/tiling/panel_keys.js
var _router = null;
function installPanelKeyRouter(wm) {
  if (_router) _router.destroy();
  _router = new PanelKeyRouter(wm);
  return _router;
}
function getPanelKeyRouter() {
  return _router;
}
function uninstallPanelKeyRouter() {
  _router?.destroy();
  _router = null;
}
function registerPanelKeys(hostEl, handler) {
  if (!hostEl || typeof handler !== "function") return () => {
  };
  if (_router) return _router.register(hostEl, handler);
  return _legacyRegister(hostEl, handler);
}
var PanelKeyRouter = class {
  constructor(wm) {
    this._wm = wm;
    this._entries = [];
    this._onKey = this._dispatch.bind(this);
    document.addEventListener("keydown", this._onKey);
  }
  register(hostEl, handler) {
    const entry = { hostEl, handler };
    this._entries.push(entry);
    return () => {
      const i = this._entries.indexOf(entry);
      if (i >= 0) this._entries.splice(i, 1);
    };
  }
  destroy() {
    document.removeEventListener("keydown", this._onKey);
    this._entries.length = 0;
  }
  /** Is `hostEl` the panel that should receive keys right now? */
  _isActiveTarget(hostEl) {
    if (!hostEl?.isConnected) return false;
    const leaf = hostEl.closest?.(".twm-leaf");
    if (leaf) {
      return leaf === this._wm?.focusedLeafEl?.();
    }
    return hostEl.contains(document.activeElement) || document.activeElement === document.body;
  }
  _dispatch(ev) {
    for (const entry of [...this._entries]) {
      if (!this._isActiveTarget(entry.hostEl)) continue;
      try {
        entry.handler(ev);
      } catch (err) {
        console.warn("[panel-keys] handler threw", err);
      }
      if (ev.defaultPrevented) return;
    }
  }
};
function _legacyRegister(hostEl, handler) {
  const wrapped = (ev) => {
    if (!hostEl.isConnected) return;
    if (!hostEl.contains(document.activeElement) && document.activeElement !== document.body) return;
    handler(ev);
  };
  document.addEventListener("keydown", wrapped);
  return () => document.removeEventListener("keydown", wrapped);
}

// src/tiling/landing_table.js
function attachLandingTableBehavior(host, getRow, entityActions, options = {}) {
  if (!host) return () => {
  };
  const dispatch = (action, row) => {
    if (!row) return;
    const fn = action === "open-tab" ? entityActions.openInTab : action === "open-window" ? entityActions.openInWindow : entityActions[action];
    try {
      fn?.(row);
    } catch (e) {
      console.warn(`[landing] action "${action}" failed`, e);
    }
  };
  const bodyRowFor = (ev) => {
    const tr = ev.target.closest("tr");
    if (!tr || !tr.closest("tbody")) return null;
    const wrap = tr.closest(".twm-preview-table-wrap");
    if (!wrap || !host.contains(wrap)) return null;
    return tr;
  };
  const onClick = (ev) => {
    const actionBtn = ev.target.closest("[data-twm-action]");
    if (actionBtn && host.contains(actionBtn)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const tr2 = actionBtn.closest("tr");
      dispatch(actionBtn.dataset.twmAction, tr2 ? getRow(tr2.__rowIndex) : null);
      return;
    }
    if (ev.target.closest("button, a, input, select, textarea")) return;
    const tr = bodyRowFor(ev);
    if (tr) dispatch("open", getRow(tr.__rowIndex));
  };
  const defaultMenu = (row) => {
    const items = [];
    if (entityActions.open) {
      items.push({ label: "Open", icon: "open_in_new", action: "open" });
      if (entityActions.openInTab) {
        items.push({ label: "Open in new tab", icon: "tab", action: "open-tab" });
      }
      if (entityActions.openInWindow) {
        items.push({
          label: "Open in new window",
          icon: "open_in_full",
          action: "open-window"
        });
      }
    }
    if (entityActions.edit) items.push({ label: "Rename / edit", icon: "edit", action: "edit" });
    if (entityActions.delete) {
      if (items.length) items.push({ separator: true });
      items.push({ label: "Delete", icon: "delete", action: "delete", danger: true });
    }
    return items;
  };
  const buildMenu = typeof options.buildMenu === "function" ? options.buildMenu : defaultMenu;
  const onContextMenu = (ev) => {
    const tr = bodyRowFor(ev);
    if (!tr) return;
    ev.preventDefault();
    ev.stopPropagation();
    const row = getRow(tr.__rowIndex);
    if (!row) return;
    const items = buildMenu(row) || [];
    if (items.length === 0) return;
    showContextMenu(ev.clientX, ev.clientY, items, (action) => dispatch(action, row));
  };
  host.addEventListener("click", onClick);
  host.addEventListener("contextmenu", onContextMenu, true);
  return () => {
    host.removeEventListener("click", onClick);
    host.removeEventListener("contextmenu", onContextMenu, true);
  };
}
function wireLandingPaneFocus(hostEl) {
  const panes = Array.from(hostEl.querySelectorAll(".twm-landing__pane"));
  if (panes.length === 0) return { focus: () => {
  }, panes };
  let focused = panes[0];
  const reflect = () => {
    for (const p of panes) {
      p.classList.toggle("twm-landing__pane--focused", p === focused);
    }
  };
  reflect();
  for (const p of panes) {
    p.addEventListener("mousedown", () => {
      if (focused === p) return;
      focused = p;
      reflect();
    });
  }
  return {
    focus: (pane) => {
      if (pane && panes.includes(pane)) {
        focused = pane;
        reflect();
      }
    },
    panes
  };
}
function attachLandingKeyboardNav(host, getRows, onActivate, options = {}) {
  if (!host) return { teardown: () => {
  }, refresh: () => {
  }, focusFirst: () => {
  } };
  let cursor = 0;
  const tbody = () => host.querySelector("tbody");
  const repaintCursor = () => {
    const tb = tbody();
    if (!tb) return;
    const rows = getRows() || [];
    if (rows.length === 0) {
      cursor = 0;
      return;
    }
    if (cursor >= rows.length) cursor = rows.length - 1;
    if (cursor < 0) cursor = 0;
    let active = null;
    tb.querySelectorAll("tr").forEach((tr) => {
      const on = tr.__rowIndex === cursor;
      tr.classList.toggle("twm-row-cursor", on);
      if (on) active = tr;
    });
    if (active) active.scrollIntoView({ block: "nearest" });
  };
  const move = (delta) => {
    const rows = getRows() || [];
    if (rows.length === 0) return;
    cursor = Math.max(0, Math.min(rows.length - 1, cursor + delta));
    repaintCursor();
  };
  const open = () => {
    const rows = getRows() || [];
    const row = rows[cursor];
    if (row) onActivate(row);
  };
  const onKey = (ev) => {
    if (!host.isConnected) return;
    const t = ev.target;
    const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (editable) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      move(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      move(-1);
    } else if (ev.key === "Home") {
      ev.preventDefault();
      cursor = 0;
      repaintCursor();
    } else if (ev.key === "End") {
      ev.preventDefault();
      const rows = getRows() || [];
      cursor = Math.max(0, rows.length - 1);
      repaintCursor();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      open();
    } else if (options.activateKey && ev.key === options.activateKey && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      open();
    }
  };
  const offKey = registerPanelKeys(host, onKey);
  setTimeout(repaintCursor, 0);
  return {
    teardown: () => offKey(),
    refresh: () => repaintCursor(),
    focusFirst: () => {
      cursor = 0;
      repaintCursor();
    }
  };
}
function attachLandingShell(hostEl, { panes, initialPane = 0 } = {}) {
  if (!hostEl || !Array.isArray(panes) || panes.length === 0) {
    return { teardown: () => {
    }, refresh: () => {
    }, focusPane: () => {
    } };
  }
  const state = panes.map((spec) => ({
    spec,
    paneEl: spec.paneEl,
    tableHost: spec.tableHost || spec.paneEl?.querySelector(".twm-landing__table") || spec.paneEl,
    cursor: 0
  }));
  let focusedIdx = Math.max(0, Math.min(panes.length - 1, initialPane));
  const reflectPaneFocus = () => {
    state.forEach((s, i) => {
      s.paneEl?.classList.toggle(
        "twm-landing__pane--focused",
        i === focusedIdx
      );
    });
  };
  const repaintCursor = (idx = focusedIdx) => {
    const s = state[idx];
    if (!s) return;
    const tbody = s.tableHost?.querySelector("tbody");
    if (!tbody) return;
    const rows = s.spec.getRows?.() || [];
    if (rows.length === 0) {
      s.cursor = 0;
      return;
    }
    if (s.cursor >= rows.length) s.cursor = rows.length - 1;
    if (s.cursor < 0) s.cursor = 0;
    let active = null;
    tbody.querySelectorAll("tr").forEach((tr) => {
      const on = tr.__rowIndex === s.cursor;
      tr.classList.toggle("twm-row-cursor", on);
      if (on) active = tr;
    });
    if (active && idx === focusedIdx) {
      active.scrollIntoView({ block: "nearest" });
    }
  };
  const move = (delta) => {
    const s = state[focusedIdx];
    if (!s) return;
    const rows = s.spec.getRows?.() || [];
    if (rows.length === 0) return;
    s.cursor = Math.max(0, Math.min(rows.length - 1, s.cursor + delta));
    repaintCursor();
  };
  const jump = (toEnd) => {
    const s = state[focusedIdx];
    if (!s) return;
    const rows = s.spec.getRows?.() || [];
    s.cursor = toEnd ? Math.max(0, rows.length - 1) : 0;
    repaintCursor();
  };
  const currentRow = () => {
    const s = state[focusedIdx];
    if (!s) return null;
    const rows = s.spec.getRows?.() || [];
    return rows[s.cursor] ?? null;
  };
  const activate = () => {
    const row = currentRow();
    if (!row) return;
    try {
      state[focusedIdx].spec.onActivate?.(row);
    } catch (err) {
      console.warn("[landing-shell] activate failed", err);
    }
  };
  const activateInTab = () => {
    const row = currentRow();
    if (!row) return;
    const spec = state[focusedIdx].spec;
    const fn = spec.onActivateInTab || spec.onActivate;
    try {
      fn?.(row);
    } catch (err) {
      console.warn("[landing-shell] activate-tab failed", err);
    }
  };
  const activateInWindow = () => {
    const row = currentRow();
    if (!row) return;
    const spec = state[focusedIdx].spec;
    const fn = spec.onActivateInWindow || spec.onActivate;
    try {
      fn?.(row);
    } catch (err) {
      console.warn("[landing-shell] activate-window failed", err);
    }
  };
  const expandToggle = (expand) => {
    const s = state[focusedIdx];
    if (!s?.spec.onExpandToggle) return false;
    const row = currentRow();
    if (!row) return false;
    if (s.spec.isExpandable && !s.spec.isExpandable(row)) return false;
    const currentlyExpanded = s.spec.isExpanded ? !!s.spec.isExpanded(row) : false;
    if (expand === currentlyExpanded) return false;
    try {
      s.spec.onExpandToggle(row, expand);
    } catch (err) {
      console.warn("[landing-shell] expand failed", err);
    }
    return true;
  };
  const focusPane = (idx) => {
    if (idx < 0 || idx >= state.length) return;
    if (idx === focusedIdx) return;
    focusedIdx = idx;
    reflectPaneFocus();
    repaintCursor();
  };
  const cyclePane = (dir) => {
    if (state.length < 2) return;
    focusPane((focusedIdx + dir + state.length) % state.length);
  };
  const onMouseDown = (ev) => {
    const paneEl = ev.target.closest?.(".twm-landing__pane");
    if (!paneEl) return;
    const idx = state.findIndex((s) => s.paneEl === paneEl);
    if (idx < 0 || idx === focusedIdx) return;
    focusedIdx = idx;
    reflectPaneFocus();
    repaintCursor();
  };
  const onKey = (ev) => {
    if (!hostEl.isConnected) return;
    const t = ev.target;
    const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (editable) return;
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && !ev.altKey) {
      ev.preventDefault();
      activateInTab();
      return;
    }
    if (ev.key === "Enter" && ev.shiftKey && !ev.altKey && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault();
      activateInWindow();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        ev.preventDefault();
        move(-1);
        return;
      case "Home":
        ev.preventDefault();
        jump(false);
        return;
      case "End":
        ev.preventDefault();
        jump(true);
        return;
      case "Enter":
        ev.preventDefault();
        activate();
        return;
      case "Tab":
        ev.preventDefault();
        cyclePane(ev.shiftKey ? -1 : 1);
        return;
      case "ArrowRight":
        if (expandToggle(true)) ev.preventDefault();
        return;
      case "ArrowLeft":
        if (expandToggle(false)) ev.preventDefault();
        return;
    }
  };
  hostEl.addEventListener("mousedown", onMouseDown);
  const offKey = registerPanelKeys(hostEl, onKey);
  reflectPaneFocus();
  setTimeout(() => state.forEach((_, i) => repaintCursor(i)), 0);
  const parkFocusIfActive = () => {
    const leaf = hostEl.closest?.(".twm-leaf");
    const inTile = !!leaf;
    if (inTile && !leaf.classList.contains("twm-leaf--focused")) return;
    if (hostEl.contains(document.activeElement)) return;
    if (hostEl.tabIndex == null || hostEl.tabIndex < -1) hostEl.tabIndex = -1;
    try {
      hostEl.focus({ preventScroll: true });
    } catch {
    }
  };
  parkFocusIfActive();
  requestAnimationFrame(parkFocusIfActive);
  return {
    teardown: () => {
      hostEl.removeEventListener("mousedown", onMouseDown);
      offKey();
    },
    refresh: () => state.forEach((_, i) => repaintCursor(i)),
    focusPane,
    currentRow
  };
}
function mountLandingShell(hostEl, opts) {
  const {
    title = "",
    stats = [],
    pane = { key: "rows", title: "", hint: "" }
  } = opts || {};
  const paneKey = String(pane.key || "rows");
  const _esc8 = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
  const statsHtml = (stats || []).map((s) => `
        <span class="twm-landing__stat twm-entity-header__field">
            <span>${_esc8(s.label || "")}</span>
            <strong data-role="${_esc8(s.key)}">${_esc8(s.initial != null ? s.initial : 0)}</strong>
        </span>
    `).join("");
  hostEl.classList.add("twm-landing");
  hostEl.innerHTML = `
        <header class="twm-entity-header">
            <h2>${_esc8(title)}</h2>
            ${statsHtml}
            <span class="twm-entity-header__spacer"></span>
        </header>
        <div class="twm-landing__split twm-landing__split--single">
            <section class="twm-landing__pane" data-pane="${_esc8(paneKey)}">
                <div class="twm-landing__pane-head">
                    <span class="twm-landing__pane-title">${_esc8(pane.title || "")}</span>
                    <span class="twm-landing__pane-hint">${_esc8(pane.hint || "")}</span>
                </div>
                <div class="twm-landing__table" data-role="${_esc8(paneKey)}-host"></div>
            </section>
        </div>
        <footer class="twm-landing__actions" data-role="actions"></footer>
    `;
  const headerEl = hostEl.querySelector(".twm-entity-header");
  const paneEl = hostEl.querySelector(`[data-pane="${paneKey}"]`);
  const tableHost = hostEl.querySelector(`[data-role="${paneKey}-host"]`);
  const footerEl = hostEl.querySelector('[data-role="actions"]');
  const setStat = (key, value) => {
    const el = hostEl.querySelector(`[data-role="${key}"]`);
    if (el) el.textContent = String(value);
  };
  return { headerEl, paneEl, tableHost, footerEl, setStat };
}
function mountLandingActions(footerEl, actions, hostEl) {
  if (!footerEl) return { teardown: () => {
  }, refresh: () => {
  } };
  let current = [];
  const renderInto = (list) => {
    current = (list || []).filter(Boolean);
    footerEl.innerHTML = "";
    for (const a of current) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "twm-action-btn";
      if (a.id) btn.dataset.action = a.id;
      if (a.title) btn.title = a.title;
      const icon = a.icon ? `<span class="material-symbols-outlined">${_esc3(a.icon)}</span>` : "";
      const sc = a.shortcut ? ` <span class="twm-action-btn__kbd">[${_esc3(a.shortcut.toUpperCase())}]</span>` : "";
      btn.innerHTML = `${icon}<span>${_esc3(a.label || "")}</span>${sc}`;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        try {
          a.onClick?.(ev);
        } catch (err) {
          console.warn("[landing-actions] click failed", err);
        }
      });
      footerEl.appendChild(btn);
    }
  };
  const onKey = (ev) => {
    if (!footerEl.isConnected) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (editable) return;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const hit = current.find((a) => a.shortcut && String(a.shortcut).toLowerCase() === k);
    if (!hit) return;
    ev.preventDefault();
    try {
      hit.onClick?.(ev);
    } catch (err) {
      console.warn("[landing-actions] shortcut failed", err);
    }
  };
  renderInto(actions);
  const scopeEl = hostEl || footerEl.closest(".twm-landing") || footerEl;
  const offKey = registerPanelKeys(scopeEl, onKey);
  return {
    teardown: () => offKey(),
    refresh: renderInto
  };
}
function actionsCellRenderer(actionsColIdx, options = { edit: true, delete: true }) {
  return (td, _value, colIdx) => {
    if (colIdx !== actionsColIdx) return false;
    const parts = [];
    if (options.edit) {
      parts.push(`<button type="button" class="twm-row-action"
                                  data-twm-action="edit"
                                  title="Edit"
                                  aria-label="Edit">
                          <span class="material-symbols-outlined">edit</span>
                        </button>`);
    }
    if (options.delete) {
      parts.push(`<button type="button" class="twm-row-action twm-row-action--danger"
                                  data-twm-action="delete"
                                  title="Delete"
                                  aria-label="Delete">
                          <span class="material-symbols-outlined">delete</span>
                        </button>`);
    }
    td.classList.add("twm-row-actions-cell");
    td.innerHTML = parts.join("");
    return true;
  };
}
function _esc3(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// src/tiling/loading_overlay.js
function makeLoadingOverlay(slot, { delay = 80 } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "twm-tile-loading twm-tile-loading--pending";
  overlay.innerHTML = '<div class="twm-tile-loading__spinner" aria-label="Loading"></div>';
  slot.appendChild(overlay);
  const showTimer = setTimeout(() => {
    overlay.classList.remove("twm-tile-loading--pending");
  }, delay);
  return () => {
    clearTimeout(showTimer);
    overlay.remove();
  };
}

// src/tiling/nav_panel.js
function mountNavPanel(hostEl, {
  modes = [],
  wm = null,
  eventBus = null,
  filterPlaceholder = "Filter\u2026"
} = {}) {
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new Error("mountNavPanel: at least one mode is required");
  }
  hostEl.classList.add("twm-nav");
  hostEl.innerHTML = `
        <div class="twm-nav__modes" data-role="modes"></div>
        <div class="twm-sidebar-controls twm-nav__filter">
            <span class="material-symbols-outlined twm-sidebar-search-icon">search</span>
            <input class="twm-data-page__search twm-nav__filter-input"
                   type="search" placeholder="${_esc4(filterPlaceholder)}"
                   autocomplete="off" />
        </div>
        <div class="twm-nav__body" data-role="body"></div>
    `;
  const modesEl = hostEl.querySelector('[data-role="modes"]');
  const bodyEl = hostEl.querySelector('[data-role="body"]');
  const filterEl = hostEl.querySelector(".twm-nav__filter-input");
  modesEl.innerHTML = modes.map((m) => `
        <button class="twm-nav__mode twm-has-tooltip" data-mode="${_esc4(m.id)}"
                data-tooltip="${_esc4(m.label)}">
            <span class="material-symbols-outlined">${_esc4(m.icon)}</span>
            <span>${_esc4(m.label)}</span>
        </button>
    `).join("");
  const byId = new Map(modes.map((m) => [m.id, m]));
  const hosts = {};
  const panes = {};
  const filterByMode = Object.fromEntries(modes.map((m) => [m.id, ""]));
  let mode = modes[0].id;
  const ensureHost = (id) => {
    if (hosts[id]) return hosts[id];
    const el = document.createElement("div");
    el.className = `twm-nav__pane twm-nav__pane--${id}`;
    el.style.display = "none";
    bodyEl.appendChild(el);
    hosts[id] = el;
    return el;
  };
  const activate = async (next) => {
    const def = byId.get(next);
    if (!def) return;
    mode = next;
    for (const m of modes) {
      ensureHost(m.id).style.display = m.id === next ? "flex" : "none";
    }
    modesEl.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("twm-nav__mode--on", b.dataset.mode === next));
    filterEl.value = filterByMode[next] || "";
    const paneEl = ensureHost(next);
    if (!panes[next]) {
      try {
        panes[next] = def.mount(paneEl, { wm, eventBus }) || {};
      } catch (err) {
        console.error("[nav] mode mount failed", next, err);
        panes[next] = {};
      }
    }
    try {
      await panes[next].activate?.();
    } catch (err) {
      console.error("[nav] mode activate failed", next, err);
    }
    _applyFilter();
  };
  const _applyFilter = () => {
    const q = filterByMode[mode] || "";
    try {
      panes[mode]?.filter?.(q);
    } catch (err) {
      console.warn("[nav] filter failed", mode, err);
    }
  };
  filterEl.addEventListener("input", () => {
    filterByMode[mode] = filterEl.value;
    _applyFilter();
  });
  modesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (btn) activate(btn.dataset.mode);
  });
  activate(mode);
  return {
    refresh: () => activate(mode),
    destroy: () => {
      for (const p of Object.values(panes)) {
        try {
          p?.destroy?.();
        } catch {
        }
      }
    }
  };
}
function _esc4(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// src/tiling/tile_breadcrumb.js
function mountTileBreadcrumb(kind, props, ctx) {
  const eventBus = ctx?.eventBus;
  const taxonomy = ctx?.taxonomy;
  const rootCrumb = ctx?.rootCrumb || null;
  if (!taxonomy) {
    console.error("[breadcrumb] no taxonomy in ctx \u2014 cannot render");
    return { el: document.createElement("nav"), destroy: () => {
    } };
  }
  const root = document.createElement("nav");
  root.className = "twm-topbar-breadcrumb twm-tile-breadcrumb";
  root.setAttribute("aria-label", "Tile breadcrumb");
  const getWm = () => ctx?.wm || window.__twm?.wm || null;
  const navigate = (k, p = {}) => {
    const wm = getWm();
    if (!wm) {
      console.error("[breadcrumb] no WM available \u2014 click ignored", k);
      return;
    }
    if (typeof wm.navigate === "function") {
      wm.navigate(k, p, { ctx, dest: "origin" });
    } else if (typeof wm.openInPrimary === "function") {
      wm.openInPrimary(k, p);
    } else {
      console.error("[breadcrumb] WM has no navigate/openInPrimary");
    }
  };
  let rootLabel = rootCrumb?.label || "";
  const trailOf = () => {
    if (typeof ctx?.trailSegments !== "function") return [];
    try {
      return ctx.trailSegments() || [];
    } catch (err) {
      console.warn("[breadcrumb] trailSegments threw", err);
      return [];
    }
  };
  const render = () => {
    _renderInto(
      root,
      _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate, trailOf())
    );
  };
  render();
  let unsubscribe = null;
  if (typeof rootCrumb?.subscribe === "function") {
    try {
      unsubscribe = rootCrumb.subscribe((next) => {
        if (next?.label) rootLabel = next.label;
        render();
      }, { api: ctx?.api, host: ctx?.host, eventBus });
    } catch (err) {
      console.warn("[breadcrumb] rootCrumb.subscribe threw", err);
    }
  }
  return {
    el: root,
    /** Repaint. A trail-driven breadcrumb changes without the tile
     *  remounting — following a lookup replaces the active tab's content in
     *  place — so the embedder that grew the trail says when. */
    refresh: render,
    destroy: () => {
      try {
        unsubscribe?.();
      } catch (err) {
        console.warn("[breadcrumb] rootCrumb teardown threw", err);
      }
    }
  };
}
function _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate, trail) {
  const segs = [];
  const meta = taxonomy.meta(kind);
  if (meta?.appGlobal) {
    return [{ icon: meta.icon, label: meta.label, onClick: null }];
  }
  if (rootCrumb) {
    segs.push({
      icon: rootCrumb.icon,
      label: rootLabel || rootCrumb.label,
      onClick: () => navigate(rootCrumb.navKind ?? taxonomy.root)
    });
  }
  const topNav = taxonomy.topNavFor(kind);
  const topNavMeta = topNav ? taxonomy.meta(topNav) : null;
  if (topNav && topNav !== taxonomy.root && topNavMeta) {
    segs.push({
      icon: topNavMeta.icon,
      label: topNavMeta.label,
      onClick: () => navigate(topNav)
    });
  }
  for (const step of trail || []) {
    if (!step?.kind) continue;
    segs.push({
      icon: taxonomy.meta(step.kind)?.icon || "description",
      label: step.title || step.props?.label || step.props?.id || step.kind,
      onClick: () => navigate(step.kind, step.props || {})
    });
  }
  for (const anc of taxonomy.ancestors(kind, props)) {
    segs.push({
      icon: taxonomy.meta(anc.kind)?.icon || "description",
      label: anc.props.label ?? anc.props.id,
      onClick: () => navigate(anc.kind, anc.props)
    });
  }
  const hasEntity = !!props?.id;
  if (meta) {
    if (hasEntity) {
      segs.push({
        icon: meta.icon,
        label: taxonomy.labelOf(kind, props),
        onClick: null
      });
    } else if (kind !== topNav) {
      segs.push({
        icon: meta.icon,
        label: meta.label,
        onClick: null
      });
    }
  } else if (hasEntity) {
    segs.push({
      icon: "description",
      label: props.label || props.id,
      onClick: null
    });
  }
  return segs;
}
function _renderInto(container, segments) {
  container.innerHTML = "";
  if (!segments?.length) return;
  const ol = document.createElement("ol");
  ol.className = "twm-topbar-breadcrumb__list";
  segments.forEach((seg, i) => {
    const li = document.createElement("li");
    li.className = "twm-topbar-breadcrumb__item";
    const isLast = i === segments.length - 1;
    if (isLast || !seg.onClick) {
      li.classList.add("twm-topbar-breadcrumb__item--current");
      li.innerHTML = `
                <span class="material-symbols-outlined twm-topbar-breadcrumb__icon">${_esc5(seg.icon)}</span>
                <span class="twm-topbar-breadcrumb__current">${_esc5(seg.label)}</span>
            `;
    } else {
      const btn = document.createElement("button");
      btn.className = "twm-topbar-breadcrumb__link";
      btn.type = "button";
      btn.innerHTML = `
                <span class="material-symbols-outlined twm-topbar-breadcrumb__icon">${_esc5(seg.icon)}</span>
                <span>${_esc5(seg.label)}</span>
            `;
      btn.addEventListener("click", () => {
        btn.classList.add("twm-tile-breadcrumb__link--flash");
        setTimeout(() => {
          btn.classList.remove("twm-tile-breadcrumb__link--flash");
        }, 180);
        try {
          seg.onClick();
        } catch (e) {
          console.error("[breadcrumb] segment click threw", e);
        }
      });
      li.appendChild(btn);
      const sep = document.createElement("span");
      sep.className = "twm-topbar-breadcrumb__separator";
      sep.textContent = "\u203A";
      li.appendChild(sep);
    }
    ol.appendChild(li);
  });
  container.appendChild(ol);
}
function _esc5(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// src/tiling/page_factory.js
function createPageFactories({ eventBus = null, events = {}, refreshOn = {} } = {}) {
  const projectChanged = events?.projectChanged || null;
  const makeShim = (ctx) => ({
    // Route through openFromContext so navigation triggered from a
    // split tile / window stays in that container.
    openTab: ({ kind: k, entityId, label, icon, subTab }) => ctx.wm?.openFromContext(ctx, k, { id: entityId, label, icon, subTab }),
    // Open the same content as a NEW TAB in the current tile.
    openInTab: ({ kind: k, entityId, label, icon, subTab }) => ctx.wm?.openInTabFromContext(ctx, k, { id: entityId, label, icon, subTab }),
    // Open the same content in a fresh managed window.
    openInWindow: ({ kind: k, entityId, label, icon, subTab }) => ctx.wm?.navigate(k, { id: entityId, label, icon, subTab }, { ctx, dest: "window" }),
    // Persist editor sub-state into this tile's WM tab props.
    updateProps: (patch) => {
      try {
        ctx.wm?.updateActiveTabProps?.(ctx.leafId, patch);
      } catch (err) {
        console.warn("[shim] updateProps failed", err);
      }
    },
    // Close just THIS tab (not the whole tile); falls back to closing
    // the tile when it's the last tab. Also broadcasts so sidebars /
    // landings / nav refresh against the mutated project state.
    closeTab: (_id) => {
      if (projectChanged) {
        try {
          eventBus?.emit?.(projectChanged, { source: "twm-tab-close" });
        } catch {
        }
      }
      try {
        ctx.wm?.closeActiveTab?.(ctx.leafId);
      } catch (err) {
        console.warn("[shim] closeTab failed", err);
      }
    },
    // Non-closing mutations (Save/New/Rename) broadcast so listeners refresh.
    notifyChanged: (domain) => {
      if (!projectChanged) return;
      try {
        eventBus?.emit?.(
          projectChanged,
          { source: "tab-mutation", domain: domain || null }
        );
      } catch {
      }
    },
    registerProvider: () => {
    },
    getActiveTab: () => null
  });
  const mountTabBody = (factory, contentSlot, props, ctx) => {
    const shim = makeShim(ctx);
    const tab = factory(contentSlot, props?.id ?? props?.entityId ?? null, {
      logger: null,
      eventBus,
      workspaceTabs: shim,
      wm: ctx.wm,
      leafId: ctx.leafId,
      windowId: ctx.windowId
    });
    const hideLoading = makeLoadingOverlay(contentSlot);
    try {
      const ret = tab?.mount?.(props);
      if (ret && typeof ret.then === "function") {
        ret.then(hideLoading, (err) => {
          console.error("[page] mount failed", err);
          hideLoading();
        });
      } else {
        requestAnimationFrame(hideLoading);
      }
    } catch (err) {
      console.error("[page] mount failed", err);
      hideLoading();
    }
    const listeners = {};
    if (typeof tab?.refresh === "function" && eventBus?.on) {
      for (const [busEvent, reason] of Object.entries(refreshOn || {})) {
        const fn = () => {
          try {
            tab.refresh(reason);
          } catch (err) {
            console.warn("[page] refresh failed", busEvent, err);
          }
        };
        listeners[busEvent] = fn;
        eventBus.on(busEvent, fn);
      }
    }
    return () => {
      for (const [n, fn] of Object.entries(listeners)) {
        try {
          eventBus?.off?.(n, fn);
        } catch {
        }
      }
      try {
        tab?.dispose?.();
        tab?.unmount?.();
      } catch {
      }
    };
  };
  const tabFactory = (kind, factory) => (host, props, ctx) => {
    host.classList.add("twm-page-shell");
    host.innerHTML = "";
    const contentSlot = document.createElement("div");
    contentSlot.className = "twm-page-shell__content";
    contentSlot.tabIndex = -1;
    let crumb = null;
    if (!ctx?.windowId) {
      const breadcrumbSlot = document.createElement("div");
      breadcrumbSlot.className = "twm-page-shell__breadcrumb";
      host.appendChild(breadcrumbSlot);
      crumb = mountTileBreadcrumb(kind, props, { ...ctx, eventBus });
      breadcrumbSlot.appendChild(crumb.el);
    }
    host.appendChild(contentSlot);
    const teardown = mountTabBody(factory, contentSlot, props, ctx);
    return {
      destroy: () => {
        teardown();
        try {
          crumb?.destroy();
        } catch {
        }
      }
    };
  };
  const bareTabFactory = (kind, factory) => (host, props, ctx) => {
    host.classList.add("twm-page-shell");
    host.innerHTML = "";
    const contentSlot = document.createElement("div");
    contentSlot.className = "twm-page-shell__content";
    contentSlot.tabIndex = -1;
    host.appendChild(contentSlot);
    return { destroy: mountTabBody(factory, contentSlot, props, ctx) };
  };
  const stubPageFactory = (kind, render) => (host, props, ctx) => {
    host.classList.add("twm-page-shell");
    host.innerHTML = "";
    const breadcrumbSlot = document.createElement("div");
    breadcrumbSlot.className = "twm-page-shell__breadcrumb";
    const contentSlot = document.createElement("div");
    contentSlot.className = "twm-page-shell__content";
    contentSlot.tabIndex = -1;
    host.appendChild(breadcrumbSlot);
    host.appendChild(contentSlot);
    const crumb = mountTileBreadcrumb(kind, props, { ...ctx, eventBus });
    breadcrumbSlot.appendChild(crumb.el);
    const hideLoading = makeLoadingOverlay(contentSlot);
    const ret = render(contentSlot, props, ctx) || {};
    if (ret.ready && typeof ret.ready.then === "function") {
      ret.ready.then(hideLoading, hideLoading);
    } else {
      requestAnimationFrame(hideLoading);
    }
    return {
      title: ret.title,
      destroy: () => {
        try {
          crumb.destroy();
        } catch {
        }
        ret.destroy?.();
      }
    };
  };
  return Object.freeze({
    makeShim,
    mountTabBody,
    tabFactory,
    bareTabFactory,
    stubPageFactory
  });
}

// src/tiling/tile_renderer.js
var SPLITTER_PX = 4;
var TAB_LAYOUTS = ["bottom", "top"];
var DEFAULT_TAB_LAYOUT = "bottom";
function _normalizeTabLayout(value) {
  return TAB_LAYOUTS.includes(value) ? value : DEFAULT_TAB_LAYOUT;
}
function _tabKey(idx) {
  return `builtin://tab/${idx}`;
}
function _tabKeyIndex(key) {
  const n = Number(String(key ?? "").replace("builtin://tab/", ""));
  return Number.isInteger(n) && n >= 0 ? n : -1;
}
var TILE_LIFT_PX = 24;
var CHROME_NO_FLOAT = "button, .twm-leaf__tab";
function _isDownwardPull(down, sideways) {
  return down > 0 && sideways <= down;
}
var TILE_TAB_MIME = "application/x-twm-tile-tab";
function _isTileTabDrag(e) {
  try {
    return !!e.dataTransfer?.types?.includes(TILE_TAB_MIME);
  } catch {
    return false;
  }
}
var TileRenderer = class {
  /** C33. Readable from a consumer that holds only the renderer — the Tables
   *  drop suite drives real drag events and has to build a `dataTransfer`
   *  stub that this renderer will admit. */
  static get TAB_MIME() {
    return TILE_TAB_MIME;
  }
  constructor({
    root,
    tree,
    content,
    ctx,
    onFocusChange,
    onAfterRender,
    tabLayout = null
  }) {
    if (!content || typeof content.mount !== "function") {
      throw new Error("TileRenderer: a content registry is required");
    }
    this.root = root;
    this.tree = tree;
    this.content = content;
    this.ctx = ctx || {};
    this.onFocusChange = onFocusChange || (() => {
    });
    this.onAfterRender = onAfterRender || (() => {
    });
    this._leafCache = /* @__PURE__ */ new Map();
    this._drag = null;
    this._tabDrag = null;
    this._chromePull = null;
    this._tabDropProbe = null;
    this._tabDropPreviewEl = null;
    this.disposed = false;
    this.root.classList.add("twm-root");
    this.tabLayout = _normalizeTabLayout(
      this.root.dataset?.twmTabs ?? tabLayout ?? DEFAULT_TAB_LAYOUT
    );
    if (this.root.dataset) this.root.dataset.twmTabs = this.tabLayout;
    this._layoutObserver = typeof MutationObserver === "function" ? new MutationObserver(() => this.setTabLayout(this.root.dataset?.twmTabs)) : null;
    this._layoutObserver?.observe(
      this.root,
      { attributes: true, attributeFilter: ["data-twm-tabs"] }
    );
    this.root.addEventListener("mousedown", this._onMouseDown.bind(this));
    this.root.addEventListener("dragover", this._onTabDragOver.bind(this));
    this.root.addEventListener("drop", this._onTabDrop.bind(this));
    this.root.addEventListener("dragleave", this._onTabDragLeave.bind(this));
    this.root.addEventListener("dragend", this._onTabDragEnd.bind(this));
  }
  render() {
    if (this.disposed) return;
    const savedScrolls = /* @__PURE__ */ new Map();
    for (const [leafId, entry] of this._leafCache.entries()) {
      const snap = [];
      entry.wrapEl.querySelectorAll("*").forEach((el) => {
        if (el.scrollTop > 0 || el.scrollLeft > 0) {
          snap.push({ el, top: el.scrollTop, left: el.scrollLeft });
        }
      });
      savedScrolls.set(leafId, snap);
      entry.wrapEl.remove();
    }
    const floats = [...this.root.children].filter((el) => el.classList?.contains("twm-managed-window") || el.classList?.contains("twm-managed-window__backdrop"));
    for (const el of floats) el.remove();
    this.root.innerHTML = "";
    const tree = this.tree;
    if (!tree.rootId) {
      const empty = document.createElement("div");
      empty.className = "twm-empty";
      empty.textContent = "Empty desktop \u2014 Ctrl+K to open something.";
      this.root.appendChild(empty);
      this._cleanCache(/* @__PURE__ */ new Set());
      for (const el of floats) this.root.appendChild(el);
      return;
    }
    const liveLeafIds = /* @__PURE__ */ new Set();
    this._mount(tree.rootId, this.root, liveLeafIds);
    this._cleanCache(liveLeafIds);
    for (const el of floats) this.root.appendChild(el);
    this._updateFocusClasses();
    const restore = () => {
      for (const [leafId, snap] of savedScrolls) {
        if (!this._leafCache.has(leafId)) continue;
        for (const { el, top, left } of snap) {
          if (el.isConnected) {
            el.scrollTop = top;
            el.scrollLeft = left;
          }
        }
      }
    };
    restore();
    requestAnimationFrame(restore);
    try {
      this.onAfterRender();
    } catch (err) {
      console.error("[tile-renderer] onAfterRender threw", err);
    }
  }
  /** Unmount everything and stop painting. `dispose()` on the shell calls
   *  this: `root.innerHTML = ''` detaches DOM without telling a single content
   *  factory, so a page module that installed a `window` listener or an
   *  interval keeps both, invisibly, for the life of the tab. */
  destroy() {
    this._layoutObserver?.disconnect();
    this._layoutObserver = null;
    this._clearTabDropPreview();
    this._tabDrag = null;
    this._tabDropProbe = null;
    this._cleanCache(/* @__PURE__ */ new Set());
    this.disposed = true;
  }
  _cleanCache(liveSet) {
    for (const [leafId, entry] of [...this._leafCache.entries()]) {
      if (!liveSet.has(leafId)) {
        try {
          entry.content?.destroy?.();
        } catch (_) {
        }
        this._disposeTabStrip(entry);
        entry.wrapEl.remove();
        this._leafCache.delete(leafId);
      }
    }
  }
  _mount(nodeId, parentEl, liveSet) {
    const node = this.tree.get(nodeId);
    if (!node) return;
    if (node.kind === "leaf") {
      liveSet.add(node.id);
      const el = this._leafEl(node);
      parentEl.appendChild(el);
      return;
    }
    const split = document.createElement("div");
    split.className = `twm-split twm-split--${node.dir}`;
    split.dataset.splitId = node.id;
    parentEl.appendChild(split);
    const total = node.sizes.reduce((a, b) => a + b, 0) || node.children.length;
    node.children.forEach((cid, i) => {
      const slot = document.createElement("div");
      slot.className = "twm-slot";
      const frac = (node.sizes[i] || 1) / total;
      slot.style.flex = `${frac} ${frac} 0`;
      split.appendChild(slot);
      this._mount(cid, slot, liveSet);
      if (i < node.children.length - 1) {
        const splitter = document.createElement("div");
        splitter.className = `twm-splitter twm-splitter--${node.dir}`;
        splitter.dataset.splitId = node.id;
        splitter.dataset.slotIdx = String(i);
        split.appendChild(splitter);
      }
    });
  }
  _leafEl(leaf) {
    const activeTab = Array.isArray(leaf.tabs) && leaf.tabs.length > 0 ? leaf.tabs[Math.max(0, Math.min(leaf.tabs.length - 1, leaf.activeTabIdx || 0))] : null;
    const kindKey = this._leafKindKey(leaf);
    let entry = this._leafCache.get(leaf.id);
    if (entry && entry.kindKey === kindKey) {
      entry.titleEl.textContent = leaf.title || (leaf.content ? leaf.content.kind : "empty");
      _paintLeafIcon(entry.iconEl, leaf, entry.content, this.ctx);
      return entry.wrapEl;
    }
    if (entry) {
      this._leafCache.delete(leaf.id);
      try {
        entry.content?.destroy?.();
      } catch (_) {
      }
      this._disposeTabStrip(entry);
      entry.wrapEl.remove();
    }
    const wrap = document.createElement("div");
    wrap.className = "twm-leaf";
    wrap.dataset.leafId = leaf.id;
    const chrome = document.createElement("div");
    chrome.className = "twm-leaf__chrome";
    const icon = document.createElement("span");
    icon.className = "twm-leaf__icon material-symbols-outlined";
    const title = document.createElement("span");
    title.className = "twm-leaf__title";
    title.textContent = leaf.title || (leaf.content ? leaf.content.kind : "empty");
    const actions = document.createElement("span");
    actions.className = "twm-leaf__actions";
    const contentActions = document.createElement("span");
    contentActions.className = "twm-leaf__actions twm-leaf__actions--content";
    const isPanel = String(leaf.content?.kind || "").startsWith("panel:");
    actions.innerHTML = `
            ${isPanel ? "" : `
                <button class="twm-leaf__btn" data-action="split-h" title="Split horizontally (Alt+H)">
                    <span class="material-symbols-outlined">splitscreen_vertical_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="split-v" title="Split vertically (Alt+V)">
                    <span class="material-symbols-outlined">splitscreen_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="promote" title="Float this pane as a window (Alt+F)">
                    <span class="material-symbols-outlined">web_asset</span>
                </button>`}
            <button class="twm-leaf__btn" data-action="close" title="Close (Alt+W)">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
    chrome.append(icon, title, contentActions, actions);
    _paintLeafIcon(icon, leaf, null, this.ctx);
    const body = document.createElement("div");
    body.className = "twm-leaf__body";
    body.tabIndex = -1;
    const tabBar = document.createElement("div");
    tabBar.className = "twm-leaf__tabbar";
    if (!Array.isArray(leaf.tabs) || leaf.tabs.length <= 1) {
      tabBar.classList.add("twm-leaf__tabbar--hidden");
    }
    wrap.append(chrome, ...this.tabLayout === "top" ? [tabBar, body] : [body, tabBar]);
    wrap.addEventListener("mousedown", (e) => {
      if (e.target.closest(".twm-splitter")) return;
      this.tree.focus(leaf.id);
      this._updateFocusClasses();
      this.onFocusChange(leaf.id);
      const tgt = e.target;
      const focusable = tgt.closest?.(
        'input, textarea, select, button, a, [contenteditable="true"], [tabindex]'
      );
      if (!focusable || !body.contains(focusable)) {
        setTimeout(() => {
          const ps = body.querySelector(".twm-page-shell__content") ?? body;
          if (ps.tabIndex == null || ps.tabIndex < -1) ps.tabIndex = -1;
          ps.focus({ preventScroll: true });
        }, 0);
      }
    });
    chrome.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(CHROME_NO_FLOAT)) return;
      const startY = e.clientY;
      const startX = e.clientX;
      const pull = { startX, startY, x: startX, y: startY, lifted: false };
      this._chromePull = pull;
      const onMove = (move) => {
        pull.x = move.clientX;
        pull.y = move.clientY;
        if (pull.lifted) return;
        const down = move.clientY - startY;
        const sideways = Math.abs(move.clientX - startX);
        if (down < TILE_LIFT_PX || !_isDownwardPull(down, sideways)) return;
        pull.lifted = true;
        window.removeEventListener("pointermove", onMove);
        this.ctx.onLeafAction?.(leaf.id, "promote");
      };
      const cleanup = () => {
        if (this._chromePull === pull) this._chromePull = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    });
    chrome.addEventListener("dblclick", (e) => {
      if (e.target.closest(CHROME_NO_FLOAT)) return;
      this.ctx.onLeafAction?.(leaf.id, "promote");
    });
    chrome.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.tree.focus(leaf.id);
      this._updateFocusClasses();
      this.onFocusChange(leaf.id);
      this.ctx.onTileContextMenu?.(leaf.id, e.clientX, e.clientY);
    });
    actions.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      e.stopPropagation();
      this.ctx.onLeafAction?.(leaf.id, btn.dataset.action);
    });
    let content = {};
    if (leaf.content) {
      const leafCtx = { ...this.ctx, leafId: leaf.id };
      const activeProps = activeTab?.props ?? leaf.content.props;
      content = this.content.mount(leaf.content.kind, body, activeProps, leafCtx);
      if (content.title) title.textContent = content.title;
      _paintLeafIcon(icon, leaf, content, this.ctx);
      _paintContentActions(contentActions, content.chromeActions);
      _vetoStructuralActions(actions, content.chrome);
    } else {
      body.innerHTML = `<div class="tile-placeholder"><div class="tile-placeholder__hint">empty tile</div></div>`;
    }
    entry = {
      wrapEl: wrap,
      bodyEl: body,
      chromeEl: chrome,
      titleEl: title,
      iconEl: icon,
      content,
      // DERIVED HERE, NOT REUSED FROM ABOVE. `kindKey` was computed
      // before the mount; content that records its sub-tab or its
      // scroll offset WHILE mounting has already written to the
      // tree by now, so the value captured earlier is stale and the
      // very next repaint would tear down the tile that had just
      // said where it was.
      kindKey: this._leafKindKey(leaf),
      tabBarEl: tabBar,
      // C22. The `top` layout's NotebookTabBar, and the child it
      // mounts into. Null under the `bottom` layout, which is plain
      // markup this file writes itself.
      tabStrip: null,
      tabStripHostEl: null
    };
    this._leafCache.set(leaf.id, entry);
    this._renderTabBar(leaf, entry);
    return wrap;
  }
  /**
   * The cache key for a leaf: everything that must change before its wrap is
   * torn down and rebuilt. Extracted so `rebaselineLeaf` below computes the
   * same string this does — two spellings of one key is a cache that misses
   * on every render or never misses at all, and both look like working code.
   */
  _leafKindKey(leaf) {
    const tabFingerprint = (leaf.tabs || []).map((t) => `${t.kind}::${JSON.stringify(t.props || {})}`).join("|") + `#${leaf.activeTabIdx || 0}`;
    return leaf.content ? `${leaf.content.kind}::${JSON.stringify(leaf.content.props || {})}::tabs:${tabFingerprint}` : "__empty__";
  }
  /**
   * The cache key a leaf has RIGHT NOW, for a caller that is about to change
   * the tree and wants to say what it expected to be changing from. See
   * `rebaselineLeaf`.
   */
  leafKey(leafId) {
    const leaf = this.tree?.get?.(leafId);
    return leaf && leaf.kind === "leaf" ? this._leafKindKey(leaf) : null;
  }
  /**
   * C34. ACCEPT A PROPS WRITE THE CONTENT MADE ABOUT ITSELF, WITHOUT
   * REBUILDING THE TILE THAT MADE IT.
   *
   * The cache key above includes every tab's props, and that is right for
   * NAVIGATION: a `table` tab whose `id` changes is different content and the
   * tile must be re-mounted. It is exactly wrong for VIEW STATE. The
   * framework hands every tile a `workspaceTabs.updateProps(patch)`
   * (`page_factory.js`) documented as *"persist editor sub-state into this
   * tile's WM tab props"* — a scroll offset, an open section, a selected
   * sub-tab. Writing one changed the fingerprint, so the NEXT repaint (a
   * focus change, a tab switch, a window promoted three tiles away) missed
   * the cache, destroyed the content and mounted it again. The tile was torn
   * down BY the call that existed to let it remember something, and because
   * the rebuild reads the props back the result looked almost right — the
   * editor came back at the saved scroll position, with everything uncommitted
   * in it gone.
   *
   * So the key is re-baselined instead: the entry keeps its live DOM and
   * starts answering to the new props. The next real navigation still misses
   * and still rebuilds, because that changes the kind or the tab set and this
   * only ever accepts what is already on screen.
   *
   * ══ IT ACCEPTS ONLY THE DELTA IT WAS CALLED FOR ═══════════════════
   *
   * The key is re-derived from the tree as it is NOW, so a first version of
   * this swallowed every difference at once — including a change the tree had
   * taken and the renderer had not drawn yet. Any mutation that does not
   * repaint (`updateActiveTabProps` is itself one, and an embedder writing
   * through `TileTree` directly is another) followed by a props write would
   * have been accepted onto a wrap still showing the OLD content, and the
   * tile would never have re-mounted: one thing drawn under another's title,
   * permanently, with nothing left that knows the two disagree.
   *
   * `expected` is the fix and it is the caller's own honesty: the key it read
   * BEFORE its write. If the cached entry is not still at that key, something
   * else has changed since the tile was mounted and this is not the caller's
   * to accept — refuse, and let the ordinary miss rebuild it.
   *
   * A structural test was tried first and is not enough. *Same kind, different
   * props* is a scroll offset AND it is a navigation to another table; nothing
   * in the leaf can tell them apart, because the difference is which caller
   * asked. `expected` asks the caller.
   *
   * @param {string} leafId
   * @param {string} [expected] the key the caller read before its own write.
   *   Omitted means "accept whatever is there", which is what the first
   *   version did and is kept only so an older caller does not silently
   *   change behaviour — every caller in this tree passes one.
   * @returns {boolean} whether a cached wrap was re-baselined
   */
  rebaselineLeaf(leafId, expected = void 0) {
    const entry = this._leafCache.get(leafId);
    const leaf = this.tree?.get?.(leafId);
    if (!entry || !leaf || leaf.kind !== "leaf") return false;
    if (expected !== void 0 && entry.kindKey !== expected) return false;
    entry.kindKey = this._leafKindKey(leaf);
    return true;
  }
  /**
   * C22. Change the tab layout of a LIVE renderer.
   *
   * Only the strip is rebuilt. The tab bar element is MOVED between its two
   * positions and the body is never detached, so no content factory is
   * unmounted — which is the whole reason this is a method rather than
   * "rebuild the shell with the other option". A grid holding staged edits
   * must not lose them because someone changed where its tabs are drawn.
   *
   * Accepts anything: the value arrives from a DOM attribute and from
   * persisted user settings, and an unknown one means the default.
   */
  setTabLayout(layout) {
    const next = _normalizeTabLayout(layout);
    if (next === this.tabLayout) return;
    this.tabLayout = next;
    if (this.root.dataset && this.root.dataset.twmTabs !== next) {
      this.root.dataset.twmTabs = next;
    }
    if (this.disposed) return;
    for (const [leafId, entry] of this._leafCache) {
      this._placeTabBar(entry);
      this._disposeTabStrip(entry);
      entry.tabBarEl.innerHTML = "";
      const leaf = this.tree.get(leafId);
      if (leaf) this._renderTabBar(leaf, entry);
    }
  }
  /** Put a leaf's tab bar on the side the current layout says. Moving an
   *  attached element is a re-parent, not a rebuild — the body keeps its
   *  DOM, its listeners and its scroll. */
  _placeTabBar(entry) {
    const { wrapEl, bodyEl, tabBarEl } = entry;
    if (!wrapEl || !tabBarEl || !bodyEl) return;
    if (this.tabLayout === "top") wrapEl.insertBefore(tabBarEl, bodyEl);
    else wrapEl.appendChild(tabBarEl);
  }
  /** Tear down the `top` layout's component, if this leaf has one. Safe to
   *  call on a leaf that never had one, and on one that already lost it. */
  _disposeTabStrip(entry) {
    if (!entry?.tabStrip) return;
    try {
      entry.tabStrip.dispose();
    } catch (err) {
      console.error("[tile] tab strip dispose threw", err);
    }
    entry.tabStrip = null;
    entry.tabStripHostEl = null;
  }
  /** Paint a leaf's tab strip in whichever layout is current. The strip is
   *  hidden for single-tab leaves in BOTH layouts — the common case, and the
   *  reason existing single-pane layouts read as identical to today. */
  _renderTabBar(leaf, entry) {
    this._syncChromeDragSource(leaf, entry);
    const bar = entry.tabBarEl;
    if (!bar) return;
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
    bar.classList.toggle("twm-leaf__tabbar--top", this.tabLayout === "top");
    if (tabs.length <= 1) {
      bar.classList.add("twm-leaf__tabbar--hidden");
      this._disposeTabStrip(entry);
      bar.innerHTML = "";
      return;
    }
    bar.classList.remove("twm-leaf__tabbar--hidden");
    if (this.tabLayout === "top") this._renderTopTabBar(leaf, entry, tabs);
    else this._renderBottomTabBar(leaf, entry, tabs);
  }
  /**
   * C33. THE CHROME IS THE DRAG SOURCE FOR A LEAF THAT HAS ONE TAB.
   *
   * Product owner, 2026-08-27. The full argument is in the file header; what
   * this function owns is the THREE conditions and why each is a condition
   * rather than a preference:
   *
   *   EXACTLY ONE TAB. With two or more, the strip is drawn and names each
   *   tab; a chrome drag would then have to guess which one was meant, and
   *   guessing is what the strip exists to avoid. With exactly one, "this
   *   tab" and "what is in this pane" are the same thing.
   *
   *   NOT A PANEL. Panel tiles are chrome, not content — the same exclusion
   *   `_floatableLeaf` and `_snapProbe` already make, and for the same reason:
   *   there is nothing in them that belongs anywhere else.
   *
   *   THE CONTENT DID NOT VETO `promote` (C20). One rule instead of two: a
   *   tab you may not lift out of its pane is a tab you may not drag into
   *   another one. This is what excludes an embedder's master tile — the
   *   ground its floating windows stand on — whose whole reason for existing
   *   is that it stays where it is.
   *
   * THE LISTENERS ARE BOUND ONCE PER CHROME ELEMENT and the ATTRIBUTE is
   * re-decided on every pass. That split is deliberate: `draggable` changes
   * the moment a second tab arrives, while the chrome element itself survives
   * for as long as its wrap does, and re-adding a listener on every render
   * would stack one per repaint.
   */
  _syncChromeDragSource(leaf, entry) {
    const chrome = entry?.chromeEl;
    if (!chrome) return;
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
    const isPanel = String(leaf.content?.kind || "").startsWith("panel:");
    const vetoed = this.leafChrome(leaf.id)?.promote === false;
    const on = tabs.length === 1 && !isPanel && !vetoed;
    if (on) chrome.setAttribute("draggable", "true");
    else chrome.removeAttribute("draggable");
    if (chrome.__twmTabDragBound) return;
    chrome.__twmTabDragBound = true;
    chrome.addEventListener("dragstart", (ev) => {
      if (ev.target?.closest?.(CHROME_NO_FLOAT)) {
        ev.preventDefault();
        return;
      }
      const pull = this._chromePull;
      if (pull && _isDownwardPull(
        pull.y - pull.startY,
        Math.abs(pull.x - pull.startX)
      )) {
        ev.preventDefault();
        return;
      }
      const live = this.tree.get(leaf.id);
      if ((live?.tabs || []).length !== 1) {
        ev.preventDefault();
        return;
      }
      this._beginTabDrag(ev, leaf.id, 0, chrome, { seedPlainText: true });
    });
    chrome.addEventListener("dragend", () => this._onTabDragEnd());
  }
  /**
   * C22. The `top` layout: `NotebookTabBar`, the editor tab strip.
   *
   * The component is mounted into a CHILD of the bar rather than into the bar
   * itself, because `mount()` assigns `container.className = 'tabs
   * notebook-tabs'` (`notebook_tab_bar.js:61`) — handing it `.twm-leaf__tabbar`
   * would take that class, and with it the strip's height, its background and
   * `--hidden`, off the element this file still controls.
   *
   * Every gesture routes through the SAME `ctx.onLeafTabAction` vocabulary the
   * bottom strip uses, so the WM's tree mutations, its persistence and its
   * change notifications are reached by one path from both layouts.
   */
  _renderTopTabBar(leaf, entry, tabs) {
    const bar = entry.tabBarEl;
    if (!entry.tabStrip) {
      bar.innerHTML = "";
      const host = document.createElement("div");
      bar.appendChild(host);
      const strip = new NotebookTabBar();
      strip.mount(host, this._topTabCallbacks(leaf.id));
      entry.tabStrip = strip;
      entry.tabStripHostEl = host;
      host.addEventListener("contextmenu", (ev) => {
        const tabEl = ev.target.closest?.(".tab");
        if (!tabEl) return;
        ev.preventDefault();
        ev.stopPropagation();
        const idx = this._topTabIndex(host, tabEl);
        if (idx < 0) return;
        this.ctx.onLeafTabAction?.(
          leaf.id,
          "menu",
          { idx, x: ev.clientX, y: ev.clientY }
        );
      }, true);
    }
    const activeIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    entry.tabStrip.update(
      tabs.map((t, i) => ({
        filePath: _tabKey(i),
        label: t.title || t.kind || "",
        // The component's `fileType` picks a glyph out of a static map
        // of FILE kinds. A tile's kinds are the embedder's, and the
        // taxonomy already answers for them — see `_paintTopTabs`.
        fileType: t.kind || "unknown",
        // Nothing sets `dirty` on a tab spec today, so the dot is never
        // drawn. Read anyway, because the day a tile can say it holds
        // unsaved work this is where it says it, and the alternative is
        // a second place to remember.
        isDirty: !!t.dirty
      })),
      _tabKey(activeIdx)
    );
    this._paintTopTabs(entry.tabStripHostEl, tabs);
  }
  /**
   * The two things `NotebookTabBar` derives from a vocabulary a tile does not
   * have, corrected in one pass over the DOM it just wrote.
   *
   * Its tooltip is the file PATH (`notebook_tab_bar.js:163`) and its glyph
   * comes from a static fileType map (`:135`). Ours are `builtin://tab/3` and
   * a content kind, so left alone a tab would advertise its own array index
   * and wear the generic `description` glyph — while the tile chrome an inch
   * above it shows the taxonomy's icon for exactly the same kind.
   *
   * Reaching into a component's DOM is worth one paragraph of justification.
   * The alternative for the glyph is `NotebookTabBar.setFileTypeIcons()`,
   * which is STATIC and REPLACES the whole map — so a page that also uses the
   * editor would find its own file icons deleted by whichever of the two
   * rendered last. The class names used here are the component's published
   * contract, stated in its header comment.
   */
  _paintTopTabs(hostEl, tabs) {
    if (!hostEl) return;
    const els = hostEl.querySelectorAll(".tab");
    els.forEach((el, i) => {
      const spec = tabs[i];
      if (!spec) return;
      el.title = spec.title || spec.kind || "";
      const icon = spec.kind ? this.ctx?.taxonomy?.meta?.(spec.kind)?.icon : null;
      const glyph = el.querySelector(".tab-icon");
      if (glyph && icon) glyph.textContent = icon;
      else if (glyph && !icon) glyph.hidden = true;
    });
  }
  /** Which tab an element in the top strip is, by DOM position. Position
   *  rather than the `data-path` key because the key is only ever the index
   *  and reading it back would be a second, parallel answer to the same
   *  question. */
  _topTabIndex(hostEl, tabEl) {
    return Array.prototype.indexOf.call(hostEl.querySelectorAll(".tab"), tabEl);
  }
  /** The callbacks `NotebookTabBar` calls. Everything the component offers
   *  that a tile tab cannot honour is deliberately absent rather than stubbed
   *  — `onRename` is refused by the `builtin://` key, and the rest
   *  (`onDuplicate`, `onSplitRight`, `onRevealInExplorer`, `onCloseAll`, …)
   *  are only ever reached from the context menu this renderer suppresses.
   *
   *  `onDropFromOtherPane` IS NOW WIRED, AND THIS IS THE RECORD OF WHY IT WAS
   *  NOT. The refusal read: *"its payload is the dragged tab's key alone,
   *  which carries no source-leaf identity, and `TileTree` has no
   *  move-a-tab-between-leaves operation to receive it. Wiring it would need
   *  both, and both are tree changes."* Both were true and C33 built both.
   *  `TileTree.moveTabToLeaf` is the tree operation; `TileRenderer._tabDrag`
   *  is the source identity — held on the renderer rather than in the payload
   *  because HTML5's protected mode makes the payload unreadable at the only
   *  moment it would be needed (see `TILE_TAB_MIME`). The payload handed to
   *  the callback is therefore still ignored, exactly as the refusal said it
   *  would have to be.
   *
   *  A DROP ON A FOREIGN STRIP APPENDS. `NotebookTabBar` hands the callback a
   *  key and no event, so there is no pointer position to derive a slot from
   *  — and inventing one for this strip and not for the bottom one would give
   *  the two layouts different answers to the same gesture. "Add this tab to
   *  that tile" is what was asked for; where it sits in the strip is a
   *  reorder away, in the mechanism that already does reorders. */
  _topTabCallbacks(leafId) {
    return {
      // C33. `DragReorder` calls this through `NotebookTabBar`, which
      // sets its own `application/x-ecosim-tab` first and unchanged — so
      // an editor pane sharing the page cannot notice that tiles are
      // dragging tabs too.
      onDragStart: (ev, key, item) => {
        const idx = _tabKeyIndex(key);
        if (idx < 0) return;
        this._beginTabDrag(ev, leafId, idx, item || null);
      },
      // What lets THIS strip admit a tab dragged out of another tile's
      // strip: `#isExternalTabDrag` tests `TAB_MIME` plus whatever the
      // host names here, and defers while its own reorder is running.
      externalTabMimes: [TILE_TAB_MIME],
      onDropFromOtherPane: () => {
        const src = this._tabDrag;
        this._onTabDragEnd();
        if (!src || src.leafId === leafId) return;
        this.ctx.onLeafTabAction?.(src.leafId, "drop-into", {
          idx: src.idx,
          target: { leafId, mode: "tab", toIdx: -1 }
        });
      },
      onActivate: (key) => {
        const idx = _tabKeyIndex(key);
        if (idx >= 0) this.ctx.onLeafTabAction?.(leafId, "switch", { idx });
      },
      onClose: (key) => {
        const idx = _tabKeyIndex(key);
        if (idx >= 0) this.ctx.onLeafTabAction?.(leafId, "close", { idx });
      },
      // DRAG-TO-REORDER ARRIVES AS A PERMUTATION, and the tree moves ONE
      // tab at a time (`TileTree.moveLeafTab(leafId, from, to)`). They
      // reconcile because a drag only ever moves one element: every other
      // key shifts by exactly one place, so the element that travelled
      // furthest between the two orders IS the one that was dragged.
      onReorder: (order) => {
        const leaf = this.tree.get(leafId);
        const count = (leaf?.tabs || []).length;
        if (!Array.isArray(order) || order.length !== count) return;
        let from = -1;
        let to = -1;
        let furthest = 0;
        order.forEach((key, newIdx) => {
          const oldIdx = _tabKeyIndex(key);
          if (oldIdx < 0) return;
          const travelled = Math.abs(newIdx - oldIdx);
          if (travelled > furthest) {
            furthest = travelled;
            from = oldIdx;
            to = newIdx;
          }
        });
        if (from < 0 || from === to) return;
        this.ctx.onLeafTabAction?.(leafId, "move", { from, to });
      }
    };
  }
  /** The `bottom` layout — the framework's own strip, unchanged. Hamburger
   *  button at the start, then one trapezoid-shaped tab per stored tab spec. */
  _renderBottomTabBar(leaf, entry, tabs) {
    const bar = entry.tabBarEl;
    const activeIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    bar.innerHTML = `
            <button type="button" class="twm-leaf__tab-hamburger"
                    data-action="tab-menu"
                    title="Show open tabs" aria-label="Show open tabs">
                <span class="material-symbols-outlined">menu</span>
            </button>
            <ol class="twm-leaf__tabs" role="tablist">
                ${tabs.map((t, i) => `
                    <li class="twm-leaf__tab${i === activeIdx ? " twm-leaf__tab--on" : ""}"
                        role="tab" data-tab-idx="${i}"
                        title="${_esc6(t.title || t.kind)}"
                        draggable="true">
                        <span class="twm-leaf__tab-label">${_esc6(t.title || t.kind)}</span>
                        <button type="button" class="twm-leaf__tab-close"
                                data-action="tab-close" data-tab-idx="${i}"
                                title="Close this tab"
                                aria-label="Close tab">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </li>
                `).join("")}
            </ol>
        `;
    bar.querySelectorAll(".twm-leaf__tab").forEach((li) => {
      li.addEventListener("click", (ev) => {
        if (ev.target.closest('[data-action="tab-close"]')) return;
        const idx = Number(li.dataset.tabIdx);
        this.ctx.onLeafTabAction?.(leaf.id, "switch", { idx });
      });
      li.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(li.dataset.tabIdx);
        this.ctx.onLeafTabAction?.(
          leaf.id,
          "menu",
          { idx, x: ev.clientX, y: ev.clientY }
        );
      });
    });
    bar.querySelectorAll('[data-action="tab-close"]').forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(btn.dataset.tabIdx);
        this.ctx.onLeafTabAction?.(leaf.id, "close", { idx });
      });
    });
    bar.querySelector('[data-action="tab-menu"]')?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const r = ev.currentTarget.getBoundingClientRect();
      this.ctx.onLeafTabAction?.(
        leaf.id,
        "open-menu",
        { x: r.left, y: r.top }
      );
    });
    let dragFromIdx = null;
    bar.querySelectorAll(".twm-leaf__tab").forEach((li) => {
      li.addEventListener("dragstart", (ev) => {
        dragFromIdx = Number(li.dataset.tabIdx);
        ev.dataTransfer.effectAllowed = "move";
        try {
          ev.dataTransfer.setData("text/plain", String(dragFromIdx));
        } catch {
        }
        this._beginTabDrag(ev, leaf.id, dragFromIdx, li);
      });
      li.addEventListener("dragend", () => {
        dragFromIdx = null;
        this._onTabDragEnd();
      });
      li.addEventListener("dragover", (ev) => {
        if (dragFromIdx == null) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
      });
      li.addEventListener("drop", (ev) => {
        if (dragFromIdx == null) return;
        ev.preventDefault();
        const toIdx = Number(li.dataset.tabIdx);
        if (toIdx !== dragFromIdx) {
          this.ctx.onLeafTabAction?.(
            leaf.id,
            "move",
            { from: dragFromIdx, to: toIdx }
          );
        }
        dragFromIdx = null;
      });
    });
    const foreign = (ev) => !!this._tabDrag && this._tabDrag.leafId !== leaf.id && _isTileTabDrag(ev);
    if (bar.__twmBarDropBound) return;
    bar.__twmBarDropBound = true;
    bar.addEventListener("dragover", (ev) => {
      if (!foreign(ev)) return;
      ev.preventDefault();
      try {
        ev.dataTransfer.dropEffect = "move";
      } catch {
      }
      this._clearTileDropZone();
      bar.classList.add("twm-leaf__tabbar--drop-target");
    });
    bar.addEventListener("dragleave", (ev) => {
      if (!bar.contains(ev.relatedTarget)) {
        bar.classList.remove("twm-leaf__tabbar--drop-target");
      }
    });
    bar.addEventListener("drop", (ev) => {
      if (!foreign(ev)) return;
      ev.preventDefault();
      bar.classList.remove("twm-leaf__tabbar--drop-target");
      const src = this._tabDrag;
      this._onTabDragEnd();
      this.ctx.onLeafTabAction?.(src.leafId, "drop-into", {
        idx: src.idx,
        target: { leafId: leaf.id, mode: "tab", toIdx: -1 }
      });
    });
  }
  // ══ C33. THE TAB DRAG ═══════════════════════════════════════════════
  /** Take the identity of the tab now being carried, and mark it.
   *
   *  `seedPlainText` is for the CHROME source only. The two strips already
   *  set `text/plain` themselves — `DragReorder._start` writes the reorder
   *  key, the bottom strip writes the index — and overwriting either would
   *  hand `NotebookTabBar.#onStripDrop`'s `getData(TAB_MIME) ||
   *  getData('text/plain')` fallback a number where it expects a key. The
   *  chrome has no such writer and Firefox refuses to begin a drag with an
   *  empty `dataTransfer`, so it supplies its own. */
  _beginTabDrag(ev, leafId, idx, el, { seedPlainText = false } = {}) {
    this._tabDrag = { leafId, idx, el: el || null };
    this._tabDropProbe = null;
    try {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData(TILE_TAB_MIME, "1");
      if (seedPlainText) ev.dataTransfer.setData("text/plain", String(idx));
    } catch {
    }
    el?.classList?.add("dragging");
  }
  /**
   * Arm — or refuse — the tile under the pointer.
   *
   * NOTHING HERE MAY RENDER. `render()` clears the root, which detaches the
   * element the browser is dragging, and the browser cancels the gesture the
   * moment that happens. The DOM afterwards reads perfectly correct, which is
   * what makes this failure so hard to see; it is the drag-and-drop cousin of
   * the `mousedown`-repaint defect recorded five times against the taskbar.
   *
   * `preventDefault()` is not decoration either: without it the browser
   * refuses the drop outright and `drop` never fires, which reads exactly
   * like a broken handler.
   */
  _onTabDragOver(e) {
    const src = this._tabDrag;
    if (!src || !_isTileTabDrag(e)) return;
    if (e.target?.closest?.(".twm-leaf__tabbar")) {
      this._clearTileDropZone();
      return;
    }
    const probe = this.ctx.wm?.tabDropProbe?.(e, { sourceLeafId: src.leafId }) || null;
    this._tabDropProbe = probe;
    if (!probe) {
      this._clearTabDropZone();
      return;
    }
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {
    }
    for (const [leafId, entry] of this._leafCache) {
      entry.wrapEl.classList.toggle("twm-leaf--drop-target", leafId === probe.leafId);
    }
    this._showTabDropPreview(probe.rect);
  }
  /** Release. The zone that was ARMED is the zone that runs — the stashed
   *  probe rather than a fresh one — because C15's rule is that the rectangle
   *  drawn during the drag is the rectangle the drop delivers, and a pointer
   *  one pixel outside the band at release must not quietly mean something
   *  else. */
  _onTabDrop(e) {
    const src = this._tabDrag;
    const probe = this._tabDropProbe;
    if (!src || !_isTileTabDrag(e)) return;
    if (e.target?.closest?.(".twm-leaf__tabbar")) return;
    e.preventDefault();
    this._onTabDragEnd();
    if (!probe) return;
    this.ctx.onLeafTabAction?.(src.leafId, "drop-into", {
      idx: src.idx,
      target: {
        leafId: probe.leafId,
        mode: probe.mode,
        // The same derivation `_snapCommit` applies to a window drop
        // (`wm.js`, the `_dock` literal) — one reading of a side, so a
        // tab and a window cannot land on opposite halves of one edge.
        dir: probe.side === "left" || probe.side === "right" ? "h" : "v",
        before: probe.side === "left" || probe.side === "top",
        toIdx: -1
      }
    });
  }
  /** Leaving the root entirely disarms, and only that. The drag is still
   *  live — it may come back — so `_tabDrag` survives and only the painting
   *  goes. */
  _onTabDragLeave(e) {
    if (!this._tabDrag) return;
    if (this.root.contains(e.relatedTarget)) return;
    this._clearTabDropZone();
    this._tabDropProbe = null;
  }
  /** The only guaranteed end of a drag. Escape produces this and no `drop`;
   *  so does a release over a target that refused. Idempotent, because the
   *  drop path calls it too and `dragend` still arrives afterwards. */
  _onTabDragEnd() {
    this._tabDrag?.el?.classList?.remove("dragging");
    this._tabDrag = null;
    this._tabDropProbe = null;
    this._clearTabDropZone();
  }
  /** The TILE zone only — the outlined pane and the preview rectangle. Split
   *  out from the whole because a strip that has just armed itself must not
   *  be disarmed by the root handler running behind it. */
  _clearTileDropZone() {
    for (const [, entry] of this._leafCache) {
      entry.wrapEl.classList.remove("twm-leaf--drop-target");
    }
    this._clearTabDropPreview();
  }
  /** Everything: the tile zone and both strips'. The end of a gesture, where
   *  nothing may be left painted. */
  _clearTabDropZone() {
    this._clearTileDropZone();
    for (const [, entry] of this._leafCache) {
      entry.tabBarEl?.classList?.remove("twm-leaf__tabbar--drop-target");
    }
  }
  /** The rectangle a release would fill.
   *
   *  IT IS THE WINDOW DROP'S OWN PREVIEW ELEMENT — same two classes, same
   *  stylesheet rules (`css/base.css`, `.twm-snap-preview`) — so a tab drop
   *  and a window drop cannot come to disagree about what a drop looks like.
   *  `--viewport` is what makes `position: fixed` apply, and that is required
   *  rather than cosmetic: the rectangle came from `getBoundingClientRect` on
   *  a leaf, which speaks viewport pixels.
   *
   *  Parented to `document.body` and not to the root, for R13's reason:
   *  `render()`'s `innerHTML = ''` takes every direct child of the root, and
   *  a repaint during a drag needs nothing more exotic than the drag itself. */
  _showTabDropPreview(rect) {
    if (!rect) {
      this._clearTabDropPreview();
      return;
    }
    if (!this._tabDropPreviewEl) {
      const el2 = document.createElement("div");
      el2.className = "twm-snap-preview twm-snap-preview--viewport";
      el2.setAttribute("aria-hidden", "true");
      this._tabDropPreviewEl = el2;
    }
    const el = this._tabDropPreviewEl;
    Object.assign(el.style, {
      left: `${rect.left ?? rect.x}px`,
      top: `${rect.top ?? rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    if (el.parentNode !== document.body) document.body.appendChild(el);
  }
  _clearTabDropPreview() {
    this._tabDropPreviewEl?.remove();
  }
  _updateFocusClasses() {
    const focused = this.tree.focusedLeafId;
    for (const [leafId, entry] of this._leafCache) {
      entry.wrapEl.classList.toggle("twm-leaf--focused", leafId === focused);
    }
  }
  /** The `.twm-leaf` wrap element for a leaf id, or null if it isn't
   *  currently rendered. Used by the panel-key router to resolve which
   *  DOM subtree owns keyboard input. */
  leafEl(leafId) {
    return this._leafCache.get(leafId)?.wrapEl || null;
  }
  /** C20, extended. The `chrome` veto object the mounted content declared —
   *  `{ promote: false, close: false }` — or null when the leaf is not
   *  rendered or its content declared nothing.
   *
   *  IT EXISTS BECAUSE A VETO PAINTED ON A BUTTON IS NOT A VETO. C20 landed
   *  as `_vetoStructuralActions`, which removes the button from this strip —
   *  and a removed button is only the door the CONTENT can see. The verb has
   *  three other doors: the tile's right-click menu (`shell.js`'s "Float this
   *  pane as a window"), the chrome pull-down, and the chrome's double-click.
   *  All three reach `WindowManager.floatPane` without passing this file, so
   *  a master tile that declared itself unfloatable was floated by any of
   *  them — reproduced: the ground pane floats, every window standing on it
   *  is force-closed, and the pane is re-seeded WITHOUT its `canvas` prop.
   *
   *  So the WM asks the renderer what the content said, and enforces it in
   *  `_floatableLeaf` where every door already converges. The renderer stays
   *  the only place that knows what was mounted; the WM stays the only place
   *  that decides whether a verb runs. `closeFocused` now reads `close` the
   *  same way, for the same reason and after the same defect: Alt+W, the tile
   *  context menu and the tab strip's × all closed a pane whose own button
   *  was greyed out with a tooltip saying it could not be.
   *
   *  ══ THIS RETURNS THE FACTORY'S LIVE OBJECT, AND THAT IS A CONTRACT ══
   *
   *  Not a copy and not a snapshot. `chrome` is READ ONCE, at mount — a
   *  repaint of a cached leaf re-reads only the title and the glyph — so a
   *  veto whose ANSWER CHANGES over the life of the tile must be kept up to
   *  date by the content that stated it, by mutating the object it returned.
   *  Tables' ground pane is exactly that case: its close is refused only
   *  while it is the last content pane, and it re-syncs on `wm:changed`.
   *  Repainting the button alone is not enough now that a verb consults this
   *  — a stale `{disabled: true}` refuses a close every affordance on screen
   *  says is available, which is the same class of lie as a dead control. */
  leafChrome(leafId) {
    return this._leafCache.get(leafId)?.content?.chrome || null;
  }
  // ── Drag-resize ────────────────────────────────────────────────
  _onMouseDown(e) {
    const splitter = e.target.closest(".twm-splitter");
    if (!splitter) return;
    e.preventDefault();
    const splitId = splitter.dataset.splitId;
    const slotIdx = Number(splitter.dataset.slotIdx);
    const split = this.tree.get(splitId);
    if (!split) return;
    const containerEl = splitter.parentElement;
    const horizontal = split.dir === "h";
    const rect = containerEl.getBoundingClientRect();
    const totalPx = horizontal ? rect.width : rect.height;
    this._drag = {
      splitId,
      slotIdx,
      horizontal,
      totalPx,
      startSizes: split.sizes.slice(),
      startPos: horizontal ? e.clientX : e.clientY,
      split
    };
    document.body.classList.add("twm-dragging");
    const move = (ev) => this._onMouseMove(ev);
    const up = (ev) => {
      this._onMouseUp(ev);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
  _onMouseMove(e) {
    if (!this._drag) return;
    const { horizontal, totalPx, startSizes, startPos, slotIdx, split } = this._drag;
    const delta = (horizontal ? e.clientX : e.clientY) - startPos;
    const totalSize = startSizes.reduce((a, b) => a + b, 0);
    const px = totalPx - SPLITTER_PX * (split.children.length - 1);
    if (px <= 0) return;
    const deltaFrac = delta / px * totalSize;
    const minFrac = totalSize * 0.05;
    const newSizes = startSizes.slice();
    newSizes[slotIdx] = Math.max(minFrac, startSizes[slotIdx] + deltaFrac);
    newSizes[slotIdx + 1] = Math.max(minFrac, startSizes[slotIdx + 1] - deltaFrac);
    const sum = newSizes.reduce((a, b) => a + b, 0);
    const scale = totalSize / sum;
    for (let i = 0; i < newSizes.length; i++) newSizes[i] *= scale;
    this.tree.setSplitSizes(split.id, newSizes);
    const containerEl = document.querySelector(`.twm-split[data-split-id="${split.id}"]`);
    if (!containerEl) return;
    const slots = containerEl.querySelectorAll(":scope > .twm-slot");
    slots.forEach((slot, i) => {
      const frac = newSizes[i] / totalSize;
      slot.style.flex = `${frac} ${frac} 0`;
    });
  }
  _onMouseUp() {
    this._drag = null;
    document.body.classList.remove("twm-dragging");
  }
};
function _esc6(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
function _paintLeafIcon(iconEl, leaf, content, ctx) {
  if (!iconEl) return;
  const kind = leaf?.content?.kind;
  const name = content?.icon || (kind ? ctx?.taxonomy?.meta?.(kind)?.icon : null);
  iconEl.textContent = name || "";
  iconEl.hidden = !name;
}
function _paintContentActions(hostEl, specs) {
  hostEl.innerHTML = "";
  if (!Array.isArray(specs) || specs.length === 0) {
    hostEl.hidden = true;
    return;
  }
  hostEl.hidden = false;
  for (const spec of specs) {
    if (!spec || !spec.icon) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "twm-leaf__btn";
    btn.title = spec.title || "";
    btn.setAttribute("aria-label", spec.title || "");
    btn.innerHTML = `<span class="material-symbols-outlined">${spec.icon}</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        spec.onClick?.();
      } catch (err) {
        console.error("[tile] action threw", err);
      }
    });
    hostEl.appendChild(btn);
  }
}
function _vetoStructuralActions(hostEl, chrome) {
  if (!chrome) return;
  for (const [action, rule] of Object.entries(chrome)) {
    const btn = hostEl.querySelector(`[data-action="${action}"]`);
    if (!btn) continue;
    if (rule === false) {
      btn.remove();
      continue;
    }
    if (rule && typeof rule === "object" && rule.disabled) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("twm-leaf__btn--disabled");
      if (rule.title) btn.title = rule.title;
    }
  }
}

// src/tiling/tab_strip.js
function tabKey(idx) {
  return `builtin://tab/${idx}`;
}
function tabKeyIndex(key) {
  const n = Number(String(key ?? "").replace("builtin://tab/", ""));
  return Number.isInteger(n) && n >= 0 ? n : -1;
}
function reorderToMove(order, count) {
  if (!Array.isArray(order) || order.length !== count) return null;
  let from = -1;
  let to = -1;
  let furthest = 0;
  order.forEach((key, newIdx) => {
    const oldIdx = tabKeyIndex(key);
    if (oldIdx < 0) return;
    const travelled = Math.abs(newIdx - oldIdx);
    if (travelled > furthest) {
      furthest = travelled;
      from = oldIdx;
      to = newIdx;
    }
  });
  if (from < 0 || from === to) return null;
  return { from, to };
}
function createTabStrip({ hostEl, taxonomy = null, onAction }) {
  const host = document.createElement("div");
  hostEl.appendChild(host);
  const strip = new NotebookTabBar();
  let tabs = [];
  strip.mount(host, {
    onActivate: (key) => {
      const idx = tabKeyIndex(key);
      if (idx >= 0) onAction?.("switch", { idx });
    },
    onClose: (key) => {
      const idx = tabKeyIndex(key);
      if (idx >= 0) onAction?.("close", { idx });
    },
    onReorder: (order) => {
      const move = reorderToMove(order, tabs.length);
      if (move) onAction?.("move", move);
    }
    // Everything else the component offers that a tab here cannot honour is
    // deliberately absent rather than stubbed — `onRename` is refused by the
    // `builtin://` key, and the rest (`onDuplicate`, `onSplitRight`,
    // `onRevealInExplorer`, `onCloseAll`, …) are only ever reached from the
    // context menu suppressed below.
  });
  const onContextMenu = (ev) => {
    const tabEl = ev.target.closest?.(".tab");
    if (!tabEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    const idx = Array.prototype.indexOf.call(host.querySelectorAll(".tab"), tabEl);
    if (idx < 0) return;
    onAction?.("menu", { idx, x: ev.clientX, y: ev.clientY });
  };
  host.addEventListener("contextmenu", onContextMenu, true);
  const repaint = () => {
    host.querySelectorAll(".tab").forEach((el, i) => {
      const spec = tabs[i];
      if (!spec) return;
      el.title = spec.title || spec.kind || "";
      const icon = spec.kind ? taxonomy?.meta?.(spec.kind)?.icon : null;
      const glyph = el.querySelector(".tab-icon");
      if (!glyph) return;
      if (icon) {
        glyph.textContent = icon;
        glyph.hidden = false;
      } else glyph.hidden = true;
    });
  };
  return {
    /** @param {Array<{kind: string, props?: object, title?: string, dirty?: boolean}>} next */
    update(next, activeIdx) {
      tabs = Array.isArray(next) ? next : [];
      const active = Math.max(0, Math.min(tabs.length - 1, activeIdx || 0));
      strip.update(
        tabs.map((t, i) => ({
          filePath: tabKey(i),
          label: t.title || t.kind || "",
          fileType: t.kind || "unknown",
          // Nothing sets `dirty` on a tab spec today, so the dot is
          // never drawn. Read anyway, because the day a tab can say it
          // holds unsaved work this is where it says it, and the
          // alternative is a second place to remember.
          isDirty: !!t.dirty
        })),
        tabKey(active)
      );
      repaint();
    },
    dispose() {
      host.removeEventListener("contextmenu", onContextMenu, true);
      try {
        strip.dispose();
      } catch (err) {
        console.error("[tab-strip] dispose threw", err);
      }
      host.remove();
    }
  };
}

// src/tiling/wm.js
var PANEL_KINDS = /* @__PURE__ */ new Set(["panel:left", "panel:right", "panel:bottom"]);
var PANEL_TITLES = {
  left: "Navigator",
  right: "Inspector",
  bottom: "Console"
};
var WindowManager = class _WindowManager {
  constructor({
    rootEl,
    api,
    ctx,
    onChange,
    eventBus,
    host,
    taxonomy,
    events,
    content,
    panelDefaults = null,
    snapPromotion = false,
    promoteInPlace = false,
    tabLayout = null
  }) {
    if (!taxonomy) throw new Error("WindowManager: a taxonomy is required");
    if (!content || typeof content.mount !== "function") {
      throw new Error("WindowManager: a content registry is required (createContentRegistry / createShell owns it)");
    }
    this.rootEl = rootEl;
    this.content = content;
    this.api = api || null;
    this.host = host || null;
    this.taxonomy = taxonomy;
    this.events = events || {};
    this.ctx = ctx || {};
    this.eventBus = eventBus || null;
    this.onChange = onChange || (() => {
    });
    this._rootLeaf = () => {
      const kind = this.taxonomy.root;
      return {
        content: { kind, props: {} },
        title: this.taxonomy.meta(kind)?.label || kind
      };
    };
    this.panelDefaults = panelDefaults || null;
    this.snapPromotion = !!snapPromotion;
    this.promoteInPlace = !!promoteInPlace;
    this._snapCtl = null;
    this.desktops = new DesktopManager({
      seed: this._rootLeaf,
      panelDefaults: this.panelDefaults
    });
    this.renderer = new TileRenderer({
      root: rootEl,
      tree: this.desktops.active().tree,
      content,
      /** C22. Where a multi-tab leaf draws its tabs — `'bottom'`
       *  (the framework's own spreadsheet strip, and the DEFAULT so no
       *  existing embedder's panes rearrange on upgrade) or `'top'`
       *  (the editor tab bar, between the chrome and the body).
       *  The renderer also mirrors this onto the root as
       *  `data-twm-tabs` and watches it, so an embedder can change it
       *  live without holding a renderer reference. */
      tabLayout,
      ctx: {
        ...this.ctx,
        wm: this,
        onLeafAction: (leafId, action) => this._leafAction(leafId, action),
        onLeafTabAction: (leafId, action, data) => this._leafTabAction(leafId, action, data)
      },
      onFocusChange: () => this._notifyChange(),
      onAfterRender: () => this._rehomeContainedWindows()
    });
    this._persistTimer = null;
    this._windowToLeaf = /* @__PURE__ */ new Map();
    this.panelKeys = installPanelKeyRouter(this);
    const renamedEvent = this.events.entityRenamed;
    if (renamedEvent) {
      this.eventBus?.on?.(renamedEvent, ({ kind, entityId, label } = {}) => {
        if (!kind || !entityId || !label) return;
        let touched = false;
        for (const d of this.desktops.desktops) {
          if (d.tree.renameMatchingTabs?.(kind, entityId, label)) {
            touched = true;
          }
        }
        if (touched) {
          this.renderer.render();
          this._persist();
        }
      });
    }
  }
  /** C22. Change the tab layout of every tile, live. Delegates to the
   *  renderer, which moves each strip rather than rebuilding the tiles — so
   *  nothing mounted in a tile is unmounted and no staged work is lost.
   *
   *  Not persisted here: which layout a user prefers is a USER setting, and
   *  the WM persists LAYOUT (`desktops`). An embedder that stores it does so
   *  under its own key and passes it back as `createShell({ tabLayout })`. */
  setTabLayout(layout) {
    this.renderer.setTabLayout(layout);
  }
  /** Emit on bus + call onChange. Use this instead of the bare callback
   *  so other surfaces (palette, top-bar toggles, page shortcuts) can
   *  subscribe through the existing event system. */
  _notifyChange(reason = null) {
    try {
      this.onChange(reason);
    } catch (err) {
      console.error("[wm] onChange threw", err);
    }
    try {
      this.eventBus?.emit?.("wm:changed", { reason, wm: this });
    } catch (err) {
      console.warn("[wm] event emit failed", err);
    }
    try {
      const tree = this._tree();
      const id = tree.primaryLeafId();
      const leaf = id ? tree.get(id) : null;
      const kind = leaf?.content?.kind;
      if (kind && kind !== "window-placeholder") {
        this.eventBus?.emit?.("workspace:tabs:activated", {
          kind,
          entityId: leaf.content.props?.id ?? null,
          label: leaf.title,
          from: reason || "wm"
        });
      }
    } catch (_) {
    }
  }
  // ── Persistence ─────────────────────────────────────────────────
  async load() {
    const blob = await loadDesktops(this.host?.state);
    if (blob) {
      this.desktops = DesktopManager.deserialize(blob, {
        seed: this._rootLeaf,
        panelDefaults: this.panelDefaults
      });
      this.renderer.tree = this.desktops.active().tree;
    }
    for (const d of this.desktops.desktops) {
      for (const leaf of d.tree.leaves()) {
        if (leaf.content?.kind === PLACEHOLDER_KIND) {
          const p = leaf.content.props || {};
          if (p.originalKind) {
            d.tree.setLeafContent(
              leaf.id,
              { kind: p.originalKind, props: p.originalProps || {} },
              p.originalTitle || p.originalKind
            );
          }
        }
      }
      this._canonicalize(d.tree, d);
    }
    this.renderer.tree = this.desktops.active().tree;
    this.renderer.render();
    this._notifyChange();
  }
  _persist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(async () => {
      this._persistTimer = null;
      await saveDesktops(this.host?.state, this.desktops.serialize());
    }, 500);
  }
  // ── Content loading ─────────────────────────────────────────────
  /** Load content into the primary tile (last-active non-panel leaf).
  /** Walk back one step. Bound to Backspace.
   *
   *  Priority order:
   *    1. Active tab's per-tab history stack (browser-style "back"):
   *       any in-tile navigation (relationships click-through,
   *       landing-row open, "Open" buttons inside tables) pushed
   *       the previous state, and Backspace pops it. This is the
   *       canonical user-facing back affordance.
   *    2. When the history is empty (the user landed on this page
   *       via top-nav / palette / direct link), fall back to the
   *       canonical taxonomy walk: a sub-page goes to its
   *       top-nav, a top-nav page goes to Home.
   *
   *  Adding a new kind to the injected taxonomy wires the fallback path
   *  for Backspace + breadcrumb + top-nav highlight in one shot.
   *  Adding a new "Open from X" click that should be a back-able
   *  navigation just needs to use one of the in-tile routing
   *  methods (openFromContext / openInLeaf / navigateActiveTab) —
   *  they all record history by default. */
  navigateBack() {
    const tree = this._tree();
    const focusedId = tree.focusedLeafId;
    const primaryId = tree.primaryLeafId();
    const focusedLeaf = focusedId ? tree.get(focusedId) : null;
    const focusedKind = focusedLeaf?.content?.kind || "";
    const id = focusedId && focusedKind && !focusedKind.startsWith("panel:") && focusedKind !== "window-placeholder" ? focusedId : primaryId;
    if (!id) return;
    const prior = tree.popActiveTabHistory?.(id);
    if (prior && prior.kind) {
      const leafNow = tree.get(id);
      const curKind = leafNow?.content?.kind;
      const curTopNav = curKind ? this.taxonomy.topNavFor(curKind) : null;
      if (prior.topNav && curTopNav && prior.topNav !== curTopNav) {
        tree.swapToPage?.(
          id,
          {
            kind: prior.kind,
            props: prior.props || {},
            title: prior.title || _tabTitle(prior.kind, prior.props)
          },
          curTopNav,
          prior.topNav,
          { recordHistory: false }
        );
      } else {
        tree.replaceActiveTabContent(
          id,
          { kind: prior.kind, props: prior.props || {} },
          prior.title || _tabTitle(prior.kind, prior.props),
          { recordHistory: false }
        );
      }
      tree.focus(id);
      this.renderer.render();
      this._persist();
      this._notifyChange("navigate-back");
      return;
    }
    const leaf = tree.get(id);
    if (!leaf?.content) return;
    const { kind, props } = leaf.content;
    const up = this.taxonomy.parentOf(kind, props);
    if (up) {
      this.navigateActiveTab(id, up.kind, up.props);
      return;
    }
    const parent = this.taxonomy.parentKindFor(kind);
    if (parent) this.navigateActiveTab(id, parent);
  }
  /** True when `navigateBack` would do something user-visible — i.e.
   *  the active tab has per-tab history, OR the current kind has a
   *  taxonomy parent. Used by the breadcrumb to grey out / hide the
   *  Back button when there's nowhere to go. */
  canNavigateBack() {
    const tree = this._tree();
    const focusedId = tree.focusedLeafId;
    const primaryId = tree.primaryLeafId();
    const focusedLeaf = focusedId ? tree.get(focusedId) : null;
    const focusedKind = focusedLeaf?.content?.kind || "";
    const id = focusedId && focusedKind && !focusedKind.startsWith("panel:") && focusedKind !== "window-placeholder" ? focusedId : primaryId;
    if (!id) return false;
    const history = tree.activeTabHistory?.(id) || [];
    if (history.length > 0) return true;
    const leaf = tree.get(id);
    const kind = leaf?.content?.kind;
    return !!(kind && this.taxonomy.parentKindFor(kind));
  }
  /** Persist editor sub-state (e.g. active sub-tab) into the active
   *  tab's WM props so future history snapshots restore the user's
   *  view rather than the default landing. Pure metadata write — no
   *  re-render, no history push. */
  updateActiveTabProps(leafId, patch) {
    const tree = this._tree();
    if (!tree?.updateActiveTabProps) return;
    const expected = this.renderer?.leafKey?.(leafId) ?? void 0;
    tree.updateActiveTabProps(leafId, patch);
    this.renderer?.rebaselineLeaf?.(leafId, expected);
    this._persist();
  }
  /** Navigate inside the current tab — preserves every other tab in
   *  the leaf. Used by Backspace + breadcrumb segments + anything
   *  else that should walk WITHIN the tile rather than reset it. */
  navigateActiveTab(leafId, kind, props = {}) {
    const tree = this._tree();
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== "leaf") {
      this.openInPrimary(kind, props);
      return;
    }
    tree.replaceActiveTabContent(leafId, { kind, props }, _tabTitle(kind, props));
    tree.focus(leafId);
    this.renderer.render();
    this._persist();
    this._notifyChange("navigate-active-tab");
  }
  /** Route a navigation request to the right container based on
   *  where it came from:
   *
   *  - `ctx.windowId` set → replace the managed-window content (the
   *    user is navigating inside a windowed tile; the window stays).
   *  - `ctx.leafId` set AND that leaf is NOT `panel:left` → replace
   *    the leaf's content in place (the user is in a split tile;
   *    the click stays in that tile).
   *  - Otherwise (palette, top-nav shortcuts, click in the
   *    navigator panel, backspace, plain bus event) → primary tile.
   *
   *  The left nav (`panel:left`) is the only tile whose clicks
   *  intentionally jump out to the primary tile — every other
   *  container is self-contained. */
  openFromContext(ctx, kind, props = {}) {
    if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
      this.openInWindow(ctx.windowId, kind, props);
      return;
    }
    if (ctx?.leafId) {
      const tree = this._tree();
      const leaf = tree.get(ctx.leafId);
      const k = leaf?.content?.kind;
      if (leaf && k && k !== "panel:left" && !k.startsWith("panel:")) {
        this.openInLeaf(ctx.leafId, kind, props);
        return;
      }
    }
    this.openInPrimary(kind, props);
  }
  /** Replace the leaf's **active tab** in place — preserves every
   *  other tab. This is the routing for navigation that originated
   *  INSIDE the tile: clicking a row on a landing page, walking a
   *  breadcrumb segment, Backspace. Outside-the-tile navigation
   *  (top-nav, palette, side-nav) uses `openInPrimary` instead, which
   *  resets the leaf to a single fresh tab.
   *
   *  For a leaf that has only one tab (the common case before the
   *  tab feature shipped), the behavior is identical to the old
   *  setLeafContent: one tab in, one tab out. */
  openInLeaf(leafId, kind, props = {}) {
    const tree = this._tree();
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== "leaf") {
      this.openInPrimary(kind, props);
      return;
    }
    tree.replaceActiveTabContent(leafId, { kind, props }, _tabTitle(kind, props));
    tree.focus(leafId);
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  /** Replace a managed window's content in place. Tears down the
   *  previous mount, mounts the new kind into the same body element,
   *  and updates the window's title. */
  openInWindow(winId, kind, props = {}) {
    const rec = this._windowToLeaf.get(winId);
    if (!rec) {
      this.openInPrimary(kind, props);
      return;
    }
    try {
      rec.mountInfo?.destroy?.();
    } catch {
    }
    const host = rec.bodyEl || rec.contentEl;
    host.innerHTML = "";
    const mountInfo = this.content.mount(
      kind,
      host,
      props,
      { ...this.ctx, wm: this, windowId: winId }
    );
    rec.mountInfo = mountInfo;
    rec.original = {
      kind,
      props: { ...props || {} },
      title: mountInfo?.title || kind
    };
    const tab = (rec.tabs || [])[rec.activeTabIdx];
    if (tab) {
      tab.kind = kind;
      tab.props = { ...props || {} };
      tab.title = rec.original.title;
      rec.strip?.update(rec.tabs, rec.activeTabIdx);
    }
    this._setWindowTitle(rec, rec.original.title);
    this._persist();
    this._notifyChange("window-content-changed");
  }
  /** Load content into the primary tile (last-active non-panel leaf).
   *  If only panel tiles exist (or the tree is empty), spawn a new
   *  content leaf and canonicalize so the panels wrap it. */
  openInPrimary(kind, props = {}) {
    const tree = this._tree();
    let leafId = tree.primaryLeafId();
    let spawned = false;
    if (!leafId) {
      leafId = this._spawnContentLeaf(tree);
      spawned = true;
    }
    if (!leafId) return;
    const leaf = tree.get(leafId);
    const currentTopNav = leaf?.content?.kind ? this.taxonomy.topNavFor(leaf.content.kind) || null : null;
    const targetTopNav = this.taxonomy.topNavFor(kind) || kind;
    const title = _tabTitle(kind, props);
    tree.swapToPage(
      leafId,
      { kind, props, title },
      currentTopNav,
      targetTopNav
    );
    tree.focus(leafId);
    if (spawned) this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  // ── Split / close / focus / move ────────────────────────────────
  split(dir) {
    const tree = this._tree();
    const focused = tree.focusedLeafId;
    if (!focused) return;
    const newId = tree.split(focused, dir);
    if (newId) this._seedHome(tree, newId);
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  /** Seed a leaf with the default HOME content (the taxonomy root kind).
   *  Used to keep the never-empty-tile invariant: the pane freed by a
   *  split, or emptied when its last tab floats into a window, is
   *  re-homed instead of destroyed or left blank. Embedder-agnostic —
   *  the HOME kind comes from the taxonomy, exactly like a fresh
   *  desktop's seed leaf. */
  _seedHome(tree, leafId) {
    const seed = this._rootLeaf();
    tree.setLeafContent(leafId, seed.content, seed.title);
  }
  /** Split `leafId` along `dir` and mount `kind`/`props` in the freshly
   *  created sibling — the "open this content in a new split" primitive
   *  behind the code-pane split buttons, the per-pane context menu and
   *  Alt+Shift+H / Alt+Shift+V. The source leaf keeps its content
   *  untouched; the new pane gets a FRESH mount (so e.g. opening a Code
   *  pane in a split never dismounts the original). Returns the new
   *  leaf id, or null if the leaf can't be split. */
  splitLeafWith(leafId, dir, kind, props = {}, title = "") {
    const tree = this._tree();
    const src = leafId ? tree.get(leafId) : null;
    if (!src || src.kind !== "leaf") return null;
    const newId = tree.split(leafId, dir);
    if (!newId) return null;
    tree.setLeafContent(newId, { kind, props }, title || _tabTitle(kind, props));
    tree.focus(newId);
    this.renderer.render();
    this._persist();
    this._notifyChange("split-with");
    return newId;
  }
  /** Resolve the focused tile's active content for the keyboard-driven
   *  "open focused tile elsewhere" chords (Alt+T / Alt+N / Alt+Shift+H /
   *  Alt+Shift+V). Returns null for panels, window placeholders and
   *  empty tiles — none of which can be meaningfully duplicated. */
  _focusedContent() {
    const tree = this._tree();
    const id = tree.focusedLeafId;
    const leaf = id ? tree.get(id) : null;
    if (!leaf || leaf.kind !== "leaf" || !leaf.content) return null;
    const kind = leaf.content.kind;
    if (!kind || kind === PLACEHOLDER_KIND || kind.startsWith("panel:")) return null;
    return { leafId: id, kind, props: leaf.content.props || {}, title: leaf.title };
  }
  /** Alt+T — open the focused tile's content in a new tab on that tile. */
  openFocusedInTab() {
    const c = this._focusedContent();
    if (!c) return;
    this.openInTabFromContext({ leafId: c.leafId }, c.kind, c.props);
  }
  /** Alt+N — open the focused tile's content in a fresh managed window.
   *  Unlike Alt+F (promote) this DUPLICATES: the source tile stays put. */
  openFocusedInWindow() {
    const c = this._focusedContent();
    if (!c) return;
    this._navigateWindow(c.kind, c.props);
  }
  /** Alt+Shift+H / Alt+Shift+V — split the focused tile and open a fresh
   *  copy of its content in the new pane. Falls back to an empty split
   *  when the focused tile has no duplicable content (e.g. a panel). */
  splitFocusedWith(dir) {
    const c = this._focusedContent();
    if (!c) {
      this.split(dir);
      return;
    }
    this.splitLeafWith(c.leafId, dir, c.kind, c.props, c.title);
  }
  closeFocused() {
    const tree = this._tree();
    const focusedId = tree.focusedLeafId;
    if (!focusedId) return;
    const leaf = tree.get(focusedId);
    const kind = leaf?.content?.kind;
    const closeChrome = this.renderer?.leafChrome?.(focusedId)?.close;
    if (closeChrome === false || closeChrome?.disabled === true) return;
    if (kind === PLACEHOLDER_KIND) {
      const winId = leaf.content?.props?.windowId;
      const rec = winId ? this._windowToLeaf.get(winId) : null;
      if (rec) {
        this._windowToLeaf.delete(winId);
        try {
          rec.window.close({ force: true });
        } catch {
        }
      }
      tree.close(focusedId);
    } else if (PANEL_KINDS.has(kind)) {
      const d = this.desktops.active();
      const side = kind.split(":")[1];
      d.panels[side] = false;
      this._canonicalize(tree, d);
    } else {
      tree.close(focusedId);
    }
    if (!tree.leaves().some((l) => !String(l.content?.kind || "").startsWith("panel:"))) {
      const spawned = this._spawnContentLeaf(tree);
      if (spawned) this._seedHome(tree, spawned);
    }
    this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    this._persist();
    this._notifyChange("tile-closed");
  }
  /** Close the ACTIVE tab of a leaf (e.g. a Cancel button inside the
   *  tab's content). Mirrors the tab-strip × handler: remove just that
   *  tab, or close the whole tile if it was the last one. Lets content
   *  self-close without nuking sibling tabs. */
  closeActiveTab(leafId) {
    const tree = this._tree();
    const leaf = leafId ? tree.get(leafId) : null;
    if (!leaf || leaf.kind !== "leaf") {
      this.closeFocused();
      return;
    }
    const tabs = leaf.tabs || [];
    if (tabs.length <= 1) {
      tree.focus(leafId);
      this.closeFocused();
      return;
    }
    const idx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    tree.removeLeafTab(leafId, idx);
    tree.focus(leafId);
    this.renderer.render();
    this._persist();
    this._notifyChange("twm-tab-close");
  }
  /** Insert a new empty content leaf at the centre of the layout
   *  (wraps the current root in an h-split with the content on the
   *  left, 4:1 ratio). If the tree is empty, becomes the root. */
  _spawnContentLeaf(tree) {
    const newLeaf = makeLeaf({ content: null, title: "" });
    if (!tree.rootId) {
      tree.setRoot(newLeaf);
      return newLeaf.id;
    }
    tree._register(newLeaf);
    const split = {
      id: `split-spawn-${Date.now().toString(36)}`,
      kind: "split",
      parentId: null,
      dir: "h",
      children: [newLeaf.id, tree.rootId],
      sizes: [4, 1]
    };
    tree.nodes.set(split.id, split);
    const oldRoot = tree.get(tree.rootId);
    if (oldRoot) oldRoot.parentId = split.id;
    newLeaf.parentId = split.id;
    tree.rootId = split.id;
    tree.focus(newLeaf.id);
    return newLeaf.id;
  }
  focusDir(dir) {
    if (this._tree().focusDir(dir)) {
      this.renderer._updateFocusClasses();
      this._notifyChange();
    }
  }
  /** The `.twm-leaf` DOM element of the currently focused leaf on the
   *  active desktop, or null. The panel-key router consults this to
   *  decide which panel owns the keyboard — it is the single source of
   *  truth for "the selected tile". */
  focusedLeafEl() {
    const id = this._tree().focusedLeafId;
    return id ? this.renderer.leafEl(id) : null;
  }
  moveFocused(dir) {
    if (this._tree().moveDir(dir)) {
      this.renderer.render();
      this._persist();
      this._notifyChange();
    }
  }
  // ── Tile <-> Managed window ─────────────────────────────────────
  /** Float the focused pane into a managed window.
   *
   *  R8. THE WHOLE PANE, not its active tab. This used to float one tab and
   *  leave the rest behind, which made "float this pane as a window" a
   *  different verb from the one its own tooltip named: a pane with three
   *  tables in it became a window holding one and a pane holding two, and
   *  nothing on screen said which of the three you were going to get. The
   *  product owner's words are the whole specification — *"to window includes
   *  the tab-strip"* — so the tabs travel with the pane and the strip is
   *  rendered INSIDE the window.
   *
   *  Floating ONE tab is still available and is still wanted; it moved to
   *  where it was always meant to be, which is the right-click menu on the
   *  tab itself (R9, `floatTabAsWindow`). A verb that acts on one tab belongs
   *  on that tab, not on the pane's chrome.
   *
   *  Never-empty-tile invariant, unchanged: the emptied pane is RE-SEEDED
   *  with the default HOME content rather than destroyed, so the grid never
   *  ends up with a missing or blank main tile. */
  toggleManagedFocused() {
    const tree = this._tree();
    const focused = tree.focused();
    if (!focused) return null;
    return this.floatPane(focused.id);
  }
  /** R8. Float a pane — every tab, with the strip — into a managed window.
   *  Returns the window id, or null when the leaf is not something that can
   *  be floated. */
  floatPane(leafId) {
    const leaf = this._floatableLeaf(leafId);
    if (!leaf) return null;
    const tabs = _leafTabSpecs(leaf);
    const active = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    return this._promote(leafId, tabs, active, { wholePane: true });
  }
  /** R9. Float ONE tab of a pane into a managed window, leaving its siblings
   *  where they are — which is exactly what `toggleManagedFocused` did before
   *  R8, so the behaviour survives, it just moved to the gesture that names
   *  it. The tab's right-click menu is the only caller. */
  floatTabAsWindow(leafId, idx) {
    const leaf = this._floatableLeaf(leafId);
    if (!leaf) return null;
    const tabs = _leafTabSpecs(leaf);
    if (!Number.isInteger(idx) || idx < 0 || idx >= tabs.length) return null;
    return this._promote(leafId, [tabs[idx]], 0, { wholePane: false, tabIdx: idx });
  }
  /**
   * C33. MOVE ONE TAB INTO ANOTHER TILE — the same verb as `floatTabAsWindow`
   * above with a TILE as the destination instead of a window, which is why it
   * sits beside it.
   *
   * ══ THE ORDER IS LOAD-BEARING ═══════════════════════════════════════
   *
   * Four steps, and three of them are in this order for a reason that a
   * plausible-looking rewrite would destroy:
   *
   *   (a) READ THE TAB SPEC FIRST. `fromIdx` is an ARRAY INDEX — the only
   *       identity a tile tab has (`tile_renderer._tabKey`) — so it is stale
   *       the instant anything splices a tab list. Everything below works
   *       from the copy taken here.
   *
   *   (b) SPLIT BEFORE REMOVING. When the destination IS the source pane —
   *       "tear this tab off into a split beside its siblings" — removing
   *       first can empty that pane and send it through `_seedHome`, so the
   *       split would then be splitting a freshly seeded ground rather than
   *       the pane the preview drew. Splitting first cannot go wrong in the
   *       other direction: `tree.split` never touches tabs.
   *
   *   (c) THE MOVE ITSELF IS ONE TREE CALL for `tab` — `moveTabToLeaf`, which
   *       exists so the tab cannot be in flight between two mutations — and
   *       remove-then-`setLeafContent` for `fill`/`split`, where the
   *       destination is ground or brand new and REPLACING is the point.
   *
   *   (d) RE-SEED AND MERGE, exactly as `_promote` does when the last tab
   *       leaves a pane (`_seedHome` then `_mergeStartTiles`). A pane is
   *       never left blank, and two grounds never end up side by side with a
   *       splitter between them for no reason.
   *
   * ══ `wm:tab-moved` IS EMITTED BEFORE THE REPAINT ════════════════════
   *
   * An embedder that keys live content by leaf id — the Tables grid registry
   * does, on `(leaf, table)`, because a DOM element exists in exactly one
   * place — has to re-key BEFORE the render mounts the destination, or the
   * destination misses its entry, builds a second grid, and the source tile's
   * deferred teardown destroys the first one along with everything typed into
   * it and not yet committed. Emitting after the render would lose that race
   * silently, which is the failure this repository keeps recording. The tree
   * is already correct at this point; only the DOM is stale.
   *
   * ══ WHAT THIS DELIBERATELY DOES NOT DO ══════════════════════════════
   *
   * A tab is not dragged OUT OF A FLOATING WINDOW's strip, and a tab dropped
   * on empty space does not become a window. Both are refused by omission
   * rather than half-built, and both have a reason. A window's tabs live in
   * `_windowToLeaf`'s record and not in the tree, so their source policy is
   * `_windowTabAction`'s and not this function's. And "dropped on nothing" in
   * HTML5 drag-and-drop is `dragend` with no `drop` — which is also exactly
   * what pressing Escape produces, so floating a window on it would float one
   * every time a user changed their mind. Crossing DESKTOPS is out for a
   * third reason: only the active desktop is rendered, so there is no target
   * to hit.
   *
   * @param {string} fromLeafId
   * @param {number} fromIdx
   * @param {{leafId: string, mode?: 'tab'|'fill'|'split', dir?: 'h'|'v',
   *          before?: boolean, toIdx?: number}} target  a `tabDropProbe`
   *          answer, translated by the renderer
   * @returns {string|null} the leaf the tab landed in, or null if refused
   */
  moveTabInto(fromLeafId, fromIdx, target = {}) {
    const tree = this._tree();
    const from = tree.get(fromLeafId);
    if (!from || from.kind !== "leaf") return null;
    const tabs = Array.isArray(from.tabs) ? from.tabs : [];
    if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= tabs.length) return null;
    let destId = target?.leafId || null;
    const dest = destId ? tree.get(destId) : null;
    if (!dest || dest.kind !== "leaf") return null;
    if (String(dest.content?.kind || "").startsWith("panel:")) return null;
    const mode = target.mode === "fill" || target.mode === "split" ? target.mode : "tab";
    if (destId === fromLeafId && mode !== "split") return null;
    if (destId === fromLeafId && tabs.length <= 1) return null;
    const src = tabs[fromIdx];
    const spec = {
      kind: src.kind,
      props: { ...src.props || {} },
      title: src.title || src.kind || ""
    };
    if (mode === "split") {
      const newId = tree.split(destId, target.dir === "v" ? "v" : "h");
      if (!newId) return null;
      _halveInto(tree, destId, newId);
      if (target.before) _swapSiblings(tree, destId, newId);
      destId = newId;
    }
    if (mode === "tab") {
      const moved = tree.moveTabToLeaf(
        fromLeafId,
        fromIdx,
        destId,
        Number.isInteger(target.toIdx) ? target.toIdx : -1
      );
      if (!moved?.ok) return null;
    } else {
      tree.removeLeafTab(fromLeafId, fromIdx);
      tree.setLeafContent(destId, { kind: spec.kind, props: spec.props }, spec.title);
    }
    if (!(tree.get(fromLeafId)?.tabs || []).length) {
      this._seedHome(tree, fromLeafId);
      this._mergeStartTiles(tree, fromLeafId);
    }
    this._canonicalize(tree, this.desktops.active());
    try {
      this.eventBus?.emit?.(
        "wm:tab-moved",
        { fromLeafId, toLeafId: destId, tab: spec, mode }
      );
    } catch (err) {
      console.warn("[wm] tab-moved emit failed", err);
    }
    if (tree.get(destId)) tree.focus(destId);
    this.renderer.render();
    this._persist();
    this._notifyChange("tab-moved");
    return destId;
  }
  /** The guards both float verbs share. A panel tile is chrome, not content;
   *  a window placeholder is already a window; an empty tile has nothing to
   *  carry — and, since C20 was extended, content that declared itself
   *  unfloatable is not floated by ANY door.
   *
   *  THE LAST ONE IS WHY THIS FUNCTION IS THE RIGHT PLACE. C20 let a content
   *  factory return `chrome: { promote: false }`, and the renderer honoured
   *  it by not PAINTING the float button. That is one door of four: the
   *  tile's right-click menu has offered "Float this pane as a window" all
   *  along (`shell.js`'s `_tileContextMenu`, whose only guard is
   *  `isPanel || !leaf.content`), the chrome pull-down asks for `promote`,
   *  and so now does the chrome's double-click. Each of them arrives here.
   *
   *  The case it protects is an embedder's MASTER tile: the ground that
   *  floating windows stand on. Floating it promotes the ground into a
   *  window, which force-closes every window standing on it and re-seeds the
   *  pane WITHOUT the props that made it a ground — reproduced end to end
   *  before this guard existed. A veto the content states once should hold
   *  for every gesture, not only the one the renderer draws. */
  _floatableLeaf(leafId) {
    const leaf = leafId ? this._tree().get(leafId) : null;
    if (!leaf || leaf.kind !== "leaf" || !leaf.content) return null;
    if (PANEL_KINDS.has(leaf.content.kind)) return null;
    if (leaf.content.kind === PLACEHOLDER_KIND) return null;
    if (this.renderer?.leafChrome?.(leaf.id)?.promote === false) return null;
    return leaf;
  }
  /**
   * The promote itself: build the window, mount the active tab in it, and
   * take the tabs out of the tree.
   *
   * @param {string}   leafId        the pane the tabs are coming out of
   * @param {object[]} tabs          `{kind, props, title}`, in order
   * @param {number}   activeTabIdx  which of them the window shows first
   * @param {{wholePane: boolean, tabIdx?: number}} opts
   */
  _promote(leafId, tabs, activeTabIdx, { wholePane, tabIdx = -1 }) {
    const tree = this._tree();
    const leaf = tree.get(leafId);
    const desktopIdx = this.desktops.activeIdx;
    const tabCount = Array.isArray(leaf.tabs) ? leaf.tabs.length : 1;
    const active = Math.max(0, Math.min(tabs.length - 1, activeTabIdx || 0));
    const original = { ...tabs[active], props: { ...tabs[active].props || {} } };
    const contentEl = document.createElement("div");
    contentEl.className = "twm-window-content";
    contentEl.style.cssText = "display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;";
    const tabBarEl = document.createElement("div");
    tabBarEl.className = "twm-window-tabbar";
    const bodyEl = document.createElement("div");
    bodyEl.className = "twm-window-body";
    bodyEl.style.cssText = "display:flex; flex-direction:column; flex:1; min-width:0; min-height:0;";
    contentEl.append(tabBarEl, bodyEl);
    const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const mountInfo = this.content.mount(
      original.kind,
      bodyEl,
      original.props,
      { ...this.ctx, wm: this, windowId: winId }
    );
    const win = new ManagedWindow({
      id: winId,
      title: mountInfo?.title || original.title,
      icon: "web_asset",
      content: contentEl,
      canMinimize: true,
      canMaximize: true,
      canResize: true,
      modal: false,
      // C15. Dropping a promoted window on a tile PUTS IT BACK — as that
      // tile's content, as a split of it, or as one of its tabs. Off
      // unless the embedder asked, because it changes what a drag to an
      // edge means.
      snap: this.snapPromotion,
      snapController: this.snapPromotion ? this._snapController() : null,
      // R1. THE PANE IS A BOX WITH `overflow: hidden`. A window contained
      // to one (C21) cannot be dragged a single pixel outside it, so
      // "drag a window from one tile to another" — the gesture all three
      // drop behaviours are built on — was not merely awkward, it was
      // invisible. For the length of a drag the window is re-parented
      // here, to the root every tile is inside; on release it goes back
      // into a pane, either the one it was dropped on or the one it came
      // from. Resolved per drag: the root outlives any tile, and a tile
      // grabbed once does not survive its own repaint.
      dragHost: () => this.rootEl,
      dragBounds: () => this._tileBounds(),
      // R7. MAXIMISE MEANS BACK TO TILE. This window came OUT of the
      // tree; the useful thing to do with it is put it back, and filling
      // the screen with it is the one gesture that makes putting it back
      // harder. So the maximize button docks — and the separate demote
      // button the WM used to inject beside it is gone, because two
      // buttons for one verb is how you get a chrome nobody reads.
      onMaximize: () => this.bringBackWindow(winId),
      maximizeIcon: "close_fullscreen",
      maximizeTitle: "Back to tile",
      onClose: () => this._onManagedWindowClosed(winId, null)
    });
    this._windowToLeaf.set(winId, {
      // The floated tabs now live in the window, not the tree. leafId
      // is null so "back to tile" re-docks into the desktop's primary
      // tile (see _onManagedWindowClosed) — the source tile itself
      // survives (re-seeded with HOME when it was emptied).
      leafId: null,
      desktopIdx,
      original,
      mountInfo,
      window: win,
      contentEl,
      bodyEl,
      tabBarEl,
      // R8. THE PANE'S TABS TRAVEL WITH IT, and this is where they live
      // while the window is open. `original` still mirrors the ACTIVE one
      // so every existing reader of the record — `openInWindow`, each of
      // `_onManagedWindowClosed`'s docks — keeps working unchanged; the
      // list beside it is what makes a dock restore ALL of them.
      tabs,
      activeTabIdx: active,
      strip: null,
      // ══ C21. WRITTEN HERE, BEFORE THE TREE IS TOUCHED ═══════════
      //
      // `homeLeafId` is the pane this window stands on, and it used to be
      // assigned at the BOTTOM of this function — after `_seedHome`,
      // after `_mergeStartTiles`, after the repaint. That ordering
      // destroyed a tile per promotion, and it looked like a window bug
      // because a window is what the user had just moved.
      //
      // `_mergeStartTiles` (below) refuses to merge a start tile that has
      // a window standing on it, and `_paneHoldsWindows` answers that
      // question two ways: THIS FIELD, and a DOM probe for a
      // `.twm-managed-window` inside the leaf. At the old assignment point
      // neither could be true yet — the field was unwritten and the window
      // had not been `moveTo`'d into the pane — so the pane that was one
      // line away from becoming this window's ground answered *nothing
      // floats here* and was merged into its neighbour.
      //
      // Three panes floated one after another ended as ONE pane: the
      // first promotion left a start tile, the second merged its own
      // freshly-seeded tile away, and so did the third. Every window
      // after the first was then left with a `homeLeafId` naming a leaf
      // the tree no longer had — so the `moveTo` below was skipped and the
      // window never became contained, `_rehomeContainedWindows` found no
      // element to re-home it into, and `bringBackWindow` fell through to
      // the PRIMARY tile and docked as a tab onto the ground ANOTHER
      // window was standing on. That is the whole of the reported
      // *"expand one to a tile > influences others or even tiles lost"*.
      //
      // Writing it here is the smallest fix that closes all of it: a
      // guard that already existed starts being able to see the window it
      // was written to protect. The `moveTo` stays at the bottom, because
      // it needs the wrap the repaint rebuilds.
      homeLeafId: this.promoteInPlace ? leafId : null,
      // Set to true by bringBackWindow so the close path knows to
      // restore the content instead of destroying it.
      _demoting: false
    });
    this._syncWindowTabs(winId);
    if (!wholePane && tabCount > 1) tree.removeLeafTab(leafId, tabIdx);
    else this._seedHome(tree, leafId);
    this._mergeStartTiles(tree, leafId);
    tree.focus(leafId);
    this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    if (this.promoteInPlace) {
      const paneEl = this.renderer.leafEl(leafId);
      if (paneEl) win.moveTo(paneEl);
    }
    win.show();
    this._decorateManagedWindow(win, winId);
    this._persist();
    this._notifyChange("window-promoted");
    return winId;
  }
  // ══ R8. The tab strip inside a floated pane ═══════════════════════
  /**
   * Draw (or hide) a window's tab strip, and keep its title honest.
   *
   * Hidden below two tabs, exactly as a pane's strip is
   * (`tile_renderer._renderTabBar`): the common case is one tab, and a strip
   * naming the one thing you are already looking at is a line of chrome
   * saying nothing. Building the strip lazily also means a window promoted
   * out of a single-tab pane costs no `NotebookTabBar` at all.
   */
  _syncWindowTabs(winId) {
    const rec = this._windowToLeaf.get(winId);
    if (!rec) return;
    const tabs = rec.tabs || [];
    rec.activeTabIdx = Math.max(0, Math.min(tabs.length - 1, rec.activeTabIdx || 0));
    if (tabs.length <= 1) {
      try {
        rec.strip?.dispose();
      } catch {
      }
      rec.strip = null;
      rec.tabBarEl?.classList.add("twm-window-tabbar--hidden");
      return;
    }
    rec.tabBarEl?.classList.remove("twm-window-tabbar--hidden");
    if (!rec.strip) {
      rec.strip = createTabStrip({
        hostEl: rec.tabBarEl,
        taxonomy: this.taxonomy,
        onAction: (action, data) => this._windowTabAction(winId, action, data)
      });
    }
    rec.strip.update(tabs, rec.activeTabIdx);
  }
  /** The window strip's half of `_leafTabAction` — the same four verbs
   *  against the window record instead of against the tree. */
  _windowTabAction(winId, action, data = {}) {
    const rec = this._windowToLeaf.get(winId);
    if (!rec) return;
    const tabs = rec.tabs || [];
    if (action === "switch") {
      this.showWindowTab(winId, data.idx);
      return;
    }
    if (action === "close") {
      if (data.idx < 0 || data.idx >= tabs.length) return;
      if (tabs.length <= 1) {
        try {
          rec.window.close({ force: true });
        } catch {
        }
        return;
      }
      tabs.splice(data.idx, 1);
      if (data.idx < rec.activeTabIdx) rec.activeTabIdx -= 1;
      else if (data.idx === rec.activeTabIdx) {
        rec.activeTabIdx = Math.max(0, data.idx - 1);
        this._mountWindowTab(winId);
      }
      this._syncWindowTabs(winId);
      this._notifyChange("window-tab-close");
      return;
    }
    if (action === "move") {
      const { from, to } = data;
      if (from == null || to == null) return;
      if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return;
      const moved = tabs.splice(from, 1)[0];
      tabs.splice(to, 0, moved);
      if (rec.activeTabIdx === from) rec.activeTabIdx = to;
      else if (from < rec.activeTabIdx && to >= rec.activeTabIdx) rec.activeTabIdx -= 1;
      else if (from > rec.activeTabIdx && to <= rec.activeTabIdx) rec.activeTabIdx += 1;
      this._syncWindowTabs(winId);
      return;
    }
    if (action === "menu") this._showWindowTabContextMenu(winId, data.idx, data.x, data.y);
  }
  /** Show one of a floated pane's tabs. Public because a window is the only
   *  place this list exists — nothing else can reach it. */
  showWindowTab(winId, idx) {
    const rec = this._windowToLeaf.get(winId);
    if (!rec) return false;
    const tabs = rec.tabs || [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= tabs.length) return false;
    if (idx === rec.activeTabIdx) return true;
    rec.activeTabIdx = idx;
    this._mountWindowTab(winId);
    this._syncWindowTabs(winId);
    this._persist();
    this._notifyChange("window-tab-switch");
    return true;
  }
  /** Tear the current mount down and mount the active tab in its place.
   *  `rec.original` follows, so a later dock puts back what is on screen. */
  _mountWindowTab(winId) {
    const rec = this._windowToLeaf.get(winId);
    if (!rec) return;
    const tab = (rec.tabs || [])[rec.activeTabIdx];
    if (!tab) return;
    try {
      rec.mountInfo?.destroy?.();
    } catch {
    }
    rec.bodyEl.innerHTML = "";
    rec.mountInfo = this.content.mount(
      tab.kind,
      rec.bodyEl,
      tab.props || {},
      { ...this.ctx, wm: this, windowId: winId }
    );
    rec.original = {
      kind: tab.kind,
      props: { ...tab.props || {} },
      title: rec.mountInfo?.title || tab.title || tab.kind
    };
    this._setWindowTitle(rec, rec.original.title);
  }
  /** The window's title, in both places it is kept. */
  _setWindowTitle(rec, title) {
    try {
      const titleEl = rec.window?.element?.querySelector(".twm-managed-window__title");
      if (titleEl) titleEl.textContent = title;
      if (rec.window) rec.window.title = title;
    } catch {
    }
  }
  /** The window strip's context menu. Deliberately the close verbs and
   *  nothing else: a tab in a window is already out of the tree, so
   *  "open in a window" — the verb R9 adds to a PANE's tab menu — has
   *  nowhere further to go. */
  _showWindowTabContextMenu(winId, idx, x, y) {
    const rec = this._windowToLeaf.get(winId);
    const tabs = rec?.tabs || [];
    if (!tabs.length) return;
    const items = [{ label: "Close tab", icon: "close", action: "close" }];
    if (tabs.length > 1) {
      items.push({ label: "Close other tabs", icon: "tab_close", action: "close-others" });
    }
    showContextMenu(x, y, items, (action) => {
      const live = this._windowToLeaf.get(winId);
      if (!live) return;
      if (action === "close") this._windowTabAction(winId, "close", { idx });
      else if (action === "close-others") {
        const keep = live.tabs[idx];
        if (!keep) return;
        const remount = idx !== live.activeTabIdx;
        live.tabs = [keep];
        live.activeTabIdx = 0;
        if (remount) this._mountWindowTab(winId);
        this._syncWindowTabs(winId);
        this._notifyChange("window-tab-close-others");
      }
    });
  }
  /**
   * Re-parent every pane-contained window into its pane's CURRENT wrap.
   *
   * Called after each repaint. A leaf's wrap is cached per (kind, props, tab
   * fingerprint) and rebuilt when any of those change, so a window parented
   * into it is thrown away with the old wrap — silently, because nothing
   * throws and the window object is still perfectly alive.
   *
   * `moveTo` returns false when the container has not changed, so this is a
   * no-op on every repaint that did not rebuild the pane in question.
   */
  _rehomeContainedWindows() {
    if (!this.promoteInPlace) return;
    for (const [, rec] of this._windowToLeaf) {
      if (!rec.homeLeafId || !rec.window) continue;
      if (rec.window.dragOrigin) continue;
      if (rec.window.isMaximized && rec.window.container === this.rootEl) continue;
      if (rec.desktopIdx !== this.desktops.activeIdx) {
        if (!rec.homeContainer && rec.window.element?.isConnected) {
          try {
            rec.window.element.remove();
          } catch {
          }
        }
        continue;
      }
      if (!rec.homeContainer && rec.homeLeafId) {
        const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
        if (tree && !tree.get(rec.homeLeafId)) {
          let survivor = tree.primaryLeafId();
          if (!survivor) {
            const spawned = this._spawnContentLeaf(tree);
            if (spawned) {
              this._seedHome(tree, spawned);
              this._canonicalize(tree, this.desktops.desktops[rec.desktopIdx]);
              survivor = tree.primaryLeafId();
            }
          }
          if (survivor) rec.homeLeafId = survivor;
        }
      }
      const paneEl = rec.homeContainer ? rec.homeContainer() || null : this.renderer.leafEl(rec.homeLeafId);
      if (!paneEl) continue;
      if (paneEl === rec.window.container) {
        const el = rec.window.element;
        if (el && !el.isConnected) {
          try {
            paneEl.appendChild(el);
          } catch (err) {
            console.warn("[wm] re-attach failed", err);
          }
        }
        continue;
      }
      try {
        rec.window.moveTo(paneEl);
      } catch (err) {
        console.warn("[wm] re-home failed", err);
      }
    }
  }
  /**
   * C21, as a verb a consumer can call: put THIS window back where it belongs
   * and say whether it moved.
   *
   * The taskbar needs it. A minimised window's element may be out of the
   * document — its desktop is not on screen, or its pane was closed — and
   * un-minimising it in that state clears `isMinimized` (so its button
   * disappears, the last handle on it) while showing nothing. `restore` has
   * to be able to repair the window BEFORE it makes it visible, and
   * `_rehomeContainedWindows` is the thing that knows how; it was simply not
   * reachable, and `taskbar.js`'s own docstring asserted it ran for these
   * windows when the guard above meant it did not.
   *
   * IT SWITCHES DESKTOPS WHEN IT HAS TO, and that is the half a bare re-home
   * cannot do. A window belongs to one desktop; if that desktop is not on
   * screen, the honest answer to *show me this window* is the one every
   * taskbar in every window manager gives — go to where it lives. Restoring
   * it onto the page the user happens to be looking at would move a window
   * between pages as a side effect of asking to see it, and that is a tile
   * decision being made by a window verb.
   *
   * @param {object} win a live ManagedWindow
   * @returns {boolean} whether this WM owns it (and so has revealed it)
   */
  revealWindow(win) {
    if (!win) return false;
    let rec = null;
    for (const [, r] of this._windowToLeaf) {
      if (r.window === win) {
        rec = r;
        break;
      }
    }
    if (!rec) return false;
    if (!rec.homeLeafId && !rec.homeContainer) return false;
    if (rec.desktopIdx !== this.desktops.activeIdx && this.desktops.desktops[rec.desktopIdx]) {
      this.switchDesktop(rec.desktopIdx);
    } else {
      this._rehomeContainedWindows();
    }
    return true;
  }
  /**
   * R12. The rectangle an ESCAPED window may occupy — the tiles, and not the
   * panels — in the root's own coordinates.
   *
   * R1 let a window leave its pane so it could reach another one, and the
   * cheapest box to let it leave into is the root every tile shares. But the
   * root holds the docked panels too, so the bottom edge stopped being an
   * edge: a window could be dragged down over the bottom panel and dropped
   * there, half-covering a surface that has its own scroll and its own
   * chrome, with no way to tell it had happened except that it looked wrong.
   *
   * The answer is the UNION OF THE CONTENT LEAVES rather than "the root minus
   * the panel I know about": panels dock left, right and bottom, an embedder
   * may show any combination of them, and each one may be collapsed. A union
   * of the tiles is right for all of those without enumerating any of them,
   * and it degrades to the root when a desktop is somehow all panel.
   */
  _tileBounds() {
    const root = this.rootEl;
    if (!root) return null;
    const layer = this._layerRect();
    if (!layer) return null;
    const rootRect = root.getBoundingClientRect();
    const ox = rootRect.left + root.clientLeft - root.scrollLeft;
    const oy = rootRect.top + root.clientTop - root.scrollTop;
    return {
      minX: layer.left - ox,
      minY: layer.top - oy,
      width: layer.width,
      height: layer.height
    };
  }
  /**
   * R13. THE LAYER, in the VIEWPORT pixels a hit-test speaks — the union of
   * the content leaves, before it is converted into anybody's coordinates.
   *
   * This is `_tileBounds` with the last step taken off, and it stays a
   * separate function rather than being folded back into it because the two
   * frames have different readers: `_tileBounds` answers `dragBounds`, which
   * `ManagedWindow._bounds()` uses to clamp a window in the ROOT's
   * coordinates, and this answers anything measuring against the page.
   *
   * R14 REMOVED ITS OTHER READER. R13's maximise preview was drawn from here
   * so that it would be the same measurement `toggleMaximize` would deliver
   * through `dragBounds` — C15's rule, THE PREVIEW MAY NOT PROMISE A
   * RECTANGLE THE DROP DOES NOT DELIVER, applied to the one mode that did not
   * dock. There is no such mode now: the top edge docks like every other
   * zone, its preview is the TILE (`_homeDockTarget`), and the layer's only
   * remaining job is the clamp. Kept as its own function because the clamp
   * still needs the union of the CONTENT leaves rather than the root, which
   * is a definition, not a call site.
   *
   * The union of the CONTENT LEAVES rather than the root, for the reason
   * `_tileBounds` gives at length: the root holds the docked panels too.
   *
   * Null when nothing has a box yet — a layout that has not happened, a
   * desktop whose tiles are all zero-sized. Every caller treats that as "do
   * not promise anything", which is the only honest answer available.
   */
  _layerRect() {
    let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
    for (const leaf of this._tree().leaves()) {
      if (PANEL_KINDS.has(leaf.content?.kind)) continue;
      const el = this.renderer.leafEl(leaf.id);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      l = Math.min(l, box.left);
      tp = Math.min(tp, box.top);
      r = Math.max(r, box.right);
      b = Math.max(b, box.bottom);
    }
    if (!Number.isFinite(l)) return null;
    return { left: l, top: tp, width: r - l, height: b - tp };
  }
  /** Dock the window's content back into the tile it came from — or, when it
   *  came from none, into the desktop's primary tile — then close the window.
   *
   *  R7. This is what the MAXIMIZE button now does, so it is reached far more
   *  often than it was as a button of its own, and "somewhere other than where
   *  the window came from" stopped being a defensible answer. Promoting a pane
   *  re-seeds it with the root kind — ground for the window to stand on — so
   *  FILLING that pane is the exact inverse: the content goes back where it
   *  was lifted from, replacing the ground it has been standing on.
   *
   *  A home pane that has since acquired content is a different story. The
   *  user opened something there, and replacing it would destroy work the
   *  window knows nothing about, so the content joins it as a tab instead.
   *  With no home pane at all — an Alt+N window, or any window under an
   *  embedder that does not confine promotions — this is the primary-tile tab
   *  it has always been. */
  bringBackWindow(windowId) {
    const rec = this._windowToLeaf.get(windowId);
    if (!rec) return false;
    const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
    const home = rec.homeLeafId ? tree?.get(rec.homeLeafId) : null;
    if (home && home.kind === "leaf") {
      rec._dock = {
        leafId: rec.homeLeafId,
        mode: this._isStartTile(home) ? "fill" : "tab"
      };
    }
    rec._demoting = true;
    try {
      rec.window.close({ force: true });
    } catch (err) {
      console.warn("[wm] bringBack: close failed", err);
    }
    return true;
  }
  /**
   * R11. ADOPT A WINDOW THE EMBEDDER BUILT ITSELF.
   *
   * Everything R1–R10 gave a window — escaping its pane for the length of a
   * drag, going half-transparent once it is outside, the edge/body/ground
   * drops, maximise meaning *back to tile* — is wired in `_promote`, and so
   * belongs only to windows this WM lifted out of the tree. An embedder that
   * stands its own `ManagedWindow` on a pane (`snap: true` against the pane's
   * ground) got none of it: `_snapCommit` resolves the window through
   * `_windowToLeaf` and returns false for one it never built, so every drop
   * previewed correctly and then quietly did nothing.
   *
   * The fix is not to make the WM build those windows — the embedder has its
   * own reasons for the ones it builds, and taking that over would mean
   * taking over their content, their identity and their lifetime. It is to
   * let a window JOIN the tree's world after the fact, which needs exactly
   * two things: the drag options set on the component, and a record saying
   * what content to restore when the window is docked.
   *
   * CALL THIS BEFORE `show()`. `maximizeIcon` is read when the chrome is
   * built (`managed_window.js:703`) and the chrome is built lazily by `show`
   * (`:281`), so a window adopted afterwards would carry the right behaviour
   * behind a button still drawing a square.
   *
   * TEARDOWN STAYS THE EMBEDDER'S. `mountInfo` is optional and normally
   * omitted: a window that already destroys its own content in its `onClose`
   * would otherwise destroy it twice, once here and once there. The
   * embedder's handler is chained, not replaced, and runs after this one — so
   * a dock has already re-mounted the content into the tile by the time the
   * window's own teardown disposes of the copy that was floating.
   *
   * @param {object} win  a live ManagedWindow, not yet shown
   * @param {object} spec
   * @param {string} spec.kind          content kind to restore into a tile
   * @param {object} [spec.props]       its props
   * @param {string} [spec.title]       the tab title after a dock
   * @param {string} [spec.homeLeafId]  the pane it stands on: what "back to
   *        tile" targets, and what the probe stays silent inside
   * @param {function} [spec.homeContainer]  `() => HTMLElement` — the box
   *        WITHIN that pane the window is contained to. A canvas pane's
   *        ground is not the leaf wrap, and re-homing to the wrap after a
   *        repaint would lift the window out of the ground it belongs to.
   * @param {object} [spec.mountInfo]   `{destroy}`, if teardown is ours
   * @returns {string|null} the window id, or null if it could not be adopted
   */
  adoptWindow(win, spec = {}) {
    const winId = win?.id;
    if (!winId || !spec.kind) return null;
    if (this._windowToLeaf.has(winId)) return winId;
    if (this.snapPromotion) {
      win.snap = win.snap && win.canDrag && win.canResize;
      win.snapController = this._snapController();
    }
    win.dragHost = () => this.rootEl;
    win.dragBounds = () => this._tileBounds();
    win.onMaximize = () => this.bringBackWindow(winId);
    win.maximizeIcon = "close_fullscreen";
    win.maximizeTitle = "Back to tile";
    const original = {
      kind: spec.kind,
      props: spec.props || {},
      title: spec.title || spec.kind
    };
    this._windowToLeaf.set(winId, {
      leafId: null,
      desktopIdx: this.desktops.activeIdx,
      original,
      mountInfo: spec.mountInfo || null,
      window: win,
      contentEl: null,
      bodyEl: null,
      tabBarEl: null,
      tabs: [original],
      activeTabIdx: 0,
      strip: null,
      homeLeafId: spec.homeLeafId || null,
      homeContainer: spec.homeContainer || null,
      adopted: true,
      _demoting: false
    });
    const prior = win.onClose;
    win.onClose = () => {
      this._onManagedWindowClosed(winId, null);
      prior?.();
    };
    return winId;
  }
  // ══ C15. Snap-to-promote ══════════════════════════════════════════
  /**
   * The snap controller a promoted window is given. It answers the two
   * questions ManagedWindow's own C11 snap cannot, because both are about a
   * tree it does not know exists:
   *
   *   probe   which TILE is under the pointer, and — since R15 — which edge
   *           of it THE DRAGGED WINDOW'S OWN BORDERS have reached, and what
   *           would dropping there actually produce: a half of that tile, a
   *           quarter of the layer, the tile entire, or (R13, at the top edge
   *           of the pane the window already stands on) the whole layer,
   *           which is the one answer that is not a dock at all. The preview
   *           draws exactly that rectangle, because a preview that promises a
   *           half and delivers a quarter is worse than no preview.
   *   commit  put the window in the tree — or, for R13's maximise, leave it
   *           floating and give it the layer. Over an EMPTY tile the dock is
   *           unambiguous and happens on release. Over an OCCUPIED tile the
   *           edges are unambiguous too — the drag chose a side, so the
   *           side is the split — and only the CENTRE was ever genuinely a
   *           question, which is why it is the zone that changed most.
   *
   * Built once and reused: the probe runs per pointermove and allocating a
   * closure per window per drag is free, but the memo keeps the identity
   * stable for anyone comparing controllers.
   */
  _snapController() {
    if (this._snapCtl) return this._snapCtl;
    this._snapCtl = {
      probe: (e, win) => this._snapProbe(e, win),
      commit: (probe, win) => this._snapCommit(probe, win)
    };
    return this._snapCtl;
  }
  /**
   * How close to a tile's edge the DRAGGED WINDOW'S matching edge must come
   * for a dock to arm — in PIXELS, and a narrow band. Since R15 it is also
   * the minimum distance the drag must have travelled toward that edge
   * inside the window's own pane; `_snapSide` argues both, and this is the
   * one constant either of them is measured in.
   *
   * This was a third of the tile, measured as a fraction, with the remaining
   * middle ninth treated as a fourth zone that offered a three-way choice.
   * Both halves of that were wrong, and together they made docking the
   * DEFAULT rather than a deliberate gesture:
   *
   *   - A fraction means the band grows with the tile. On a maximised layer
   *     a "third" is several hundred pixels, so a window could not be moved
   *     anywhere near the left half of the screen without arming a split.
   *   - The centre zone armed over the whole middle of every tile and
   *     previewed the ENTIRE tile, so simply picking a window up and moving
   *     it a few pixels lit the whole pane. Every move looked like a dock
   *     because every move WAS one.
   *
   * Aero snap is an edge gesture: you push THE WINDOW at an edge — which is
   * what R15 finally made it measure. So the band is a fixed 28px from the
   * edge, and what lies past it is decided by the
   * pane rather than by the pointer: in the window's OWN pane the centre
   * arms nothing at all and the drop is simply a window that moved (R2), and
   * in any other pane it is the non-destructive tab or fill of R5/R6. The
   * band itself never grows with the tile, which is the whole of the fix.
   * Docking a whole tile is also still available without any drag at all —
   * the "back to tile" button in the window's own chrome, which names the
   * destination instead of guessing it.
   */
  static get SNAP_EDGE_PX() {
    return 28;
  }
  _snapProbe(e, win) {
    const leafEl = this._leafElAt(e.clientX, e.clientY, win);
    if (!leafEl) return null;
    const own = !!(win?.dragOrigin && leafEl.contains(win.dragOrigin));
    const leafId = leafEl.dataset.leafId;
    const desktopIdx = this.desktops.activeIdx;
    const leaf = this._tree().get(leafId);
    if (!leaf || leaf.kind !== "leaf") return null;
    if (String(leaf.content?.kind || "").startsWith("panel:")) return null;
    const r = leafEl.getBoundingClientRect();
    const side = leaf.content ? this._snapSide(r, e, win, own) : null;
    if (own && side === "top") {
      const home = this._homeDockTarget(win);
      if (!home) return null;
      return {
        key: `${home.leafId}:home`,
        rect: home.rect,
        leafId: home.leafId,
        desktopIdx,
        side,
        mode: "home",
        leafRect: r
      };
    }
    return this._dropZoneFor({ leafId, leaf, r, side, own, desktopIdx });
  }
  /**
   * R17 (C33). THE ZONE MATRIX'S TAIL — SPLIT / NOTHING / TAB / FILL — SHARED
   * BY THE TWO THINGS THAT CAN BE DROPPED ON A TILE.
   *
   * A dragged WINDOW and a dragged TAB ask the same question of a pane: given
   * that the pointer is in this leaf and the edge test answered `side`, what
   * would releasing here produce? Every answer below was written for the
   * window drop and every one of them is right for a tab, so this is an
   * extraction and not a generalisation — `_snapProbe` keeps everything ABOVE
   * it unchanged, including R14's `own && side === 'top'` home branch, which
   * is a window's alone (a tab has no window to bring back) and therefore
   * stays where it was, between the side computation and this call.
   *
   * The alternative was a second copy in `tabDropProbe`, and a second copy of
   * a matrix the product owner has already revised four times (R2, R4, R5/R6,
   * R14) is a guarantee that the two gestures will one day disagree about
   * what the centre of a start tile means. `web/js/shell/snap_zones.test.mjs`
   * in the Tables consumer asserts every cell of the window matrix and is the
   * regression gate on this extraction: byte-identical window behaviour is
   * the whole of its back-compatibility claim.
   */
  _dropZoneFor({ leafId, leaf, r, side, own, desktopIdx }) {
    if (side) {
      return {
        key: `${leafId}:${side}`,
        rect: _halfOf(r, side),
        leafId,
        desktopIdx,
        side,
        mode: "split",
        leafRect: r
      };
    }
    if (own) return null;
    const fills = !leaf.content || this._isStartTile(leaf);
    return {
      key: `${leafId}:${fills ? "fill" : "tab"}`,
      rect: _halfOf(r, null),
      leafId,
      desktopIdx,
      side: null,
      mode: fills ? "fill" : "tab",
      leafRect: r
    };
  }
  /**
   * R18 (C33). THE SAME PROBE, FOR A DRAGGED TAB — PUBLIC, because the
   * renderer is what holds the drag and the renderer is not the WM.
   *
   * ══ WHY THIS IS NOT `_snapProbe(e, null)` ═══════════════════════════
   *
   * It very nearly is, and the geometry underneath is literally the same
   * code: `_snapSide(r, e, null, false)` falls to the POINTER-distance branch
   * by construction — `_draggedRect(null)` is null, so `dist` takes the
   * `e.clientX/Y` arm and `along` scores every edge zero. A tab has no
   * rectangle being dragged and no `_dragState`, and that is not a gap to
   * paper over: the pointer IS the whole gesture for a tab, which is exactly
   * the pre-R15 model that `_snapSide`'s fallback preserves.
   *
   * Two things differ, and neither could be expressed by passing a null
   * window to `_snapProbe`:
   *
   *   R14's HOME BRANCH IS A WINDOW'S. `own && side === 'top'` means "put the
   *   window back in its tile", and a tab is already in a tile. Reaching that
   *   branch with `win === null` would ask `_homeDockTarget(null)`, which
   *   answers null, so the top edge of the source pane would fall silent
   *   rather than split — a hole in the matrix produced by inheritance.
   *
   *   A SINGLE-TAB SOURCE PANE ARMS NOTHING, ANYWHERE. `_dropZoneFor` already
   *   silences the source pane's CENTRE; its edges are useful for a pane with
   *   siblings ("tear this tab off into a split beside the others") and are a
   *   wash for a pane with one tab, where the outcome is the pane's only
   *   content in one half and a freshly seeded ground in the other. That is a
   *   preview promising something no one wants, so it is refused BEFORE the
   *   preview is drawn rather than at the drop — C15's rule is that the
   *   rectangle drawn is the one released, and the honest way to keep it is
   *   never to draw one.
   *
   * `own: false` is passed to `_snapSide` deliberately. Its `own` parameter
   * gates R2's direction guard, which measures a WINDOW's travel out of
   * `_dragState`; a tab drag has none, so `guarded` would be false anyway and
   * passing `true` would only obscure that. `own` still governs the centre,
   * which is why it goes to `_dropZoneFor` and not to `_snapSide`.
   *
   * @param {{clientX: number, clientY: number}} e   the pointer, mid-drag
   * @param {{sourceLeafId?: string}} [opts]         the leaf the tab left
   * @returns {object|null} the same probe shape a window drop produces
   */
  tabDropProbe(e, { sourceLeafId = null } = {}) {
    const leafEl = this._leafElAt(e.clientX, e.clientY, null);
    if (!leafEl) return null;
    const leafId = leafEl.dataset.leafId;
    const tree = this._tree();
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== "leaf") return null;
    if (String(leaf.content?.kind || "").startsWith("panel:")) return null;
    const own = !!sourceLeafId && leafId === sourceLeafId;
    if (own) {
      const src = tree.get(sourceLeafId);
      const count = Array.isArray(src?.tabs) ? src.tabs.length : 0;
      if (count <= 1) return null;
    }
    const r = leafEl.getBoundingClientRect();
    const side = leaf.content ? this._snapSide(r, e, null, false) : null;
    return this._dropZoneFor({
      leafId,
      leaf,
      r,
      side,
      own,
      desktopIdx: this.desktops.activeIdx
    });
  }
  /**
   * R15. WHICH EDGE OF THE PANE THE *WINDOW* IS BEING PUSHED INTO.
   *
   * ══ THE BUG THIS EXISTS TO FIX ═══════════════════════════════════════
   *
   * The band was measured from the POINTER, and the pointer is wherever the
   * hand happened to grab the title bar. Grab a 900px window in the middle
   * of its bar and shove it right: `dragBounds` clamps it, its right border
   * sits hard against the layer's right edge, and the pointer is still 450px
   * away from that edge — outside every band, so nothing arms and the window
   * simply stops dead against the side of the screen. Reported twice:
   * *"snapping enables based on mouse position but actually it needs to
   * enable based on the dragged window bounds (e.g. window right border
   * distance from right snapping area)"*.
   *
   * The bigger the window the worse it got, and the gesture only ever worked
   * if you happened to grab near the edge you were aiming at — the bottom
   * edge was effectively unreachable for any tall window, because a title bar
   * is at the TOP of the thing you are dragging.
   *
   * So each of the four distances is now between the window's own border and
   * the matching border of the pane. `right` arms when the window's right
   * border comes within the band of the pane's right border, and so on round.
   *
   * ══ WHAT DID *NOT* CHANGE ════════════════════════════════════════════
   *
   * WHICH PANE is still the pointer's answer (`_leafElAt`), and so is `own`.
   * The zone matrix is about a pane — the window's own pane means something
   * different from any other pane — and a window can lie across three of
   * them at once while the pointer is in exactly one. Only the question
   * *"which edge of THIS pane"* moved onto the window's rectangle; the
   * question *"which pane"* was never the one the product owner complained
   * about. Everything downstream is untouched: the preview is still
   * `_halfOf(paneRect, side)`, so the rectangle drawn is the rectangle the
   * drop delivers, and a `side` reaching the branches below means exactly
   * what it meant before.
   *
   * ══ SHORTFALL CLAMPED AT ZERO, BECAUSE A WINDOW OVERHANGS ═════════════
   *
   * (R16 corrects R15 here. R15 said *unsigned*, and unsigned was wrong;
   * the paragraph below is why, and `_snapSide` carries the measurement.)
   *
   * The pointer is inside the pane by construction — `_leafElAt` found the
   * pane by hit-testing it — so a signed distance was always positive. A
   * WINDOW has no such guarantee: it is clamped to the layer, not to the
   * pane, so a window wider than the pane under the pointer sticks out of
   * both sides of it and its border is 20px PAST the pane's border rather
   * than 20px short of it. Both readings are "hard against that edge".
   *
   * R15 spelled that `Math.abs`, and `Math.abs` only holds the reading while
   * the overhang stays inside the band. Past that it counts UP again, so the
   * zone armed and then DISARMED as the shove continued, and a window
   * meaningfully wider than the pane armed nothing at all. The right spelling
   * is a shortfall clamped at zero: **past the edge IS the edge**, at
   * distance zero, and it stays there however far the shove carries it.
   *
   * ══ THE DIRECTION GUARD, WHICH IS WHAT KEEPS R2 ALIVE ════════════════
   *
   * Edge-based testing has a failure the pointer never had: a window that is
   * ALREADY at an edge is in that band before the drag starts. A window
   * parked at the left of its pane would arm a left split on the first
   * millimetre of any drag, and a window that fills its pane would arm on
   * every drag in every direction — which is precisely the *"every move
   * looked like a dock because every move WAS one"* failure `SNAP_EDGE_PX`
   * was written to end, arriving from the other direction.
   *
   * So in the window's OWN pane an edge arms only if the drag actually
   * carried the window at it: the pointer must have travelled more than one
   * band's width toward that edge since the press. A nudge (R2's complaint,
   * and the surviving reason the own-pane centre is silent) moves a handful
   * of pixels and arms nothing; a shove moves hundreds and arms the edge it
   * was aimed at. The band's own width is the unit, because a movement
   * smaller than the band cannot be the difference between being in it and
   * not.
   *
   * IN ANY OTHER PANE THE GUARD IS OFF, deliberately. R2 is a rule about the
   * pane a window already lives on — the only place a "nudge" exists. Drag a
   * window rightwards out of pane A and into pane B and its LEFT border is
   * what enters pane B first: with the guard on, aiming at the left half of
   * the pane to your right would be impossible, since arriving there always
   * means travelling right. The window is translucent by then (R3) and every
   * drop on a foreign pane docks, so there is no nudge to protect.
   *
   * The displacement is read from `ManagedWindow._dragState.startX/startY`,
   * the POINTER's position at the press — not from the window's own x/y,
   * which stop changing the moment the clamp bites while the gesture very
   * much continues. A caller with no drag state (a synthetic probe, an
   * embedder driving the controller by hand) yields no displacement at all
   * and the guard is skipped rather than failing closed: it can only ever
   * suppress an edge, never invent one.
   *
   * ══ CORNERS: THE PRECEDENCE, MADE EXPLICIT ═══════════════════════════
   *
   * Two edges can be in range at once, and with window borders that is no
   * longer the rarity it was with a pointer — shove a window into a corner
   * and the clamp puts BOTH borders at distance zero, exactly. Under R16 it
   * is not even a corner case: a window as wide as its pane is at zero on
   * the left AND the right for every horizontal position it can occupy, and
   * a floated canvas pane's window is *exactly* that wide. So the order is
   * stated rather than left to whichever way the loop happens to run:
   *
   *   1. NEAREST WINS. Unchanged from R4, and it is what keeps a corner from
   *      being a dead spot: one of the two is always closer.
   *   2. ON A TIE, THE EDGE THE DRAG PUSHED TOWARD WINS. (R16: *toward that
   *      edge*, signed — R15 said "the axis pushed furthest" and spelled it
   *      `Math.abs`, which gives the two ends of one axis the SAME score, so
   *      a left/right tie never broke at all and 'left' won every time by
   *      loop order.) The honest tie-break is the gesture: shove it
   *      rightwards and you get the right zone, upwards and you get the top
   *      zone. Every zone stays reachable and which one you get is something
   *      a hand can aim.
   *   3. STILL TIED — a perfect diagonal, or a probe with no drag state —
   *      falls to the fixed order left, right, top, bottom. That is the order
   *      the R4 loop already resolved ties in (`Object.entries` insertion
   *      order, with a strict `<`), kept so the pointer fallback below
   *      answers exactly what it answered before.
   *
   * ══ THE FALLBACK ═════════════════════════════════════════════════════
   *
   * With no measurable window rectangle — no element, detached, or a box of
   * zero area because layout has not happened — there is nothing to measure
   * and the pointer is the only information in the room. That path is the
   * pre-R15 code, unchanged, signed distances and all. It is what a headless
   * probe gets (jsdom lays nothing out, so every `getBoundingClientRect` is
   * zero), and it is why `web/js/shell/snap_zones.test.mjs` in the Tables
   * consumer still asserts the same matrix against the same coordinates.
   *
   * @param {DOMRect} r  the pane, in viewport pixels
   * @param {{clientX: number, clientY: number}} e  the pointer
   * @param {object} win  the ManagedWindow being dragged
   * @param {boolean} own  is `r` the pane this window's drag escaped?
   * @returns {'left'|'right'|'top'|'bottom'|null}
   */
  _snapSide(r, e, win, own) {
    const edge = _WindowManager.SNAP_EDGE_PX;
    const w = this._draggedRect(win);
    const push = w ? this._dragPush(e, win) : null;
    const guarded = !!(own && push);
    const dist = w ? {
      left: Math.max(0, w.left - r.left),
      right: Math.max(0, r.right - w.right),
      top: Math.max(0, w.top - r.top),
      bottom: Math.max(0, r.bottom - w.bottom)
    } : {
      left: e.clientX - r.left,
      right: r.right - e.clientX,
      top: e.clientY - r.top,
      bottom: r.bottom - e.clientY
    };
    const toward = (name) => {
      if (!guarded) return true;
      if (name === "left") return push.x <= -edge;
      if (name === "right") return push.x >= edge;
      if (name === "top") return push.y <= -edge;
      return push.y >= edge;
    };
    const along = (name) => {
      const dx = push?.x ?? 0, dy = push?.y ?? 0;
      if (name === "left") return -dx;
      if (name === "right") return dx;
      if (name === "top") return -dy;
      return dy;
    };
    let best = null;
    for (const name of ["left", "right", "top", "bottom"]) {
      const d = dist[name];
      if (!(d < edge) || !toward(name)) continue;
      const p = along(name);
      if (!best || d < best.d || d === best.d && p > best.p) best = { name, d, p };
    }
    return best ? best.name : null;
  }
  /** R15. The dragged window's rectangle in VIEWPORT pixels — the frame a
   *  leaf's `getBoundingClientRect` speaks, so the two are directly
   *  comparable — or null when there is nothing to measure.
   *
   *  Read off the element rather than computed from `win.x/y/width/height`,
   *  because those are in whatever container the window is currently parented
   *  to and mid-drag that is the drag host, not the pane being probed.
   *
   *  A zero-area box is "nothing to measure" rather than a rectangle at the
   *  origin: it is what an unlaid-out document gives, and treating it as real
   *  would put every window in the top-left corner of every pane. Same test
   *  `_homeDockTarget` applies to a leaf, for the same reason. */
  _draggedRect(win) {
    const el = win?.element;
    if (!el || el.isConnected === false) return null;
    if (typeof el.getBoundingClientRect !== "function") return null;
    const b = el.getBoundingClientRect();
    if (!b || !b.width || !b.height) return null;
    return b;
  }
  /** R15. How far the POINTER has travelled since the press that began this
   *  drag, or null if this window is not in a drag the WM can see.
   *
   *  The pointer rather than the window: `_applyPosition` clamps the window
   *  to `dragBounds`, so a window shoved at the edge of the layer stops
   *  moving while the gesture continues — and "it stopped because it is
   *  against the edge" is exactly the situation the guard must not read as
   *  "it is not being pushed". */
  _dragPush(e, win) {
    const ds = win?._dragState;
    if (!ds || typeof ds.startX !== "number" || typeof ds.startY !== "number") return null;
    return { x: e.clientX - ds.startX, y: e.clientY - ds.startY };
  }
  /** The topmost `.twm-leaf` under the pointer that is not part of the window
   *  being dragged. `elementsFromPoint` rather than `elementFromPoint`: the
   *  dragged window IS under the pointer — it is what the pointer is holding
   *  — and a hit-test that stops at the first element only ever finds it.
   *
   *  R15 left this alone on purpose: WHICH pane is still the pointer's
   *  answer, and only WHICH EDGE of it moved onto the window's borders. See
   *  `_snapSide`. */
  _leafElAt(x, y, win) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (win?.element && win.element.contains(el)) continue;
      const leafEl = el.closest?.(".twm-leaf");
      if (leafEl && this.rootEl.contains(leafEl)) return leafEl;
    }
    return null;
  }
  /**
   * R14. THE TILE "BACK TO TILE" WOULD PUT THIS WINDOW IN, and the rectangle
   * that draws it — in the VIEWPORT pixels a snap preview is positioned in.
   *
   * `bringBackWindow` resolves its destination privately and then closes the
   * window to reach it, which is everything a button press needs and useless
   * to a PREVIEW. C15's rule is that the rectangle drawn during a drag is the
   * one the drop delivers, and under R14 the drop delivers A TILE — so the
   * resolution has to be readable before the gesture is committed. Reading it
   * out here is what makes the top edge honest: the probe draws what this
   * returns and `_snapCommit` calls `bringBackWindow`, which resolves the
   * same way, from the same record, against the same tree.
   *
   * It is deliberately NOT a second copy of that resolution reduced to "the
   * home leaf". `bringBackWindow`'s fall-through — no home leaf, or one the
   * tree no longer has — is the desktop's PRIMARY tile, which is where
   * `_onManagedWindowClosed` sends a demotion carrying no `_dock`; a probe
   * that previewed the home leaf and then landed in the primary tile would be
   * the bait-and-switch with extra steps.
   *
   * `renderer.leafEl` only knows the leaves of the desktop currently on
   * screen, which is the property that makes the desktop check implicit: a
   * window whose home is on another desktop resolves to no element, this
   * answers null, and the top edge arms nothing rather than previewing a
   * rectangle on a desktop the user cannot see.
   *
   * @param {object} win  a live ManagedWindow
   * @returns {{leafId: string, rect: DOMRect}|null} null when there is
   *   nothing honest to promise: a window the WM never adopted, a desktop
   *   that has gone, a tree with no content leaf at all, or a leaf with no
   *   measurable box (a layout that has not happened yet).
   */
  _homeDockTarget(win) {
    const rec = [...this._windowToLeaf.values()].find((r) => r.window === win);
    if (!rec) return null;
    const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
    if (!tree) return null;
    const home = rec.homeLeafId ? tree.get(rec.homeLeafId) : null;
    const leafId = home && home.kind === "leaf" ? rec.homeLeafId : tree.primaryLeafId();
    if (!leafId) return null;
    const el = this.renderer.leafEl(leafId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { leafId, rect };
  }
  _snapCommit(probe, win) {
    if (!probe) return false;
    const rec = [...this._windowToLeaf.entries()].find(([, r]) => r.window === win);
    if (!rec) return false;
    const [winId, record] = rec;
    const { leafId, desktopIdx, side } = probe;
    if (probe.mode === "home") {
      if (!this.bringBackWindow(winId)) return false;
      win.clearSnapPreview();
      return true;
    }
    if (typeof desktopIdx === "number") record.desktopIdx = desktopIdx;
    const docked = this.dockWindowInto(winId, {
      leafId,
      mode: probe.mode || "split",
      dir: side === "left" || side === "right" ? "h" : "v",
      before: side === "left" || side === "top"
    });
    if (!docked) return false;
    win.clearSnapPreview();
    return true;
  }
  /**
   * Put a floating window's content back into the tree at a NAMED place.
   *
   * `bringBackWindow` is this with `{ mode: 'tab' }` against the primary tile
   * — the answer when the user pressed a button in the window's own chrome
   * and named no destination. A drop names one.
   *
   * The window is CLOSED to do it, exactly as a demote is: the content
   * factory re-mounts inside the tile, and a factory that must not lose live
   * state across that boundary is the embedder's problem to solve (it is why
   * the registry is keyed on (kind, props) rather than on a DOM node).
   *
   * @param {string} windowId
   * @param {{leafId: string, mode: 'fill'|'tab'|'split', dir?: 'h'|'v',
   *          before?: boolean}} target
   */
  dockWindowInto(windowId, target) {
    const rec = this._windowToLeaf.get(windowId);
    if (!rec || !target?.leafId) return false;
    rec._dock = { ...target };
    rec._demoting = true;
    try {
      rec.window.close({ force: true });
    } catch (err) {
      console.warn("[wm] dock: close failed", err);
      return false;
    }
    return true;
  }
  /**
   * Move a managed window to another desktop.
   *
   * ══ IT USED TO REWRITE ONE INTEGER, AND THAT MOVED NOTHING ═════════
   *
   * The sentence that stood here — *"the window itself stays on screen
   * (managed windows are global)"* — was true of a window floating over the
   * root and false of every window this WM promotes under `promoteInPlace`,
   * which is CONTAINED IN A TILE (C21). Rewriting `desktopIdx` left such a
   * window standing in the pane it was already in, on the page the user was
   * already looking at: *Move to desktop Views* appeared to do nothing at
   * all. Then *Back to tile* resolved against the new desktop's tree and
   * docked the content onto a page nobody was watching, so the window
   * vanished here and its table turned up over there.
   *
   * Three things move it for real. The index, so every later resolution
   * agrees. The HOME LEAF, re-pointed at a ground that exists in the
   * destination — without it the record names a leaf of the tree it just
   * left, and `_rehomeContainedWindows` would either skip it forever or
   * repair it to a pane on the wrong page. And a render, which is where the
   * element is taken off the page the window has left (or parented into its
   * new ground, when the destination is the desktop on screen).
   *
   * An ADOPTED window (`homeContainer`) keeps its own resolution: the
   * embedder owns the box it stands in, and re-pointing a leaf id it does not
   * read would be a change with no effect wearing the look of one.
   */
  moveWindowToDesktop(windowId, targetIdx) {
    const rec = this._windowToLeaf.get(windowId);
    if (!rec) return;
    if (rec.desktopIdx === targetIdx) return;
    this.desktops.ensureCount(targetIdx + 1);
    rec.desktopIdx = targetIdx;
    if (!rec.homeContainer && rec.homeLeafId) {
      const target = this.desktops.desktops[targetIdx]?.tree;
      rec.homeLeafId = target?.primaryLeafId() || null;
    }
    this.renderer.render();
    this._persist();
    this._notifyChange("window-moved");
  }
  /**
   * R8. Put a floated pane's tabs back into a leaf — ALL of them, in the
   * order they had, with the one that was showing still showing.
   *
   * Every dock goes through here, and that is the point: `bringBackWindow`,
   * a drop on a tile's body, a drop on an edge and the fall-through when the
   * named destination vanished are four routes to one question — *where do
   * these tabs go* — and four copies of the answer would disagree about the
   * third one within a release. A window promoted before R8 (or by
   * `_navigateWindow`, which never had tabs) carries no list, so `original`
   * is the fallback and the single-tab path reduces to exactly what this
   * replaced.
   *
   * `replace` is the difference between filling a leaf and joining one: a
   * fresh split leaf and a `fill` drop want the first tab to BECOME the
   * leaf's content, while a `tab` drop and "back to tile" append beside what
   * is already there.
   */
  _restoreTabs(tree, leafId, rec, { replace }) {
    if (!leafId) return false;
    const tabs = Array.isArray(rec.tabs) && rec.tabs.length ? rec.tabs : [{
      kind: rec.original.kind,
      props: rec.original.props,
      title: rec.original.title
    }];
    const active = Math.max(0, Math.min(tabs.length - 1, rec.activeTabIdx || 0));
    let firstIdx = -1;
    tabs.forEach((tab, i) => {
      const content = { kind: tab.kind, props: tab.props || {} };
      const title = tab.title || tab.kind || "";
      if (i === 0 && replace) {
        tree.setLeafContent(leafId, content, title);
        firstIdx = 0;
        return;
      }
      const at = tree.appendLeafTab(leafId, content, title);
      if (at >= 0 && firstIdx < 0) firstIdx = at;
    });
    if (firstIdx < 0) return false;
    tree.setActiveLeafTab(leafId, firstIdx + active);
    tree.focus(leafId);
    return true;
  }
  _onManagedWindowClosed(winId, mountInfo) {
    const rec = this._windowToLeaf.get(winId);
    this._windowToLeaf.delete(winId);
    if (!rec) return;
    try {
      (rec.mountInfo || mountInfo)?.destroy?.();
    } catch {
    }
    try {
      rec.strip?.dispose();
    } catch {
    }
    const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
    if (!tree) return;
    if (rec._demoting && rec._dock) {
      const target = tree.get(rec._dock.leafId);
      if (target && target.kind === "leaf") {
        const { mode, dir, before } = rec._dock;
        if (mode === "tab") {
          this._restoreTabs(tree, rec._dock.leafId, rec, { replace: false });
        } else if (mode === "split") {
          const newId = tree.split(rec._dock.leafId, dir);
          if (newId) {
            this._restoreTabs(tree, newId, rec, { replace: true });
            _halveInto(tree, rec._dock.leafId, newId);
            if (before) _swapSiblings(tree, rec._dock.leafId, newId);
            tree.focus(newId);
          }
        } else {
          this._restoreTabs(tree, rec._dock.leafId, rec, { replace: true });
        }
      } else {
        this._restoreTabs(tree, tree.primaryLeafId(), rec, { replace: false });
      }
    } else if (rec._demoting) {
      let pid = tree.primaryLeafId();
      let spawned = false;
      if (!pid) {
        pid = this._spawnContentLeaf(tree);
        spawned = true;
      }
      if (pid) {
        this._restoreTabs(tree, pid, rec, { replace: false });
        if (spawned) this._canonicalize(tree, this.desktops.desktops[rec.desktopIdx]);
      }
    }
    if (this.desktops.active().tree === tree) this.renderer.render();
    this._persist();
    this._notifyChange(rec._demoting ? "window-demoted" : "window-closed");
  }
  /** Post-show DOM hook: wire a right-click context menu on the topbar.
   *
   *  R7. IT USED TO INJECT A BUTTON HERE, and that is the whole of what
   *  changed. "Back to tile" was a fourth button squeezed left of Close,
   *  built by reaching into four of ManagedWindow's internal class names —
   *  the coupling C6 exists to avoid — and it sat next to a MAXIMIZE button
   *  that did the one thing a window lifted out of a tile has no use for.
   *  Now the maximize button IS "back to tile" (`onMaximize`, passed where
   *  the window is built), so the verb has one control instead of two and
   *  this hook has no markup of its own to keep in step.
   *
   *  Gone with it: the rule that hid MINIMIZE while the window was maximised.
   *  It existed because minimising a full-screen window strands it — nothing
   *  on screen points at it any more — and a window that cannot maximise
   *  cannot be in that state at all. `managed-window-maximized` (C16) still
   *  fires for everyone else, and `--suppressed` is still styled for the next
   *  consumer that needs to hide one of these. */
  _decorateManagedWindow(win, winId) {
    const topbar = win.element?.querySelector?.(".twm-managed-window__topbar");
    if (!topbar) return;
    topbar.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rec = this._windowToLeaf.get(winId);
      if (!rec) return;
      const items = [
        { label: "Back to tile", icon: "close_fullscreen", action: "back" }
      ];
      if (this.desktops.desktops.length > 1) {
        items.push({ separator: true });
        for (const [i, d] of this.desktops.desktops.entries()) {
          if (i === rec.desktopIdx) continue;
          items.push({
            label: `Move to desktop ${d.label}`,
            icon: "sweep",
            action: `move:${i}`
          });
        }
      }
      items.push({ separator: true });
      items.push({
        label: "Close window",
        icon: "close",
        action: "close",
        danger: true
      });
      showContextMenu(e.clientX, e.clientY, items, (action) => {
        if (action === "back") this.bringBackWindow(winId);
        else if (action === "close") {
          try {
            win.close({ force: true });
          } catch {
          }
        } else if (action?.startsWith?.("move:")) {
          this.moveWindowToDesktop(winId, Number(action.slice(5)));
        }
      });
    });
  }
  // ══ R10. Adjacent start tiles are one start tile ═══════════════════
  /**
   * Merge every run of side-by-side START TILES into one.
   *
   * A start tile is a leaf holding the taxonomy ROOT — the pane a fresh
   * desktop opens with, and the pane `_seedHome` puts back when a tile is
   * emptied. It is not a document: it is the ground, the empty canvas, the
   * "nothing is open here" surface. So two of them side by side are ONE
   * surface with a splitter drawn through it for no reason, and the splitter
   * is worse than decoration — it offers to resize a boundary between two
   * things that are the same thing.
   *
   * This is deliberately NOT run on every tree change, and the reason is
   * `split()`: splitting a start tile seeds the new pane with the root kind
   * too (the never-empty-tile invariant), so a merge on every mutation would
   * undo an Alt+H the instant it happened. It runs where the product owner
   * put it — *"when a maximized (tiled) panel is window-ized, all adjacent
   * non-panel (start tile) tiles get merged to one"* — and is public so an
   * embedder that empties a pane its own way can ask for the same tidy-up.
   *
   * THREE THINGS ARE NEVER MERGED, and each one is a way to lose work:
   *
   *   - `panel:*` leaves. They are chrome, not content; the navigator is not
   *     a start tile and a panel BETWEEN two start tiles means those two are
   *     not adjacent.
   *   - A start tile with WINDOWS STANDING ON IT. The whole point of the
   *     surface is that things float on it, and closing the leaf takes its
   *     ground — and every window clamped to it — out of the document. When
   *     one of a pair is occupied the other merges INTO it; when both are,
   *     neither moves.
   *   - A start tile holding tabs, live or archived. `leaf.content.kind`
   *     names the ACTIVE tab only, and a pane whose other tabs are tables, or
   *     whose `pageTabs` archive holds the three tables a rail click put
   *     there, is a pane with work in it wearing a start tile's face.
   *
   * @param {TileTree} tree
   * @param {string|null} preferLeafId  the leaf to keep when a run is
   *   otherwise a free choice — the pane the caller just emptied, so the
   *   merged surface is the one the user is looking at.
   * @returns {number} how many leaves were absorbed.
   */
  _mergeStartTiles(tree, preferLeafId = null) {
    if (!tree) return 0;
    let absorbed = 0;
    for (; ; ) {
      const pair = this._nextMergeablePair(tree, preferLeafId);
      if (!pair) break;
      const { split, keepIdx, dropIdx, keepId, dropId } = pair;
      split.sizes[keepIdx] = (split.sizes[keepIdx] || 1) + (split.sizes[dropIdx] || 1);
      const hadFocus = tree.focusedLeafId === dropId;
      tree.close(dropId);
      if (tree.nodes.has(dropId)) break;
      if (hadFocus) tree.focus(keepId);
      absorbed += 1;
    }
    return absorbed;
  }
  /** The first two adjacent start tiles that may be merged, and which of
   *  them survives. Null when there are none. */
  _nextMergeablePair(tree, preferLeafId) {
    for (const node of [...tree.nodes.values()]) {
      if (node.kind !== "split") continue;
      if (!tree.nodes.has(node.id)) continue;
      for (let i = 0; i < node.children.length - 1; i += 1) {
        const a = tree.get(node.children[i]);
        const b = tree.get(node.children[i + 1]);
        if (!this._isStartTile(a) || !this._isStartTile(b)) continue;
        const aHolds = this._paneHoldsWindows(a.id);
        const bHolds = this._paneHoldsWindows(b.id);
        if (aHolds && bHolds) continue;
        let keepIdx = i;
        if (bHolds) keepIdx = i + 1;
        else if (!aHolds && node.children[i + 1] === preferLeafId) keepIdx = i + 1;
        const dropIdx = keepIdx === i ? i + 1 : i;
        return {
          split: node,
          keepIdx,
          dropIdx,
          keepId: node.children[keepIdx],
          dropId: node.children[dropIdx]
        };
      }
    }
    return null;
  }
  /** Is this leaf the empty ground and nothing else? See the three
   *  exclusions in `_mergeStartTiles`. */
  _isStartTile(leaf) {
    if (!leaf || leaf.kind !== "leaf") return false;
    const kind = leaf.content?.kind;
    if (!kind || kind !== this.taxonomy.root) return false;
    if (PANEL_KINDS.has(kind) || kind === PLACEHOLDER_KIND) return false;
    if ((Array.isArray(leaf.tabs) ? leaf.tabs.length : 0) > 1) return false;
    for (const page of Object.values(leaf.pageTabs || {})) {
      if (Array.isArray(page?.tabs) && page.tabs.length) return false;
    }
    return true;
  }
  /**
   * Does anything float on this pane?
   *
   * Two sources, because there are two kinds of window and the WM only knows
   * about one of them. `homeLeafId` is set for a window this WM contained in
   * its own pane (C21); an EMBEDDER's windows — a canvas pane that opens its
   * own `ManagedWindow` against the pane's ground — are not in
   * `_windowToLeaf` at all, and the only honest way to see them is to look.
   * The DOM answer covers both, and covers a window whose record has been
   * dropped but whose element is still standing.
   */
  _paneHoldsWindows(leafId) {
    for (const [, rec] of this._windowToLeaf) {
      if (rec.homeLeafId === leafId) return true;
    }
    const el = this.renderer.leafEl?.(leafId);
    return !!el?.querySelector?.(".twm-managed-window");
  }
  /** R10, as a verb an embedder can use. Merges, then repaints and persists
   *  — the promote path calls `_mergeStartTiles` directly because it is
   *  already going to do all three. */
  mergeStartTiles(preferLeafId = null) {
    const tree = this._tree();
    const absorbed = this._mergeStartTiles(tree, preferLeafId);
    if (!absorbed) return 0;
    this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    this._persist();
    this._notifyChange("start-tiles-merged");
    return absorbed;
  }
  // ── Panel-tiles (left nav / right / bottom) ─────────────────────
  /** Panels are virtual: they live in the active desktop's tree as
   *  leaves with content kinds 'panel:left', 'panel:right',
   *  'panel:bottom'. Toggling either inserts them at the appropriate
   *  edge (a recursive split) or closes that leaf. */
  isPanelOpen(side) {
    const d = this.desktops.active();
    return !!d.panels[side];
  }
  togglePanel(side) {
    const d = this.desktops.active();
    d.panels[side] = !d.panels[side];
    this._canonicalize(this._tree(), d);
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  /** Rebuild the tree so panel:* leaves sit in the canonical positions:
   *
   *   v-split
   *     ├ h-split          ← the "content row"
   *     │   ├ panel:left   (if open)
   *     │   ├ content      (whatever non-panel subtree)
   *     │   └ panel:right  (if open)
   *     └ panel:bottom     (if open, full width below the content row)
   *
   *  Existing panel leaves are detached + re-attached (same id), so the
   *  renderer cache keeps the mounted content (nav filter state, etc.). */
  _canonicalize(tree, desktop) {
    const panel = {};
    for (const leaf of tree.leaves()) {
      const kind = leaf.content?.kind;
      if (kind === "panel:left") panel.left = leaf;
      else if (kind === "panel:right") panel.right = leaf;
      else if (kind === "panel:bottom") panel.bottom = leaf;
    }
    const detach = (leaf) => {
      if (!leaf) return;
      const pid = leaf.parentId;
      if (!pid) {
        tree.rootId = null;
        leaf.parentId = null;
        return;
      }
      const parent = tree.get(pid);
      if (!parent) return;
      const idx = parent.children.indexOf(leaf.id);
      if (idx >= 0) {
        parent.children.splice(idx, 1);
        parent.sizes.splice(idx, 1);
      }
      leaf.parentId = null;
      tree._collapse(parent);
    };
    detach(panel.left);
    detach(panel.right);
    detach(panel.bottom);
    let seededSide = null;
    if (!tree.rootId) {
      seededSide = desktop.panels.left ? "left" : desktop.panels.bottom ? "bottom" : desktop.panels.right ? "right" : null;
      if (seededSide) {
        const seed = panel[seededSide] || makeLeaf({
          content: { kind: `panel:${seededSide}`, props: {} },
          title: PANEL_TITLES[seededSide] || seededSide
        });
        if (panel[seededSide] && PANEL_TITLES[seededSide]) {
          panel[seededSide].title = PANEL_TITLES[seededSide];
        }
        if (!panel[seededSide]) tree._register(seed);
        if (!tree.nodes.has(seed.id)) tree.nodes.set(seed.id, seed);
        seed.parentId = null;
        tree.rootId = seed.id;
      }
    }
    const wrap = (panelLeaf, side) => {
      if (panelLeaf && !tree.nodes.has(panelLeaf.id)) {
        tree.nodes.set(panelLeaf.id, panelLeaf);
      }
      const leaf = panelLeaf || makeLeaf({
        content: { kind: `panel:${side}`, props: {} },
        title: PANEL_TITLES[side] || side
      });
      if (panelLeaf && PANEL_TITLES[side] && panelLeaf.title !== PANEL_TITLES[side]) {
        panelLeaf.title = PANEL_TITLES[side];
      }
      if (!panelLeaf) tree._register(leaf);
      const before = side === "left";
      const dir = side === "bottom" ? "v" : "h";
      const children = before ? [leaf.id, tree.rootId] : [tree.rootId, leaf.id];
      const sizes = side === "bottom" ? [4, 1] : side === "left" ? [1, 4] : [4, 1];
      const split = {
        id: `split-panel-${side}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "split",
        parentId: null,
        dir,
        children,
        sizes
      };
      tree.nodes.set(split.id, split);
      const oldRoot = tree.get(tree.rootId);
      if (oldRoot) oldRoot.parentId = split.id;
      leaf.parentId = split.id;
      tree.rootId = split.id;
    };
    if (desktop.panels.left && seededSide !== "left" && tree.rootId) wrap(panel.left, "left");
    if (desktop.panels.right && seededSide !== "right" && tree.rootId) wrap(panel.right, "right");
    if (desktop.panels.bottom && seededSide !== "bottom" && tree.rootId) wrap(panel.bottom, "bottom");
    const reachable = /* @__PURE__ */ new Set();
    const walk = (id) => {
      if (!id || reachable.has(id)) return;
      reachable.add(id);
      const n = tree.get(id);
      if (n?.kind === "split") n.children.forEach(walk);
    };
    walk(tree.rootId);
    for (const id of [...tree.nodes.keys()]) {
      if (!reachable.has(id)) tree.nodes.delete(id);
    }
  }
  _findPanelLeaf(side) {
    const kind = `panel:${side}`;
    for (const leaf of this._tree().leaves()) {
      if (leaf.content?.kind === kind) return leaf;
    }
    return null;
  }
  // ── Desktops ────────────────────────────────────────────────────
  switchDesktop(idx) {
    this.desktops.ensureCount(idx + 1);
    if (!this.desktops.switchTo(idx)) return;
    const d = this.desktops.active();
    this._canonicalize(d.tree, d);
    this.renderer.tree = d.tree;
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  addDesktop() {
    this.desktops.addDesktop();
    this._notifyChange();
    this._persist();
  }
  /** Step to the previous (-1) or next (+1) existing desktop, wrapping
   *  around. No-op with a single desktop. Iterates only desktops that
   *  already exist — use switchDesktop(idx) to create-on-demand. */
  cycleDesktop(dir) {
    const m = this.desktops;
    const n = m.desktops.length;
    if (n <= 1) return;
    const next = (m.activeIdx + (dir < 0 ? -1 : 1) + n) % n;
    this.switchDesktop(next);
  }
  /** Cycle the focused tile's main-panel tabs (Ctrl+Tab / Ctrl+Shift+Tab).
   *  Wraps; no-op when the focused leaf has 0 or 1 tabs. */
  cycleFocusedTab(dir) {
    const tree = this._tree();
    const leafId = tree.focusedLeafId;
    const leaf = leafId ? tree.get(leafId) : null;
    const tabs = leaf && Array.isArray(leaf.tabs) ? leaf.tabs : [];
    if (tabs.length <= 1) return;
    const cur = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    const next = (cur + (dir < 0 ? -1 : 1) + tabs.length) % tabs.length;
    this._leafTabAction(leafId, "switch", { idx: next });
  }
  /**
   * Remove a desktop — AND RE-INDEX THE WINDOWS, which is the half that was
   * missing.
   *
   * `desktopIdx` on a window record is an ARRAY INDEX into `desktops`, so a
   * splice silently re-points every record above the removed one at its
   * neighbour. Nothing threw and nothing looked wrong: the window kept
   * floating, and the next *Back to tile* resolved `rec._dock` against the
   * WRONG TREE. `_onManagedWindowClosed` reads `desktops[rec.desktopIdx]`,
   * finds a tree that never held this window, and its `if (!tree) return`
   * closes the window and drops the content on the floor — staged edits
   * included, with no error and nothing on screen to say a table was lost.
   *
   * Windows homed on the desktop being removed do not die with it. The
   * ruling is that a tile operation may move a window and never destroy it,
   * and removing a desktop is the largest tile operation there is: they come
   * across to the desktop that ends up active, re-homed onto its ground by
   * `_rehomeContainedWindows` on the render below.
   */
  removeDesktop(idx) {
    const m = this.desktops;
    if (m.desktops.length <= 1) return false;
    if (idx < 0 || idx >= m.desktops.length) return false;
    m.desktops.splice(idx, 1);
    if (idx < m.activeIdx) m.activeIdx -= 1;
    if (m.activeIdx >= m.desktops.length) m.activeIdx = m.desktops.length - 1;
    for (const [, rec] of this._windowToLeaf) {
      if (rec.desktopIdx === idx) {
        rec.desktopIdx = m.activeIdx;
        if (!rec.homeContainer && rec.homeLeafId) {
          rec.homeLeafId = m.active().tree.primaryLeafId() || null;
        }
      } else if (rec.desktopIdx > idx) {
        rec.desktopIdx -= 1;
      }
    }
    this.renderer.tree = m.active().tree;
    this.renderer.render();
    this._persist();
    this._notifyChange();
    return true;
  }
  moveFocusedToDesktop(idx) {
    const tree = this._tree();
    const focused = tree.focused();
    if (!focused || !focused.content) return;
    const closeChrome = this.renderer?.leafChrome?.(focused.id)?.close;
    if (closeChrome === false || closeChrome?.disabled === true) return;
    const payload = { kind: focused.content.kind, props: focused.content.props, title: focused.title };
    this.desktops.ensureCount(idx + 1);
    const target = this.desktops.desktops[idx];
    const targetTree = target.tree;
    const primary = targetTree.primaryLeafId();
    if (primary) targetTree.setLeafContent(primary, { kind: payload.kind, props: payload.props }, payload.title);
    tree.close(focused.id);
    if (!tree.rootId) tree.setRoot(makeLeaf(this._rootLeaf()));
    if (!tree.leaves().some((l) => !String(l.content?.kind || "").startsWith("panel:"))) {
      const spawned = this._spawnContentLeaf(tree);
      if (spawned) this._seedHome(tree, spawned);
    }
    this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    this._persist();
    this._notifyChange();
  }
  // ── Internals ───────────────────────────────────────────────────
  _tree() {
    return this.desktops.active().tree;
  }
  _leafAction(leafId, action) {
    const tree = this._tree();
    tree.focus(leafId);
    if (action === "close") this.closeFocused();
    else if (action === "promote") this.toggleManagedFocused();
    else if (action === "split-h") this.split("h");
    else if (action === "split-v") this.split("v");
  }
  /** Tab-strip event dispatcher. The renderer fires actions
   *  (`switch` / `close` / `move` / `open-menu`) and the WM
   *  translates them into tile-tree mutations + a re-render. */
  _leafTabAction(leafId, action, data = {}) {
    const tree = this._tree();
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== "leaf") return;
    if (action === "switch") {
      tree.setActiveLeafTab(leafId, data.idx);
      tree.focus(leafId);
      this.renderer.render();
      this._persist();
      this._notifyChange("tab-switch");
      return;
    }
    if (action === "close") {
      const tabs = leaf.tabs || [];
      if (tabs.length <= 1) {
        tree.focus(leafId);
        this.closeFocused();
        return;
      }
      tree.removeLeafTab(leafId, data.idx);
      tree.focus(leafId);
      this.renderer.render();
      this._persist();
      this._notifyChange("twm-tab-close");
      return;
    }
    if (action === "move") {
      tree.moveLeafTab(leafId, data.from, data.to);
      this.renderer.render();
      this._persist();
      this._notifyChange("tab-move");
      return;
    }
    if (action === "menu") {
      this._showTabContextMenu(leafId, data.idx, data.x, data.y);
      return;
    }
    if (action === "to-window") {
      this.floatTabAsWindow(leafId, data.idx);
      return;
    }
    if (action === "drop-into") {
      this.moveTabInto(leafId, data.idx, data.target);
      return;
    }
    if (action === "close-others") {
      tree.closeOtherTabs(leafId, data.idx);
      this.renderer.render();
      this._persist();
      this._notifyChange("tab-close-others");
      return;
    }
    if (action === "close-right") {
      tree.closeTabsAfter(leafId, data.idx);
      this.renderer.render();
      this._persist();
      this._notifyChange("tab-close-right");
      return;
    }
    if (action === "close-left") {
      tree.closeTabsBefore(leafId, data.idx);
      this.renderer.render();
      this._persist();
      this._notifyChange("tab-close-left");
      return;
    }
    if (action === "open-menu") {
      try {
        this.ctx?.onTileTabMenu?.(leafId, data.x, data.y);
      } catch (err) {
        console.warn("[wm] tab menu hook failed", err);
      }
    }
  }
  /** Central navigation entry point. Every nav action — left menu,
   *  breadcrumb, landing-row click, in-tile reference, panel
   *  reference, entity-to-entity — should route through this so the
   *  one holistic routing concept lives in one place.
   *
   *  A link declares its target as TWO axes:
   *
   *   `opts.dest`   — WHERE the content lands:
   *                   'main'   → the primary content tile (default).
   *                              The nav panel always uses this.
   *                   'origin' → the tile/window the click came from
   *                              (needs `ctx`). Breadcrumbs use this so
   *                              a segment click stays in the current
   *                              tile (and inside a floating window when
   *                              windowed).
   *                   'window' → a fresh managed window.
   *   `opts.newTab` — HOW it lands in that destination:
   *                   false → replace the destination's active tab
   *                           (default). true → append a NEW tab.
   *                           Ignored for 'window' (one window = one
   *                           content).
   *
   *  `opts.ctx`       — the caller's mount context (`leafId`,
   *                     `windowId`); required for `dest:'origin'`.
   *  `opts.transient` — the appended tab is not persisted/restored
   *                     (e.g. an add-row form). Only meaningful with
   *                     `newTab:true`.
   *
   *  Back-compat: the legacy `opts.target` enum still works and maps
   *  onto the axes — 'auto'→origin, 'tab'→origin+newTab,
   *  'primary'→main, 'window'→window. Prefer the two-axis form.
   *
   *  The lower-level primitives (`openFromContext`,
   *  `openInTabFromContext`, `openInTabInPrimary`, `openInPrimary`,
   *  `openInWindow`) stay internal; callers prefer `wm.navigate(...)`. */
  navigate(kind, props = {}, opts = {}) {
    const { ctx = null, transient = false } = opts;
    let { dest = "main", newTab = false } = opts;
    if (opts.target != null) {
      switch (opts.target) {
        case "window":
          dest = "window";
          newTab = false;
          break;
        case "primary":
          dest = "main";
          newTab = false;
          break;
        case "tab":
          dest = "origin";
          newTab = true;
          break;
        case "split-h":
          dest = "split-h";
          break;
        case "split-v":
          dest = "split-v";
          break;
        case "auto":
        default:
          dest = "origin";
          newTab = false;
          break;
      }
    }
    if (dest === "split-h" || dest === "split-v") {
      const dir = dest === "split-h" ? "h" : "v";
      const leafId = ctx?.leafId || this._tree().focusedLeafId;
      return this.splitLeafWith(leafId, dir, kind, props, _tabTitle(kind, props));
    }
    if (dest === "window") return this._navigateWindow(kind, props);
    if (dest === "main") {
      return newTab ? this.openInTabInPrimary(kind, props, transient) : this.openInPrimary(kind, props);
    }
    return newTab ? this._navigateTab(ctx, kind, props, transient) : this._navigateAuto(ctx, kind, props);
  }
  _navigateAuto(ctx, kind, props) {
    if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
      this.openInWindow(ctx.windowId, kind, props);
      return;
    }
    if (ctx?.leafId) {
      const tree = this._tree();
      const leaf = tree.get(ctx.leafId);
      const k = leaf?.content?.kind;
      if (leaf && k && !k.startsWith("panel:")) {
        this.openInLeaf(ctx.leafId, kind, props);
        return;
      }
    }
    this.openInPrimary(kind, props);
  }
  _navigateTab(ctx, kind, props, transient = false) {
    if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
      this.openInWindow(ctx.windowId, kind, props);
      return;
    }
    this.openInTabFromContext(ctx || {}, kind, props, transient);
  }
  /** Spawn a fresh ManagedWindow with the requested content. No
   *  source leaf — closing the window just disposes the content. */
  _navigateWindow(kind, props) {
    const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const contentEl = document.createElement("div");
    contentEl.className = "twm-window-content";
    contentEl.style.cssText = "display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;";
    const title = _tabTitle(kind, props);
    const mountInfo = this.content.mount(
      kind,
      contentEl,
      props,
      { ...this.ctx, wm: this, windowId: winId }
    );
    const win = new ManagedWindow({
      id: winId,
      title: mountInfo?.title || title,
      icon: "web_asset",
      content: contentEl,
      canMinimize: true,
      canMaximize: true,
      canResize: true,
      modal: false,
      // C15, and this is the SECOND of the two places the WM builds a
      // window. Alt+N and "Open in new window" produce a window that is
      // every bit as dockable as a promoted one, and a window that can be
      // dragged onto a tile in one case and not the other is a rule
      // nobody can learn.
      snap: this.snapPromotion,
      snapController: this.snapPromotion ? this._snapController() : null,
      // R1. THE PANE IS A BOX WITH `overflow: hidden`. A window contained
      // to one (C21) cannot be dragged a single pixel outside it, so
      // "drag a window from one tile to another" — the gesture all three
      // drop behaviours are built on — was not merely awkward, it was
      // invisible. For the length of a drag the window is re-parented
      // here, to the root every tile is inside; on release it goes back
      // into a pane, either the one it was dropped on or the one it came
      // from. Resolved per drag: the root outlives any tile, and a tile
      // grabbed once does not survive its own repaint.
      dragHost: () => this.rootEl,
      dragBounds: () => this._tileBounds(),
      // R7. MAXIMISE MEANS BACK TO TILE. This window came OUT of the
      // tree; the useful thing to do with it is put it back, and filling
      // the screen with it is the one gesture that makes putting it back
      // harder. So the maximize button docks — and the separate demote
      // button the WM used to inject beside it is gone, because two
      // buttons for one verb is how you get a chrome nobody reads.
      onMaximize: () => this.bringBackWindow(winId),
      maximizeIcon: "close_fullscreen",
      maximizeTitle: "Back to tile",
      onClose: () => this._onManagedWindowClosed(winId, mountInfo)
    });
    this._windowToLeaf.set(winId, {
      leafId: null,
      desktopIdx: this.desktops.activeIdx,
      original: {
        kind,
        props: { ...props || {} },
        title: mountInfo?.title || title
      },
      mountInfo,
      window: win,
      contentEl,
      _demoting: false
    });
    win.show();
    const _n = this._windowToLeaf.size;
    if (_n > 1 && typeof win._applyPosition === "function") {
      const step = (_n - 1) % 6 * 28;
      win.x = (win.x || 0) + step;
      win.y = (win.y || 0) + step;
      win._applyPosition();
    }
    this._decorateManagedWindow(win, winId);
    this._notifyChange("window-spawned");
  }
  /** Browser-style tab context menu. Items reflect the leaf's current
   *  tab list — "Close others" is hidden when only one tab is open,
   *  "Close to the right / left" are hidden at the edges. The actual
   *  mutations route back through `_leafTabAction` so persistence +
   *  notify stay in one place. */
  _showTabContextMenu(leafId, idx, x, y) {
    const tree = this._tree();
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== "leaf") return;
    const tabs = leaf.tabs || [];
    if (tabs.length === 0) return;
    const items = [];
    const tab = tabs[idx];
    if (tab && !String(tab.kind || "").startsWith("panel:") && tab.kind !== PLACEHOLDER_KIND) {
      items.push({ label: "Open in a window", icon: "web_asset", action: "to-window" });
      items.push({ separator: true });
    }
    items.push({ label: "Close tab", icon: "close", action: "close" });
    if (tabs.length > 1) {
      items.push({ label: "Close other tabs", icon: "tab_close", action: "close-others" });
    }
    if (idx < tabs.length - 1) {
      items.push({
        label: "Close tabs to the right",
        icon: "chevron_right",
        action: "close-right"
      });
    }
    if (idx > 0) {
      items.push({
        label: "Close tabs to the left",
        icon: "chevron_left",
        action: "close-left"
      });
    }
    showContextMenu(x, y, items, (action) => {
      this._leafTabAction(leafId, action, { idx });
    });
  }
  /** Open content in a new tab on the leaf where the call originated.
   *  Mirrors `openFromContext` (windowed / split-leaf / primary
   *  routing) but uses `appendLeafTab` so the existing content
   *  stays in place as a tab. */
  openInTabFromContext(ctx, kind, props = {}, transient = false) {
    if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
      this.openInWindow(ctx.windowId, kind, props);
      return;
    }
    const tree = this._tree();
    let leafId = ctx?.leafId;
    if (!leafId) leafId = tree.primaryLeafId();
    const leaf = leafId ? tree.get(leafId) : null;
    const k = leaf?.content?.kind;
    if (!leaf || !leafId || k && k.startsWith("panel:")) {
      this.openInPrimary(kind, props);
      return;
    }
    tree.appendLeafTab(leafId, { kind, props }, _tabTitle(kind, props), { transient });
    tree.focus(leafId);
    this.renderer.render();
    this._persist();
    this._notifyChange("tab-open");
  }
  /** Open content as a NEW tab in the primary content tile, regardless
   *  of where the call came from (the `dest:'main', newTab:true` path).
   *  Unlike `openInTabFromContext`, this never falls back to a replace:
   *  it targets the primary leaf directly and always appends, so a
   *  click from outside the tile system (e.g. the bottom-panel
   *  "Add row" button, which passes no ctx) reliably lands as a sibling
   *  tab in the main tile rather than swapping its content. */
  openInTabInPrimary(kind, props = {}, transient = false) {
    const tree = this._tree();
    const leafId = tree.primaryLeafId();
    if (!leafId) {
      this._navigateWindow(kind, props);
      return;
    }
    tree.appendLeafTab(leafId, { kind, props }, _tabTitle(kind, props), { transient });
    tree.focus(leafId);
    this.renderer.render();
    this._persist();
    this._notifyChange("tab-open");
  }
};
function _tabTitle(kind, props) {
  if (props && typeof props.label === "string" && props.label) return props.label;
  if (props && (typeof props.id === "string" || typeof props.id === "number") && String(props.id)) return String(props.id);
  return kind || "";
}
function _leafTabSpecs(leaf) {
  const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
  if (tabs.length) {
    return tabs.map((t) => ({
      kind: t.kind,
      props: { ...t.props || {} },
      title: t.title || t.kind || ""
    }));
  }
  return [{
    kind: leaf.content.kind,
    props: { ...leaf.content.props || {} },
    title: leaf.title || leaf.content.kind || ""
  }];
}
function _halfOf(r, side) {
  const w = Math.round(r.width / 2);
  const h = Math.round(r.height / 2);
  switch (side) {
    case "left":
      return { left: r.left, top: r.top, width: w, height: r.height };
    case "right":
      return { left: r.left + r.width - w, top: r.top, width: w, height: r.height };
    case "top":
      return { left: r.left, top: r.top, width: r.width, height: h };
    case "bottom":
      return { left: r.left, top: r.top + r.height - h, width: r.width, height: h };
    default:
      return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
}
function _halveInto(tree, sourceId, newId) {
  const src = tree.get(sourceId);
  if (!src) return false;
  const parent = tree.get(src.parentId);
  if (!parent || parent.kind !== "split") return false;
  const i = parent.children.indexOf(sourceId);
  const j = parent.children.indexOf(newId);
  if (i < 0 || j < 0) return false;
  const share = (parent.sizes[i] ?? 1) / 2;
  parent.sizes[i] = share;
  parent.sizes[j] = share;
  return true;
}
function _swapSiblings(tree, aId, bId) {
  const a = tree.get(aId);
  const b = tree.get(bId);
  if (!a || !b || a.parentId !== b.parentId) return false;
  const parent = tree.get(a.parentId);
  if (!parent || parent.kind !== "split") return false;
  const i = parent.children.indexOf(aId);
  const j = parent.children.indexOf(bId);
  if (i < 0 || j < 0) return false;
  parent.children[i] = bId;
  parent.children[j] = aId;
  const size = parent.sizes[i];
  parent.sizes[i] = parent.sizes[j];
  parent.sizes[j] = size;
  return true;
}

// src/tiling/tile_tab_menu.js
var PAGE_SIZE = 10;
function openTileTabMenu({
  x,
  y,
  leafKind,
  onPick,
  api,
  taxonomy,
  entities
}) {
  if (!taxonomy || !entities) {
    console.error("[tile-tab-menu] taxonomy + entity catalog are required");
    return () => {
    };
  }
  const topNav = taxonomy.topNavFor(leafKind) || leafKind;
  const sources = taxonomy.sourcesFor(topNav).map((nav) => entities.get(nav)).filter(Boolean);
  const overlay = document.createElement("div");
  overlay.className = "twm-tile-tabmenu-overlay";
  overlay.innerHTML = `
        <div class="twm-tile-tabmenu" role="dialog" aria-label="Open in new tab">
            <header class="twm-tile-tabmenu__head">
                <span class="material-symbols-outlined twm-tile-tabmenu__head-icon">tab</span>
                <span class="twm-tile-tabmenu__head-label">Open in new tab</span>
                <button type="button" class="twm-tile-tabmenu__close"
                        data-action="close"
                        aria-label="Close">\xD7</button>
            </header>
            <div class="twm-tile-tabmenu__search">
                <span class="material-symbols-outlined">search</span>
                <input type="search"
                       data-role="search"
                       placeholder="Filter rows across all sections\u2026"
                       autocomplete="off" />
            </div>
            <div class="twm-tile-tabmenu__body" data-role="body">
                <div class="twm-tile-tabmenu__loading">Loading\u2026</div>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);
  const panel = overlay.querySelector(".twm-tile-tabmenu");
  panel.style.position = "fixed";
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, x))}px`;
  panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 480, y - 480 + 22))}px`;
  let alive = true;
  let _query = "";
  let _cursor = 0;
  let _visibleItems = [];
  const sectionState = new Map(sources.map((s) => [s.navKind, { rows: [], page: 0, shaped: [] }]));
  const close = () => {
    if (!alive) return;
    alive = false;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  const onOutside = (ev) => {
    if (!overlay.contains(ev.target)) close();
  };
  const moveCursor = (delta) => {
    if (_visibleItems.length === 0) return;
    _cursor = Math.max(0, Math.min(_visibleItems.length - 1, _cursor + delta));
    _paintCursor();
  };
  const jumpCursor = (toEnd) => {
    if (_visibleItems.length === 0) return;
    _cursor = toEnd ? _visibleItems.length - 1 : 0;
    _paintCursor();
  };
  const pickCursor = () => {
    const cur = _visibleItems[_cursor];
    if (!cur) return;
    close();
    try {
      onPick?.(cur.navKind, cur.shaped);
    } catch (err) {
      console.warn("[tile-tab-menu] pick failed", err);
    }
  };
  const onKey = (ev) => {
    if (!alive) return;
    if (ev.isComposing) return;
    switch (ev.key) {
      case "Escape":
        ev.preventDefault();
        close();
        return;
      case "ArrowDown":
        ev.preventDefault();
        moveCursor(1);
        return;
      case "ArrowUp":
        ev.preventDefault();
        moveCursor(-1);
        return;
      case "Home":
        ev.preventDefault();
        jumpCursor(false);
        return;
      case "End":
        ev.preventDefault();
        jumpCursor(true);
        return;
      case "Enter":
        ev.preventDefault();
        pickCursor();
        return;
      case "PageDown": {
        if (_query) return;
        ev.preventDefault();
        const cur = _visibleItems[_cursor];
        const st = cur ? sectionState.get(cur.navKind) : null;
        if (st) {
          const pages = _pageCountFor(cur.navKind);
          if (st.page < pages - 1) {
            st.page += 1;
            _render();
          }
        }
        return;
      }
      case "PageUp": {
        if (_query) return;
        ev.preventDefault();
        const cur = _visibleItems[_cursor];
        const st = cur ? sectionState.get(cur.navKind) : null;
        if (st && st.page > 0) {
          st.page -= 1;
          _render();
        }
        return;
      }
    }
  };
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  overlay.querySelector('[data-action="close"]').addEventListener("click", close);
  const searchInput = overlay.querySelector('[data-role="search"]');
  searchInput.addEventListener("input", () => {
    _query = searchInput.value.trim().toLowerCase();
    for (const st of sectionState.values()) st.page = 0;
    _cursor = 0;
    _render();
  });
  const bodyEl = overlay.querySelector('[data-role="body"]');
  const _pageCountFor = (navKind) => {
    const st = sectionState.get(navKind);
    if (!st) return 1;
    const total = (_query ? st.shaped.filter((s) => _matchesShaped(s, _query)) : st.shaped).length;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  };
  const _render = () => {
    if (!alive) return;
    _visibleItems = [];
    const sections = [];
    for (const src of sources) {
      const st = sectionState.get(src.navKind);
      const meta = taxonomy.meta(src.navKind);
      const all = st.shaped;
      const filtered = _query ? all.filter((s) => _matchesShaped(s, _query)) : all;
      const total = filtered.length;
      let view;
      let page = 0;
      let pages = 1;
      if (_query) {
        view = filtered;
      } else {
        pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        page = Math.min(st.page, pages - 1);
        const start = page * PAGE_SIZE;
        view = filtered.slice(start, start + PAGE_SIZE);
      }
      for (const shaped of view) {
        _visibleItems.push({ navKind: src.navKind, shaped });
      }
      sections.push({ src, meta, view, total, page, pages });
    }
    if (_cursor >= _visibleItems.length) {
      _cursor = Math.max(0, _visibleItems.length - 1);
    }
    let flatIdx = 0;
    bodyEl.innerHTML = sections.map((s) => {
      const items = s.view.map((shaped) => {
        const idx = flatIdx++;
        const label = shaped.label || shaped.id || "";
        const hint = shaped.hint || "";
        return `
                    <li class="twm-tile-tabmenu__item${idx === _cursor ? " twm-tile-tabmenu__item--cursor" : ""}"
                        data-flat-idx="${idx}">
                        <span class="twm-tile-tabmenu__item-label">${_esc7(label)}</span>
                        ${hint ? `<span class="twm-tile-tabmenu__item-hint">${_esc7(hint)}</span>` : ""}
                    </li>
                `;
      }).join("");
      return `
                <section class="twm-tile-tabmenu__section"
                         data-section="${_esc7(s.src.navKind)}">
                    <header class="twm-tile-tabmenu__section-head">
                        <span class="material-symbols-outlined">${_esc7(s.meta?.icon || "arrow_right")}</span>
                        <span class="twm-tile-tabmenu__section-label">${_esc7(s.meta?.label || s.src.navKind)}</span>
                        <span class="twm-tile-tabmenu__section-count">${s.total}</span>
                    </header>
                    ${s.view.length === 0 ? `
                        <div class="twm-tile-tabmenu__empty">${_query ? "No matches." : "\u2014 none \u2014"}</div>
                    ` : `<ul class="twm-tile-tabmenu__list">${items}</ul>`}
                    ${!_query && s.pages > 1 ? `
                        <div class="twm-tile-tabmenu__pager">
                            <button type="button" data-action="prev"
                                    data-section="${_esc7(s.src.navKind)}"
                                    ${s.page === 0 ? "disabled" : ""}>&lt;</button>
                            <span>${s.page + 1} / ${s.pages}</span>
                            <button type="button" data-action="next"
                                    data-section="${_esc7(s.src.navKind)}"
                                    ${s.page >= s.pages - 1 ? "disabled" : ""}>&gt;</button>
                        </div>
                    ` : ""}
                </section>
            `;
    }).join("");
    bodyEl.querySelectorAll(".twm-tile-tabmenu__item").forEach((li) => {
      const idx = Number(li.dataset.flatIdx);
      li.addEventListener("mousemove", () => {
        if (_cursor !== idx) {
          _cursor = idx;
          _paintCursor();
        }
      });
      li.addEventListener("click", () => {
        _cursor = idx;
        pickCursor();
      });
    });
    bodyEl.querySelectorAll('[data-action="prev"], [data-action="next"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const navKind = btn.dataset.section;
        const st = sectionState.get(navKind);
        if (!st) return;
        st.page += btn.dataset.action === "next" ? 1 : -1;
        _render();
      });
    });
  };
  const _paintCursor = () => {
    bodyEl.querySelectorAll(".twm-tile-tabmenu__item").forEach((li) => {
      const idx = Number(li.dataset.flatIdx);
      const on = idx === _cursor;
      li.classList.toggle("twm-tile-tabmenu__item--cursor", on);
      if (on) li.scrollIntoView({ block: "nearest" });
    });
  };
  (async () => {
    await Promise.all(sources.map(async (src) => {
      const st = sectionState.get(src.navKind);
      if (!st) return;
      st.rows = await entities.loadOne(src.navKind, api);
      st.shaped = entities.shapeRows(src.navKind, st.rows);
    }));
    _render();
    if (_visibleItems.length > 0) {
      _cursor = 0;
      _paintCursor();
    }
  })();
  searchInput.focus();
  return close;
}
function openTileTabSwitcher({ x, y, tabs, activeIdx = 0, onPick }) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (list.length === 0) return () => {
  };
  const overlay = document.createElement("div");
  overlay.className = "twm-tile-tabswitch-overlay";
  const rows = list.map((t, i) => `
        <li class="twm-tile-tabswitch__item${i === activeIdx ? " twm-tile-tabswitch__item--on" : ""}"
            data-idx="${i}" role="option" aria-selected="${i === activeIdx}">
            <span class="material-symbols-outlined twm-tile-tabswitch__check">${i === activeIdx ? "check" : ""}</span>
            <span class="twm-tile-tabswitch__label">${_esc7(t.title || t.kind || "Tab")}</span>
        </li>
    `).join("");
  overlay.innerHTML = `
        <div class="twm-tile-tabswitch" role="dialog" aria-label="Open tabs">
            <header class="twm-tile-tabswitch__head">
                <span class="material-symbols-outlined">tab</span>
                <span class="twm-tile-tabswitch__head-label">Open tabs</span>
            </header>
            <ul class="twm-tile-tabswitch__list" role="listbox">${rows}</ul>
        </div>
    `;
  document.body.appendChild(overlay);
  const panel = overlay.querySelector(".twm-tile-tabswitch");
  const W = 260;
  panel.style.position = "fixed";
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - W - 8, x))}px`;
  panel.style.bottom = `${Math.max(8, window.innerHeight - y + 4)}px`;
  panel.style.maxHeight = `${Math.max(120, y - 16)}px`;
  let alive = true;
  let cursor = Math.max(0, Math.min(list.length - 1, activeIdx));
  const close = () => {
    if (!alive) return;
    alive = false;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  const onOutside = (ev) => {
    if (!overlay.contains(ev.target)) close();
  };
  const pick = (idx) => {
    close();
    try {
      onPick?.(idx);
    } catch (err) {
      console.warn("[tile-tab-switch] pick failed", err);
    }
  };
  const paint = () => {
    overlay.querySelectorAll(".twm-tile-tabswitch__item").forEach((li) => {
      const on = Number(li.dataset.idx) === cursor;
      li.classList.toggle("twm-tile-tabswitch__item--cursor", on);
      if (on) li.scrollIntoView({ block: "nearest" });
    });
  };
  const onKey = (ev) => {
    if (!alive || ev.isComposing) return;
    switch (ev.key) {
      case "Escape":
        ev.preventDefault();
        close();
        return;
      case "ArrowDown":
        ev.preventDefault();
        cursor = Math.min(list.length - 1, cursor + 1);
        paint();
        return;
      case "ArrowUp":
        ev.preventDefault();
        cursor = Math.max(0, cursor - 1);
        paint();
        return;
      case "Home":
        ev.preventDefault();
        cursor = 0;
        paint();
        return;
      case "End":
        ev.preventDefault();
        cursor = list.length - 1;
        paint();
        return;
      case "Enter":
        ev.preventDefault();
        pick(cursor);
        return;
    }
  };
  overlay.querySelectorAll(".twm-tile-tabswitch__item").forEach((li) => {
    const idx = Number(li.dataset.idx);
    li.addEventListener("mousemove", () => {
      if (cursor !== idx) {
        cursor = idx;
        paint();
      }
    });
    li.addEventListener("click", () => pick(idx));
  });
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  paint();
  return close;
}
function _matchesShaped(shaped, query) {
  if (!shaped) return false;
  const id = String(shaped.id ?? "").toLowerCase();
  const label = String(shaped.label ?? "").toLowerCase();
  const hint = String(shaped.hint ?? "").toLowerCase();
  return id.includes(query) || label.includes(query) || hint.includes(query);
}
function _esc7(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// src/tiling/shell.js
async function createShell({
  root,
  taxonomy,
  entities,
  content,
  host = null,
  api = null,
  eventBus = null,
  logger = null,
  tableStore = null,
  events = {},
  rootCrumb = null,
  palette: paletteCfg = {},
  panels = null,
  snapPromotion = false,
  promoteInPlace = false,
  tabLayout = null,
  chrome = {},
  // An embedder that moved its sections out of the top bar — into an icon
  // rail, say — passes the selector its own buttons match, and F1..F8 keep
  // working. Omitted, the default top-bar selector applies.
  navSelector = null
} = {}) {
  if (!root || typeof root.appendChild !== "function") {
    throw new TypeError("createShell: `root` must be an element");
  }
  if (!taxonomy) throw new Error("createShell: a taxonomy is required");
  if (!entities) throw new Error("createShell: an entity catalog is required");
  const log = logger ?? { info() {
  }, warn() {
  }, error() {
  }, debug() {
  } };
  const registry = createContentRegistry(content);
  let wm = null;
  let topNavEl = null;
  let desktopsEl = null;
  let toggles = null;
  const syncChrome = () => {
    if (!wm) return;
    syncPanelToggles(toggles, wm);
    syncDesktopBar(desktopsEl, wm);
    syncTopNav(topNavEl, wm);
  };
  wm = new WindowManager({
    rootEl: root,
    content: registry,
    api,
    eventBus,
    host,
    taxonomy,
    events,
    panelDefaults: panels,
    snapPromotion,
    promoteInPlace,
    tabLayout,
    // `ctx` is the delivery vehicle for leaf-mounted chrome: tile_renderer
    // spreads it into every content factory, which is how the breadcrumb
    // gets `taxonomy` + `rootCrumb` without a content factory knowing they
    // exist. The two `onTile*Menu` keys are read with OPTIONAL CHAINING in
    // tile_renderer — drop one and right-click silently does nothing.
    ctx: {
      api,
      eventBus,
      host,
      tableStore,
      taxonomy,
      entities,
      rootCrumb,
      events,
      onTileContextMenu: (leafId, x, y) => _tileContextMenu(wm, leafId, x, y),
      onTileTabMenu: (leafId, x, y) => _tileTabMenu(wm, leafId, x, y)
    },
    onChange: () => syncChrome()
  });
  const palette = createCommandPalette({
    wm,
    api,
    taxonomy,
    catalog: entities,
    ...paletteCfg
  });
  const disposeKeymap = installKeymap({ wm, palette, navSelector });
  const paletteBtn = mountPaletteButton(chrome.paletteButton, palette);
  topNavEl = mountTopNav(chrome.topNav, taxonomy, wm);
  desktopsEl = mountDesktopBar(chrome.desktops, wm);
  toggles = bindPanelToggles(chrome.panelToggles, wm);
  eventBus?.on?.("wm:changed", syncChrome);
  await wm.load();
  syncChrome();
  log.info?.("shell mounted");
  return Object.freeze({
    wm,
    palette,
    taxonomy,
    entities,
    root,
    content: registry,
    chrome: Object.freeze({
      paletteButtonEl: paletteBtn,
      topNavEl,
      desktopsEl,
      panelToggles: toggles
    }),
    // A shell that can be built can be built TWICE — an embedder that
    // rebuilds on a context change (a different project, a different
    // workspace) does exactly that. Everything this function installs
    // outside `root` has to come off, or the second shell shares the page
    // with the first one's keyboard.
    dispose: () => {
      try {
        eventBus?.off?.("wm:changed", syncChrome);
      } catch {
      }
      try {
        disposeKeymap?.();
      } catch {
      }
      try {
        palette?.close?.();
      } catch {
      }
      try {
        wm.renderer.destroy();
      } catch (err) {
        log.warn?.("renderer teardown", err);
      }
    }
  });
}
function mountTopNav(hostEl, taxonomy, wm) {
  if (!hostEl) return null;
  hostEl.innerHTML = "";
  hostEl.classList.add("twm-top-nav");
  for (const k of taxonomy.topNavEntries()) {
    const btn = document.createElement("button");
    btn.className = "twm-top-nav__btn twm-has-tooltip";
    btn.dataset.kind = k.kind;
    btn.dataset.tooltip = k.label;
    btn.dataset.tooltipPlacement = "bottom";
    btn.setAttribute("aria-label", k.label);
    btn.innerHTML = `
            <span class="material-symbols-outlined twm-top-nav__icon">${k.icon}</span>
            <span class="twm-top-nav__label">${k.label}</span>
        `;
    hostEl.appendChild(btn);
  }
  hostEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kind]");
    if (!btn) return;
    wm.openInPrimary(btn.dataset.kind);
  });
  return hostEl;
}
function syncTopNav(hostEl, wm) {
  if (!hostEl) return;
  const tree = wm.desktops.active().tree;
  const primaryId = tree.primaryLeafId();
  const primaryKind = primaryId ? tree.get(primaryId)?.content?.kind : null;
  const topNavKind = wm.taxonomy.topNavFor(primaryKind) || primaryKind;
  hostEl.querySelectorAll("[data-kind]").forEach((b) => {
    b.classList.toggle("twm-top-nav__btn--on", b.dataset.kind === topNavKind);
  });
}
function mountPaletteButton(hostEl, palette) {
  if (!hostEl) return null;
  hostEl.querySelector("#twm-palette-btn")?.remove();
  const btn = document.createElement("button");
  btn.id = "twm-palette-btn";
  btn.className = "twm-panel-toggle-btn twm-has-tooltip";
  btn.dataset.tooltip = "Command palette (Ctrl+K)";
  btn.dataset.tooltipPlacement = "bottom";
  btn.setAttribute("aria-label", "Open command palette");
  btn.innerHTML = '<span class="material-symbols-outlined">menu_open</span>';
  btn.addEventListener("click", () => palette.toggle());
  hostEl.insertBefore(btn, hostEl.firstChild);
  return btn;
}
function bindPanelToggles(map, wm) {
  const fresh = {};
  for (const side of ["left", "right", "bottom"]) {
    const btn = map?.[side];
    if (!btn) continue;
    const el = btn.cloneNode(true);
    el.classList.remove("active", "pinned", "disabled");
    el.disabled = false;
    el.removeAttribute("aria-disabled");
    el.removeAttribute("aria-pressed");
    btn.replaceWith(el);
    el.addEventListener("click", () => wm.togglePanel(side));
    fresh[side] = el;
  }
  return fresh;
}
function syncPanelToggles(map, wm) {
  for (const side of ["left", "right", "bottom"]) {
    const btn = map?.[side];
    if (!btn) continue;
    btn.classList.toggle("twm-panel-toggle-btn--on", wm.isPanelOpen(side));
  }
}
function mountDesktopBar(hostEl, wm) {
  if (!hostEl) return null;
  let el = hostEl.querySelector("#twm-desktops");
  if (!el) {
    el = document.createElement("div");
    el.id = "twm-desktops";
    el.className = "twm-desktops";
    hostEl.appendChild(el);
  }
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-desktop]");
    if (!btn) return;
    const v = btn.dataset.desktop;
    if (v === "+") {
      wm.addDesktop();
      syncDesktopBar(el, wm);
      return;
    }
    wm.switchDesktop(Number(v));
  });
  el.addEventListener("dblclick", async (e) => {
    const btn = e.target.closest("[data-desktop]");
    if (!btn || btn.dataset.desktop === "+") return;
    e.preventDefault();
    const idx = Number(btn.dataset.desktop);
    const d = wm.desktops.desktops[idx];
    if (!d) return;
    const result = await openForm({
      title: "Rename desktop",
      fields: [{
        name: "label",
        label: "Name",
        type: "text",
        required: true,
        hint: "Up to 24 characters. Shown in the bottom-bar chip and the Alt+N tooltip."
      }],
      defaults: { label: d.label },
      submitLabel: "Rename"
    });
    if (!result || !result.label) return;
    d.label = String(result.label).slice(0, 24);
    syncDesktopBar(el, wm);
    wm._persist();
  });
  el.addEventListener("contextmenu", (e) => {
    const btn = e.target.closest("[data-desktop]");
    if (!btn || btn.dataset.desktop === "+") return;
    e.preventDefault();
    const idx = Number(btn.dataset.desktop);
    const m = wm.desktops;
    const d = m.desktops[idx];
    const canDelete = m.desktops.length > 1;
    showContextMenu(e.clientX, e.clientY, [
      {
        label: `Switch to ${d.label}`,
        icon: "desktop_windows",
        action: "switch",
        disabled: idx === m.activeIdx
      },
      { label: "Rename\u2026", icon: "edit", action: "rename" },
      { separator: true },
      { label: "New desktop", icon: "add", action: "add" },
      {
        label: "Delete desktop",
        icon: "delete",
        action: "delete",
        danger: true,
        disabled: !canDelete
      }
    ], async (action) => {
      if (action === "switch") wm.switchDesktop(idx);
      else if (action === "rename") {
        const result = await openForm({
          title: "Rename desktop",
          fields: [{ name: "label", label: "Name", type: "text", required: true }],
          defaults: { label: d.label },
          submitLabel: "Rename"
        });
        if (!result || !result.label) return;
        d.label = String(result.label).slice(0, 24);
        syncDesktopBar(el, wm);
        wm._persist();
      } else if (action === "add") {
        wm.addDesktop();
        syncDesktopBar(el, wm);
      } else if (action === "delete") {
        wm.removeDesktop(idx);
        syncDesktopBar(el, wm);
      }
    });
  });
  return el;
}
function syncDesktopBar(el, wm) {
  if (!el) return;
  const m = wm.desktops;
  el.innerHTML = m.desktops.map((d, i) => `
            <button class="twm-desk__btn${i === m.activeIdx ? " twm-desk__btn--on" : ""}"
                    data-desktop="${i}"
                    title="Desktop ${d.label} (Alt+${i + 1}) \xB7 right-click to delete">
                ${d.label}
            </button>`).join("") + `<button class="twm-desk__btn twm-desk__btn--add"
                  data-desktop="+" title="Add desktop">+</button>`;
}
function _tileTabMenu(wm, leafId, x, y) {
  const tree = wm.desktops.active().tree;
  const leaf = tree.get(leafId);
  if (!leaf || leaf.kind !== "leaf") return;
  const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
  if (tabs.length === 0) return;
  openTileTabSwitcher({
    x,
    y,
    tabs,
    activeIdx: Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0)),
    onPick: (idx) => {
      tree.setActiveLeafTab(leafId, idx);
      tree.focus(leafId);
      wm.renderer.render();
      wm._persist?.();
      wm._notifyChange?.("tab-switch-from-menu");
    }
  });
}
function _tileContextMenu(wm, leafId, x, y) {
  const tree = wm.desktops.active().tree;
  const leaf = tree.get(leafId);
  if (!leaf) return;
  const isPanel = String(leaf.content?.kind || "").startsWith("panel:");
  tree.focus(leafId);
  wm.renderer._updateFocusClasses();
  const items = [
    { label: "Split horizontally", icon: "splitscreen_vertical_add", action: "split-h" },
    { label: "Split vertically", icon: "splitscreen_add", action: "split-v" },
    { separator: true },
    {
      label: "Open in new tab",
      icon: "tab",
      action: "open-tab",
      disabled: isPanel || !leaf.content
    },
    // TWO DIFFERENT GLYPHS FOR TWO DIFFERENT DESTINATIONS. `web_asset` is a
    // window INSIDE the application — the same glyph `ManagedWindow` uses
    // for itself — and an embedder that can also send content to a real
    // browser window keeps `open_in_new`, which is the universal "this
    // leaves the page". One glyph for both is how a user learns that the
    // two commands are the same command, and then loses a window looking
    // for it on the other screen.
    {
      label: "Open a copy in a window",
      icon: "web_asset",
      action: "open-window",
      disabled: isPanel || !leaf.content
    },
    // C20, THE OTHER HALF — and it was missing while the `close` half
    // below carried a paragraph explaining why it could not be.
    //
    // `_floatableLeaf` (`wm.js`) refuses to float content that declared
    // `chrome: { promote: false }`, and every door converges there — so
    // this row offered the verb, enabled, and returned null. The chrome's
    // own float BUTTON does not have the problem: C20 removes it from the
    // strip. That asymmetry is what hid this: the affordance the reader
    // checks is correct, and the menu one layer down is not.
    //
    // `=== false` EXACTLY, because that is the test the verb makes
    // (`wm.js`, `_floatableLeaf`: *"content that says nothing about
    // `promote` stays floatable"*). A falsy test here would grey the row
    // on every leaf whose content returned no `chrome` at all, which is
    // most of them — a menu disagreeing with its verb in the generous
    // direction is a dead control; in the mean direction it is a missing
    // feature, and this file has shipped one of each.
    {
      label: "Float this pane as a window",
      icon: "web_asset",
      action: "promote",
      disabled: isPanel || !leaf.content || wm.renderer?.leafChrome?.(leafId)?.promote === false
    }
  ];
  if (wm.desktops.desktops.length > 1 && !isPanel) {
    for (const [i, d] of wm.desktops.desktops.entries()) {
      if (i === wm.desktops.activeIdx) continue;
      items.push({
        label: `Move to desktop ${d.label}`,
        icon: "sweep",
        action: `move:${i}`
      });
    }
  }
  items.push({ separator: true });
  const closeVeto = wm.renderer?.leafChrome?.(leafId)?.close;
  const closeVetoed = closeVeto === false || closeVeto?.disabled === true;
  items.push({
    label: "Close tile",
    icon: "close",
    action: "close",
    danger: true,
    disabled: isPanel || closeVetoed,
    title: closeVetoed ? closeVeto?.title || void 0 : void 0
  });
  showContextMenu(x, y, items, (action) => {
    if (action === "split-h") wm.split("h");
    else if (action === "split-v") wm.split("v");
    else if (action === "open-tab") {
      const c = leaf.content;
      if (c) wm.openInTabFromContext({ leafId }, c.kind, c.props || {});
    } else if (action === "open-window") {
      const c = leaf.content;
      if (c) wm.navigate(c.kind, c.props || {}, { target: "window" });
    } else if (action === "promote") wm.toggleManagedFocused();
    else if (action === "close") wm.closeFocused();
    else if (action?.startsWith?.("move:")) {
      wm.moveFocusedToDesktop(Number(action.slice(5)));
    }
  });
}
export {
  DesktopManager,
  PLACEHOLDER_KIND,
  PanelKeyRouter,
  TILE_TAB_MIME,
  TileRenderer,
  TileTree,
  WindowManager,
  actionsCellRenderer,
  attachLandingKeyboardNav,
  attachLandingShell,
  attachLandingTableBehavior,
  createCommandPalette,
  createContentRegistry,
  createEntityCatalog,
  createPageFactories,
  createShell,
  createTaxonomy,
  getPanelKeyRouter,
  installKeymap,
  installPanelKeyRouter,
  loadDesktops,
  makeLeaf,
  makeLoadingOverlay,
  makeSplit,
  mountLandingActions,
  mountLandingShell,
  mountNavPanel,
  mountTileBreadcrumb,
  openTileTabMenu,
  openTileTabSwitcher,
  registerPanelKeys,
  saveDesktops,
  uninstallPanelKeyRouter,
  wireLandingPaneFocus
};
//# sourceMappingURL=wm.js.map
