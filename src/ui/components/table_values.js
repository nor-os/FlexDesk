/**
 * table_values.js — the REAL VALUE behind a date, a timestamp or a duration
 * cell, and the words a reader sees for it.
 *
 * A list that hands DataTable already-formatted text sorts that text: "10/5/2026"
 * before "9/30/2026", "3.2 s" before "850 ms", "5 Oct" before "30 Sep". The
 * cure is to hand the table the VALUE (an ISO string, a `Date`, epoch
 * milliseconds, a duration in milliseconds) and let it format for the eye while
 * it sorts and filters by the value. That is what a column typed `date`,
 * `datetime` or `duration` does (0.5.0), and these are the functions it uses.
 *
 * They are exported (through `data_table.js`) so a consumer that draws a value
 * somewhere else — a detail pane, a tooltip — writes the same words the table
 * writes, rather than an eighth private formatter.
 *
 * ══ THE DEFAULT IS ISO ═══════════════════════════════════════════════
 *
 * `YYYY-MM-DD` for a date and `YYYY-MM-DD HH:mm` for a timestamp. It sorts as
 * text, it reads the same in every locale, and it is what the product owner of
 * the first consumer asked for: *"Flexdesk default should be the ISO date"*. A
 * consumer that wants something else passes a pattern (below) or a function.
 *
 * ══ PATTERNS ═════════════════════════════════════════════════════════
 *
 *   YYYY 2026   YY 26     MMMM October  MMM Oct   MM 10   M 10
 *   DD 05       D 5       dddd Monday   ddd Mon
 *   HH 14       H 14      hh 02         h 2       mm 05   m 5
 *   ss 09       s 9       SSS 042       A PM      a pm
 *   [literal]   anything in square brackets is copied verbatim
 *
 * Month and weekday NAMES are English. A consumer that needs another language
 * passes a function, which can use `Intl.DateTimeFormat` with whatever locale it
 * likes; this module has no locale data and wants none.
 *
 * ══ TIME ZONES ═══════════════════════════════════════════════════════
 *
 * A value WITH a zone (`…Z`, `…+02:00`, a `Date`, epoch ms) is an instant, and
 * it is drawn in the reader's local zone unless `utc` is asked for. A value
 * WITHOUT one (`2026-10-05`, `2026-10-05 14:30`) is a wall-clock reading, and
 * it is taken in the zone it will be drawn in — so `2026-10-05` is drawn as
 * `2026-10-05` everywhere. (`Date.parse('2026-10-05')` reads it as UTC
 * midnight, which west of Greenwich is the evening of the 4th: a calendar date
 * that moves a day depending on where it is read.)
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                  'Friday', 'Saturday'];

/** The ISO default for a `date` column. */
export const ISO_DATE = 'YYYY-MM-DD';
/** The ISO default for a `datetime` column. */
export const ISO_DATETIME = 'YYYY-MM-DD HH:mm';

// An ISO 8601 date, optionally with a time (`T` or a space) and a zone.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const pad = (n, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, '0');

/**
 * Epoch milliseconds for a date-like value, or `NaN` when it is not one.
 *
 * @param {Date|number|string|null|undefined} value  a `Date`, epoch ms, or a
 *   string (ISO 8601 first; anything `Date.parse` reads as a fallback)
 * @param {{utc?: boolean}} [o]  read a zone-less string as UTC rather than local
 * @returns {number}
 */
