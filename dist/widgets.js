import {
  StateMachine
} from "./chunk-3PHCPZHT.js";
import {
  DocumentOutline,
  HelpModal,
  MenuBar,
  createDocumentOutline,
  createMenuBar,
  helpCategories,
  helpCopy,
  helpProvider,
  installHelpShortcut,
  renderMarkdown,
  setHelpProvider
} from "./chunk-JKZLNKG6.js";
import {
  AutocompleteField
} from "./chunk-QWQJUDPD.js";
import {
  TAB_LEVELS,
  createTabs
} from "./chunk-HYJYYEPK.js";
import {
  ActionDropdown,
  ComponentBase,
  SlideOutPanel
} from "./chunk-4A7SJC3T.js";
import {
  hideContextMenu,
  showContextMenu
} from "./chunk-UWO43BZU.js";
import {
  ColorListField,
  SortableList,
  modalHost,
  openConfirm,
  openForm,
  openModal,
  setModalHost
} from "./chunk-D3COLZZ2.js";
import {
  ACTIONS,
  CellEditorHost,
  CellSelection,
  DEFAULT_HISTORY_LIMIT,
  DataTable,
  ISO_DATE,
  ISO_DATETIME,
  PAGING_HARD_LIMIT,
  PAGING_SOFT_LIMIT,
  StagedHistory,
  attachInlineRenamer,
  createChipsFilter,
  createRafResizeObserver,
  createTextEditor,
  detectSeries,
  formatDate,
  formatDuration,
  matchDateFilter,
  matchDurationFilter,
  parseDatePeriod,
  parseDateValue,
  parseDuration,
  projectSeries,
  resolvePaging
} from "./chunk-Q36EPT2R.js";
import {
  ColorField,
  DEFAULT_WINDOW_STORAGE_KEY,
  ManagedWindow,
  ROW_CONTROL_SELECTOR,
  ToggleField,
  endsTextSelection,
  isHexColor,
  isRowActivation,
  isRowControl,
  normalizeHex,
  selectBox,
  shownValue
} from "./chunk-CVMCZZX2.js";
import {
  getSetting
} from "./chunk-HNU6MM2B.js";
import {
  revealInStrip,
  wheelStripSideways
} from "./chunk-N7HC3ADV.js";
import {
  DragReorder
} from "./chunk-WVFGV5FT.js";
import "./chunk-JYWURG5T.js";

// src/ui/base/controller_base.js
var ControllerBase = class _ControllerBase {
  constructor({ eventBus, dataManager, logger } = {}) {
    if (new.target === _ControllerBase) {
      throw new Error("ControllerBase is abstract \u2013 extend it instead");
    }
    this.eventBus = eventBus;
    this.dataManager = dataManager;
    this.logger = logger;
    this._disposers = /* @__PURE__ */ new Set();
  }
  /**
   * Register a disposer callback to guarantee teardown.
   */
  trackDisposer(disposer) {
    if (typeof disposer === "function") {
      this._disposers.add(disposer);
    }
  }
  /**
   * Attach controller-specific DOM/event wiring. Subclasses implement this.
   */
  initialize() {
    throw new Error("ControllerBase.initialize must be implemented by subclasses");
  }
  /**
   * Dispose all tracked resources.
   */
  dispose() {
    for (const disposer of this._disposers) {
      try {
        disposer();
      } catch (err) {
        this.logger?.error?.("ui", "Controller disposer failed", err);
      }
    }
    this._disposers.clear();
  }
};

// src/ui/base/page_base.js
var PageBase = class _PageBase {
  constructor({ eventBus, dataManager, notificationCenter, logger } = {}) {
    if (new.target === _PageBase) {
      throw new Error("PageBase is abstract \u2013 extend it instead");
    }
    this.eventBus = eventBus;
    this.dataManager = dataManager;
    this.notificationCenter = notificationCenter;
    this.logger = logger;
    this._mounted = false;
    this._initPromise = null;
  }
  /**
   * Mount the page into a DOM container. Concrete pages must override this.
   * For pages with async initialization, store the init promise:
   * `this._initPromise = this.init();`
   */
  mount() {
    throw new Error("PageBase.mount must be implemented by subclasses");
  }
  /**
   * Wait for the page to complete initialization.
   * Returns immediately if no async init or if already complete.
   * @returns {Promise<void>}
   */
  async waitForReady() {
    if (this._initPromise) {
      try {
        await this._initPromise;
      } catch (err) {
        this.logger?.warn?.("page", "Init promise rejected", err);
      }
    }
  }
  /**
   * Optional hook invoked after the initial mount to hydrate data/state.
   * For pages with async init, this should await waitForReady().
   */
  async hydrate() {
    await this.waitForReady();
  }
  /**
   * Optional hook for when the page becomes active (tab switched, etc.).
   */
  onActivated() {
  }
  /**
   * Optional hook for when the page is hidden/unmounted but not disposed.
   */
  onDeactivated() {
  }
  /**
   * Dispose resources/event subscriptions.
   */
  dispose() {
    this._mounted = false;
    this._initPromise = null;
  }
};

// src/ui/components/about_dialog.js
function createExternalLink(text, url, className) {
  const a = document.createElement("a");
  a.className = className;
  a.textContent = text;
  a.href = url;
  a.title = url;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.open(url, "_blank");
  });
  return a;
}
function buildDepSection(title, deps) {
  const section = document.createElement("div");
  section.className = "twm-about-dialog__section";
  const heading = document.createElement("div");
  heading.className = "twm-about-dialog__section-title";
  heading.textContent = title;
  section.appendChild(heading);
  const list = document.createElement("div");
  list.className = "twm-about-dialog__dep-list";
  for (const dep of deps) {
    const row = document.createElement("div");
    row.className = "twm-about-dialog__dep";
    const link = createExternalLink(dep.name, dep.url, "twm-about-dialog__dep-name");
    row.appendChild(link);
    const lic = document.createElement("span");
    lic.className = "twm-about-dialog__dep-license";
    lic.textContent = dep.license;
    row.appendChild(lic);
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}
function showAboutDialog(product = {}) {
  const {
    name = "Application",
    version = "",
    tagline = "",
    license = "",
    url = "",
    urlLabel = "Homepage",
    logo = "info",
    credits = []
  } = product;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      dialogWindow.close();
      resolve();
    };
    const contentEl = document.createElement("div");
    contentEl.className = "twm-about-dialog__content";
    const header = document.createElement("div");
    header.className = "twm-about-dialog__header";
    const logoEl = document.createElement("span");
    logoEl.className = "twm-about-dialog__logo material-symbols-outlined";
    logoEl.textContent = logo;
    header.appendChild(logoEl);
    const title = document.createElement("h2");
    title.className = "twm-about-dialog__title";
    title.textContent = name;
    header.appendChild(title);
    if (version) {
      const versionEl = document.createElement("div");
      versionEl.className = "twm-about-dialog__version";
      versionEl.textContent = `Version ${version}`;
      header.appendChild(versionEl);
    }
    if (tagline) {
      const taglineEl = document.createElement("div");
      taglineEl.className = "twm-about-dialog__tagline";
      taglineEl.textContent = tagline;
      header.appendChild(taglineEl);
    }
    contentEl.appendChild(header);
    const body = document.createElement("div");
    body.className = "twm-about-dialog__body";
    if (url || license) {
      const projectSection = document.createElement("div");
      projectSection.className = "twm-about-dialog__section";
      const projectTitle = document.createElement("div");
      projectTitle.className = "twm-about-dialog__section-title";
      projectTitle.textContent = "Project";
      projectSection.appendChild(projectTitle);
      const links = document.createElement("div");
      links.className = "twm-about-dialog__links";
      if (url) {
        const link = createExternalLink(urlLabel, url, "twm-about-dialog__link");
        const icon2 = document.createElement("span");
        icon2.className = "material-symbols-outlined";
        icon2.textContent = "open_in_new";
        link.prepend(icon2);
        links.appendChild(link);
      }
      if (license) {
        const licenseSpan = document.createElement("span");
        licenseSpan.className = "twm-about-dialog__license-text";
        const licIcon = document.createElement("span");
        licIcon.className = "material-symbols-outlined";
        licIcon.textContent = "license";
        licenseSpan.appendChild(licIcon);
        licenseSpan.appendChild(document.createTextNode(`License: ${license}`));
        links.appendChild(licenseSpan);
      }
      projectSection.appendChild(links);
      body.appendChild(projectSection);
    }
    for (const section of credits) {
      body.appendChild(buildDepSection(section.title, section.deps ?? []));
    }
    contentEl.appendChild(body);
    const footer = document.createElement("div");
    footer.className = "twm-about-dialog__footer";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "twm-about-dialog__btn twm-about-dialog__btn--close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", finish);
    footer.appendChild(closeBtn);
    contentEl.appendChild(footer);
    const dialogWindow = new ManagedWindow({
      id: "about-dialog",
      title: `About ${name}`,
      icon: "info",
      content: contentEl,
      minWidth: 420,
      minHeight: 400,
      defaultWidth: 460,
      defaultHeight: 540,
      canMinimize: false,
      canMaximize: false,
      canResize: false,
      canDrag: false,
      modal: true,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }
    });
    dialogWindow.show();
    requestAnimationFrame(() => {
      closeBtn.focus();
    });
  });
}

// src/ui/components/alert_log.js
var ALERT_LEVELS = Object.freeze({
  info: Object.freeze({ label: "Info", icon: "info" }),
  warning: Object.freeze({ label: "Warning", icon: "warning" }),
  alert: Object.freeze({ label: "Alert", icon: "notifications_active" })
});
var LEVEL_ALIASES = { warn: "warning", error: "alert", danger: "alert", critical: "alert", success: "info" };
function normalizeLevel(level) {
  const l = String(level ?? "").toLowerCase();
  if (ALERT_LEVELS[l]) return l;
  return LEVEL_ALIASES[l] ?? "info";
}
function worstLevel(entries) {
  let worst = null;
  for (const e of entries || []) {
    const l = normalizeLevel(e?.level);
    if (l === "alert") return "alert";
    if (l === "warning") worst = "warning";
    else if (!worst) worst = "info";
  }
  return worst;
}
function ago(at, now = /* @__PURE__ */ new Date()) {
  const s = Math.max(0, (now - at) / 1e3);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(at, now = /* @__PURE__ */ new Date()) {
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((t - d) / 864e5);
  if (days === 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  return at.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}
var _seq = 0;
function normalizeEntry(raw) {
  const at = raw.at instanceof Date ? raw.at : new Date(raw.at ?? Date.now());
  return {
    ...raw,
    id: String(raw.id ?? `${Date.now().toString(36)}-${(_seq++).toString(36)}`),
    at: Number.isNaN(at.getTime()) ? /* @__PURE__ */ new Date() : at,
    level: normalizeLevel(raw.level),
    title: String(raw.title ?? ""),
    read: !!raw.read
  };
}
function localSource({ read, write, limit = 300 } = {}) {
  let all = null;
  const save = () => {
    try {
      write?.(all.map((e) => ({ ...e, at: e.at.toISOString() })));
    } catch (err) {
      console.warn("[alert-log] the log could not be saved", err);
    }
  };
  const ensure = async () => {
    if (all) return all;
    let saved = [];
    try {
      saved = await read?.() ?? [];
    } catch (err) {
      console.warn("[alert-log] the log could not be read", err);
    }
    all = (Array.isArray(saved) ? saved : []).filter((e) => e && typeof e === "object").map(normalizeEntry).sort((a, b) => b.at - a.at).slice(0, limit);
    return all;
  };
  return {
    local: true,
    async load({ offset = 0, limit: n = limit } = {}) {
      const list = await ensure();
      return { entries: list.slice(offset, offset + n), more: offset + n < list.length };
    },
    async add(entry) {
      const list = await ensure();
      list.unshift(entry);
      if (list.length > limit) list.length = limit;
      save();
    },
    async markRead(ids) {
      const want = ids ? new Set(ids) : null;
      for (const e of await ensure()) if (!want || want.has(e.id)) e.read = true;
      save();
    },
    async dismiss(ids) {
      const want = ids ? new Set(ids) : null;
      all = (await ensure()).filter((e) => want && !want.has(e.id));
      save();
    }
  };
}
function createAlertLog({ source = null, limit = 300 } = {}) {
  let entries = [];
  let more = false;
  let remoteUnread = null;
  let loaded = false;
  let loading = null;
  const listeners = /* @__PURE__ */ new Set();
  const changed = () => {
    for (const fn of [...listeners]) {
      try {
        fn(log);
      } catch (err) {
        console.warn("[alert-log] listener failed", err);
      }
    }
  };
  const tell = (verb, ...args) => {
    const fn = source?.[verb];
    if (typeof fn !== "function") return;
    Promise.resolve().then(() => fn.apply(source, args)).catch((err) => {
      console.warn(`[alert-log] the source refused ${verb}`, err);
      log.refresh();
    });
  };
  const page = async (offset) => {
    const res = await source?.load?.({ offset, limit }) ?? {};
    const got = (res.entries ?? []).map(normalizeEntry);
    return { got, more: !!res.more, unread: Number.isFinite(res.unread) ? res.unread : null };
  };
  const log = {
    /** Loaded entries, newest first. */
    entries: () => entries,
    loaded: () => loaded,
    /** Whether the source has older entries than those loaded. */
    hasMore: () => more,
    /** Whether entries can be dismissed: a log with no source, or a source that can. */
    canDismiss: () => !source || typeof source.dismiss === "function",
    /** Unread entries: the source's count when it knows one, else the loaded ones. */
    unreadCount() {
      const here = entries.filter((e) => !e.read).length;
      return remoteUnread === null ? here : Math.max(remoteUnread, here);
    },
    /** The worst level among unread entries, or null. */
    worstUnread: () => worstLevel(entries.filter((e) => !e.read)),
    get: (id) => entries.find((e) => e.id === String(id)) ?? null,
    /** `fn(log)` after every change; answers the unsubscribe. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** The first page, again. */
    refresh() {
      if (!source?.load) {
        loaded = true;
        changed();
        return Promise.resolve(log);
      }
      loading = page(0).then(({ got, more: m, unread }) => {
        entries = got;
        more = m;
        remoteUnread = unread;
        loaded = true;
        changed();
        return log;
      }).catch((err) => {
        console.warn("[alert-log] the log could not be loaded", err);
        loaded = true;
        changed();
        return log;
      }).finally(() => {
        loading = null;
      });
      return loading;
    },
    /** Load once; later calls answer the same promise or nothing. */
    load() {
      return loading ?? (loaded ? Promise.resolve(log) : log.refresh());
    },
    /** The next page, after the loaded ones. */
    async loadMore() {
      if (!more || !source?.load) return log;
      const { got, more: m, unread } = await page(entries.length);
      const seen = new Set(entries.map((e) => e.id));
      entries = [...entries, ...got.filter((e) => !seen.has(e.id))];
      more = m;
      if (unread !== null) remoteUnread = unread;
      changed();
      return log;
    },
    /** A new entry raised HERE (bugdesk's rules): kept, and handed to the source to save. */
    add(raw) {
      const entry = normalizeEntry(raw);
      entries = [entry, ...entries.filter((e) => e.id !== entry.id)];
      if (entries.length > limit) entries.length = limit;
      if (remoteUnread !== null && !entry.read) remoteUnread += 1;
      tell("add", entry);
      changed();
      return entry;
    },
    /** Entries that arrived from the source's side (a push): shown, not saved back. */
    receive(raws) {
      const got = (Array.isArray(raws) ? raws : [raws]).map(normalizeEntry);
      const ids = new Set(got.map((e) => e.id));
      const fresh = got.filter((e) => !entries.some((x) => x.id === e.id));
      entries = [...got, ...entries.filter((e) => !ids.has(e.id))].sort((a, b) => b.at - a.at).slice(0, limit);
      if (remoteUnread !== null) remoteUnread += fresh.filter((e) => !e.read).length;
      changed();
    },
    /** Mark these read — all of them when `ids` is omitted. */
    markRead(ids = null) {
      const want = ids ? new Set(ids.map(String)) : null;
      let n = 0;
      for (const e of entries) if (!e.read && (!want || want.has(e.id))) {
        e.read = true;
        n++;
      }
      if (remoteUnread !== null) remoteUnread = want ? Math.max(0, remoteUnread - n) : 0;
      if (!n && want) return;
      tell("markRead", want ? [...want] : null);
      changed();
    },
    /** Remove these — all of them when `ids` is omitted. Nothing, when the source cannot. */
    dismiss(ids = null) {
      if (!log.canDismiss()) return;
      const want = ids ? new Set(ids.map(String)) : null;
      const gone = entries.filter((e) => !want || want.has(e.id));
      if (!gone.length) return;
      entries = want ? entries.filter((e) => !want.has(e.id)) : [];
      if (remoteUnread !== null) {
        remoteUnread = want ? Math.max(0, remoteUnread - gone.filter((e) => !e.read).length) : 0;
      }
      tell("dismiss", want ? [...want] : null);
      changed();
    }
  };
  if (!source?.load) loaded = true;
  return log;
}

// src/ui/components/alerts_pane.js
var CHIPS = [["all", "All"], ["alert", "Alert"], ["warning", "Warning"], ["info", "Info"]];
var MORE_WITHIN_PX = 48;
function mountAlertsPane(host, {
  log,
  onOpen = null,
  onBadge = null,
  rules = null,
  stillMatches = null,
  describe = null,
  status = "",
  empty = {}
} = {}) {
  const doc = host.ownerDocument;
  const el3 = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== void 0) n.textContent = text;
    return n;
  };
  const icon2 = (name) => el3("span", "material-symbols-outlined", name);
  let level = "all";
  let rule = null;
  let q = "";
  let pointerDown = false;
  let pending = false;
  let destroyed = false;
  const root = el3("div", "twm-alerts");
  let ruleList = null;
  if (rules) {
    const side = el3("div", "twm-alerts__rules");
    const head = el3("div", "twm-alerts__head");
    head.append(el3("span", "twm-alerts__caps", "RULES"), el3("span", "twm-alerts__spacer"));
    if (rules.onEdit) {
      const edit = el3("button", "twm-alerts__link", "Edit rules");
      edit.type = "button";
      edit.dataset.act = "edit-rules";
      head.append(edit);
    }
    ruleList = el3("div", "twm-alerts__rulelist");
    side.append(head, ruleList);
    if (rules.foot) side.append(el3("div", "twm-alerts__foot", rules.foot));
    root.append(side);
  }
  const main = el3("div", "twm-alerts__main");
  const bar = el3("div", "twm-alerts__bar");
  const chips = el3("div", "twm-alerts__chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Level");
  const chipEls = /* @__PURE__ */ new Map();
  for (const [key, label] of CHIPS) {
    const chip = el3("button", "twm-alerts__chip");
    chip.type = "button";
    chip.dataset.level = key;
    chip.append(doc.createTextNode(`${label} `), el3("span", "twm-alerts__count", "0"));
    chips.append(chip);
    chipEls.set(key, chip);
  }
  const input = el3("input", "twm-alerts__q");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Filter";
  input.setAttribute("aria-label", "Filter alerts");
  const readAll = el3("button", "twm-btn twm-alerts__btn", "Mark all read");
  readAll.type = "button";
  readAll.dataset.act = "read-all";
  const clear = el3("button", "twm-btn twm-alerts__btn", "Clear");
  clear.type = "button";
  clear.dataset.act = "clear";
  bar.append(chips, input, el3("span", "twm-alerts__spacer"), readAll, clear);
  const list = el3("div", "twm-alerts__log");
  const foot = el3("div", "twm-alerts__status", status);
  foot.hidden = !status;
  main.append(bar, list, foot);
  root.append(main);
  host.append(root);
  const byRule = () => rule ? log.entries().filter((e) => String(e.ruleId) === rule) : log.entries();
  const shown = () => {
    const needle = q.trim().toLowerCase();
    return byRule().filter((e) => level === "all" || e.level === level).filter((e) => !needle || `${e.ref ?? ""} ${e.title} ${e.body ?? ""} ${e.rule ?? ""}`.toLowerCase().includes(needle));
  };
  function row(entry, now) {
    const lv = ALERT_LEVELS[normalizeLevel(entry.level)];
    const r = el3("div", `twm-alerts__row twm-alerts__row--${entry.level}${entry.read ? "" : " twm-alerts__row--unread"}`);
    r.dataset.id = entry.id;
    const mark = el3("span", "twm-alerts__unread");
    mark.setAttribute("aria-label", entry.read ? "Read" : "Unread");
    const ic = icon2(lv.icon);
    ic.classList.add("twm-alerts__icon");
    ic.title = lv.label;
    const time = el3("span", "twm-alerts__time", ago(entry.at, now));
    time.title = entry.at.toLocaleString();
    const text = el3("span", "twm-alerts__text");
    text.append(el3("span", "twm-alerts__title", entry.title));
    if (entry.body) text.append(el3("span", "twm-alerts__body", entry.body));
    const cells = [mark, ic, time];
    if (rules) cells.push(el3("span", "twm-alerts__rule", entry.rule ?? ""));
    const tag = describe?.(entry);
    cells.push(el3("span", tag ? "twm-alerts__tag" : "twm-alerts__tag twm-alerts__tag--none", tag ?? ""));
    const ref = el3(entry.ref && onOpen ? "button" : "span", "twm-alerts__ref", entry.ref ?? "");
    if (ref.tagName === "BUTTON") {
      ref.type = "button";
      ref.dataset.open = entry.id;
    }
    cells.push(ref, text);
    if (stillMatches) {
      const still = stillMatches(entry);
      cells.push(el3(
        "span",
        `twm-alerts__state${still === false ? " twm-alerts__state--gone" : ""}`,
        still === true ? "still matches" : still === false ? "no longer matches" : ""
      ));
    }
    const acts = el3("span", "twm-alerts__acts");
    if (onOpen) {
      const open = el3("button", "twm-alerts__icon-btn");
      open.type = "button";
      open.dataset.open = entry.id;
      open.title = "Open";
      open.setAttribute("aria-label", "Open");
      open.append(icon2("open_in_new"));
      acts.append(open);
    }
    if (log.canDismiss()) {
      const dis = el3("button", "twm-alerts__icon-btn");
      dis.type = "button";
      dis.dataset.dismiss = entry.id;
      dis.title = "Dismiss";
      dis.setAttribute("aria-label", "Dismiss");
      dis.append(icon2("close"));
      acts.append(dis);
    }
    cells.push(acts);
    r.append(...cells);
    return r;
  }
  function paint() {
    if (destroyed) return;
    if (pointerDown) {
      pending = true;
      return;
    }
    pending = false;
    const now = /* @__PURE__ */ new Date();
    const all = log.entries();
    const scoped = byRule();
    for (const [key, chip] of chipEls) {
      const on = level === key;
      chip.classList.toggle("twm-alerts__chip--on", on);
      chip.setAttribute("aria-pressed", String(on));
      chip.querySelector(".twm-alerts__count").textContent = String(scoped.filter((e) => key === "all" || e.level === key).length);
    }
    readAll.disabled = !all.some((e) => !e.read) && log.unreadCount() === 0;
    clear.hidden = !log.canDismiss();
    clear.disabled = !all.length;
    if (ruleList) {
      const items = [{ id: null, name: "All alerts", meta: String(all.length) }, ...rules.list?.() ?? []];
      ruleList.replaceChildren(...items.map((r) => {
        const key = r.id === null ? null : String(r.id);
        const b = el3("button", `twm-alerts__rulebtn${rule === key ? " twm-alerts__rulebtn--on" : ""}${r.off ? " twm-alerts__rulebtn--off" : ""}`);
        b.type = "button";
        b.dataset.rule = key ?? "";
        b.setAttribute("aria-pressed", String(rule === key));
        b.append(
          el3("span", `twm-alerts__dot${r.level ? ` twm-alerts__dot--${normalizeLevel(r.level)}` : ""}`),
          el3("span", "twm-alerts__rulename", r.name || "Unnamed rule"),
          el3("span", "twm-alerts__meta", r.meta ?? "")
        );
        return b;
      }));
    }
    const rows = [];
    let lastDay = "";
    for (const entry of shown()) {
      const day = dayLabel(entry.at, now);
      if (day !== lastDay) rows.push(el3("div", "twm-alerts__day", day));
      lastDay = day;
      rows.push(row(entry, now));
    }
    if (!rows.length) {
      rows.push(el3("div", "twm-alerts__none", !log.loaded() ? "Loading\u2026" : all.length ? empty.filtered ?? "No alerts match." : empty.none ?? "Nothing yet."));
    }
    if (log.hasMore()) {
      const older = el3("button", "twm-btn twm-alerts__more", "Load older");
      older.type = "button";
      older.dataset.act = "more";
      rows.push(older);
    }
    const scroll = list.scrollTop;
    list.replaceChildren(...rows);
    list.scrollTop = scroll;
    onBadge?.({ unread: log.unreadCount(), level: log.worstUnread() });
  }
  const onDown = () => {
    pointerDown = true;
  };
  const onUp = () => {
    if (!pointerDown) return;
    setTimeout(() => {
      pointerDown = false;
      if (pending) paint();
    }, 0);
  };
  root.addEventListener("mousedown", onDown, true);
  root.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("pointercancel", onUp, true);
  root.addEventListener("click", (event) => {
    const t = event.target;
    const chip = t.closest("[data-level]");
    if (chip) {
      level = chip.dataset.level;
      paint();
      return;
    }
    const r = t.closest("[data-rule]");
    if (r) {
      rule = r.dataset.rule || null;
      paint();
      return;
    }
    const open = t.closest("[data-open]");
    if (open) {
      const entry = log.get(open.dataset.open);
      if (!entry) return;
      log.markRead([entry.id]);
      onOpen?.(entry);
      return;
    }
    const dis = t.closest("[data-dismiss]");
    if (dis) {
      log.dismiss([dis.dataset.dismiss]);
      return;
    }
    const act = t.closest("[data-act]")?.dataset.act;
    if (act === "read-all") log.markRead();
    else if (act === "clear") log.dismiss();
    else if (act === "more") log.loadMore();
    else if (act === "edit-rules") rules?.onEdit?.();
  });
  input.addEventListener("input", () => {
    q = input.value;
    paint();
  });
  let loadingMore = false;
  list.addEventListener("scroll", () => {
    if (loadingMore || !log.hasMore()) return;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - MORE_WITHIN_PX) return;
    loadingMore = true;
    Promise.resolve(log.loadMore()).catch(() => {
    }).finally(() => {
      loadingMore = false;
    });
  });
  const unsubscribe = log.subscribe(() => paint());
  const timer = setInterval(paint, 6e4);
  paint();
  log.load?.();
  return {
    root,
    refresh: paint,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(timer);
      unsubscribe();
      doc.removeEventListener("mouseup", onUp, true);
      doc.removeEventListener("pointerup", onUp, true);
      doc.removeEventListener("pointercancel", onUp, true);
      root.remove();
    }
  };
}

