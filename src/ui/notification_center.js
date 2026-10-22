/**
 * Notification Center (js_new)
 *
 * Purpose
 * -------
 * Unified notifications/toasts/status-line controller consuming events from the rest of the app.
 *
 * Responsibilities
 * - Render queued notifications with namespace context and severity.
 * - Ingest `log:*` and domain-specific events to present user-facing feedback.
 * - Replace scattered `window.notify` / `status_view.js` hooks.
 *
 * Source Material
 * - html/js/status_view.js and ui_manager.js toast helpers.
 * - html/js/ui_utilities.js notification utilities.
 *
 * Progress toasts (0.17.0)
 * ------------------------
 * `show({ progress })` makes a toast that tracks a job: `progress` is a 0..1
 * fraction, `{ value, total }`, or `null` for indeterminate; `status` is a line
 * under the message and `counts` a label beside the bar. Such a toast is
 * persistent and collapsible, and it RUNS until `update()` gives it an outcome
 * severity (success, error or fatal), which ends its bar (done or error) for
 * good and lets a `durationMs` in the same patch dismiss it. Every toast is
 * drawn once and then patched: `update()` touches only its own nodes, and a
 * toast arriving or leaving moves no other toast's element, so a bar, a
 * collapsed state and a hovered button survive. A running progress toast is
 * never held behind "+N more" (and never dropped by 'drop'); it counts toward
 * `maxVisible`, so it takes the place of the newest other toast.
 */
import { ComponentBase } from './base/component_base.js';
import { getSetting } from '../core/settings.js';
import { setToastBus, getToastBus } from './components/toast.js';
import { ProgressBar } from './components/progress.js';

const SEVERITIES = ['info', 'success', 'warn', 'error', 'fatal'];

/** The severity a progress toast finishes with, and the state its bar ends in. */
const OUTCOME_BAR_STATE = Object.freeze({ success: 'done', error: 'error', fatal: 'error' });
const LOG_SEVERITY_MAP = {
    trace: 'info',
    debug: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
    fatal: 'fatal',
};

const DEFAULT_LOG_LEVELS = new Set(['warn', 'error', 'fatal']);

// Internal namespace identifiers that should not be shown as toast titles.
// Messages from these namespaces are self-descriptive and need no category header.
const SUPPRESSED_NAMESPACE_TITLES = new Set(['bootstrap', 'app']);

export class NotificationCenter extends ComponentBase {
    #items;
    #summaryEl;

    constructor({
        eventBus,
        logger,
        maxVisible = 3,
        historyLimit = 50,
        defaultDurationMs = 6000,
        logLevels = DEFAULT_LOG_LEVELS,
        // What happens past `maxVisible`. 'drop' (the default, as before 0.11):
        // the oldest toast leaves. 'collapse': the toasts on screen stay, the
        // rest wait behind one "+N more" toast, and each comes in as one closes
        // — a sticky alert nobody has read is never pushed off unseen.
        overflow = 'drop',
        // Called with the held-back toasts when the "+N more" toast is clicked.
        summaryAction = null,
    } = {}) {
        super({ eventBus, logger });

        this.maxVisible = maxVisible;
        this.overflow = overflow === 'collapse' ? 'collapse' : 'drop';
        this.summaryAction = typeof summaryAction === 'function' ? summaryAction : null;
        /** Toasts waiting behind the "+N more" summary ('collapse' only), oldest first. */
        this.held = [];
        this.historyLimit = historyLimit;
        this.defaultDurationMs = defaultDurationMs;
        this.logLevels = new Set(logLevels ?? DEFAULT_LOG_LEVELS);

        this.notifications = [];
        this.history = [];
        this.sequence = 0;
        this.activeTimers = new Map();
        this.eventDisposers = [];
        /** id -> the drawn toast's nodes, for the toasts on screen. */
        this.#items = new Map();
        this.#summaryEl = null;

        this.container = null;
        this.rootEl = null;
        this.listEl = null;
        this.liveRegionEl = null;
    }

