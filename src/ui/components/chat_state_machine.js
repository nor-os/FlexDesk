/**
 * ══ THE CONVERSATION STATE MACHINE ════════════════════════════════════════
 *
 * The lifecycle of one assistant conversation, with no view and no transport in
 * it. `mountChatShell` (`./chat_shell.js`) drives one; a chat of your own can
 * too.
 *
 *     idle ──send──▶ waiting ──streamStart──▶ streaming ──streamComplete──▶ idle
 *                       └─ streamComplete ▶ idle       ├─ cancel ▶ idle
 *                       └─ cancel ▶ idle               └─ error  ▶ error
 *                       └─ error  ▶ error
 *     error ──send──▶ waiting      error ──reset──▶ idle
 *
 * TRANSITIONS ARE QUEUED. `StateMachine` (`../../core/state_machine.js`) is
 * asynchronous and refuses a transition that arrives during another. Text can
 * arrive in the same tick as the request that asked for it, so every call here
 * waits for the one before it, in call order, and answers a promise of
 * `{ transitioned, reason? }`. `getState()` therefore lags a call by some
 * microtasks; `settled()` resolves when the queue is empty, and `getState()` is
 * `null` until the machine has entered `idle`. A transition the current state
 * does not have is refused, not thrown.
 *
 * OBSERVERS: `onChange({ state, conversationId, mode })` hears every state
 * entered. With an `eventBus`, the same goes out as `CHAT_BUS_EVENTS.STATE_CHANGED`
 * along with the others below.
 *
 * THE MODE is an opaque string of the caller's (`null` for none): it is kept
 * and handed back, and means nothing here.
 */

import { StateMachine } from '../../core/state_machine.js';

export const CHAT_STATES = Object.freeze({
    IDLE: 'idle',
    WAITING: 'waiting',
    STREAMING: 'streaming',
    ERROR: 'error',
});

export const CHAT_TRANSITIONS = Object.freeze({
    SEND: 'chat:message:send',
    STREAM_START: 'chat:stream:start',
    STREAM_COMPLETE: 'chat:stream:complete',
    CANCEL: 'chat:cancel',
    ERROR: 'chat:error',
    RESET: 'chat:reset',
});

export const CHAT_BUS_EVENTS = Object.freeze({
    STATE_CHANGED: 'chat:state:changed',
    MESSAGE_SENT: 'chat:message:sent',
    STREAM_COMPLETE: 'chat:stream:completed',
    MODE_CHANGED: 'chat:mode:changed',
    CONVERSATION_NEW: 'chat:conversation:new',
    CONVERSATION_LOADED: 'chat:conversation:loaded',
    ERROR: 'chat:error:raised',
});

export class ChatStateMachine {
    #machine;
    #eventBus;
    #onChange;
    #queue = Promise.resolve();
    #conversationId = null;
    #mode;
    #lastError = null;