// src/ui/components/attribute_list_editor.js
var SCALAR_TYPES = ["number", "integer", "string", "boolean"];
var DEFAULT_TYPES = [...SCALAR_TYPES, "expression"];
function refTypesFor(kinds = []) {
  return [
    ...kinds.map((k) => `ref:${k}`),
    ...kinds.map((k) => `list[ref:${k}]`)
  ];
}
var DEFAULT_COLUMNS = ["name", "type", "default", "value", "description"];
var COLUMN_TEMPLATES = {
  name: { label: "name", width: "minmax(140px, 1.2fr)" },
  type: { label: "type", width: "140px" },
  default: { label: "default", width: "minmax(110px, 1fr)" },
  value: { label: "value", width: "minmax(110px, 1fr)" },
  description: { label: "description", width: "minmax(160px, 2fr)" },
  required: { label: "req", width: "60px" },
  readonly: { label: "r/o", width: "60px" },
  expression: { label: "expression", width: "minmax(160px, 2fr)" },
  // Layer N3 — extended AttributeSpec fields. Opt-in via showColumns
  // so existing single-table layouts (asset_kind editor) stay tight;
  // the agent params surface includes them.
  min: { label: "min", width: "90px" },
  max: { label: "max", width: "90px" },
  step: { label: "step", width: "70px" },
  unit: { label: "unit", width: "80px" },
  distribution: { label: "dist", width: "110px" },
  // Distribution and "selection set" are two different concepts —
  // numeric params sample from a continuous distribution (uniform /
  // normal / lognormal / …), choice params pick from a discrete
  // option set. Keep them in separate columns so the user can tell
  // which is which at a glance.
  choices: { label: "choices", width: "130px" },
  // Variation-override flags — R7 in
  // docs/ARCHETYPE_RETHINK_REQUIREMENTS.md. Tight columns so they
  // stay readable next to the scalar fields.
  enabled: { label: "on", width: "50px" },
  force: { label: "lock", width: "50px" },
  optional: { label: "opt", width: "50px" }
};
var DISTRIBUTION_OPTIONS = [
  "",
  "constant",
  "uniform",
  "normal",
  "lognormal",
  "choice"
];
function _classifyRow(row, parentByName) {
  if (!parentByName) return "neutral";
  const p = parentByName.get(row.name);
  if (!p) return "neutral";
  const ourValue = row.value !== void 0 && row.value !== null ? row.value : row.default;
  const parentValue = p.value !== void 0 && p.value !== null ? p.value : p.default;
  if (ourValue === void 0 || ourValue === null) return "neutral";
  if (parentValue === void 0 || parentValue === null) return "overridden";
  if (String(ourValue) === String(parentValue)) return "inherited";
  return "overridden";
}
function mountAttributeListEditor(hostEl, options = {}) {
  const {
    items = [],
    types = DEFAULT_TYPES,
    showColumns = DEFAULT_COLUMNS,
    refResolvers = {},
    onChange = () => {
    },
    onFlush = () => {
    },
    addButtonText = "",
    emptyMessage = "No entries yet.",
    containerId = `attrs-${Math.random().toString(36).slice(2, 8)}`,
    allowReorder = true,
    allowRemove = true,
    // Layer 8.J1: parent-archetype attributes (the inherited baseline).
    // The editor uses this to classify each row as inherited / overridden /
    // neutral and to provide a revert action. Pass [] when no archetype
    // applies; the editor degrades gracefully (all rows render neutral).
    parentAttributes = null,
    createItem = () => ({
      name: "",
      type: "string",
      default: null,
      value: null,
      description: ""
    }),
    // Layer N3 — per-column renderer overrides. Callers can supply
    // `cellOverrides: {column_name: (item, callbacks, ctx) => HTMLElement | null}`
    // to swap in a custom cell. Returning `null` falls through to
    // the default renderer. The `ctx` object exposes:
    //    refreshRow()  — force a re-render (the wider list refreshes
    //                    when the row's items change, e.g. type swap).
    // Use cases: agent params' distribution-dict button cell;
    // structured-type modal openers on the default cell.
    cellOverrides = null,
    // R7 — when true, this editor is mounted as a *variation* of the
    // parent archetype (not on the archetype itself). Rows where
    // the parent has `force=true` lock their editable cells; the
    // `enabled/force/optional` flag columns themselves stay
    // read-only (variations don't author flags, only the
    // archetype does).
    variationMode = false
  } = options;
  const parentByName = parentAttributes ? new Map(parentAttributes.map((p) => [p.name, p])) : null;
  if (!hostEl) {
    return { refresh() {
    }, addItem() {
    }, dispose() {
    } };
  }
  hostEl.classList.add("twm-attr-editor");
  hostEl.style.setProperty(
    "--cols",
    showColumns.map((c) => COLUMN_TEMPLATES[c]?.width || "1fr").join(" ")
  );
  const refsCache = /* @__PURE__ */ new Map();
  const resolveRefOptions = async (target) => {
    if (refsCache.has(target)) return refsCache.get(target);
    const resolver = refResolvers[`ref:${target}`] || refResolvers[`list[ref:${target}]`];
    let list2 = [];
    if (typeof resolver === "function") {
      try {
        list2 = await resolver() || [];
      } catch (e) {
        console.warn("ref resolver failed", target, e);
      }
    }
    const normalised = (list2 || []).map((o) => {
      if (typeof o === "string") return { id: o, label: o };
      return { id: o.id ?? o.value ?? "", label: o.label ?? o.id ?? "" };
    }).filter((o) => o.id);
    refsCache.set(target, normalised);
    return normalised;
  };
  const header = document.createElement("div");
  header.className = "twm-sortable-list__row twm-attr-editor__header-row";
  if (allowReorder) {
    const handlePh = document.createElement("span");
    handlePh.className = "twm-sortable-list__handle twm-attr-editor__header-placeholder";
    header.appendChild(handlePh);
  }
  const headerContent = document.createElement("div");
  headerContent.className = "twm-sortable-list__content twm-attr-editor__headers";
  for (const col of showColumns) {
    const span = document.createElement("span");
    span.textContent = COLUMN_TEMPLATES[col]?.label ?? col;
    headerContent.appendChild(span);
  }
  header.appendChild(headerContent);
  if (allowRemove) {
    const removePh = document.createElement("span");
    removePh.className = "twm-sortable-list__remove twm-attr-editor__header-placeholder";
    header.appendChild(removePh);
  }
  hostEl.appendChild(header);
  const listHost = document.createElement("div");
  listHost.className = "ea-attr-editor__rows";
  hostEl.appendChild(listHost);
  let list = null;
  const renderRow = (contentEl, item, _idx, callbacks) => {
    contentEl.classList.add("twm-attr-editor__row");
    const cls = _classifyRow(item, parentByName);
    contentEl.classList.remove(
      "twm-attr-editor__row--inherited",
      "twm-attr-editor__row--overridden",
      "twm-attr-editor__row--neutral"
    );
    contentEl.classList.add(`twm-attr-editor__row--${cls}`);
    const parentRow = parentByName?.get(item.name);
    const flagSource = variationMode && parentRow ? parentRow : item;
    contentEl.classList.toggle(
      "twm-attr-editor__row--disabled",
      flagSource.enabled === false
    );
    contentEl.classList.toggle(
      "twm-attr-editor__row--forced",
      flagSource.force === true
    );
    contentEl.classList.toggle(
      "twm-attr-editor__row--optional",
      flagSource.optional === true
    );
    if (cls === "overridden") {
      const attention = document.createElement("span");
      attention.className = "twm-attr-editor__attention material-symbols-outlined";
      attention.textContent = "fiber_manual_record";
      attention.title = "Value overrides the parent default";
      contentEl.appendChild(attention);
    }
    for (const col of showColumns) {
      const cell = renderCell(col, item, callbacks);
      contentEl.appendChild(cell);
    }
    const FLAG_COLS = /* @__PURE__ */ new Set(["enabled", "force", "optional"]);
    if (variationMode && flagSource.force === true) {
      contentEl.querySelectorAll(
        'input:not([type="checkbox"]), select, textarea'
      ).forEach((el3) => {
        el3.disabled = true;
      });
    }
    if (variationMode) {
      contentEl.querySelectorAll(
        'input[type="checkbox"].ea-attr-editor__cell--flag'
      ).forEach((el3) => {
        el3.disabled = true;
      });
    }
    void FLAG_COLS;
    if (cls === "overridden" && parentByName) {
      const p = parentByName.get(item.name);
      const parentDefault = p?.value !== void 0 && p?.value !== null ? p.value : p?.default;
      const revert = document.createElement("button");
      revert.type = "button";
      revert.className = "twm-attr-editor__revert material-symbols-outlined";
      revert.textContent = "undo";
      revert.title = `Revert to inherited default (${parentDefault ?? "\u2014"})`;
      revert.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.update({ value: parentDefault });
        onFlush();
        list?.setItems(currentItems());
      });
      contentEl.appendChild(revert);
    }
  };
  const renderCell = (col, item, callbacks) => {
    if (cellOverrides && typeof cellOverrides[col] === "function") {
      const ctx = { refreshRow: () => list?.setItems(currentItems()) };
      const custom = cellOverrides[col](item, callbacks, ctx);
      if (custom) return custom;
    }
    if (col === "name") return renderTextCell(item, "name", callbacks, "attr_name");
    if (col === "type") return renderTypeCell(item, callbacks);
    if (col === "description") return renderTextCell(item, "description", callbacks, "optional");
    if (col === "required") return renderBoolCell(item, "required", callbacks);
    if (col === "readonly") return renderBoolCell(item, "readonly", callbacks);
    if (col === "enabled") return renderFlagCell(item, "enabled", callbacks, true);
    if (col === "force") return renderFlagCell(item, "force", callbacks, false);
    if (col === "optional") return renderFlagCell(item, "optional", callbacks, false);
    if (col === "expression") return renderTextCell(item, "expression", callbacks, "expr");
    if (col === "min") return renderNumericCell(item, "min", callbacks);
    if (col === "max") return renderNumericCell(item, "max", callbacks);
    if (col === "step") return renderTextCell(item, "step", callbacks, "any");
    if (col === "unit") return renderTextCell(item, "unit", callbacks, "USD/%/\u2026");
    if (col === "distribution") return renderDistributionCell(item, callbacks);
    if (col === "default" || col === "value") return renderTypedValueCell(col, item, callbacks);
    const stub = document.createElement("span");
    stub.textContent = "";
    return stub;
  };
  const renderNumericCell = (item, field, callbacks) => {
    const el3 = document.createElement("input");
    el3.type = "number";
    el3.className = "twm-sortable-list__input twm-attr-editor__cell";
    el3.step = "any";
    el3.value = item[field] === null || item[field] === void 0 ? "" : String(item[field]);
    el3.placeholder = "\u2014";
    el3.addEventListener("input", () => {
      const v = el3.value === "" ? null : Number(el3.value);
      callbacks.update({ [field]: v });
    });
    el3.addEventListener("blur", () => onFlush());
    return el3;
  };
  const renderDistributionCell = (item, callbacks) => {
    const el3 = document.createElement("select");
    el3.className = "twm-attr-editor__cell";
    for (const d of DISTRIBUTION_OPTIONS) {
      const o = document.createElement("option");
      o.value = d;
      o.textContent = d || "(none)";
      if ((item.distribution || "") === d) o.selected = true;
      el3.appendChild(o);
    }
    el3.addEventListener("change", () => {
      callbacks.update({ distribution: el3.value || null });
      onFlush();
    });
    return el3;
  };
  const renderTextCell = (item, field, callbacks, placeholder) => {
    const el3 = document.createElement("input");
    el3.type = "text";
    el3.className = "twm-sortable-list__input twm-attr-editor__cell";
    el3.value = item[field] ?? "";
    el3.placeholder = placeholder;
    el3.addEventListener("input", () => {
      callbacks.update({ [field]: el3.value });
    });
    el3.addEventListener("blur", () => onFlush());
    return el3;
  };
  const renderBoolCell = (item, field, callbacks) => {
    const el3 = document.createElement("input");
    el3.type = "checkbox";
    el3.className = "twm-attr-editor__cell";
    el3.checked = !!item[field];
    el3.addEventListener("change", () => {
      callbacks.update({ [field]: el3.checked });
      onFlush();
    });
    return el3;
  };
  const renderFlagCell = (item, field, callbacks, defaultIfMissing) => {
    const el3 = document.createElement("input");
    el3.type = "checkbox";
    el3.className = "twm-attr-editor__cell ea-attr-editor__cell--flag";
    const cur = item[field];
    el3.checked = cur === void 0 || cur === null ? !!defaultIfMissing : !!cur;
    el3.addEventListener("change", () => {
      callbacks.update({ [field]: el3.checked });
      onFlush();
    });
    return el3;
  };
  const renderTypeCell = (item, callbacks) => {
    const el3 = document.createElement("select");
    el3.className = "twm-attr-editor__cell";
    const seen = /* @__PURE__ */ new Set();
    const addOpts = (label, optList) => {
      if (optList.length === 0) return;
      const grp = document.createElement("optgroup");
      grp.label = label;
      for (const t of optList) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if (t === item.type) o.selected = true;
        grp.appendChild(o);
        seen.add(t);
      }
      el3.appendChild(grp);
    };
    addOpts("scalar", types.filter((t) => SCALAR_TYPES.includes(t)));
    addOpts("expression", types.filter((t) => t === "expression"));
    addOpts("typed reference", types.filter((t) => t.startsWith("ref:")));
    addOpts(
      "list of references",
      types.filter((t) => t.startsWith("list[ref:"))
    );
    addOpts("other", types.filter((t) => !seen.has(t)));
    el3.addEventListener("change", () => {
      callbacks.update({ type: el3.value });
      onFlush();
      list?.setItems(currentItems());
    });
    return el3;
  };
  const renderTypedValueCell = (field, item, callbacks) => {
    const t = item.type || "string";
    if (t === "boolean") {
      return renderBoolCell(item, field, callbacks);
    }
    if (t === "integer" || t === "number") {
      const el4 = document.createElement("input");
      el4.type = "number";
      el4.className = "twm-sortable-list__input twm-attr-editor__cell";
      el4.step = t === "integer" ? "1" : "any";
      el4.value = item[field] === null || item[field] === void 0 ? "" : item[field];
      el4.placeholder = field;
      el4.addEventListener("input", () => {
        const v = el4.value === "" ? null : t === "integer" ? parseInt(el4.value, 10) : Number(el4.value);
        callbacks.update({ [field]: v });
      });
      el4.addEventListener("blur", () => onFlush());
      return el4;
    }
    if (t === "expression") {
      const el4 = document.createElement("span");
      el4.className = "twm-attr-editor__cell twm-attr-editor__cell--readonly";
      el4.textContent = item.expression ? `\u2192 ${item.expression}` : "\u2014 (engine-evaluated)";
      return el4;
    }
    if (t.startsWith("ref:")) {
      return renderRefCell(t.slice(4), field, item, callbacks);
    }
    if (t.startsWith("list[ref:") && t.endsWith("]")) {
      return renderListRefCell(t.slice(9, -1), field, item, callbacks);
    }
    if (Array.isArray(item.options) && item.options.length > 0) {
      return renderEnumCell(item.options, field, item, callbacks);
    }
    const el3 = document.createElement("input");
    el3.type = "text";
    el3.className = "twm-sortable-list__input twm-attr-editor__cell";
    el3.value = item[field] ?? "";
    el3.placeholder = field;
    el3.addEventListener("input", () => {
      callbacks.update({ [field]: el3.value });
    });
    el3.addEventListener("blur", () => onFlush());
    return el3;
  };
  const renderRefCell = (target, field, item, callbacks) => {
    const el3 = document.createElement("select");
    el3.className = "twm-attr-editor__cell";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = `\u2014 pick ${target} \u2014`;
    el3.appendChild(placeholder);
    const populate = (opts) => {
      while (el3.childNodes.length > 1) el3.removeChild(el3.lastChild);
      for (const o of opts) {
        const node = document.createElement("option");
        node.value = o.id;
        node.textContent = o.label;
        if (o.id === item[field]) node.selected = true;
        el3.appendChild(node);
      }
    };
    if (refsCache.has(target)) {
      populate(refsCache.get(target));
    } else {
      resolveRefOptions(target).then(populate);
    }
    el3.addEventListener("change", () => {
      callbacks.update({ [field]: el3.value || null });
      onFlush();
    });
    return el3;
  };
  const renderListRefCell = (target, field, item, callbacks) => {
    const el3 = document.createElement("input");
    el3.type = "text";
    el3.className = "twm-sortable-list__input twm-attr-editor__cell";
    const arr = Array.isArray(item[field]) ? item[field] : [];
    el3.value = arr.join(", ");
    el3.placeholder = `${target}, ${target}, \u2026`;
    el3.addEventListener("input", () => {
      const next = el3.value.split(",").map((s) => s.trim()).filter(Boolean);
      callbacks.update({ [field]: next });
    });
    el3.addEventListener("blur", () => onFlush());
    return el3;
  };
  const renderEnumCell = (options2, field, item, callbacks) => {
    const el3 = document.createElement("select");
    el3.className = "twm-attr-editor__cell";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "\u2014";
    if (item[field] === null || item[field] === void 0 || item[field] === "") {
      blank.selected = true;
    }
    el3.appendChild(blank);
    for (const opt of options2) {
      const o = document.createElement("option");
      if (opt !== null && typeof opt === "object") {
        o.value = String(opt.value ?? opt.id ?? "");
        o.textContent = String(opt.label ?? opt.value ?? opt.id ?? "");
      } else {
        o.value = String(opt);
        o.textContent = String(opt);
      }
      if (o.value === String(item[field] ?? "")) o.selected = true;
      el3.appendChild(o);
    }
    el3.addEventListener("change", () => {
      callbacks.update({ [field]: el3.value === "" ? null : el3.value });
      onFlush();
    });
    return el3;
  };
  const itemsCopy = (src) => (src || []).map((it) => ({ ...it }));
  const currentItems = () => list?.getItems?.() || itemsCopy(items);
  const buildList = (current) => {
    try {
      list?.dispose?.();
    } catch {
    }
    listHost.innerHTML = "";
    list = new SortableList({
      containerId,
      items: itemsCopy(current),
      allowReorder,
      allowRemove,
      minItems: 0,
      emptyMessage,
      addButtonText,
      createItem,
      renderItem: renderRow,
      onChange: (next) => onChange(next.map((it) => ({ ...it })))
    });
    listHost.appendChild(list.render());
  };
  buildList(items);
  return {
    addItem() {
      list?.addItem();
    },
    refresh(nextItems) {
      buildList(nextItems !== void 0 ? nextItems : currentItems());
    },
    items() {
      return currentItems();
    },
    dispose() {
      try {
        list?.dispose?.();
      } catch {
      }
      list = null;
      hostEl.innerHTML = "";
      hostEl.classList.remove("twm-attr-editor");
    }
  };
}

// src/ui/components/column_fit.js
var COLUMN_FIT = Object.freeze({
  /** Absolute floor, and the drag-resize minimum. */
  FLOOR: 40,
  /** Sub-pixel safety against an ellipsis on content that exactly fits. */
  PAD: 2,
  /** A column whose full width reaches this is free text. */
  TEXT_AT: 240,
  /** A text column's starting share when room allows it. */
  TEXT_MIN: 200,
  /** How far a text column shrinks before short columns go below `typical`. */
  TEXT_FLOOR: 120,
  /** How far a short column shrinks before the table scrolls. */
  SHORT_FLOOR: 56
});
function fitColumns(columns, avail) {
  const { FLOOR, PAD, TEXT_AT, TEXT_MIN, TEXT_FLOOR, SHORT_FLOOR } = COLUMN_FIT;
  const n = columns.length;
  const cols = columns.map((c) => {
    const header = Math.max(0, Number(c.header) || 0);
    const natural = Math.max(0, Number(c.natural) || 0);
    const full = Math.max(FLOOR, Math.ceil(Math.max(natural, header) + PAD));
    const typical = Math.min(full, Math.max(FLOOR, Math.ceil(Math.max(
      Number.isFinite(c.typical) ? c.typical : natural,
      header
    ) + PAD)));
    const pinned = Number.isFinite(c.pinned) ? Math.max(FLOOR, Math.round(c.pinned)) : null;
    const text2 = pinned == null && (typeof c.text === "boolean" ? c.text : full >= TEXT_AT);
    return { full, typical, pinned, text: text2 };
  });
  const text = [];
  const short = [];
  cols.forEach((c, i) => {
    if (c.pinned == null) (c.text ? text : short).push(i);
  });
  if (!(avail > 1)) return cols.map((c) => c.pinned != null ? c.pinned : c.full);
  const widths = cols.map((c) => {
    if (c.pinned != null) return c.pinned;
    return c.text ? Math.min(c.full, TEXT_MIN) : c.full;
  });
  const total = () => widths.reduce((a, b) => a + b, 0);
  let slack = avail - total();
  if (slack >= 0) {
    slack = raise(widths, text, (i) => cols[i].full, slack);
    if (slack > 0) {
      if (text.length) text.forEach((i) => {
        widths[i] += slack / text.length;
      });
      else widths[short.length ? short[short.length - 1] : n - 1] += slack;
    }
    return widths;
  }
  const steps = [
    [short, (i) => cols[i].typical],
    [text, () => TEXT_FLOOR],
    [short, (i) => Math.min(cols[i].typical, SHORT_FLOOR)],
    [text, () => FLOOR * 2]
  ];
  for (const [idxs, low] of steps) {
    const over = total() - avail;
    if (over <= 1e-6) break;
    lowerTo(widths, idxs, low, over);
  }
  return widths;
}
function raise(widths, idxs, target, slack) {
  if (!(slack > 0)) return slack;
  const wants = idxs.map((i) => Math.max(0, target(i) - widths[i]));
  const need = wants.reduce((a, b) => a + b, 0);
  if (!(need > 0)) return slack;
  const give = Math.min(slack, need);
  idxs.forEach((i, k) => {
    widths[i] += give * wants[k] / need;
  });
  return slack - give;
}
function lowerTo(widths, idxs, low, over) {
  const floorOf = (i) => Math.min(widths[i], Math.max(0, low(i)));
  const cand = idxs.filter((i) => widths[i] > floorOf(i));
  if (!cand.length || over <= 0) return;
  const floors = new Map(cand.map((i) => [i, floorOf(i)]));
  const capacity = cand.reduce((a, i) => a + widths[i] - floors.get(i), 0);
  if (capacity <= over) {
    for (const i of cand) widths[i] = floors.get(i);
    return;
  }
  const cutAt = (level) => cand.reduce((a, i) => a + Math.max(0, widths[i] - Math.max(floors.get(i), level)), 0);
  let lo = 0;
  let hi = Math.max(...cand.map((i) => widths[i]));
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (cutAt(mid) > over) lo = mid;
    else hi = mid;
  }
  for (const i of cand) widths[i] = Math.min(widths[i], Math.max(floors.get(i), hi));
}

// src/ui/components/progress.js
var PROGRESS_STATES = Object.freeze(["running", "done", "error", "cancelled"]);
var PROGRESS_ITEM_STATES = Object.freeze(["pending", "running", "done", "failed"]);
var STEP_STATES = Object.freeze(["pending", "active", "done", "error"]);
var clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
var isNum = (x) => typeof x === "number" && Number.isFinite(x);
function formatElapsed(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1e3));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0) n.textContent = text;
  return n;
}
function setText(node, text) {
  const t = text == null ? "" : String(text);
  if (node.textContent !== t) node.textContent = t;
}
function setWidth(node, fraction) {
  const w = `${(clamp01(fraction) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  if (node.style.width !== w) node.style.width = w;
}
var ProgressBar = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {ProgressBarOptions} [options]
   */
  constructor(host, options = {}) {
    const {
      value = 0,
      max = null,
      indeterminate = false,
      label = "",
      showPercent = true,
      showCount = null,
      showElapsed = false,
      onCancel = null,
      cancelLabel = "Cancel",
      now = Date.now,
      className = ""
    } = options;
    this._value = isNum(value) ? value : 0;
    this._max = isNum(max) && max > 0 ? max : null;
    this._indeterminate = !!indeterminate;
    this._label = label || "";
    this._showPercent = showPercent !== false;
    this._showCount = showCount;
    this._showElapsed = !!showElapsed;
    this._state = "running";
    this._now = typeof now === "function" ? now : Date.now;
    this._started = this._now();
    this._stopped = null;
    this._timer = null;
    this._onCancel = typeof onCancel === "function" ? onCancel : null;
    const root = el("div", `twm-progress${className ? ` ${className}` : ""}`);
    const head = el("div", "twm-progress__head");
    this._labelEl = el("span", "twm-progress__label");
    this._readoutEl = el("span", "twm-progress__readout");
    head.append(this._labelEl, this._readoutEl);
    if (this._showElapsed) {
      this._elapsedEl = el("span", "twm-progress__elapsed");
      head.appendChild(this._elapsedEl);
      this._startTimer();
    } else {
      this._elapsedEl = null;
    }
    if (this._onCancel) {
      const btn = el("button", "twm-progress__cancel", cancelLabel);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (btn.disabled || this._state !== "running") return;
        btn.disabled = true;
        this._onCancel();
      });
      this._cancelBtn = btn;
      head.appendChild(btn);
    } else {
      this._cancelBtn = null;
    }
    this._track = el("div", "twm-progress__track");
    this._track.setAttribute("role", "progressbar");
    this._fill = el("div", "twm-progress__fill");
    this._track.appendChild(this._fill);
    root.append(head, this._track);
    this.element = root;
    this._draw();
    if (host) host.appendChild(root);
  }
  /** The bar's fraction 0..1, or null while indeterminate. */
  get fraction() {
    if (this._indeterminate) return null;
    return clamp01(this._max ? this._value / this._max : this._value);
  }
  /** `running`, `done`, `error` or `cancelled`. */
  get state() {
    return this._state;
  }
  /** Milliseconds since construction, frozen at the final state. */
  get elapsed() {
    return (this._stopped ?? this._now()) - this._started;
  }
  /**
   * Change the bar in place. A number is the new value (a count with `max`,
   * else a fraction); an object may carry `value`, `max`, `label` and
   * `indeterminate`. Ignored once the bar is in a final state.
   */
  update(next) {
    if (this._state !== "running") return this;
    const o = isNum(next) ? { value: next } : next || {};
    if ("max" in o) this._max = isNum(o.max) && o.max > 0 ? o.max : null;
    if (isNum(o.value)) {
      this._value = o.value;
      if (!("indeterminate" in o)) this._indeterminate = false;
    }
    if ("indeterminate" in o) this._indeterminate = !!o.indeterminate;
    if ("label" in o) this._label = o.label || "";
    this._draw();
    return this;
  }
  /**
   * Put the bar in a final state (`done`, `error`, `cancelled`) or back to
   * `running`. `done` fills it. A final state stops the elapsed clock and
   * disables Cancel; `running` restarts the clock (still counting from
   * construction) and enables Cancel again. `label` replaces the label when
   * given.
   */
  setState(state, { label } = {}) {
    if (!PROGRESS_STATES.includes(state)) throw new Error(`ProgressBar: unknown state "${state}"`);
    this._state = state;
    if (label !== void 0) this._label = label || "";
    if (state === "done") {
      this._indeterminate = false;
      this._value = this._max ?? 1;
    }
    if (state === "running") {
      this._stopped = null;
      if (this._showElapsed) this._startTimer();
    } else {
      this._stopped = this._now();
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
    if (this._cancelBtn) this._cancelBtn.disabled = state !== "running";
    this._draw();
    this._drawElapsed();
    return this;
  }
  /** Tick the elapsed readout once a second, unless it already ticks. */
  _startTimer() {
    if (!this._timer) this._timer = setInterval(() => this._drawElapsed(), 1e3);
  }
  /** Stop the elapsed clock and detach. */
  dispose() {
    this._showElapsed = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.element.remove();
  }
  _draw() {
    const root = this.element;
    for (const s of PROGRESS_STATES) {
      root.classList.toggle(`twm-progress--${s}`, this._state === s);
    }
    root.classList.toggle("twm-progress--indeterminate", this._indeterminate);
    setText(this._labelEl, this._label);
    const f = this.fraction;
    const parts = [];
    if (f !== null) {
      if (this._showPercent) parts.push(`${Math.floor(f * 100)}%`);
      const count = this._showCount ?? !!this._max;
      if (count && this._max) parts.push(`${fmtCount(this._value)} / ${fmtCount(this._max)}`);
    }
    setText(this._readoutEl, parts.join(" \xB7 "));
    if (f === null) {
      if (this._fill.style.width) this._fill.style.width = "";
      this._track.removeAttribute("aria-valuenow");
    } else {
      setWidth(this._fill, f);
      this._track.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    }
    this._track.setAttribute("aria-valuemin", "0");
    this._track.setAttribute("aria-valuemax", "100");
    if (this._label) this._track.setAttribute("aria-label", this._label);
    this._drawElapsed();
  }
  _drawElapsed() {
    if (this._elapsedEl) setText(this._elapsedEl, formatElapsed(this.elapsed));
  }
};
function fmtCount(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
var ProgressList = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {ProgressListOptions} [options]
   */
  constructor(host, options = {}) {
    const { items = [], stats = true, pulse = true, emptyText = "", className = "" } = options;
    this._stats = stats;
    this._emptyText = emptyText;
    this._rows = /* @__PURE__ */ new Map();
    this._items = [];
    const root = el("div", `twm-progress-list${pulse ? " twm-progress-list--pulse" : ""}${className ? ` ${className}` : ""}`);
    this._listEl = el("div", "twm-progress-list__rows");
    this._listEl.setAttribute("role", "list");
    this._emptyEl = el("div", "twm-progress-list__empty");
    this._statsEl = el("div", "twm-progress-list__stats");
    root.append(this._listEl, this._emptyEl, this._statsEl);
    this.element = root;
    this.setItems(items);
    if (host) host.appendChild(root);
  }
  /** The items last given, in order. */
  get items() {
    return this._items.slice();
  }
  /**
   * Reconcile the rows with `items` by key: a known key keeps its row and
   * has its text, width and state changed in place; a new key gets a row; a
   * key that is gone loses its row. Rows follow the order given, and a row
   * already in its place is not moved.
   */
  setItems(items) {
    const list = Array.isArray(items) ? items : [];
    const seen = /* @__PURE__ */ new Set();
    this._items = [];
    for (const it of list) {
      if (!it || it.key == null) continue;
      const k = String(it.key);
      if (seen.has(k)) continue;
      seen.add(k);
      this._items.push(it);
    }
    for (const [k, r] of this._rows) {
      if (!seen.has(k)) {
        r.row.remove();
        this._rows.delete(k);
      }
    }
    const scale = this._items.reduce((m, it) => {
      const d = isNum(it.total) && it.total > 0 ? it.total : isNum(it.completed) ? it.completed : 0;
      return d > m ? d : m;
    }, 0);
    let prev = null;
    for (const it of this._items) {
      const k = String(it.key);
      let r = this._rows.get(k);
      if (!r) {
        r = this._makeRow();
        this._rows.set(k, r);
      }
      this._drawRow(r, it, scale);
      const want = prev ? prev.nextSibling : this._listEl.firstChild;
      if (want !== r.row) this._listEl.insertBefore(r.row, want);
      prev = r.row;
    }
    this._emptyEl.hidden = this._items.length > 0 || !this._emptyText;
    setText(this._emptyEl, this._emptyText);
    const line = this._statsLine();
    this._statsEl.hidden = !line;
    setText(this._statsEl, line);
    return this;
  }
  /** The row element for `key`, or null. */
  rowFor(key) {
    return this._rows.get(String(key))?.row ?? null;
  }
  dispose() {
    this.element.remove();
    this._rows.clear();
  }
  _makeRow() {
    const row = el("div", "twm-progress-list__row");
    row.setAttribute("role", "listitem");
    const name = el("span", "twm-progress-list__name");
    const track = el("div", "twm-progress-list__track");
    const fill = el("div", "twm-progress-list__fill");
    track.appendChild(fill);
    const count = el("span", "twm-progress-list__count");
    const state = el("span", "twm-progress-list__state");
    row.append(state, name, track, count);
    return { row, name, fill, count, state };
  }
  _drawRow(r, it, scale) {
    const state = PROGRESS_ITEM_STATES.includes(it.state) ? it.state : "pending";
    for (const s of PROGRESS_ITEM_STATES) {
      r.row.classList.toggle(`twm-progress-list__row--${s}`, s === state);
    }
    const done = isNum(it.completed) ? it.completed : 0;
    const hasTotal = isNum(it.total) && it.total > 0;
    const denom = hasTotal ? it.total : scale;
    setWidth(r.fill, denom > 0 ? done / denom : 0);
    setText(r.name, it.name ?? String(it.key));
    const count = hasTotal ? `${fmtCount(done)} / ${fmtCount(it.total)}` : fmtCount(done);
    setText(r.count, it.detail ? `${count} \xB7 ${it.detail}` : count);
    if (r.state.title !== state) r.state.title = state;
  }
  _statsLine() {
    if (this._stats === false) return "";
    if (typeof this._stats === "function") return String(this._stats(this.items) ?? "");
    if (!this._items.length) return "";
    const n = { done: 0, running: 0, failed: 0, pending: 0 };
    let completed = 0;
    for (const it of this._items) {
      n[PROGRESS_ITEM_STATES.includes(it.state) ? it.state : "pending"] += 1;
      if (isNum(it.completed)) completed += it.completed;
    }
    const parts = [`${n.done} / ${this._items.length} done`];
    if (n.running) parts.push(`${n.running} running`);
    if (n.failed) parts.push(`${n.failed} failed`);
    if (n.pending) parts.push(`${n.pending} pending`);
    parts.push(`${fmtCount(completed)} completed`);
    return parts.join(" \xB7 ");
  }
};
var StepProgress = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {{ steps?: Array<StepDef|string>, className?: string }} [options]
   */
  constructor(host, options = {}) {
    const { steps = [], className = "" } = options;
    const root = el("ol", `twm-steps${className ? ` ${className}` : ""}`);
    this.element = root;
    this._steps = steps.map((s, i) => {
      const def = typeof s === "string" ? { label: s } : s || {};
      const li = el("li", "twm-steps__step");
      const marker = el("span", "twm-steps__marker");
      const label = el("span", "twm-steps__label", def.label ?? "");
      const pass = el("span", "twm-steps__pass");
      pass.hidden = true;
      li.append(marker, label, pass);
      root.appendChild(li);
      return { key: def.key != null ? String(def.key) : String(i), label: def.label ?? "", state: "pending", pass: null, li, passEl: pass };
    });
    this._draw();
    if (host) host.appendChild(root);
  }
  /** `[{ key, label, state, pass }]`, in order. */
  get steps() {
    return this._steps.map(({ key, label, state, pass }) => ({ key, label, state, pass }));
  }
  /** The index of the active phase, or -1. */
  get activeIndex() {
    return this._steps.findIndex((s) => s.state === "active");
  }
  /**
   * Make one phase active: every phase before it is done, every phase after
   * it pending. `pass` and `passes` read "pass n of m" on it.
   * @param {string|number} which - A key, or an index.
   * @param {{ pass?: number, passes?: number }} [opts]
   */
  setStep(which, { pass, passes } = {}) {
    const i = this._index(which);
    this._steps.forEach((s, j) => {
      s.state = j < i ? "done" : j === i ? "active" : "pending";
      s.pass = j === i && isNum(pass) ? { n: pass, of: isNum(passes) ? passes : null } : null;
    });
    this._draw();
    return this;
  }
  /** Mark a phase (the active one by default) as failed; phases after it stay pending. */
  fail(which) {
    const i = which === void 0 ? this.activeIndex : this._index(which);
    if (i < 0) return this;
    this._steps.forEach((s, j) => {
      if (j < i) s.state = "done";
      else if (j === i) s.state = "error";
      else s.state = "pending";
      if (j !== i) s.pass = null;
    });
    this._draw();
    return this;
  }
  /** Every phase done. */
  complete() {
    for (const s of this._steps) {
      s.state = "done";
      s.pass = null;
    }
    this._draw();
    return this;
  }
  dispose() {
    this.element.remove();
  }
  _index(which) {
    const i = typeof which === "number" ? which : this._steps.findIndex((s) => s.key === String(which));
    if (!Number.isInteger(i) || i < 0 || i >= this._steps.length) {
      throw new Error(`StepProgress: no step "${which}"`);
    }
    return i;
  }
  _draw() {
    for (const s of this._steps) {
      for (const st of STEP_STATES) s.li.classList.toggle(`twm-steps__step--${st}`, s.state === st);
      if (s.state === "active") s.li.setAttribute("aria-current", "step");
      else s.li.removeAttribute("aria-current");
      const text = s.pass ? s.pass.of ? `pass ${s.pass.n} of ${s.pass.of}` : `pass ${s.pass.n}` : "";
      s.passEl.hidden = !text;
      setText(s.passEl, text);
    }
  }
};

// src/ui/components/job_progress.js
function mountJobProgress(parent, { progress = null, steps = null, spinner = null } = {}) {
  const stepper = Array.isArray(steps) && steps.length ? new StepProgress(parent, { steps, className: "twm-job-progress__steps" }) : null;
  let bar = null;
  if (progress) {
    const { onCancel: _ignored, ...rest } = typeof progress === "object" ? progress : {};
    bar = new ProgressBar(parent, { ...rest, className: "twm-job-progress__bar" });
    if (spinner) spinner.hidden = true;
  }
  return {
    get bar() {
      return bar;
    },
    get steps() {
      return stepper;
    },
    /** `bar.update(next)`. */
    setProgress(next) {
      if (!bar) throw new Error("setProgress: this dialog was opened without `progress`");
      bar.update(next);
    },
    /** `steps.setStep(which, opts)`. */
    setStep(which, opts) {
      if (!stepper) throw new Error("setStep: this dialog was opened without `steps`");
      stepper.setStep(which, opts);
    },
    /** Put the bar and the phases in their final state. */
    finish(status) {
      if (status === "done") {
        bar?.setState("done");
        stepper?.complete();
      } else if (status === "error") {
        bar?.setState("error");
        stepper?.fail();
      } else bar?.setState("cancelled");
    }
  };
}

// src/ui/components/computing_status_window.js
var _activeWindow = null;
function showComputingWindow({
  title = "Computing...",
  message = "",
  icon: icon2 = "hourglass_top",
  onCancel,
  progress = null,
  steps = null
} = {}) {
  if (_activeWindow) {
    _activeWindow.close();
    _activeWindow = null;
  }
  let finished = false;
  let settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });
  const content = document.createElement("div");
  content.className = "twm-computing-status";
  const spinnerEl = document.createElement("div");
  spinnerEl.className = "twm-computing-status__spinner";
  const msgEl = document.createElement("div");
  msgEl.className = "twm-computing-status__message";
  msgEl.innerHTML = message;
  content.appendChild(spinnerEl);
  const job = mountJobProgress(content, { progress, steps, spinner: spinnerEl });
  content.appendChild(msgEl);
  let cancelBtn = null;
  if (typeof onCancel === "function") {
    cancelBtn = document.createElement("button");
    cancelBtn.className = "twm-computing-status__cancel-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      cancelBtn.disabled = true;
      msgEl.textContent = "Cancelling...";
      onCancel();
    }, { once: true });
    content.appendChild(cancelBtn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "twm-computing-status__cancel-btn twm-computing-status__close-btn";
  closeBtn.textContent = "Close";
  closeBtn.hidden = true;
  content.appendChild(closeBtn);
  const finish = (status, text) => {
    finished = true;
    spinnerEl.hidden = true;
    if (cancelBtn) cancelBtn.hidden = true;
    msgEl.textContent = text;
    msgEl.classList.toggle("is-ok", status === "done");
    msgEl.classList.toggle("is-err", status === "error");
    msgEl.classList.toggle("is-cancelled", status === "cancelled");
    job.finish(status);
    settle({ status, message: text });
  };
  const win = new ManagedWindow({
    id: "computing-status-window",
    title,
    icon: icon2,
    content,
    minWidth: 320,
    minHeight: 140,
    defaultWidth: 380,
    defaultHeight: (onCancel ? 190 : 160) + (job.bar ? 30 : 0) + (job.steps ? 40 : 0),
    canMinimize: true,
    canMaximize: false,
    canResize: false,
    canDrag: true,
    modal: false,
    onClose: () => {
      if (_activeWindow === win) _activeWindow = null;
      if (finished) return;
      finish("cancelled", "Cancelled.");
    }
  });
  closeBtn.addEventListener("click", () => win.close());
  _activeWindow = win;
  win.show();
  return {
    result,
    update(msg) {
      if (finished) return;
      msgEl.textContent = msg;
    },
    setProgress(next) {
      if (finished) return;
      job.setProgress(next);
    },
    setStep(which, opts) {
      if (finished) return;
      job.setStep(which, opts);
    },
    complete(res) {
      if (finished) return;
      finish(res?.ok ? "done" : "error", res?.message || "");
      closeBtn.hidden = false;
    },
    cancelled(msg) {
      if (finished) return;
      finish("cancelled", msg || "Cancelled.");
      closeBtn.hidden = false;
    },
    close() {
      if (_activeWindow) {
        _activeWindow.close();
        _activeWindow = null;
      }
    }
  };
}

// src/ui/components/confirm_dialog.js
var dialogIdCounter = 0;
async function showConfirmDialog(options = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    icon: icon2 = "warning",
    okLabel = "OK",
    cancelLabel = "Cancel",
    okVariant = "primary"
  } = options;
  return openConfirm({
    title,
    message,
    icon: icon2,
    confirmLabel: okLabel,
    cancelLabel,
    danger: okVariant === "danger"
  });
}
async function showDeleteConfirmDialog(options = {}) {
  const {
    itemName = "",
    itemType = "item",
    additionalMessage = ""
  } = options;
  let message = `Delete ${itemType}`;
  if (itemName) message += ` "${itemName}"`;
  message += "?";
  if (additionalMessage) message += `

${additionalMessage}`;
  return openConfirm({
    title: `Delete ${capitalize(itemType)}`,
    message,
    icon: "delete",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true
  });
}
async function showCloseConfirmDialog(options = {}) {
  const {
    itemName = "",
    itemType = "tab"
  } = options;
  let message = `Close ${itemType}`;
  if (itemName) message += ` "${itemName}"`;
  message += "?";
  return openConfirm({
    title: `Close ${capitalize(itemType)}`,
    message,
    icon: "close",
    confirmLabel: "Close",
    cancelLabel: "Cancel"
  });
}
async function showChoiceDialog(options = {}) {
  const {
    title = "Choose",
    message = "",
    icon: icon2 = "warning",
    actions = []
  } = options;
  const content = document.createElement("div");
  content.className = "twm-confirm-dialog__body";
  content.innerHTML = `
        <span class="twm-confirm-dialog__icon material-symbols-outlined">${escapeHtml(icon2)}</span>
        <div class="twm-confirm-dialog__message">${escapeHtml(message)}</div>
    `;
  return openModal({
    title,
    icon: icon2,
    content,
    width: 480,
    height: 220,
    actions: actions.map((a) => ({
      label: a.label,
      value: a.value,
      primary: a.variant === "primary",
      danger: a.variant === "danger"
    }))
  });
}
async function showSelectDialog(options = {}) {
  const {
    title = "Select",
    message = "",
    items = [],
    okLabel = "OK",
    cancelLabel = "Cancel"
  } = options;
  const fields = [];
  if (message) {
    fields.push({ section: message });
  }
  fields.push({
    name: "_choice",
    label: "Choice",
    type: "select",
    default: items[0]?.value || "",
    options: items.map((i) => ({ value: i.value, label: i.label }))
  });
  void cancelLabel;
  const data = await openForm({
    title,
    submitLabel: okLabel,
    fields
  });
  if (!data) return null;
  return data._choice;
}
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function showRunProgressDialog(options = {}) {
  const {
    title = "Running Pipeline",
    message = "Starting\u2026",
    onCancel,
    progress = null,
    steps = null
  } = options;
  const dialogId = `run-progress-${++dialogIdCounter}`;
  let finished = false;
  let settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });
  const contentEl = document.createElement("div");
  contentEl.className = "twm-confirm-dialog__content run-progress";
  const bodyEl = document.createElement("div");
  bodyEl.className = "twm-run-progress__body";
  const spinnerEl = document.createElement("div");
  spinnerEl.className = "twm-run-progress__spinner";
  const messageEl = document.createElement("div");
  messageEl.className = "twm-run-progress__message";
  messageEl.textContent = message;
  bodyEl.append(spinnerEl, messageEl);
  contentEl.appendChild(bodyEl);
  const job = mountJobProgress(contentEl, { progress, steps, spinner: spinnerEl });
  let stopBtn = null;
  if (typeof onCancel === "function") {
    const stopActionsEl = document.createElement("div");
    stopActionsEl.className = "twm-confirm-dialog__actions twm-run-progress__stop-actions";
    stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "twm-confirm-dialog__btn twm-run-progress__stop-btn";
    stopBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop';
    stopBtn.addEventListener("click", () => {
      stopBtn.disabled = true;
      stopBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> Stopping\u2026';
      onCancel();
    });
    stopActionsEl.appendChild(stopBtn);
    contentEl.appendChild(stopActionsEl);
  }
  const actionsEl = document.createElement("div");
  actionsEl.className = "twm-confirm-dialog__actions";
  actionsEl.style.display = "none";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "twm-confirm-dialog__btn twm-confirm-dialog__btn--primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => dialogWindow.close());
  actionsEl.appendChild(closeBtn);
  contentEl.appendChild(actionsEl);
  const finish = (status, text, cls) => {
    finished = true;
    spinnerEl.style.display = "none";
    if (stopBtn) stopBtn.parentElement.style.display = "none";
    messageEl.textContent = text;
    messageEl.className = `twm-run-progress__message ${cls}`;
    job.finish(status);
    actionsEl.style.display = "";
    settle({ status, message: text });
  };
  const dialogWindow = new ManagedWindow({
    id: dialogId,
    title,
    icon: "play_arrow",
    content: contentEl,
    minWidth: 320,
    minHeight: 120,
    defaultWidth: 420,
    defaultHeight: 200 + (job.bar ? 40 : 0) + (job.steps ? 40 : 0),
    canMinimize: false,
    canMaximize: false,
    canResize: false,
    canDrag: false,
    modal: true,
    onClose: () => {
      if (finished) return;
      finish("cancelled", "Cancelled.", "is-cancelled");
    }
  });
  dialogWindow.show();
  return {
    result,
    update(msg) {
      if (finished) return;
      messageEl.textContent = msg;
    },
    setProgress(next) {
      if (finished) return;
      job.setProgress(next);
    },
    setStep(which, opts) {
      if (finished) return;
      job.setStep(which, opts);
    },
    complete(res) {
      if (finished) return;
      finish(res?.ok ? "done" : "error", res?.message || "", res?.ok ? "is-ok" : "is-err");
    },
    cancelled(msg) {
      if (finished) return;
      finish("cancelled", msg || "Cancelled.", "is-cancelled");
    },
    close() {
      try {
        dialogWindow.close();
      } catch {
      }
    }
  };
}

// src/ui/components/conversation_view.js
var CONVERSATION_PIN_WITHIN_PX = 32;
var AT_END_PX = 1;
var CONVERSATION_COMPOSER_MAX_PX = 200;
function mountConversationView(host, {
  render = null,
  onSubmit = null,
  onCancel = null,
  onRenderError = null,
  pinThreshold = CONVERSATION_PIN_WITHIN_PX,
  composerMaxHeight = CONVERSATION_COMPOSER_MAX_PX,
  placeholder = "",
  labels = {}
} = {}) {
  const text = {
    send: "Send",
    cancel: "Cancel",
    jump: "Jump to latest",
    input: "Message",
    ...labels
  };
  const doc = host.ownerDocument;
  const el3 = (tag, cls, content) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (content !== void 0) n.textContent = content;
    return n;
  };
  const icon2 = (name) => {
    const i = el3("span", "material-symbols-outlined", name);
    i.setAttribute("aria-hidden", "true");
    return i;
  };
  const entries = /* @__PURE__ */ new Map();
  let nextId = 1;
  let streamId = null;
  let pinned = true;
  let lastScrollTop = 0;
  let busy = false;
  let cancelled = false;
  let destroyed = false;
  const root = el3("div", "twm-chat");
  const viewport = el3("div", "twm-chat__viewport");
  const log = el3("div", "twm-chat__log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const jump = el3("button", "twm-chat__jump");
  jump.type = "button";
  jump.append(icon2("arrow_downward"), doc.createTextNode(` ${text.jump}`));
  jump.hidden = true;
  viewport.append(log, jump);
  const composer = el3("div", "twm-chat__composer");
  const input = el3("textarea", "twm-chat__input");
  input.rows = 1;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", text.input);
  const send = el3("button", "twm-chat__send");
  send.type = "button";
  composer.append(input, send);
  root.append(viewport, composer);
  host.append(root);
  const distanceFromEnd = () => log.scrollHeight - log.scrollTop - log.clientHeight;
  const toBottom = () => {
    log.scrollTop = log.scrollHeight;
    lastScrollTop = log.scrollTop;
  };
  const setPinned = (value) => {
    pinned = value;
    jump.hidden = pinned;
  };
  function noticeMove() {
    const top = log.scrollTop;
    const distance = distanceFromEnd();
    const movedUp = top < lastScrollTop && distance > AT_END_PX;
    lastScrollTop = top;
    if (movedUp && pinned) setPinned(false);
    return !movedUp && distance <= pinThreshold;
  }
  const settle = () => {
    noticeMove();
    if (pinned) toBottom();
  };
  function onScroll() {
    if (noticeMove() && !pinned) setPinned(true);
  }
  function innerTakesWheelUp(target) {
    const view = doc.defaultView;
    for (let n = target; n && n !== log; n = n.parentElement) {
      if (n.nodeType !== 1 || n.scrollHeight <= n.clientHeight) continue;
      const style = view?.getComputedStyle(n);
      const overflow = style?.overflowY;
      if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") continue;
      if (n.scrollTop > 0) return true;
      const chain = style.getPropertyValue("overscroll-behavior-y");
      if (chain === "contain" || chain === "none") return true;
    }
    return false;
  }
  function onWheel(e) {
    if (e.deltaY < 0 && pinned && !e.ctrlKey && !e.defaultPrevented && log.scrollTop > 0 && !innerTakesWheelUp(e.target)) setPinned(false);
  }
  function onJump() {
    setPinned(true);
    toBottom();
  }
  log.addEventListener("scroll", onScroll);
  log.addEventListener("wheel", onWheel, { passive: true });
  jump.addEventListener("click", onJump);
  const newId = (taken = (id) => entries.has(id)) => {
    let id;
    do
      id = `m${nextId++}`;
    while (taken(id));
    return id;
  };
  const duplicate = (id) => new Error(`conversation view: duplicate message id "${id}"`);
  const roleClass = (role) => String(role ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "none";
  const snapshot = (message) => ({ ...message });
  function drawBody(entry, streaming = entry.message.id === streamId) {
    const { message, body } = entry;
    body.replaceChildren();
    body.classList.remove("twm-chat__body--plain");
    if (render) {
      try {
        render(snapshot(message), body, { streaming });
        return;
      } catch (error) {
        body.replaceChildren();
        if (onRenderError) {
          try {
            onRenderError(error, snapshot(message));
          } catch {
          }
        }
      }
    }
    body.classList.add("twm-chat__body--plain");
    body.textContent = message.text;
  }
  function build(spec, { into = entries, taken, streaming = false } = {}) {
    const message = {
      ...spec,
      id: spec?.id ?? newId(taken ?? ((id) => into.has(id))),
      role: spec?.role ?? "assistant",
      text: String(spec?.text ?? "")
    };
    if (into.has(message.id)) throw duplicate(message.id);
    const row = el3("div", `twm-chat__msg twm-chat__msg--${roleClass(message.role)}`);
    if (streaming) row.classList.add("twm-chat__msg--streaming");
    const body = el3("div", "twm-chat__body");
    const extra = el3("div", "twm-chat__extra");
    row.append(body, extra);
    const entry = { message, row, body, extra };
    into.set(message.id, entry);
    drawBody(entry, streaming);
    return entry;
  }
  function append(message) {
    const entry = build(message);
    log.append(entry.row);
    settle();
    return entry.message.id;
  }
  function replaceAll(messages) {
    const list = [...messages ?? []];
    const given = /* @__PURE__ */ new Set();
    for (const m of list) {
      if (m?.id == null) continue;
      if (given.has(m.id)) throw duplicate(m.id);
      given.add(m.id);
    }
    const next = /* @__PURE__ */ new Map();
    const taken = (id) => given.has(id) || next.has(id);
    const frag = doc.createDocumentFragment();
    for (const m of list) frag.append(build(m, { into: next, taken }).row);
    streamId = null;
    entries.clear();
    for (const [id, entry] of next) entries.set(id, entry);
    log.replaceChildren(frag);
    setPinned(true);
    toBottom();
  }
  function clear() {
    replaceAll([]);
  }
  function beginStream(message) {
    if (message?.id != null && entries.has(message.id)) throw duplicate(message.id);
    if (streamId !== null) endStream();
    const entry = build({ role: "assistant", text: "", ...message ?? {} }, { streaming: true });
    streamId = entry.message.id;
    log.append(entry.row);
    settle();
    return streamId;
  }
  function appendChunk(chunk) {
    const entry = streamId !== null ? entries.get(streamId) : null;
    if (!entry) return;
    entry.message.text += String(chunk ?? "");
    drawBody(entry);
    settle();
  }
  function endStream() {
    const entry = streamId !== null ? entries.get(streamId) : null;
    streamId = null;
    if (!entry) return null;
    entry.row.classList.remove("twm-chat__msg--streaming");
    drawBody(entry);
    settle();
    return entry.message.id;
  }
  function grow() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, composerMaxHeight)}px`;
    input.style.overflowY = input.scrollHeight > composerMaxHeight ? "auto" : "hidden";
  }
  function drawSend() {
    send.replaceChildren(icon2(busy ? "stop" : "send"));
    send.setAttribute("aria-label", busy ? text.cancel : text.send);
    send.title = busy ? text.cancel : text.send;
    send.classList.toggle("twm-chat__send--cancel", busy);
    root.classList.toggle("twm-chat--busy", busy);
  }
  function submit() {
    if (busy) return;
    const value = input.value;
    if (!value.trim()) return;
    input.value = "";
    grow();
    onSubmit?.(value);
  }
  function cancel() {
    if (!busy || cancelled) return;
    cancelled = true;
    onCancel?.();
  }
  function onInputKey(e) {
    if (e.isComposing || e.key !== "Enter") return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    submit();
  }
  function onRootKey(e) {
    if (e.isComposing || e.key !== "Escape" || !busy || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }
  input.addEventListener("keydown", onInputKey);
  input.addEventListener("input", grow);
  root.addEventListener("keydown", onRootKey);
  send.addEventListener("click", () => busy ? cancel() : submit());
  drawSend();
  return {
    root,
    append,
    replaceAll,
    clear,
    beginStream,
    appendChunk,
    endStream,
    /** A copy of every message, in order. */
    messages: () => [...entries.values()].map((e) => snapshot(e.message)),
    /** The extra slot below a message's body, or null for an unknown id. */
    slot: (id) => entries.get(id)?.extra ?? null,
    /** The id of the message being streamed, or null. */
    streamingId: () => streamId,
    isPinned: () => pinned,
    getScrollTop: () => log.scrollTop,
    /** Scrolls the transcript; pinned again only when that lands at the end. */
    setScrollTop(px) {
      log.scrollTop = px;
      lastScrollTop = log.scrollTop;
      setPinned(distanceFromEnd() <= pinThreshold);
    },
    scrollToBottom: onJump,
    /** `true` turns Send into Cancel; every busy period may cancel once. */
    setBusy(value) {
      if (busy === !!value) return;
      busy = !!value;
      cancelled = false;
      drawSend();
    },
    isBusy: () => busy,
    getText: () => input.value,
    setText(value) {
      input.value = String(value ?? "");
      grow();
    },
    focus: () => input.focus(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      streamId = null;
      busy = false;
      cancelled = false;
      entries.clear();
      root.remove();
    }
  };
}

