import {
  openConfirm,
  openForm,
  openModal
} from "./chunk-YSKQQDHC.js";
import {
  ManagedWindow
} from "./chunk-WQIGN7L3.js";

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

// src/ui/components/confirm_dialog.js
var dialogIdCounter = 0;
async function showConfirmDialog(options = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    icon = "warning",
    okLabel = "OK",
    cancelLabel = "Cancel",
    okVariant = "primary"
  } = options;
  return openConfirm({
    title,
    message,
    icon,
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
    icon = "warning",
    actions = []
  } = options;
  const content = document.createElement("div");
  content.className = "twm-confirm-dialog__body";
  content.innerHTML = `
        <span class="twm-confirm-dialog__icon material-symbols-outlined">${escapeHtml(icon)}</span>
        <div class="twm-confirm-dialog__message">${escapeHtml(message)}</div>
    `;
  return openModal({
    title,
    icon,
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
    // BUG-0053. Focus goes to the window, never to Stop or Cancel: a stray
    // Enter or Space would cancel the run.
    focusOnOpen: "window",
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

export {
  PROGRESS_STATES,
  PROGRESS_ITEM_STATES,
  STEP_STATES,
  formatElapsed,
  ProgressBar,
  ProgressList,
  StepProgress,
  mountJobProgress,
  showConfirmDialog,
  showDeleteConfirmDialog,
  showCloseConfirmDialog,
  showChoiceDialog,
  showSelectDialog,
  showRunProgressDialog,
  setToastBus,
  getToastBus,
  toastError,
  toastWarn,
  toastInfo,
  toastSuccess,
  reportBridgeError
};
//# sourceMappingURL=chunk-Y2JHFPBT.js.map
