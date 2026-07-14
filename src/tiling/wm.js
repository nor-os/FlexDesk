/**
 * wm.js — WindowManager facade. Owns the desktop manager, the active
 * tree's renderer, the managed-window stack, and the panel-tile state.
 * Exposes a small imperative API consumed by the palette, keymap, top
 * bar, bottom bar, and nav panel.
 *
 *   wm.openInPrimary(kind, props)     load a content into the primary tile
 *   wm.split(dir)                     split the focused tile
 *   wm.closeFocused()                 close the focused tile
 *   wm.focusDir(dir) / wm.moveFocused(dir)
 *   wm.toggleManagedFocused()         tile <-> managed window
 *   wm.togglePanel(side)              left | right | bottom
 *   wm.isPanelOpen(side)              boolean
 *   wm.switchDesktop(idx) / wm.addDesktop() / wm.moveFocusedToDesktop(idx)
 */

import { DesktopManager, saveDesktops, loadDesktops } from './desktops.js';
import { TileRenderer } from './tile_renderer.js';
import { makeLeaf } from './tile_tree.js';
import { PLACEHOLDER_KIND } from './content_registry.js';
import { installPanelKeyRouter } from './panel_keys.js';
import { ManagedWindow } from '../ui/components/managed_window.js';
import { showContextMenu } from '../ui/components/context_menu.js';

const PANEL_KINDS = new Set(['panel:left', 'panel:right', 'panel:bottom']);

const PANEL_TITLES = {
    left:   'Navigator',
    right:  'Inspector',
    bottom: 'Console',
};

export class WindowManager {
    constructor({ rootEl, api, ctx, onChange, eventBus, host, taxonomy, events, content }) {
        if (!taxonomy) throw new Error('WindowManager: a taxonomy is required');
        if (!content || typeof content.mount !== 'function') {
            throw new Error('WindowManager: a content registry is required '
                + '(createContentRegistry / createShell owns it)');
        }
        this.rootEl = rootEl;
        // The shell-scoped content registry (kind -> factory). NOT a module
        // singleton: two shells on one page must not share a kind table, and
        // nothing may register a kind after the first mount.
        this.content = content;
        this.api = api || null;
        // The host port. `this.api` stays: 20 domain page factories still read
        // `ctx.api` — that coupling is P3's problem, not the host port's.
        this.host = host || null;
        // The injected ontology (see tiling/kind_taxonomy.js). The WM asks it
        // for Backspace parents and top-nav sections; it names no kind itself.
        this.taxonomy = taxonomy;
        // Bus events the shell reacts to. Absent key ⇒ no subscription.
        this.events = events || {};
        this.ctx = ctx || {};
        this.eventBus = eventBus || null;
        this.onChange = onChange || (() => {});

        // The leaf a fresh or emptied desktop starts with. Comes from the
        // taxonomy's root kind — NOT a hardcoded 'home'. An embedder with a
        // different ontology used to get an EcoAgent Home tile it had never
        // registered, and therefore the content_registry placeholder.
        this._rootLeaf = () => {
            const kind = this.taxonomy.root;
            return {
                content: { kind, props: {} },
                title: this.taxonomy.meta(kind)?.label || kind,
            };
        };
        this.desktops = new DesktopManager({ seed: this._rootLeaf });
        this.renderer = new TileRenderer({
            root: rootEl,
            tree: this.desktops.active().tree,
            content,
            ctx: {
                ...this.ctx,
                wm: this,
                onLeafAction: (leafId, action) => this._leafAction(leafId, action),
                onLeafTabAction: (leafId, action, data) =>
                    this._leafTabAction(leafId, action, data),
            },
            onFocusChange: () => this._notifyChange(),
        });
        this._persistTimer = null;
        // Window-id → leaf-id mapping so a managed-window demote can
        // restore its original tile slot.
        this._windowToLeaf = new Map();

        // Central keyboard router: panels register key handlers and the
        // router dispatches each keydown only to the panel inside the
        // currently focused leaf (see panel_keys.js). One authority for
        // "which panel owns the keyboard" instead of every panel guessing
        // from document.activeElement.
        this.panelKeys = installPanelKeyRouter(this);

        // Live-update tab titles when entities are renamed. The embedder
        // names the event (`events.entityRenamed`); its per-entity editors
        // fire it on Save. Walks every leaf's `tabs` and `pageTabs` archive
        // so an archived page's tab labels stay accurate too. No event
        // configured ⇒ no subscription, and tab titles are simply static.
        const renamedEvent = this.events.entityRenamed;
        if (renamedEvent) {
            this.eventBus?.on?.(renamedEvent, ({ kind, entityId, label } = {}) => {
                if (!kind || !entityId || !label) return;
                let touched = false;
                for (const d of this.desktops.desktops) {
                    if (d.tree.renameMatchingTabs?.(kind, entityId, label)) {
                        touched = true;
                    }
                }
                if (touched) {
                    this.renderer.render();
                    this._persist();
                }
            });
        }
    }

    /** Emit on bus + call onChange. Use this instead of the bare callback
     *  so other surfaces (palette, top-bar toggles, page shortcuts) can
     *  subscribe through the existing event system. */
    _notifyChange(reason = null) {
        try { this.onChange(reason); } catch (err) { console.error('[wm] onChange threw', err); }
        try { this.eventBus?.emit?.('wm:changed', { reason, wm: this }); }
        catch (err) { console.warn('[wm] event emit failed', err); }
        // Emit the canonical `workspace:tabs:activated` event for the
        // current primary leaf — the existing sidebars (ProjectSidebar
        // etc.) already listen for this to highlight the active row.
        try {
            const tree = this._tree();
            const id = tree.primaryLeafId();
            const leaf = id ? tree.get(id) : null;
            const kind = leaf?.content?.kind;
            if (kind && kind !== 'window-placeholder') {
                this.eventBus?.emit?.('workspace:tabs:activated', {
                    kind,
                    entityId: leaf.content.props?.id ?? null,
                    label: leaf.title,
                    from: reason || 'wm',
                });
            }
        } catch (_) {}
    }

    // ── Persistence ─────────────────────────────────────────────────
    async load() {
        const blob = await loadDesktops(this.host?.state);
        if (blob) {
            this.desktops = DesktopManager.deserialize(blob, { seed: this._rootLeaf });
            this.renderer.tree = this.desktops.active().tree;
        }
        // Normalize: managed windows don't survive a reload, so any
        // window-placeholder leaves restore their original content.
        for (const d of this.desktops.desktops) {
            for (const leaf of d.tree.leaves()) {
                if (leaf.content?.kind === PLACEHOLDER_KIND) {
                    const p = leaf.content.props || {};
                    if (p.originalKind) {
                        d.tree.setLeafContent(leaf.id,
                            { kind: p.originalKind, props: p.originalProps || {} },
                            p.originalTitle || p.originalKind);
                    }
                }
            }
            this._canonicalize(d.tree, d);
        }
        this.renderer.tree = this.desktops.active().tree;
        this.renderer.render();
        this._notifyChange();
    }

