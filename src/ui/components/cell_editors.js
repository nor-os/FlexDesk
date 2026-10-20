/**
 * cell_editors.js — STORY-0087. THE SIX BUILT-IN CELL EDITORS, and the parse
 * each one reads its text with.
 *
 *     text       a text box                 commits the text
 *     multitext  a text area                commits the text; Enter is a new
 *                                           line, Ctrl/Cmd+Enter commits
 *     number     a text box                 commits a Number (or null)
 *     bool       a checkbox                 commits true or false
 *     choice     an AutocompleteField over  commits one option's value (or
 *                the column's `options`     null; other text only with
 *                                           `allowOther`)
 *     datetime   a text box                 commits a Date (or null)
 *
 * Each is `{create, parse}` in `CELL_EDITORS`. `create` is an editor factory
 * as `cell_editor_host.js` takes one; `parse(text, ctx)` is the same reading
 * as plain text, for anything that has text and not an editor (a paste):
 *
 *     parse(text, { locale, utc, options, allowOther, messages })
 *         → { ok: true, value } | { ok: false, error }
 *
 * An editor built here hands the host a `parse()` of its own (what it holds,
 * read the same way): Enter and Tab commit only what parses, and a refusal
 * keeps the editor open with the message on the cell.
 *
 * NUMBER. Read by the separators of `locale` (Intl's): '1.234,56' is
 * 1234.56 under 'de-DE' and '1,234.56' is under 'en-US'. A group separator
 * is accepted only between groups of three digits in the whole part, so
 * '1.234,56' under 'en-US' is refused rather than read as 1.23456. Spaces
 * (and the no-break spaces some locales group with) are ignored; a minus may
 * be '-' or '−'.
 *
 * DATETIME. ISO 8601 ('2026-12-31', '2026-12-31T08:30', with 'Z' or an
 * offset an exact instant), or day, month and year in the order `locale`
 * writes them, separated by '/', '.' or '-', with a four-digit year and an
 * optional time ('31/12/2026 08:30'). When that order makes no date but the
 * day-month swap does ('31/12/2026' under 'en-US') the swap is read — there
 * is no other reading. A date without a zone is in the table's zone
 * (`utc`: UTC, else local).
 *
 * A value opened and left as it was commits the value the cell was given,
 * not its text read back, so opening and leaving a cell is no edit at all.
 */

import { AutocompleteField } from './autocomplete_field.js';
import { createTextEditor } from './cell_editor_host.js';

/** The refusals' words. DataTable's `editorMessages` overrides any of them. */
export const EDITOR_MESSAGES = Object.freeze({
    number: 'Not a number',
    datetime: 'Not a date',
    bool: 'Not true or false',
    choice: 'Not one of the options',
});

const ok = (value) => ({ ok: true, value });
const refuse = (ctx, type) => ({ ok: false, error: (ctx?.messages || {})[type] || EDITOR_MESSAGES[type] });
const isBlank = (text) => text == null || String(text).trim() === '';

/** The type names of the table's columns that the built-in editors answer to. */
const ALIASES = { num: 'number', date: 'datetime' };

/** The built-in editor's name for a column type: 'num' is 'number' and 'date'
 *  is 'datetime'; any other name is itself. */
export function editorTypeOf(type) {
    const t = type == null ? 'text' : String(type);
    return ALIASES[t] || t;
}

// ── number ──────────────────────────────────────────────────────────────

function safeLocale(locale) {
    if (!locale) return undefined;
    try { return Intl.NumberFormat.supportedLocalesOf(locale).length ? locale : undefined; }
    catch (_) { return undefined; }
}

/** `{group, decimal}`: the separators `locale` writes numbers with. */
export function numberSeparators(locale) {
    const parts = new Intl.NumberFormat(safeLocale(locale)).formatToParts(1234567.5);
    return {
        group: parts.find((p) => p.type === 'group')?.value ?? ',',
        decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    };
}

const SPACES = /[\s\u00a0\u202f]/g;

