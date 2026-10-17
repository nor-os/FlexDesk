/**
 * Determinate progress: a bar, a keyed list of bars, and a row of phases.
 * Location: ui/components/progress.js
 *
 * Three primitives for long-running jobs, each a class that owns its own DOM
 * and changes it IN PLACE — a caller that reports progress twenty times a
 * second gets the same elements back every time, so a row it is hovering, a
 * tooltip anchored to it and a CSS transition on the fill all survive.
 *
 *   ProgressBar    value/max or a 0..1 fraction, indeterminate, a label, a
 *                  percent and a count readout, elapsed time, a cancel button,
 *                  and a final state (done / error / cancelled).
 *   ProgressList   keyed rows `{ key, name, completed, total?, state }`;
 *                  `setItems` reconciles by key. A row without `total` is
 *                  drawn against the largest item in the list.
 *   StepProgress   ordered phases, each done / active / pending / error, the
 *                  active one optionally reading "pass n of m".
 *
 * Nothing here knows what is being computed: names, labels and the stats line
 * are the caller's text, always set with `textContent`. State lives on the
 * instances; the DOM carries only classes and ARIA.
 */

/** The states a ProgressBar can end in, besides `running`. */
export const PROGRESS_STATES = Object.freeze(['running', 'done', 'error', 'cancelled']);

/** The states a ProgressList row can be in. */
export const PROGRESS_ITEM_STATES = Object.freeze(['pending', 'running', 'done', 'failed']);

