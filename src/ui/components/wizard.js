/**
 * Wizard — a multi-step flow: a step indicator, a body slot and a footer with
 * Cancel, Back and Next/Finish, every step gated by its own `canAdvance`.
 *
 * Usage:
 *   const wizard = new Wizard({
 *     data: { file: null },                     // yours; every hook sees it as ctx.data
 *     steps: [
 *       { id: 'source', label: 'Source', icon: 'upload_file',
 *         render(bodyEl, ctx) { … ; return () => { … } },   // optional cleanup function
 *         canAdvance: (ctx) => ctx.data.file
 *             ? { ok: true } : { ok: false, hint: 'Choose a file first' } },
 *       { id: 'review', label: 'Review', render(bodyEl, ctx) { … } },
 *     ],
 *     onFinish: async (ctx) => { … },           // rejects → the step shows the error
 *     onCancel: (ctx) => { … },
 *   });
 *   wizard.mount(hostEl);                        // inline …
 *   wizard.openInWindow({ id: 'import', title: 'Import' });   // … or in a window
 *
 * Steps are drawn done / current / upcoming / error and joined by a connector.
 * A done (or errored) step BEFORE the current one is a button that jumps back;
 * a step after it is inert, so the only way forward is Next, through the gate.
 *
 * `canAdvance(ctx)` is asked whenever the footer is drawn, and `revalidate()`
 * draws it again — the body is rendered once per visit, never by a revalidate,
 * so an input the user is typing into keeps its focus and its value.
 *
 * Every move goes through a core StateMachine:
 *
 *     step ──move──▶ step        (guard: back to a visited step, or forward
 *       │                         one step through the gate)
 *       ├──finish──▶ finishing ──resolve──▶ finished   (closes)
 *       │                │
 *       │                └──reject──▶ step             (the step shows the error)
 *       └──cancel──▶ cancelled                          (closes, calls onCancel)
 *
 * While `finishing`, every button is disabled and no move is accepted, so an
 * async finish cannot be raced by a click. `finished` and `cancelled` are final:
 * onCancel runs once however many times Cancel is pressed.
 *
 * State lives in this instance only; the DOM carries classes and ARIA, never a
 * data attribute.
 */
import { ComponentBase } from '../base/component_base.js';
import { StateMachine } from '../../core/state_machine.js';
import { ManagedWindow } from './managed_window.js';

const DEFAULT_LABELS = Object.freeze({
    back: 'Back',
    next: 'Next',
    finish: 'Finish',
    cancel: 'Cancel',
});

const OPEN = 'step';
const FINISHING = 'finishing';
const FINISHED = 'finished';
const CANCELLED = 'cancelled';

/** Steps own one override: an error and its message. Everything else about a
 *  step's look follows from where it is relative to the current one. */
const STEP_STATES = Object.freeze(['error']);

const isFinal = (state) => state === FINISHED || state === CANCELLED;

/** A step's render may hand back a cleanup function, run when the step is
 *  left and on dispose(). */
function runCleanup(cleanup) {
    if (typeof cleanup === 'function') cleanup();
}

function messageOf(err) {
    if (err && typeof err.message === 'string' && err.message) return err.message;
    return err == null ? 'Failed' : String(err);
}

export class Wizard extends ComponentBase {

    /** @type {Array<object>} */      #steps;
    /** @type {object} */             #labels;
    /** @type {Function|null} */      #onFinish;
    /** @type {Function|null} */      #onCancel;
    /** @type {object} */             #ctx;
    /** @type {StateMachine} */       #machine;
    /** @type {number} */             #index = 0;
    /** @type {Map<string,{state:string,message:string}>} */ #overrides = new Map();
    /** @type {*} */                  #cleanup = null;
    /** @type {Promise} */            #queue = Promise.resolve();
    /** @type {ManagedWindow|null} */ #window = null;
    /** @type {boolean} */            #disposed = false;

