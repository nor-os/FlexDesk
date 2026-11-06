import {
  openPopover
} from "./chunk-DNJ3N4T4.js";
import {
  PROGRESS_ITEM_STATES,
  PROGRESS_STATES,
  ProgressBar,
  ProgressList,
  STEP_STATES,
  StepProgress,
  formatElapsed,
  getToastBus,
  mountJobProgress,
  reportBridgeError,
  setToastBus,
  showChoiceDialog,
  showCloseConfirmDialog,
  showConfirmDialog,
  showDeleteConfirmDialog,
  showRunProgressDialog,
  showSelectDialog,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarn
} from "./chunk-3BLIVOFD.js";
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
} from "./chunk-HKPB6OFA.js";
import {
  TAB_LEVELS,
  createTabs
} from "./chunk-HYJYYEPK.js";
import {
  ComponentBase,
  SlideOutPanel
} from "./chunk-UKP22RUG.js";
import {
  ActionDropdown
} from "./chunk-PAI2ZUWV.js";
import {
  ColorListField,
  SortableList,
  hideContextMenu,
  openConfirm,
  openForm,
  openModal,
  showContextMenu
} from "./chunk-NFZJ6P42.js";
import {
  ACTIONS,
  AutocompleteField,
  CELL_EDITORS,
  CellEditorHost,
  CellSelection,
  DEFAULT_HISTORY_LIMIT,
  DataTable,
  EDITOR_MESSAGES,
  ISO_DATE,
  ISO_DATETIME,
  PAGING_HARD_LIMIT,
  PAGING_SOFT_LIMIT,
  StagedHistory,
  attachInlineRenamer,
  createBoolEditor,
  createChipsFilter,
  createChoiceEditor,
  createDateTimeEditor,
  createMultiTextEditor,
  createNumberEditor,
  createRafResizeObserver,
  createTextEditor,
  dateOrder,
  detectSeries,
  editorTypeOf,
  formatDate,
  formatDateTimeForEdit,
  formatDuration,
  formatNumberForEdit,
  fromTSV,
  matchDateFilter,
  matchDurationFilter,
  normalizeOptions,
  numberSeparators,
  parseBool,
  parseChoice,
  parseDatePeriod,
  parseDateTime,
  parseDateValue,
  parseDuration,
  parseNumber,
  projectSeries,
  resolvePaging,
  toTSV,
  tsvCell
} from "./chunk-QRBOIUU3.js";
import {
  ROW_CONTROL_SELECTOR,
  endsTextSelection,
  isRowActivation,
  isRowControl
} from "./chunk-VLOAI3HS.js";
import {
  ColorField,
  DEFAULT_MAX_SAVED_WINDOWS,
  DEFAULT_WINDOW_STORAGE_KEY,
  ManagedWindow,
  ToggleField,
  attachInputOptions,
  createCombobox,
  createOptionList,
  fireEvent,
  isHexColor,
  normalizeHex
} from "./chunk-HL3IIHU3.js";
import {
  choiceSections,
  filterSections,
  findChoice,
  flatChoices,
  isInAnchoredLayer,
  modalHost,
  openAnchoredLayer,
  positionAnchored,
  selectBox,
  setModalHost,
  shownValue
} from "./chunk-Q7BALEPX.js";
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
import "./chunk-QXAOTGCC.js";
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
      const day2 = dayLabel(entry.at, now);
      if (day2 !== lastDay) rows.push(el3("div", "twm-alerts__day", day2));
      lastDay = day2;
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
        const node2 = document.createElement("option");
        node2.value = o.id;
        node2.textContent = o.label;
        if (o.id === item[field]) node2.selected = true;
        el3.appendChild(node2);
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
    const arr2 = Array.isArray(item[field]) ? item[field] : [];
    el3.value = arr2.join(", ");
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

