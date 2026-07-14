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
 */
import { ComponentBase } from './base/component_base.js';
import { getSetting } from '../core/settings.js';

const SEVERITIES = ['info', 'success', 'warn', 'error', 'fatal'];
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
    constructor({
        eventBus,
        logger,
        maxVisible = 3,
        historyLimit = 50,
        defaultDurationMs = 6000,
        logLevels = DEFAULT_LOG_LEVELS,
    } = {}) {
        super({ eventBus, logger });

        this.maxVisible = maxVisible;
        this.historyLimit = historyLimit;
        this.defaultDurationMs = defaultDurationMs;
        this.logLevels = new Set(logLevels ?? DEFAULT_LOG_LEVELS);

        this.notifications = [];
        this.history = [];
        this.sequence = 0;
        this.activeTimers = new Map();
        this.eventDisposers = [];

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
            this.liveRegionEl = existingContainer.querySelector('.notification-center__live-region');
            this._mounted = true;
            this.#subscribeEvents();
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
        this.liveRegionEl.className = 'notification-center__live-region';
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

        if (Array.isArray(props.initialNotifications)) {
            props.initialNotifications.forEach((notification) => this.show(notification));
        }
        return this;
    }

    dispose() {
        this.#clearTimers();
        this.#unsubscribeEvents();
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
        this.notifications.push(normalized);
        if (this.notifications.length > this.maxVisible) {
            const removed = this.notifications.shift();
            this.#stopTimer(removed.id);
            this.#recordHistory({ ...removed, dismissed: true, reason: 'overflow' });
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
            return false;
        }
        const [removed] = this.notifications.splice(idx, 1);
        this.#stopTimer(notificationId);
        this.#recordHistory({ ...removed, dismissed: true, reason });
        this.#render();
        return true;
    }

    /**
     * Update an existing notification's message in place without re-rendering.
     * This prevents the flicker caused by dismiss+show.
     * @param {string} notificationId - The ID of the notification to update
     * @param {Object} updates - Object with fields to update (message, title, etc.)
     * @returns {boolean} True if the notification was found and updated
     */
    update(notificationId, updates = {}) {
        const notification = this.notifications.find((item) => item.id === notificationId);
        if (!notification) {
            return false;
        }

        // Update allowed fields
        if (updates.message !== undefined) notification.message = updates.message;
        if (updates.title !== undefined) notification.title = updates.title;
        if (updates.severity !== undefined) notification.severity = this.#normalizeSeverity(updates.severity);
        if (updates.meta !== undefined) notification.meta = updates.meta;

        // Update the DOM directly without full re-render
        const notificationEl = this.listEl?.querySelector(`[data-notification-id="${notificationId}"]`);
        if (notificationEl) {
            const bodyEl = notificationEl.querySelector('.twm-notification__body');
            if (bodyEl && updates.message !== undefined) {
                bodyEl.textContent = updates.message;
            }
            const titleEl = notificationEl.querySelector('.twm-notification__title');
            if (titleEl && updates.title !== undefined) {
                titleEl.textContent = updates.title;
            }
        } else {
            // Fallback to full re-render if DOM element not found
            this.#render();
        }

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
        return {
            id,
            title: notification.title ?? null,
            message: notification.message ?? '',
            description: notification.description ?? null,
            timestamp: notification.timestamp ?? Date.now(),
            severity,
            namespace: notification.namespace ?? null,
            durationMs: this.#coerceDuration(notification.durationMs),
            persistent: Boolean(notification.persistent),
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

    #render() {
        if (!this._mounted || !this.listEl) {
            return;
        }
        this.listEl.innerHTML = '';
        const fragment = document.createDocumentFragment();

        this.notifications.forEach((notification) => {
            const item = document.createElement('div');
            item.className = `notification notification--${notification.severity}`;
            // Use setAttribute to avoid StateGuard blocking dataset mutations
            item.setAttribute('data-notification-id', notification.id);

            const header = document.createElement('div');
            header.className = 'twm-notification__header';
            if (notification.title) {
                const titleEl = document.createElement('span');
                titleEl.className = 'twm-notification__title';
                titleEl.textContent = notification.title;
                header.appendChild(titleEl);
            }

            const timeEl = document.createElement('span');
            timeEl.className = 'twm-notification__timestamp';
            timeEl.textContent = this.#formatTimestamp(notification.timestamp);
            header.appendChild(timeEl);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'twm-notification__close';
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Dismiss notification');
            closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
            closeBtn.addEventListener('click', () => this.dismiss(notification.id, 'manual'));
            header.appendChild(closeBtn);
            item.appendChild(header);

            const body = document.createElement('div');
            body.className = 'twm-notification__body';
            body.textContent = notification.message;
            item.appendChild(body);

            if (notification.description) {
                const descriptionEl = document.createElement('div');
                descriptionEl.className = 'twm-notification__description';
                descriptionEl.textContent = notification.description;
                item.appendChild(descriptionEl);
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
                            // Don't auto-dismiss error/fatal notifications after action clicks
                            if (notification.severity !== 'error' && notification.severity !== 'fatal') {
                                this.dismiss(notification.id, 'action');
                            }
                        }
                    });
                    actionsEl.appendChild(button);
                });
                item.appendChild(actionsEl);
            }

            item.addEventListener('click', (event) => {
                if (event.target.closest('button')) {
                    return;
                }
                this.dismiss(notification.id, 'click');
            });

            fragment.appendChild(item);
        });

        this.listEl.appendChild(fragment);
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