// src/ui/components/detail_header.js
function createDetailHeader(config) {
  const header = document.createElement("header");
  header.className = "twm-detail-header";
  _populate(header, config);
  return header;
}
function updateDetailHeader(headerEl, config) {
  headerEl._renamer?.destroy();
  headerEl._renamer = null;
  headerEl.innerHTML = "";
  _populate(headerEl, config);
}
function _populate(header, config) {
  const { title, subtitle, icon: icon2, badges = [], actions = [], extraElements = [], renameable = false, onRename } = config;
  const titleRow = document.createElement("div");
  titleRow.className = "twm-detail-header__title-row";
  if (icon2) {
    const iconEl = document.createElement("span");
    iconEl.className = "twm-detail-header__icon material-symbols-outlined";
    iconEl.textContent = icon2;
    titleRow.appendChild(iconEl);
  }
  const nameEl = document.createElement("h2");
  nameEl.className = "twm-detail-header__name";
  nameEl.textContent = title || "";
  if (renameable) {
    nameEl.dataset.renameable = "";
    nameEl.title = "Double-click to rename";
  }
  titleRow.appendChild(nameEl);
  for (const badge of badges) {
    const badgeEl = document.createElement("span");
    badgeEl.className = `twm-detail-header__badge${badge.className ? ` ${badge.className}` : ""}`;
    if (badge.icon) {
      const bi = document.createElement("span");
      bi.className = "twm-detail-header__badge-icon material-symbols-outlined";
      bi.textContent = badge.icon;
      badgeEl.appendChild(bi);
    }
    badgeEl.appendChild(document.createTextNode(badge.text));
    titleRow.appendChild(badgeEl);
  }
  header.appendChild(titleRow);
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "twm-detail-header__subtitle";
    sub.innerHTML = subtitle;
    header.appendChild(sub);
  }
  if (actions.length > 0 || extraElements.length > 0) {
    const actionsEl = document.createElement("div");
    actionsEl.className = "twm-detail-header__actions";
    for (const extra of extraElements) {
      actionsEl.appendChild(extra);
    }
    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      const variant = action.variant || "secondary";
      const look = variant === "secondary" ? "" : ` twm-btn--${variant}`;
      btn.className = `twm-btn${look} twm-detail-header__btn twm-detail-header__btn--${variant}`;
      btn.dataset.action = action.key;
      if (action.disabled) btn.disabled = true;
      if (action.title) btn.title = action.title;
      if (action.icon) {
        const iconSpan = document.createElement("span");
        iconSpan.className = "material-symbols-outlined twm-btn__glyph";
        iconSpan.textContent = action.icon;
        btn.appendChild(iconSpan);
      }
      const labelSpan = document.createElement("span");
      labelSpan.className = "twm-btn__label";
      labelSpan.textContent = action.label ?? "";
      btn.appendChild(labelSpan);
      btn.addEventListener("click", () => action.handler?.());
      actionsEl.appendChild(btn);
    }
    header.appendChild(actionsEl);
  }
  if (renameable && onRename) {
    const renamer = attachInlineRenamer({
      label: nameEl,
      onCommit: async (newName) => {
        if (!newName?.trim()) return { success: false };
        return await onRename(newName.trim());
      }
    });
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      renamer.start(e);
    });
    header._renamer = renamer;
  }
}

