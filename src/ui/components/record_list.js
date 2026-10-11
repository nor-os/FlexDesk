/**
 * record_list.js — A READ-ONLY LIST OF RECORDS, each drawn as two lines: a
 * name, and under it a quiet line of facts; beside them pills and verbs.
 * (0.7.0)
 *
 *     ┌────────────────────────────────────────────────────────────────────┐
 *     │ ETL loader                                    [paused]  Resume  Revoke │
 *     │ tblk_8f2 — acts with the account — last used 5 Oct                 │
 *     │ Resume: This key is revoked, and revoking cannot be undone.        │
 *     └────────────────────────────────────────────────────────────────────┘
 *
 * It is the shape an administration screen reaches for when a table would
 * be wrong: few records, each with its own verbs, read top to bottom rather
 * than sorted and filtered. Before this component every consumer built it by
 * hand, row by row, and each copy grew its own post-build loop to put a key
 * or a state on the row afterwards. Here the record's key, its classes and
 * its attributes are declared, and the list owns the rest.
 *
 * WHAT A RECORD SAYS ABOUT ITSELF (`describe(record, idx)`, or the record
 * itself when there is no `describe`):
 *
 *     {
 *       name:   'ETL loader' | Node,           the first line
 *       mono:   true,                          the name in the monospace face
 *       facts:  ['tblk_8f2', null, 'last used 5 Oct'] | 'text' | Node,
 *                                              the quiet line; null/'' parts
 *                                              are left out, the rest joined
 *                                              with `factSeparator`
 *       pills:  ['paused', {text: 'URL', tone: 'danger', title: '…'}],
 *       verbs:  [{label: 'Resume', onClick(record, ev), refusal: '…' | null,
 *                 danger, primary, icon, title, name}],
 *       state:  'paused' | 'off' | 'dead' | 'error' | 'active' | any word —
 *               `data-state` and `twm-record--state-<word>` on the row,
 *       error:  'The last delivery failed: 503' | Node,   a line in the error colour
 *       key:    'k-1',                         overrides `getKey`
 *     }
 *
 * A REFUSED VERB IS A DISABLED BUTTON AND A SENTENCE ON THE SCREEN. The
 * reason is on the button's `title` and `data-refusal` too, but a reason only
 * on a tooltip reads as "the button does nothing" — nobody hovers a button
 * they believe they have just pressed. So each distinct reason is a line of
 * its own under the facts, named by the verbs it refuses
 * (`data-refusal-for`), and the button is `aria-describedby` that line.
 *
 * OPENING A RECORD (`onActivate`) follows DataTable's `onRowActivate` rule,
 * from the same module (`row_activation.js`): a press on a control in the
 * row is that control's, a click that ends a drag selecting text opens
 * nothing, and neither does the second click of a double-click.
 *
 * THE KEYBOARD. With `onActivate` (or `keyboard: true`) the RECORDS are one
 * tab stop — the one last focused, else the open one, else the first — and
 * each enabled verb keeps its own, so every verb is reachable by Tab.
 * ArrowUp/ArrowDown move between records (from a record or from one of its
 * verbs), Home/End go to the ends, and Enter on a record opens it. Enter on a
 * verb is the verb's.
 */
import { isRowActivation, isRowControl } from './row_activation.js';

/** A field, a select or editable text keeps its own arrow keys. */
const OWN_ARROWS = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';

/** The words a tone may be, after sanitising (`[^\w-]` dropped). */
const safeWord = (s) => String(s).replace(/[^\w-]/g, '');

let SEQ = 0;

/**
 * @typedef {Object} RecordVerb
 * @property {string} label - The button's words.
 * @property {Function} [onClick] - `(record, ev) => void`.
 * @property {string|null} [refusal] - Why it cannot be pressed. A disabled
 *   button, and the sentence drawn under the record's facts.
 * @property {boolean} [danger]
 * @property {boolean} [primary]
 * @property {string} [icon] - A Material Symbols name, drawn before the label.
 * @property {string} [title] - A tooltip, for a verb that is NOT refused.
 * @property {string} [name] - A stable id: `data-verb`, and what focus is
 *   restored to after a redraw. Defaults to the label.
 */

