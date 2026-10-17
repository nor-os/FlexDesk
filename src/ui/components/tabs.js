/**
 * ══ ONE TAB STRIP, WITH AN OPTIONAL PANE HOST ════════════════════════════
 *
 * Three strips grew apart: the window manager's (`../../tiling/tab_strip.js`,
 * internal, over `NotebookTabBar`), the editor's (`NotebookTabBar`, keyed by
 * FILE PATH) and the bottom panel's (`createBottomPanelTabs`, tied to its bus
 * event). This one is keyed by whatever id the caller gives, knows no event
 * name and no file, and the bottom panel is built on it (FlexDesk STORY-0048).
 *
 *     const tabs = createTabs(el, {
 *         items: [{ id: 'a', label: 'Inputs', icon: 'tune' }, { id: 'b', label: 'Results', badge: 3 }],
 *         active: 'a',
 *         onSelect: (id, item) => …,
 *         mountPane: (item, el, tabs) => ({ onShow() {…}, destroy() {…} }),   // omit: strip only
 *     });
 *     tabs.update(nextItems, 'b');
 *     tabs.setBadge('b', 7, 'warning');
 *
 * AN ITEM is `{ id, label, icon?, title?, badge?, indicator?, closable?, dirty?, eager? }`:
 *   badge      a count (`n`, or `{ count, level }`); none at zero, `99+` above 99
 *   indicator  a dot: `true`, or a level (`info` | `warning` | `alert`)
 *   closable   draws a close mark and lets Delete close — both call `onClose(id)`;
 *              without an `onClose` there is nothing to close and none is drawn
 *   dirty      the unsaved dot
 *   eager      mount this item's pane at once instead of on first selection
 *
 * PANES are optional. Without `mountPane` this is a strip and nothing else.
 * With it, an item's pane is mounted the FIRST time it is selected — the tab in
 * front at creation counts — and never again; `eager` items mount at once, in
 * order, before it. `mountPane(item, el, tabs)` answers an instance or nothing;
 * the strip calls its `onShow()` each time its tab comes to the front and its
 * `destroy()` when the item goes (an `update` without it, or `destroy`). Panes
 * mount INSIDE `createTabs` before it has answered, so a pane reaches the strip
 * through its third argument, not the variable being assigned.
 *
 * `onSelect(id, item)` hears every change of the tab in front AFTER creation —
 * a click, a key, `select`, the bus, an `update` that had to move it — but not
 * the tab chosen at creation, which the caller already knows.
 *
 * THE BUS IS OPT-IN. Pass `eventBus` AND `selectEvent` (a name) and that event
 * selects a tab: the id is `selectFrom(payload)`, by default `payload.id`. No
 * event name, no subscription — whatever bus is passed.
 *
 * KEYS are the ARIA tabs pattern with automatic activation: ArrowLeft/Right move
 * the selection (wrapping), Home and End go to the ends, Delete closes a
 * closable tab. One tab is in the tab order — the one in front.
 *
 * OVERFLOW scrolls, never wraps: a vertical wheel moves the strip sideways and a
 * tab that comes to the front is scrolled into it (`../utils/strip_scroll.js`).
 *
 * CLASSES are BEM under `block` (default `twm-tabs`): `{block}` root,
 * `{block}--compact`, `{block}__tabs`, `{block}__tab`, `{block}__tab--on`,
 * `{block}__tab--dirty`, `{block}__icon`, `{block}__label`, `{block}__badge`
 * (`--{level}`), `{block}__indicator` (`--{level}`), `{block}__dirty`,
 * `{block}__close`, `{block}__body`, `{block}-pane`. The bottom panel passes
 * `twm-bp` and gets its existing markup. Tabs and panes carry the item id in
 * `data-{dataKey}` (default `tab-id`).
 *
 * The strip is never rebuilt: a select toggles classes on the same buttons and
 * an `update` keeps the button of every id it keeps, so a click that lands
 * while a tab is being selected keeps its target.
 */

import { DragReorder } from './drag_reorder.js';
import { revealInStrip, wheelStripSideways } from '../utils/strip_scroll.js';

/** Badge and indicator levels, worst last. Any other value draws the neutral one. */
export const TAB_LEVELS = Object.freeze(['info', 'warning', 'alert']);

let stripCount = 0;

