/**
 * kind_taxonomy.js — the taxonomy PORT.
 *
 * A "kind" is a content type the user can navigate to. The tiling shell
 * needs to know four things about one: what to call it, what icon it
 * wears, which top-nav slot owns it, and what sits above it. It must
 * NOT know what any of them mean.
 *
 * So the taxonomy is INJECTED, not imported. The embedder describes its
 * own ontology and hands it to `createTaxonomy()` at boot; the shell
 * closes over the result. Nothing in this file names a kind, and the
 * framework runs unchanged on a completely different vocabulary.
 *
 * Consumed by:
 *
 *   - install.js          → top-nav buttons + active-state highlight
 *   - tile_breadcrumb.js  → breadcrumb segments
 *   - wm.js navigateBack  → Backspace parent
 *   - command_palette.js  → palette chip strip + row icons
 *   - tile_tab_menu.js    → which sources a tile's hamburger lists
 *
 * ## KindDef
 *
 *   label       Long form, used in breadcrumb segments + palette.
 *   shortLabel  Optional ≤4-char chip text for the top-nav.
 *               Falls back to `label` when omitted.
 *   icon        Material Symbols name.
 *   topNav      Top-nav category this kind belongs to. Determines which
 *               button lights up + which segment the breadcrumb inserts
 *               after the root. Omit on the top-nav kind itself.
 *   isTopNav    True iff this kind owns a slot in the top-nav strip.
 *   order       Sort key for top-nav display (lower = leftward).
 *   appGlobal   True iff the kind is not scoped to the root entity (a
 *               preferences page, say). Its breadcrumb omits the root.
 *   sources     Entity-source ids the tile hamburger lists when a tile
 *               is on this page. Only meaningful on top-nav kinds; the
 *               root's list is the fallback.
 *
 *   ancestors?  `(props) => [{ kind, id, label? }]` — the entity-level
 *               ancestors of ONE instance, root-most first, EXCLUDING
 *               the top-nav segment and the node itself. This is the
 *               hook that replaces every hardcoded "split the id to
 *               find its parent" branch: naming conventions are the
 *               embedder's business, not the shell's.
 *   labelOf?    `(props) => string` — display label for ONE instance.
 *               Defaults to `props.label`, then `props.id`.
 *   panels?     `{ left?, right?, bottom? }` — which panels this kind
 *               offers while it is the primary tile. Each side is `true`,
 *               `false` or `{ reason }` (see panel_availability.js); a side
 *               not named is offered. A kind that names no side inherits
 *               that side from its top-nav kind, so declaring it on a page
 *               covers every entity opened under it. Withheld panels are
 *               not inserted and their toggles are disabled, showing
 *               `reason`.
 *
 *   single?     `true`, or the name of a prop. The kind exists ONCE: content
 *               that holds heavy app-wide state and must not be mounted
 *               twice. With `true` there is one instance of the kind; with a
 *               prop name there is one per value of that prop (`'id'`: one
 *               tile per record). The window manager makes every open path
 *               reveal the instance that exists, refuses the copy verbs with
 *               a reason, and keeps the first of any duplicates a restored
 *               layout holds. The root kind cannot be single: every new
 *               pane, tab and desktop is seeded with it.
 *
 *   window?     `{ width?, height? }` — the initial size, in px, of a managed
 *               window this kind opens in (`navigate(…, { dest: 'window' })`,
 *               or always for `windowOnly`); clamped to the screen and to the
 *               window's minimum (400 × 300) as any window is. Absent: the
 *               window's default size (STORY-0127).
 *   windowOnly? `true`: the kind lives in a managed window, never in a tile
 *               — a tool, not a page. Every open path (navigate with any
 *               `dest`, openInPrimary, openInLeaf, the tab and split verbs)
 *               opens it in a window; its window never docks into a tile
 *               (no Back to tile, maximise is geometric, no drag-to-dock); a
 *               restored layout drops a tile tab of it, with one warning, and
 *               a tab's history entry of it opens a window. Neither the root
 *               nor a top-nav kind can be window-only (STORY-0127).
 */

import { PANEL_OFFERED, PANEL_SIDES, readPanelOffer } from './panel_availability.js';

