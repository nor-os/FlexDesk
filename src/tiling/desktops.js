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
function _makeDesktop(label, seed) {
    const tree = new TileTree();
    tree.setRoot(makeLeaf(seed()));
    return {
        id: `desk-${Math.random().toString(36).slice(2, 8)}`,
        label,
        tree,
        windows: [],
        // boot default: left + right + bottom all open. Names are
        // assigned by wm._canonicalize via PANEL_TITLES.
        panels: { ...DEFAULT_PANEL_STATE },
    };
}

export class DesktopManager {
    /** @param {{seed: () => object}} opts  `seed` builds the root leaf. Required. */
    constructor({ seed } = {}) {
        if (typeof seed !== 'function') {
            throw new Error('DesktopManager: a `seed` function is required (the taxonomy root leaf)');
        }
        this.seed = seed;
        this.desktops = [_makeDesktop('1', seed)];
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
            this.desktops.push(_makeDesktop(String(this.desktops.length + 1), this.seed));
        }
    }

    addDesktop(label = null) {
        const d = _makeDesktop(label || String(this.desktops.length + 1), this.seed);
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

    static deserialize(blob, { seed } = {}) {
        const m = new DesktopManager({ seed });
        if (!blob || !Array.isArray(blob.desktops) || blob.desktops.length === 0) return m;
        m.desktops = blob.desktops.map((raw) => ({
            id: raw.id || `desk-${Math.random().toString(36).slice(2,8)}`,
            label: raw.label || '?',
            tree: raw.tree ? TileTree.deserialize(raw.tree) : new TileTree(),
            windows: [],
            panels: { ...DEFAULT_PANEL_STATE, ...(raw.panels || {}) },
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