/** Text to a Number by `locale`'s separators; blank is null. Spaces around
 *  the text are ignored; inside it a space is a group separator only where
 *  the locale groups with one (fr-FR, sv-SE, ...) and only between groups of
 *  three digits; anywhere else it is refused. */
export function parseNumber(text, ctx = {}) {
    if (isBlank(text)) return ok(null);
    const { group, decimal } = numberSeparators(ctx.locale);
    let s = String(text).trim().replace(/\u2212/g, '-');
    let sign = '';
    if (s[0] === '-' || s[0] === '+') { sign = s[0] === '-' ? '-' : ''; s = s.slice(1); }
    const halves = s.split(decimal);
    if (halves.length > 2) return refuse(ctx, 'number');
    let [whole, frac = null] = halves;
    let exp = '';
    const tail = frac ?? whole;
    const e = /[eE][+-]?\d+$/.exec(tail);
    if (e) {
        exp = e[0];
        if (frac != null) frac = frac.slice(0, -exp.length);
        else whole = whole.slice(0, -exp.length);
    }
    const spaceGroup = group !== '' && group.replace(SPACES, '') === '';
    const g = spaceGroup ? ' ' : group;
    if (spaceGroup) whole = whole.replace(SPACES, ' ');
    if (g && whole.includes(g)) {
        const esc = g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`^\\d{1,3}(${esc}\\d{3})+$`).test(whole)) return refuse(ctx, 'number');
        whole = whole.split(g).join('');
    }
    if (!/^\d*$/.test(whole) || (frac != null && !/^\d*$/.test(frac))) return refuse(ctx, 'number');
    if (!whole && !frac) return refuse(ctx, 'number');
    const n = Number(`${sign}${whole || '0'}.${frac || '0'}${exp}`);
    return Number.isFinite(n) ? ok(n) : refuse(ctx, 'number');
}

/** A number as the editor shows it: `locale`'s decimal separator, no groups,
 *  every digit (so it reads back as itself). */
export function formatNumberForEdit(value, ctx = {}) {
    if (value == null) return '';
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
    const { decimal } = numberSeparators(ctx.locale);
    return String(value).replace('.', decimal);
}

// ── bool ────────────────────────────────────────────────────────────────

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on', 'x', '✓', '✔']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off', '']);

/** 'true', 'yes', 'y', '1', 'on', 'x' are true; 'false', 'no', 'n', '0', 'off'
 *  and blank are false (any case); anything else is refused. */
export function parseBool(text, ctx = {}) {
    if (typeof text === 'boolean') return ok(text);
    const t = String(text ?? '').trim().toLowerCase();
    if (TRUE_WORDS.has(t)) return ok(true);
    if (FALSE_WORDS.has(t)) return ok(false);
    return refuse(ctx, 'bool');
}

function truthy(value) {
    if (typeof value === 'boolean') return value;
    if (value == null) return false;
    const r = parseBool(String(value));
    return r.ok ? r.value : true;
}

// ── datetime ────────────────────────────────────────────────────────────

/** The order `locale` writes a date's parts in, e.g. ['day', 'month', 'year']. */
export function dateOrder(locale) {
    let loc;
    try { loc = Intl.DateTimeFormat.supportedLocalesOf(locale || []).length ? locale : undefined; }
    catch (_) { loc = undefined; }
    return new Intl.DateTimeFormat(loc, { year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(2026, 11, 31))
        .map((p) => p.type)
        .filter((t) => t === 'day' || t === 'month' || t === 'year');
}

function daysIn(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A Date from its parts, checked, in the table's zone (or at `offsetMin`). */
function makeDate({ y, mo, d, h = 0, mi = 0, s = 0, ms = 0 }, utc, offsetMin = null) {
    if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= daysIn(y, mo))) return null;
    if (h > 23 || mi > 59 || s > 59) return null;
    if (offsetMin != null) return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms) - offsetMin * 60000);
    if (utc) return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
    const date = new Date(y, mo - 1, d, h, mi, s, ms);
    date.setFullYear(y);   // years below 100 are not 19xx
    return date;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;
