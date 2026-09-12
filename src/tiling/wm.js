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
import { createTabStrip } from './tab_strip.js';

const PANEL_KINDS = new Set(['panel:left', 'panel:right', 'panel:bottom']);

const PANEL_TITLES = {
    left:   'Navigator',
    right:  'Inspector',
    bottom: 'Console',
};

export class WindowManager {
    constructor({ rootEl, api, ctx, onChange, eventBus, host, taxonomy, events, content,
                  panelDefaults = null, snapPromotion = false,
                  promoteInPlace = false, tabLayout = null }) {
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
        // C14. Which panel tiles a fresh desktop opens with. An embedder whose
        // navigator and inspector live outside the WM root passes `false` for
        // them and gets no placeholder tiles it never registered a factory for.
        this.panelDefaults = panelDefaults || null;
        /** C15. Whether a window this WM promoted may be dropped back INTO the
         *  tree. Default off: it changes what a drag to an edge does, and an
         *  existing embedder upgrading the library must not find its promoted
         *  windows behaving differently. */
        this.snapPromotion = !!snapPromotion;
        /** Whether a window promoted out of a tile stays CONFINED to the pane it
         *  came from, rather than floating over the whole root. Default off: it
         *  changes where a promoted window can be dragged, and an existing
         *  embedder upgrading must not find its windows suddenly clipped. */
        this.promoteInPlace = !!promoteInPlace;
        this._snapCtl = null;
        this.desktops = new DesktopManager({
            seed: this._rootLeaf, panelDefaults: this.panelDefaults });
        this.renderer = new TileRenderer({
            root: rootEl,
            tree: this.desktops.active().tree,
            content,
            /** C22. Where a multi-tab leaf draws its tabs — `'bottom'`
             *  (the framework's own spreadsheet strip, and the DEFAULT so no
             *  existing embedder's panes rearrange on upgrade) or `'top'`
             *  (the editor tab bar, between the chrome and the body).
             *  The renderer also mirrors this onto the root as
             *  `data-twm-tabs` and watches it, so an embedder can change it
             *  live without holding a renderer reference. */
            tabLayout,
            ctx: {
                ...this.ctx,
                wm: this,
                onLeafAction: (leafId, action) => this._leafAction(leafId, action),
                onLeafTabAction: (leafId, action, data) =>
                    this._leafTabAction(leafId, action, data),
            },
            onFocusChange: () => this._notifyChange(),
            onAfterRender: () => this._rehomeContainedWindows(),
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

    /** C22. Change the tab layout of every tile, live. Delegates to the
     *  renderer, which moves each strip rather than rebuilding the tiles — so
     *  nothing mounted in a tile is unmounted and no staged work is lost.
     *
     *  Not persisted here: which layout a user prefers is a USER setting, and
     *  the WM persists LAYOUT (`desktops`). An embedder that stores it does so
     *  under its own key and passes it back as `createShell({ tabLayout })`. */
    setTabLayout(layout) {
        this.renderer.setTabLayout(layout);
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
            this.desktops = DesktopManager.deserialize(blob, {
                seed: this._rootLeaf, panelDefaults: this.panelDefaults });
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
        // READ BEFORE THE WRITE. This is what `rebaselineLeaf` checks the
        // cached entry against, and it is the whole safety of accepting a props
        // change onto a live tile: if the mounted wrap is not still at the key
        // the tree had a moment ago, something else changed that this call has
        // no business swallowing.
        const expected = this.renderer?.leafKey?.(leafId) ?? undefined;
        tree.updateActiveTabProps(leafId, patch);
        // C34. THE TILE THAT SAVED ITS STATE MUST NOT BE REBUILT BY SAVING IT.
        // The renderer caches a leaf's wrap under a key that includes every
        // tab's props, so this write invalidated the tile it was called from —
        // not here, but on whatever repainted next, which made it look like an
        // unrelated bug. `rebaselineLeaf` accepts the new props onto the live
        // entry; the argument is in its docstring.
        this.renderer?.rebaselineLeaf?.(leafId, expected);
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
     *  previous mount, mounts the new kind into the same body element,
     *  and updates the window's title. */
    openInWindow(winId, kind, props = {}) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) { this.openInPrimary(kind, props); return; }
        try { rec.mountInfo?.destroy?.(); } catch {}
        // R8. THE BODY, NOT THE CONTENT ELEMENT. A floated pane's window holds
        // a tab strip above its body, and both are children of `contentEl` —
        // so clearing `contentEl` here would delete the strip, silently, on
        // the first in-window navigation, and the window would keep every one
        // of its tabs in a list nothing could reach. `_navigateWindow` builds
        // a window with no strip and no body, hence the fallback.
        const host = rec.bodyEl || rec.contentEl;
        host.innerHTML = '';
        const mountInfo = this.content.mount(kind, host, props,
            { ...this.ctx, wm: this, windowId: winId });
        rec.mountInfo = mountInfo;
        rec.original = {
            kind, props: { ...(props || {}) },
            title: mountInfo?.title || kind,
        };
        // R8. And the TAB the window is showing is now that content, so the
        // strip renames with it and a later dock puts back what is on screen
        // rather than what the tab was called when it was promoted.
        const tab = (rec.tabs || [])[rec.activeTabIdx];
        if (tab) {
            tab.kind = kind;
            tab.props = { ...(props || {}) };
            tab.title = rec.original.title;
            rec.strip?.update(rec.tabs, rec.activeTabIdx);
        }
        // Update window title (DOM + the ManagedWindow instance).
        this._setWindowTitle(rec, rec.original.title);
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
        // Chrome split buttons mirror Alt+H / Alt+V. The freshly created
        // pane is SEEDED with the default HOME content (the taxonomy root)
        // rather than left empty — the never-empty-tile invariant: a tile
        // in the grid always holds content the user can act on, and the
        // main tile is never left blank.
        const newId = tree.split(focused, dir);
        if (newId) this._seedHome(tree, newId);
        this.renderer.render();
        this._persist();
        this._notifyChange();
    }

    /** Seed a leaf with the default HOME content (the taxonomy root kind).
     *  Used to keep the never-empty-tile invariant: the pane freed by a
     *  split, or emptied when its last tab floats into a window, is
     *  re-homed instead of destroyed or left blank. Embedder-agnostic —
     *  the HOME kind comes from the taxonomy, exactly like a fresh
     *  desktop's seed leaf. */
    _seedHome(tree, leafId) {
        const seed = this._rootLeaf();
        tree.setLeafContent(leafId, seed.content, seed.title);
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

        // ══ C20. THE CONTENT'S VETO IS HONOURED HERE, NOT ONLY PAINTED ══
        //
        // `chrome: { close: false }` — or `{ close: { disabled, title } }`,
        // which is the same refusal with a sentence attached — is read at mount
        // and `_vetoStructuralActions` acts on it by disabling the × in the
        // tile's chrome. That is ONE door. This verb has three more: Alt+W
        // (`keymap.js`), the tile's right-click *Close tile* (`shell.js`), and
        // the tab strip's × on a leaf's LAST tab (`_leafTabAction`, which
        // delegates straight to here). All three closed a pane whose own button
        // was greyed out with a tooltip promising it could not be closed.
        //
        // This is the same asymmetry `_floatableLeaf` was written to end for
        // `promote`, resolved the same way and for the same reason: the
        // renderer stays the only thing that knows what was mounted, and the WM
        // stays the only thing that decides whether a verb runs. A veto the
        // content states once holds for every door, or it is decoration.
        //
        // Silent rather than noisy: the control that offers this is already
        // disabled and already carries the explanation, so a keystroke that
        // does nothing is consistent with what the screen says.
        const closeChrome = this.renderer?.leafChrome?.(focusedId)?.close;
        if (closeChrome === false || closeChrome?.disabled === true) return;

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

        // THE MASTER TILE COMES BACK.
        //
        // Closing the last content tile used to leave the panels occupying the
        // whole WM, on the reasoning that `openInPrimary` would spawn a new leaf
        // when something needed one. That is true and it is not enough: the
        // content area is also the GROUND floating windows stand on, so an
        // embedder that promotes a tile into a window and then closes the tile
        // it came from is left with a window floating over nothing, and no
        // surface to drop it back onto. There is nowhere to put it and nothing
        // saying what to do next.
        //
        // So the invariant is now the same one `toggleManagedFocused` already
        // keeps for a lone tile: there is ALWAYS a content leaf, and it holds
        // the taxonomy root. `_seedHome` is the same call, so the tile that
        // comes back is the same tile a fresh desktop starts with.
        if (!tree.leaves().some((l) => !String(l.content?.kind || '').startsWith('panel:'))) {
            const spawned = this._spawnContentLeaf(tree);
            if (spawned) this._seedHome(tree, spawned);
        }

        // Re-canonicalize so the remaining panels fill the area properly (no
        // leftover wrap from the closed content leaf).
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
    /** Float the focused pane into a managed window.
     *
     *  R8. THE WHOLE PANE, not its active tab. This used to float one tab and
     *  leave the rest behind, which made "float this pane as a window" a
     *  different verb from the one its own tooltip named: a pane with three
     *  tables in it became a window holding one and a pane holding two, and
     *  nothing on screen said which of the three you were going to get. The
     *  product owner's words are the whole specification — *"to window includes
     *  the tab-strip"* — so the tabs travel with the pane and the strip is
     *  rendered INSIDE the window.
     *
     *  Floating ONE tab is still available and is still wanted; it moved to
     *  where it was always meant to be, which is the right-click menu on the
     *  tab itself (R9, `floatTabAsWindow`). A verb that acts on one tab belongs
     *  on that tab, not on the pane's chrome.
     *
     *  Never-empty-tile invariant, unchanged: the emptied pane is RE-SEEDED
     *  with the default HOME content rather than destroyed, so the grid never
     *  ends up with a missing or blank main tile. */
    toggleManagedFocused() {
        const tree = this._tree();
        const focused = tree.focused();
        if (!focused) return null;
        return this.floatPane(focused.id);
    }

    /** R8. Float a pane — every tab, with the strip — into a managed window.
     *  Returns the window id, or null when the leaf is not something that can
     *  be floated. */
    floatPane(leafId) {
        const leaf = this._floatableLeaf(leafId);
        if (!leaf) return null;
        const tabs = _leafTabSpecs(leaf);
        const active = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
        return this._promote(leafId, tabs, active, { wholePane: true });
    }

    /** R9. Float ONE tab of a pane into a managed window, leaving its siblings
     *  where they are — which is exactly what `toggleManagedFocused` did before
     *  R8, so the behaviour survives, it just moved to the gesture that names
     *  it. The tab's right-click menu is the only caller. */
    floatTabAsWindow(leafId, idx) {
        const leaf = this._floatableLeaf(leafId);
        if (!leaf) return null;
        const tabs = _leafTabSpecs(leaf);
        if (!Number.isInteger(idx) || idx < 0 || idx >= tabs.length) return null;
        return this._promote(leafId, [tabs[idx]], 0, { wholePane: false, tabIdx: idx });
    }

    /**
     * C33. MOVE ONE TAB INTO ANOTHER TILE — the same verb as `floatTabAsWindow`
     * above with a TILE as the destination instead of a window, which is why it
     * sits beside it.
     *
     * ══ THE ORDER IS LOAD-BEARING ═══════════════════════════════════════
     *
     * Four steps, and three of them are in this order for a reason that a
     * plausible-looking rewrite would destroy:
     *
     *   (a) READ THE TAB SPEC FIRST. `fromIdx` is an ARRAY INDEX — the only
     *       identity a tile tab has (`tile_renderer._tabKey`) — so it is stale
     *       the instant anything splices a tab list. Everything below works
     *       from the copy taken here.
     *
     *   (b) SPLIT BEFORE REMOVING. When the destination IS the source pane —
     *       "tear this tab off into a split beside its siblings" — removing
     *       first can empty that pane and send it through `_seedHome`, so the
     *       split would then be splitting a freshly seeded ground rather than
     *       the pane the preview drew. Splitting first cannot go wrong in the
     *       other direction: `tree.split` never touches tabs.
     *
     *   (c) THE MOVE ITSELF IS ONE TREE CALL for `tab` — `moveTabToLeaf`, which
     *       exists so the tab cannot be in flight between two mutations — and
     *       remove-then-`setLeafContent` for `fill`/`split`, where the
     *       destination is ground or brand new and REPLACING is the point.
     *
     *   (d) RE-SEED AND MERGE, exactly as `_promote` does when the last tab
     *       leaves a pane (`_seedHome` then `_mergeStartTiles`). A pane is
     *       never left blank, and two grounds never end up side by side with a
     *       splitter between them for no reason.
     *
     * ══ `wm:tab-moved` IS EMITTED BEFORE THE REPAINT ════════════════════
     *
     * An embedder that keys live content by leaf id — the Tables grid registry
     * does, on `(leaf, table)`, because a DOM element exists in exactly one
     * place — has to re-key BEFORE the render mounts the destination, or the
     * destination misses its entry, builds a second grid, and the source tile's
     * deferred teardown destroys the first one along with everything typed into
     * it and not yet committed. Emitting after the render would lose that race
     * silently, which is the failure this repository keeps recording. The tree
     * is already correct at this point; only the DOM is stale.
     *
     * ══ WHAT THIS DELIBERATELY DOES NOT DO ══════════════════════════════
     *
     * A tab is not dragged OUT OF A FLOATING WINDOW's strip, and a tab dropped
     * on empty space does not become a window. Both are refused by omission
     * rather than half-built, and both have a reason. A window's tabs live in
     * `_windowToLeaf`'s record and not in the tree, so their source policy is
     * `_windowTabAction`'s and not this function's. And "dropped on nothing" in
     * HTML5 drag-and-drop is `dragend` with no `drop` — which is also exactly
     * what pressing Escape produces, so floating a window on it would float one
     * every time a user changed their mind. Crossing DESKTOPS is out for a
     * third reason: only the active desktop is rendered, so there is no target
     * to hit.
     *
     * @param {string} fromLeafId
     * @param {number} fromIdx
     * @param {{leafId: string, mode?: 'tab'|'fill'|'split', dir?: 'h'|'v',
     *          before?: boolean, toIdx?: number}} target  a `tabDropProbe`
     *          answer, translated by the renderer
     * @returns {string|null} the leaf the tab landed in, or null if refused
     */
    moveTabInto(fromLeafId, fromIdx, target = {}) {
        const tree = this._tree();
        const from = tree.get(fromLeafId);
        if (!from || from.kind !== 'leaf') return null;
        const tabs = Array.isArray(from.tabs) ? from.tabs : [];
        if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= tabs.length) return null;
        let destId = target?.leafId || null;
        const dest = destId ? tree.get(destId) : null;
        if (!dest || dest.kind !== 'leaf') return null;
        if (String(dest.content?.kind || '').startsWith('panel:')) return null;
        const mode = (target.mode === 'fill' || target.mode === 'split')
            ? target.mode : 'tab';
        // The two no-ops `tabDropProbe` already refuses, refused a second time
        // here because this is a PUBLIC verb and a keyboard or palette caller
        // never went through the probe: a tab dropped into the pane it already
        // lives in, and a single-tab pane split against itself.
        if (destId === fromLeafId && mode !== 'split') return null;
        if (destId === fromLeafId && tabs.length <= 1) return null;

        // (a) the spec, copied before any mutation makes the index a lie.
        const src = tabs[fromIdx];
        const spec = { kind: src.kind, props: { ...(src.props || {}) },
                       title: src.title || src.kind || '' };

        // (b) the split, before the removal.
        if (mode === 'split') {
            const newId = tree.split(destId, target.dir === 'v' ? 'v' : 'h');
            if (!newId) return null;
            // THE PREVIEW PROMISED HALF OF THAT TILE, and `TileTree.split` only
            // delivers a half when it has to WRAP — into a row that already
            // runs this way it INSERTS, handing the newcomer the average of the
            // existing sizes. The same two corrections `_onManagedWindowClosed`
            // applies to a window drop (C15), for the same reason and in the
            // same order.
            _halveInto(tree, destId, newId);
            if (target.before) _swapSiblings(tree, destId, newId);
            destId = newId;
        }

        // (c) the move.
        if (mode === 'tab') {
            const moved = tree.moveTabToLeaf(fromLeafId, fromIdx, destId,
                                             Number.isInteger(target.toIdx) ? target.toIdx : -1);
            if (!moved?.ok) return null;
        } else {
            tree.removeLeafTab(fromLeafId, fromIdx);
            tree.setLeafContent(destId, { kind: spec.kind, props: spec.props }, spec.title);
        }

        // (d) the source pane, if the last tab just left it.
        if (!((tree.get(fromLeafId)?.tabs || []).length)) {
            this._seedHome(tree, fromLeafId);
            this._mergeStartTiles(tree, fromLeafId);
        }
        this._canonicalize(tree, this.desktops.active());

        // BEFORE THE REPAINT. See the block comment above — this is the moment
        // the tree is right and the DOM has not moved yet, and it is the only
        // moment an embedder can re-key content it holds by leaf id.
        try {
            this.eventBus?.emit?.('wm:tab-moved',
                { fromLeafId, toLeafId: destId, tab: spec, mode });
        } catch (err) { console.warn('[wm] tab-moved emit failed', err); }

        if (tree.get(destId)) tree.focus(destId);
        this.renderer.render();
        this._persist();
        this._notifyChange('tab-moved');
        return destId;
    }

    /** The guards both float verbs share. A panel tile is chrome, not content;
     *  a window placeholder is already a window; an empty tile has nothing to
     *  carry — and, since C20 was extended, content that declared itself
     *  unfloatable is not floated by ANY door.
     *
     *  THE LAST ONE IS WHY THIS FUNCTION IS THE RIGHT PLACE. C20 let a content
     *  factory return `chrome: { promote: false }`, and the renderer honoured
     *  it by not PAINTING the float button. That is one door of four: the
     *  tile's right-click menu has offered "Float this pane as a window" all
     *  along (`shell.js`'s `_tileContextMenu`, whose only guard is
     *  `isPanel || !leaf.content`), the chrome pull-down asks for `promote`,
     *  and so now does the chrome's double-click. Each of them arrives here.
     *
     *  The case it protects is an embedder's MASTER tile: the ground that
     *  floating windows stand on. Floating it promotes the ground into a
     *  window, which force-closes every window standing on it and re-seeds the
     *  pane WITHOUT the props that made it a ground — reproduced end to end
     *  before this guard existed. A veto the content states once should hold
     *  for every gesture, not only the one the renderer draws. */
    _floatableLeaf(leafId) {
        const leaf = leafId ? this._tree().get(leafId) : null;
        if (!leaf || leaf.kind !== 'leaf' || !leaf.content) return null;
        if (PANEL_KINDS.has(leaf.content.kind)) return null;
        if (leaf.content.kind === PLACEHOLDER_KIND) return null;
        // `=== false` rather than falsy: content that says nothing about
        // `promote` stays floatable, which is what every existing embedder
        // relies on. Only an explicit refusal refuses.
        if (this.renderer?.leafChrome?.(leaf.id)?.promote === false) return null;
        return leaf;
    }

    /**
     * The promote itself: build the window, mount the active tab in it, and
     * take the tabs out of the tree.
     *
     * @param {string}   leafId        the pane the tabs are coming out of
     * @param {object[]} tabs          `{kind, props, title}`, in order
     * @param {number}   activeTabIdx  which of them the window shows first
     * @param {{wholePane: boolean, tabIdx?: number}} opts
     */
    _promote(leafId, tabs, activeTabIdx, { wholePane, tabIdx = -1 }) {
        const tree = this._tree();
        const leaf = tree.get(leafId);
        const desktopIdx = this.desktops.activeIdx;
        const tabCount = Array.isArray(leaf.tabs) ? leaf.tabs.length : 1;
        const active = Math.max(0, Math.min(tabs.length - 1, activeTabIdx || 0));
        const original = { ...tabs[active], props: { ...(tabs[active].props || {}) } };

        const contentEl = document.createElement('div');
        contentEl.className = 'twm-window-content';
        contentEl.style.cssText = 'display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; height:100%;';
        // R8. THE STRIP IS INSIDE THE WINDOW. A pane's tabs and a pane's body
        // are one thing — *"to window includes the tab-strip"* — so the window
        // gets both, in the order the `top` layout draws them, and the content
        // mounts into the BODY rather than into the window's content element.
        // Everything that used to write straight into `contentEl` (see
        // `openInWindow`) has to write into the body now, or it takes the strip
        // with it the first time the window's content is replaced.
        const tabBarEl = document.createElement('div');
        tabBarEl.className = 'twm-window-tabbar';
        const bodyEl = document.createElement('div');
        bodyEl.className = 'twm-window-body';
        bodyEl.style.cssText = 'display:flex; flex-direction:column; flex:1; min-width:0; min-height:0;';
        contentEl.append(tabBarEl, bodyEl);

        const winId = `twm-mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const mountInfo = this.content.mount(original.kind, bodyEl, original.props,
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
            // C15. Dropping a promoted window on a tile PUTS IT BACK — as that
            // tile's content, as a split of it, or as one of its tabs. Off
            // unless the embedder asked, because it changes what a drag to an
            // edge means.
            snap: this.snapPromotion,
            snapController: this.snapPromotion ? this._snapController() : null,
            // R1. THE PANE IS A BOX WITH `overflow: hidden`. A window contained
            // to one (C21) cannot be dragged a single pixel outside it, so
            // "drag a window from one tile to another" — the gesture all three
            // drop behaviours are built on — was not merely awkward, it was
            // invisible. For the length of a drag the window is re-parented
            // here, to the root every tile is inside; on release it goes back
            // into a pane, either the one it was dropped on or the one it came
            // from. Resolved per drag: the root outlives any tile, and a tile
            // grabbed once does not survive its own repaint.
            dragHost: () => this.rootEl,
            dragBounds: () => this._tileBounds(),
            // R7. MAXIMISE MEANS BACK TO TILE. This window came OUT of the
            // tree; the useful thing to do with it is put it back, and filling
            // the screen with it is the one gesture that makes putting it back
            // harder. So the maximize button docks — and the separate demote
            // button the WM used to inject beside it is gone, because two
            // buttons for one verb is how you get a chrome nobody reads.
            onMaximize: () => this.bringBackWindow(winId),
            maximizeIcon: 'close_fullscreen',
            maximizeTitle: 'Back to tile',
            onClose: () => this._onManagedWindowClosed(winId, null),
        });

        this._windowToLeaf.set(winId, {
            // The floated tabs now live in the window, not the tree. leafId
            // is null so "back to tile" re-docks into the desktop's primary
            // tile (see _onManagedWindowClosed) — the source tile itself
            // survives (re-seeded with HOME when it was emptied).
            leafId: null, desktopIdx, original, mountInfo, window: win,
            contentEl, bodyEl, tabBarEl,
            // R8. THE PANE'S TABS TRAVEL WITH IT, and this is where they live
            // while the window is open. `original` still mirrors the ACTIVE one
            // so every existing reader of the record — `openInWindow`, each of
            // `_onManagedWindowClosed`'s docks — keeps working unchanged; the
            // list beside it is what makes a dock restore ALL of them.
            tabs, activeTabIdx: active, strip: null,
            // ══ C21. WRITTEN HERE, BEFORE THE TREE IS TOUCHED ═══════════
            //
            // `homeLeafId` is the pane this window stands on, and it used to be
            // assigned at the BOTTOM of this function — after `_seedHome`,
            // after `_mergeStartTiles`, after the repaint. That ordering
            // destroyed a tile per promotion, and it looked like a window bug
            // because a window is what the user had just moved.
            //
            // `_mergeStartTiles` (below) refuses to merge a start tile that has
            // a window standing on it, and `_paneHoldsWindows` answers that
            // question two ways: THIS FIELD, and a DOM probe for a
            // `.twm-managed-window` inside the leaf. At the old assignment point
            // neither could be true yet — the field was unwritten and the window
            // had not been `moveTo`'d into the pane — so the pane that was one
            // line away from becoming this window's ground answered *nothing
            // floats here* and was merged into its neighbour.
            //
            // Three panes floated one after another ended as ONE pane: the
            // first promotion left a start tile, the second merged its own
            // freshly-seeded tile away, and so did the third. Every window
            // after the first was then left with a `homeLeafId` naming a leaf
            // the tree no longer had — so the `moveTo` below was skipped and the
            // window never became contained, `_rehomeContainedWindows` found no
            // element to re-home it into, and `bringBackWindow` fell through to
            // the PRIMARY tile and docked as a tab onto the ground ANOTHER
            // window was standing on. That is the whole of the reported
            // *"expand one to a tile > influences others or even tiles lost"*.
            //
            // Writing it here is the smallest fix that closes all of it: a
            // guard that already existed starts being able to see the window it
            // was written to protect. The `moveTo` stays at the bottom, because
            // it needs the wrap the repaint rebuilds.
            homeLeafId: this.promoteInPlace ? leafId : null,
            // Set to true by bringBackWindow so the close path knows to
            // restore the content instead of destroying it.
            _demoting: false,
        });
        this._syncWindowTabs(winId);

        // R9. ONE TAB out of a multi-tab pane: the siblings stay put. R8: the
        // pane is emptied and re-seeded, because the whole of it left.
        if (!wholePane && tabCount > 1) tree.removeLeafTab(leafId, tabIdx);
        else this._seedHome(tree, leafId);

        // R10. The pane that just emptied is a START TILE now, and so may be
        // the pane beside it. Two of them side by side are one surface with a
        // splitter through it for no reason — see `_mergeStartTiles`, which is
        // where the rest of that argument lives.
        this._mergeStartTiles(tree, leafId);

        tree.focus(leafId);
        this._canonicalize(tree, this.desktops.active());

        this.renderer.render();

        // CONFINED TO THE PANE IT CAME FROM, when the embedder asked for it.
        //
        // Done AFTER the render and BEFORE `show()`, and both halves of that
        // matter. After, because promoting re-seeds the source leaf, which
        // changes its cache key and REBUILDS its wrap — the element grabbed
        // before the render is destroyed by it. Before, because `moveTo` on a
        // window that has not been built yet simply records the container
        // (`managed_window.js` returns early on a null element), so `show()`
        // mounts straight into the pane instead of appearing at the viewport
        // and jumping.
        //
        // The LEAF WRAP, not the `.twm-slot` around it: slots are recreated on
        // every render (`tile_renderer.js` clears the root and rebuilds them)
        // while leaf wraps are cached and re-parented, so a window contained to
        // a slot would be orphaned the first time anything repainted. The wrap
        // fills the slot, so the two are the same box.
        if (this.promoteInPlace) {
            // `homeLeafId` was written with the record, above, and the argument
            // for that is there. It is what `_rehomeContainedWindows` re-parents
            // against after every repaint — without it the SECOND promotion out
            // of a two-tab pane deletes the first one's window: the leaf's wrap
            // is rebuilt when its tab set changes, and the first window was
            // parented into the wrap that the rebuild threw away.
            const paneEl = this.renderer.leafEl(leafId);
            if (paneEl) win.moveTo(paneEl);
        }

        win.show();
        this._decorateManagedWindow(win, winId);
        this._persist();
        this._notifyChange('window-promoted');
        return winId;
    }

    // ══ R8. The tab strip inside a floated pane ═══════════════════════
    /**
     * Draw (or hide) a window's tab strip, and keep its title honest.
     *
     * Hidden below two tabs, exactly as a pane's strip is
     * (`tile_renderer._renderTabBar`): the common case is one tab, and a strip
     * naming the one thing you are already looking at is a line of chrome
     * saying nothing. Building the strip lazily also means a window promoted
     * out of a single-tab pane costs no `NotebookTabBar` at all.
     */
    _syncWindowTabs(winId) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) return;
        const tabs = rec.tabs || [];
        rec.activeTabIdx = Math.max(0, Math.min(tabs.length - 1, rec.activeTabIdx || 0));
        if (tabs.length <= 1) {
            try { rec.strip?.dispose(); } catch { /* already gone */ }
            rec.strip = null;
            rec.tabBarEl?.classList.add('twm-window-tabbar--hidden');
            return;
        }
        rec.tabBarEl?.classList.remove('twm-window-tabbar--hidden');
        if (!rec.strip) {
            rec.strip = createTabStrip({
                hostEl: rec.tabBarEl,
                taxonomy: this.taxonomy,
                onAction: (action, data) => this._windowTabAction(winId, action, data),
            });
        }
        rec.strip.update(tabs, rec.activeTabIdx);
    }

    /** The window strip's half of `_leafTabAction` — the same four verbs
     *  against the window record instead of against the tree. */
    _windowTabAction(winId, action, data = {}) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) return;
        const tabs = rec.tabs || [];
        if (action === 'switch') {
            this.showWindowTab(winId, data.idx);
            return;
        }
        if (action === 'close') {
            if (data.idx < 0 || data.idx >= tabs.length) return;
            // THE LAST TAB CLOSES THE WINDOW, which is what closing the last
            // tab of a pane does to the pane (`_leafTabAction`). A window with
            // no content in it is a title bar over nothing.
            if (tabs.length <= 1) {
                try { rec.window.close({ force: true }); } catch { /* gone */ }
                return;
            }
            tabs.splice(data.idx, 1);
            if (data.idx < rec.activeTabIdx) rec.activeTabIdx -= 1;
            else if (data.idx === rec.activeTabIdx) {
                rec.activeTabIdx = Math.max(0, data.idx - 1);
                this._mountWindowTab(winId);
            }
            this._syncWindowTabs(winId);
            this._notifyChange('window-tab-close');
            return;
        }
        if (action === 'move') {
            const { from, to } = data;
            if (from == null || to == null) return;
            if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return;
            const moved = tabs.splice(from, 1)[0];
            tabs.splice(to, 0, moved);
            // The same index arithmetic `TileTree.moveLeafTab` does, for the
            // same reason: the tab that was showing must still be showing.
            if (rec.activeTabIdx === from) rec.activeTabIdx = to;
            else if (from < rec.activeTabIdx && to >= rec.activeTabIdx) rec.activeTabIdx -= 1;
            else if (from > rec.activeTabIdx && to <= rec.activeTabIdx) rec.activeTabIdx += 1;
            this._syncWindowTabs(winId);
            return;
        }
        if (action === 'menu') this._showWindowTabContextMenu(winId, data.idx, data.x, data.y);
    }

    /** Show one of a floated pane's tabs. Public because a window is the only
     *  place this list exists — nothing else can reach it. */
    showWindowTab(winId, idx) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) return false;
        const tabs = rec.tabs || [];
        if (!Number.isInteger(idx) || idx < 0 || idx >= tabs.length) return false;
        if (idx === rec.activeTabIdx) return true;
        rec.activeTabIdx = idx;
        this._mountWindowTab(winId);
        this._syncWindowTabs(winId);
        this._persist();
        this._notifyChange('window-tab-switch');
        return true;
    }

    /** Tear the current mount down and mount the active tab in its place.
     *  `rec.original` follows, so a later dock puts back what is on screen. */
    _mountWindowTab(winId) {
        const rec = this._windowToLeaf.get(winId);
        if (!rec) return;
        const tab = (rec.tabs || [])[rec.activeTabIdx];
        if (!tab) return;
        try { rec.mountInfo?.destroy?.(); } catch { /* factory threw on the way out */ }
        rec.bodyEl.innerHTML = '';
        rec.mountInfo = this.content.mount(tab.kind, rec.bodyEl, tab.props || {},
            { ...this.ctx, wm: this, windowId: winId });
        rec.original = { kind: tab.kind, props: { ...(tab.props || {}) },
                         title: rec.mountInfo?.title || tab.title || tab.kind };
        this._setWindowTitle(rec, rec.original.title);
    }

    /** The window's title, in both places it is kept. */
    _setWindowTitle(rec, title) {
        try {
            const titleEl = rec.window?.element?.querySelector('.twm-managed-window__title');
            if (titleEl) titleEl.textContent = title;
            if (rec.window) rec.window.title = title;
        } catch { /* the window is already torn down */ }
    }

    /** The window strip's context menu. Deliberately the close verbs and
     *  nothing else: a tab in a window is already out of the tree, so
     *  "open in a window" — the verb R9 adds to a PANE's tab menu — has
     *  nowhere further to go. */
    _showWindowTabContextMenu(winId, idx, x, y) {
        const rec = this._windowToLeaf.get(winId);
        const tabs = rec?.tabs || [];
        if (!tabs.length) return;
        const items = [{ label: 'Close tab', icon: 'close', action: 'close' }];
        if (tabs.length > 1) {
            items.push({ label: 'Close other tabs', icon: 'tab_close', action: 'close-others' });
        }
        showContextMenu(x, y, items, (action) => {
            const live = this._windowToLeaf.get(winId);
            if (!live) return;
            if (action === 'close') this._windowTabAction(winId, 'close', { idx });
            else if (action === 'close-others') {
                const keep = live.tabs[idx];
                if (!keep) return;
                // RE-MOUNT ONLY IF THE KEPT TAB IS NOT THE ONE ON SCREEN.
                // Mounting is destroy-then-build, and a content factory that
                // rebuilds is a factory that can lose what is staged in it —
                // "close the other tabs" must not be a way to discard the edits
                // in the tab you kept.
                const remount = idx !== live.activeTabIdx;
                live.tabs = [keep];
                live.activeTabIdx = 0;
                if (remount) this._mountWindowTab(winId);
                this._syncWindowTabs(winId);
                this._notifyChange('window-tab-close-others');
            }
        });
    }

    /**
     * Re-parent every pane-contained window into its pane's CURRENT wrap.
     *
     * Called after each repaint. A leaf's wrap is cached per (kind, props, tab
     * fingerprint) and rebuilt when any of those change, so a window parented
     * into it is thrown away with the old wrap — silently, because nothing
     * throws and the window object is still perfectly alive.
     *
     * `moveTo` returns false when the container has not changed, so this is a
     * no-op on every repaint that did not rebuild the pane in question.
     */
    _rehomeContainedWindows() {
        if (!this.promoteInPlace) return;
        for (const [, rec] of this._windowToLeaf) {
            if (!rec.homeLeafId || !rec.window) continue;
            // R1. NOT WHILE IT IS BEING DRAGGED OUT. A window mid-escape is
            // parented to the root deliberately and is following the pointer in
            // the root's coordinates; re-homing it into its pane here would clip
            // it, re-clamp it, and leave the rest of the drag computing deltas
            // against a frame that moved underneath it. The escape puts it back
            // itself on release, and adopts the current wrap when it does.
            if (rec.window.dragOrigin) continue;
            // R13, NOW A GUARD RATHER THAN A PATH. NOR WHILE IT IS MAXIMISED
            // ONTO THE DRAG HOST. A window filling the layer is parented to the
            // ROOT of necessity — `.twm-leaf` is `overflow: hidden`, so a
            // window bigger than one tile cannot be a child of one — and
            // `moveTo` re-clamps into the new container without converting, so
            // re-homing it here would shrink it back into the pane on the first
            // repaint after the gesture.
            //
            // WHICH ROUTE STILL REACHES IT, honestly stated, because a guard
            // whose route nobody can name is dead code wearing a comment. R14
            // removed the one this was WRITTEN for: the aero-snap top edge used
            // to maximise onto the layer and now docks, so no gesture in this
            // layer leaves a window maximised on the root any more. What
            // remains is the library API — `toggleMaximize({claimable: false})`
            // is public, documented on `ManagedWindow` as the way past a
            // consumer's claim, and an embedder that calls it on an adopted
            // window sitting on the drag host produces exactly this state. It
            // costs one comparison to keep and a silently shrinking window to
            // remove, so it stays.
            //
            // BOTH CONDITIONS, and neither alone. `isMaximized` by itself would
            // also skip a window maximised INSIDE its pane — that one still has
            // to follow its wrap when the wrap is rebuilt, which is the whole
            // job of this pass, and `snap_zones.test.mjs` asserts it. The
            // container by itself would skip a window the escape left on the
            // root because its origin was destroyed mid-drag, which is
            // precisely the case this pass exists to adopt.
            if (rec.window.isMaximized && rec.window.container === this.rootEl) continue;

            // ══ C21. A WINDOW BELONGS TO ONE DESKTOP ═══════════════════
            //
            // …and is in the document only while that desktop is on screen.
            // That has always been TRUE and was never STATED: switching
            // desktops evicts the old tree's leaves from the wrap cache
            // (`tile_renderer._cleanCache`), which takes the windows standing
            // on them out of the document as a side effect. Saying it here is
            // what lets `moveWindowToDesktop` actually move a contained window
            // — it re-points the record and this pass takes the element off
            // the page the window has just left. Coming back re-parents it:
            // the destination's wraps are rebuilt on arrival, so `moveTo` sees
            // a container it has not seen and appends.
            if (rec.desktopIdx !== this.desktops.activeIdx) {
                if (!rec.homeContainer && rec.window.element?.isConnected) {
                    try { rec.window.element.remove(); } catch { /* already out */ }
                }
                continue;
            }

            // ══ A HOME LEAF THAT HAS LEFT THE TREE IS REPAIRED, NOT SKIPPED ══
            //
            // *"tiles must only influence tiles, not windows"* — the product
            // owner, 2026-09-01. A tile can be destroyed by four gestures
            // (`closeFocused`, the tab strip's × on a last tab,
            // `moveFocusedToDesktop`, and `_mergeStartTiles`) and NONE of them
            // asked what was standing on it. `_paneHoldsWindows` — the guard
            // written for exactly that question — is consulted from one place
            // in the whole file, and no close path is it.
            //
            // What happened when a pane with a window on it was closed:
            // `_cleanCache` removed the wrap, and the window's element with it,
            // twenty-three lines BEFORE this pass runs. The window was left
            // alive with `isVisible: true` and `isMinimized: false` — so it was
            // on no surface AND in no taskbar (Tables' strip lists the
            // minimised), holding a mounted grid and its staged edits, with no
            // chrome to press and no route back. Reproduced end to end.
            //
            // Repairing it HERE rather than at each of the four call sites is
            // deliberate: this pass already runs after every render, it already
            // owns *where a contained window is parented*, and a fifth gesture
            // that closes a leaf gets the same answer without knowing this rule
            // exists. The window keeps floating — it re-homes onto the tile
            // that survived rather than docking itself — which is the ruling:
            // a tile operation may move a window, never convert or destroy it.
            //
            // NOT for an adopted window (`homeContainer`): the embedder resolves
            // its own ground and owns the lifetime of the box it stands in.
            if (!rec.homeContainer && rec.homeLeafId) {
                const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
                if (tree && !tree.get(rec.homeLeafId)) {
                    // A TREE WITH NO CONTENT LEAF GETS ONE. `closeFocused`
                    // keeps that invariant itself, but `moveFocusedToDesktop`
                    // did not — with a panel open it leaves a page holding
                    // nothing but chrome, and then there is no ground for the
                    // windows that were standing there. Spawning it here is the
                    // same call `closeFocused` makes and the same tile a fresh
                    // desktop starts with; leaving `homeLeafId` dangling would
                    // put the window back in the state above.
                    let survivor = tree.primaryLeafId();
                    if (!survivor) {
                        const spawned = this._spawnContentLeaf(tree);
                        if (spawned) {
                            this._seedHome(tree, spawned);
                            this._canonicalize(tree, this.desktops.desktops[rec.desktopIdx]);
                            survivor = tree.primaryLeafId();
                        }
                    }
                    if (survivor) rec.homeLeafId = survivor;
                }
            }

            // R11. AN ADOPTED WINDOW IS CONTAINED TO A BOX INSIDE THE PANE,
            // not to the pane itself — a canvas ground sits within the leaf
            // wrap, under whatever chrome the embedder draws above it. Re-homing
            // such a window to the wrap would lift it out of its ground and
            // stand it over that chrome, which is a slower and stranger version
            // of the bug this whole function exists to prevent.
            const paneEl = rec.homeContainer
                ? (rec.homeContainer() || null)
                : this.renderer.leafEl(rec.homeLeafId);
            // NO PANE ELEMENT, ON THE ACTIVE DESKTOP, AFTER THE REPAIR ABOVE.
            // What is left is an embedder's ground that has not mounted yet and
            // a tree with no content leaf at all — neither of which is a window
            // to rescue. The sentence that used to stand here said "closed, or
            // on another desktop … rather than orphaning it into a detached
            // node", and both halves were wrong: the other desktop is handled
            // above, and by the time this ran on a CLOSED pane the node was
            // already detached — `_cleanCache` (`tile_renderer.js`) runs before
            // `onAfterRender`, not after it.
            if (!paneEl) continue;
            if (paneEl === rec.window.container) {
                // THE CONTAINER IS UNCHANGED AND THE ELEMENT IS NOT IN IT.
                //
                // The desktop rule above takes a window off the page it has
                // left by removing the ELEMENT; it deliberately leaves
                // `container` alone, because the wrap is still the window's
                // home and re-pointing it would lose that. Coming back through
                // a desktop SWITCH is safe — the wrap is evicted and rebuilt,
                // so `moveTo` sees a new container and appends. Coming back any
                // other way is not: `moveWindowToDesktop` and `removeDesktop`
                // re-point `desktopIdx` and render with the same tree on
                // screen, so the wrap is still cached, `moveTo` returns false
                // for an unchanged container, and the window stayed detached
                // for good — the exact state this whole pass exists to prevent,
                // reached through the desktop door instead of the close door.
                //
                // `appendChild` rather than `moveTo`: nothing about the
                // window's home has changed, so there is no clamp to redo, no
                // resize observer to rebuild and no `managed-window-moved` to
                // announce. It is the same element going back into the same
                // box.
                const el = rec.window.element;
                if (el && !el.isConnected) {
                    try { paneEl.appendChild(el); }
                    catch (err) { console.warn('[wm] re-attach failed', err); }
                }
                continue;
            }
            try { rec.window.moveTo(paneEl); }
            catch (err) { console.warn('[wm] re-home failed', err); }
        }
    }

    /**
     * C21, as a verb a consumer can call: put THIS window back where it belongs
     * and say whether it moved.
     *
     * The taskbar needs it. A minimised window's element may be out of the
     * document — its desktop is not on screen, or its pane was closed — and
     * un-minimising it in that state clears `isMinimized` (so its button
     * disappears, the last handle on it) while showing nothing. `restore` has
     * to be able to repair the window BEFORE it makes it visible, and
     * `_rehomeContainedWindows` is the thing that knows how; it was simply not
     * reachable, and `taskbar.js`'s own docstring asserted it ran for these
     * windows when the guard above meant it did not.
     *
     * IT SWITCHES DESKTOPS WHEN IT HAS TO, and that is the half a bare re-home
     * cannot do. A window belongs to one desktop; if that desktop is not on
     * screen, the honest answer to *show me this window* is the one every
     * taskbar in every window manager gives — go to where it lives. Restoring
     * it onto the page the user happens to be looking at would move a window
     * between pages as a side effect of asking to see it, and that is a tile
     * decision being made by a window verb.
     *
     * @param {object} win a live ManagedWindow
     * @returns {boolean} whether this WM owns it (and so has revealed it)
     */
    revealWindow(win) {
        if (!win) return false;
        let rec = null;
        for (const [, r] of this._windowToLeaf) {
            if (r.window === win) { rec = r; break; }
        }
        if (!rec) return false;
        // AN UNCONTAINED WINDOW HAS NO PAGE, SO THERE IS NOTHING TO REVEAL.
        // `_navigateWindow`'s windows (Alt+N, "Open a copy in a window") float
        // over the root and stay visible on every desktop; `desktopIdx` on such
        // a record is only where it happened to be OPENED. Switching to it
        // would throw the user off the page they are on to show them a window
        // that was already in front of them. Returning false hands the restore
        // back to the embedder, which is right for the canvas registry's
        // windows too.
        if (!rec.homeLeafId && !rec.homeContainer) return false;
        if (rec.desktopIdx !== this.desktops.activeIdx
            && this.desktops.desktops[rec.desktopIdx]) {
            // Renders, and the render re-homes — so there is nothing to do
            // afterwards, and doing it twice would be a second repaint.
            this.switchDesktop(rec.desktopIdx);
        } else {
            this._rehomeContainedWindows();
        }
        return true;
    }

    /**
     * R12. The rectangle an ESCAPED window may occupy — the tiles, and not the
     * panels — in the root's own coordinates.
     *
     * R1 let a window leave its pane so it could reach another one, and the
     * cheapest box to let it leave into is the root every tile shares. But the
     * root holds the docked panels too, so the bottom edge stopped being an
     * edge: a window could be dragged down over the bottom panel and dropped
     * there, half-covering a surface that has its own scroll and its own
     * chrome, with no way to tell it had happened except that it looked wrong.
     *
     * The answer is the UNION OF THE CONTENT LEAVES rather than "the root minus
     * the panel I know about": panels dock left, right and bottom, an embedder
     * may show any combination of them, and each one may be collapsed. A union
     * of the tiles is right for all of those without enumerating any of them,
     * and it degrades to the root when a desktop is somehow all panel.
     */
    _tileBounds() {
        const root = this.rootEl;
        if (!root) return null;
        const layer = this._layerRect();
        if (!layer) return null;
        const rootRect = root.getBoundingClientRect();
        // Into the host's coordinates. `left`/`top` are written against the
        // PADDING box, so the root's own border comes off as well — the same
        // conversion the escape does, and for the same reason.
        const ox = rootRect.left + root.clientLeft - root.scrollLeft;
        const oy = rootRect.top + root.clientTop - root.scrollTop;
        return { minX: layer.left - ox, minY: layer.top - oy,
                 width: layer.width, height: layer.height };
    }

    /**
     * R13. THE LAYER, in the VIEWPORT pixels a hit-test speaks — the union of
     * the content leaves, before it is converted into anybody's coordinates.
     *
     * This is `_tileBounds` with the last step taken off, and it stays a
     * separate function rather than being folded back into it because the two
     * frames have different readers: `_tileBounds` answers `dragBounds`, which
     * `ManagedWindow._bounds()` uses to clamp a window in the ROOT's
     * coordinates, and this answers anything measuring against the page.
     *
     * R14 REMOVED ITS OTHER READER. R13's maximise preview was drawn from here
     * so that it would be the same measurement `toggleMaximize` would deliver
     * through `dragBounds` — C15's rule, THE PREVIEW MAY NOT PROMISE A
     * RECTANGLE THE DROP DOES NOT DELIVER, applied to the one mode that did not
     * dock. There is no such mode now: the top edge docks like every other
     * zone, its preview is the TILE (`_homeDockTarget`), and the layer's only
     * remaining job is the clamp. Kept as its own function because the clamp
     * still needs the union of the CONTENT leaves rather than the root, which
     * is a definition, not a call site.
     *
     * The union of the CONTENT LEAVES rather than the root, for the reason
     * `_tileBounds` gives at length: the root holds the docked panels too.
     *
     * Null when nothing has a box yet — a layout that has not happened, a
     * desktop whose tiles are all zero-sized. Every caller treats that as "do
     * not promise anything", which is the only honest answer available.
     */
    _layerRect() {
        let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
        for (const leaf of this._tree().leaves()) {
            if (PANEL_KINDS.has(leaf.content?.kind)) continue;
            const el = this.renderer.leafEl(leaf.id);
            if (!el) continue;
            const box = el.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            l = Math.min(l, box.left); tp = Math.min(tp, box.top);
            r = Math.max(r, box.right); b = Math.max(b, box.bottom);
        }
        if (!Number.isFinite(l)) return null;
        return { left: l, top: tp, width: r - l, height: b - tp };
    }

    /** Dock the window's content back into the tile it came from — or, when it
     *  came from none, into the desktop's primary tile — then close the window.
     *
     *  R7. This is what the MAXIMIZE button now does, so it is reached far more
     *  often than it was as a button of its own, and "somewhere other than where
     *  the window came from" stopped being a defensible answer. Promoting a pane
     *  re-seeds it with the root kind — ground for the window to stand on — so
     *  FILLING that pane is the exact inverse: the content goes back where it
     *  was lifted from, replacing the ground it has been standing on.
     *
     *  A home pane that has since acquired content is a different story. The
     *  user opened something there, and replacing it would destroy work the
     *  window knows nothing about, so the content joins it as a tab instead.
     *  With no home pane at all — an Alt+N window, or any window under an
     *  embedder that does not confine promotions — this is the primary-tile tab
     *  it has always been. */
    bringBackWindow(windowId) {
        const rec = this._windowToLeaf.get(windowId);
        // C28. IT SAYS SO WHEN IT DOES NOTHING. This resolves through
        // `_windowToLeaf` and is silent for a window the WM never built and
        // never adopted — correct, since there is no tile to bring such a
        // window back to. The `onMaximize` wrappers below returned `true`
        // regardless, so `toggleMaximize` treated the gesture as CLAIMED and
        // returned early, and the window neither docked nor maximised: the
        // button and the double-click both did nothing at all, which is a
        // dead control rather than a limitation anybody can read. Returning
        // false lets the geometric maximise happen instead — the answer every
        // other window manager gives a window with nowhere to go back to.
        if (!rec) return false;
        const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
        const home = rec.homeLeafId ? tree?.get(rec.homeLeafId) : null;
        if (home && home.kind === 'leaf') {
            rec._dock = { leafId: rec.homeLeafId,
                          mode: this._isStartTile(home) ? 'fill' : 'tab' };
        }
        rec._demoting = true;
        try { rec.window.close({ force: true }); }
        catch (err) { console.warn('[wm] bringBack: close failed', err); }
        return true;
    }

    /**
     * R11. ADOPT A WINDOW THE EMBEDDER BUILT ITSELF.
     *
     * Everything R1–R10 gave a window — escaping its pane for the length of a
     * drag, going half-transparent once it is outside, the edge/body/ground
     * drops, maximise meaning *back to tile* — is wired in `_promote`, and so
     * belongs only to windows this WM lifted out of the tree. An embedder that
     * stands its own `ManagedWindow` on a pane (`snap: true` against the pane's
     * ground) got none of it: `_snapCommit` resolves the window through
     * `_windowToLeaf` and returns false for one it never built, so every drop
     * previewed correctly and then quietly did nothing.
     *
     * The fix is not to make the WM build those windows — the embedder has its
     * own reasons for the ones it builds, and taking that over would mean
     * taking over their content, their identity and their lifetime. It is to
     * let a window JOIN the tree's world after the fact, which needs exactly
     * two things: the drag options set on the component, and a record saying
     * what content to restore when the window is docked.
     *
     * CALL THIS BEFORE `show()`. `maximizeIcon` is read when the chrome is
     * built (`managed_window.js:703`) and the chrome is built lazily by `show`
     * (`:281`), so a window adopted afterwards would carry the right behaviour
     * behind a button still drawing a square.
     *
     * TEARDOWN STAYS THE EMBEDDER'S. `mountInfo` is optional and normally
     * omitted: a window that already destroys its own content in its `onClose`
     * would otherwise destroy it twice, once here and once there. The
     * embedder's handler is chained, not replaced, and runs after this one — so
     * a dock has already re-mounted the content into the tile by the time the
     * window's own teardown disposes of the copy that was floating.
     *
     * @param {object} win  a live ManagedWindow, not yet shown
     * @param {object} spec
     * @param {string} spec.kind          content kind to restore into a tile
     * @param {object} [spec.props]       its props
     * @param {string} [spec.title]       the tab title after a dock
     * @param {string} [spec.homeLeafId]  the pane it stands on: what "back to
     *        tile" targets, and what the probe stays silent inside
     * @param {function} [spec.homeContainer]  `() => HTMLElement` — the box
     *        WITHIN that pane the window is contained to. A canvas pane's
     *        ground is not the leaf wrap, and re-homing to the wrap after a
     *        repaint would lift the window out of the ground it belongs to.
     * @param {object} [spec.mountInfo]   `{destroy}`, if teardown is ours
     * @returns {string|null} the window id, or null if it could not be adopted
     */
    adoptWindow(win, spec = {}) {
        const winId = win?.id;
        if (!winId || !spec.kind) return null;
        if (this._windowToLeaf.has(winId)) return winId;

        // The same bag `_promote` builds, and deliberately the same values: two
        // windows on one desktop behaving differently under the same gesture is
        // the kind of difference a user reads as a bug in whichever one they
        // tried second.
        if (this.snapPromotion) {
            win.snap = win.snap && win.canDrag && win.canResize;
            win.snapController = this._snapController();
        }
        win.dragHost = () => this.rootEl;
        win.dragBounds = () => this._tileBounds();
        win.onMaximize = () => this.bringBackWindow(winId);
        win.maximizeIcon = 'close_fullscreen';
        win.maximizeTitle = 'Back to tile';

        const original = { kind: spec.kind, props: spec.props || {},
                           title: spec.title || spec.kind };
        this._windowToLeaf.set(winId, {
            leafId: null,
            desktopIdx: this.desktops.activeIdx,
            original,
            mountInfo: spec.mountInfo || null,
            window: win,
            contentEl: null, bodyEl: null, tabBarEl: null,
            tabs: [original], activeTabIdx: 0, strip: null,
            homeLeafId: spec.homeLeafId || null,
            homeContainer: spec.homeContainer || null,
            adopted: true,
            _demoting: false,
        });

        const prior = win.onClose;
        win.onClose = () => {
            this._onManagedWindowClosed(winId, null);
            prior?.();
        };
        return winId;
    }

    // ══ C15. Snap-to-promote ══════════════════════════════════════════
    /**
     * The snap controller a promoted window is given. It answers the two
     * questions ManagedWindow's own C11 snap cannot, because both are about a
     * tree it does not know exists:
     *
     *   probe   which TILE is under the pointer, and — since R15 — which edge
     *           of it THE DRAGGED WINDOW'S OWN BORDERS have reached, and what
     *           would dropping there actually produce: a half of that tile, a
     *           quarter of the layer, the tile entire, or (R13, at the top edge
     *           of the pane the window already stands on) the whole layer,
     *           which is the one answer that is not a dock at all. The preview
     *           draws exactly that rectangle, because a preview that promises a
     *           half and delivers a quarter is worse than no preview.
     *   commit  put the window in the tree — or, for R13's maximise, leave it
     *           floating and give it the layer. Over an EMPTY tile the dock is
     *           unambiguous and happens on release. Over an OCCUPIED tile the
     *           edges are unambiguous too — the drag chose a side, so the
     *           side is the split — and only the CENTRE was ever genuinely a
     *           question, which is why it is the zone that changed most.
     *
     * Built once and reused: the probe runs per pointermove and allocating a
     * closure per window per drag is free, but the memo keeps the identity
     * stable for anyone comparing controllers.
     */
    _snapController() {
        if (this._snapCtl) return this._snapCtl;
        this._snapCtl = {
            probe: (e, win) => this._snapProbe(e, win),
            commit: (probe, win) => this._snapCommit(probe, win),
        };
        return this._snapCtl;
    }

    /**
     * How close to a tile's edge the DRAGGED WINDOW'S matching edge must come
     * for a dock to arm — in PIXELS, and a narrow band. Since R15 it is also
     * the minimum distance the drag must have travelled toward that edge
     * inside the window's own pane; `_snapSide` argues both, and this is the
     * one constant either of them is measured in.
     *
     * This was a third of the tile, measured as a fraction, with the remaining
     * middle ninth treated as a fourth zone that offered a three-way choice.
     * Both halves of that were wrong, and together they made docking the
     * DEFAULT rather than a deliberate gesture:
     *
     *   - A fraction means the band grows with the tile. On a maximised layer
     *     a "third" is several hundred pixels, so a window could not be moved
     *     anywhere near the left half of the screen without arming a split.
     *   - The centre zone armed over the whole middle of every tile and
     *     previewed the ENTIRE tile, so simply picking a window up and moving
     *     it a few pixels lit the whole pane. Every move looked like a dock
     *     because every move WAS one.
     *
     * Aero snap is an edge gesture: you push THE WINDOW at an edge — which is
     * what R15 finally made it measure. So the band is a fixed 28px from the
     * edge, and what lies past it is decided by the
     * pane rather than by the pointer: in the window's OWN pane the centre
     * arms nothing at all and the drop is simply a window that moved (R2), and
     * in any other pane it is the non-destructive tab or fill of R5/R6. The
     * band itself never grows with the tile, which is the whole of the fix.
     * Docking a whole tile is also still available without any drag at all —
     * the "back to tile" button in the window's own chrome, which names the
     * destination instead of guessing it.
     */
    static get SNAP_EDGE_PX() { return 28; }

    _snapProbe(e, win) {
        const leafEl = this._leafElAt(e.clientX, e.clientY, win);
        if (!leafEl) return null;
        // R2, NARROWED BY R13. THE PANE IT CAME FROM ARMS AT ITS EDGES AND
        // NOWHERE ELSE — its centre still arms nothing at all.
        //
        // The rule was a blanket one: the origin pane armed nothing anywhere,
        // neither an edge nor the centre. It answered a real complaint — a
        // window that lives on a pane could not be nudged two pixels without
        // the pane lighting up to say it was about to swallow it — but it
        // answered it with more than the complaint asked for. A nudge happens
        // in the MIDDLE of a pane, which is where a window sits and where a
        // hand moving it goes; the 28px edge bands are somewhere a drag only
        // arrives on purpose — which under R15, where the bands are tested
        // against the WINDOW's borders and a window can already be sitting in
        // one before the hand touches it, is true only because `_snapSide`'s
        // direction guard makes it true. That guard is R2's other half and it
        // is why it applies in this pane and nowhere else.
        // So the centre is still silent, the nudge is still
        // fixed in full, and the edges of a window's own pane now mean what
        // they mean in every other pane — with one addition, TOP, which in the
        // pane a window already occupies has nothing to split and means
        // MAXIMISE instead (see below).
        //
        // DECIDED HERE, SPENT BELOW. `dragOrigin` is in hand at this point and
        // the answer cannot change while the probe runs, but which zone it
        // applies to is not known until `side` is. The origin is the window's
        // own answer (`dragOrigin` — the container its drag escaped), so the
        // two halves of the rule cannot disagree: the same boundary that turns
        // the window half-transparent is the one that arms the probe.
        //
        // A window with no origin — one opened straight into a float, which
        // never belonged to a pane — has no inside to be in, and every pane
        // under it is foreign. It arms everywhere, which is correct: there is
        // no "just moving it around at home" for a window with no home. It also
        // never maximises by this gesture, and that is not an omission — see
        // the maximise branch, which can only promise the layer for a window
        // whose bounds are the layer.
        //
        // CONTAINS, not equals. The WM confines its own promotions to the leaf
        // WRAP, but an embedder is free to confine a window to a box it built
        // inside the leaf — a canvas pane whose ground is a sibling of its own
        // taskbar strip does exactly that — and that window's home pane is the
        // leaf around it. `contains` is true of the element itself, so the
        // WM's own case is the same test.
        const own = !!(win?.dragOrigin && leafEl.contains(win.dragOrigin));
        const leafId = leafEl.dataset.leafId;
        // THE ACTIVE DESKTOP, and the dock has to agree. A promoted window is
        // global — it stays on screen across a desktop switch — so the tile
        // under the pointer belongs to whichever desktop is showing, not to the
        // one the window was promoted from. `_onManagedWindowClosed` applies
        // `_dock` against `rec.desktopIdx`, so the drop carries the index it
        // was made on and re-homes the record to it.
        const desktopIdx = this.desktops.activeIdx;
        const leaf = this._tree().get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return null;
        // Panel tiles are chrome, not content. A window dropped on the
        // navigator has nowhere to go and the preview must not suggest it has.
        if (String(leaf.content?.kind || '').startsWith('panel:')) return null;

        const r = leafEl.getBoundingClientRect();
        // R4, RE-AIMED BY R15. PIXELS FROM EACH EDGE, not fractions of the
        // tile — and the edges measured are now THE DRAGGED WINDOW'S, not the
        // pointer's. `_snapSide` owns that argument in full, including the
        // corner precedence and the one case that still falls back to the
        // pointer.
        //
        // One exclusion survives unchanged: a leaf with NO content at all has
        // no edges, because splitting nothing produces two nothings and the
        // preview would be drawing a half of a pane that has nothing to halve.
        const side = leaf.content ? this._snapSide(r, e, win, own) : null;
        // R14 (was R13). TOP, IN THE WINDOW'S OWN PANE, IS *BACK TO TILE*.
        //
        // Everywhere else `top` splits off the pane's upper half. In the pane
        // the window is already floating over, that is the one edge with
        // nothing to say — splitting a pane in order to put a window into the
        // half of it the window already covers is a gesture whose only effect
        // is work to undo. Aero's answer is the one worth copying: the top edge
        // is the "make this as big as it goes" edge.
        //
        // R13 read that as the GEOMETRIC maximise and made "as big as it goes"
        // mean THE LAYER. The product owner overruled it — *"putting a window
        // to maximize > maximize here means back to tile"* — and, asked how far
        // that went, chose everywhere, adding *"this is not yet correct for the
        // snap at top gesture"*, which names this zone as the part still wrong.
        // So there is now ONE meaning of maximise in the whole layer: the
        // window stops being a window and its content goes back into a tile.
        // The chrome button, the title bar's double-click, the embedder's
        // window menu and this edge are four doors onto one verb, which is the
        // only arrangement in which a user learns it once. No geometric
        // maximise remains reachable by gesture; `toggleMaximize({claimable:
        // false})` stays on `ManagedWindow` as the library escape hatch for a
        // consumer that wants the rectangle, and nothing in here calls it.
        //
        // THE RECT IS THE TILE, and it must be the tile the DOCK picks rather
        // than the tile the pointer happens to be in. That is C15's rule, which
        // R13 obeyed in the other direction, and it is why this branch resolves
        // its destination up front instead of committing blind:
        // `_homeDockTarget` is `bringBackWindow`'s own resolution read out, so
        // the preview and the drop cannot disagree — one function, called from
        // both halves.
        //
        // NOTHING TO PROMISE, NOTHING DRAWN. A window the WM never adopted, a
        // home leaf on a desktop that is not showing, a layout that has not
        // happened: `_homeDockTarget` answers null and the top edge falls
        // SILENT, which is exactly what the CENTRE of the window's own pane
        // already does (R2's surviving half, a dozen lines below). That is not
        // the dead-control failure the disabled-item convention exists to
        // avoid — the release still runs `_endDragEscape`, which puts the
        // window back where the drag found it, a visible outcome and the same
        // one the centre gives. Arming, previewing a tile and THEN declining on
        // release is the bait-and-switch, and it is the thing forbidden here.
        if (own && side === 'top') {
            const home = this._homeDockTarget(win);
            if (!home) return null;
            return { key: `${home.leafId}:home`, rect: home.rect,
                     leafId: home.leafId, desktopIdx, side, mode: 'home',
                     leafRect: r };
        }
        return this._dropZoneFor({ leafId, leaf, r, side, own, desktopIdx });
    }

    /**
     * R17 (C33). THE ZONE MATRIX'S TAIL — SPLIT / NOTHING / TAB / FILL — SHARED
     * BY THE TWO THINGS THAT CAN BE DROPPED ON A TILE.
     *
     * A dragged WINDOW and a dragged TAB ask the same question of a pane: given
     * that the pointer is in this leaf and the edge test answered `side`, what
     * would releasing here produce? Every answer below was written for the
     * window drop and every one of them is right for a tab, so this is an
     * extraction and not a generalisation — `_snapProbe` keeps everything ABOVE
     * it unchanged, including R14's `own && side === 'top'` home branch, which
     * is a window's alone (a tab has no window to bring back) and therefore
     * stays where it was, between the side computation and this call.
     *
     * The alternative was a second copy in `tabDropProbe`, and a second copy of
     * a matrix the product owner has already revised four times (R2, R4, R5/R6,
     * R14) is a guarantee that the two gestures will one day disagree about
     * what the centre of a start tile means. `web/js/shell/snap_zones.test.mjs`
     * in the Tables consumer asserts every cell of the window matrix and is the
     * regression gate on this extraction: byte-identical window behaviour is
     * the whole of its back-compatibility claim.
     */
    _dropZoneFor({ leafId, leaf, r, side, own, desktopIdx }) {
        if (side) {
            return { key: `${leafId}:${side}`, rect: _halfOf(r, side),
                     leafId, desktopIdx, side, mode: 'split', leafRect: r };
        }
        // R2, THE HALF THAT SURVIVED. Past the edge bands, inside the pane it
        // came from, a window is being MOVED and not docked: no key, no
        // preview, and on release `_endDragEscape` simply puts it back where
        // the drag left it. This sits after the edges and before the centre
        // because it is only the centre it refuses — an own-pane leaf with no
        // content has no edges either (`side` stays null above), and refusing
        // that is right for the same reason: there is nothing to dock into that
        // the window is not already standing on.
        //
        // A TAB READS THIS CELL THE SAME WAY, arrived at from the other side:
        // dropping a tab into the pane it already lives in is a gesture whose
        // only effect is work to undo, which is R2's argument with the word
        // "nudge" removed.
        if (own) return null;

        // R5/R6. THE CENTRE IS NO LONGER NOTHING — it is the other two thirds
        // of the model, and which one it is depends on what the pane already is.
        //
        //   a pane with content   → a new TAB in it. Non-destructive, and the
        //                           honest reading of "dropping where an
        //                           existing tile is would cause a new tab".
        //   a START tile          → the window FILLS the pane, which is the
        //                           same verb as "back to tile": the window
        //                           stops floating and becomes that pane's
        //                           content. Under R14 that is what the top
        //                           edge of the window's OWN pane now means as
        //                           well — the difference between the two is
        //                           only which tile is named, this one the pane
        //                           under the pointer and R14's the pane the
        //                           window came from. A start tile is ground —
        //                           there is nothing there to lose, which is
        //                           exactly why this one may replace rather
        //                           than append.
        //
        // The preview is the WHOLE pane for both, because the whole pane is
        // what the window ends up occupying either way. C15's rule stands: the
        // preview may not promise a rectangle the drop does not deliver.
        const fills = !leaf.content || this._isStartTile(leaf);
        return { key: `${leafId}:${fills ? 'fill' : 'tab'}`, rect: _halfOf(r, null),
                 leafId, desktopIdx, side: null,
                 mode: fills ? 'fill' : 'tab', leafRect: r };
    }

    /**
     * R18 (C33). THE SAME PROBE, FOR A DRAGGED TAB — PUBLIC, because the
     * renderer is what holds the drag and the renderer is not the WM.
     *
     * ══ WHY THIS IS NOT `_snapProbe(e, null)` ═══════════════════════════
     *
     * It very nearly is, and the geometry underneath is literally the same
     * code: `_snapSide(r, e, null, false)` falls to the POINTER-distance branch
     * by construction — `_draggedRect(null)` is null, so `dist` takes the
     * `e.clientX/Y` arm and `along` scores every edge zero. A tab has no
     * rectangle being dragged and no `_dragState`, and that is not a gap to
     * paper over: the pointer IS the whole gesture for a tab, which is exactly
     * the pre-R15 model that `_snapSide`'s fallback preserves.
     *
     * Two things differ, and neither could be expressed by passing a null
     * window to `_snapProbe`:
     *
     *   R14's HOME BRANCH IS A WINDOW'S. `own && side === 'top'` means "put the
     *   window back in its tile", and a tab is already in a tile. Reaching that
     *   branch with `win === null` would ask `_homeDockTarget(null)`, which
     *   answers null, so the top edge of the source pane would fall silent
     *   rather than split — a hole in the matrix produced by inheritance.
     *
     *   A SINGLE-TAB SOURCE PANE ARMS NOTHING, ANYWHERE. `_dropZoneFor` already
     *   silences the source pane's CENTRE; its edges are useful for a pane with
     *   siblings ("tear this tab off into a split beside the others") and are a
     *   wash for a pane with one tab, where the outcome is the pane's only
     *   content in one half and a freshly seeded ground in the other. That is a
     *   preview promising something no one wants, so it is refused BEFORE the
     *   preview is drawn rather than at the drop — C15's rule is that the
     *   rectangle drawn is the one released, and the honest way to keep it is
     *   never to draw one.
     *
     * `own: false` is passed to `_snapSide` deliberately. Its `own` parameter
     * gates R2's direction guard, which measures a WINDOW's travel out of
     * `_dragState`; a tab drag has none, so `guarded` would be false anyway and
     * passing `true` would only obscure that. `own` still governs the centre,
     * which is why it goes to `_dropZoneFor` and not to `_snapSide`.
     *
     * @param {{clientX: number, clientY: number}} e   the pointer, mid-drag
     * @param {{sourceLeafId?: string}} [opts]         the leaf the tab left
     * @returns {object|null} the same probe shape a window drop produces
     */
    tabDropProbe(e, { sourceLeafId = null } = {}) {
        const leafEl = this._leafElAt(e.clientX, e.clientY, null);
        if (!leafEl) return null;
        const leafId = leafEl.dataset.leafId;
        const tree = this._tree();
        const leaf = tree.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return null;
        // Panel tiles are chrome, not content — the same refusal `_snapProbe`
        // makes, for the same reason: there is nowhere for the drop to go and
        // the preview must not suggest there is.
        if (String(leaf.content?.kind || '').startsWith('panel:')) return null;
        const own = !!sourceLeafId && leafId === sourceLeafId;
        if (own) {
            const src = tree.get(sourceLeafId);
            const count = Array.isArray(src?.tabs) ? src.tabs.length : 0;
            if (count <= 1) return null;
        }
        const r = leafEl.getBoundingClientRect();
        const side = leaf.content ? this._snapSide(r, e, null, false) : null;
        return this._dropZoneFor({ leafId, leaf, r, side, own,
                                   desktopIdx: this.desktops.activeIdx });
    }

    /**
     * R15. WHICH EDGE OF THE PANE THE *WINDOW* IS BEING PUSHED INTO.
     *
     * ══ THE BUG THIS EXISTS TO FIX ═══════════════════════════════════════
     *
     * The band was measured from the POINTER, and the pointer is wherever the
     * hand happened to grab the title bar. Grab a 900px window in the middle
     * of its bar and shove it right: `dragBounds` clamps it, its right border
     * sits hard against the layer's right edge, and the pointer is still 450px
     * away from that edge — outside every band, so nothing arms and the window
     * simply stops dead against the side of the screen. Reported twice:
     * *"snapping enables based on mouse position but actually it needs to
     * enable based on the dragged window bounds (e.g. window right border
     * distance from right snapping area)"*.
     *
     * The bigger the window the worse it got, and the gesture only ever worked
     * if you happened to grab near the edge you were aiming at — the bottom
     * edge was effectively unreachable for any tall window, because a title bar
     * is at the TOP of the thing you are dragging.
     *
     * So each of the four distances is now between the window's own border and
     * the matching border of the pane. `right` arms when the window's right
     * border comes within the band of the pane's right border, and so on round.
     *
     * ══ WHAT DID *NOT* CHANGE ════════════════════════════════════════════
     *
     * WHICH PANE is still the pointer's answer (`_leafElAt`), and so is `own`.
     * The zone matrix is about a pane — the window's own pane means something
     * different from any other pane — and a window can lie across three of
     * them at once while the pointer is in exactly one. Only the question
     * *"which edge of THIS pane"* moved onto the window's rectangle; the
     * question *"which pane"* was never the one the product owner complained
     * about. Everything downstream is untouched: the preview is still
     * `_halfOf(paneRect, side)`, so the rectangle drawn is the rectangle the
     * drop delivers, and a `side` reaching the branches below means exactly
     * what it meant before.
     *
     * ══ SHORTFALL CLAMPED AT ZERO, BECAUSE A WINDOW OVERHANGS ═════════════
     *
     * (R16 corrects R15 here. R15 said *unsigned*, and unsigned was wrong;
     * the paragraph below is why, and `_snapSide` carries the measurement.)
     *
     * The pointer is inside the pane by construction — `_leafElAt` found the
     * pane by hit-testing it — so a signed distance was always positive. A
     * WINDOW has no such guarantee: it is clamped to the layer, not to the
     * pane, so a window wider than the pane under the pointer sticks out of
     * both sides of it and its border is 20px PAST the pane's border rather
     * than 20px short of it. Both readings are "hard against that edge".
     *
     * R15 spelled that `Math.abs`, and `Math.abs` only holds the reading while
     * the overhang stays inside the band. Past that it counts UP again, so the
     * zone armed and then DISARMED as the shove continued, and a window
     * meaningfully wider than the pane armed nothing at all. The right spelling
     * is a shortfall clamped at zero: **past the edge IS the edge**, at
     * distance zero, and it stays there however far the shove carries it.
     *
     * ══ THE DIRECTION GUARD, WHICH IS WHAT KEEPS R2 ALIVE ════════════════
     *
     * Edge-based testing has a failure the pointer never had: a window that is
     * ALREADY at an edge is in that band before the drag starts. A window
     * parked at the left of its pane would arm a left split on the first
     * millimetre of any drag, and a window that fills its pane would arm on
     * every drag in every direction — which is precisely the *"every move
     * looked like a dock because every move WAS one"* failure `SNAP_EDGE_PX`
     * was written to end, arriving from the other direction.
     *
     * So in the window's OWN pane an edge arms only if the drag actually
     * carried the window at it: the pointer must have travelled more than one
     * band's width toward that edge since the press. A nudge (R2's complaint,
     * and the surviving reason the own-pane centre is silent) moves a handful
     * of pixels and arms nothing; a shove moves hundreds and arms the edge it
     * was aimed at. The band's own width is the unit, because a movement
     * smaller than the band cannot be the difference between being in it and
     * not.
     *
     * IN ANY OTHER PANE THE GUARD IS OFF, deliberately. R2 is a rule about the
     * pane a window already lives on — the only place a "nudge" exists. Drag a
     * window rightwards out of pane A and into pane B and its LEFT border is
     * what enters pane B first: with the guard on, aiming at the left half of
     * the pane to your right would be impossible, since arriving there always
     * means travelling right. The window is translucent by then (R3) and every
     * drop on a foreign pane docks, so there is no nudge to protect.
     *
     * The displacement is read from `ManagedWindow._dragState.startX/startY`,
     * the POINTER's position at the press — not from the window's own x/y,
     * which stop changing the moment the clamp bites while the gesture very
     * much continues. A caller with no drag state (a synthetic probe, an
     * embedder driving the controller by hand) yields no displacement at all
     * and the guard is skipped rather than failing closed: it can only ever
     * suppress an edge, never invent one.
     *
     * ══ CORNERS: THE PRECEDENCE, MADE EXPLICIT ═══════════════════════════
     *
     * Two edges can be in range at once, and with window borders that is no
     * longer the rarity it was with a pointer — shove a window into a corner
     * and the clamp puts BOTH borders at distance zero, exactly. Under R16 it
     * is not even a corner case: a window as wide as its pane is at zero on
     * the left AND the right for every horizontal position it can occupy, and
     * a floated canvas pane's window is *exactly* that wide. So the order is
     * stated rather than left to whichever way the loop happens to run:
     *
     *   1. NEAREST WINS. Unchanged from R4, and it is what keeps a corner from
     *      being a dead spot: one of the two is always closer.
     *   2. ON A TIE, THE EDGE THE DRAG PUSHED TOWARD WINS. (R16: *toward that
     *      edge*, signed — R15 said "the axis pushed furthest" and spelled it
     *      `Math.abs`, which gives the two ends of one axis the SAME score, so
     *      a left/right tie never broke at all and 'left' won every time by
     *      loop order.) The honest tie-break is the gesture: shove it
     *      rightwards and you get the right zone, upwards and you get the top
     *      zone. Every zone stays reachable and which one you get is something
     *      a hand can aim.
     *   3. STILL TIED — a perfect diagonal, or a probe with no drag state —
     *      falls to the fixed order left, right, top, bottom. That is the order
     *      the R4 loop already resolved ties in (`Object.entries` insertion
     *      order, with a strict `<`), kept so the pointer fallback below
     *      answers exactly what it answered before.
     *
     * ══ THE FALLBACK ═════════════════════════════════════════════════════
     *
     * With no measurable window rectangle — no element, detached, or a box of
     * zero area because layout has not happened — there is nothing to measure
     * and the pointer is the only information in the room. That path is the
     * pre-R15 code, unchanged, signed distances and all. It is what a headless
     * probe gets (jsdom lays nothing out, so every `getBoundingClientRect` is
     * zero), and it is why `web/js/shell/snap_zones.test.mjs` in the Tables
     * consumer still asserts the same matrix against the same coordinates.
     *
     * @param {DOMRect} r  the pane, in viewport pixels
     * @param {{clientX: number, clientY: number}} e  the pointer
     * @param {object} win  the ManagedWindow being dragged
     * @param {boolean} own  is `r` the pane this window's drag escaped?
     * @returns {'left'|'right'|'top'|'bottom'|null}
     */
    _snapSide(r, e, win, own) {
        const edge = WindowManager.SNAP_EDGE_PX;
        const w = this._draggedRect(win);
        // The displacement is read whenever there is one, because BOTH rules
        // below want it and they do not want it in the same places: the corner
        // tie-break is about aim and applies in every pane, while the guard is
        // R2's rule about nudging a window at home and applies in one.
        const push = w ? this._dragPush(e, win) : null;
        const guarded = !!(own && push);
        // R16. SHORTFALL, CLAMPED AT ZERO — *not* `Math.abs`.
        //
        // R15 measured `Math.abs(r.right - w.right)`, which conflates the two
        // sides of an edge: a border 20px SHORT of the pane's border and one
        // 20px PAST it both read as 20. The reading past the edge is wrong,
        // and wrong in the direction that breaks the gesture. Two defects came
        // out of it and both are this one line of arithmetic:
        //
        //   THE BAND OPENED AND THEN CLOSED AGAIN. Shove a window right; its
        //   right border approaches the pane's right border, enters the 28px
        //   band, reaches it — and keeps going. One pixel past, `abs` starts
        //   counting UP again, and 28px past the edge the zone disarms.
        //   Measured on the real code: a 300px window in PANE_A armed `right`
        //   only for pointer deltas 173..227, and was null on either side. **A
        //   firm shove disarmed the snap that a hesitant one armed** — the
        //   product owner's original complaint arriving from the far side.
        //
        //   AND A WINDOW WIDER THAN THE PANE ARMED NOTHING — though that case
        //   is exactly what `abs` was reached for. The R15 docstring argues
        //   for it because such a window "sticks out of both sides and its
        //   border is 20px PAST the pane's rather than 20px short", which is
        //   true; what it misses is that `abs` holds that reading only while
        //   the overhang stays under 28px. Overhang by more and every edge
        //   reads out-of-band.
        //
        // Clamping at zero says what that prose always meant: **past the edge
        // IS the edge.** A border level with the pane's, or beyond it, sits at
        // distance zero and is fully armed, and stays armed however much
        // further the shove carries it. "How hard are you pushing past it" was
        // never a measure of aim.
        //
        // This makes a same-axis TIE ordinary rather than a corner curiosity:
        // a window wider than its pane is hard against the left and the right
        // border at once, both at zero. Breaking that tie is what the signed
        // `along` below is for, and the two changes only make sense together.
        //
        // The pointer fallback is untouched: the pointer is inside the pane by
        // construction — `_leafElAt` hit-tested it — so its distances cannot
        // go negative and there is nothing to clamp.
        const dist = w
            ? { left:   Math.max(0, w.left - r.left),
                right:  Math.max(0, r.right - w.right),
                top:    Math.max(0, w.top - r.top),
                bottom: Math.max(0, r.bottom - w.bottom) }
            : { left:   e.clientX - r.left,
                right:  r.right - e.clientX,
                top:    e.clientY - r.top,
                bottom: r.bottom - e.clientY };
        const toward = (name) => {
            if (!guarded) return true;
            if (name === 'left')  return push.x <= -edge;
            if (name === 'right') return push.x >= edge;
            if (name === 'top')   return push.y <= -edge;
            return push.y >= edge;
        };
        // R16. HOW FAR THE GESTURE TRAVELLED **TOWARD THIS EDGE** — signed to
        // the edge it is asked about, not to its axis.
        //
        // R15 wrote `Math.abs(push.x)` for both 'left' and 'right', which
        // makes the tie-break IDENTICAL for the two members of a same-axis
        // pair. `p > best.p` is then `|push.x| > |push.x|` — false, always —
        // so the tie fell through to the fixed loop order and **'left' won
        // every time, whichever way the window was shoved**.
        //
        // That was not the corner curiosity it looked like. Whenever a
        // window's width equals the pane's, `dist.left === dist.right` at
        // EVERY horizontal position, so the whole band answered 'left'; and a
        // canvas pane's window is sized `min(820, container.clientWidth)`,
        // which for any pane up to 822px wide comes out exactly equal to the
        // leaf's border-box width. So the common case — float a pane's window
        // and push it at the pane next door — always split left. Under R16's
        // clamped distance the tie is commoner still, because a window wider
        // than its pane now ties at zero on both edges by construction.
        //
        // Signing it makes the tie-break say what rule 2 always claimed:
        // *"the axis the drag pushed furthest wins"* — read as the DIRECTION
        // the drag pushed, which is the only reading a hand can aim. Shove
        // right, get right. A push away from the edge scores negative and
        // loses to any edge that was actually aimed at.
        //
        // Still zero for every edge when there is no drag state, so rule 3
        // falls through to the fixed order exactly as before.
        const along = (name) => {
            const dx = push?.x ?? 0, dy = push?.y ?? 0;
            if (name === 'left')  return -dx;
            if (name === 'right') return dx;
            if (name === 'top')   return -dy;
            return dy;
        };
        // THE FIXED ORDER IS RULE 3. Do not sort this array.
        let best = null;
        for (const name of ['left', 'right', 'top', 'bottom']) {
            const d = dist[name];
            if (!(d < edge) || !toward(name)) continue;
            const p = along(name);
            if (!best || d < best.d || (d === best.d && p > best.p)) best = { name, d, p };
        }
        return best ? best.name : null;
    }

    /** R15. The dragged window's rectangle in VIEWPORT pixels — the frame a
     *  leaf's `getBoundingClientRect` speaks, so the two are directly
     *  comparable — or null when there is nothing to measure.
     *
     *  Read off the element rather than computed from `win.x/y/width/height`,
     *  because those are in whatever container the window is currently parented
     *  to and mid-drag that is the drag host, not the pane being probed.
     *
     *  A zero-area box is "nothing to measure" rather than a rectangle at the
     *  origin: it is what an unlaid-out document gives, and treating it as real
     *  would put every window in the top-left corner of every pane. Same test
     *  `_homeDockTarget` applies to a leaf, for the same reason. */
    _draggedRect(win) {
        const el = win?.element;
        if (!el || el.isConnected === false) return null;
        if (typeof el.getBoundingClientRect !== 'function') return null;
        const b = el.getBoundingClientRect();
        if (!b || !b.width || !b.height) return null;
        return b;
    }

    /** R15. How far the POINTER has travelled since the press that began this
     *  drag, or null if this window is not in a drag the WM can see.
     *
     *  The pointer rather than the window: `_applyPosition` clamps the window
     *  to `dragBounds`, so a window shoved at the edge of the layer stops
     *  moving while the gesture continues — and "it stopped because it is
     *  against the edge" is exactly the situation the guard must not read as
     *  "it is not being pushed". */
    _dragPush(e, win) {
        const ds = win?._dragState;
        if (!ds || typeof ds.startX !== 'number' || typeof ds.startY !== 'number') return null;
        return { x: e.clientX - ds.startX, y: e.clientY - ds.startY };
    }

    /** The topmost `.twm-leaf` under the pointer that is not part of the window
     *  being dragged. `elementsFromPoint` rather than `elementFromPoint`: the
     *  dragged window IS under the pointer — it is what the pointer is holding
     *  — and a hit-test that stops at the first element only ever finds it.
     *
     *  R15 left this alone on purpose: WHICH pane is still the pointer's
     *  answer, and only WHICH EDGE of it moved onto the window's borders. See
     *  `_snapSide`. */
    _leafElAt(x, y, win) {
        const stack = document.elementsFromPoint(x, y);
        for (const el of stack) {
            if (win?.element && win.element.contains(el)) continue;
            const leafEl = el.closest?.('.twm-leaf');
            if (leafEl && this.rootEl.contains(leafEl)) return leafEl;
        }
        return null;
    }

    /**
     * R14. THE TILE "BACK TO TILE" WOULD PUT THIS WINDOW IN, and the rectangle
     * that draws it — in the VIEWPORT pixels a snap preview is positioned in.
     *
     * `bringBackWindow` resolves its destination privately and then closes the
     * window to reach it, which is everything a button press needs and useless
     * to a PREVIEW. C15's rule is that the rectangle drawn during a drag is the
     * one the drop delivers, and under R14 the drop delivers A TILE — so the
     * resolution has to be readable before the gesture is committed. Reading it
     * out here is what makes the top edge honest: the probe draws what this
     * returns and `_snapCommit` calls `bringBackWindow`, which resolves the
     * same way, from the same record, against the same tree.
     *
     * It is deliberately NOT a second copy of that resolution reduced to "the
     * home leaf". `bringBackWindow`'s fall-through — no home leaf, or one the
     * tree no longer has — is the desktop's PRIMARY tile, which is where
     * `_onManagedWindowClosed` sends a demotion carrying no `_dock`; a probe
     * that previewed the home leaf and then landed in the primary tile would be
     * the bait-and-switch with extra steps.
     *
     * `renderer.leafEl` only knows the leaves of the desktop currently on
     * screen, which is the property that makes the desktop check implicit: a
     * window whose home is on another desktop resolves to no element, this
     * answers null, and the top edge arms nothing rather than previewing a
     * rectangle on a desktop the user cannot see.
     *
     * @param {object} win  a live ManagedWindow
     * @returns {{leafId: string, rect: DOMRect}|null} null when there is
     *   nothing honest to promise: a window the WM never adopted, a desktop
     *   that has gone, a tree with no content leaf at all, or a leaf with no
     *   measurable box (a layout that has not happened yet).
     */
    _homeDockTarget(win) {
        const rec = [...this._windowToLeaf.values()].find((r) => r.window === win);
        if (!rec) return null;
        const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
        if (!tree) return null;
        const home = rec.homeLeafId ? tree.get(rec.homeLeafId) : null;
        const leafId = (home && home.kind === 'leaf')
            ? rec.homeLeafId
            : tree.primaryLeafId();
        if (!leafId) return null;
        const el = this.renderer.leafEl(leafId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        return { leafId, rect };
    }

    _snapCommit(probe, win) {
        if (!probe) return false;
        const rec = [...this._windowToLeaf.entries()]
            .find(([, r]) => r.window === win);
        if (!rec) return false;
        const [winId, record] = rec;
        const { leafId, desktopIdx, side } = probe;

        // R14. THE TOP EDGE OF THE WINDOW'S OWN PANE DOCKS IT HOME.
        //
        // It goes through `bringBackWindow` rather than through
        // `dockWindowInto` below, and that is the point rather than a shortcut:
        // "back to tile" is ONE verb with one implementation, and it is the
        // implementation that knows a home pane which has since acquired
        // content must be joined as a tab instead of replaced. Naming the leaf
        // here and calling `dockWindowInto` would be a second copy of that
        // rule, and a second copy is a copy that disagrees within a release.
        //
        // IT RETURNS BEFORE `record.desktopIdx` IS REWRITTEN below, for the
        // reason R13's branch did: the destination was resolved from the
        // RECORD's own desktop by `_homeDockTarget`, so rewriting the record to
        // the desktop the pointer is on would send `bringBackWindow` looking
        // for the home leaf in a tree that does not contain it — and it would
        // then fall through to that desktop's primary tile, which is not the
        // rectangle the preview drew.
        //
        // WHAT USED TO BE HERE: `toggleMaximize({ claimable: false })`, the
        // geometric maximise, with `{claimable: false}` load-bearing precisely
        // so the call would NOT reach `bringBackWindow`. The ruling inverts
        // that — the dock is now the whole intent — so the escape hatch is
        // gone from this file altogether. It stays on `ManagedWindow` as a
        // public API for a consumer that genuinely wants a rectangle (a dialog
        // has no tile to go back to, so `openModal`'s maximise is exactly
        // that); nothing in the tiling layer calls it any more.
        if (probe.mode === 'home') {
            // NOT TAKEN UNLESS IT REALLY WAS — the same rule the dock below
            // follows, and reachable here: `bringBackWindow` returns false for
            // a window whose record has gone between the probe and the release.
            // Claiming the drop after it did nothing would leave the preview
            // painted over the page with nothing left to remove it, and the
            // window abandoned wherever the pointer let go; returning false
            // hands the release back to `_endDragEscape`, which puts the window
            // back in its pane.
            if (!this.bringBackWindow(winId)) return false;
            win.clearSnapPreview();
            return true;
        }

        // The window's home follows the drop. Without this the dock is applied
        // to the tree of the desktop the window was PROMOTED from, and the tile
        // the user aimed at is on the one they are looking at.
        if (typeof desktopIdx === 'number') record.desktopIdx = desktopIdx;

        // THE DRAG ALREADY ANSWERED, so there is nothing to ask — the probe
        // decided between the outcomes on the way in, and the preview has
        // been drawing that answer for as long as the pointer has been there. A
        // menu on release would be asking a question the user has already spent
        // the whole drag answering.
        //
        // `dir` and `before` are read only by the split branch; a tab or a fill
        // ignores them, which is why they can be computed unconditionally from
        // a `side` that is null for both.
        const docked = this.dockWindowInto(winId, {
            leafId,
            mode: probe.mode || 'split',
            dir: (side === 'left' || side === 'right') ? 'h' : 'v',
            before: (side === 'left' || side === 'top'),
        });
        // NOT TAKEN unless it really was. A truthy return tells the window the
        // controller owns it AND owns the preview, so returning true after a
        // failed dock would leave a rectangle painted over the page with
        // nothing left to remove it, and a window sitting wherever the drag
        // abandoned it instead of back in its pane.
        if (!docked) return false;
        win.clearSnapPreview();
        return true;
    }

    /**
     * Put a floating window's content back into the tree at a NAMED place.
     *
     * `bringBackWindow` is this with `{ mode: 'tab' }` against the primary tile
     * — the answer when the user pressed a button in the window's own chrome
     * and named no destination. A drop names one.
     *
     * The window is CLOSED to do it, exactly as a demote is: the content
     * factory re-mounts inside the tile, and a factory that must not lose live
     * state across that boundary is the embedder's problem to solve (it is why
     * the registry is keyed on (kind, props) rather than on a DOM node).
     *
     * @param {string} windowId
     * @param {{leafId: string, mode: 'fill'|'tab'|'split', dir?: 'h'|'v',
     *          before?: boolean}} target
     */
    dockWindowInto(windowId, target) {
        const rec = this._windowToLeaf.get(windowId);
        if (!rec || !target?.leafId) return false;
        rec._dock = { ...target };
        rec._demoting = true;
        try { rec.window.close({ force: true }); }
        catch (err) { console.warn('[wm] dock: close failed', err); return false; }
        return true;
    }

    /**
     * Move a managed window to another desktop.
     *
     * ══ IT USED TO REWRITE ONE INTEGER, AND THAT MOVED NOTHING ═════════
     *
     * The sentence that stood here — *"the window itself stays on screen
     * (managed windows are global)"* — was true of a window floating over the
     * root and false of every window this WM promotes under `promoteInPlace`,
     * which is CONTAINED IN A TILE (C21). Rewriting `desktopIdx` left such a
     * window standing in the pane it was already in, on the page the user was
     * already looking at: *Move to desktop Views* appeared to do nothing at
     * all. Then *Back to tile* resolved against the new desktop's tree and
     * docked the content onto a page nobody was watching, so the window
     * vanished here and its table turned up over there.
     *
     * Three things move it for real. The index, so every later resolution
     * agrees. The HOME LEAF, re-pointed at a ground that exists in the
     * destination — without it the record names a leaf of the tree it just
     * left, and `_rehomeContainedWindows` would either skip it forever or
     * repair it to a pane on the wrong page. And a render, which is where the
     * element is taken off the page the window has left (or parented into its
     * new ground, when the destination is the desktop on screen).
     *
     * An ADOPTED window (`homeContainer`) keeps its own resolution: the
     * embedder owns the box it stands in, and re-pointing a leaf id it does not
     * read would be a change with no effect wearing the look of one.
     */
    moveWindowToDesktop(windowId, targetIdx) {
        const rec = this._windowToLeaf.get(windowId);
        if (!rec) return;
        if (rec.desktopIdx === targetIdx) return;
        this.desktops.ensureCount(targetIdx + 1);
        rec.desktopIdx = targetIdx;
        if (!rec.homeContainer && rec.homeLeafId) {
            const target = this.desktops.desktops[targetIdx]?.tree;
            // `|| null`, NEVER `|| rec.homeLeafId`. Falling back to the id it
            // already had keeps a leaf of the tree the window is LEAVING, and
            // `_rehomeContainedWindows` would then find that id perfectly alive
            // in the wrong tree and never repair it. Null means "not contained
            // anywhere", which the pass understands and which the repair below
            // fixes on the first render of the destination.
            rec.homeLeafId = target?.primaryLeafId() || null;
        }
        this.renderer.render();
        this._persist();
        this._notifyChange('window-moved');
    }

    /**
     * R8. Put a floated pane's tabs back into a leaf — ALL of them, in the
     * order they had, with the one that was showing still showing.
     *
     * Every dock goes through here, and that is the point: `bringBackWindow`,
     * a drop on a tile's body, a drop on an edge and the fall-through when the
     * named destination vanished are four routes to one question — *where do
     * these tabs go* — and four copies of the answer would disagree about the
     * third one within a release. A window promoted before R8 (or by
     * `_navigateWindow`, which never had tabs) carries no list, so `original`
     * is the fallback and the single-tab path reduces to exactly what this
     * replaced.
     *
     * `replace` is the difference between filling a leaf and joining one: a
     * fresh split leaf and a `fill` drop want the first tab to BECOME the
     * leaf's content, while a `tab` drop and "back to tile" append beside what
     * is already there.
     */
    _restoreTabs(tree, leafId, rec, { replace }) {
        if (!leafId) return false;
        const tabs = (Array.isArray(rec.tabs) && rec.tabs.length)
            ? rec.tabs
            : [{ kind: rec.original.kind, props: rec.original.props,
                 title: rec.original.title }];
        const active = Math.max(0, Math.min(tabs.length - 1, rec.activeTabIdx || 0));
        let firstIdx = -1;
        tabs.forEach((tab, i) => {
            const content = { kind: tab.kind, props: tab.props || {} };
            const title = tab.title || tab.kind || '';
            if (i === 0 && replace) {
                tree.setLeafContent(leafId, content, title);
                firstIdx = 0;
                return;
            }
            // `appendLeafTab` returns -1 for a panel leaf, which is the one
            // leaf that never grows tabs. Nothing docks onto a panel — the
            // probe refuses one and `bringBackWindow` targets the primary tile
            // — so this is a guard, not a path.
            const at = tree.appendLeafTab(leafId, content, title);
            if (at >= 0 && firstIdx < 0) firstIdx = at;
        });
        if (firstIdx < 0) return false;
        tree.setActiveLeafTab(leafId, firstIdx + active);
        tree.focus(leafId);
        return true;
    }

    _onManagedWindowClosed(winId, mountInfo) {
        const rec = this._windowToLeaf.get(winId);
        this._windowToLeaf.delete(winId);
        if (!rec) return;
        // R8. `rec.mountInfo` IS THE LIVE ONE. The window's mount changes when
        // its tab changes (`_mountWindowTab`) and when its content is replaced
        // in place (`openInWindow`), so the closure `_promote` captured at
        // build time names a mount that was torn down long ago — destroying it
        // twice while the CURRENT one is never destroyed at all, which is a
        // leaked page module with a `window` listener on it. `_navigateWindow`
        // still passes its own and it is the same object, so the argument
        // stays for the callers that have nothing else.
        try { (rec.mountInfo || mountInfo)?.destroy?.(); } catch {}
        try { rec.strip?.dispose(); } catch { /* never mounted, or already gone */ }
        const tree = this.desktops.desktops[rec.desktopIdx]?.tree;
        if (!tree) return;

        if (rec._demoting && rec._dock) {
            // C15. A DROP named its destination, so none of the primary-tile
            // reasoning below applies. A destination that vanished between the
            // release and the close (the tile was closed by a keystroke while a
            // choice menu was open) falls through to the primary tile rather
            // than dropping the content on the floor.
            const target = tree.get(rec._dock.leafId);
            if (target && target.kind === 'leaf') {
                const { mode, dir, before } = rec._dock;
                if (mode === 'tab') {
                    this._restoreTabs(tree, rec._dock.leafId, rec, { replace: false });
                } else if (mode === 'split') {
                    const newId = tree.split(rec._dock.leafId, dir);
                    if (newId) {
                        this._restoreTabs(tree, newId, rec, { replace: true });
                        // THE PREVIEW PROMISED HALF OF THAT TILE. `TileTree.split`
                        // delivers it only when it has to WRAP; when the parent
                        // split already runs this direction it INSERTS a sibling
                        // and gives it the average of the row's existing sizes
                        // (`tile_tree.js`, case 2), so a drop into a three-pane
                        // row hands the newcomer a third and shrinks everyone
                        // else. Halving the source's own weight and giving the
                        // other half to the new leaf makes the two panes split
                        // the space the source had — which is what was drawn.
                        _halveInto(tree, rec._dock.leafId, newId);
                        // `split` always appends the new leaf AFTER its source.
                        // A drop on the LEFT or TOP edge means the window
                        // belongs on that side, so the two swap places — the
                        // preview drew the left half and the left half is where
                        // it must land.
                        if (before) _swapSiblings(tree, rec._dock.leafId, newId);
                        tree.focus(newId);
                    }
                } else {
                    this._restoreTabs(tree, rec._dock.leafId, rec, { replace: true });
                }
            } else {
                this._restoreTabs(tree, tree.primaryLeafId(), rec, { replace: false });
            }
        } else if (rec._demoting) {
            // "Back to tile": the source tile was closed when the window was
            // promoted, so dock the (latest) content into the desktop's
            // primary tile as a new tab, spawning a tile when it has none.
            let pid = tree.primaryLeafId();
            let spawned = false;
            if (!pid) { pid = this._spawnContentLeaf(tree); spawned = true; }
            if (pid) {
                this._restoreTabs(tree, pid, rec, { replace: false });
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

    /** Post-show DOM hook: wire a right-click context menu on the topbar.
     *
     *  R7. IT USED TO INJECT A BUTTON HERE, and that is the whole of what
     *  changed. "Back to tile" was a fourth button squeezed left of Close,
     *  built by reaching into four of ManagedWindow's internal class names —
     *  the coupling C6 exists to avoid — and it sat next to a MAXIMIZE button
     *  that did the one thing a window lifted out of a tile has no use for.
     *  Now the maximize button IS "back to tile" (`onMaximize`, passed where
     *  the window is built), so the verb has one control instead of two and
     *  this hook has no markup of its own to keep in step.
     *
     *  Gone with it: the rule that hid MINIMIZE while the window was maximised.
     *  It existed because minimising a full-screen window strands it — nothing
     *  on screen points at it any more — and a window that cannot maximise
     *  cannot be in that state at all. `managed-window-maximized` (C16) still
     *  fires for everyone else, and `--suppressed` is still styled for the next
     *  consumer that needs to hide one of these. */
    _decorateManagedWindow(win, winId) {
        const topbar = win.element?.querySelector?.('.twm-managed-window__topbar');
        if (!topbar) return;

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

    // ══ R10. Adjacent start tiles are one start tile ═══════════════════
    /**
     * Merge every run of side-by-side START TILES into one.
     *
     * A start tile is a leaf holding the taxonomy ROOT — the pane a fresh
     * desktop opens with, and the pane `_seedHome` puts back when a tile is
     * emptied. It is not a document: it is the ground, the empty canvas, the
     * "nothing is open here" surface. So two of them side by side are ONE
     * surface with a splitter drawn through it for no reason, and the splitter
     * is worse than decoration — it offers to resize a boundary between two
     * things that are the same thing.
     *
     * This is deliberately NOT run on every tree change, and the reason is
     * `split()`: splitting a start tile seeds the new pane with the root kind
     * too (the never-empty-tile invariant), so a merge on every mutation would
     * undo an Alt+H the instant it happened. It runs where the product owner
     * put it — *"when a maximized (tiled) panel is window-ized, all adjacent
     * non-panel (start tile) tiles get merged to one"* — and is public so an
     * embedder that empties a pane its own way can ask for the same tidy-up.
     *
     * THREE THINGS ARE NEVER MERGED, and each one is a way to lose work:
     *
     *   - `panel:*` leaves. They are chrome, not content; the navigator is not
     *     a start tile and a panel BETWEEN two start tiles means those two are
     *     not adjacent.
     *   - A start tile with WINDOWS STANDING ON IT. The whole point of the
     *     surface is that things float on it, and closing the leaf takes its
     *     ground — and every window clamped to it — out of the document. When
     *     one of a pair is occupied the other merges INTO it; when both are,
     *     neither moves.
     *   - A start tile holding tabs, live or archived. `leaf.content.kind`
     *     names the ACTIVE tab only, and a pane whose other tabs are tables, or
     *     whose `pageTabs` archive holds the three tables a rail click put
     *     there, is a pane with work in it wearing a start tile's face.
     *
     * @param {TileTree} tree
     * @param {string|null} preferLeafId  the leaf to keep when a run is
     *   otherwise a free choice — the pane the caller just emptied, so the
     *   merged surface is the one the user is looking at.
     * @returns {number} how many leaves were absorbed.
     */
    _mergeStartTiles(tree, preferLeafId = null) {
        if (!tree) return 0;
        let absorbed = 0;
        // Pairwise, restarting after each close. `TileTree.close` splices the
        // parent's children AND may collapse the parent into ITS parent, so
        // every index in flight is stale the moment one leaf goes; restarting
        // is the cheap way to be right rather than the clever way to be wrong.
        // It terminates because each pass removes exactly one leaf.
        for (;;) {
            const pair = this._nextMergeablePair(tree, preferLeafId);
            if (!pair) break;
            const { split, keepIdx, dropIdx, keepId, dropId } = pair;
            // THE SPACE GOES WITH IT. `close` splices the size out of the row,
            // which hands it to every sibling in proportion; the merged pane is
            // supposed to occupy what the two of them occupied, so the keeper
            // takes it first.
            split.sizes[keepIdx] = (split.sizes[keepIdx] || 1) + (split.sizes[dropIdx] || 1);
            const hadFocus = tree.focusedLeafId === dropId;
            tree.close(dropId);
            // A LOOP THAT CANNOT END IS WORSE THAN A SPLITTER NOBODY WANTED.
            // The loop's termination argument is "each pass removes one leaf";
            // if `close` ever declines — a leaf that is not a leaf, a tree
            // mutated underneath us — that argument fails silently and the tab
            // freezes. Stopping is the correct answer to a merge that did not
            // happen.
            if (tree.nodes.has(dropId)) break;
            if (hadFocus) tree.focus(keepId);
            absorbed += 1;
        }
        return absorbed;
    }

    /** The first two adjacent start tiles that may be merged, and which of
     *  them survives. Null when there are none. */
    _nextMergeablePair(tree, preferLeafId) {
        for (const node of [...tree.nodes.values()]) {
            if (node.kind !== 'split') continue;
            // The snapshot above can name a split a previous pass collapsed.
            if (!tree.nodes.has(node.id)) continue;
            for (let i = 0; i < node.children.length - 1; i += 1) {
                const a = tree.get(node.children[i]);
                const b = tree.get(node.children[i + 1]);
                if (!this._isStartTile(a) || !this._isStartTile(b)) continue;
                const aHolds = this._paneHoldsWindows(a.id);
                const bHolds = this._paneHoldsWindows(b.id);
                if (aHolds && bHolds) continue;
                let keepIdx = i;
                if (bHolds) keepIdx = i + 1;
                else if (!aHolds && node.children[i + 1] === preferLeafId) keepIdx = i + 1;
                const dropIdx = keepIdx === i ? i + 1 : i;
                return { split: node, keepIdx, dropIdx,
                         keepId: node.children[keepIdx], dropId: node.children[dropIdx] };
            }
        }
        return null;
    }

    /** Is this leaf the empty ground and nothing else? See the three
     *  exclusions in `_mergeStartTiles`. */
    _isStartTile(leaf) {
        if (!leaf || leaf.kind !== 'leaf') return false;
        const kind = leaf.content?.kind;
        if (!kind || kind !== this.taxonomy.root) return false;
        if (PANEL_KINDS.has(kind) || kind === PLACEHOLDER_KIND) return false;
        if ((Array.isArray(leaf.tabs) ? leaf.tabs.length : 0) > 1) return false;
        for (const page of Object.values(leaf.pageTabs || {})) {
            if (Array.isArray(page?.tabs) && page.tabs.length) return false;
        }
        return true;
    }

    /**
     * Does anything float on this pane?
     *
     * Two sources, because there are two kinds of window and the WM only knows
     * about one of them. `homeLeafId` is set for a window this WM contained in
     * its own pane (C21); an EMBEDDER's windows — a canvas pane that opens its
     * own `ManagedWindow` against the pane's ground — are not in
     * `_windowToLeaf` at all, and the only honest way to see them is to look.
     * The DOM answer covers both, and covers a window whose record has been
     * dropped but whose element is still standing.
     */
    _paneHoldsWindows(leafId) {
        for (const [, rec] of this._windowToLeaf) {
            if (rec.homeLeafId === leafId) return true;
        }
        const el = this.renderer.leafEl?.(leafId);
        return !!el?.querySelector?.('.twm-managed-window');
    }

    /** R10, as a verb an embedder can use. Merges, then repaints and persists
     *  — the promote path calls `_mergeStartTiles` directly because it is
     *  already going to do all three. */
    mergeStartTiles(preferLeafId = null) {
        const tree = this._tree();
        const absorbed = this._mergeStartTiles(tree, preferLeafId);
        if (!absorbed) return 0;
        this._canonicalize(tree, this.desktops.active());
        this.renderer.render();
        this._persist();
        this._notifyChange('start-tiles-merged');
        return absorbed;
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

    /**
     * Remove a desktop — AND RE-INDEX THE WINDOWS, which is the half that was
     * missing.
     *
     * `desktopIdx` on a window record is an ARRAY INDEX into `desktops`, so a
     * splice silently re-points every record above the removed one at its
     * neighbour. Nothing threw and nothing looked wrong: the window kept
     * floating, and the next *Back to tile* resolved `rec._dock` against the
     * WRONG TREE. `_onManagedWindowClosed` reads `desktops[rec.desktopIdx]`,
     * finds a tree that never held this window, and its `if (!tree) return`
     * closes the window and drops the content on the floor — staged edits
     * included, with no error and nothing on screen to say a table was lost.
     *
     * Windows homed on the desktop being removed do not die with it. The
     * ruling is that a tile operation may move a window and never destroy it,
     * and removing a desktop is the largest tile operation there is: they come
     * across to the desktop that ends up active, re-homed onto its ground by
     * `_rehomeContainedWindows` on the render below.
     */
    removeDesktop(idx) {
        const m = this.desktops;
        if (m.desktops.length <= 1) return false;
        if (idx < 0 || idx >= m.desktops.length) return false;
        m.desktops.splice(idx, 1);
        // THE SPLICE MOVES THE ACTIVE DESKTOP TOO, and the clamp below never
        // said so. Removing a desktop BELOW the one you are on shifts it down
        // by one, so an unchanged `activeIdx` then names its neighbour: the
        // desktop you were working in is replaced on screen by the next one
        // along, the bar highlights the wrong button, and the wrong index is
        // persisted. The clamp only ever caught removing the LAST desktop.
        // Pre-existing, and load-bearing for the loop below, which reads
        // `activeIdx` to decide where the orphaned windows go.
        if (idx < m.activeIdx) m.activeIdx -= 1;
        if (m.activeIdx >= m.desktops.length) m.activeIdx = m.desktops.length - 1;
        // AFTER the splice and AFTER `activeIdx` is repaired, so the survivors
        // resolve against the array the rest of this method uses.
        for (const [, rec] of this._windowToLeaf) {
            if (rec.desktopIdx === idx) {
                rec.desktopIdx = m.activeIdx;
                // ONLY A WINDOW THAT WAS ALREADY CONTAINED, which is what
                // `rec.homeLeafId` says and what `moveWindowToDesktop`'s guard
                // tests. `!rec.homeContainer` alone also catches a FREE-FLOATING
                // window — `_navigateWindow`'s, which has neither field — and
                // handing one a `homeLeafId` silently converts it into a
                // pane-contained window: it jumps into a tile, can no longer be
                // dragged outside it, and is then removed from the document by
                // the desktop rule the first time you switch pages.
                if (!rec.homeContainer && rec.homeLeafId) {
                    rec.homeLeafId = m.active().tree.primaryLeafId() || null;
                }
            } else if (rec.desktopIdx > idx) {
                rec.desktopIdx -= 1;
            }
        }
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
        // C20. IT DESTROYS A LEAF, SO IT ANSWERS TO THE SAME VETO `closeFocused`
        // does. A move is not a close from the pane's point of view, but it is
        // exactly a close from the PAGE's: this was the fourth door out of a
        // content veto, and the one nobody thought to look at because its label
        // says "Move".
        const closeChrome = this.renderer?.leafChrome?.(focused.id)?.close;
        if (closeChrome === false || closeChrome?.disabled === true) return;
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
        // THE SAME NEVER-EMPTY-CONTENT INVARIANT `closeFocused` KEEPS, and it
        // was missing here. `!tree.rootId` above only catches a tree with
        // nothing left at all; with a panel open the root survives and the page
        // is left showing chrome and no ground — so the windows that were
        // standing on the moved pane had nowhere to be re-homed to.
        if (!tree.leaves().some((l) => !String(l.content?.kind || '').startsWith('panel:'))) {
            const spawned = this._spawnContentLeaf(tree);
            if (spawned) this._seedHome(tree, spawned);
        }
        this._canonicalize(tree, this.desktops.active());
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
        if (action === 'to-window') {
            // R9. `floatTabAsWindow` renders, persists and notifies on its own
            // — it is the same promote path the pane's chrome uses — so there
            // is deliberately nothing after it here.
            this.floatTabAsWindow(leafId, data.idx);
            return;
        }
        if (action === 'drop-into') {
            // C33. The tab-drop's one door into the tree. Fired against the
            // SOURCE leaf, because `_leafTabAction`'s first argument is always
            // the leaf whose tab is being acted on — the destination travels in
            // `data.target`, which is a `tabDropProbe` answer.
            //
            // Like `to-window` above, `moveTabInto` renders, persists and
            // notifies on its own, so there is deliberately nothing after it.
            this.moveTabInto(leafId, data.idx, data.target);
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
            // C15, and this is the SECOND of the two places the WM builds a
            // window. Alt+N and "Open in new window" produce a window that is
            // every bit as dockable as a promoted one, and a window that can be
            // dragged onto a tile in one case and not the other is a rule
            // nobody can learn.
            snap: this.snapPromotion,
            snapController: this.snapPromotion ? this._snapController() : null,
            // R1. THE PANE IS A BOX WITH `overflow: hidden`. A window contained
            // to one (C21) cannot be dragged a single pixel outside it, so
            // "drag a window from one tile to another" — the gesture all three
            // drop behaviours are built on — was not merely awkward, it was
            // invisible. For the length of a drag the window is re-parented
            // here, to the root every tile is inside; on release it goes back
            // into a pane, either the one it was dropped on or the one it came
            // from. Resolved per drag: the root outlives any tile, and a tile
            // grabbed once does not survive its own repaint.
            dragHost: () => this.rootEl,
            dragBounds: () => this._tileBounds(),
            // R7. MAXIMISE MEANS BACK TO TILE. This window came OUT of the
            // tree; the useful thing to do with it is put it back, and filling
            // the screen with it is the one gesture that makes putting it back
            // harder. So the maximize button docks — and the separate demote
            // button the WM used to inject beside it is gone, because two
            // buttons for one verb is how you get a chrome nobody reads.
            onMaximize: () => this.bringBackWindow(winId),
            maximizeIcon: 'close_fullscreen',
            maximizeTitle: 'Back to tile',
            onClose: () => this._onManagedWindowClosed(winId, mountInfo),
        });
        // DECORATED ONCE, below, after the record exists. It was called here as
        // well, so every Alt+N window carried two topbar context-menu handlers
        // — and, until R7 removed it, two "back to tile" buttons.
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
        const items = [];
        // R9. THE PER-TAB VERB LIVES ON THE TAB.
        //
        // Floating one tab out is what the pane's chrome button used to do, and
        // it was the wrong home for it: the button is on the PANE and named
        // "float this pane as a window", so it now floats the pane (R8) and
        // this is where the single-tab version went. A user who wants one of
        // three tables in a window right-clicks that table's tab, which is
        // where every other per-tab verb already is.
        //
        // Offered above the close verbs, and separated from them: it is the
        // only item here that does not destroy something, and a menu whose
        // first four entries all close things teaches the eye to skip it.
        const tab = tabs[idx];
        if (tab && !String(tab.kind || '').startsWith('panel:')
                && tab.kind !== PLACEHOLDER_KIND) {
            items.push({ label: 'Open in a window', icon: 'web_asset', action: 'to-window' });
            items.push({ separator: true });
        }
        items.push({ label: 'Close tab', icon: 'close', action: 'close' });
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

/** R8. A leaf's tabs as the plain specs a window record holds — deep enough
 *  that editing one afterwards cannot reach back into the tree, which matters
 *  because a floated tab keeps being edited (`openInWindow` renames it) while
 *  the leaf it came from is still alive. A leaf with no tab list at all is
 *  pre-tabs data; its mirrored `content`/`title` are the one tab it has. */
function _leafTabSpecs(leaf) {
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
    if (tabs.length) {
        return tabs.map((t) => ({
            kind: t.kind, props: { ...(t.props || {}) },
            title: t.title || t.kind || '',
        }));
    }
    return [{
        kind: leaf.content.kind,
        props: { ...(leaf.content.props || {}) },
        title: leaf.title || leaf.content.kind || '',
    }];
}

/** One half of a rectangle, in the same viewport pixels it arrived in. This is
 *  what makes the drop preview honest: the rectangle a `left` drop on a tile
 *  produces is half of THAT TILE, which — when the tile is itself half the
 *  layer — is a quarter of the layer, and the preview says so. */
function _halfOf(r, side) {
    const w = Math.round(r.width / 2);
    const h = Math.round(r.height / 2);
    switch (side) {
        case 'left':   return { left: r.left,         top: r.top,     width: w,       height: r.height };
        case 'right':  return { left: r.left + r.width - w, top: r.top, width: w,     height: r.height };
        case 'top':    return { left: r.left,         top: r.top,     width: r.width, height: h };
        case 'bottom': return { left: r.left, top: r.top + r.height - h, width: r.width, height: h };
        default:       return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
}

/** Give `newId` half of `sourceId`'s share of their shared split, leaving every
 *  other pane in the row untouched. This is what "the preview showed half of
 *  that tile" means once the split is an insertion rather than a wrap. */
function _halveInto(tree, sourceId, newId) {
    const src = tree.get(sourceId);
    if (!src) return false;
    const parent = tree.get(src.parentId);
    if (!parent || parent.kind !== 'split') return false;
    const i = parent.children.indexOf(sourceId);
    const j = parent.children.indexOf(newId);
    if (i < 0 || j < 0) return false;
    // The wrap case already splits a fresh two-child node evenly; only the
    // insertion case has a size to correct, and correcting an even one is a
    // no-op anyway.
    const share = (parent.sizes[i] ?? 1) / 2;
    parent.sizes[i] = share;
    parent.sizes[j] = share;
    return true;
}

/** Swap two sibling leaves inside their shared split. `TileTree.split` always
 *  appends, and "the window goes on the left" is a legitimate outcome of a
 *  drop; this is the one-line difference between the two. */
function _swapSiblings(tree, aId, bId) {
    const a = tree.get(aId);
    const b = tree.get(bId);
    if (!a || !b || a.parentId !== b.parentId) return false;
    const parent = tree.get(a.parentId);
    if (!parent || parent.kind !== 'split') return false;
    const i = parent.children.indexOf(aId);
    const j = parent.children.indexOf(bId);
    if (i < 0 || j < 0) return false;
    parent.children[i] = bId;
    parent.children[j] = aId;
    // `sizes` IS PARALLEL TO `children` — `makeSplit` builds them together and
    // `TileTree.split` splices both at the same index. Swapping one and not the
    // other does not swap two panes, it makes them trade widths in place, which
    // looks like the drop landing on the correct side and then resizing itself
    // for no reason. `TileTree.moveDir` swaps both; so does this.
    const size = parent.sizes[i];
    parent.sizes[i] = parent.sizes[j];
    parent.sizes[j] = size;
    return true;
}

