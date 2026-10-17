/**
 * ══ THE BOTTOM PANEL'S TAB HOST ══════════════════════════════════════════
 *
 * The `.twm-bp*` CSS shipped for a long time with no JS behind it, and two
 * embedders wrote the same strip on top of it: bugdesk (Alerts and Changes,
 * with a count on each tab) and Tables (SQL, Database, History, Activity, each
 * pane with storage of its own). This is the two merged, so the third embedder
 * writes none of it (FlexDesk STORY-0018).
 *
 *     const tabs = createBottomPanelTabs(host, {
 *         panes: [{ id: 'alerts', label: 'Alerts', eager: true, mount(el, store, api) { … } }],
 *         remember: { read: () => saved, write: (id) => … },
 *         eventBus,
 *     });
 *     tabs.setBadge('alerts', 3, 'warning');
 *     eventBus.emit('bottompanel:show', { tab: 'alerts' });
 *
 * A PANE is `{ id, label, mount(el, store, api), eager? }`. `mount` answers an
 * instance, or nothing; the host calls the instance's `onShow()` each time its
 * tab comes to the front, `persist()` before the panel goes, `destroy()` when
 * it is gone for good. A pane is mounted the first time it is shown — or at
 * once, with `eager: true`, when its tab carries a count that must be right
 * before anyone opens it (bugdesk's Alerts). Those two mount INSIDE this call,
 * before it has answered: a pane reaches the host through its `api` argument
 * (`api.setBadge(…)`), never through the variable the call is being assigned to.
 *
 * `store` is the pane's OWN persistence, from the embedder's `store(pane)`, or
 * null. COLLAPSING A PANEL DESTROYS ITS CONTENT (the tile leaf goes, and its
 * GC calls `destroy`), so a pane holding unsaved state — half-written SQL —
 * saves it itself; the host cannot know what that is.
 *
 * `remember` keeps the tab last in front, in whatever store the embedder has
 * (bugdesk: localStorage; Tables: its server blob, beside the panel's height).
 * Its `read` may answer a promise. A remembered tab no longer offered falls
 * back to the first; and A TAB A CALLER ALREADY CHOSE WINS — the read is a
 * round trip, and a panel opened BY a button for one tab used to be put back
 * on the remembered one when the read answered (Tables, 2026-10-12).
 *
 * `bottompanel:show` on the embedder's bus, with `{ tab }`, brings a tab to the
 * front (a toast's "+N more" asks for Alerts). The host only selects; whether
 * the panel itself is open is the embedder's (a tile it toggles), so the bus
 * event is the embedder's to hear too.
 *
 * The strip is `createTabs` (`../ui/components/tabs.js`, STORY-0048) under the
 * `twm-bp` block: this file adds only what a bottom panel has and a strip does
 * not — the pane's own store, the remembered tab, `persist`, and its event.
 */

import { createTabs, TAB_LEVELS } from '../ui/components/tabs.js';

/** Badge levels, worst last. Any other value draws the neutral badge. */
export const BADGE_LEVELS = TAB_LEVELS;

/**
 * @param {HTMLElement} container
 * @param {object}   opts
 * @param {Array}    opts.panes      `{ id, label, mount(el, store, api), eager? }`
 * @param {object}  [opts.remember]  `{ read(): id|Promise<id>, write(id) }`
 * @param {Function}[opts.store]     `(pane) => { read, write } | null` — a pane's own storage
 * @param {object}  [opts.eventBus]  hears `bottompanel:show`
 * @param {Function}[opts.onSelect]  `(id, pane)` — e.g. the tile's title
 * @param {string}  [opts.initial]   the tab in front before `remember` answers
 */
export function createBottomPanelTabs(container, {
    panes = [], remember = null, store = null, eventBus = null, onSelect = null, initial = null,
} = {}) {
    const byId = new Map(panes.map((pane) => [pane.id, pane]));
    // A tab put in front by THIS FILE (the remembered one) is not a choice: it
    // is neither written back nor allowed to beat a choice made meanwhile.
    let restoring = false;
    let chosen = false;
    let destroyed = false;
    // Eager panes and the first one shown mount inside `createTabs`, before it
    // has answered; `mountPane` hands the strip (and `api.root`) over then, so
    // a pane sees the whole api inside its `mount`.
    let strip = null;

    const api = {
        root: null,
        /** Bring a tab to the front, and remember it. */
        select(id) {
            if (destroyed || !byId.has(id)) return;
            chosen = true;
            if (strip.active() !== id) { strip.select(id); return; }
            // Already in front: asked for again (a click on it, a toast's
            // "+N more"), so the pane is told again and the choice is
            // remembered, as any select.
            strip.instance(id)?.onShow?.();
            remembered(id);
        },
        /** The tab in front, or null. */
        active: () => strip.active(),
        /** `count` on a tab, coloured by `level`; nothing at zero. */
        setBadge: (id, count, level = null) => strip.setBadge(id, count, level),
        /** A mounted pane's live instance, or null — how one tab hands work to
         *  another. `select` it first, which mounts it. */
        instance: (id) => strip.instance(id),
        /** The panel is on screen again (its tile re-mounted): tell the pane in front. */
        reshow() {
            strip.instance(strip.active())?.onShow?.();
        },
        /** Before the panel is torn down: every mounted pane saves. */
        async persist() {
            for (const instance of strip.instances()) await instance.persist?.();
        },
        /** Gone for good: panes save, then are destroyed; the bus is let go. */
        async destroy() {
            if (destroyed) return;
            await api.persist();
            destroyed = true;
            try { subscription?.dispose?.(); } catch { /* bus gone */ }
            strip.destroy();
        },
    };

    function remembered(id) {
        onSelect?.(id, byId.get(id));
        try { remember?.write?.(id); } catch { /* storage refused: not ours to fix */ }
    }

    strip = createTabs(container, {
        block: 'twm-bp',
        dataKey: 'pane',
        items: panes.map(({ id, label, eager }) => ({ id, label, eager: !!eager })),
        active: byId.has(initial) ? initial : panes[0]?.id,
        mountPane: (item, el, tabs) => {
            strip ??= tabs;
            api.root ??= tabs.root;
            const pane = byId.get(item.id);
            return pane.mount?.(el, store ? store(pane) : null, api) ?? null;
        },
        onSelect: (id) => {
            if (restoring) { onSelect?.(id, byId.get(id)); return; }
            chosen = true;
            remembered(id);
        },
        // A click on the tab already in front is a select here, as it always
        // was: the pane hears onShow again and the choice is remembered.
        onReselect: (id) => api.select(id),
    });
    api.root ??= strip.root;
    if (strip.active() != null) onSelect?.(strip.active(), byId.get(strip.active()));

    // The bus is the bottom panel's, not the strip's: a `bottompanel:show` for
    // the tab already in front still tells its pane, which a strip does not.
    const subscription = eventBus?.on?.('bottompanel:show',
        (payload) => api.select(payload?.tab ?? panes[0]?.id)) ?? null;

    if (remember?.read) {
        Promise.resolve()
            .then(() => remember.read())
            .then((saved) => {
                if (chosen || destroyed || !byId.has(saved)) return;
                if (strip.active() === saved) {
                    // Already in front: shown again, as it always was — the
                    // pane hears onShow and the caller onSelect, nothing is
                    // written back.
                    strip.instance(saved)?.onShow?.();
                    onSelect?.(saved, byId.get(saved));
                    return;
                }
                restoring = true;
                try { strip.select(saved); } finally { restoring = false; }
            })
            .catch(() => { /* nothing remembered */ });
    }

    return api;
}
