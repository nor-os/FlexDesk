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
 * The strip is never rebuilt: a select toggles classes on the same buttons, so
 * a click that lands while a tab is being selected keeps its target.
 */

/** Badge levels, worst last. Any other value draws the neutral badge. */
export const BADGE_LEVELS = Object.freeze(['info', 'warning', 'alert']);

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
    const doc = container.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'twm-bp';
    const strip = doc.createElement('div');
    strip.className = 'twm-bp__tabs';
    strip.setAttribute('role', 'tablist');
    const body = doc.createElement('div');
    body.className = 'twm-bp__body';
    root.append(strip, body);
    container.appendChild(root);

    const byId = new Map(panes.map((pane) => [pane.id, pane]));
    const tabs = new Map();
    const mounted = new Map();
    let active = null;
    let chosen = false;
    let destroyed = false;

    for (const pane of panes) {
        const tab = doc.createElement('button');
        tab.type = 'button';
        tab.className = 'twm-bp__tab';
        tab.dataset.pane = pane.id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', 'false');
        const label = doc.createElement('span');
        label.className = 'twm-bp__label';
        label.textContent = pane.label;
        const badge = doc.createElement('span');
        badge.className = 'twm-bp__badge';
        badge.hidden = true;
        tab.append(label, badge);
        tab.addEventListener('click', () => api.select(pane.id));
        strip.appendChild(tab);
        tabs.set(pane.id, tab);
    }

    function mount(id) {
        if (mounted.has(id)) return mounted.get(id);
        const pane = byId.get(id);
        const el = doc.createElement('div');
        el.className = 'twm-bp-pane';
        el.dataset.pane = id;
        el.setAttribute('role', 'tabpanel');
        el.hidden = id !== active;
        body.appendChild(el);
        const entry = { el, instance: null };
        mounted.set(id, entry);
        // ONE PANE THAT THROWS IS ONE EMPTY TAB, not a dead panel: the strip
        // and every other pane go on working.
        try {
            entry.instance = pane.mount?.(el, store ? store(pane) : null, api) ?? null;
        } catch (err) {
            console.error(`[bottom-panel] pane "${id}" failed to mount`, err);
        }
        return entry;
    }

    function show(id) {
        if (destroyed || !byId.has(id)) return false;
        active = id;
        for (const [key, tab] of tabs) {
            const on = key === id;
            tab.classList.toggle('twm-bp__tab--on', on);
            tab.setAttribute('aria-selected', String(on));
        }
        for (const [key, entry] of mounted) entry.el.hidden = key !== id;
        mount(id).instance?.onShow?.();
        onSelect?.(id, byId.get(id));
        return true;
    }

    const api = {
        root,
        /** Bring a tab to the front, and remember it. */
        select(id) {
            if (!show(id)) return;
            chosen = true;
            try { remember?.write?.(id); } catch { /* storage refused: not ours to fix */ }
        },
        /** The tab in front, or null. */
        active: () => active,
        /** `count` on a tab, coloured by `level`; nothing at zero. */
        setBadge(id, count, level = null) {
            const badge = tabs.get(id)?.querySelector('.twm-bp__badge');
            if (!badge) return;
            const n = Number(count) || 0;
            badge.hidden = n <= 0;
            badge.textContent = n > 99 ? '99+' : String(Math.max(n, 0));
            badge.className = 'twm-bp__badge'
                + (BADGE_LEVELS.includes(level) ? ` twm-bp__badge--${level}` : '');
        },
        /** A mounted pane's live instance, or null — how one tab hands work to
         *  another. `select` it first, which mounts it. */
        instance: (id) => mounted.get(id)?.instance ?? null,
        /** The panel is on screen again (its tile re-mounted): tell the pane in front. */
        reshow() {
            if (active) mounted.get(active)?.instance?.onShow?.();
        },
        /** Before the panel is torn down: every mounted pane saves. */
        async persist() {
            for (const entry of mounted.values()) await entry.instance?.persist?.();
        },
        /** Gone for good: panes save, then are destroyed; the bus is let go. */
        async destroy() {
            if (destroyed) return;
            await api.persist();
            destroyed = true;
            try { subscription?.dispose?.(); } catch { /* bus gone */ }
            for (const entry of mounted.values()) {
                try { entry.instance?.destroy?.(); } catch (err) {
                    console.warn('[bottom-panel] pane destroy failed', err);
                }
            }
            mounted.clear();
            root.remove();
        },
    };

    for (const pane of panes) if (pane.eager) mount(pane.id);

    const subscription = eventBus?.on?.('bottompanel:show',
        (payload) => api.select(payload?.tab ?? panes[0]?.id)) ?? null;

    show(byId.has(initial) ? initial : panes[0]?.id);

    if (remember?.read) {
        Promise.resolve()
            .then(() => remember.read())
            .then((saved) => {
                if (chosen || destroyed) return;
                if (byId.has(saved)) show(saved);
            })
            .catch(() => { /* nothing remembered */ });
    }

    return api;
}
