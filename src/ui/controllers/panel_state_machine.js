/**
 * Panel State Machine
 *
 * Reusable FSM for panel visibility management. Formalizes a four-state
 * model used by the right panel and bottom panel:
 *
 *   disabled   – Panel hidden, toggle button disabled. Cannot be shown.
 *   hidden     – Panel hidden, toggle button enabled. User can show it.
 *   on-demand  – Panel hidden by default, auto-shown by external triggers
 *                (e.g. node selection). Toggle button enabled.
 *   pinned     – Panel always visible. Toggle button shows pinned indicator.
 *
 * Different panels use different subsets of these states:
 *   Right panel:  disabled ↔ on-demand ↔ pinned  (trigger-based visibility)
 *   Bottom panel: disabled ↔ hidden ↔ pinned     (simple show/hide toggle)
 *
 * Uses the composition pattern (like AiStateMachine): wraps a StateMachine
 * instance in a private field and exposes a panel-domain public API.
 *
 * DOM manipulation is delegated to callback functions passed at construction
 * time, keeping the FSM itself pure and testable.
 *
 * @module ui/controllers/panel_state_machine
 */

import { StateMachine } from '../../core/state_machine.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const PANEL_STATES = Object.freeze({
    DISABLED:  'disabled',
    HIDDEN:    'hidden',
    ON_DEMAND: 'on-demand',
    PINNED:    'pinned',
});

export const PANEL_TRANSITIONS = Object.freeze({
    ENABLE:        'panel:mode:enable',
    ENABLE_PINNED: 'panel:mode:enable-pinned',
    ENABLE_HIDDEN: 'panel:mode:enable-hidden',
    DISABLE:       'panel:mode:disable',
    PIN:           'panel:pin',
    UNPIN:         'panel:unpin',
    SHOW:          'panel:show',
    HIDE:          'panel:hide',
});


// ─── State Machine ──────────────────────────────────────────────────────────

export class PanelStateMachine {

    /** @type {StateMachine} */
    #machine;

    /** @type {import('../../core/event_bus.js').default} */
    #eventBus;

    /** @type {object|null} */
    #logger;

    // ── Identity ────────────────────────────────────────────────────────────
    #name;

    // ── DOM delegation ──────────────────────────────────────────────────────
    #callbacks;

    // ── Persistence / config ────────────────────────────────────────────────
    #persistenceKey;
    #supportsCollapse = false;

    // ── Trigger-based visibility (on-demand state) ──────────────────────────
    #triggerCount = 0;

    // ── Orthogonal state ────────────────────────────────────────────────────
    // null initial value ensures the first #applyVisibility call always fires
    // onShow/onHide to synchronize DOM with FSM state (the DOM starts without
    // any hidden class, so we must not assume it matches #visible = false).
    #visible = null;
    #collapsed = false;
    #height = null;

    // ── Overrides ───────────────────────────────────────────────────────────
    #overrideHidden = false;
    #widgetConfigActive = false;

    // ── Persisted pin (read before first enable) ────────────────────────────
    #persistedPinned = false;

    // ── Config: which state to enter when enable() is called and not pinned ──
    #unpinnedState;