    mount(container, props = {}) {
        // Always mount to document.body for reliable visibility
        // The passed container is ignored - we create our own fixed-position container
        const existingContainer = document.getElementById('notification-center-root');
        if (existingContainer) {
            this.container = existingContainer;
            this.rootEl = existingContainer.querySelector('.twm-notification-center');
            this.listEl = existingContainer.querySelector('.twm-notification-center__list');
            this.liveRegionEl = existingContainer.querySelector('.twm-notification-center__live-region');
            this._mounted = true;
            this.#subscribeEvents();
            this.#claimToastBus();
            return this;
        }

        // Create a new fixed-position container directly on body
        this.container = document.createElement('div');
        this.container.id = 'notification-center-root';
        this.container.style.cssText = 'position: fixed; right: 16px; bottom: 24px; z-index: 10000; pointer-events: none;';

        this.rootEl = document.createElement('div');
        this.rootEl.className = 'twm-notification-center';

        this.listEl = document.createElement('div');
        this.listEl.className = 'twm-notification-center__list';

        this.liveRegionEl = document.createElement('div');
        this.liveRegionEl.className = 'twm-notification-center__live-region';
        this.liveRegionEl.setAttribute('aria-live', 'polite');
        this.liveRegionEl.setAttribute('aria-atomic', 'true');
        this.liveRegionEl.style.position = 'absolute';
        this.liveRegionEl.style.width = '1px';
        this.liveRegionEl.style.height = '1px';
        this.liveRegionEl.style.overflow = 'hidden';
        this.liveRegionEl.style.clip = 'rect(1px, 1px, 1px, 1px)';

        this.rootEl.appendChild(this.listEl);
        this.rootEl.appendChild(this.liveRegionEl);
        this.container.appendChild(this.rootEl);
        document.body.appendChild(this.container);

        this._mounted = true;
        this.#subscribeEvents();
        this.#claimToastBus();

        if (Array.isArray(props.initialNotifications)) {
            props.initialNotifications.forEach((notification) => this.show(notification));
        }
        return this;
    }

    dispose() {
        this.#clearTimers();
        this.#unsubscribeEvents();
        // Give the toast helpers back to the console — unless someone has
        // pointed them at another bus since this centre mounted.
        if (this.eventBus && getToastBus() === this.eventBus) setToastBus(null);
        this.#items.forEach((entry) => entry.bar?.dispose());
        this.#items.clear();
        this.#summaryEl = null;
        if (this.rootEl?.parentNode) {
            this.rootEl.parentNode.removeChild(this.rootEl);
        }
        this.container = null;
        this.rootEl = null;
        this.listEl = null;
        this.liveRegionEl = null;
        super.dispose();
    }