/**
 * @typedef {Object} RecordListConfig
 * @property {Array} [records=[]]
 * @property {Function} [describe] - `(record, idx) => spec`. Without it the
 *   record is its own spec.
 * @property {Function} [getKey] - `(record, idx) => string|number`. Defaults to
 *   `spec.key`, then `record.key`, then `record.id`, then the index.
 * @property {Function} [onActivate] - `(record, idx, ev) => void`. Opens a record.
 * @property {string|string[]} [activateOn=['click','enter']] - `'click'`,
 *   `'dblclick'`, `'enter'`, or several.
 * @property {boolean} [keyboard] - Arrow keys between records. Defaults to on
 *   exactly when `onActivate` is set.
 * @property {*} [activeKey] - The record that is open: `twm-record--active`
 *   and `aria-current="true"`.
 * @property {Function} [rowClass] - `(record, idx) => string|string[]|null`.
 * @property {Function} [rowAttrs] - `(record, idx) => {name: value}`;
 *   `null`/`false` leaves one off, `true` sets it empty.
 * @property {string|Node|Function} [emptyState] - Shown when there are no
 *   records. A function is called with no arguments and may return either.
 * @property {string} [factSeparator=' — ']
 * @property {'wrap'|'ellipsis'} [facts='wrap'] - How a long fact line ends.
 *   `'ellipsis'` keeps it to one line and puts the whole line on `title`.
 * @property {string|Function} [verbClass] - The verbs' class names, or
 *   `(verb) => string`, for a consumer with its own buttons. Defaults to
 *   FlexDesk's `twm-btn` with `--primary`/`--danger`.
 * @property {string} [label] - The list's accessible name (`aria-label`).
 * @property {string} [className] - Added to the root.
 */

