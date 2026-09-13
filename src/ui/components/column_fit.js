/**
 * column_fit.js — how wide each column of a table should be.
 *
 * A pure function over measurements, so the policy can be read and tested
 * without a DOM. A table measures its columns, hands them here, and applies
 * the widths it gets back.
 *
 * ── The policy ─────────────────────────────────────────────────────────
 *
 * Columns are not all alike, and treating them alike is what went wrong
 * before. An id, a date, a status, a person: SHORT columns, whose values are
 * all about as wide as each other, and which are useless the moment they are
 * cut ("2026-09-…", "review-q…"). A summary or a title: TEXT columns, whose
 * values run as long as people write them, and which are readable cut.
 *
 * The old fit spread spare room EVENLY, so a 40px "BUG" chip got 90px while
 * the summary beside it was clipped in nine rows out of ten, and it shrank the
 * WIDEST column first, so a narrow tile crushed the title to 85px while every
 * short column kept its width.
 *
 *   1. Short columns get their full content width. Text columns start at a
 *      readable width.
 *   2. Room to spare goes to the text columns, in proportion to what each
 *      still needs, and past their content so the table fills its box. With no
 *      text column it goes to the last column, so no column in the middle
 *      opens a gap.
 *   3. Too little room: shrink in order of harm. Short columns first give up
 *      only their rare longest values (down to `typical`, what most values
 *      fit). Then text columns go down to a floor. Then short columns go down
 *      to theirs, and text columns once more. What still does not fit scrolls
 *      sideways rather than being crushed further.
 *
 * Within each step the widest columns give way first and the narrow ones keep
 * their width (a water level), so one long column never forces every other
 * column down with it.
 *
 * Columns the user dragged are PINNED: they keep their width and sit out every
 * step.
 */

export const COLUMN_FIT = Object.freeze({
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
    SHORT_FLOOR: 56,
});

/**
 * @typedef {object} ColumnMeasure
 * @property {number}  natural   widest cell, padding included (px)
 * @property {number}  [typical] width most cells fit, e.g. the 95th percentile (px);
 *                               defaults to `natural`
 * @property {number}  [header]  the header label's width (px)
 * @property {number}  [pinned]  a user-dragged width, honoured exactly
 * @property {boolean} [text]    force (true) or forbid (false) text treatment;
 *                               omitted, it is decided from the width
 */

/**
 * @param {ColumnMeasure[]} columns
 * @param {number} avail  the width the table has (px); 0 or less means "not laid out"
 * @returns {number[]} a width per column (px, possibly fractional). The sum
 *   equals `avail` whenever the floors fit, and exceeds it only when they do
 *   not, in which case the table should scroll.
 */
export function fitColumns(columns, avail) {
    const { FLOOR, PAD, TEXT_AT, TEXT_MIN, TEXT_FLOOR, SHORT_FLOOR } = COLUMN_FIT;
    const n = columns.length;
    const cols = columns.map((c) => {
        const header = Math.max(0, Number(c.header) || 0);
        const natural = Math.max(0, Number(c.natural) || 0);
        const full = Math.max(FLOOR, Math.ceil(Math.max(natural, header) + PAD));
        const typical = Math.min(full, Math.max(FLOOR, Math.ceil(Math.max(
            Number.isFinite(c.typical) ? c.typical : natural, header) + PAD)));
        const pinned = Number.isFinite(c.pinned) ? Math.max(FLOOR, Math.round(c.pinned)) : null;
        const text = pinned == null && (typeof c.text === 'boolean' ? c.text : full >= TEXT_AT);
        return { full, typical, pinned, text };
    });

    const text = [];
    const short = [];
    cols.forEach((c, i) => { if (c.pinned == null) (c.text ? text : short).push(i); });
    if (!(avail > 1)) return cols.map((c) => (c.pinned != null ? c.pinned : c.full));

    // 1. The starting point: short columns at their full content width, text
    //    columns at a readable width (or their content, if shorter).
    const widths = cols.map((c) => {
        if (c.pinned != null) return c.pinned;
        return c.text ? Math.min(c.full, TEXT_MIN) : c.full;
    });
    const total = () => widths.reduce((a, b) => a + b, 0);
    let slack = avail - total();

    // 2. Room to spare goes to the text columns, in proportion to what each
    //    still needs, then beyond their content so the table fills its box.
    //    Widths are not rounded: CSS takes fractional pixels, and rounding is
    //    what made the total miss the box by a pixel and a column jitter by one
    //    as its tile was resized.
    if (slack >= 0) {
        slack = raise(widths, text, (i) => cols[i].full, slack);
        if (slack > 0) {
            if (text.length) text.forEach((i) => { widths[i] += slack / text.length; });
            else widths[short.length ? short[short.length - 1] : n - 1] += slack;
        }
        return widths;
    }

    // 3. Not enough room: shrink in order of harm until it fits.
    const steps = [
        [short, (i) => cols[i].typical],
        [text, () => TEXT_FLOOR],
        [short, (i) => Math.min(cols[i].typical, SHORT_FLOOR)],
        [text, () => FLOOR * 2],
    ];
    for (const [idxs, low] of steps) {
        const over = total() - avail;
        if (over <= 1e-6) break;
        lowerTo(widths, idxs, low, over);
    }
    return widths;
}

/**
 * Give up to `slack` px to the columns in `idxs`, each toward `target(i)`, in
 * proportion to how far each still is from it. Returns what is left.
 */
function raise(widths, idxs, target, slack) {
    if (!(slack > 0)) return slack;
    const wants = idxs.map((i) => Math.max(0, target(i) - widths[i]));
    const need = wants.reduce((a, b) => a + b, 0);
    if (!(need > 0)) return slack;
    const give = Math.min(slack, need);
    idxs.forEach((i, k) => { widths[i] += give * wants[k] / need; });
    return slack - give;
}

/**
 * Take up to `over` px off the columns in `idxs`, widest first, none below
 * `low(i)`. A water level: every column above the level is cut down to it, and
 * the level is solved so the total cut is exactly `over`, or everything the
 * lows allow when that is less. Solved on real numbers: the result is exact,
 * and a wider box can never make any column narrower.
 */
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
        if (cutAt(mid) > over) lo = mid; else hi = mid;
    }
    for (const i of cand) widths[i] = Math.min(widths[i], Math.max(floors.get(i), hi));
}