// src/ui/components/category_picker.js
var _seq2 = 0;
function _terms(query) {
  return String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
}
function _haystack(item) {
  const kw = Array.isArray(item.keywords) ? item.keywords.join(" ") : item.keywords || "";
  return `${item.label || ""} ${item.description || ""} ${kw}`.toLowerCase();
}
function _el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
var CategoryPicker = class {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.trigger - The element the picker opens from; its click toggles it
   * @param {Array} config.categories - `[{ id, label, color?, items: [{ id, label, icon?, badge?,
   *     description?, preview?, keywords? }] }]`. `icon` is a Material Symbols ligature; `badge` a
   *     short text drawn as a monospace badge in the category's colour; `preview` is text shown
   *     monospace in the detail pane; `keywords` (array or string) are searched but not shown.
   * @param {Function} config.onSelect - `(item, category)` when an item is picked
   * @param {string} [config.className=''] - Additional CSS class for the popover
   * @param {string} [config.placeholder='Search…'] - The search field's placeholder
   * @param {string} [config.addLabel='Add'] - The detail pane's button
   * @param {string} [config.previewLabel] - A caption over the preview block (none when omitted)
   * @param {'start'|'end'} [config.align='start'] - Which trigger edge it lines up with first
   * @param {string} [config.label='Pick'] - The popover's accessible name (its `aria-label`)
   */
  constructor(config) {
    this.trigger = config.trigger;
    this.categories = config.categories || [];
    this.onSelect = config.onSelect;
    this.className = config.className || "";
    this.placeholder = config.placeholder ?? "Search\u2026";
    this.addLabel = config.addLabel ?? "Add";
    this.previewLabel = config.previewLabel || "";
    this.align = config.align === "end" ? "end" : "start";
    this.label = config.label || "Pick";
    this.isOpen = false;
    this.el = null;
    this._id = `twm-category-picker-${++_seq2}`;
    this._query = "";
    this._activeCat = 0;
    this._column = "items";
    this._hl = null;
    this._rows = [];
    this._onDocClick = this._onDocClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onTriggerClick = this._onTriggerClick.bind(this);
    if (!this.trigger) {
      console.warn("[CategoryPicker] No trigger element provided");
      return;
    }
    this._build();
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.addEventListener("click", this._onTriggerClick);
  }
  // ── DOM ────────────────────────────────────────────────────────────────
  _build() {
    const root = _el("div", `twm-category-picker ${this.className}`.trim());
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", this.label);
    root.hidden = true;
    root.addEventListener("mousedown", (e) => {
      if (e.target !== this._input) e.preventDefault();
    });
    const search = _el("div", "twm-category-picker__search");
    const input = _el("input", "twm-category-picker__input");
    input.type = "search";
    input.placeholder = this.placeholder;
    input.setAttribute("aria-label", this.placeholder || "Search");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", `${this._id}-items`);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => this._setQuery(input.value));
    search.appendChild(input);
    const body = _el("div", "twm-category-picker__body");
    const cats = _el("div", "twm-category-picker__categories twm-category-picker__column");
    cats.id = `${this._id}-cats`;
    cats.setAttribute("role", "listbox");
    cats.setAttribute("aria-label", "Categories");
    const items = _el("div", "twm-category-picker__items twm-category-picker__column");
    items.id = `${this._id}-items`;
    items.setAttribute("role", "listbox");
    items.setAttribute("aria-label", "Items");
    const detail = _el("div", "twm-category-picker__detail");
    body.append(cats, items, detail);
    root.append(search, body);
    document.body.appendChild(root);
    this.el = root;
    this._input = input;
    this._catsEl = cats;
    this._itemsEl = items;
    this._detailEl = detail;
    this._render();
  }
  /** The items column's entries: the active category's items, or every hit for the query. */
  _visible() {
    const terms = _terms(this._query);
    if (!terms.length) {
      const cat = this.categories[this._activeCat];
      return (cat?.items || []).map((_, i) => ({ c: this._activeCat, i }));
    }
    const out = [];
    this.categories.forEach((cat, c) => (cat.items || []).forEach((item, i) => {
      const hay = _haystack(item);
      if (terms.every((t) => hay.includes(t))) out.push({ c, i });
    }));
    return out;
  }
  /** Rebuild both lists and the detail pane. Hover never calls this. */
  _render() {
    if (!this.el) return;
    const searching = _terms(this._query).length > 0;
    const visible = this._visible();
    const hits = /* @__PURE__ */ new Map();
    for (const v of visible) hits.set(v.c, (hits.get(v.c) || 0) + 1);
    if (!this._hl || !visible.some((v) => v.c === this._hl.c && v.i === this._hl.i)) {
      this._hl = visible[0] ? { ...visible[0] } : null;
    }
    if (searching && this._hl) this._activeCat = this._hl.c;
    this._catsEl.replaceChildren();
    this.categories.forEach((cat, c) => {
      const btn = _el("button", "twm-category-picker__category");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.id = `${this._id}-cat-${c}`;
      btn.setAttribute("role", "option");
      btn.dataset.index = String(c);
      if (cat.color) btn.style.setProperty("--twm-category-picker-color", cat.color);
      const count = searching ? hits.get(c) || 0 : (cat.items || []).length;
      if (searching && !count) btn.classList.add("twm-category-picker__category--empty");
      btn.append(
        _el("span", "twm-category-picker__dot"),
        _el("span", "twm-category-picker__category-label", cat.label),
        _el("span", "twm-category-picker__count", String(count))
      );
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this._column = "categories";
        this._chooseCategory(c);
        this._input.focus();
      });
      this._catsEl.appendChild(btn);
    });
    this._itemsEl.replaceChildren();
    this._rows = [];
    let lastCat = -1;
    let into = this._itemsEl;
    for (const v of visible) {
      const cat = this.categories[v.c];
      const item = cat.items[v.i];
      if (searching && v.c !== lastCat) {
        const header = _el("div", "twm-category-picker__group");
        header.id = `${this._id}-group-${v.c}`;
        if (cat.color) header.style.setProperty("--twm-category-picker-color", cat.color);
        header.append(_el("span", "twm-category-picker__dot"), _el("span", null, cat.label));
        into = _el("div", "twm-category-picker__hits");
        into.setAttribute("role", "group");
        into.setAttribute("aria-labelledby", header.id);
        into.appendChild(header);
        this._itemsEl.appendChild(into);
        lastCat = v.c;
      }
      const btn = _el("button", "twm-category-picker__item");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.id = `${this._id}-item-${v.c}-${v.i}`;
      btn.setAttribute("role", "option");
      btn.dataset.category = String(v.c);
      btn.dataset.index = String(v.i);
      if (cat.color) btn.style.setProperty("--twm-category-picker-color", cat.color);
      if (item.icon) {
        btn.appendChild(_el("span", "material-symbols-outlined twm-category-picker__icon", item.icon));
      } else {
        btn.appendChild(_el("span", "twm-category-picker__badge", item.badge ?? ""));
      }
      btn.appendChild(_el("span", "twm-category-picker__item-label", item.label));
      btn.addEventListener("mouseenter", () => this._highlight(v));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this._column = "items";
        this._highlight(v);
        this._input.focus();
      });
      btn.addEventListener("dblclick", (e) => {
        e.preventDefault();
        this._pick(v);
      });
      this._rows.push({ ...v, el: btn });
      into.appendChild(btn);
    }
    if (!visible.length) {
      this._itemsEl.appendChild(_el(
        "div",
        "twm-category-picker__empty",
        searching ? `Nothing matches \u201C${this._query.trim()}\u201D.` : "Nothing here."
      ));
    }
    this._paintState();
  }
  /** Classes and ARIA for the active category, the highlight and the current column; the detail pane. */
  _paintState() {
    const searching = _terms(this._query).length > 0;
    [...this._catsEl.children].forEach((btn, c) => {
      const on = c === this._activeCat;
      btn.classList.toggle("twm-category-picker__category--active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    for (const r of this._rows) {
      const on = !!this._hl && r.c === this._hl.c && r.i === this._hl.i;
      r.el.classList.toggle("twm-category-picker__item--highlighted", on);
      r.el.setAttribute("aria-selected", on ? "true" : "false");
    }
    const column = searching ? "items" : this._column;
    this._catsEl.classList.toggle("twm-category-picker__column--current", column === "categories");
    this._itemsEl.classList.toggle("twm-category-picker__column--current", column === "items");
    const hlRow = this._rows.find((r) => this._hl && r.c === this._hl.c && r.i === this._hl.i);
    const activeCatEl = this._catsEl.children[this._activeCat];
    const current = column === "categories" ? activeCatEl : hlRow?.el;
    this._input.setAttribute("aria-controls", column === "categories" ? this._catsEl.id : this._itemsEl.id);
    if (current) this._input.setAttribute("aria-activedescendant", current.id);
    else this._input.removeAttribute("aria-activedescendant");
    hlRow?.el.scrollIntoView?.({ block: "nearest" });
    activeCatEl?.scrollIntoView?.({ block: "nearest" });
    this._renderDetail();
  }
  _renderDetail() {
    const d = this._detailEl;
    d.replaceChildren();
    const item = this._hl ? this.categories[this._hl.c]?.items?.[this._hl.i] : null;
    if (item) {
      d.appendChild(_el("div", "twm-category-picker__title", item.label));
      if (item.description) d.appendChild(_el("div", "twm-category-picker__description", item.description));
      if (item.preview != null && item.preview !== "") {
        if (this.previewLabel) d.appendChild(_el("div", "twm-category-picker__preview-label", this.previewLabel));
        d.appendChild(_el("pre", "twm-category-picker__preview", String(item.preview)));
      }
    } else {
      d.appendChild(_el("div", "twm-category-picker__detail-empty", "Nothing selected."));
    }
    const add = _el("button", "twm-btn twm-btn--primary twm-category-picker__add", this.addLabel);
    add.type = "button";
    add.disabled = !item;
    add.addEventListener("click", (e) => {
      e.preventDefault();
      if (this._hl) this._pick(this._hl);
    });
    d.appendChild(add);
  }
  // ── State changes ──────────────────────────────────────────────────────
  _setQuery(q) {
    this._query = String(q || "");
    if (_terms(this._query).length) {
      this._hl = null;
    } else if (this._hl) {
      this._activeCat = this._hl.c;
    }
    this._render();
  }
  _highlight(v) {
    if (!v) return;
    this._hl = { c: v.c, i: v.i };
    if (_terms(this._query).length) this._activeCat = v.c;
    this._paintState();
  }
  /** Make category `c` the active one. Browsing: show its items. Searching: jump to its first hit. */
  _chooseCategory(c) {
    if (c < 0 || c >= this.categories.length) return;
    if (_terms(this._query).length) {
      const first2 = this._rows.find((r) => r.c === c);
      if (first2) this._highlight(first2);
      return;
    }
    this._activeCat = c;
    this._hl = (this.categories[c].items || []).length ? { c, i: 0 } : null;
    this._render();
  }
  _moveHighlight(dir) {
    if (!this._rows.length) return;
    let at = this._rows.findIndex((r) => this._hl && r.c === this._hl.c && r.i === this._hl.i);
    at = at < 0 ? dir > 0 ? 0 : this._rows.length - 1 : (at + dir + this._rows.length) % this._rows.length;
    this._highlight(this._rows[at]);
  }
  _pick(v) {
    const category = this.categories[v.c];
    const item = category?.items?.[v.i];
    if (!item) return;
    const onSelect = this.onSelect;
    this.close();
    this.trigger?.focus();
    onSelect?.(item, category);
  }
  // ── Events ─────────────────────────────────────────────────────────────
  _onTriggerClick(e) {
    e.preventDefault();
    e.stopPropagation();
    this.toggle();
  }
  _onDocClick(e) {
    if (!this.isOpen) return;
    if (this.el?.contains(e.target) || this.trigger?.contains(e.target)) return;
    this.close();
  }
  _onKeydown(e) {
    if (!this.isOpen) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      this.trigger?.focus();
      return;
    }
    if (!this.el.contains(e.target)) return;
    const searching = _terms(this._query).length > 0;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        if (!searching && this._column === "categories") {
          const n = this.categories.length;
          if (n) this._chooseCategory((this._activeCat + dir + n) % n);
        } else {
          this._moveHighlight(dir);
        }
        break;
      }
      case "ArrowRight":
      case "ArrowLeft":
        if (searching) return;
        e.preventDefault();
        this._column = e.key === "ArrowRight" ? "items" : "categories";
        if (this._column === "items" && !this._hl) this._moveHighlight(1);
        this._paintState();
        break;
      case "Enter":
        e.preventDefault();
        if (this._hl) this._pick(this._hl);
        break;
      case "Tab": {
        e.preventDefault();
        e.stopPropagation();
        const add = this._detailEl.querySelector(".twm-category-picker__add");
        const stops = [this._input, ...add && !add.disabled ? [add] : []];
        const at = stops.indexOf(e.target);
        const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
        stops[next].focus();
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== this._input) {
          this._input.focus();
        }
    }
  }
  // ── Public API ─────────────────────────────────────────────────────────
  /** Open it under (or above) the trigger, with an empty query and focus in the search field. */
  open() {
    if (this.isOpen || !this.el) return;
    this.isOpen = true;
    this._input.value = "";
    this._query = "";
    this._column = "items";
    this.el.hidden = false;
    this.position();
    this._render();
    this.trigger?.classList.add("twm-is-open");
    this.trigger?.setAttribute("aria-expanded", "true");
    document.addEventListener("click", this._onDocClick, true);
    document.addEventListener("keydown", this._onKeydown, true);
    this._input.focus();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.el) this.el.hidden = true;
    this.trigger?.classList.remove("twm-is-open");
    this.trigger?.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", this._onDocClick, true);
    document.removeEventListener("keydown", this._onKeydown, true);
  }
  /** @param {boolean} [force] */
  toggle(force) {
    const want = typeof force === "boolean" ? force : !this.isOpen;
    if (want) this.open();
    else this.close();
  }
  /** Place it against the trigger again (after the trigger moved). */
  position() {
    if (!this.el || !this.trigger) return;
    ActionDropdown.position(this.trigger, this.el, { align: this.align });
    this.el.style.overflowY = "hidden";
  }
  /**
   * Replace the categories. The active category and the highlight are
   * looked up again by `id`, so they are kept when they still exist,
   * wherever they moved to.
   */
  setCategories(categories) {
    const oldCat = this.categories[this._activeCat];
    const oldHlCat = this._hl ? this.categories[this._hl.c] : null;
    const oldHlItem = oldHlCat?.items?.[this._hl.i];
    this.categories = categories || [];
    const catAt = (cat) => cat ? this.categories.findIndex((c) => c.id === cat.id) : -1;
    const active = catAt(oldCat);
    this._activeCat = active >= 0 ? active : 0;
    this._hl = null;
    const hc = catAt(oldHlCat);
    if (hc >= 0 && oldHlItem) {
      const hi = (this.categories[hc].items || []).findIndex((it) => it.id === oldHlItem.id);
      if (hi >= 0) this._hl = { c: hc, i: hi };
    }
    if (this.el) this._render();
  }
  destroy() {
    this.close();
    this.trigger?.removeEventListener("click", this._onTriggerClick);
    this.el?.remove();
    this.el = null;
    this.trigger = null;
    this.categories = [];
    this.onSelect = null;
  }
};

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
  for (const [idxs, low2] of steps) {
    const over = total() - avail;
    if (over <= 1e-6) break;
    lowerTo(widths, idxs, low2, over);
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
function lowerTo(widths, idxs, low2, over) {
  const floorOf = (i) => Math.min(widths[i], Math.max(0, low2(i)));
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
    // BUG-0053. A status window opened by the program, not by the user:
    // it must not take focus from what the user is doing.
    focusOnOpen: false,
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

// src/ui/components/chat_state_machine.js
var CHAT_STATES = Object.freeze({
  IDLE: "idle",
  WAITING: "waiting",
  STREAMING: "streaming",
  ERROR: "error"
});
var CHAT_TRANSITIONS = Object.freeze({
  SEND: "chat:message:send",
  STREAM_START: "chat:stream:start",
  STREAM_COMPLETE: "chat:stream:complete",
  CANCEL: "chat:cancel",
  ERROR: "chat:error",
  RESET: "chat:reset"
});
var CHAT_BUS_EVENTS = Object.freeze({
  STATE_CHANGED: "chat:state:changed",
  MESSAGE_SENT: "chat:message:sent",
  STREAM_COMPLETE: "chat:stream:completed",
  MODE_CHANGED: "chat:mode:changed",
  CONVERSATION_NEW: "chat:conversation:new",
  CONVERSATION_LOADED: "chat:conversation:loaded",
  ERROR: "chat:error:raised"
});
var ChatStateMachine = class {
  #machine;
  #eventBus;
  #onChange;
  #queue = Promise.resolve();
  #conversationId = null;
  #mode;
  #lastError = null;
  /**
   * @param {object}   [deps]
   * @param {object}   [deps.eventBus]  gets `CHAT_BUS_EVENTS`
   * @param {object}   [deps.logger]
   * @param {?string}  [deps.mode]      the mode to start in
   * @param {Function} [deps.onChange]  `({ state, conversationId, mode })` on every state entered
   */
  constructor({ eventBus = null, logger = null, mode = null, onChange = null } = {}) {
    this.#eventBus = eventBus;
    this.#onChange = onChange;
    this.#mode = mode;
    const entered = () => this.#entered();
    const send = {
      target: CHAT_STATES.WAITING,
      guard: (ctx) => !!ctx.payload?.message,
      action: (ctx) => this.#messageSent(ctx.payload)
    };
    const inFlight = {
      [CHAT_TRANSITIONS.STREAM_COMPLETE]: {
        target: CHAT_STATES.IDLE,
        action: (ctx) => this.#emit(CHAT_BUS_EVENTS.STREAM_COMPLETE, {
          conversationId: this.#conversationId,
          ...ctx.payload
        })
      },
      [CHAT_TRANSITIONS.CANCEL]: { target: CHAT_STATES.IDLE },
      [CHAT_TRANSITIONS.ERROR]: {
        target: CHAT_STATES.ERROR,
        action: (ctx) => this.#failed(ctx.payload)
      },
      [CHAT_TRANSITIONS.RESET]: { target: CHAT_STATES.IDLE }
    };
    this.#machine = new StateMachine({
      name: "chat",
      initialState: CHAT_STATES.IDLE,
      eventBus,
      logger,
      states: {
        [CHAT_STATES.IDLE]: {
          onEnter: () => {
            this.#lastError = null;
            entered();
          },
          transitions: { [CHAT_TRANSITIONS.SEND]: send }
        },
        [CHAT_STATES.WAITING]: {
          onEnter: entered,
          transitions: {
            [CHAT_TRANSITIONS.STREAM_START]: { target: CHAT_STATES.STREAMING },
            ...inFlight
          }
        },
        [CHAT_STATES.STREAMING]: { onEnter: entered, transitions: inFlight },
        [CHAT_STATES.ERROR]: {
          onEnter: entered,
          transitions: {
            [CHAT_TRANSITIONS.RESET]: { target: CHAT_STATES.IDLE },
            [CHAT_TRANSITIONS.SEND]: send
          }
        }
      }
    });
  }
  getState() {
    return this.#machine.getState();
  }
  get conversationId() {
    return this.#conversationId;
  }
  set conversationId(id) {
    this.#conversationId = id ?? null;
  }
  get mode() {
    return this.#mode;
  }
  get lastError() {
    return this.#lastError;
  }
  setMode(mode) {
    this.#mode = mode;
    this.#emit(CHAT_BUS_EVENTS.MODE_CHANGED, { mode });
  }
  /** Resolves when every call so far has taken effect. */
  settled() {
    return this.#queue;
  }
  sendMessage(message, conversationId = this.#conversationId) {
    this.#conversationId = conversationId ?? null;
    return this.#transition(CHAT_TRANSITIONS.SEND, { message });
  }
  streamStart() {
    return this.#transition(CHAT_TRANSITIONS.STREAM_START);
  }
  /** @param {object} [payload] goes out with `CHAT_BUS_EVENTS.STREAM_COMPLETE` */
  streamComplete(payload = {}) {
    return this.#transition(CHAT_TRANSITIONS.STREAM_COMPLETE, payload);
  }
  cancel() {
    return this.#transition(CHAT_TRANSITIONS.CANCEL);
  }
  error(message, detail = null) {
    return this.#transition(CHAT_TRANSITIONS.ERROR, { message, detail });
  }
  reset() {
    return this.#transition(CHAT_TRANSITIONS.RESET);
  }
  /** Back to idle with no conversation, whatever the state. */
  newConversation() {
    this.#conversationId = null;
    return this.#enqueue(async () => {
      await this.#machine.reset(CHAT_STATES.IDLE);
      this.#emit(CHAT_BUS_EVENTS.CONVERSATION_NEW, {});
    });
  }
  /** Back to idle on a kept conversation, whatever the state. */
  loadConversation(conversationId) {
    this.#conversationId = conversationId ?? null;
    return this.#enqueue(async () => {
      await this.#machine.reset(CHAT_STATES.IDLE);
      this.#emit(CHAT_BUS_EVENTS.CONVERSATION_LOADED, { conversationId });
    });
  }
  canSend() {
    const state = this.getState();
    return state === CHAT_STATES.IDLE || state === CHAT_STATES.ERROR;
  }
  isProcessing() {
    const state = this.getState();
    return state === CHAT_STATES.WAITING || state === CHAT_STATES.STREAMING;
  }
  #transition(event, payload) {
    return this.#enqueue(() => this.#machine.transition(event, payload));
  }
  /** One step after the last; a step that fails rejects its own promise and not the next one's. */
  #enqueue(step) {
    const run = this.#queue.then(step);
    this.#queue = run.then(() => void 0, () => void 0);
    return run;
  }
  #messageSent({ message }) {
    this.#lastError = null;
    this.#emit(CHAT_BUS_EVENTS.MESSAGE_SENT, {
      conversationId: this.#conversationId,
      text: message,
      mode: this.#mode
    });
  }
  #failed({ message, detail }) {
    this.#lastError = message;
    this.#emit(CHAT_BUS_EVENTS.ERROR, { conversationId: this.#conversationId, message, detail });
  }
  #entered() {
    const change = { state: this.getState(), conversationId: this.#conversationId, mode: this.#mode };
    this.#onChange?.(change);
    this.#emit(CHAT_BUS_EVENTS.STATE_CHANGED, change);
  }
  #emit(name, payload) {
    this.#eventBus?.emit(name, payload);
  }
};

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
  function remove(id) {
    const entry = entries.get(id);
    if (!entry) return false;
    if (streamId === id) streamId = null;
    entries.delete(id);
    entry.row.remove();
    settle();
    return true;
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
    remove,
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

// src/ui/components/chat_shell.js
var CHAT_TRANSPORT_EVENTS = Object.freeze({
  TEXT_DELTA: "text-delta",
  TOOL_USE: "tool-use",
  MESSAGE_END: "message-end",
  ERROR: "error"
});
var CHAT_SHELL_LABELS = Object.freeze({
  send: "Send",
  cancel: "Cancel",
  jump: "Jump to latest",
  input: "Message",
  conversations: "Conversations",
  newConversation: "New chat",
  add: "New conversation",
  clear: "Clear conversation",
  clearTitle: "Clear conversation",
  clearMessage: "Clear this conversation? This cannot be undone.",
  clearOk: "Clear",
  clearCancel: "Cancel",
  rename: "Conversation name",
  modes: "Mode",
  selectModel: "Select model...",
  typing: "The assistant is replying",
  copy: "Copy message",
  retry: "Retry",
  retryTitle: "Send the message again",
  unknownError: "Unknown error"
});
var TITLE_CHARS = 30;
var COPIED_MS = 1500;
var TOOL_ICONS = Object.freeze({ running: "build", done: "check", error: "error", stopped: "block" });
var defaultTitle = (text) => text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS)}...` : text;
function defaultTime(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function mountChatShell(host, {
  transport,
  renderControls = null,
  markdown = {},
  onChange = null,
  onConversationChange = null,
  modes = [],
  mode = null,
  onModeChange = null,
  models = null,
  onModelSelect = null,
  onModelAction = null,
  conversations = null,
  titleFrom = defaultTitle,
  formatTime = defaultTime,
  placeholder = "",
  welcome = null,
  labels = {},
  eventBus = null,
  logger = null
} = {}) {
  if (typeof transport?.send !== "function") {
    throw new TypeError("mountChatShell: a transport with send(request, emit) is required");
  }
  const text = { ...CHAT_SHELL_LABELS, ...labels };
  const doc = host.ownerDocument;
  const el3 = (tag, cls, content) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (content !== void 0) n.textContent = content;
    return n;
  };
  const icon2 = (name, cls = "") => {
    const i = el3("span", `material-symbols-outlined ${cls}`.trim(), name);
    i.setAttribute("aria-hidden", "true");
    return i;
  };
  const button3 = (cls, title) => {
    const b = el3("button", cls);
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    return b;
  };
  const safely = (fn, ...args) => {
    try {
      return fn?.(...args);
    } catch (error) {
      logger?.error?.("chat-shell", "A callback threw", { error });
      return void 0;
    }
  };
  let destroyed = false;
  let turn = null;
  let runEnding = null;
  const extras = /* @__PURE__ */ new Map();
  const copyTimers = /* @__PURE__ */ new Set();
  const modeIds = modes.map((m) => m.id);
  const machine = new ChatStateMachine({
    eventBus,
    logger,
    mode: modeIds.includes(mode) ? mode : modeIds[0] ?? null,
    onChange: ({ state }) => {
      if (!destroyed) showState(state);
    }
  });
  const root = el3("div", "twm-chat-shell");
  const tabBar = el3("div", "twm-chat-shell__tab-bar");
  const tabsHost = el3("div", "twm-chat-shell__tabs");
  const addBtn = button3("twm-chat-shell__tab-btn", text.add);
  addBtn.append(icon2("add"));
  const clearBtn = button3("twm-chat-shell__tab-btn twm-chat-shell__tab-btn--clear", text.clear);
  clearBtn.append(icon2("delete_sweep"));
  tabBar.append(tabsHost, addBtn, clearBtn);
  const conversationHost = el3("div", "twm-chat-shell__conversation");
  const bar = el3("div", "twm-chat-shell__bar");
  root.append(tabBar, conversationHost, bar);
  host.append(root);
  const view = mountConversationView(conversationHost, {
    render: drawBody,
    onSubmit: (value) => send(value),
    onCancel: () => cancel(),
    onRenderError: (error, message) => logger?.error?.("chat-shell", "Could not draw a message", { error, message }),
    placeholder,
    labels: { send: text.send, cancel: text.cancel, jump: text.jump, input: text.input }
  });
  const welcomeEl = welcome ? el3("div", "twm-chat-shell__welcome") : null;
  if (welcomeEl) {
    if (welcome.icon) welcomeEl.append(icon2(welcome.icon, "twm-chat-shell__welcome-icon"));
    welcomeEl.append(el3("p", "twm-chat-shell__welcome-text", welcome.text ?? ""));
    view.root.querySelector(".twm-chat__viewport").prepend(welcomeEl);
  }
  const syncWelcome = () => {
    if (welcomeEl) welcomeEl.hidden = view.messages().length > 0;
  };
  function showState(state) {
    const busy = state === CHAT_STATES.WAITING || state === CHAT_STATES.STREAMING;
    view.setBusy(busy);
    addBtn.disabled = busy;
    clearBtn.disabled = busy;
  }
  function drawBody(message, body, { streaming }) {
    if (message.role !== "assistant") {
      body.textContent = message.text;
      return;
    }
    if (streaming && !message.text) {
      const dots = el3("span", "twm-chat-shell__typing");
      dots.setAttribute("role", "img");
      dots.setAttribute("aria-label", text.typing);
      dots.append(el3("span"), el3("span"), el3("span"));
      body.append(dots);
      return;
    }
    body.innerHTML = renderMarkdown(message.text, markdown);
  }
  const viewMessage = (id) => view.messages().find((m) => m.id === id) ?? null;
  function kept({ id, role, text: body }) {
    const { at, tools, meta } = extras.get(id) ?? {};
    const message = { id, role, text: body };
    if (at) message.at = at;
    if (tools?.length) message.tools = tools.map((t) => ({ ...t }));
    if (meta !== void 0) message.meta = meta;
    return message;
  }
  function keptMessages() {
    const streaming = view.streamingId();
    return view.messages().filter((m) => m.id !== streaming || m.text || extras.get(m.id)?.tools.length).map(kept);
  }
  function register(id, { at, tools = [], meta }) {
    const entry = {
      at,
      tools,
      meta,
      toolsEl: el3("div", "twm-chat-shell__tools"),
      controlsEl: el3("div", "twm-chat-shell__controls"),
      footerEl: el3("div", "twm-chat-shell__footer")
    };
    extras.set(id, entry);
    view.slot(id).append(entry.toolsEl, entry.controlsEl, entry.footerEl);
    return entry;
  }
  function drawTools(id) {
    const entry = extras.get(id);
    entry.toolsEl.replaceChildren(...entry.tools.map((tool) => {
      const row = el3("div", `twm-chat-shell__tool twm-chat-shell__tool--${tool.status}`);
      row.append(
        icon2(TOOL_ICONS[tool.status], "twm-chat-shell__tool-icon"),
        el3("span", "twm-chat-shell__tool-label", tool.label ?? tool.name)
      );
      return row;
    }));
  }
  function drawControls(id) {
    const message = viewMessage(id);
    const entry = extras.get(id);
    if (!renderControls || !message || !entry) return;
    if (message.role !== "assistant" || id === view.streamingId()) return;
    entry.controlsEl.replaceChildren();
    safely(renderControls, entry.controlsEl, kept(message), chat);
  }
  function copyButton(id) {
    const copy = button3("twm-chat-shell__copy", text.copy);
    const glyph2 = icon2("content_copy");
    copy.append(glyph2);
    copy.addEventListener("click", () => {
      Promise.resolve().then(() => doc.defaultView.navigator.clipboard.writeText(viewMessage(id)?.text ?? "")).then(() => {
        copy.classList.add("twm-chat-shell__copy--done");
        glyph2.textContent = "check";
        const timer = setTimeout(() => {
          copyTimers.delete(timer);
          copy.classList.remove("twm-chat-shell__copy--done");
          glyph2.textContent = "content_copy";
        }, COPIED_MS);
        copyTimers.add(timer);
      }).catch((error) => logger?.warn?.("chat-shell", "Could not copy a message", { error }));
    });
    return copy;
  }
  function retryable(id, list) {
    const last = list.at(-1);
    if (last?.id !== id || last.role !== "error") return null;
    return list.slice(0, -1).reverse().find((m) => m.role === "user") ?? null;
  }
  function drawFooter(id, list = view.messages()) {
    const entry = extras.get(id);
    entry.footerEl.replaceChildren();
    if (id === view.streamingId()) return;
    const user = retryable(id, list);
    if (user) {
      const retry = el3("button", "twm-chat-shell__retry");
      retry.type = "button";
      retry.title = text.retryTitle;
      retry.append(icon2("refresh"), doc.createTextNode(text.retry));
      retry.addEventListener("click", () => send(user.text));
      entry.footerEl.append(retry);
    }
    const message = list.find((m) => m.id === id);
    const time = entry.at ? safely(formatTime, entry.at, kept(message)) : "";
    if (time) entry.footerEl.append(el3("span", "twm-chat-shell__time", time));
    entry.footerEl.append(copyButton(id));
  }
  const follow = () => {
    if (view.isPinned()) view.scrollToBottom();
  };
  function redrawFailures() {
    const list = view.messages();
    for (const { id, role } of list) if (role === "error") drawFooter(id, list);
  }
  function appendMessage(role, body) {
    const id = view.append({ role, text: body });
    register(id, { at: (/* @__PURE__ */ new Date()).toISOString() });
    redrawFailures();
    drawFooter(id);
    follow();
    return id;
  }
  const newTab = (id) => ({
    id,
    title: text.newConversation,
    conversationId: null,
    messages: [],
    scrollTop: null
  });
  const tabs = [];
  let activeId = null;
  let nextTab = 1;
  const tabOf = (id) => tabs.find((t) => t.id === String(id)) ?? null;
  const activeTab = () => tabOf(activeId);
  function freshTab() {
    let id;
    do
      id = `chat-${nextTab++}`;
    while (tabOf(id));
    const tab = newTab(id);
    tabs.push(tab);
    return tab;
  }
  function restored(messages) {
    return (messages ?? []).filter((m) => m && typeof m.role === "string").map((m) => {
      const tools = m.tools?.map((t) => t.status === "running" ? { ...t, status: "stopped" } : { ...t });
      return tools ? { ...m, tools } : { ...m };
    });
  }
  const strip = createTabs(tabsHost, {
    items: [],
    compact: true,
    label: text.conversations,
    onSelect: (id) => {
      if (id == null || id === activeId) return;
      switchTo(id);
      if (strip.active() !== activeId) strip.update(tabItems(), activeId);
    },
    onClose: (id) => close(id)
  });
  function tabItems() {
    const closable = tabs.length > 1;
    return tabs.map(({ id, title }) => ({ id, label: title, title, closable }));
  }
  const drawTabs = () => strip.update(tabItems(), activeId);
  function beginRename(id, tabEl) {
    if (tabBar.querySelector(".twm-chat-shell__rename")) return;
    const original = tabOf(id)?.title ?? "";
    const barRect = tabBar.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    const input = el3("input", "twm-chat-shell__rename");
    input.type = "text";
    input.value = original;
    input.spellcheck = false;
    input.setAttribute("aria-label", text.rename);
    input.style.left = `${Math.max(0, tabRect.left - barRect.left)}px`;
    input.style.width = `${Math.max(tabRect.width, 120)}px`;
    tabBar.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      input.remove();
      const name = input.value.trim();
      if (commit && name && name !== original) rename(id, name);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(e.key === "Enter");
    });
    input.addEventListener("blur", () => finish(true));
  }
  const renameTarget = (e) => {
    const tab = e.target.closest?.(".twm-tabs__tab");
    if (tab) beginRename(tab.dataset.tabId, tab);
  };
  strip.root.addEventListener("dblclick", renameTarget);
  strip.root.addEventListener("keydown", (e) => {
    if (e.key === "F2") renameTarget(e);
  });
  function stash() {
    const tab = activeTab();
    tab.messages = keptMessages();
    tab.scrollTop = view.getScrollTop();
  }
  function showTab(tab) {
    const messages = restored(tab.messages);
    extras.clear();
    view.replaceAll(messages.map(({ id, role, text: body }) => ({ id, role, text: body })));
    const list = view.messages();
    list.forEach(({ id }, i) => {
      const { at, tools, meta } = messages[i];
      register(id, { at, tools: tools ?? [], meta });
      drawTools(id);
      drawControls(id);
      drawFooter(id, list);
    });
    if (tab.scrollTop !== null) view.setScrollTop(tab.scrollTop);
    else view.scrollToBottom();
    syncWelcome();
  }
  function snapshot() {
    stash();
    return {
      activeId,
      tabs: tabs.map(({ id, title, conversationId, messages }) => ({
        id,
        title,
        conversationId,
        messages: messages.map((m) => ({ ...m }))
      }))
    };
  }
  const changed = () => {
    if (onChange) safely(onChange, snapshot());
  };
  function bringToFront(tab, reason) {
    activeId = tab.id;
    if (tab.conversationId) machine.loadConversation(tab.conversationId);
    else machine.newConversation();
    showTab(tab);
    drawTabs();
    const { id, title, conversationId } = tab;
    safely(onConversationChange, { id, title, conversationId, messages: restored(tab.messages) }, reason);
    changed();
  }
  function newConversation() {
    if (turn) return null;
    stash();
    const tab = freshTab();
    bringToFront(tab, "new");
    return tab.id;
  }
  function switchTo(id) {
    const tab = tabOf(id);
    if (turn || !tab || tab.id === activeId) return false;
    stash();
    bringToFront(tab, "switch");
    return true;
  }
  function close(id) {
    const tab = tabOf(id);
    if (!tab || tabs.length <= 1 || turn && tab.id === activeId) return false;
    const wasActive = tab.id === activeId;
    tabs.splice(tabs.indexOf(tab), 1);
    if (wasActive) {
      bringToFront(tabs[0], "close");
    } else {
      drawTabs();
      changed();
    }
    return true;
  }
  function rename(id, title) {
    const tab = tabOf(id);
    const name = String(title ?? "").trim();
    if (!tab || !name) return false;
    tab.title = name;
    drawTabs();
    changed();
    return true;
  }
  function reset() {
    if (turn) return false;
    const tab = activeTab();
    Object.assign(tab, { title: text.newConversation, conversationId: null, messages: [], scrollTop: null });
    bringToFront(tab, "reset");
    return true;
  }
  addBtn.addEventListener("click", () => newConversation());
  clearBtn.addEventListener("click", async () => {
    if (view.messages().length > 0) {
      const confirmed = await showConfirmDialog({
        title: text.clearTitle,
        message: text.clearMessage,
        icon: "delete_sweep",
        okLabel: text.clearOk,
        cancelLabel: text.clearCancel,
        okVariant: "danger"
      });
      if (!confirmed || destroyed) return;
    }
    reset();
  });
  function send(value) {
    const message = String(value ?? "").trim();
    if (!message || turn) return false;
    const tab = activeTab();
    appendMessage("user", message);
    if (tab.title === text.newConversation) {
      const title = safely(titleFrom, message);
      if (title) {
        tab.title = String(title);
        drawTabs();
      }
    }
    const replyId = view.beginStream({ role: "assistant" });
    register(replyId, { at: (/* @__PURE__ */ new Date()).toISOString() });
    redrawFailures();
    syncWelcome();
    const token = {};
    const request = {
      text: message,
      tabId: tab.id,
      conversationId: tab.conversationId,
      mode: machine.mode,
      model: currentModels.activeId ?? null
    };
    const current = { token, replyId, request, started: false, sent: false };
    turn = current;
    machine.sendMessage(message, tab.conversationId);
    changed();
    const emit = (event) => {
      if (turn?.token === token) handle(event);
    };
    const fail = (error) => emit({ type: CHAT_TRANSPORT_EVENTS.ERROR, message: error?.message ?? String(error) });
    const start = () => {
      current.sent = true;
      try {
        Promise.resolve(transport.send(request, emit)).catch(fail);
      } catch (error) {
        fail(error);
      }
    };
    if (runEnding) runEnding.then(() => {
      if (turn === current) start();
    });
    else start();
    return true;
  }
  function handle(event) {
    switch (event?.type) {
      case CHAT_TRANSPORT_EVENTS.TEXT_DELTA:
        if (!event.text) return;
        markStarted();
        view.appendChunk(event.text);
        return;
      case CHAT_TRANSPORT_EVENTS.TOOL_USE:
        markStarted();
        useTool(event);
        return;
      case CHAT_TRANSPORT_EVENTS.MESSAGE_END:
        endMessage(event);
        return;
      case CHAT_TRANSPORT_EVENTS.ERROR:
        failTurn(event);
        return;
      default:
        logger?.warn?.("chat-shell", "Unknown transport event", { event });
    }
  }
  function markStarted() {
    if (turn.started) return;
    turn.started = true;
    machine.streamStart();
  }
  function useTool({ id, name, label, status = "running" }) {
    const entry = extras.get(turn.replyId);
    const known = status in TOOL_ICONS ? status : "running";
    const tool = id != null ? entry.tools.find((t) => t.id === id) : null;
    if (tool) {
      Object.assign(tool, { status: known, name: name ?? tool.name, label: label ?? tool.label });
    } else {
      entry.tools.push({ id: id ?? `tool-${entry.tools.length + 1}`, name, label, status: known });
    }
    drawTools(turn.replyId);
    follow();
  }
  function closeReply(toolStatus) {
    const id = turn.replyId;
    turn = null;
    const entry = extras.get(id);
    for (const tool of entry.tools) if (tool.status === "running") tool.status = toolStatus;
    if (!viewMessage(id).text && !entry.tools.length && entry.meta === void 0) {
      view.remove(id);
      extras.delete(id);
      return;
    }
    view.endStream();
    drawTools(id);
    drawControls(id);
    drawFooter(id);
    follow();
  }
  function endMessage({ text: final, conversationId, meta }) {
    const id = turn.replyId;
    const entry = extras.get(id);
    if (final && !viewMessage(id).text) view.appendChunk(final);
    if (meta !== void 0) entry.meta = { ...entry.meta ?? {}, ...meta };
    if (conversationId) setConversationId(activeId, conversationId);
    const reply = viewMessage(id).text;
    closeReply("done");
    machine.streamComplete({ text: reply, meta: entry.meta });
    syncWelcome();
    changed();
  }
  function failTurn({ message }) {
    const body = message || text.unknownError;
    closeReply("stopped");
    machine.error(body);
    appendMessage("error", body);
    syncWelcome();
    changed();
  }
  function cancel() {
    if (!turn) return false;
    const { request, sent } = turn;
    closeReply("stopped");
    machine.cancel();
    if (sent) callCancel(request);
    else runEnding = null;
    syncWelcome();
    changed();
    return true;
  }
  function callCancel(request) {
    const failed = (error) => logger?.warn?.("chat-shell", "Cancel failed", { error });
    try {
      const ended = transport.cancel?.(request);
      if (typeof ended?.then !== "function") return;
      const ending = Promise.resolve(ended).catch(failed).then(() => {
        if (runEnding === ending) runEnding = null;
      });
      runEnding = ending;
    } catch (error) {
      failed(error);
    }
  }
  function setConversationId(tabId, conversationId) {
    const tab = tabOf(tabId);
    if (!tab) return false;
    tab.conversationId = conversationId ?? null;
    if (tab.id === activeId) machine.conversationId = tab.conversationId;
    return true;
  }
  function setMessages(tabId, messages) {
    const tab = tabOf(tabId);
    if (!tab || turn && tab.id === activeId) return false;
    tab.messages = restored(messages);
    tab.scrollTop = null;
    if (tab.id === activeId) showTab(tab);
    changed();
    return true;
  }
  const modeButtons = /* @__PURE__ */ new Map();
  if (modes.length) {
    const group = el3("div", "twm-chat-shell__modes");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", text.modes);
    for (const { id, label, title } of modes) {
      const b = el3("button", "twm-chat-shell__mode", label);
      b.type = "button";
      if (title) b.title = title;
      b.addEventListener("click", () => {
        if (id === machine.mode) return;
        setMode(id);
        safely(onModeChange, id);
      });
      modeButtons.set(id, b);
      group.append(b);
    }
    bar.append(group);
  }
  function drawMode() {
    for (const [id, b] of modeButtons) {
      const on = id === machine.mode;
      b.classList.toggle("twm-chat-shell__mode--on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }
  function setMode(id) {
    if (!modeButtons.has(id)) return false;
    machine.setMode(id);
    drawMode();
    return true;
  }
  drawMode();
  bar.append(el3("div", "twm-chat-shell__bar-spacer"));
  let currentModels = { items: [], activeId: null, label: null, status: null };
  const modelBtn = el3("button", "twm-chat-shell__model-btn");
  modelBtn.type = "button";
  modelBtn.setAttribute("aria-haspopup", "menu");
  modelBtn.setAttribute("aria-expanded", "false");
  const modelDot = el3("span", "twm-chat-shell__status");
  const modelLabel = el3("span", "twm-chat-shell__model-label");
  modelBtn.append(modelDot, modelLabel, icon2("expand_more", "twm-chat-shell__model-chevron"));
  bar.append(modelBtn);
  const asMarkup = (value) => {
    const span = el3("span");
    span.textContent = String(value ?? "");
    return span.innerHTML;
  };
  const modelMenu = new ActionDropdown({
    trigger: modelBtn,
    options: [],
    className: "twm-chat-shell__model-menu",
    onSelect: ({ item }) => {
      if (item.action !== void 0) safely(onModelAction, item.action, item);
      else safely(onModelSelect, item);
    }
  });
  function setModels(patch = {}) {
    currentModels = { ...currentModels, ...patch };
    const { items, activeId: active, label, status } = currentModels;
    modelMenu.setOptions(items.map((item) => {
      if (item.separator) return { separator: true };
      const isAction = item.action !== void 0;
      const radio = item.id === active ? "radio_button_checked" : "radio_button_unchecked";
      return {
        type: isAction ? "action" : "model",
        item,
        label: asMarkup(item.label),
        icon: item.icon ?? (isAction ? void 0 : radio),
        description: item.description ? asMarkup(item.description) : void 0
      };
    }));
    modelLabel.textContent = label ?? items.find((i) => !i.separator && i.id === active)?.label ?? text.selectModel;
    modelDot.className = status?.state ? `twm-chat-shell__status twm-chat-shell__status--${status.state}` : "twm-chat-shell__status";
    modelDot.title = status?.label ?? "";
    modelDot.hidden = !status;
    modelBtn.hidden = !items.length && !label;
    bar.hidden = modelBtn.hidden && !modes.length;
  }
  setModels(models ?? {});
  const chat = {
    root,
    /** Sends as the user would; false when a turn is running or the text is blank. */
    send,
    /** Stops the running reply; false when there is none. */
    cancel,
    /** A turn is running. Answers at once, where `stateMachine` follows in microtasks. */
    isBusy: () => turn !== null,
    stateMachine: machine,
    /** The messages of the conversation in front. */
    messages: keptMessages,
    /** Merges into a message's `meta`, redraws its controls, and reports a change. */
    updateMeta(id, patch) {
      const entry = extras.get(id);
      if (!entry) return false;
      entry.meta = { ...entry.meta ?? {}, ...patch };
      drawControls(id);
      changed();
      return true;
    },
    refreshControls: (id) => drawControls(id),
    /** The element holding a message's controls, or null. */
    controlsSlot: (id) => extras.get(id)?.controlsEl ?? null,
    snapshot,
    activeConversation: () => activeId,
    newConversation,
    switchTo,
    close,
    rename,
    reset,
    setConversationId,
    setMessages,
    mode: () => machine.mode,
    setMode,
    setModels,
    getText: () => view.getText(),
    setText: (value) => view.setText(value),
    focus: () => view.focus(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (turn) {
        const { request } = turn;
        turn = null;
        callCancel(request);
      }
      for (const timer of copyTimers) clearTimeout(timer);
      copyTimers.clear();
      extras.clear();
      modelMenu.destroy();
      strip.destroy();
      view.destroy();
      root.remove();
    }
  };
  for (const saved of conversations?.tabs ?? []) {
    tabs.push({
      ...newTab(String(saved.id)),
      title: saved.title || text.newConversation,
      conversationId: saved.conversationId ?? null,
      messages: restored(saved.messages)
    });
  }
  const first2 = tabOf(conversations?.activeId) ?? tabs[0] ?? freshTab();
  activeId = first2.id;
  if (first2.conversationId) machine.loadConversation(first2.conversationId);
  showTab(first2);
  drawTabs();
  return chat;
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

// src/ui/components/filter_model.js
var OPERATOR_LIST = [
  { id: "is", label: "is", arity: 1 },
  { id: "is_not", label: "is not", arity: 1 },
  { id: "contains", label: "contains", arity: 1 },
  { id: "not_contains", label: "does not contain", arity: 1 },
  { id: "starts_with", label: "starts with", arity: 1 },
  { id: "ends_with", label: "ends with", arity: 1 },
  { id: "gt", label: ">", arity: 1 },
  { id: "lt", label: "<", arity: 1 },
  { id: "gte", label: ">=", arity: 1 },
  { id: "lte", label: "<=", arity: 1 },
  { id: "between", label: "between", arity: 2 },
  { id: "before", label: "before", arity: 1 },
  { id: "after", label: "after", arity: 1 },
  { id: "in_last_days", label: "in the last N days", arity: 1, input: "days" },
  { id: "one_of", label: "one of", arity: 1, multi: true },
  { id: "none_of", label: "none of", arity: 1, multi: true },
  { id: "all_of", label: "all of", arity: 1, multi: true },
  { id: "is_empty", label: "is empty", arity: 0 },
  { id: "is_not_empty", label: "is not empty", arity: 0 },
  { id: "is_null", label: "has no value", arity: 0 },
  { id: "is_not_null", label: "has a value", arity: 0 },
  { id: "is_true", label: "is true", arity: 0 },
  { id: "is_false", label: "is false", arity: 0 }
];
var FILTER_OPERATORS = Object.freeze(
  Object.fromEntries(OPERATOR_LIST.map((o) => [o.id, Object.freeze(o)]))
);
var FILTER_TYPE_OPERATORS = Object.freeze({
  enum: Object.freeze(["is", "is_not", "one_of", "none_of", "is_empty", "is_not_empty"]),
  text: Object.freeze([
    "is",
    "is_not",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "one_of",
    "none_of",
    "is_empty",
    "is_not_empty"
  ]),
  number: Object.freeze([
    "is",
    "is_not",
    "gt",
    "lt",
    "gte",
    "lte",
    "between",
    "one_of",
    "none_of",
    "is_empty",
    "is_not_empty"
  ]),
  date: Object.freeze([
    "is",
    "is_not",
    "before",
    "after",
    "between",
    "in_last_days",
    "is_empty",
    "is_not_empty"
  ]),
  set: Object.freeze([
    "contains",
    "not_contains",
    "one_of",
    "none_of",
    "all_of",
    "is_empty",
    "is_not_empty"
  ]),
  bool: Object.freeze(["is_true", "is_false", "is_empty"])
});
var emptyFilter = () => ({ kind: "group", op: "AND", children: [] });
var cloneFilter = (expr) => expr == null ? expr : JSON.parse(JSON.stringify(expr));
var serializeFilter = (expr) => JSON.stringify(expr);
function parseFilter(text) {
  const expr = JSON.parse(text);
  if (!expr || typeof expr !== "object" || Array.isArray(expr) || !expr.kind) {
    throw new Error("[FilterModel] not a filter expression");
  }
  return expr;
}
function countConditions(node2) {
  if (!node2) return 0;
  if (node2.kind !== "group") return 1;
  return (node2.children || []).reduce((n, child) => n + countConditions(child), 0);
}
function filterOptions(field) {
  return (field?.options || []).map((o) => {
    if (o === null || typeof o !== "object") return { value: o, label: String(o ?? "") };
    const value = o.value ?? o.id ?? "";
    return { value, label: String(o.label ?? value) };
  });
}
var EXACT_DIGITS = 15;
function significantDigits(text) {
  const [whole, fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const lead = whole.replace(/^0+/, "");
  const tail = fraction.replace(/0+$/, "");
  return lead ? lead.length + tail.length : tail.replace(/^0+/, "").length;
}
function coerceFilterValue(field, raw) {
  if (typeof raw !== "string" || field?.type !== "number") return raw;
  const text = raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return raw;
  if (significantDigits(text) > EXACT_DIGITS) return raw;
  const value = Number(text);
  if (value === 0 && /[1-9]/.test(text)) return raw;
  return value;
}
var low = (v) => String(v ?? "").trim().toLowerCase();
var num = (v) => v === "" || v === null || v === void 0 ? NaN : Number(v);
var arr = (v) => Array.isArray(v) ? v : v === "" || v === null || v === void 0 ? [] : [v];
var first = (v) => Array.isArray(v) ? v[0] : v;
function day(v) {
  const s = String(v ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}
var instant = (v) => v === null || v === void 0 || v === "" ? NaN : Date.parse(String(v));
var todayUtc = () => {
  const d = /* @__PURE__ */ new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
var isBlank = (v) => v === null || v === void 0 || v === "" || Array.isArray(v) && v.length === 0;
var TO_TREE_OPERATOR = Object.freeze({
  is: "eq",
  is_not: "ne",
  one_of: "in",
  none_of: "not_in",
  is_empty: "is_blank",
  is_not_empty: "is_not_blank",
  before: "lt",
  after: "gt"
});
var FROM_TREE_OPERATOR = Object.freeze({
  eq: "is",
  ne: "is_not",
  in: "one_of",
  not_in: "none_of",
  is_blank: "is_empty",
  is_not_blank: "is_not_empty"
});
var isBareNode = (node2) => node2 !== null && typeof node2 === "object";
function toConditionTree(node2) {
  if (!isBareNode(node2)) return node2;
  if (node2.kind === "clause") {
    const { kind: _kind2, field, op: op2, ...rest2 } = node2;
    return { column: field, operator: TO_TREE_OPERATOR[op2] ?? op2, ...rest2 };
  }
  if (node2.kind !== "group") return node2.kind === "opaque" ? node2.node : node2;
  const { kind: _kind, op, negate, children, ...rest } = node2;
  const list = (children || []).map(toConditionTree);
  const treeOp = String(op).toLowerCase();
  if (!negate) return { op: treeOp, children: list, ...rest };
  return { op: "not", children: [list.length === 1 ? list[0] : { op: treeOp, children: list }], ...rest };
}
function fromConditionTree(node2) {
  if (node2 === null || node2 === void 0) return emptyFilter();
  if (!isBareNode(node2)) return { kind: "opaque", node: node2 };
  const op = String(node2.op ?? "").toLowerCase();
  if (!node2.op && "column" in node2) {
    const { column, operator, ...rest } = node2;
    const id = String(operator ?? "eq").toLowerCase();
    return { kind: "clause", field: column, op: FROM_TREE_OPERATOR[id] ?? id, ...rest };
  }
  if ((op === "and" || op === "or") && Array.isArray(node2.children ?? [])) {
    const { op: _op, children, ...rest } = node2;
    return { kind: "group", op: op.toUpperCase(), children: (children || []).map(fromConditionTree), ...rest };
  }
  if (op === "not" && Array.isArray(node2.children) && node2.children.length === 1) {
    const { op: _op, children, ...rest } = node2;
    const inner = fromConditionTree(children[0]);
    if (inner.kind === "group" && !inner.negate && inner.children.length !== 1) {
      return { ...inner, negate: true, ...rest };
    }
    return { kind: "group", op: "AND", negate: true, children: [inner], ...rest };
  }
  return { kind: "opaque", node: node2 };
}
var CACHE_MAX = 200;
function createFilterModel({
  fields,
  noun = "row",
  operators = [],
  emptyOr = "everything",
  unknownName = (key) => key
}) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const fieldByKey = (key) => byKey.get(key) || null;
  const catalogue = new Map(OPERATOR_LIST.map((o) => [o.id, o]));
  for (const o of operators) {
    const known = catalogue.get(o.id);
    if (!known && !Number.isInteger(o.arity)) {
      throw new Error(`[FilterModel] operator "${o.id}" needs an arity`);
    }
    catalogue.set(o.id, { ...known, ...o });
  }
  for (const f of fields) {
    for (const id of f.operators || []) {
      if (!catalogue.has(id)) {
        throw new Error(`[FilterModel] field "${f.key}" names unknown operator "${id}"`);
      }
    }
  }
  const operatorsFor = (fieldKey) => {
    const field = byKey.get(fieldKey);
    if (!field) return [];
    const ids = field.operators || FILTER_TYPE_OPERATORS[field.type] || [];
    return ids.map((id) => catalogue.get(id));
  };
  const operatorById = (id) => catalogue.get(id) || null;
  function defaultValue(field, op) {
    if (!field || !op || !op.arity) return void 0;
    if (op.multi) return [];
    if (op.input === "days") return 7;
    if (op.arity === 2) return field.type === "number" ? [null, null] : ["", ""];
    if (field.type === "number") return null;
    if (field.type === "enum") return filterOptions(field)[0]?.value ?? "";
    return "";
  }
  function newClause(key) {
    const field = key ? byKey.get(key) : fields.find((f) => !f.hidden);
    if (!field) return null;
    const op = operatorsFor(field.key)[0] || null;
    const clause = { kind: "clause", field: field.key, op: op ? op.id : "" };
    const value = defaultValue(field, op);
    if (value !== void 0) clause.value = value;
    return clause;
  }
  function valueFits(field, op, value) {
    const errors = [];
    validateClause({ field: field.key, op: op.id, value }, errors, "");
    if (errors.length) return false;
    const options = op.multi || field.type === "enum" ? filterOptions(field) : [];
    return !options.length || arr(value).every((v) => options.some((o) => o.value === v));
  }
  function moveClause(clause, key) {
    const next = newClause(key);
    if (!next) return null;
    const field = byKey.get(key);
    const op = operatorsFor(key).find((o) => o.id === clause.op);
    if (!op) return next;
    next.op = op.id;
    delete next.value;
    const value = op.arity && valueFits(field, op, clause.value) ? clause.value : defaultValue(field, op);
    if (value !== void 0) next.value = value;
    return next;
  }
  function compileClause(clause) {
    const field = byKey.get(clause?.field);
    if (!field) {
      console.warn("[FilterModel] clause references unknown field", clause?.field);
      return () => false;
    }
    const op = clause.op;
    const raw = clause.value;
    const get = field.get || ((row) => row?.[field.key]);
    const custom = catalogue.get(op)?.match;
    if (custom) return (row) => !!custom(get(row), raw, row);
    switch (op) {
      case "is_empty":
        return (r) => isBlank(get(r));
      case "is_not_empty":
        return (r) => !isBlank(get(r));
      case "is_null":
        return (r) => get(r) === null || get(r) === void 0;
      case "is_not_null":
        return (r) => get(r) !== null && get(r) !== void 0;
      case "is_true":
        return (r) => get(r) === true || low(get(r)) === "true";
      case "is_false":
        return (r) => get(r) === false || low(get(r)) === "false";
      default:
    }
    if (field.type === "number") {
      const a = num(first(raw));
      const b = num(Array.isArray(raw) ? raw[1] : void 0);
      const list = arr(raw).map(num);
      switch (op) {
        case "is":
          return (r) => num(get(r)) === a;
        case "is_not":
          return (r) => num(get(r)) !== a;
        case "gt":
          return (r) => num(get(r)) > a;
        case "lt":
          return (r) => num(get(r)) < a;
        case "gte":
          return (r) => num(get(r)) >= a;
        case "lte":
          return (r) => num(get(r)) <= a;
        case "between":
          return (r) => {
            const n = num(get(r));
            return n >= Math.min(a, b) && n <= Math.max(a, b);
          };
        case "one_of":
          return (r) => list.includes(num(get(r)));
        case "none_of":
          return (r) => !list.includes(num(get(r)));
        default:
      }
    }
    if (field.type === "date") {
      const at = field.time ? instant : day;
      const a = at(first(raw));
      const b = Array.isArray(raw) ? at(raw[1]) : NaN;
      const compare = (test) => (r) => {
        const d = at(get(r));
        return !Number.isNaN(d) && test(d);
      };
      switch (op) {
        case "is":
          return (r) => at(get(r)) === a;
        case "is_not":
          return (r) => at(get(r)) !== a;
        case "before":
        case "lt":
          return compare((d) => d < a);
        case "after":
        case "gt":
          return compare((d) => d > a);
        case "lte":
          return compare((d) => d <= a);
        case "gte":
          return compare((d) => d >= a);
        case "between":
          return compare((d) => d >= Math.min(a, b) && d <= Math.max(a, b));
        // Inclusive of today and of the Nth day back.
        case "in_last_days": {
          const days = num(first(raw));
          return (r) => {
            const d = day(get(r));
            if (Number.isNaN(d) || Number.isNaN(days)) return false;
            return d >= todayUtc() - (days - 1) * 864e5 && d <= todayUtc();
          };
        }
        default:
      }
    }
    const one = low(first(raw));
    const many = arr(raw).map(low).filter((s) => s !== "");
    if (field.type === "set") {
      const vals = (r) => arr(get(r)).map(low);
      switch (op) {
        case "contains":
          return (r) => vals(r).includes(one);
        case "not_contains":
          return (r) => !vals(r).includes(one);
        case "one_of":
          return (r) => {
            const v = vals(r);
            return many.some((m) => v.includes(m));
          };
        case "none_of":
          return (r) => {
            const v = vals(r);
            return !many.some((m) => v.includes(m));
          };
        case "all_of":
          return (r) => {
            const v = vals(r);
            return many.every((m) => v.includes(m));
          };
        default:
      }
    }
    if (field.type === "enum" || field.type === "text") {
      switch (op) {
        case "is":
          return (r) => low(get(r)) === one;
        case "is_not":
          return (r) => low(get(r)) !== one;
        case "contains":
          return (r) => low(get(r)).includes(one);
        case "not_contains":
          return (r) => !low(get(r)).includes(one);
        case "starts_with":
          return (r) => low(get(r)).startsWith(one);
        case "ends_with":
          return (r) => low(get(r)).endsWith(one);
        case "one_of":
          return (r) => many.includes(low(get(r)));
        case "none_of":
          return (r) => !many.includes(low(get(r)));
        default:
      }
    }
    console.warn("[FilterModel] clause uses an operator its field cannot run", op, field.key);
    return () => false;
  }
  const emptyMatches = (group) => String(group?.op).toUpperCase() !== "OR" || emptyOr === "everything";
  function compile(node2) {
    if (!node2) return () => true;
    if (node2.kind === "clause") return compileClause(node2);
    if (node2.kind !== "group") {
      console.warn("[FilterModel] cannot run a node of kind", node2.kind);
      return () => false;
    }
    const children = (Array.isArray(node2.children) ? node2.children : []).map(compile);
    const negate = !!node2.negate;
    if (!children.length) {
      const result = emptyMatches(node2) !== negate;
      return () => result;
    }
    const test = String(node2.op || "AND").toUpperCase() === "OR" ? (row) => children.some((c) => c(row)) : (row) => children.every((c) => c(row));
    return negate ? (row) => !test(row) : test;
  }
  const cache = /* @__PURE__ */ new Map();
  function matcherFor(expr) {
    const key = JSON.stringify(expr);
    const hit = cache.get(key);
    if (hit) return hit;
    const fn = compile(expr);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, fn);
    return fn;
  }
  const evaluateFilter = (expr, row) => matcherFor(expr)(row);
  function describeValue(field, op, value, format) {
    if (op.arity === 0) return "";
    const shown = (v) => format && v !== "" && v !== null && v !== void 0 ? format(v, field) : String(v ?? "");
    if (op.multi) return arr(value).map(shown).join(", ");
    if (op.arity === 2) {
      const [a, b] = arr(value);
      return `${shown(a)} and ${shown(b)}`;
    }
    return Array.isArray(value) ? value.map(shown).join(", ") : shown(value);
  }
  function describeNode(node2, depth, opts) {
    if (!node2) return "";
    if (node2.kind === "clause") {
      const field = byKey.get(node2.field);
      const op = catalogue.get(node2.op) ?? { label: node2.op ?? "", arity: 1 };
      const subject = field ? field.label : `\u26A0 unknown field \u201C${unknownName(String(node2.field ?? ""))}\u201D`;
      const value = describeValue(field, op, node2.value, field ? opts.formatValue : null);
      return [subject, op.label, value].filter(Boolean).join(" ");
    }
    if (node2.kind !== "group") return `\u26A0 ${JSON.stringify(node2.node ?? node2)}`;
    const parts = (Array.isArray(node2.children) ? node2.children : []).map((c) => describeNode(c, depth + 1, opts)).filter(Boolean);
    if (!parts.length) return emptyMatches(node2) !== !!node2.negate ? "everything" : "nothing";
    const joined = parts.join(String(node2.op || "AND").toUpperCase() === "OR" ? " OR " : " AND ");
    const many = parts.length > 1;
    if (opts.groupBrackets) {
      const group = many ? `(${joined})` : joined;
      return node2.negate ? `NOT ${group}` : group;
    }
    if (node2.negate) return `NOT (${joined})`;
    return depth > 0 && many ? `(${joined})` : joined;
  }
  const describeFilter = (expr, { formatValue = null, groupBrackets = false } = {}) => describeNode(expr, 0, { formatValue, groupBrackets });
  function unknownFields(expr) {
    const out = /* @__PURE__ */ new Set();
    const walk = (n) => {
      if (!n) return;
      if (n.kind === "clause") {
        if (!byKey.has(n.field)) out.add(n.field);
      } else if (n.kind === "group") {
        (Array.isArray(n.children) ? n.children : []).forEach(walk);
      }
    };
    walk(expr);
    return [...out];
  }
  function validateClause(node2, errors, path) {
    const field = byKey.get(node2.field);
    if (!field) {
      errors.push(`${path}: unknown field "${unknownName(String(node2.field ?? ""))}"`);
      return;
    }
    const op = operatorsFor(field.key).find((o) => o.id === node2.op);
    if (!op) {
      errors.push(`${field.label}: "${node2.op}" is not a valid operator`);
      return;
    }
    if (op.arity === 0) return;
    const say = (what) => errors.push(`${field.label} ${op.label}: ${what}`);
    if (op.multi && (!Array.isArray(node2.value) || node2.value.length === 0)) {
      say("pick at least one value");
      return;
    }
    const values = op.multi ? node2.value : op.arity === 2 ? arr(node2.value).slice(0, 2) : [first(node2.value)];
    const needed = op.arity === 2 ? 2 : 1;
    if (!op.multi && (values.length < needed || values.some(isBlank))) {
      say(needed === 2 ? "needs two values" : "needs a value");
      return;
    }
    if (op.input === "days") {
      if (!(num(values[0]) > 0)) say("value must be a positive number of days");
    } else if (field.type === "number") {
      if (values.some((v) => Number.isNaN(num(v)))) say("value must be a number");
    } else if (field.type === "date") {
      const at = field.time ? instant : day;
      if (values.some((v) => Number.isNaN(at(v)))) {
        say(field.time ? "value must be a date and time" : "value must be a date (YYYY-MM-DD)");
      }
    }
  }
  function validateNode(node2, errors, path) {
    if (!node2 || typeof node2 !== "object") {
      errors.push(`${path}: not an expression node`);
    } else if (node2.kind === "group") {
      if (node2.op !== "AND" && node2.op !== "OR") errors.push(`${path}: group op must be AND or OR`);
      if (!Array.isArray(node2.children)) {
        errors.push(`${path}: group children must be an array`);
        return;
      }
      node2.children.forEach((c, i) => validateNode(c, errors, `${path}/${i}`));
    } else if (node2.kind === "clause") {
      validateClause(node2, errors, path);
    } else {
      errors.push(`${path}: unknown node kind "${node2.kind}"`);
    }
  }
  function validateFilter(expr) {
    const errors = [];
    validateNode(expr, errors, "expr");
    return { ok: errors.length === 0, errors };
  }
  function partialRanges(expr) {
    const said = [];
    const walk = (node2) => {
      if (node2?.kind === "group") {
        (Array.isArray(node2.children) ? node2.children : []).forEach(walk);
        return;
      }
      if (node2?.kind !== "clause") return;
      const field = byKey.get(node2.field);
      const op = catalogue.get(node2.op);
      if (!field || op?.arity !== 2 || op.multi) return;
      const ends = arr(node2.value).slice(0, 2);
      const filled = ends.filter((v) => !isBlank(v)).length;
      if (filled === 1) said.push(`${field.label} ${op.label}: needs two values`);
    };
    walk(expr);
    return said;
  }
  function prune(node2) {
    if (!node2 || typeof node2 !== "object") return null;
    if (node2.kind === "clause") {
      const op = catalogue.get(node2.op);
      if (!op || !byKey.has(node2.field) || op.arity === 0) return node2;
      const blank = Array.isArray(node2.value) ? node2.value.every(isBlank) : isBlank(node2.value);
      return blank ? null : node2;
    }
    if (node2.kind !== "group") return node2;
    const children = (node2.children || []).map(prune).filter(Boolean);
    if (!children.length) return null;
    if (children.length === 1 && children[0].kind === "group" && !node2.negate) return children[0];
    return { ...node2, children };
  }
  const pruneFilter = (expr) => prune(cloneFilter(expr));
  return Object.freeze({
    fields,
    noun,
    fieldByKey,
    operatorsFor,
    operatorById,
    defaultValue,
    newClause,
    moveClause,
    emptyMatches,
    unknownName,
    matcherFor,
    evaluateFilter,
    describeFilter,
    validateFilter,
    unknownFields,
    pruneFilter,
    partialRanges
  });
}

// src/ui/components/tag_input.js
var optionValue = (o) => o !== null && typeof o === "object" ? o.value : o;
function createTagInput(host, options = {}) {
  if (!host || typeof host.appendChild !== "function") {
    throw new Error("[TagInput] host must be an HTMLElement");
  }
  const readOnly = !!options.readOnly;
  const allowDuplicates = !!options.allowDuplicates;
  const removeLabel = typeof options.removeLabel === "function" ? options.removeLabel : (tag) => `Remove ${tag}`;
  const spell = typeof options.normalise === "function" ? (text) => String(options.normalise(text.trim()) ?? "").trim() : (text) => text.trim();
  const cleaned = (list) => {
    const out = (Array.isArray(list) ? list : []).map((v) => v == null ? "" : spell(String(v))).filter((v) => v !== "");
    return allowDuplicates ? out : [...new Set(out)];
  };
  let tags = cleaned(options.value);
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
      const tag = spell(piece);
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
  const offered = (list) => {
    const seen = /* @__PURE__ */ new Set();
    const rows = [];
    for (const o of list || []) {
      const tag = spell(shownValue(optionValue(o)));
      if (tag === "" || seen.has(tag) || !allowDuplicates && tags.includes(tag)) continue;
      seen.add(tag);
      rows.push(o !== null && typeof o === "object" ? { ...o, value: tag } : tag);
    }
    return rows;
  };
  const rankedFor = () => {
    const needle = spell(input.value).toLowerCase();
    const word = (o) => shownValue(optionValue(o));
    const at = (o) => word(o).toLowerCase().indexOf(needle);
    return offered(options.suggestions).filter((o) => at(o) >= 0).sort((x, y) => at(x) - at(y) || word(x).localeCompare(word(y)));
  };
  const askedFor = (_query, ctx) => {
    const answer = options.suggestions(input.value, ctx);
    return typeof answer?.then === "function" ? answer.then(offered) : offered(answer);
  };
  const asking = typeof options.suggestions === "function";
  const menu = input && options.suggestions ? attachInputOptions(input, {
    options: asking ? askedFor : rankedFor,
    anchor: root,
    normalise: spell,
    openOnFocus: true,
    passEnter: true,
    debounce: asking ? void 0 : 0,
    onPick(option) {
      input.value = "";
      commitText(shownValue(option.value));
      input.focus();
    }
  }) : null;
  const commitInput = () => {
    if (!input) return;
    const text = input.value;
    input.value = "";
    menu?.close();
    commitText(text);
  };
  if (input) {
    input.addEventListener("keydown", (ev) => {
      if (ev.isComposing) return;
      if (ev.key === "," && menu?.takeActive()) {
        ev.preventDefault();
      } else if (ev.key === "Enter" || ev.key === ",") {
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
      tags = cleaned(list);
      paint();
    },
    focus() {
      input?.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      menu?.destroy();
      root.remove();
    }
  };
}

// src/ui/components/filter_builder.js
var PREVIEW_DEBOUNCE_MS = 120;
var ICON_COLUMNS = 8;
var SUBMIT = "submit";
var CLEAR = "clear";
function el(tag, className, text) {
  const node2 = document.createElement(tag);
  if (className) node2.className = className;
  if (text !== void 0 && text !== null) node2.textContent = String(text);
  return node2;
}
function button(className, text, onClick, { title, label } = {}) {
  const node2 = el("button", className, text);
  node2.type = "button";
  if (title) node2.title = title;
  if (label) node2.setAttribute("aria-label", label);
  node2.addEventListener("click", onClick);
  return node2;
}
var SELECT_CLASS = "twm-filter-builder__input twm-filter-builder__select";
var INPUT_CLASS = "twm-filter-builder__input";
var SMALL_BUTTON = "twm-btn twm-filter-builder__add";
var REMOVE_BUTTON = "twm-btn-icon twm-filter-builder__remove";
function asRoot(expr) {
  if (!expr || typeof expr !== "object") return emptyFilter();
  const copy = cloneFilter(expr);
  return copy.kind === "group" ? copy : { kind: "group", op: "AND", children: [copy] };
}
function createFilterBuilder(host, { model, value = null, onChange = null } = {}) {
  if (!model) throw new Error("[FilterBuilder] needs a filter model");
  const rootEl = el("div", "twm-filter-builder");
  let root = asRoot(value);
  let parents = /* @__PURE__ */ new WeakMap();
  let controls = /* @__PURE__ */ new WeakMap();
  const cells = /* @__PURE__ */ new Set();
  const changed = () => onChange?.(cloneFilter(root));
  const register = (node2, role, control) => {
    if (!controls.has(node2)) controls.set(node2, {});
    controls.get(node2)[role] = control;
  };
  function redraw(focusNode = null, focusRole = null) {
    for (const cell of cells) cell.dispose();
    cells.clear();
    parents = /* @__PURE__ */ new WeakMap();
    controls = /* @__PURE__ */ new WeakMap();
    rootEl.replaceChildren(groupEl(root, true));
    if (focusNode) controls.get(focusNode)?.[focusRole]?.focus();
  }
  function restructure(focusNode, focusRole) {
    redraw(focusNode, focusRole);
    changed();
  }
  function removeNode(node2) {
    let gone = node2;
    for (; ; ) {
      const parent = parents.get(gone);
      parent.children.splice(parent.children.indexOf(gone), 1);
      if (parent.children.length || !parents.has(parent)) return parent;
      gone = parent;
    }
  }
  const removeButton = (node2, label) => button(REMOVE_BUTTON, "\xD7", () => {
    restructure(removeNode(node2), "addClause");
  }, { title: label, label });
  function groupEl(group, isRoot) {
    if (!Array.isArray(group.children)) group.children = [];
    const box = el("div", `twm-filter-builder__group${isRoot ? " twm-filter-builder__group--root" : ""}`);
    const noun = model.noun;
    const head = el("div", "twm-filter-builder__group-head");
    const seg = el("div", "twm-filter-builder__seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Match mode");
    for (const op of ["AND", "OR"]) {
      const on = group.op === op;
      const toggle = button(`twm-filter-builder__seg-btn${on ? " twm-filter-builder__seg-btn--on" : ""}`, op, () => {
        if (group.op === op) return;
        group.op = op;
        restructure(group, op);
      });
      toggle.setAttribute("aria-pressed", String(on));
      register(group, op, toggle);
      seg.appendChild(toggle);
    }
    const not = button(`twm-filter-builder__not${group.negate ? " twm-filter-builder__not--on" : ""}`, "NOT", () => {
      if (group.negate) delete group.negate;
      else group.negate = true;
      restructure(group, "not");
    }, { title: "Invert this group" });
    not.setAttribute("aria-pressed", String(!!group.negate));
    register(group, "not", not);
    head.append(seg, not, el(
      "span",
      "twm-filter-builder__hint",
      group.op === "OR" ? "any condition matches" : "all conditions match"
    ));
    if (!isRoot) head.appendChild(removeButton(group, "Remove group"));
    box.appendChild(head);
    const children = el("div", "twm-filter-builder__children");
    for (const child of group.children) {
      parents.set(child, group);
      if (child?.kind === "group") children.appendChild(groupEl(child, false));
      else if (child?.kind === "clause") children.appendChild(clauseEl(child));
      else children.appendChild(carriedEl(child));
    }
    if (!group.children.length) {
      const matches = model.emptyMatches(group) !== !!group.negate;
      children.appendChild(el("div", "twm-filter-builder__empty", matches ? `No conditions: this group matches every ${noun}.` : `No conditions: this group matches no ${noun}.`));
    }
    box.appendChild(children);
    const foot = el("div", "twm-filter-builder__group-foot");
    const add = (factory, focusRole) => {
      const node2 = factory();
      if (!node2) return;
      group.children.push(node2);
      restructure(node2, focusRole);
    };
    const offerable = !!model.newClause();
    const addClause = button(SMALL_BUTTON, "+ Condition", () => add(() => model.newClause(), "field"));
    addClause.disabled = !offerable;
    register(group, "addClause", addClause);
    const addGroup = button(SMALL_BUTTON, "+ Group", () => add(
      () => ({ kind: "group", op: "AND", children: [model.newClause()] }),
      "addClause"
    ));
    addGroup.disabled = !offerable;
    foot.append(addClause, addGroup);
    box.appendChild(foot);
    return box;
  }
  function carriedEl(node2) {
    const row = el("div", "twm-filter-builder__row twm-filter-builder__row--carried");
    const text = el("span", "twm-filter-builder__carried", model.describeFilter(node2));
    text.title = "This editor cannot draw this condition. It is kept exactly as it is; remove it to drop it.";
    row.append(text, removeButton(node2, "Remove condition"));
    return row;
  }
  function fieldChoices(current) {
    const list = [];
    const groups = /* @__PURE__ */ new Map();
    for (const field of model.fields) {
      if (field.hidden && field.key !== current) continue;
      const option = { value: field.key, label: field.label };
      if (!field.group) {
        list.push(option);
      } else if (groups.has(field.group)) {
        groups.get(field.group).options.push(option);
      } else {
        const entry = { group: field.group, options: [option] };
        groups.set(field.group, entry);
        list.push(entry);
      }
    }
    return list;
  }
  function operatorChoices(clause) {
    const offered = model.operatorsFor(clause.field);
    const held = model.operatorById(clause.op);
    const list = held && !offered.includes(held) ? [...offered, held] : offered;
    return list.map((op) => ({ value: op.id, label: op.label }));
  }
  function clauseEl(clause) {
    const row = el("div", "twm-filter-builder__row");
    const known = !!model.fieldByKey(clause.field);
    const unknownWords = `\u26A0 unknown field \u201C${model.unknownName(String(clause.field ?? ""))}\u201D`;
    const fieldSelect = selectBox(fieldChoices(clause.field), clause.field, {
      label: "Field",
      className: `${SELECT_CLASS} twm-filter-builder__select--field${known ? "" : " twm-filter-builder__select--unknown"}`,
      notFound: () => unknownWords
    });
    if (!known) fieldSelect.box.title = unknownWords;
    fieldSelect.box.addEventListener("change", () => {
      const next = model.moveClause(clause, fieldSelect.valueOf());
      for (const key of ["op", "value"]) delete clause[key];
      Object.assign(clause, next);
      restructure(clause, "field");
    });
    register(clause, "field", fieldSelect.box);
    const opSelect = selectBox(operatorChoices(clause), clause.op, {
      label: "Operator",
      className: `${SELECT_CLASS} twm-filter-builder__select--op`,
      notFound: (id) => `${id} (unknown)`
    });
    opSelect.box.addEventListener("change", () => {
      clause.op = opSelect.valueOf();
      const fresh = model.defaultValue(model.fieldByKey(clause.field), model.operatorById(clause.op));
      if (fresh === void 0) delete clause.value;
      else clause.value = fresh;
      restructure(clause, "op");
    });
    register(clause, "op", opSelect.box);
    const cellEl = el("div", "twm-filter-builder__value");
    const cell = { dispose() {
    } };
    cells.add(cell);
    const drawCell = (focus = false) => {
      cell.dispose();
      cell.dispose = () => {
      };
      cellEl.replaceChildren();
      drawValue(clause, cellEl, cell, drawCell);
      if (focus) cellEl.querySelector("select, input")?.focus();
    };
    drawCell();
    row.append(fieldSelect.box, opSelect.box, cellEl, removeButton(clause, "Remove condition"));
    return row;
  }
  function drawValue(clause, cellEl, cell, drawCell) {
    const field = model.fieldByKey(clause.field);
    const op = model.operatorById(clause.op);
    if (!field || !op || op.arity && !model.operatorsFor(clause.field).includes(op)) {
      if (clause.value !== void 0) {
        cellEl.appendChild(el("span", "twm-filter-builder__carried", JSON.stringify(clause.value)));
      }
      return;
    }
    if (!op.arity) return;
    const write = (next) => {
      clause.value = next;
      changed();
    };
    const custom = field.editor?.({ field, op, value: clause.value, label: field.label, onChange: write });
    if (custom) {
      cellEl.appendChild(custom.el);
      cell.dispose = () => custom.destroy?.();
      return;
    }
    if (op.multi) {
      if (filterOptions(field).length) drawChosenOptions(clause, field, cellEl, drawCell, write);
      else drawTags(clause, field, cellEl, cell, write);
      return;
    }
    if (op.arity === 2) {
      const pair = Array.isArray(clause.value) ? [...clause.value] : ["", ""];
      const box = (i) => scalarInput(field, op, pair[i], (v) => {
        pair[i] = v;
        write([...pair]);
      });
      cellEl.append(box(0), el("span", "twm-filter-builder__and", "and"), box(1));
      return;
    }
    const options = field.type === "enum" ? filterOptions(field) : [];
    if (options.length) {
      const choice = selectBox(options, clause.value, {
        label: field.label,
        className: `${SELECT_CLASS} twm-filter-builder__select--value`,
        notFound: (v) => `${v} (unknown)`
      });
      if (clause.value === void 0 || clause.value === null || clause.value === "") {
        clause.value = choice.valueOf();
      }
      choice.box.addEventListener("change", () => write(choice.valueOf()));
      cellEl.appendChild(choice.box);
      return;
    }
    cellEl.appendChild(scalarInput(field, op, Array.isArray(clause.value) ? clause.value[0] : clause.value, write));
    if (op.input === "days") cellEl.appendChild(el("span", "twm-filter-builder__and", "days"));
  }
  function scalarInput(field, op, current, write) {
    const input = el("input", INPUT_CLASS);
    const numeric = field.type === "number" || op.input === "days";
    if (numeric) {
      input.type = "number";
      input.step = "any";
      if (op.input === "days") input.min = "0";
    } else if (field.type === "date") {
      input.type = field.time ? "datetime-local" : "date";
    } else {
      input.type = "text";
      input.placeholder = "value\u2026";
    }
    input.setAttribute("aria-label", field.label);
    input.value = current ?? "";
    const type = numeric ? { type: "number" } : field;
    input.addEventListener("input", () => write(coerceFilterValue(type, input.value)));
    return input;
  }
  function asList(value2) {
    if (Array.isArray(value2)) return value2;
    return value2 === "" || value2 === null || value2 === void 0 ? [] : [value2];
  }
  function drawTags(clause, field, cellEl, cell, write) {
    const tags = createTagInput(cellEl, {
      value: asList(clause.value).map(String),
      placeholder: "value\u2026",
      label: field.label,
      className: "twm-filter-builder__tags",
      onChange: (list) => write(list.map((v) => coerceFilterValue(field, v)))
    });
    cell.dispose = () => tags.dispose();
  }
  function drawChosenOptions(clause, field, cellEl, drawCell, write) {
    const options = filterOptions(field);
    const chosen = asList(clause.value);
    const labelOf = (v) => options.find((o) => o.value === v)?.label ?? String(v);
    const box = el("div", "twm-filter-builder__chosen");
    chosen.forEach((v, i) => {
      const chip = el("span", "twm-filter-builder__chip", labelOf(v));
      chip.appendChild(button("twm-filter-builder__chip-remove", "\xD7", () => {
        write(chosen.filter((_, at) => at !== i));
        drawCell(true);
      }, { label: `Remove ${labelOf(v)}` }));
      box.appendChild(chip);
    });
    const rest = options.filter((o) => !chosen.includes(o.value));
    if (rest.length) {
      const adder = selectBox(rest, void 0, {
        empty: "+ value",
        keepMissing: false,
        label: `Add a value to ${field.label}`,
        className: `${SELECT_CLASS} twm-filter-builder__select--add`
      });
      adder.box.addEventListener("change", () => {
        const next = adder.valueOf();
        if (next === void 0) return;
        write([...chosen, next]);
        drawCell(true);
      });
      box.appendChild(adder.box);
    }
    cellEl.appendChild(box);
  }
  redraw();
  host.appendChild(rootEl);
  return {
    el: rootEl,
    getValue: () => cloneFilter(root),
    /** Replaces the expression. Does not call `onChange`. */
    setValue(expr) {
      root = asRoot(expr);
      redraw();
    },
    validate: () => model.validateFilter(root),
    focus() {
      rootEl.querySelector("select, input, button")?.focus();
    },
    destroy() {
      for (const cell of cells) cell.dispose();
      cells.clear();
      rootEl.remove();
    }
  };
}
function createIconPicker({ value, options, onChange }) {
  let current = value;
  const root = el("div", "twm-filter-dialog__icon");
  const glyph2 = (name) => el("span", "material-symbols-outlined", name);
  const trigger = button("twm-btn twm-filter-dialog__icon-trigger", null, () => pop.hidden ? open() : close(), {
    title: "Icon",
    label: "Icon"
  });
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const face = glyph2(current);
  trigger.appendChild(face);
  const pop = el("div", "twm-filter-dialog__icon-pop");
  pop.hidden = true;
  const search = el("input", `${INPUT_CLASS} twm-filter-dialog__icon-search`);
  search.type = "text";
  search.placeholder = "Search icons\u2026";
  search.setAttribute("aria-label", "Search icons");
  const grid = el("div", "twm-filter-dialog__icon-grid");
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", "Icon");
  const none = el("div", "twm-filter-dialog__icon-none", "No icon matches.");
  pop.append(search, grid, none);
  root.append(trigger, pop);
  const pick = (name) => {
    current = name;
    face.textContent = name;
    close();
    onChange(name);
  };
  const drawGrid = () => {
    const query = search.value.trim().toLowerCase();
    const list = query ? options.filter((n) => n.toLowerCase().includes(query)) : options;
    none.hidden = list.length > 0;
    grid.replaceChildren(...list.map((name) => {
      const on = name === current;
      const option = button(
        `twm-filter-dialog__icon-option${on ? " twm-filter-dialog__icon-option--on" : ""}`,
        null,
        () => pick(name),
        { title: name }
      );
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(on));
      option.appendChild(glyph2(name));
      return option;
    }));
  };
  function open() {
    search.value = "";
    drawGrid();
    pop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.focus();
  }
  function close(refocus = true) {
    if (pop.hidden) return;
    pop.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (refocus) trigger.focus();
  }
  search.addEventListener("input", drawGrid);
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      grid.firstElementChild?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      grid.firstElementChild?.click();
    }
  });
  grid.addEventListener("keydown", (e) => {
    const items = [...grid.children];
    const at = items.indexOf(e.target.closest("button"));
    if (at < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: ICON_COLUMNS, ArrowUp: -ICON_COLUMNS }[e.key];
    if (step === void 0) return;
    e.preventDefault();
    if (at + step < 0 && e.key === "ArrowUp") search.focus();
    else items[at + step]?.focus();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  });
  return { el: root, close, value: () => current };
}
async function openFilterDialog({
  model,
  value = null,
  seedField = null,
  title = "Filter",
  icon: icon2 = "filter_alt",
  head = null,
  name = null,
  iconChoice = null,
  preview = null,
  requireValid = true,
  prune = false,
  confirmDiscard = false,
  dismissOnBackdrop = false,
  submitLabel = "Apply",
  onSubmit = null,
  clearLabel = null,
  actions = [],
  width = preview ? 920 : 760,
  height = 560
} = {}) {
  if (!model) throw new Error("[FilterDialog] needs a filter model");
  let start = asRoot(value);
  const seeded = seedField ? model.newClause(seedField) : null;
  if (seeded) {
    if (start.negate) start = { kind: "group", op: "AND", children: [start, seeded] };
    else start.children.push(seeded);
  }
  const content = el("div", "twm-filter-dialog");
  if (head) content.appendChild(head);
  let picker = null;
  let nameInput = null;
  if (name || iconChoice) {
    const row = el("div", "twm-filter-dialog__identity");
    if (name) {
      const label = el("label", "twm-filter-dialog__name");
      label.appendChild(el("span", "twm-filter-dialog__name-label", name.label ?? "Name"));
      nameInput = el("input", INPUT_CLASS);
      nameInput.type = "text";
      nameInput.autocomplete = "off";
      nameInput.value = name.value ?? "";
      if (name.placeholder) nameInput.placeholder = name.placeholder;
      nameInput.addEventListener("input", refresh);
      label.appendChild(nameInput);
      row.appendChild(label);
    }
    if (iconChoice) {
      picker = createIconPicker({
        value: iconChoice.value ?? iconChoice.options[0],
        options: iconChoice.options,
        onChange: refresh
      });
      row.appendChild(picker.el);
      content.addEventListener("mousedown", (e) => {
        if (!picker.el.contains(e.target)) picker.close(false);
      });
    }
    content.appendChild(row);
  }
  const columns = el("div", "twm-filter-dialog__columns");
  const buildPane = el("section", "twm-filter-dialog__pane twm-filter-dialog__pane--build");
  columns.appendChild(buildPane);
  content.appendChild(columns);
  const errorsEl = el("ul", "twm-filter-dialog__errors");
  errorsEl.hidden = true;
  const failureEl = el("div", "twm-filter-dialog__failure");
  failureEl.setAttribute("role", "alert");
  failureEl.hidden = true;
  let sentenceEl = null;
  let slot = null;
  if (preview) {
    const pane = el("section", "twm-filter-dialog__pane twm-filter-dialog__pane--preview");
    sentenceEl = el("div", "twm-filter-dialog__sentence");
    slot = el("div", "twm-filter-dialog__preview");
    pane.append(sentenceEl, errorsEl, slot);
    columns.appendChild(pane);
  }
  let previewTimer = 0;
  let previewRun = null;
  let controls = null;
  let busy = false;
  const builder = createFilterBuilder(buildPane, {
    model,
    value: start,
    onChange: () => {
      refresh();
      clearTimeout(previewTimer);
      previewTimer = setTimeout(drawPreview, PREVIEW_DEBOUNCE_MS);
    }
  });
  if (!preview) buildPane.appendChild(errorsEl);
  content.appendChild(failureEl);
  function current() {
    const expr = builder.getValue();
    return prune ? model.pruneFilter(expr) : expr;
  }
  const refusals = (expr) => {
    if (!expr) return [];
    return requireValid ? model.validateFilter(expr).errors : model.partialRanges(expr);
  };
  const nameMissing = () => !!nameInput && name.required !== false && !nameInput.value.trim();
  const canSubmit = () => !busy && !nameMissing() && !refusals(current()).length;
  function refresh() {
    if (!controls) return;
    for (const { value: value2 } of modalActions) {
      controls.setActionEnabled(value2, value2 === SUBMIT ? canSubmit() : !busy);
    }
  }
  function showErrors(errors) {
    errorsEl.replaceChildren(...errors.map((message) => el("li", "", message)));
    errorsEl.hidden = errors.length === 0;
  }
  function showFailure(message) {
    failureEl.textContent = message;
    failureEl.hidden = !message;
  }
  function drawPreview() {
    const expr = current();
    const errors = refusals(expr);
    previewRun?.abort();
    previewRun = null;
    const blocked = errors.length > 0;
    showErrors(errors);
    if (!preview) return;
    slot.hidden = blocked;
    if (blocked) {
      sentenceEl.textContent = "";
      slot.replaceChildren();
      return;
    }
    const shown = expr ?? emptyFilter();
    const sentence = model.describeFilter(shown);
    sentenceEl.textContent = sentence;
    previewRun = new AbortController();
    try {
      preview(slot, { expr: shown, sentence, signal: previewRun.signal });
    } catch (err) {
      showFailure(`Preview failed: ${err?.message ?? err}`);
    }
  }
  const snapshot = () => JSON.stringify([builder.getValue(), nameInput?.value ?? null, picker?.value() ?? null]);
  const initial = snapshot();
  function mayDiscard() {
    if (busy) return false;
    if (!confirmDiscard || snapshot() === initial) return true;
    return openConfirm({
      title: "Discard changes?",
      message: "This filter has unsaved changes. Closing now throws them away.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true
    });
  }
  async function runAction(action, close) {
    if (busy || action.value === SUBMIT && !canSubmit()) return;
    showFailure("");
    busy = true;
    try {
      const result = { action: action.value, expr: action.value === CLEAR ? null : current() };
      if (nameInput) result.name = nameInput.value.trim();
      if (picker) result.icon = picker.value();
      if (action.confirm) {
        const { message } = action.confirm;
        const asked = typeof message === "function" ? { ...action.confirm, message: message(result) } : action.confirm;
        if (!await openConfirm(asked)) return;
      }
      refresh();
      await action.run?.(result);
      close(result);
    } catch (err) {
      showFailure(err?.message ?? String(err));
    } finally {
      busy = false;
      refresh();
    }
  }
  const asModalAction = (action) => ({
    ...action,
    keepOpen: true,
    onClick: (close) => runAction(action, close)
  });
  const modalActions = [
    ...actions.map(asModalAction),
    {
      label: "Cancel",
      value: "cancel",
      keepOpen: true,
      onClick: async (close) => {
        if (await mayDiscard()) close(null);
      }
    }
  ];
  if (clearLabel) modalActions.push(asModalAction({ label: clearLabel, value: CLEAR }));
  modalActions.push({
    ...asModalAction({ label: submitLabel, value: SUBMIT, run: onSubmit }),
    primary: true,
    disabled: !canSubmit()
  });
  const closed = openModal({
    title,
    icon: icon2,
    content,
    actions: modalActions,
    width,
    height,
    maximizable: true,
    beforeClose: mayDiscard,
    dismissOnBackdrop,
    onMount: (_body, modalControls) => {
      controls = modalControls;
      refresh();
      nameInput?.focus();
      nameInput?.select();
    }
  });
  drawPreview();
  try {
    return await closed;
  } finally {
    clearTimeout(previewTimer);
    previewRun?.abort();
    builder.destroy();
  }
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
function notificationText(notification) {
  return [notification.title, notification.message, notification.description].filter((part2) => part2 != null && String(part2) !== "").join("\n");
}
function showNotificationMenu(event, notification, logger) {
  event.preventDefault();
  event.stopPropagation();
  showContextMenu(
    event.clientX,
    event.clientY,
    [{ label: "Copy message", icon: "content_copy", action: "copy" }],
    () => {
      Promise.resolve().then(() => navigator.clipboard.writeText(notificationText(notification))).catch((err) => logger?.warn?.("twm-notification-center", "Copy message failed", { err }));
    }
  );
}
var TOAST_TEXT = ".twm-notification__title, .twm-notification__body, .twm-notification__description, .twm-notification__status";
function selectsTextIn(el3) {
  const sel = el3.ownerDocument.getSelection?.();
  return Boolean(sel && !sel.isCollapsed && sel.rangeCount && el3.contains(sel.getRangeAt(0).commonAncestorContainer));
}
var NotificationCenter = class _NotificationCenter extends ComponentBase {
  #items;
  #summaryEl;
  #historyListeners;
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
    this.#historyListeners = /* @__PURE__ */ new Set();
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
      this.liveRegionEl = existingContainer.querySelector(".twm-notification-center__live-region");
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
    this.liveRegionEl.className = "twm-notification-center__live-region";
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
    this.#historyListeners.clear();
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
        this.#recordDismissal(removed, "overflow");
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
      this.#recordDismissal(gone, reason);
      this.#render();
      return true;
    }
    const [removed] = this.notifications.splice(idx, 1);
    this.#stopTimer(notificationId);
    this.#recordDismissal(removed, reason);
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
  /**
   * Hear of every entry added to `history`, by `show()`, `warn()`/`error()`/
   * `info()`/`success()` and the bus alike: `listener(entry, center)`, once
   * per toast, after the entry is in `history`. A dismissal changes the
   * toast's own entry and is not an entry of its own. Answers the unsubscribe.
   */
  subscribe(listener) {
    if (typeof listener !== "function") return () => {
    };
    this.#historyListeners.add(listener);
    return () => {
      this.#historyListeners.delete(listener);
    };
  }
  #recordHistory(entry) {
    if (entry.skipHistory) return;
    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }
    [...this.#historyListeners].forEach((listener) => {
      try {
        listener(entry, this);
      } catch (err) {
        this.logger?.warn?.("twm-notification-center", "History listener failed", { err });
      }
    });
  }
  /** A toast that left marks its own entry: one toast, one entry. */
  #recordDismissal(notification, reason) {
    if (notification.skipHistory) return;
    const at = this.history.findLastIndex((entry) => entry.id === notification.id);
    if (at === -1) return;
    this.history[at] = { ...notification, dismissed: true, reason };
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
      more2.className = "twm-notification twm-notification--summary";
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
  static #setText(node2, text) {
    const t = text == null ? "" : String(text);
    if (node2.textContent !== t) node2.textContent = t;
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
        const button3 = document.createElement("button");
        button3.type = "button";
        button3.className = "twm-notification__action-btn";
        button3.textContent = action.label;
        button3.addEventListener("click", () => {
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
        actionsEl.appendChild(button3);
      });
      item.appendChild(actionsEl);
    }
    item.addEventListener("click", (event) => {
      if (event.target.closest(`button, ${TOAST_TEXT}`) || _NotificationCenter.#isRunning(notification) || selectsTextIn(item)) {
        return;
      }
      this.dismiss(notification.id, "click");
    });
    item.addEventListener("contextmenu", (event) => showNotificationMenu(event, notification, this.logger));
    this.#patchItem(entry, notification);
    return entry;
  }
  /** Bring a drawn toast's nodes in line with its data, touching only what changed. */
  #patchItem(entry, notification) {
    const item = entry.el;
    if (entry.severity !== notification.severity) {
      if (entry.severity) item.classList.remove(`twm-notification--${entry.severity}`);
      item.classList.add("twm-notification", `twm-notification--${notification.severity}`);
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
    this.unreadCount = 0;
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
    this.unreadCount = 0;
    const unsubscribe = this.notificationCenter?.subscribe?.(() => {
      this.unreadCount += 1;
      this.#updateBadge();
    });
    if (typeof unsubscribe === "function") this._subscriptions.push(unsubscribe);
    this.#updateBadge();
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
    const unread = this.alertLog ? this.alertLog.unreadCount() : Math.min(this.unreadCount, historyLen);
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
    this.unreadCount = 0;
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
      this.unreadCount = 0;
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
      if (ev.target.closest?.(".twm-context-menu")) return;
      if (!panel.contains(ev.target) && !this.triggerEl.contains(ev.target)) cleanup();
    };
    const onKey = (ev) => {
      if (ev.key === "Escape" && !document.querySelector(".twm-context-menu")) cleanup();
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
      item.addEventListener("contextmenu", (event) => showNotificationMenu(event, entry, this.logger));
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

// src/ui/components/recent_items.js
function createRecentItems({
  host,
  key,
  identity = (entry) => entry.id,
  isValid = (entry) => !!entry && typeof entry === "object" && !!identity(entry),
  capacity = 10,
  groupOf = () => "",
  onChange = null,
  logger = null
}) {
  const state = host?.state ?? null;
  let entries = [];
  let loaded = !state;
  let pending = [];
  let reading = null;
  let writing = false;
  let writeAgain = false;
  const capped = (list) => {
    const counts = /* @__PURE__ */ new Map();
    return list.filter((entry) => {
      const group = groupOf(entry);
      const count = (counts.get(group) ?? 0) + 1;
      counts.set(group, count);
      return count <= capacity;
    });
  };
  const without = (list, entry) => {
    const id = identity(entry);
    return list.filter((other) => identity(other) !== id);
  };
  async function write() {
    if (!state) return;
    if (writing) {
      writeAgain = true;
      return;
    }
    writing = true;
    do {
      writeAgain = false;
      try {
        await state.write(key, entries);
      } catch (err) {
        logger?.warn?.(`Could not save the recent list "${key}"`, err);
      }
    } while (writeAgain);
    writing = false;
  }
  const usable = (entry) => {
    try {
      if (!isValid(entry)) return false;
      identity(entry);
      groupOf(entry);
      return true;
    } catch (err) {
      logger?.warn?.(`Dropped an unreadable entry of the recent list "${key}"`, err);
      return false;
    }
  };
  async function read() {
    let stored;
    try {
      const saved = await state.read(key);
      stored = Array.isArray(saved) ? capped(saved.filter(usable)) : [];
    } catch (err) {
      logger?.warn?.(`Could not read the recent list "${key}"; the stored list is left unchanged until it can be read`, err);
      return false;
    }
    const replay = pending;
    pending = [];
    loaded = true;
    entries = replay.reduce((list, apply) => apply(list), stored);
    if (replay.length > 0) {
      onChange?.();
      void write();
    }
    return true;
  }
  function load() {
    if (!state) return Promise.resolve(false);
    if (loaded) return Promise.resolve(true);
    reading ??= read().finally(() => {
      reading = null;
    });
    return reading;
  }
  function change(apply) {
    entries = apply(entries);
    onChange?.();
    if (loaded) {
      void write();
      return;
    }
    pending.push(apply);
    void load();
  }
  return Object.freeze({
    load,
    /** @returns {ReadonlyArray<object>} Most recent first */
    list: () => Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
    /** Put an entry at the top, dropping the older one with its identity. */
    add(entry) {
      const stamped = { ...entry, openedAt: Date.now() };
      change((list) => capped([stamped, ...without(list, stamped)]));
    },
    /** Drop the entry with this one's identity. */
    remove(entry) {
      change((list) => without(list, entry));
    },
    clear() {
      change(() => []);
    }
  });
}

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
      const glyph2 = document.createElement("span");
      glyph2.className = "material-symbols-outlined twm-record__verb-icon";
      glyph2.setAttribute("aria-hidden", "true");
      glyph2.textContent = String(v.icon);
      b.appendChild(glyph2);
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
        const glyph2 = doc.createElement("span");
        glyph2.className = "material-symbols-outlined";
        glyph2.setAttribute("aria-hidden", "true");
        glyph2.textContent = action.icon ?? "";
        btn.appendChild(glyph2);
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

// src/ui/components/select.js
var SEARCH_ABOVE = 7;
var TYPEAHEAD_MS = 500;
function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0) n.textContent = String(text);
  return n;
}
function glyphNode(className, text = "") {
  const n = node("span", `material-symbols-outlined ${className}`.trim(), text);
  n.setAttribute("aria-hidden", "true");
  return n;
}
var isEmptyValue = (v) => v === null || v === void 0 || v === "";
function createSelect({
  options = [],
  value = null,
  onChange = null,
  className = "",
  panelClassName = "",
  placeholder = "Choose\u2026",
  title = "",
  ariaLabel = "",
  disabled = false,
  showIcon = true,
  search = void 0,
  allowNew = false,
  newLabel = (typed) => `Use \u201C${typed}\u201D`,
  notFound = (v) => v,
  emptyText = (typed) => typed ? `Nothing matches \u201C${typed}\u201D.` : "Nothing to choose from.",
  loose = false,
  name = null,
  carrier = null,
  align = "start"
} = {}) {
  let source = options;
  let current = value;
  let emptyLabel = placeholder;
  let layer = null;
  let typedKeys = "";
  let typedTimer = null;
  const given = () => (typeof source === "function" ? source() : source) || [];
  const trigger = node("button", `twm-select${className ? ` ${className}` : ""}`);
  trigger.type = "button";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
  const icon2 = glyphNode("twm-select__icon");
  const label = node("span", "twm-select__label");
  trigger.append(icon2, label, glyphNode("twm-select__caret", "expand_more"));
  let root = trigger;
  let hidden = carrier;
  if (name && !hidden) {
    hidden = node("input");
    hidden.type = "hidden";
    hidden.name = name;
  }
  if (hidden) {
    root = node("div", "twm-select-field");
    root.append(trigger, hidden);
  }
  let focusHolder = trigger;
  const list = createOptionList({
    onPick: (option) => choose(option),
    onActive: (id) => {
      if (id) focusHolder.setAttribute("aria-activedescendant", id);
      else focusHolder.removeAttribute("aria-activedescendant");
    }
  });
  trigger.setAttribute("aria-controls", list.id);
  const panel = node("div", `twm-option-panel${panelClassName ? ` ${panelClassName}` : ""}`);
  const searchRow = node("div", "twm-option-panel__search");
  searchRow.appendChild(glyphNode("", "search"));
  const searchInput = node("input", "twm-option-panel__search-input");
  searchInput.type = "text";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-expanded", "true");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", list.id);
  searchRow.appendChild(searchInput);
  panel.append(searchRow, list.el);
  const hasSearch = () => search === void 0 ? allowNew || flatChoices(given()).length > SEARCH_ABOVE : !!search;
  function paint() {
    const flat = flatChoices(given());
    const chosen = findChoice(flat, current, loose);
    const none = !chosen && isEmptyValue(current);
    label.textContent = chosen ? chosen.label : none ? emptyLabel : notFound(shownValue(current));
    trigger.classList.toggle("twm-select--empty", none);
    trigger.title = title || label.textContent;
    const glyph2 = showIcon ? chosen?.icon || "" : "";
    icon2.textContent = glyph2;
    icon2.hidden = !glyph2;
    if (hidden) hidden.value = isEmptyValue(current) ? "" : shownValue(current);
  }
  function draw(typed) {
    const text = typed.trim();
    const all = choiceSections(given());
    const flat = all.flatMap((s) => s.items);
    const taken = (o) => [o.value, o.label].some((v) => shownValue(v).toLowerCase() === text.toLowerCase());
    const shown = filterSections(all, text);
    if (allowNew && text !== "" && !flat.some(taken)) {
      shown.push({ heading: null, items: [{
        value: text,
        label: newLabel(text),
        icon: "add",
        description: null,
        hint: null,
        disabled: false,
        reason: null,
        keywords: null,
        source: null
      }] });
    }
    const chosen = findChoice(flat, current, loose);
    if (shown.length) {
      list.setRows(shown, { mark: text, isCurrent: (o) => o === chosen });
      const at = list.options().indexOf(chosen);
      if (at >= 0 && !chosen.disabled) list.setActive(at);
      else list.moveToEnd(1);
    } else {
      list.setMessage(emptyText(text));
    }
    layer?.place();
  }
  function choose(option) {
    const changed = !(option.value === current || loose && String(option.value) === String(current));
    current = option.value;
    paint();
    layer?.close("pick");
    if (!changed) return;
    if (hidden) fireEvent(hidden, "change", { bubbles: true });
    onChange?.(current, option.source);
  }
  function open() {
    if (layer || trigger.disabled) return;
    const searching = hasSearch();
    searchRow.hidden = !searching;
    focusHolder = searching ? searchInput : trigger;
    if (searching) {
      const word = typeof search === "object" && search?.placeholder || (allowNew ? "Search, or type a new one\u2026" : "Search\u2026");
      searchInput.placeholder = word;
      searchInput.setAttribute("aria-label", word);
      searchInput.value = "";
    }
    panel.style.width = "";
    layer = openAnchoredLayer({
      anchor: trigger,
      el: panel,
      align,
      gap: 4,
      matchWidth: true,
      onClose() {
        layer = null;
        trigger.classList.remove("twm-is-open");
        trigger.setAttribute("aria-expanded", "false");
        focusHolder.removeAttribute("aria-activedescendant");
      }
    });
    if (!layer) return;
    trigger.classList.add("twm-is-open");
    trigger.setAttribute("aria-expanded", "true");
    draw("");
    if (searching) {
      const width = Math.round(panel.getBoundingClientRect().width);
      if (width > 0) panel.style.width = `${width}px`;
      searchInput.focus({ preventScroll: true });
    }
  }
  const close = () => layer?.close("closed");
  function typeAhead(ch) {
    clearTimeout(typedTimer);
    typedTimer = setTimeout(() => {
      typedKeys = "";
    }, TYPEAHEAD_MS);
    typedKeys += ch.toLowerCase();
    const at = list.options().findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typedKeys));
    if (at >= 0) list.setActive(at);
  }
  function onKey(ev) {
    if (ev.isComposing) return;
    const inSearch = ev.target === searchInput;
    if (!layer) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
      return;
    }
    if (ev.key === "Tab") {
      layer.close("tab");
      return;
    }
    if (ev.key === "ArrowDown") list.move(1);
    else if (ev.key === "ArrowUp") list.move(-1);
    else if (ev.key === "Home" && !inSearch) list.moveToEnd(1);
    else if (ev.key === "End" && !inSearch) list.moveToEnd(-1);
    else if (ev.key === "Enter" || ev.key === " " && !inSearch) {
      const option = list.activeOption();
      if (option) choose(option);
      else if (!inSearch) close();
    } else if (!inSearch && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      typeAhead(ev.key);
    } else {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  }
  trigger.addEventListener("click", () => {
    if (layer) close();
    else open();
  });
  trigger.addEventListener("keydown", onKey);
  trigger.addEventListener("keyup", (ev) => {
    if (ev.key === " ") ev.preventDefault();
  });
  searchInput.addEventListener("keydown", onKey);
  searchInput.addEventListener("input", () => draw(searchInput.value));
  function setDisabled(off) {
    trigger.disabled = !!off;
    if (off) close();
  }
  paint();
  setDisabled(disabled);
  return {
    el: root,
    /** The hidden input carrying the value, when there is one. */
    input: hidden,
    get value() {
      return current;
    },
    set value(next) {
      current = next;
      paint();
    },
    get isOpen() {
      return !!layer;
    },
    /** Replace the list. Pass `nextValue` to change the value as well; left out, it stays. */
    setOptions(nextOptions, nextValue) {
      source = nextOptions;
      if (arguments.length > 1) current = nextValue;
      paint();
      if (layer) draw(searchInput.value);
    },
    /** The text shown while nothing is chosen: "Loading…", the failure, "Choose…". */
    setPlaceholder(text) {
      emptyLabel = text;
      paint();
    },
    setDisabled,
    open,
    close,
    focus() {
      trigger.focus();
    },
    /** Closes the list and takes the control off the page. */
    destroy() {
      clearTimeout(typedTimer);
      close();
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
function filterBox(onInput) {
  const label = el2("label", "twm-settings__search");
  const input = el2("input", "twm-settings__search-input");
  input.type = "search";
  input.placeholder = "Filter settings\u2026";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Filter settings");
  input.addEventListener("input", () => onInput(input.value));
  label.append(icon("search"), input);
  return { label, input };
}
function categoryNav(onSelect) {
  const nav = el2("nav", "twm-settings__nav");
  nav.setAttribute("aria-label", "Settings categories");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-category]");
    if (btn && nav.contains(btn)) onSelect(btn.dataset.category);
  });
  return nav;
}
function paintCategories(nav, categories, active) {
  const buttons = categories.map((cat) => {
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
  nav.replaceChildren(...buttons);
}
function resetAllButton(onClick) {
  const b = el2("button", "twm-btn twm-settings__reset-all");
  b.type = "button";
  b.append(icon("restart_alt"), el2("span", "", "Reset all"));
  b.addEventListener("click", () => {
    onClick();
  });
  return b;
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
   * @param {boolean}  [o.sidebar=true]  false leaves the sidebar (filter,
   *        categories, *Reset all*) out, for a `SettingsCategories` elsewhere
   */
  constructor({
    store,
    eventBus,
    confirm = openConfirm,
    category = null,
    textDebounceMs = SETTINGS_TEXT_DEBOUNCE_MS,
    title = "Settings",
    sidebar = true,
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
    this._sidebar = sidebar !== false;
    this._listeners = /* @__PURE__ */ new Set();
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
    if (this._sidebar) {
      const side = el2("aside", "twm-settings__sidebar");
      const head = el2("div", "twm-settings__sidebar-title");
      head.append(icon("settings"), el2("span", "", this._title));
      const search = filterBox((text) => this.setQuery(text));
      this._search = search.input;
      this._nav = categoryNav((id) => this.selectCategory(id));
      side.append(head, search.label, this._nav, resetAllButton(() => this.resetAll()));
      root.append(side);
    }
    const content = el2("div", "twm-settings__content");
    this._content = content;
    root.append(content);
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
    this.#notify();
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
  /** True while the filter is in effect (its trimmed text is not empty). */
  isFiltering() {
    return this.#searching();
  }
  /**
   * `fn({ category, query })` after every change of the category, the filter
   * or the registered categories, until the view is disposed. Answers the
   * unsubscribe.
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
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
    this.#notify();
  }
  /** Search every category; an empty query goes back to the category. */
  setQuery(query) {
    if (!this.root) return;
    const q = String(query ?? "");
    this._query = q;
    if (this._search && this._search.value !== q) this._search.value = q;
    this.#paintNav();
    this.#paintContent();
    this.#notify();
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
    this._listeners.clear();
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
    } else {
      this.#flushAll();
      this.#syncAll();
    }
    this.#notify();
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
    if (!this._nav) return;
    paintCategories(this._nav, this.store.getCategories(), this.#searching() ? null : this.getCategory());
  }
  /** Tell the listeners, after the content is drawn (it settles the category). */
  #notify() {
    const state = { category: this.getCategory(), query: this._query };
    for (const fn of [...this._listeners]) fn(state);
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
        const show2 = (v) => {
          dirty = false;
          const text = v == null ? "" : String(v);
          if (box.value !== text) box.value = text;
        };
        const commit = () => {
          const current = this.store.get(def.path);
          const n = box.value.trim() === "" ? NaN : Number(box.value);
          if (!Number.isFinite(n)) {
            show2(current);
            return;
          }
          const v = fitNumber(n, def);
          show2(v);
          if (!same(v, current)) write(v);
        };
        box.addEventListener("input", () => {
          dirty = true;
        });
        box.addEventListener("change", commit);
        return {
          el: box,
          show: show2,
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
var SettingsCategories = class extends ComponentBase {
  /**
   * @param {object}       o
   * @param {SettingsView} o.view  the view it lists the categories of
   */
  constructor({ view, logger } = {}) {
    if (!(view instanceof SettingsView)) {
      throw new TypeError("SettingsCategories: `view` must be a SettingsView");
    }
    super({ eventBus: view.eventBus, logger });
    this.view = view;
    this.root = null;
    this._search = null;
    this._nav = null;
    this._unsubscribe = null;
  }
  /** Build the list into `container` (once). */
  mount(container) {
    if (this.root) return this.root;
    const view = this.view;
    const root = el2("div", "twm-settings-categories");
    const search = filterBox((text) => view.setQuery(text));
    this._search = search.input;
    this._nav = categoryNav((id) => view.selectCategory(id));
    root.append(search.label, this._nav, resetAllButton(() => view.resetAll()));
    this.root = root;
    container.appendChild(root);
    this._mounted = true;
    this._unsubscribe = view.subscribe(() => this.#paint());
    this.#paint();
    return root;
  }
  dispose() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this.root?.remove();
    this.root = null;
    this._search = null;
    this._nav = null;
    super.dispose();
  }
  #paint() {
    const view = this.view;
    const q = view.getQuery();
    if (this._search.value !== q) this._search.value = q;
    paintCategories(this._nav, view.store.getCategories(), view.isFiltering() ? null : view.getCategory());
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

// src/ui/components/tree_view.js
function setText(root, selector, value) {
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
  const node2 = document.createElement("div");
  node2.className = "twm-collapsible-box twm-tree-category";
  node2.dataset.categoryId = id;
  node2.dataset.collapsibleId = `tree-category-${id}`;
  node2.dataset.collapsibleDefault = expanded ? "expanded" : "collapsed";
  if (readonly) node2.dataset.readonly = "true";
  node2.innerHTML = `
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
  setText(node2, ".twm-tree-category__label", label);
  return node2;
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
  const node2 = document.createElement("div");
  node2.className = `twm-tree-node${readonly ? " readonly" : ""}`;
  node2.dataset.nodeId = id;
  const iconHtml = icon2 ? `<span class="twm-tree-node__icon"><span class="material-symbols-outlined">${icon2}</span></span>` : "";
  const actionsHtml = actions ? '<span class="twm-tree-node__actions"></span>' : "";
  node2.innerHTML = `
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
  setText(node2, ".twm-tree-node__label", label);
  if (actions) appendActionButtons(node2.querySelector(".twm-tree-node__actions"), id, actions);
  return node2;
}
function appendActionButtons(actionsEl, id, actions) {
  Object.entries(actions).forEach(([actionId, actionConfig]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "twm-tree-node__action-btn";
    btn.dataset.action = actionId;
    btn.title = actionConfig.title || actionId;
    btn.innerHTML = `<span class="material-symbols-outlined">${actionConfig.icon}</span>`;
    if (actionConfig.onClick) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        actionConfig.onClick(id, e);
      });
      btn.addEventListener("dblclick", (e) => e.stopPropagation());
    }
    actionsEl.appendChild(btn);
  });
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
    badge = null,
    actions = null
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
  setText(item, ".twm-tree-item__label", label);
  if (subtitle) setText(item, ".twm-tree-item__subtitle", subtitle);
  if (badge?.text) setText(item, ".twm-tree-item__badge", badge.text);
  if (actions) {
    const actionsEl = document.createElement("span");
    actionsEl.className = "twm-tree-item__actions";
    appendActionButtons(actionsEl, id, actions);
    item.appendChild(actionsEl);
  }
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
  container.querySelectorAll(".twm-tree-node").forEach((node2) => {
    const visible = hasVisibleItem(node2);
    node2.style.display = visible ? "" : "none";
    if (expandMatches && visible && normalizedFilter) toggleNode(node2, true);
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
        const node2 = parent.closest(".twm-tree-node");
        if (node2) toggleNode(node2, true);
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
      const node2 = nodeHeader.closest(".twm-tree-node");
      if (node2) {
        toggleNode(node2);
        this.options.onNodeToggle?.(node2.dataset.nodeId, node2);
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
    const node2 = createTreeNode(options);
    content.appendChild(node2);
    return node2;
  }
  addItem(nodeId, options) {
    const node2 = this.container.querySelector(`.twm-tree-node[data-node-id="${attrValue(nodeId)}"]`);
    const children = node2?.querySelector(".twm-tree-node__children");
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
    this.#renderBody();
    this.#paint();
    this.#window.show();
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
      const glyph2 = state === "done" ? "check" : state === "error" ? "error" : step.icon || "";
      marker.classList.toggle("material-symbols-outlined", Boolean(glyph2));
      marker.textContent = glyph2 || String(i + 1);
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

// src/ui/components/workspace_picker.js
var DEFAULT_LABELS2 = Object.freeze({
  loading: "Loading\u2026",
  empty: () => "Nothing to show.",
  noMatch: (query) => `Nothing matches \u201C${query}\u201D.`,
  failed: (err) => `The list could not be read. ${err?.message || ""}`.trim(),
  failedMore: (err) => `The next page could not be read. ${err?.message || ""}`.trim(),
  failedRemove: (err) => `Could not remove it. ${err?.message || ""}`.trim(),
  loadMore: ({ next, shown, total }) => `Load ${next} more \xB7 ${shown} of ${total} shown`,
  remove: (name) => `Remove ${name}`
});
var PANEL_EDGE = 8;
var OVER_LIFT = 3;
var nextUid = 0;
function part(tag, className, text = null) {
  const node2 = document.createElement(tag);
  if (className) node2.className = className;
  if (text != null) node2.textContent = text;
  return node2;
}
function glyph(name, className = "") {
  const node2 = part("span", `material-symbols-outlined ${className}`.trim(), name);
  node2.setAttribute("aria-hidden", "true");
  return node2;
}
function setText2(node2, text) {
  const value = String(text ?? "");
  if (node2.textContent !== value) node2.textContent = value;
}
function show(node2, shown) {
  node2.hidden = !shown;
}
function button2(className) {
  const node2 = part("button", className);
  node2.type = "button";
  return node2;
}
function keyedChildren(container, build, update) {
  let drawn = /* @__PURE__ */ new Map();
  return (items, keyOf) => {
    const next = /* @__PURE__ */ new Map();
    const nodes = items.map((item) => {
      const key = String(keyOf(item));
      const entry = drawn.get(key) ?? build();
      update(entry, item);
      next.set(key, entry);
      return entry.node;
    });
    for (const [key, entry] of drawn) {
      if (!next.has(key)) entry.node.remove();
    }
    drawn = next;
    const focused = document.activeElement;
    nodes.forEach((node2, index) => {
      if (node2.contains(focused)) {
        while (container.children[index] !== node2) container.append(container.children[index]);
      } else if (container.children[index] !== node2) {
        container.insertBefore(node2, container.children[index] || null);
      }
    });
    return drawn;
  };
}
function parseChord(chord) {
  const parts = String(chord).split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  const known = /* @__PURE__ */ new Set(["ctrl", "cmd", "meta", "shift", "alt"]);
  if (!key || parts.some((p) => !known.has(p))) {
    throw new TypeError(`createWorkspacePicker: cannot read the chord "${chord}"`);
  }
  return {
    key,
    ctrl: parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt")
  };
}
function chordMatches(parsed, event) {
  return (event.ctrlKey || event.metaKey) === parsed.ctrl && event.shiftKey === parsed.shift && event.altKey === parsed.alt && String(event.key).toLowerCase() === parsed.key;
}
function mountPickerField(hostEl, {
  name = "",
  icon: icon2 = "",
  keyHint = "",
  muted = false,
  caret = false,
  tooltip = "",
  ariaLabel = "",
  className = "",
  layout = "inline",
  avoid = "",
  maxWidth = 440,
  minWidth = 120,
  tightWidth = 230,
  gap = 24,
  onActivate = null
} = {}) {
  const centered = layout === "centered";
  const el3 = button2(["twm-wspicker-field", centered ? "twm-wspicker-field--centered" : "", className].filter(Boolean).join(" "));
  el3.setAttribute("aria-haspopup", "dialog");
  el3.setAttribute("aria-expanded", "false");
  const iconEl = glyph("", "twm-wspicker-field__icon");
  const nameEl = part("span", "twm-wspicker-field__name");
  const keyEl = part("kbd", "twm-wspicker-field__key");
  el3.append(iconEl, nameEl, keyEl);
  if (caret) el3.append(glyph("expand_more", "twm-wspicker-field__caret"));
  const update = (patch) => {
    if ("name" in patch) setText2(nameEl, patch.name);
    if ("icon" in patch) {
      setText2(iconEl, patch.icon);
      show(iconEl, !!patch.icon);
    }
    if ("keyHint" in patch) {
      setText2(keyEl, patch.keyHint);
      show(keyEl, !!patch.keyHint);
    }
    if ("muted" in patch) el3.classList.toggle("twm-wspicker-field--muted", !!patch.muted);
    if ("tooltip" in patch) {
      el3.classList.toggle("twm-has-tooltip", !!patch.tooltip);
      if (patch.tooltip) {
        el3.setAttribute("data-tooltip", patch.tooltip);
        el3.setAttribute("data-tooltip-placement", "bottom");
      } else {
        el3.removeAttribute("data-tooltip");
        el3.removeAttribute("data-tooltip-placement");
      }
    }
    if ("ariaLabel" in patch) {
      if (patch.ariaLabel) el3.setAttribute("aria-label", patch.ariaLabel);
      else el3.removeAttribute("aria-label");
    }
  };
  update({ name, icon: icon2, keyHint, muted, tooltip, ariaLabel });
  const fit = () => {
    if (!centered) {
      el3.classList.toggle("twm-wspicker-field--tight", el3.getBoundingClientRect().width < tightWidth);
      return;
    }
    const box = hostEl.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    let leftEdge = box.left;
    let rightEdge = box.right;
    for (const other of avoid ? hostEl.querySelectorAll(avoid) : []) {
      if (el3.contains(other)) continue;
      const r = other.getBoundingClientRect();
      if (r.width <= 0) continue;
      if (r.left + r.width / 2 < middle) leftEdge = Math.max(leftEdge, r.right);
      else rightEdge = Math.min(rightEdge, r.left);
    }
    const width = Math.min(maxWidth, 2 * Math.min(middle - leftEdge, rightEdge - middle) - gap);
    el3.classList.toggle("twm-wspicker-field--hidden", width < minWidth);
    el3.classList.toggle("twm-wspicker-field--tight", width < tightWidth);
    el3.style.width = `${Math.max(minWidth, width)}px`;
  };
  let destroyed = false;
  const onClick = () => onActivate?.();
  el3.addEventListener("click", onClick);
  hostEl.appendChild(el3);
  const observer = createRafResizeObserver(() => {
    if (!destroyed) fit();
  });
  observer.observe(centered ? hostEl : el3);
  fit();
  document.fonts?.ready?.then(() => {
    if (!destroyed) fit();
  });
  return {
    el: el3,
    update,
    fit,
    setOpen(open) {
      el3.classList.toggle("twm-wspicker-field--open", open);
      el3.setAttribute("aria-expanded", String(open));
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      el3.removeEventListener("click", onClick);
      el3.remove();
    }
  };
}
function createPickerSwitcher({
  anchor = null,
  placement = "over",
  minWidth = 520,
  visibleRows = 0,
  className = "",
  label = "",
  listLabel = "",
  placeholder = "",
  glyph: inputGlyph = "search",
  load,
  search = "local",
  pageSize = 20,
  debounceMs = 200,
  cacheKey = () => "",
  describe,
  onPick = null,
  onRemove = null,
  actions = null,
  heading = null,
  card = null,
  footer = null,
  labels: labelOverrides = {},
  onOpenChange = null
}) {
  const labels = { ...DEFAULT_LABELS2, ...labelOverrides };
  const remote = search === "remote";
  const uid = `twm-wspicker-${++nextUid}`;
  let isOpen = false;
  let destroyed = false;
  let current = null;
  let items = [];
  let total = null;
  let status = null;
  let answered = "";
  let asked = "";
  let seq = 0;
  let abort = null;
  let loading = false;
  let loadingMore = false;
  let failure = null;
  let timer = null;
  let pickFirst = false;
  let selectId = null;
  let busy = false;
  let opener = null;
  let stops = [];
  let activeKey = null;
  let activeNode = null;
  let moved = false;
  const rovingKeys = {};
  let nextEntryId = 0;
  const kept = /* @__PURE__ */ new Map();
  const idOf = (item) => String(describe(item, { current: false }).id);
  const isCurrent = (item) => current != null && idOf(item) === idOf(current);
  const modelOf = (item) => describe(item, { current: isCurrent(item) });
  const typed = () => input.value.trim();
  const backdrop = part("div", "twm-wspicker-backdrop");
  const panel = part("div", `twm-wspicker ${className}`.trim());
  panel.setAttribute("role", "dialog");
  if (label) panel.setAttribute("aria-label", label);
  const searchRow = part("div", "twm-wspicker__search");
  const input = part("input", "twm-wspicker__input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = placeholder;
  if (placeholder) input.setAttribute("aria-label", placeholder);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", `${uid}-list`);
  searchRow.append(glyph(inputGlyph, "twm-wspicker__glyph"), input);
  const head = part("div", "twm-wspicker__head");
  const headTitle = part("span", "twm-wspicker__title");
  const headCount = part("span", "twm-wspicker__count");
  head.append(headTitle, headCount);
  const scroller = part("div", "twm-wspicker__scroll");
  if (visibleRows > 0) {
    scroller.classList.add("twm-wspicker__scroll--capped");
    scroller.style.setProperty("--twm-wspicker-rows", String(visibleRows));
  }
  const list = part("div", "twm-wspicker__list");
  list.id = `${uid}-list`;
  list.setAttribute("role", "listbox");
  if (listLabel) list.setAttribute("aria-label", listLabel);
  const note = part("p", "twm-wspicker__note");
  note.setAttribute("role", "status");
  const more = button2("twm-btn twm-wspicker__more");
  const moreLabel = part("span", "twm-wspicker__more-label");
  more.append(glyph("expand_more"), moreLabel);
  const actionList = part("div", "twm-wspicker__actions");
  actionList.setAttribute("role", "listbox");
  scroller.append(list, note, more, actionList);
  const cardEl = part("section", "twm-wspicker__card");
  const cardHeading = part("h3", "twm-wspicker__card-heading");
  const cardHead = part("div", "twm-wspicker__card-head");
  const cardIcon = glyph("", "twm-wspicker__card-icon");
  const cardText = part("span", "twm-wspicker__card-text");
  const cardName = part("span", "twm-wspicker__card-name");
  const cardDetail = part("span", "twm-wspicker__card-detail");
  cardText.append(cardName, cardDetail);
  const cardOpen = button2("twm-btn twm-wspicker__card-open");
  const cardOpenIcon = glyph("");
  const cardOpenLabel = part("span", "");
  cardOpen.append(cardOpenIcon, cardOpenLabel);
  cardHead.append(cardIcon, cardText, cardOpen);
  const tiles = part("div", "twm-wspicker__tiles");
  cardEl.append(cardHeading, cardHead, tiles);
  const foot = part("div", "twm-wspicker__foot");
  const footStatus = part("span", "twm-wspicker__status");
  const footStart = part("div", "twm-wspicker__foot-group");
  const footEnd = part("div", "twm-wspicker__foot-group");
  const footKeys = part("span", "twm-wspicker__keys");
  foot.append(footStart, footStatus, footEnd, footKeys);
  panel.append(searchRow, head, scroller, cardEl, foot);
  function buildRow() {
    const node2 = part("div", "twm-wspicker__row");
    node2.id = `${uid}-row-${++nextEntryId}`;
    node2.setAttribute("role", "option");
    node2.tabIndex = -1;
    const icon2 = glyph("", "twm-wspicker__row-icon");
    const text = part("span", "twm-wspicker__row-text");
    const name = part("span", "twm-wspicker__row-name");
    const detail = part("span", "twm-wspicker__row-detail");
    text.append(name, detail);
    const badge = part("span", "twm-wspicker__row-badge");
    const check = glyph("check", "twm-wspicker__row-check");
    const bin = button2("twm-wspicker__row-remove");
    bin.tabIndex = -1;
    bin.append(glyph("delete"));
    node2.append(icon2, text, badge, check, bin);
    const entry = { node: node2, icon: icon2, name, detail, badge, check, bin, run: null, remove: null };
    node2.addEventListener("click", () => entry.run?.());
    bin.addEventListener("click", (event) => {
      event.stopPropagation();
      entry.remove?.();
    });
    return entry;
  }
  function paintRow(entry, { name, detail, icon: icon2, badge, title, disabled = false, isCurrentRow = false }) {
    setText2(entry.icon, icon2);
    setText2(entry.name, name);
    setText2(entry.detail, detail);
    show(entry.detail, !!detail);
    setText2(entry.badge, badge);
    show(entry.badge, !!badge);
    show(entry.check, isCurrentRow);
    entry.node.classList.toggle("twm-wspicker__row--current", isCurrentRow);
    entry.node.classList.toggle("twm-wspicker__row--disabled", disabled);
    entry.node.setAttribute("aria-selected", String(isCurrentRow));
    if (disabled) entry.node.setAttribute("aria-disabled", "true");
    else entry.node.removeAttribute("aria-disabled");
    entry.node.title = title ?? (detail ? `${name} \u2014 ${detail}` : name);
  }
  const syncRows = keyedChildren(list, buildRow, (entry, item) => {
    const model = modelOf(item);
    const disabled = !!model.disabled;
    paintRow(entry, { ...model, disabled, isCurrentRow: isCurrent(item) });
    entry.run = disabled ? null : () => pick(item);
    if (disabled) entry.node.tabIndex = -1;
    const removable = !!onRemove && model.removable !== false;
    entry.remove = removable ? () => removeItem(item) : null;
    show(entry.bin, removable);
    if (removable) {
      const words = labels.remove(model.name);
      entry.bin.setAttribute("aria-label", words);
      entry.bin.title = words;
    }
  });
  const syncActions = keyedChildren(actionList, buildRow, (entry, action) => {
    paintRow(entry, { name: action.label, detail: action.detail, icon: action.icon, title: action.title });
    entry.run = () => runVerb(action.run);
    show(entry.bin, false);
  });
  function shownItems() {
    const query = typed().toLowerCase();
    if (remote || !query) return items;
    const names = [];
    const others = [];
    for (const item of items) {
      const { name, detail, keywords } = modelOf(item);
      if (String(name).toLowerCase().includes(query)) names.push(item);
      else if ([detail, keywords].flat().some((text) => String(text ?? "").toLowerCase().includes(query))) others.push(item);
    }
    return [...names, ...others];
  }
  function shownActions() {
    if (!actions) return [];
    const query = typed();
    const lower = query.toLowerCase();
    return actions({ query }).filter((action) => action.always || !lower || String(action.label).toLowerCase().includes(lower));
  }
  function buildVerb(hook) {
    return () => {
      const node2 = button2(`twm-btn ${hook}`);
      const icon2 = glyph("");
      const text = part("span", "");
      const trailing = glyph("");
      node2.append(icon2, text, trailing);
      const entry = { node: node2, icon: icon2, text, trailing, run: null };
      node2.addEventListener("click", () => entry.run?.());
      return entry;
    };
  }
  function paintVerb(entry, verb) {
    setText2(entry.icon, verb.icon);
    setText2(entry.text, verb.label);
    setText2(entry.trailing, verb.trailing);
    entry.node.classList.toggle("twm-btn--primary", !!verb.primary);
    entry.node.title = verb.label;
    entry.run = () => runVerb(verb.run);
  }
  const syncTiles = keyedChildren(tiles, buildVerb("twm-wspicker__tile"), paintVerb);
  const syncFootStart = keyedChildren(footStart, buildVerb("twm-wspicker__foot-btn"), paintVerb);
  const syncFootEnd = keyedChildren(footEnd, buildVerb("twm-wspicker__foot-btn"), paintVerb);
  let drawnTiles = /* @__PURE__ */ new Map();
  let drawnFoot = /* @__PURE__ */ new Map();
  let cardOpenRun = null;
  cardOpen.addEventListener("click", () => cardOpenRun?.());
  function renderCard() {
    const row = current == null ? null : items.find((item) => isCurrent(item)) ?? null;
    const model = card ? card({ current, row }) : null;
    show(cardEl, !!model);
    drawnTiles = syncTiles(model?.tiles || [], (tile) => tile.id);
    cardOpenRun = model?.open ? () => runVerb(model.open.run) : null;
    show(cardOpen, !!model?.open);
    if (!model) return;
    setText2(cardHeading, model.heading);
    show(cardHeading, !!model.heading);
    setText2(cardIcon, model.icon);
    setText2(cardName, model.name);
    setText2(cardDetail, model.detail);
    cardName.title = model.name;
    setText2(cardOpenIcon, model.open?.icon);
    setText2(cardOpenLabel, model.open?.label);
    tiles.style.setProperty("--twm-wspicker-columns", String(model.columns || 2));
  }
  function renderFooter() {
    const model = footer ? footer() : null;
    const start = syncFootStart(model?.start || [], (verb) => verb.id);
    const end = syncFootEnd(model?.end || [], (verb) => verb.id);
    drawnFoot = new Map([
      ...[...start].map(([key, entry]) => [`start:${key}`, entry]),
      ...[...end].map(([key, entry]) => [`end:${key}`, entry])
    ]);
    footKeys.replaceChildren(...(model?.keys || []).map(({ keys, label: words }) => {
      const hint = part("span", "twm-wspicker__key-hint");
      hint.append(...keys.map((key) => part("kbd", "", key)), ` ${words}`);
      return hint;
    }));
    const { text = "", error = false } = typeof status === "string" ? { text: status } : status ?? {};
    setText2(footStatus, text);
    show(footStatus, !!text);
    footStatus.classList.toggle("twm-wspicker__status--error", !!error);
    const keysShown = footKeys.childElementCount > 0 && panel.classList.contains("twm-wspicker--centered");
    show(foot, !!text || keysShown || drawnFoot.size > 0);
  }
  function collectStops(rowEntries, actionEntries, shown) {
    const next = [];
    for (const item of shown) {
      const entry = rowEntries.get(idOf(item));
      if (entry?.run) next.push({ key: `row:${idOf(item)}`, node: entry.node, run: entry.run, remove: entry.remove, primary: true });
    }
    if (!more.hidden) next.push({ key: "more", node: more, run: () => loadMore({ byKey: true }) });
    for (const [key, entry] of actionEntries) next.push({ key: `action:${key}`, node: entry.node, run: entry.run, primary: true });
    if (!cardEl.hidden) {
      if (!cardOpen.hidden) next.push({ key: "card-open", node: cardOpen, run: () => cardOpenRun?.() });
      for (const [key, entry] of drawnTiles) next.push({ key: `tile:${key}`, node: entry.node, run: entry.run });
    }
    for (const [key, entry] of drawnFoot) next.push({ key: `foot:${key}`, node: entry.node, run: entry.run });
    stops = next;
    syncTabStops();
  }
  function syncTabStops() {
    const currentKey = current == null ? null : `row:${idOf(current)}`;
    for (const prefix of ["row:", "action:"]) {
      const rows = stops.filter((s) => s.key.startsWith(prefix));
      const chosen = rows.find((s) => s.key === rovingKeys[prefix]) ?? rows.find((s) => s.key === currentKey) ?? rows[0];
      for (const stop of rows) stop.node.tabIndex = stop === chosen ? 0 : -1;
    }
  }
  function paintActive() {
    const stop = stops.find((s) => s.key === activeKey) ?? null;
    if (activeNode && activeNode !== stop?.node) activeNode.classList.remove("twm-wspicker__stop--active");
    activeNode = stop?.node ?? null;
    activeNode?.classList.add("twm-wspicker__stop--active");
    if (activeNode?.id) input.setAttribute("aria-activedescendant", activeNode.id);
    else input.removeAttribute("aria-activedescendant");
  }
  function revealActive() {
    activeNode?.scrollIntoView?.({ block: "nearest" });
  }
  function settleActive() {
    let reveal = false;
    if (selectId != null && stops.some((s) => s.key === `row:${selectId}`)) {
      activeKey = `row:${selectId}`;
      moved = true;
      selectId = null;
      reveal = true;
    }
    if (!moved || !stops.some((s) => s.key === activeKey)) {
      reveal = moved;
      const at = document.activeElement;
      if (moved && isOpen && (at === document.body || panel.contains(at) && at !== input)) input.focus();
      moved = false;
      activeKey = stops.find((s) => s.primary)?.key ?? null;
    }
    paintActive();
    if (reveal) revealActive();
  }
  function focusStop(stop) {
    activeKey = stop.key;
    moved = true;
    stop.node.focus({ preventScroll: true });
    paintActive();
  }
  function move(step) {
    const walk = [input, ...stops.map((s) => s.node)];
    const from = document.activeElement === input && moved ? activeNode : document.activeElement;
    const next = walk[(walk.indexOf(from) + step + walk.length) % walk.length];
    if (next === input) {
      input.focus();
      return;
    }
    focusStop(stops.find((s) => s.node === next));
    revealActive();
  }
  function render() {
    const shown = shownItems();
    const query = remote ? answered : typed();
    const rowEntries = syncRows(shown, idOf);
    const actionEntries = syncActions(shownActions(), (action) => action.id);
    const words = heading ? heading({ query, shown: shown.length, total }) : null;
    show(head, !!(words?.title || words?.count));
    setText2(headTitle, words?.title);
    setText2(headCount, words?.count);
    let said = "";
    if (failure) said = failure;
    else if (!shown.length && (loading || total == null)) said = labels.loading;
    else if (!shown.length) said = query ? labels.noMatch(query) : labels.empty();
    setText2(note, said);
    show(note, !!said);
    note.classList.toggle("twm-wspicker__note--error", !!failure);
    const remaining = remote && total != null ? Math.max(0, total - items.length) : 0;
    show(more, remaining > 0 && !failure);
    if (remaining > 0) {
      setText2(moreLabel, labels.loadMore({ next: Math.min(pageSize, remaining), shown: items.length, total }));
    }
    more.setAttribute("aria-disabled", String(loading || loadingMore));
    collectStops(rowEntries, actionEntries, shown);
    settleActive();
  }
  function renderEverything() {
    renderCard();
    renderFooter();
    render();
  }
  function normalize(answer) {
    if (Array.isArray(answer)) return { items: answer, total: answer.length, status: null };
    const list_ = answer?.items || [];
    return {
      items: list_,
      total: Number.isFinite(answer?.total) ? answer.total : list_.length,
      status: answer?.status ?? null
    };
  }
  function unique(all) {
    const seen = /* @__PURE__ */ new Set();
    return all.filter((item) => {
      const id = idOf(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  async function ask(query) {
    const mine = ++seq;
    asked = query;
    abort?.abort();
    abort = new AbortController();
    const { signal } = abort;
    loading = true;
    failure = null;
    loadingMore = false;
    render();
    try {
      const answer = normalize(await load({ query, offset: 0, limit: pageSize, signal }));
      if (destroyed || mine !== seq) return;
      items = unique(answer.items);
      total = answer.total;
      status = answer.status;
      if (query !== answered) scroller.scrollTop = 0;
      answered = query;
      loading = false;
      if (!query) kept.set(cacheKey(), { items: [...items], total, status });
      renderEverything();
      if (placementNow() === "below") place();
      if (pickFirst) {
        pickFirst = false;
        stops.find((s) => s.primary)?.run();
      }
    } catch (err) {
      if (destroyed || mine !== seq || err?.name === "AbortError") return;
      loading = false;
      pickFirst = false;
      items = [];
      total = null;
      status = null;
      answered = query;
      failure = labels.failed(err);
      renderEverything();
    }
  }
  async function loadMore({ byKey = false } = {}) {
    if (loading || loadingMore || total == null || items.length >= total) return;
    const mine = seq;
    loadingMore = true;
    render();
    let added = [];
    try {
      const answer = normalize(await load({ query: answered, offset: items.length, limit: pageSize, signal: abort?.signal }));
      if (destroyed || mine !== seq) return;
      const seen = new Set(items.map(idOf));
      added = unique(answer.items).filter((item) => !seen.has(idOf(item)));
      items = items.concat(added);
      total = added.length && Number.isFinite(answer.total) ? answer.total : items.length;
      if (answer.status != null) status = answer.status;
    } catch (err) {
      if (destroyed || mine !== seq || err?.name === "AbortError") return;
      failure = labels.failedMore(err);
    }
    loadingMore = false;
    const stayed = activeKey === "more";
    if (stayed && items.length >= total) {
      const first2 = added.find((item) => !modelOf(item).disabled);
      if (first2) {
        activeKey = `row:${idOf(first2)}`;
        moved = true;
      }
    }
    renderEverything();
    if (stayed) {
      const stop = stops.find((s) => s.key === activeKey);
      if (stop) focusStop(stop);
      if (byKey) revealActive();
    }
  }
  more.addEventListener("click", () => loadMore());
  function setBusy(waiting) {
    busy = waiting;
    panel.classList.toggle("twm-wspicker--waiting", waiting);
    backdrop.classList.toggle("twm-wspicker-backdrop--waiting", waiting);
  }
  async function removeItem(item) {
    if (busy) return;
    const removedKey = `row:${idOf(item)}`;
    const at = stops.findIndex((s) => s.key === removedKey);
    const following = stops.slice(at + 1).find((s) => s.key.startsWith("row:")) ?? stops.slice(0, Math.max(at, 0)).reverse().find((s) => s.key.startsWith("row:"));
    const fromRow = stops[at]?.node === document.activeElement;
    setBusy(true);
    let outcome;
    try {
      outcome = await onRemove(item);
    } catch (err) {
      setBusy(false);
      if (isOpen) {
        failure = labels.failedRemove(err);
        render();
        input.focus();
      }
      return;
    }
    setBusy(false);
    if (!isOpen) return;
    if (outcome !== false) {
      items = items.filter((other) => idOf(other) !== idOf(item));
      if (total != null) total = Math.max(0, total - 1);
      if (activeKey === removedKey && following) {
        activeKey = following.key;
        moved = true;
      }
      ask(remote ? answered : "");
      if (fromRow && following) {
        focusStop(following);
        revealActive();
        return;
      }
    }
    input.focus();
  }
  function pick(item) {
    const same2 = isCurrent(item);
    close({ restoreFocus: true });
    if (!same2) onPick?.(item);
  }
  function runVerb(run) {
    const query = typed();
    close({ restoreFocus: true });
    run?.({ query });
  }
  function enter() {
    const query = typed();
    if (remote && query !== asked) {
      clearTimeout(timer);
      timer = null;
      pickFirst = true;
      ask(query);
      return;
    }
    if (loading && !moved) {
      pickFirst = true;
      return;
    }
    stops.find((s) => s.key === activeKey)?.run();
  }
  function placementNow() {
    if (!anchor?.isConnected) return "centered";
    return anchor.getBoundingClientRect().width > 0 ? placement : "centered";
  }
  function place() {
    const mode = placementNow();
    for (const name of ["over", "below", "centered"]) {
      panel.classList.toggle(`twm-wspicker--${name}`, mode === name);
    }
    show(backdrop, mode === "centered");
    for (const side of ["top", "bottom", "left", "right", "width", "maxHeight", "overflowY", "position"]) panel.style[side] = "";
    if (mode === "centered") return;
    const r = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 2 * PANEL_EDGE);
    panel.style.width = `${width}px`;
    if (mode === "below") {
      ActionDropdown.position(anchor, panel);
      return;
    }
    const left = r.left + r.width / 2 - width / 2;
    panel.style.left = `${Math.max(PANEL_EDGE, Math.min(left, window.innerWidth - width - PANEL_EDGE))}px`;
    if (r.top + r.height / 2 > window.innerHeight / 2) {
      panel.style.bottom = `${Math.max(2, window.innerHeight - r.bottom - OVER_LIFT)}px`;
    } else {
      panel.style.top = `${Math.max(2, r.top - OVER_LIFT)}px`;
    }
  }
  function openPanel({ select = null } = {}) {
    if (isOpen || destroyed) return;
    isOpen = true;
    opener = document.activeElement;
    selectId = select == null ? null : String(select);
    input.value = "";
    clearTimeout(timer);
    timer = null;
    pickFirst = false;
    moved = false;
    activeKey = null;
    delete rovingKeys["row:"];
    delete rovingKeys["action:"];
    const last = kept.get(cacheKey());
    items = last ? [...last.items] : [];
    total = last ? last.total : null;
    status = last ? last.status : null;
    answered = "";
    asked = "";
    failure = null;
    document.body.append(backdrop, panel);
    place();
    renderEverything();
    scroller.scrollTop = 0;
    document.addEventListener("mousedown", onDocumentDown, true);
    document.addEventListener("keydown", onDocumentKey);
    window.addEventListener("resize", place);
    input.focus();
    onOpenChange?.(true);
    ask("");
  }
  function close({ restoreFocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(timer);
    timer = null;
    pickFirst = false;
    selectId = null;
    seq += 1;
    abort?.abort();
    loading = false;
    loadingMore = false;
    setBusy(false);
    panel.remove();
    backdrop.remove();
    document.removeEventListener("mousedown", onDocumentDown, true);
    document.removeEventListener("keydown", onDocumentKey);
    window.removeEventListener("resize", place);
    onOpenChange?.(false);
    if (restoreFocus && !destroyed) {
      const back = opener?.isConnected && opener !== document.body ? opener : anchor;
      back?.focus?.();
    }
    opener = null;
  }
  function onDocumentDown(event) {
    if (busy || panel.contains(event.target) || anchor?.contains?.(event.target)) return;
    close();
  }
  function onDocumentKey(event) {
    if (busy || event.key !== "Escape" || panel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }
  panel.addEventListener("mousedown", (event) => {
    if (event.target !== input) event.preventDefault();
  });
  panel.addEventListener("focusin", ({ target, relatedTarget }) => {
    if (target === input) {
      if (panel.contains(relatedTarget)) {
        moved = false;
        settleActive();
      }
      return;
    }
    const stop = stops.find((s) => s.node === target);
    if (!stop) return;
    activeKey = stop.key;
    moved = true;
    selectId = null;
    const prefix = ["row:", "action:"].find((p) => stop.key.startsWith(p));
    if (prefix) rovingKeys[prefix] = stop.key;
    syncTabStops();
    paintActive();
  });
  input.addEventListener("input", () => {
    moved = false;
    scroller.scrollTop = 0;
    if (remote) {
      clearTimeout(timer);
      const query = typed();
      timer = setTimeout(() => {
        timer = null;
        if (query !== asked) ask(query);
      }, debounceMs);
    }
    render();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.isComposing || busy) return;
    const { key, shiftKey, target } = event;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const stop = stops.find((s) => s.node === target);
    if (key === "Escape") {
      handled();
      close({ restoreFocus: true });
    } else if (key === "ArrowDown" || key === "ArrowUp") {
      handled();
      move(key === "ArrowDown" ? 1 : -1);
    } else if (key === "Enter" && target === input) {
      handled();
      enter();
    } else if ((key === "Enter" || key === " ") && stop) {
      handled();
      stop.run();
    } else if (key === "Delete" && shiftKey) {
      handled();
      stops.find((s) => s.key === activeKey)?.remove?.();
    } else if (key === "Backspace" && target !== input) {
      handled();
    } else if (target !== input && key.length === 1 && key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopPropagation();
      input.focus();
    }
  });
  panel.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    if (!busy && to && !panel.contains(to) && !anchor?.contains?.(to)) close();
  });
  return {
    panel,
    input,
    get isOpen() {
      return isOpen;
    },
    get current() {
      return current;
    },
    open: openPanel,
    close,
    toggle() {
      if (isOpen) close({ restoreFocus: true });
      else openPanel();
    },
    /** Which one the window is in, whether or not an answer holds it. */
    setCurrent(item) {
      current = item ?? null;
      if (isOpen) renderEverything();
    },
    /** Ask `actions`, `card` and `footer` again: who may do what changed. */
    refresh() {
      if (isOpen) renderEverything();
    },
    /** Ask `load` again: the list changed behind the switcher's back. */
    reload() {
      if (isOpen) ask(remote ? typed() : "");
    },
    destroy() {
      close();
      destroyed = true;
    }
  };
}
function createWorkspacePicker(hostEl, { field: fieldOptions = {}, chord = null, ...switcherOptions }) {
  const { placeholder = "", icon: fixedIcon, ...mountOptions } = fieldOptions;
  const parsed = chord ? parseChord(chord) : null;
  const field = mountPickerField(hostEl, {
    ariaLabel: switcherOptions.label,
    keyHint: chord ?? "",
    ...mountOptions,
    onActivate: () => switcher.toggle()
  });
  const switcher = createPickerSwitcher({
    ...switcherOptions,
    anchor: field.el,
    onOpenChange: (open) => {
      field.setOpen(open);
      switcherOptions.onOpenChange?.(open);
    }
  });
  const paint = () => {
    const item = switcher.current;
    const model = item == null ? null : switcherOptions.describe(item, { current: true });
    field.update({
      name: model ? model.name : placeholder,
      icon: fixedIcon ?? model?.icon ?? "",
      muted: !model
    });
  };
  paint();
  const onKeydown = (event) => {
    if (!chordMatches(parsed, event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) switcher.toggle();
  };
  if (parsed) window.addEventListener("keydown", onKeydown, true);
  return {
    field,
    switcher,
    get el() {
      return field.el;
    },
    get isOpen() {
      return switcher.isOpen;
    },
    get current() {
      return switcher.current;
    },
    open: switcher.open,
    close: switcher.close,
    toggle: switcher.toggle,
    refresh: switcher.refresh,
    reload: switcher.reload,
    setCurrent(item) {
      switcher.setCurrent(item);
      paint();
    },
    destroy() {
      if (parsed) window.removeEventListener("keydown", onKeydown, true);
      switcher.destroy();
      field.destroy();
    }
  };
}

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
    const button3 = (id, icon2, label, extra = "") => {
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
    button3("win-minimize", "remove", "Minimize");
    button3("win-maximize", "check_box_outline_blank", "Maximize");
    button3("win-close", "close", "Close", " twm-window-controls__btn--close");
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
      ".twm-menubar",
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
  const passThrough = (h) => h.closest?.(".twm-autoscroll-layer") || h.closest?.(".twm-resize-handle");
  return stacks.some((stack) => {
    const top = (stack || []).find((h) => !passThrough(h));
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
        show2(el3);
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
  const show2 = (el3) => {
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
    for (const el3 of next) show2(el3);
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
      show2(el3);
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
  const sweep = new MutationObserver((mutations) => {
    if (!managed.size || !mutations.some((m) => m.removedNodes.length)) return;
    for (const el3 of [...managed.keys()]) {
      if (!el3.isConnected) {
        drop(el3);
        hoverChain.delete(el3);
      }
    }
  });
  sweep.observe(root, { childList: true, subtree: true });
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
      sweep.disconnect();
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
      for (const node2 of mutation.addedNodes) {
        if (node2.nodeType !== 1) continue;
        if (node2.classList?.contains("twm-collapsible-content") && node2.classList?.contains("visible")) {
          installOnElement(node2);
        }
        node2.querySelectorAll?.(".twm-collapsible-content.visible")?.forEach(installOnElement);
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
      for (const node2 of mutation.addedNodes) {
        if (node2.nodeType !== 1) continue;
        if (matches(node2)) installOnElement(node2);
        node2.querySelectorAll?.(selector)?.forEach(installOnElement);
      }
      for (const node2 of mutation.removedNodes) {
        if (node2.nodeType !== 1) continue;
        if (matches(node2)) cleanupElement(node2);
        node2.querySelectorAll?.(selector)?.forEach(cleanupElement);
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
var focusTarget = null;
var byKeyboard = false;
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
  if (!target.getAttribute(hasLatex ? "data-latex-tooltip" : "data-tooltip")) return;
  stopMouseCheck();
  currentTarget = target;
  const tooltip = createTooltipElement();
  if (hasLatex) {
    const latex = target.getAttribute("data-latex-tooltip");
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
    if (currentTarget !== target) return;
    positionTooltip(target, tooltip);
    tooltip.classList.add("visible");
    if (focusTarget !== target) startMouseCheck();
  });
}
function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.classList.remove("visible");
  }
  currentTarget = null;
  focusTarget = null;
  stopMouseCheck();
}
function stopMouseCheck() {
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
    mouseCheckInterval = null;
  }
}
function pointerGone() {
  const held = focusTarget;
  if (held && held === currentTarget) return;
  hideTooltip();
  if (!held) return;
  focusTarget = held;
  showTooltip(held);
  requestAnimationFrame(() => {
    if (held === focusTarget && held === currentTarget) followFocus();
  });
}
function followFocus() {
  const { left, top, width, height } = focusTarget.getBoundingClientRect();
  const inSight = focusTarget.contains(document.elementFromPoint(left + width / 2, top + height / 2));
  tooltipElement.classList.toggle("visible", inSight);
  if (inSight) positionTooltip(focusTarget, tooltipElement);
}
function startMouseCheck() {
  stopMouseCheck();
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
        pointerGone();
      }
    } else {
      pointerGone();
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
    pointerGone();
  }, true);
  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) byKeyboard = true;
  }, true);
  window.addEventListener("pointerdown", () => {
    byKeyboard = false;
  }, true);
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !byKeyboard) return;
    const tooltipTarget = target.closest(".has-latex-tooltip, .twm-has-tooltip");
    if (!tooltipTarget) return;
    focusTarget = tooltipTarget;
    showTooltip(tooltipTarget);
  }, true);
  document.addEventListener("focusout", (event) => {
    if (!focusTarget) return;
    const next = event.relatedTarget;
    if (next instanceof Node && focusTarget.contains(next)) return;
    if (focusTarget === currentTarget) hideTooltip();
    else focusTarget = null;
  }, true);
  document.addEventListener("scroll", () => {
    if (focusTarget && focusTarget === currentTarget) followFocus();
    else pointerGone();
  }, true);
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
  CELL_EDITORS,
  CHAT_BUS_EVENTS,
  CHAT_SHELL_LABELS,
  CHAT_STATES,
  CHAT_TRANSITIONS,
  CHAT_TRANSPORT_EVENTS,
  COLUMN_FIT,
  CONVERSATION_COMPOSER_MAX_PX,
  CONVERSATION_PIN_WITHIN_PX,
  CategoryPicker,
  CellEditorHost,
  CellSelection,
  ChatStateMachine,
  ColorField,
  ColorListField,
  ComponentBase,
  ControllerBase,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_MAX_SAVED_WINDOWS,
  DEFAULT_TYPES,
  DEFAULT_WINDOW_STORAGE_KEY,
  DataTable,
  DocumentOutline,
  DragReorder,
  EDITOR_MESSAGES,
  FILTER_OPERATORS,
  FILTER_TYPE_OPERATORS,
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
  SettingsCategories,
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
  attachInputOptions,
  barCovered,
  cloneFilter,
  coerceFilterValue,
  countConditions,
  createAlertLog,
  createBoolEditor,
  createChipsFilter,
  createChoiceEditor,
  createCombobox,
  createDateTimeEditor,
  createDetailHeader,
  createDocumentOutline,
  createFactTable,
  createFilterBuilder,
  createFilterModel,
  createMenuBar,
  createMultiTextEditor,
  createNumberEditor,
  createPickerSwitcher,
  createRafResizeObserver,
  createRecentItems,
  createRecordList,
  createScrollLock,
  createSectionStack,
  createSelect,
  createTableStateStore,
  createTabs,
  createTagInput,
  createTextEditor,
  createTreeCategory,
  createTreeItem,
  createTreeNode,
  createWorkspacePicker,
  dateOrder,
  dayLabel,
  detectSeries,
  editorTypeOf,
  emptyFilter,
  endsTextSelection,
  filterOptions,
  filterTree,
  fitColumns,
  formatDate,
  formatDateTimeForEdit,
  formatDuration,
  formatElapsed,
  formatNumberForEdit,
  fromConditionTree,
  fromTSV,
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
  isInAnchoredLayer,
  isRowActivation,
  isRowControl,
  localSource,
  matchDateFilter,
  matchDurationFilter,
  modalHost,
  mountAlertsPane,
  mountAttributeListEditor,
  mountChatShell,
  mountConversationView,
  mountGalleryPicker,
  mountPickerField,
  normalizeHex,
  normalizeLevel,
  normalizeOptions,
  notificationText,
  numberSeparators,
  openAnchoredLayer,
  openConfirm,
  openFilterDialog,
  openForm,
  openModal,
  openPopover,
  parseBool,
  parseChoice,
  parseDatePeriod,
  parseDateTime,
  parseDateValue,
  parseDuration,
  parseFilter,
  parseNumber,
  positionAnchored,
  projectSeries,
  refTypesFor,
  renderMarkdown,
  reportBridgeError,
  resolvePaging,
  revealInStrip,
  selectItem,
  serializeFilter,
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
  showNotificationMenu,
  showRunProgressDialog,
  showSelectDialog,
  suppressNativeContextMenu,
  thumbGeometry,
  toConditionTree,
  toTSV,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarn,
  toggleCategory,
  toggleNode,
  tsvCell,
  updateDetailHeader,
  wheelStripSideways,
  worstLevel
};
//# sourceMappingURL=widgets.js.map
