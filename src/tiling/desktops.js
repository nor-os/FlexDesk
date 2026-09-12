/**
 * desktops.js — independent tile trees per virtual desktop, persisted
 * through the host's `state` capability under the logical key `desktops`.
 * Where that key actually lands is the embedder's business (see the host's
 * `resolvePath`); this module only names it.
 *
 * Each desktop = { id, label, tree (TileTree), windows ([]), panels }.
 * Switching desktops swaps the active tree under the renderer.
 */

import { TileTree, makeLeaf } from './tile_tree.js';

/** What a FRESH desktop's panel tiles start as, when the embedder says nothing.
 *
 *  C14. It is a DEFAULT, not a constant. An embedder whose navigator and
 *  inspector are its own chrome OUTSIDE the WM root — an icon rail, say — has
 *  no `panel:left` factory to mount, and every desktop it creates would open
 *  with two "no factory registered yet" placeholders wedged either side of its
 *  content. It cannot fix that after the fact: `wm.load()` canonicalizes the
 *  panels in before it returns, and the renderer caches tile DOM per
 *  (kind, props). The only place the answer can be given is here, before the
 *  first desktop exists — which is what `panelDefaults` is for. */
const DEFAULT_PANEL_STATE = {
    left: true,
    right: true,
    bottom: true,
};

/**
 * `seed()` yields the leaf a fresh (or emptied) desktop starts with. It comes
 * from the taxonomy's root kind — see WindowManager, which supplies it. The
 * WM used to hardcode `{ kind: 'home', title: 'Home' }` here, which meant an
 * embedder with a different ontology still got an EcoAgent Home tile it had
 * never registered, and got the content_registry placeholder instead. There is
 * deliberately NO default: a silent 'home' fallback is the exact bug this
 * parameter exists to remove.
 */
function _makeDesktop(label, seed, panelDefaults = DEFAULT_PANEL_STATE) {
    const tree = new TileTree();
    tree.setRoot(makeLeaf(seed()));
    return {
        id: `desk-${Math.random().toString(36).slice(2, 8)}`,
        label,
        tree,
        windows: [],
        // Boot default: whatever the embedder asked for, left + right + bottom
        // when it asked for nothing. Names are assigned by wm._canonicalize via
        // PANEL_TITLES.
        panels: { ...panelDefaults },
    };
}

export class DesktopManager {
    /**
     * @param {object}   opts
     * @param {function} opts.seed           builds the root leaf. Required.
     * @param {object}  [opts.panelDefaults] C14. Which panel tiles a fresh
     *   desktop opens with, merged over `DEFAULT_PANEL_STATE`. Omitted, every
     *   desktop opens with all three — today's behaviour, unchanged.
     */
    constructor({ seed, panelDefaults = null } = {}) {
        if (typeof seed !== 'function') {
            throw new Error('DesktopManager: a `seed` function is required (the taxonomy root leaf)');
        }
        this.seed = seed;
        this.panelDefaults = { ...DEFAULT_PANEL_STATE, ...(panelDefaults || {}) };
        this.desktops = [_makeDesktop('1', seed, this.panelDefaults)];
        this.activeIdx = 0;
    }

    active() { return this.desktops[this.activeIdx]; }

    switchTo(idx) {
        if (idx < 0 || idx >= this.desktops.length) return false;
        if (idx === this.activeIdx) return false;
        this.activeIdx = idx;
        return true;
    }

    ensureCount(n) {
        while (this.desktops.length < n) {
            this.desktops.push(_makeDesktop(
                String(this.desktops.length + 1), this.seed, this.panelDefaults));
        }
    }

    addDesktop(label = null) {
        const d = _makeDesktop(
            label || String(this.desktops.length + 1), this.seed, this.panelDefaults);
        this.desktops.push(d);
        return d;
    }

    serialize() {
        return {
            activeIdx: this.activeIdx,
            desktops: this.desktops.map((d) => ({
                id: d.id, label: d.label,
                tree: d.tree.serialize(),
                panels: { ...d.panels },
                // windows serialized at WM level since we don't own
                // managed-window state in this module.
            })),
        };
    }

    static deserialize(blob, { seed, panelDefaults = null } = {}) {
        const m = new DesktopManager({ seed, panelDefaults });
        if (!blob || !Array.isArray(blob.desktops) || blob.desktops.length === 0) return m;
        m.desktops = blob.desktops.map((raw) => ({
            id: raw.id || `desk-${Math.random().toString(36).slice(2,8)}`,
            label: raw.label || '?',
            tree: raw.tree ? TileTree.deserialize(raw.tree) : new TileTree(),
            windows: [],
            // A RESTORED desktop's own answer wins over the default: the user
            // closed that panel, and re-opening it on every reload is the bug
            // this merge order avoids. The default only fills a key the stored
            // blob predates.
            panels: { ...m.panelDefaults, ...(raw.panels || {}) },
        }));
        // Empty tree → seed with the taxonomy root so the desktop is usable.
        for (const d of m.desktops) {
            if (!d.tree.rootId) d.tree.setRoot(makeLeaf(seed()));
        }
        m.activeIdx = Math.min(Math.max(0, blob.activeIdx | 0), m.desktops.length - 1);
        return m;
    }
}

/**
 * Persistence helpers. They take a host `state` capability; a host without
 * one is legal and they no-op. We don't fail loudly — the WM stays functional
 * against a host that cannot persist (e.g. the standalone demo).
 */

const DESKTOPS_KEY = 'desktops';

export async function loadDesktops(state) {
    if (!state) return null;
    try {
        return await state.read(DESKTOPS_KEY);
    } catch (err) {
        console.warn('[desktops] load failed', err);
        return null;
    }
}

export async function saveDesktops(state, blob) {
    if (!state) return false;
    try {
        await state.write(DESKTOPS_KEY, blob);
        return true;
    } catch (err) {
        console.warn('[desktops] save failed', err);
        return false;
    }
}
