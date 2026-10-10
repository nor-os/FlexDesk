/**
 * scroll_lock.js — 0.6.1. Several scroll boxes that move as one.
 *
 * A side-by-side comparison (two DataTables in two tiles, "now" and "then") is
 * only readable if row 40 on the left stays beside row 40 on the right. A lock
 * is a GROUP: every box attached to it copies the scroll position of whichever
 * member the person scrolled, on the axes the lock names.
 *
 *     const lock = createScrollLock({ axis: 'y' });
 *     new DataTable(left,  { …, scrollLock: lock });
 *     new DataTable(right, { …, scrollLock: lock });
 *     lock.setEnabled(false);   // the two scroll freely; true locks them again
 *
 * Any element can join with `lock.attach(el)`, which returns its detach. A
 * DataTable given `scrollLock` attaches its own body box on every render and
 * detaches it on the next render and on dispose, so a re-render (a sort, new
 * data) never strands a dead box in the group.
 *
 * THE ECHO. Setting `scrollTop` on a member fires that member's own `scroll`
 * event a frame later, and a naive group would then copy it back to the first
 * box, which by then may have moved on — the two fight and the wheel stutters.
 * So a position this lock WROTE is remembered per box, and the scroll event that
 * reports exactly that position is the echo and is ignored.
 *
 * A box that joins is moved to the group's last position, so a pane opened
 * beside a scrolled one starts level with it. Positions are copied as pixels:
 * the lock aligns rows only when the members draw rows of the same height,
 * which is the comparison's own contract (both sides drawn from one aligned
 * row list, a gap row where a side has none).
 */

/**
 * @param {object} [options]
 * @param {'x'|'y'|'both'} [options.axis='y'] which positions are copied
 * @param {boolean} [options.enabled=true]
 */
export function createScrollLock({ axis = 'y', enabled = true } = {}) {
    const doY = axis === 'y' || axis === 'both';
    const doX = axis === 'x' || axis === 'both';
    const members = new Map();          // element -> { wrote: {top, left} | null, off }
    let last = { top: 0, left: 0 };
    let on = !!enabled;

    function copyFrom(source) {
        last = { top: source.scrollTop, left: source.scrollLeft };
        if (!on) return;
        for (const [el, state] of members) {
            if (el === source) continue;
            const top = doY ? last.top : el.scrollTop;
            const left = doX ? last.left : el.scrollLeft;
            if (el.scrollTop === top && el.scrollLeft === left) continue;
            state.wrote = { top, left };
            if (doY) el.scrollTop = top;
            if (doX) el.scrollLeft = left;
        }
    }

    function onScroll(event) {
        const el = event.currentTarget;
        const state = members.get(el);
        if (!state) return;
        const wrote = state.wrote;
        state.wrote = null;
        // THE ECHO of a position this lock set: not a person scrolling.
        if (wrote && Math.abs(el.scrollTop - wrote.top) < 1
                  && Math.abs(el.scrollLeft - wrote.left) < 1) return;
        copyFrom(el);
    }

    const lock = {
        /** Join the group. Returns the function that leaves it. */
        attach(el) {
            if (!el || typeof el.addEventListener !== 'function') return () => {};
            if (members.has(el)) return () => lock.detach(el);
            const state = { wrote: null };
            members.set(el, state);
            el.addEventListener('scroll', onScroll, { passive: true });
            if (on && (last.top || last.left)) {
                state.wrote = { top: doY ? last.top : el.scrollTop,
                                left: doX ? last.left : el.scrollLeft };
                if (doY) el.scrollTop = last.top;
                if (doX) el.scrollLeft = last.left;
            }
            return () => lock.detach(el);
        },
        detach(el) {
            if (!members.has(el)) return;
            members.delete(el);
            el.removeEventListener('scroll', onScroll);
        },
        /** Lock (true) or let the members scroll freely (false). Locking again
         *  brings every member level with the one scrolled last. */
        setEnabled(value) {
            const was = on;
            on = !!value;
            if (on && !was) {
                const source = [...members.keys()].find(
                    (el) => el.scrollTop === last.top && el.scrollLeft === last.left)
                    || members.keys().next().value;
                if (source) copyFrom(source);
            }
        },
        get enabled() { return on; },
        /** How many boxes are in the group (for a consumer's own checks). */
        get size() { return members.size; },
        dispose() {
            for (const el of [...members.keys()]) lock.detach(el);
        },
    };
    return lock;
}