const LOCAL = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\.?(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?m?\.?)?$/i;

/** Text to a Date: ISO 8601, or `locale`'s day/month/year order; blank is null. */
export function parseDateTime(text, ctx = {}) {
    if (isBlank(text)) return ok(null);
    const t = String(text).trim();
    const iso = ISO.exec(t);
    if (iso) {
        const [, y, mo, d, h, mi, s, ms, zone] = iso;
        let offset = null;
        if (zone) {
            if (zone.toUpperCase() === 'Z') offset = 0;
            else {
                const z = zone.replace(':', '');
                offset = (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
            }
        }
        const date = makeDate({
            y: +y, mo: +mo, d: +d, h: +(h || 0), mi: +(mi || 0), s: +(s || 0),
            ms: ms ? Number(ms.padEnd(3, '0')) : 0,
        }, !!ctx.utc, offset);
        return date ? ok(date) : refuse(ctx, 'datetime');
    }
    const m = LOCAL.exec(t);
    if (!m) return refuse(ctx, 'datetime');
    const [, a, b, c, hh, mi, ss, ap] = m;
    let h = hh == null ? 0 : +hh;
    if (ap) {
        if (h < 1 || h > 12) return refuse(ctx, 'datetime');
        h = (h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0);
    }
    const time = { h, mi: +(mi || 0), s: +(ss || 0) };
    const order = dateOrder(ctx.locale);
    const nums = [a, b, c];
    const read = (ord) => {
        const at = {};
        ord.forEach((type, i) => { at[type] = nums[i]; });
        if (!at.year || at.year.length !== 4) return null;
        return makeDate({ y: +at.year, mo: +at.month, d: +at.day, ...time }, !!ctx.utc);
    };
    let date = read(order);
    if (!date) {
        // Day and month the other way round, when that is the only reading.
        const swapped = order.map((p) => (p === 'day' ? 'month' : p === 'month' ? 'day' : p));
        date = read(swapped);
    }
    return date ? ok(date) : refuse(ctx, 'datetime');
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** A date as the editor shows it: ISO, 'YYYY-MM-DD', with ' HH:MM(:SS)' when
 *  it has a time of day — in the table's zone. Anything else as text. */
export function formatDateTimeForEdit(value, ctx = {}) {
    if (value == null || value === '') return '';
    if (!(value instanceof Date)) return String(value);
    if (Number.isNaN(value.getTime())) return '';
    const u = !!ctx.utc;
    const y = u ? value.getUTCFullYear() : value.getFullYear();
    const mo = (u ? value.getUTCMonth() : value.getMonth()) + 1;
    const d = u ? value.getUTCDate() : value.getDate();
    const h = u ? value.getUTCHours() : value.getHours();
    const mi = u ? value.getUTCMinutes() : value.getMinutes();
    const s = u ? value.getUTCSeconds() : value.getSeconds();
    const day = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
    if (!h && !mi && !s) return day;
    return `${day} ${pad(h)}:${pad(mi)}${s ? `:${pad(s)}` : ''}`;
}

// ── choice ──────────────────────────────────────────────────────────────

/** A column's `options` as `[{value, label}]`: a bare value is its own label. */
export function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options.map((o) => (o && typeof o === 'object'
        ? { value: o.value, label: String(o.label ?? o.value ?? '') }
        : { value: o, label: String(o ?? '') }));
}

/** Text to one option's value — by its label or its value, ignoring case
 *  and the spaces around it; blank is null. Other text is refused, unless
 *  `allowOther`, when it is the value. */
export function parseChoice(text, ctx = {}) {
    if (isBlank(text)) return ok(null);
    const t = String(text).trim();
    const lower = t.toLowerCase();
    const opts = normalizeOptions(ctx.options);
    const hit = opts.find((o) => o.label.trim().toLowerCase() === lower)
        || opts.find((o) => String(o.value ?? '').trim().toLowerCase() === lower);
    if (hit) return ok(hit.value);
    return ctx.allowOther ? ok(t) : refuse(ctx, 'choice');
}

function labelOf(value, ctx) {
    if (value == null) return '';
    const hit = normalizeOptions(ctx.options).find((o) => Object.is(o.value, value) || String(o.value) === String(value));
    return hit ? hit.label : String(value);
}

// ── the editors ─────────────────────────────────────────────────────────

/** What a factory is told, as a parse's `ctx`. */
function contextOf(args) {
    const col = args.column || {};
    return {
        locale: args.locale, utc: !!args.utc, messages: args.messages,
        options: col.options, allowOther: !!col.allowOther,
    };
}

/** A text field whose text a parse reads; left as it opened, it is the value
 *  it was given. */
function parsedField(el, args, start, parse) {
    const { value, initialText = null } = args;
    el.value = initialText != null ? String(initialText) : start;
    const ctx = contextOf(args);
    return {
        el,
        getValue: () => el.value,
        parse: () => (initialText == null && el.value === start ? ok(value) : parse(el.value, ctx)),
        focus: () => {
            el.focus({ preventScroll: true });
            const end = el.value.length;
            try { el.setSelectionRange(end, end); } catch (_) { /* not a text type */ }
        },
    };
}

function textInput(kind) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `twm-dt-editor twm-dt-editor--${kind}`;
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    return input;
}

