import {
  isRowActivation,
  isRowControl
} from "./chunk-6JSOVNID.js";

// src/ui/utils/raf_resize_observer.js
function createRafResizeObserver(callback) {
  let scheduled = false;
  let latestEntries = [];
  return new ResizeObserver((entries) => {
    latestEntries = entries;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      callback(latestEntries);
    });
  });
}

// src/ui/components/table_values.js
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var ISO_DATE = "YYYY-MM-DD";
var ISO_DATETIME = "YYYY-MM-DD HH:mm";
var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
var pad = (n, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, "0");
function daysInMonth(y, mo) {
  if (mo !== 1) return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo];
  return y % 4 === 0 && y % 100 !== 0 || y % 400 === 0 ? 29 : 28;
}
function partsToTime(utc, y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0) {
  const date = /* @__PURE__ */ new Date(0);
  if (utc) {
    date.setUTCFullYear(y, mo, d);
    date.setUTCHours(h, mi, s, ms);
  } else {
    date.setFullYear(y, mo, d);
    date.setHours(h, mi, s, ms);
  }
  return date.getTime();
}
function parseDateValue(value, { utc = false } = {}) {
  if (value == null || value === "") return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  const m = ISO_RE.exec(text);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo - 1)) return NaN;
  const h = m[4] ? Number(m[4]) : 0;
  const mi = m[5] ? Number(m[5]) : 0;
  const s = m[6] ? Number(m[6]) : 0;
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1e3) : 0;
  if (h > 24 || mi > 59 || s > 60 || h === 24 && (mi || s || ms)) return NaN;
  const zone = m[8];
  if (zone) {
    let offset = 0;
    if (zone.toUpperCase() !== "Z") {
      const sign = zone[0] === "-" ? -1 : 1;
      const digits = zone.slice(1).replace(":", "");
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
    }
    return partsToTime(true, y, mo - 1, d, h, mi, s, ms) - offset * 6e4;
  }
  return partsToTime(utc, y, mo - 1, d, h, mi, s, ms);
}
function formatDate(value, pattern = ISO_DATE, { utc = false } = {}) {
  if (value == null || value === "") return "";
  const t = parseDateValue(value, { utc });
  if (!Number.isFinite(t)) return String(value);
  const date = new Date(t);
  if (typeof pattern === "function") return String(pattern(date) ?? "");
  const get = utc ? {
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth(),
    d: date.getUTCDate(),
    wd: date.getUTCDay(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
    ms: date.getUTCMilliseconds()
  } : {
    y: date.getFullYear(),
    mo: date.getMonth(),
    d: date.getDate(),
    wd: date.getDay(),
    h: date.getHours(),
    mi: date.getMinutes(),
    s: date.getSeconds(),
    ms: date.getMilliseconds()
  };
  const h12 = get.h % 12 === 0 ? 12 : get.h % 12;
  return String(pattern || ISO_DATE).replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g,
    (tok, literal) => {
      if (literal !== void 0) return literal;
      switch (tok) {
        case "YYYY":
          return pad(get.y, 4);
        case "YY":
          return pad(get.y % 100);
        case "MMMM":
          return MONTHS[get.mo];
        case "MMM":
          return MONTHS[get.mo].slice(0, 3);
        case "MM":
          return pad(get.mo + 1);
        case "M":
          return String(get.mo + 1);
        case "dddd":
          return WEEKDAYS[get.wd];
        case "ddd":
          return WEEKDAYS[get.wd].slice(0, 3);
        case "DD":
          return pad(get.d);
        case "D":
          return String(get.d);
        case "HH":
          return pad(get.h);
        case "H":
          return String(get.h);
        case "hh":
          return pad(h12);
        case "h":
          return String(h12);
        case "mm":
          return pad(get.mi);
        case "m":
          return String(get.mi);
        case "ss":
          return pad(get.s);
        case "s":
          return String(get.s);
        case "SSS":
          return pad(get.ms, 3);
        case "A":
          return get.h < 12 ? "AM" : "PM";
        case "a":
          return get.h < 12 ? "am" : "pm";
        default:
          return tok;
      }
    }
  );
}
function parseDatePeriod(text, { utc = false } = {}) {
  const t = String(text ?? "").trim();
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?)?)?$/i.exec(t);
  if (m) {
    const parts = [
      Number(m[1]),
      m[2] ? Number(m[2]) - 1 : 0,
      m[3] ? Number(m[3]) : 1,
      m[4] ? Number(m[4]) : 0,
      m[5] ? Number(m[5]) : 0,
      m[6] ? Number(m[6]) : 0
    ];
    if (parts[1] < 0 || parts[1] > 11 || parts[2] < 1 || parts[2] > daysInMonth(parts[0], parts[1]) || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
    const unit = m[6] ? 5 : m[5] ? 4 : m[4] ? 3 : m[3] ? 2 : m[2] ? 1 : 0;
    const next = parts.slice();
    next[unit] += 1;
    return { start: partsToTime(utc, ...parts), end: partsToTime(utc, ...next) };
  }
  const instant = parseDateValue(t, { utc });
  return Number.isFinite(instant) ? { start: instant, end: instant + 1 } : null;
}
var DURATION_UNITS = {
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1e3,
  sec: 1e3,
  secs: 1e3,
  second: 1e3,
  seconds: 1e3,
  m: 6e4,
  min: 6e4,
  mins: 6e4,
  minute: 6e4,
  minutes: 6e4,
  h: 36e5,
  hr: 36e5,
  hrs: 36e5,
  hour: 36e5,
  hours: 36e5,
  d: 864e5,
  day: 864e5,
  days: 864e5
};
function parseDuration(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim().toLowerCase();
  if (!text) return NaN;
  let sign = 1;
  if (text[0] === "-") {
    sign = -1;
    text = text.slice(1).trim();
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) return sign * Number(text);
  const clock = /^(?:(\d+)\.)?(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(text);
  if (clock) {
    const [, d, a, b, c] = clock;
    const ms = (Number(d || 0) * 86400 + Number(a) * 3600 + Number(b) * 60 + Number(c || 0)) * 1e3;
    return sign * ms;
  }
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/g;
  let total = 0;
  let consumed = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index !== consumed) return NaN;
    const unit = DURATION_UNITS[m[2]];
    if (unit === void 0) return NaN;
    total += Number(m[1]) * unit;
    consumed = re.lastIndex;
  }
  return consumed === text.length && consumed > 0 ? sign * total : NaN;
}
function formatDuration(value, pattern = "auto") {
  if (value == null || value === "") return "";
  const ms = parseDuration(value);
  if (!Number.isFinite(ms)) return String(value);
  if (typeof pattern === "function") return String(pattern(ms) ?? "");
  const neg = ms < 0;
  const a = Math.abs(ms);
  let out;
  if (pattern === "clock") {
    const total = Math.round(a / 1e3);
    const d = Math.floor(total / 86400);
    const h = Math.floor(total % 86400 / 3600);
    const mi = Math.floor(total % 3600 / 60);
    const s = total % 60;
    out = `${d ? `${d}.${pad(h)}` : h}:${pad(mi)}:${pad(s)}`;
  } else if (a < 1e3) {
    out = `${Math.round(a)} ms`;
  } else if (a < 59950) {
    out = `${(a / 1e3).toFixed(1)} s`;
  } else if (a < 36e5) {
    let mi = Math.floor(a / 6e4);
    let s = Math.round(a % 6e4 / 1e3);
    if (s === 60) {
      mi += 1;
      s = 0;
    }
    out = `${mi}m ${s}s`;
  } else if (a < 864e5) {
    let h = Math.floor(a / 36e5);
    let mi = Math.round(a % 36e5 / 6e4);
    if (mi === 60) {
      h += 1;
      mi = 0;
    }
    out = `${h}h ${mi}m`;
  } else {
    let d = Math.floor(a / 864e5);
    let h = Math.round(a % 864e5 / 36e5);
    if (h === 24) {
      d += 1;
      h = 0;
    }
    out = `${d}d ${h}h`;
  }
  return neg ? `-${out}` : out;
}
function matchDateFilter(t, filterText, shown, { utc = false } = {}) {
  const text = String(filterText ?? "").trim();
  if (!text) return true;
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(text);
  if (range) {
    const lo = parseDatePeriod(range[1], { utc });
    const hi = parseDatePeriod(range[2], { utc });
    if (!lo || !hi) return true;
    return Number.isFinite(t) && t >= lo.start && t < hi.end;
  }
  const op = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(text);
  if (op) {
    const p2 = parseDatePeriod(op[2], { utc });
    if (!p2) return true;
    if (!Number.isFinite(t)) return false;
    switch (op[1]) {
      case ">":
        return t >= p2.end;
      case ">=":
        return t >= p2.start;
      case "<":
        return t < p2.start;
      case "<=":
        return t < p2.end;
      case "=":
        return t >= p2.start && t < p2.end;
      case "!=":
        return !(t >= p2.start && t < p2.end);
    }
  }
  const p = parseDatePeriod(text, { utc });
  if (p) return Number.isFinite(t) && t >= p.start && t < p.end;
  return String(shown ?? "").toLowerCase().includes(text.toLowerCase());
}
function matchDurationFilter(ms, filterText, shown) {
  const text = String(filterText ?? "").trim();
  if (!text) return true;
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(text);
  if (range) {
    const lo = parseDuration(range[1]);
    const hi = parseDuration(range[2]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true;
    return Number.isFinite(ms) && ms >= lo && ms <= hi;
  }
  const op = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(text);
  if (op) {
    const target = parseDuration(op[2]);
    if (!Number.isFinite(target)) return true;
    if (!Number.isFinite(ms)) return false;
    switch (op[1]) {
      case ">":
        return ms > target;
      case ">=":
        return ms >= target;
      case "<":
        return ms < target;
      case "<=":
        return ms <= target;
      case "=":
        return ms === target;
      case "!=":
        return ms !== target;
    }
  }
  return String(shown ?? "").toLowerCase().includes(text.toLowerCase());
}

// src/ui/components/table_filter_chips.js
var isAll = (v) => v === "" || v == null;
function createChipsFilter(ctx = {}, spec = {}) {
  const options = Array.isArray(spec.options) ? spec.options : [];
  const multiple = !!spec.multiple;
  const showCounts = spec.counts !== false;
  const el = document.createElement("div");
  el.className = "twm-dt-filter-chips" + (multiple ? " twm-dt-filter-chips--multiple" : "");
  el.setAttribute("role", "group");
  const name = spec.label || ctx.header;
  if (name) el.setAttribute("aria-label", String(name));
  const valueOf = /* @__PURE__ */ new Map();
  const chips = /* @__PURE__ */ new Map();
  let value = null;
  const keyOf = (v) => String(v ?? "");
  const normalise = (v) => {
    if (multiple) {
      const list = Array.isArray(v) ? v : isAll(v) ? [] : [v];
      return list.filter((x) => !isAll(x)).map(keyOf);
    }
    if (Array.isArray(v)) v = v[0];
    return isAll(v) ? null : keyOf(v);
  };
  const chosen = () => multiple ? value.length === 0 : value === null;
  for (const opt of options) {
    const key = keyOf(opt.value);
    valueOf.set(key, opt.value);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "twm-dt-filter-chip";
    btn.dataset.value = key;
    if (opt.title) btn.title = String(opt.title);
    if (opt.icon) {
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined twm-dt-filter-chip__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = String(opt.icon);
      btn.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = "twm-dt-filter-chip__label";
    label.textContent = String(opt.label ?? key);
    btn.appendChild(label);
    let count = null;
    if (showCounts) {
      count = document.createElement("span");
      count.className = "twm-dt-filter-chip__count";
      count.textContent = "\u2013";
      btn.appendChild(count);
    }
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pick(key);
    });
    chips.set(key, { btn, count });
    el.appendChild(btn);
  }
  function outward() {
    if (multiple) return value.length ? value.map((k) => valueOf.get(k)) : null;
    return value === null ? null : valueOf.get(value);
  }
  function pick(key) {
    if (isAll(key)) value = multiple ? [] : null;
    else if (multiple) {
      value = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    } else {
      value = value === key ? null : key;
    }
    paint();
    const out = outward();
    if (typeof ctx.setValue === "function") ctx.setValue(out);
    try {
      spec.onChange?.(out);
    } catch (err) {
      console.error("[chips filter] onChange threw", err);
    }
  }
  function paint() {
    for (const [key, { btn }] of chips) {
      const on = isAll(key) ? chosen() : multiple ? value.includes(key) : value === key;
      btn.classList.toggle("twm-dt-filter-chip--on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function setValue(v) {
    value = normalise(v);
    paint();
  }
  function setCounts(counts) {
    for (const [key, { btn, count }] of chips) {
      const n = counts == null ? void 0 : counts[key];
      const known = typeof n === "number" && Number.isFinite(n);
      if (count) count.textContent = known ? n.toLocaleString() : "\u2013";
      btn.classList.toggle("twm-dt-filter-chip--empty", known && n === 0);
    }
  }
  setValue(ctx.value);
  if (ctx.counts) setCounts(ctx.counts);
  return {
    el,
    setValue,
    setCounts,
    getValue: outward,
    destroy() {
    }
  };
}

// src/ui/components/data_table.js
var DEFAULT_PAGE_SIZE = 100;
var DIFF_STATUSES = /* @__PURE__ */ new Set(["added", "removed", "changed", "same", "gap"]);
var PAGING_HARD_LIMIT = 1e5;
var PAGING_SOFT_LIMIT = 1e4;
function resolvePaging({
  mode = "scroll",
  total = null,
  atLeast = 0,
  held = 0,
  hasMore = false,
  softLimit = PAGING_SOFT_LIMIT,
  hardLimit = PAGING_HARD_LIMIT
} = {}) {
  const requested = mode === "pages" ? "pages" : "scroll";
  const hard = Number.isFinite(hardLimit) && hardLimit >= 1 ? Math.floor(hardLimit) : PAGING_HARD_LIMIT;
  const soft = Math.min(hard, Number.isFinite(softLimit) && softLimit >= 1 ? Math.floor(softLimit) : PAGING_SOFT_LIMIT);
  const exact = Number.isFinite(total) && total >= 0;
  const known = exact ? total : Math.max(Number.isFinite(atLeast) ? atLeast : 0, (held || 0) + (hasMore ? 1 : 0));
  const forced = requested === "scroll" && known > soft;
  return {
    mode: forced ? "pages" : requested,
    requested,
    forced,
    softLimit: soft,
    hardLimit: hard,
    known,
    exact
  };
}
var PAGING_LOAD_MORE_PX = 400;
var TYPED_COLUMNS = /* @__PURE__ */ new Set(["date", "datetime", "duration"]);
var DESELECTING_CLICKS = /* @__PURE__ */ new WeakSet();
var AUTO_DISPOSE = /* @__PURE__ */ new Map();
var AUTO_REFS = /* @__PURE__ */ new WeakMap();
var weakRef = (table) => typeof WeakRef === "function" ? new WeakRef(table) : { deref: () => table };
function autoDisposeSweep(entry) {
  for (const ref of entry.tables) {
    const table = ref.deref();
    if (!table) {
      entry.tables.delete(ref);
      continue;
    }
    const el = table._wrapperEl;
    if (!el) continue;
    if (el.isConnected) {
      table._autoSeen = true;
      if (table._autoPending) {
        clearTimeout(table._autoTimer);
        table._autoTimer = null;
        table._autoPending = false;
      }
      continue;
    }
    if (!table._autoSeen || table._autoPending) continue;
    const grace = table._detachGrace();
    if (grace === Infinity) continue;
    table._autoPending = true;
    table._autoTimer = setTimeout(() => {
      table._autoPending = false;
      table._autoTimer = null;
      if (!entry.tables.has(ref)) return;
      const now = table._wrapperEl;
      if (now && !now.isConnected) table._disposeOwn();
    }, grace);
  }
  if (entry.tables.size === 0) autoDisposeRelease(entry);
}
function autoDisposeRelease(entry) {
  for (const [doc, e] of AUTO_DISPOSE) {
    if (e !== entry) continue;
    try {
      e.observer.disconnect();
    } catch (_) {
    }
    AUTO_DISPOSE.delete(doc);
  }
}
function autoDisposeWatch(table) {
  const doc = table.container?.ownerDocument;
  const MO = doc?.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (!doc || typeof MO !== "function") return;
  let entry = AUTO_DISPOSE.get(doc);
  if (!entry) {
    entry = { observer: null, tables: /* @__PURE__ */ new Set() };
    entry.observer = new MO(() => autoDisposeSweep(entry));
    entry.observer.observe(doc, { childList: true, subtree: true });
    AUTO_DISPOSE.set(doc, entry);
  }
  let ref = AUTO_REFS.get(table);
  if (!ref) {
    ref = weakRef(table);
    AUTO_REFS.set(table, ref);
  }
  entry.tables.add(ref);
  if (table._wrapperEl?.isConnected) table._autoSeen = true;
}
function autoDisposeUnwatch(table) {
  const ref = AUTO_REFS.get(table);
  if (!ref) return;
  for (const entry of [...AUTO_DISPOSE.values()]) {
    if (entry.tables.delete(ref) && entry.tables.size === 0) autoDisposeRelease(entry);
  }
}
function perColumn(option, colIdx) {
  if (option == null) return null;
  if (Array.isArray(option)) return option[colIdx] ?? null;
  if (typeof option === "object") return option[colIdx] ?? null;
  return option;
}
var DETAIL_SEQ = { n: 0 };
function defaultControlMatch(cell, value) {
  if (Array.isArray(value)) return value.some((v) => String(v ?? "") === String(cell ?? ""));
  if (value && typeof value === "object" && !(value instanceof Date) && ("from" in value || "to" in value)) {
    const asNumber = (x) => {
      if (x == null || x === "") return null;
      if (x instanceof Date) return x.getTime();
      if (typeof x === "number") return x;
      const t = parseDateValue(x);
      if (Number.isFinite(t)) return t;
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : null;
    };
    const c = asNumber(cell);
    if (c === null) return false;
    const lo = asNumber(value.from);
    const hi = asNumber(value.to);
    if (lo !== null && c < lo) return false;
    if (hi !== null && c > hi) return false;
    return true;
  }
  if (typeof value === "string") {
    return String(cell ?? "").toLowerCase().includes(value.toLowerCase());
  }
  return String(value) === String(cell ?? "");
}
function chipsMatch(spec) {
  return (cell, value) => {
    const want = Array.isArray(value) ? value : [value];
    return want.some((v) => String(v ?? "") === String(cell ?? ""));
  };
}
function normaliseSortKey(k) {
  if (k == null) return null;
  if (k instanceof Date) k = k.getTime();
  if (typeof k === "boolean") return k ? 1 : 0;
  if (typeof k === "number") return Number.isFinite(k) ? k : null;
  if (typeof k === "bigint") return Number(k);
  return String(k).toLowerCase();
}
function compareSortKeys(a, b, asc) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = typeof a === "number";
  const nb = typeof b === "number";
  let cmp;
  if (na !== nb) cmp = na ? -1 : 1;
  else cmp = a < b ? -1 : a > b ? 1 : 0;
  return asc ? cmp : -cmp;
}
var AUTOSIZE_MAX_PX = 520;
var VIRTUAL_FALLBACK_VIEWPORT_PX = 1e3;
var DataTable = class {
  /**
   * Create a DataTable instance
   * @param {HTMLElement} container - Container element to render into
   * @param {DataTableConfig} config - Configuration options
   */
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      headers: [],
      rows: [],
      pageSize: DEFAULT_PAGE_SIZE,
      pagination: true,
      selectable: true,
      copyable: true,
      sortable: false,
      filterable: false,
      readonly: false,
      showRowNumbers: false,
      emptyMessage: "No data",
      onSort: null,
      // OFF unless asked for, for `columnFit`'s reason below: a sort kept
      // the client-side page before this key existed, so turning the
      // reset on for everybody would change every paged table that never
      // asked. See the typedef.
      resetPageOnSort: false,
      onSelectionChange: null,
      formatValue: null,
      getHeaderIcon: null,
      getColumnType: null,
      services: null,
      // Server-side pagination
      totalCount: null,
      offset: 0,
      onPageChange: null,
      onJumpToRow: null,
      // Custom cell rendering
      renderCell: null,
      // Rendering density + bottom-panel hooks (P2)
      mode: "normal",
      onRowClick: null,
      onRowContextMenu: null,
      onCellContextMenu: null,
      showExportButton: false,
      // The host port. TOP LEVEL, deliberately — NOT inside `services`,
      // which most call sites never pass. Supplies the native save
      // dialog for downloadCSV(); absent => Blob fallback.
      host: null,
      // Opt-in persistence: when set, this table's sort, filters, and
      // column widths survive teardown/reload, keyed by this string
      // inside the injected `stateStore`. Omit it and the table stays
      // ephemeral. WHERE the store persists is the embedder's business.
      persistKey: null,
      stateStore: null,
      // How the automatic fit pass sizes an undragged column — see the
      // typedef. 'container' is exactly what every consumer got before
      // this key existed, so the default is not a preference: it is the
      // promise that adding the key changed no existing layout by a
      // pixel. Only a consumer that asks for 'content' sees anything new.
      columnFit: "container",
      // Off unless asked for — see the typedef. With it the old pager is
      // not drawn: the paging strip says the same and more.
      paging: null,
      // C10. Off unless asked for — see the typedef.
      virtualize: false,
      virtualRowHeight: null,
      onRowsRendered: null,
      // 0.5.0. Every key below is off — or exactly the 0.4 behaviour — until
      // a consumer sets it (D6: additive and back-compatible). The typedef
      // says what each does.
      fitContent: false,
      maxHeight: null,
      autoDispose: false,
      firstColumn: "time",
      clickable: null,
      onRowActivate: null,
      activateOn: "click",
      getRowKey: null,
      activeRow: null,
      rowClass: null,
      rowAttrs: null,
      cellClass: null,
      diff: null,
      scrollLock: null,
      rowIcon: null,
      emptyState: void 0,
      nullDisplay: null,
      columnTypes: null,
      sortValue: null,
      dateFormat: null,
      dateTimeFormat: null,
      durationFormat: null,
      dateTimeZone: "local",
      // 0.7.0. Off — or exactly the 0.6 behaviour — until set. The
      // typedef says what each does.
      rowDetail: null,
      hasRowDetail: null,
      expandedRows: null,
      onRowDetailToggle: null,
      rowDetailLabel: "Details",
      dataSource: null,
      onLoad: null,
      onLoadError: null,
      hasMore: void 0,
      pagerLabels: null,
      pagerPosition: "top",
      maxJumpOffset: null,
      follow: false,
      onFollowChange: null,
      keepWhileDetached: false,
      filterKinds: null,
      onFilterChange: null,
      ...config
    };
    this._expanded = new Set((this.config.expandedRows || []).map((k) => String(k)));
    this._detailHeights = /* @__PURE__ */ new Map();
    this._source = null;
    this._following = !!this.config.follow && !!this.config.dataSource;
    this._followTimer = null;
    this._newKeys = null;
    this._filterControls = /* @__PURE__ */ new Map();
    this._filterCounts = /* @__PURE__ */ new Map();
    this._pendingFilter = null;
    this._activeKey = this.config.activeRow == null ? null : String(this.config.activeRow);
    this._error = null;
    this._virt = null;
    this._virtBase = null;
    if (this.config.persistKey && !this.config.stateStore) {
      throw new Error(`DataTable: persistKey "${this.config.persistKey}" requires { stateStore }`);
    }
    this._state = {
      offset: 0,
      selected: /* @__PURE__ */ new Set(),
      anchorIndex: null,
      sortColumn: null,
      sortAscending: true,
      filters: /* @__PURE__ */ new Map()
    };
    this._columnTypes = [];
    this._processedRows = null;
    this._processedIndexMap = null;
    this._filterDebounceTimer = null;
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._contextMenuEl = null;
    this._filterDropdownEl = null;
    this._filterDropdownCleanup = null;
    this._colWidths = {};
    this._colWidthsSig = null;
    this._disposers = [];
    this._contextMenuGlobals = [];
    this._activationOffs = [];
    if (this.config.persistKey) {
      const store = this.config.stateStore;
      this._restorePersisted(store.get(this.config.persistKey));
      store.ready().then(() => {
        const late = store.get(this.config.persistKey);
        if (late && this._restorePersisted(late) && this._wrapperEl) {
          this._invalidateProcessedCache?.();
          this.render();
        }
      });
    }
  }
  /**
   * 0.5.0. Construct AND DRAW, in one call. The constructor draws nothing
   * until `render()`, so every consumer that forgot the second line got an
   * empty box; this is the two lines, once.
   *
   * Called on a class made by `withDefaults`, it builds that class — so the
   * house defaults apply.
   *
   * @param {HTMLElement} container
   * @param {DataTableConfig} [config]
   * @returns {DataTable}
   */
  static mount(container, config = {}) {
    const table = new this(container, config);
    table.render();
    return table;
  }
  /**
   * 0.5.0. A DataTable class with house defaults: `defaults` sit under every
   * config it is constructed (or `mount`ed) with, and the config wins key by
   * key. It is a real subclass — `instanceof DataTable` holds — and it can be
   * narrowed again with its own `withDefaults`.
   *
   *     const ListTable = DataTable.withDefaults({ mode: 'compact', sortable: true,
   *                                                pagination: false, fitContent: true });
   *     const table = ListTable.mount(host, { headers, rows });
   *
   * @param {DataTableConfig} defaults
   * @returns {typeof DataTable}
   */
  static withDefaults(defaults = {}) {
    const house = { ...defaults };
    return class extends this {
      constructor(container, config = {}) {
        super(container, { ...house, ...config });
      }
    };
  }
  /** Apply a persisted blob ({sort, asc, filters, widths}) onto this
   *  table's live state. Returns true if anything was applied. */
  _restorePersisted(blob) {
    if (!blob) return false;
    let applied = false;
    if (typeof blob.sortColumn === "number" || blob.sortColumn === null) {
      this._state.sortColumn = blob.sortColumn;
      this._state.sortAscending = blob.sortAscending !== false;
      applied = true;
    }
    if (Array.isArray(blob.filters)) {
      this._state.filters = new Map(blob.filters);
      applied = true;
    }
    if (blob.colWidths && typeof blob.colWidths === "object") {
      this._colWidths = {};
      for (const [k, v] of Object.entries(blob.colWidths)) {
        this._colWidths[Number(k)] = v;
      }
      this._colWidthsSig = this._colSig();
      applied = true;
    }
    return applied;
  }
  /** Identity of the current column set — restored widths/sort are
   *  keyed by position, so a schema change invalidates them. */
  _colSig() {
    return (this.config.headers || []).join("") + (this.config.showRowNumbers ? "|#" : "");
  }
  /** Snapshot the persistable slice of state to the project store.
   *  No-op unless `persistKey` is set. Debounced inside the store. */
  _savePersisted() {
    if (!this.config.persistKey) return;
    this.config.stateStore.set(this.config.persistKey, {
      sortColumn: this._state.sortColumn,
      sortAscending: this._state.sortAscending,
      filters: [...this._state.filters.entries()],
      colWidths: { ...this._colWidths }
    });
  }
  /**
   * Update data and re-render
   * @param {Object} updates - Partial config updates (headers, rows, etc.)
   */
  setData(updates) {
    if (updates.headers && this._state.filters.size > 0) {
      const oldHeaders = this.config.headers;
      const newHeaders = updates.headers;
      if (oldHeaders.length !== newHeaders.length || oldHeaders.some((h, i) => h !== newHeaders[i])) {
        this._state.filters.clear();
      }
    }
    if (updates.headers && (this._filterControls.size || this._filterCounts.size)) {
      const oldHeaders = this.config.headers;
      const newHeaders = updates.headers;
      if (oldHeaders.length !== newHeaders.length || oldHeaders.some((h, i) => h !== newHeaders[i])) {
        this._destroyFilterControls();
        this._filterCounts.clear();
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, "filterKinds")) {
      this._destroyFilterControls();
    }
    Object.assign(this.config, updates);
    if (updates.rows) {
      this._state.selected.clear();
      this._state.anchorIndex = null;
      if (this._state.offset >= updates.rows.length) {
        this._state.offset = 0;
      }
      this._columnTypes = this._detectColumnTypes();
      this._error = null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "activeRow")) {
      this._activeKey = updates.activeRow == null ? null : String(updates.activeRow);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "columnTypes") && !updates.rows) {
      this._columnTypes = this._detectColumnTypes();
    }
    this._processedRows = null;
    this._processedIndexMap = null;
    this.render();
  }
  /**
   * Show / hide a translucent loading overlay over the table body.
   * Used by server-side consumers between firing a fetch and
   * receiving the new rows so the UI doesn't appear frozen.
   * Callers either:
   *   - call `setLoading(true)` before their fetch, `setLoading(false)` after, OR
   *   - return a Promise from `onPageChange` / `onSort` callbacks
   *     — the overlay auto-shows during the await.
   * @param {boolean} on
   */
  setLoading(on) {
    this._loading = !!on;
    if (!this._wrapperEl) return;
    this._wrapperEl.classList.toggle(
      "twm-data-table-component--loading",
      !!on && (this.config.emptyState !== void 0 || !!this.config.dataSource)
    );
    let overlay = this._wrapperEl.querySelector(".twm-data-table__loading");
    if (on) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "twm-data-table__loading";
        overlay.innerHTML = '<div class="twm-data-table__spinner"></div>';
        if (!this._wrapperEl.style.position) {
          this._wrapperEl.style.position = "relative";
        }
        this._wrapperEl.appendChild(overlay);
      }
    } else if (overlay) {
      overlay.remove();
    }
  }
  /**
   * Get current selection indices
   * @returns {number[]} Array of selected row indices
   */
  getSelection() {
    return Array.from(this._state.selected).sort((a, b) => a - b);
  }
  /**
   * Set selection programmatically
   * @param {number[]} indices - Row indices to select
   */
  setSelection(indices) {
    this._state.selected.clear();
    for (const idx of indices) {
      if (idx >= 0 && idx < this.config.rows.length) {
        if (this.config.selectable === "single") this._state.selected.clear();
        this._state.selected.add(idx);
      }
    }
    if (this.config.selectable === "single") {
      this._state.anchorIndex = this._state.selected.size ? [...this._state.selected][0] : null;
    }
    this._updateRowSelection();
    this._notifySelectionChange();
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.5.0 — the open row, the failure state, column widths
  // ─────────────────────────────────────────────────────────────────
  /**
   * Mark the row that is OPEN — the master of a master-detail — by its key
   * (`getRowKey`; without it, the row's original index). `null` clears it.
   *
   * The mark is NOT the selection: `setData` keeps it (the key is looked for
   * in the new rows), a right-click does not move it, and a sort, a filter or
   * a page change finds it where the row went. Drawn as `twm-dt-row--active`
   * and `aria-current="true"` on the row, in place — no re-render.
   *
   * @param {*} key
   */
  setActiveRow(key) {
    this._activeKey = key == null ? null : String(key);
    this.config.activeRow = key ?? null;
    const tbody = this._tbodyEl;
    if (!tbody) return;
    for (const tr of tbody.children) {
      if (tr.__rowIndex === void 0) continue;
      this._paintActive(tr);
    }
  }
  /** The open row's key, as text, or null. */
  getActiveRow() {
    return this._activeKey;
  }
  /**
   * Show a FAILURE inside the table's own box: text, a node, or an `Error`
   * (its message). The rows already drawn STAY — a failed refresh does not
   * blank a list a person was reading — under a banner saying what failed;
   * with no rows, the failure takes the empty row's place. `setError(null)`
   * clears it, and so does `setData({rows})`: new rows are an answer. A
   * failure also ends `setLoading`.
   *
   * @param {string|Node|Error|null} error
   */
  setError(error) {
    this._error = error == null || error === false ? null : error;
    if (this._error) this.setLoading(false);
    if (this._wrapperEl) this.render();
  }
  /** What `setError` was last given, or null. */
  getError() {
    return this._error;
  }
  /**
   * Forget every column width a person dragged, a double-click fitted or the
   * store restored, and measure the columns again from what is on screen —
   * for an embedder whose content has just changed size under them (a zoom,
   * a font). Persisted widths are cleared too.
   *
   * @returns {boolean} whether there was a table to measure
   */
  resetColumnWidths() {
    this._colWidths = {};
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    if (!this._headerTableEl || !this._tableEl) return false;
    this._syncHeaderWidths();
    return true;
  }
  /**
   * Clear selection
   */
  clearSelection() {
    this._state.selected.clear();
    this._state.anchorIndex = null;
    this._updateRowSelection();
    this._notifySelectionChange();
  }
  /**
   * Go to specific page
   * @param {number} page - Page number (0-indexed)
   */
  goToPage(page) {
    if (this.config.dataSource) {
      const size = this._sourcePageSize();
      let p = Math.max(0, Math.floor(Number(page)) || 0);
      const total = this._source?.total;
      if (typeof total === "number") p = Math.min(p, Math.max(0, Math.ceil(total / size) - 1));
      return this._sourceGoTo(p * size);
    }
    const rowCount = this._getProcessedRows().length;
    const maxPage = Math.ceil(rowCount / this.config.pageSize) - 1;
    this._state.offset = Math.max(0, Math.min(page, maxPage)) * this.config.pageSize;
    this.render();
  }
  /**
   * Go to specific row
   * @param {number} rowIndex - Row index
   */
  goToRow(rowIndex) {
    if (this.config.dataSource) {
      const size = this._sourcePageSize();
      return this.goToPage(Math.floor(Math.max(0, Math.floor(Number(rowIndex)) || 0) / size));
    }
    const rowCount = this._getProcessedRows().length;
    const idx = Math.max(0, Math.min(rowIndex, rowCount - 1));
    this._state.offset = Math.floor(idx / this.config.pageSize) * this.config.pageSize;
    this.render();
  }
  /**
   * Sort by column
   * @param {number} colIndex - Column index
   * @param {boolean} [ascending] - Sort direction (toggles if same column)
   */
  sortBy(colIndex, ascending) {
    if (this._state.sortColumn === colIndex && ascending === void 0) {
      this._state.sortAscending = !this._state.sortAscending;
    } else {
      this._state.sortColumn = colIndex;
      this._state.sortAscending = ascending ?? true;
    }
    this._processedRows = null;
    this._processedIndexMap = null;
    if (this.config.resetPageOnSort) this._state.offset = 0;
    const ret = this.config.onSort?.(colIndex, this._state.sortAscending);
    this._awaitWithSpinner(ret);
    this._savePersisted();
    this.render();
    if (this.config.dataSource) this._sourceLoad({ offset: 0, reason: "sort" });
  }
  /** Internal: if `maybePromise` is a Promise (or thenable),
   * toggle the loading overlay around it. No-op otherwise. */
  _awaitWithSpinner(maybePromise) {
    if (!maybePromise || typeof maybePromise.then !== "function") return;
    this.setLoading(true);
    Promise.resolve(maybePromise).finally(() => this.setLoading(false));
  }
  /**
   * Clear all column filters
   */
  clearFilters() {
    this._state.filters.clear();
    this._processedRows = null;
    this._processedIndexMap = null;
    this._state.offset = 0;
    this._pendingFilter = null;
    this._savePersisted();
    for (const { control } of this._filterControls.values()) {
      try {
        control.setValue?.(null);
      } catch (err) {
        console.error("[DataTable] filter control setValue threw", err);
      }
    }
    this._notifyFilterChange();
    if (this.config.dataSource) {
      if (this._wrapperEl) this.render();
      this._sourceLoad({ offset: 0, reason: "filter" });
      return;
    }
    this.render();
  }
  /**
   * Get the number of rows after filtering
   * @returns {number}
   */
  getFilteredRowCount() {
    return this._getProcessedRows().length;
  }
  /**
   * Render the table
   */
  render() {
    const activeFilterColIdx = this._getActiveFilterColIdx();
    const doc = this.container.ownerDocument;
    const hadTableFocus = !!this._tableEl && doc?.activeElement === this._tableEl;
    const focus070 = this._captureFocus070(doc);
    const pendingFilter = this.config.dataSource ? this._pendingFilter : null;
    const prevWrap = this._tableWrapEl;
    const prevScroll = prevWrap?.isConnected && this._renderedOffset === this._state.offset ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;
    this._cleanup();
    this._retireActivation();
    this.container.innerHTML = "";
    this._virt = null;
    const { rows, pagination, emptyMessage } = this.config;
    const colSig = this._colSig();
    if (this._colWidthsSig !== colSig) {
      this._colWidths = {};
      this._colWidthsSig = colSig;
    }
    if (this._columnTypes.length === 0) {
      this._columnTypes = this._detectColumnTypes();
    }
    this._wrapperEl = document.createElement("div");
    this._wrapperEl.className = "twm-data-table-component" + (this.config.mode === "compact" ? " twm-data-table-component--compact" : "");
    const fit = this._fitsContent();
    if (fit) {
      this._wrapperEl.classList.add("twm-data-table-component--fit");
      const max = this._maxHeightCss();
      this._wrapperEl.style.cssText = "display:flex; flex-direction:column; height:auto; min-height:0;" + (max ? ` max-height:${max};` : "");
    } else {
      this._wrapperEl.style.cssText = "display:flex; flex-direction:column; height:100%; min-height:0;";
    }
    this._loading = false;
    this._paginationEl = null;
    if (pagination && (rows.length > 0 || (this._source?.offset || 0) > 0) && !this._pagingConfig()) {
      this._paginationEl = this._createPagination();
      if (this._paginationEl && this.config.pagerPosition !== "bottom") {
        this._wrapperEl.appendChild(this._paginationEl);
      }
    }
    const tableWrap = document.createElement("div");
    tableWrap.className = this.config.readonly ? "twm-preview-table-wrap twm-preview-table-wrap--wizard" : "twm-preview-table-wrap";
    tableWrap.style.cssText = fit ? "flex:0 1 auto; min-height:0; min-width:0; overflow:auto;" : "flex:1 1 0; min-height:0; min-width:0; overflow:auto;";
    if (this._error && rows.length > 0) {
      this._wrapperEl.appendChild(this._createErrorBanner());
    }
    const keepFilterRow = rows.length === 0 && !!this.config.dataSource && this.config.filterable;
    if (rows.length === 0 && !keepFilterRow) {
      const { headers, showRowNumbers } = this.config;
      const headerWrap = document.createElement("div");
      headerWrap.className = "twm-preview-table-header-wrap";
      headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
      const headerTable = document.createElement("table");
      headerTable.className = this._tableClassName();
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      if (showRowNumbers) {
        const th = document.createElement("th");
        th.className = "num";
        th.textContent = "#";
        tr.appendChild(th);
      }
      headers.forEach((h, colIdx) => {
        const th = document.createElement("th");
        th.className = this._columnTypes[colIdx] || "text";
        th.textContent = h;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      headerTable.appendChild(thead);
      headerWrap.appendChild(headerTable);
      this._wrapperEl.appendChild(headerWrap);
      this._headerWrapEl = headerWrap;
      this._headerTableEl = headerTable;
      const bodyTable = document.createElement("table");
      bodyTable.className = headerTable.className;
      const tbody = document.createElement("tbody");
      tbody.appendChild(this._buildEmptyRow(headers.length + (showRowNumbers ? 1 : 0), emptyMessage));
      bodyTable.appendChild(tbody);
      tableWrap.appendChild(bodyTable);
      this._wrapperEl.appendChild(tableWrap);
      this._tableEl = bodyTable;
      this._tableWrapEl = tableWrap;
    } else {
      const fullTable = this._createTable();
      this._tableEl = fullTable;
      const thead = fullTable.querySelector("thead");
      if (thead) {
        const headerWrap = document.createElement("div");
        headerWrap.className = "twm-preview-table-header-wrap";
        headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
        const headerTable = document.createElement("table");
        headerTable.className = fullTable.className;
        headerTable.appendChild(thead);
        headerWrap.appendChild(headerTable);
        this._wrapperEl.appendChild(headerWrap);
        this._headerTableEl = headerTable;
        this._headerWrapEl = headerWrap;
      } else {
        this._headerTableEl = null;
      }
      if (keepFilterRow && this._tbodyEl) {
        const n = this.config.headers.length + (this.config.showRowNumbers ? 1 : 0);
        this._tbodyEl.appendChild(this._buildEmptyRow(n, emptyMessage));
      }
      tableWrap.appendChild(fullTable);
      this._wrapperEl.appendChild(tableWrap);
    }
    this._tableWrapEl = tableWrap;
    if (this._paginationEl && this.config.pagerPosition === "bottom") {
      this._paginationEl.classList.add("twm-pagination-controls--bottom");
      this._paginationEl.style.borderBottom = "0";
      this._paginationEl.style.borderTop = "1px solid #2a2a2a";
      this._wrapperEl.appendChild(this._paginationEl);
    }
    this._pagingEl = null;
    if (this._pagingConfig()) {
      this._pagingEl = this._createPagingStrip();
      if (this._pagingEl) this._wrapperEl.appendChild(this._pagingEl);
    }
    this.container.appendChild(this._wrapperEl);
    if (this.config.scrollLock && typeof this.config.scrollLock.attach === "function") {
      this._disposers.push(this.config.scrollLock.attach(tableWrap));
    }
    if (this.config.autoDispose) autoDisposeWatch(this);
    if (prevScroll && this._state.offset === this._renderedOffset) {
      tableWrap.scrollTop = prevScroll.top;
      tableWrap.scrollLeft = prevScroll.left;
    }
    this._renderedOffset = this._state.offset;
    if (this._virt) {
      const onScroll = () => this._virtUpdate();
      tableWrap.addEventListener("scroll", onScroll, { passive: true });
      this._disposers.push(() => tableWrap.removeEventListener("scroll", onScroll));
      this._virtMeasure();
      this._virtUpdate({ force: true, notify: false });
    }
    if (this._pagingConfig()) {
      const onScroll = () => this._pagingMaybeLoadMore();
      tableWrap.addEventListener("scroll", onScroll, { passive: true });
      this._disposers.push(() => tableWrap.removeEventListener("scroll", onScroll));
      requestAnimationFrame(() => {
        if (this._tableWrapEl === tableWrap) this._pagingMaybeLoadMore();
      });
    }
    if (this._headerTableEl && this._tableEl) {
      requestAnimationFrame(() => {
        this._syncHeaderWidths();
        this._virtRemeasure();
      });
      if (this._resizeObserver) {
        try {
          this._resizeObserver.disconnect();
        } catch (_) {
        }
      }
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = createRafResizeObserver(() => {
          this._syncHeaderWidths();
          this._virtUpdate();
        });
        this._resizeObserver.observe(this._wrapperEl);
      }
      this._installHeaderScrollSync();
      if (rows.length > 0) this._installColumnResizers();
    }
    if (rows.length > 0 && (this.config.selectable || this.config.copyable || !this.config.readonly || typeof this.config.onRowActivate === "function" || typeof this.config.rowDetail === "function")) {
      this._installInteractions();
    }
    if (activeFilterColIdx !== null) {
      this._restoreFilterFocus(activeFilterColIdx);
    } else if (hadTableFocus && this._tableEl) {
      try {
        this._tableEl.focus({ preventScroll: true });
      } catch (_) {
      }
    } else if (focus070) {
      this._restoreFocus070(focus070);
    }
    if (pendingFilter) this._resumePendingFilter(pendingFilter);
    if (this.config.dataSource) {
      if (!this._source?.started) {
        this._sourceState().started = true;
        Promise.resolve().then(() => this._sourceLoad({ offset: 0, reason: "initial" }));
      } else if (this._source.inFlight && !this._source.pendingAppend) {
        this.setLoading(true);
      }
      if (this._following && !this._followTimer) this._armFollow();
    }
  }
  /**
   * Copy selected rows to clipboard
   * @param {'tsv'|'csv'} [format='tsv'] - Output format
   */
  async copyToClipboard(format = "tsv") {
    const indices = this.getSelection();
    if (indices.length === 0) {
      this._notify("Copy", "No rows selected.", "warn");
      return;
    }
    const { headers, rows } = this.config;
    const matrix = [headers];
    for (const idx of indices) {
      const row = rows[idx];
      if (row) {
        matrix.push(row.map((val, colIdx) => this._formatValue(val, colIdx)));
      }
    }
    const separator = format === "csv" ? "," : "	";
    const text = format === "csv" ? matrix.map((row) => row.map((cell) => this._csvEscape(cell)).join(separator)).join("\n") : matrix.map((row) => row.join(separator)).join("\n");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {
      ok = this._fallbackCopy(text);
    }
    if (ok) {
      const desc = indices.length === 1 ? "row" : "rows";
      const suffix = format === "csv" ? " as CSV" : "";
      this._notify("Copy", `Copied ${indices.length} ${desc}${suffix}.`, "info");
    } else {
      this._notify("Copy", "Clipboard unavailable.", "warn");
    }
    this._hideContextMenu();
  }
  /**
   * Download all data as CSV
   * @param {string} [filename='data.csv'] - Filename for download
   */
  async downloadCSV(filename = "data.csv") {
    const { headers, rows } = this.config;
    if (rows.length === 0) {
      this._notify("Download", "No data to download.", "warn");
      return;
    }
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(row.map(
        (val, colIdx) => this._csvEscape(this._formatValue(val, colIdx))
      ).join(","));
    }
    const csv = lines.join("\n");
    const dialogs = this.config.host?.dialogs;
    let result = null;
    if (dialogs) {
      try {
        result = await dialogs.saveFile({ data: csv, filename, kind: "csv" });
      } catch (err) {
        console.error("[DataTable] CSV download failed:", err);
        this._notify("Download", "Failed to save file", "error");
        return;
      }
    }
    if (result) {
      if (result.ok) {
        this._notify("Download", `Saved ${rows.length} rows to ${result.path}`, "success");
      } else if (!result.cancelled) {
        this._notify("Download", result.error || "Failed to save file", "error");
      }
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this._notify("Download", "Download started", "info");
  }
  /**
   * Dispose and cleanup. Empties the host, as it always has.
   */
  dispose() {
    this._teardown(true);
  }
  /**
   * 0.5.0 `autoDispose`'s dispose: everything `dispose()` lets go of — but of
   * the host, only the table's OWN wrapper. A table that has been taken out
   * of the page no longer owns its host: in the task before this runs, the
   * consumer may have mounted the next list into it, or written its own
   * message there, and emptying the host would wipe that.
   */
  _disposeOwn() {
    this._teardown(false);
  }
  _teardown(emptyHost) {
    autoDisposeUnwatch(this);
    this._autoSeen = false;
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
    this._autoPending = false;
    this._disarmFollow();
    if (this._source) {
      this._source.ticket++;
      try {
        this._source.controller?.abort();
      } catch (_) {
      }
      this._source.controller = null;
      this._source.inFlight = false;
    }
    this._destroyFilterControls();
    this._runOffs(this._activationOffs);
    this._activationOffs = [];
    this._cleanup();
    this._closeFilterDropdown();
    this._teardownContextMenu();
    if (this._resizeObserver) {
      try {
        this._resizeObserver.disconnect();
      } catch (_) {
      }
      this._resizeObserver = null;
    }
    if (this._onBodyScroll && this._scrollSyncEl) {
      try {
        this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
      } catch (_) {
      }
      this._onBodyScroll = null;
      this._scrollSyncEl = null;
    }
    if (emptyHost) this.container.innerHTML = "";
    else this._wrapperEl?.remove();
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._headerTableEl = null;
    this._headerWrapEl = null;
    this._tableWrapEl = null;
    this._processedRows = null;
    this._processedIndexMap = null;
    this._virt = null;
    this._colgroupEl = null;
  }
  // ─────────────────────────────────────────────────────────────────
  // Processed rows pipeline (filter → sort → cache)
  // ─────────────────────────────────────────────────────────────────
  _getProcessedRows() {
    if (this._processedRows !== null) return this._processedRows;
    const isServerSide = this._isServerSide();
    let rows = this.config.rows;
    let indexMap = rows.map((_, i) => i);
    if (!isServerSide && this._state.filters.size > 0) {
      const result = this._applyFilters(rows, indexMap);
      rows = result.rows;
      indexMap = result.indexMap;
    }
    if (!isServerSide && this.config.sortable && this._state.sortColumn !== null && !this.config.onSort) {
      const result = this._applySorting(rows, indexMap);
      rows = result.rows;
      indexMap = result.indexMap;
    }
    this._processedRows = rows;
    this._processedIndexMap = indexMap;
    return rows;
  }
  _applyFilters(rows, indexMap) {
    const filters = this._state.filters;
    const filteredRows = [];
    const filteredMap = [];
    const matchers = /* @__PURE__ */ new Map();
    for (const colIdx of filters.keys()) matchers.set(colIdx, this._filterMatcher(colIdx));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let pass = true;
      for (const [colIdx, filterText] of filters) {
        if (!filterText) continue;
        const value = row[colIdx];
        const kindMatch = matchers.get(colIdx);
        if (kindMatch) {
          if (this._isEmptyFilterValue(filterText)) continue;
          if (!kindMatch(value, filterText, row)) {
            pass = false;
            break;
          }
          continue;
        }
        const colType = this._valueKind(colIdx);
        if (colType === "num") {
          if (!this._matchNumericFilter(value, filterText)) {
            pass = false;
            break;
          }
        } else if (colType === "date" || colType === "datetime") {
          const utc = this._utc();
          if (!matchDateFilter(
            parseDateValue(value, { utc }),
            filterText,
            this._formatValue(value, colIdx),
            { utc }
          )) {
            pass = false;
            break;
          }
        } else if (colType === "duration") {
          if (!matchDurationFilter(
            parseDuration(value),
            filterText,
            this._formatValue(value, colIdx)
          )) {
            pass = false;
            break;
          }
        } else {
          if (!this._matchTextFilter(value, filterText)) {
            pass = false;
            break;
          }
        }
      }
      if (pass) {
        filteredRows.push(row);
        filteredMap.push(indexMap[i]);
      }
    }
    return { rows: filteredRows, indexMap: filteredMap };
  }
  _applySorting(rows, indexMap) {
    const colIdx = this._state.sortColumn;
    const asc = this._state.sortAscending;
    const hook = this._sortValueFor(colIdx);
    const kind = this._valueKind(colIdx);
    if (hook || TYPED_COLUMNS.has(kind)) {
      const utc = this._utc();
      const keyOf = (row) => {
        const value = row[colIdx];
        if (hook) {
          const k = hook(value, colIdx, row);
          if (k !== void 0) return normaliseSortKey(k);
        }
        if (kind === "date" || kind === "datetime") {
          return normaliseSortKey(parseDateValue(value, { utc }));
        }
        if (kind === "duration") return normaliseSortKey(parseDuration(value));
        if (kind === "num") {
          return normaliseSortKey(typeof value === "number" ? value : parseFloat(value));
        }
        return value == null ? null : String(value).toLowerCase();
      };
      const keyed = rows.map((row, i) => ({ row, origIdx: indexMap[i], key: keyOf(row) }));
      keyed.sort((a, b) => compareSortKeys(a.key, b.key, asc));
      return {
        rows: keyed.map((p) => p.row),
        indexMap: keyed.map((p) => p.origIdx)
      };
    }
    const paired = rows.map((row, i) => ({ row, origIdx: indexMap[i] }));
    const isNumeric = this._columnTypes[colIdx] === "num";
    paired.sort((a, b) => {
      let valA = a.row[colIdx];
      let valB = b.row[colIdx];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (isNumeric) {
        valA = typeof valA === "number" ? valA : parseFloat(valA);
        valB = typeof valB === "number" ? valB : parseFloat(valB);
        if (!Number.isFinite(valA)) return 1;
        if (!Number.isFinite(valB)) return -1;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }
      let cmp = 0;
      if (valA < valB) cmp = -1;
      else if (valA > valB) cmp = 1;
      return asc ? cmp : -cmp;
    });
    return {
      rows: paired.map((p) => p.row),
      indexMap: paired.map((p) => p.origIdx)
    };
  }
  _matchNumericFilter(value, filterText) {
    const text = filterText.trim();
    if (!text) return true;
    const numVal = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(numVal)) return false;
    const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      return numVal >= lo && numVal <= hi;
    }
    const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
    if (opMatch) {
      const op = opMatch[1];
      const target = parseFloat(opMatch[2]);
      if (!Number.isFinite(target)) return true;
      switch (op) {
        case ">":
          return numVal > target;
        case "<":
          return numVal < target;
        case ">=":
          return numVal >= target;
        case "<=":
          return numVal <= target;
        case "!=":
          return Math.abs(numVal - target) > 1e-9;
        case "=":
          return Math.abs(numVal - target) <= 1e-9;
      }
    }
    const plain = parseFloat(text);
    if (Number.isFinite(plain)) {
      return Math.abs(numVal - plain) <= 1e-9;
    }
    return true;
  }
  _matchTextFilter(value, filterText) {
    if (!filterText) return true;
    const haystack = (value == null ? "" : String(value)).toLowerCase();
    const text = filterText.trim();
    if (text.startsWith('="') && text.endsWith('"')) {
      return haystack === text.slice(2, -1).toLowerCase();
    }
    if (text.startsWith("!")) {
      return !haystack.includes(text.slice(1).toLowerCase());
    }
    if (text.startsWith("^")) {
      return haystack.startsWith(text.slice(1).toLowerCase());
    }
    if (text.endsWith("$")) {
      return haystack.endsWith(text.slice(0, -1).toLowerCase());
    }
    return haystack.includes(text.toLowerCase());
  }
  _invalidateProcessedCache() {
    this._processedRows = null;
    this._processedIndexMap = null;
  }
  // ─────────────────────────────────────────────────────────────────
  // Filter row
  // ─────────────────────────────────────────────────────────────────
  _createFilterRow(headers) {
    const { showRowNumbers } = this.config;
    const tr = document.createElement("tr");
    tr.className = "twm-data-table__filter-row";
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell data-table__filter-cell--empty";
      tr.appendChild(th);
    }
    headers.forEach((header, colIdx) => {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell";
      const control = this._filterControlFor(colIdx, header);
      if (control) {
        th.classList.add("data-table__filter-cell--control");
        tr.classList.add("twm-data-table__filter-row--controls");
        th.addEventListener("click", (e) => e.stopPropagation());
        if (control.el) th.appendChild(control.el);
        tr.appendChild(th);
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "twm-data-table__filter-wrapper";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "twm-data-table__filter-input";
      const kind = this._valueKind(colIdx);
      input.placeholder = kind === "num" ? "e.g. >100" : kind === "date" || kind === "datetime" ? "e.g. >2026-01-01" : kind === "duration" ? "e.g. >1s" : "Filter...";
      const existingFilter = this._state.filters.get(colIdx);
      if (existingFilter) {
        input.value = existingFilter;
      }
      const dropdownBtn = document.createElement("button");
      dropdownBtn.type = "button";
      dropdownBtn.className = "twm-data-table__filter-dropdown-btn";
      dropdownBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">tune</span>';
      dropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openFilterDropdown(colIdx, th, input);
      });
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "twm-data-table__filter-clear";
      clearBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px;">close</span>';
      clearBtn.style.display = existingFilter ? "" : "none";
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = "";
        this._onFilterInput(colIdx, "");
        clearBtn.style.display = "none";
        input.focus();
      });
      input.addEventListener("input", () => {
        clearBtn.style.display = input.value ? "" : "none";
        this._onFilterInputDebounced(colIdx, input.value);
      });
      th.addEventListener("click", (e) => e.stopPropagation());
      wrapper.appendChild(input);
      wrapper.appendChild(dropdownBtn);
      wrapper.appendChild(clearBtn);
      th.appendChild(wrapper);
      tr.appendChild(th);
    });
    return tr;
  }
  // ─────────────────────────────────────────────────────────────────
  // Filter dropdown
  // ─────────────────────────────────────────────────────────────────
  _openFilterDropdown(colIdx, anchorEl, filterInput) {
    this._closeFilterDropdown();
    const kind = this._valueKind(colIdx);
    const isNumeric = kind === "num";
    const isDate = kind === "date" || kind === "datetime";
    const isOrdered = isNumeric || isDate || kind === "duration";
    const currentFilter = this._state.filters.get(colIdx) || "";
    const parsed = this._parseFilterForDropdown(currentFilter, isOrdered ? isNumeric ? true : kind : false);
    const panel = document.createElement("div");
    panel.className = "twm-data-table__filter-dropdown";
    const selectLabel = document.createElement("label");
    selectLabel.className = "twm-data-table__filter-dropdown-label";
    selectLabel.textContent = isOrdered ? "Operator" : "Mode";
    const select = document.createElement("select");
    select.className = "twm-data-table__filter-dropdown-select";
    const options = isDate ? [
      { value: "=", label: "On / in" },
      { value: "!=", label: "Not on / in" },
      { value: ">", label: "After" },
      { value: ">=", label: "On or after" },
      { value: "<", label: "Before" },
      { value: "<=", label: "On or before" },
      { value: "..", label: "Between" }
    ] : isOrdered ? [
      { value: "=", label: "Equals" },
      { value: "!=", label: "Not equals" },
      { value: ">", label: "Greater than" },
      { value: ">=", label: "Greater or equal" },
      { value: "<", label: "Less than" },
      { value: "<=", label: "Less or equal" },
      { value: "..", label: "Between" }
    ] : [
      { value: "contains", label: "Contains" },
      { value: "equals", label: "Equals" },
      { value: "starts", label: "Starts with" },
      { value: "ends", label: "Ends with" },
      { value: "not", label: "Not contains" }
    ];
    for (const opt of options) {
      const optEl = document.createElement("option");
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.value === parsed.operator) optEl.selected = true;
      select.appendChild(optEl);
    }
    const valueLabel = document.createElement("label");
    valueLabel.className = "twm-data-table__filter-dropdown-label";
    valueLabel.textContent = "Value";
    const operandPlaceholder = isNumeric ? "Number..." : isDate ? "YYYY-MM-DD" : isOrdered ? "e.g. 1.5s" : "Text...";
    const valueInput = document.createElement("input");
    valueInput.type = isNumeric ? "number" : "text";
    valueInput.className = "twm-data-table__filter-dropdown-input";
    valueInput.placeholder = operandPlaceholder;
    valueInput.value = parsed.value;
    const value2Label = document.createElement("label");
    value2Label.className = "twm-data-table__filter-dropdown-label";
    value2Label.textContent = "And";
    const value2Input = document.createElement("input");
    value2Input.type = isOrdered && !isNumeric ? "text" : "number";
    value2Input.className = "twm-data-table__filter-dropdown-input";
    value2Input.placeholder = isOrdered && !isNumeric ? operandPlaceholder : "Number...";
    value2Input.value = parsed.value2;
    const value2Container = document.createElement("div");
    value2Container.className = "twm-data-table__filter-dropdown-between";
    value2Container.style.display = isOrdered && parsed.operator === ".." ? "" : "none";
    value2Container.appendChild(value2Label);
    value2Container.appendChild(value2Input);
    select.addEventListener("change", () => {
      value2Container.style.display = isOrdered && select.value === ".." ? "" : "none";
    });
    const composeMode = isNumeric ? true : isOrdered ? kind : false;
    const actions = document.createElement("div");
    actions.className = "twm-data-table__filter-dropdown-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      filterInput.value = "";
      this._onFilterInput(colIdx, "");
      this._closeFilterDropdown();
    });
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--apply";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
      filterInput.value = composed;
      this._onFilterInput(colIdx, composed);
      this._closeFilterDropdown();
    });
    actions.appendChild(clearBtn);
    actions.appendChild(applyBtn);
    panel.appendChild(selectLabel);
    panel.appendChild(select);
    panel.appendChild(valueLabel);
    panel.appendChild(valueInput);
    panel.appendChild(value2Container);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    const anchorRect = anchorEl.getBoundingClientRect();
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth) {
      left = window.innerWidth - panelRect.width - 8;
    }
    if (top + panelRect.height > window.innerHeight) {
      top = anchorRect.top - panelRect.height - 4;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    requestAnimationFrame(() => valueInput.focus());
    const handleOutsideClick = (e) => {
      if (!panel.contains(e.target)) {
        this._closeFilterDropdown();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        this._closeFilterDropdown();
      }
    };
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
        filterInput.value = composed;
        this._onFilterInput(colIdx, composed);
        this._closeFilterDropdown();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick, true);
    }, 0);
    document.addEventListener("keydown", handleEscape);
    panel.addEventListener("keydown", handleEnter);
    this._filterDropdownEl = panel;
    this._filterDropdownCleanup = () => {
      document.removeEventListener("click", handleOutsideClick, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }
  _closeFilterDropdown() {
    if (this._filterDropdownEl?.parentNode) {
      this._filterDropdownEl.parentNode.removeChild(this._filterDropdownEl);
    }
    this._filterDropdownCleanup?.();
    this._filterDropdownEl = null;
    this._filterDropdownCleanup = null;
  }
  _parseFilterForDropdown(filterText, isNumeric) {
    const text = (filterText || "").trim();
    if (!text) {
      return { operator: isNumeric ? "=" : "contains", value: "", value2: "" };
    }
    if (typeof isNumeric === "string") {
      const range = text.match(/^(.+?)\s*\.\.\s*(.+)$/);
      if (range) return { operator: "..", value: range[1], value2: range[2] };
      const op = text.match(/^(>=|<=|!=|>|<|=)\s*(.+)$/);
      if (op) return { operator: op[1], value: op[2], value2: "" };
      return { operator: "=", value: text, value2: "" };
    }
    if (isNumeric) {
      const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
      if (rangeMatch) {
        return { operator: "..", value: rangeMatch[1], value2: rangeMatch[2] };
      }
      const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
      if (opMatch) {
        return { operator: opMatch[1], value: opMatch[2], value2: "" };
      }
      return { operator: "=", value: text, value2: "" };
    }
    if (text.startsWith('="') && text.endsWith('"')) {
      return { operator: "equals", value: text.slice(2, -1), value2: "" };
    }
    if (text.startsWith("!")) {
      return { operator: "not", value: text.slice(1), value2: "" };
    }
    if (text.startsWith("^")) {
      return { operator: "starts", value: text.slice(1), value2: "" };
    }
    if (text.endsWith("$")) {
      return { operator: "ends", value: text.slice(0, -1), value2: "" };
    }
    return { operator: "contains", value: text, value2: "" };
  }
  _composeFilterString(operator, value, value2, isNumeric) {
    if (!value && operator !== "..") return "";
    if (typeof isNumeric === "string") {
      if (operator === "..") return value && value2 ? `${value}..${value2}` : "";
      return `${operator}${value}`;
    }
    if (isNumeric) {
      if (operator === "..") {
        return value && value2 ? `${value}..${value2}` : "";
      }
      if (operator === "=") return value;
      return `${operator}${value}`;
    }
    switch (operator) {
      case "contains":
        return value;
      case "equals":
        return value ? `="${value}"` : "";
      case "starts":
        return value ? `^${value}` : "";
      case "ends":
        return value ? `${value}$` : "";
      case "not":
        return value ? `!${value}` : "";
      default:
        return value;
    }
  }
  _onFilterInputDebounced(colIdx, value) {
    if (this._filterDebounceTimer) {
      clearTimeout(this._filterDebounceTimer);
    }
    this._pendingFilter = { colIdx, value };
    this._filterDebounceTimer = setTimeout(() => {
      this._pendingFilter = null;
      this._onFilterInput(colIdx, value);
    }, 200);
  }
  _onFilterInput(colIdx, value) {
    const empty = typeof value === "string" ? !value : this._isEmptyFilterValue(value);
    if (!empty) {
      this._state.filters.set(colIdx, value);
    } else {
      this._state.filters.delete(colIdx);
    }
    this._pendingFilter = null;
    this._invalidateProcessedCache();
    this._state.offset = 0;
    this._state.selected.clear();
    this._state.anchorIndex = null;
    this._savePersisted();
    const entry = this._filterControls.get(colIdx);
    if (entry) {
      try {
        entry.control.setValue?.(empty ? null : value);
      } catch (err) {
        console.error("[DataTable] filter control setValue threw", err);
      }
    }
    this._notifyFilterChange();
    if (this.config.dataSource) {
      this._sourceLoad({ offset: 0, reason: "filter" });
      return;
    }
    this.render();
  }
  /** 0.7.0. Put back a filter that was still being typed when a render
   *  rebuilt its box: the words, and the debounce that will apply them. */
  _resumePendingFilter({ colIdx, value }) {
    const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
    const cell = filterRow?.children[this.config.showRowNumbers ? colIdx + 1 : colIdx];
    const input = cell?.querySelector(".twm-data-table__filter-input");
    if (input && input.value !== value) {
      const focused = input.ownerDocument?.activeElement === input;
      input.value = value;
      const clear = cell.querySelector(".twm-data-table__filter-clear");
      if (clear) clear.style.display = value ? "" : "none";
      if (focused) input.setSelectionRange(value.length, value.length);
    }
    this._onFilterInputDebounced(colIdx, value);
  }
  _getActiveFilterColIdx() {
    const active = document.activeElement;
    if (!active || !active.classList.contains("twm-data-table__filter-input")) return null;
    const cell = active.closest(".data-table__filter-cell");
    if (!cell) return null;
    const row = cell.parentElement;
    if (!row) return null;
    const cells = Array.from(row.children);
    const idx = cells.indexOf(cell);
    return this.config.showRowNumbers ? idx - 1 : idx;
  }
  _restoreFilterFocus(colIdx) {
    const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
    if (!filterRow) return;
    const cellIdx = this.config.showRowNumbers ? colIdx + 1 : colIdx;
    const cell = filterRow.children[cellIdx];
    const input = cell?.querySelector(".twm-data-table__filter-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────
  /** Run (and forget) a list of removers. */
  _runOffs(offs) {
    for (const off of offs || []) {
      try {
        off?.();
      } catch (_) {
      }
    }
  }
  /**
   * 0.5.0. A render takes `onRowActivate`'s listeners off the body it is
   * replacing ONE TASK LATER, not now. The render may be running INSIDE the
   * very click that is about to open a row — an `onSelectionChange` that calls
   * `setData`, an `onRowClick` that calls `render` — and a listener removed
   * during its own event's dispatch is skipped: the row silently did not
   * open. The event's path was fixed when it was dispatched, so it still
   * reaches the old body, whose listener opens the row that was pressed. The
   * old body is out of the page, so nothing else can reach it meanwhile.
   */
  _retireActivation() {
    const offs = this._activationOffs;
    this._activationOffs = [];
    if (offs.length) setTimeout(() => this._runOffs(offs), 0);
  }
  _cleanup() {
    this._disposers.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
    });
    this._disposers = [];
    this._closeFilterDropdown();
    if (this._filterDebounceTimer) {
      clearTimeout(this._filterDebounceTimer);
      this._filterDebounceTimer = null;
    }
  }
  _detectColumnTypes() {
    const { headers, rows, getColumnType, columnTypes } = this.config;
    const types = [];
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const declared = Array.isArray(columnTypes) ? columnTypes[colIdx] : null;
      if (declared) {
        types.push(declared);
        continue;
      }
      if (getColumnType) {
        types.push(getColumnType(colIdx, rows));
        continue;
      }
      let numericCount = 0;
      let sampleCount = 0;
      const maxSamples = Math.min(10, rows.length);
      for (let i = 0; i < maxSamples; i++) {
        const value = rows[i]?.[colIdx];
        if (value != null && value !== "") {
          sampleCount++;
          if (typeof value === "number" || /^-?[\d,.]+%?$/.test(String(value).trim())) {
            numericCount++;
          }
        }
      }
      types.push(sampleCount > 0 && numericCount / sampleCount > 0.5 ? "num" : "text");
    }
    return types;
  }
  _createPagination() {
    if (this._usesPager070()) return this._createPager070();
    const { rows, pageSize, totalCount: configTotalCount, offset: configOffset, onPageChange, onJumpToRow } = this.config;
    const isServerSide = typeof onPageChange === "function";
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const effectiveTotal = isServerSide ? configTotalCount || rows.length : processedRows.length;
    const unfilteredTotal = isServerSide ? configTotalCount || rows.length : rows.length;
    const isFiltered = !isServerSide && this._state.filters.size > 0;
    const displayedRows = isServerSide ? rows.length : Math.min(pageSize, effectiveTotal - offset);
    const endRow = Math.min(offset + displayedRows, effectiveTotal);
    const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
    if (totalPages <= 1 && !isFiltered) return null;
    const currentPage = Math.floor(offset / pageSize) + 1;
    const hasPrev = offset > 0;
    const hasNext = offset + pageSize < effectiveTotal;
    const el = document.createElement("div");
    el.className = "twm-pagination-controls";
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const info = document.createElement("span");
    info.style.cssText = "color:#aaa; white-space:nowrap;";
    if (effectiveTotal === 0) {
      info.textContent = isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : "No rows";
    } else if (isFiltered) {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
    } else {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()}`;
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const handlePageChange = (newOffset) => {
      if (isServerSide) {
        this._awaitWithSpinner(onPageChange(newOffset, pageSize));
      } else {
        this._state.offset = newOffset;
        this.render();
      }
    };
    const firstBtn = this._createPaginationBtn("first_page", "First page", !hasPrev, () => {
      handlePageChange(0);
    });
    const prevBtn = this._createPaginationBtn("chevron_left", "Previous page", !hasPrev, () => {
      handlePageChange(Math.max(0, offset - pageSize));
    });
    const pageInfo = document.createElement("span");
    pageInfo.style.cssText = "color:#aaa; font-size:10px; min-width:72px; text-align:center;";
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    const nextBtn = this._createPaginationBtn("chevron_right", "Next page", !hasNext, () => {
      handlePageChange(offset + pageSize);
    });
    const lastBtn = this._createPaginationBtn("last_page", "Last page", !hasNext, () => {
      handlePageChange(Math.floor((effectiveTotal - 1) / pageSize) * pageSize);
    });
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.className = "twm-pagination-input";
    jumpInput.style.cssText = "width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;";
    jumpInput.min = "1";
    jumpInput.max = String(effectiveTotal);
    jumpInput.placeholder = "Row #";
    const jumpBtn = this._createPaginationBtn(null, "Go to row", false, () => {
      const target = Number(jumpInput.value);
      if (Number.isFinite(target) && target >= 1) {
        if (isServerSide && onJumpToRow) {
          onJumpToRow(target - 1);
        } else if (isServerSide) {
          const newOffset = Math.floor((target - 1) / pageSize) * pageSize;
          handlePageChange(newOffset);
        } else {
          this.goToRow(target - 1);
        }
      }
    }, "Go");
    el.appendChild(info);
    el.appendChild(spacer);
    el.appendChild(firstBtn);
    el.appendChild(prevBtn);
    el.appendChild(pageInfo);
    el.appendChild(nextBtn);
    el.appendChild(lastBtn);
    el.appendChild(jumpInput);
    el.appendChild(jumpBtn);
    if (this.config.showExportButton) {
      const exportBtn = this._createPaginationBtn(
        "download",
        "Download visible rows as CSV",
        false,
        () => this.downloadCSV("data.csv")
      );
      el.appendChild(exportBtn);
    }
    return el;
  }
  _createPaginationBtn(icon, tooltip, disabled, onClick, textLabel = null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hoverbutton twm-pagination-btn twm-has-tooltip";
    btn.setAttribute("data-tooltip", tooltip);
    btn.disabled = disabled;
    btn.style.cssText = "padding:1px 3px; background:transparent; border:1px solid #444; color:#aaa; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;";
    if (disabled) {
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
    }
    if (icon) {
      const iconEl = document.createElement("span");
      iconEl.className = "material-symbols-outlined";
      iconEl.style.fontSize = "14px";
      iconEl.textContent = icon;
      btn.appendChild(iconEl);
    } else if (textLabel) {
      btn.textContent = textLabel;
      btn.style.fontSize = "10px";
      btn.style.padding = "1px 6px";
    }
    btn.addEventListener("click", onClick);
    return btn;
  }
  // ── `paging` ────────────────────────────────────────────────────────────
  /** The `paging` config with its defaults, or null when it is not set. */
  _pagingConfig() {
    const p = this.config.paging;
    if (!p || typeof p !== "object") return null;
    const size = Number.isFinite(p.pageSize) && p.pageSize >= 1 ? Math.floor(p.pageSize) : this.config.pageSize;
    if (this.config.dataSource) {
      const src = this._source || { offset: 0, total: null, atLeast: 0, hasMore: false };
      return {
        ...p,
        pageSize: size,
        offset: src.offset || 0,
        held: this.config.rows?.length || 0,
        total: src.total,
        atLeast: src.atLeast || 0,
        hasMore: !!src.hasMore,
        loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX,
        onPage: (offset) => this._sourceGoTo(offset),
        onLoadMore: () => this._sourceLoadMore(),
        onLoadAll: () => this._sourceLoadAll(),
        // The switch is drawn, as in 0.6.2, only for a consumer that
        // listens; the table switches and then tells it.
        onModeChange: typeof p.onModeChange === "function" ? (mode) => this._sourceSetMode(mode) : void 0
      };
    }
    return {
      ...p,
      pageSize: size,
      offset: Number.isFinite(p.offset) && p.offset > 0 ? Math.floor(p.offset) : 0,
      // What the table holds of the source. A consumer whose `rows` carry
      // a row the source does not (a blank line to type into) says so.
      held: Number.isFinite(p.held) ? p.held : this.config.rows?.length || 0,
      hasMore: !!p.hasMore,
      loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX
    };
  }
  /**
   * Which way the rows are shown, and why — `resolvePaging` over this
   * table's facts. `null` without `paging`.
   */
  get pagingState() {
    const p = this._pagingConfig();
    if (!p) return null;
    return resolvePaging({
      mode: p.mode,
      total: p.total,
      atLeast: p.atLeast,
      held: p.offset + p.held,
      hasMore: p.hasMore,
      softLimit: p.softLimit,
      hardLimit: p.hardLimit
    });
  }
  /**
   * Change some `paging` facts — a count that arrived, a mode — and redraw
   * the STRIP only. The rows are not touched: a consumer with new rows
   * renders the table as it always has.
   */
  setPaging(patch = {}) {
    if (!this.config.paging) return;
    const before = this.config.dataSource ? this.pagingState?.mode : null;
    this.config.paging = { ...this.config.paging, ...patch };
    if (before && this.pagingState?.mode !== before) {
      this._sourceLoad({ offset: 0, reason: "mode" });
      return;
    }
    this._refreshPagingStrip();
    this._pagingMaybeLoadMore();
  }
  _refreshPagingStrip() {
    if (!this._wrapperEl) return;
    const next = this._pagingConfig() ? this._createPagingStrip() : null;
    const prev = this._pagingEl;
    if (prev && prev.parentNode === this._wrapperEl) {
      if (next) prev.replaceWith(next);
      else prev.remove();
    } else if (next) {
      this._wrapperEl.appendChild(next);
    }
    this._pagingEl = next;
  }
  /**
   * Call one of the consumer's paging callbacks. A Promise holds every other
   * paging call back until it settles, and the strip shows the table busy —
   * a second `onLoadMore` fired by the next scroll event would fetch the same
   * page twice.
   */
  _pagingCall(kind, fn, ...args) {
    if (typeof fn !== "function" || this._pagingBusy) return;
    let result;
    try {
      result = fn(...args);
    } catch (err) {
      console.error(`[DataTable] paging ${kind} threw`, err);
      return;
    }
    if (result && typeof result.then === "function") {
      this._pagingBusy = kind;
      this._refreshPagingStrip();
      const settle = () => {
        if (this._pagingBusy !== kind) return;
        this._pagingBusy = null;
        if (this._pagingEl?.isConnected) this._refreshPagingStrip();
      };
      result.then(settle, (err) => {
        console.error(`[DataTable] paging ${kind} failed`, err);
        settle();
      });
    }
  }
  /**
   * Scrolling: ask for the next rows when the body is near its end — or does
   * not fill its box, which no scroll can ever change. Never past the hard
   * limit, never in pages, never with no layout (a hidden table's box is 0px
   * tall, and "0 ≤ 0" would ask for the whole source).
   */
  _pagingMaybeLoadMore() {
    const p = this._pagingConfig();
    if (!p || !p.hasMore || this._pagingBusy) return;
    if (this.config.dataSource && this._source?.inFlight) return;
    const state = this.pagingState;
    if (state.mode !== "scroll" || p.held >= state.hardLimit) return;
    const wrap = this._tableWrapEl;
    if (!wrap?.isConnected || !(wrap.clientHeight > 0)) return;
    const remaining = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
    if (remaining >= p.loadMorePx) return;
    this._pagingCall("more", p.onLoadMore);
  }
  /** The strip under the body, or null when it would say nothing. */
  _createPagingStrip() {
    const p = this._pagingConfig();
    const state = this.pagingState;
    const { mode, forced, exact, known } = state;
    const busy = this._pagingBusy;
    const n = (x) => Number(x).toLocaleString();
    const pageSize = p.pageSize;
    const held = p.held;
    const total = exact ? p.total : null;
    const morePages = p.offset > 0 || p.hasMore || exact && total > held;
    if (!forced && mode === "scroll" && !p.hasMore && held <= pageSize) return null;
    if (!forced && mode === "pages" && !morePages) return null;
    const el = document.createElement("div");
    el.className = `twm-dt-paging twm-dt-paging--${mode}`;
    el.setAttribute("role", "navigation");
    el.setAttribute("aria-label", "Rows");
    if (busy) el.classList.add("twm-dt-paging--busy");
    const info = document.createElement("span");
    info.className = "twm-dt-paging__info";
    el.appendChild(info);
    if (mode === "pages") {
      const from = held ? p.offset + 1 : p.offset;
      const to = p.offset + held;
      let of = "";
      if (exact) of = ` of ${n(total)}`;
      else if (known > to) of = ` of more than ${n(known - 1)}`;
      info.textContent = held ? `Rows ${n(from)}\u2013${n(to)}${of}` : "No rows on this page";
      const pn = this._pageNav({ offset: p.offset, held, total, hasMore: p.hasMore, pageSize });
      const { hasPrev, hasNext } = pn;
      const lastOffset = exact && total > 0 ? pn.lastOffset : null;
      const go = (offset) => (ev) => {
        if (!ev?.currentTarget?.disabled) this._pagingCall("page", p.onPage, offset, pageSize);
      };
      const nav = document.createElement("span");
      nav.className = "twm-dt-paging__nav";
      const off = !!busy || typeof p.onPage !== "function";
      const words = this._usesPager070();
      const button = (icon, name, tip, disabled, onClick, refusal = null) => words ? this._pagerButton(icon, name, tip, disabled, onClick, refusal) : this._createPaginationBtn(icon, tip, disabled, onClick);
      nav.append(
        button("first_page", "first", "First page", off || !hasPrev, go(0)),
        button(
          "chevron_left",
          "prev",
          "Previous page",
          off || !hasPrev,
          go(Math.max(0, p.offset - pageSize))
        )
      );
      const page = document.createElement("span");
      page.className = "twm-dt-paging__page";
      page.textContent = exact ? `Page ${n(pn.page)} of ${n(pn.pages)}` : `Page ${n(pn.page)}`;
      nav.append(
        page,
        button(
          "chevron_right",
          "next",
          "Next page",
          off || !hasNext,
          go(p.offset + pageSize)
        ),
        // The last page needs the exact count: without it there is no
        // offset to go to, and the button says so by being off.
        words ? button(
          "last_page",
          "last",
          "Last page",
          off || !hasNext || lastOffset === null,
          go(lastOffset),
          pn.lastRefusal
        ) : button(
          "last_page",
          "last",
          lastOffset === null ? "Last page (the total is not known)" : "Last page",
          off || !hasNext || lastOffset === null,
          go(lastOffset)
        )
      );
      el.appendChild(nav);
    } else {
      if (exact && total > held) info.textContent = `${n(held)} of ${n(total)} rows`;
      else if (p.hasMore) info.textContent = `${n(held)} rows, more to come`;
      else info.textContent = `${n(held)} rows`;
      if (p.hasMore && typeof p.onLoadAll === "function") {
        const all = document.createElement("button");
        all.type = "button";
        all.className = "twm-dt-paging__all";
        all.textContent = busy === "all" ? "Loading\u2026" : exact ? `Load all ${n(total)} rows` : "Load all rows";
        all.disabled = !!busy;
        all.addEventListener("click", () => {
          if (!all.disabled) this._pagingCall("all", p.onLoadAll);
        });
        el.appendChild(all);
      }
    }
    const spacer = document.createElement("span");
    spacer.className = "twm-dt-paging__spacer";
    el.appendChild(spacer);
    const why = forced ? `More than ${n(state.softLimit)} rows, so they are shown in pages.` : null;
    if (why) {
      const note = document.createElement("span");
      note.className = "twm-dt-paging__note";
      note.textContent = why;
      el.appendChild(note);
    }
    if (typeof p.onModeChange === "function") {
      const group = document.createElement("span");
      group.className = "twm-dt-paging__modes";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Show rows");
      for (const [value, label] of [["pages", "Pages"], ["scroll", "Scroll"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "twm-dt-paging__mode";
        b.dataset.mode = value;
        b.textContent = label;
        const pressed = mode === value;
        b.setAttribute("aria-pressed", String(pressed));
        b.disabled = !!busy || value === "scroll" && forced;
        if (value === "scroll" && forced) b.title = why;
        b.addEventListener("click", () => {
          if (!b.disabled && mode !== value) this._pagingCall("mode", p.onModeChange, value);
        });
        group.appendChild(b);
      }
      el.appendChild(group);
    }
    return el;
  }
  _createTable() {
    const { headers, rows, pageSize, sortable, filterable, showRowNumbers, readonly, getHeaderIcon } = this.config;
    const { sortColumn, sortAscending } = this._state;
    const configOffset = this.config.dataSource ? 0 : this.config.offset;
    const isServerSide = this._isServerSide();
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const pageRows = isServerSide || !this.config.pagination || this._pagingConfig() ? processedRows : processedRows.slice(offset, offset + pageSize);
    const table = document.createElement("table");
    table.className = this._tableClassName();
    table.tabIndex = 0;
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "num";
      th.textContent = "#";
      headerRow.appendChild(th);
    }
    headers.forEach((header, colIdx) => {
      const th = document.createElement("th");
      th.className = this._columnTypes[colIdx] || "text";
      if (sortable) {
        th.classList.add("sortable");
        th.style.cursor = "pointer";
      }
      if (getHeaderIcon) {
        const iconInfo = getHeaderIcon(header, colIdx);
        if (iconInfo) {
          const iconSpan = document.createElement("span");
          iconSpan.className = "material-symbols-outlined twm-header-icon twm-has-tooltip";
          iconSpan.setAttribute("data-tooltip", iconInfo.title || "");
          iconSpan.style.cssText = "font-size:16px; vertical-align:middle; margin-right:4px; opacity:0.7;";
          iconSpan.textContent = iconInfo.icon;
          th.appendChild(iconSpan);
        }
      }
      th.appendChild(document.createTextNode(header));
      if (sortable) {
        const sortIcon = document.createElement("span");
        sortIcon.className = "material-symbols-outlined twm-sort-icon";
        sortIcon.style.cssText = "font-size:14px; margin-left:4px; opacity:0.5;";
        if (sortColumn === colIdx) {
          sortIcon.textContent = sortAscending ? "arrow_upward" : "arrow_downward";
          sortIcon.style.opacity = "1";
        } else {
          sortIcon.textContent = "unfold_more";
        }
        th.appendChild(sortIcon);
        th.addEventListener("click", () => this.sortBy(colIdx));
      }
      th.title = header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    if (filterable) {
      const filterRow = this._createFilterRow(headers);
      thead.appendChild(filterRow);
    }
    const virtual = this._isVirtual();
    if (virtual) {
      table.classList.add("twm-dt--virtual");
      table.appendChild(this._createColgroup());
    }
    table.appendChild(thead);
    const globalOf = (localIdx) => {
      const processedIdx = offset + localIdx;
      return isServerSide ? (configOffset || 0) + localIdx : this._processedIndexMap?.[processedIdx] ?? processedIdx;
    };
    this._positionBase = this.config.dataSource ? this._source?.offset || 0 : isServerSide ? configOffset || 0 : this.config.pagination ? offset : 0;
    const paged = this.config.dataSource ? null : this._pagingConfig();
    if (paged && Number.isFinite(paged.offset)) this._positionBase += paged.offset;
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    this._tbodyEl = tbody;
    if (virtual) {
      this._virtInit(tbody, pageRows, globalOf, {
        serverSide: isServerSide,
        offset,
        configOffset: configOffset || 0
      });
    } else {
      pageRows.forEach((row, localIdx) => {
        const tr = this._buildBodyRow(row, globalOf(localIdx), localIdx);
        tbody.appendChild(tr);
        if (this._detailOn()) this._appendDetailIfOpen(tr, null);
      });
    }
    return table;
  }
  /** One body row, fully built. The ONE place a `<tr>` for a row is made, so
   *  the full render and the virtual window cannot drift apart: a row drawn
   *  on scroll is the same row a render would have drawn. */
  _buildBodyRow(row, globalIdx, localIdx) {
    const { showRowNumbers } = this.config;
    const tr = document.createElement("tr");
    tr.__rowIndex = globalIdx;
    tr.__position = (this._positionBase || 0) + localIdx;
    tr.className = "data-preview-row";
    if (this._state.selected.has(globalIdx)) {
      tr.classList.add("selected");
    }
    this._decorateRow(tr, row, globalIdx);
    if (this._virt) tr.classList.toggle("twm-dt-row--alt", localIdx % 2 === 1);
    this._fillRowCells(tr, row, globalIdx, showRowNumbers);
    if (this.config.onRowClick) {
      tr.addEventListener("click", (ev) => {
        this.config.onRowClick(globalIdx, row, ev);
      });
    }
    if (this.config.onRowContextMenu) {
      tr.addEventListener("contextmenu", (ev) => {
        this.config.onRowContextMenu(globalIdx, row, ev);
      });
    }
    return tr;
  }
  // ─────────────────────────────────────────────────────────────────
  // C10 — the virtual window
  // ─────────────────────────────────────────────────────────────────
  //
  // ══ WHAT IT IS ═══════════════════════════════════════════════════
  //
  // Only the rows near the viewport are in the DOM: a TOP SPACER row whose
  // height is every row above the window, the window's rows, and a BOTTOM
  // SPACER for everything below it. The scrollbar is therefore sized to the
  // whole table and every row is reachable, while the DOM stays bounded by
  // the viewport — a thousand-row page (or fifty of them) costs the same
  // few dozen `<tr>`s as one screenful.
  //
  // ══ WHAT IT PROMISES ═════════════════════════════════════════════
  //
  //  - A row that stays in the window is NEVER MOVED OR REBUILT when the
  //    window slides. Rows leave from the edges and arrive at the edges; the
  //    ones in the middle are the same nodes. An open editor, a focused
  //    cell, a hover — anything living in a row that is still on screen —
  //    survives a scroll. (Moving a node that holds focus blurs it, which in
  //    an editable grid is a commit nobody asked for.)
  //  - Column widths come from a `<colgroup>`, so the first row changing
  //    moves nothing (see `_createTable`).
  //  - A spacer is in the DOM only while it has a height. A table that fits
  //    in its window has exactly the DOM it had without `virtualize`.
  //  - `onRowsRendered` hears about every row added after `render()`, and
  //    every row taken out.
  //
  // ══ WHAT IT ASSUMES ══════════════════════════════════════════════
  //
  // That a row's height is knowable without drawing it: `baseHeight`,
  // measured from a real row, or what `virtualRowHeight` says. A row that
  // wraps to two lines is drawn correctly and is simply mis-counted in the
  // spacer arithmetic by the difference — the overscan absorbs that.
  _isVirtual() {
    return !!this.config.virtualize;
  }
  _virtOptions() {
    const v = this.config.virtualize;
    const o = v && typeof v === "object" ? v : {};
    return {
      overscan: Number.isFinite(o.overscan) && o.overscan >= 0 ? Math.floor(o.overscan) : 20,
      rowHeight: Number.isFinite(o.rowHeight) && o.rowHeight > 0 ? o.rowHeight : 24
    };
  }
  /** One `<col>` per DOM column (the row-number column included), carrying
   *  any width already pinned for it, so a re-render starts at the widths it
   *  had rather than at a content-sized frame that then snaps. */
  _createColgroup() {
    const n = (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0);
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < n; i++) {
      const col = document.createElement("col");
      const w = this._colWidths?.[i];
      if (w != null && this._colWidthsSig === this._colSig()) col.style.width = `${w}px`;
      colgroup.appendChild(col);
    }
    this._colgroupEl = colgroup;
    return colgroup;
  }
  /** The `<col>`s, when this table has them. */
  _cols() {
    return this._virt && this._colgroupEl ? this._colgroupEl.children : null;
  }
  _virtInit(tbody, rows, globalOf, { serverSide, offset, configOffset }) {
    const { overscan, rowHeight } = this._virtOptions();
    const spacer = (edge) => {
      const tr = document.createElement("tr");
      tr.className = `twm-dt-spacer twm-dt-spacer--${edge}`;
      tr.setAttribute("aria-hidden", "true");
      const td = document.createElement("td");
      td.colSpan = Math.max(1, (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0));
      td.style.cssText = "padding:0;border:0;height:0;min-width:0;max-width:none;";
      tr.appendChild(td);
      return tr;
    };
    const filler = document.createElement("tr");
    filler.className = "twm-dt-spacer twm-dt-spacer--parity";
    filler.setAttribute("aria-hidden", "true");
    filler.hidden = true;
    this._virt = {
      tbody,
      rows,
      globalOf,
      serverSide,
      offset,
      configOffset,
      overscan,
      base: this._virtBase || rowHeight,
      heights: null,
      offsets: null,
      start: 0,
      end: 0,
      map: /* @__PURE__ */ new Map(),
      top: spacer("top"),
      bottom: spacer("bottom"),
      filler
    };
    this._virtComputeOffsets();
    const guess = this.container?.clientHeight || 0;
    this._virtUpdate({ force: true, notify: false, viewport: guess || void 0, top: 0 });
  }
  /** Heights and their running sum. `offsets[i]` is where row `i` starts;
   *  `offsets[n]` is the whole table. O(n), and rerun only when a height can
   *  have changed — a new measurement, or `refreshVirtualLayout()`. */
  _virtComputeOffsets() {
    const v = this._virt;
    if (!v) return;
    const n = v.rows.length;
    const heights = new Float64Array(n);
    const offsets = new Float64Array(n + 1);
    const fn = typeof this.config.virtualRowHeight === "function" ? this.config.virtualRowHeight : null;
    const details = this._detailOn() && this._expanded.size > 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      let h = v.base;
      if (fn) {
        const asked = fn(v.globalOf(i), v.base);
        h = Number.isFinite(asked) && asked > 0 ? asked : 0;
      }
      if (details && h > 0) h += this._detailHeightOf(v.rows[i], v.globalOf(i), v.base);
      heights[i] = h;
      offsets[i] = y;
      y += h;
    }
    offsets[n] = y;
    v.heights = heights;
    v.offsets = offsets;
  }
  /** The row whose span contains `y`: the LAST `i` with `offsets[i] <= y`,
   *  which steps over rows of zero height at the same offset. */
  _virtIndexAt(y) {
    const v = this._virt;
    const n = v.rows.length;
    if (n === 0) return 0;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (v.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /**
   * Measure the rows that are DRAWN — the median of up to 64 of them. Client
   * pixels, so the zoom is divided back out (`_measureNaturalWidths` explains
   * why), and NOT `offsetHeight`, which is rounded: 21 for a 21.19px row is a
   * 1,100px error over 6,000 rows.
   *
   * 0.6.3: IT USED TO MEASURE ONE ROW, ONCE, AT RENDER, and trust it for the
   * life of the table. A row measured at a bad moment — a box not yet laid
   * out at its width, a font not yet loaded — set every row's height: a
   * Tables grid drawing 22.8px rows was found holding a 134px estimate, so the
   * window took a 650px viewport for five rows, drew rows 1–35 and left the
   * rest of the box blank spacer while the reader scrolled. Now it is asked
   * again on every window update (`_virtUpdate`), on a resize and once the
   * column widths are fixed, and corrects itself the first time real rows
   * are on screen. The first measure is exact; after that a change has to be
   * larger than half a pixel, so rows of mixed heights cannot make the
   * offsets move under the reader on every scroll.
   *
   * 0.7.0 `rowDetail`: AN OPEN DETAIL IS PART OF ITS ROW'S HEIGHT, and is
   * measured at the same moments. It is never one of the rows the median is
   * taken from (the window's map holds the rows, not their details), so a
   * tall detail cannot pass for a row; it is read on its own, into the
   * row's height — and read again here, because a detail's height moves for
   * the same reasons a row's does (the column widths fixed, a font), and
   * more: it wraps across the whole table's width.
   *
   * @returns {boolean} whether the heights changed (the offsets are recomputed).
   */
  _virtMeasure() {
    const v = this._virt;
    if (!v) return false;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    const heights = [];
    for (const tr of v.map.values()) {
      if (!tr.isConnected || tr.hidden) continue;
      const h = tr.getBoundingClientRect().height / zoom;
      if (h > 0) heights.push(h);
      if (heights.length >= 64) break;
    }
    const details = this._detailOn() && this._expanded.size > 0 && this._virtReadDetailHeights(v.map.values());
    let base = false;
    if (heights.length) {
      heights.sort((a, b) => a - b);
      const h = heights[heights.length >> 1];
      const tolerance = v.measured ? 0.5 : 0.01;
      v.measured = true;
      if (Math.abs(h - v.base) > tolerance) {
        v.base = h;
        this._virtBase = h;
        base = true;
      }
    }
    if (!base && !details) return false;
    this._virtComputeOffsets();
    return true;
  }
  /** Measure again, and redraw the window when the heights moved. */
  _virtRemeasure() {
    if (this._virtMeasure()) this._virtUpdate({ force: true });
  }
  /**
   * Slide the window to wherever the scroll box now is.
   *
   * HYSTERESIS, so a scroll of one pixel does not rebuild anything: the
   * window is redrawn only when the visible rows come within a quarter of the
   * overscan of either end of what is drawn, and it is then redrawn with the
   * full overscan on both sides.
   *
   * @param {object}  [o]
   * @param {boolean} [o.force]    redraw even inside the hysteresis band.
   * @param {boolean} [o.notify]   report added and removed rows to `onRowsRendered`.
   * @param {number}  [o.top]      the scroll offset to draw for, instead of
   *   reading one back — `scrollToRow` passes the offset it has just set,
   *   which a DOM with no layout would read back as 0.
   * @param {number}  [o.viewport] the viewport height, likewise.
   * @returns {HTMLElement[]} the rows added.
   */
  _virtUpdate({ force = false, notify = true, top = null, viewport = null, measure = true } = {}) {
    const v = this._virt;
    if (!v || !v.offsets) return [];
    if (measure && this._virtMeasure()) force = true;
    const n = v.rows.length;
    const wrap = this._tableWrapEl;
    const view = viewport || wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const scrollTop = top ?? (wrap?.scrollTop || 0);
    const vs = this._virtIndexAt(scrollTop);
    const ve = Math.min(n, this._virtIndexAt(scrollTop + view) + 1);
    if (!force && v.end > v.start) {
      const margin = Math.max(1, Math.floor(v.overscan / 4));
      const lowOk = v.start === 0 || vs >= v.start + margin;
      const highOk = v.end === n || ve <= v.end - margin;
      if (lowOk && highOk) return [];
    }
    const start = Math.max(0, vs - v.overscan);
    const end = Math.min(n, ve + v.overscan);
    const removed = [];
    const added = this._virtRender(start, end, removed);
    if (added.length || removed.length) {
      if (added[0]?.isConnected && this._tableEl?.style.tableLayout === "fixed") {
        this._updateCellTooltips(added);
      }
      if (notify) {
        try {
          this.config.onRowsRendered?.({ rows: added, removed });
        } catch (err) {
          console.error("[DataTable] onRowsRendered threw", err);
        }
      }
      if (measure && added.length && this._virtMeasure()) {
        return added.concat(this._virtUpdate({
          force: true,
          notify,
          top,
          viewport,
          measure: false
        }));
      }
    }
    return added;
  }
  /** Make the DOM hold exactly the drawable rows of `[start, end)`, without
   *  moving a row that is already there. See the promises above. */
  _virtRender(start, end, removed = null) {
    const v = this._virt;
    const tbody = v.tbody;
    const want = [];
    for (let i = start; i < end; i++) if (v.heights[i] > 0) want.push(i);
    const wanted = new Set(want);
    for (const [i, tr] of v.map) {
      if (!wanted.has(i)) {
        tr.remove();
        this._removeDetailPieces(tr);
        v.map.delete(i);
        removed?.push(tr);
      }
    }
    v.start = start;
    v.end = end;
    this._virtSpacers();
    const added = [];
    let ref = v.bottom.isConnected ? v.bottom : null;
    for (let k = want.length - 1; k >= 0; k--) {
      const i = want[k];
      const have = v.map.get(i);
      if (have) {
        ref = have;
        continue;
      }
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      v.map.set(i, tr);
      tbody.insertBefore(tr, ref);
      if (this._detailOn()) this._appendDetailIfOpen(tr, ref);
      ref = tr;
      added.push(tr);
    }
    added.reverse();
    if (this._detailOn() && added.length) this._virtMeasureDetails(added);
    return added;
  }
  /**
   * Size the two spacers, and put each in the DOM only while it has a height.
   *
   * AND KEEP THE STRIPE. `tr:nth-child(even)` stripes by POSITION, and in a
   * full render row `i` is child `i + 1`. Here the first drawn row is preceded
   * by the top spacer, so its position is off by one — and by a different one
   * each time the window's start changes parity, which strobes every stripe
   * on the screen as you scroll. A hidden filler row after the spacer, present
   * exactly when `start` is even, puts the parity back: a `display: none` row
   * is still a child, and so still counted by `nth-child`.
   */
  _virtSpacers() {
    const v = this._virt;
    const n = v.rows.length;
    const above = v.offsets[v.start];
    const below = v.offsets[n] - v.offsets[v.end];
    const tbody = v.tbody;
    if (above > 0) {
      v.top.firstChild.style.height = `${above}px`;
      if (tbody.firstChild !== v.top) tbody.insertBefore(v.top, tbody.firstChild);
      const needFiller = v.start % 2 === 0;
      if (needFiller && v.top.nextSibling !== v.filler) v.top.after(v.filler);
      else if (!needFiller) v.filler.remove();
    } else {
      v.top.remove();
      v.filler.remove();
    }
    if (below > 0) {
      v.bottom.firstChild.style.height = `${below}px`;
      if (tbody.lastChild !== v.bottom) tbody.appendChild(v.bottom);
    } else {
      v.bottom.remove();
    }
  }
  /**
   * Recompute every row's height and redraw the window. For an embedder whose
   * `virtualRowHeight` answer has changed — a group folded, a header added.
   * A no-op on a table that is not virtual.
   */
  refreshVirtualLayout() {
    if (!this._virt) return;
    this._virtMeasure();
    this._virtComputeOffsets();
    this._virtUpdate({ force: true });
  }
  /** The element that scrolls the body. Read-only; the table owns it. */
  get scrollElement() {
    return this._tableWrapEl || null;
  }
  /** The `<tr>` drawing row `rowIndex` (the `__rowIndex` space), or null when
   *  it is not in the DOM — outside the window, on another page, or hidden. */
  getRowElement(rowIndex) {
    const v = this._virt;
    if (v) {
      const local = this._virtLocalOf(rowIndex);
      return local < 0 ? null : v.map.get(local) || null;
    }
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    for (const tr of tbody.children) if (tr.__rowIndex === rowIndex) return tr;
    return null;
  }
  /** Keep the window's row list and `config.rows` in step for one row. They
   *  are the same array in server-side mode; in client mode the window reads
   *  the filtered-and-sorted copy, which holds its own reference. */
  _virtSetRow(rowIndex, row) {
    const v = this._virt;
    if (!v) return;
    if (Array.isArray(this.config.rows) && rowIndex >= 0 && rowIndex < this.config.rows.length) {
      this.config.rows[rowIndex] = row;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local >= 0) v.rows[local] = row;
  }
  /** `__rowIndex` → position in the window's row list, or -1. */
  _virtLocalOf(rowIndex) {
    const v = this._virt;
    if (!v) return -1;
    let local;
    if (v.serverSide) local = rowIndex - v.configOffset;
    else {
      const map = this._processedIndexMap;
      const processed = map ? map.indexOf(rowIndex) : rowIndex;
      local = processed < 0 ? -1 : processed - v.offset;
    }
    return local >= 0 && local < v.rows.length ? local : -1;
  }
  /**
   * Scroll the body so row `rowIndex` is on screen, drawing it if it was not,
   * and return its `<tr>` (null when it cannot be shown: another page, or a
   * row the embedder hides). Works with or without `virtualize`.
   *
   * @param {number} rowIndex  in the `__rowIndex` space.
   * @param {{block?: 'nearest'|'center'|'start'}} [opts]
   */
  scrollToRow(rowIndex, { block = "nearest" } = {}) {
    const wrap = this._tableWrapEl;
    const v = this._virt;
    if (!v) {
      const tr = this.getRowElement(rowIndex);
      if (!tr || !wrap) return tr;
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const box = wrap.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      const rowTop = (r.top - box.top) / zoom + wrap.scrollTop;
      const rowH = r.height / zoom;
      const target2 = this._scrollTarget(
        rowTop,
        rowH,
        wrap.scrollTop,
        wrap.clientHeight,
        block
      );
      if (target2 !== wrap.scrollTop) wrap.scrollTop = target2;
      return tr;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local < 0 || !(v.heights[local] > 0)) return null;
    const view = wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const current = wrap?.scrollTop || 0;
    let target = this._scrollTarget(
      v.offsets[local],
      v.heights[local],
      current,
      view,
      block
    );
    target = Math.max(0, Math.min(target, Math.max(0, v.offsets[v.rows.length] - view)));
    if (wrap && Math.abs(target - current) >= 1) wrap.scrollTop = target;
    this._virtUpdate({ top: Math.abs(target - current) >= 1 ? target : current });
    return v.map.get(local) || null;
  }
  _scrollTarget(rowTop, rowH, current, view, block) {
    if (block === "start") return rowTop;
    if (block === "center") return rowTop - Math.max(0, (view - rowH) / 2);
    if (rowTop < current) return rowTop;
    if (rowTop + rowH > current + view) return rowTop + rowH - view;
    return current;
  }
  /** The first body row that draws a row of data — never a spacer, and never
   *  a row an embedder injected (a group header spans every column with ONE
   *  cell, so measuring it would report one column). */
  _firstBodyRow() {
    const tbody = this._tableEl?.querySelector?.("tbody");
    if (!tbody) return null;
    for (const tr of tbody.children) {
      if (tr.__rowIndex !== void 0) return tr;
    }
    return null;
  }
  /** Build (or rebuild) one row's cells in place.
   *
   *  Extracted from the body loop so that `updateRow` and the initial
   *  render share ONE cell-building path. Two paths would drift, and the
   *  drift would show as a cell that renders differently after a live
   *  update than it did on load. */
  _fillRowCells(tr, row, globalIdx, showRowNumbers) {
    tr.replaceChildren();
    if (showRowNumbers) {
      const td = document.createElement("td");
      td.className = "num";
      const byPosition = this.config.showRowNumbers === "position" && Number.isInteger(tr.__position);
      td.textContent = String((byPosition ? tr.__position : globalIdx) + 1);
      tr.appendChild(td);
    }
    const { cellClass, nullDisplay } = this.config;
    const diff = this._diffOf(row, globalIdx);
    const gap = diff?.status === "gap";
    const changedCells = diff?.cells ? diff.cells instanceof Set ? diff.cells : new Set(diff.cells) : null;
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const td = document.createElement("td");
      td.className = this._columnTypes[colIdx] || "text";
      const value = row[colIdx];
      let handled = false;
      if (gap) {
        td.classList.add("twm-dt-diff__gap");
        tr.appendChild(td);
        continue;
      }
      if (changedCells?.has(colIdx)) td.classList.add("twm-dt-diff__cell--changed");
      if (this.config.renderCell) {
        handled = !!this.config.renderCell(td, value, colIdx, globalIdx, row);
        if (!handled) {
          td.textContent = this._formatValue(value, colIdx);
        }
      } else {
        td.textContent = this._formatValue(value, colIdx);
      }
      if (!handled && value == null && nullDisplay != null) {
        td.classList.add("twm-dt-cell--null");
      }
      if (typeof cellClass === "function") {
        this._addClasses(td, cellClass(value, colIdx, row, globalIdx));
      }
      if (colIdx === 0 && typeof this.config.rowIcon === "function") {
        this._prependRowIcon(td, this.config.rowIcon(row, globalIdx));
      }
      if (colIdx === 0 && this._detailOn()) this._prependDetailToggle(td, tr, row, globalIdx);
      if (this.config.onCellContextMenu) {
        const cellColIdx = colIdx;
        td.addEventListener("contextmenu", (ev) => {
          this.config.onCellContextMenu(
            cellColIdx,
            globalIdx,
            value,
            td,
            ev
          );
        });
      }
      tr.appendChild(td);
    }
  }
  /** Re-render ONE row in place, preserving everything around it.
   *
   *  `render()` rebuilds the entire `<tbody>`, which takes the scroll
   *  position, any open editor, the keyboard focus and the measured column
   *  widths with it. That is fine for a sort or a page change and wrong for
   *  a single-cell commit or a live update arriving over a socket — the
   *  common case in an editable grid, where a full rebuild once per keystroke
   *  is both visible and destructive.
   *
   *  What survives, by construction:
   *   - scroll position, because the tbody is not replaced;
   *   - the separately-rendered thead/tbody column widths, because the
   *     explicit widths live on the header cells and on the FIRST body row,
   *     and all three of the properties `_setCellWidth` writes are re-applied
   *     here when that first row is the one being replaced;
   *   - selection, because the `selected` class is recomputed from the
   *     selection set rather than carried on the old element;
   *   - keyboard focus, because the focused element's position is recorded
   *     before the replace and restored after.
   *
   *  @param {number} index   row index as tracked by `tr.__rowIndex`
   *  @param {any[]}  row     the new cell values
   *  @returns {boolean}      false when the row is not currently rendered
   *                          (it is on another page, or outside the render
   *                          window) — which is NOT an error: the caller has
   *                          nothing to update on screen.
   */
  updateRow(index, row) {
    const tbody = this._tbodyEl;
    if (!tbody) return false;
    let tr = null;
    for (const candidate of tbody.children) {
      if (candidate.__rowIndex === index) {
        tr = candidate;
        break;
      }
    }
    if (!tr) {
      if (this._virt) this._virtSetRow(index, row);
      return false;
    }
    if (Array.isArray(this.config.rows) && this.config.rows[index]) {
      this.config.rows[index] = row;
    }
    if (this._virt) this._virtSetRow(index, row);
    const active = document.activeElement;
    let focusedCol = -1;
    if (active && tr.contains(active)) {
      focusedCol = Array.prototype.indexOf.call(tr.children, active.closest("td"));
    }
    const isFirstRow = tr === tbody.firstElementChild;
    const widths = isFirstRow ? Array.prototype.map.call(tr.children, (td) => ({
      width: td.style.width,
      minWidth: td.style.minWidth,
      maxWidth: td.style.maxWidth
    })) : null;
    const showRowNumbers = this.config.showRowNumbers !== false && tr.firstElementChild?.classList.contains("num");
    this._fillRowCells(tr, row, index, showRowNumbers);
    if (widths) {
      widths.forEach((saved, i) => {
        const cell = tr.children[i];
        if (!saved.width || !cell) return;
        cell.style.width = saved.width;
        cell.style.minWidth = saved.minWidth;
        cell.style.maxWidth = saved.maxWidth;
      });
    }
    tr.classList.toggle("selected", this._state?.selected?.has(index) === true);
    this._decorateRow(tr, row, index);
    if (this._detailOn()) this._redrawDetail(tr);
    if (focusedCol >= 0 && tr.children[focusedCol]) {
      tr.children[focusedCol].focus?.();
    }
    return true;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — a row's detail (#26)
  // ─────────────────────────────────────────────────────────────────
  //
  // A detail is TWO rows after its row: the detail itself (one cell across
  // every column) and a hidden filler. The filler is the stripe: rows are
  // striped by `tr:nth-child(even)`, a question about POSITION, and one extra
  // row would flip the stripe of every row below an open detail. Two keep
  // the parity — the trick `_virtSpacers` already plays for the window.
  //
  // Neither row has a `__rowIndex`, so everything that walks the body for
  // rows of data (selection, the open mark, `_firstBodyRow`, `getRowElement`,
  // the activation and the copy menu) steps over them as it steps over a
  // spacer.
  _detailOn() {
    return typeof this.config.rowDetail === "function";
  }
  _rowHasDetail(row, rowIdx) {
    const fn = this.config.hasRowDetail;
    if (typeof fn !== "function") return true;
    try {
      return !!fn(row, rowIdx);
    } catch (err) {
      console.error("[DataTable] hasRowDetail threw", err);
      return false;
    }
  }
  /** The toggle: a real `<button>` (so Enter and Space work on it, and it is
   *  a control `onRowActivate` leaves alone), its glyph drawn by CSS so the
   *  cell's text, its tooltip and a copy stay the cell's own. */
  _prependDetailToggle(td, tr, row, rowIdx) {
    if (!this._rowHasDetail(row, rowIdx)) {
      const gap = document.createElement("span");
      gap.className = "twm-dt-detail-toggle-gap";
      gap.setAttribute("aria-hidden", "true");
      td.insertBefore(gap, td.firstChild);
      return;
    }
    const key = this._rowKey(row, rowIdx);
    const open = key !== null && this._expanded.has(key);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "material-symbols-outlined twm-dt-detail-toggle";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", String(this.config.rowDetailLabel || "Details"));
    btn.title = String(this.config.rowDetailLabel || "Details");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._setRowElExpanded(tr, btn.getAttribute("aria-expanded") !== "true", ev);
    });
    td.insertBefore(btn, td.firstChild);
    td.classList.add("twm-dt-cell--has-detail-toggle");
    tr.classList.add("twm-dt-row--has-detail");
  }
  /** After `tr` has been placed: its open detail, in front of `ref` (the row
   *  after it, or null for the end of the body). */
  _appendDetailIfOpen(tr, ref) {
    const row = tr.__row;
    const idx = tr.__rowIndex;
    if (!this._rowHasDetail(row, idx)) return;
    const key = this._rowKey(row, idx);
    if (key === null || !this._expanded.has(key)) return;
    const pieces = this._buildDetailPieces(tr, key);
    const parent = tr.parentNode;
    if (!parent) return;
    for (const p of pieces) parent.insertBefore(p, ref);
  }
  _buildDetailPieces(tr, key) {
    const n = (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0);
    const detailTr = document.createElement("tr");
    detailTr.className = "twm-dt-detail-row";
    const td = document.createElement("td");
    td.className = "twm-dt-detail-cell";
    td.colSpan = Math.max(1, n);
    const host = document.createElement("div");
    host.className = "twm-dt-detail";
    DETAIL_SEQ.n += 1;
    host.id = `twm-dt-detail-${DETAIL_SEQ.n}`;
    td.appendChild(host);
    detailTr.appendChild(td);
    const filler = document.createElement("tr");
    filler.className = "twm-dt-detail-filler";
    filler.hidden = true;
    filler.setAttribute("aria-hidden", "true");
    detailTr.__detailOf = tr;
    tr.__detail = [detailTr, filler];
    this._drawDetail(tr, host, key);
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.setAttribute("aria-controls", host.id);
    return tr.__detail;
  }
  _drawDetail(tr, host, key) {
    host.replaceChildren();
    let out;
    try {
      out = this.config.rowDetail(tr.__row, tr.__rowIndex, { host, key, table: this });
    } catch (err) {
      console.error("[DataTable] rowDetail threw", err);
      out = err?.message || String(err);
    }
    if (out == null || out === false || out === host) return;
    if (typeof Node !== "undefined" && out instanceof Node) host.appendChild(out);
    else host.textContent = String(out);
  }
  _removeDetailPieces(tr) {
    const pieces = tr.__detail;
    if (!pieces) return;
    for (const p of pieces) p.remove();
    tr.__detail = null;
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.removeAttribute("aria-controls");
  }
  /** `updateRow`'s half: the detail follows the row's new data. */
  _redrawDetail(tr) {
    const key = this._rowKey(tr.__row, tr.__rowIndex);
    const want = this._rowHasDetail(tr.__row, tr.__rowIndex) && key !== null && this._expanded.has(key);
    const pieces = tr.__detail;
    if (!want) {
      if (pieces) this._removeDetailPieces(tr);
      return;
    }
    if (pieces) {
      const host = pieces[0].querySelector(".twm-dt-detail");
      if (host) {
        this._drawDetail(tr, host, key);
        const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
        if (btn) btn.setAttribute("aria-controls", host.id);
      }
      return;
    }
    if (tr.parentNode) this._appendDetailIfOpen(tr, tr.nextSibling);
  }
  /** Open or close the detail of the row `tr` draws. Returns whether
   *  anything changed. */
  _setRowElExpanded(tr, open, ev = null) {
    if (!this._detailOn() || tr.__rowIndex === void 0) return false;
    if (!this._rowHasDetail(tr.__row, tr.__rowIndex)) return false;
    const key = this._rowKey(tr.__row, tr.__rowIndex);
    if (key === null || this._expanded.has(key) === !!open) return false;
    if (open) this._expanded.add(key);
    else this._expanded.delete(key);
    this._syncDetailOnScreen(tr, key);
    this._afterDetailChange();
    try {
      this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, key, ev);
    } catch (err) {
      console.error("[DataTable] onRowDetailToggle threw", err);
    }
    return true;
  }
  /** Make the row on screen agree with `_expanded` for its key. */
  _syncDetailOnScreen(tr, key) {
    const open = this._expanded.has(key);
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !tr.__detail && tr.parentNode) {
      const ref = tr.nextSibling;
      for (const p of this._buildDetailPieces(tr, key)) tr.parentNode.insertBefore(p, ref);
    } else if (!open && tr.__detail) {
      this._removeDetailPieces(tr);
    }
  }
  /** Under `virtualize` an open detail is part of its row's height. */
  _afterDetailChange() {
    if (!this._virt) return;
    this._virtMeasureDetails([...this._virt.map.values()], { force: true });
  }
  /** The detail's height for row `i` of the window's list: 0 closed, the
   *  measured height open, three rows until it has been measured. */
  _detailHeightOf(row, rowIdx, base) {
    if (!this._rowHasDetail(row, rowIdx)) return 0;
    const key = this._rowKey(row, rowIdx);
    if (key === null || !this._expanded.has(key)) return 0;
    const h = this._detailHeights.get(key);
    return h > 0 ? h : base * 3;
  }
  /** Measure the open details among `trs` (client pixels, the zoom divided
   *  out, as `_virtMeasure` does), and re-lay the window if one changed. */
  _virtMeasureDetails(trs, { force = false } = {}) {
    const v = this._virt;
    if (!v) return;
    const changed = this._virtReadDetailHeights(trs) || force;
    if (!changed) return;
    this._virtComputeOffsets();
    this._virtSpacers();
  }
  /** Read the open details drawn under `trs` into `_detailHeights`; true
   *  when one moved by more than half a pixel. Recomputes nothing. */
  _virtReadDetailHeights(trs) {
    let changed = false;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    for (const tr of trs) {
      const d = tr?.__detail?.[0];
      if (!d || !d.isConnected) continue;
      const h = d.getBoundingClientRect().height / zoom;
      if (!(h > 0)) continue;
      const key = this._rowKey(tr.__row, tr.__rowIndex);
      if (Math.abs((this._detailHeights.get(key) || 0) - h) > 0.5) {
        this._detailHeights.set(key, h);
        changed = true;
      }
    }
    return changed;
  }
  /**
   * Open (or close) the detail of the row whose key is `key` (`getRowKey`,
   * else the row's index). A row not on screen — another page, outside the
   * window, filtered out — opens when it is drawn.
   *
   * @param {*} key
   * @param {boolean} [open=true]
   * @returns {boolean} whether anything changed
   */
  setRowExpanded(key, open = true) {
    if (key == null) return false;
    const k = String(key);
    if (this._expanded.has(k) === !!open) return false;
    if (open) this._expanded.add(k);
    else this._expanded.delete(k);
    const tr = this._rowElByKey(k);
    if (tr) {
      this._syncDetailOnScreen(tr, k);
      try {
        this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, k, null);
      } catch (err) {
        console.error("[DataTable] onRowDetailToggle threw", err);
      }
    }
    if (this._virt) {
      this._virtComputeOffsets();
      this._virtSpacers();
      this._afterDetailChange();
    }
    return true;
  }
  /** Whether the row whose key is `key` has its detail open. */
  isRowExpanded(key) {
    return key != null && this._expanded.has(String(key));
  }
  /** The keys of the rows whose detail is open, as text. */
  getExpandedRows() {
    return [...this._expanded];
  }
  /** Close every detail. */
  collapseAllRows() {
    for (const k of [...this._expanded]) this.setRowExpanded(k, false);
  }
  /** The `<tr>` on screen for a key, or null. */
  _rowElByKey(key) {
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    for (const tr of tbody.children) {
      if (tr.__rowIndex === void 0) continue;
      if (this._rowKey(tr.__row, tr.__rowIndex) === key) return tr;
    }
    return null;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — rows from a server (#33), the pager for an unknown total
  // (#35), refresh and follow (#36)
  // ─────────────────────────────────────────────────────────────────
  //
  // ONE QUESTION AT A TIME, AND ONLY THE NEWEST ANSWER. Every request takes
  // a ticket; an answer whose ticket is not the latest is dropped, and the
  // request it answered is aborted the moment a newer one is sent. Two
  // requests in flight from a fast typist otherwise race, and the loser
  // painting last is a list that does not match the box above it.
  /** Rows that are the current page of something larger (`onPageChange`,
   *  or 0.7.0's `dataSource`): drawn as given, never filtered, sorted or
   *  sliced here. */
  _isServerSide() {
    return typeof this.config.onPageChange === "function" || !!this.config.dataSource;
  }
  /** `autoDispose`'s grace in ms: one task, `keepWhileDetached`'s number,
   *  or Infinity for `true`. */
  _detachGrace() {
    const k = this.config.keepWhileDetached;
    if (k === true) return Infinity;
    if (typeof k === "number" && Number.isFinite(k) && k > 0) return k;
    if (k === Infinity) return Infinity;
    return 0;
  }
  _sourceState() {
    if (!this._source) {
      this._source = {
        started: false,
        ticket: 0,
        controller: null,
        inFlight: false,
        offset: 0,
        pendingOffset: 0,
        total: null,
        atLeast: 0,
        hasMore: false,
        query: null,
        loaded: false,
        pendingAppend: false
      };
    }
    return this._source;
  }
  /** The column filters, as a query and `onFilterChange` carry them. */
  _filterList() {
    const headers = this.config.headers || [];
    const out = [];
    for (const [column, value] of this._state.filters) {
      if (typeof value === "string" ? !value : this._isEmptyFilterValue(value)) continue;
      out.push({ column, header: headers[column], value });
    }
    return out.sort((a, b) => a.column - b.column);
  }
  /** Rows per question: `paging.pageSize` when the source is paged, else
   *  `pageSize` — one number for the query, `goToPage` and the pager. */
  _sourcePageSize() {
    const size = this._pagingConfig()?.pageSize ?? this.config.pageSize;
    return Math.max(1, size | 0);
  }
  _buildQuery(offset, reason, limit = null) {
    const col = this._state.sortColumn;
    return {
      offset,
      limit: Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : this._sourcePageSize(),
      sort: col == null ? null : {
        column: col,
        header: (this.config.headers || [])[col],
        ascending: this._state.sortAscending
      },
      filters: this._filterList(),
      reason
    };
  }
  /**
   * Ask the source for the page at `offset`, and draw the answer if it is
   * still the newest by then. Resolves with the answer drawn, or undefined
   * when it was dropped (superseded, failed, or the table was disposed).
   */
  async _sourceLoad({ offset = 0, reason = "reload", keep = false, append = false, limit = null } = {}) {
    const fetch = this.config.dataSource;
    if (typeof fetch !== "function") return void 0;
    const src = this._sourceState();
    src.started = true;
    const ticket = ++src.ticket;
    try {
      src.controller?.abort();
    } catch (_) {
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    src.controller = controller;
    const query = this._buildQuery(Math.max(0, offset | 0), reason, limit);
    src.query = query;
    src.inFlight = true;
    src.pendingOffset = query.offset;
    src.pendingAppend = append;
    if (!append) this.setLoading(true);
    let result;
    try {
      result = await fetch(query, { signal: controller?.signal });
    } catch (err) {
      if (ticket !== src.ticket) return void 0;
      src.inFlight = false;
      src.controller = null;
      src.pendingAppend = false;
      if (err?.name === "AbortError" || controller?.signal?.aborted) {
        this.setLoading(false);
        return void 0;
      }
      this.setError(err);
      try {
        this.config.onLoadError?.(err, query);
      } catch (e) {
        console.error("[DataTable] onLoadError threw", e);
      }
      return void 0;
    }
    if (ticket !== src.ticket) return void 0;
    src.inFlight = false;
    src.controller = null;
    src.pendingAppend = false;
    this._applySourceResult(result, query, { keep, append });
    try {
      this.config.onLoad?.(result, query);
    } catch (e) {
      console.error("[DataTable] onLoad threw", e);
    }
    return result;
  }
  _applySourceResult(result, query, { keep = false, append = false } = {}) {
    const src = this._sourceState();
    const r = Array.isArray(result) ? { rows: result } : result || {};
    const answered = Array.isArray(r.rows) ? r.rows : [];
    const totalRaw = r.total ?? r.totalCount;
    const total = typeof totalRaw === "number" && Number.isFinite(totalRaw) ? totalRaw : null;
    const hasMore = typeof r.hasMore === "boolean" ? r.hasMore : total !== null ? query.offset + answered.length < total : answered.length >= query.limit;
    let rows = append ? (this.config.rows || []).concat(answered) : answered;
    let rowsOffset = append ? src.offset || 0 : query.offset;
    const pc = append ? this._pagingConfig() : null;
    if (pc && resolvePaging({
      mode: pc.mode,
      total,
      atLeast: r.atLeast,
      held: rowsOffset + rows.length,
      hasMore,
      softLimit: pc.softLimit,
      hardLimit: pc.hardLimit
    }).mode === "pages") {
      rows = answered;
      rowsOffset = query.offset;
      append = false;
    }
    if (src.loaded && this._detailOn() && this._expanded.size && typeof this.config.getRowKey !== "function") {
      const before = this.config.rows || [];
      const same = (a, b) => {
        if (a === b) return true;
        try {
          return JSON.stringify(a) === JSON.stringify(b);
        } catch (_) {
          return false;
        }
      };
      for (const k of [...this._expanded]) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= rows.length || !same(before[i], rows[i])) {
          this._expanded.delete(k);
          this._detailHeights.delete(k);
        }
      }
    }
    src.offset = rowsOffset;
    src.total = total;
    src.atLeast = Number.isFinite(r.atLeast) ? r.atLeast : 0;
    src.hasMore = hasMore;
    src.loaded = true;
    if (r.filterCounts && typeof r.filterCounts === "object") this.setFilterCounts(r.filterCounts);
    const snap = keep ? this._snapshotView() : null;
    const kept = append ? this._tableWrapEl?.scrollTop || 0 : null;
    if (snap && snap.keys && snap.keys.size && typeof this.config.getRowKey === "function") {
      const fresh = /* @__PURE__ */ new Set();
      rows.forEach((row, i) => {
        const k = this._rowKey(row, i);
        if (k !== null && !snap.keys.has(k)) fresh.add(k);
      });
      this._newKeys = fresh.size ? fresh : null;
    } else {
      this._newKeys = null;
    }
    const chosen = append && this._state.selected.size ? { sel: [...this._state.selected], anchor: this._state.anchorIndex } : null;
    this.setData({ rows });
    this._newKeys = null;
    if (chosen) {
      for (const i of chosen.sel) this._state.selected.add(i);
      this._state.anchorIndex = chosen.anchor;
      this._updateRowSelection();
    }
    if (snap) this._restoreView(snap);
    else if (kept !== null) this._scrollBodyTo(kept);
    else this._scrollBodyTo(0);
  }
  /** What a refresh must put back: the keys on screen, the selection by
   *  key, and the first row a reader can see with where it stood. */
  _snapshotView() {
    const rows = this.config.rows || [];
    const keyed = typeof this.config.getRowKey === "function";
    const keys = keyed ? new Set(rows.map((row, i) => this._rowKey(row, i))) : null;
    const selectedKeys = keyed ? this.getSelection().map((i) => this._rowKey(rows[i], i)).filter((k) => k !== null) : null;
    const wrap = this._tableWrapEl;
    let anchor = null;
    const scrollTop = wrap?.scrollTop || 0;
    if (wrap && scrollTop > 0 && this._tbodyEl) {
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const top = wrap.getBoundingClientRect().top;
      for (const tr of this._tbodyEl.children) {
        if (tr.__rowIndex === void 0) continue;
        const box = tr.getBoundingClientRect();
        if (box.bottom > top + 0.5) {
          anchor = { key: this._rowKey(tr.__row, tr.__rowIndex), delta: (box.top - top) / zoom };
          break;
        }
      }
    }
    return { keys, selectedKeys, anchor, scrollTop };
  }
  _restoreView(snap) {
    if (snap.selectedKeys && snap.selectedKeys.length) {
      const want = new Set(snap.selectedKeys);
      const sel = this._state.selected;
      (this.config.rows || []).forEach((row, i) => {
        if (want.has(this._rowKey(row, i))) sel.add(i);
      });
      if (sel.size) {
        this._state.anchorIndex = [...sel][0];
        this._updateRowSelection();
        this._notifySelectionChange();
      }
    }
    const wrap = this._tableWrapEl;
    if (!wrap || !snap.anchor || snap.anchor.key === null) return;
    const rows = this.config.rows || [];
    const idx = rows.findIndex((row, i) => this._rowKey(row, i) === snap.anchor.key);
    if (idx < 0) return;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    if (this._virt) {
      const local = this._virtLocalOf(idx);
      if (local < 0) return;
      this._scrollBodyTo(Math.max(0, this._virt.offsets[local] - snap.anchor.delta));
      return;
    }
    const tr = this.getRowElement(idx);
    if (!tr) return;
    const now = (tr.getBoundingClientRect().top - wrap.getBoundingClientRect().top) / zoom;
    const shift = now - snap.anchor.delta;
    if (Math.abs(shift) >= 0.5) this._scrollBodyTo(wrap.scrollTop + shift);
  }
  _scrollBodyTo(top) {
    const wrap = this._tableWrapEl;
    if (!wrap) return;
    if (Math.abs((wrap.scrollTop || 0) - top) >= 0.5) wrap.scrollTop = top;
    if (this._virt) this._virtUpdate({ force: true, top });
  }
  /** Go to the page at `offset` (paging back stops following). */
  _sourceGoTo(offset) {
    const next = Math.max(0, offset | 0);
    if (this._following && next > 0) this.setFollow(false);
    return this._sourceLoad({ offset: next, reason: "page" });
  }
  /**
   * `paging` over a `dataSource`, scrolling: the rows after those held, under
   * them — never past the hard limit. Scrolling down to ask for them is
   * paging away, so it turns following off as a page turn does; rows asked
   * for because the ones held do not fill the box are not (the reader is
   * still at the top).
   */
  _sourceLoadMore() {
    const held = this.config.rows?.length || 0;
    const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
    const limit = Math.min(this._sourcePageSize(), hard - held);
    if (limit < 1) return Promise.resolve(void 0);
    if (this._following && (this._tableWrapEl?.scrollTop || 0) > 0) this.setFollow(false);
    const offset = (this._source?.offset || 0) + held;
    return this._sourceLoad({ offset, limit, reason: "more", append: true });
  }
  /** The strip's *Load all rows*: ONE question for every row left under the
   *  hard limit (`reason: 'all'`); the source answers as many as it will, and
   *  says with `hasMore` whether there are still more. */
  _sourceLoadAll() {
    const held = this.config.rows?.length || 0;
    const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
    if (hard - held < 1) return Promise.resolve(void 0);
    if (this._following) this.setFollow(false);
    const offset = (this._source?.offset || 0) + held;
    return this._sourceLoad({ offset, limit: hard - held, reason: "all", append: true });
  }
  /** The strip's Pages / Scroll switch: the table switches, tells the
   *  consumer (`paging.onModeChange`), and asks again from the start. */
  _sourceSetMode(mode) {
    const next = mode === "pages" ? "pages" : "scroll";
    const p = this.config.paging;
    this.config.paging = { ...p, mode: next };
    try {
      p.onModeChange?.(next);
    } catch (err) {
      console.error("[DataTable] onModeChange threw", err);
    }
    return this._sourceLoad({ offset: 0, reason: "mode" });
  }
  /**
   * Ask the source again from its FIRST page — for a consumer whose own
   * filters (outside the table) changed. Under `dataSource` only; resolves
   * with the answer drawn (undefined when it was superseded or failed).
   */
  reload() {
    if (!this.config.dataSource) return Promise.resolve(void 0);
    return this._sourceLoad({ offset: 0, reason: "reload" });
  }
  /**
   * Read the CURRENT page again, in place: the scroll position (a reader at
   * the top sees what arrived; one scrolled down keeps the rows they were
   * reading where they were), the selection by key, the open row and the
   * open details all stay; rows the last answer did not hold are drawn
   * `twm-dt-row--new` (needs `getRowKey`). What `follow` calls on its tick.
   * Without `dataSource`, it only draws again.
   */
  refresh() {
    if (!this.config.dataSource) {
      if (this._wrapperEl) this.render();
      return Promise.resolve(void 0);
    }
    const src = this._sourceState();
    if (this.pagingState?.mode === "scroll") {
      const held = this.config.rows?.length || 0;
      return this._sourceLoad({
        offset: src.offset || 0,
        limit: Math.max(this._sourcePageSize(), held),
        reason: "refresh",
        keep: true
      });
    }
    const offset = src.inFlight && !src.pendingAppend ? src.pendingOffset : src.offset;
    return this._sourceLoad({ offset, reason: "refresh", keep: true });
  }
  /** The last query sent to `dataSource`, or null. */
  getQuery() {
    return this._source?.query || null;
  }
  /** What the last answer said about the whole: `{offset, total, hasMore}`. */
  getPageInfo() {
    const s = this._source;
    return s ? { offset: s.offset, total: s.total, hasMore: s.hasMore } : null;
  }
  /**
   * Turn following on or off (`follow`). On, the first page is read again
   * every `follow.interval` ms while the table is on it and in the page.
   */
  setFollow(on) {
    const next = !!on;
    if (next === this._following) return;
    this._following = next;
    if (next) this._armFollow();
    else this._disarmFollow();
    try {
      this.config.onFollowChange?.(next);
    } catch (err) {
      console.error("[DataTable] onFollowChange threw", err);
    }
  }
  isFollowing() {
    return this._following;
  }
  _followInterval() {
    const f = this.config.follow;
    const ms = f && typeof f === "object" ? Number(f.interval) : NaN;
    return Number.isFinite(ms) && ms > 0 ? ms : 1e4;
  }
  /** The tick holds the table WEAKLY: a follow timer must never be what keeps
   *  a table nobody holds alive (`keepWhileDetached: true`). */
  _armFollow() {
    this._disarmFollow();
    if (!this._following || !this.config.dataSource || !this._wrapperEl) return;
    const ref = weakRef(this);
    const id = setInterval(() => {
      const t = ref.deref();
      if (!t || t._followTimer !== id) {
        clearInterval(id);
        return;
      }
      const src = t._source;
      if (!t._following || !src || src.inFlight) return;
      if ((src.offset || 0) !== 0) return;
      if (!t._wrapperEl?.isConnected) return;
      if (t._readerIsBusy()) return;
      t.refresh();
    }, this._followInterval());
    this._followTimer = id;
  }
  _disarmFollow() {
    if (this._followTimer) clearInterval(this._followTimer);
    this._followTimer = null;
  }
  /** A TICK WAITS FOR A READER. A refresh redraws every row and every open
   *  detail, so a tick that came while somebody was selecting text in the
   *  table (a stack trace to copy) or working inside an open detail took the
   *  text out from under the selection and the focus out of the detail —
   *  every interval, for as long as they stayed. The tick is skipped
   *  instead, and following resumes on the next one after (the release
   *  review). `refresh()` called by the consumer is not a tick and does not
   *  wait. */
  _readerIsBusy() {
    const wrap = this._tableWrapEl;
    const doc = wrap?.ownerDocument;
    if (!wrap || !doc) return false;
    const active = doc.activeElement;
    if (active && active !== wrap && wrap.contains(active) && active.closest?.(".twm-dt-detail")) return true;
    try {
      const sel = doc.defaultView?.getSelection?.();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        for (let i = 0; i < sel.rangeCount; i++) {
          const r = sel.getRangeAt(i);
          if (wrap.contains(r.startContainer) || wrap.contains(r.endContainer)) return true;
        }
      }
    } catch (_) {
    }
    return false;
  }
  // ── the pager (#35) ────────────────────────────────────────────────
  _usesPager070() {
    const c = this.config;
    return !!c.dataSource || !!c.pagerLabels || c.maxJumpOffset != null || typeof c.onPageChange === "function" && c.totalCount == null && typeof c.hasMore === "boolean";
  }
  _pagerLabel(name) {
    const labels = this.config.pagerLabels || {};
    return labels[name];
  }
  _pagerRefusalTooDeep() {
    const max = this.config.maxJumpOffset;
    const fn = this._pagerLabel("tooDeep");
    if (typeof fn === "function") return String(fn(max));
    if (typeof fn === "string") return fn;
    return `Past ${Number(max).toLocaleString()} rows. Narrow the filters first.`;
  }
  _pagerButton(icon, name, tip, disabled, onClick, refusal = null) {
    const label = this._pagerLabel(name);
    const btn = this._createPaginationBtn(
      icon,
      typeof label === "string" ? label : tip,
      disabled || !!refusal,
      onClick
    );
    btn.dataset.pager = name;
    if (typeof label === "string" && label) {
      const span = document.createElement("span");
      span.className = "twm-pagination-btn__label";
      span.textContent = label;
      btn.appendChild(span);
      btn.classList.add("twm-pagination-btn--labelled");
      btn.style.padding = "1px 6px 1px 3px";
      btn.style.setProperty("min-width", "max-content", "important");
      btn.style.flexShrink = "0";
    }
    if (refusal) {
      btn.dataset.refusal = refusal;
      btn.setAttribute("data-tooltip", refusal);
      btn.title = refusal;
    }
    return btn;
  }
  /**
   * THE PAGE ARITHMETIC, ONCE — read by the pager above the rows (0.7.0) and
   * by the `paging` strip under them (0.6.2), which each worked it out for
   * themselves. `held` is the rows drawn on this page; `total` a number or
   * null (unknown, when `hasMore` says whether there is a next page).
   *
   * @returns {{known: boolean, hasPrev: boolean, hasNext: boolean, page: number,
   *            pages: number|null, lastOffset: number|null, lastRefusal: string|null}}
   */
  _pageNav({ offset = 0, held = 0, total = null, hasMore = false, pageSize }) {
    const size = Math.max(1, pageSize | 0);
    const known = typeof total === "number" && Number.isFinite(total);
    const lastOffset = known ? Math.floor(Math.max(0, total - 1) / size) * size : null;
    const maxJump = Number.isFinite(this.config.maxJumpOffset) ? this.config.maxJumpOffset : null;
    let lastRefusal = null;
    if (!known) {
      const words = this._pagerLabel("noLast");
      lastRefusal = typeof words === "string" ? words : "The total is not known, so there is no last page.";
    } else if (maxJump !== null && lastOffset > maxJump) {
      lastRefusal = this._pagerRefusalTooDeep();
    }
    return {
      known,
      hasPrev: offset > 0,
      hasNext: known ? offset + held < total : !!hasMore,
      page: Math.floor(offset / size) + 1,
      pages: known ? Math.max(1, Math.ceil(total / size)) : null,
      lastOffset,
      lastRefusal
    };
  }
  /**
   * The pager for any mode, with the two things the 0.6 strip could not do:
   * an UNKNOWN total (no "of N", no last page, Next until a short page) and
   * a REFUSED deep jump (`maxJumpOffset`). For a known total its words are
   * the 0.6 strip's.
   */
  _createPager070() {
    const c = this.config;
    const { rows, pageSize } = c;
    const source = !!c.dataSource;
    const server = !source && typeof c.onPageChange === "function";
    const src = this._source || { offset: 0, total: null, hasMore: false };
    const offset = source ? src.offset : server ? c.offset || 0 : this._state.offset;
    let total;
    let hasMoreKnown;
    if (source) {
      total = src.total;
      hasMoreKnown = src.hasMore;
    } else if (server) {
      const unknown = c.totalCount == null && typeof c.hasMore === "boolean";
      total = unknown ? null : c.totalCount || rows.length;
      hasMoreKnown = unknown ? c.hasMore : null;
    } else {
      total = this._getProcessedRows().length;
      hasMoreKnown = null;
    }
    const known = typeof total === "number" && Number.isFinite(total);
    const isFiltered = !source && !server && this._state.filters.size > 0;
    const unfilteredTotal = !source && !server ? rows.length : total;
    const drawn = source || server ? rows.length : Math.max(0, Math.min(pageSize, total - offset));
    const pn = this._pageNav({ offset, held: drawn, total, hasMore: hasMoreKnown, pageSize });
    const { hasPrev, hasNext, page } = pn;
    const totalPages = pn.pages;
    if (known && totalPages <= 1 && !isFiltered && !hasPrev) return null;
    if (!known && !hasPrev && !hasNext) return null;
    const maxJump = Number.isFinite(c.maxJumpOffset) ? c.maxJumpOffset : null;
    const go = (newOffset) => {
      if (source) {
        this._sourceGoTo(newOffset);
        return;
      }
      if (server) {
        this._awaitWithSpinner(c.onPageChange(newOffset, pageSize));
        return;
      }
      this._state.offset = newOffset;
      this.render();
    };
    const el = document.createElement("div");
    el.className = "twm-pagination-controls";
    if (!known) el.classList.add("twm-pagination-controls--unknown-total");
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const info = document.createElement("span");
    info.className = "twm-pagination-info";
    info.style.cssText = "color:#aaa; white-space:nowrap;";
    const from = (offset + 1).toLocaleString();
    const to = (offset + drawn).toLocaleString();
    if (drawn === 0) {
      info.textContent = hasPrev ? `Page ${page} \xB7 no rows` : isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : "No rows";
    } else if (!known) {
      info.textContent = `Rows ${from}\u2013${to}`;
    } else if (isFiltered) {
      info.textContent = `Rows ${from}\u2013${to} of ${total.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
    } else {
      info.textContent = `Rows ${from}\u2013${to} of ${total.toLocaleString()}`;
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const firstBtn = this._pagerButton("first_page", "first", "First page", !hasPrev, () => go(0));
    const prevBtn = this._pagerButton(
      "chevron_left",
      "prev",
      "Previous page",
      !hasPrev,
      () => go(Math.max(0, offset - pageSize))
    );
    const pageInfo = document.createElement("span");
    pageInfo.className = "twm-pagination-page";
    pageInfo.style.cssText = "color:#aaa; font-size:10px; min-width:72px; text-align:center;";
    pageInfo.textContent = known ? `Page ${page} of ${totalPages.toLocaleString()}` : `Page ${page}`;
    const nextBtn = this._pagerButton(
      "chevron_right",
      "next",
      "Next page",
      !hasNext,
      () => go(offset + pageSize)
    );
    const { lastOffset, lastRefusal } = pn;
    const lastBtn = this._pagerButton(
      "last_page",
      "last",
      "Last page",
      !hasNext || lastOffset === offset,
      () => {
        if (lastOffset !== null) go(lastOffset);
      },
      lastRefusal
    );
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.className = "twm-pagination-input";
    jumpInput.style.cssText = "width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;";
    jumpInput.min = "1";
    if (known) jumpInput.max = String(total);
    jumpInput.placeholder = "Row #";
    const jumpBtn = this._createPaginationBtn(null, "Go to row", false, () => {
      const target = Math.floor(Number(jumpInput.value));
      if (!Number.isFinite(target) || target < 1) return;
      const row = known ? Math.min(target, Math.max(1, total)) : target;
      const newOffset = Math.floor((row - 1) / pageSize) * pageSize;
      if (maxJump !== null && newOffset > maxJump) {
        const why = this._pagerRefusalTooDeep();
        jumpInput.setAttribute("aria-invalid", "true");
        jumpInput.title = why;
        jumpInput.dataset.refusal = why;
        return;
      }
      jumpInput.removeAttribute("aria-invalid");
      delete jumpInput.dataset.refusal;
      if (server && typeof c.onJumpToRow === "function") {
        c.onJumpToRow(row - 1);
        return;
      }
      go(newOffset);
    }, "Go");
    jumpBtn.dataset.pager = "go";
    el.append(info, spacer, firstBtn, prevBtn, pageInfo, nextBtn, lastBtn, jumpInput, jumpBtn);
    if (c.showExportButton) {
      el.appendChild(this._createPaginationBtn(
        "download",
        "Download visible rows as CSV",
        false,
        () => this.downloadCSV("data.csv")
      ));
    }
    return el;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — filter controls that are not text boxes (#37)
  // ─────────────────────────────────────────────────────────────────
  /** The spec for a column, normalised: null for the 0.4 text box. */
  _filterKindFor(colIdx, header) {
    const fk = this.config.filterKinds;
    if (fk == null) return null;
    let spec;
    if (typeof fk === "function") {
      try {
        spec = fk(colIdx, header);
      } catch (err) {
        console.error("[DataTable] filterKinds threw", err);
        spec = null;
      }
    } else {
      spec = perColumn(fk, colIdx);
    }
    if (spec == null || spec === "text" || spec === false) return null;
    if (typeof spec === "function") return { kind: "custom", create: spec };
    if (typeof spec === "object") {
      if (spec.kind === "text") return null;
      if (spec.kind === "chips") return spec;
      if (typeof spec.create === "function") return { ...spec, kind: spec.kind || "custom" };
    }
    if (spec === "chips") return null;
    return null;
  }
  /** The column's control — built once, then the same element every render. */
  _filterControlFor(colIdx, header) {
    const spec = this._filterKindFor(colIdx, header);
    if (!spec) return null;
    const have = this._filterControls.get(colIdx);
    if (have && have.kind === spec.kind && have.specKey === (spec.options || spec.create)) {
      return have.control;
    }
    if (have) this._destroyOneControl(have.control);
    const value = this._state.filters.get(colIdx) ?? null;
    const ctx = {
      column: colIdx,
      header,
      value,
      counts: this._filterCounts.get(colIdx) ?? null,
      table: this,
      setValue: (v) => this.setFilter(colIdx, v)
    };
    let control = null;
    try {
      control = spec.kind === "chips" ? createChipsFilter(ctx, spec) : spec.create(ctx);
    } catch (err) {
      console.error("[DataTable] filter control threw while being built", err);
      control = null;
    }
    if (typeof Node !== "undefined" && control instanceof Node) control = { el: control };
    if (!control || !control.el) return null;
    control.el.classList?.add("twm-dt-filter-control");
    this._filterControls.set(colIdx, {
      kind: spec.kind,
      specKey: spec.options || spec.create,
      control,
      match: typeof control.match === "function" ? control.match : spec.kind === "chips" ? chipsMatch(spec) : null
    });
    return control;
  }
  /** The client-side rule for a column with a control, or null. */
  _filterMatcher(colIdx) {
    if (!this._filterControls.size && this.config.filterKinds == null) return null;
    const entry = this._filterControls.get(colIdx);
    if (entry) return entry.match || defaultControlMatch;
    const spec = this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
    if (!spec) return null;
    return spec.kind === "chips" ? chipsMatch(spec) : spec.match || defaultControlMatch;
  }
  _isEmptyFilterValue(v) {
    if (v == null || v === "" || v === false) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object" && !(v instanceof Date)) {
      return Object.values(v).every((x) => x == null || x === "");
    }
    return false;
  }
  _destroyOneControl(control) {
    try {
      control?.destroy?.();
    } catch (err) {
      console.error("[DataTable] filter control destroy threw", err);
    }
    control?.el?.remove?.();
  }
  _destroyFilterControls() {
    for (const { control } of this._filterControls.values()) this._destroyOneControl(control);
    this._filterControls.clear();
  }
  _notifyFilterChange() {
    if (typeof this.config.onFilterChange !== "function") return;
    try {
      this.config.onFilterChange(this._filterList());
    } catch (err) {
      console.error("[DataTable] onFilterChange threw", err);
    }
  }
  /** The column filters in force: `[{column, header, value}]`. */
  getFilters() {
    return this._filterList();
  }
  /**
   * Set one column's filter (`null`, `''` or an empty array clears it). The
   * value is whatever the column's control works in — text for the 0.4 box.
   */
  setFilter(colIdx, value) {
    const textBox = !this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
    const v = textBox && value != null && typeof value !== "string" ? String(value) : value;
    if (textBox) {
      const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
      const cell = filterRow?.children[this.config.showRowNumbers ? colIdx + 1 : colIdx];
      const input = cell?.querySelector(".twm-data-table__filter-input");
      if (input) input.value = v || "";
    }
    this._onFilterInput(colIdx, v ?? "");
  }
  /**
   * Counts for a column's filter control — chips draw them beside each
   * option (keyed by the option's value; `''` is "no filter"), a dimmed
   * chip at zero. `setFilterCounts(colIdx, counts)`, or
   * `setFilterCounts({[colIdx]: counts})` for several. They are kept, so a
   * control built later starts with them.
   */
  setFilterCounts(colIdx, counts) {
    if (colIdx && typeof colIdx === "object" && counts === void 0) {
      for (const [k, c] of Object.entries(colIdx)) this.setFilterCounts(Number(k), c);
      return;
    }
    const col = Number(colIdx);
    if (!Number.isInteger(col)) return;
    if (counts == null) this._filterCounts.delete(col);
    else this._filterCounts.set(col, counts);
    const entry = this._filterControls.get(col);
    if (entry) {
      try {
        entry.control.setCounts?.(counts ?? null);
      } catch (err) {
        console.error("[DataTable] filter control setCounts threw", err);
      }
    }
  }
  /** What `setFilterCounts` last gave a column, or null. */
  getFilterCounts(colIdx) {
    return this._filterCounts.get(Number(colIdx)) ?? null;
  }
  // ── focus across a render ──────────────────────────────────────────
  _captureFocus070(doc) {
    const active = doc?.activeElement;
    if (!active || active === doc.body) return null;
    for (const [colIdx, { control }] of this._filterControls) {
      if (control.el?.contains?.(active)) {
        let sel = null;
        try {
          if (typeof active.selectionStart === "number") sel = [active.selectionStart, active.selectionEnd];
        } catch (_) {
        }
        return { kind: "control", colIdx, el: active, sel };
      }
    }
    const detailHost = active.closest?.(".twm-dt-detail");
    if (detailHost && this._tbodyEl?.contains(detailHost)) {
      const tr = detailHost.closest("tr")?.__detailOf;
      if (tr && tr.__rowIndex !== void 0) {
        const path = [];
        for (let n = active; n && n !== detailHost; n = n.parentElement) {
          path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
        }
        let sel = null;
        try {
          if (typeof active.selectionStart === "number") sel = [active.selectionStart, active.selectionEnd];
        } catch (_) {
        }
        return { kind: "detail", key: this._rowKey(tr.__row, tr.__rowIndex), path, tag: active.tagName, sel };
      }
    }
    const toggle = active.closest?.(".twm-dt-detail-toggle");
    if (toggle && this._tbodyEl?.contains(toggle)) {
      const tr = toggle.closest("tr");
      if (tr && tr.__rowIndex !== void 0) {
        return { kind: "toggle", key: this._rowKey(tr.__row, tr.__rowIndex) };
      }
    }
    return null;
  }
  _restoreFocus070(f) {
    try {
      if (f.kind === "control") {
        if (!f.el.isConnected) return;
        f.el.focus({ preventScroll: true });
        if (f.sel) f.el.setSelectionRange?.(f.sel[0], f.sel[1]);
      } else if (f.kind === "detail" && f.key !== null) {
        let n = this._rowElByKey(f.key)?.__detail?.[0]?.querySelector(".twm-dt-detail");
        for (const i of f.path) n = n?.children[i];
        if (n && n.tagName === f.tag) {
          n.focus({ preventScroll: true });
          if (f.sel) n.setSelectionRange?.(f.sel[0], f.sel[1]);
        }
      } else if (f.kind === "toggle" && f.key !== null) {
        const tr = this._rowElByKey(f.key);
        tr?.querySelector(":scope > td > .twm-dt-detail-toggle")?.focus({ preventScroll: true });
      }
    } catch (_) {
    }
  }
  /** The one row spanning every column that says there are no rows (or why
   *  they could not be read). Under `dataSource` the plain message is drawn
   *  by class, so it is quiet while the first answer is on its way. */
  _buildEmptyRow(colCount, emptyMessage) {
    const emptyTr = document.createElement("tr");
    emptyTr.className = "data-preview-row data-table__empty-row";
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = colCount;
    if (this._error) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--error";
      emptyTd.setAttribute("role", "alert");
      this._appendStateContent(emptyTd, this._errorContent());
    } else if (this.config.emptyState !== void 0) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--state";
      const state = typeof this.config.emptyState === "function" ? this.config.emptyState() : this.config.emptyState;
      this._appendStateContent(emptyTd, state);
    } else if (this.config.dataSource) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--state";
      emptyTd.textContent = emptyMessage;
    } else {
      emptyTd.style.cssText = "text-align:center; font-style:italic; color:#888; padding:16px;";
      emptyTd.textContent = emptyMessage;
    }
    emptyTr.appendChild(emptyTd);
    return emptyTr;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.5.0 — decoration, states and the typed columns
  // ─────────────────────────────────────────────────────────────────
  /** The class list both halves of the table carry: the 0.4 pair, plus the
   *  0.5.0 modifiers a consumer asked for. */
  _tableClassName() {
    const names = this.config.readonly ? ["twm-preview-table", "twm-preview-table--readonly"] : ["twm-preview-table"];
    if (this.config.firstColumn === "plain") names.push("twm-dt--first-plain");
    if (this._isClickable()) names.push("twm-dt--clickable");
    return names.join(" ");
  }
  /** `clickable` when it is said; otherwise exactly when rows open. */
  _isClickable() {
    const c = this.config.clickable;
    if (c === true || c === false) return c;
    return typeof this.config.onRowActivate === "function";
  }
  _fitsContent() {
    return !!this.config.fitContent || this._maxHeightCss() !== null;
  }
  _maxHeightCss() {
    const m = this.config.maxHeight;
    if (m == null || m === "" || m === false) return null;
    if (typeof m === "number") return Number.isFinite(m) && m > 0 ? `${m}px` : null;
    return String(m);
  }
  _utc() {
    return String(this.config.dateTimeZone || "").toUpperCase() === "UTC";
  }
  /**
   * What a column is drawn, sorted and filtered BY: its type, except that a
   * 'date', 'datetime' or 'duration' counts only when it was DECLARED through
   * `columnTypes`. In 0.4, whatever `getColumnType` returned was the cells'
   * class name and nothing more (only 'num' changed the sort and the
   * filter), so a consumer that returned 'date' there to style its cells gets
   * exactly 0.4 — its `formatValue`, its text sort, its text filter — and
   * the class name it asked for.
   */
  _valueKind(colIdx) {
    const t = this._columnTypes?.[colIdx];
    if (!TYPED_COLUMNS.has(t)) return t;
    const declared = Array.isArray(this.config.columnTypes) ? this.config.columnTypes[colIdx] : null;
    return declared === t ? t : "text";
  }
  /** `classList.add` for whatever a hook returned: a string (space-separated
   *  names allowed), an array of them, or nothing. */
  _addClasses(el, names) {
    if (!names) return [];
    const list = (Array.isArray(names) ? names : String(names).split(/\s+/)).map((n) => String(n || "").trim()).filter(Boolean);
    if (list.length) el.classList.add(...list);
    return list;
  }
  /** A row's key, as text, or null: `getRowKey`, else its original index. */
  _rowKey(row, rowIdx) {
    const fn = this.config.getRowKey;
    let key;
    if (typeof fn === "function") {
      try {
        key = fn(row, rowIdx);
      } catch (err) {
        console.error("[DataTable] getRowKey threw", err);
        key = null;
      }
    } else {
      key = rowIdx;
    }
    return key == null ? null : String(key);
  }
  /** The gestures `activateOn` names, as a set. */
  _activateOn() {
    const a = this.config.activateOn;
    const list = Array.isArray(a) ? a : [a || "click"];
    return new Set(list.map((g) => String(g).toLowerCase()));
  }
  /**
   * Open a row on the gestures `activateOn` names, by the one rule in
   * `row_activation.js` (a control is its own gesture, a drag that selects
   * text is not a click, the second click of a double-click opens nothing).
   * Delegated on the body, bound after the selection handler.
   *
   * The listeners go in `_activationOffs`, not `_disposers`, and a render
   * retires them a task late (`_retireActivation`): a press whose selection
   * callback re-draws the table still opens the row it pressed — the row
   * as it was drawn (`tr.__row`), with its original index.
   */
  _installActivation(tbody, table) {
    const on = this._activateOn();
    const scope = this._wrapperEl;
    const sel = this.config.selectable;
    const multi = !!sel && sel !== "single";
    const fire = (tr, ev) => {
      if (!this._wrapperEl || typeof this.config.onRowActivate !== "function") return;
      try {
        this.config.onRowActivate(tr.__rowIndex, tr.__row, ev);
      } catch (err) {
        console.error("[DataTable] onRowActivate threw", err);
      }
    };
    const rowFor = (ev) => {
      const tr = ev.target?.closest?.("tr");
      return tr && tr.__rowIndex !== void 0 && tbody.contains(tr) ? tr : null;
    };
    const listen = (el, type, fn) => {
      el.addEventListener(type, fn);
      this._activationOffs.push(() => el.removeEventListener(type, fn));
    };
    if (on.has("click")) {
      listen(tbody, "click", (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        const tr = rowFor(ev);
        if (!tr || !isRowActivation(ev, "click", { scope })) return;
        if (multi && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) return;
        if (DESELECTING_CLICKS.has(ev)) return;
        fire(tr, ev);
      });
    }
    if (on.has("dblclick")) {
      listen(tbody, "dblclick", (ev) => {
        const tr = rowFor(ev);
        if (!tr || !isRowActivation(ev, "dblclick", { scope })) return;
        fire(tr, ev);
      });
    }
    if (on.has("enter")) {
      listen(table, "keydown", (ev) => {
        if (ev.key !== "Enter" || ev.isComposing) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
        if (isRowControl(ev.target, table)) return;
        const tr = this._currentRowEl();
        if (!tr) return;
        ev.preventDefault();
        fire(tr, ev);
      });
    }
  }
  /**
   * The row Enter opens: the SELECTED one — the one row selected, or the
   * selection's anchor — because that is the row a person just chose (a
   * double-click opens the row it lands on, and Enter must agree with it);
   * the open row (`activeRow`) only when nothing is selected. A selected row
   * that is not drawn (another page) opens nothing rather than a different
   * row.
   */
  _currentRowEl() {
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    const selected = this._state.selected;
    let idx = null;
    if (selected.size === 1) idx = [...selected][0];
    else if (this._state.anchorIndex != null && selected.has(this._state.anchorIndex)) {
      idx = this._state.anchorIndex;
    }
    if (idx != null) return this.getRowElement(idx);
    if (this._activeKey !== null) {
      for (const tr of tbody.children) {
        if (tr.__rowIndex !== void 0 && tr.classList.contains("twm-dt-row--active")) return tr;
      }
    }
    return null;
  }
  /** 0.6.1. The `diff` answer for one row, or `null` when there is none or
   *  its status is not one this component draws. */
  _diffOf(row, rowIdx) {
    if (typeof this.config.diff !== "function") return null;
    const answer = this.config.diff(row, rowIdx);
    if (!answer || !DIFF_STATUSES.has(answer.status)) return null;
    return answer;
  }
  /** Everything `rowClass`, `rowAttrs` and the open mark put on a `<tr>`,
   *  taken off again first — so `updateRow` cannot leave last state's class
   *  behind. */
  _decorateRow(tr, row, rowIdx) {
    tr.__row = row;
    const { rowClass, rowAttrs } = this.config;
    if (tr.__twmClasses) {
      for (const c of tr.__twmClasses) tr.classList.remove(c);
      tr.__twmClasses = null;
    }
    if (typeof rowClass === "function") {
      const added = this._addClasses(tr, rowClass(row, rowIdx));
      tr.__twmClasses = added.filter((c) => c !== "data-preview-row" && c !== "selected");
    }
    for (const c of [...tr.classList]) {
      if (c === "twm-dt-diff" || c.startsWith("twm-dt-diff--")) tr.classList.remove(c);
    }
    const diff = this._diffOf(row, rowIdx);
    if (diff) tr.classList.add("twm-dt-diff", `twm-dt-diff--${diff.status}`);
    if (tr.__twmAttrs) {
      for (const name of tr.__twmAttrs) tr.removeAttribute(name);
      tr.__twmAttrs = null;
    }
    if (typeof rowAttrs === "function") {
      const attrs = rowAttrs(row, rowIdx) || {};
      const set = [];
      for (const [name, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        try {
          tr.setAttribute(name, value === true ? "" : String(value));
          set.push(name);
        } catch (err) {
          console.error(`[DataTable] rowAttrs: bad attribute "${name}"`, err);
        }
      }
      tr.__twmAttrs = set;
    }
    if (typeof this.config.getRowKey === "function" || this._activeKey !== null) {
      tr.__rowKey = this._rowKey(row, rowIdx);
    }
    this._paintActive(tr);
    if (this._newKeys) {
      tr.classList.toggle("twm-dt-row--new", this._newKeys.has(this._rowKey(row, rowIdx)));
    }
  }
  /** The open mark on one row, from `_activeKey`. */
  _paintActive(tr) {
    if (tr.__rowKey === void 0 && this._activeKey !== null && tr.__rowIndex !== void 0) {
      const rows = this.config.rows;
      const local = this._virt ? this._virtLocalOf(tr.__rowIndex) : -1;
      const row = local >= 0 ? this._virt.rows[local] : rows?.[tr.__rowIndex];
      tr.__rowKey = this._rowKey(row, tr.__rowIndex);
    }
    const on = this._activeKey !== null && tr.__rowKey === this._activeKey;
    tr.classList.toggle("twm-dt-row--active", on);
    if (on) {
      if (tr.getAttribute("aria-current") !== "true") {
        tr.setAttribute("aria-current", "true");
        tr.__twmAriaCurrent = true;
      }
    } else if (tr.__twmAriaCurrent) {
      tr.__twmAriaCurrent = false;
      if (!(tr.__twmAttrs || []).includes("aria-current")) tr.removeAttribute("aria-current");
    }
  }
  /** The row icon, drawn by CSS from `data-twm-icon` so that its name is in
   *  neither `textContent`, the clipped-cell tooltip nor a copy. */
  _prependRowIcon(td, spec) {
    if (!spec) return;
    const s = typeof spec === "string" ? { icon: spec } : spec;
    if (!s.icon) return;
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined twm-dt-row-icon" + (s.tone ? ` twm-dt-row-icon--${String(s.tone).replace(/[^\w-]/g, "")}` : "");
    icon.dataset.twmIcon = String(s.icon);
    if (s.title) {
      icon.title = String(s.title);
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", String(s.title));
    } else {
      icon.setAttribute("aria-hidden", "true");
    }
    td.insertBefore(icon, td.firstChild);
    td.classList.add("twm-dt-cell--has-icon");
  }
  /** Text, a node, or nothing, into an empty-state cell. */
  _appendStateContent(td, content) {
    if (content == null || content === false) return;
    if (typeof Node !== "undefined" && content instanceof Node) td.appendChild(content);
    else td.textContent = String(content);
  }
  /** What `setError` holds, as something `_appendStateContent` can draw. */
  _errorContent() {
    const e = this._error;
    if (e == null) return null;
    if (typeof Node !== "undefined" && e instanceof Node) return e;
    if (e instanceof Error) return e.message || String(e);
    if (typeof e === "object" && e.message) return String(e.message);
    return String(e);
  }
  /** The failure banner over rows that are kept. */
  _createErrorBanner() {
    const banner = document.createElement("div");
    banner.className = "twm-data-table__error";
    banner.setAttribute("role", "alert");
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined twm-data-table__error-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "error";
    const text = document.createElement("span");
    text.className = "twm-data-table__error-text";
    const content = this._errorContent();
    if (typeof Node !== "undefined" && content instanceof Node) text.appendChild(content);
    else text.textContent = String(content ?? "");
    banner.append(icon, text);
    return banner;
  }
  /** The `sortValue` hook for one column, or null. */
  _sortValueFor(colIdx) {
    const sv = this.config.sortValue;
    if (typeof sv === "function") return sv;
    const fn = perColumn(sv, colIdx);
    return typeof fn === "function" ? fn : null;
  }
  /** The words for a value in a typed column, or `undefined` when the
   *  column is not typed (or the value is empty). */
  _formatTyped(value, colIdx) {
    const kind = this._valueKind(colIdx);
    if (!TYPED_COLUMNS.has(kind) || value == null || value === "") return void 0;
    if (kind === "duration") {
      return formatDuration(value, perColumn(this.config.durationFormat, colIdx) || "auto");
    }
    const pattern = kind === "datetime" ? perColumn(this.config.dateTimeFormat, colIdx) || ISO_DATETIME : perColumn(this.config.dateFormat, colIdx) || ISO_DATE;
    if (typeof pattern === "function") {
      const t = parseDateValue(value, { utc: this._utc() });
      return Number.isFinite(t) ? String(pattern(new Date(t), colIdx, value) ?? "") : String(value);
    }
    return formatDate(value, pattern, { utc: this._utc() });
  }
  /** Sync the (separate) header table's column widths to the body
   *  table's measured widths. Without this, the two tables compute
   *  widths independently and the columns drift apart. Locks both
   *  tables to `table-layout: fixed` and writes explicit width onto
   *  each header cell of every header row (header + filter row). */
  /**
   * Measure every column's NATURAL content width, in one transient reflow.
   *
   * Extracted from `_syncHeaderWidths` so that auto-size can ask the same
   * question the fit pass asks, and get the same answer. Two measurement
   * passes would drift, and the drift would show as a double-click that
   * sized a column differently from the render that follows it.
   *
   * The pass ignores the CSS caps (the 150px-pinned first column, the 80px
   * min on the rest) and the filter-row inputs: `twm-dt-measuring` flips both
   * tables to `table-layout:auto; width:max-content` with those caps off (via
   * `!important`) for a single reflow, then reverts before paint — it is
   * never visible. Clearing inline widths first stops the last sync's forced
   * widths from constraining the measure.
   *
   * C10 — UNDER `virtualize` ONLY THE WINDOW IS IN THE DOM, so `max-content`
   * spans the eighty-odd rows drawn rather than every row loaded. The fit
   * pass that runs on every render is content with that (it is fitting what
   * is on screen). An EXPLICIT auto-size is not: it is a promise to fit the
   * column's content, and the longest value in a 6,000-row table is usually
   * not in the window. So `sample` adds, for the length of this one reflow,
   * the row holding each column's longest value — see `_virtSampleRows`.
   *
   * @param {{sample?: boolean}} [o]
   * @returns {number[]|null} width per DOM column index, or null when there
   *   is nothing laid out to measure.
   */
  _measureNaturalWidths({ sample = false } = {}) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return null;
    const firstRow = this._firstBodyRow();
    if (!firstRow) return null;
    const bodyCells = firstRow.children;
    if (!bodyCells.length) return null;
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      for (const th of tr.children) this._clearCellWidth(th);
    });
    for (const td of bodyCells) this._clearCellWidth(td);
    for (const col of this._cols() || []) col.style.width = "";
    headerTable.style.width = "";
    bodyTable.style.width = "";
    headerTable.classList.add("twm-dt-measuring");
    bodyTable.classList.add("twm-dt-measuring");
    const sampled = sample ? this._virtSampleRows() : [];
    for (const tr of sampled) this._virt.tbody.appendChild(tr);
    bodyTable.offsetWidth;
    const labelRow = headerTable.querySelector("thead > tr");
    const cols = bodyCells.length;
    const natural = new Array(cols);
    const zoom = bodyTable.currentCSSZoom || 1;
    for (let i = 0; i < cols; i++) {
      const body = bodyCells[i].getBoundingClientRect().width / zoom;
      const head = labelRow && labelRow.children[i] ? labelRow.children[i].getBoundingClientRect().width / zoom : 0;
      natural[i] = Math.max(body, head);
    }
    const floors = new Array(cols).fill(0);
    const filterRow = headerTable.querySelector("thead > tr.twm-data-table__filter-row--controls");
    if (filterRow) {
      for (let i = 0; i < cols && i < filterRow.children.length; i++) {
        const th = filterRow.children[i];
        if (!th.classList.contains("data-table__filter-cell--control")) continue;
        const el = th.firstElementChild;
        if (!el) continue;
        const cs = getComputedStyle(th);
        const pad2 = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        floors[i] = Math.ceil(el.getBoundingClientRect().width / zoom + pad2);
        natural[i] = Math.max(natural[i], floors[i]);
      }
    }
    this._filterFloors = floors;
    for (const tr of sampled) tr.remove();
    headerTable.classList.remove("twm-dt-measuring");
    bodyTable.classList.remove("twm-dt-measuring");
    return natural;
  }
  /**
   * The rows an explicit auto-size must measure that the window has not
   * drawn: for each column, the drawable row whose value is LONGEST as a
   * string, plus the last row (the widest row number). Built with
   * `_buildBodyRow` — so a consumer's `renderCell` draws them exactly as it
   * would on screen — and handed back detached, for `_measureNaturalWidths`
   * to put in and take out around its one reflow.
   *
   * The string length is a proxy, not a measurement: in a proportional font
   * forty `i`s are narrower than thirty `W`s. It is the proxy a spreadsheet's
   * own autofit falls short by, and it is right about the case that matters
   * here — a value five times longer than anything in the window. One pass
   * over the loaded rows, on a click and never on a scroll or a resize.
   *
   * @returns {HTMLTableRowElement[]}
   */
  _virtSampleRows() {
    const v = this._virt;
    if (!v || !v.rows.length) return [];
    const longest = [];
    const at = [];
    let last = -1;
    for (let i = 0; i < v.rows.length; i++) {
      if (!(v.heights[i] > 0)) continue;
      last = i;
      const row = v.rows[i];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        const len = value == null ? 0 : String(value).length;
        if (len > (longest[c] ?? -1)) {
          longest[c] = len;
          at[c] = i;
        }
      }
    }
    const want = new Set(at.filter((i) => i !== void 0));
    if (last >= 0) want.add(last);
    const rows = [];
    for (const i of want) {
      if (v.map.has(i)) continue;
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      tr.setAttribute("aria-hidden", "true");
      rows.push(tr);
    }
    return rows;
  }
  /**
   * Fit one column to its widest value and pin it there — every loaded
   * row's, under `virtualize` (see `_virtSampleRows`), not only the window's.
   *
   * The gesture is a double-click on the column's resize grip, which is where
   * every spreadsheet has put it — and the grip is this component's, which is
   * why the behaviour is too. A consumer that wanted this had no hook to hang
   * it on: `_installColumnResizers` bound `mousedown` and a `click` that only
   * suppressed the sort, and the measurement, the pin, the table-width
   * invariant and the write-through to `stateStore` are all private here.
   *
   * @param {number} domIdx column index INCLUDING the row-number column when
   *   `showRowNumbers` is on — the same index space as `_colWidths`.
   * @param {{maxWidth?: number}} [opts] ceiling; defaults to AUTOSIZE_MAX_PX.
   * @returns {boolean} whether it had a layout to measure.
   */
  autoSizeColumn(domIdx, opts = {}) {
    const natural = this._measureNaturalWidths({ sample: true });
    if (!natural || domIdx < 0 || domIdx >= natural.length) return false;
    this._colWidths[domIdx] = this._autoWidth(natural[domIdx], opts);
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    this._syncHeaderWidths();
    return true;
  }
  /**
   * The same for every column at once.
   *
   * It REPLACES existing drag overrides rather than sizing around them: "fit
   * every column to its content" that quietly excepted the three columns you
   * had dragged would be a button whose result depends on history nobody can
   * see.
   *
   * The result may well be wider than the container — forty columns of real
   * content usually are — and that is the intended answer, not a failure:
   * `_syncHeaderWidths` honours overrides verbatim, sizes both tables to their
   * total and the body wrap scrolls sideways with the header following it.
   * Squeezing them to fit is what the automatic fit pass does on every render
   * already, so a button that did that would be a button that does nothing.
   */
  autoSizeColumns(opts = {}) {
    const natural = this._measureNaturalWidths({ sample: true });
    if (!natural) return false;
    this._colWidths = {};
    for (let i = 0; i < natural.length; i++) {
      this._colWidths[i] = this._autoWidth(natural[i], opts);
    }
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    this._syncHeaderWidths();
    return true;
  }
  /** One measured width, floored at the drag-resize minimum and capped, with
   *  the same sub-pixel pad `_fitColumnWidths` adds against ellipsis. */
  _autoWidth(natural, opts = {}) {
    const max = opts.maxWidth ?? AUTOSIZE_MAX_PX;
    return Math.min(max, Math.max(40, Math.ceil((natural || 0) + 2)));
  }
  /**
   * Does every one of the `n` DOM columns already carry an override taken
   * against the column set that is on screen right now?
   *
   * The signature half is not belt-and-braces. `render()` drops `_colWidths`
   * when `_colSig` changes, but `_syncHeaderWidths` is also reached straight
   * from the ResizeObserver, which never goes through `render()` — so a set
   * of overrides measured against the PREVIOUS headers can still be sitting
   * in `_colWidths` when this is asked. Answering "pinned" then would skip
   * the measure and hand `_fitColumnWidths` widths keyed to columns that are
   * no longer there, each one landing on its neighbour.
   *
   * `== null` rather than a falsy test, to match `_fitColumnWidths`' own
   * `overrides[i] != null`: a legitimately-stored 0 must be read the same way
   * in both places or the two disagree about which columns are flexible.
   */
  _allColumnsPinned(n) {
    if (!n || this._colWidthsSig !== this._colSig()) return false;
    for (let i = 0; i < n; i++) {
      if (this._colWidths[i] == null) return false;
    }
    return true;
  }
  /** Sync the (separate) header table's column widths to the body
   *  table's measured widths. Without this, the two tables compute
   *  widths independently and the columns drift apart. Locks both
   *  tables to `table-layout: fixed` and writes explicit width onto
   *  each header cell of every header row (header + filter row). */
  _syncHeaderWidths() {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return;
    const cols = this._cols();
    const firstRow = this._firstBodyRow();
    const bodyCells = cols ? [] : firstRow?.children;
    const n = cols ? cols.length : bodyCells?.length || 0;
    if (!n) return;
    const headerRows = headerTable.querySelectorAll("thead > tr");
    const natural = this._allColumnsPinned(n) ? new Array(n).fill(0) : this._measureNaturalWidths();
    if (!natural) return;
    const wrap = this._tableWrapEl;
    const headerWrap = this._headerWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    const firstIdx = this.config.showRowNumbers && n > 1 ? 1 : 0;
    const widths = this._fitColumnWidths(natural, avail, {
      firstIdx,
      overrides: this._colWidths,
      fit: this.config.columnFit,
      floors: this._filterFloors
    });
    const total = widths.reduce((a, b) => a + b, 0);
    headerRows.forEach((tr) => {
      for (let i = 0; i < tr.children.length && i < widths.length; i++) {
        this._setCellWidth(tr.children[i], widths[i]);
      }
    });
    if (cols) {
      for (let i = 0; i < cols.length && i < widths.length; i++) {
        cols[i].style.width = `${widths[i]}px`;
      }
    } else {
      for (let i = 0; i < bodyCells.length && i < widths.length; i++) {
        this._setCellWidth(bodyCells[i], widths[i]);
      }
    }
    headerTable.style.tableLayout = "fixed";
    bodyTable.style.tableLayout = "fixed";
    const hasOverride = Object.keys(this._colWidths).length > 0;
    if (hasOverride || total > avail + 1) {
      headerTable.style.width = `${total}px`;
      bodyTable.style.width = `${total}px`;
    } else {
      headerTable.style.width = "";
      bodyTable.style.width = "";
    }
    if (wrap && headerWrap) {
      const sbw = Math.max(0, wrap.offsetWidth - wrap.clientWidth);
      headerWrap.style.paddingRight = sbw ? `${sbw}px` : "";
      this._wrapperEl?.style?.setProperty("--twm-dt-gutter", `${sbw}px`);
    }
    this._syncHeaderScroll();
    this._updateCellTooltips();
  }
  /**
   * Convert measured natural content widths into final column widths.
   *
   * Goals (the "intelligent" sizing):
   *  - every column wants its content width (+a hair), clamped to a
   *    sane [floor, cap]; the FIRST content column gets a more generous
   *    cap so it shows its full value;
   *  - user-dragged columns (`overrides`) are pinned, never grown/shrunk;
   *  - if everything fits, grow the flexible columns evenly to fill the
   *    width (no dead gap on the right);
   *  - if it doesn't fit, protect the first column and water-fill-shrink
   *    the rest (trim the widest first) until it fits; only if even the
   *    floors overflow do we give up and let the body scroll sideways.
   *
   * Under `fit: 'content'` the first and last of those goals invert: each
   * unpinned column asks for its own content width through the same
   * `_autoWidth` the grip double-click uses, and an overflow is the answer
   * rather than a problem — the caller wanted a table that scrolls sideways,
   * not one squeezed toward the floor. The grow-to-fill branch is shared by
   * both, because a table narrower than its container leaves a dead gap on
   * the right under either reading.
   *
   * @param {number[]} natural  measured content width per column (px)
   * @param {number}   avail    usable width of the body wrap (px)
   * @param {{firstIdx?:number, overrides?:Object, fit?:'container'|'content'}} [opts]
   * @returns {number[]} final width per column (px)
   */
  _fitColumnWidths(natural, avail, opts = {}) {
    const FLOOR = 40;
    const CAP = 360;
    const FIRST_CAP = 520;
    const PAD = 2;
    const n = natural.length;
    const firstIdx = opts.firstIdx ?? 0;
    const overrides = opts.overrides || {};
    const floors = Array.isArray(opts.floors) ? opts.floors : [];
    const floorOf = (i) => Math.max(FLOOR, Math.ceil(floors[i] || 0));
    const toContent = opts.fit === "content";
    const desired = new Array(n);
    const pinned = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (overrides[i] != null) {
        desired[i] = Math.max(FLOOR, Math.round(overrides[i]));
        pinned[i] = true;
        continue;
      }
      if (toContent) {
        desired[i] = this._autoWidth(natural[i]);
        continue;
      }
      const cap = i === firstIdx ? FIRST_CAP : CAP;
      desired[i] = Math.min(cap, Math.max(FLOOR, Math.ceil(natural[i] + PAD)));
    }
    const widths = desired.slice();
    const sum = widths.reduce((a, b) => a + b, 0);
    if (avail <= 1) return widths;
    if (sum <= avail) {
      const flex = [];
      for (let i = 0; i < n; i++) if (!pinned[i]) flex.push(i);
      const slack = avail - sum;
      if (slack > 0) {
        const targets = flex.length ? flex : [n - 1];
        const per = Math.floor(slack / targets.length);
        for (const i of targets) widths[i] += per;
        widths[targets[targets.length - 1]] += slack - per * targets.length;
      }
      return widths;
    }
    if (toContent) return widths;
    let protectedSum = 0;
    const shrinkable = [];
    for (let i = 0; i < n; i++) {
      if (pinned[i] || i === firstIdx) protectedSum += widths[i];
      else shrinkable.push(i);
    }
    const budget = avail - protectedSum;
    if (budget < shrinkable.length * FLOOR) {
      for (const i of shrinkable) widths[i] = floorOf(i);
      return widths;
    }
    shrinkable.sort((a, b) => desired[a] - desired[b]);
    let remaining = budget;
    for (let k = 0; k < shrinkable.length; k++) {
      const colsLeft = shrinkable.length - k;
      const fair = Math.floor(remaining / colsLeft);
      const i = shrinkable[k];
      if (desired[i] <= fair) {
        widths[i] = desired[i];
        remaining -= desired[i];
      } else {
        const level = Math.max(FLOOR, fair);
        for (let j = k; j < shrinkable.length; j++) {
          widths[shrinkable[j]] = Math.max(level, floorOf(shrinkable[j]));
        }
        const leftover = remaining - colsLeft * level;
        if (leftover > 0) widths[shrinkable[shrinkable.length - 1]] += leftover;
        break;
      }
    }
    return widths;
  }
  /** Set an explicit width on a table cell, clearing any CSS min/max
   *  width constraint so the width is honored exactly. The first
   *  ("time") column is pinned to 150px by `min/max-width` in CSS;
   *  without this, dragging it does nothing and the slack leaks to the
   *  other columns. */
  _setCellWidth(cell, w) {
    cell.style.width = `${w}px`;
    cell.style.minWidth = "0";
    cell.style.maxWidth = "none";
  }
  /** Undo `_setCellWidth` so a re-measure sees the cell's natural,
   *  CSS-constrained width again. */
  _clearCellWidth(cell) {
    cell.style.width = "";
    cell.style.minWidth = "";
    cell.style.maxWidth = "";
  }
  /** Wire the body wrap's horizontal scroll to the header. The header
   *  sits in an overflow:hidden wrap, so it can't scroll sideways on
   *  its own — `_syncHeaderScroll` scrolls it programmatically to the
   *  body's `scrollLeft`. Re-installed each render against the freshly-built
   *  wrap. */
  _installHeaderScrollSync() {
    const wrap = this._tableWrapEl;
    if (!wrap) return;
    if (this._onBodyScroll && this._scrollSyncEl) {
      this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
    }
    this._onBodyScroll = () => this._syncHeaderScroll();
    this._scrollSyncEl = wrap;
    wrap.addEventListener("scroll", this._onBodyScroll, { passive: true });
    this._syncHeaderScroll();
  }
  /**
   * Scroll the header wrap to match the body's horizontal scroll so the
   * columns stay aligned when the table overflows sideways.
   *
   * ══ C29. A TRANSFORM IS WHAT MAKES A STICKY COLUMN IMPOSSIBLE ═══════
   *
   * This wrote `headerTable.style.transform = translateX(-scrollLeft)`. It
   * aligns the two tables perfectly and it forecloses `position: sticky`
   * entirely, because the two halves of the table then pin against different
   * things: a sticky cell in the BODY pins to the body wrap's scrollport,
   * while its header counterpart is moved by a transform inside a box that
   * never scrolls at all. Scroll sideways and the pinned body column stands
   * still while its header slides away with everything else — so a table
   * with a trailing verb column (the row-actions column Tables needs pinned
   * to the right edge) can have a sticky body or an aligned header, never
   * both. A transform also establishes a containing block for fixed/sticky
   * descendants, which breaks the header cell independently of the offset.
   *
   * AN `overflow: hidden` BOX IS STILL A SCROLL CONTAINER. It has no
   * scrollbar and no user affordance, and `scrollLeft` moves it exactly like
   * any other. Scrolling the wrap rather than transforming its child gives
   * the header a real scrollport at the same offset as the body's, which is
   * the one arrangement in which a sticky cell on each side pins to the same
   * place. Identical for ordinary content: same pixels, no transform, no new
   * containing block.
   *
   * THE CLAMP IS ALREADY PAID FOR. A scroll container clamps `scrollLeft` to
   * `scrollWidth - clientWidth`, and the body wrap carries a vertical
   * scrollbar the header wrap does not — so the header would clamp short by
   * the scrollbar width and desync at the far right. `_syncHeaderWidths`
   * already pads the header wrap by exactly that gutter (`paddingRight`,
   * :1905), and end padding counts toward `scrollWidth`, so the two maxima
   * coincide. The residual below is the honest belt for the day some engine
   * disagrees about that: it is zero in the ordinary case, so the transform
   * is not set and sticky keeps working, and it is the difference rather
   * than the whole offset if it is ever not.
   */
  _syncHeaderScroll() {
    const wrap = this._tableWrapEl;
    const headerTable = this._headerTableEl;
    if (!wrap || !headerTable) return;
    const x = wrap.scrollLeft;
    const headerWrap = this._headerWrapEl;
    if (!headerWrap) {
      headerTable.style.transform = x ? `translateX(${-x}px)` : "";
      return;
    }
    headerWrap.scrollLeft = x;
    const residual = x - headerWrap.scrollLeft;
    headerTable.style.transform = residual ? `translateX(${-residual}px)` : "";
  }
  /** Drag-to-resize: hang a thin grab handle off the right edge of
   *  every header cell. Dragging it writes a per-column width override
   *  (keyed by DOM index) that `_syncHeaderWidths` then honors. */
  _installColumnResizers() {
    const headerTable = this._headerTableEl;
    if (!headerTable) return;
    const headRow = headerTable.querySelector("thead > tr");
    if (!headRow) return;
    [...headRow.children].forEach((th, domIdx) => {
      if (th.querySelector(".twm-dt-col-resizer")) return;
      th.classList.add("twm-dt-col");
      const grip = document.createElement("div");
      grip.className = "twm-dt-col-resizer";
      grip.addEventListener(
        "mousedown",
        (ev) => this._beginColResize(ev, domIdx)
      );
      grip.addEventListener("click", (ev) => ev.stopPropagation());
      grip.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.autoSizeColumn(domIdx);
      });
      th.appendChild(grip);
    });
  }
  /**
   * CSS px per screen px. Content inside a zoomed tile reports rects and
   * pointer coordinates in screen pixels, while `style.width` is CSS pixels;
   * mixing them widened every column by the zoom factor on a mere click.
   */
  _zoomFactor() {
    const el = this._tableWrapEl || this._tableEl;
    const css = el?.offsetWidth || 0;
    const screen = el?.getBoundingClientRect?.().width || 0;
    return css > 0 && screen > 0 ? screen / css : 1;
  }
  _beginColResize(ev, domIdx) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const startX = ev.clientX;
    const THRESHOLD = 3;
    const MIN = 40;
    let startWidths = null;
    const begin = () => {
      const z = this._zoomFactor();
      startWidths = [...headRow.children].map((c) => {
        const set = parseFloat(c.style.width);
        return Number.isFinite(set) ? set : c.getBoundingClientRect().width / z;
      });
      headerTable.style.tableLayout = "fixed";
      if (bodyTable) bodyTable.style.tableLayout = "fixed";
      startWidths.forEach((w, i) => this._pinColumnWidth(i, w));
      this._applyTableWidth();
      document.body.classList.add("twm-dt-col-resizing");
    };
    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      if (!startWidths) {
        if (Math.abs(dx) < THRESHOLD) return;
        begin();
      }
      const w = Math.max(MIN, Math.round(startWidths[domIdx] + dx / this._zoomFactor()));
      this._pinColumnWidth(domIdx, w);
      this._applyTableWidth(domIdx);
      this._syncHeaderScroll();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!startWidths) return;
      document.body.classList.remove("twm-dt-col-resizing");
      this._updateCellTooltips();
      this._savePersisted();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  /** Pin one column to an explicit width across BOTH tables (every
   *  header row + the body's first row) and record it as a user
   *  override so `_syncHeaderWidths` honors it on later renders. The
   *  single place that writes a column width during a drag / fill. */
  _pinColumnWidth(i, w) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable) return;
    this._colWidths[i] = w;
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      if (tr.children[i]) this._setCellWidth(tr.children[i], w);
    });
    const cols = this._cols();
    if (cols) {
      if (cols[i]) cols[i].style.width = `${w}px`;
      return;
    }
    const bodyRow = bodyTable && this._firstBodyRow();
    if (bodyRow && bodyRow.children[i]) this._setCellWidth(bodyRow.children[i], w);
  }
  /** Size both tables so a widened column grows the table (→ horizontal
   *  scroll) rather than stealing from its neighbours — while enforcing
   *  the TABLE WIDTH INVARIANT: the table is never narrower than its
   *  container. Any width freed by dragging a column in stretches a
   *  flexible column (the last one, stepping off the column being
   *  dragged) so the table always spans ≥100% of the wrap.
   *
   * @param {number|null} dragIdx column the user is actively dragging,
   *        so the fill lands on a DIFFERENT column and doesn't fight the
   *        drag. Null (non-drag callers) lets the last column flex. */
  _applyTableWidth(dragIdx = null) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const cells = [...headRow.children];
    const cols = cells.length;
    if (cols === 0) return;
    const FLOOR = 40;
    const widthOf = (th) => {
      const px = parseFloat(th.style.width);
      return Number.isFinite(px) ? px : th.getBoundingClientRect().width;
    };
    const cur = cells.map(widthOf);
    const wrap = this._tableWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    let flexIdx = cols - 1;
    if (dragIdx != null && flexIdx === dragIdx) flexIdx -= 1;
    if (avail > 1 && flexIdx >= 0 && flexIdx !== dragIdx) {
      let rest = 0;
      for (let i = 0; i < cols; i++) if (i !== flexIdx) rest += cur[i];
      const fill = Math.max(FLOOR, Math.round(avail - rest));
      if (Math.round(fill) !== Math.round(cur[flexIdx])) {
        this._pinColumnWidth(flexIdx, fill);
        cur[flexIdx] = fill;
      }
    }
    let total = 0;
    for (const w of cur) total += w;
    total = Math.ceil(total);
    headerTable.style.width = `${total}px`;
    if (bodyTable) bodyTable.style.width = `${total}px`;
  }
  /** Add a native `title` tooltip to any body cell whose text is
   *  clipped by its column width; remove ours once it fits again.
   *  Leaves caller-supplied titles (e.g. from renderCell) untouched. */
  _updateCellTooltips(rows = null) {
    const bodyTable = this._tableEl;
    if (!bodyTable) return;
    const cells = rows ? rows.flatMap((tr) => [...tr.children]) : bodyTable.querySelectorAll("tbody td");
    cells.forEach((td) => {
      if (td.parentElement?.classList.contains("twm-dt-spacer")) return;
      if (td.closest?.(".twm-dt-detail-row")) return;
      const clipped = td.scrollWidth > td.clientWidth + 1;
      if (clipped) {
        if (!td.title) td.title = td.textContent;
      } else if (td.title && td.title === td.textContent) {
        td.removeAttribute("title");
      }
    });
  }
  _installInteractions() {
    if (!this._tbodyEl || !this._tableEl) return;
    const { selectable, copyable } = this.config;
    const tbody = this._tbodyEl;
    const table = this._tableEl;
    if (selectable) {
      const handleRowClick = (event) => {
        const rowEl = event.target.closest("tr");
        if (!rowEl || rowEl.__rowIndex === void 0) return;
        const idx = rowEl.__rowIndex;
        const selected = this._state.selected;
        if (selectable === "single") {
          const was = selected.has(idx);
          selected.clear();
          if (!(was && (event.metaKey || event.ctrlKey))) selected.add(idx);
          else DESELECTING_CLICKS.add(event);
          this._state.anchorIndex = selected.size ? idx : null;
        } else if (event.shiftKey && this._state.anchorIndex != null) {
          const start = Math.min(this._state.anchorIndex, idx);
          const end = Math.max(this._state.anchorIndex, idx);
          selected.clear();
          for (let i = start; i <= end; i++) selected.add(i);
        } else if (event.metaKey || event.ctrlKey) {
          if (selected.has(idx)) selected.delete(idx);
          else selected.add(idx);
          this._state.anchorIndex = idx;
        } else {
          selected.clear();
          selected.add(idx);
          this._state.anchorIndex = idx;
        }
        this._updateRowSelection();
        this._notifySelectionChange();
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
      };
      tbody.addEventListener("click", handleRowClick);
      this._disposers.push(() => tbody.removeEventListener("click", handleRowClick));
    }
    if (typeof this.config.onRowActivate === "function") {
      this._installActivation(tbody, table);
    }
    if (this._detailOn()) {
      const onDetailKey = (ev) => {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
        const toggle = ev.target?.closest?.(".twm-dt-detail-toggle");
        let tr = null;
        if (toggle && table.contains(toggle)) tr = toggle.closest("tr");
        else if (ev.target === table) tr = this._currentRowEl();
        if (!tr || tr.__rowIndex === void 0) return;
        if (this._setRowElExpanded(tr, ev.key === "ArrowRight", ev)) ev.preventDefault();
      };
      table.addEventListener("keydown", onDetailKey);
      this._disposers.push(() => table.removeEventListener("keydown", onDetailKey));
    }
    if (copyable) {
      const handleContextMenu = (event) => {
        const rowEl = event.target.closest("tr");
        if (!rowEl) {
          this._hideContextMenu();
          return;
        }
        if (rowEl.closest(".twm-dt-detail-row")) {
          this._hideContextMenu();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const idx = rowEl.__rowIndex;
        if (idx !== void 0 && !this._state.selected.has(idx)) {
          this._state.selected.clear();
          this._state.selected.add(idx);
          this._state.anchorIndex = idx;
          this._updateRowSelection();
          this._notifySelectionChange();
        }
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
        setTimeout(() => this._showContextMenu(event.clientX, event.clientY), 0);
      };
      tbody.addEventListener("contextmenu", handleContextMenu);
      this._disposers.push(() => tbody.removeEventListener("contextmenu", handleContextMenu));
      const handleKeyDown = (event) => {
        const ctrlLike = event.ctrlKey || event.metaKey;
        if (ctrlLike && !event.altKey) {
          const key = String(event.key || "").toLowerCase();
          if (key === "a" && selectable === "single") {
            event.preventDefault();
          } else if (key === "a" && selectable) {
            event.preventDefault();
            this._state.selected.clear();
            const indexMap = this._processedIndexMap;
            if (indexMap) {
              for (const originalIdx of indexMap) {
                this._state.selected.add(originalIdx);
              }
            } else {
              for (let i = 0; i < this.config.rows.length; i++) {
                this._state.selected.add(i);
              }
            }
            this._state.anchorIndex = this.config.rows.length - 1;
            this._updateRowSelection();
            this._notifySelectionChange();
          } else if (key === "c") {
            event.preventDefault();
            this.copyToClipboard(event.shiftKey ? "csv" : "tsv");
          }
        } else if (event.key === "Escape") {
          if (this._state.selected.size) {
            this.clearSelection();
          }
          this._hideContextMenu();
        }
      };
      table.addEventListener("keydown", handleKeyDown);
      this._disposers.push(() => table.removeEventListener("keydown", handleKeyDown));
    }
  }
  _updateRowSelection() {
    if (!this._tbodyEl) return;
    this._tbodyEl.querySelectorAll("tr").forEach((tr) => {
      const idx = tr.__rowIndex;
      if (idx !== void 0) {
        tr.classList.toggle("selected", this._state.selected.has(idx));
      }
    });
  }
  _notifySelectionChange() {
    this.config.onSelectionChange?.(this.getSelection());
  }
  _ensureContextMenu() {
    if (this._contextMenuEl) return this._contextMenuEl;
    const menu = document.createElement("div");
    menu.className = "twm-context-menu data-context-menu";
    menu.style.display = "none";
    menu.style.position = "fixed";
    menu.style.zIndex = "10001";
    menu.innerHTML = `
            <div class="twm-context-menu-item" data-action="copy-tsv">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="label">Copy Row(s)</span>
            </div>
            <div class="twm-context-menu-item" data-action="copy-csv">
                <span class="material-symbols-outlined">table</span>
                <span class="label">Copy as CSV</span>
            </div>
        `;
    document.body.appendChild(menu);
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".twm-context-menu-item");
      if (!item || item.classList.contains("disabled")) return;
      const action = item.getAttribute("data-action");
      if (action === "copy-tsv") this.copyToClipboard("tsv");
      else if (action === "copy-csv") this.copyToClipboard("csv");
      event.stopPropagation();
      event.preventDefault();
    }, { capture: true });
    menu.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this._contextMenuEl = menu;
    return menu;
  }
  /**
   * The document-level listeners that close the copy menu — a click
   * elsewhere, a scroll, Escape, a resize — held ONLY WHILE IT IS OPEN
   * (0.5.0). They were installed the first time the menu was built and kept
   * until `dispose()`, so every table anybody had ever right-clicked kept four
   * listeners on the document for as long as the instance lived, and an
   * instance whose host was thrown away without a `dispose()` kept them for
   * the life of the page. A closed menu has nothing for them to do.
   */
  _armContextMenuGlobals() {
    if (this._contextMenuGlobals.length) return;
    const menu = this._contextMenuEl;
    const hideOnGlobal = (event) => {
      if (event?.target && menu?.contains(event.target)) return;
      this._hideContextMenu();
    };
    const hideOnEscape = (event) => {
      if (event.key === "Escape") this._hideContextMenu();
    };
    const hideOnResize = () => this._hideContextMenu();
    document.addEventListener("click", hideOnGlobal, true);
    document.addEventListener("scroll", hideOnGlobal, true);
    window.addEventListener("resize", hideOnResize);
    document.addEventListener("keydown", hideOnEscape);
    this._contextMenuGlobals.push(() => document.removeEventListener("click", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("scroll", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("keydown", hideOnEscape));
    this._contextMenuGlobals.push(() => window.removeEventListener("resize", hideOnResize));
  }
  _disarmContextMenuGlobals() {
    this._contextMenuGlobals.forEach((off) => {
      try {
        off?.();
      } catch (_) {
      }
    });
    this._contextMenuGlobals = [];
  }
  _hideContextMenu() {
    if (this._contextMenuEl) {
      this._contextMenuEl.style.display = "none";
    }
    this._disarmContextMenuGlobals();
  }
  _showContextMenu(clientX, clientY) {
    const menu = this._ensureContextMenu();
    this._armContextMenuGlobals();
    const hasSelection = this._state.selected.size > 0;
    menu.querySelectorAll(".twm-context-menu-item").forEach((item) => {
      item.classList.toggle("disabled", !hasSelection);
      item.style.pointerEvents = hasSelection ? "" : "none";
    });
    menu.style.display = "block";
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - 8;
    }
    if (top + rect.height > window.innerHeight) {
      top = window.innerHeight - rect.height - 8;
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  _teardownContextMenu() {
    this._contextMenuGlobals.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
    });
    this._contextMenuGlobals = [];
    if (this._contextMenuEl?.parentNode) {
      this._contextMenuEl.parentNode.removeChild(this._contextMenuEl);
    }
    this._contextMenuEl = null;
  }
  _formatValue(value, colIndex) {
    if (value == null && this.config.nullDisplay != null) {
      return String(this.config.nullDisplay);
    }
    const typed = this._formatTyped(value, colIndex);
    if (typed !== void 0) return typed;
    if (this.config.formatValue) {
      return this.config.formatValue(value, colIndex);
    }
    if (value === void 0 || value === null) return "-";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "-";
      return Number(value.toFixed(4)).toString();
    }
    return String(value);
  }
  _csvEscape(value) {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
  _fallbackCopy(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (_) {
      return false;
    }
  }
  _notify(title, message, type = "info") {
    this.config.services?.eventBus?.emit?.("toast:show", { title, message, type });
  }
};

export {
  createRafResizeObserver,
  ISO_DATE,
  ISO_DATETIME,
  parseDateValue,
  formatDate,
  parseDatePeriod,
  parseDuration,
  formatDuration,
  matchDateFilter,
  matchDurationFilter,
  createChipsFilter,
  PAGING_HARD_LIMIT,
  PAGING_SOFT_LIMIT,
  resolvePaging,
  DataTable
};
//# sourceMappingURL=chunk-JLCJWCRS.js.map
