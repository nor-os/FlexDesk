/**
 * loading_overlay.js — the canonical "content is loading" overlay.
 *
 * An absolutely-positioned spinner layer dropped over a slot while an async
 * mount is in flight, with an 80ms grace period so cache hits / instant
 * renders never strobe a spinner. Returns a `done()` that removes it.
 *
 * Uses the global `twm-tile-loading` styles (ui/css/tiling/host.css). Shared
 * by the WM page-stub shell and the agent Code tab's split view.
 *
 *   const done = makeLoadingOverlay(slot);
 *   try { await mount(); } finally { done(); }
 */

/** Drop a loading overlay over `slot` and return a `done()` to remove it.
 *  The overlay stays invisible for `delay` ms (default 80) so fast renders
 *  don't flash a spinner. `slot` must be a positioned ancestor (or pass one
 *  that is); the overlay is `position:absolute; inset:0`. */
export function makeLoadingOverlay(slot, { delay = 80 } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'twm-tile-loading twm-tile-loading--pending';
    overlay.innerHTML =
        '<div class="twm-tile-loading__spinner" aria-label="Loading"></div>';
    slot.appendChild(overlay);
    // Promote to visible only if the mount hasn't finished within the grace.
    const showTimer = setTimeout(() => {
        overlay.classList.remove('twm-tile-loading--pending');
    }, delay);
    return () => {
        clearTimeout(showTimer);
        overlay.remove();
    };
}
