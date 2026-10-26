/**
 * NotificationHistory - Bottom bar notification history panel
 *
 * Bell icon in the global-bottom-bar that opens a popover listing past notifications.
 * Reads from NotificationCenter.history and follows it through
 * `notificationCenter.subscribe()` (0.17.3): every entry the centre records — a
 * toast from `show()`/`warn()`/... or from the bus — is one unread, until the
 * popover is opened. The bus is not watched for toasts.
 *
 * THREE OPTIONS, all additive (FlexDesk STORY-0020); without them it is the bell
 * it always was:
 *
 *   mountPoint  the element the bell is appended to. Without it, the hard-coded
 *               `.twm-global-bottom-bar .twm-bar-right`, which only FlexDesk's own
 *               bottom bar has.
 *   alertLog    an alert log (`alert_log.js`). The badge is then the log's unread
 *               count, in the worst unread level's colour, and nothing when all is
 *               read — not a delta of a toast history the user may never have
 *               opened. A click opens the bottom panel's Alerts tab instead of the
 *               popover, and the toasts' "+N more" (`notification:summary`) does too.
 *   alertsTab   the tab a click asks for, `bottompanel:show { tab }`; 'alerts'.
 *   onOpen      a click, instead of the bus event — for an embedder with no bus,
 *               or whose panel must be opened before a tab can be chosen.
 *
 * A right-click on an entry opens the context menu with "Copy message"
 * (STORY-0131), the same as on its toast; the popover stays open meanwhile.
 */
import { showNotificationMenu } from '../notification_center.js';

export class NotificationHistory {
    constructor({ notificationCenter, eventBus, logger, mountPoint = null, alertLog = null,
                  alertsTab = 'alerts', onOpen = null } = {}) {
        this.notificationCenter = notificationCenter;
        this.eventBus = eventBus || null;
        this.logger = logger || console;
        this.mountPoint = mountPoint;
        this.alertLog = alertLog;
        this.alertsTab = alertsTab;
        this.onOpen = typeof onOpen === 'function' ? onOpen : null;

        this.triggerEl = null;
        this.badgeEl = null;
        /** Entries recorded since the popover was last opened. */
        this.unreadCount = 0;
        this._popoverCleanup = null;
        this._subscriptions = [];
    }

    mount() {
        const barRight = this.mountPoint
            || document.querySelector('.twm-global-bottom-bar .twm-bar-right');
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
            if (this.alertLog) this.#openAlerts();
            else this.#togglePanel();
        });

        if (this.alertLog) {
            this.triggerEl.setAttribute('data-tooltip', 'Alerts');
            this.triggerEl.setAttribute('aria-label', 'Alerts');
            this._subscriptions.push(this.alertLog.subscribe(() => this.#updateBadge()));
            const summary = this.eventBus?.on?.('notification:summary', () => this.#openAlerts());
            if (summary) this._subscriptions.push(() => summary.dispose?.());
            this.#updateBadge();
            return;
        }

        // What is in the history at mount is not unread.
        this.unreadCount = 0;
        const unsubscribe = this.notificationCenter?.subscribe?.(() => {
            this.unreadCount += 1;
            this.#updateBadge();
        });
        if (typeof unsubscribe === 'function') this._subscriptions.push(unsubscribe);
        this.#updateBadge();
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

    /** The Alerts tab, asked for on the bus — or the embedder's own verb. */
    #openAlerts() {
        if (this.onOpen) {
            try { this.onOpen(); } catch (err) { this.logger.warn?.('[NotificationHistory] onOpen failed', err); }
            return;
        }
        this.eventBus?.emit?.('bottompanel:show', { tab: this.alertsTab });
    }

    #updateBadge() {
        const historyLen = this.notificationCenter?.history?.length ?? 0;
        const unread = this.alertLog
            ? this.alertLog.unreadCount()
            : Math.min(this.unreadCount, historyLen);

        if (!this.badgeEl) return;

        if (this.alertLog) {
            const level = unread > 0 ? this.alertLog.worstUnread() : null;
            this.badgeEl.className = 'twm-notification-history__badge'
                + (level ? ` twm-notification-history__badge--${level}` : '');
            this.triggerEl?.classList.toggle('twm-notification-history__trigger--unread', unread > 0);
        }

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
        this.unreadCount = 0;
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
                this.unreadCount = 0;
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

        // The entries' context menu is outside the panel, and using it is not leaving it.
        const onDocDown = (ev) => {
            if (ev.target.closest?.('.twm-context-menu')) return;
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
            item.className = `twm-notification-history__item twm-notification-history__item--${severity}`;

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
            item.addEventListener('contextmenu', (event) => showNotificationMenu(event, entry, this.logger));

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
