/**
 * ControllerBase (js_new)
 *
 * Shared superclass for UI controllers (tab, panel, layout, etc.). Provides
 * deterministic teardown, scoped event subscriptions, and dependency injection.
 */
export class ControllerBase {
    constructor({ eventBus, dataManager, logger } = {}) {
        if (new.target === ControllerBase) {
            throw new Error('ControllerBase is abstract – extend it instead');
        }

        this.eventBus = eventBus;
        this.dataManager = dataManager;
        this.logger = logger;
        this._disposers = new Set();
    }

    /**
     * Register a disposer callback to guarantee teardown.
     */
    trackDisposer(disposer) {
        if (typeof disposer === 'function') {
            this._disposers.add(disposer);
        }
    }

    /**
     * Attach controller-specific DOM/event wiring. Subclasses implement this.
     */
    initialize(/* options */) {
        throw new Error('ControllerBase.initialize must be implemented by subclasses');
    }

    /**
     * Dispose all tracked resources.
     */
    dispose() {
        for (const disposer of this._disposers) {
            try {
                disposer();
            } catch (err) {
                this.logger?.error?.('ui', 'Controller disposer failed', err);
            }
        }
        this._disposers.clear();
    }
}