    show(notification) {
        const normalized = this.#normalizeNotification(notification);
        this.#consoleLog(normalized);
        const running = NotificationCenter.#isRunning(normalized);
        if (this.overflow === 'collapse' && !running && this.notifications.length >= this.maxVisible) {
            // Held, not shown: its timer starts when it comes on screen.
            this.held.push(normalized);
            this.#recordHistory(normalized);
            this.#render();
            this.#announce(normalized);
            return normalized.id;
        }
        this.notifications.push(normalized);
        if (this.overflow === 'collapse') {
            // Only a running progress toast gets here past the limit: the
            // newest other toast steps back behind "+N more" to make room.
            this.#rebalance();
        } else if (this.notifications.length > this.maxVisible) {
            // The oldest leaves — but never a running progress toast.
            const idx = this.notifications.findIndex((item) => !NotificationCenter.#isRunning(item));
            if (idx !== -1) {
                const [removed] = this.notifications.splice(idx, 1);
                this.#stopTimer(removed.id);
                this.#recordHistory({ ...removed, dismissed: true, reason: 'overflow' });
            }
        }

        this.#recordHistory(normalized);
        this.#scheduleAutoDismiss(normalized);
        this.#render();
        this.#announce(normalized);
        return normalized.id;
    }

    dismiss(notificationId, reason = 'dismissed') {
        const idx = this.notifications.findIndex((item) => item.id === notificationId);
        if (idx === -1) {
            const h = this.held.findIndex((item) => item.id === notificationId);
            if (h === -1) return false;
            const [gone] = this.held.splice(h, 1);
            this.#recordHistory({ ...gone, dismissed: true, reason });
            this.#render();
            return true;
        }
        const [removed] = this.notifications.splice(idx, 1);
        this.#stopTimer(notificationId);
        this.#recordHistory({ ...removed, dismissed: true, reason });
        // A place on screen came free: the oldest held-back toast takes it.
        this.#rebalance();
        this.#render();
        return true;
    }

    /**
     * Change a notification in place: only its own nodes are touched, and no
     * other toast is redrawn. A held-back toast is changed too and shows the
     * change when it comes on screen.
     *
     * Fields: `message`, `title`, `description`, `severity`, `meta`, and for
     * progress toasts `progress` (fraction, `{ value, total }`, or `null` for
     * indeterminate), `status`, `counts` and `collapsed`; `progress` on a
     * plain toast turns it into a running progress toast (on screen, as with
     * show()). Giving a running progress toast an outcome severity (success,
     * error, fatal) finishes it, and its bar keeps the state it ended in: a
     * later severity only restyles the toast. A `durationMs` on a toast that
     * is not running (re)starts its auto-dismiss (0 keeps it until closed).
     *
     * @param {string} notificationId - The ID of the notification to update
     * @param {Object} updates - The fields to change
     * @returns {boolean} True if the notification was found and updated
     */
    update(notificationId, updates = {}) {
        const notification = this.notifications.find((item) => item.id === notificationId)
            ?? this.held.find((item) => item.id === notificationId);
        if (!notification) {
            return false;
        }
        const hadTitle = Boolean(notification.title);
        const hadDescription = Boolean(notification.description);
        const wasProgress = notification.progress !== undefined;
        const wasRunning = NotificationCenter.#isRunning(notification);

        if (updates.message !== undefined) notification.message = updates.message;
        if (updates.title !== undefined) notification.title = updates.title;
        if (updates.description !== undefined) notification.description = updates.description;
        if (updates.meta !== undefined) notification.meta = updates.meta;
        if (updates.status !== undefined) notification.status = updates.status ?? '';
        if (updates.counts !== undefined) notification.counts = updates.counts ?? '';
        if (updates.collapsed !== undefined) notification.collapsed = Boolean(updates.collapsed);
        if (updates.progress !== undefined) {
            if (wasProgress) {
                notification.progress = NotificationCenter.#normalizeProgress(updates.progress);
            } else {
                // A plain toast becomes a running progress toast, set up as show() would.
                Object.assign(notification, NotificationCenter.#progressFields({ ...notification, ...updates }));
                notification.persistent = true;
                this.#stopTimer(notification.id);
            }
        }
        if (updates.severity !== undefined) {
            notification.severity = this.#normalizeSeverity(updates.severity);
            const outcome = OUTCOME_BAR_STATE[notification.severity];
            if (NotificationCenter.#isRunning(notification) && outcome) notification.outcome = outcome;
        }
        const running = NotificationCenter.#isRunning(notification);
        const finished = wasRunning && !running;
        if (updates.durationMs !== undefined && !NotificationCenter.#isRunning(notification)) {
            notification.durationMs = this.#coerceDuration(updates.durationMs);
            notification.persistent = notification.durationMs === 0;
            if (this.notifications.includes(notification)) {
                this.#stopTimer(notification.id);
                this.#scheduleAutoDismiss(notification);
            }
        }

        const entry = this.#items.get(notification.id);
        if (entry) {
            const structural = hadTitle !== Boolean(notification.title)
                || hadDescription !== Boolean(notification.description)
                || wasProgress !== (notification.progress !== undefined);
            if (structural) {
                // A part appears or goes: rebuild this one toast, in its place.
                const next = this.#buildItem(notification);
                entry.el.replaceWith(next.el);
                entry.bar?.dispose();
                this.#items.set(notification.id, next);
            } else {
                this.#patchItem(entry, notification);
            }
        }
        if (finished) this.#announce(notification);
        // Started, it comes on screen whatever is held; finished, it folds
        // like any other toast.
        if (running !== wasRunning) this.#rebalance();
        this.#render();
        return true;
    }

    clearAll(reason = 'cleared') {
        [...this.notifications].forEach((notification) => this.dismiss(notification.id, reason));
    }

    ingestLogEntry(entry) {
        if (!entry || !this.logLevels.has(entry.level)) {
            return;
        }

        // Suppress state-guard warnings - these are internal and would cause a cascade
        // (NotificationCenter renders -> triggers state-guard -> logs warning -> creates notification -> repeat)
        if (entry.namespace === 'state-guard') {
            return;
        }

        const severity = LOG_SEVERITY_MAP[entry.level] ?? 'info';
        const suppressTitle = SUPPRESSED_NAMESPACE_TITLES.has(entry.namespace);
        const title = suppressTitle
            ? null
            : NotificationCenter.#formatNamespaceTitle(entry.namespace);
        // Info-level log entries from internal namespaces are noise in history
        const skipHistory = severity === 'info' && suppressTitle;
        this.show({
            title,
            message: entry.message,
            severity,
            namespace: entry.namespace,
            meta: entry.data,
            skipHistory,
        });
    }

    #consoleLog(notification) {
        if (notification.severity !== 'warn' && notification.severity !== 'error' && notification.severity !== 'fatal') {
            return;
        }
        const method = notification.severity === 'warn' ? console.warn : console.error; // eslint-disable-line no-console
        const prefix = notification.title ? `[${notification.title}]` : '[Notification]';
        const details = notification.meta ?? notification.description ?? '';
        method(`${prefix} ${notification.message}`, details); // eslint-disable-line no-console
    }

    #normalizeNotification(notification) {
        if (!notification) {
            throw new TypeError('Notification payload is required');
        }
        const id = notification.id ?? `notification-${++this.sequence}`;
        const severity = this.#normalizeSeverity(notification.severity ?? 'info');
        const isProgress = notification.progress !== undefined;
        return {
            ...(isProgress ? NotificationCenter.#progressFields(notification) : {}),
            id,
            title: notification.title ?? null,
            message: notification.message ?? '',
            description: notification.description ?? null,
            timestamp: notification.timestamp ?? Date.now(),
            severity,
            namespace: notification.namespace ?? null,
            durationMs: this.#coerceDuration(notification.durationMs),
            // A progress toast stays until it finishes (and then until its
            // finishing durationMs, or its ×).
            persistent: isProgress || Boolean(notification.persistent),
            skipHistory: Boolean(notification.skipHistory),
            actions: this.#normalizeActions(notification.actions),
            meta: notification.meta ?? null,
        };
    }

    #normalizeSeverity(severity) {
        const value = typeof severity === 'string' ? severity.toLowerCase() : 'info';
        if (!SEVERITIES.includes(value)) {
            return 'info';
        }
        return value;
    }

    #coerceDuration(duration) {
        if (duration === null || duration === undefined) {
            return this.defaultDurationMs;
        }
        const value = Number(duration);
        if (!Number.isFinite(value) || value < 0) {
            return this.defaultDurationMs;
        }
        return value;
    }

