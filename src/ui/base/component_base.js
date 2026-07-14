/**
 * ComponentBase (js_new)
 *
 * Ultra-lightweight base for leaf UI widgets rendered inside controllers/panels.
 * Handles props/state updates and deterministic teardown without storing data on
 * DOM elements.
 */
export class ComponentBase {
    constructor({ eventBus, logger } = {}) {
        if (new.target === ComponentBase) {
            throw new Error('ComponentBase is abstract – extend it instead');
        }

        this.eventBus = eventBus;
        this.logger = logger;
        this._mounted = false;
    }

    mount(/* container, props */) {
        throw new Error('ComponentBase.mount must be implemented by subclasses');
    }

    update(/* props */) {
        // default no-op for stateless components
    }

    dispose() {
        this._mounted = false;
    }
}