export function parseDateValue(value, { utc = false } = {}) {
    if (value == null || value === '') return NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const text = String(value).trim();
    if (!text) return NaN;
    const m = ISO_RE.exec(text);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
        const h = m[4] ? Number(m[4]) : 0;
        const mi = m[5] ? Number(m[5]) : 0;
        const s = m[6] ? Number(m[6]) : 0;
        const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
        if (h > 24 || mi > 59 || s > 60) return NaN;
        const zone = m[8];
        if (zone) {
            let offset = 0;
            if (zone.toUpperCase() !== 'Z') {
                const sign = zone[0] === '-' ? -1 : 1;
                const digits = zone.slice(1).replace(':', '');
                offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
            }
            return Date.UTC(y, mo - 1, d, h, mi, s, ms) - offset * 60000;
        }
        return utc
            ? Date.UTC(y, mo - 1, d, h, mi, s, ms)
            : new Date(y, mo - 1, d, h, mi, s, ms).getTime();
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Draw a date-like value with a pattern (see the header). An unreadable value
 * is drawn AS IT CAME rather than as nothing: a blank cell would hide that the
 * data held something unexpected.
 *
 * @param {Date|number|string|null|undefined} value
 * @param {string|Function} [pattern='YYYY-MM-DD']  a pattern, or
 *   `(date: Date) => string`
 * @param {{utc?: boolean}} [o]  draw in UTC rather than the local zone
 * @returns {string}
 */
export function formatDate(value, pattern = ISO_DATE, { utc = false } = {}) {
    if (value == null || value === '') return '';
    const t = parseDateValue(value, { utc });
    if (!Number.isFinite(t)) return String(value);
    const date = new Date(t);
    if (typeof pattern === 'function') return String(pattern(date) ?? '');
    const get = utc
        ? {
            y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate(),
            wd: date.getUTCDay(), h: date.getUTCHours(), mi: date.getUTCMinutes(),
            s: date.getUTCSeconds(), ms: date.getUTCMilliseconds(),
        }
        : {
            y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(),
            wd: date.getDay(), h: date.getHours(), mi: date.getMinutes(),
            s: date.getSeconds(), ms: date.getMilliseconds(),
        };
    const h12 = get.h % 12 === 0 ? 12 : get.h % 12;
    return String(pattern || ISO_DATE).replace(
        /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g,
        (tok, literal) => {
            if (literal !== undefined) return literal;
            switch (tok) {
                case 'YYYY': return pad(get.y, 4);
                case 'YY':   return pad(get.y % 100);
                case 'MMMM': return MONTHS[get.mo];
                case 'MMM':  return MONTHS[get.mo].slice(0, 3);
                case 'MM':   return pad(get.mo + 1);
                case 'M':    return String(get.mo + 1);
                case 'dddd': return WEEKDAYS[get.wd];
                case 'ddd':  return WEEKDAYS[get.wd].slice(0, 3);
                case 'DD':   return pad(get.d);
                case 'D':    return String(get.d);
                case 'HH':   return pad(get.h);
                case 'H':    return String(get.h);
                case 'hh':   return pad(h12);
                case 'h':    return String(h12);
                case 'mm':   return pad(get.mi);
                case 'm':    return String(get.mi);
                case 'ss':   return pad(get.s);
                case 's':    return String(get.s);
                case 'SSS':  return pad(get.ms, 3);
                case 'A':    return get.h < 12 ? 'AM' : 'PM';
                case 'a':    return get.h < 12 ? 'am' : 'pm';
                default:     return tok;
            }
        });
}

/**
 * The PERIOD an ISO prefix names, as `[start, end)` in epoch ms — `2026` is the
 * year, `2026-10` the month, `2026-10-05` the day, `2026-10-05 14` the hour,
 * `2026-10-05 14:30` the minute. A full instant (with a zone, say) is the one
 * millisecond it names. `null` for text that names no period — which is how a
 * filter half-typed (`>20`) filters nothing yet rather than everything.
 *
 * @param {string} text
 * @param {{utc?: boolean}} [o]
 * @returns {{start: number, end: number}|null}
 */
export function parseDatePeriod(text, { utc = false } = {}) {
    const t = String(text ?? '').trim();
    const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2})(?:[T ](\d{1,2})(?::(\d{2})(?::(\d{2}))?)?)?)?)?$/.exec(t);
    if (m) {
        const parts = [Number(m[1]),
                       m[2] ? Number(m[2]) - 1 : 0,
                       m[3] ? Number(m[3]) : 1,
                       m[4] ? Number(m[4]) : 0,
                       m[5] ? Number(m[5]) : 0,
                       m[6] ? Number(m[6]) : 0];
        if (parts[1] < 0 || parts[1] > 11 || parts[2] < 1 || parts[2] > 31) return null;
        // The least significant part that was GIVEN is the one the period spans.
        const unit = m[6] ? 5 : m[5] ? 4 : m[4] ? 3 : m[3] ? 2 : m[2] ? 1 : 0;
        const next = parts.slice();
        next[unit] += 1;
        const at = (p) => (utc ? Date.UTC(...p) : new Date(...p).getTime());
        return { start: at(parts), end: at(next) };
    }
    const instant = parseDateValue(t, { utc });
    return Number.isFinite(instant) ? { start: instant, end: instant + 1 } : null;
}

const DURATION_UNITS = {
    ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1,
    s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
    m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
    h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
    d: 86400000, day: 86400000, days: 86400000,
};

