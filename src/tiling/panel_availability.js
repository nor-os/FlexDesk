/**
 * panel_availability.js — what "this panel is offered here" means, said once.
 *
 * A panel side (`left`, `right`, `bottom`) is either offered or withheld. Two
 * places may say so, and both speak the same small language:
 *
 *   - a KindDef's `panels` (kind_taxonomy.js) — what a kind of content offers
 *   - `wm.setPanelAvailability(side, offer)` — content overriding at runtime
 *
 * An OFFER is one of:
 *
 *   true              offered (the same as saying nothing)
 *   false             withheld, with no reason to show
 *   { reason }        withheld, and `reason` is what the toggle's tooltip says
 *
 * Read into `{ available, reason }`. Anything else is a boot error rather than
 * a panel that silently stays put, for the same reason a bad `topNav` pointer
 * is one (createTaxonomy).
 *
 * Internal: neither export is part of the package surface.
 */

export const PANEL_SIDES = Object.freeze(['left', 'right', 'bottom']);

/** What every side is when nobody declared anything: offered, as panels always
 *  were before availability existed. */
export const PANEL_OFFERED = Object.freeze({ available: true, reason: null });

/** Read one offer. `where` names the caller in the error. */
export function readPanelOffer(offer, where) {
    if (offer === true) return PANEL_OFFERED;
    if (offer === false) return Object.freeze({ available: false, reason: null });
    if (offer && typeof offer === 'object' && !Array.isArray(offer)) {
        const { reason = null } = offer;
        if (reason !== null && typeof reason !== 'string') {
            throw new TypeError(`${where}: a panel's \`reason\` must be a string`);
        }
        return Object.freeze({ available: false, reason: reason || null });
    }
    throw new TypeError(`${where}: a panel offer is true, false or { reason }`);
}

/** Throw unless `side` is one of PANEL_SIDES. */
export function assertPanelSide(side, where) {
    if (!PANEL_SIDES.includes(side)) {
        throw new TypeError(`${where}: unknown panel side '${side}' `
            + `(expected ${PANEL_SIDES.join(', ')})`);
    }
}