    toast(title, message, type = 'info') {
        // Legacy compatibility method
        this.show({
            title,
            message,
            severity: type,
            persistent: type === 'error' || type === 'fatal',
        });
    }

    error(titleOrMessage, message) {
        const hasTitle = message !== undefined;
        return this.show({
            title: hasTitle ? titleOrMessage : null,
            message: hasTitle ? message : titleOrMessage,
            severity: 'error',
            persistent: true,
        });
    }

    warn(titleOrMessage, message) {
        const hasTitle = message !== undefined;
        return this.show({
            title: hasTitle ? titleOrMessage : null,
            message: hasTitle ? message : titleOrMessage,
            severity: 'warn',
        });
    }

    info(titleOrMessage, message) {
        const hasTitle = message !== undefined;
        return this.show({
            title: hasTitle ? titleOrMessage : null,
            message: hasTitle ? message : titleOrMessage,
            severity: 'info',
        });
    }

    success(titleOrMessage, message) {
        const hasTitle = message !== undefined;
        return this.show({
            title: hasTitle ? titleOrMessage : null,
            message: hasTitle ? message : titleOrMessage,
            severity: 'success',
        });
    }

    #normalizeActions(actions) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return [];
        }
        return actions.map((action, idx) => ({
            id: action.id ?? `action-${idx}`,
            label: action.label ?? 'Action',
            handler: typeof action.handler === 'function' ? action.handler : null,
            eventName: action.eventName ?? null,
            payload: action.payload ?? null,
        }));
    }

    #scheduleAutoDismiss(notification) {
        if (notification.persistent || notification.durationMs === 0) {
            return;
        }
        const timer = setTimeout(() => {
            this.dismiss(notification.id, 'timeout');
        }, notification.durationMs);
        this.activeTimers.set(notification.id, timer);
    }

    #stopTimer(notificationId) {
        const timer = this.activeTimers.get(notificationId);
        if (timer) {
            clearTimeout(timer);
            this.activeTimers.delete(notificationId);
        }
    }

    #clearTimers() {
        this.activeTimers.forEach((timer) => clearTimeout(timer));
        this.activeTimers.clear();
    }

    #recordHistory(entry) {
        if (entry.skipHistory) return;
        this.history.push(entry);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }

    /** A progress toast that has not been given an outcome yet. */
    static #isRunning(notification) {
        return notification.progress !== undefined && !notification.outcome;
    }

    /**
     * The fields a progress toast carries, from a show() payload or an
     * update() that turns a plain toast into one. `outcome` is null while it
     * runs, then the state its bar ended in (done or error).
     */
    static #progressFields(source) {
        return {
            progress: NotificationCenter.#normalizeProgress(source.progress),
            status: source.status ?? '',
            counts: source.counts ?? '',
            collapsed: Boolean(source.collapsed),
            outcome: null,
        };
    }

    /** `null` (indeterminate), a 0..1 fraction, or `{ value, total }` -> ProgressBar input. */
    static #normalizeProgress(progress) {
        if (progress === null) return { indeterminate: true };
        if (typeof progress === 'number') {
            return { value: Number.isFinite(progress) ? progress : 0, max: null, indeterminate: false };
        }
        if (typeof progress === 'object') {
            const value = Number(progress.value);
            const total = Number(progress.total);
            return {
                value: Number.isFinite(value) ? value : 0,
                max: Number.isFinite(total) && total > 0 ? total : null,
                indeterminate: false,
            };
        }
        return { indeterminate: true };
    }

    /**
     * 'collapse' only: keep at most `maxVisible` on screen, counting running
     * progress toasts, which never leave and are never held (one that started
     * running while held comes on screen first). Past the limit the newest
     * other toast steps back to the front of the held queue (its timer
     * restarts when it returns); under it the oldest held toast comes in.
     */
    #rebalance() {
        if (this.overflow !== 'collapse') return;
        for (let i = 0; i < this.held.length;) {
            if (NotificationCenter.#isRunning(this.held[i])) this.notifications.push(...this.held.splice(i, 1));
            else i++;
        }
        while (this.notifications.length > this.maxVisible) {
            let idx = -1;
            for (let i = this.notifications.length - 1; i >= 0; i--) {
                if (!NotificationCenter.#isRunning(this.notifications[i])) { idx = i; break; }
            }
            if (idx === -1) break;
            const [back] = this.notifications.splice(idx, 1);
            this.#stopTimer(back.id);
            this.held.unshift(back);
        }
        while (this.held.length && this.notifications.length < this.maxVisible) {
            const next = this.held.shift();
            this.notifications.push(next);
            this.#scheduleAutoDismiss(next);
        }
    }

    /**
     * Draw the toasts on screen. Each toast's element is built once and kept:
     * a toast arriving or leaving only inserts or removes its own element, so
     * every other toast keeps its nodes (and its bar, collapsed state, hover).
     */
    #render() {
        if (!this._mounted || !this.listEl) {
            return;
        }
        const visible = new Set(this.notifications.map((n) => n.id));
        for (const [id, entry] of this.#items) {
            if (visible.has(id)) continue;
            entry.bar?.dispose();
            entry.el.remove();
            this.#items.delete(id);
        }
        const wanted = this.notifications.map((notification) => {
            let entry = this.#items.get(notification.id);
            if (!entry) {
                entry = this.#buildItem(notification);
                this.#items.set(notification.id, entry);
            }
            return entry.el;
        });
        const summary = this.#syncSummary();
        if (summary) wanted.push(summary);
        wanted.forEach((el, i) => {
            const at = this.listEl.children[i];
            if (at !== el) this.listEl.insertBefore(el, at ?? null);
        });
        // Anything after them is stale (another instance's toasts on a reused root).
        while (this.listEl.children.length > wanted.length) {
            this.listEl.lastElementChild.remove();
        }
    }

    // The held-back toasts, as one: "+N more". It is a button so the count is
    // reachable by keyboard; what it opens is the consumer's (summaryAction),
    // and it is also announced on the bus for a history panel to answer.
    #syncSummary() {
        if (!this.held.length) {
            this.#summaryEl?.remove();
            this.#summaryEl = null;
            return null;
        }
        if (!this.#summaryEl) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'twm-notification twm-notification--summary';
            more.addEventListener('click', () => {
                const held = [...this.held];
                try { this.summaryAction?.(held); } catch (err) { this.logger?.warn?.('summaryAction failed', err); }
                this.eventBus?.emit?.('notification:summary', { held });
            });
            this.#summaryEl = more;
        }
        const more = this.#summaryEl;
        const count = String(this.held.length);
        if (more.getAttribute('data-notification-summary') !== count) more.setAttribute('data-notification-summary', count);
        NotificationCenter.#setText(more, `+${count} more`);
        const tip = this.held.map((h) => h.title || h.message).join('\n');
        if (more.title !== tip) more.title = tip;
        return more;
    }

    static #setText(node, text) {
        const t = text == null ? '' : String(text);
        if (node.textContent !== t) node.textContent = t;
    }

    /** Build one toast's element; `#patchItem` then fills what can change. */
    #buildItem(notification) {
        const isProgress = notification.progress !== undefined;
        const item = document.createElement('div');
        // Use setAttribute to avoid StateGuard blocking dataset mutations
        item.setAttribute('data-notification-id', notification.id);
        const entry = { el: item, severity: null, titleEl: null, bodyEl: null, descriptionEl: null,
                        statusEl: null, bar: null, collapseBtn: null };

        const header = document.createElement('div');
        header.className = 'twm-notification__header';
        if (notification.title) {
            entry.titleEl = document.createElement('span');
            entry.titleEl.className = 'twm-notification__title';
            header.appendChild(entry.titleEl);
        }

        const timeEl = document.createElement('span');
        timeEl.className = 'twm-notification__timestamp';
        timeEl.textContent = this.#formatTimestamp(notification.timestamp);
        header.appendChild(timeEl);

        if (isProgress) {
            const toggle = document.createElement('button');
            toggle.className = 'twm-notification__collapse';
            toggle.type = 'button';
            toggle.innerHTML = '<span class="material-symbols-outlined">expand_more</span>';
            toggle.addEventListener('click', () => {
                this.update(notification.id, { collapsed: !notification.collapsed });
            });
            entry.collapseBtn = toggle;
            header.appendChild(toggle);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'twm-notification__close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        closeBtn.addEventListener('click', () => this.dismiss(notification.id, 'manual'));
        header.appendChild(closeBtn);
        item.appendChild(header);

        entry.bodyEl = document.createElement('div');
        entry.bodyEl.className = 'twm-notification__body';
        item.appendChild(entry.bodyEl);

        if (isProgress) {
            entry.bar = new ProgressBar(item, {
                ...notification.progress, showCount: false, className: 'twm-notification__progress',
            });
            entry.statusEl = document.createElement('div');
            entry.statusEl.className = 'twm-notification__status';
            item.appendChild(entry.statusEl);
        }

        if (notification.description) {
            entry.descriptionEl = document.createElement('div');
            entry.descriptionEl.className = 'twm-notification__description';
            item.appendChild(entry.descriptionEl);
        }

        if (notification.actions.length > 0) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'twm-notification__actions';
            notification.actions.forEach((action) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'twm-notification__action-btn';
                button.textContent = action.label;
                button.addEventListener('click', () => {
                    try {
                        if (action.handler) {
                            action.handler(notification, action);
                        } else if (action.eventName && this.eventBus) {
                            this.eventBus.emit(action.eventName, action.payload ?? { notificationId: notification.id });
                        }
                    } catch (err) {
                        this.logger?.error?.('twm-notification-center', 'Notification action failed', { err });
                    } finally {
                        // Don't auto-dismiss error/fatal notifications, or a job
                        // still running, after action clicks
                        if (notification.severity !== 'error' && notification.severity !== 'fatal'
                            && !NotificationCenter.#isRunning(notification)) {
                            this.dismiss(notification.id, 'action');
                        }
                    }
                });
                actionsEl.appendChild(button);
            });
            item.appendChild(actionsEl);
        }

        item.addEventListener('click', (event) => {
            if (event.target.closest('button') || NotificationCenter.#isRunning(notification)) {
                return;
            }
            this.dismiss(notification.id, 'click');
        });

        this.#patchItem(entry, notification);
        return entry;
    }

    /** Bring a drawn toast's nodes in line with its data, touching only what changed. */
    #patchItem(entry, notification) {
        const item = entry.el;
        if (entry.severity !== notification.severity) {
            if (entry.severity) item.classList.remove(`twm-notification--${entry.severity}`);
            item.classList.add('twm-notification', `twm-notification--${notification.severity}`);
            entry.severity = notification.severity;
        }
        if (entry.titleEl) NotificationCenter.#setText(entry.titleEl, notification.title);
        NotificationCenter.#setText(entry.bodyEl, notification.message);
        if (entry.descriptionEl) NotificationCenter.#setText(entry.descriptionEl, notification.description);
        if (!entry.bar) return;

        item.classList.add('twm-notification--progress');
        item.classList.toggle('twm-notification--collapsed', Boolean(notification.collapsed));
        const expanded = String(!notification.collapsed);
        if (entry.collapseBtn.getAttribute('aria-expanded') !== expanded) {
            entry.collapseBtn.setAttribute('aria-expanded', expanded);
            entry.collapseBtn.setAttribute('aria-label', notification.collapsed ? 'Expand notification' : 'Collapse notification');
        }
        NotificationCenter.#setText(entry.statusEl, notification.status);
        entry.statusEl.hidden = !notification.status;
        entry.bar.update({ ...notification.progress, label: notification.counts });
        const end = notification.outcome ?? 'running';
        if (entry.bar.state !== end) entry.bar.setState(end);
    }

    #formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    #announce(notification) {
        if (!this.liveRegionEl) {
            return;
        }
        const parts = [notification.title, notification.message].filter(Boolean);
        this.liveRegionEl.textContent = parts.join(': ');
    }

    #handleToast(payload = {}) {
        const message = payload.text ?? payload.message ?? (typeof payload === 'string' ? payload : '');
        if (!message) {
            return;
        }

        const persistent = payload.persistent === true || payload.autoHide === false;
        const durationMs = persistent ? 0 : (payload.durationMs ?? payload.duration ?? payload.timeout);
        this.show({
            title: payload.title ?? null,
            message,
            severity: payload.type ?? payload.severity ?? 'info',
            durationMs,
            persistent,
            namespace: payload.namespace ?? null,
            actions: payload.actions,
            meta: payload.meta ?? null,
        });
    }

    #subscribeEvents() {
        if (!this.eventBus) {
            return;
        }
        this.eventDisposers.push(
            this.eventBus.on('toast:show', (payload) => this.#handleToast(payload)),
            this.eventBus.on('notification:show', (payload) => this.show(payload)),
            this.eventBus.on('notification:update', (payload) => {
                if (payload?.id) {
                    this.update(payload.id, payload);
                }
            }),
            this.eventBus.on('log:entry', (entry) => this.ingestLogEntry(entry)),
            this.eventBus.on('workspace:save:failed', (payload) => {
                // Error toasts are shown by default unless explicitly disabled
                if (getSetting('workspace.save.showErrorToast', true)) {
                    this.show({
                        title: 'Workspace Save Failed',
                        message: payload?.reason ? `Save failed: ${payload.reason}` : 'Workspace save failed',
                        severity: 'error',
                        meta: payload,
                        persistent: true,
                    });
                }
            }),
            this.eventBus.on('workspace:save:completed', (payload) => {
                // Only show toast if enabled in settings
                if (getSetting('workspace.save.showToast', false)) {
                    this.show({
                        title: 'Workspace Saved',
                        message: 'Changes saved successfully',
                        severity: 'success',
                        durationMs: 3000,
                        meta: payload,
                        skipHistory: true,
                    });
                }
            }),
            this.eventBus.on('workspace:import:failed', (payload) => {
                // Error toasts are shown by default unless explicitly disabled
                if (getSetting('workspace.import.showErrorToast', true)) {
                    this.show({
                        title: 'Workspace Import Failed',
                        message: payload?.error?.message || 'Import failed',
                        severity: 'error',
                        meta: payload,
                        persistent: true,
                    });
                }
            }),
            this.eventBus.on('workspace:import:completed', (payload) => {
                // Show import completion toast if enabled in settings
                if (getSetting('workspace.import.showToast', true)) {
                    this.show({
                        title: 'Workspace Ready',
                        message: 'Workspace import completed',
                        severity: 'success',
                        durationMs: 3000,
                        meta: payload,
                        skipHistory: true,
                    });
                }
            }),
        );
    }

    /** The toast helpers (toast.js) emit on the bus of the centre mounted last. */
    #claimToastBus() {
        if (this.eventBus) setToastBus(this.eventBus);
    }

    #unsubscribeEvents() {
        this.eventDisposers.forEach((disposer) => {
            try {
                disposer?.dispose?.();
            } catch (err) {
                this.logger?.warn?.('twm-notification-center', 'Failed to remove event listener', { err });
            }
        });
        this.eventDisposers = [];
    }

    static #formatNamespaceTitle(namespace) {
        if (!namespace) return null;
        return namespace
            .split(/[-_]/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
}

NotificationCenter.SEVERITIES = SEVERITIES;