// src/ui/components/fact_table.js
var SEQ = 0;
var isNode = (v) => typeof Node !== "undefined" && v instanceof Node;
var FactTable = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {FactTableConfig} [config]
   */
  constructor(host, config = {}) {
    this.config = {
      rows: [],
      headers: null,
      compare: false,
      labelColumn: true,
      wrapLabels: false,
      wrap: "anywhere",
      mono: false,
      numeric: [],
      nullDisplay: "",
      missing: "\u2014",
      rowClass: null,
      rowAttrs: null,
      emptyState: null,
      label: null,
      className: null,
      ...config
    };
    this._rows = Array.isArray(this.config.rows) ? this.config.rows.slice() : [];
    this._id = ++SEQ;
    const table = document.createElement("table");
    table.className = "twm-facts" + (this.config.compare ? " twm-facts--compare" : "") + (this.config.labelColumn ? "" : " twm-facts--no-label") + (this.config.wrapLabels ? " twm-facts--wrap-labels" : "") + (this.config.wrap === "words" ? " twm-facts--wrap-words" : this.config.wrap === "none" ? " twm-facts--wrap-none" : "") + (this.config.mono ? " twm-facts--mono" : "") + (this.config.className ? ` ${this.config.className}` : "");
    if (this.config.label) table.setAttribute("aria-label", this.config.label);
    this.element = table;
    this._draw();
    if (host) host.appendChild(table);
  }
  /** Replace the rows and draw them. */
  setRows(rows) {
    this._rows = Array.isArray(rows) ? rows.slice() : [];
    this._draw();
  }
  getRows() {
    return this._rows.slice();
  }
  /** The `<tr>` drawn for row `idx`, or null. */
  getRow(idx) {
    return this.element.tBodies[0]?.rows[idx]?.__factIndex === idx ? this.element.tBodies[0].rows[idx] : null;
  }
  dispose() {
    this.element.remove();
  }
  // ── drawing ──────────────────────────────────────────────────────────
  /** How many columns the sheet has. */
  _width() {
    const { compare, headers } = this.config;
    if (compare) return 4;
    let n = 2;
    if (Array.isArray(headers)) n = Math.max(n, headers.length);
    for (const r of this._rows) if (Array.isArray(r)) n = Math.max(n, r.length);
    return n;
  }
  _draw() {
    const table = this.element;
    table.replaceChildren();
    const width = this._width();
    const { headers, compare } = this.config;
    if (Array.isArray(headers) && headers.length) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      const names = compare && headers.length === 3 ? [headers[0], headers[1], "", headers[2]] : headers;
      for (let i = 0; i < width; i++) {
        const th = document.createElement("th");
        th.scope = "col";
        appendContent(th, names[i] ?? "");
        if (this._numeric(i)) th.classList.add("twm-facts__num");
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = document.createElement("tbody");
    this._rows.forEach((row, idx) => tbody.appendChild(this._row(row, idx, width)));
    if (!this._rows.length) {
      let content = this.config.emptyState;
      if (typeof content === "function") content = content();
      if (content != null && content !== false && content !== "") {
        const tr = document.createElement("tr");
        tr.className = "twm-facts__empty-row";
        const td = document.createElement("td");
        td.className = "twm-facts__empty";
        td.colSpan = width;
        appendContent(td, content);
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
    table.classList.toggle("twm-facts--empty", this._rows.length === 0);
    table.appendChild(tbody);
  }
  _numeric(col) {
    const n = this.config.numeric;
    return Array.isArray(n) && n.includes(col);
  }
  _row(row, idx, width) {
    const tr = document.createElement("tr");
    tr.className = "twm-facts__row";
    tr.__factIndex = idx;
    tr.__fact = row;
    if (Array.isArray(row)) {
      for (let i = 0; i < width; i++) {
        const td = this._cell(i === 0 && this.config.labelColumn ? "label" : "value", row[i]);
        if (this._numeric(i)) td.classList.add("twm-facts__num");
        if (i === row.length - 1 && row.length < width) {
          td.colSpan = width - i;
          tr.appendChild(td);
          break;
        }
        tr.appendChild(td);
      }
    } else {
      const r = row && typeof row === "object" ? row : { label: row };
      if (r.key !== void 0 && r.key !== null) tr.dataset.key = String(r.key);
      const label = this._cell(this.config.labelColumn ? "label" : "value", r.label);
      if (r.labelTitle) label.title = String(r.labelTitle);
      tr.appendChild(label);
      const tune = (td) => {
        if (r.mono) td.classList.add("twm-facts__mono");
        if (r.numeric) td.classList.add("twm-facts__num");
        return td;
      };
      const hasBefore = Object.prototype.hasOwnProperty.call(r, "before");
      const hasAfter = Object.prototype.hasOwnProperty.call(r, "after");
      if (this.config.compare && (hasBefore || hasAfter)) {
        const status = r.status || statusOf(r, hasBefore, hasAfter);
        tr.classList.add(`twm-facts__row--${String(status).replace(/[^\w-]/g, "")}`);
        tr.dataset.status = String(status);
        const before = tune(hasBefore ? this._cell("value", r.before) : this._missing());
        before.classList.add("twm-facts__before");
        const arrow = document.createElement("td");
        arrow.className = "twm-facts__arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2192";
        const after = tune(hasAfter ? this._cell("value", r.after) : this._missing());
        after.classList.add("twm-facts__after");
        tr.append(before, arrow, after);
      } else {
        const value = tune(this._cell("value", r.value));
        if (width > 2) value.colSpan = width - 1;
        tr.appendChild(value);
      }
    }
    this._decorate(tr, row, idx);
    return tr;
  }
  _cell(kind, content) {
    const isLabel = kind === "label";
    const td = document.createElement(isLabel ? "th" : "td");
    td.className = isLabel ? "twm-facts__label" : "twm-facts__value";
    if (isLabel) td.scope = "row";
    if (content === null || content === void 0) {
      const said = isLabel ? "" : this.config.nullDisplay;
      if (said) {
        td.textContent = String(said);
        td.classList.add("twm-facts__null");
      }
    } else {
      appendContent(td, content);
    }
    return td;
  }
  _missing() {
    const td = document.createElement("td");
    td.className = "twm-facts__value twm-facts__missing";
    td.textContent = String(this.config.missing ?? "");
    return td;
  }
  _decorate(tr, row, idx) {
    const { rowClass, rowAttrs } = this.config;
    if (typeof rowClass === "function") {
      const c = rowClass(row, idx);
      const list = Array.isArray(c) ? c : String(c ?? "").split(/\s+/);
      for (const name of list) if (name) tr.classList.add(String(name));
    }
    if (typeof rowAttrs === "function") {
      for (const [name, value] of Object.entries(rowAttrs(row, idx) || {})) {
        if (value == null || value === false) continue;
        try {
          tr.setAttribute(name, value === true ? "" : String(value));
        } catch (err) {
          console.error(`[FactTable] rowAttrs: bad attribute "${name}"`, err);
        }
      }
    }
  }
};
function createFactTable(host, config = {}) {
  return new FactTable(host, config);
}
function statusOf(r, hasBefore, hasAfter) {
  if (!hasBefore) return "added";
  if (!hasAfter) return "removed";
  if (isNode(r.before) || isNode(r.after)) return "changed";
  if (Object.is(r.before, r.after)) return "same";
  if (r.before && r.after && typeof r.before === "object" && typeof r.after === "object") {
    try {
      return JSON.stringify(r.before) === JSON.stringify(r.after) ? "same" : "changed";
    } catch {
      return "changed";
    }
  }
  return "changed";
}
function appendContent(el3, content) {
  if (content === null || content === void 0) return;
  if (isNode(content)) {
    el3.appendChild(content);
    return;
  }
  let text;
  if (typeof content === "object") {
    try {
      text = JSON.stringify(content, null, 2);
    } catch {
      text = String(content);
    }
  } else {
    text = String(content);
  }
  el3.appendChild(document.createTextNode(text));
}

// src/ui/components/gallery_picker.js
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
async function mountGalleryPicker(hostEl, opts = {}) {
  const {
    kind = null,
    selectedId = null,
    onChange = () => {
    },
    entries = null,
    host = null,
    emptyLabel = "No starters available for this kind."
  } = opts;
  if (!hostEl) throw new Error("mountGalleryPicker: hostEl is required");
  let catalog = entries;
  if (!catalog) {
    const list = host?.gallery?.list;
    if (typeof list !== "function") {
      console.warn("[gallery-picker] no entries and no host gallery capability; showing the empty label");
      catalog = [];
    } else {
      try {
        catalog = await list(kind) || [];
      } catch (err) {
        console.warn("[gallery-picker] host.gallery.list failed", err);
        catalog = [];
      }
    }
  }
  catalog = Array.isArray(catalog) ? catalog : [];
  hostEl.classList.add("twm-gallery-picker");
  if (catalog.length === 0) {
    hostEl.innerHTML = `<div class="twm-gallery-picker__empty">${esc(emptyLabel)}</div>`;
    return {
      getSelected: () => null,
      setSelectedById: () => false,
      dispose: () => {
        hostEl.classList.remove("twm-gallery-picker");
      }
    };
  }
  let selected = catalog.find((e) => e?.id === selectedId) || catalog[0];
  const render = () => {
    hostEl.innerHTML = catalog.map((e, i) => {
      const isSel = e === selected;
      const desc = e?.description ? `<p class="twm-gallery-card__desc">${esc(e.description)}</p>` : "";
      return `
                <button type="button"
                        class="twm-gallery-card ${isSel ? "is-selected" : ""}"
                        data-idx="${i}"
                        title="${esc(e?.id || "")}">
                    <span class="twm-gallery-card__label">${esc(e?.label || e?.id || "")}</span>
                    ${desc}
                </button>
            `;
    }).join("");
  };
  render();
  const onClick = (ev) => {
    const card = ev.target.closest?.(".twm-gallery-card");
    if (!card || !hostEl.contains(card)) return;
    const idx = Number(card.dataset.idx);
    const next = catalog[idx];
    if (!next || next === selected) return;
    selected = next;
    render();
    try {
      onChange(selected);
    } catch (err) {
      console.warn("[gallery-picker] onChange threw", err);
    }
  };
  hostEl.addEventListener("click", onClick);
  try {
    onChange(selected);
  } catch (err) {
    console.warn("[gallery-picker] initial onChange threw", err);
  }
  return {
    getSelected: () => selected ? { ...selected } : null,
    setSelectedById: (id) => {
      const next = catalog.find((e) => e?.id === id);
      if (!next || next === selected) return false;
      selected = next;
      render();
      try {
        onChange(selected);
      } catch (err) {
        console.warn("[gallery-picker] onChange threw", err);
      }
      return true;
    },
    dispose: () => {
      hostEl.removeEventListener("click", onClick);
      hostEl.innerHTML = "";
      hostEl.classList.remove("twm-gallery-picker");
    }
  };
}

// src/ui/components/notification_history.js
var NotificationHistory = class {
  constructor({
    notificationCenter,
    eventBus,
    logger,
    mountPoint = null,
    alertLog = null,
    alertsTab = "alerts",
    onOpen = null
  } = {}) {
    this.notificationCenter = notificationCenter;
    this.eventBus = eventBus || null;
    this.logger = logger || console;
    this.mountPoint = mountPoint;
    this.alertLog = alertLog;
    this.alertsTab = alertsTab;
    this.onOpen = typeof onOpen === "function" ? onOpen : null;
    this.triggerEl = null;
    this.badgeEl = null;
    this.lastSeenCount = 0;
    this._popoverCleanup = null;
    this._subscriptions = [];
  }
  mount() {
    const barRight = this.mountPoint || document.querySelector(".twm-global-bottom-bar .twm-bar-right");
    if (!barRight) {
      this.logger.warn?.("[NotificationHistory] .bar-right not found");
      return;
    }
    this.triggerEl = document.createElement("button");
    this.triggerEl.className = "twm-notification-history__trigger twm-has-tooltip";
    this.triggerEl.setAttribute("data-tooltip", "Notification history");
    this.triggerEl.setAttribute("aria-label", "Notification history");
    this.triggerEl.innerHTML = '<span class="material-symbols-outlined">notifications</span><span class="twm-notification-history__badge" style="display:none">0</span>';
    this.badgeEl = this.triggerEl.querySelector(".twm-notification-history__badge");
    barRight.appendChild(this.triggerEl);
    this.triggerEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.alertLog) this.#openAlerts();
      else this.#togglePanel();
    });
    if (this.alertLog) {
      this.triggerEl.setAttribute("data-tooltip", "Alerts");
      this.triggerEl.setAttribute("aria-label", "Alerts");
      this._subscriptions.push(this.alertLog.subscribe(() => this.#updateBadge()));
      const summary = this.eventBus?.on?.("notification:summary", () => this.#openAlerts());
      if (summary) this._subscriptions.push(() => summary.dispose?.());
      this.#updateBadge();
      return;
    }
    this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;
    this.#subscribeEvents();
  }
  unmount() {
    this.#closePanel();
    this._subscriptions.forEach((unsub) => {
      if (typeof unsub === "function") unsub();
    });
    this._subscriptions = [];
    if (this.triggerEl?.parentNode) {
      this.triggerEl.parentNode.removeChild(this.triggerEl);
    }
    this.triggerEl = null;
    this.badgeEl = null;
  }
  #subscribeEvents() {
    if (!this.eventBus) return;
    const badgeUpdate = () => queueMicrotask(() => this.#updateBadge());
    const events = [
      "toast:show",
      "notification:show",
      "log:entry",
      "workspace:save:failed",
      "workspace:import:failed"
    ];
    events.forEach((name) => {
      const handle = this.eventBus.on(name, badgeUpdate);
      this._subscriptions.push(() => handle?.dispose?.());
    });
  }
  /** The Alerts tab, asked for on the bus — or the embedder's own verb. */
  #openAlerts() {
    if (this.onOpen) {
      try {
        this.onOpen();
      } catch (err) {
        this.logger.warn?.("[NotificationHistory] onOpen failed", err);
      }
      return;
    }
    this.eventBus?.emit?.("bottompanel:show", { tab: this.alertsTab });
  }
  #updateBadge() {
    const historyLen = this.notificationCenter?.history?.length ?? 0;
    const unread = this.alertLog ? this.alertLog.unreadCount() : Math.max(0, historyLen - this.lastSeenCount);
    if (!this.badgeEl) return;
    if (this.alertLog) {
      const level = unread > 0 ? this.alertLog.worstUnread() : null;
      this.badgeEl.className = "twm-notification-history__badge" + (level ? ` twm-notification-history__badge--${level}` : "");
      this.triggerEl?.classList.toggle("twm-notification-history__trigger--unread", unread > 0);
    }
    if (unread > 0) {
      this.badgeEl.textContent = unread > 99 ? "99+" : String(unread);
      this.badgeEl.style.display = "";
    } else {
      this.badgeEl.style.display = "none";
    }
  }
  #togglePanel() {
    if (this._popoverCleanup) {
      this.#closePanel();
    } else {
      this.#openPanel();
    }
  }
  #closePanel() {
    if (typeof this._popoverCleanup === "function") {
      try {
        this._popoverCleanup();
      } catch (_) {
      }
      this._popoverCleanup = null;
    }
  }
  #openPanel() {
    this.#closePanel();
    this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;
    this.#updateBadge();
    const panel = document.createElement("div");
    panel.className = "twm-notification-history__panel";
    const header = document.createElement("div");
    header.className = "twm-notification-history__header";
    header.innerHTML = '<span class="twm-notification-history__title">Notifications</span><button class="twm-notification-history__clear-btn twm-has-tooltip" data-tooltip="Clear all" aria-label="Clear all"><span class="material-symbols-outlined">delete_sweep</span></button><button class="twm-notification-history__close-btn twm-has-tooltip" data-tooltip="Close" aria-label="Close"><span class="material-symbols-outlined">close</span></button>';
    panel.appendChild(header);
    const list = document.createElement("div");
    list.className = "twm-notification-history__list";
    panel.appendChild(list);
    this.#renderList(list);
    header.querySelector(".twm-notification-history__close-btn").addEventListener("click", () => this.#closePanel());
    header.querySelector(".twm-notification-history__clear-btn").addEventListener("click", () => {
      this.notificationCenter.history.splice(0);
      this.lastSeenCount = 0;
      this.#updateBadge();
      this.#renderList(list);
    });
    document.body.appendChild(panel);
    this.#positionPanel(panel);
    const cleanup = () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize, true);
      try {
        panel.remove();
      } catch (_) {
      }
      this._popoverCleanup = null;
    };
    this._popoverCleanup = cleanup;
    const onDocDown = (ev) => {
      if (!panel.contains(ev.target) && !this.triggerEl.contains(ev.target)) cleanup();
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") cleanup();
    };
    const onResize = () => cleanup();
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize, true);
  }
  #renderList(listEl) {
    listEl.innerHTML = "";
    const history = this.notificationCenter?.history ?? [];
    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "twm-notification-history__empty";
      empty.textContent = "No notifications";
      listEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      const item = document.createElement("div");
      const severity = entry.severity || "info";
      item.className = `twm-notification-history__item twm-notification-history__item--${severity}`;
      const itemHeader = document.createElement("div");
      itemHeader.className = "twm-notification-history__item-header";
      if (entry.title) {
        const titleEl = document.createElement("span");
        titleEl.className = "twm-notification-history__item-title";
        titleEl.textContent = entry.title;
        itemHeader.appendChild(titleEl);
      }
      const timeEl = document.createElement("span");
      timeEl.className = "twm-notification-history__item-time";
      timeEl.textContent = this.#formatTime(entry.timestamp);
      itemHeader.appendChild(timeEl);
      item.appendChild(itemHeader);
      const body = document.createElement("div");
      body.className = "twm-notification-history__item-body";
      body.textContent = entry.message || "";
      item.appendChild(body);
      fragment.appendChild(item);
    }
    listEl.appendChild(fragment);
  }
  #positionPanel(panel) {
    if (!this.triggerEl) return;
    const triggerRect = this.triggerEl.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const gap = 8;
    let left = triggerRect.right - panelWidth;
    const vw = window.innerWidth;
    left = Math.max(8, Math.min(left, vw - panelWidth - 8));
    const bottom = window.innerHeight - (triggerRect.top - gap);
    const available = triggerRect.top - gap - 8;
    panel.style.maxHeight = `${Math.max(0, Math.min(420, Math.round(available)))}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.bottom = `${Math.round(bottom)}px`;
    panel.style.top = "auto";
  }
  #formatTime(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
};

// src/ui/components/record_list.js
var OWN_ARROWS = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
var safeWord = (s) => String(s).replace(/[^\w-]/g, "");
var SEQ2 = 0;
var RecordList = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {RecordListConfig} [config]
   */
  constructor(host, config = {}) {
    this.config = {
      records: [],
      describe: null,
      getKey: null,
      onActivate: null,
      activateOn: ["click", "enter"],
      keyboard: void 0,
      activeKey: null,
      rowClass: null,
      rowAttrs: null,
      emptyState: null,
      factSeparator: " \u2014 ",
      facts: "wrap",
      verbClass: null,
      label: null,
      className: null,
      ...config
    };
    this._records = Array.isArray(this.config.records) ? this.config.records.slice() : [];
    this._activeKey = this.config.activeKey ?? null;
    this._tabKey = null;
    this._items = /* @__PURE__ */ new Map();
    this._disposed = false;
    this._id = `twm-record-list-${++SEQ2}`;
    const root = document.createElement("div");
    root.className = "twm-record-list" + (this.config.facts === "ellipsis" ? " twm-record-list--clip" : "") + (this._activates() ? " twm-record-list--clickable" : "") + (this.config.className ? ` ${this.config.className}` : "");
    const list = document.createElement("ul");
    list.className = "twm-record-list__items";
    if (this.config.label) list.setAttribute("aria-label", this.config.label);
    root.appendChild(list);
    this.element = root;
    this.listElement = list;
    this._onClick = (ev) => this._gesture(ev, "click");
    this._onDblClick = (ev) => this._gesture(ev, "dblclick");
    this._onKeyDown = (ev) => this._key(ev);
    this._onFocusIn = (ev) => {
      const li = this._itemOf(ev.target);
      if (li && ev.target === li) this._setTabStop(li.__recordKey);
    };
    list.addEventListener("click", this._onClick);
    list.addEventListener("dblclick", this._onDblClick);
    list.addEventListener("keydown", this._onKeyDown);
    list.addEventListener("focusin", this._onFocusIn);
    this._draw();
    if (host) host.appendChild(root);
  }
  // ── public ───────────────────────────────────────────────────────────
  /** Replace the records and draw them. Focus inside the list is kept on
   *  the same record, and on the same verb of it, when it is still there. */
  setRecords(records) {
    if (this._disposed) return;
    this._records = Array.isArray(records) ? records.slice() : [];
    this._draw();
  }
  /** The records, as last given. */
  getRecords() {
    return this._records.slice();
  }
  /** Draw ONE record again (`describe` asked afresh), or every one with no key. */
  refresh(key) {
    if (this._disposed) return;
    if (key === void 0) {
      this._draw();
      return;
    }
    const old = this._items.get(this._norm(key));
    if (!old) return;
    const idx = old.__recordIndex;
    const focus = this._focusMemo();
    const fresh = this._item(this._records[idx], idx);
    old.replaceWith(fresh);
    this._items.set(fresh.__recordKey, fresh);
    this._paintTabStop();
    this._restoreFocus(focus);
  }
  /** Mark the record that is open (`null` for none). */
  setActiveKey(key) {
    this._activeKey = key ?? null;
    for (const li of this._items.values()) this._paintActive(li);
    if (this._activeKey !== null && this._items.has(this._norm(this._activeKey))) {
      this._setTabStop(this._norm(this._activeKey));
    }
  }
  getActiveKey() {
    return this._activeKey;
  }
  /** The `<li>` drawn for a key, or null. */
  getItem(key) {
    return this._items.get(this._norm(key)) || null;
  }
  /** Move the keyboard focus to a record. */
  focusRecord(key) {
    const li = this.getItem(key);
    if (!li) return false;
    this._setTabStop(li.__recordKey);
    li.focus();
    return true;
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const list = this.listElement;
    list.removeEventListener("click", this._onClick);
    list.removeEventListener("dblclick", this._onDblClick);
    list.removeEventListener("keydown", this._onKeyDown);
    list.removeEventListener("focusin", this._onFocusIn);
    this._items.clear();
    this.element.remove();
  }
  // ── drawing ──────────────────────────────────────────────────────────
  _activates() {
    return typeof this.config.onActivate === "function";
  }
  _keyboard() {
    return this.config.keyboard ?? this._activates();
  }
  _gestures() {
    const g = this.config.activateOn;
    return new Set(Array.isArray(g) ? g : [g]);
  }
  /** Keys compare as strings: a record keyed `7` and an `activeKey` of `'7'` are one. */
  _norm(key) {
    return key === null || key === void 0 ? key : String(key);
  }
  _spec(record, idx) {
    const { describe } = this.config;
    const spec = typeof describe === "function" ? describe(record, idx) : record;
    return spec && typeof spec === "object" ? spec : { name: spec };
  }
  _keyOf(record, idx, spec) {
    const { getKey } = this.config;
    let key;
    if (spec.key !== void 0 && spec.key !== null) key = spec.key;
    else if (typeof getKey === "function") key = getKey(record, idx);
    else if (record && typeof record === "object" && (record.key ?? record.id) != null) key = record.key ?? record.id;
    else key = idx;
    return String(key);
  }
  _draw() {
    const focus = this._focusMemo();
    const list = this.listElement;
    list.replaceChildren();
    this._items.clear();
    this.element.querySelector(":scope > .twm-record-list__empty")?.remove();
    this._records.forEach((record, idx) => {
      const li = this._item(record, idx);
      if (this._items.has(li.__recordKey)) {
        console.error(`[RecordList] two records share the key "${li.__recordKey}"`);
      }
      this._items.set(li.__recordKey, li);
      list.appendChild(li);
    });
    this.element.classList.toggle("twm-record-list--empty", this._records.length === 0);
    if (!this._records.length) this._drawEmpty();
    this._paintTabStop();
    this._restoreFocus(focus);
  }
  _drawEmpty() {
    let content = this.config.emptyState;
    if (typeof content === "function") content = content();
    if (content == null || content === false || content === "") return;
    const p = document.createElement("p");
    p.className = "twm-record-list__empty";
    if (typeof Node !== "undefined" && content instanceof Node) p.appendChild(content);
    else p.textContent = String(content);
    this.element.appendChild(p);
  }
  _item(record, idx) {
    const spec = this._spec(record, idx);
    const key = this._keyOf(record, idx, spec);
    const li = document.createElement("li");
    li.className = "twm-record";
    li.__record = record;
    li.__recordIndex = idx;
    li.__recordKey = key;
    li.dataset.recordKey = key;
    if (this._keyboard()) li.tabIndex = -1;
    if (spec.state) {
      li.dataset.state = safeWord(spec.state);
      li.classList.add(`twm-record--state-${safeWord(spec.state)}`);
    }
    const main = document.createElement("div");
    main.className = "twm-record__main";
    const name = document.createElement("div");
    name.className = "twm-record__name" + (spec.mono ? " twm-record__name--mono" : "");
    appendContent2(name, spec.name);
    main.appendChild(name);
    const factsText = this._facts(spec.facts);
    if (factsText !== null) {
      const facts = document.createElement("div");
      facts.className = "twm-record__facts";
      appendContent2(facts, factsText);
      if (this.config.facts === "ellipsis") facts.title = facts.textContent;
      main.appendChild(facts);
    }
    if (spec.error != null && spec.error !== false && spec.error !== "") {
      const err = document.createElement("div");
      err.className = "twm-record__error";
      appendContent2(err, spec.error);
      main.appendChild(err);
    }
    li.appendChild(main);
    const pills = (spec.pills || []).filter((p) => p != null && p !== false && p !== "");
    if (pills.length) {
      const box = document.createElement("div");
      box.className = "twm-record__pills";
      for (const p of pills) box.appendChild(pill(p));
      li.appendChild(box);
    }
    const verbs = (spec.verbs || []).filter(Boolean);
    if (verbs.length) {
      const box = document.createElement("div");
      box.className = "twm-record__verbs";
      const reasons = /* @__PURE__ */ new Map();
      for (const v of verbs) {
        const b = this._verb(v, record);
        box.appendChild(b);
        if (v.refusal) {
          const said = String(v.refusal);
          if (!reasons.has(said)) reasons.set(said, { labels: [], buttons: [] });
          reasons.get(said).labels.push(v.label);
          reasons.get(said).buttons.push(b);
        }
      }
      li.appendChild(box);
      if (reasons.size) {
        const lines = document.createElement("div");
        lines.className = "twm-record__refusals";
        let n = 0;
        for (const [said, { labels, buttons }] of reasons) {
          const line = document.createElement("div");
          line.className = "twm-record__refusal";
          line.id = `${this._id}-r${idx}-${n++}`;
          line.dataset.refusalFor = labels.join(", ");
          line.textContent = labels.length === verbs.length && verbs.length > 1 ? said : `${labels.join(", ")}: ${said}`;
          for (const b of buttons) b.setAttribute("aria-describedby", line.id);
          lines.appendChild(line);
        }
        main.appendChild(lines);
      }
    }
    this._decorate(li, record, idx);
    return li;
  }
  _facts(facts) {
    if (facts == null || facts === false) return null;
    if (typeof Node !== "undefined" && facts instanceof Node) return facts;
    if (!Array.isArray(facts)) {
      const s = String(facts);
      return s === "" ? null : s;
    }
    const parts = facts.filter((f) => f != null && f !== false && f !== "");
    if (!parts.length) return null;
    if (parts.every((p) => !(typeof Node !== "undefined" && p instanceof Node))) {
      return parts.map(String).join(this.config.factSeparator);
    }
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => {
      if (i) frag.appendChild(document.createTextNode(this.config.factSeparator));
      appendContent2(frag, p);
    });
    return frag;
  }
  _verb(v, record) {
    const b = document.createElement("button");
    b.type = "button";
    const { verbClass } = this.config;
    b.className = typeof verbClass === "function" ? String(verbClass(v) || "") : typeof verbClass === "string" ? verbClass : "twm-btn" + (v.primary ? " twm-btn--primary" : "") + (v.danger ? " twm-btn--danger" : "");
    b.classList.add("twm-record__verb");
    b.dataset.verb = String(v.name ?? v.label);
    if (v.icon) {
      const glyph = document.createElement("span");
      glyph.className = "material-symbols-outlined twm-record__verb-icon";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = String(v.icon);
      b.appendChild(glyph);
    }
    const label = document.createElement("span");
    label.className = "twm-record__verb-label";
    label.textContent = String(v.label ?? "");
    b.appendChild(label);
    if (v.refusal) {
      b.disabled = true;
      b.title = String(v.refusal);
      b.dataset.refusal = String(v.refusal);
    } else {
      if (v.title) b.title = String(v.title);
      if (typeof v.onClick === "function") b.addEventListener("click", (ev) => v.onClick(record, ev));
    }
    return b;
  }
  _decorate(li, record, idx) {
    const { rowClass, rowAttrs } = this.config;
    if (typeof rowClass === "function") {
      const c = rowClass(record, idx);
      const list = Array.isArray(c) ? c : String(c ?? "").split(/\s+/);
      for (const name of list) if (name) li.classList.add(String(name));
    }
    if (typeof rowAttrs === "function") {
      for (const [name, value] of Object.entries(rowAttrs(record, idx) || {})) {
        if (value == null || value === false) continue;
        try {
          li.setAttribute(name, value === true ? "" : String(value));
        } catch (err) {
          console.error(`[RecordList] rowAttrs: bad attribute "${name}"`, err);
        }
      }
    }
    this._paintActive(li);
  }
  _paintActive(li) {
    const on = this._activeKey !== null && li.__recordKey === this._norm(this._activeKey);
    li.classList.toggle("twm-record--active", on);
    if (on) {
      if (li.getAttribute("aria-current") !== "true") {
        li.setAttribute("aria-current", "true");
        li.__twmAriaCurrent = true;
      }
    } else if (li.__twmAriaCurrent) {
      li.__twmAriaCurrent = false;
      li.removeAttribute("aria-current");
    }
  }
  // ── focus ────────────────────────────────────────────────────────────
  /** The ONE record that takes Tab: the one last focused, else the open
   *  one, else the first. */
  _paintTabStop() {
    if (!this._keyboard()) return;
    let key = this._tabKey;
    if (key === null || !this._items.has(key)) {
      const active = this._norm(this._activeKey);
      key = active !== null && this._items.has(active) ? active : this._items.keys().next().value ?? null;
    }
    this._setTabStop(key);
  }
  _setTabStop(key) {
    if (!this._keyboard()) return;
    this._tabKey = key ?? null;
    for (const [k, li] of this._items) li.tabIndex = k === this._tabKey ? 0 : -1;
  }
  _focusMemo() {
    const doc = this.element.ownerDocument;
    const active = doc?.activeElement;
    if (!active || !this.listElement.contains(active)) return null;
    const li = this._itemOf(active);
    if (!li) return null;
    return { key: li.__recordKey, verb: active.closest(".twm-record__verb")?.dataset.verb ?? null };
  }
  _restoreFocus(memo) {
    if (!memo) return;
    const li = this._items.get(memo.key);
    if (!li) return;
    if (memo.verb !== null) {
      const b = [...li.querySelectorAll(".twm-record__verb")].find((x) => x.dataset.verb === memo.verb);
      if (b && !b.disabled) {
        b.focus();
        return;
      }
    }
    if (this._keyboard()) {
      this._setTabStop(li.__recordKey);
      li.focus();
    }
  }
  _itemOf(target) {
    const li = target?.closest?.(".twm-record");
    return li && this.listElement.contains(li) && li.parentNode === this.listElement ? li : null;
  }
  // ── gestures ─────────────────────────────────────────────────────────
  _gesture(ev, gesture) {
    if (!this._activates() || !this._gestures().has(gesture)) return;
    const li = this._itemOf(ev.target);
    if (!li) return;
    if (!isRowActivation(ev, gesture, { scope: this.listElement })) return;
    this.config.onActivate(li.__record, li.__recordIndex, ev);
  }
  _key(ev) {
    if (ev.defaultPrevented) return;
    const li = this._itemOf(ev.target);
    if (!li) return;
    if (ev.key === "Enter") {
      if (ev.target !== li || !this._activates() || !this._gestures().has("enter")) return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      ev.preventDefault();
      this.config.onActivate(li.__record, li.__recordIndex, ev);
      return;
    }
    if (!this._keyboard()) return;
    if (ev.target !== li && (ev.target.closest(OWN_ARROWS) || !isRowControl(ev.target, li))) return;
    const items = [...this._items.values()];
    const at = items.indexOf(li);
    let next = null;
    if (ev.key === "ArrowDown") next = items[Math.min(items.length - 1, at + 1)];
    else if (ev.key === "ArrowUp") next = items[Math.max(0, at - 1)];
    else if (ev.key === "Home") next = items[0];
    else if (ev.key === "End") next = items[items.length - 1];
    else return;
    ev.preventDefault();
    if (next) {
      this._setTabStop(next.__recordKey);
      next.focus();
    }
  }
};
function createRecordList(host, config = {}) {
  return new RecordList(host, config);
}
function pill(p) {
  const s = typeof p === "object" && !(typeof Node !== "undefined" && p instanceof Node) ? p : { text: p };
  const span = document.createElement("span");
  span.className = "twm-record__pill" + (s.tone ? ` twm-record__pill--${safeWord(s.tone)}` : "");
  if (typeof Node !== "undefined" && s.text instanceof Node) span.appendChild(s.text);
  else if (typeof Node !== "undefined" && p instanceof Node) span.appendChild(p);
  else span.textContent = String(s.text ?? "");
  if (s.title) span.title = String(s.title);
  if (s.tone) span.dataset.tone = safeWord(s.tone);
  return span;
}
function appendContent2(el3, content) {
  if (content == null || content === false) return;
  if (typeof Node !== "undefined" && content instanceof Node) el3.appendChild(content);
  else el3.appendChild(document.createTextNode(String(content)));
}

// src/ui/components/section_stack.js
function createSectionStack(container, { sections = [], stateStore = null, key = null } = {}) {
  if (stateStore && !key) throw new Error("createSectionStack: a stateStore needs a { key }");
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.className = "twm-section-stack";
  const byId = /* @__PURE__ */ new Map();
  const actionOf = /* @__PURE__ */ new Map();
  const headerOf = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let disposed = false;
  let readPending = false;
  let writeOwed = false;
  for (const def of sections) {
    if (!def || def.id == null || byId.has(def.id)) {
      throw new Error(`createSectionStack: every section needs a unique id (got ${def?.id})`);
    }
    const expanded = def.defaultExpanded !== false;
    const box = doc.createElement("section");
    box.className = "twm-collapsible-box twm-section-stack__section" + (def.fill ? " twm-section-stack__section--fill" : "");
    const header = doc.createElement("div");
    header.className = "twm-collapsible-header twm-section-stack__header";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "twm-section-stack__toggle";
    const arrow = doc.createElement("span");
    arrow.className = "twm-collapsible-arrow material-symbols-outlined";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "expand_more";
    toggle.appendChild(arrow);
    if (def.icon) {
      const icon2 = doc.createElement("span");
      icon2.className = "twm-section-stack__icon material-symbols-outlined";
      icon2.setAttribute("aria-hidden", "true");
      icon2.textContent = def.icon;
      toggle.appendChild(icon2);
    }
    const title = doc.createElement("span");
    title.className = "twm-section-stack__title";
    title.textContent = def.title ?? String(def.id);
    toggle.appendChild(title);
    header.appendChild(toggle);
    if (Array.isArray(def.actions) && def.actions.length) {
      const bar = doc.createElement("div");
      bar.className = "twm-section-stack__actions";
      for (const action of def.actions) {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "twm-section-stack__action";
        if (action.label) btn.setAttribute("aria-label", action.label);
        if (action.title ?? action.label) btn.setAttribute("title", action.title ?? action.label);
        const glyph = doc.createElement("span");
        glyph.className = "material-symbols-outlined";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = action.icon ?? "";
        btn.appendChild(glyph);
        bar.appendChild(btn);
        actionOf.set(btn, { sectionId: def.id, action });
      }
      header.appendChild(bar);
    }
    const body = doc.createElement("div");
    body.className = "twm-collapsible-content twm-section-stack__body";
    if (def.content) body.appendChild(def.content);
    box.append(header, body);
    root.appendChild(box);
    headerOf.set(header, def.id);
    const entry = { def, box, toggle, arrow, body, expanded, visible: true, touched: false };
    byId.set(def.id, entry);
    paint(entry);
  }
  function paint(entry) {
    entry.box.classList.toggle("twm-section-stack__section--expanded", entry.expanded);
    entry.body.classList.toggle("visible", entry.expanded);
    entry.arrow.classList.toggle("collapsed", !entry.expanded);
    entry.toggle.setAttribute("aria-expanded", String(entry.expanded));
    entry.box.hidden = !entry.visible;
  }
  function emit(detail) {
    for (const fn of [...listeners]) {
      try {
        fn(detail);
      } catch (err) {
        console.error("[section-stack] toggled listener failed", err);
      }
    }
  }
  function persist() {
    if (!stateStore?.write) return;
    if (readPending) {
      writeOwed = true;
      return;
    }
    const map = {};
    for (const [id, entry] of byId) map[id] = entry.expanded;
    write(map);
  }
  function write(map) {
    try {
      const pending = stateStore.write(key, map);
      pending?.catch?.(() => {
      });
    } catch {
    }
  }
  function set(id, expanded, source) {
    const entry = byId.get(id);
    if (disposed || !entry || entry.expanded === expanded) return false;
    entry.expanded = expanded;
    if (source !== "restore") entry.touched = true;
    paint(entry);
    if (source !== "restore") persist();
    emit({ id, expanded, source });
    return true;
  }
  const isMap = (saved) => !!saved && typeof saved === "object" && !Array.isArray(saved);
  function restore(saved, source) {
    if (disposed || !isMap(saved)) return;
    for (const [id, entry] of byId) {
      if (entry.touched || typeof saved[id] !== "boolean") continue;
      if (source === "restore") set(id, saved[id], "restore");
      else {
        entry.expanded = saved[id];
        paint(entry);
      }
    }
  }
  function settle(saved) {
    restore(saved, "restore");
    readPending = false;
    if (!writeOwed) return;
    writeOwed = false;
    const map = {};
    for (const [id, entry] of byId) {
      map[id] = !entry.touched && isMap(saved) && typeof saved[id] === "boolean" ? saved[id] : entry.expanded;
    }
    write(map);
  }
  function onClick(event) {
    const target = event.target;
    const btn = target?.closest?.(".twm-section-stack__action");
    if (btn && actionOf.has(btn)) {
      const { sectionId, action } = actionOf.get(btn);
      event.stopPropagation();
      try {
        action.onClick?.(sectionId, event);
      } catch (err) {
        console.error(`[section-stack] action on "${sectionId}" failed`, err);
      }
      return;
    }
    const header = target?.closest?.(".twm-section-stack__header");
    if (!header || !headerOf.has(header)) return;
    const id = headerOf.get(header);
    set(id, !byId.get(id).expanded, "user");
  }
  root.addEventListener("click", onClick);
  let ready = Promise.resolve();
  if (stateStore?.read) {
    let saved = null;
    try {
      saved = stateStore.read(key);
    } catch {
      saved = null;
    }
    if (saved && typeof saved.then === "function") {
      readPending = true;
      ready = Promise.resolve(saved).then((value) => settle(value), () => settle(null));
    } else {
      restore(saved, "mount");
    }
  }
  container.appendChild(root);
  const need = (id) => {
    if (!byId.has(id)) throw new Error(`createSectionStack: no section "${id}"`);
    return byId.get(id);
  };
  return {
    root,
    ready,
    /** The section's body element, for content mounted after the stack. */
    body: (id) => need(id).body,
    expand(id) {
      need(id);
      set(id, true, "api");
    },
    collapse(id) {
      need(id);
      set(id, false, "api");
    },
    toggle(id) {
      set(id, !need(id).expanded, "api");
    },
    isExpanded: (id) => need(id).expanded,
    /** Off the stack, or back on it — its expanded state is kept either way. */
    setVisible(id, visible) {
      const entry = need(id);
      entry.visible = !!visible;
      paint(entry);
    },
    isVisible: (id) => need(id).visible,
    /** `on('toggled', fn)` — answers the function that stops listening. */
    on(event, fn) {
      if (event !== "toggled") throw new Error(`createSectionStack: no "${event}" event`);
      if (disposed) return () => {
      };
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeEventListener("click", onClick);
      listeners.clear();
      actionOf.clear();
      headerOf.clear();
      root.remove();
    }
  };
}

// src/ui/components/settings_view.js
var SETTINGS_TEXT_DEBOUNCE_MS = 300;
function el2(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0 && text !== null) n.textContent = String(text);
  return n;
}
function icon(name) {
  const n = el2("span", "material-symbols-outlined", name);
  n.setAttribute("aria-hidden", "true");
  return n;
}
function same(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}
function fitNumber(n, { min, max, step }) {
  const lo = min != null && Number.isFinite(Number(min)) ? Number(min) : null;
  const hi = max != null && Number.isFinite(Number(max)) ? Number(max) : null;
  const s = Number(step);
  if (!(Number.isFinite(s) && s > 0)) {
    let v = n;
    if (hi != null) v = Math.min(hi, v);
    if (lo != null) v = Math.max(lo, v);
    return v;
  }
  const base = lo ?? 0;
  const places = (x) => (String(x).split(".")[1] || "").length;
  const decimals = Math.max(places(s), places(base));
  const at = (k2) => Number((base + k2 * s).toFixed(decimals));
  const EPS = 1e-9;
  let k = Math.round((n - base) / s);
  if (hi != null && at(k) > hi) k = Math.floor((hi - base) / s + EPS);
  if (lo != null && at(k) < lo) k = Math.ceil((lo - base) / s - EPS);
  return at(k);
}
var SettingsView = class extends ComponentBase {
  /**
   * @param {object}    o
   * @param {object}    o.store     a settings store (`createSettingsStore()` / `getSettingsStore()`)
   * @param {object}    o.eventBus  the bus the store emits on
   * @param {Function} [o.confirm]  `({title, message, confirmLabel, danger}) -> Promise<boolean>`
   * @param {string}   [o.category] the category shown first (default: the first)
   * @param {number}   [o.textDebounceMs]
   * @param {string}   [o.title='Settings']  the sidebar heading
   */
  constructor({
    store,
    eventBus,
    confirm = openConfirm,
    category = null,
    textDebounceMs = SETTINGS_TEXT_DEBOUNCE_MS,
    title = "Settings",
    logger
  } = {}) {
    super({ eventBus, logger });
    if (!store || typeof store.getSchema !== "function") {
      throw new TypeError("SettingsView: `store` must be a settings store");
    }
    if (!eventBus || typeof eventBus.on !== "function") {
      throw new TypeError("SettingsView: `eventBus` must be the bus the store emits on");
    }
    this.store = store;
    this._confirm = confirm;
    this._category = category;
    this._query = "";
    this._debounceMs = textDebounceMs;
    this._title = title;
    this.root = null;
    this._nav = null;
    this._content = null;
    this._search = null;
    this._rows = /* @__PURE__ */ new Map();
    this._pathSubs = /* @__PURE__ */ new Map();
    this._subs = [];
    this._disposed = false;
  }
  /** Build the view into `container` (once). */
  mount(container) {
    if (this.root) return this.root;
    const root = el2("div", "twm-settings");
    const side = el2("aside", "twm-settings__sidebar");
    const head = el2("div", "twm-settings__sidebar-title");
    head.append(icon("settings"), el2("span", "", this._title));
    const search = el2("label", "twm-settings__search");
    const input = el2("input", "twm-settings__search-input");
    input.type = "search";
    input.placeholder = "Filter settings\u2026";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Filter settings");
    input.addEventListener("input", () => this.setQuery(input.value));
    search.append(icon("search"), input);
    this._search = input;
    const nav = el2("nav", "twm-settings__nav");
    nav.setAttribute("aria-label", "Settings categories");
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-category]");
      if (btn && nav.contains(btn)) this.selectCategory(btn.dataset.category);
    });
    this._nav = nav;
    const resetAll = el2("button", "twm-btn twm-settings__reset-all");
    resetAll.type = "button";
    resetAll.append(icon("restart_alt"), el2("span", "", "Reset all"));
    resetAll.addEventListener("click", () => {
      this.resetAll();
    });
    side.append(head, search, nav, resetAll);
    const content = el2("div", "twm-settings__content");
    this._content = content;
    root.append(side, content);
    this.root = root;
    container.appendChild(root);
    this._mounted = true;
    for (const path of Object.keys(this.store.getSchema())) this.#watch(path);
    this._subs.push(this.eventBus.on("settings:changed", (p) => {
      if (p?.path == null) this.#syncAll();
    }));
    this._subs.push(this.eventBus.on("settings:registered", (p) => this.#onRegistered(p)));
    this.#paintNav();
    this.#paintContent();
    return root;
  }
  /** The category on screen (its id), or null. */
  getCategory() {
    return this.#activeCategory()?.id ?? null;
  }
  /** The filter text. */
  getQuery() {
    return this._query;
  }
  /** Show one category; clears the filter. */
  selectCategory(id) {
    if (!this.root) return;
    if (!this.store.getCategories().some((c) => c.id === id)) return;
    this._category = id;
    this._query = "";
    if (this._search) this._search.value = "";
    this.#paintNav();
    this.#paintContent();
  }
  /** Search every category; an empty query goes back to the category. */
  setQuery(query) {
    if (!this.root) return;
    const q = String(query ?? "");
    this._query = q;
    if (this._search && this._search.value !== q) this._search.value = q;
    this.#paintNav();
    this.#paintContent();
  }
  /** Reset one category after `confirm`; resolves true when it was reset. */
  async resetCategory(id = this.getCategory()) {
    const cat = this.store.getCategories().find((c) => c.id === id);
    if (!cat) return false;
    const ok = await this._confirm({
      title: "Reset category",
      message: `Reset every setting in \u201C${cat.label ?? cat.id}\u201D to its default?`,
      confirmLabel: "Reset",
      danger: true
    });
    if (!ok || this._disposed) return false;
    this.#flushAll();
    this.store.resetCategory(id);
    this.#syncAll();
    return true;
  }
  /** Reset every setting after `confirm`; resolves true when they were reset. */
  async resetAll() {
    const ok = await this._confirm({
      title: "Reset all settings",
      message: "Reset every setting to its default?",
      confirmLabel: "Reset all",
      danger: true
    });
    if (!ok || this._disposed) return false;
    this.#flushAll();
    this.store.resetAll();
    this.#syncAll();
    return true;
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.#flushAll();
    this.#dropRows();
    for (const sub of this._pathSubs.values()) sub.dispose();
    this._pathSubs.clear();
    for (const sub of this._subs) sub.dispose();
    this._subs = [];
    this.root?.remove();
    this.root = null;
    this._nav = null;
    this._content = null;
    this._search = null;
    super.dispose();
  }
  // ── store events ─────────────────────────────────────────────────────
  #watch(path) {
    if (this._pathSubs.has(path)) return;
    this._pathSubs.set(path, this.eventBus.on(`settings:${path}:changed`, () => {
      this._rows.get(path)?.sync();
    }));
  }
  #onRegistered({ paths = [] } = {}) {
    if (!this.root) return;
    const schema = this.store.getSchema();
    for (const path of Object.keys(schema)) this.#watch(path);
    this.#paintNav();
    const active = this.getCategory();
    const touches = this.#searching() || !this._rows.size || paths.some((p) => schema[p]?.category === active);
    if (touches) {
      this.#paintContent();
      return;
    }
    this.#flushAll();
    this.#syncAll();
  }
  /** True while a filter is in effect: the trimmed query is not empty. */
  #searching() {
    return this._query.trim() !== "";
  }
  #syncAll() {
    for (const row of this._rows.values()) row.sync();
  }
  #flushAll() {
    for (const row of this._rows.values()) row.flush();
  }
  #dropRows() {
    for (const row of this._rows.values()) row.dispose();
    this._rows.clear();
  }
  // ── painting ─────────────────────────────────────────────────────────
  #activeCategory() {
    const cats = this.store.getCategories();
    return cats.find((c) => c.id === this._category) ?? cats[0] ?? null;
  }
  #paintNav() {
    const active = this.#searching() ? null : this.getCategory();
    const buttons = this.store.getCategories().map((cat) => {
      const b = el2("button", "twm-settings__cat");
      b.type = "button";
      b.dataset.category = cat.id;
      if (cat.id === active) {
        b.classList.add("twm-settings__cat--active");
        b.setAttribute("aria-current", "page");
      }
      b.append(icon(cat.icon || "tune"), el2("span", "twm-settings__cat-label", cat.label ?? cat.id));
      if (cat.description) b.title = String(cat.description);
      return b;
    });
    this._nav.replaceChildren(...buttons);
  }
  #paintContent() {
    this.#flushAll();
    this.#dropRows();
    const schema = this.store.getSchema();
    const content = this._content;
    content.replaceChildren();
    if (this.#searching()) {
      const q = this._query.trim().toLowerCase();
      const cats = this.store.getCategories();
      const labelOf = new Map(cats.map((c) => [c.id, c.label ?? c.id]));
      const rank = new Map(cats.map((c, i) => [c.id, i]));
      const matches = Object.entries(schema).filter(([path, def]) => [def.label, def.description, path].some((t) => t != null && String(t).toLowerCase().includes(q))).map(([path, def]) => ({ path, ...def }));
      matches.sort((a, b) => (rank.get(a.category) ?? Infinity) - (rank.get(b.category) ?? Infinity));
      const header2 = el2("header", "twm-settings__header");
      const info2 = el2("div", "twm-settings__header-info");
      const n = matches.length;
      info2.append(el2(
        "h2",
        "twm-settings__title",
        `${n} result${n === 1 ? "" : "s"} for \u201C${this._query.trim()}\u201D`
      ));
      header2.append(info2);
      content.append(header2);
      if (!n) {
        content.append(el2("div", "twm-settings__empty", "No setting matches the filter."));
        return;
      }
      this.#paintGroups(matches, (def) => `${labelOf.get(def.category) ?? def.category ?? ""} \u203A ${def.group || "General"}`);
      return;
    }
    const cat = this.#activeCategory();
    if (!cat) {
      content.append(el2("div", "twm-settings__empty", "No settings."));
      return;
    }
    this._category = cat.id;
    const header = el2("header", "twm-settings__header");
    const info = el2("div", "twm-settings__header-info");
    info.append(el2("h2", "twm-settings__title", cat.label ?? cat.id));
    if (cat.description) info.append(el2("p", "twm-settings__description", cat.description));
    const reset = el2("button", "twm-btn twm-settings__reset-category");
    reset.type = "button";
    reset.append(icon("restart_alt"), el2("span", "", "Reset category"));
    reset.addEventListener("click", () => {
      this.resetCategory(cat.id);
    });
    header.append(info, reset);
    content.append(header);
    const defs = Object.entries(schema).filter(([, def]) => def.category === cat.id).map(([path, def]) => ({ path, ...def }));
    if (!defs.length) {
      content.append(el2("div", "twm-settings__empty", "No settings in this category."));
      return;
    }
    this.#paintGroups(defs, (def) => def.group || "General");
  }
  #paintGroups(defs, groupTitle) {
    const groups = /* @__PURE__ */ new Map();
    for (const def of defs) {
      const key = groupTitle(def);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(def);
    }
    for (const [title, list] of groups) {
      const section = el2("section", "twm-settings__group");
      section.append(el2("h3", "twm-settings__group-title", title));
      for (const def of list) section.append(this.#row(def));
      this._content.append(section);
    }
  }
  // ── rows ─────────────────────────────────────────────────────────────
  #row(def) {
    const { path } = def;
    const store = this.store;
    const row = el2("div", "twm-settings__row");
    row.dataset.path = path;
    const info = el2("div", "twm-settings__info");
    const labelLine = el2("div", "twm-settings__label-line");
    const label = el2("span", "twm-settings__label", def.label ?? path);
    const marker = el2("span", "twm-settings__marker", "Modified");
    labelLine.append(label, marker);
    info.append(labelLine);
    if (def.description) info.append(el2("div", "twm-settings__description", def.description));
    info.append(el2("code", "twm-settings__path", path));
    const slot = el2("div", "twm-settings__control");
    const control = this.#control(def, (value) => store.set(path, value));
    slot.append(control.el);
    const reset = el2("button", "twm-settings__reset");
    reset.type = "button";
    reset.title = "Reset to default";
    reset.setAttribute("aria-label", `Reset ${def.label ?? path} to default`);
    reset.append(icon("restart_alt"));
    reset.addEventListener("click", () => {
      control.cancel?.();
      store.resetOne(path);
    });
    row.append(info, slot, reset);
    const sync = () => {
      const value = store.get(path);
      control.show(value);
      const modified = !same(value, store.getDefault(path));
      row.classList.toggle("twm-settings__row--modified", modified);
      marker.hidden = !modified;
      reset.hidden = !modified;
    };
    sync();
    this._rows.set(path, {
      sync,
      flush: () => control.flush?.(),
      dispose: () => control.dispose?.()
    });
    return row;
  }
  /** `{ el, show(value), flush?(), cancel?(), dispose?() }` for one setting. */
  #control(def, write) {
    const name = def.label ?? def.path;
    switch (def.type) {
      case "boolean": {
        const t = new ToggleField({
          checked: !!this.store.get(def.path),
          ariaLabel: name,
          compact: true,
          onChange: (on) => write(on)
        });
        return {
          el: t.render(),
          show: (v) => {
            if (t.get() !== !!v) t.set(!!v);
          },
          dispose: () => t.dispose()
        };
      }
      case "select": {
        const c = selectBox(def.options || [], this.store.get(def.path), {
          label: name,
          valueAttr: "value",
          className: "twm-settings__select"
        });
        c.box.addEventListener("change", () => {
          const v = c.valueOf();
          c.setOptions(def.options || [], v);
          write(v);
        });
        return {
          el: c.box,
          // Redrawn with the new value, as a fresh mount draws it: a
          // value the options lack shows as its '(not found)' entry, and
          // a stray entry left from an earlier value goes.
          show: (v) => {
            if (!same(c.valueOf(), v)) c.setOptions(def.options || [], v);
          }
        };
      }
      case "number": {
        const box = el2("input", "twm-settings__number");
        box.type = "number";
        box.setAttribute("aria-label", name);
        if (def.min != null) box.min = String(def.min);
        if (def.max != null) box.max = String(def.max);
        if (def.step != null) box.step = String(def.step);
        let dirty = false;
        const show = (v) => {
          dirty = false;
          const text = v == null ? "" : String(v);
          if (box.value !== text) box.value = text;
        };
        const commit = () => {
          const current = this.store.get(def.path);
          const n = box.value.trim() === "" ? NaN : Number(box.value);
          if (!Number.isFinite(n)) {
            show(current);
            return;
          }
          const v = fitNumber(n, def);
          show(v);
          if (!same(v, current)) write(v);
        };
        box.addEventListener("input", () => {
          dirty = true;
        });
        box.addEventListener("change", commit);
        return {
          el: box,
          show,
          flush: () => {
            if (dirty) commit();
          }
        };
      }
      case "text": {
        const box = el2("input", "twm-settings__text");
        box.type = "text";
        box.setAttribute("aria-label", name);
        if (def.placeholder != null) box.placeholder = String(def.placeholder);
        let timer = null;
        const valueOf = () => box.value === "" && def.defaultValue === null ? null : box.value;
        const cancel = () => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        };
        const commit = () => {
          const v = valueOf();
          if (!same(v, this.store.get(def.path))) write(v);
        };
        const flush = () => {
          if (timer === null) return;
          cancel();
          commit();
        };
        box.addEventListener("input", () => {
          cancel();
          timer = setTimeout(() => {
            timer = null;
            commit();
          }, this._debounceMs);
        });
        box.addEventListener("change", flush);
        box.addEventListener("keydown", (e) => {
          if (e.key === "Enter") flush();
        });
        return {
          el: box,
          show: (v) => {
            const text = v == null ? "" : String(v);
            if (box.value === text) return;
            cancel();
            box.value = text;
          },
          flush,
          cancel,
          dispose: cancel
        };
      }
      case "colorList": {
        const value = this.store.get(def.path);
        const f = new ColorListField({
          value: Array.isArray(value) ? value : [],
          onChange: (colors, { commit }) => {
            if (commit && colors) write(colors);
          }
        });
        return {
          el: f.render(),
          show: (v) => {
            const list = Array.isArray(v) ? v : [];
            if (!same(f.getValue(), list)) f.setValue(list);
          },
          dispose: () => f.dispose()
        };
      }
      default: {
        const out = el2("span", "twm-settings__readonly");
        return {
          el: out,
          show: (v) => {
            out.textContent = shownValue(v);
          }
        };
      }
    }
  }
};
function settingsViewContent(opts = {}) {
  return (hostEl, props = {}) => {
    const view = new SettingsView({ ...opts, category: props?.category ?? opts.category ?? null });
    view.mount(hostEl);
    return {
      title: opts.title ?? "Settings",
      view,
      destroy: () => view.dispose()
    };
  };
}

// src/ui/components/slider_field.js
var SliderField = class {
  #min = 0;
  #max = 100;
  #step = 1;
  #value = 0;
  #enabled = true;
  #hasDefault = false;
  #defaultValue = 0;
  constructor({ fieldId, field = {}, onChange = null, logger = null } = {}) {
    if (!fieldId) {
      throw new Error("SliderField requires a fieldId");
    }
    this.fieldId = fieldId;
    this.field = field;
    this.logger = logger;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.root = null;
    this.sliderInput = null;
    this.numberInput = null;
    this.readoutEl = null;
    this.resetButton = null;
    this.toggleInput = null;
    this.helperEl = null;
    this.emitOnInput = Boolean(field.emitOnInput ?? field.emitsOnInput);
    this._disposers = [];
    this.#min = this.#coerceNumber(field.min, 0);
    this.#max = Math.max(this.#min, this.#coerceNumber(field.max, 100));
    this.#step = this.#coercePositiveNumber(field.step, 1);
    this.#value = this.#fit(this.#coerceNumber(field.value, this.#min));
    this.#enabled = field.toggleable ? field.enabled !== false : true;
    this.#hasDefault = this.#isFiniteInput(field.defaultValue);
    if (this.#hasDefault) {
      this.#defaultValue = this.#fit(Number(field.defaultValue));
    }
  }
  render() {
    if (this.root) {
      return this.root;
    }
    this.root = document.createElement("div");
    this.root.className = "twm-slider-field";
    this.sliderInput = document.createElement("input");
    this.sliderInput.type = "range";
    this.sliderInput.className = "twm-slider-field__input";
    this.#writeRangeAttributes();
    const stopDrag = (evt) => {
      evt.stopPropagation();
      evt.stopImmediatePropagation();
    };
    this.#listen(this.sliderInput, "mousedown", stopDrag, { capture: true });
    this.#listen(this.sliderInput, "touchstart", stopDrag, { passive: false, capture: true });
    this.helperEl = document.createElement("div");
    this.helperEl.className = "twm-slider-field__helper";
    if (this.field.helperText) {
      this.helperEl.textContent = this.field.helperText;
    }
    const companions = this.field.toggleable || this.field.numberInput || this.field.readout || this.#hasDefault;
    if (companions) {
      const row = document.createElement("div");
      row.className = "twm-slider-field__row";
      if (this.field.toggleable) {
        row.appendChild(this.#buildToggle());
      }
      row.appendChild(this.sliderInput);
      if (this.field.readout) {
        this.readoutEl = document.createElement("span");
        this.readoutEl.className = "twm-slider-field__readout";
        row.appendChild(this.readoutEl);
      }
      if (this.field.numberInput) {
        row.appendChild(this.#buildNumberInput());
      }
      if (this.#hasDefault) {
        row.appendChild(this.#buildResetButton());
      }
      this.root.appendChild(row);
    } else {
      this.root.appendChild(this.sliderInput);
    }
    this.root.appendChild(this.helperEl);
    let rafToken = null;
    let pendingValue = null;
    const flushPending = () => {
      if (rafToken) {
        cancelAnimationFrame(rafToken);
        rafToken = null;
      }
      if (pendingValue === null) return;
      const valueToEmit = pendingValue;
      pendingValue = null;
      if (this.emitOnInput) {
        this.onChange?.(valueToEmit, { immediate: true });
      }
    };
    const handleInput = (event) => {
      this.#value = this.#fit(Number(event.target.value));
      this.#syncCompanions();
      pendingValue = event.target.value;
      if (!rafToken) {
        rafToken = requestAnimationFrame(() => {
          rafToken = null;
          flushPending();
        });
      }
    };
    const handleChange = (event) => {
      flushPending();
      this.#value = this.#fit(Number(event.target.value));
      this.#syncCompanions();
      this.onChange?.(event.target.value, { immediate: false });
    };
    this.#listen(this.sliderInput, "input", handleInput);
    this.#listen(this.sliderInput, "change", handleChange);
    this.#syncCompanions();
    return this.root;
  }
  /** What onChange would report now: the value as a string, or disabledValue while toggled off. */
  getValue() {
    return this.#enabled ? String(this.#value) : this.#disabledValue();
  }
  isEnabled() {
    return this.#enabled;
  }
  /** True when a defaultValue was given and the value differs from it. */
  isModified() {
    return this.#hasDefault && this.#value !== this.#defaultValue;
  }
  /**
   * Clamp to the range and snap to the step. Reports once, unless `silent` or
   * the reported value did not move. A non-finite value is refused (false).
   */
  setValue(value, { silent = false } = {}) {
    if (!this.#isFiniteInput(value)) {
      return false;
    }
    const numeric = Number(value);
    return this.#commit(() => {
      this.#value = this.#fit(numeric);
    }, silent);
  }
  setEnabled(enabled, { silent = false } = {}) {
    return this.#commit(() => {
      this.#enabled = Boolean(enabled);
    }, silent);
  }
  /** Change any of min/max/step; the value and the default are refitted into the new range. */
  setRange({ min, max, step } = {}, { silent = false } = {}) {
    return this.#commit(() => {
      this.#min = this.#isFiniteInput(min) ? Number(min) : this.#min;
      this.#max = Math.max(this.#min, this.#isFiniteInput(max) ? Number(max) : this.#max);
      this.#step = this.#coercePositiveNumber(step, this.#step);
      this.#value = this.#fit(this.#value);
      if (this.#hasDefault) {
        this.#defaultValue = this.#fit(this.#defaultValue);
      }
      if (this.sliderInput) {
        this.#writeRangeAttributes();
      }
    }, silent);
  }
  /** Restore defaultValue and report it, a commit like a drag release. */
  reset({ silent = false } = {}) {
    if (!this.#hasDefault) {
      return false;
    }
    return this.#commit(() => {
      this.#value = this.#defaultValue;
    }, silent);
  }
  dispose() {
    this._disposers.forEach((dispose) => {
      try {
        dispose?.();
      } catch (error) {
        this.logger?.warn?.("twm-slider-field", "Failed to dispose slider listener", { error });
      }
    });
    this._disposers = [];
    this.root = null;
    this.sliderInput = null;
    this.numberInput = null;
    this.readoutEl = null;
    this.resetButton = null;
    this.toggleInput = null;
    this.helperEl = null;
  }
  #buildToggle() {
    this.toggleInput = document.createElement("input");
    this.toggleInput.type = "checkbox";
    this.toggleInput.className = "twm-slider-field__toggle";
    this.toggleInput.setAttribute("aria-label", "Enabled");
    if (this.field.disabled) {
      this.toggleInput.disabled = true;
    }
    this.#listen(this.toggleInput, "change", () => this.setEnabled(this.toggleInput.checked));
    return this.toggleInput;
  }
  #buildNumberInput() {
    this.numberInput = document.createElement("input");
    this.numberInput.type = "text";
    this.numberInput.inputMode = "decimal";
    this.numberInput.className = "twm-slider-field__number";
    this.numberInput.setAttribute("aria-label", "Value");
    const commitTyped = () => {
      if (!this.setValue(this.numberInput.value.trim())) {
        this.#syncCompanions();
      }
    };
    this.#listen(this.numberInput, "keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTyped();
      } else if (event.key === "Escape") {
        this.#syncCompanions();
      }
    });
    this.#listen(this.numberInput, "change", commitTyped);
    return this.numberInput;
  }
  #buildResetButton() {
    this.resetButton = document.createElement("button");
    this.resetButton.type = "button";
    this.resetButton.className = "twm-slider-field__reset";
    this.resetButton.title = "Reset to default";
    this.resetButton.setAttribute("aria-label", "Reset to default");
    const icon2 = document.createElement("span");
    icon2.className = "material-symbols-outlined";
    icon2.textContent = "restart_alt";
    this.resetButton.appendChild(icon2);
    this.#listen(this.resetButton, "click", () => this.reset());
    return this.resetButton;
  }
  /** Apply a change, refresh the DOM, and report once if the reported value moved. */
  #commit(apply, silent) {
    const before = this.getValue();
    apply();
    this.#syncCompanions();
    const after = this.getValue();
    if (after === before) {
      return false;
    }
    if (!silent) {
      this.onChange?.(after, { immediate: false });
    }
    return true;
  }
  /** Write the model into every element: slider, box, readout, toggle, states. */
  #syncCompanions() {
    if (!this.root) return;
    const text = String(this.#value);
    if (this.sliderInput.value !== text) {
      this.sliderInput.value = text;
    }
    const off = !this.#enabled;
    const hardDisabled = Boolean(this.field.disabled);
    this.sliderInput.disabled = hardDisabled || off;
    if (this.numberInput) {
      this.numberInput.value = text;
      this.numberInput.disabled = hardDisabled || off;
    }
    if (this.readoutEl) {
      const format = typeof this.field.readout === "function" ? this.field.readout : null;
      this.readoutEl.textContent = format ? String(format(this.#value)) : text;
    }
    if (this.toggleInput) {
      this.toggleInput.checked = this.#enabled;
    }
    const modified = this.isModified();
    if (this.resetButton) {
      this.resetButton.disabled = hardDisabled || off || !modified;
    }
    this.root.classList.toggle("twm-slider-field--modified", modified);
    this.root.classList.toggle("twm-slider-field--off", off);
  }
  #writeRangeAttributes() {
    this.sliderInput.min = String(this.#min);
    this.sliderInput.max = String(this.#max);
    this.sliderInput.step = String(this.#step);
    this.sliderInput.value = String(this.#value);
  }
  /** Clamp to [min, max] and snap to the step grid anchored at min, as a range input does. */
  #fit(value) {
    const clamped = Math.min(this.#max, Math.max(this.#min, value));
    let snapped = this.#min + Math.round((clamped - this.#min) / this.#step) * this.#step;
    if (snapped > this.#max) snapped -= this.#step;
    const decimals = Math.max(this.#decimals(this.#step), this.#decimals(this.#min));
    return Number(snapped.toFixed(Math.min(decimals, 12)));
  }
  #decimals(value) {
    const text = String(value);
    if (text.includes("e-")) return Number(text.split("e-")[1]);
    const dot = text.indexOf(".");
    return dot === -1 ? 0 : text.length - dot - 1;
  }
  #isFiniteInput(value) {
    if (value === null || value === void 0 || typeof value === "boolean") {
      return false;
    }
    if (typeof value === "string" && value.trim() === "") {
      return false;
    }
    return Number.isFinite(Number(value));
  }
  #disabledValue() {
    return this.field.disabledValue === void 0 ? null : this.field.disabledValue;
  }
  #listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._disposers.push(() => target.removeEventListener(type, handler, options));
  }
  #coerceNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  #coercePositiveNumber(value, fallback) {
    const numeric = this.#coerceNumber(value, fallback);
    if (numeric <= 0) {
      return fallback;
    }
    return numeric;
  }
};

// src/ui/components/table_state_store.js
function createTableStateStore({ host, key, logger = console, debounceMs = 500 }) {
  if (!key) throw new Error("createTableStateStore requires { key }");
  const state = host?.state || null;
  let cache = null;
  let loadPromise = null;
  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!state || !cache) return;
      try {
        await state.write(key, cache);
      } catch (err) {
        logger.warn?.("[table-state] save failed", err);
      }
    }, debounceMs);
  };
  return {
    /** Resolve once the persisted blob has been read into the cache. Safe
     *  to call repeatedly — the read happens at most once per project. */
    ready() {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        if (!state) {
          cache = {};
          return cache;
        }
        try {
          cache = await state.read(key) || {};
        } catch (err) {
          logger.warn?.("[table-state] load failed", err);
          cache = {};
        }
        return cache;
      })();
      return loadPromise;
    },
    /** Synchronous read of a table's persisted state. Returns null until
     *  the cache is loaded (await `ready()` first to be sure). */
    get(k) {
      if (!k || !cache) return null;
      return cache[k] || null;
    },
    /** Merge-and-persist a table's state (debounced). Pass null to forget
     *  a key. Writes the whole map back atomically through the host. */
    set(k, s) {
      if (!k) return;
      if (!cache) cache = {};
      if (s == null) delete cache[k];
      else cache[k] = s;
      scheduleSave();
    },
    /** Drop the cache + pending read so the next access reloads from the
     *  newly-opened project. Cancels any in-flight save for the old one. */
    reset() {
      cache = null;
      loadPromise = null;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    }
  };
}

// src/ui/components/tag_input.js
var normalise = (list) => (Array.isArray(list) ? list : []).map((v) => v == null ? "" : String(v).trim()).filter((v) => v !== "");
function createTagInput(host, options = {}) {
  if (!host || typeof host.appendChild !== "function") {
    throw new Error("[TagInput] host must be an HTMLElement");
  }
  const readOnly = !!options.readOnly;
  const allowDuplicates = !!options.allowDuplicates;
  const removeLabel = typeof options.removeLabel === "function" ? options.removeLabel : (tag) => `Remove ${tag}`;
  let tags = normalise(options.value);
  let disposed = false;
  const root = document.createElement("div");
  root.className = ["twm-tag-input", readOnly ? "twm-tag-input--readonly" : "", options.className || ""].join(" ").replace(/\s+/g, " ").trim();
  root.setAttribute("role", "group");
  if (options.label) root.setAttribute("aria-label", options.label);
  const chips = document.createElement("ul");
  chips.className = "twm-tag-input__chips";
  root.appendChild(chips);
  let input = null;
  if (!readOnly) {
    input = document.createElement("input");
    input.type = "text";
    input.className = "twm-tag-input__input";
    input.spellcheck = false;
    input.autocomplete = "off";
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.label) input.setAttribute("aria-label", options.label);
    root.appendChild(input);
  }
  const changed = () => {
    if (typeof options.onChange === "function") options.onChange([...tags]);
  };
  const chipFor = (tag, idx) => {
    const chip = document.createElement("li");
    chip.className = "twm-tag-input__chip";
    const text = document.createElement("span");
    text.className = "twm-tag-input__text";
    text.textContent = tag;
    text.title = tag;
    chip.appendChild(text);
    if (!readOnly) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "twm-tag-input__remove";
      remove.setAttribute("aria-label", removeLabel(tag));
      remove.textContent = "\xD7";
      remove.addEventListener("mousedown", (ev) => ev.preventDefault());
      remove.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        removeAt(idx);
        input?.focus();
      });
      chip.appendChild(remove);
    }
    return chip;
  };
  const paint = () => {
    chips.replaceChildren(...tags.map(chipFor));
  };
  function removeAt(idx) {
    if (disposed || readOnly || idx < 0 || idx >= tags.length) return;
    tags = tags.filter((_, i) => i !== idx);
    paint();
    changed();
  }
  const commitText = (text) => {
    if (disposed || readOnly) return false;
    const next = [...tags];
    for (const piece of String(text).split(",")) {
      const tag = piece.trim();
      if (tag === "") continue;
      if (!allowDuplicates && next.includes(tag)) continue;
      next.push(tag);
    }
    if (next.length === tags.length) return false;
    const added = next.slice(tags.length).map((tag, i) => chipFor(tag, tags.length + i));
    tags = next;
    chips.append(...added);
    changed();
    return true;
  };
  const commitInput = () => {
    if (!input) return;
    const text = input.value;
    input.value = "";
    commitText(text);
  };
  if (input) {
    input.addEventListener("keydown", (ev) => {
      if (ev.isComposing) return;
      if (ev.key === "Enter" || ev.key === ",") {
        ev.preventDefault();
        commitInput();
      } else if (ev.key === "Backspace" && input.value === "" && tags.length) {
        ev.preventDefault();
        removeAt(tags.length - 1);
      }
    });
    input.addEventListener("input", () => {
      if (input.value.includes(",")) commitInput();
    });
    input.addEventListener("blur", commitInput);
    input.addEventListener("paste", (ev) => {
      const pasted = ev.clipboardData?.getData("text/plain") ?? "";
      if (!pasted.includes(",")) return;
      ev.preventDefault();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const text = input.value.slice(0, start) + pasted + input.value.slice(end);
      input.value = "";
      commitText(text);
    });
    root.addEventListener("mousedown", (ev) => {
      if (ev.target === root || ev.target === chips) {
        ev.preventDefault();
        input.focus();
      }
    });
  }
  paint();
  host.appendChild(root);
  return {
    element: root,
    input,
    getValue: () => [...tags],
    /** Replaces the list. Does not call `onChange`. */
    setValue(list) {
      if (disposed) return;
      tags = normalise(list);
      paint();
    },
    focus() {
      input?.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    }
  };
}

// src/ui/components/toast.js
var toastBus = null;
function setToastBus(bus) {
  const prev = toastBus;
  toastBus = bus && typeof bus.emit === "function" ? bus : null;
  return prev;
}
function getToastBus() {
  return toastBus;
}
function _emit(severity, persistent, titleOrMsg, msg) {
  const bus = toastBus;
  const title = msg !== void 0 ? titleOrMsg : null;
  const message = msg !== void 0 ? msg : titleOrMsg;
  if (!bus) {
    (severity === "error" || severity === "warn" ? console.warn : console.info)(
      `[toast/${severity}]`,
      title ? `${title}:` : "",
      message
    );
    return;
  }
  bus.emit("toast:show", {
    title,
    message,
    severity,
    persistent,
    durationMs: persistent ? 0 : 5e3
  });
}
function toastError(titleOrMsg, msg) {
  _emit("error", true, titleOrMsg, msg);
}
function toastWarn(titleOrMsg, msg) {
  _emit("warn", false, titleOrMsg, msg);
}
function toastInfo(titleOrMsg, msg) {
  _emit("info", false, titleOrMsg, msg);
}
function toastSuccess(titleOrMsg, msg) {
  _emit("success", false, titleOrMsg, msg);
}
function reportBridgeError(opName, resOrErr) {
  if (!resOrErr) return true;
  if (resOrErr instanceof Error) {
    toastError(opName, resOrErr.message || String(resOrErr));
    return false;
  }
  if (resOrErr && resOrErr.ok === false) {
    toastError(opName, resOrErr.error || "operation refused");
    return false;
  }
  return true;
}

// src/ui/components/tree_view.js
function setText2(root, selector, value) {
  const el3 = root.querySelector(selector);
  if (el3) el3.textContent = value == null ? "" : String(value);
}
function attrValue(value) {
  return String(value).replace(/["\\]/g, "\\$&").replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
}
function createTreeCategory(options) {
  const {
    id,
    label,
    icon: icon2 = "folder",
    iconClass = "",
    count = 0,
    expanded = false,
    readonly = false
  } = options;
  const node = document.createElement("div");
  node.className = "twm-collapsible-box twm-tree-category";
  node.dataset.categoryId = id;
  node.dataset.collapsibleId = `tree-category-${id}`;
  node.dataset.collapsibleDefault = expanded ? "expanded" : "collapsed";
  if (readonly) node.dataset.readonly = "true";
  node.innerHTML = `
        <div class="twm-collapsible-header" data-collapsible-header="true">
            <button class="twm-arrow-toggle" type="button">
                <span class="twm-collapsible-arrow material-symbols-outlined${expanded ? "" : " collapsed"}">expand_more</span>
            </button>
            <span class="twm-tree-category__icon ${iconClass}">
                <span class="material-symbols-outlined">${icon2}</span>
            </span>
            <span class="twm-tree-category__label"></span>
            <span class="twm-tree-category__count">(${count})</span>
        </div>
        <div class="twm-collapsible-content${expanded ? " visible" : ""}" data-collapsible-content="true"></div>
    `;
  setText2(node, ".twm-tree-category__label", label);
  return node;
}
function createTreeNode(options) {
  const {
    id,
    label,
    icon: icon2 = null,
    count = 0,
    expanded = false,
    readonly = false,
    actions = null
  } = options;
  const node = document.createElement("div");
  node.className = `twm-tree-node${readonly ? " readonly" : ""}`;
  node.dataset.nodeId = id;
  const iconHtml = icon2 ? `<span class="twm-tree-node__icon"><span class="material-symbols-outlined">${icon2}</span></span>` : "";
  const actionsHtml = actions ? '<span class="twm-tree-node__actions"></span>' : "";
  node.innerHTML = `
        <div class="twm-tree-node__header">
            <span class="twm-tree-node__toggle">
                <span class="material-symbols-outlined">${expanded ? "expand_more" : "chevron_right"}</span>
            </span>
            ${iconHtml}
            <span class="twm-tree-node__label"></span>
            <span class="twm-tree-node__count">(${count})</span>
            ${actionsHtml}
        </div>
        <div class="twm-tree-node__children" style="display: ${expanded ? "block" : "none"};"></div>
    `;
  setText2(node, ".twm-tree-node__label", label);
  if (actions) {
    const actionsEl = node.querySelector(".twm-tree-node__actions");
    Object.entries(actions).forEach(([actionId, actionConfig]) => {
      const btn = document.createElement("button");
      btn.className = "twm-tree-node__action-btn";
      btn.dataset.action = actionId;
      btn.title = actionConfig.title || actionId;
      btn.innerHTML = `<span class="material-symbols-outlined">${actionConfig.icon}</span>`;
      if (actionConfig.onClick) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          actionConfig.onClick(id, e);
        });
      }
      actionsEl.appendChild(btn);
    });
  }
  return node;
}
function createTreeItem(options) {
  const {
    id,
    label,
    icon: icon2 = null,
    isMaterialIcon = true,
    readonly = false,
    selected = false,
    subtitle = null,
    data = null,
    badge = null
  } = options;
  const item = document.createElement("div");
  item.className = `twm-tree-item${readonly ? " readonly" : ""}${selected ? " selected" : ""}`;
  item.dataset.itemId = id;
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      item.dataset[key] = value;
    });
  }
  const iconHtml = icon2 ? isMaterialIcon ? `<span class="twm-tree-item__icon"><span class="material-symbols-outlined">${icon2}</span></span>` : `<span class="twm-tree-item__icon twm-tree-item__icon--symbol">${icon2}</span>` : "";
  const subtitleHtml = subtitle ? '<span class="twm-tree-item__subtitle"></span>' : "";
  let badgeHtml = "";
  if (badge) {
    const variant = badge.variant || "muted";
    if (badge.text) {
      badgeHtml = `<span class="twm-tree-item__badge twm-tree-item__badge--${variant}"></span>`;
    } else {
      badgeHtml = `<span class="twm-tree-item__status-dot twm-tree-item__status-dot--${variant}"></span>`;
    }
  }
  item.innerHTML = `
        ${iconHtml}
        <span class="twm-tree-item__label"></span>
        ${subtitleHtml}
        ${badgeHtml}
    `;
  setText2(item, ".twm-tree-item__label", label);
  if (subtitle) setText2(item, ".twm-tree-item__subtitle", subtitle);
  if (badge?.text) setText2(item, ".twm-tree-item__badge", badge.text);
  return item;
}
function toggleCategory(categoryEl, force) {
  if (!categoryEl) return;
  const arrow = categoryEl.querySelector(":scope > .twm-collapsible-header .twm-collapsible-arrow");
  const content = categoryEl.querySelector(":scope > .twm-collapsible-content");
  if (!content) return;
  const isCurrentlyExpanded = content.classList.contains("visible");
  const shouldExpand = force !== void 0 ? force : !isCurrentlyExpanded;
  if (shouldExpand) {
    if (arrow) {
      arrow.classList.remove("collapsed");
    }
    content.classList.add("visible");
  } else {
    if (arrow) {
      arrow.classList.add("collapsed");
    }
    content.classList.remove("visible");
  }
}
function toggleNode(nodeEl, force) {
  if (!nodeEl) return;
  const toggle = nodeEl.querySelector(":scope > .twm-tree-node__header .twm-tree-node__toggle .material-symbols-outlined");
  const children = nodeEl.querySelector(":scope > .twm-tree-node__children");
  if (!children) return;
  const isExpanded = force !== void 0 ? force : children.style.display === "none";
  if (isExpanded) {
    children.style.display = "block";
    if (toggle) toggle.textContent = "expand_more";
  } else {
    children.style.display = "none";
    if (toggle) toggle.textContent = "chevron_right";
  }
}
function filterTree(container, filter, options = {}) {
  const { expandMatches = true } = options;
  const normalizedFilter = (filter || "").toLowerCase().trim();
  const visibleItems = /* @__PURE__ */ new Set();
  container.querySelectorAll(".twm-tree-item").forEach((item) => {
    const label = item.querySelector(".twm-tree-item__label")?.textContent || "";
    const matches = !normalizedFilter || label.toLowerCase().includes(normalizedFilter);
    item.style.display = matches ? "" : "none";
    item.classList.toggle("twm-filter-match", matches && !!normalizedFilter);
    if (matches) visibleItems.add(item);
  });
  const hasVisibleItem = (el3) => !normalizedFilter || [...el3.querySelectorAll(".twm-tree-item")].some((item) => visibleItems.has(item));
  container.querySelectorAll(".twm-tree-node").forEach((node) => {
    const visible = hasVisibleItem(node);
    node.style.display = visible ? "" : "none";
    if (expandMatches && visible && normalizedFilter) toggleNode(node, true);
  });
  container.querySelectorAll(".twm-tree-category").forEach((category) => {
    const visible = hasVisibleItem(category);
    category.style.display = visible ? "" : "none";
    if (expandMatches && visible && normalizedFilter) toggleCategory(category, true);
  });
}
function selectItem(container, itemId, options = {}) {
  const { scrollIntoView = true, expandParents = true } = options;
  container.querySelectorAll(".twm-tree-item.selected").forEach((el3) => {
    el3.classList.remove("selected");
  });
  const item = container.querySelector(`.twm-tree-item[data-item-id="${attrValue(itemId)}"]`);
  if (!item) return null;
  item.classList.add("selected");
  if (expandParents) {
    let parent = item.parentElement;
    while (parent && parent !== container) {
      if (parent.classList.contains("twm-tree-node__children")) {
        const node = parent.closest(".twm-tree-node");
        if (node) toggleNode(node, true);
      }
      if (parent.classList.contains("twm-collapsible-content")) {
        const category = parent.closest(".twm-tree-category");
        if (category) toggleCategory(category, true);
      }
      parent = parent.parentElement;
    }
  }
  if (scrollIntoView) {
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return item;
}
var TreeView = class {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onItemClick: null,
      onItemDoubleClick: null,
      onNodeToggle: null,
      onCategoryToggle: null,
      ...options
    };
    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleDblClick = this._handleDoubleClick.bind(this);
    if (container) {
      container.classList.add("twm-tree-view");
      container.addEventListener("click", this._boundHandleClick);
      container.addEventListener("dblclick", this._boundHandleDblClick);
    }
  }
  _handleClick(e) {
    const collapsibleHeader = e.target.closest(".twm-collapsible-header");
    if (collapsibleHeader) {
      const category = collapsibleHeader.closest(".twm-tree-category");
      if (category) {
        toggleCategory(category);
        this.options.onCategoryToggle?.(category.dataset.categoryId, category);
      }
      return;
    }
    const nodeHeader = e.target.closest(".twm-tree-node__header");
    if (nodeHeader) {
      const node = nodeHeader.closest(".twm-tree-node");
      if (node) {
        toggleNode(node);
        this.options.onNodeToggle?.(node.dataset.nodeId, node);
      }
      return;
    }
    const item = e.target.closest(".twm-tree-item");
    if (item) {
      this.select(item.dataset.itemId);
      this.options.onItemClick?.(item.dataset.itemId, item, e);
    }
  }
  _handleDoubleClick(e) {
    const item = e.target.closest(".twm-tree-item");
    if (item) {
      this.options.onItemDoubleClick?.(item.dataset.itemId, item, e);
    }
  }
  addCategory(options) {
    const category = createTreeCategory(options);
    this.container.appendChild(category);
    return category;
  }
  addNode(categoryId, options) {
    const category = this.container.querySelector(`.twm-tree-category[data-category-id="${attrValue(categoryId)}"]`);
    const content = category?.querySelector(".twm-collapsible-content");
    if (!content) return null;
    const node = createTreeNode(options);
    content.appendChild(node);
    return node;
  }
  addItem(nodeId, options) {
    const node = this.container.querySelector(`.twm-tree-node[data-node-id="${attrValue(nodeId)}"]`);
    const children = node?.querySelector(".twm-tree-node__children");
    if (!children) return null;
    const item = createTreeItem(options);
    children.appendChild(item);
    return item;
  }
  select(itemId) {
    return selectItem(this.container, itemId);
  }
  filter(text) {
    filterTree(this.container, text);
  }
  clear() {
    this.container.innerHTML = "";
  }
  dispose() {
    if (this.container) {
      this.container.removeEventListener("click", this._boundHandleClick);
      this.container.removeEventListener("dblclick", this._boundHandleDblClick);
    }
  }
};

// src/ui/components/window_taskbar.js
var WindowTaskbarManager = class {
  constructor() {
    this._minimizedWindows = /* @__PURE__ */ new Map();
    this._containerEl = null;
    this._leftDivider = null;
    this._rightDivider = null;
    this._initialized = false;
  }
  /**
   * Initialize the taskbar. Call once after DOM is ready.
   */
  init() {
    if (this._initialized) return;
    const bottomBar = document.querySelector(".twm-global-bottom-bar");
    if (!bottomBar) {
      console.warn("[WindowTaskbar] twm-global-bottom-bar not found");
      return;
    }
    this._leftDivider = document.createElement("div");
    this._leftDivider.className = "twm-bar-windows__divider twm-bar-windows__divider--left";
    this._containerEl = document.createElement("div");
    this._containerEl.className = "twm-bar-windows";
    this._rightDivider = document.createElement("div");
    this._rightDivider.className = "twm-bar-windows__divider twm-bar-windows__divider--right";
    const barCenter = bottomBar.querySelector(".twm-bar-center");
    if (barCenter) {
      bottomBar.insertBefore(this._rightDivider, barCenter);
      bottomBar.insertBefore(this._containerEl, this._rightDivider);
      bottomBar.insertBefore(this._leftDivider, this._containerEl);
    } else {
      bottomBar.appendChild(this._leftDivider);
      bottomBar.appendChild(this._containerEl);
      bottomBar.appendChild(this._rightDivider);
    }
    window.addEventListener("managed-window-minimized", (e) => this._onWindowMinimized(e));
    window.addEventListener("managed-window-restored", (e) => this._onWindowRestored(e));
    window.addEventListener("managed-window-closed", (e) => this._onWindowClosed(e));
    this._initialized = true;
    this._updateDividers();
  }
  /**
   * Handle window minimized event.
   */
  _onWindowMinimized(e) {
    const { id, title, icon: icon2 } = e.detail;
    this._minimizedWindows.set(id, { title, icon: icon2 });
    this._render();
  }
  /**
   * Handle window restored event.
   */
  _onWindowRestored(e) {
    const { id } = e.detail;
    this._minimizedWindows.delete(id);
    this._render();
  }
  /**
   * Handle window closed event.
   */
  _onWindowClosed(e) {
    const { id } = e.detail;
    this._minimizedWindows.delete(id);
    this._render();
  }
  /**
   * Update divider visibility based on window count.
   */
  _updateDividers() {
    const hasWindows = this._minimizedWindows.size > 0;
    if (this._leftDivider) {
      this._leftDivider.style.display = hasWindows ? "" : "none";
    }
    if (this._rightDivider) {
      this._rightDivider.style.display = hasWindows ? "" : "none";
    }
  }
  /**
   * Render the taskbar buttons.
   */
  _render() {
    if (!this._containerEl) return;
    this._containerEl.innerHTML = "";
    for (const [id, { title, icon: icon2 }] of this._minimizedWindows) {
      const btn = document.createElement("button");
      btn.className = "twm-bar-windows__item";
      btn.setAttribute("data-window-id", id);
      btn.title = `Restore: ${title}`;
      if (icon2) {
        const iconEl = document.createElement("span");
        iconEl.className = "twm-bar-windows__item-icon material-symbols-outlined";
        iconEl.textContent = icon2;
        btn.appendChild(iconEl);
      }
      const titleEl = document.createElement("span");
      titleEl.className = "twm-bar-windows__item-title";
      titleEl.textContent = title;
      btn.appendChild(titleEl);
      btn.addEventListener("click", () => {
        ManagedWindow.restore(id);
      });
      this._containerEl.appendChild(btn);
    }
    this._updateDividers();
  }
};
var WindowTaskbar = new WindowTaskbarManager();

// src/ui/components/wizard.js
var DEFAULT_LABELS = Object.freeze({
  back: "Back",
  next: "Next",
  finish: "Finish",
  cancel: "Cancel"
});
var OPEN = "step";
var FINISHING = "finishing";
var FINISHED = "finished";
var CANCELLED = "cancelled";
var STEP_STATES2 = Object.freeze(["error"]);
var isFinal = (state) => state === FINISHED || state === CANCELLED;
function runCleanup(cleanup) {
  if (typeof cleanup === "function") cleanup();
}
function messageOf(err) {
  if (err && typeof err.message === "string" && err.message) return err.message;
  return err == null ? "Failed" : String(err);
}
var Wizard = class extends ComponentBase {
  /** @type {Array<object>} */
  #steps;
  /** @type {object} */
  #labels;
  /** @type {Function|null} */
  #onFinish;
  /** @type {Function|null} */
  #onCancel;
  /** @type {object} */
  #ctx;
  /** @type {StateMachine} */
  #machine;
  /** @type {number} */
  #index = 0;
  /** @type {Map<string,{state:string,message:string}>} */
  #overrides = /* @__PURE__ */ new Map();
  /** @type {*} */
  #cleanup = null;
  /** @type {Promise} */
  #queue = Promise.resolve();
  /** @type {ManagedWindow|null} */
  #window = null;
  /** @type {boolean} */
  #disposed = false;
  /** @type {HTMLElement|null} */
  #root = null;
  /** @type {HTMLElement[]} */
  #stepItems = [];
  /** @type {HTMLButtonElement[]} */
  #stepButtons = [];
  /** @type {HTMLElement[]} */
  #connectors = [];
  /** @type {HTMLElement|null} */
  #body = null;
  /** @type {HTMLElement|null} */
  #message = null;
  /** @type {HTMLButtonElement|null} */
  #cancelBtn = null;
  /** @type {HTMLButtonElement|null} */
  #backBtn = null;
  /** @type {HTMLButtonElement|null} */
  #nextBtn = null;
  /**
   * @param {object}   opts
   * @param {Array<{id:string,label:string,icon?:string,
   *                 render:(bodyEl:HTMLElement, ctx:object)=>(Function|void),
   *                 canAdvance?:(ctx:object)=>{ok:boolean,hint?:string}}>} opts.steps
   * @param {object}   [opts.data={}]   Your state; every hook reads it as `ctx.data`.
   * @param {Function} [opts.onFinish]  `(ctx) => void|Promise`. A rejection marks the
   *                                    current step as error with the rejection's message.
   * @param {Function} [opts.onCancel]  `(ctx) => void`, called once when the wizard is cancelled.
   * @param {object}   [opts.labels]    `{back, next, finish, cancel}` button labels.
   * @param {object}   [opts.eventBus]  Passed to the StateMachine (its `fsm:*` events).
   * @param {object}   [opts.logger]    Passed to the StateMachine.
   */
  constructor({
    steps,
    data = {},
    onFinish = null,
    onCancel = null,
    labels = {},
    eventBus = null,
    logger = null
  } = {}) {
    super({ eventBus, logger });
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error("Wizard requires at least one step");
    }
    const ids = /* @__PURE__ */ new Set();
    for (const step of steps) {
      if (!step || typeof step.id !== "string" || !step.id) {
        throw new Error("Wizard: every step needs a non-empty string id");
      }
      if (ids.has(step.id)) throw new Error(`Wizard: duplicate step id "${step.id}"`);
      if (typeof step.render !== "function") {
        throw new Error(`Wizard: step "${step.id}" needs a render(bodyEl, ctx) function`);
      }
      ids.add(step.id);
    }
    this.#steps = steps.slice();
    this.#labels = { ...DEFAULT_LABELS, ...labels };
    this.#onFinish = onFinish;
    this.#onCancel = onCancel;
    const wizard = this;
    this.#ctx = Object.freeze({
      data,
      get step() {
        return wizard.currentStep;
      },
      get index() {
        return wizard.currentIndex;
      },
      revalidate: () => this.revalidate(),
      next: () => this.next(),
      back: () => this.back(),
      goTo: (target) => this.goTo(target),
      setStepState: (id, state, message) => this.setStepState(id, state, message)
    });
    this.#machine = new StateMachine({
      name: "wizard",
      initialState: OPEN,
      eventBus,
      logger,
      states: {
        [OPEN]: {
          transitions: {
            move: {
              target: OPEN,
              guard: ({ payload }) => this.#canMoveTo(payload.to),
              action: ({ payload }) => this.#enterStep(payload.to)
            },
            finish: {
              target: FINISHING,
              guard: () => this.#isLast() && this.#gate().ok,
              action: () => {
                this.#overrides.delete(this.currentStep);
              }
            },
            cancel: { target: CANCELLED }
          }
        },
        [FINISHING]: {
          transitions: {
            resolve: { target: FINISHED },
            reject: {
              target: OPEN,
              action: ({ payload }) => {
                this.#overrides.set(
                  this.currentStep,
                  { state: "error", message: messageOf(payload.error) }
                );
              }
            }
          }
        },
        [FINISHED]: { onEnter: () => this.#close() },
        [CANCELLED]: {
          onEnter: () => {
            this.#close();
            this.#onCancel?.(this.#ctx);
          }
        }
      }
    });
  }
  // ─── Lifecycle ──────────────────────────────────────────────────────────
  /**
   * Mount inline into `container` and render the first step.
   * @param {HTMLElement} container
   * @returns {Wizard}
   */
  mount(container) {
    if (this._mounted) return this;
    this.#build();
    container.appendChild(this.#root);
    this._mounted = true;
    this.#renderBody();
    this.#paint();
    return this;
  }
  /**
   * Mount in a ManagedWindow and show it. The window's close button and
   * Escape cancel the wizard (and are refused while a finish is running);
   * finishing or cancelling closes the window.
   * @param {object} [opts]  ManagedWindow options: id, title, icon, defaultWidth,
   *                         defaultHeight, minWidth, minHeight, container, modal (default true).
   * @returns {ManagedWindow}
   */
  openInWindow({
    id = "twm-wizard",
    title = "Wizard",
    icon: icon2,
    defaultWidth = 720,
    defaultHeight = 520,
    minWidth = 420,
    minHeight = 320,
    container,
    modal = true
  } = {}) {
    if (this._mounted) throw new Error("Wizard is already mounted");
    this.#build();
    this._mounted = true;
    this.#window = new ManagedWindow({
      id,
      title,
      icon: icon2,
      defaultWidth,
      defaultHeight,
      minWidth,
      minHeight,
      container,
      modal,
      content: this.#root,
      canMinimize: false,
      beforeClose: () => {
        if (isFinal(this.state)) return true;
        void this.cancel();
        return false;
      }
    });
    this.#window.show();
    this.#renderBody();
    this.#paint();
    return this.#window;
  }
  /** Tear down (and close the window, if any) without calling any callback.
   *  Every later move, finish or cancel is refused. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    const win = this.#window;
    this.#teardown();
    win?.close({ force: true });
    super.dispose();
  }
  // ─── Public API ─────────────────────────────────────────────────────────
  /** The wizard's root element (null before mount). */
  get element() {
    return this.#root;
  }
  /** The body slot the current step renders into. */
  get bodyElement() {
    return this.#body;
  }
  /** The ManagedWindow, when opened with `openInWindow`. */
  get window() {
    return this.#window;
  }
  /** The object every hook receives: `{data, step, index, revalidate, next, back, goTo, setStepState}`. */
  get context() {
    return this.#ctx;
  }
  /** The current step's id. */
  get currentStep() {
    return this.#steps[this.#index].id;
  }
  /** The current step's index. */
  get currentIndex() {
    return this.#index;
  }
  /** 'step' | 'finishing' | 'finished' | 'cancelled' (null for a moment after construction). */
  get state() {
    return this.#machine.getState();
  }
  /** True while an async finish is running. */
  get busy() {
    return this.state === FINISHING;
  }
  /**
   * Ask the current step's `canAdvance` again and redraw the indicator and
   * the footer. The body is NOT re-rendered.
   */
  revalidate() {
    this.#paint();
  }
  /** Forward one step, if the current step's gate allows it. Resolves true when it moved. */
  next() {
    return this.#move(() => this.#index + 1);
  }
  /** Back one step. Resolves true when it moved. */
  back() {
    return this.#move(() => this.#index - 1);
  }
  /**
   * Move to a step by id or index: any step before the current one, or the
   * next one through the gate. Resolves true when it moved.
   * @param {string|number} target
   */
  goTo(target) {
    return this.#move(() => this.#resolveIndex(target));
  }
  /**
   * Mark a step as errored (`'error'`, with a message shown while it is the
   * current step), or clear the mark (`null`).
   * @param {string} id
   * @param {'error'|null} state
   * @param {string} [message]
   */
  setStepState(id, state, message = "") {
    const i = this.#resolveIndex(id);
    if (i < 0 || i >= this.#steps.length) throw new Error(`Wizard: no step "${id}"`);
    const key = this.#steps[i].id;
    if (state == null) this.#overrides.delete(key);
    else if (STEP_STATES2.includes(state)) this.#overrides.set(key, { state, message: String(message ?? "") });
    else throw new Error(`Wizard: unknown step state "${state}" (expected 'error' or null)`);
    this.#paint();
  }
  /**
   * Run `onFinish` from the last step, if its gate allows. The buttons are
   * disabled until it settles; resolved, the wizard closes; rejected, the
   * step is marked as error with the message. Resolves true when it finished.
   */
  finish() {
    return this.#enqueue(async () => {
      if (this.state !== OPEN) return false;
      const { transitioned } = await this.#machine.transition("finish");
      if (!transitioned) return false;
      this.#paint();
      try {
        await this.#onFinish?.(this.#ctx);
      } catch (error) {
        await this.#machine.transition("reject", { error });
        this.#paint();
        return false;
      }
      await this.#machine.transition("resolve");
      return true;
    });
  }
  /**
   * Close the wizard and call `onCancel` — once. Refused while a finish is
   * running. Resolves true when it cancelled.
   */
  cancel() {
    return this.#enqueue(async () => {
      if (this.state !== OPEN) return false;
      const { transitioned } = await this.#machine.transition("cancel");
      return transitioned;
    });
  }
  // ─── Moves ──────────────────────────────────────────────────────────────
  /** Moves run one at a time, so a double click cannot start a transition
   *  inside another. The target is computed when the move runs, not when it
   *  was asked for. A request made while a finish is running (or after the
   *  wizard closed) is refused there and then — it is not queued behind the
   *  finish to run once it settles. */
  #enqueue(fn) {
    if (this.#disposed || this.busy || isFinal(this.state)) return Promise.resolve(false);
    const run = this.#queue.then(() => this.#disposed ? false : fn());
    this.#queue = run.catch(() => {
    });
    return run;
  }
  #move(targetOf) {
    return this.#enqueue(async () => {
      if (this.state !== OPEN) return false;
      const to = targetOf();
      if (!this.#canMoveTo(to)) return false;
      const { transitioned } = await this.#machine.transition("move", { to });
      this.#paint();
      return transitioned;
    });
  }
  #canMoveTo(to) {
    if (!Number.isInteger(to) || to < 0 || to >= this.#steps.length) return false;
    if (to < this.#index) return true;
    return to === this.#index + 1 && this.#gate().ok;
  }
  #enterStep(to) {
    this.#index = to;
    this.#renderBody();
  }
  #resolveIndex(target) {
    if (typeof target === "number") return Number.isInteger(target) ? target : -1;
    return this.#steps.findIndex((s) => s.id === target);
  }
  #isLast() {
    return this.#index === this.#steps.length - 1;
  }
  /** The current step's gate, normalised to `{ok, hint}`. */
  #gate() {
    const step = this.#steps[this.#index];
    if (typeof step.canAdvance !== "function") return { ok: true, hint: "" };
    const r = step.canAdvance(this.#ctx) ?? {};
    return { ok: r.ok === true, hint: typeof r.hint === "string" ? r.hint : "" };
  }
  // ─── DOM ────────────────────────────────────────────────────────────────
  #build() {
    const root = document.createElement("div");
    root.className = "twm-wizard";
    const steps = document.createElement("ol");
    steps.className = "twm-wizard__steps";
    this.#steps.forEach((step, i) => {
      if (i > 0) {
        const connector = document.createElement("li");
        connector.className = "twm-wizard__connector";
        connector.setAttribute("role", "presentation");
        connector.setAttribute("aria-hidden", "true");
        steps.appendChild(connector);
        this.#connectors.push(connector);
      }
      const item = document.createElement("li");
      item.className = "twm-wizard__step";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "twm-wizard__step-btn";
      const marker = document.createElement("span");
      marker.className = "twm-wizard__step-marker";
      const label = document.createElement("span");
      label.className = "twm-wizard__step-label";
      label.textContent = step.label ?? step.id;
      btn.append(marker, label);
      btn.addEventListener("click", () => this.#onStepClick(i));
      item.appendChild(btn);
      steps.appendChild(item);
      this.#stepItems.push(item);
      this.#stepButtons.push(btn);
    });
    this.#body = document.createElement("div");
    this.#body.className = "twm-wizard__body";
    const footer = document.createElement("div");
    footer.className = "twm-wizard__footer";
    this.#message = document.createElement("div");
    this.#message.className = "twm-wizard__message";
    this.#message.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "twm-wizard__actions";
    this.#cancelBtn = this.#button("twm-wizard__cancel", this.#labels.cancel, () => {
      void this.cancel();
    });
    this.#backBtn = this.#button("twm-wizard__back", this.#labels.back, () => {
      void this.back();
    });
    this.#nextBtn = this.#button("twm-wizard__next twm-btn--primary", this.#labels.next, () => {
      void (this.#isLast() ? this.finish() : this.next());
    });
    actions.append(this.#cancelBtn, this.#backBtn, this.#nextBtn);
    footer.append(this.#message, actions);
    root.append(steps, this.#body, footer);
    this.#root = root;
  }
  #button(cls, text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `twm-btn ${cls}`;
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }
  #onStepClick(i) {
    if (i < this.#index) void this.goTo(i);
  }
  #renderBody() {
    runCleanup(this.#cleanup);
    this.#cleanup = null;
    this.#body.replaceChildren();
    const step = this.#steps[this.#index];
    this.#cleanup = step.render(this.#body, this.#ctx) ?? null;
  }
  /** The visual state of step `i`: an override, else its position. */
  #stepState(i) {
    const override = this.#overrides.get(this.#steps[i].id);
    if (override) return override.state;
    if (i < this.#index) return "done";
    return i === this.#index ? "current" : "upcoming";
  }
  #paint() {
    if (!this.#root) return;
    const busy = this.busy;
    this.#root.classList.toggle("twm-wizard--busy", busy);
    this.#root.setAttribute("aria-busy", busy ? "true" : "false");
    this.#steps.forEach((step, i) => {
      const state = this.#stepState(i);
      const item = this.#stepItems[i];
      for (const s of ["done", "current", "upcoming", "error"]) {
        item.classList.toggle(`twm-wizard__step--${s}`, s === state);
      }
      item.classList.toggle("twm-wizard__step--active", i === this.#index);
      const btn = this.#stepButtons[i];
      btn.disabled = busy || i >= this.#index;
      if (i === this.#index) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
      const override = this.#overrides.get(step.id);
      btn.title = override?.message || step.label || step.id;
      const marker = btn.firstChild;
      const glyph = state === "done" ? "check" : state === "error" ? "error" : step.icon || "";
      marker.classList.toggle("material-symbols-outlined", Boolean(glyph));
      marker.textContent = glyph || String(i + 1);
      if (i > 0) {
        this.#connectors[i - 1].classList.toggle("twm-wizard__connector--done", i <= this.#index);
      }
    });
    const gate = this.#gate();
    const last = this.#isLast();
    this.#nextBtn.textContent = last ? this.#labels.finish : this.#labels.next;
    this.#nextBtn.disabled = busy || !gate.ok;
    this.#nextBtn.title = gate.ok ? "" : gate.hint;
    this.#backBtn.disabled = busy || this.#index === 0;
    this.#cancelBtn.disabled = busy;
    const error = this.#overrides.get(this.currentStep);
    const text = error ? error.message : gate.ok ? "" : gate.hint;
    this.#message.textContent = text;
    this.#message.classList.toggle("twm-wizard__message--error", Boolean(error));
    this.#message.classList.toggle("twm-wizard__message--hint", !error && Boolean(text));
    if (error) this.#message.setAttribute("role", "alert");
    else this.#message.removeAttribute("role");
  }
  #close() {
    const win = this.#window;
    this.#teardown();
    this._mounted = false;
    win?.close({ force: true });
  }
  #teardown() {
    runCleanup(this.#cleanup);
    this.#cleanup = null;
    this.#root?.remove();
    this.#root = null;
    this.#body = null;
    this.#message = null;
    this.#stepItems = [];
    this.#stepButtons = [];
    this.#connectors = [];
    this.#cancelBtn = this.#backBtn = this.#nextBtn = null;
  }
};

// src/ui/controllers/window_chrome_controller.js
var SUPPORTS_POINTER = typeof window !== "undefined" && "onpointerdown" in window;
var MIN_WIDTH = 500;
var MIN_HEIGHT = 350;
var DRAG_THRESHOLD = 4;
var WindowChromeController = class {
  constructor({ eventBus, logger, host, topBar = ".twm-global-top-bar", controls = null, noDrag = "" } = {}) {
    this.eventBus = eventBus;
    this.logger = logger || console;
    this._topBarOpt = topBar;
    this._controlsOpt = controls;
    this._noDrag = noDrag;
    this._createdControls = null;
    this.win = host?.window || null;
    this.resizingActive = false;
    this.lastDblClickTs = 0;
    this.handles = {};
    this.topBar = null;
    this._disposed = false;
    this._disposers = [];
  }
  /**
   * Initialize the window chrome controller
   */
  async initialize() {
    if (this._disposed) return false;
    let chrome = "native";
    try {
      chrome = this.win ? await this.win.chrome() : "native";
    } catch (_) {
      chrome = "native";
    }
    if (this._disposed) return false;
    if (chrome !== "custom") {
      this.logger.info?.("[WindowChrome] Native/browser chrome detected \u2014 custom window chrome disabled");
      return false;
    }
    document.body.classList.add("twm-custom-chrome");
    this.#createWindowControls();
    this.#wireWindowButtons();
    this.#createResizeHandles();
    this.#wireTopBarDrag();
    this.#wireKeyboardShortcuts();
    this.#wireNativeStateSync();
    this.#initializeState();
    this.logger.info?.("[WindowChrome] Initialized");
    return true;
  }
  /** An element from a selector or an element; null when there is none. */
  #resolve(target, within = document) {
    if (!target) return null;
    if (typeof target !== "string") return target;
    return within.querySelector(target);
  }
  /**
   * Draw minimise, maximise/restore and close, unless the page has its own
   * `#win-*` buttons (an embedder's own markup), which are then wired instead.
   */
  #createWindowControls() {
    if (document.getElementById("win-minimize") || document.getElementById("win-close")) return;
    const bar = this.#resolve(this._topBarOpt);
    const host = this.#resolve(this._controlsOpt) || bar?.querySelector(".twm-bar-right") || bar;
    if (!host) return;
    const box = document.createElement("div");
    box.className = "twm-window-controls";
    const button = (id, icon2, label, extra = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = `twm-window-controls__btn${extra}`;
      b.setAttribute("aria-label", label);
      b.title = label;
      const i = document.createElement("span");
      i.className = "material-symbols-outlined";
      i.textContent = icon2;
      b.appendChild(i);
      box.appendChild(b);
    };
    button("win-minimize", "remove", "Minimize");
    button("win-maximize", "check_box_outline_blank", "Maximize");
    button("win-close", "close", "Close", " twm-window-controls__btn--close");
    host.appendChild(box);
    this._createdControls = box;
  }
  /**
   * Wire minimize, maximize, close buttons
   */
  #wireWindowButtons() {
    const minBtn = document.getElementById("win-minimize");
    const maxBtn = document.getElementById("win-maximize");
    const closeBtn = document.getElementById("win-close");
    if (minBtn) {
      const handler = () => this.win.minimize();
      minBtn.addEventListener("click", handler);
      this._disposers.push(() => minBtn.removeEventListener("click", handler));
    }
    if (maxBtn) {
      const handler = async () => {
        try {
          const isMax = await this.win.setMaximized(!await this.win.isMaximized());
          this.#updateMaximizeIcon(isMax);
          this.#setResizeHandlesEnabled(!isMax);
        } catch (e) {
          this.logger.warn?.("[WindowChrome] Maximize toggle failed", e);
        }
      };
      maxBtn.addEventListener("click", handler);
      this._disposers.push(() => maxBtn.removeEventListener("click", handler));
    }
    if (closeBtn) {
      const handler = () => this.win.close();
      closeBtn.addEventListener("click", handler);
      this._disposers.push(() => closeBtn.removeEventListener("click", handler));
    }
  }
  /**
   * Update maximize button icon and body class
   */
  #updateMaximizeIcon(isMax) {
    const maxBtn = document.getElementById("win-maximize");
    if (!maxBtn) return;
    const icon2 = maxBtn.querySelector(".material-symbols-outlined");
    if (icon2) {
      icon2.textContent = isMax ? "filter_none" : "check_box_outline_blank";
    }
    const tooltipText = isMax ? "Restore" : "Maximize";
    window.LatexTooltip?.set(maxBtn, tooltipText);
    maxBtn.setAttribute("aria-label", tooltipText);
    maxBtn.title = tooltipText;
    document.body.classList.toggle("twm-window-maximized", isMax);
  }
  /**
   * Enable/disable resize handles
   */
  #setResizeHandlesEnabled(enabled) {
    Object.values(this.handles).forEach((handle) => {
      if (handle) {
        handle.style.pointerEvents = enabled ? "auto" : "none";
      }
    });
  }
  /**
   * Set fullscreen body class
   */
  #setFullscreenClass(isFs) {
    document.body.classList.toggle("window-fullscreen", isFs);
  }
  /**
   * Create all resize handles
   */
  #createResizeHandles() {
    const positions = ["right", "left", "top", "bottom"];
    const corners = ["br", "bl", "tr", "tl"];
    positions.forEach((pos) => {
      const handle = document.createElement("div");
      handle.className = `twm-resize-handle ${pos}`;
      document.body.appendChild(handle);
      this.handles[pos] = handle;
      this.#setupResize(handle, pos);
    });
    corners.forEach((corner) => {
      const handle = document.createElement("div");
      handle.className = `twm-resize-handle corner ${corner}`;
      document.body.appendChild(handle);
      const mode = "corner" + corner.toUpperCase();
      this.handles[mode] = handle;
      this.#setupResize(handle, mode);
    });
  }
  /**
   * Setup resize behavior for a handle
   */
  #setupResize(handle, mode) {
    let startX = 0, startY = 0, startScreenX = 0, startScreenY = 0;
    let startW = 0, startH = 0, startLeft = 0, startTop = 0;
    let pending = null;
    let rafScheduled = false;
    let lastSent = null;
    const boundsEqual = (a, b) => {
      return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    };
    const sendBounds = () => {
      rafScheduled = false;
      if (!pending) return;
      if (lastSent && boundsEqual(lastSent, pending)) return;
      this.win.setBounds({ x: pending.x, y: pending.y, width: pending.w, height: pending.h });
      lastSent = pending;
    };
    const scheduleSend = () => {
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(sendBounds);
      }
    };
    let activePointerId = null;
    const EDGE = {
      right: "e",
      left: "w",
      top: "n",
      bottom: "s",
      cornerBR: "se",
      cornerBL: "sw",
      cornerTR: "ne",
      cornerTL: "nw"
    };
    const startDrag = async (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      if (this.win.startNativeResize) {
        this.resizingActive = true;
        let handled = false;
        try {
          handled = await this.win.startNativeResize(EDGE[mode]);
        } catch (_) {
          handled = false;
        }
        this.resizingActive = false;
        if (handled) return;
      }
      this.resizingActive = true;
      startX = e.clientX;
      startY = e.clientY;
      startScreenX = e.screenX ?? startX;
      startScreenY = e.screenY ?? startY;
      try {
        const res = await this.win.getBounds();
        if (res) {
          startLeft = typeof res.x === "number" ? res.x : 0;
          startTop = typeof res.y === "number" ? res.y : 0;
          startW = res.width || document.documentElement.clientWidth;
          startH = res.height || document.documentElement.clientHeight;
        } else {
          startLeft = 0;
          startTop = 0;
          startW = document.documentElement.clientWidth;
          startH = document.documentElement.clientHeight;
        }
      } catch (e2) {
        startLeft = 0;
        startTop = 0;
        startW = document.documentElement.clientWidth;
        startH = document.documentElement.clientHeight;
      }
      startLeft = Math.round(startLeft);
      startTop = Math.round(startTop);
      startW = Math.round(startW);
      startH = Math.round(startH);
      pending = null;
      lastSent = null;
      rafScheduled = false;
      if (SUPPORTS_POINTER && e.pointerId != null && handle.setPointerCapture) {
        try {
          handle.setPointerCapture(e.pointerId);
          activePointerId = e.pointerId;
        } catch (_) {
        }
      }
      if (SUPPORTS_POINTER) {
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", endDrag, { once: true });
      } else {
        window.addEventListener("mousemove", onMove, { passive: false });
        window.addEventListener("mouseup", endDrag, { once: true });
      }
    };
    const onMove = (e) => {
      const sx = e.screenX ?? e.clientX ?? 0;
      const sy = e.screenY ?? e.clientY ?? 0;
      const dx = sx - startScreenX;
      const dy = sy - startScreenY;
      let newX = startLeft;
      let newY = startTop;
      let newW = startW;
      let newH = startH;
      const isLeft = mode === "left" || mode === "cornerBL" || mode === "cornerTL";
      const isRight = mode === "right" || mode === "cornerBR" || mode === "cornerTR";
      const isTop = mode === "top" || mode === "cornerTR" || mode === "cornerTL";
      const isBottom = mode === "bottom" || mode === "cornerBR" || mode === "cornerBL";
      if (isLeft) {
        const candidateWidth = startW - dx;
        newW = Math.max(MIN_WIDTH, candidateWidth);
        const shift = startW - newW;
        newX = startLeft + shift;
      } else if (isRight) {
        newW = Math.max(MIN_WIDTH, startW + dx);
      }
      if (isTop) {
        const candidateHeight = startH - dy;
        newH = Math.max(MIN_HEIGHT, candidateHeight);
        const shiftY = startH - newH;
        newY = startTop + shiftY;
      } else if (isBottom) {
        newH = Math.max(MIN_HEIGHT, startH + dy);
      }
      newX = Math.round(newX);
      newY = Math.round(newY);
      newW = Math.max(MIN_WIDTH, Math.round(newW));
      newH = Math.max(MIN_HEIGHT, Math.round(newH));
      pending = { x: newX, y: newY, w: newW, h: newH };
      scheduleSend();
    };
    const endDrag = () => {
      if (SUPPORTS_POINTER) {
        window.removeEventListener("pointermove", onMove);
      } else {
        window.removeEventListener("mousemove", onMove);
      }
      if (activePointerId != null && handle.releasePointerCapture) {
        try {
          handle.releasePointerCapture(activePointerId);
        } catch (_) {
        }
        activePointerId = null;
      }
      if (pending && (!lastSent || !boundsEqual(lastSent, pending))) {
        this.win.setBounds({ x: pending.x, y: pending.y, width: pending.w, height: pending.h });
      }
      pending = null;
      lastSent = null;
      this.resizingActive = false;
    };
    const event = SUPPORTS_POINTER ? "pointerdown" : "mousedown";
    handle.addEventListener(event, startDrag);
    this._disposers.push(() => handle.removeEventListener(event, startDrag));
  }
  /**
   * Setup top bar dragging for window movement
   */
  #wireTopBarDrag() {
    this.topBar = this.#resolve(this._topBarOpt);
    if (!this.topBar) return;
    const NO_DRAG_SELECTOR = [
      ".no-drag",
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "label",
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[contenteditable="true"]',
      ".twm-window-controls",
      ".window-controls",
      ".panel-toggles",
      this._noDrag
    ].filter(Boolean).join(", ");
    let dragging = false;
    let startSX = 0, startSY = 0, startX = null, startY = null, winW = 0, winH = 0;
    let wasMax = false;
    let didRestore = false;
    let grabRatio = 0.5;
    let raf = null;
    let lastSentX = null, lastSentY = null;
    let activePointerId = null;
    const DBL_CLICK_TIME = 500;
    const DBL_CLICK_DIST = 4;
    let lastDownTime = 0;
    let lastDownX = 0;
    let lastDownY = 0;
    const isInteractiveTarget = (t) => !!(t && t.closest && t.closest(NO_DRAG_SELECTOR));
    const onMove = (e) => {
      const sx = e.screenX ?? e.clientX ?? 0;
      const sy = e.screenY ?? e.clientY ?? 0;
      const dx = Math.abs(sx - startSX);
      const dy = Math.abs(sy - startSY);
      if (!dragging) {
        if (wasMax) {
          if (dx + dy <= 0) return;
          if (!didRestore) {
            didRestore = true;
            this.win.setMaximized(false).then(() => {
              this.#updateMaximizeIcon(false);
              this.#setResizeHandlesEnabled(true);
              return this.win.getBounds();
            }).then((bounds) => {
              if (bounds) {
                const rw = bounds.width || 800;
                const rh = bounds.height || 600;
                const targetX = Math.max(0, Math.round(startSX - rw * grabRatio));
                const targetY = Math.max(0, Math.round(sy - 10));
                this.win.setBounds({ x: targetX, y: targetY, width: rw, height: rh });
                startX = targetX;
                startY = targetY;
                winW = rw;
                winH = rh;
                startSX = sx;
                startSY = sy;
              }
            }).catch((err) => {
              this.logger.warn?.("[WindowChrome] Restore on drag failed", err);
            });
          }
          return;
        } else {
          if (dx + dy < DRAG_THRESHOLD) return;
          if (startX == null || startY == null) {
            return;
          }
        }
        dragging = true;
      }
      if (startX == null || startY == null) return;
      const nx = Math.round(startX + (sx - startSX));
      const ny = Math.round(startY + (sy - startSY));
      if (lastSentX === nx && lastSentY === ny) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        lastSentX = nx;
        lastSentY = ny;
        this.win.setBounds({ x: nx, y: ny });
      });
    };
    const endDrag = () => {
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (activePointerId != null && this.topBar.releasePointerCapture) {
        try {
          this.topBar.releasePointerCapture(activePointerId);
        } catch (e) {
        }
      }
      activePointerId = null;
      didRestore = false;
      if (SUPPORTS_POINTER) {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", endDrag, true);
      } else {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", endDrag, true);
      }
    };
    const startDrag = async (e) => {
      if (this.resizingActive) return;
      if (isInteractiveTarget(e.target)) return;
      if (Date.now() - this.lastDblClickTs < 300) return;
      const now = Date.now();
      const cx = e.clientX ?? 0;
      const cy = e.clientY ?? 0;
      if (now - lastDownTime < DBL_CLICK_TIME && Math.abs(cx - lastDownX) < DBL_CLICK_DIST && Math.abs(cy - lastDownY) < DBL_CLICK_DIST) {
        lastDownTime = 0;
        this.lastDblClickTs = now;
        e.preventDefault();
        try {
          const isMax = await this.win.setMaximized(!await this.win.isMaximized());
          this.#updateMaximizeIcon(isMax);
          this.#setResizeHandlesEnabled(!isMax);
        } catch (err) {
          this.logger.warn?.("[WindowChrome] Double-click maximize failed", err);
        }
        return;
      }
      lastDownTime = now;
      lastDownX = cx;
      lastDownY = cy;
      try {
        if (!this.win) return;
        if (this.win.startNativeDrag) {
          e.preventDefault();
          if (await this.win.startNativeDrag()) {
            try {
              const isMax = await this.win.isMaximized();
              this.#updateMaximizeIcon(isMax);
              this.#setResizeHandlesEnabled(!isMax);
            } catch (_) {
            }
            return;
          }
        }
        startSX = e.screenX ?? e.clientX ?? 0;
        startSY = e.screenY ?? e.clientY ?? 0;
        try {
          wasMax = await this.win.isMaximized();
        } catch (e2) {
          wasMax = false;
        }
        const barWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
        grabRatio = Math.min(1, Math.max(0, (e.clientX || 0) / barWidth));
        if (!wasMax) {
          const bounds = await this.win.getBounds();
          if (bounds) {
            startX = typeof bounds.x === "number" ? bounds.x : window.screenX ?? 0;
            startY = typeof bounds.y === "number" ? bounds.y : window.screenY ?? 0;
            winW = bounds.width || document.documentElement.clientWidth;
            winH = bounds.height || document.documentElement.clientHeight;
          } else {
            startX = window.screenX ?? 0;
            startY = window.screenY ?? 0;
            winW = document.documentElement.clientWidth;
            winH = document.documentElement.clientHeight;
          }
        }
        e.preventDefault();
        if (SUPPORTS_POINTER && e.pointerId != null && this.topBar.setPointerCapture) {
          try {
            this.topBar.setPointerCapture(e.pointerId);
            activePointerId = e.pointerId;
          } catch (e2) {
          }
        }
        if (SUPPORTS_POINTER) {
          window.addEventListener("pointermove", onMove, true);
          window.addEventListener("pointerup", endDrag, true);
        } else {
          window.addEventListener("mousemove", onMove, true);
          window.addEventListener("mouseup", endDrag, true);
        }
      } catch (err) {
        this.logger.warn?.("[WindowChrome] Start drag failed", err);
      }
    };
    const blocker = (e) => {
      if (this.resizingActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.topBar.addEventListener("mousedown", blocker, true);
    this.topBar.addEventListener("pointerdown", blocker, true);
    const dblClickHandler = async (e) => {
      if (isInteractiveTarget(e.target)) {
        return;
      }
      this.lastDblClickTs = Date.now();
      e.preventDefault();
      e.stopPropagation();
      if (this.resizingActive) return;
      try {
        const isMax = await this.win.setMaximized(!await this.win.isMaximized());
        this.#updateMaximizeIcon(isMax);
        this.#setResizeHandlesEnabled(!isMax);
      } catch (e2) {
        this.logger.warn?.("[WindowChrome] Double-click maximize failed", e2);
      }
    };
    this.topBar.addEventListener("dblclick", dblClickHandler);
    const event = SUPPORTS_POINTER ? "pointerdown" : "mousedown";
    this.topBar.addEventListener(event, startDrag, false);
    this._disposers.push(() => {
      this.topBar.removeEventListener("mousedown", blocker, true);
      this.topBar.removeEventListener("pointerdown", blocker, true);
      this.topBar.removeEventListener("dblclick", dblClickHandler);
      this.topBar.removeEventListener(event, startDrag, false);
    });
  }
  /**
   * Listen for browser resize events to sync UI with native state changes
   * (e.g. Win+Arrow maximize/restore, Win+Down minimize).
   */
  #wireNativeStateSync() {
    let syncTimer = null;
    const syncState = async () => {
      if (this.resizingActive || this._disposed) return;
      try {
        if (!this.win) return;
        const isMax = await this.win.isMaximized();
        this.#updateMaximizeIcon(isMax);
        this.#setResizeHandlesEnabled(!isMax);
      } catch (_) {
      }
    };
    const handler = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncState, 80);
    };
    window.addEventListener("resize", handler);
    this._disposers.push(() => {
      window.removeEventListener("resize", handler);
      clearTimeout(syncTimer);
    });
  }
  /**
   * Wire F11 fullscreen toggle
   */
  #wireKeyboardShortcuts() {
    const handler = async (e) => {
      if (e.code === "F11") {
        e.preventDefault();
        try {
          const isFs = await this.win.toggleFullscreen();
          this.#setFullscreenClass(isFs);
          const max = await this.win.isMaximized();
          this.#setResizeHandlesEnabled(!(isFs || max));
        } catch (e2) {
          this.logger.warn?.("[WindowChrome] F11 toggle failed", e2);
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    this._disposers.push(() => window.removeEventListener("keydown", handler, true));
  }
  /**
   * Initialize window state on startup
   */
  async #initializeState() {
    try {
      if (!this.win) return;
      const isMax = await this.win.isMaximized();
      this.#updateMaximizeIcon(isMax);
      this.#setResizeHandlesEnabled(!isMax);
      const isFs = await this.win.isFullscreen();
      this.#setFullscreenClass(isFs);
      if (isFs) this.#setResizeHandlesEnabled(false);
    } catch (e) {
      this.logger.warn?.("[WindowChrome] Initial state check failed", e);
    }
  }
  /**
   * Dispose of the controller
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._disposers.forEach((dispose) => {
      try {
        dispose();
      } catch (e) {
      }
    });
    this._disposers = [];
    Object.values(this.handles).forEach((handle) => {
      if (handle && handle.parentNode) {
        handle.parentNode.removeChild(handle);
      }
    });
    this.handles = {};
    this._createdControls?.remove();
    this._createdControls = null;
    document.body.classList.remove("twm-custom-chrome", "twm-window-maximized", "window-fullscreen");
    this.logger.info?.("[WindowChrome] Disposed");
  }
};

// src/ui/notification_center.js
var SEVERITIES = ["info", "success", "warn", "error", "fatal"];
var OUTCOME_BAR_STATE = Object.freeze({ success: "done", error: "error", fatal: "error" });
var LOG_SEVERITY_MAP = {
  trace: "info",
  debug: "info",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal"
};
var DEFAULT_LOG_LEVELS = /* @__PURE__ */ new Set(["warn", "error", "fatal"]);
var SUPPRESSED_NAMESPACE_TITLES = /* @__PURE__ */ new Set(["bootstrap", "app"]);
var NotificationCenter = class _NotificationCenter extends ComponentBase {
  #items;
  #summaryEl;
  constructor({
    eventBus,
    logger,
    maxVisible = 3,
    historyLimit = 50,
    defaultDurationMs = 6e3,
    logLevels = DEFAULT_LOG_LEVELS,
    // What happens past `maxVisible`. 'drop' (the default, as before 0.11):
    // the oldest toast leaves. 'collapse': the toasts on screen stay, the
    // rest wait behind one "+N more" toast, and each comes in as one closes
    // — a sticky alert nobody has read is never pushed off unseen.
    overflow = "drop",
    // Called with the held-back toasts when the "+N more" toast is clicked.
    summaryAction = null
  } = {}) {
    super({ eventBus, logger });
    this.maxVisible = maxVisible;
    this.overflow = overflow === "collapse" ? "collapse" : "drop";
    this.summaryAction = typeof summaryAction === "function" ? summaryAction : null;
    this.held = [];
    this.historyLimit = historyLimit;
    this.defaultDurationMs = defaultDurationMs;
    this.logLevels = new Set(logLevels ?? DEFAULT_LOG_LEVELS);
    this.notifications = [];
    this.history = [];
    this.sequence = 0;
    this.activeTimers = /* @__PURE__ */ new Map();
    this.eventDisposers = [];
    this.#items = /* @__PURE__ */ new Map();
    this.#summaryEl = null;
    this.container = null;
    this.rootEl = null;
    this.listEl = null;
    this.liveRegionEl = null;
  }
  mount(container, props = {}) {
    const existingContainer = document.getElementById("notification-center-root");
    if (existingContainer) {
      this.container = existingContainer;
      this.rootEl = existingContainer.querySelector(".twm-notification-center");
      this.listEl = existingContainer.querySelector(".twm-notification-center__list");
      this.liveRegionEl = existingContainer.querySelector(".notification-center__live-region");
      this._mounted = true;
      this.#subscribeEvents();
      this.#claimToastBus();
      return this;
    }
    this.container = document.createElement("div");
    this.container.id = "notification-center-root";
    this.container.style.cssText = "position: fixed; right: 16px; bottom: 24px; z-index: 10000; pointer-events: none;";
    this.rootEl = document.createElement("div");
    this.rootEl.className = "twm-notification-center";
    this.listEl = document.createElement("div");
    this.listEl.className = "twm-notification-center__list";
    this.liveRegionEl = document.createElement("div");
    this.liveRegionEl.className = "notification-center__live-region";
    this.liveRegionEl.setAttribute("aria-live", "polite");
    this.liveRegionEl.setAttribute("aria-atomic", "true");
    this.liveRegionEl.style.position = "absolute";
    this.liveRegionEl.style.width = "1px";
    this.liveRegionEl.style.height = "1px";
    this.liveRegionEl.style.overflow = "hidden";
    this.liveRegionEl.style.clip = "rect(1px, 1px, 1px, 1px)";
    this.rootEl.appendChild(this.listEl);
    this.rootEl.appendChild(this.liveRegionEl);
    this.container.appendChild(this.rootEl);
    document.body.appendChild(this.container);
    this._mounted = true;
    this.#subscribeEvents();
    this.#claimToastBus();
    if (Array.isArray(props.initialNotifications)) {
      props.initialNotifications.forEach((notification) => this.show(notification));
    }
    return this;
  }
  dispose() {
    this.#clearTimers();
    this.#unsubscribeEvents();
    if (this.eventBus && getToastBus() === this.eventBus) setToastBus(null);
    this.#items.forEach((entry) => entry.bar?.dispose());
    this.#items.clear();
    this.#summaryEl = null;
    if (this.rootEl?.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }
    this.container = null;
    this.rootEl = null;
    this.listEl = null;
    this.liveRegionEl = null;
    super.dispose();
  }
  show(notification) {
    const normalized = this.#normalizeNotification(notification);
    this.#consoleLog(normalized);
    const running = _NotificationCenter.#isRunning(normalized);
    if (this.overflow === "collapse" && !running && this.notifications.length >= this.maxVisible) {
      this.held.push(normalized);
      this.#recordHistory(normalized);
      this.#render();
      this.#announce(normalized);
      return normalized.id;
    }
    this.notifications.push(normalized);
    if (this.overflow === "collapse") {
      this.#rebalance();
    } else if (this.notifications.length > this.maxVisible) {
      const idx = this.notifications.findIndex((item) => !_NotificationCenter.#isRunning(item));
      if (idx !== -1) {
        const [removed] = this.notifications.splice(idx, 1);
        this.#stopTimer(removed.id);
        this.#recordHistory({ ...removed, dismissed: true, reason: "overflow" });
      }
    }
    this.#recordHistory(normalized);
    this.#scheduleAutoDismiss(normalized);
    this.#render();
    this.#announce(normalized);
    return normalized.id;
  }
  dismiss(notificationId, reason = "dismissed") {
    const idx = this.notifications.findIndex((item) => item.id === notificationId);
    if (idx === -1) {
      const h = this.held.findIndex((item) => item.id === notificationId);
      if (h === -1) return false;
      const [gone] = this.held.splice(h, 1);
      this.#recordHistory({ ...gone, dismissed: true, reason });
      this.#render();
      return true;
    }
    const [removed] = this.notifications.splice(idx, 1);
    this.#stopTimer(notificationId);
    this.#recordHistory({ ...removed, dismissed: true, reason });
    this.#rebalance();
    this.#render();
    return true;
  }
  /**
   * Change a notification in place: only its own nodes are touched, and no
   * other toast is redrawn. A held-back toast is changed too and shows the
   * change when it comes on screen.
   *
   * Fields: `message`, `title`, `description`, `severity`, `meta`, and for
   * progress toasts `progress` (fraction, `{ value, total }`, or `null` for
   * indeterminate), `status`, `counts` and `collapsed`; `progress` on a
   * plain toast turns it into a running progress toast (on screen, as with
   * show()). Giving a running progress toast an outcome severity (success,
   * error, fatal) finishes it, and its bar keeps the state it ended in: a
   * later severity only restyles the toast. A `durationMs` on a toast that
   * is not running (re)starts its auto-dismiss (0 keeps it until closed).
   *
   * @param {string} notificationId - The ID of the notification to update
   * @param {Object} updates - The fields to change
   * @returns {boolean} True if the notification was found and updated
   */
  update(notificationId, updates = {}) {
    const notification = this.notifications.find((item) => item.id === notificationId) ?? this.held.find((item) => item.id === notificationId);
    if (!notification) {
      return false;
    }
    const hadTitle = Boolean(notification.title);
    const hadDescription = Boolean(notification.description);
    const wasProgress = notification.progress !== void 0;
    const wasRunning = _NotificationCenter.#isRunning(notification);
    if (updates.message !== void 0) notification.message = updates.message;
    if (updates.title !== void 0) notification.title = updates.title;
    if (updates.description !== void 0) notification.description = updates.description;
    if (updates.meta !== void 0) notification.meta = updates.meta;
    if (updates.status !== void 0) notification.status = updates.status ?? "";
    if (updates.counts !== void 0) notification.counts = updates.counts ?? "";
    if (updates.collapsed !== void 0) notification.collapsed = Boolean(updates.collapsed);
    if (updates.progress !== void 0) {
      if (wasProgress) {
        notification.progress = _NotificationCenter.#normalizeProgress(updates.progress);
      } else {
        Object.assign(notification, _NotificationCenter.#progressFields({ ...notification, ...updates }));
        notification.persistent = true;
        this.#stopTimer(notification.id);
      }
    }
    if (updates.severity !== void 0) {
      notification.severity = this.#normalizeSeverity(updates.severity);
      const outcome = OUTCOME_BAR_STATE[notification.severity];
      if (_NotificationCenter.#isRunning(notification) && outcome) notification.outcome = outcome;
    }
    const running = _NotificationCenter.#isRunning(notification);
    const finished = wasRunning && !running;
    if (updates.durationMs !== void 0 && !_NotificationCenter.#isRunning(notification)) {
      notification.durationMs = this.#coerceDuration(updates.durationMs);
      notification.persistent = notification.durationMs === 0;
      if (this.notifications.includes(notification)) {
        this.#stopTimer(notification.id);
        this.#scheduleAutoDismiss(notification);
      }
    }
    const entry = this.#items.get(notification.id);
    if (entry) {
      const structural = hadTitle !== Boolean(notification.title) || hadDescription !== Boolean(notification.description) || wasProgress !== (notification.progress !== void 0);
      if (structural) {
        const next = this.#buildItem(notification);
        entry.el.replaceWith(next.el);
        entry.bar?.dispose();
        this.#items.set(notification.id, next);
      } else {
        this.#patchItem(entry, notification);
      }
    }
    if (finished) this.#announce(notification);
    if (running !== wasRunning) this.#rebalance();
    this.#render();
    return true;
  }
  clearAll(reason = "cleared") {
    [...this.notifications].forEach((notification) => this.dismiss(notification.id, reason));
  }
  ingestLogEntry(entry) {
    if (!entry || !this.logLevels.has(entry.level)) {
      return;
    }
    if (entry.namespace === "state-guard") {
      return;
    }
    const severity = LOG_SEVERITY_MAP[entry.level] ?? "info";
    const suppressTitle = SUPPRESSED_NAMESPACE_TITLES.has(entry.namespace);
    const title = suppressTitle ? null : _NotificationCenter.#formatNamespaceTitle(entry.namespace);
    const skipHistory = severity === "info" && suppressTitle;
    this.show({
      title,
      message: entry.message,
      severity,
      namespace: entry.namespace,
      meta: entry.data,
      skipHistory
    });
  }
  #consoleLog(notification) {
    if (notification.severity !== "warn" && notification.severity !== "error" && notification.severity !== "fatal") {
      return;
    }
    const method = notification.severity === "warn" ? console.warn : console.error;
    const prefix = notification.title ? `[${notification.title}]` : "[Notification]";
    const details = notification.meta ?? notification.description ?? "";
    method(`${prefix} ${notification.message}`, details);
  }
  #normalizeNotification(notification) {
    if (!notification) {
      throw new TypeError("Notification payload is required");
    }
    const id = notification.id ?? `notification-${++this.sequence}`;
    const severity = this.#normalizeSeverity(notification.severity ?? "info");
    const isProgress = notification.progress !== void 0;
    return {
      ...isProgress ? _NotificationCenter.#progressFields(notification) : {},
      id,
      title: notification.title ?? null,
      message: notification.message ?? "",
      description: notification.description ?? null,
      timestamp: notification.timestamp ?? Date.now(),
      severity,
      namespace: notification.namespace ?? null,
      durationMs: this.#coerceDuration(notification.durationMs),
      // A progress toast stays until it finishes (and then until its
      // finishing durationMs, or its ×).
      persistent: isProgress || Boolean(notification.persistent),
      skipHistory: Boolean(notification.skipHistory),
      actions: this.#normalizeActions(notification.actions),
      meta: notification.meta ?? null
    };
  }
  #normalizeSeverity(severity) {
    const value = typeof severity === "string" ? severity.toLowerCase() : "info";
    if (!SEVERITIES.includes(value)) {
      return "info";
    }
    return value;
  }
  #coerceDuration(duration) {
    if (duration === null || duration === void 0) {
      return this.defaultDurationMs;
    }
    const value = Number(duration);
    if (!Number.isFinite(value) || value < 0) {
      return this.defaultDurationMs;
    }
    return value;
  }
  toast(title, message, type = "info") {
    this.show({
      title,
      message,
      severity: type,
      persistent: type === "error" || type === "fatal"
    });
  }
  error(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "error",
      persistent: true
    });
  }
  warn(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "warn"
    });
  }
  info(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "info"
    });
  }
  success(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "success"
    });
  }
  #normalizeActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return [];
    }
    return actions.map((action, idx) => ({
      id: action.id ?? `action-${idx}`,
      label: action.label ?? "Action",
      handler: typeof action.handler === "function" ? action.handler : null,
      eventName: action.eventName ?? null,
      payload: action.payload ?? null
    }));
  }
  #scheduleAutoDismiss(notification) {
    if (notification.persistent || notification.durationMs === 0) {
      return;
    }
    const timer = setTimeout(() => {
      this.dismiss(notification.id, "timeout");
    }, notification.durationMs);
    this.activeTimers.set(notification.id, timer);
  }
  #stopTimer(notificationId) {
    const timer = this.activeTimers.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(notificationId);
    }
  }
  #clearTimers() {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }
  #recordHistory(entry) {
    if (entry.skipHistory) return;
    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }
  }
  /** A progress toast that has not been given an outcome yet. */
  static #isRunning(notification) {
    return notification.progress !== void 0 && !notification.outcome;
  }
  /**
   * The fields a progress toast carries, from a show() payload or an
   * update() that turns a plain toast into one. `outcome` is null while it
   * runs, then the state its bar ended in (done or error).
   */
  static #progressFields(source) {
    return {
      progress: _NotificationCenter.#normalizeProgress(source.progress),
      status: source.status ?? "",
      counts: source.counts ?? "",
      collapsed: Boolean(source.collapsed),
      outcome: null
    };
  }
  /** `null` (indeterminate), a 0..1 fraction, or `{ value, total }` -> ProgressBar input. */
  static #normalizeProgress(progress) {
    if (progress === null) return { indeterminate: true };
    if (typeof progress === "number") {
      return { value: Number.isFinite(progress) ? progress : 0, max: null, indeterminate: false };
    }
    if (typeof progress === "object") {
      const value = Number(progress.value);
      const total = Number(progress.total);
      return {
        value: Number.isFinite(value) ? value : 0,
        max: Number.isFinite(total) && total > 0 ? total : null,
        indeterminate: false
      };
    }
    return { indeterminate: true };
  }
  /**
   * 'collapse' only: keep at most `maxVisible` on screen, counting running
   * progress toasts, which never leave and are never held (one that started
   * running while held comes on screen first). Past the limit the newest
   * other toast steps back to the front of the held queue (its timer
   * restarts when it returns); under it the oldest held toast comes in.
   */
  #rebalance() {
    if (this.overflow !== "collapse") return;
    for (let i = 0; i < this.held.length; ) {
      if (_NotificationCenter.#isRunning(this.held[i])) this.notifications.push(...this.held.splice(i, 1));
      else i++;
    }
    while (this.notifications.length > this.maxVisible) {
      let idx = -1;
      for (let i = this.notifications.length - 1; i >= 0; i--) {
        if (!_NotificationCenter.#isRunning(this.notifications[i])) {
          idx = i;
          break;
        }
      }
      if (idx === -1) break;
      const [back] = this.notifications.splice(idx, 1);
      this.#stopTimer(back.id);
      this.held.unshift(back);
    }
    while (this.held.length && this.notifications.length < this.maxVisible) {
      const next = this.held.shift();
      this.notifications.push(next);
      this.#scheduleAutoDismiss(next);
    }
  }
  /**
   * Draw the toasts on screen. Each toast's element is built once and kept:
   * a toast arriving or leaving only inserts or removes its own element, so
   * every other toast keeps its nodes (and its bar, collapsed state, hover).
   */
  #render() {
    if (!this._mounted || !this.listEl) {
      return;
    }
    const visible = new Set(this.notifications.map((n) => n.id));
    for (const [id, entry] of this.#items) {
      if (visible.has(id)) continue;
      entry.bar?.dispose();
      entry.el.remove();
      this.#items.delete(id);
    }
    const wanted = this.notifications.map((notification) => {
      let entry = this.#items.get(notification.id);
      if (!entry) {
        entry = this.#buildItem(notification);
        this.#items.set(notification.id, entry);
      }
      return entry.el;
    });
    const summary = this.#syncSummary();
    if (summary) wanted.push(summary);
    wanted.forEach((el3, i) => {
      const at = this.listEl.children[i];
      if (at !== el3) this.listEl.insertBefore(el3, at ?? null);
    });
    while (this.listEl.children.length > wanted.length) {
      this.listEl.lastElementChild.remove();
    }
  }
  // The held-back toasts, as one: "+N more". It is a button so the count is
  // reachable by keyboard; what it opens is the consumer's (summaryAction),
  // and it is also announced on the bus for a history panel to answer.
  #syncSummary() {
    if (!this.held.length) {
      this.#summaryEl?.remove();
      this.#summaryEl = null;
      return null;
    }
    if (!this.#summaryEl) {
      const more2 = document.createElement("button");
      more2.type = "button";
      more2.className = "notification twm-notification--summary";
      more2.addEventListener("click", () => {
        const held = [...this.held];
        try {
          this.summaryAction?.(held);
        } catch (err) {
          this.logger?.warn?.("summaryAction failed", err);
        }
        this.eventBus?.emit?.("notification:summary", { held });
      });
      this.#summaryEl = more2;
    }
    const more = this.#summaryEl;
    const count = String(this.held.length);
    if (more.getAttribute("data-notification-summary") !== count) more.setAttribute("data-notification-summary", count);
    _NotificationCenter.#setText(more, `+${count} more`);
    const tip = this.held.map((h) => h.title || h.message).join("\n");
    if (more.title !== tip) more.title = tip;
    return more;
  }
  static #setText(node, text) {
    const t = text == null ? "" : String(text);
    if (node.textContent !== t) node.textContent = t;
  }
  /** Build one toast's element; `#patchItem` then fills what can change. */
  #buildItem(notification) {
    const isProgress = notification.progress !== void 0;
    const item = document.createElement("div");
    item.setAttribute("data-notification-id", notification.id);
    const entry = {
      el: item,
      severity: null,
      titleEl: null,
      bodyEl: null,
      descriptionEl: null,
      statusEl: null,
      bar: null,
      collapseBtn: null
    };
    const header = document.createElement("div");
    header.className = "twm-notification__header";
    if (notification.title) {
      entry.titleEl = document.createElement("span");
      entry.titleEl.className = "twm-notification__title";
      header.appendChild(entry.titleEl);
    }
    const timeEl = document.createElement("span");
    timeEl.className = "twm-notification__timestamp";
    timeEl.textContent = this.#formatTimestamp(notification.timestamp);
    header.appendChild(timeEl);
    if (isProgress) {
      const toggle = document.createElement("button");
      toggle.className = "twm-notification__collapse";
      toggle.type = "button";
      toggle.innerHTML = '<span class="material-symbols-outlined">expand_more</span>';
      toggle.addEventListener("click", () => {
        this.update(notification.id, { collapsed: !notification.collapsed });
      });
      entry.collapseBtn = toggle;
      header.appendChild(toggle);
    }
    const closeBtn = document.createElement("button");
    closeBtn.className = "twm-notification__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Dismiss notification");
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeBtn.addEventListener("click", () => this.dismiss(notification.id, "manual"));
    header.appendChild(closeBtn);
    item.appendChild(header);
    entry.bodyEl = document.createElement("div");
    entry.bodyEl.className = "twm-notification__body";
    item.appendChild(entry.bodyEl);
    if (isProgress) {
      entry.bar = new ProgressBar(item, {
        ...notification.progress,
        showCount: false,
        className: "twm-notification__progress"
      });
      entry.statusEl = document.createElement("div");
      entry.statusEl.className = "twm-notification__status";
      item.appendChild(entry.statusEl);
    }
    if (notification.description) {
      entry.descriptionEl = document.createElement("div");
      entry.descriptionEl.className = "twm-notification__description";
      item.appendChild(entry.descriptionEl);
    }
    if (notification.actions.length > 0) {
      const actionsEl = document.createElement("div");
      actionsEl.className = "twm-notification__actions";
      notification.actions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "twm-notification__action-btn";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          try {
            if (action.handler) {
              action.handler(notification, action);
            } else if (action.eventName && this.eventBus) {
              this.eventBus.emit(action.eventName, action.payload ?? { notificationId: notification.id });
            }
          } catch (err) {
            this.logger?.error?.("twm-notification-center", "Notification action failed", { err });
          } finally {
            if (notification.severity !== "error" && notification.severity !== "fatal" && !_NotificationCenter.#isRunning(notification)) {
              this.dismiss(notification.id, "action");
            }
          }
        });
        actionsEl.appendChild(button);
      });
      item.appendChild(actionsEl);
    }
    item.addEventListener("click", (event) => {
      if (event.target.closest("button") || _NotificationCenter.#isRunning(notification)) {
        return;
      }
      this.dismiss(notification.id, "click");
    });
    this.#patchItem(entry, notification);
    return entry;
  }
  /** Bring a drawn toast's nodes in line with its data, touching only what changed. */
  #patchItem(entry, notification) {
    const item = entry.el;
    if (entry.severity !== notification.severity) {
      if (entry.severity) item.classList.remove(`notification--${entry.severity}`);
      item.classList.add("notification", `notification--${notification.severity}`);
      entry.severity = notification.severity;
    }
    if (entry.titleEl) _NotificationCenter.#setText(entry.titleEl, notification.title);
    _NotificationCenter.#setText(entry.bodyEl, notification.message);
    if (entry.descriptionEl) _NotificationCenter.#setText(entry.descriptionEl, notification.description);
    if (!entry.bar) return;
    item.classList.add("twm-notification--progress");
    item.classList.toggle("twm-notification--collapsed", Boolean(notification.collapsed));
    const expanded = String(!notification.collapsed);
    if (entry.collapseBtn.getAttribute("aria-expanded") !== expanded) {
      entry.collapseBtn.setAttribute("aria-expanded", expanded);
      entry.collapseBtn.setAttribute("aria-label", notification.collapsed ? "Expand notification" : "Collapse notification");
    }
    _NotificationCenter.#setText(entry.statusEl, notification.status);
    entry.statusEl.hidden = !notification.status;
    entry.bar.update({ ...notification.progress, label: notification.counts });
    const end = notification.outcome ?? "running";
    if (entry.bar.state !== end) entry.bar.setState(end);
  }
  #formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  #announce(notification) {
    if (!this.liveRegionEl) {
      return;
    }
    const parts = [notification.title, notification.message].filter(Boolean);
    this.liveRegionEl.textContent = parts.join(": ");
  }
  #handleToast(payload = {}) {
    const message = payload.text ?? payload.message ?? (typeof payload === "string" ? payload : "");
    if (!message) {
      return;
    }
    const persistent = payload.persistent === true || payload.autoHide === false;
    const durationMs = persistent ? 0 : payload.durationMs ?? payload.duration ?? payload.timeout;
    this.show({
      title: payload.title ?? null,
      message,
      severity: payload.type ?? payload.severity ?? "info",
      durationMs,
      persistent,
      namespace: payload.namespace ?? null,
      actions: payload.actions,
      meta: payload.meta ?? null
    });
  }
  #subscribeEvents() {
    if (!this.eventBus) {
      return;
    }
    this.eventDisposers.push(
      this.eventBus.on("toast:show", (payload) => this.#handleToast(payload)),
      this.eventBus.on("notification:show", (payload) => this.show(payload)),
      this.eventBus.on("notification:update", (payload) => {
        if (payload?.id) {
          this.update(payload.id, payload);
        }
      }),
      this.eventBus.on("log:entry", (entry) => this.ingestLogEntry(entry)),
      this.eventBus.on("workspace:save:failed", (payload) => {
        if (getSetting("workspace.save.showErrorToast", true)) {
          this.show({
            title: "Workspace Save Failed",
            message: payload?.reason ? `Save failed: ${payload.reason}` : "Workspace save failed",
            severity: "error",
            meta: payload,
            persistent: true
          });
        }
      }),
      this.eventBus.on("workspace:save:completed", (payload) => {
        if (getSetting("workspace.save.showToast", false)) {
          this.show({
            title: "Workspace Saved",
            message: "Changes saved successfully",
            severity: "success",
            durationMs: 3e3,
            meta: payload,
            skipHistory: true
          });
        }
      }),
      this.eventBus.on("workspace:import:failed", (payload) => {
        if (getSetting("workspace.import.showErrorToast", true)) {
          this.show({
            title: "Workspace Import Failed",
            message: payload?.error?.message || "Import failed",
            severity: "error",
            meta: payload,
            persistent: true
          });
        }
      }),
      this.eventBus.on("workspace:import:completed", (payload) => {
        if (getSetting("workspace.import.showToast", true)) {
          this.show({
            title: "Workspace Ready",
            message: "Workspace import completed",
            severity: "success",
            durationMs: 3e3,
            meta: payload,
            skipHistory: true
          });
        }
      })
    );
  }
  /** The toast helpers (toast.js) emit on the bus of the centre mounted last. */
  #claimToastBus() {
    if (this.eventBus) setToastBus(this.eventBus);
  }
  #unsubscribeEvents() {
    this.eventDisposers.forEach((disposer) => {
      try {
        disposer?.dispose?.();
      } catch (err) {
        this.logger?.warn?.("twm-notification-center", "Failed to remove event listener", { err });
      }
    });
    this.eventDisposers = [];
  }
  static #formatNamespaceTitle(namespace) {
    if (!namespace) return null;
    return namespace.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
};
NotificationCenter.SEVERITIES = SEVERITIES;