/**
 * Milliseconds for a duration: a number (taken as ms), or text — `850 ms`,
 * `3.2 s`, `2m 5s`, `1h 30m`, `2 days`, or a clock `1:02:05` (`h:mm:ss`, with
 * an optional `d.` in front). `NaN` when it is none of those.
 *
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function parseDuration(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value).trim().toLowerCase();
    if (!text) return NaN;
    let sign = 1;
    if (text[0] === '-') { sign = -1; text = text.slice(1).trim(); }
    if (/^\d+(?:\.\d+)?$/.test(text)) return sign * Number(text);
    const clock = /^(?:(\d+)\.)?(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(text);
    if (clock) {
        const [, d, a, b, c] = clock;
        // h:mm:ss, or h:mm when there is no third part.
        const ms = (Number(d || 0) * 86400 + Number(a) * 3600 + Number(b) * 60
                    + Number(c || 0)) * 1000;
        return sign * ms;
    }
    const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/g;
    let total = 0;
    let consumed = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index !== consumed) return NaN;
        const unit = DURATION_UNITS[m[2]];
        if (unit === undefined) return NaN;
        total += Number(m[1]) * unit;
        consumed = re.lastIndex;
    }
    return consumed === text.length && consumed > 0 ? sign * total : NaN;
}

/**
 * Draw a duration in milliseconds.
 *
 *   'auto'  (default) `850 ms`, `3.2 s`, `2m 5s`, `1h 2m`, `3d 4h` — the two
 *           largest units that matter, which is what a list of run times or
 *           query times wants
 *   'clock' `0:00:03`, `1:02:05`, `2.04:00:00` (`d.h:mm:ss`)
 *   a function `(ms) => string`
 *
 * Text that is not a duration is drawn as it came, like `formatDate`.
 *
 * @param {number|string|null|undefined} value
 * @param {'auto'|'clock'|Function} [pattern='auto']
 * @returns {string}
 */
export function formatDuration(value, pattern = 'auto') {
    if (value == null || value === '') return '';
    const ms = parseDuration(value);
    if (!Number.isFinite(ms)) return String(value);
    if (typeof pattern === 'function') return String(pattern(ms) ?? '');
    const neg = ms < 0;
    const a = Math.abs(ms);
    let out;
    if (pattern === 'clock') {
        const total = Math.round(a / 1000);
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        const mi = Math.floor((total % 3600) / 60);
        const s = total % 60;
        out = `${d ? `${d}.${pad(h)}` : h}:${pad(mi)}:${pad(s)}`;
    } else if (a < 1000) {
        out = `${Math.round(a)} ms`;
    } else if (a < 59950) {
        out = `${(a / 1000).toFixed(1)} s`;
    } else if (a < 3600000) {
        let mi = Math.floor(a / 60000);
        let s = Math.round((a % 60000) / 1000);
        if (s === 60) { mi += 1; s = 0; }
        out = `${mi}m ${s}s`;
    } else if (a < 86400000) {
        let h = Math.floor(a / 3600000);
        let mi = Math.round((a % 3600000) / 60000);
        if (mi === 60) { h += 1; mi = 0; }
        out = `${h}h ${mi}m`;
    } else {
        let d = Math.floor(a / 86400000);
        let h = Math.round((a % 86400000) / 3600000);
        if (h === 24) { d += 1; h = 0; }
        out = `${d}d ${h}h`;
    }
    return neg ? `-${out}` : out;
}

/**
 * Does a time `t` (epoch ms) pass a date filter's text?
 *
 *   >2026-10      after October 2026        >=2026-10   from the 1st of October
 *   <2026-10-05   before the 5th            <=2026-10-05 up to the end of the 5th
 *   =2026-10      in October                !=2026-10    not in October
 *   2026-01..2026-03   January to the end of March
 *   2026-10       (no operator) in October
 *
 * An operand that is not a date yet (`>20`, half typed) filters nothing. Text
 * with no operator that names no period is matched against the cell's DRAWN
 * words, so `Oct` finds October under an `MMM` pattern.
 *
 * @param {number} t          the cell's time, or NaN
 * @param {string} filterText
 * @param {string} shown      the cell as drawn
 * @param {{utc?: boolean}} [o]
 * @returns {boolean}
 */
export function matchDateFilter(t, filterText, shown, { utc = false } = {}) {
    const text = String(filterText ?? '').trim();
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
        const p = parseDatePeriod(op[2], { utc });
        if (!p) return true;
        if (!Number.isFinite(t)) return false;
        switch (op[1]) {
            case '>':  return t >= p.end;
            case '>=': return t >= p.start;
            case '<':  return t < p.start;
            case '<=': return t < p.end;
            case '=':  return t >= p.start && t < p.end;
            case '!=': return !(t >= p.start && t < p.end);
        }
    }
    const p = parseDatePeriod(text, { utc });
    if (p) return Number.isFinite(t) && t >= p.start && t < p.end;
    return String(shown ?? '').toLowerCase().includes(text.toLowerCase());
}

/**
 * Does a duration `ms` pass a duration filter's text? The operators are the
 * numeric ones, and an operand carries its unit (`>1s`, `<500ms`, `2m..5m`); a
 * bare number is milliseconds. Text with no operator is matched against the
 * cell's drawn words.
 *
 * @param {number} ms
 * @param {string} filterText
 * @param {string} shown
 * @returns {boolean}
 */
export function matchDurationFilter(ms, filterText, shown) {
    const text = String(filterText ?? '').trim();
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
            case '>':  return ms > target;
            case '>=': return ms >= target;
            case '<':  return ms < target;
            case '<=': return ms <= target;
            case '=':  return ms === target;
            case '!=': return ms !== target;
        }
    }
    return String(shown ?? '').toLowerCase().includes(text.toLowerCase());
}
