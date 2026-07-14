import {
  HelpModal,
  openForm,
  showContextMenu
} from "./chunk-DVU44T77.js";
import {
  ManagedWindow
} from "./chunk-UCJ2WD4D.js";
import "./chunk-FL5KFNQH.js";
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
function createCommandPalette({ wm, api, taxonomy, catalog, placeholder = "Search\u2026" }) {
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
    overlay.innerHTML = _markup(taxonomy, placeholder);
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
function _markup(taxonomy, placeholder) {
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
            <div class="twm-cmdpal__toggles">
                <button class="twm-chip" data-toggle="left">
                    <span class="material-symbols-outlined">menu</span>
                    Left nav
                </button>
                <button class="twm-chip" data-toggle="right">
                    <span class="material-symbols-outlined">dock_to_left</span>
                    Right panel
                </button>
                <button class="twm-chip" data-toggle="bottom">
                    <span class="material-symbols-outlined">dock_to_bottom</span>
                    Bottom panel
                </button>
            </div>
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
function _makeDesktop(label, seed) {
  const tree = new TileTree();
  tree.setRoot(makeLeaf(seed()));
  return {
    id: `desk-${Math.random().toString(36).slice(2, 8)}`,
    label,
    tree,
    windows: [],
    // boot default: left + right + bottom all open. Names are
    // assigned by wm._canonicalize via PANEL_TITLES.
    panels: { ...DEFAULT_PANEL_STATE }
  };
}
var DesktopManager = class _DesktopManager {
  /** @param {{seed: () => object}} opts  `seed` builds the root leaf. Required. */
  constructor({ seed } = {}) {
    if (typeof seed !== "function") {
      throw new Error("DesktopManager: a `seed` function is required (the taxonomy root leaf)");
    }
    this.seed = seed;
    this.desktops = [_makeDesktop("1", seed)];
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
      this.desktops.push(_makeDesktop(String(this.desktops.length + 1), this.seed));
    }
  }
  addDesktop(label = null) {
    const d = _makeDesktop(label || String(this.desktops.length + 1), this.seed);
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
  static deserialize(blob, { seed } = {}) {
    const m = new _DesktopManager({ seed });
    if (!blob || !Array.isArray(blob.desktops) || blob.desktops.length === 0) return m;
    m.desktops = blob.desktops.map((raw) => ({
      id: raw.id || `desk-${Math.random().toString(36).slice(2, 8)}`,
      label: raw.label || "?",
      tree: raw.tree ? TileTree.deserialize(raw.tree) : new TileTree(),
      windows: [],
      panels: { ...DEFAULT_PANEL_STATE, ...raw.panels || {} }
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
function installKeymap({ wm, palette }) {
  document.addEventListener("keydown", (e) => {
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
        ".twm-global-top-bar .twm-bar-center.twm-top-nav .twm-top-nav__btn"
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
  });
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
  const render = () => {
    _renderInto(root, _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate));
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
    destroy: () => {
      try {
        unsubscribe?.();
      } catch (err) {
        console.warn("[breadcrumb] rootCrumb teardown threw", err);
      }
    }
  };
}
function _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate) {
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
var TileRenderer = class {
  constructor({ root, tree, content, ctx, onFocusChange }) {
    if (!content || typeof content.mount !== "function") {
      throw new Error("TileRenderer: a content registry is required");
    }
    this.root = root;
    this.tree = tree;
    this.content = content;
    this.ctx = ctx || {};
    this.onFocusChange = onFocusChange || (() => {
    });
    this._leafCache = /* @__PURE__ */ new Map();
    this._drag = null;
    this.root.classList.add("twm-root");
    this.root.addEventListener("mousedown", this._onMouseDown.bind(this));
  }
  render() {
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
    this.root.innerHTML = "";
    const tree = this.tree;
    if (!tree.rootId) {
      const empty = document.createElement("div");
      empty.className = "twm-empty";
      empty.textContent = "Empty desktop \u2014 Ctrl+K to open something.";
      this.root.appendChild(empty);
      this._cleanCache(/* @__PURE__ */ new Set());
      return;
    }
    const liveLeafIds = /* @__PURE__ */ new Set();
    this._mount(tree.rootId, this.root, liveLeafIds);
    this._cleanCache(liveLeafIds);
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
  }
  _cleanCache(liveSet) {
    for (const [leafId, entry] of [...this._leafCache.entries()]) {
      if (!liveSet.has(leafId)) {
        try {
          entry.content?.destroy?.();
        } catch (_) {
        }
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
    const tabFingerprint = (leaf.tabs || []).map((t) => `${t.kind}::${JSON.stringify(t.props || {})}`).join("|") + `#${leaf.activeTabIdx || 0}`;
    const kindKey = leaf.content ? `${leaf.content.kind}::${JSON.stringify(leaf.content.props || {})}::tabs:${tabFingerprint}` : "__empty__";
    let entry = this._leafCache.get(leaf.id);
    if (entry && entry.kindKey === kindKey) {
      entry.titleEl.textContent = leaf.title || (leaf.content ? leaf.content.kind : "empty");
      return entry.wrapEl;
    }
    if (entry) {
      try {
        entry.content?.destroy?.();
      } catch (_) {
      }
      entry.wrapEl.remove();
    }
    const wrap = document.createElement("div");
    wrap.className = "twm-leaf";
    wrap.dataset.leafId = leaf.id;
    const chrome = document.createElement("div");
    chrome.className = "twm-leaf__chrome";
    const title = document.createElement("span");
    title.className = "twm-leaf__title";
    title.textContent = leaf.title || (leaf.content ? leaf.content.kind : "empty");
    const actions = document.createElement("span");
    actions.className = "twm-leaf__actions";
    const isPanel = String(leaf.content?.kind || "").startsWith("panel:");
    actions.innerHTML = `
            ${isPanel ? "" : `
                <button class="twm-leaf__btn" data-action="split-h" title="Split horizontally (Alt+H)">
                    <span class="material-symbols-outlined">splitscreen_vertical_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="split-v" title="Split vertically (Alt+V)">
                    <span class="material-symbols-outlined">splitscreen_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="promote" title="Promote to window (Alt+F)">
                    <span class="material-symbols-outlined">open_in_new</span>
                </button>`}
            <button class="twm-leaf__btn" data-action="close" title="Close (Alt+W)">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
    chrome.append(title, actions);
    const body = document.createElement("div");
    body.className = "twm-leaf__body";
    body.tabIndex = -1;
    const tabBar = document.createElement("div");
    tabBar.className = "twm-leaf__tabbar";
    if (!Array.isArray(leaf.tabs) || leaf.tabs.length <= 1) {
      tabBar.classList.add("twm-leaf__tabbar--hidden");
    }
    wrap.append(chrome, body, tabBar);
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
    } else {
      body.innerHTML = `<div class="tile-placeholder"><div class="tile-placeholder__hint">empty tile</div></div>`;
    }
    entry = {
      wrapEl: wrap,
      bodyEl: body,
      chromeEl: chrome,
      titleEl: title,
      content,
      kindKey,
      tabBarEl: tabBar
    };
    this._leafCache.set(leaf.id, entry);
    this._renderTabBar(leaf, entry);
    return wrap;
  }
  /** Paint a leaf's bottom tab strip. The strip is hidden for
   *  single-tab leaves (the common case) so existing layouts read as
   *  identical to today. Hamburger button at the start, then one
   *  trapezoid-shaped tab per stored tab spec. */
  _renderTabBar(leaf, entry) {
    const bar = entry.tabBarEl;
    if (!bar) return;
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
    if (tabs.length <= 1) {
      bar.classList.add("twm-leaf__tabbar--hidden");
      bar.innerHTML = "";
      return;
    }
    bar.classList.remove("twm-leaf__tabbar--hidden");
    const activeIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    bar.innerHTML = `
            <button type="button" class="twm-leaf__tab-hamburger"
                    data-action="tab-menu"
                    title="Open in new tab from this page's content">
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

// src/tiling/wm.js
var PANEL_KINDS = /* @__PURE__ */ new Set(["panel:left", "panel:right", "panel:bottom"]);
var PANEL_TITLES = {
  left: "Navigator",
  right: "Inspector",
  bottom: "Console"
};
var WindowManager = class {
  constructor({ rootEl, api, ctx, onChange, eventBus, host, taxonomy, events, content }) {
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
    this.desktops = new DesktopManager({ seed: this._rootLeaf });
    this.renderer = new TileRenderer({
      root: rootEl,
      tree: this.desktops.active().tree,
      content,
      ctx: {
        ...this.ctx,
        wm: this,
        onLeafAction: (leafId, action) => this._leafAction(leafId, action),
        onLeafTabAction: (leafId, action, data) => this._leafTabAction(leafId, action, data)
      },
      onFocusChange: () => this._notifyChange()
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
      this.desktops = DesktopManager.deserialize(blob, { seed: this._rootLeaf });
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
    tree.updateActiveTabProps(leafId, patch);
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
   *  previous mount, mounts the new kind into the same contentEl,
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
    rec.contentEl.innerHTML = "";
    const mountInfo = this.content.mount(
      kind,
      rec.contentEl,
      props,
      { ...this.ctx, wm: this, windowId: winId }
    );
    rec.mountInfo = mountInfo;
    rec.original = {
      kind,
      props: { ...props || {} },
      title: mountInfo?.title || kind
    };
    try {
      const titleEl = rec.window.element?.querySelector(".twm-managed-window__title");
      if (titleEl) titleEl.textContent = rec.original.title;
      if (rec.window) rec.window.title = rec.original.title;
    } catch {
    }
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
    tree.split(focused, dir);
    this.renderer.render();
    this._persist();
    this._notifyChange();
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
  /** Promote the focused tile into a managed window and CLOSE the
   *  source tile — promoting means the content leaves the grid, so the
   *  origin slot is removed rather than left as an empty placeholder.
   *  "Back to tile" re-docks the content into the primary tile. */
  toggleManagedFocused() {
    const tree = this._tree();
    const focused = tree.focused();
    if (!focused || !focused.content) return;
    if (PANEL_KINDS.has(focused.content.kind)) return;
    if (focused.content.kind === PLACEHOLDER_KIND) return;
    const leafId = focused.id;
    const desktopIdx = this.desktops.activeIdx;
    const original = {
      kind: focused.content.kind,
      props: { ...focused.content.props || {} },
      title: focused.title
    };
    const contentEl = document.createElement("div");
    contentEl.className = "twm-window-content";
    contentEl.style.cssText = "display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;";
    const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const mountInfo = this.content.mount(
      original.kind,
      contentEl,
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
      onClose: () => this._onManagedWindowClosed(winId, mountInfo)
    });
    this._windowToLeaf.set(winId, {
      // Promoting CLOSES the source tile — the content lives in the
      // window now, not the tree. leafId is null so "back to tile"
      // re-docks into the primary tile (see _onManagedWindowClosed).
      leafId: null,
      desktopIdx,
      original,
      mountInfo,
      window: win,
      contentEl,
      // Set to true by bringBackWindow so the close path knows to
      // restore the content instead of destroying it.
      _demoting: false
    });
    tree.close(leafId);
    this._canonicalize(tree, this.desktops.active());
    this.renderer.render();
    win.show();
    this._decorateManagedWindow(win, winId);
    this._persist();
    this._notifyChange("window-promoted");
  }
  /** Dock the window's content back into the desktop's primary tile
   *  (the source tile was closed on promote), then close the window. */
  bringBackWindow(windowId) {
    const rec = this._windowToLeaf.get(windowId);
    if (!rec) return;
    rec._demoting = true;
    try {
      rec.window.close({ force: true });
    } catch (err) {
      console.warn("[wm] bringBack: close failed", err);
    }
  }
  /** Re-home a managed window to another desktop. The window itself
   *  stays on screen (managed windows are global) and leaves no tile
   *  behind on either desktop; only its "home" changes, so bringing it
   *  back will land on the new desktop's primary tile. */
  moveWindowToDesktop(windowId, targetIdx) {
    const rec = this._windowToLeaf.get(windowId);
    if (!rec) return;
    if (rec.desktopIdx === targetIdx) return;
    this.desktops.ensureCount(targetIdx + 1);
    rec.desktopIdx = targetIdx;
    this._persist();
    this._notifyChange("window-moved");
  }
  _onManagedWindowClosed(winId, mountInfo) {
    const rec = this._windowToLeaf.get(winId);
    this._windowToLeaf.delete(winId);
    if (!rec) return;
    try {
      mountInfo?.destroy?.();
    } catch {
    }
    const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
    if (!tree) return;
    if (rec._demoting) {
      let pid = tree.primaryLeafId();
      let spawned = false;
      if (!pid) {
        pid = this._spawnContentLeaf(tree);
        spawned = true;
      }
      if (pid) {
        tree.appendLeafTab(
          pid,
          { kind: rec.original.kind, props: rec.original.props },
          rec.original.title
        );
        tree.focus(pid);
        if (spawned) this._canonicalize(tree, this.desktops.desktops[rec.desktopIdx]);
      }
    }
    if (this.desktops.active().tree === tree) this.renderer.render();
    this._persist();
    this._notifyChange(rec._demoting ? "window-demoted" : "window-closed");
  }
  /** Post-show DOM hook: inject a "back to tile" button into the
   *  window chrome and wire a right-click context menu on the topbar. */
  _decorateManagedWindow(win, winId) {
    const topbar = win.element?.querySelector?.(".twm-managed-window__topbar");
    const buttons = topbar?.querySelector?.(".twm-managed-window__buttons");
    if (!buttons) return;
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "twm-managed-window__btn managed-window__btn--demote";
    backBtn.title = "Back to tile";
    backBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">close_fullscreen</span>`;
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.bringBackWindow(winId);
    });
    const closeBtn = buttons.querySelector(".twm-managed-window__btn--close");
    if (closeBtn) buttons.insertBefore(backBtn, closeBtn);
    else buttons.appendChild(backBtn);
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
  removeDesktop(idx) {
    const m = this.desktops;
    if (m.desktops.length <= 1) return false;
    if (idx < 0 || idx >= m.desktops.length) return false;
    m.desktops.splice(idx, 1);
    if (m.activeIdx >= m.desktops.length) m.activeIdx = m.desktops.length - 1;
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
    const payload = { kind: focused.content.kind, props: focused.content.props, title: focused.title };
    this.desktops.ensureCount(idx + 1);
    const target = this.desktops.desktops[idx];
    const targetTree = target.tree;
    const primary = targetTree.primaryLeafId();
    if (primary) targetTree.setLeafContent(primary, { kind: payload.kind, props: payload.props }, payload.title);
    tree.close(focused.id);
    if (!tree.rootId) tree.setRoot(makeLeaf(this._rootLeaf()));
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
    const items = [
      { label: "Close tab", icon: "close", action: "close" }
    ];
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
  chrome = {}
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
  installKeymap({ wm, palette });
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
    dispose: () => {
      try {
        eventBus?.off?.("wm:changed", syncChrome);
      } catch {
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
  const existing = hostEl.querySelector("#twm-palette-btn");
  if (existing) return existing;
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
  if (!leaf) return;
  const kind = leaf.content?.kind || wm.taxonomy.root;
  openTileTabMenu({
    x,
    y,
    leafKind: kind,
    api: wm.api,
    taxonomy: wm.taxonomy,
    entities: wm.ctx.entities,
    onPick: (navKind, shaped) => {
      tree.appendLeafTab(leafId, {
        kind: navKind,
        props: { id: shaped.id, label: shaped.label }
      }, shaped.label || shaped.id);
      tree.focus(leafId);
      wm.renderer.render();
      wm._persist?.();
      wm._notifyChange?.("tab-open-from-menu");
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
    {
      label: "Open in new window",
      icon: "open_in_full",
      action: "open-window",
      disabled: isPanel || !leaf.content
    },
    {
      label: "Promote to window",
      icon: "open_in_new",
      action: "promote",
      disabled: isPanel || !leaf.content
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
  items.push({
    label: "Close tile",
    icon: "close",
    action: "close",
    danger: true,
    disabled: isPanel
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
  registerPanelKeys,
  saveDesktops,
  uninstallPanelKeyRouter,
  wireLandingPaneFocus
};
//# sourceMappingURL=wm.js.map