// src/ui/utils/auto_scrollbars.js
var LAYER_ID = "twm-autoscroll-layer";
var ROOT_CLASS = "twm-autoscroll";
var HIDE_AFTER_MS = 900;
var MIN_THUMB = 30;
var BAR = 6;
function thumbGeometry(scrollSize, clientSize, scrollPos, trackLen) {
  const max = scrollSize - clientSize;
  if (!(max > 1) || !(trackLen > 0)) return null;
  const size = Math.min(trackLen, Math.max(MIN_THUMB, trackLen * clientSize / scrollSize));
  const pos = (trackLen - size) * Math.min(1, Math.max(0, scrollPos / max));
  return { size, pos };
}
function barCovered(el3, stacks) {
  return stacks.some((stack) => {
    const top = (stack || []).find((h) => !h.closest?.(".twm-autoscroll-layer"));
    return Boolean(top) && top !== el3 && !el3.contains(top);
  });
}
function scrollsOn(el3, axis) {
  if (!(el3 instanceof Element)) return false;
  const cs = getComputedStyle(el3);
  const overflow = axis === "y" ? cs.overflowY : cs.overflowX;
  if (overflow !== "auto" && overflow !== "scroll" && !(el3.tagName === "TEXTAREA" && overflow !== "hidden")) return false;
  return axis === "y" ? el3.scrollHeight - el3.clientHeight > 1 : el3.scrollWidth - el3.clientWidth > 1;
}
function installAutoScrollbars(root = document.body, { exclude = null } = {}) {
  const doc = root.ownerDocument || document;
  const win = doc.defaultView || window;
  root.classList.add(ROOT_CLASS);
  let layer = doc.getElementById(LAYER_ID);
  if (!layer) {
    layer = doc.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "twm-autoscroll-layer";
    doc.body.appendChild(layer);
  }
  const managed = /* @__PURE__ */ new Map();
  let hoverChain = /* @__PURE__ */ new Set();
  const eligible = (el3) => el3 instanceof Element && root.contains(el3) && !el3.__overlayScrollbarInstalled && !el3.closest?.(".twm-autoscroll-layer") && !(exclude && exclude(el3));
  const makeBar = (el3, axis) => {
    const bar = doc.createElement("div");
    bar.className = `twm-autoscroll-bar twm-autoscroll-bar--${axis}`;
    const thumb = doc.createElement("div");
    thumb.className = "twm-autoscroll-thumb";
    bar.appendChild(thumb);
    layer.appendChild(bar);
    bar.addEventListener("mousedown", (e) => {
      if (e.target !== bar) return;
      e.preventDefault();
      const r = thumb.getBoundingClientRect();
      const before = axis === "y" ? e.clientY < r.top : e.clientX < r.left;
      const page = (axis === "y" ? el3.clientHeight : el3.clientWidth) * 0.9;
      if (axis === "y") el3.scrollTop += before ? -page : page;
      else el3.scrollLeft += before ? -page : page;
    });
    thumb.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rec = managed.get(el3);
      if (rec) rec.dragging = true;
      const start = axis === "y" ? e.clientY : e.clientX;
      const startScroll = axis === "y" ? el3.scrollTop : el3.scrollLeft;
      const trackLen = axis === "y" ? bar.getBoundingClientRect().height : bar.getBoundingClientRect().width;
      const thumbLen = axis === "y" ? thumb.getBoundingClientRect().height : thumb.getBoundingClientRect().width;
      const max = axis === "y" ? el3.scrollHeight - el3.clientHeight : el3.scrollWidth - el3.clientWidth;
      const perPx = trackLen > thumbLen ? max / (trackLen - thumbLen) : 0;
      bar.classList.add("twm-autoscroll-bar--active");
      const move = (mv) => {
        const d = (axis === "y" ? mv.clientY : mv.clientX) - start;
        if (axis === "y") el3.scrollTop = startScroll + d * perPx;
        else el3.scrollLeft = startScroll + d * perPx;
      };
      const up = () => {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", up);
        bar.classList.remove("twm-autoscroll-bar--active");
        if (rec) rec.dragging = false;
        hideLater(el3);
      };
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", up);
    });
    bar.addEventListener("mouseenter", () => {
      const rec = managed.get(el3);
      if (rec) {
        rec.onBar = true;
        show(el3);
      }
    });
    bar.addEventListener("mouseleave", () => {
      const rec = managed.get(el3);
      if (rec) {
        rec.onBar = false;
        hideLater(el3);
      }
    });
    return { bar, thumb };
  };
  const record = (el3) => {
    let rec = managed.get(el3);
    if (!rec) {
      rec = { v: null, h: null, timer: 0, dragging: false, onBar: false };
      managed.set(el3, rec);
    }
    return rec;
  };
  const coveredAlong = (el3, points) => typeof doc.elementsFromPoint === "function" && barCovered(el3, points.map(([x, y]) => doc.elementsFromPoint(x, y)));
  const place = (el3) => {
    const rec = managed.get(el3);
    if (!rec) return;
    if (!el3.isConnected) {
      drop(el3);
      return;
    }
    const r = el3.getBoundingClientRect();
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const top = Math.max(0, r.top);
    const left = Math.max(0, r.left);
    const bottom = Math.min(vh, r.bottom);
    const right = Math.min(vw, r.right);
    const z = el3.offsetHeight ? r.height / el3.offsetHeight : 1;
    for (const axis of ["y", "x"]) {
      const key = axis === "y" ? "v" : "h";
      const overflows = scrollsOn(el3, axis);
      if (!overflows) {
        if (rec[key]) rec[key].bar.style.display = "none";
        continue;
      }
      if (!rec[key]) rec[key] = makeBar(el3, axis);
      const { bar, thumb } = rec[key];
      bar.style.display = "";
      if (axis === "y") {
        const len = bottom - top;
        Object.assign(bar.style, { top: `${top}px`, left: `${right - BAR - 1}px`, height: `${len}px`, width: `${BAR}px` });
        const g = thumbGeometry(el3.scrollHeight * z, el3.clientHeight * z, el3.scrollTop * z, len);
        if (!g) {
          bar.style.display = "none";
          continue;
        }
        Object.assign(thumb.style, { top: `${g.pos}px`, height: `${g.size}px`, left: "0", width: "100%" });
        const x = right - BAR / 2 - 1;
        if (coveredAlong(el3, [[x, top + 2], [x, top + len / 2], [x, bottom - 2]])) bar.style.display = "none";
      } else {
        const len = right - left;
        Object.assign(bar.style, { left: `${left}px`, top: `${bottom - BAR - 1}px`, width: `${len}px`, height: `${BAR}px` });
        const g = thumbGeometry(el3.scrollWidth * z, el3.clientWidth * z, el3.scrollLeft * z, len);
        if (!g) {
          bar.style.display = "none";
          continue;
        }
        Object.assign(thumb.style, { left: `${g.pos}px`, width: `${g.size}px`, top: "0", height: "100%" });
        const y = bottom - BAR / 2 - 1;
        if (coveredAlong(el3, [[left + 2, y], [left + len / 2, y], [right - 2, y]])) bar.style.display = "none";
      }
    }
  };
  const setVisible = (el3, on) => {
    const rec = managed.get(el3);
    if (!rec) return;
    for (const b of [rec.v, rec.h]) if (b) b.bar.classList.toggle("twm-autoscroll-bar--on", on);
  };
  const show = (el3) => {
    const rec = record(el3);
    clearTimeout(rec.timer);
    place(el3);
    setVisible(el3, true);
  };
  const hideLater = (el3) => {
    const rec = managed.get(el3);
    if (!rec) return;
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => {
      if (rec.dragging || rec.onBar || hoverChain.has(el3)) return;
      setVisible(el3, false);
    }, HIDE_AFTER_MS);
  };
  const drop = (el3) => {
    const rec = managed.get(el3);
    if (!rec) return;
    clearTimeout(rec.timer);
    rec.v?.bar.remove();
    rec.h?.bar.remove();
    managed.delete(el3);
  };
  const scrollChain = (target) => {
    const out = /* @__PURE__ */ new Set();
    for (let el3 = target instanceof Element ? target : target?.parentElement; el3 && el3 !== doc.documentElement; el3 = el3.parentElement) {
      if (el3.closest?.(".twm-autoscroll-layer")) return out;
      if (eligible(el3) && (scrollsOn(el3, "y") || scrollsOn(el3, "x"))) out.add(el3);
      if (el3 === root) break;
    }
    return out;
  };
  const onOver = (e) => {
    if (e.target?.closest?.(".twm-autoscroll-layer")) return;
    const next = scrollChain(e.target);
    for (const el3 of hoverChain) if (!next.has(el3)) hideLater(el3);
    for (const el3 of next) show(el3);
    hoverChain = next;
  };
  const onLeaveWindow = (e) => {
    if (e.relatedTarget) return;
    for (const el3 of hoverChain) hideLater(el3);
    hoverChain = /* @__PURE__ */ new Set();
  };
  const onScroll = (e) => {
    const el3 = e.target === doc ? null : e.target;
    if (el3 && eligible(el3)) {
      show(el3);
      hideLater(el3);
    }
    for (const other of managed.keys()) if (other !== el3) place(other);
  };
  let raf = 0;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      for (const el3 of managed.keys()) place(el3);
    });
  };
  doc.addEventListener("mouseover", onOver, true);
  doc.addEventListener("mouseout", onLeaveWindow, true);
  doc.addEventListener("scroll", onScroll, true);
  win.addEventListener("resize", onResize);
  doc.addEventListener("focusin", onResize, true);
  return {
    dispose() {
      doc.removeEventListener("mouseover", onOver, true);
      doc.removeEventListener("mouseout", onLeaveWindow, true);
      doc.removeEventListener("scroll", onScroll, true);
      win.removeEventListener("resize", onResize);
      doc.removeEventListener("focusin", onResize, true);
      for (const el3 of [...managed.keys()]) drop(el3);
      root.classList.remove(ROOT_CLASS);
    }
  };
}