    _persist() {
        if (this._persistTimer) clearTimeout(this._persistTimer);
        this._persistTimer = setTimeout(async () => {
            this._persistTimer = null;
            await saveDesktops(this.host?.state, this.desktops.serialize());
        }, 500);
    }

    // ── Content loading ─────────────────────────────────────────────
    /** Load content into the primary tile (last-active non-panel leaf).
    /** Walk back one step. Bound to Backspace.
     *
     *  Priority order:
     *    1. Active tab's per-tab history stack (browser-style "back"):
     *       any in-tile navigation (relationships click-through,
     *       landing-row open, "Open" buttons inside tables) pushed
     *       the previous state, and Backspace pops it. This is the
     *       canonical user-facing back affordance.
     *    2. When the history is empty (the user landed on this page
     *       via top-nav / palette / direct link), fall back to the
     *       canonical taxonomy walk: a sub-page goes to its
     *       top-nav, a top-nav page goes to Home.
     *
     *  Adding a new kind to the injected taxonomy wires the fallback path
     *  for Backspace + breadcrumb + top-nav highlight in one shot.
     *  Adding a new "Open from X" click that should be a back-able
     *  navigation just needs to use one of the in-tile routing
     *  methods (openFromContext / openInLeaf / navigateActiveTab) —
     *  they all record history by default. */
    navigateBack() {
        const tree = this._tree();
        // Prefer the FOCUSED leaf — that's where the user was just
        // interacting (Open click, breadcrumb step, etc.). Falls back
        // to the primary leaf for keyboard-driven Backspace when no
        // tile is explicitly focused (panels excluded). If the focused
        // leaf is a panel, walk back on the primary content leaf
        // instead (Backspace from the nav panel should still navigate
        // the user's content area).
        const focusedId = tree.focusedLeafId;
        const primaryId = tree.primaryLeafId();
        const focusedLeaf = focusedId ? tree.get(focusedId) : null;
        const focusedKind = focusedLeaf?.content?.kind || '';
        const id = (focusedId && focusedKind
                    && !focusedKind.startsWith('panel:')
                    && focusedKind !== 'window-placeholder')
            ? focusedId : primaryId;
        if (!id) return;
        // (1) Per-tab history pop, if anything was recorded.
        const prior = tree.popActiveTabHistory?.(id);
        if (prior && prior.kind) {
            // Cross-page back entries carry a `topNav` marker — pop
            // routes via swapToPage so we land on the correct page.
            const leafNow = tree.get(id);
            const curKind = leafNow?.content?.kind;
            const curTopNav = curKind ? this.taxonomy.topNavFor(curKind) : null;
            if (prior.topNav && curTopNav && prior.topNav !== curTopNav) {
                tree.swapToPage?.(
                    id,
                    { kind: prior.kind, props: prior.props || {},
                      title: prior.title || _tabTitle(prior.kind, prior.props) },
                    curTopNav, prior.topNav,
                    { recordHistory: false },
                );
            } else {
                tree.replaceActiveTabContent(
                    id,
                    { kind: prior.kind, props: prior.props || {} },
                    prior.title || _tabTitle(prior.kind, prior.props),
                    { recordHistory: false },
                );
            }
            tree.focus(id);
            this.renderer.render();
            this._persist();
            this._notifyChange('navigate-back');
            return;
        }
        // (2) Taxonomy fallback — the user's path is gone, so walk the
        // canonical parent instead. An ENTITY-level parent wins (the
        // instance one level up, e.g. the parent an id names); failing
        // that, the KIND-level parent (this page's section).
        const leaf = tree.get(id);
        if (!leaf?.content) return;
        const { kind, props } = leaf.content;
        const up = this.taxonomy.parentOf(kind, props);
        if (up) { this.navigateActiveTab(id, up.kind, up.props); return; }
        const parent = this.taxonomy.parentKindFor(kind);
        if (parent) this.navigateActiveTab(id, parent);
    }

    /** True when `navigateBack` would do something user-visible — i.e.
     *  the active tab has per-tab history, OR the current kind has a
     *  taxonomy parent. Used by the breadcrumb to grey out / hide the
     *  Back button when there's nowhere to go. */
    canNavigateBack() {
        const tree = this._tree();
        const focusedId = tree.focusedLeafId;
        const primaryId = tree.primaryLeafId();
        const focusedLeaf = focusedId ? tree.get(focusedId) : null;
        const focusedKind = focusedLeaf?.content?.kind || '';
        const id = (focusedId && focusedKind
                    && !focusedKind.startsWith('panel:')
                    && focusedKind !== 'window-placeholder')
            ? focusedId : primaryId;
        if (!id) return false;
        const history = tree.activeTabHistory?.(id) || [];
        if (history.length > 0) return true;
        const leaf = tree.get(id);
        const kind = leaf?.content?.kind;
        return !!(kind && this.taxonomy.parentKindFor(kind));
    }

    /** Persist editor sub-state (e.g. active sub-tab) into the active
     *  tab's WM props so future history snapshots restore the user's
     *  view rather than the default landing. Pure metadata write — no
     *  re-render, no history push. */
    updateActiveTabProps(leafId, patch) {
        const tree = this._tree();
        if (!tree?.updateActiveTabProps) return;
        tree.updateActiveTabProps(leafId, patch);
        this._persist();
    }

