/**
 * content_registry.js — maps a content kind string to a factory that
 * mounts that content into a tile body element.
 *
 * A content factory has the shape:
 *
 *     (hostEl, props, ctx) -> { destroy?(), title?, ... }
 *
 * The tile renderer calls the factory once when the leaf is first
 * mounted with a given (kind, props) pair, and `destroy()` on unmount.
 *
 * ── ONE REGISTRY PER SHELL ────────────────────────────────────────────
 * This module used to hold a module-level `Map` plus a `register(kind, fn)`
 * export. Two problems, both structural:
 *
 *   1. Two shells on one page shared their kind -> factory table, so a
 *      foreign-ontology shell silently inherited the other embedder's
 *      factories. A module singleton is the global we are removing,
 *      wearing a hat.
 *   2. `register()` could be called AFTER the first mount. A leaf mounted
 *      against a missing factory renders the placeholder and the renderer
 *      caches that DOM per (kind, props) — a later registration invalidates
 *      nothing, so an entire restored session stays wrong.
 *
 * `createContentRegistry(map)` fixes both: the map is a REQUIRED
 * constructor argument of `createShell()`, validated up-front, and frozen
 * before the WM is built. There is nothing left to call late.
 *
 * This module knows no kind names but one — `window-placeholder`, which is
 * the WM's OWN content (shown in a tile whose content was promoted into a
 * managed window). Defaulting it here means an embedder cannot forget it
 * and get a "no factory registered" tile the first time it promotes.
 */

export const PLACEHOLDER_KIND = 'window-placeholder';

/** Shown in a tile while its content lives in a managed window. Pure
 *  `twm-*` markup; clicking the button demotes the window back. */
function windowPlaceholderFactory(hostEl, props, ctx) {
    hostEl.innerHTML = `
        <div class="twm-window-placeholder">
            <span class="material-symbols-outlined twm-window-placeholder__icon">open_in_new</span>
            <div class="twm-window-placeholder__title">${_esc(props.originalTitle || props.originalKind || 'content')}</div>
            <div class="twm-window-placeholder__hint">is open in a managed window</div>
            <button class="twm-window-placeholder__btn" data-action="bring-back">
                Bring back to this tile
            </button>
        </div>
    `;
    hostEl.querySelector('[data-action="bring-back"]')?.addEventListener('click', () => {
        ctx.wm?.bringBackWindow?.(props.windowId);
    });
    return { title: `${props.originalTitle || props.originalKind} (window)` };
}

/**
 * Build a shell-scoped content registry.
 *
 * @param {Object<string, Function>} map  kind -> content factory
 * @returns {{ has(kind): boolean, mount(kind, hostEl, props, ctx): object }}
 */
export function createContentRegistry(map = {}) {
    if (!map || typeof map !== 'object') {
        throw new TypeError('createContentRegistry: `content` must be an object of kind -> factory');
    }
    for (const [kind, factory] of Object.entries(map)) {
        if (typeof factory !== 'function') {
            throw new TypeError(
                `createContentRegistry: factory for "${kind}" must be a function`);
        }
    }
    const factories = new Map(Object.entries(map));
    if (!factories.has(PLACEHOLDER_KIND)) {
        factories.set(PLACEHOLDER_KIND, windowPlaceholderFactory);
    }

    return Object.freeze({
        has: (kind) => factories.has(kind),

        mount: (kind, hostEl, props, ctx) => {
            const factory = factories.get(kind) || _placeholder(kind);
            try {
                return factory(hostEl, props || {}, ctx || {}) || {};
            } catch (err) {
                console.error('[content_registry] mount failed for', kind, err);
                hostEl.innerHTML =
                    `<div class="twm-tile-error">Mount failed: ${err && err.message || err}</div>`;
                return {};
            }
        },
    });
}

function _placeholder(kind) {
    return (hostEl) => {
        hostEl.innerHTML = `
            <div class="tile-placeholder">
                <div class="tile-placeholder__title">${kind}</div>
                <div class="tile-placeholder__hint">no factory registered yet</div>
            </div>
        `;
        return { title: kind };
    };
}

function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