/** Build a taxonomy from an embedder's kind map. Validated eagerly and
 *  frozen — a typo in a `topNav` pointer is a boot error, not a chrome
 *  surface that silently renders nothing six clicks later. */
export function createTaxonomy({ kinds, root } = {}) {
    if (!kinds || typeof kinds !== 'object') {
        throw new TypeError('createTaxonomy: `kinds` must be an object of KindDefs');
    }
    if (!root || !kinds[root]) {
        throw new Error(`createTaxonomy: root kind '${root}' is not in the taxonomy`);
    }
    for (const [kind, def] of Object.entries(kinds)) {
        if (!def || typeof def !== 'object') {
            throw new TypeError(`createTaxonomy: '${kind}' is not a KindDef`);
        }
        if (def.topNav && !kinds[def.topNav]) {
            throw new Error(
                `createTaxonomy: '${kind}' hangs off unknown topNav '${def.topNav}'`);
        }
        if (def.isTopNav && def.topNav) {
            throw new Error(
                `createTaxonomy: '${kind}' is both a top-nav kind and owned by one`);
        }
        if (def.panels !== undefined) {
            if (!def.panels || typeof def.panels !== 'object' || Array.isArray(def.panels)) {
                throw new TypeError(`createTaxonomy: '${kind}'.panels must be an object`);
            }
            for (const [side, offer] of Object.entries(def.panels)) {
                if (!PANEL_SIDES.includes(side)) {
                    throw new Error(`createTaxonomy: '${kind}'.panels names unknown side '${side}'`);
                }
                readPanelOffer(offer, `createTaxonomy: '${kind}'.panels.${side}`);
            }
        }
        if (def.single != null && def.single !== false && def.single !== true
            && !(typeof def.single === 'string' && def.single)) {
            throw new TypeError(
                `createTaxonomy: '${kind}'.single must be true or a prop name`);
        }
        if (def.window != null) {
            const w = def.window;
            const bad = (v) => v != null && !(typeof v === 'number' && Number.isFinite(v) && v > 0);
            if (typeof w !== 'object' || Array.isArray(w) || bad(w.width) || bad(w.height)) {
                throw new TypeError(
                    `createTaxonomy: '${kind}'.window must be { width?, height? } in positive px`);
            }
        }
        if (def.windowOnly != null && typeof def.windowOnly !== 'boolean') {
            throw new TypeError(`createTaxonomy: '${kind}'.windowOnly must be true or false`);
        }
        if (def.windowOnly && def.isTopNav) {
            throw new Error(
                `createTaxonomy: '${kind}' is a top-nav page and cannot be windowOnly — a page lives in tiles`);
        }
    }
    if (kinds[root].windowOnly) {
        throw new Error(
            `createTaxonomy: the root kind '${root}' cannot be windowOnly — `
            + 'every new pane, tab and desktop is seeded with it');
    }
    if (kinds[root].single) {
        throw new Error(
            `createTaxonomy: the root kind '${root}' cannot be single — `
            + 'every new pane, tab and desktop is seeded with it');
    }
    const _kinds = Object.freeze({ ...kinds });

    /** Lookup. `undefined` for unknown kinds — chrome code treats that
     *  as "render the kind name verbatim". */
    const meta = (kind) => _kinds[kind];

    /** Top-nav category id that owns `kind`. For a top-nav kind itself,
     *  returns the same kind. `undefined` when the kind isn't in the
     *  taxonomy (caller renders a fallback). */
    const topNavFor = (kind) => {
        const m = _kinds[kind];
        if (!m) return undefined;
        return m.isTopNav ? kind : m.topNav;
    };

    /** Backspace target — walk one step up the KIND hierarchy. A
     *  top-nav page goes to the root; everything else goes to its
     *  top-nav. The root itself returns `null`. */
    const parentKindFor = (kind) => {
        if (kind === root) return null;
        const m = _kinds[kind];
        if (!m) return null;
        if (m.isTopNav) return root;
        return m.topNav || root;
    };

    /** Entity-level ancestors of one instance, root-most first. Empty
     *  unless the KindDef supplies an `ancestors` hook. Normalised to
     *  `{ kind, props }` so callers hand the result straight to
     *  `wm.navigate`. A throwing hook is a warning, never a crash: the
     *  breadcrumb degrades to its generic form. */
    const ancestors = (kind, props) => {
        const fn = _kinds[kind]?.ancestors;
        if (typeof fn !== 'function') return [];
        let out;
        try { out = fn(props || {}); }
        catch (err) {
            console.warn('[taxonomy] ancestors() threw for', kind, err);
            return [];
        }
        if (!Array.isArray(out)) return [];
        return out
            .filter((a) => a && a.kind)
            .map((a) => ({ kind: a.kind, props: { id: a.id, label: a.label ?? a.id } }));
    };

    /** The nearest entity-level ancestor, or `null`. */
    const parentOf = (kind, props) => {
        const chain = ancestors(kind, props);
        return chain.length ? chain[chain.length - 1] : null;
    };

    /** Display label for one instance of `kind`. */
    const labelOf = (kind, props) => {
        const fn = _kinds[kind]?.labelOf;
        if (typeof fn === 'function') {
            try {
                const s = fn(props || {});
                if (s) return String(s);
            } catch (err) {
                console.warn('[taxonomy] labelOf() threw for', kind, err);
            }
        }
        if (props?.label) return String(props.label);
        return props?.id != null ? String(props.id) : '';
    };

    /** Entity-source ids a tile on `kind` should offer. Falls back to
     *  the root's list, which is the "everything" default. */
    const sourcesFor = (kind) => {
        const s = _kinds[kind]?.sources ?? _kinds[root]?.sources;
        return Array.isArray(s) ? s : [];
    };

    /** Whether `kind` offers the panel on `side`: `{ available, reason }`.
     *  The kind's own declaration for that side, else its top-nav kind's,
     *  else offered. Unknown and absent kinds offer every panel. */
    const panelOffer = (kind, side) => {
        for (const k of [kind, _kinds[kind]?.topNav]) {
            const offer = k ? _kinds[k]?.panels?.[side] : undefined;
            if (offer !== undefined) return readPanelOffer(offer, `taxonomy '${k}'.panels.${side}`);
        }
        return PANEL_OFFERED;
    };

    /** Top-nav entries in display order:
     *      { kind, label (short), longLabel, icon }
     *  `label` is the chip text; `longLabel` is what the palette shows. */
    const topNavEntries = () =>
        Object.entries(_kinds)
            .filter(([, m]) => m.isTopNav)
            .sort((a, b) => (a[1].order ?? 1000) - (b[1].order ?? 1000))
            .map(([kind, m]) => ({
                kind,
                label:     m.shortLabel || m.label,
                longLabel: m.label,
                icon:      m.icon,
            }));

    /** Whether `kind` exists once (KindDef `single`). */
    const isSingle = (kind) => {
        const s = _kinds[kind]?.single;
        return s === true || (typeof s === 'string' && s !== '');
    };

    /** The identity of one instance of a single kind: two tab specs with the
     *  same key are the same instance. `null` for a kind that is not single,
     *  which is how callers ask both questions at once. Keyed by the kind and,
     *  for `single: '<prop>'`, that prop's value as a string. */
    const instanceKey = (kind, props) => {
        if (!isSingle(kind)) return null;
        const by = _kinds[kind].single;
        if (by === true) return String(kind);
        const v = props?.[by];
        return `${kind}\u0000${v == null ? '' : String(v)}`;
    };

    /** Whether `kind` lives in a managed window only (KindDef `windowOnly`). */
    const isWindowOnly = (kind) => _kinds[kind]?.windowOnly === true;

    /** The initial size of a window `kind` opens in (KindDef `window`), or null. */
    const windowSize = (kind) => {
        const w = _kinds[kind]?.window;
        return w ? { width: w.width ?? null, height: w.height ?? null } : null;
    };

    /** The sentence a refused copy verb shows for a single kind. */
    const singleReason = (kind) =>
        `${_kinds[kind]?.label || kind} is open once: use the one that is open`;

    return Object.freeze({
        root,
        kinds: _kinds,
        meta,
        topNavFor,
        parentKindFor,
        ancestors,
        parentOf,
        labelOf,
        sourcesFor,
        panelOffer,
        topNavEntries,
        isSingle,
        instanceKey,
        singleReason,
        isWindowOnly,
        windowSize,
    });
}
