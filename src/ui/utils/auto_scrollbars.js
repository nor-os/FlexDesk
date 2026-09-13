/**
 * auto_scrollbars.js — the overlay scrollbar, on EVERY scrollable element.
 *
 * `installOverlayScrollbar` (overlay_scrollbar.js) gives one container a thin
 * bar that shows on hover and fades away. It is installed container by
 * container, it puts the bar INSIDE the container, and it holds a resize
 * observer, a subtree mutation observer and a window listener for each one.
 * That is fine for a handful of known panes and wrong for "all of them": a
 * page that redraws with `innerHTML = ''` deletes its bar for good, and a
 * table body, a dropdown, a textarea and a dialog each want one.
 *
 * So this is the same look, done once for a whole subtree:
 *
 *   - Native scrollbars are hidden under `root`, so no element reserves
 *     layout width for one and nothing reflows when a bar appears.
 *   - Bars live in ONE fixed layer on `document.body`, positioned over the
 *     element they belong to. Nothing is added to a scroll container, so a
 *     redraw cannot remove a bar, and a textarea (which cannot hold children)
 *     gets one too.
 *   - An element gets its bars when the pointer is over it or it scrolls, if
 *     it actually overflows. They fade out a moment after the pointer leaves
 *     or the scrolling stops. Nested scroll areas each show their own.
 *   - The thumb drags and the track pages, as a native bar does.
 *
 * Discovery is lazy: the pointer and scroll events name the elements worth
 * measuring, so nothing walks the DOM looking for scroll areas.
 */

const LAYER_ID = 'twm-autoscroll-layer';
const ROOT_CLASS = 'twm-autoscroll';
const HIDE_AFTER_MS = 900;
const MIN_THUMB = 30;
const BAR = 6;

/**
 * Where the thumb goes. Pure, so it can be tested without a layout engine.
 *
 * @param {number} scrollSize  scrollHeight / scrollWidth
 * @param {number} clientSize  clientHeight / clientWidth
 * @param {number} scrollPos   scrollTop / scrollLeft
 * @param {number} trackLen    the bar's length on screen (px)
 * @returns {{size:number, pos:number}|null} null when nothing overflows
 */
export function thumbGeometry(scrollSize, clientSize, scrollPos, trackLen) {
    const max = scrollSize - clientSize;
    if (!(max > 1) || !(trackLen > 0)) return null;
    const size = Math.min(trackLen, Math.max(MIN_THUMB, trackLen * clientSize / scrollSize));
    const pos = (trackLen - size) * Math.min(1, Math.max(0, scrollPos / max));
    return { size, pos };
}

/** Whether an element scrolls on an axis: its overflow allows it and its
 *  content is larger than its box. */