/**
 * @param {HTMLElement} container
 * @param {object}    opts
 * @param {Array}     opts.items           see AN ITEM above
 * @param {string}   [opts.active]         the tab in front at creation; the first by default
 * @param {Function} [opts.onSelect]       `(id, item)`
 * @param {Function} [opts.onClose]        `(id, item)` — the caller removes it with `update`
 * @param {Function} [opts.onReorder]      `(ids)` after a drag; omit and tabs do not drag
 * @param {Function} [opts.onContextMenu]  `(id, event, item)` on right-click
 * @param {Function} [opts.mountPane]      `(item, el, tabs)`; omit for a strip only
 * @param {object}   [opts.eventBus]
 * @param {string}   [opts.selectEvent]    the bus event that selects a tab
 * @param {Function} [opts.selectFrom]     `(payload) => id`; `payload.id` by default
 * @param {boolean}  [opts.compact]        the dense variant
 * @param {string}   [opts.label]          the tablist's accessible name
 * @param {string}   [opts.block]          the BEM block
 * @param {string}   [opts.dataKey]        the `data-*` key carrying an item's id
 */
export function createTabs(container, {
    items = [], active = null, onSelect = null, onClose = null, onReorder = null,
    onContextMenu = null, mountPane = null, eventBus = null, selectEvent = null,
    selectFrom = (payload) => payload?.id, compact = false, label = null,
    block = 'twm-tabs', dataKey = 'tab-id',
} = {}) {
    const doc = container.ownerDocument;
    const uid = `${block}-${++stripCount}`;
    const datasetKey = dataKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const cls = (part) => `${block}__${part}`;

    const root = doc.createElement('div');
    root.className = compact ? `${block} ${block}--compact` : block;
    const strip = doc.createElement('div');
    strip.className = cls('tabs');
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-orientation', 'horizontal');
    if (label) strip.setAttribute('aria-label', label);
    root.appendChild(strip);
    let body = null;
    if (mountPane) {
        body = doc.createElement('div');
        body.className = cls('body');
        root.appendChild(body);
    }
    container.appendChild(root);

    /** id → the caller's item, as last given (setBadge/setIndicator write here). */
    let order = [];
    const byId = new Map();
    /** id → { el, serial } for every tab drawn. */
    const tabs = new Map();
    /** id → { el, instance } for every pane mounted. */
    const panes = new Map();
    let current = null;
    let serial = 0;
    let destroyed = false;

    // ── a tab ───────────────────────────────────────────────────────────

    function tabFor(id) {
        let entry = tabs.get(id);
        if (entry) return entry;
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = cls('tab');
        el.dataset[datasetKey] = id;
        el.id = `${uid}-tab-${++serial}`;
        el.setAttribute('role', 'tab');
        el.setAttribute('aria-selected', 'false');
        el.tabIndex = -1;
        entry = { el };
        tabs.set(id, entry);
        return entry;
    }

    function badgeOf(item) {
        const b = item.badge;
        if (b && typeof b === 'object') return { count: Number(b.count) || 0, level: b.level ?? null };
        return { count: Number(b) || 0, level: null };
    }

    function drawBadge(span, { count, level }) {
        span.hidden = count <= 0;
        span.textContent = count > 99 ? '99+' : String(Math.max(count, 0));
        span.className = cls('badge') + (TAB_LEVELS.includes(level) ? ` ${cls('badge')}--${level}` : '');
    }

    function drawIndicator(span, value) {
        span.hidden = !value;
        span.className = cls('indicator')
            + (TAB_LEVELS.includes(value) ? ` ${cls('indicator')}--${value}` : '');
    }

    function draw(id) {
        const item = byId.get(id);
        const { el } = tabFor(id);
        el.classList.toggle(`${cls('tab')}--dirty`, !!item.dirty);
        if (item.title) el.title = item.title; else el.removeAttribute('title');
        const parts = [];
        if (item.icon) {
            const icon = doc.createElement('span');
            icon.className = `material-symbols-outlined ${cls('icon')}`;
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = item.icon;
            parts.push(icon);
        }
        const text = doc.createElement('span');
        text.className = cls('label');
        text.textContent = item.label ?? String(id);
        parts.push(text);
        const badge = doc.createElement('span');
        drawBadge(badge, badgeOf(item));
        parts.push(badge);
        const dot = doc.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        drawIndicator(dot, item.indicator);
        parts.push(dot);
        if (item.dirty) {
            const dirty = doc.createElement('span');
            dirty.className = cls('dirty');
            dirty.setAttribute('aria-label', 'unsaved');
            dirty.textContent = '●';
            parts.push(dirty);
        }
        if (item.closable && onClose) {
            // A mark, not a button: a button inside the tab's button is not
            // HTML. The keyboard closes with Delete.
            const close = doc.createElement('span');
            close.className = cls('close');
            close.setAttribute('aria-hidden', 'true');
            close.title = 'Close';
            close.textContent = '×';
            parts.push(close);
        }
        el.replaceChildren(...parts);
    }

    // ── panes ───────────────────────────────────────────────────────────

    function mount(id) {
        if (!mountPane || panes.has(id)) return panes.get(id) ?? null;
        const el = doc.createElement('div');
        el.className = `${block}-pane`;
        el.dataset[datasetKey] = id;
        el.id = `${tabFor(id).el.id}-pane`;
        el.setAttribute('role', 'tabpanel');
        el.setAttribute('aria-labelledby', tabFor(id).el.id);
        el.hidden = id !== current;
        body.appendChild(el);
        tabFor(id).el.setAttribute('aria-controls', el.id);
        const entry = { el, instance: null };
        panes.set(id, entry);
        // ONE PANE THAT THROWS IS ONE EMPTY TAB, not a dead strip: the strip
        // and every other pane go on working.
        try {
            entry.instance = mountPane(byId.get(id), el, api) ?? null;
        } catch (err) {
            console.error(`[tabs] pane "${id}" failed to mount`, err);
        }
        return entry;
    }

    function unmount(id) {
        const entry = panes.get(id);
        if (!entry) return;
        panes.delete(id);
        try { entry.instance?.destroy?.(); } catch (err) {
            console.warn(`[tabs] pane "${id}" destroy failed`, err);
        }
        entry.el.remove();
    }

    // ── the tab in front ────────────────────────────────────────────────

    /** Classes, ARIA and pane visibility, for the tab in front. */
    function paint() {
        for (const [key, { el }] of tabs) {
            const on = key === current;
            el.classList.toggle(`${cls('tab')}--on`, on);
            el.setAttribute('aria-selected', String(on));
            el.tabIndex = on ? 0 : -1;
        }
        for (const [key, entry] of panes) entry.el.hidden = key !== current;
    }

    /** Make `id` the tab in front. `notify` is false only at creation. */
    function show(id, notify) {
        current = id;
        paint();
        if (id != null) {
            mount(id)?.instance?.onShow?.();
            revealInStrip(strip, tabs.get(id).el);
        }
        if (notify) onSelect?.(id, id == null ? null : byId.get(id));
    }

    function select(id, { focus = false } = {}) {
        if (destroyed || !byId.has(id)) return false;
        if (id !== current) show(id, true);
        if (focus) tabs.get(id).el.focus();
        return true;
    }

    // ── items ───────────────────────────────────────────────────────────

    function setItems(next) {
        const seen = new Set();
        order = [];
        byId.clear();
        for (const item of next) {
            if (item?.id == null || seen.has(item.id)) continue;
            seen.add(item.id);
            order.push(item.id);
            byId.set(item.id, { ...item });
        }
        for (const id of [...tabs.keys()]) {
            if (byId.has(id)) continue;
            tabs.get(id).el.remove();
            tabs.delete(id);
            unmount(id);
        }
        for (const id of order) {
            draw(id);
            strip.appendChild(tabs.get(id).el);   // moves a kept one into its place
        }
        dragReorder?.attach();
    }

    // ── events ──────────────────────────────────────────────────────────

    const idOf = (target) => {
        const el = target?.closest?.(`.${cls('tab')}`);
        return el && strip.contains(el) ? el.dataset[datasetKey] : null;
    };

    function onClick(e) {
        const id = idOf(e.target);
        if (id == null) return;
        if (e.target.closest(`.${cls('close')}`)) { onClose?.(id, byId.get(id)); return; }
        select(id);
    }

    function onAuxClick(e) {
        const id = idOf(e.target);
        if (e.button !== 1 || id == null || !byId.get(id)?.closable || !onClose) return;
        e.preventDefault();
        onClose(id, byId.get(id));
    }

    function onKeyDown(e) {
        const id = idOf(e.target);
        if (id == null || e.altKey || e.ctrlKey || e.metaKey) return;
        const at = order.indexOf(id);
        let to = null;
        if (e.key === 'ArrowRight') to = order[(at + 1) % order.length];
        else if (e.key === 'ArrowLeft') to = order[(at - 1 + order.length) % order.length];
        else if (e.key === 'Home') to = order[0];
        else if (e.key === 'End') to = order[order.length - 1];
        else if (e.key === 'Delete' && byId.get(id)?.closable && onClose) {
            e.preventDefault();
            onClose(id, byId.get(id));
            return;
        }
        if (to == null) return;
        e.preventDefault();
        select(to, { focus: true });
    }

    function onMenu(e) {
        const id = idOf(e.target);
        if (id == null || !onContextMenu) return;
        e.preventDefault();
        onContextMenu(id, e, byId.get(id));
    }

    const onWheel = (e) => wheelStripSideways(strip, e);

    strip.addEventListener('click', onClick);
    strip.addEventListener('auxclick', onAuxClick);
    strip.addEventListener('keydown', onKeyDown);
    strip.addEventListener('contextmenu', onMenu);
    strip.addEventListener('wheel', onWheel, { passive: false });

    const dragReorder = onReorder ? new DragReorder({
        container: strip,
        itemSelector: `.${cls('tab')}`,
        keyAttr: datasetKey,
        axis: 'x',
        draggableGuard: (e) => !e.target.closest?.(`.${cls('close')}`),
        onReorder: (ids) => {
            order = ids.filter((id) => byId.has(id));
            onReorder(order.slice());
        },
    }) : null;

    // ── the api ─────────────────────────────────────────────────────────

    const api = {
        root,
        /** Bring a tab to the front. False for an id it does not have. */
        select: (id) => select(id),
        /** The tab in front, or null. */
        active: () => current,
        /** Whether a tab with this id is in the strip. */
        has: (id) => byId.has(id),
        /** The ids, in strip order. */
        ids: () => order.slice(),
        /**
         * Replace the items. The tab in front is `activeId` when given and
         * present, else the one in front now if it is still there, else the
         * first. Panes of items that went are destroyed.
         */
        update(next = [], activeId = undefined) {
            if (destroyed) return;
            setItems(next);
            const want = activeId !== undefined && byId.has(activeId) ? activeId
                : byId.has(current) ? current
                : order[0] ?? null;
            if (want !== current) show(want, true);
            else paint();   // a new button is drawn off; the kept ones keep their state
        },
        /** `count` on a tab, coloured by `level`; nothing at zero. */
        setBadge(id, count, level = null) {
            const item = byId.get(id);
            if (!item) return;
            item.badge = { count: Number(count) || 0, level };
            const span = tabs.get(id).el.querySelector(`.${cls('badge')}`);
            if (span) drawBadge(span, badgeOf(item));
        },
        /** The dot on a tab: a level, `true` for the neutral one, falsy for none. */
        setIndicator(id, value) {
            const item = byId.get(id);
            if (!item) return;
            item.indicator = value;
            const span = tabs.get(id).el.querySelector(`.${cls('indicator')}`);
            if (span) drawIndicator(span, value);
        },
        /** A mounted pane's instance, or null. */
        instance: (id) => panes.get(id)?.instance ?? null,
        /** Every mounted pane's instance, in mount order. */
        instances: () => [...panes.values()].map((p) => p.instance).filter(Boolean),
        /** Gone for good: panes are destroyed, the bus is let go, the markup removed. */
        destroy() {
            if (destroyed) return;
            destroyed = true;
            try { subscription?.dispose?.(); } catch { /* bus gone */ }
            strip.removeEventListener('click', onClick);
            strip.removeEventListener('auxclick', onAuxClick);
            strip.removeEventListener('keydown', onKeyDown);
            strip.removeEventListener('contextmenu', onMenu);
            strip.removeEventListener('wheel', onWheel);
            dragReorder?.destroy();
            for (const id of [...panes.keys()]) unmount(id);
            root.remove();
        },
    };

    setItems(items);
    current = byId.has(active) ? active : order[0] ?? null;
    for (const id of order) if (byId.get(id).eager) mount(id);
    show(current, false);

    const subscription = eventBus && selectEvent
        ? eventBus.on?.(selectEvent, (payload) => select(selectFrom(payload))) ?? null
        : null;

    return api;
}