/** number: a text box (not type=number, which throws '1.234,56' away as it is
 *  typed) read by `locale`. */
export function createNumberEditor(args) {
    const input = textInput('number');
    input.inputMode = 'decimal';
    return parsedField(input, args, formatNumberForEdit(args.value, contextOf(args)), parseNumber);
}

/** datetime: a text box (not type=date, which takes no '31/12/2026') read as
 *  ISO or by `locale`'s order. */
export function createDateTimeEditor(args) {
    const input = textInput('datetime');
    return parsedField(input, args, formatDateTimeForEdit(args.value, contextOf(args)), parseDateTime);
}

/** multitext: a text area. Enter is a new line; Ctrl/Cmd+Enter commits. */
export function createMultiTextEditor(args) {
    const area = document.createElement('textarea');
    area.className = 'twm-dt-editor twm-dt-editor--multitext';
    area.spellcheck = false;
    area.rows = Number(args.column?.rows) > 0 ? Number(args.column.rows) : 3;
    const start = args.value == null ? '' : String(args.value);
    const field = parsedField(area, args, start, (text) => ok(text));
    return { ...field, multiline: true };
}

/** bool: a checkbox. Ticking or unticking it commits; Enter and Tab commit it
 *  as it is. A space that opened it ticks it over; a word that reads as true
 *  or false sets it. */
export function createBoolEditor(args) {
    const { value, initialText = null, commit } = args;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'twm-dt-editor twm-dt-editor--bool';
    const start = truthy(value);
    box.checked = start;
    if (initialText === ' ') box.checked = !start;
    else if (initialText != null) {
        const r = parseBool(initialText);
        if (r.ok) box.checked = r.value;
    }
    box.addEventListener('change', () => commit(box.checked));
    const read = () => (box.checked === start && initialText == null ? ok(value) : ok(box.checked));
    return {
        el: box,
        getValue: () => box.checked,
        parse: read,
        focus: () => box.focus({ preventScroll: true }),
    };
}

let uid = 0;

/**
 * choice: an AutocompleteField offering the column's `options`, filtered by
 * what is typed. Picking one (a click, or Enter or Tab on the list) commits
 * its value; Enter and Tab with the list shut commit the text read by
 * `parseChoice`, and on an emptied box (no arrow having chosen an option)
 * commit null. Escape with the list open closes the list only.
 */