    /** Navigate inside the current tab — preserves every other tab in
     *  the leaf. Used by Backspace + breadcrumb segments + anything
     *  else that should walk WITHIN the tile rather than reset it. */
    navigateActiveTab(leafId, kind, props = {}) {
        const tree = this._tree();
        const leaf = tree.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') {
            this.openInPrimary(kind, props);
            return;
        }
        tree.replaceActiveTabContent(leafId, { kind, props }, _tabTitle(kind, props));
        tree.focus(leafId);
        this.renderer.render();
        this._persist();
        this._notifyChange('navigate-active-tab');
    }

    /** Route a navigation request to the right container based on
     *  where it came from:
     *
     *  - `ctx.windowId` set → replace the managed-window content (the
     *    user is navigating inside a windowed tile; the window stays).
     *  - `ctx.leafId` set AND that leaf is NOT `panel:left` → replace
     *    the leaf's content in place (the user is in a split tile;
     *    the click stays in that tile).
     *  - Otherwise (palette, top-nav shortcuts, click in the
     *    navigator panel, backspace, plain bus event) → primary tile.
     *
     *  The left nav (`panel:left`) is the only tile whose clicks
     *  intentionally jump out to the primary tile — every other
     *  container is self-contained. */
    openFromContext(ctx, kind, props = {}) {
        if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
            this.openInWindow(ctx.windowId, kind, props);
            return;
        }
        if (ctx?.leafId) {
            const tree = this._tree();
            const leaf = tree.get(ctx.leafId);
            const k = leaf?.content?.kind;
            if (leaf && k && k !== 'panel:left' && !k.startsWith('panel:')) {
                this.openInLeaf(ctx.leafId, kind, props);
                return;
            }
        }
        this.openInPrimary(kind, props);
    }

    /** Replace the leaf's **active tab** in place — preserves every
     *  other tab. This is the routing for navigation that originated
     *  INSIDE the tile: clicking a row on a landing page, walking a
     *  breadcrumb segment, Backspace. Outside-the-tile navigation
     *  (top-nav, palette, side-nav) uses `openInPrimary` instead, which
     *  resets the leaf to a single fresh tab.
     *
     *  For a leaf that has only one tab (the common case before the
     *  tab feature shipped), the behavior is identical to the old
     *  setLeafContent: one tab in, one tab out. */
    openInLeaf(leafId, kind, props = {}) {
        const tree = this._tree();
        const leaf = tree.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') {
            this.openInPrimary(kind, props);
            return;
        }
        tree.replaceActiveTabContent(leafId, { kind, props }, _tabTitle(kind, props));
        tree.focus(leafId);
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    /** Replace a managed window's content in place. Tears down the
     *  previous mount, mounts the new kind into the same contentEl,
     *  and updates the window's title. */
    openInWindow(winId, kind, props = {}) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) { this.openInPrimary(kind, props); return; }
        try { rec.mountInfo?.destroy?.(); } catch {}
        rec.contentEl.innerHTML = '';
        const mountInfo = this.content.mount(kind, rec.contentEl, props,
            { ...this.ctx, wm: this, windowId: winId });
        rec.mountInfo = mountInfo;
        rec.original = {
            kind, props: { ...(props || {}) },
            title: mountInfo?.title || kind,
        };
        // Update window title (DOM + the ManagedWindow instance).
        try {
            const titleEl = rec.window.element?.querySelector('.twm-managed-window__title');
            if (titleEl) titleEl.textContent = rec.original.title;
            if (rec.window) rec.window.title = rec.original.title;
        } catch {}
        // `rec.original` now holds the latest content, so a later "back to
        // tile" docks the current view (not the kind first promoted). The
        // window owns no tile in the tree, so there is no leaf to update.
        this._persist();
        this._notifyChange('window-content-changed');
    }

    /** Load content into the primary tile (last-active non-panel leaf).
     *  If only panel tiles exist (or the tree is empty), spawn a new
     *  content leaf and canonicalize so the panels wrap it. */
    openInPrimary(kind, props = {}) {
        const tree = this._tree();
        let leafId = tree.primaryLeafId();
        let spawned = false;
        if (!leafId) {
            leafId = this._spawnContentLeaf(tree);
            spawned = true;
        }
        if (!leafId) return;
        // Page-aware swap: archive the leaf's current page tabs and
        // restore (or initialize) the target page's. This is what makes
        // a tile remember its tab set when the user clicks away to
        // another top-nav page and back. `swapToPage` is a no-op when
        // the leaf has no current page (just-spawned content leaf) —
        // the default branch initializes a fresh single tab.
        const leaf = tree.get(leafId);
        const currentTopNav = leaf?.content?.kind
            ? this.taxonomy.topNavFor(leaf.content.kind) || null
            : null;
        const targetTopNav  = this.taxonomy.topNavFor(kind) || kind;
        const title = _tabTitle(kind, props);
        tree.swapToPage(leafId,
            { kind, props, title },
            currentTopNav, targetTopNav);
        tree.focus(leafId);
        if (spawned) this._canonicalize(tree, this.desktops.active());
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    // ── Split / close / focus / move ────────────────────────────────
    split(dir) {
        const tree = this._tree();
        const focused = tree.focusedLeafId;
        if (!focused) return;
        tree.split(focused, dir);
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    /** Split `leafId` along `dir` and mount `kind`/`props` in the freshly
     *  created sibling — the "open this content in a new split" primitive
     *  behind the code-pane split buttons, the per-pane context menu and
     *  Alt+Shift+H / Alt+Shift+V. The source leaf keeps its content
     *  untouched; the new pane gets a FRESH mount (so e.g. opening a Code
     *  pane in a split never dismounts the original). Returns the new
     *  leaf id, or null if the leaf can't be split. */
    splitLeafWith(leafId, dir, kind, props = {}, title = '') {
        const tree = this._tree();
        const src = leafId ? tree.get(leafId) : null;
        if (!src || src.kind !== 'leaf') return null;
        const newId = tree.split(leafId, dir);
        if (!newId) return null;
        tree.setLeafContent(newId, { kind, props }, title || _tabTitle(kind, props));
        tree.focus(newId);
        this.renderer.render();
        this._persist();
        this._notifyChange('split-with');
        return newId;
    }

    /** Resolve the focused tile's active content for the keyboard-driven
     *  "open focused tile elsewhere" chords (Alt+T / Alt+N / Alt+Shift+H /
     *  Alt+Shift+V). Returns null for panels, window placeholders and
     *  empty tiles — none of which can be meaningfully duplicated. */
    _focusedContent() {
        const tree = this._tree();
        const id = tree.focusedLeafId;
        const leaf = id ? tree.get(id) : null;
        if (!leaf || leaf.kind !== 'leaf' || !leaf.content) return null;
        const kind = leaf.content.kind;
        if (!kind || kind === PLACEHOLDER_KIND || kind.startsWith('panel:')) return null;
        return { leafId: id, kind, props: leaf.content.props || {}, title: leaf.title };
    }

    /** Alt+T — open the focused tile's content in a new tab on that tile. */
    openFocusedInTab() {
        const c = this._focusedContent();
        if (!c) return;
        this.openInTabFromContext({ leafId: c.leafId }, c.kind, c.props);
    }

    /** Alt+N — open the focused tile's content in a fresh managed window.
     *  Unlike Alt+F (promote) this DUPLICATES: the source tile stays put. */
    openFocusedInWindow() {
        const c = this._focusedContent();
        if (!c) return;
        this._navigateWindow(c.kind, c.props);
    }

    /** Alt+Shift+H / Alt+Shift+V — split the focused tile and open a fresh
     *  copy of its content in the new pane. Falls back to an empty split
     *  when the focused tile has no duplicable content (e.g. a panel). */
    splitFocusedWith(dir) {
        const c = this._focusedContent();
        if (!c) { this.split(dir); return; }
        this.splitLeafWith(c.leafId, dir, c.kind, c.props, c.title);
    }

    closeFocused() {
        const tree = this._tree();
        const focusedId = tree.focusedLeafId;
        if (!focusedId) return;
        const leaf = tree.get(focusedId);
        const kind = leaf?.content?.kind;

        // Closing a placeholder closes its window — the window's onClose
        // handler restores the leaf, then we close that leaf too.
        if (kind === PLACEHOLDER_KIND) {
            const winId = leaf.content?.props?.windowId;
            const rec = winId ? this._windowToLeaf.get(winId) : null;
            if (rec) {
                // Drop the mapping so the onClose handler doesn't restore.
                this._windowToLeaf.delete(winId);
                try { rec.window.close({ force: true }); } catch {}
            }
            tree.close(focusedId);
        }
        // Closing a panel: also flip the desktop's panel state off so
        // the top-bar toggle button reflects the closure.
        else if (PANEL_KINDS.has(kind)) {
            const d = this.desktops.active();
            const side = kind.split(':')[1];
            d.panels[side] = false;
            this._canonicalize(tree, d);
        }
        else {
            tree.close(focusedId);
        }

        // Re-canonicalize so the remaining panels fill the area
        // properly (no leftover wrap from the content leaf). The user
        // is allowed to close the last content tile — the panels can
        // fully occupy the WM. A new content leaf is spawned later by
        // openInPrimary when something needs it.
        this._canonicalize(tree, this.desktops.active());

        this.renderer.render();
        this._persist();
        this._notifyChange('tile-closed');
    }

    /** Close the ACTIVE tab of a leaf (e.g. a Cancel button inside the
     *  tab's content). Mirrors the tab-strip × handler: remove just that
     *  tab, or close the whole tile if it was the last one. Lets content
     *  self-close without nuking sibling tabs. */
    closeActiveTab(leafId) {
        const tree = this._tree();
        const leaf = leafId ? tree.get(leafId) : null;
        if (!leaf || leaf.kind !== 'leaf') {
            // No tabbed leaf (e.g. content in a managed window) — fall
            // back to closing the focused container.
            this.closeFocused();
            return;
        }
        const tabs = leaf.tabs || [];
        if (tabs.length <= 1) {
            tree.focus(leafId);
            this.closeFocused();
            return;
        }
        const idx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
        tree.removeLeafTab(leafId, idx);
        tree.focus(leafId);
        this.renderer.render();
        this._persist();
        this._notifyChange('twm-tab-close');
    }

    /** Insert a new empty content leaf at the centre of the layout
     *  (wraps the current root in an h-split with the content on the
     *  left, 4:1 ratio). If the tree is empty, becomes the root. */
    _spawnContentLeaf(tree) {
        const newLeaf = makeLeaf({ content: null, title: '' });
        if (!tree.rootId) { tree.setRoot(newLeaf); return newLeaf.id; }
        tree._register(newLeaf);
        const split = {
            id: `split-spawn-${Date.now().toString(36)}`,
            kind: 'split', parentId: null, dir: 'h',
            children: [newLeaf.id, tree.rootId], sizes: [4, 1],
        };
        tree.nodes.set(split.id, split);
        const oldRoot = tree.get(tree.rootId);
        if (oldRoot) oldRoot.parentId = split.id;
        newLeaf.parentId = split.id;
        tree.rootId = split.id;
        tree.focus(newLeaf.id);
        return newLeaf.id;
    }

    focusDir(dir) {
        if (this._tree().focusDir(dir)) {
            this.renderer._updateFocusClasses();
            this._notifyChange();
        }
    }

    /** The `.twm-leaf` DOM element of the currently focused leaf on the
     *  active desktop, or null. The panel-key router consults this to
     *  decide which panel owns the keyboard — it is the single source of
     *  truth for "the selected tile". */
    focusedLeafEl() {
        const id = this._tree().focusedLeafId;
        return id ? this.renderer.leafEl(id) : null;
    }

    moveFocused(dir) {
        if (this._tree().moveDir(dir)) {
            this.renderer.render();
            this._persist();
            this._notifyChange();
        }
    }

    // ── Tile <-> Managed window ─────────────────────────────────────
    /** Promote the focused tile into a managed window and CLOSE the
     *  source tile — promoting means the content leaves the grid, so the
     *  origin slot is removed rather than left as an empty placeholder.
     *  "Back to tile" re-docks the content into the primary tile. */
    toggleManagedFocused() {
        const tree = this._tree();
        const focused = tree.focused();
        if (!focused || !focused.content) return;
        if (PANEL_KINDS.has(focused.content.kind)) return;
        if (focused.content.kind === PLACEHOLDER_KIND) return;

        const leafId = focused.id;
        const desktopIdx = this.desktops.activeIdx;
        const original = {
            kind: focused.content.kind,
            props: { ...(focused.content.props || {}) },
            title: focused.title,
        };

        const contentEl = document.createElement('div');
        contentEl.className = 'twm-window-content';
        contentEl.style.cssText = 'display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;';

        const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const mountInfo = this.content.mount(original.kind, contentEl, original.props,
            { ...this.ctx, wm: this, windowId: winId });
        const win = new ManagedWindow({
            id: winId,
            title: mountInfo?.title || original.title,
            icon: 'web_asset',
            content: contentEl,
            canMinimize: true,
            canMaximize: true,
            canResize: true,
            modal: false,
            onClose: () => this._onManagedWindowClosed(winId, mountInfo),
        });

        this._windowToLeaf.set(winId, {
            // Promoting CLOSES the source tile — the content lives in the
            // window now, not the tree. leafId is null so "back to tile"
            // re-docks into the primary tile (see _onManagedWindowClosed).
            leafId: null, desktopIdx, original, mountInfo, window: win,
            contentEl,
            // Set to true by bringBackWindow so the close path knows to
            // restore the content instead of destroying it.
            _demoting: false,
        });

        // Close the origin tile so it doesn't linger as an empty
        // "(window)" placeholder. Re-canonicalize so panels reflow; the
        // desktop is allowed to end up with no content tile (panels can
        // fill it, and openInPrimary re-spawns one on demand) — same as
        // closeFocused on the last tile.
        tree.close(leafId);
        this._canonicalize(tree, this.desktops.active());

        this.renderer.render();
        win.show();
        this._decorateManagedWindow(win, winId);
        this._persist();
        this._notifyChange('window-promoted');
    }

    /** Dock the window's content back into the desktop's primary tile
     *  (the source tile was closed on promote), then close the window. */
    bringBackWindow(windowId) {
        const rec = this._windowToLeaf.get(windowId);
        if (!rec) return;
        rec._demoting = true;
        try { rec.window.close({ force: true }); }
        catch (err) { console.warn('[wm] bringBack: close failed', err); }
    }

    /** Re-home a managed window to another desktop. The window itself
     *  stays on screen (managed windows are global) and leaves no tile
     *  behind on either desktop; only its "home" changes, so bringing it
     *  back will land on the new desktop's primary tile. */
    moveWindowToDesktop(windowId, targetIdx) {
        const rec = this._windowToLeaf.get(windowId);
        if (!rec) return;
        if (rec.desktopIdx === targetIdx) return;
        this.desktops.ensureCount(targetIdx + 1);
        rec.desktopIdx = targetIdx;
        this._persist();
        this._notifyChange('window-moved');
    }

    _onManagedWindowClosed(winId, mountInfo) {
        const rec = this._windowToLeaf.get(winId);
        this._windowToLeaf.delete(winId);
        if (!rec) return;
        try { mountInfo?.destroy?.(); } catch {}
        const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
        if (!tree) return;

        if (rec._demoting) {
            // "Back to tile": the source tile was closed when the window was
            // promoted, so dock the (latest) content into the desktop's
            // primary tile as a new tab, spawning a tile when it has none.
            let pid = tree.primaryLeafId();
            let spawned = false;
            if (!pid) { pid = this._spawnContentLeaf(tree); spawned = true; }
            if (pid) {
                tree.appendLeafTab(pid,
                    { kind: rec.original.kind, props: rec.original.props },
                    rec.original.title);
                tree.focus(pid);
                if (spawned) this._canonicalize(tree, this.desktops.desktops[rec.desktopIdx]);
            }
        }
        // Plain close (rec._demoting === false): the window and its content
        // are discarded. The source tile was already closed on promote, so
        // there is nothing left in the tree to clean up.
        if (this.desktops.active().tree === tree) this.renderer.render();
        this._persist();
        this._notifyChange(rec._demoting ? 'window-demoted' : 'window-closed');
    }

    /** Post-show DOM hook: inject a "back to tile" button into the
     *  window chrome and wire a right-click context menu on the topbar. */
    _decorateManagedWindow(win, winId) {
        const topbar = win.element?.querySelector?.('.twm-managed-window__topbar');
        const buttons = topbar?.querySelector?.('.twm-managed-window__buttons');
        if (!buttons) return;
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'twm-managed-window__btn managed-window__btn--demote';
        backBtn.title = 'Back to tile';
        backBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">close_fullscreen</span>`;
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.bringBackWindow(winId);
        });
        const closeBtn = buttons.querySelector('.twm-managed-window__btn--close');
        if (closeBtn) buttons.insertBefore(backBtn, closeBtn);
        else buttons.appendChild(backBtn);

        topbar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rec = this._windowToLeaf.get(winId);
            if (!rec) return;
            const items = [
                { label: 'Back to tile', icon: 'close_fullscreen', action: 'back' },
            ];
            if (this.desktops.desktops.length > 1) {
                items.push({ separator: true });
                for (const [i, d] of this.desktops.desktops.entries()) {
                    if (i === rec.desktopIdx) continue;
                    items.push({
                        label: `Move to desktop ${d.label}`, icon: 'sweep',
                        action: `move:${i}`,
                    });
                }
            }
            items.push({ separator: true });
            items.push({ label: 'Close window', icon: 'close',
                         action: 'close', danger: true });
            showContextMenu(e.clientX, e.clientY, items, (action) => {
                if (action === 'back') this.bringBackWindow(winId);
                else if (action === 'close') {
                    try { win.close({ force: true }); } catch {}
                }
                else if (action?.startsWith?.('move:')) {
                    this.moveWindowToDesktop(winId, Number(action.slice(5)));
                }
            });
        });
    }

    // ── Panel-tiles (left nav / right / bottom) ─────────────────────
    /** Panels are virtual: they live in the active desktop's tree as
     *  leaves with content kinds 'panel:left', 'panel:right',
     *  'panel:bottom'. Toggling either inserts them at the appropriate
     *  edge (a recursive split) or closes that leaf. */
    isPanelOpen(side) {
        const d = this.desktops.active();
        return !!d.panels[side];
    }

    togglePanel(side) {
        const d = this.desktops.active();
        d.panels[side] = !d.panels[side];
        this._canonicalize(this._tree(), d);
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    /** Rebuild the tree so panel:* leaves sit in the canonical positions:
     *
     *   v-split
     *     ├ h-split          ← the "content row"
     *     │   ├ panel:left   (if open)
     *     │   ├ content      (whatever non-panel subtree)
     *     │   └ panel:right  (if open)
     *     └ panel:bottom     (if open, full width below the content row)
     *
     *  Existing panel leaves are detached + re-attached (same id), so the
     *  renderer cache keeps the mounted content (nav filter state, etc.). */
    _canonicalize(tree, desktop) {
        // 1. Find existing panel leaves.
        const panel = {};
        for (const leaf of tree.leaves()) {
            const kind = leaf.content?.kind;
            if (kind === 'panel:left')   panel.left   = leaf;
            else if (kind === 'panel:right')  panel.right  = leaf;
            else if (kind === 'panel:bottom') panel.bottom = leaf;
        }

        // 2. Detach each panel leaf from its current parent. (We don't
        //    use tree.close because that deletes the node; we want to
        //    preserve identity so the renderer keeps the mounted body.)
        const detach = (leaf) => {
            if (!leaf) return;
            const pid = leaf.parentId;
            if (!pid) {
                tree.rootId = null;
                leaf.parentId = null;
                return;
            }
            const parent = tree.get(pid);
            if (!parent) return;
            const idx = parent.children.indexOf(leaf.id);
            if (idx >= 0) {
                parent.children.splice(idx, 1);
                parent.sizes.splice(idx, 1);
            }
            leaf.parentId = null;
            tree._collapse(parent);
        };
        detach(panel.left); detach(panel.right); detach(panel.bottom);

        // 3. The content subtree may legitimately be empty — the user
        //    is allowed to close the last main tile and let panels
        //    take over the entire WM area. If so, seed root from the
        //    first requested panel; otherwise content stays as root.
        let seededSide = null;
        if (!tree.rootId) {
            seededSide = desktop.panels.left   ? 'left'
                       : desktop.panels.bottom ? 'bottom'
                       : desktop.panels.right  ? 'right'
                       : null;
            if (seededSide) {
                const seed = panel[seededSide] || makeLeaf({
                    content: { kind: `panel:${seededSide}`, props: {} },
                    title: PANEL_TITLES[seededSide] || seededSide,
                });
                if (panel[seededSide] && PANEL_TITLES[seededSide]) {
                    panel[seededSide].title = PANEL_TITLES[seededSide];
                }
                if (!panel[seededSide]) tree._register(seed);
                if (!tree.nodes.has(seed.id)) tree.nodes.set(seed.id, seed);
                seed.parentId = null;
                tree.rootId = seed.id;
            }
            // else: nothing requested; tree stays empty (renderer shows
            // the "Empty desktop" placeholder).
        }

        // 4. Wrap content row with left + right (h-split), then wrap
        //    that with bottom (v-split) so bottom spans full width.
        const wrap = (panelLeaf, side) => {
            // Re-register the leaf if it was orphaned by detach.
            if (panelLeaf && !tree.nodes.has(panelLeaf.id)) {
                tree.nodes.set(panelLeaf.id, panelLeaf);
            }
            const leaf = panelLeaf || makeLeaf({
                content: { kind: `panel:${side}`, props: {} },
                title: PANEL_TITLES[side] || side,
            });
            // Heal old leaves whose stored title is still 'left'/etc.
            if (panelLeaf && PANEL_TITLES[side] && panelLeaf.title !== PANEL_TITLES[side]) {
                panelLeaf.title = PANEL_TITLES[side];
            }
            if (!panelLeaf) tree._register(leaf);
            const before = (side === 'left');
            const dir = (side === 'bottom') ? 'v' : 'h';
            const children = before ? [leaf.id, tree.rootId] : [tree.rootId, leaf.id];
            const sizes = (side === 'bottom') ? [4, 1]
                        : (side === 'left')   ? [1, 4]
                        :                       [4, 1];
            const split = {
                id: `split-panel-${side}-${Math.random().toString(36).slice(2, 7)}`,
                kind: 'split', parentId: null, dir, children, sizes,
            };
            tree.nodes.set(split.id, split);
            const oldRoot = tree.get(tree.rootId);
            if (oldRoot) oldRoot.parentId = split.id;
            leaf.parentId = split.id;
            tree.rootId = split.id;
        };
        // Skip the side already consumed as the seed root (would
        // otherwise wrap a fresh duplicate leaf around the existing
        // panel-as-root).
        if (desktop.panels.left   && seededSide !== 'left'   && tree.rootId) wrap(panel.left,   'left');
        if (desktop.panels.right  && seededSide !== 'right'  && tree.rootId) wrap(panel.right,  'right');
        if (desktop.panels.bottom && seededSide !== 'bottom' && tree.rootId) wrap(panel.bottom, 'bottom');

        // GC orphaned nodes (panel leaves whose `panels.X` flipped to
        // false stayed in tree.nodes after detach).
        const reachable = new Set();
        const walk = (id) => {
            if (!id || reachable.has(id)) return;
            reachable.add(id);
            const n = tree.get(id);
            if (n?.kind === 'split') n.children.forEach(walk);
        };
        walk(tree.rootId);
        for (const id of [...tree.nodes.keys()]) {
            if (!reachable.has(id)) tree.nodes.delete(id);
        }
    }

    _findPanelLeaf(side) {
        const kind = `panel:${side}`;
        for (const leaf of this._tree().leaves()) {
            if (leaf.content?.kind === kind) return leaf;
        }
        return null;
    }

    // ── Desktops ────────────────────────────────────────────────────
    switchDesktop(idx) {
        this.desktops.ensureCount(idx + 1);
        if (!this.desktops.switchTo(idx)) return;
        const d = this.desktops.active();
        // Runtime-created desktops (ensureCount / addDesktop) are bare
        // home-leaf trees whose panels haven't been materialized yet —
        // only desktops present at load() were canonicalized. Without
        // this, the new desktop shows no panels while the toggle buttons
        // (which read `d.panels`) report them open. Canonicalize on every
        // switch: it's idempotent for already-canonical trees.
        this._canonicalize(d.tree, d);
        this.renderer.tree = d.tree;
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    addDesktop() {
        this.desktops.addDesktop();
        this._notifyChange();
        this._persist();
    }

    /** Step to the previous (-1) or next (+1) existing desktop, wrapping
     *  around. No-op with a single desktop. Iterates only desktops that
     *  already exist — use switchDesktop(idx) to create-on-demand. */
    cycleDesktop(dir) {
        const m = this.desktops;
        const n = m.desktops.length;
        if (n <= 1) return;
        const next = (m.activeIdx + (dir < 0 ? -1 : 1) + n) % n;
        this.switchDesktop(next);
    }

    /** Cycle the focused tile's main-panel tabs (Ctrl+Tab / Ctrl+Shift+Tab).
     *  Wraps; no-op when the focused leaf has 0 or 1 tabs. */
    cycleFocusedTab(dir) {
        const tree = this._tree();
        const leafId = tree.focusedLeafId;
        const leaf = leafId ? tree.get(leafId) : null;
        const tabs = (leaf && Array.isArray(leaf.tabs)) ? leaf.tabs : [];
        if (tabs.length <= 1) return;
        const cur = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
        const next = (cur + (dir < 0 ? -1 : 1) + tabs.length) % tabs.length;
        this._leafTabAction(leafId, 'switch', { idx: next });
    }

    removeDesktop(idx) {
        const m = this.desktops;
        if (m.desktops.length <= 1) return false;
        if (idx < 0 || idx >= m.desktops.length) return false;
        m.desktops.splice(idx, 1);
        if (m.activeIdx >= m.desktops.length) m.activeIdx = m.desktops.length - 1;
        this.renderer.tree = m.active().tree;
        this.renderer.render();
        this._persist();
        this._notifyChange();
        return true;
    }

    moveFocusedToDesktop(idx) {
        const tree = this._tree();
        const focused = tree.focused();
        if (!focused || !focused.content) return;
        const payload = { kind: focused.content.kind, props: focused.content.props, title: focused.title };
        this.desktops.ensureCount(idx + 1);
        const target = this.desktops.desktops[idx];
        // Place into the target tree's primary leaf.
        const targetTree = target.tree;
        const primary = targetTree.primaryLeafId();
        if (primary) targetTree.setLeafContent(primary, { kind: payload.kind, props: payload.props }, payload.title);
        // Remove from current desktop.
        tree.close(focused.id);
        if (!tree.rootId) tree.setRoot(makeLeaf(this._rootLeaf()));
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    // ── Internals ───────────────────────────────────────────────────
    _tree() { return this.desktops.active().tree; }

    _leafAction(leafId, action) {
        const tree = this._tree();
        tree.focus(leafId);
        if (action === 'close') this.closeFocused();
        else if (action === 'promote') this.toggleManagedFocused();
        // Chrome split buttons mirror Alt+H / Alt+V: structural split of
        // this tile into a fresh empty pane (the user then fills it).
        else if (action === 'split-h') this.split('h');
        else if (action === 'split-v') this.split('v');
    }

    /** Tab-strip event dispatcher. The renderer fires actions
     *  (`switch` / `close` / `move` / `open-menu`) and the WM
     *  translates them into tile-tree mutations + a re-render. */
    _leafTabAction(leafId, action, data = {}) {
        const tree = this._tree();
        const leaf = tree.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return;
        if (action === 'switch') {
            tree.setActiveLeafTab(leafId, data.idx);
            tree.focus(leafId);
            this.renderer.render();
            this._persist();
            this._notifyChange('tab-switch');
            return;
        }
        if (action === 'close') {
            const tabs = leaf.tabs || [];
            // Closing the last remaining tab closes the tile — same
            // behavior as Alt+W on a single-tab leaf today.
            if (tabs.length <= 1) {
                tree.focus(leafId);
                this.closeFocused();
                return;
            }
            tree.removeLeafTab(leafId, data.idx);
            tree.focus(leafId);
            this.renderer.render();
            this._persist();
            this._notifyChange('twm-tab-close');
            return;
        }
        if (action === 'move') {
            tree.moveLeafTab(leafId, data.from, data.to);
            this.renderer.render();
            this._persist();
            this._notifyChange('tab-move');
            return;
        }
        if (action === 'menu') {
            this._showTabContextMenu(leafId, data.idx, data.x, data.y);
            return;
        }
        if (action === 'close-others') {
            tree.closeOtherTabs(leafId, data.idx);
            this.renderer.render();
            this._persist();
            this._notifyChange('tab-close-others');
            return;
        }
        if (action === 'close-right') {
            tree.closeTabsAfter(leafId, data.idx);
            this.renderer.render();
            this._persist();
            this._notifyChange('tab-close-right');
            return;
        }
        if (action === 'close-left') {
            tree.closeTabsBefore(leafId, data.idx);
            this.renderer.render();
            this._persist();
            this._notifyChange('tab-close-left');
            return;
        }
        if (action === 'open-menu') {
            // Defer to a per-WM callback if anyone wired one (the
            // hamburger menu mounts via this hook). The renderer hands
            // us screen coordinates so the menu can anchor below the
            // hamburger button.
            try {
                this.ctx?.onTileTabMenu?.(leafId, data.x, data.y);
            } catch (err) {
                console.warn('[wm] tab menu hook failed', err);
            }
        }
    }

    /** Central navigation entry point. Every nav action — left menu,
     *  breadcrumb, landing-row click, in-tile reference, panel
     *  reference, entity-to-entity — should route through this so the
     *  one holistic routing concept lives in one place.
     *
     *  A link declares its target as TWO axes:
     *
     *   `opts.dest`   — WHERE the content lands:
     *                   'main'   → the primary content tile (default).
     *                              The nav panel always uses this.
     *                   'origin' → the tile/window the click came from
     *                              (needs `ctx`). Breadcrumbs use this so
     *                              a segment click stays in the current
     *                              tile (and inside a floating window when
     *                              windowed).
     *                   'window' → a fresh managed window.
     *   `opts.newTab` — HOW it lands in that destination:
     *                   false → replace the destination's active tab
     *                           (default). true → append a NEW tab.
     *                           Ignored for 'window' (one window = one
     *                           content).
     *
     *  `opts.ctx`       — the caller's mount context (`leafId`,
     *                     `windowId`); required for `dest:'origin'`.
     *  `opts.transient` — the appended tab is not persisted/restored
     *                     (e.g. an add-row form). Only meaningful with
     *                     `newTab:true`.
     *
     *  Back-compat: the legacy `opts.target` enum still works and maps
     *  onto the axes — 'auto'→origin, 'tab'→origin+newTab,
     *  'primary'→main, 'window'→window. Prefer the two-axis form.
     *
     *  The lower-level primitives (`openFromContext`,
     *  `openInTabFromContext`, `openInTabInPrimary`, `openInPrimary`,
     *  `openInWindow`) stay internal; callers prefer `wm.navigate(...)`. */
    navigate(kind, props = {}, opts = {}) {
        const { ctx = null, transient = false } = opts;
        // Resolve the two axes, honoring the legacy `target` alias.
        let { dest = 'main', newTab = false } = opts;
        if (opts.target != null) {
            switch (opts.target) {
                case 'window':  dest = 'window';  newTab = false; break;
                case 'primary': dest = 'main';    newTab = false; break;
                case 'tab':     dest = 'origin';  newTab = true;  break;
                case 'split-h': dest = 'split-h'; break;
                case 'split-v': dest = 'split-v'; break;
                case 'auto':
                default:        dest = 'origin';  newTab = false; break;
            }
        }
        // Split destinations: split the originating tile (or, lacking a
        // tile context, the focused tile) and mount a fresh instance in
        // the new pane. This is the routing for the code-pane "open in
        // horizontal/vertical split" buttons.
        if (dest === 'split-h' || dest === 'split-v') {
            const dir = dest === 'split-h' ? 'h' : 'v';
            const leafId = ctx?.leafId || this._tree().focusedLeafId;
            return this.splitLeafWith(leafId, dir, kind, props, _tabTitle(kind, props));
        }
        if (dest === 'window') return this._navigateWindow(kind, props);
        if (dest === 'main') {
            return newTab
                ? this.openInTabInPrimary(kind, props, transient)
                : this.openInPrimary(kind, props);
        }
        // dest === 'origin'
        return newTab
            ? this._navigateTab(ctx, kind, props, transient)
            : this._navigateAuto(ctx, kind, props);
    }

    _navigateAuto(ctx, kind, props) {
        // Windowed content → replace window in place.
        if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
            this.openInWindow(ctx.windowId, kind, props);
            return;
        }
        // In-tile content → replace ACTIVE TAB only (preserves siblings).
        // Panel tiles (left/right/bottom) fall through — their clicks
        // target the primary content tile, not the panel itself.
        if (ctx?.leafId) {
            const tree = this._tree();
            const leaf = tree.get(ctx.leafId);
            const k = leaf?.content?.kind;
            if (leaf && k && !k.startsWith('panel:')) {
                this.openInLeaf(ctx.leafId, kind, props);
                return;
            }
        }
        // Outside the tile (top-nav, panel, palette) → primary tile,
        // page-aware swap that preserves per-page tab archives.
        this.openInPrimary(kind, props);
    }

    _navigateTab(ctx, kind, props, transient = false) {
        // Windows aren't tabbed — "open in tab" inside a window just
        // replaces the window's content.
        if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
            this.openInWindow(ctx.windowId, kind, props);
            return;
        }
        this.openInTabFromContext(ctx || {}, kind, props, transient);
    }

    /** Spawn a fresh ManagedWindow with the requested content. No
     *  source leaf — closing the window just disposes the content. */
    _navigateWindow(kind, props) {
        const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const contentEl = document.createElement('div');
        contentEl.className = 'twm-window-content';
        contentEl.style.cssText = 'display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;';
        const title = _tabTitle(kind, props);
        const mountInfo = this.content.mount(kind, contentEl, props,
            { ...this.ctx, wm: this, windowId: winId });
        const win = new ManagedWindow({
            id: winId,
            title: mountInfo?.title || title,
            icon: 'web_asset',
            content: contentEl,
            canMinimize: true,
            canMaximize: true,
            canResize: true,
            modal: false,
            onClose: () => this._onManagedWindowClosed(winId, mountInfo),
        });
        // leafId is null — `_onManagedWindowClosed` already short-circuits
        // both branches when there's no source leaf, so the close path
        // just disposes the content and drops the map entry.
        this._windowToLeaf.set(winId, {
            leafId: null,
            desktopIdx: this.desktops.activeIdx,
            original: { kind, props: { ...(props || {}) },
                        title: mountInfo?.title || title },
            mountInfo, window: win, contentEl,
            _demoting: false,
        });
        win.show();
        // Cascade: a fresh window centers by default, so opening one from
        // another window would land exactly on top — reading as the
        // calling window being replaced. Offset by the current window
        // count (cycling every 6) so each new window is slightly inset
        // from the last.
        const _n = this._windowToLeaf.size;   // includes this new window
        if (_n > 1 && typeof win._applyPosition === 'function') {
            const step = ((_n - 1) % 6) * 28;
            win.x = (win.x || 0) + step;
            win.y = (win.y || 0) + step;
            win._applyPosition();
        }
        this._decorateManagedWindow(win, winId);
        this._notifyChange('window-spawned');
    }

    /** Browser-style tab context menu. Items reflect the leaf's current
     *  tab list — "Close others" is hidden when only one tab is open,
     *  "Close to the right / left" are hidden at the edges. The actual
     *  mutations route back through `_leafTabAction` so persistence +
     *  notify stay in one place. */
    _showTabContextMenu(leafId, idx, x, y) {
        const tree = this._tree();
        const leaf = tree.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return;
        const tabs = leaf.tabs || [];
        if (tabs.length === 0) return;
        const items = [
            { label: 'Close tab', icon: 'close', action: 'close' },
        ];
        if (tabs.length > 1) {
            items.push({ label: 'Close other tabs', icon: 'tab_close', action: 'close-others' });
        }
        if (idx < tabs.length - 1) {
            items.push({ label: 'Close tabs to the right', icon: 'chevron_right',
                         action: 'close-right' });
        }
        if (idx > 0) {
            items.push({ label: 'Close tabs to the left', icon: 'chevron_left',
                         action: 'close-left' });
        }
        showContextMenu(x, y, items, (action) => {
            this._leafTabAction(leafId, action, { idx });
        });
    }

    /** Open content in a new tab on the leaf where the call originated.
     *  Mirrors `openFromContext` (windowed / split-leaf / primary
     *  routing) but uses `appendLeafTab` so the existing content
     *  stays in place as a tab. */
    openInTabFromContext(ctx, kind, props = {}, transient = false) {
        // Managed-window content: just open in the window — managed
        // windows aren't tabbed (one window = one content).
        if (ctx?.windowId && this._windowToLeaf.has(ctx.windowId)) {
            this.openInWindow(ctx.windowId, kind, props);
            return;
        }
        const tree = this._tree();
        let leafId = ctx?.leafId;
        if (!leafId) leafId = tree.primaryLeafId();
        const leaf = leafId ? tree.get(leafId) : null;
        const k = leaf?.content?.kind;
        if (!leaf || !leafId || (k && k.startsWith('panel:'))) {
            // Panel tiles can't host content tabs — fall back to the
            // primary leaf (matches openFromContext fall-through).
            this.openInPrimary(kind, props);
            return;
        }
        tree.appendLeafTab(leafId, { kind, props }, _tabTitle(kind, props), { transient });
        tree.focus(leafId);
        this.renderer.render();
        this._persist();
        this._notifyChange('tab-open');
    }

    /** Open content as a NEW tab in the primary content tile, regardless
     *  of where the call came from (the `dest:'main', newTab:true` path).
     *  Unlike `openInTabFromContext`, this never falls back to a replace:
     *  it targets the primary leaf directly and always appends, so a
     *  click from outside the tile system (e.g. the bottom-panel
     *  "Add row" button, which passes no ctx) reliably lands as a sibling
     *  tab in the main tile rather than swapping its content. */
    openInTabInPrimary(kind, props = {}, transient = false) {
        const tree = this._tree();
        const leafId = tree.primaryLeafId();
        // No content tile on this desktop (e.g. a panels-only layout) —
        // open in a managed window rather than spawning a bare tile. The
        // caller asked for "a tab in the main tile"; with no main tile to
        // tab into, a floating window is the least-surprising fallback.
        if (!leafId) { this._navigateWindow(kind, props); return; }
        tree.appendLeafTab(leafId, { kind, props }, _tabTitle(kind, props), { transient });
        tree.focus(leafId);
        this.renderer.render();
        this._persist();
        this._notifyChange('tab-open');
    }
}


/** Derive a tab's display title from the content it carries — entity
 *  label first, then id, then the bare kind. Used everywhere a tab is
 *  created, so the bar names what the user opened rather than the kind
 *  of thing it is. The rename-bus listener in the WM keeps these in
 *  sync when the underlying entity is renamed. */
function _tabTitle(kind, props) {
    if (props && typeof props.label === 'string' && props.label) return props.label;
    if (props && (typeof props.id === 'string' || typeof props.id === 'number')
        && String(props.id)) return String(props.id);
    return kind || '';
}