    /**
     * @param {object}   [deps]
     * @param {object}   [deps.eventBus]  gets `CHAT_BUS_EVENTS`
     * @param {object}   [deps.logger]
     * @param {?string}  [deps.mode]      the mode to start in
     * @param {Function} [deps.onChange]  `({ state, conversationId, mode })` on every state entered
     */
    constructor({ eventBus = null, logger = null, mode = null, onChange = null } = {}) {
        this.#eventBus = eventBus;
        this.#onChange = onChange;
        this.#mode = mode;

        const entered = () => this.#entered();
        const send = {
            target: CHAT_STATES.WAITING,
            guard: (ctx) => !!ctx.payload?.message,
            action: (ctx) => this.#messageSent(ctx.payload),
        };
        const inFlight = {
            [CHAT_TRANSITIONS.STREAM_COMPLETE]: {
                target: CHAT_STATES.IDLE,
                action: (ctx) => this.#emit(CHAT_BUS_EVENTS.STREAM_COMPLETE, {
                    conversationId: this.#conversationId, ...ctx.payload,
                }),
            },
            [CHAT_TRANSITIONS.CANCEL]: { target: CHAT_STATES.IDLE },
            [CHAT_TRANSITIONS.ERROR]: {
                target: CHAT_STATES.ERROR,
                action: (ctx) => this.#failed(ctx.payload),
            },
            [CHAT_TRANSITIONS.RESET]: { target: CHAT_STATES.IDLE },
        };

        this.#machine = new StateMachine({
            name: 'chat',
            initialState: CHAT_STATES.IDLE,
            eventBus,
            logger,
            states: {
                [CHAT_STATES.IDLE]: {
                    onEnter: () => {
                        this.#lastError = null;
                        entered();
                    },
                    transitions: { [CHAT_TRANSITIONS.SEND]: send },
                },
                [CHAT_STATES.WAITING]: {
                    onEnter: entered,
                    transitions: {
                        [CHAT_TRANSITIONS.STREAM_START]: { target: CHAT_STATES.STREAMING },
                        ...inFlight,
                    },
                },
                [CHAT_STATES.STREAMING]: { onEnter: entered, transitions: inFlight },
                [CHAT_STATES.ERROR]: {
                    onEnter: entered,
                    transitions: {
                        [CHAT_TRANSITIONS.RESET]: { target: CHAT_STATES.IDLE },
                        [CHAT_TRANSITIONS.SEND]: send,
                    },
                },
            },
        });
    }

    getState() { return this.#machine.getState(); }

    get conversationId() { return this.#conversationId; }
    set conversationId(id) { this.#conversationId = id ?? null; }

    get mode() { return this.#mode; }
    get lastError() { return this.#lastError; }

    setMode(mode) {
        this.#mode = mode;
        this.#emit(CHAT_BUS_EVENTS.MODE_CHANGED, { mode });
    }

    /** Resolves when every call so far has taken effect. */
    settled() { return this.#queue; }

    sendMessage(message, conversationId = this.#conversationId) {
        this.#conversationId = conversationId ?? null;
        return this.#transition(CHAT_TRANSITIONS.SEND, { message });
    }

    streamStart() { return this.#transition(CHAT_TRANSITIONS.STREAM_START); }

    /** @param {object} [payload] goes out with `CHAT_BUS_EVENTS.STREAM_COMPLETE` */
    streamComplete(payload = {}) { return this.#transition(CHAT_TRANSITIONS.STREAM_COMPLETE, payload); }

    cancel() { return this.#transition(CHAT_TRANSITIONS.CANCEL); }

    error(message, detail = null) { return this.#transition(CHAT_TRANSITIONS.ERROR, { message, detail }); }

    reset() { return this.#transition(CHAT_TRANSITIONS.RESET); }

    /** Back to idle with no conversation, whatever the state. */
    newConversation() {
        this.#conversationId = null;
        return this.#enqueue(async () => {
            await this.#machine.reset(CHAT_STATES.IDLE);
            this.#emit(CHAT_BUS_EVENTS.CONVERSATION_NEW, {});
        });
    }

    /** Back to idle on a kept conversation, whatever the state. */
    loadConversation(conversationId) {
        this.#conversationId = conversationId ?? null;
        return this.#enqueue(async () => {
            await this.#machine.reset(CHAT_STATES.IDLE);
            this.#emit(CHAT_BUS_EVENTS.CONVERSATION_LOADED, { conversationId });
        });
    }

    canSend() {
        const state = this.getState();
        return state === CHAT_STATES.IDLE || state === CHAT_STATES.ERROR;
    }

    isProcessing() {
        const state = this.getState();
        return state === CHAT_STATES.WAITING || state === CHAT_STATES.STREAMING;
    }

    #transition(event, payload) {
        return this.#enqueue(() => this.#machine.transition(event, payload));
    }

    /** One step after the last; a step that fails rejects its own promise and not the next one's. */
    #enqueue(step) {
        const run = this.#queue.then(step);
        this.#queue = run.then(() => undefined, () => undefined);
        return run;
    }

    #messageSent({ message }) {
        this.#lastError = null;
        this.#emit(CHAT_BUS_EVENTS.MESSAGE_SENT, {
            conversationId: this.#conversationId, text: message, mode: this.#mode,
        });
    }

    #failed({ message, detail }) {
        this.#lastError = message;
        this.#emit(CHAT_BUS_EVENTS.ERROR, { conversationId: this.#conversationId, message, detail });
    }

    #entered() {
        const change = { state: this.getState(), conversationId: this.#conversationId, mode: this.#mode };
        this.#onChange?.(change);
        this.#emit(CHAT_BUS_EVENTS.STATE_CHANGED, change);
    }

    #emit(name, payload) { this.#eventBus?.emit(name, payload); }
}
