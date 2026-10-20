/**
 * series.js — STORY-0089. What a FILL HANDLE writes: `detectSeries` reads the
 * block a fill starts from, and `projectSeries` continues it. Pure functions,
 * no DOM, so the rules are tested on their own (tests/series.test.mjs) and a
 * consumer that builds its own grid fills the way DataTable does.
 *
 * The rules, as a spreadsheet has them:
 *   - one value                          -> repeat it
 *   - two or more numbers a constant
 *     step apart                         -> continue the arithmetic series
 *   - two or more dates (`YYYY-MM-DD`
 *     or `Date`) a constant number of
 *     days apart                         -> continue them that many days apart
 *   - two or more texts with one shared
 *     prefix and suffix around a number
 *     a constant step apart ("Item 1")   -> continue the number, zero-padded
 *                                           as the first is
 *   - anything else (equal values
 *     included)                          -> repeat the block, in a cycle
 *   - `forceCopy` (Ctrl held)            -> repeat the block, in a cycle
 *
 * `values` is the seed IN FILL ORDER: a fill up or left hands the block in
 * reverse, so the value next to the gap comes last and the series runs away
 * from the block.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;
const NUMERIC_TEXT = /^[-+]?(\d+\.?\d*|\.\d+)$/;
const DAY_MS = 86400000;

const isBlank = (v) => v === null || v === undefined || v === '';

/**
 * What the seed is: `{kind, step}` with `kind` one of 'copy', 'number',
 * 'date' (step in days), 'text-number' (also `prefix`, `suffix`, `pad`) or
 * 'cycle' — or null for an empty seed or one of blanks only.
 *
 * @param {any[]} values
 * @returns {{kind: string, step: number, prefix?: string, suffix?: string, pad?: number}|null}
 */
export function detectSeries(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    if (values.every(isBlank)) return null;
    if (values.length === 1) return { kind: 'copy', step: 0 };

    const numbers = values.map(toNumber);
    if (numbers.every((n) => n !== null)) {
        const step = numbers[1] - numbers[0];
        const constant = numbers.every((n, i) => i === 0 || nearlyEqual(n - numbers[i - 1], step));
        if (constant && step !== 0) return { kind: 'number', step };
        if (constant) return { kind: 'copy', step: 0 };
        return { kind: 'cycle', step: 0 };
    }

    const days = values.map(toDayMs);
    if (days.every((d) => d !== null)) {
        const step = Math.round((days[1] - days[0]) / DAY_MS);
        const constant = days.every((d, i) => i === 0 || Math.round((d - days[i - 1]) / DAY_MS) === step);
        if (constant && step !== 0) return { kind: 'date', step };
        if (constant) return { kind: 'copy', step: 0 };
        return { kind: 'cycle', step: 0 };
    }

    // "Item 1", "Item 2": one prefix and suffix around a number.
    const parts = values.map((v) => (typeof v === 'string' ? TRAILING_NUMBER.exec(v) : null));
    if (parts.every(Boolean)) {
        const prefix = parts[0][1];
        const suffix = parts[0][3];
        if (parts.every((p) => p[1] === prefix && p[3] === suffix)) {
            const nums = parts.map((p) => Number(p[2]));
            const step = nums[1] - nums[0];
            const constant = nums.every((n, i) => i === 0 || n - nums[i - 1] === step);
            if (constant && step !== 0) {
                return { kind: 'text-number', step, prefix, suffix, pad: parts[0][2].length };
            }
        }
    }

    return { kind: 'cycle', step: 0 };
}

/**
 * The `count` values a fill writes after `values` (the seed, in fill order).
 * A series keeps its seed's type: number seeds give numbers, text seeds text
 * (with the seed's decimals), `Date` seeds `Date`s and `YYYY-MM-DD` seeds
 * `YYYY-MM-DD`. A repeat hands back the seed's own values.
 *
 * @param {any[]} values
 * @param {number} count
 * @param {{forceCopy?: boolean}} [options]  `forceCopy`: repeat the block
 *   even when it is a series (Ctrl held).
 * @returns {any[]}
 */
export function projectSeries(values, count, { forceCopy = false } = {}) {
    const out = [];
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (!Array.isArray(values) || values.length === 0 || n === 0) return out;
    const series = forceCopy ? null : detectSeries(values);
    const last = values[values.length - 1];
    if (series?.kind === 'number') {
        const base = toNumber(last);
        const decimals = Math.min(15, Math.max(...values.map(decimalsOf)));
        const allNumbers = values.every((v) => typeof v === 'number');
        for (let i = 1; i <= n; i++) {
            const next = base + series.step * i;
            out.push(allNumbers ? Number(next.toFixed(decimals)) : next.toFixed(decimals));
        }
        return out;
    }
    if (series?.kind === 'date') {
        // Calendar days, not 24-hour blocks: a `Date` keeps its wall-clock
        // time across a daylight-saving change (local calendar), and a
        // YYYY-MM-DD text stays on the UTC calendar it was parsed on.
        const asDate = last instanceof Date;
        for (let i = 1; i <= n; i++) {
            if (asDate) {
                const next = new Date(last.getTime());
                next.setDate(next.getDate() + series.step * i);
                out.push(next);
            } else {
                const next = new Date(toDayMs(last));
                next.setUTCDate(next.getUTCDate() + series.step * i);
                out.push(next.toISOString().slice(0, 10));
            }
        }
        return out;
    }
    if (series?.kind === 'text-number') {
        const base = Number(TRAILING_NUMBER.exec(last)[2]);
        for (let i = 1; i <= n; i++) {
            const next = base + series.step * i;
            const digits = String(Math.abs(next)).padStart(series.pad, '0');
            out.push(`${series.prefix}${next < 0 ? '-' : ''}${digits}${series.suffix}`);
        }
        return out;
    }
    for (let i = 0; i < n; i++) out.push(values[i % values.length]);
    return out;
}

/** A number, or a text that is exactly one; never NaN. */
function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return NUMERIC_TEXT.test(text) ? Number(text) : null;
}

/** A `Date`, or a `YYYY-MM-DD` text (read as UTC midnight), in ms. */
function toDayMs(value) {
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isNaN(t) ? null : t;
    }
    if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) return null;
    const text = value.trim();
    const t = new Date(`${text}T00:00:00Z`).getTime();
    // 2026-02-30 parses to March 2nd in some engines: not a date.
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== text) return null;
    return t;
}

/** The decimals a seed value is written with ("2.50" → 2, 0.1 → 1). */
function decimalsOf(value) {
    const text = typeof value === 'number' ? String(value) : String(value).trim();
    if (/e/i.test(text)) return 15;
    return (text.split('.')[1] || '').length;
}

function nearlyEqual(a, b) {
    return Math.abs(a - b) < 1e-9;
}