/** The states a StepProgress phase can be in. */
export const STEP_STATES = Object.freeze(['pending', 'active', 'done', 'error']);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatElapsed(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** Set text only when it changed, so an unchanged readout is not a mutation. */
function setText(node, text) {
    const t = text == null ? '' : String(text);
    if (node.textContent !== t) node.textContent = t;
}

function setWidth(node, fraction) {
    const w = `${(clamp01(fraction) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
    if (node.style.width !== w) node.style.width = w;
}

// ─── ProgressBar ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ProgressBarOptions
 * @property {number} [value=0] - A count when `max` is given, else a 0..1 fraction.
 * @property {number|null} [max=null] - The count `value` runs to.
 * @property {boolean} [indeterminate=false] - Busy, with no known end.
 * @property {string} [label=''] - Text before the readout.
 * @property {boolean} [showPercent=true] - "42%".
 * @property {boolean|null} [showCount=null] - "21 / 50"; defaults to on when `max` is given.
 * @property {boolean} [showElapsed=false] - A running "m:ss" from construction until a final state.
 * @property {Function|null} [onCancel=null] - Shows a Cancel button; called once when clicked.
 * @property {string} [cancelLabel='Cancel']
 * @property {Function} [now=Date.now] - The clock, for the elapsed readout.
 * @property {string} [className] - Added to the root.
 */

export class ProgressBar {
    /**
     * @param {HTMLElement|null} host  appended to, if given
     * @param {ProgressBarOptions} [options]
     */
    constructor(host, options = {}) {
        const {
            value = 0, max = null, indeterminate = false, label = '',
            showPercent = true, showCount = null, showElapsed = false,
            onCancel = null, cancelLabel = 'Cancel', now = Date.now, className = '',
        } = options;
        this._value = isNum(value) ? value : 0;
        this._max = isNum(max) && max > 0 ? max : null;
        this._indeterminate = !!indeterminate;
        this._label = label || '';
        this._showPercent = showPercent !== false;
        this._showCount = showCount;
        this._showElapsed = !!showElapsed;
        this._state = 'running';
        this._now = typeof now === 'function' ? now : Date.now;
        this._started = this._now();
        this._stopped = null;
        this._timer = null;
        this._onCancel = typeof onCancel === 'function' ? onCancel : null;

        const root = el('div', `twm-progress${className ? ` ${className}` : ''}`);
        const head = el('div', 'twm-progress__head');
        this._labelEl = el('span', 'twm-progress__label');
        this._readoutEl = el('span', 'twm-progress__readout');
        head.append(this._labelEl, this._readoutEl);
        if (this._showElapsed) {
            this._elapsedEl = el('span', 'twm-progress__elapsed');
            head.appendChild(this._elapsedEl);
            this._startTimer();
        } else {
            this._elapsedEl = null;
        }
        if (this._onCancel) {
            const btn = el('button', 'twm-progress__cancel', cancelLabel);
            btn.type = 'button';
            btn.addEventListener('click', () => {
                if (btn.disabled || this._state !== 'running') return;
                btn.disabled = true;
                this._onCancel();
            });
            this._cancelBtn = btn;
            head.appendChild(btn);
        } else {
            this._cancelBtn = null;
        }
        this._track = el('div', 'twm-progress__track');
        this._track.setAttribute('role', 'progressbar');
        this._fill = el('div', 'twm-progress__fill');
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
    get state() { return this._state; }

    /** Milliseconds since construction, frozen at the final state. */
    get elapsed() { return (this._stopped ?? this._now()) - this._started; }

    /**
     * Change the bar in place. A number is the new value (a count with `max`,
     * else a fraction); an object may carry `value`, `max`, `label` and
     * `indeterminate`. Ignored once the bar is in a final state.
     */
    update(next) {
        if (this._state !== 'running') return this;
        const o = isNum(next) ? { value: next } : (next || {});
        if ('max' in o) this._max = isNum(o.max) && o.max > 0 ? o.max : null;
        if (isNum(o.value)) { this._value = o.value; if (!('indeterminate' in o)) this._indeterminate = false; }
        if ('indeterminate' in o) this._indeterminate = !!o.indeterminate;
        if ('label' in o) this._label = o.label || '';
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
        if (label !== undefined) this._label = label || '';
        if (state === 'done') { this._indeterminate = false; this._value = this._max ?? 1; }
        if (state === 'running') {
            this._stopped = null;
            if (this._showElapsed) this._startTimer();
        } else {
            this._stopped = this._now();
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }
        if (this._cancelBtn) this._cancelBtn.disabled = state !== 'running';
        this._draw();
        this._drawElapsed();
        return this;
    }

    /** Tick the elapsed readout once a second, unless it already ticks. */
    _startTimer() {
        if (!this._timer) this._timer = setInterval(() => this._drawElapsed(), 1000);
    }

    /** Stop the elapsed clock and detach. */
    dispose() {
        this._showElapsed = false;
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this.element.remove();
    }

    _draw() {
        const root = this.element;
        for (const s of PROGRESS_STATES) {
            root.classList.toggle(`twm-progress--${s}`, this._state === s);
        }
        root.classList.toggle('twm-progress--indeterminate', this._indeterminate);
        setText(this._labelEl, this._label);
        const f = this.fraction;
        const parts = [];
        if (f !== null) {
            if (this._showPercent) parts.push(`${Math.floor(f * 100)}%`);
            const count = this._showCount ?? !!this._max;
            if (count && this._max) parts.push(`${fmtCount(this._value)} / ${fmtCount(this._max)}`);
        }
        setText(this._readoutEl, parts.join(' · '));
        if (f === null) {
            if (this._fill.style.width) this._fill.style.width = '';
            this._track.removeAttribute('aria-valuenow');
        } else {
            setWidth(this._fill, f);
            this._track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
        }
        this._track.setAttribute('aria-valuemin', '0');
        this._track.setAttribute('aria-valuemax', '100');
        if (this._label) this._track.setAttribute('aria-label', this._label);
        this._drawElapsed();
    }

    _drawElapsed() {
        if (this._elapsedEl) setText(this._elapsedEl, formatElapsed(this.elapsed));
    }
}

function fmtCount(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ─── ProgressList ────────────────────────────────────────────────────────

/**
 * @typedef {Object} ProgressItem
 * @property {string|number} key - Identity across `setItems` calls.
 * @property {string} [name] - Shown as the row's label; defaults to the key.
 * @property {number} [completed=0]
 * @property {number} [total] - Absent: the row is drawn against the largest item.
 * @property {'pending'|'running'|'done'|'failed'} [state='pending']
 * @property {string} [detail] - Extra text after the count.
 */

/**
 * @typedef {Object} ProgressListOptions
 * @property {ProgressItem[]} [items=[]]
 * @property {boolean|Function} [stats=true] - The line under the rows: `true`
 *   for the default summary, `false` for none, or `(items) => string`.
 * @property {boolean} [pulse=true] - Running rows pulse.
 * @property {string} [emptyText=''] - Shown when there are no items.
 * @property {string} [className] - Added to the root.
 */

export class ProgressList {
    /**
     * @param {HTMLElement|null} host  appended to, if given
     * @param {ProgressListOptions} [options]
     */
    constructor(host, options = {}) {
        const { items = [], stats = true, pulse = true, emptyText = '', className = '' } = options;
        this._stats = stats;
        this._emptyText = emptyText;
        /** @type {Map<string, {item: ProgressItem, row: HTMLElement, name: HTMLElement, fill: HTMLElement, count: HTMLElement, state: HTMLElement}>} */
        this._rows = new Map();
        this._items = [];
        const root = el('div', `twm-progress-list${pulse ? ' twm-progress-list--pulse' : ''}${className ? ` ${className}` : ''}`);
        this._listEl = el('div', 'twm-progress-list__rows');
        this._listEl.setAttribute('role', 'list');
        this._emptyEl = el('div', 'twm-progress-list__empty');
        this._statsEl = el('div', 'twm-progress-list__stats');
        root.append(this._listEl, this._emptyEl, this._statsEl);
        this.element = root;
        this.setItems(items);
        if (host) host.appendChild(root);
    }

    /** The items last given, in order. */
    get items() { return this._items.slice(); }

    /**
     * Reconcile the rows with `items` by key: a known key keeps its row and
     * has its text, width and state changed in place; a new key gets a row; a
     * key that is gone loses its row. Rows follow the order given, and a row
     * already in its place is not moved.
     */
    setItems(items) {
        const list = Array.isArray(items) ? items : [];
        const seen = new Set();
        this._items = [];
        for (const it of list) {
            if (!it || it.key == null) continue;
            const k = String(it.key);
            if (seen.has(k)) continue;
            seen.add(k);
            this._items.push(it);
        }
        for (const [k, r] of this._rows) {
            if (!seen.has(k)) { r.row.remove(); this._rows.delete(k); }
        }
        const scale = this._items.reduce((m, it) => {
            const d = isNum(it.total) && it.total > 0 ? it.total : (isNum(it.completed) ? it.completed : 0);
            return d > m ? d : m;
        }, 0);
        let prev = null;
        for (const it of this._items) {
            const k = String(it.key);
            let r = this._rows.get(k);
            if (!r) { r = this._makeRow(); this._rows.set(k, r); }
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
    rowFor(key) { return this._rows.get(String(key))?.row ?? null; }

    dispose() { this.element.remove(); this._rows.clear(); }

    _makeRow() {
        const row = el('div', 'twm-progress-list__row');
        row.setAttribute('role', 'listitem');
        const name = el('span', 'twm-progress-list__name');
        const track = el('div', 'twm-progress-list__track');
        const fill = el('div', 'twm-progress-list__fill');
        track.appendChild(fill);
        const count = el('span', 'twm-progress-list__count');
        const state = el('span', 'twm-progress-list__state');
        row.append(state, name, track, count);
        return { row, name, fill, count, state };
    }

    _drawRow(r, it, scale) {
        const state = PROGRESS_ITEM_STATES.includes(it.state) ? it.state : 'pending';
        for (const s of PROGRESS_ITEM_STATES) {
            r.row.classList.toggle(`twm-progress-list__row--${s}`, s === state);
        }
        const done = isNum(it.completed) ? it.completed : 0;
        const hasTotal = isNum(it.total) && it.total > 0;
        const denom = hasTotal ? it.total : scale;
        setWidth(r.fill, denom > 0 ? done / denom : 0);
        setText(r.name, it.name ?? String(it.key));
        const count = hasTotal ? `${fmtCount(done)} / ${fmtCount(it.total)}` : fmtCount(done);
        setText(r.count, it.detail ? `${count} · ${it.detail}` : count);
        if (r.state.title !== state) r.state.title = state;
    }

    _statsLine() {
        if (this._stats === false) return '';
        if (typeof this._stats === 'function') return String(this._stats(this.items) ?? '');
        if (!this._items.length) return '';
        const n = { done: 0, running: 0, failed: 0, pending: 0 };
        let completed = 0;
        for (const it of this._items) {
            n[PROGRESS_ITEM_STATES.includes(it.state) ? it.state : 'pending'] += 1;
            if (isNum(it.completed)) completed += it.completed;
        }
        const parts = [`${n.done} / ${this._items.length} done`];
        if (n.running) parts.push(`${n.running} running`);
        if (n.failed) parts.push(`${n.failed} failed`);
        if (n.pending) parts.push(`${n.pending} pending`);
        parts.push(`${fmtCount(completed)} completed`);
        return parts.join(' · ');
    }
}

// ─── StepProgress ────────────────────────────────────────────────────────

/**
 * @typedef {Object} StepDef
 * @property {string} [key] - How `setStep` names it; defaults to its index.
 * @property {string} label
 */

export class StepProgress {
    /**
     * @param {HTMLElement|null} host  appended to, if given
     * @param {{ steps?: Array<StepDef|string>, className?: string }} [options]
     */
    constructor(host, options = {}) {
        const { steps = [], className = '' } = options;
        const root = el('ol', `twm-steps${className ? ` ${className}` : ''}`);
        this.element = root;
        this._steps = steps.map((s, i) => {
            const def = typeof s === 'string' ? { label: s } : (s || {});
            const li = el('li', 'twm-steps__step');
            const marker = el('span', 'twm-steps__marker');
            const label = el('span', 'twm-steps__label', def.label ?? '');
            const pass = el('span', 'twm-steps__pass');
            pass.hidden = true;
            li.append(marker, label, pass);
            root.appendChild(li);
            return { key: def.key != null ? String(def.key) : String(i), label: def.label ?? '', state: 'pending', pass: null, li, passEl: pass };
        });
        this._draw();
        if (host) host.appendChild(root);
    }

    /** `[{ key, label, state, pass }]`, in order. */
    get steps() {
        return this._steps.map(({ key, label, state, pass }) => ({ key, label, state, pass }));
    }

    /** The index of the active phase, or -1. */
    get activeIndex() { return this._steps.findIndex((s) => s.state === 'active'); }

    /**
     * Make one phase active: every phase before it is done, every phase after
     * it pending. `pass` and `passes` read "pass n of m" on it.
     * @param {string|number} which - A key, or an index.
     * @param {{ pass?: number, passes?: number }} [opts]
     */
    setStep(which, { pass, passes } = {}) {
        const i = this._index(which);
        this._steps.forEach((s, j) => {
            s.state = j < i ? 'done' : j === i ? 'active' : 'pending';
            s.pass = j === i && isNum(pass) ? { n: pass, of: isNum(passes) ? passes : null } : null;
        });
        this._draw();
        return this;
    }

    /** Mark a phase (the active one by default) as failed; phases after it stay pending. */
    fail(which) {
        const i = which === undefined ? this.activeIndex : this._index(which);
        if (i < 0) return this;
        this._steps.forEach((s, j) => {
            if (j < i) s.state = 'done';
            else if (j === i) s.state = 'error';
            else s.state = 'pending';
            if (j !== i) s.pass = null;
        });
        this._draw();
        return this;
    }

    /** Every phase done. */
    complete() {
        for (const s of this._steps) { s.state = 'done'; s.pass = null; }
        this._draw();
        return this;
    }

    dispose() { this.element.remove(); }

    _index(which) {
        const i = typeof which === 'number'
            ? which
            : this._steps.findIndex((s) => s.key === String(which));
        if (!Number.isInteger(i) || i < 0 || i >= this._steps.length) {
            throw new Error(`StepProgress: no step "${which}"`);
        }
        return i;
    }

    _draw() {
        for (const s of this._steps) {
            for (const st of STEP_STATES) s.li.classList.toggle(`twm-steps__step--${st}`, s.state === st);
            if (s.state === 'active') s.li.setAttribute('aria-current', 'step');
            else s.li.removeAttribute('aria-current');
            const text = s.pass ? (s.pass.of ? `pass ${s.pass.n} of ${s.pass.of}` : `pass ${s.pass.n}`) : '';
            s.passEl.hidden = !text;
            setText(s.passEl, text);
        }
    }
}
