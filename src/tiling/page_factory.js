/**
 * page_factory.js — the MECHANISM behind a tile's content, with no
 * knowledge of what that content is about.
 *
 * `createPageFactories()` returns the four wrappers an embedder uses to
 * turn its own page/tab modules into content factories:
 *
 *     tabFactory(kind, factory)      breadcrumb page-shell + a mounted tab
 *     bareTabFactory(kind, factory)  same, minus the breadcrumb (transient forms)
 *     stubPageFactory(kind, render)  breadcrumb + a plain render fn + loading overlay
 *     mountTabBody / makeShim        the pieces the three are built from
 *
 * ── makeShim: the navigation contract ─────────────────────────────────
 * Mounted content receives a `workspaceTabs` object. That object IS the
 * library's public navigation API in embryo:
 *
 *     openTab      open a kind in THIS tile          (openFromContext)
 *     openInTab    open it as a new TAB in this tile (openInTabFromContext)
 *     openInWindow open it in a fresh managed window
 *     updateProps  persist editor sub-state into this tile's tab props
 *     closeTab     close this tab (falls back to closing the tile)
 *     notifyChanged  broadcast "I mutated the project" so sidebars refresh
 *
 * ── refreshOn / events: no bus-name literals here ─────────────────────
 * This module used to hardcode five bus names (`<domain>:run:tick`, …) and
 * one mutation event. Both are now INJECTED:
 *
 *     refreshOn  { [busEvent]: reasonString }  fanned into tab.refresh(reason)
 *     events     { projectChanged? }           emitted by close/notifyChanged
 *
 * An absent key means an absent subscription / an absent emit, so an
 * embedder with no run loop simply passes `{}` and nothing fires.
 */

import { makeLoadingOverlay } from './loading_overlay.js';
import { mountTileBreadcrumb } from './tile_breadcrumb.js';

/**
 * @param {object}  cfg
 * @param {object}  cfg.eventBus   the embedder's bus (may be null)
 * @param {object}  cfg.events     { projectChanged?: string }
 * @param {object}  cfg.refreshOn  { [busEventName]: reason } -> tab.refresh(reason)
 */