// src/ui/utils/native_context_menu.js
var TEXT_INPUTS = /* @__PURE__ */ new Set([
  "",
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time"
]);
function isEditable(el3) {
  if (!el3 || el3.nodeType !== 1) return false;
  const tag = el3.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has(String(el3.getAttribute("type") || "").toLowerCase());
  return !!el3.closest?.('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]');
}
function onSelection(target, doc) {
  const sel = doc?.getSelection?.();
  if (!sel || sel.isCollapsed || !String(sel).trim()) return false;
  for (let i = 0; i < sel.rangeCount; i += 1) {
    if (sel.getRangeAt(i).intersectsNode?.(target)) return true;
  }
  return false;
}
function suppressNativeContextMenu({ root, allow } = {}) {
  const r = root ?? (typeof document !== "undefined" ? document : null);
  if (!r) return { dispose() {
  } };
  const onMenu = (e) => {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (isEditable(t)) return;
    if (onSelection(t, t?.ownerDocument)) return;
    if (allow?.(e)) return;
    e.preventDefault();
  };
  r.addEventListener("contextmenu", onMenu);
  return { dispose() {
    r.removeEventListener("contextmenu", onMenu);
  } };
}

// src/ui/utils/overlay_scrollbar.js
function normalizeOrientation(value) {
  return String(value || "horizontal").toLowerCase() === "vertical" ? "vertical" : "horizontal";
}
function ensureInstallState(container) {
  if (!container.__overlayScrollbarInstalled) {
    Object.defineProperty(container, "__overlayScrollbarInstalled", {
      value: {},
      writable: true,
      configurable: true
    });
  }
}
function installOverlayScrollbar(container, options = {}) {
  if (!container) return null;
  const orientation = normalizeOrientation(options.orientation);
  const className = options.className || "overlay-scrollbar";
  const isHorizontal = orientation !== "vertical";
  const orientationKey = isHorizontal ? "horizontal" : "vertical";
  ensureInstallState(container);
  if (container.__overlayScrollbarInstalled[orientationKey]) {
    return container.__overlayScrollbarInstalled[orientationKey];
  }
  if (options.setOverflow !== false) {
    container.style.overflow = options.overflow || "auto";
  }
  if (options.setPosition !== false && getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  const externalBar = !!options.externalBar;
  const barHost = externalBar ? container.parentElement : container;
  if (externalBar && barHost && getComputedStyle(barHost).position === "static") {
    barHost.style.position = "relative";
  }
  const bar = document.createElement("div");
  bar.className = className;
  bar.classList.add(`overlay-scrollbar-${isHorizontal ? "h" : "v"}`);
  const track = document.createElement("div");
  track.className = "track";
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  bar.appendChild(track);
  bar.appendChild(thumb);
  (barHost || container).appendChild(bar);
  const getScrollProps = () => ({
    scrollSize: isHorizontal ? container.scrollWidth : container.scrollHeight,
    clientSize: isHorizontal ? container.clientWidth : container.clientHeight,
    scrollPos: isHorizontal ? container.scrollLeft || 0 : container.scrollTop || 0
  });
  let dragging = false;
  let hovered = false;
  let startPos = 0;
  let thumbStartPos = 0;
  let previousHasOverflow = null;
  let previousClientSize = null;
  let isResettingScroll = false;
  const update = () => {
    if (isResettingScroll) return;
    const { scrollSize, clientSize, scrollPos } = getScrollProps();
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;
    const maxScroll = scrollSize - clientSize;
    const hasOverflow = maxScroll > 2;
    if (previousClientSize !== null && clientSize > previousClientSize && hasOverflow && scrollPos > 0) {
      const delta = clientSize - previousClientSize;
      const targetScroll = Math.max(0, scrollPos - delta);
      if (targetScroll !== scrollPos) {
        isResettingScroll = true;
        if (isHorizontal) {
          container.scrollLeft = targetScroll;
        } else {
          container.scrollTop = targetScroll;
        }
        requestAnimationFrame(() => {
          isResettingScroll = false;
          update();
        });
        previousClientSize = clientSize;
        previousHasOverflow = hasOverflow;
        return;
      }
    }
    previousClientSize = clientSize;
    if (previousHasOverflow === true && !hasOverflow && scrollPos > 0) {
      isResettingScroll = true;
      if (isHorizontal) {
        container.scrollLeft = 0;
      } else {
        container.scrollTop = 0;
      }
      requestAnimationFrame(() => {
        isResettingScroll = false;
        update();
      });
      previousHasOverflow = hasOverflow;
      return;
    }
    const clampedMaxScroll = Math.max(0, maxScroll);
    if (hasOverflow && scrollPos > clampedMaxScroll) {
      isResettingScroll = true;
      if (isHorizontal) {
        container.scrollLeft = clampedMaxScroll;
      } else {
        container.scrollTop = clampedMaxScroll;
      }
      requestAnimationFrame(() => {
        isResettingScroll = false;
        update();
      });
      previousHasOverflow = hasOverflow;
      return;
    }
    previousHasOverflow = hasOverflow;
    container.dataset.scrollable = hasOverflow ? "1" : "0";
    if (externalBar) {
      if (isHorizontal) {
        bar.style.left = `${container.offsetLeft}px`;
        bar.style.bottom = "auto";
        bar.style.top = `${container.offsetTop + container.offsetHeight - 6}px`;
        bar.style.width = `${container.clientWidth}px`;
      } else {
        bar.style.top = `${container.offsetTop}px`;
        bar.style.right = "auto";
        bar.style.left = `${container.offsetLeft + container.offsetWidth - 6}px`;
        bar.style.height = `${container.clientHeight}px`;
      }
    } else {
      if (isHorizontal) {
        bar.style.left = `${scrollLeft}px`;
        bar.style.top = `${scrollTop + container.clientHeight - bar.offsetHeight}px`;
        bar.style.bottom = "auto";
        bar.style.width = `${clientSize}px`;
      } else {
        bar.style.top = `${scrollTop}px`;
        bar.style.left = `${scrollLeft + container.clientWidth - bar.offsetWidth}px`;
        bar.style.right = "auto";
        bar.style.height = `${clientSize}px`;
      }
    }
    if (!hasOverflow) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
      thumb.style[isHorizontal ? "width" : "height"] = "0px";
      thumb.style[isHorizontal ? "left" : "top"] = "0px";
      return;
    }
    if (!dragging && !hovered) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }
    const ratio = clientSize / scrollSize;
    const thumbSize = Math.max(30, Math.floor(ratio * clientSize));
    const maxThumbPos = clientSize - thumbSize;
    const scrollRatio = maxScroll > 0 ? scrollPos / maxScroll : 0;
    const thumbPos = Math.round(maxThumbPos * scrollRatio);
    if (isHorizontal) {
      thumb.style.width = `${thumbSize}px`;
      thumb.style.left = `${thumbPos}px`;
    } else {
      thumb.style.height = `${thumbSize}px`;
      thumb.style.top = `${thumbPos}px`;
    }
  };
  const onScroll = () => update();
  container.addEventListener("scroll", onScroll, { passive: true });
  const onMouseEnter = () => {
    hovered = true;
    update();
    if (container.dataset.scrollable === "1") {
      bar.style.opacity = "1";
      bar.style.pointerEvents = "";
    }
  };
  const onMouseLeave = () => {
    hovered = false;
    if (dragging) return;
    bar.style.opacity = "0";
    bar.style.pointerEvents = "none";
  };
  container.addEventListener("mouseenter", onMouseEnter, { passive: true });
  container.addEventListener("mouseleave", onMouseLeave, { passive: true });
  if (externalBar) {
    bar.addEventListener("mouseenter", onMouseEnter, { passive: true });
    bar.addEventListener("mouseleave", onMouseLeave, { passive: true });
  }
  container.addEventListener("focusin", onMouseEnter, { passive: true });
  container.addEventListener("focusout", onMouseLeave, { passive: true });
  const resizeObserver = createRafResizeObserver(update);
  try {
    resizeObserver.observe(container);
  } catch (_) {
  }
  const mo = new MutationObserver(update);
  try {
    mo.observe(container, { childList: true, subtree: options.watchSubtree !== false });
  } catch (_) {
  }
  let resizeTimeout;
  const onWindowResize = () => {
    update();
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(update, 150);
  };
  window.addEventListener("resize", onWindowResize, { passive: true });
  const onMouseDown = (e) => {
    dragging = true;
    startPos = isHorizontal ? e.clientX : e.clientY;
    thumbStartPos = parseFloat(thumb.style[isHorizontal ? "left" : "top"]) || 0;
    bar.style.opacity = "1";
    bar.style.pointerEvents = "";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp, { once: true });
    e.preventDefault();
    e.stopPropagation();
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const { scrollSize, clientSize } = getScrollProps();
    const maxScroll = scrollSize - clientSize;
    if (maxScroll <= 0) return;
    const thumbSize = parseFloat(thumb.style[isHorizontal ? "width" : "height"]) || 30;
    const maxThumbPos = clientSize - thumbSize;
    const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
    let newThumbPos = thumbStartPos + delta;
    newThumbPos = Math.max(0, Math.min(maxThumbPos, newThumbPos));
    const thumbRatio = maxThumbPos > 0 ? newThumbPos / maxThumbPos : 0;
    if (isHorizontal) {
      container.scrollLeft = thumbRatio * maxScroll;
    } else {
      container.scrollTop = thumbRatio * maxScroll;
    }
  };
  const onMouseUp = () => {
    dragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    const rect = container.getBoundingClientRect();
    const isMouseOver = document.elementsFromPoint(
      (rect.left + rect.right) / 2,
      (rect.top + rect.bottom) / 2
    ).includes(container);
    if (!isMouseOver) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }
  };
  thumb.addEventListener("mousedown", onMouseDown);
  let onWheel = null;
  if (isHorizontal) {
    onWheel = (e) => {
      const { scrollSize, clientSize } = getScrollProps();
      if (scrollSize <= clientSize) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (container.scrollHeight > container.clientHeight) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(update);
  });
  setTimeout(update, 50);
  const cleanup = () => {
    container.removeEventListener("scroll", onScroll);
    container.removeEventListener("mouseenter", onMouseEnter);
    container.removeEventListener("mouseleave", onMouseLeave);
    container.removeEventListener("focusin", onMouseEnter);
    container.removeEventListener("focusout", onMouseLeave);
    if (externalBar) {
      bar.removeEventListener("mouseenter", onMouseEnter);
      bar.removeEventListener("mouseleave", onMouseLeave);
    }
    if (onWheel) container.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onWindowResize);
    try {
      resizeObserver.disconnect();
    } catch (_) {
    }
    try {
      mo.disconnect();
    } catch (_) {
    }
    bar.remove();
  };
  const handle = { update, cleanup, bar, thumb };
  container.__overlayScrollbarInstalled[orientationKey] = handle;
  return handle;
}
function installWorkspaceScrollbars(workspace, options = {}) {
  if (!workspace) return null;
  if (workspace.__workspaceOverlayScrollbarsInstalled) return workspace.__workspaceOverlayScrollbarsUpdate;
  installOverlayScrollbar(workspace, {
    orientation: "vertical",
    className: options.verticalClass || "panel-scrollbar",
    watchSubtree: options.watchSubtree ?? true
  });
  installOverlayScrollbar(workspace, {
    orientation: "horizontal",
    className: options.horizontalClass || "tabs-scrollbar",
    watchSubtree: options.watchSubtree ?? true
  });
  const update = () => {
    const maxX = Math.max(0, workspace.scrollWidth - workspace.clientWidth);
    const maxY = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
    workspace.dataset.scrollableX = maxX > 1 ? "1" : "0";
    workspace.dataset.scrollableY = maxY > 1 ? "1" : "0";
  };
  workspace.__workspaceOverlayScrollbarsInstalled = true;
  workspace.__workspaceOverlayScrollbarsUpdate = update;
  workspace.addEventListener("scroll", update, { passive: true });
  const ro = createRafResizeObserver(update);
  try {
    ro.observe(workspace);
  } catch (_) {
  }
  const mo = new MutationObserver(update);
  try {
    mo.observe(workspace, { childList: true, subtree: true });
  } catch (_) {
  }
  requestAnimationFrame(update);
  return update;
}
function installCollapsibleScrollbars(root = document.body) {
  const installOnElement = (el3) => {
    installOverlayScrollbar(el3, {
      orientation: "vertical",
      setOverflow: false,
      watchSubtree: true
    });
  };
  if (root.matches?.(".twm-collapsible-content.visible")) installOnElement(root);
  root.querySelectorAll(".twm-collapsible-content.visible").forEach(installOnElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const el3 = mutation.target;
        if (el3.classList.contains("twm-collapsible-content") && el3.classList.contains("visible")) {
          installOnElement(el3);
        }
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains("twm-collapsible-content") && node.classList?.contains("visible")) {
          installOnElement(node);
        }
        node.querySelectorAll?.(".twm-collapsible-content.visible")?.forEach(installOnElement);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
  return () => observer.disconnect();
}
function installTabsScrollbars(selectors = [".tabs"]) {
  const selector = selectors.join(", ");
  const classes = selectors.filter((s) => s.startsWith(".")).map((s) => s.slice(1));
  const installOnElement = (el3) => {
    installOverlayScrollbar(el3, {
      orientation: "horizontal",
      className: "tabs-scrollbar",
      setOverflow: false,
      externalBar: true,
      watchSubtree: true
    });
  };
  const cleanupElement = (el3) => {
    el3.__overlayScrollbarInstalled?.horizontal?.cleanup?.();
    delete el3.__overlayScrollbarInstalled;
  };
  const matches = (el3) => classes.some((c) => el3.classList?.contains(c));
  document.querySelectorAll(selector).forEach(installOnElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (matches(node)) installOnElement(node);
        node.querySelectorAll?.(selector)?.forEach(installOnElement);
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (matches(node)) cleanupElement(node);
        node.querySelectorAll?.(selector)?.forEach(cleanupElement);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

// src/ui/utils/scroll_lock.js
function createScrollLock({ axis = "y", enabled = true } = {}) {
  const doY = axis === "y" || axis === "both";
  const doX = axis === "x" || axis === "both";
  const members = /* @__PURE__ */ new Map();
  let last = { top: 0, left: 0 };
  let on = !!enabled;
  function copyFrom(source) {
    last = { top: source.scrollTop, left: source.scrollLeft };
    if (!on) return;
    for (const [el3, state] of members) {
      if (el3 === source) continue;
      const top = doY ? last.top : el3.scrollTop;
      const left = doX ? last.left : el3.scrollLeft;
      if (el3.scrollTop === top && el3.scrollLeft === left) continue;
      state.wrote = { top, left };
      if (doY) el3.scrollTop = top;
      if (doX) el3.scrollLeft = left;
    }
  }
  function onScroll(event) {
    const el3 = event.currentTarget;
    const state = members.get(el3);
    if (!state) return;
    const wrote = state.wrote;
    state.wrote = null;
    if (wrote && Math.abs(el3.scrollTop - wrote.top) < 1 && Math.abs(el3.scrollLeft - wrote.left) < 1) return;
    copyFrom(el3);
  }
  const lock = {
    /** Join the group. Returns the function that leaves it. */
    attach(el3) {
      if (!el3 || typeof el3.addEventListener !== "function") return () => {
      };
      if (members.has(el3)) return () => lock.detach(el3);
      const state = { wrote: null };
      members.set(el3, state);
      el3.addEventListener("scroll", onScroll, { passive: true });
      if (on && (last.top || last.left)) {
        state.wrote = {
          top: doY ? last.top : el3.scrollTop,
          left: doX ? last.left : el3.scrollLeft
        };
        if (doY) el3.scrollTop = last.top;
        if (doX) el3.scrollLeft = last.left;
      }
      return () => lock.detach(el3);
    },
    detach(el3) {
      if (!members.has(el3)) return;
      members.delete(el3);
      el3.removeEventListener("scroll", onScroll);
    },
    /** Lock (true) or let the members scroll freely (false). Locking again
     *  brings every member level with the one scrolled last. */
    setEnabled(value) {
      const was = on;
      on = !!value;
      if (on && !was) {
        const source = [...members.keys()].find(
          (el3) => el3.scrollTop === last.top && el3.scrollLeft === last.left
        ) || members.keys().next().value;
        if (source) copyFrom(source);
      }
    },
    get enabled() {
      return on;
    },
    /** How many boxes are in the group (for a consumer's own checks). */
    get size() {
      return members.size;
    },
    dispose() {
      for (const el3 of [...members.keys()]) lock.detach(el3);
    }
  };
  return lock;
}

// src/ui/utils/tooltip_service.js
var tooltipElement = null;
var currentTarget = null;
var listenersAttached = false;
var mouseCheckInterval = null;
var lastMousePosition = { x: 0, y: 0 };
function createTooltipElement() {
  if (tooltipElement) return tooltipElement;
  tooltipElement = document.createElement("div");
  tooltipElement.className = "twm-latex-tooltip";
  document.body.appendChild(tooltipElement);
  return tooltipElement;
}
function positionTooltip(target, tooltip) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;
  const margin = 10;
  const requestedPlacement = (target.dataset?.tooltipPlacement || target.getAttribute("data-tooltip-placement") || "").toLowerCase() || (target.dataset?.latexPlacement || target.getAttribute("data-latex-placement") || "").toLowerCase() || (target.closest(".twm-global-top-bar") ? "bottom" : target.closest(".twm-fl-bar") ? "right" : "top");
  let placement = requestedPlacement || "top";
  const isExplicitPlacement = target.hasAttribute("data-tooltip-placement") || target.hasAttribute("data-latex-placement");
  if (!isExplicitPlacement) {
    const spaceAbove = rect.top - margin;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceLeft = rect.left - margin;
    const spaceRight = window.innerWidth - rect.right - margin;
    if (placement === "top" && tooltipRect.height > spaceAbove && spaceBelow > spaceAbove) {
      placement = "bottom";
    } else if (placement === "bottom" && tooltipRect.height > spaceBelow && spaceAbove > spaceBelow) {
      placement = "top";
    } else if (placement === "left" && tooltipRect.width > spaceLeft && spaceRight > spaceLeft) {
      placement = "right";
    } else if (placement === "right" && tooltipRect.width > spaceRight && spaceLeft > spaceRight) {
      placement = "left";
    }
  }
  let left, top;
  if (placement === "top") {
    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    top = rect.top - tooltipRect.height - gap;
  } else if (placement === "bottom") {
    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    top = rect.bottom + gap;
  } else if (placement === "left") {
    left = rect.left - tooltipRect.width - gap;
    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
  } else if (placement === "right") {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
  }
  const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
  tooltip.style.left = `${clampedLeft}px`;
  tooltip.style.top = `${clampedTop}px`;
  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  let notchOffset = 0;
  if (placement === "top" || placement === "bottom") {
    const tooltipCenterX = clampedLeft + tooltipRect.width / 2;
    notchOffset = targetCenterX - tooltipCenterX;
    const maxOffset = tooltipRect.width / 2 - 16;
    notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
  } else {
    const tooltipCenterY = clampedTop + tooltipRect.height / 2;
    notchOffset = targetCenterY - tooltipCenterY;
    const maxOffset = tooltipRect.height / 2 - 16;
    notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
  }
  const setAttributes = () => {
    tooltip.setAttribute("data-placement", placement);
    tooltip.style.setProperty("--notch-offset", `${notchOffset}px`);
  };
  const guard = window.stateGuard;
  if (guard?.executeWithBypass) {
    guard.executeWithBypass("latex-tooltip:set-placement", setAttributes);
  } else {
    setAttributes();
  }
}
function showTooltip(target) {
  if (!target || !target.getAttribute) return;
  const hasLatex = target.classList && target.classList.contains("has-latex-tooltip");
  const hasPlain = target.classList && target.classList.contains("twm-has-tooltip");
  if (!hasLatex && !hasPlain) return;
  currentTarget = target;
  const tooltip = createTooltipElement();
  if (hasLatex) {
    const latex = target.getAttribute("data-latex-tooltip");
    if (!latex) return;
    try {
      if (typeof katex !== "undefined") {
        katex.render(latex, tooltip, {
          displayMode: true,
          throwOnError: false,
          trust: false
        });
      } else {
        tooltip.textContent = latex;
      }
    } catch (err) {
      window.logger?.error("nodes", "KaTeX rendering error:", err);
      tooltip.textContent = latex;
    }
  } else if (hasPlain) {
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    const formattedText = text.replace(/&#10;/g, "\n");
    const lines = formattedText.split("\n");
    tooltip.innerHTML = "";
    lines.forEach((line, index) => {
      if (index === 0) {
        const header = document.createElement("strong");
        header.textContent = line;
        tooltip.appendChild(header);
      } else {
        tooltip.appendChild(document.createElement("br"));
        const textNode = document.createTextNode(line);
        tooltip.appendChild(textNode);
      }
    });
  }
  const widthOverride = target.getAttribute("data-tooltip-max-width");
  tooltip.style.maxWidth = widthOverride || "";
  requestAnimationFrame(() => {
    positionTooltip(target, tooltip);
    tooltip.classList.add("visible");
    startMouseCheck();
  });
}
function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.classList.remove("visible");
  }
  currentTarget = null;
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
    mouseCheckInterval = null;
  }
}
function startMouseCheck() {
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
  }
  mouseCheckInterval = setInterval(() => {
    if (!currentTarget) {
      clearInterval(mouseCheckInterval);
      mouseCheckInterval = null;
      return;
    }
    const elementUnderMouse = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
    if (elementUnderMouse) {
      const isStillOnTarget = elementUnderMouse === currentTarget || currentTarget.contains(elementUnderMouse) || elementUnderMouse.closest(".twm-has-tooltip, .has-latex-tooltip") === currentTarget;
      if (!isStillOnTarget) {
        hideTooltip();
      }
    } else {
      hideTooltip();
    }
  }, 3e3);
}
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  document.querySelectorAll(".twm-has-tooltip, .has-latex-tooltip").forEach((el3) => {
    el3.removeAttribute("title");
  });
  document.addEventListener("mousemove", (event) => {
    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;
  }, { passive: true });
  document.addEventListener("mouseenter", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest(".has-latex-tooltip, .twm-has-tooltip");
    if (!tooltipTarget) return;
    showTooltip(tooltipTarget);
  }, true);
  document.addEventListener("mouseleave", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest(".has-latex-tooltip, .twm-has-tooltip");
    if (!tooltipTarget) return;
    hideTooltip();
  }, true);
  document.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
    }
  }, true);
}
function initializeTooltips() {
  const initInterval = setInterval(() => {
    if (typeof katex !== "undefined") {
      clearInterval(initInterval);
      if (!listenersAttached) {
        attachListeners();
      }
    }
  }, 100);
  setTimeout(() => {
    clearInterval(initInterval);
    if (!listenersAttached) {
      attachListeners();
    }
  }, 2e3);
}
function setTooltip(element, text, isLatex = false) {
  if (!element || !text) return;
  element.removeAttribute("title");
  if (isLatex) {
    element.classList.add("has-latex-tooltip");
    element.classList.remove("twm-has-tooltip");
    element.setAttribute("data-latex-tooltip", text);
  } else {
    element.classList.add("twm-has-tooltip");
    element.classList.remove("has-latex-tooltip");
    element.setAttribute("data-tooltip", text);
  }
}
function refreshTooltips(container = document) {
  container.querySelectorAll(".twm-has-tooltip, .has-latex-tooltip").forEach((el3) => {
    el3.removeAttribute("title");
  });
}
var TooltipService = {
  show: showTooltip,
  hide: hideTooltip,
  set: setTooltip,
  refresh: refreshTooltips,
  init: initializeTooltips
};
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTooltips);
  } else {
    initializeTooltips();
  }
}
if (typeof window !== "undefined") {
  window.LatexTooltip = TooltipService;
}
export {
  ACTIONS,
  ALERT_LEVELS,
  ActionDropdown,
  AutocompleteField,
  COLUMN_FIT,
  CONVERSATION_COMPOSER_MAX_PX,
  CONVERSATION_PIN_WITHIN_PX,
  CellEditorHost,
  CellSelection,
  ColorField,
  ColorListField,
  ComponentBase,
  ControllerBase,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_TYPES,
  DEFAULT_WINDOW_STORAGE_KEY,
  DataTable,
  DocumentOutline,
  DragReorder,
  FactTable,
  HelpModal,
  ISO_DATE,
  ISO_DATETIME,
  MORE_WITHIN_PX,
  ManagedWindow,
  MenuBar,
  NotificationCenter,
  NotificationHistory,
  PAGING_HARD_LIMIT,
  PAGING_SOFT_LIMIT,
  PROGRESS_ITEM_STATES,
  PROGRESS_STATES,
  PageBase,
  ProgressBar,
  ProgressList,
  ROW_CONTROL_SELECTOR,
  RecordList,
  SCALAR_TYPES,
  SETTINGS_TEXT_DEBOUNCE_MS,
  STEP_STATES,
  SettingsView,
  SlideOutPanel,
  SliderField,
  SortableList,
  StagedHistory,
  StepProgress,
  TAB_LEVELS,
  ToggleField,
  TooltipService,
  TreeView,
  WindowChromeController,
  WindowTaskbar,
  Wizard,
  ago,
  attachInlineRenamer,
  barCovered,
  createAlertLog,
  createChipsFilter,
  createDetailHeader,
  createDocumentOutline,
  createFactTable,
  createMenuBar,
  createRafResizeObserver,
  createRecordList,
  createScrollLock,
  createSectionStack,
  createTableStateStore,
  createTabs,
  createTagInput,
  createTextEditor,
  createTreeCategory,
  createTreeItem,
  createTreeNode,
  dayLabel,
  detectSeries,
  endsTextSelection,
  filterTree,
  fitColumns,
  formatDate,
  formatDuration,
  formatElapsed,
  getToastBus,
  helpCategories,
  helpCopy,
  helpProvider,
  hideContextMenu,
  installAutoScrollbars,
  installCollapsibleScrollbars,
  installHelpShortcut,
  installOverlayScrollbar,
  installTabsScrollbars,
  installWorkspaceScrollbars,
  isHexColor,
  isRowActivation,
  isRowControl,
  localSource,
  matchDateFilter,
  matchDurationFilter,
  modalHost,
  mountAlertsPane,
  mountAttributeListEditor,
  mountConversationView,
  mountGalleryPicker,
  normalizeHex,
  normalizeLevel,
  openConfirm,
  openForm,
  openModal,
  parseDatePeriod,
  parseDateValue,
  parseDuration,
  projectSeries,
  refTypesFor,
  renderMarkdown,
  reportBridgeError,
  resolvePaging,
  revealInStrip,
  selectItem,
  setHelpProvider,
  setModalHost,
  setToastBus,
  settingsViewContent,
  showAboutDialog,
  showChoiceDialog,
  showCloseConfirmDialog,
  showComputingWindow,
  showConfirmDialog,
  showContextMenu,
  showDeleteConfirmDialog,
  showRunProgressDialog,
  showSelectDialog,
  suppressNativeContextMenu,
  thumbGeometry,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarn,
  toggleCategory,
  toggleNode,
  updateDetailHeader,
  wheelStripSideways,
  worstLevel
};
//# sourceMappingURL=widgets.js.map