    /** @type {HTMLElement|null} */   #root = null;
    /** @type {HTMLElement[]} */      #stepItems = [];
    /** @type {HTMLButtonElement[]} */#stepButtons = [];
    /** @type {HTMLElement[]} */      #connectors = [];
    /** @type {HTMLElement|null} */   #body = null;
    /** @type {HTMLElement|null} */   #message = null;
    /** @type {HTMLButtonElement|null} */ #cancelBtn = null;
    /** @type {HTMLButtonElement|null} */ #backBtn = null;
    /** @type {HTMLButtonElement|null} */ #nextBtn = null;

    /**
     * @param {object}   opts
     * @param {Array<{id:string,label:string,icon?:string,
     *                 render:(bodyEl:HTMLElement, ctx:object)=>(Function|void),
     *                 canAdvance?:(ctx:object)=>{ok:boolean,hint?:string}}>} opts.steps
     * @param {object}   [opts.data={}]   Your state; every hook reads it as `ctx.data`.
     * @param {Function} [opts.onFinish]  `(ctx) => void|Promise`. A rejection marks the
     *                                    current step as error with the rejection's message.
     * @param {Function} [opts.onCancel]  `(ctx) => void`, called once when the wizard is cancelled.
     * @param {object}   [opts.labels]    `{back, next, finish, cancel}` button labels.
     * @param {object}   [opts.eventBus]  Passed to the StateMachine (its `fsm:*` events).
     * @param {object}   [opts.logger]    Passed to the StateMachine.
     */
    constructor({ steps, data = {}, onFinish = null, onCancel = null, labels = {},
                  eventBus = null, logger = null } = {}) {
        super({ eventBus, logger });
        if (!Array.isArray(steps) || steps.length === 0) {
            throw new Error('Wizard requires at least one step');
        }
        const ids = new Set();
        for (const step of steps) {
            if (!step || typeof step.id !== 'string' || !step.id) {
                throw new Error('Wizard: every step needs a non-empty string id');
            }
            if (ids.has(step.id)) throw new Error(`Wizard: duplicate step id "${step.id}"`);
            if (typeof step.render !== 'function') {
                throw new Error(`Wizard: step "${step.id}" needs a render(bodyEl, ctx) function`);
            }
            ids.add(step.id);
        }
        this.#steps = steps.slice();
        this.#labels = { ...DEFAULT_LABELS, ...labels };
        this.#onFinish = onFinish;
        this.#onCancel = onCancel;

        const wizard = this;
        this.#ctx = Object.freeze({
            data,
            get step() { return wizard.currentStep; },
            get index() { return wizard.currentIndex; },
            revalidate: () => this.revalidate(),
            next: () => this.next(),
            back: () => this.back(),
            goTo: (target) => this.goTo(target),
            setStepState: (id, state, message) => this.setStepState(id, state, message),
        });

        this.#machine = new StateMachine({
            name: 'wizard',
            initialState: OPEN,
            eventBus,
            logger,
            states: {
                [OPEN]: {
                    transitions: {
                        move: {
                            target: OPEN,
                            guard: ({ payload }) => this.#canMoveTo(payload.to),
                            action: ({ payload }) => this.#enterStep(payload.to),
                        },
                        finish: {
                            target: FINISHING,
                            guard: () => this.#isLast() && this.#gate().ok,
                            action: () => { this.#overrides.delete(this.currentStep); },
                        },
                        cancel: { target: CANCELLED },
                    },
                },
                [FINISHING]: {
                    transitions: {
                        resolve: { target: FINISHED },
                        reject: {
                            target: OPEN,
                            action: ({ payload }) => {
                                this.#overrides.set(this.currentStep,
                                    { state: 'error', message: messageOf(payload.error) });
                            },
                        },
                    },
                },
                [FINISHED]: { onEnter: () => this.#close() },
                [CANCELLED]: {
                    onEnter: () => {
                        this.#close();
                        this.#onCancel?.(this.#ctx);
                    },
                },
            },
        });
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Mount inline into `container` and render the first step.
     * @param {HTMLElement} container
     * @returns {Wizard}
     */
    mount(container) {
        if (this._mounted) return this;
        this.#build();
        container.appendChild(this.#root);
        this._mounted = true;
        this.#renderBody();
        this.#paint();
        return this;
    }

    /**
     * Mount in a ManagedWindow and show it. The window's close button and
     * Escape cancel the wizard (and are refused while a finish is running);
     * finishing or cancelling closes the window.
     * @param {object} [opts]  ManagedWindow options: id, title, icon, defaultWidth,
     *                         defaultHeight, minWidth, minHeight, container, modal (default true).
     * @returns {ManagedWindow}
     */
    openInWindow({ id = 'twm-wizard', title = 'Wizard', icon, defaultWidth = 720,
                   defaultHeight = 520, minWidth = 420, minHeight = 320,
                   container, modal = true } = {}) {
        if (this._mounted) throw new Error('Wizard is already mounted');
        this.#build();
        this._mounted = true;
        this.#window = new ManagedWindow({
            id, title, icon, defaultWidth, defaultHeight, minWidth, minHeight,
            container, modal,
            content: this.#root,
            canMinimize: false,
            beforeClose: () => {
                if (isFinal(this.state)) return true;
                void this.cancel();
                return false;
            },
        });
        // Rendered and painted BEFORE show, so the window's focus-on-open
        // (BUG-0053) lands on the step's first field — the stepper's buttons
        // are disabled by then — and not on the first step button.
        this.#renderBody();
        this.#paint();
        this.#window.show();
        return this.#window;
    }

    /** Tear down (and close the window, if any) without calling any callback.
     *  Every later move, finish or cancel is refused. */
    dispose() {
        if (this.#disposed) return;
        this.#disposed = true;
        const win = this.#window;
        this.#teardown();
        win?.close({ force: true });
        super.dispose();
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** The wizard's root element (null before mount). */
    get element() { return this.#root; }

    /** The body slot the current step renders into. */
    get bodyElement() { return this.#body; }

    /** The ManagedWindow, when opened with `openInWindow`. */
    get window() { return this.#window; }

    /** The object every hook receives: `{data, step, index, revalidate, next, back, goTo, setStepState}`. */
    get context() { return this.#ctx; }

    /** The current step's id. */
    get currentStep() { return this.#steps[this.#index].id; }

    /** The current step's index. */
    get currentIndex() { return this.#index; }

    /** 'step' | 'finishing' | 'finished' | 'cancelled' (null for a moment after construction). */
    get state() { return this.#machine.getState(); }

    /** True while an async finish is running. */
    get busy() { return this.state === FINISHING; }

    /**
     * Ask the current step's `canAdvance` again and redraw the indicator and
     * the footer. The body is NOT re-rendered.
     */
    revalidate() {
        this.#paint();
    }

    /** Forward one step, if the current step's gate allows it. Resolves true when it moved. */
    next() {
        return this.#move(() => this.#index + 1);
    }

    /** Back one step. Resolves true when it moved. */
    back() {
        return this.#move(() => this.#index - 1);
    }

    /**
     * Move to a step by id or index: any step before the current one, or the
     * next one through the gate. Resolves true when it moved.
     * @param {string|number} target
     */
    goTo(target) {
        return this.#move(() => this.#resolveIndex(target));
    }

    /**
     * Mark a step as errored (`'error'`, with a message shown while it is the
     * current step), or clear the mark (`null`).
     * @param {string} id
     * @param {'error'|null} state
     * @param {string} [message]
     */
    setStepState(id, state, message = '') {
        const i = this.#resolveIndex(id);
        if (i < 0 || i >= this.#steps.length) throw new Error(`Wizard: no step "${id}"`);
        const key = this.#steps[i].id;
        if (state == null) this.#overrides.delete(key);
        else if (STEP_STATES.includes(state)) this.#overrides.set(key, { state, message: String(message ?? '') });
        else throw new Error(`Wizard: unknown step state "${state}" (expected 'error' or null)`);
        this.#paint();
    }

    /**
     * Run `onFinish` from the last step, if its gate allows. The buttons are
     * disabled until it settles; resolved, the wizard closes; rejected, the
     * step is marked as error with the message. Resolves true when it finished.
     */
    finish() {
        return this.#enqueue(async () => {
            if (this.state !== OPEN) return false;
            const { transitioned } = await this.#machine.transition('finish');
            if (!transitioned) return false;
            this.#paint();
            try {
                await this.#onFinish?.(this.#ctx);
            } catch (error) {
                await this.#machine.transition('reject', { error });
                this.#paint();
                return false;
            }
            await this.#machine.transition('resolve');
            return true;
        });
    }

    /**
     * Close the wizard and call `onCancel` — once. Refused while a finish is
     * running. Resolves true when it cancelled.
     */
    cancel() {
        return this.#enqueue(async () => {
            if (this.state !== OPEN) return false;
            const { transitioned } = await this.#machine.transition('cancel');
            return transitioned;
        });
    }

    // ─── Moves ──────────────────────────────────────────────────────────────

    /** Moves run one at a time, so a double click cannot start a transition
     *  inside another. The target is computed when the move runs, not when it
     *  was asked for. A request made while a finish is running (or after the
     *  wizard closed) is refused there and then — it is not queued behind the
     *  finish to run once it settles. */
    #enqueue(fn) {
        if (this.#disposed || this.busy || isFinal(this.state)) return Promise.resolve(false);
        const run = this.#queue.then(() => (this.#disposed ? false : fn()));
        this.#queue = run.catch(() => {});
        return run;
    }

    #move(targetOf) {
        return this.#enqueue(async () => {
            if (this.state !== OPEN) return false;
            const to = targetOf();
            if (!this.#canMoveTo(to)) return false;
            const { transitioned } = await this.#machine.transition('move', { to });
            this.#paint();
            return transitioned;
        });
    }

    #canMoveTo(to) {
        if (!Number.isInteger(to) || to < 0 || to >= this.#steps.length) return false;
        if (to < this.#index) return true;
        return to === this.#index + 1 && this.#gate().ok;
    }

    #enterStep(to) {
        this.#index = to;
        this.#renderBody();
    }

    #resolveIndex(target) {
        if (typeof target === 'number') return Number.isInteger(target) ? target : -1;
        return this.#steps.findIndex((s) => s.id === target);
    }

    #isLast() {
        return this.#index === this.#steps.length - 1;
    }

    /** The current step's gate, normalised to `{ok, hint}`. */
    #gate() {
        const step = this.#steps[this.#index];
        if (typeof step.canAdvance !== 'function') return { ok: true, hint: '' };
        const r = step.canAdvance(this.#ctx) ?? {};
        return { ok: r.ok === true, hint: typeof r.hint === 'string' ? r.hint : '' };
    }

    // ─── DOM ────────────────────────────────────────────────────────────────

    #build() {
        const root = document.createElement('div');
        root.className = 'twm-wizard';

        const steps = document.createElement('ol');
        steps.className = 'twm-wizard__steps';
        this.#steps.forEach((step, i) => {
            if (i > 0) {
                const connector = document.createElement('li');
                connector.className = 'twm-wizard__connector';
                connector.setAttribute('role', 'presentation');
                connector.setAttribute('aria-hidden', 'true');
                steps.appendChild(connector);
                this.#connectors.push(connector);
            }
            const item = document.createElement('li');
            item.className = 'twm-wizard__step';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'twm-wizard__step-btn';
            const marker = document.createElement('span');
            marker.className = 'twm-wizard__step-marker';
            const label = document.createElement('span');
            label.className = 'twm-wizard__step-label';
            label.textContent = step.label ?? step.id;
            btn.append(marker, label);
            btn.addEventListener('click', () => this.#onStepClick(i));
            item.appendChild(btn);
            steps.appendChild(item);
            this.#stepItems.push(item);
            this.#stepButtons.push(btn);
        });

        this.#body = document.createElement('div');
        this.#body.className = 'twm-wizard__body';

        const footer = document.createElement('div');
        footer.className = 'twm-wizard__footer';
        this.#message = document.createElement('div');
        this.#message.className = 'twm-wizard__message';
        this.#message.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'twm-wizard__actions';
        this.#cancelBtn = this.#button('twm-wizard__cancel', this.#labels.cancel, () => { void this.cancel(); });
        this.#backBtn = this.#button('twm-wizard__back', this.#labels.back, () => { void this.back(); });
        this.#nextBtn = this.#button('twm-wizard__next twm-btn--primary', this.#labels.next, () => {
            void (this.#isLast() ? this.finish() : this.next());
        });
        actions.append(this.#cancelBtn, this.#backBtn, this.#nextBtn);
        footer.append(this.#message, actions);

        root.append(steps, this.#body, footer);
        this.#root = root;
    }

    #button(cls, text, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `twm-btn ${cls}`;
        btn.textContent = text;
        btn.addEventListener('click', onClick);
        return btn;
    }

    #onStepClick(i) {
        if (i < this.#index) void this.goTo(i);
    }

    #renderBody() {
        runCleanup(this.#cleanup);
        this.#cleanup = null;
        this.#body.replaceChildren();
        const step = this.#steps[this.#index];
        this.#cleanup = step.render(this.#body, this.#ctx) ?? null;
    }

    /** The visual state of step `i`: an override, else its position. */
    #stepState(i) {
        const override = this.#overrides.get(this.#steps[i].id);
        if (override) return override.state;
        if (i < this.#index) return 'done';
        return i === this.#index ? 'current' : 'upcoming';
    }

    #paint() {
        if (!this.#root) return;
        const busy = this.busy;
        this.#root.classList.toggle('twm-wizard--busy', busy);
        this.#root.setAttribute('aria-busy', busy ? 'true' : 'false');

        this.#steps.forEach((step, i) => {
            const state = this.#stepState(i);
            const item = this.#stepItems[i];
            for (const s of ['done', 'current', 'upcoming', 'error']) {
                item.classList.toggle(`twm-wizard__step--${s}`, s === state);
            }
            item.classList.toggle('twm-wizard__step--active', i === this.#index);
            const btn = this.#stepButtons[i];
            btn.disabled = busy || i >= this.#index;
            if (i === this.#index) btn.setAttribute('aria-current', 'step');
            else btn.removeAttribute('aria-current');
            const override = this.#overrides.get(step.id);
            btn.title = override?.message || step.label || step.id;

            const marker = btn.firstChild;
            const glyph = state === 'done' ? 'check' : state === 'error' ? 'error' : (step.icon || '');
            marker.classList.toggle('material-symbols-outlined', Boolean(glyph));
            marker.textContent = glyph || String(i + 1);
            if (i > 0) {
                this.#connectors[i - 1].classList.toggle('twm-wizard__connector--done', i <= this.#index);
            }
        });

        const gate = this.#gate();
        const last = this.#isLast();
        this.#nextBtn.textContent = last ? this.#labels.finish : this.#labels.next;
        this.#nextBtn.disabled = busy || !gate.ok;
        this.#nextBtn.title = gate.ok ? '' : gate.hint;
        this.#backBtn.disabled = busy || this.#index === 0;
        this.#cancelBtn.disabled = busy;

        const error = this.#overrides.get(this.currentStep);
        const text = error ? error.message : (gate.ok ? '' : gate.hint);
        this.#message.textContent = text;
        this.#message.classList.toggle('twm-wizard__message--error', Boolean(error));
        this.#message.classList.toggle('twm-wizard__message--hint', !error && Boolean(text));
        if (error) this.#message.setAttribute('role', 'alert');
        else this.#message.removeAttribute('role');
    }

    #close() {
        const win = this.#window;
        this.#teardown();
        this._mounted = false;
        win?.close({ force: true });
    }

    #teardown() {
        runCleanup(this.#cleanup);
        this.#cleanup = null;
        this.#root?.remove();
        this.#root = null;
        this.#body = null;
        this.#message = null;
        this.#stepItems = [];
        this.#stepButtons = [];
        this.#connectors = [];
        this.#cancelBtn = this.#backBtn = this.#nextBtn = null;
    }
}
