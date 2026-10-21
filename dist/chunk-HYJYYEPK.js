import {
  revealInStrip,
  wheelStripSideways
} from "./chunk-N7HC3ADV.js";
import {
  DragReorder
} from "./chunk-WVFGV5FT.js";

// src/ui/components/tabs.js
var TAB_LEVELS = Object.freeze(["info", "warning", "alert"]);
var stripCount = 0;
function createTabs(container, {
  items = [],
  active = null,
  onSelect = null,
  onReselect = null,
  onClose = null,
  onReorder = null,
  onContextMenu = null,
  mountPane = null,
  eventBus = null,
  selectEvent = null,
  selectFrom = (payload) => payload?.id,
  compact = false,
  label = null,
  block = "twm-tabs",
  dataKey = "tab-id"
} = {}) {
  const doc = container.ownerDocument;
  const uid = `${block}-${++stripCount}`;
  const datasetKey = dataKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const cls = (part) => `${block}__${part}`;
  const root = doc.createElement("div");
  root.className = compact ? `${block} ${block}--compact` : block;
  const strip = doc.createElement("div");
  strip.className = cls("tabs");
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-orientation", "horizontal");
  if (label) strip.setAttribute("aria-label", label);
  root.appendChild(strip);
  let body = null;
  if (mountPane) {
    body = doc.createElement("div");
    body.className = cls("body");
    root.appendChild(body);
  }
  container.appendChild(root);
  let order = [];
  const byId = /* @__PURE__ */ new Map();
  const tabs = /* @__PURE__ */ new Map();
  const idByEl = /* @__PURE__ */ new WeakMap();
  const panes = /* @__PURE__ */ new Map();
  let current = null;
  let serial = 0;
  let destroyed = false;
  let subscription = null;
  function tabFor(id) {
    let entry = tabs.get(id);
    if (entry) return entry;
    const el = doc.createElement("button");
    el.type = "button";
    el.className = cls("tab");
    el.dataset[datasetKey] = id;
    el.id = `${uid}-tab-${++serial}`;
    el.setAttribute("role", "tab");
    el.setAttribute("aria-selected", "false");
    el.tabIndex = -1;
    idByEl.set(el, id);
    entry = { el };
    tabs.set(id, entry);
    return entry;
  }
  function badgeOf(item) {
    const b = item.badge;
    if (b && typeof b === "object") return { count: Number(b.count) || 0, level: b.level ?? null };
    return { count: Number(b) || 0, level: null };
  }
  function drawBadge(span, { count, level }) {
    span.hidden = count <= 0;
    span.textContent = count > 99 ? "99+" : String(Math.max(count, 0));
    span.className = cls("badge") + (TAB_LEVELS.includes(level) ? ` ${cls("badge")}--${level}` : "");
  }
  function drawIndicator(span, value) {
    span.hidden = !value;
    span.className = cls("indicator") + (TAB_LEVELS.includes(value) ? ` ${cls("indicator")}--${value}` : "");
  }
  function draw(id) {
    const item = byId.get(id);
    const { el } = tabFor(id);
    const closable = !!(item.closable && onClose);
    el.classList.toggle(`${cls("tab")}--dirty`, !!item.dirty);
    el.classList.toggle(`${cls("tab")}--closable`, closable);
    if (item.title) el.title = item.title;
    else el.removeAttribute("title");
    const parts = [];
    if (item.icon) {
      const icon = doc.createElement("span");
      icon.className = `material-symbols-outlined ${cls("icon")}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = item.icon;
      parts.push(icon);
    }
    const text = doc.createElement("span");
    text.className = cls("label");
    text.textContent = item.label ?? String(id);
    parts.push(text);
    const badge = doc.createElement("span");
    drawBadge(badge, badgeOf(item));
    parts.push(badge);
    const dot = doc.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    drawIndicator(dot, item.indicator);
    parts.push(dot);
    if (item.dirty) {
      const dirty = doc.createElement("span");
      dirty.className = cls("dirty");
      dirty.setAttribute("aria-label", "unsaved");
      dirty.textContent = "\u25CF";
      parts.push(dirty);
    }
    if (closable) {
      const close = doc.createElement("span");
      close.className = cls("close");
      close.setAttribute("aria-hidden", "true");
      close.title = "Close";
      close.textContent = "\xD7";
      parts.push(close);
    }
    el.replaceChildren(...parts);
  }
  function mount(id) {
    if (destroyed || !mountPane || panes.has(id)) return panes.get(id) ?? null;
    const el = doc.createElement("div");
    el.className = `${block}-pane`;
    el.dataset[datasetKey] = id;
    el.id = `${tabFor(id).el.id}-pane`;
    el.setAttribute("role", "tabpanel");
    el.setAttribute("aria-labelledby", tabFor(id).el.id);
    el.hidden = id !== current;
    body.appendChild(el);
    tabFor(id).el.setAttribute("aria-controls", el.id);
    const entry = { el, instance: null };
    panes.set(id, entry);
    let instance = null;
    try {
      instance = mountPane(byId.get(id), el, api) ?? null;
    } catch (err) {
      console.error(`[tabs] pane "${id}" failed to mount`, err);
    }
    if (panes.get(id) !== entry) {
      try {
        instance?.destroy?.();
      } catch (err) {
        console.warn(`[tabs] pane "${id}" destroy failed`, err);
      }
      return null;
    }
    entry.instance = instance;
    return entry;
  }
  function mountEager() {
    for (const id of order) if (byId.get(id).eager && !panes.has(id)) mount(id);
  }
  function unmount(id) {
    const entry = panes.get(id);
    if (!entry) return;
    panes.delete(id);
    try {
      entry.instance?.destroy?.();
    } catch (err) {
      console.warn(`[tabs] pane "${id}" destroy failed`, err);
    }
    entry.el.remove();
  }
  function paint() {
    for (const [key, { el }] of tabs) {
      const on = key === current;
      el.classList.toggle(`${cls("tab")}--on`, on);
      el.setAttribute("aria-selected", String(on));
      el.tabIndex = on ? 0 : -1;
    }
    for (const [key, entry] of panes) entry.el.hidden = key !== current;
  }
  function show(id, notify) {
    current = id;
    paint();
    if (id != null) {
      mount(id)?.instance?.onShow?.();
      if (destroyed) return;
      if (tabs.has(id)) revealInStrip(strip, tabs.get(id).el);
    }
    if (notify) onSelect?.(id, id == null ? null : byId.get(id));
  }
  function select(id, { focus = false } = {}) {
    if (destroyed || !byId.has(id)) return false;
    if (id !== current) show(id, true);
    if (focus && !destroyed) tabs.get(id)?.el.focus();
    return true;
  }
  function setItems(next) {
    const seen = /* @__PURE__ */ new Set();
    order = [];
    byId.clear();
    for (const item of next) {
      if (item?.id == null || seen.has(item.id)) continue;
      seen.add(item.id);
      order.push(item.id);
      byId.set(item.id, { ...item });
    }
    for (const id of [...tabs.keys()]) {
      if (byId.has(id)) continue;
      tabs.get(id).el.remove();
      tabs.delete(id);
      unmount(id);
    }
    for (const id of order) {
      draw(id);
      strip.appendChild(tabs.get(id).el);
    }
    dragReorder?.attach();
  }
  const idOf = (target) => {
    const el = target?.closest?.(`.${cls("tab")}`);
    return el && strip.contains(el) && idByEl.has(el) ? idByEl.get(el) : null;
  };
  function onClick(e) {
    const id = idOf(e.target);
    if (id == null) return;
    if (e.target.closest(`.${cls("close")}`)) {
      onClose?.(id, byId.get(id));
      return;
    }
    if (id === current && !destroyed) {
      onReselect?.(id, byId.get(id));
      return;
    }
    select(id);
  }
  function onAuxClick(e) {
    const id = idOf(e.target);
    if (e.button !== 1 || id == null || !byId.get(id)?.closable || !onClose) return;
    e.preventDefault();
    onClose(id, byId.get(id));
  }
  function onKeyDown(e) {
    const id = idOf(e.target);
    if (id == null || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = order.indexOf(id);
    let to = null;
    if (e.key === "ArrowRight") to = order[(at + 1) % order.length];
    else if (e.key === "ArrowLeft") to = order[(at - 1 + order.length) % order.length];
    else if (e.key === "Home") to = order[0];
    else if (e.key === "End") to = order[order.length - 1];
    else if (e.key === "Delete" && byId.get(id)?.closable && onClose) {
      e.preventDefault();
      onClose(id, byId.get(id));
      return;
    }
    if (to == null) return;
    e.preventDefault();
    select(to, { focus: true });
  }
  function onMenu(e) {
    const id = idOf(e.target);
    if (id == null || !onContextMenu) return;
    e.preventDefault();
    onContextMenu(id, e, byId.get(id));
  }
  const onWheel = (e) => wheelStripSideways(strip, e);
  strip.addEventListener("click", onClick);
  strip.addEventListener("auxclick", onAuxClick);
  strip.addEventListener("keydown", onKeyDown);
  strip.addEventListener("contextmenu", onMenu);
  strip.addEventListener("wheel", onWheel, { passive: false });
  const dragReorder = onReorder ? new DragReorder({
    container: strip,
    itemSelector: `.${cls("tab")}`,
    keyAttr: datasetKey,
    axis: "x",
    draggableGuard: (e) => !e.target.closest?.(`.${cls("close")}`),
    // DragReorder answers the `data-*` strings; the buttons, now in their
    // new order, give the caller's ids back unchanged.
    onReorder: () => {
      order = [...strip.querySelectorAll(`.${cls("tab")}`)].filter((el) => idByEl.has(el)).map((el) => idByEl.get(el)).filter((id) => byId.has(id));
      onReorder(order.slice());
    }
  }) : null;
  const api = {
    root,
    /** Bring a tab to the front. False for an id it does not have. */
    select: (id) => select(id),
    /** The tab in front, or null. */
    active: () => current,
    /** Whether a tab with this id is in the strip. */
    has: (id) => byId.has(id),
    /** The ids, in strip order. */
    ids: () => order.slice(),
    /**
     * Replace the items. The tab in front is `activeId` when given and
     * present, else the one in front now if it is still there, else the
     * first. Panes of items that went are destroyed; eager items that
     * came are mounted, in order, before the tab in front is settled.
     * No items left: nothing is in front, heard as `onSelect(null, null)`.
     * Focus on a tab that went moves to the tab in front, unless the
     * update put it somewhere else (a pane that focuses itself on show).
     */
    update(next = [], activeId = void 0) {
      if (destroyed) return;
      const focused = doc.activeElement;
      const focusedTab = idByEl.has(focused) && strip.contains(focused);
      setItems(next);
      mountEager();
      if (destroyed) return;
      const want = activeId !== void 0 && byId.has(activeId) ? activeId : byId.has(current) ? current : order[0] ?? null;
      if (want !== current) show(want, true);
      else paint();
      if (destroyed) return;
      const fell = doc.activeElement == null || doc.activeElement === doc.body;
      if (focusedTab && !strip.contains(focused) && fell && current != null) {
        tabs.get(current).el.focus();
      }
    },
    /** `count` on a tab, coloured by `level`; nothing at zero. */
    setBadge(id, count, level = null) {
      const item = byId.get(id);
      if (!item) return;
      item.badge = { count: Number(count) || 0, level };
      const span = tabs.get(id).el.querySelector(`.${cls("badge")}`);
      if (span) drawBadge(span, badgeOf(item));
    },
    /** The dot on a tab: a level, `true` for the neutral one, falsy for none. */
    setIndicator(id, value) {
      const item = byId.get(id);
      if (!item) return;
      item.indicator = value;
      const span = tabs.get(id).el.querySelector(`.${cls("indicator")}`);
      if (span) drawIndicator(span, value);
    },
    /** A mounted pane's instance, or null. */
    instance: (id) => panes.get(id)?.instance ?? null,
    /** Every mounted pane's instance, in mount order. */
    instances: () => [...panes.values()].map((p) => p.instance).filter(Boolean),
    /** Gone for good: panes are destroyed, the bus is let go, the markup removed. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        subscription?.dispose?.();
      } catch {
      }
      strip.removeEventListener("click", onClick);
      strip.removeEventListener("auxclick", onAuxClick);
      strip.removeEventListener("keydown", onKeyDown);
      strip.removeEventListener("contextmenu", onMenu);
      strip.removeEventListener("wheel", onWheel);
      dragReorder?.destroy();
      for (const id of [...panes.keys()]) unmount(id);
      root.remove();
    }
  };
  setItems(items);
  current = byId.has(active) ? active : order[0] ?? null;
  mountEager();
  show(current, false);
  if (eventBus && selectEvent && !destroyed) {
    subscription = eventBus.on?.(selectEvent, (payload) => select(selectFrom(payload))) ?? null;
  }
  return api;
}

export {
  TAB_LEVELS,
  createTabs
};
//# sourceMappingURL=chunk-HYJYYEPK.js.map