function scrollsOn(el, axis) {
    if (!(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    const overflow = axis === 'y' ? cs.overflowY : cs.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll' && !(el.tagName === 'TEXTAREA' && overflow !== 'hidden')) return false;
    return axis === 'y' ? el.scrollHeight - el.clientHeight > 1 : el.scrollWidth - el.clientWidth > 1;
}

/**
 * Give every scrollable element under `root` an auto-hiding overlay scrollbar.
 *
 * @param {HTMLElement} [root=document.body]
 * @param {{exclude?: (el: Element) => boolean}} [opts]  elements to leave to
 *   their own scrollbar. Containers that already carry an
 *   `installOverlayScrollbar` bar are always left alone.
 * @returns {{dispose: () => void}}
 */
export function installAutoScrollbars(root = document.body, { exclude = null } = {}) {
    const doc = root.ownerDocument || document;
    const win = doc.defaultView || window;
    root.classList.add(ROOT_CLASS);

    let layer = doc.getElementById(LAYER_ID);
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = LAYER_ID;
        layer.className = 'twm-autoscroll-layer';
        doc.body.appendChild(layer);
    }

    /** element -> { v, h, timer, hovered } */
    const managed = new Map();
    let hoverChain = new Set();

    const eligible = (el) => el instanceof Element
        && root.contains(el)
        && !el.__overlayScrollbarInstalled
        && !el.closest?.('.twm-autoscroll-layer')
        && !(exclude && exclude(el));

    const makeBar = (el, axis) => {
        const bar = doc.createElement('div');
        bar.className = `twm-autoscroll-bar twm-autoscroll-bar--${axis}`;
        const thumb = doc.createElement('div');
        thumb.className = 'twm-autoscroll-thumb';
        bar.appendChild(thumb);
        layer.appendChild(bar);

        // The track pages, like a native bar's.
        bar.addEventListener('mousedown', (e) => {
            if (e.target !== bar) return;
            e.preventDefault();
            const r = thumb.getBoundingClientRect();
            const before = axis === 'y' ? e.clientY < r.top : e.clientX < r.left;
            const page = (axis === 'y' ? el.clientHeight : el.clientWidth) * 0.9;
            if (axis === 'y') el.scrollTop += before ? -page : page;
            else el.scrollLeft += before ? -page : page;
        });
        // The thumb drags.
        thumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rec = managed.get(el);
            if (rec) rec.dragging = true;
            const start = axis === 'y' ? e.clientY : e.clientX;
            const startScroll = axis === 'y' ? el.scrollTop : el.scrollLeft;
            const trackLen = axis === 'y' ? bar.getBoundingClientRect().height : bar.getBoundingClientRect().width;
            const thumbLen = axis === 'y' ? thumb.getBoundingClientRect().height : thumb.getBoundingClientRect().width;
            const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
            const perPx = trackLen > thumbLen ? max / (trackLen - thumbLen) : 0;
            bar.classList.add('twm-autoscroll-bar--active');
            const move = (mv) => {
                const d = (axis === 'y' ? mv.clientY : mv.clientX) - start;
                if (axis === 'y') el.scrollTop = startScroll + d * perPx;
                else el.scrollLeft = startScroll + d * perPx;
            };
            const up = () => {
                doc.removeEventListener('mousemove', move);
                doc.removeEventListener('mouseup', up);
                bar.classList.remove('twm-autoscroll-bar--active');
                if (rec) rec.dragging = false;
                hideLater(el);
            };
            doc.addEventListener('mousemove', move);
            doc.addEventListener('mouseup', up);
        });
        bar.addEventListener('mouseenter', () => { const rec = managed.get(el); if (rec) { rec.onBar = true; show(el); } });
        bar.addEventListener('mouseleave', () => { const rec = managed.get(el); if (rec) { rec.onBar = false; hideLater(el); } });
        return { bar, thumb };
    };

    const record = (el) => {
        let rec = managed.get(el);
        if (!rec) {
            rec = { v: null, h: null, timer: 0, dragging: false, onBar: false };
            managed.set(el, rec);
        }
        return rec;
    };

    /** Place and size an element's bars; drop the element when it is gone. */
    const place = (el) => {
        const rec = managed.get(el);
        if (!rec) return;
        if (!el.isConnected) { drop(el); return; }
        const r = el.getBoundingClientRect();
        const vw = win.innerWidth;
        const vh = win.innerHeight;
        const top = Math.max(0, r.top);
        const left = Math.max(0, r.left);
        const bottom = Math.min(vh, r.bottom);
        const right = Math.min(vw, r.right);
        // Screen px per CSS px, for content inside a zoomed tile.
        const z = el.offsetHeight ? r.height / el.offsetHeight : 1;
        for (const axis of ['y', 'x']) {
            const key = axis === 'y' ? 'v' : 'h';
            const overflows = scrollsOn(el, axis);
            if (!overflows) { if (rec[key]) rec[key].bar.style.display = 'none'; continue; }
            if (!rec[key]) rec[key] = makeBar(el, axis);
            const { bar, thumb } = rec[key];
            bar.style.display = '';
            if (axis === 'y') {
                const len = bottom - top;
                Object.assign(bar.style, { top: `${top}px`, left: `${right - BAR - 1}px`, height: `${len}px`, width: `${BAR}px` });
                const g = thumbGeometry(el.scrollHeight * z, el.clientHeight * z, el.scrollTop * z, len);
                if (!g) { bar.style.display = 'none'; continue; }
                Object.assign(thumb.style, { top: `${g.pos}px`, height: `${g.size}px`, left: '0', width: '100%' });
            } else {
                const len = right - left;
                Object.assign(bar.style, { left: `${left}px`, top: `${bottom - BAR - 1}px`, width: `${len}px`, height: `${BAR}px` });
                const g = thumbGeometry(el.scrollWidth * z, el.clientWidth * z, el.scrollLeft * z, len);
                if (!g) { bar.style.display = 'none'; continue; }
                Object.assign(thumb.style, { left: `${g.pos}px`, width: `${g.size}px`, top: '0', height: '100%' });
            }
        }
    };

    const setVisible = (el, on) => {
        const rec = managed.get(el);
        if (!rec) return;
        for (const b of [rec.v, rec.h]) if (b) b.bar.classList.toggle('twm-autoscroll-bar--on', on);
    };
    const show = (el) => {
        const rec = record(el);
        clearTimeout(rec.timer);
        place(el);
        setVisible(el, true);
    };
    const hideLater = (el) => {
        const rec = managed.get(el);
        if (!rec) return;
        clearTimeout(rec.timer);
        rec.timer = setTimeout(() => {
            if (rec.dragging || rec.onBar || hoverChain.has(el)) return;
            setVisible(el, false);
        }, HIDE_AFTER_MS);
    };
    const drop = (el) => {
        const rec = managed.get(el);
        if (!rec) return;
        clearTimeout(rec.timer);
        rec.v?.bar.remove();
        rec.h?.bar.remove();
        managed.delete(el);
    };

    /** The scrollable elements from `target` up to `root`. */
    const scrollChain = (target) => {
        const out = new Set();
        for (let el = target instanceof Element ? target : target?.parentElement; el && el !== doc.documentElement; el = el.parentElement) {
            if (el.closest?.('.twm-autoscroll-layer')) return out;
            if (eligible(el) && (scrollsOn(el, 'y') || scrollsOn(el, 'x'))) out.add(el);
            if (el === root) break;
        }
        return out;
    };

    const onOver = (e) => {
        if (e.target?.closest?.('.twm-autoscroll-layer')) return;
        const next = scrollChain(e.target);
        for (const el of hoverChain) if (!next.has(el)) hideLater(el);
        for (const el of next) show(el);
        hoverChain = next;
    };
    const onLeaveWindow = (e) => {
        if (e.relatedTarget) return;
        for (const el of hoverChain) hideLater(el);
        hoverChain = new Set();
    };
    const onScroll = (e) => {
        const el = e.target === doc ? null : e.target;
        if (el && eligible(el)) { show(el); hideLater(el); }
        // A scrolling ancestor moves every bar inside it.
        for (const other of managed.keys()) if (other !== el) place(other);
    };
    let raf = 0;
    const onResize = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { for (const el of managed.keys()) place(el); });
    };

    doc.addEventListener('mouseover', onOver, true);
    doc.addEventListener('mouseout', onLeaveWindow, true);
    doc.addEventListener('scroll', onScroll, true);
    win.addEventListener('resize', onResize);

    return {
        dispose() {
            doc.removeEventListener('mouseover', onOver, true);
            doc.removeEventListener('mouseout', onLeaveWindow, true);
            doc.removeEventListener('scroll', onScroll, true);
            win.removeEventListener('resize', onResize);
            for (const el of [...managed.keys()]) drop(el);
            root.classList.remove(ROOT_CLASS);
        },
    };
}