export function createPageFactories({ eventBus = null, events = {}, refreshOn = {} } = {}) {
    const projectChanged = events?.projectChanged || null;

    // The `workspaceTabs` API tile content calls to open/close tabs and
    // broadcast mutations. Shared by breadcrumbed and bare tabs.
    const makeShim = (ctx) => ({
        // Route through openFromContext so navigation triggered from a
        // split tile / window stays in that container.
        openTab: ({ kind: k, entityId, label, icon, subTab }) =>
            ctx.wm?.openFromContext(ctx, k, { id: entityId, label, icon, subTab }),
        // Open the same content as a NEW TAB in the current tile.
        openInTab: ({ kind: k, entityId, label, icon, subTab }) =>
            ctx.wm?.openInTabFromContext(ctx, k, { id: entityId, label, icon, subTab }),
        // Open the same content in a fresh managed window.
        openInWindow: ({ kind: k, entityId, label, icon, subTab }) =>
            ctx.wm?.navigate(k, { id: entityId, label, icon, subTab }, { ctx, dest: 'window' }),
        // Persist editor sub-state into this tile's WM tab props.
        updateProps: (patch) => {
            try { ctx.wm?.updateActiveTabProps?.(ctx.leafId, patch); }
            catch (err) { console.warn('[shim] updateProps failed', err); }
        },
        // Close just THIS tab (not the whole tile); falls back to closing
        // the tile when it's the last tab. Also broadcasts so sidebars /
        // landings / nav refresh against the mutated project state.
        closeTab: (_id) => {
            if (projectChanged) {
                try { eventBus?.emit?.(projectChanged, { source: 'twm-tab-close' }); } catch {}
            }
            try { ctx.wm?.closeActiveTab?.(ctx.leafId); } catch (err) {
                console.warn('[shim] closeTab failed', err);
            }
        },
        // Non-closing mutations (Save/New/Rename) broadcast so listeners refresh.
        notifyChanged: (domain) => {
            if (!projectChanged) return;
            try {
                eventBus?.emit?.(projectChanged,
                    { source: 'tab-mutation', domain: domain || null });
            } catch {}
        },
        registerProvider: () => {},
        getActiveTab: () => null,
    });

    // Run a content factory inside a content slot: build the shim, mount
    // the tab, drive the loading overlay, and fan the embedder's declared
    // events into the tab's refresh(reason) hook (tabs that don't
    // self-subscribe would otherwise freeze mid-run). Returns a teardown
    // that removes listeners + disposes the tab.
    const mountTabBody = (factory, contentSlot, props, ctx) => {
        const shim = makeShim(ctx);
        const tab = factory(contentSlot, props?.id ?? props?.entityId ?? null, {
            logger: null, eventBus, workspaceTabs: shim,
            wm: ctx.wm, leafId: ctx.leafId, windowId: ctx.windowId,
        });
        const hideLoading = makeLoadingOverlay(contentSlot);
        try {
            const ret = tab?.mount?.(props);
            if (ret && typeof ret.then === 'function') {
                ret.then(hideLoading, (err) => {
                    console.error('[page] mount failed', err);
                    hideLoading();
                });
            } else {
                requestAnimationFrame(hideLoading);
            }
        } catch (err) {
            console.error('[page] mount failed', err);
            hideLoading();
        }
        const listeners = {};
        if (typeof tab?.refresh === 'function' && eventBus?.on) {
            for (const [busEvent, reason] of Object.entries(refreshOn || {})) {
                const fn = () => {
                    try { tab.refresh(reason); }
                    catch (err) { console.warn('[page] refresh failed', busEvent, err); }
                };
                listeners[busEvent] = fn;
                eventBus.on(busEvent, fn);
            }
        }
        return () => {
            for (const [n, fn] of Object.entries(listeners)) {
                try { eventBus?.off?.(n, fn); } catch {}
            }
            try { tab?.dispose?.(); tab?.unmount?.(); } catch {}
        };
    };

    /** Wrap a tab factory in a "page shell" — breadcrumb strip at the top,
     *  content fills the rest. `kind` is captured at build time so the
     *  breadcrumb knows which crumbs to build. */
    const tabFactory = (kind, factory) => (host, props, ctx) => {
        host.classList.add('twm-page-shell');
        host.innerHTML = '';
        const contentSlot = document.createElement('div');
        contentSlot.className = 'twm-page-shell__content';
        // Focusable via JS so `document.activeElement` lands inside the
        // page when the tile is activated.
        contentSlot.tabIndex = -1;

        // A breadcrumb navigates the host TILE — meaningless for an entity
        // opened in a standalone managed window, where we want only the
        // entity view. Skip the crumb when mounted in a window.
        let crumb = null;
        if (!ctx?.windowId) {
            const breadcrumbSlot = document.createElement('div');
            breadcrumbSlot.className = 'twm-page-shell__breadcrumb';
            host.appendChild(breadcrumbSlot);
            crumb = mountTileBreadcrumb(kind, props, { ...ctx, eventBus });
            breadcrumbSlot.appendChild(crumb.el);
        }
        host.appendChild(contentSlot);

        const teardown = mountTabBody(factory, contentSlot, props, ctx);
        return {
            destroy: () => {
                teardown();
                try { crumb?.destroy(); } catch {}
            },
        };
    };

    // Like tabFactory but with NO breadcrumb chrome — for transient /
    // form content (e.g. an add-row entry mask) that isn't an entity
    // view. Content still gets the full ctx (wm/leafId) + shim, so it
    // can self-close via wm.closeActiveTab.
    const bareTabFactory = (kind, factory) => (host, props, ctx) => {
        host.classList.add('twm-page-shell');
        host.innerHTML = '';
        const contentSlot = document.createElement('div');
        contentSlot.className = 'twm-page-shell__content';
        contentSlot.tabIndex = -1;
        host.appendChild(contentSlot);
        return { destroy: mountTabBody(factory, contentSlot, props, ctx) };
    };

    /** Page with a breadcrumb at the top and a plain `render(slot, props, ctx)`
     *  body — for content that isn't a full tab object. If `render` returns a
     *  `ready` promise the loading overlay waits on it. */
    const stubPageFactory = (kind, render) => (host, props, ctx) => {
        host.classList.add('twm-page-shell');
        host.innerHTML = '';
        const breadcrumbSlot = document.createElement('div');
        breadcrumbSlot.className = 'twm-page-shell__breadcrumb';
        const contentSlot = document.createElement('div');
        contentSlot.className = 'twm-page-shell__content';
        contentSlot.tabIndex = -1;
        host.appendChild(breadcrumbSlot);
        host.appendChild(contentSlot);
        const crumb = mountTileBreadcrumb(kind, props, { ...ctx, eventBus });
        breadcrumbSlot.appendChild(crumb.el);
        const hideLoading = makeLoadingOverlay(contentSlot);
        const ret = render(contentSlot, props, ctx) || {};
        // Most landings kick off their own async refresh after the
        // synchronous render returns. If render exposes a `ready`
        // promise we await it; otherwise hide on the next frame.
        if (ret.ready && typeof ret.ready.then === 'function') {
            ret.ready.then(hideLoading, hideLoading);
        } else {
            requestAnimationFrame(hideLoading);
        }
        return {
            title: ret.title,
            destroy: () => { try { crumb.destroy(); } catch {} ret.destroy?.(); },
        };
    };

    return Object.freeze({
        makeShim, mountTabBody, tabFactory, bareTabFactory, stubPageFactory,
    });
}