export class RecordList {
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
            activateOn: ['click', 'enter'],
            keyboard: undefined,
            activeKey: null,
            rowClass: null,
            rowAttrs: null,
            emptyState: null,
            factSeparator: ' — ',
            facts: 'wrap',
            verbClass: null,
            label: null,
            className: null,
            ...config,
        };
        this._records = Array.isArray(this.config.records) ? this.config.records.slice() : [];
        this._activeKey = this.config.activeKey ?? null;
        this._tabKey = null;
        this._items = new Map();   // key → <li>
        this._disposed = false;
        this._id = `twm-record-list-${++SEQ}`;

        const root = document.createElement('div');
        root.className = 'twm-record-list'
            + (this.config.facts === 'ellipsis' ? ' twm-record-list--clip' : '')
            + (this._activates() ? ' twm-record-list--clickable' : '')
            + (this.config.className ? ` ${this.config.className}` : '');
        const list = document.createElement('ul');
        list.className = 'twm-record-list__items';
        if (this.config.label) list.setAttribute('aria-label', this.config.label);
        root.appendChild(list);
        this.element = root;
        this.listElement = list;

        this._onClick = (ev) => this._gesture(ev, 'click');
        this._onDblClick = (ev) => this._gesture(ev, 'dblclick');
        this._onKeyDown = (ev) => this._key(ev);
        // Only focus ON a record moves the tab stop. Focus on one of its verbs
        // must not: Tab walks forward through the verbs of the records before
        // the stop, and moving the stop behind the focus would leave no record
        // ahead to Tab to (measured in Edge).
        this._onFocusIn = (ev) => {
            const li = this._itemOf(ev.target);
            if (li && ev.target === li) this._setTabStop(li.__recordKey);
        };
        list.addEventListener('click', this._onClick);
        list.addEventListener('dblclick', this._onDblClick);
        list.addEventListener('keydown', this._onKeyDown);
        list.addEventListener('focusin', this._onFocusIn);

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
        if (key === undefined) { this._draw(); return; }
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
        list.removeEventListener('click', this._onClick);
        list.removeEventListener('dblclick', this._onDblClick);
        list.removeEventListener('keydown', this._onKeyDown);
        list.removeEventListener('focusin', this._onFocusIn);
        this._items.clear();
        this.element.remove();
    }

    // ── drawing ──────────────────────────────────────────────────────────

    _activates() {
        return typeof this.config.onActivate === 'function';
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
        return key === null || key === undefined ? key : String(key);
    }

    _spec(record, idx) {
        const { describe } = this.config;
        const spec = typeof describe === 'function' ? describe(record, idx) : record;
        return spec && typeof spec === 'object' ? spec : { name: spec };
    }

    _keyOf(record, idx, spec) {
        const { getKey } = this.config;
        let key;
        if (spec.key !== undefined && spec.key !== null) key = spec.key;
        else if (typeof getKey === 'function') key = getKey(record, idx);
        else if (record && typeof record === 'object' && (record.key ?? record.id) != null) key = record.key ?? record.id;
        else key = idx;
        return String(key);
    }

    _draw() {
        const focus = this._focusMemo();
        const list = this.listElement;
        list.replaceChildren();
        this._items.clear();
        this.element.querySelector(':scope > .twm-record-list__empty')?.remove();

        this._records.forEach((record, idx) => {
            const li = this._item(record, idx);
            if (this._items.has(li.__recordKey)) {
                console.error(`[RecordList] two records share the key "${li.__recordKey}"`);
            }
            this._items.set(li.__recordKey, li);
            list.appendChild(li);
        });
        this.element.classList.toggle('twm-record-list--empty', this._records.length === 0);
        if (!this._records.length) this._drawEmpty();
        this._paintTabStop();
        this._restoreFocus(focus);
    }

    _drawEmpty() {
        let content = this.config.emptyState;
        if (typeof content === 'function') content = content();
        if (content == null || content === false || content === '') return;
        const p = document.createElement('p');
        p.className = 'twm-record-list__empty';
        if (typeof Node !== 'undefined' && content instanceof Node) p.appendChild(content);
        else p.textContent = String(content);
        this.element.appendChild(p);
    }

    _item(record, idx) {
        const spec = this._spec(record, idx);
        const key = this._keyOf(record, idx, spec);
        const li = document.createElement('li');
        li.className = 'twm-record';
        li.__record = record;
        li.__recordIndex = idx;
        li.__recordKey = key;
        li.dataset.recordKey = key;
        if (this._keyboard()) li.tabIndex = -1;
        if (spec.state) {
            li.dataset.state = safeWord(spec.state);
            li.classList.add(`twm-record--state-${safeWord(spec.state)}`);
        }

        const main = document.createElement('div');
        main.className = 'twm-record__main';
        const name = document.createElement('div');
        name.className = 'twm-record__name' + (spec.mono ? ' twm-record__name--mono' : '');
        appendContent(name, spec.name);
        main.appendChild(name);

        const factsText = this._facts(spec.facts);
        if (factsText !== null) {
            const facts = document.createElement('div');
            facts.className = 'twm-record__facts';
            appendContent(facts, factsText);
            if (this.config.facts === 'ellipsis') facts.title = facts.textContent;
            main.appendChild(facts);
        }
        if (spec.error != null && spec.error !== false && spec.error !== '') {
            const err = document.createElement('div');
            err.className = 'twm-record__error';
            appendContent(err, spec.error);
            main.appendChild(err);
        }
        li.appendChild(main);

        const pills = (spec.pills || []).filter((p) => p != null && p !== false && p !== '');
        if (pills.length) {
            const box = document.createElement('div');
            box.className = 'twm-record__pills';
            for (const p of pills) box.appendChild(pill(p));
            li.appendChild(box);
        }

        const verbs = (spec.verbs || []).filter(Boolean);
        if (verbs.length) {
            const box = document.createElement('div');
            box.className = 'twm-record__verbs';
            const reasons = new Map();   // sentence → [labels]
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
                const lines = document.createElement('div');
                lines.className = 'twm-record__refusals';
                let n = 0;
                for (const [said, { labels, buttons }] of reasons) {
                    const line = document.createElement('div');
                    line.className = 'twm-record__refusal';
                    line.id = `${this._id}-r${idx}-${n++}`;
                    line.dataset.refusalFor = labels.join(', ');
                    line.textContent = labels.length === verbs.length && verbs.length > 1
                        ? said : `${labels.join(', ')}: ${said}`;
                    for (const b of buttons) b.setAttribute('aria-describedby', line.id);
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
        if (typeof Node !== 'undefined' && facts instanceof Node) return facts;
        if (!Array.isArray(facts)) {
            const s = String(facts);
            return s === '' ? null : s;
        }
        const parts = facts.filter((f) => f != null && f !== false && f !== '');
        if (!parts.length) return null;
        if (parts.every((p) => !(typeof Node !== 'undefined' && p instanceof Node))) {
            return parts.map(String).join(this.config.factSeparator);
        }
        const frag = document.createDocumentFragment();
        parts.forEach((p, i) => {
            if (i) frag.appendChild(document.createTextNode(this.config.factSeparator));
            appendContent(frag, p);
        });
        return frag;
    }

    _verb(v, record) {
        const b = document.createElement('button');
        b.type = 'button';
        const { verbClass } = this.config;
        b.className = typeof verbClass === 'function' ? String(verbClass(v) || '')
            : typeof verbClass === 'string' ? verbClass
                : 'twm-btn' + (v.primary ? ' twm-btn--primary' : '') + (v.danger ? ' twm-btn--danger' : '');
        b.classList.add('twm-record__verb');
        b.dataset.verb = String(v.name ?? v.label);
        if (v.icon) {
            const glyph = document.createElement('span');
            glyph.className = 'material-symbols-outlined twm-record__verb-icon';
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = String(v.icon);
            b.appendChild(glyph);
        }
        const label = document.createElement('span');
        label.className = 'twm-record__verb-label';
        label.textContent = String(v.label ?? '');
        b.appendChild(label);
        if (v.refusal) {
            b.disabled = true;
            b.title = String(v.refusal);
            b.dataset.refusal = String(v.refusal);
        } else {
            if (v.title) b.title = String(v.title);
            if (typeof v.onClick === 'function') b.addEventListener('click', (ev) => v.onClick(record, ev));
        }
        return b;
    }

    _decorate(li, record, idx) {
        const { rowClass, rowAttrs } = this.config;
        if (typeof rowClass === 'function') {
            const c = rowClass(record, idx);
            const list = Array.isArray(c) ? c : String(c ?? '').split(/\s+/);
            for (const name of list) if (name) li.classList.add(String(name));
        }
        if (typeof rowAttrs === 'function') {
            for (const [name, value] of Object.entries(rowAttrs(record, idx) || {})) {
                if (value == null || value === false) continue;
                try {
                    li.setAttribute(name, value === true ? '' : String(value));
                } catch (err) {
                    console.error(`[RecordList] rowAttrs: bad attribute "${name}"`, err);
                }
            }
        }
        this._paintActive(li);
    }

    _paintActive(li) {
        const on = this._activeKey !== null && li.__recordKey === this._norm(this._activeKey);
        li.classList.toggle('twm-record--active', on);
        if (on) {
            if (li.getAttribute('aria-current') !== 'true') {
                li.setAttribute('aria-current', 'true');
                li.__twmAriaCurrent = true;
            }
        } else if (li.__twmAriaCurrent) {
            li.__twmAriaCurrent = false;
            li.removeAttribute('aria-current');
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
            key = active !== null && this._items.has(active) ? active : (this._items.keys().next().value ?? null);
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
        return { key: li.__recordKey, verb: active.closest('.twm-record__verb')?.dataset.verb ?? null };
    }

    _restoreFocus(memo) {
        if (!memo) return;
        const li = this._items.get(memo.key);
        if (!li) return;
        if (memo.verb !== null) {
            const b = [...li.querySelectorAll('.twm-record__verb')].find((x) => x.dataset.verb === memo.verb);
            if (b && !b.disabled) { b.focus(); return; }
        }
        if (this._keyboard()) { this._setTabStop(li.__recordKey); li.focus(); }
    }

    _itemOf(target) {
        const li = target?.closest?.('.twm-record');
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
        if (ev.key === 'Enter') {
            // Enter on a verb is the verb's; only Enter on the record itself opens it.
            if (ev.target !== li || !this._activates() || !this._gestures().has('enter')) return;
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
        if (ev.key === 'ArrowDown') next = items[Math.min(items.length - 1, at + 1)];
        else if (ev.key === 'ArrowUp') next = items[Math.max(0, at - 1)];
        else if (ev.key === 'Home') next = items[0];
        else if (ev.key === 'End') next = items[items.length - 1];
        else return;
        ev.preventDefault();
        if (next) {
            this._setTabStop(next.__recordKey);
            next.focus();
        }
    }
}

/**
 * Build a record list, append it to `host` (if given) and draw it.
 *
 * @param {HTMLElement|null} host
 * @param {RecordListConfig} [config]
 * @returns {RecordList}
 */
export function createRecordList(host, config = {}) {
    return new RecordList(host, config);
}

/** One pill: a string, or `{text, tone, title}`. A tone is a word
 *  (`muted`, `info`, `success`, `warn`, `danger` are drawn). */
function pill(p) {
    const s = typeof p === 'object' && !(typeof Node !== 'undefined' && p instanceof Node) ? p : { text: p };
    const span = document.createElement('span');
    span.className = 'twm-record__pill' + (s.tone ? ` twm-record__pill--${safeWord(s.tone)}` : '');
    if (typeof Node !== 'undefined' && s.text instanceof Node) span.appendChild(s.text);
    else if (typeof Node !== 'undefined' && p instanceof Node) span.appendChild(p);
    else span.textContent = String(s.text ?? '');
    if (s.title) span.title = String(s.title);
    if (s.tone) span.dataset.tone = safeWord(s.tone);
    return span;
}

/** Text, a node or nothing, into `el`. */
function appendContent(el, content) {
    if (content == null || content === false) return;
    if (typeof Node !== 'undefined' && content instanceof Node) el.appendChild(content);
    else el.appendChild(document.createTextNode(String(content)));
}
