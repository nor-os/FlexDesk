/**
 * PageBase (js_new)
 *
 * Abstract shell for every top-level UI page (node workspace, simulation, data).
 * Handles dependency injection + shared lifecycle hooks so individual pages only
 * focus on domain logic.
 *
 * ## Async Initialization Pattern
 * Pages with async initialization should:
 * 1. Store the init promise: `this._initPromise = this.init();` in mount()
 * 2. Use `await this.waitForReady()` in show()/hydrate() to wait for init
 * 3. Mark completion by resolving the promise (init() returns)
 *
 * Example:
 * ```javascript
 * mount(container) {
 *     this.container = container;
 *     this._initPromise = this.init();  // Store promise
 *     this._mounted = true;
 * }
 *
 * async show() {
 *     await this.waitForReady();  // Wait for init if still running
 *     this.refresh();
 * }
 * ```
 */
export class PageBase {
    constructor({ eventBus, dataManager, notificationCenter, logger } = {}) {
        if (new.target === PageBase) {
            throw new Error('PageBase is abstract – extend it instead');
        }

        this.eventBus = eventBus;
        this.dataManager = dataManager;
        this.notificationCenter = notificationCenter;
        this.logger = logger;
        this._mounted = false;

        /**
         * Promise that resolves when async initialization completes.
         * Pages with async init should set this in mount().
         * @type {Promise<void>|null}
         */
        this._initPromise = null;
    }

    /**
     * Mount the page into a DOM container. Concrete pages must override this.
     * For pages with async initialization, store the init promise:
     * `this._initPromise = this.init();`
     */
    mount(/* container */) {
        throw new Error('PageBase.mount must be implemented by subclasses');
    }

    /**
     * Wait for the page to complete initialization.
     * Returns immediately if no async init or if already complete.
     * @returns {Promise<void>}
     */
    async waitForReady() {
        if (this._initPromise) {
            try {
                await this._initPromise;
            } catch (err) {
                this.logger?.warn?.('page', 'Init promise rejected', err);
            }
        }
    }

    /**
     * Optional hook invoked after the initial mount to hydrate data/state.
     * For pages with async init, this should await waitForReady().
     */
    async hydrate(/* options */) {
        // default: wait for init to complete
        await this.waitForReady();
    }

    /**
     * Optional hook for when the page becomes active (tab switched, etc.).
     */
    onActivated(/* context */) {
        // default no-op
    }

    /**
     * Optional hook for when the page is hidden/unmounted but not disposed.
     */
    onDeactivated(/* context */) {
        // default no-op
    }

    /**
     * Dispose resources/event subscriptions.
     */
    dispose() {
        this._mounted = false;
        this._initPromise = null;
    }
}
