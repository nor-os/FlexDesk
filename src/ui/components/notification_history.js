/**
 * NotificationHistory - Bottom bar notification history panel
 *
 * Bell icon in the global-bottom-bar that opens a popover listing past notifications.
 * Reads from NotificationCenter.history (no modifications to NotificationCenter needed).
 * Tracks unread count via lastSeenCount delta and updates a badge on the bell icon.
 */

export class NotificationHistory {
    constructor({ notificationCenter, eventBus, logger } = {}) {
        this.notificationCenter = notificationCenter;
        this.eventBus = eventBus || null;
        this.logger = logger || console;

        this.triggerEl = null;
        this.badgeEl = null;
        this.lastSeenCount = 0;
        this._popoverCleanup = null;
        this._subscriptions = [];
    }

    mount() {
        const barRight = document.querySelector('.twm-global-bottom-bar .twm-bar-right');
        if (!barRight) {
            this.logger.warn?.('[NotificationHistory] .bar-right not found');
            return;
        }

        // Build trigger button
        this.triggerEl = document.createElement('button');
        this.triggerEl.className = 'twm-notification-history__trigger twm-has-tooltip';
        this.triggerEl.setAttribute('data-tooltip', 'Notification history');
        this.triggerEl.setAttribute('aria-label', 'Notification history');
        this.triggerEl.innerHTML =
            '<span class="material-symbols-outlined">notifications</span>' +
            '<span class="twm-notification-history__badge" style="display:none">0</span>';

        this.badgeEl = this.triggerEl.querySelector('.twm-notification-history__badge');

        // Park the bell as the LAST child of .bar-right so it always
        // sits at the far-right edge of the status bar — past the
        // tick readout, streaming dot, and anything else that the
        // global actions cluster mounts before it.
        barRight.appendChild(this.triggerEl);

        this.triggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#togglePanel();
        });

        // Sync initial count so existing history doesn't show as unread
        this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;

        this.#subscribeEvents();
    }

    unmount() {
        this.#closePanel();
        this._subscriptions.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this._subscriptions = [];
        if (this.triggerEl?.parentNode) {
            this.triggerEl.parentNode.removeChild(this.triggerEl);
        }
        this.triggerEl = null;
        this.badgeEl = null;
    }

    #subscribeEvents() {
        if (!this.eventBus) return;

        // Update badge whenever a new notification comes in
        const badgeUpdate = () => queueMicrotask(() => this.#updateBadge());
        const events = ['toast:show', 'notification:show', 'log:entry',
            'workspace:save:failed', 'workspace:import:failed'];

        events.forEach(name => {
            this.eventBus.on(name, badgeUpdate);
            this._subscriptions.push(() => this.eventBus.off(name, badgeUpdate));
        });
    }

    #updateBadge() {
        const historyLen = this.notificationCenter?.history?.length ?? 0;
        const unread = Math.max(0, historyLen - this.lastSeenCount);

        if (!this.badgeEl) return;

        if (unread > 0) {
            this.badgeEl.textContent = unread > 99 ? '99+' : String(unread);
            this.badgeEl.style.display = '';
        } else {
            this.badgeEl.style.display = 'none';
        }
    }

    #togglePanel() {
        if (this._popoverCleanup) {
            this.#closePanel();
        } else {
            this.#openPanel();
        }
    }

    #closePanel() {
        if (typeof this._popoverCleanup === 'function') {
            try { this._popoverCleanup(); } catch (_) { /* ignore */ }
            this._popoverCleanup = null;
        }
    }

    #openPanel() {
        this.#closePanel();

        // Mark all as seen
        this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;
        this.#updateBadge();

        const panel = document.createElement('div');
        panel.className = 'twm-notification-history__panel';

        // Header
        const header = document.createElement('div');
        header.className = 'twm-notification-history__header';
        header.innerHTML =
            '<span class="twm-notification-history__title">Notifications</span>' +
            '<button class="twm-notification-history__clear-btn twm-has-tooltip" data-tooltip="Clear all" aria-label="Clear all">' +
                '<span class="material-symbols-outlined">delete_sweep</span>' +
            '</button>' +
            '<button class="twm-notification-history__close-btn twm-has-tooltip" data-tooltip="Close" aria-label="Close">' +
                '<span class="material-symbols-outlined">close</span>' +
            '</button>';
        panel.appendChild(header);

        // List
        const list = document.createElement('div');
        list.className = 'twm-notification-history__list';
        panel.appendChild(list);

        this.#renderList(list);

        // Wire header buttons
        header.querySelector('.twm-notification-history__close-btn')
            .addEventListener('click', () => this.#closePanel());

        header.querySelector('.twm-notification-history__clear-btn')
            .addEventListener('click', () => {
                this.notificationCenter.history.splice(0);
                this.lastSeenCount = 0;
                this.#updateBadge();
                this.#renderList(list);
            });

        // Position and attach
        document.body.appendChild(panel);
        this.#positionPanel(panel);

        // Popover lifecycle (same pattern as ValidationStatus)
        const cleanup = () => {
            document.removeEventListener('mousedown', onDocDown, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onResize, true);
            try { panel.remove(); } catch (_) { /* ignore */ }
            this._popoverCleanup = null;
        };
        this._popoverCleanup = cleanup;

        const onDocDown = (ev) => {
            if (!panel.contains(ev.target) && !this.triggerEl.contains(ev.target)) cleanup();
        };
        const onKey = (ev) => { if (ev.key === 'Escape') cleanup(); };
        const onResize = () => cleanup();

        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize, true);
    }

    #renderList(listEl) {
        listEl.innerHTML = '';
        const history = this.notificationCenter?.history ?? [];

        if (history.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'twm-notification-history__empty';
            empty.textContent = 'No notifications';
            listEl.appendChild(empty);
            return;
        }

        // Reverse chronological
        const fragment = document.createDocumentFragment();
        for (let i = history.length - 1; i >= 0; i--) {
            const entry = history[i];
            const item = document.createElement('div');
            const severity = entry.severity || 'info';
            item.className = `twm-notification-history__item notification-history__item--${severity}`;

            const itemHeader = document.createElement('div');
            itemHeader.className = 'twm-notification-history__item-header';

            if (entry.title) {
                const titleEl = document.createElement('span');
                titleEl.className = 'twm-notification-history__item-title';
                titleEl.textContent = entry.title;
                itemHeader.appendChild(titleEl);
            }

            const timeEl = document.createElement('span');
            timeEl.className = 'twm-notification-history__item-time';
            timeEl.textContent = this.#formatTime(entry.timestamp);
            itemHeader.appendChild(timeEl);

            item.appendChild(itemHeader);

            const body = document.createElement('div');
            body.className = 'twm-notification-history__item-body';
            body.textContent = entry.message || '';
            item.appendChild(body);

            fragment.appendChild(item);
        }
        listEl.appendChild(fragment);
    }

    #positionPanel(panel) {
        if (!this.triggerEl) return;

        const triggerRect = this.triggerEl.getBoundingClientRect();
        const panelWidth = panel.getBoundingClientRect().width;
        const gap = 8;

        let left = triggerRect.right - panelWidth;

        // Clamp horizontally to the viewport.
        const vw = window.innerWidth;
        left = Math.max(8, Math.min(left, vw - panelWidth - 8));

        // Anchor by the panel's BOTTOM edge, pinned just above the bell.
        // Anchoring by `top` leaves the box floating when its content shrinks
        // (notifications cleared/removed): the top stays put while the bottom
        // lifts away from the bell, stranding the panel in mid-air. Pinning
        // the bottom keeps it glued to the bottom bar and lets it grow/shrink
        // upward — no repositioning needed on re-render.
        const bottom = window.innerHeight - (triggerRect.top - gap);

        // Never let the panel run off the top of the viewport: cap its height
        // to the space above the bell (within the design max). The list
        // scrolls within whatever remains.
        const available = triggerRect.top - gap - 8;
        panel.style.maxHeight = `${Math.max(0, Math.min(420, Math.round(available)))}px`;

        panel.style.left = `${Math.round(left)}px`;
        panel.style.bottom = `${Math.round(bottom)}px`;
        panel.style.top = 'auto';
    }

    #formatTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}
