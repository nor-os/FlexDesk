/**
 * State Machine Base (js_new)
 *
 * Purpose
 * -------
 * Shared finite-state-machine utility that workspace, simulation, and other controllers extend.
 *
 * Responsibilities
 * - Provide declarative state/transition definitions with guard + action hooks.
 * - Emit lifecycle events via the injected EventBus for observability.
 * - Supply debugging helpers (transition tracing) without referencing window globals.
 *
 * Source Material
 * - html/js/state_machine.js (base implementation semantics).
 * - html/js/workspace_state_machine.js (practical usage patterns to support).
 *
 */

const BUS_EVENTS = Object.freeze({
    ATTEMPT: 'fsm:transition:attempt',
    BLOCKED: 'fsm:transition:blocked',
    COMPLETE: 'fsm:transition:complete',
    ERROR: 'fsm:transition:error',
});

const isPromiseLike = (value) => Boolean(value) && typeof value.then === 'function';

export class StateMachine {
    constructor({
        name = 'state-machine',
        initialState,
        states = {},
        eventBus = null,
        logger = null,
        trace = false,
    } = {}) {
        if (!initialState || typeof initialState !== 'string') {
            throw new Error('StateMachine requires a non-empty initialState name');
        }
        if (!states[initialState]) {
            throw new Error(`StateMachine initial state "${initialState}" is not defined in states map`);
        }

        this.name = name;
        this.states = this._normalizeStates(states);
        this.initialState = initialState;
        this.currentState = null;
        this.previousState = null;
        this.eventBus = eventBus;
        this.logger = logger;
        this.trace = trace;
        this._isTransitioning = false;
        this._ready = Promise.resolve().then(() => this._enterState(initialState, {
            type: 'init',
            payload: undefined,
            fromState: null,
        }));

        this._ready.catch((err) => {
            this.logger?.error?.('state-machine', 'Failed to enter initial state', {
                machine: this.name,
                error: err,
            });
        });
    }

    describeStates() {
        return Object.keys(this.states);
    }

    getState() {
        return this.currentState;
    }

    canTransition(eventName) {
        const current = this.states[this.currentState];
        return Boolean(current?.transitions?.[eventName]);
    }

    async transition(eventName, payload = undefined) {
        await this._ready;

        if (this._isTransitioning) {
            throw new Error(`StateMachine "${this.name}" is already processing a transition`);
        }
        const currentDef = this.states[this.currentState];
        const transitionDef = currentDef?.transitions?.[eventName];

        if (!transitionDef) {
            this._emitBus(BUS_EVENTS.BLOCKED, { reason: 'missing-transition', event: eventName });
            this.logger?.warn?.('state-machine', `No transition for event "${eventName}" in state "${this.currentState}"`, {
                machine: this.name,
                state: this.currentState,
                event: eventName,
            });
            return { transitioned: false, reason: 'missing-transition' };
        }

        const targetState = transitionDef.target;
        if (!targetState || !this.states[targetState]) {
            throw new Error(`Transition from "${this.currentState}" via "${eventName}" references undefined target state "${targetState}"`);
        }

        const context = {
            machine: this,
            event: eventName,
            fromState: this.currentState,
            toState: targetState,
            payload,
        };

        const guardAllowed = await this._evaluateGuard(transitionDef.guard, context);
        if (!guardAllowed) {
            this._emitBus(BUS_EVENTS.BLOCKED, {
                reason: 'guard-blocked',
                event: eventName,
                fromState: this.currentState,
                toState: targetState,
            });
            return { transitioned: false, reason: 'guard-blocked' };
        }

        this._emitBus(BUS_EVENTS.ATTEMPT, context);
        this._isTransitioning = true;

        try {
            await this._runHook(this.states[this.currentState]?.onExit, context, 'onExit');
            await this._runHook(transitionDef.action, context, 'transition-action');
            await this._enterState(targetState, { type: eventName, payload, fromState: context.fromState });
            this._emitBus(BUS_EVENTS.COMPLETE, context);
            return { transitioned: true };
        } catch (err) {
            this._emitBus(BUS_EVENTS.ERROR, { ...context, error: err });
            this.logger?.error?.('state-machine', 'Transition failed', {
                machine: this.name,
                event: eventName,
                fromState: context.fromState,
                toState: context.toState,
                error: err,
            });
            throw err;
        } finally {
            this._isTransitioning = false;
        }
    }

    async reset(stateName = this.initialState) {
        await this._ready;
        if (!this.states[stateName]) {
            throw new Error(`Cannot reset state machine to undefined state "${stateName}"`);
        }
        this.previousState = this.currentState;
        await this._enterState(stateName, {
            type: 'reset',
            payload: undefined,
            fromState: this.previousState,
        });
        this._emitBus(BUS_EVENTS.COMPLETE, {
            machine: this,
            event: 'reset',
            fromState: this.previousState,
            toState: stateName,
            payload: undefined,
        });
    }

    updateStates(partialStates = {}) {
        this.states = this._normalizeStates({ ...this.states, ...partialStates });
        if (!this.states[this.currentState]) {
            throw new Error('Current state was removed during updateStates');
        }
    }

    _normalizeStates(definitions) {
        const normalized = {};
        for (const [stateName, config] of Object.entries(definitions)) {
            if (!config || typeof config !== 'object') {
                throw new Error(`Invalid state definition for "${stateName}"`);
            }
            normalized[stateName] = {
                onEnter: config.onEnter ?? null,
                onExit: config.onExit ?? null,
                transitions: { ...(config.transitions ?? {}) },
            };
        }
        return normalized;
    }

    async _enterState(stateName, meta) {
        const prev = this.currentState;
        this.previousState = prev;
        this.currentState = stateName;

        const context = {
            machine: this,
            event: meta.type,
            fromState: meta.fromState,
            toState: stateName,
            payload: meta.payload,
        };

        await this._runHook(this.states[stateName]?.onEnter, context, 'onEnter');
        if (this.trace) {
            this.logger?.debug?.('state-machine', `State machine "${this.name}" entered state "${stateName}"`, {
                machine: this.name,
                fromState: prev,
                toState: stateName,
            });
        }
    }

    async _evaluateGuard(guardFn, context) {
        if (!guardFn) {
            return true;
        }
        const result = guardFn(context);
        if (isPromiseLike(result)) {
            return result;
        }
        return result !== false;
    }

    async _runHook(hook, context, hookName) {
        if (typeof hook !== 'function') {
            return;
        }
        const result = hook(context);
        if (isPromiseLike(result)) {
            await result;
        }
        if (this.trace) {
            this.logger?.debug?.('state-machine', `${hookName} executed`, {
                machine: this.name,
                hook: hookName,
                state: context.toState,
            });
        }
    }

    _emitBus(eventName, detail) {
        if (!this.eventBus || !eventName) {
            return;
        }
        try {
            this.eventBus.emit(eventName, {
                machine: this.name,
                state: this.currentState,
                detail,
            });
        } catch (err) {
            this.logger?.warn?.('state-machine', 'Failed to emit state machine event', {
                machine: this.name,
                eventName,
                error: err,
            });
        }
    }
}