export function createChoiceEditor(args) {
    const { value, initialText = null, commit } = args;
    const ctx = contextOf(args);
    const opts = normalizeOptions(ctx.options);
    const start = labelOf(value, ctx);
    const shown = initialText != null ? String(initialText) : start;
    let picked = null;          // {label, value}: the last option picked
    let keying = null;          // the key being handled, while it is
    let done = false;

    const ac = new AutocompleteField({
        fieldId: `twm-dt-choice-${++uid}`,
        field: { value: shown },
        skipNamespacePrefix: true,
        typeIcons: { option: 'list' },
        provider: ({ value: term }) => {
            const q = String(term ?? '').trim().toLowerCase();
            const all = !q || (initialText == null && term === start);
            return opts
                .filter((o) => all || o.label.toLowerCase().includes(q))
                .map((o) => ({ label: o.label, insertText: o.label, iconType: 'option', metadata: { value: o.value } }));
        },
        onChange: (text, meta) => {
            if (done || !meta?.immediate || !meta.metadata) return;
            picked = { label: String(text ?? ''), value: meta.metadata.value };
            // A pick by Enter or Tab moves the cursor as those keys do.
            const move = keying
                ? (keying.key === 'Tab' ? (keying.shift ? 'left' : 'right') : (keying.shift ? 'up' : 'down'))
                : null;
            commit(picked.value, move);
        },
    });
    const root = ac.render();
    root.classList.add('twm-dt-editor--choice');
    const input = ac.input;
    input.classList.add('twm-dt-editor');

    let browsed = false;        // an arrow moved through the list since the last keystroke
    const onCapture = (ev) => {
        const commitKey = (ev.key === 'Enter' || ev.key === 'Tab') && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
        keying = commitKey ? { key: ev.key, shift: ev.shiftKey } : null;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') browsed = true;
        // An emptied box is no option, even with the list open on all of
        // them: Enter and Tab commit null — unless an arrow chose one.
        if (commitKey && !browsed && !String(input.value).trim() && !ev.isComposing) {
            ev.preventDefault();
            ev.stopPropagation();
            const move = ev.key === 'Tab' ? (ev.shiftKey ? 'left' : 'right') : (ev.shiftKey ? 'up' : 'down');
            commit(null, move);
        }
    };
    const onInput = () => { browsed = false; };
    const onAfter = (ev) => {
        keying = null;
        // Escape with the list open was the list's (it closed it).
        if (ev.key === 'Escape' && ev.defaultPrevented) ev.stopPropagation();
    };
    root.addEventListener('keydown', onCapture, true);
    input.addEventListener('keydown', onAfter);
    input.addEventListener('input', onInput);

    return {
        el: root,
        getValue: () => ac.input?.value ?? '',
        parse: () => {
            const text = ac.input?.value ?? '';
            if (initialText == null && text === start) return ok(value);
            if (picked && text === picked.label) return ok(picked.value);
            return parseChoice(text, ctx);
        },
        focus: () => {
            ac.input?.focus({ preventScroll: true });
            const end = ac.input?.value.length ?? 0;
            try { ac.input?.setSelectionRange(end, end); } catch (_) { /* gone */ }
        },
        destroy: () => {
            done = true;
            root.removeEventListener('keydown', onCapture, true);
            input.removeEventListener('keydown', onAfter);
            input.removeEventListener('input', onInput);
            ac.dispose();
        },
    };
}

const identity = (text) => ok(text == null ? '' : String(text));

/** The six, by type: `{create, parse}` each. */
export const CELL_EDITORS = Object.freeze({
    text: Object.freeze({ create: createTextEditor, parse: identity }),
    multitext: Object.freeze({ create: createMultiTextEditor, parse: identity }),
    number: Object.freeze({ create: createNumberEditor, parse: parseNumber }),
    bool: Object.freeze({ create: createBoolEditor, parse: parseBool }),
    choice: Object.freeze({ create: createChoiceEditor, parse: parseChoice }),
    datetime: Object.freeze({ create: createDateTimeEditor, parse: parseDateTime }),
});