    /**
     * @param {object} config
     * @param {string} config.name                Panel identity ('right', 'bottom', etc.)
     * @param {import('../../core/event_bus.js').default} config.eventBus
     * @param {object}  [config.logger]
     * @param {string}  config.persistenceKey     localStorage key
     * @param {boolean} [config.defaultPinned]     Default pin state when no persisted data exists
     * @param {string}  [config.unpinnedState]     State for enable() when not pinned: 'on-demand' (default) or 'hidden'
     * @param {object}  config.callbacks           DOM manipulation hooks:
     * @param {Function} config.callbacks.onShow             (reason) => void
     * @param {Function} config.callbacks.onHide             (reason) => void
     * @param {Function} config.callbacks.onDisable          () => void
     * @param {Function} config.callbacks.onEnable           () => void
     * @param {Function} [config.callbacks.onPinChanged]     (pinned) => void
     * @param {Function} [config.callbacks.onVisibilityChanged] (visible) => void
     * @param {Function} [config.callbacks.onCollapseChanged]   (collapsed, height) => void
     */
    constructor(config) {
        this.#name = config.name;
        this.#eventBus = config.eventBus;
        this.#logger = config.logger ?? null;
        this.#callbacks = config.callbacks;
        this.#persistenceKey = config.persistenceKey;
        this.#persistedPinned = config.defaultPinned ?? false;
        this.#unpinnedState = config.unpinnedState ?? PANEL_STATES.ON_DEMAND;

        const self = this;

        this.#machine = new StateMachine({
            name: `panel-${config.name}`,
            initialState: PANEL_STATES.DISABLED,
            states: {
                [PANEL_STATES.DISABLED]: {
                    onEnter() { self.#onEnterDisabled(); },
                    transitions: {
                        [PANEL_TRANSITIONS.ENABLE]:        { target: PANEL_STATES.ON_DEMAND },
                        [PANEL_TRANSITIONS.ENABLE_PINNED]: { target: PANEL_STATES.PINNED },
                        [PANEL_TRANSITIONS.ENABLE_HIDDEN]: { target: PANEL_STATES.HIDDEN },
                    },
                },
                [PANEL_STATES.HIDDEN]: {
                    onEnter() { self.#onEnterHidden(); },
                    transitions: {
                        [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
                        [PANEL_TRANSITIONS.SHOW]:    { target: PANEL_STATES.PINNED },
                    },
                },
                [PANEL_STATES.ON_DEMAND]: {
                    onEnter() { self.#onEnterOnDemand(); },
                    onExit() { self.#onExitOnDemand(); },
                    transitions: {
                        [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
                        [PANEL_TRANSITIONS.PIN]:     { target: PANEL_STATES.PINNED },
                    },
                },
                [PANEL_STATES.PINNED]: {
                    onEnter() { self.#onEnterPinned(); },
                    transitions: {
                        [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
                        [PANEL_TRANSITIONS.UNPIN]:   { target: PANEL_STATES.ON_DEMAND },
                        [PANEL_TRANSITIONS.HIDE]:    { target: PANEL_STATES.HIDDEN },
                    },
                },
            },
            eventBus: config.eventBus,
            logger: config.logger,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Queries
    // ═══════════════════════════════════════════════════════════════════════

    /** Current FSM state. */
    getState() { return this.#machine.getState(); }

    /** True when in pinned state. */
    isPinned() { return this.getState() === PANEL_STATES.PINNED; }

    /** True when in disabled state. */
    isDisabled() { return this.getState() === PANEL_STATES.DISABLED; }

    /** True when in hidden state (not visible, but toggle enabled). */
    isHidden() { return this.getState() === PANEL_STATES.HIDDEN; }

    /** True when the panel is currently visible to the user. */
    isVisible() { return this.#visible; }

    /** True when the panel is collapsed (bottom panel only). */
    isCollapsed() { return this.#collapsed; }

    /** Current stored height (for collapse restore). */
    getHeight() { return this.#height; }

    /** Whether widget config override is active. */
    get widgetConfigActive() { return this.#widgetConfigActive; }

    /** Whether collapse operations are supported (runtime-configurable per mode). */
    get supportsCollapse() { return this.#supportsCollapse; }
    set supportsCollapse(value) { this.#supportsCollapse = Boolean(value); }

    // ═══════════════════════════════════════════════════════════════════════
    //  Mode transitions (called by ApplicationShell._switchMode)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Enable the panel for the current mode.
     *
     * With no argument, transitions from disabled → on-demand, hidden, or
     * pinned based on persisted pin state and unpinnedState config.
     *
     * With an explicit `initialState`, forces that specific target state
     * regardless of persistence. Useful when a mode always needs a specific
     * starting state (e.g. ETL designer always starts as on-demand).
     *
     * If already enabled (hidden, on-demand, or pinned), this is a no-op.
     *
     * Note: getState() can return null during the StateMachine's async init
     * microtask. We treat null the same as disabled — the transition() call
     * internally awaits _ready, so the machine will be in 'disabled' by the
     * time the transition executes.
     *
     * @param {string} [initialState] Force a specific target state: 'on-demand', 'hidden', or 'pinned'
     */
    enable(initialState) {
        const state = this.getState();
        if (state !== PANEL_STATES.DISABLED && state !== null) return;

        if (initialState === PANEL_STATES.ON_DEMAND) {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE);
        } else if (initialState === PANEL_STATES.HIDDEN) {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE_HIDDEN);
        } else if (initialState === PANEL_STATES.PINNED) {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE_PINNED);
        } else if (this.#persistedPinned) {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE_PINNED);
        } else if (this.#unpinnedState === PANEL_STATES.HIDDEN) {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE_HIDDEN);
        } else {
            this.#machine.transition(PANEL_TRANSITIONS.ENABLE);
        }
    }

    /**
     * Disable the panel for the current mode.
     * Transitions from any enabled state → disabled.
     * If already disabled (or null during async init), this is a no-op.
     */
    disable() {
        const state = this.getState();
        if (state === PANEL_STATES.DISABLED || state === null) return;
        this.#machine.transition(PANEL_TRANSITIONS.DISABLE);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Pin (called by toggle button click)
    // ═══════════════════════════════════════════════════════════════════════

    /** Toggle between on-demand and pinned. No-op if disabled. */
    togglePin() {
        const state = this.getState();
        if (state === PANEL_STATES.ON_DEMAND) {
            this.pin();
        } else if (state === PANEL_STATES.PINNED) {
            this.unpin();
        }
    }

    /** on-demand → pinned. */
    pin() {
        if (this.getState() !== PANEL_STATES.ON_DEMAND) return;
        this.#machine.transition(PANEL_TRANSITIONS.PIN);
    }

    /** pinned → on-demand. */
    unpin() {
        if (this.getState() !== PANEL_STATES.PINNED) return;
        this.#machine.transition(PANEL_TRANSITIONS.UNPIN);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Show / Hide (hidden ↔ pinned, for panels without trigger-based visibility)
    // ═══════════════════════════════════════════════════════════════════════

    /** hidden → pinned. No-op if not in hidden state. */
    show() {
        if (this.getState() !== PANEL_STATES.HIDDEN) return;
        this.#machine.transition(PANEL_TRANSITIONS.SHOW);
    }

    /** pinned → hidden. No-op if not in pinned state. */
    hide() {
        if (this.getState() !== PANEL_STATES.PINNED) return;
        this.#machine.transition(PANEL_TRANSITIONS.HIDE);
    }

    /** Toggle between hidden and pinned. No-op if disabled or on-demand. */
    toggleShow() {
        const state = this.getState();
        if (state === PANEL_STATES.HIDDEN) {
            this.show();
        } else if (state === PANEL_STATES.PINNED) {
            this.hide();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Smart toggle (toolbar click handler)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * The default action for a toolbar toggle click.
     * Delegates to the appropriate operation based on FSM state and config:
     *   - Pinned + supportsCollapse → toggleCollapse
     *   - On-demand or pinned (no collapse) → togglePin
     *   - Hidden → show
     */
    toggle() {
        const state = this.getState();
        if (state === PANEL_STATES.DISABLED) return;
        if (this.#supportsCollapse && state === PANEL_STATES.PINNED) {
            this.toggleCollapse();
        } else if (state === PANEL_STATES.HIDDEN) {
            this.show();
        } else {
            this.togglePin();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  On-demand triggers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Increment or decrement the trigger count and sync visibility.
     * In on-demand state, the panel is visible when triggerCount > 0.
     * In pinned state, triggers are tracked but don't affect visibility.
     * In disabled state, triggers are tracked but have no effect.
     */
    setTriggerActive(active) {
        if (active) {
            this.#triggerCount++;
        } else {
            this.#triggerCount = Math.max(0, this.#triggerCount - 1);
        }
        this.#syncVisibility('trigger');
    }

    /** Reset all triggers to 0 and sync visibility. */
    clearTriggers() {
        this.#triggerCount = 0;
        this.#syncVisibility('triggers-cleared');
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Re-apply (mode switch support)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Force re-apply DOM callbacks from the current FSM state.
     *
     * Use after mode switches where external code changed the DOM (swapped
     * panel content, cleared tabs) while the FSM remained in an enabled
     * state. The cached `#visible` flag is invalidated so `#applyVisibility`
     * is guaranteed to fire `onShow`/`onHide` + `onCollapseChanged`.
     *
     * No-op when the FSM is disabled — disable() handles its own cleanup.
     */
    reapply() {
        if (this.isDisabled()) return;
        this.#visible = !this.#visible;
        this.#syncVisibility('reapply');
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Collapse (bottom panel only)
    // ═══════════════════════════════════════════════════════════════════════

    collapse() {
        if (!this.#supportsCollapse || !this.isVisible() || this.#collapsed) return;
        this.#collapsed = true;
        this.#callbacks.onCollapseChanged?.(true, this.#height);
        this.#emitBus(`panel:${this.#name}:collapse:changed`, { collapsed: true });
        this.#persist();
    }

    expand() {
        if (!this.#supportsCollapse || !this.isVisible() || !this.#collapsed) return;
        this.#collapsed = false;
        this.#callbacks.onCollapseChanged?.(false, this.#height);
        this.#emitBus(`panel:${this.#name}:collapse:changed`, { collapsed: false });
        this.#persist();
    }

    toggleCollapse() {
        if (this.#collapsed) {
            this.expand();
        } else {
            this.collapse();
        }
    }

    /** Store the last expanded height (called during resize or before collapse). */
    setHeight(px) {
        if (typeof px === 'number' && px > 40) {
            this.#height = px;
            this.#persist();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Overrides
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Force-hide the panel regardless of FSM state (welcome screen).
     * When lifted, visibility re-derives from current state + triggers.
     */
    setOverrideHidden(hidden) {
        this.#overrideHidden = hidden;
        if (hidden) {
            this.#applyVisibility(false, 'override-hidden');
            this.#callbacks.onDisable?.();
        } else {
            // Re-derive: if not disabled, re-enable toggle
            if (!this.isDisabled()) {
                this.#callbacks.onEnable?.();
            }
            this.#syncVisibility('override-lifted');
        }
    }

    /**
     * Widget config special case (right panel).
     * When active, the toggle button stays enabled even in disabled state
     * so the user can click it to close the config panel.
     */
    setWidgetConfigActive(active) {
        this.#widgetConfigActive = active;
        // In disabled state, temporarily enable/disable the toggle
        if (this.isDisabled()) {
            if (active) {
                this.#callbacks.onEnable?.();
            } else {
                this.#callbacks.onDisable?.();
            }
        }
        this.#callbacks.onVisibilityChanged?.(this.#visible);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Persistence
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Read persisted state from localStorage and apply it.
     * Must be called after construction, before the first enable().
     */
    hydrate() {
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem(this.#persistenceKey);
            if (raw == null) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            if (typeof parsed.pinned === 'boolean') {
                this.#persistedPinned = parsed.pinned;
            }
            // Always restore collapse/height — supportsCollapse is set per mode
            // and may not be configured yet at hydrate() time.
            if (typeof parsed.collapsed === 'boolean') {
                this.#collapsed = parsed.collapsed;
            }
            if (typeof parsed.height === 'number' && parsed.height > 40) {
                this.#height = parsed.height;
            }
            this.#log('debug', 'Hydrated persisted state', {
                pinned: this.#persistedPinned,
                collapsed: this.#collapsed,
                height: this.#height,
            });
        } catch (err) {
            this.#log('warn', 'Failed to hydrate persisted state', { error: err });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Lifecycle
    // ═══════════════════════════════════════════════════════════════════════

    dispose() {
        // StateMachine doesn't hold subscriptions, but future-proof
        this.#machine = null;
        this.#eventBus = null;
        this.#callbacks = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Private: state entry/exit hooks
    // ═══════════════════════════════════════════════════════════════════════

    #onEnterDisabled() {
        this.#applyVisibility(false, 'disabled');
        this.#callbacks.onDisable?.();
        this.#callbacks.onPinChanged?.(false);
        this.#emitStateChanged();
    }

    #onEnterHidden() {
        this.#callbacks.onEnable?.();
        this.#callbacks.onPinChanged?.(false);
        this.#applyVisibility(false, 'hidden');
        this.#persistedPinned = false;
        this.#persist();
        this.#emitStateChanged();
    }

    #onEnterOnDemand() {
        this.#callbacks.onEnable?.();
        this.#callbacks.onPinChanged?.(false);
        this.#persistedPinned = false;
        this.#persist();
        // Derive visibility from current trigger count
        this.#syncVisibility('on-demand-entered');
        this.#emitStateChanged();
    }

    #onExitOnDemand() {
        // Nothing to clean up — triggers are preserved across states
    }

    #onEnterPinned() {
        this.#callbacks.onEnable?.();
        this.#callbacks.onPinChanged?.(true);
        this.#persistedPinned = true;
        this.#persist();
        // Pinned = always visible (unless override).
        // #applyVisibility handles onShow → onVisibilityChanged → onCollapseChanged.
        this.#applyVisibility(true, 'pinned');
        this.#emitStateChanged();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Private: visibility logic
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Derive whether the panel should be visible based on FSM state, triggers,
     * and overrides. Call the appropriate show/hide callback if changed.
     */
    #syncVisibility(reason) {
        const state = this.getState();
        let shouldBeVisible;

        if (state === PANEL_STATES.DISABLED || state === PANEL_STATES.HIDDEN) {
            shouldBeVisible = false;
        } else if (state === PANEL_STATES.PINNED) {
            shouldBeVisible = true;
        } else {
            // on-demand: visible when triggers are active
            shouldBeVisible = this.#triggerCount > 0;
        }

        // Override takes precedence
        if (this.#overrideHidden) {
            shouldBeVisible = false;
        }

        this.#applyVisibility(shouldBeVisible, reason);
    }

    /**
     * Apply visibility change if it differs from current state.
     *
     * Callback ordering matters:
     *   1. onShow/onHide      — basic DOM setup/teardown
     *   2. onVisibilityChanged — toggle button active state (active = visible)
     *   3. onCollapseChanged   — override toggle active if collapsed (active = !collapsed)
     *
     * This ensures collapse-aware panels (flow mode) get the correct toggle state
     * while trigger-based panels (ETL) where supportsCollapse=false just use visibility.
     */
    #applyVisibility(visible, reason) {
        if (visible === this.#visible) return;
        this.#visible = visible;

        if (visible) {
            this.#callbacks.onShow?.(reason);
        } else {
            this.#callbacks.onHide?.(reason);
        }

        this.#callbacks.onVisibilityChanged?.(visible);

        // Restore collapse state when showing (fires after onVisibilityChanged
        // so it can override the toggle active state for collapsed panels).
        if (visible && this.#supportsCollapse) {
            this.#callbacks.onCollapseChanged?.(this.#collapsed, this.#height);
        }

        this.#emitBus(`panel:${this.#name}:visibility:changed`, { visible, reason });
        this.#log('debug', `Panel ${visible ? 'shown' : 'hidden'}`, { reason });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Private: persistence
    // ═══════════════════════════════════════════════════════════════════════

    #persist() {
        try {
            if (typeof localStorage === 'undefined') return;
            const payload = {
                pinned: this.#persistedPinned,
                collapsed: this.#collapsed,
                height: this.#height,
            };
            localStorage.setItem(this.#persistenceKey, JSON.stringify(payload));
        } catch (err) {
            this.#log('warn', 'Failed to persist panel state', { error: err });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Private: EventBus + logging
    // ═══════════════════════════════════════════════════════════════════════

    #emitStateChanged() {
        const state = this.getState();
        const previous = this.#machine.previousState;
        this.#emitBus(`panel:${this.#name}:state:changed`, { state, previousState: previous });
    }

    #emitBus(event, detail) {
        try { this.#eventBus?.emit?.(event, detail); }
        catch { /* swallow event handler errors */ }
    }

    #log(level, msg, data) {
        this.#logger?.[level]?.('panel-fsm', `[${this.#name}] ${msg}`, data);
    }
}
