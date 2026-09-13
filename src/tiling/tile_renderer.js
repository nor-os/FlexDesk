/**
 * tile_renderer.js — maps a TileTree into nested flex containers, with
 * resize splitters between siblings and a chrome strip per leaf.
 *
 * The renderer keeps a small per-leaf DOM cache so content factories
 * mount exactly once per (kind, props) pair — switching the focused
 * leaf or resizing doesn't re-mount tabs / pages.
 *
 * ── C22. TWO TAB LAYOUTS, AND THE TREE KNOWS ABOUT NEITHER ────────────────
 *
 * A leaf's tabs live in the TREE (`Leaf: { tabs, activeTabIdx }`) and are the
 * source of truth; `content`/`title` mirror `tabs[active]`. Where the strip is
 * DRAWN, and what it looks like, is therefore a rendering decision and nothing
 * else — which is why both layouts share one tab model, one action vocabulary
 * (`switch` / `close` / `move` / `menu` / `open-menu`, all through
 * `ctx.onLeafTabAction`) and one set of tree mutations in the WM.
 *
 *   `bottom` — the framework's own spreadsheet strip under the tile body.
 *              THE DEFAULT, and it stays the default: an existing embedder
 *              upgrading must not find its panes rearranged.
 *   `top`    — `NotebookTabBar` (`../editor/notebook_tab_bar.js`), the editor
 *              tab strip, mounted BETWEEN the chrome and the body. The chrome
 *              is the pane's identity — its glyph, its title, its verbs — and
 *              the tabs are its contents, so the tabs go under it, not over.
 *
 * The tab bar is reused rather than reimplemented. It already has the
 * behaviours a top strip is expected to have — drag-to-reorder, a scrolling
 * overflow, close buttons, dirty dots — and a second implementation of them
 * here is a second set of the same bugs.
 *
 * ── The layout is also readable and writable as an ATTRIBUTE ──────────────
 *
 * `tabLayout` is a `createShell` option like `snapPromotion` and
 * `promoteInPlace`, but unlike those it is something a USER may reasonably
 * change while looking at the thing it changes. An embedder's settings pane
 * holds no renderer reference — it holds, at most, the element it handed to
 * `createShell` — so the renderer mirrors the option onto its own root as
 * `data-twm-tabs` and OBSERVES it. Setting that attribute on the root element
 * is then a complete, reference-free way to switch layout live, and the same
 * attribute is the hook a stylesheet keys off. `setTabLayout()` is the direct
 * route for anyone who does hold the renderer.
 *
 * Switching is deliberately cheap: only the strip is rebuilt and the tab bar
 * element is MOVED between its two positions. The body is never detached, so
 * no content factory is unmounted and nothing mounted in a tile — a grid with
 * staged edits, an editor with an undo stack — notices that it happened.
 *
 * ── C33. A TAB DRAGGED INTO A TILE ───────────────────────────────────────
 *
 * *"I would like to be able to drag & drop tabs into tiles, too."* A tab could
 * already be dragged WITHIN its own strip, and a WINDOW could already be
 * dropped onto a tile; between the two there was nothing.
 *
 * ══ TWO DRAG MECHANISMS, AND THEY CANNOT BE ONE GESTURE ═════════════════
 *
 * This codebase drags things in two incompatible ways, and the choice here was
 * made for us. Tab reorder is NATIVE HTML5 DRAG-AND-DROP — `draggable="true"`
 * plus `dragstart`/`dragover`/`drop` — in both layouts: the `top` strip gets it
 * from the shared `DragReorder`, the `bottom` strip hand-rolls the same three
 * events. Window snapping is POINTER EVENTS
 * (`../ui/components/managed_window.js`, `_dragState` with a `pointermove`
 * listener on `document`). **Once a native drag begins the browser stops
 * dispatching `pointermove` for its whole duration**, so a tab drag can never
 * reach the pointer-driven snap controller, and a pointer-driven tab drag would
 * be a second mechanism sitting beside the reorder that already works. So: this
 * is HTML5 DnD, and it extends the gesture that exists rather than competing
 * with it.
 *
 * ══ THE GEOMETRY IS SHARED ANYWAY ═══════════════════════════════════════
 *
 * What could not be shared is the transport; what MUST be shared is the answer.
 * `wm.tabDropProbe` (R18) runs the same zone matrix a window drop runs, through
 * the same `_dropZoneFor` tail (R17) — so a 28px edge means SPLIT and a centre
 * means TAB-or-FILL for both, and the vocabulary is learned once. Product
 * owner, 2026-08-27: the edge drop splits, "reusing the window snap-zone
 * vocabulary".
 *
 * ══ THE SINGLE-TAB TILE HAS NO STRIP, SO THE CHROME IS THE HANDLE ═══════
 *
 * Both layouts hide the bar below two tabs (`_renderTabBar`), which is the
 * common case — one table in one tile — so a feature that needs a tab strip to
 * grab is a feature most tiles cannot offer. Product owner, 2026-08-27: the
 * tile chrome / breadcrumb is the drag source for a single-tab leaf. With one
 * tab there is no ambiguity to resolve — "move this tab" and "move what is in
 * this pane" name the same thing — which is exactly why it is limited to that
 * case: on a multi-tab leaf the strip already names each tab individually and a
 * chrome drag would have to guess which one was meant.
 *
 * IT DOES NOT COST THE CHROME ITS EXISTING GESTURES — BUT IT DID, AND THE
 * PARAGRAPH THAT USED TO SIT HERE IS WHY. It read: the pull "loses cleanly"
 * to a native drag, and "is also still reachable, on every part of the chrome
 * a single-tab leaf's title does not cover". That is a description of
 * `draggable` on the TITLE. `_syncChromeDragSource` sets it on the CHROME —
 * the whole strip — so there was no part left over, and since both layouts
 * hide the tab strip below two tabs, a single-tab leaf is the ORDINARY tile
 * rather than an edge case. Pull-down-to-float was dead application-wide, and
 * the sentence saying it was fine sat in this file the whole time.
 *
 * The two gestures are separated by DIRECTION now, through one predicate
 * (`_isDownwardPull`) that both of them read: a downward grab is the float,
 * and `dragstart` refuses the native drag so the pointer goes back to the
 * pull; anything else is the tab drag and is untouched. The double-click
 * cannot collide with either — a `dblclick` carries no movement, so no drag
 * ever starts.
 *
 * A CLAIM ABOUT A BROWSER NEEDS A BROWSER. Nothing in this repository's suites
 * can begin a native drag — jsdom dispatches only the drag events a test hands
 * it — so this collision was invisible to every gate on both sides and stayed
 * that way through review. It was settled by driving real mouse input at
 * Edge 152 over CDP: as shipped, a 140px pull on a table tile's chrome gives
 * `dragstart`, `pointercancel`, `dragend` and no window; with the refusal,
 * `pointermove` resumes and the pull fires at 26px; sideways and diagonal
 * grabs still drag.
 *
 * A pane whose content VETOED `promote` (C20) is not a drag source either, and
 * that is one rule rather than two: a tab you may not lift out of its pane is a
 * tab you may not drag into another one. It is what keeps an embedder's master
 * tile — the ground floating windows stand on — from being dragged away.
 *
 * ══ THE DRAG STATE LIVES ON THE RENDERER ════════════════════════════════
 *
 * `_tabDrag` is an instance field, not a per-leaf closure, and that is
 * structural. The bottom strip's existing reorder keeps `dragFromIdx` in a
 * closure built per leaf render, so leaf B's handlers cannot see that leaf A
 * started a drag — which is fine for a reorder that begins and ends in one
 * strip and useless for one that crosses tiles.
 *
 * The identity has to live there for a second reason: under the HTML5 protected
 * mode `dataTransfer.getData()` returns the empty string for every event except
 * `drop`, so the source leaf CANNOT be read while deciding whether to arm.
 * `TILE_TAB_MIME` is therefore a type-only marker — an admission ticket, not a
 * message — and everything else is read off `_tabDrag`.
 *
 * ══ AND THE LISTENERS ARE BOUND ONCE, ON THE ROOT ═══════════════════════
 *
 * `render()` does `this.root.innerHTML = ''`, so a listener attached to a leaf
 * wrap during a repaint-heavy gesture is gone by the next frame; the
 * constructor's `mousedown` is the pattern and these follow it. For the same
 * reason NOTHING on the `dragover` path may call `render()` — rebuilding the
 * wrap that holds the drag source aborts the native drag, and the DOM
 * afterwards reads perfectly correct, which is the exact shape of the
 * five-times-reported `mousedown`-repaint defect one mechanism over.
 *
 * OUT OF SCOPE, deliberately and in writing: dragging a tab out of a FLOATING
 * WINDOW's strip (its tabs live in the WM's window record, not in the tree, so
 * the source policy is a different function's); dropping on empty space to
 * float a window (in HTML5 DnD "dropped on nothing" is `dragend` with no
 * `drop`, which is also what Escape produces, so it would float a window every
 * time a user changed their mind); and crossing DESKTOPS (only the active one
 * is rendered, so there is nothing to hit).
 */

import { NotebookTabBar } from '../editor/notebook_tab_bar.js';

const SPLITTER_PX = 4;
/** The two tab layouts, and the framework's default. `bottom` is the default
 *  because it is what every existing embedder already renders. */
const TAB_LAYOUTS = ['bottom', 'top'];
const DEFAULT_TAB_LAYOUT = 'bottom';

/** Anything that is not one of the two layouts is the default rather than an
 *  error: this value arrives from a DOM attribute and from persisted user
 *  settings, and neither is a place to throw. */
function _normalizeTabLayout(value) {
    return TAB_LAYOUTS.includes(value) ? value : DEFAULT_TAB_LAYOUT;
}

/**
 * `NotebookTabBar`'s vocabulary is FILE PATHS, and a tile tab is not a file.
 *
 * The path is only ever an identity string to it — the key its reorder uses,
 * the value it compares against `activeFilePath`, the selector it renames by —
 * so a leaf's tab INDEX serves, and is the one identity a tab list is
 * guaranteed to have (the tree gives tabs no ids and this renderer may not
 * add any).
 *
 * The `builtin://` prefix is not decoration. `#beginInlineRename` refuses to
 * start on a path with it (`notebook_tab_bar.js:402`), which is exactly what a
 * tile tab needs: double-click rename would rename a TAB, and a tab is a view
 * of an entity whose name lives somewhere this renderer cannot reach. A rename
 * that silently does nothing is worse than no rename, and using the component's
 * own guard beats disabling the gesture from outside.
 */
function _tabKey(idx) { return `builtin://tab/${idx}`; }

function _tabKeyIndex(key) {
    const n = Number(String(key ?? '').replace('builtin://tab/', ''));
    return Number.isInteger(n) && n >= 0 ? n : -1;
}
/** How far the chrome must be pulled DOWN before the pane lifts out as a
 *  floating window. Far enough that focusing a tile by clicking its header
 *  never becomes one by accident. */
const TILE_LIFT_PX = 24;
/** WHAT IS NOT A GRIP, for both of the chrome's float gestures.
 *
 *  A tile's chrome is a grip with controls sitting on it — the split, float
 *  and close buttons on the right, whatever the content contributed on the
 *  left, and (defensively; the strip is a sibling of the chrome today, not a
 *  child) a tab. Neither the downward pull nor the double-click may fire when
 *  the press landed on one of those.
 *
 *  ONE CONSTANT, TWO LISTENERS, and that is the point of writing it down
 *  rather than repeating the selector: two doors onto one verb that disagree
 *  about where the door is are worse than one door. A button added to this
 *  strip later must become inert under BOTH gestures at once, and it cannot
 *  do that if each of them carries its own copy of the rule. */
const CHROME_NO_FLOAT = 'button, .twm-leaf__tab';

/**
 * IS THIS GESTURE THE DOWNWARD PULL? Asked in TWO places that must not be
 * allowed to disagree, which is the only reason it is a function.
 *
 * The pull asks it of every `pointermove`, to decide whether 24px of travel
 * has become a float. `_syncChromeDragSource`'s `dragstart` asks it of the
 * first few pixels, to decide whether to REFUSE the native drag and leave the
 * pointer to the pull. Two answers to "which way is this going" would produce
 * a gesture that is neither: the drag declines, the pull never accepts, and
 * the chrome does nothing at all.
 *
 * `sideways <= down` rather than `<`, so a gesture exactly on the diagonal
 * belongs to the pull in both readers — the pull's own test has always been
 * `sideways > down` rejects, so this is the same boundary written once.
 */
function _isDownwardPull(down, sideways) {
    return down > 0 && sideways <= down;
}

/**
 * C33. THE MARKER THAT SAYS "THIS DRAG IS ONE OF OURS", AND NOTHING ELSE.
 *
 * It carries the literal string `'1'` because it carries no information at all.
 * Under the HTML5 protected-mode rules `dataTransfer.getData()` answers the
 * empty string for every event of a drag except `drop`, and only `types` is
 * readable during `dragenter`/`dragover` — which is precisely when the decision
 * to arm a drop zone has to be made. So the source leaf and tab index travel in
 * `TileRenderer._tabDrag` and this type is an admission ticket.
 *
 * Encoding the leaf id into the type NAME (`…/tile-tab/leaf-7`) would make it
 * readable on dragover and is the trap: `types` would then be unbounded, every
 * consumer would have to parse it, and the string would become a wire format
 * nobody declared. One constant, one meaning.
 */
export const TILE_TAB_MIME = 'application/x-twm-tile-tab';

/** Does this drag carry a tile tab? The ONLY admission test available during
 *  `dragover`, per the note on `TILE_TAB_MIME`. */
function _isTileTabDrag(e) {
    try { return !!e.dataTransfer?.types?.includes(TILE_TAB_MIME); }
    catch { return false; }
}

export class TileRenderer {
    /** C33. Readable from a consumer that holds only the renderer — the Tables
     *  drop suite drives real drag events and has to build a `dataTransfer`
     *  stub that this renderer will admit. */
    static get TAB_MIME() { return TILE_TAB_MIME; }

    constructor({ root, tree, content, ctx, onFocusChange, onAfterRender,
                  tabLayout = null }) {
        if (!content || typeof content.mount !== 'function') {
            throw new Error('TileRenderer: a content registry is required');
        }
        this.root = root;
        this.tree = tree;
        // Shell-scoped kind -> factory table (see content_registry.js).
        this.content = content;
        this.ctx = ctx || {};
        this.onFocusChange = onFocusChange || (() => {});
        /** Fired after every repaint, once the tree's DOM is settled.
         *
         *  A LEAF'S WRAP IS REBUILT whenever its content key changes — a tab
         *  added, a tab removed, the leaf re-seeded — and anything an embedder
         *  parented INTO that wrap goes with the old one. A window contained in
         *  a pane (C21) is exactly that: promote a second tab out of a
         *  two-tab leaf and the first promotion's window is silently removed
         *  from the document, because its container was the wrap that the
         *  second promotion's re-render replaced.
         *
         *  The renderer cannot know about windows, so it says "I have
         *  repainted" and the WM re-homes what it owns. */
        this.onAfterRender = onAfterRender || (() => {});
        // leafId -> { wrapEl, bodyEl, chromeEl, content, kindKey, tabStrip }
        this._leafCache = new Map();
        this._drag = null;
        /** C33. The tab currently being carried: `{leafId, idx, el}`, or null.
         *  On the RENDERER rather than in a per-leaf closure — see the header:
         *  the bottom strip's `dragFromIdx` is per leaf render, and a drag that
         *  crosses tiles needs an identity leaf B's handlers can read. */
        this._tabDrag = null;
        /** The chrome pull-down's live pointer — `{startX, startY, x, y}` —
         *  while a press is held on a leaf chrome, else null. Read by the
         *  `dragstart` in `_syncChromeDragSource`, which has to decide whether
         *  this gesture is the float and get out of its way. Here rather than
         *  in the pull's own closure for `_tabDrag`'s reason: the reader is a
         *  method bound to a different element. */
        this._chromePull = null;
        /** The last `wm.tabDropProbe` answer, stashed on `dragover` because
         *  `drop` must not re-probe: the pointer can be one pixel outside the
         *  zone the preview drew, and the rectangle drawn is the rectangle the
         *  drop delivers (C15). */
        this._tabDropProbe = null;
        this._tabDropPreviewEl = null;
        /** Set by `createShell().dispose()`. A renderer whose shell is gone must
         *  not paint: an embedder that rebuilds its shell over the same root
         *  would otherwise find a stale callback repainting the previous tree
         *  on top of the live one, and the two would fight over one element. */
        this.disposed = false;
        this.root.classList.add('twm-root');
        // C22. The ATTRIBUTE WINS over the config when it is already set, and
        // that order is the point: an embedder that persists this per user has
        // its answer before `createShell` is called, on the element it owns,
        // and does not have to race the shell's construction to apply it.
        this.tabLayout = _normalizeTabLayout(
            this.root.dataset?.twmTabs ?? tabLayout ?? DEFAULT_TAB_LAYOUT);
        if (this.root.dataset) this.root.dataset.twmTabs = this.tabLayout;
        // …and stays live. `setTabLayout` writes the attribute back, so this
        // fires once with nothing to do rather than looping.
        this._layoutObserver = typeof MutationObserver === 'function'
            ? new MutationObserver(() => this.setTabLayout(this.root.dataset?.twmTabs))
            : null;
        this._layoutObserver?.observe(this.root,
            { attributes: true, attributeFilter: ['data-twm-tabs'] });
        this.root.addEventListener('mousedown', this._onMouseDown.bind(this));
        // C33. ON THE ROOT, IN THE CONSTRUCTOR, FOR THE SAME REASON THE
        // `mousedown` ABOVE IS. `render()` clears the root, so a listener bound
        // to a leaf wrap is a listener that survives until the next repaint —
        // and a drag is exactly the situation in which repaints happen.
        this.root.addEventListener('dragover', this._onTabDragOver.bind(this));
        this.root.addEventListener('drop', this._onTabDrop.bind(this));
        this.root.addEventListener('dragleave', this._onTabDragLeave.bind(this));
        // `dragend` FIRES ON THE SOURCE AND IS THE ONLY GUARANTEED END. A drag
        // cancelled with Escape, or released over a window that refused it,
        // produces `dragend` and no `drop` at all — so every scrap of painted
        // state is torn down here rather than in the drop.
        this.root.addEventListener('dragend', this._onTabDragEnd.bind(this));
    }

    render() {
        if (this.disposed) return;
        // Detaching a wrap (remove() then re-append() in `_mount`) wipes
        // `scrollTop` on every scrollable descendant of that wrap.
        // Snapshot per-leaf so we can restore after re-attach — keyed
        // by element refs that survive the detach.
        const savedScrolls = new Map(); // leafId -> [{el, top}, …]
        for (const [leafId, entry] of this._leafCache.entries()) {
            const snap = [];
            entry.wrapEl.querySelectorAll('*').forEach((el) => {
                if (el.scrollTop > 0 || el.scrollLeft > 0) {
                    snap.push({ el, top: el.scrollTop, left: el.scrollLeft });
                }
            });
            savedScrolls.set(leafId, snap);
            entry.wrapEl.remove();
        }
        // R13. A WINDOW PARENTED TO THE ROOT IS NOT A TILE, AND IS NOT THE
        // RENDERER'S TO THROW AWAY. `innerHTML = ''` below is indiscriminate —
        // it destroys every direct child — and the window manager parents
        // floating windows here deliberately: FOR THE LENGTH OF EVERY DRAG
        // (`dragHost`, R1), which is the live route and not a rare one, since a
        // repaint during a drag needs nothing more exotic than the drag itself
        // changing focus or a splitter moving. It was also permanent for a
        // window snapped to fill the layer; R14 removed that mode — the top
        // edge docks now — but the drag remains, and a consumer calling the
        // public `toggleMaximize({claimable: false})` on a window the WM has
        // left on its drag host puts one up here for good. Any repaint while a
        // window was up here deleted its element silently: no error, nothing
        // thrown, and a `ManagedWindow` object still perfectly alive with
        // nothing on screen — the same shape of bug as the leaf wraps above,
        // which is why they are detached and re-attached too rather than merely
        // skipped. The tiles have to be rebuilt around them.
        const floats = [...this.root.children].filter((el) =>
            el.classList?.contains('twm-managed-window')
            || el.classList?.contains('twm-managed-window__backdrop'));
        for (const el of floats) el.remove();
        this.root.innerHTML = '';
        const tree = this.tree;
        if (!tree.rootId) {
            const empty = document.createElement('div');
            empty.className = 'twm-empty';
            empty.textContent = 'Empty desktop — Ctrl+K to open something.';
            this.root.appendChild(empty);
            this._cleanCache(new Set());
            // An empty desktop is still a desktop a window can be floating
            // over, and it is the one branch that returns early.
            for (const el of floats) this.root.appendChild(el);
            return;
        }
        const liveLeafIds = new Set();
        this._mount(tree.rootId, this.root, liveLeafIds);
        this._cleanCache(liveLeafIds);
        // LAST, and before `onAfterRender` — which is where the WM re-homes
        // the contained ones into their rebuilt wraps, and it can only move an
        // element that is still in the document.
        for (const el of floats) this.root.appendChild(el);
        this._updateFocusClasses();

        // Restore scrolls — once synchronously and once next frame so
        // any layout reflow between detach/reattach doesn't leave the
        // browser's clamped value in place.
        const restore = () => {
            for (const [leafId, snap] of savedScrolls) {
                if (!this._leafCache.has(leafId)) continue;
                for (const { el, top, left } of snap) {
                    if (el.isConnected) {
                        el.scrollTop = top;
                        el.scrollLeft = left;
                    }
                }
            }
        };
        restore();
        requestAnimationFrame(restore);
        try { this.onAfterRender(); }
        catch (err) { console.error('[tile-renderer] onAfterRender threw', err); }
    }

    /** Unmount everything and stop painting. `dispose()` on the shell calls
     *  this: `root.innerHTML = ''` detaches DOM without telling a single content
     *  factory, so a page module that installed a `window` listener or an
     *  interval keeps both, invisibly, for the life of the tab. */
    destroy() {
        this._layoutObserver?.disconnect();
        this._layoutObserver = null;
        // C33. The drop preview is parented to `document.body`, not to the
        // root, so `_cleanCache` cannot reach it: a shell torn down mid-drag
        // would leave a blue rectangle painted over the page with nothing left
        // that knows how to remove it.
        this._clearTabDropPreview();
        this._tabDrag = null;
        this._tabDropProbe = null;
        this._cleanCache(new Set());
        this.disposed = true;
    }

    _cleanCache(liveSet) {
        for (const [leafId, entry] of [...this._leafCache.entries()]) {
            if (!liveSet.has(leafId)) {
                try { entry.content?.destroy?.(); } catch (_) {}
                // C22. The top strip is a COMPONENT, not markup: it holds a
                // DragReorder with container listeners and a context menu
                // parented to `document.body`. Dropping the element it lives in
                // leaves both, invisibly, for the life of the page — the same
                // reason `destroy()` exists on the content above it.
                this._disposeTabStrip(entry);
                entry.wrapEl.remove();
                this._leafCache.delete(leafId);
            }
        }
    }

    _mount(nodeId, parentEl, liveSet) {
        const node = this.tree.get(nodeId);
        if (!node) return;
        if (node.kind === 'leaf') {
            liveSet.add(node.id);
            const el = this._leafEl(node);
            parentEl.appendChild(el);
            return;
        }
        // Split node — flex container with N children + N-1 splitters.
        const split = document.createElement('div');
        split.className = `twm-split twm-split--${node.dir}`;
        split.dataset.splitId = node.id;
        parentEl.appendChild(split);
        const total = node.sizes.reduce((a, b) => a + b, 0) || node.children.length;
        node.children.forEach((cid, i) => {
            const slot = document.createElement('div');
            slot.className = 'twm-slot';
            const frac = (node.sizes[i] || 1) / total;
            slot.style.flex = `${frac} ${frac} 0`;
            split.appendChild(slot);
            this._mount(cid, slot, liveSet);
            if (i < node.children.length - 1) {
                const splitter = document.createElement('div');
                splitter.className = `twm-splitter twm-splitter--${node.dir}`;
                splitter.dataset.splitId = node.id;
                splitter.dataset.slotIdx = String(i);
                split.appendChild(splitter);
            }
        });
    }

    _leafEl(leaf) {
        // Tab strip key is part of the cache key so the strip's chrome
        // (which tabs exist, which one is active) re-renders when tabs
        // mutate, but the active tab's body itself stays cached when the
        // user clicks back to a tab they already visited.
        const activeTab = (Array.isArray(leaf.tabs) && leaf.tabs.length > 0)
            ? leaf.tabs[Math.max(0, Math.min(leaf.tabs.length - 1, leaf.activeTabIdx || 0))]
            : null;
        const kindKey = this._leafKindKey(leaf);

        let entry = this._leafCache.get(leaf.id);
        if (entry && entry.kindKey === kindKey) {
            entry.titleEl.textContent = leaf.title || (leaf.content ? leaf.content.kind : 'empty');
            // C19. Re-read the glyph beside the title, and for the same reason:
            // a cached leaf is NOT re-mounted, so anything the chrome shows
            // that can change while the content stays put has to be refreshed
            // here or it is frozen at whatever it was when the tile was built.
            _paintLeafIcon(entry.iconEl, leaf, entry.content, this.ctx);
            return entry.wrapEl;
        }
        // Build fresh.
        if (entry) {
            // DELETED, NOT JUST SUPERSEDED. The map still held this entry while
            // the content's own `destroy` ran, so anything reaching the
            // renderer from inside that teardown — `leafChrome`, and
            // `rebaselineLeaf`, which would have written a key onto a wrap
            // already removed from the document — read a corpse. The rebuild
            // re-registers under the same id a few lines below, so the only
            // window this closes is the one nothing should be looking in.
            this._leafCache.delete(leaf.id);
            try { entry.content?.destroy?.(); } catch (_) {}
            this._disposeTabStrip(entry);
            entry.wrapEl.remove();
        }
        const wrap = document.createElement('div');
        wrap.className = 'twm-leaf';
        wrap.dataset.leafId = leaf.id;
        // No tabIndex on the wrap — that would capture focus on click
        // and break the `hostEl.contains(document.activeElement)` guard
        // many tab modules use to scope their keyboard handlers. The
        // body is given tabIndex=-1 below so we can focus the body
        // (which IS the hostEl seen by the mounted tab content) on
        // tile activation.
        const chrome = document.createElement('div');
        chrome.className = 'twm-leaf__chrome';
        // C19. The glyph a floating window has always had, in the tile chrome
        // too — `ManagedWindow._build` puts one left of its title
        // (`../ui/components/managed_window.js:588-590`) and a tile, which is
        // the SAME content in a different state, had nothing there. Two ways of
        // looking at one table should not disagree about what a table looks
        // like.
        const icon = document.createElement('span');
        icon.className = 'twm-leaf__icon material-symbols-outlined';
        const title = document.createElement('span');
        title.className = 'twm-leaf__title';
        title.textContent = leaf.title || (leaf.content ? leaf.content.kind : 'empty');
        const actions = document.createElement('span');
        actions.className = 'twm-leaf__actions';
        // C18. Content-contributed chrome actions land HERE, to the left of the
        // structural ones, and the divider is not decoration: the buttons on
        // the right act on the TILE (split it, float it, close it) and the ones
        // on the left act on what is IN it (this table's settings, this table
        // in a browser window). Two kinds of verb in one strip with nothing
        // between them is how "close" gets read as "close the table".
        const contentActions = document.createElement('span');
        contentActions.className = 'twm-leaf__actions twm-leaf__actions--content';
        // Panel tiles (left nav / right / bottom) can't be promoted to
        // managed windows — they're chrome, not content. Hide the
        // promote button in their chrome.
        const isPanel = String(leaf.content?.kind || '').startsWith('panel:');
        // Split + promote are structural actions on a content tile; panels
        // (left nav / right / bottom) are chrome, not content, so they only
        // get the close affordance.
        actions.innerHTML = `
            ${isPanel ? '' : `
                <button class="twm-leaf__btn" data-action="split-h" title="Split horizontally (Alt+H)">
                    <span class="material-symbols-outlined">splitscreen_vertical_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="split-v" title="Split vertically (Alt+V)">
                    <span class="material-symbols-outlined">splitscreen_add</span>
                </button>
                <button class="twm-leaf__btn" data-action="promote" title="Float this ${this.ctx.wm?.floatActiveTab ? 'tab' : 'pane'} as a window (Alt+F)">
                    <span class="material-symbols-outlined">web_asset</span>
                </button>`}
            <button class="twm-leaf__btn" data-action="close" title="Close (Alt+W)">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
        chrome.append(icon, title, contentActions, actions);
        // Painted BEFORE the mount as well as after it, so a kind whose factory
        // supplies no icon of its own — and every kind that existed before this
        // did — still wears the taxonomy's glyph from the first frame rather
        // than acquiring one a mount later.
        _paintLeafIcon(icon, leaf, null, this.ctx);
        const body = document.createElement('div');
        body.className = 'twm-leaf__body';
        body.tabIndex = -1; // focusable via JS so document.activeElement
                            // lands inside the body when the tile is
                            // activated (keyboard-handler scope check).
        // The tab strip — only rendered when the leaf carries more than one
        // tab. It is built as part of the leaf element, not of the body, so it
        // stays pinned at its edge of the tile regardless of body scroll.
        const tabBar = document.createElement('div');
        tabBar.className = 'twm-leaf__tabbar';
        if (!Array.isArray(leaf.tabs) || leaf.tabs.length <= 1) {
            tabBar.classList.add('twm-leaf__tabbar--hidden');
        }
        // C22. CHROME FIRST IN BOTH LAYOUTS. The chrome is the pane's identity
        // and the tabs are what is inside it; a strip above the title would say
        // the tabs own the pane rather than the other way round.
        wrap.append(chrome, ...(this.tabLayout === 'top' ? [tabBar, body]
                                                        : [body, tabBar]));

        wrap.addEventListener('mousedown', (e) => {
            if (e.target.closest('.twm-splitter')) return;
            this.tree.focus(leaf.id);
            this._updateFocusClasses();
            this.onFocusChange(leaf.id);
            // Park focus on the deepest focus host inside the body so
            // page modules whose keydown scope is
            // `hostEl.contains(document.activeElement)` actually see
            // the activation. The page-shell wrapper, when present,
            // is what tab modules treat as `hostEl`; falling back to
            // the leaf body itself is fine for panel tiles.
            const tgt = e.target;
            const focusable = tgt.closest?.(
                'input, textarea, select, button, a, [contenteditable="true"], [tabindex]');
            if (!focusable || !body.contains(focusable)) {
                setTimeout(() => {
                    const ps = body.querySelector('.twm-page-shell__content')
                            ?? body;
                    if (ps.tabIndex == null || ps.tabIndex < -1) ps.tabIndex = -1;
                    ps.focus({ preventScroll: true });
                }, 0);
            }
        });
        // ── PULL THE HEADER DOWN TO FLOAT THE PANE ──────────────────────
        //
        // The inverse of the gesture everyone already knows: a maximised window
        // is un-maximised by dragging its titlebar away from the edge, and a
        // tile is a pane maximised into its slot. So dragging a tile's chrome
        // DOWNWARD lifts it out as a floating window — the same thing the
        // promote button does, reached the way a window manager teaches you to
        // reach it.
        //
        // Downward only, and past a real threshold. A tile's chrome is also
        // where you click to focus the pane, and a click carries a few pixels
        // of movement with it; anything less than a deliberate pull is a click.
        // Sideways is left alone: it means nothing here, and claiming it would
        // make the strip feel like it grabs the pointer.
        chrome.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest(CHROME_NO_FLOAT)) return;
            const startY = e.clientY;
            const startX = e.clientX;
            // PUBLISHED ON THE RENDERER, for `_syncChromeDragSource` to read.
            //
            // The native drag beats the pull to the pointer and there is no
            // threshold at which it does not: Chromium starts one after about
            // 5px of travel while the pull needs 24, so the ONLY moment the
            // direction of this gesture can still be acted on is inside the
            // `dragstart` the drag announces itself with. That handler has no
            // other way to learn it — a `dragstart`'s own `clientX`/`clientY`
            // read 0 for a drag begun this way (measured, Edge 152 /
            // Chromium 152), so the event cannot answer the question being
            // asked of it and this record has to.
            //
            // On the renderer rather than in this closure for `_tabDrag`'s
            // reason: the reader is a method bound to a different element.
            const pull = { startX, startY, x: startX, y: startY, lifted: false };
            this._chromePull = pull;
            const onMove = (move) => {
                pull.x = move.clientX;
                pull.y = move.clientY;
                if (pull.lifted) return;
                const down = move.clientY - startY;
                const sideways = Math.abs(move.clientX - startX);
                if (down < TILE_LIFT_PX || !_isDownwardPull(down, sideways)) return;
                pull.lifted = true;
                // ONLY `pointermove` COMES OFF HERE, AND THE RECORD STAYS —
                // `cleanup()` would take it, and taking it is a defect.
                //
                // A `pointermove` can be COALESCED: one event may carry the
                // whole 24px and promote on its first delivery, and Blink
                // hands that move to script BEFORE starting the drag it
                // crossed the threshold for — so a `dragstart` still arrives
                // afterwards, and `_syncChromeDragSource` has to be able to
                // read the gesture to refuse it. Without the record it did
                // not, and a tab drag began on the pane that had just floated
                // out of the tile. `pointerup` below is what clears it.
                window.removeEventListener('pointermove', onMove);
                this.ctx.onLeafAction?.(leaf.id, 'promote');
            };
            const cleanup = () => {
                if (this._chromePull === pull) this._chromePull = null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', cleanup);
                window.removeEventListener('pointercancel', cleanup);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', cleanup);
            window.addEventListener('pointercancel', cleanup);
        });

        // ── …OR DOUBLE-CLICK IT, WHICH IS THE GESTURE THAT ALREADY HAD A
        //    RETURN JOURNEY AND NO OUTWARD ONE ────────────────────────────
        //
        // Double-clicking a FLOATING window's title bar docks it back into a
        // tile — `managed_window.js:919` binds it to `toggleMaximize()`, whose
        // claimed verb under this WM is `bringBackWindow` ("maximise means back
        // to tile", R7 — see the `onMaximize` `wm._promote` builds). So the
        // half of the toggle that PUTS a
        // pane back was spelled as a double-click on a header, and the half
        // that takes it out was not: a user who learned the docking gesture had
        // to reach for the float button, or discover the pull above, to undo
        // what a double-click had just done. One gesture, one strip, both
        // directions.
        //
        // The pull and this are two doors onto ONE verb, not two verbs. Both go
        // through `onLeafAction(leaf.id, 'promote')`, so the WM's guards apply
        // to both without knowing there are two — a panel tile and a window
        // placeholder are refused in `wm._floatableLeaf` and a
        // second double-click on an already-floated pane finds a re-seeded
        // start tile rather than the content, which is the tree telling the
        // truth rather than a case to special-case here.
        //
        // NATIVE `dblclick`, NOT A HAND-ROLLED CLICK COUNT — and that is a
        // claim about the handlers above, not a preference. C28
        // (`managed_window.js:1305`) is the case that says why: its pointerdown
        // re-parented the window element out of the document before the pointer
        // had moved, Blink and Gecko drop the pending `click` when the pressed
        // element leaves the document, and the title bar's `dblclick` therefore
        // never fired once in a real browser while looking perfectly correct in
        // jsdom. Nothing on this strip does that. The wrap's `mousedown`
        // toggles a class and calls `onFocusChange`, which the WM turns into
        // `wm._notifyChange` — a callback and two bus emits, no repaint; its
        // deferred `body.focus()` moves focus and moves
        // nothing else, and focus does not reset a click count. The pull's
        // `pointerdown` only registers window listeners and neither
        // `preventDefault`s nor captures the pointer. The chrome the first
        // click lands on is still in the document, still the same element, when
        // the second one lands.
        //
        // No `e.button` test, unlike the pull: `dblclick` is dispatched for the
        // primary button only. No `preventDefault`, and NO NEW CSS: the strip
        // is already `user-select: none` (`css/overrides.css:1001`, mirrored
        // into the generated `css/flexdesk.css:4743`), so a double-click here
        // cannot word-select the title on its way to floating the pane.
        chrome.addEventListener('dblclick', (e) => {
            if (e.target.closest(CHROME_NO_FLOAT)) return;
            this.ctx.onLeafAction?.(leaf.id, 'promote');
        });

        // Right-click on the chrome → tile context menu (split, close,
        // promote, move to desktop). Listening on `chrome` only so the
        // tile body keeps its own contextmenu (e.g. DataTable's).
        chrome.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.tree.focus(leaf.id);
            this._updateFocusClasses();
            this.onFocusChange(leaf.id);
            this.ctx.onTileContextMenu?.(leaf.id, e.clientX, e.clientY);
        });
        actions.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            e.stopPropagation();
            this.ctx.onLeafAction?.(leaf.id, btn.dataset.action);
        });

        // Mount content. The per-leaf ctx carries `leafId` so the
        // mounted content can route subsequent navigation (e.g.
        // `workspaceTabs.openTab(...)`) back into its own tile via
        // `wm.openFromContext(ctx, ...)` instead of always hitting
        // the primary tile.
        let content = {};
        if (leaf.content) {
            const leafCtx = { ...this.ctx, leafId: leaf.id };
            // Mount with the ACTIVE TAB's props, not `content.props`.
            // `wm.updateActiveTabProps` (the canonical per-tile view-state
            // store — survives reload + desktop switches via desktops.json)
            // writes only into `tabs[active].props` and deliberately leaves
            // `content.props` untouched so the cache key (kindKey) stays
            // stable and a tab-prop change doesn't churn-rebuild the leaf.
            // The trade-off: `content.props` goes stale, so a leaf rebuilt
            // after a desktop round-trip must read the fresh tab props here.
            const activeProps = activeTab?.props ?? leaf.content.props;
            content = this.content.mount(leaf.content.kind, body, activeProps, leafCtx);
            if (content.title) title.textContent = content.title;
            // C19. `icon` is the natural sibling of `title` and is read the
            // same way: AFTER the mount, because that is the first moment the
            // content knows what it is — a canvas pane you emptied is the same
            // KIND as the overview and wants a different glyph.
            _paintLeafIcon(icon, leaf, content, this.ctx);
            // C18. A content factory may return `chromeActions`:
            // `[{icon, title, onClick}]`. Read AFTER the mount, because that is
            // the first moment the content knows what it can offer — a table
            // does not know it has settings until it has a definition.
            _paintContentActions(contentActions, content.chromeActions);
            // C20. A content factory may also VETO structural verbs:
            // `chrome: { promote: false, close: false }`. Read after the mount
            // for the same reason `chromeActions` is — it is the first moment
            // the content knows what it is.
            //
            // The case that forced it: an embedder's MASTER tile. It is the
            // ground floating windows stand on and the thing you are left with
            // when everything else is closed, so "float this pane as a window"
            // and "close this pane" are offers to destroy the only surface the
            // application has. The renderer already made this exact judgement
            // for `panel:*` kinds by hardcoding it; this is that judgement,
            // available to anyone.
            _vetoStructuralActions(actions, content.chrome);
        } else {
            body.innerHTML = `<div class="tile-placeholder"><div class="tile-placeholder__hint">empty tile</div></div>`;
        }
        entry = { wrapEl: wrap, bodyEl: body, chromeEl: chrome,
                  titleEl: title, iconEl: icon, content,
                  // DERIVED HERE, NOT REUSED FROM ABOVE. `kindKey` was computed
                  // before the mount; content that records its sub-tab or its
                  // scroll offset WHILE mounting has already written to the
                  // tree by now, so the value captured earlier is stale and the
                  // very next repaint would tear down the tile that had just
                  // said where it was.
                  kindKey: this._leafKindKey(leaf), tabBarEl: tabBar,
                  // C22. The `top` layout's NotebookTabBar, and the child it
                  // mounts into. Null under the `bottom` layout, which is plain
                  // markup this file writes itself.
                  tabStrip: null, tabStripHostEl: null };
        this._leafCache.set(leaf.id, entry);

        // Render tab strip last so it has access to the cached entry.
        this._renderTabBar(leaf, entry);
        return wrap;
    }

    /**
     * The cache key for a leaf: everything that must change before its wrap is
     * torn down and rebuilt. Extracted so `rebaselineLeaf` below computes the
     * same string this does — two spellings of one key is a cache that misses
     * on every render or never misses at all, and both look like working code.
     */
    _leafKindKey(leaf) {
        const tabFingerprint = (leaf.tabs || []).map((t) =>
            `${t.kind}::${JSON.stringify(t.props || {})}`).join('|') + `#${leaf.activeTabIdx || 0}`;
        return leaf.content
            ? `${leaf.content.kind}::${JSON.stringify(leaf.content.props || {})}::tabs:${tabFingerprint}`
            : '__empty__';
    }

    /**
     * The cache key a leaf has RIGHT NOW, for a caller that is about to change
     * the tree and wants to say what it expected to be changing from. See
     * `rebaselineLeaf`.
     */
    leafKey(leafId) {
        const leaf = this.tree?.get?.(leafId);
        return (leaf && leaf.kind === 'leaf') ? this._leafKindKey(leaf) : null;
    }

    /**
     * C34. ACCEPT A PROPS WRITE THE CONTENT MADE ABOUT ITSELF, WITHOUT
     * REBUILDING THE TILE THAT MADE IT.
     *
     * The cache key above includes every tab's props, and that is right for
     * NAVIGATION: a `table` tab whose `id` changes is different content and the
     * tile must be re-mounted. It is exactly wrong for VIEW STATE. The
     * framework hands every tile a `workspaceTabs.updateProps(patch)`
     * (`page_factory.js`) documented as *"persist editor sub-state into this
     * tile's WM tab props"* — a scroll offset, an open section, a selected
     * sub-tab. Writing one changed the fingerprint, so the NEXT repaint (a
     * focus change, a tab switch, a window promoted three tiles away) missed
     * the cache, destroyed the content and mounted it again. The tile was torn
     * down BY the call that existed to let it remember something, and because
     * the rebuild reads the props back the result looked almost right — the
     * editor came back at the saved scroll position, with everything uncommitted
     * in it gone.
     *
     * So the key is re-baselined instead: the entry keeps its live DOM and
     * starts answering to the new props. The next real navigation still misses
     * and still rebuilds, because that changes the kind or the tab set and this
     * only ever accepts what is already on screen.
     *
     * ══ IT ACCEPTS ONLY THE DELTA IT WAS CALLED FOR ═══════════════════
     *
     * The key is re-derived from the tree as it is NOW, so a first version of
     * this swallowed every difference at once — including a change the tree had
     * taken and the renderer had not drawn yet. Any mutation that does not
     * repaint (`updateActiveTabProps` is itself one, and an embedder writing
     * through `TileTree` directly is another) followed by a props write would
     * have been accepted onto a wrap still showing the OLD content, and the
     * tile would never have re-mounted: one thing drawn under another's title,
     * permanently, with nothing left that knows the two disagree.
     *
     * `expected` is the fix and it is the caller's own honesty: the key it read
     * BEFORE its write. If the cached entry is not still at that key, something
     * else has changed since the tile was mounted and this is not the caller's
     * to accept — refuse, and let the ordinary miss rebuild it.
     *
     * A structural test was tried first and is not enough. *Same kind, different
     * props* is a scroll offset AND it is a navigation to another table; nothing
     * in the leaf can tell them apart, because the difference is which caller
     * asked. `expected` asks the caller.
     *
     * @param {string} leafId
     * @param {string} [expected] the key the caller read before its own write.
     *   Omitted means "accept whatever is there", which is what the first
     *   version did and is kept only so an older caller does not silently
     *   change behaviour — every caller in this tree passes one.
     * @returns {boolean} whether a cached wrap was re-baselined
     */
    rebaselineLeaf(leafId, expected = undefined) {
        const entry = this._leafCache.get(leafId);
        const leaf = this.tree?.get?.(leafId);
        if (!entry || !leaf || leaf.kind !== 'leaf') return false;
        if (expected !== undefined && entry.kindKey !== expected) return false;
        entry.kindKey = this._leafKindKey(leaf);
        return true;
    }

    /**
     * C22. Change the tab layout of a LIVE renderer.
     *
     * Only the strip is rebuilt. The tab bar element is MOVED between its two
     * positions and the body is never detached, so no content factory is
     * unmounted — which is the whole reason this is a method rather than
     * "rebuild the shell with the other option". A grid holding staged edits
     * must not lose them because someone changed where its tabs are drawn.
     *
     * Accepts anything: the value arrives from a DOM attribute and from
     * persisted user settings, and an unknown one means the default.
     */
    setTabLayout(layout) {
        const next = _normalizeTabLayout(layout);
        // The attribute is written back below, which re-enters through the
        // observer; this is where that stops.
        if (next === this.tabLayout) return;
        this.tabLayout = next;
        if (this.root.dataset && this.root.dataset.twmTabs !== next) {
            this.root.dataset.twmTabs = next;
        }
        if (this.disposed) return;
        for (const [leafId, entry] of this._leafCache) {
            this._placeTabBar(entry);
            // The two strips are different components, not two skins of one:
            // whichever was there is torn down and the other is built.
            this._disposeTabStrip(entry);
            entry.tabBarEl.innerHTML = '';
            const leaf = this.tree.get(leafId);
            if (leaf) this._renderTabBar(leaf, entry);
        }
    }

    /** Put a leaf's tab bar on the side the current layout says. Moving an
     *  attached element is a re-parent, not a rebuild — the body keeps its
     *  DOM, its listeners and its scroll. */
    _placeTabBar(entry) {
        const { wrapEl, bodyEl, tabBarEl } = entry;
        if (!wrapEl || !tabBarEl || !bodyEl) return;
        if (this.tabLayout === 'top') wrapEl.insertBefore(tabBarEl, bodyEl);
        else wrapEl.appendChild(tabBarEl);
    }

    /** Tear down the `top` layout's component, if this leaf has one. Safe to
     *  call on a leaf that never had one, and on one that already lost it. */
    _disposeTabStrip(entry) {
        if (!entry?.tabStrip) return;
        try { entry.tabStrip.dispose(); } catch (err) {
            console.error('[tile] tab strip dispose threw', err);
        }
        entry.tabStrip = null;
        entry.tabStripHostEl = null;
    }

    /** Paint a leaf's tab strip in whichever layout is current. The strip is
     *  hidden for single-tab leaves in BOTH layouts — the common case, and the
     *  reason existing single-pane layouts read as identical to today. */
    _renderTabBar(leaf, entry) {
        // C33. BEFORE the single-tab early return, because the single-tab leaf
        // is exactly the case this answers: no strip is drawn, so the chrome is
        // the only thing left to grab.
        this._syncChromeDragSource(leaf, entry);
        const bar = entry.tabBarEl;
        if (!bar) return;
        const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
        bar.classList.toggle('twm-leaf__tabbar--top', this.tabLayout === 'top');
        if (tabs.length <= 1) {
            bar.classList.add('twm-leaf__tabbar--hidden');
            this._disposeTabStrip(entry);
            bar.innerHTML = '';
            return;
        }
        bar.classList.remove('twm-leaf__tabbar--hidden');
        if (this.tabLayout === 'top') this._renderTopTabBar(leaf, entry, tabs);
        else this._renderBottomTabBar(leaf, entry, tabs);
    }

    /**
     * C33. THE CHROME IS THE DRAG SOURCE FOR A LEAF THAT HAS ONE TAB.
     *
     * Product owner, 2026-08-27. The full argument is in the file header; what
     * this function owns is the THREE conditions and why each is a condition
     * rather than a preference:
     *
     *   EXACTLY ONE TAB. With two or more, the strip is drawn and names each
     *   tab; a chrome drag would then have to guess which one was meant, and
     *   guessing is what the strip exists to avoid. With exactly one, "this
     *   tab" and "what is in this pane" are the same thing.
     *
     *   NOT A PANEL. Panel tiles are chrome, not content — the same exclusion
     *   `_floatableLeaf` and `_snapProbe` already make, and for the same reason:
     *   there is nothing in them that belongs anywhere else.
     *
     *   THE CONTENT DID NOT VETO `promote` (C20). One rule instead of two: a
     *   tab you may not lift out of its pane is a tab you may not drag into
     *   another one. This is what excludes an embedder's master tile — the
     *   ground its floating windows stand on — whose whole reason for existing
     *   is that it stays where it is.
     *
     * THE LISTENERS ARE BOUND ONCE PER CHROME ELEMENT and the ATTRIBUTE is
     * re-decided on every pass. That split is deliberate: `draggable` changes
     * the moment a second tab arrives, while the chrome element itself survives
     * for as long as its wrap does, and re-adding a listener on every render
     * would stack one per repaint.
     */
    _syncChromeDragSource(leaf, entry) {
        const chrome = entry?.chromeEl;
        if (!chrome) return;
        const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
        const isPanel = String(leaf.content?.kind || '').startsWith('panel:');
        const vetoed = this.leafChrome(leaf.id)?.promote === false;
        const on = tabs.length === 1 && !isPanel && !vetoed;
        if (on) chrome.setAttribute('draggable', 'true');
        else chrome.removeAttribute('draggable');
        if (chrome.__twmTabDragBound) return;
        chrome.__twmTabDragBound = true;
        chrome.addEventListener('dragstart', (ev) => {
            // A drag that began on a BUTTON is not a drag of the pane. Buttons
            // are not draggable on their own, but a draggable ancestor makes
            // them so — hence the same guard the two float gestures apply, from
            // the same constant, so a control added to this strip later becomes
            // inert under all three at once.
            if (ev.target?.closest?.(CHROME_NO_FLOAT)) { ev.preventDefault(); return; }
            // ══ A DOWNWARD GESTURE IS THE PULL, AND IT HAS TO BE REFUSED
            //    HERE, BECAUSE NOTHING LATER CAN ═══════════════════════════
            //
            // The file header used to claim these two gestures could not
            // collide: *"the pull … loses cleanly … The pull is also still
            // reachable, on every part of the chrome a single-tab leaf's title
            // does not cover."* That describes `draggable` on the TITLE. It is
            // set on the CHROME, four lines above — the whole strip — so the
            // pull was not merely losing where the title sits, it had no
            // reachable surface left on any single-tab tile. And below two tabs
            // the strip is hidden, so single-tab is the common case: the
            // reported symptom is *"pulling down a tile at title bar does not
            // anymore turn it into a managed window"*, and it was every tile.
            //
            // MEASURED, against the running application in Edge 152 rather
            // than in jsdom, which cannot start a native drag and therefore
            // cannot see any of this: press the chrome and pull down 140px and
            // the sequence is `dragstart`, `pointercancel`, `dragend`, with
            // zero windows promoted. The drag arrives at ~5-16px of travel and
            // `pointercancel` tears the pull's listeners down at ~8, so the
            // 24px threshold is never reached and never can be.
            //
            // Refusing the drag here is what hands the pointer back: a
            // `dragstart` that is cancelled starts no drag, so no
            // `pointercancel` is fired and `pointermove` simply resumes —
            // measured, same harness, the pull then fires at 26px. That is
            // also the house idiom for declining a native drag
            // (`DragReorder._start`'s `draggableGuard`, `drag_reorder.js`).
            //
            // C33 IS UNTOUCHED BY IT. A sideways or diagonal grab reports
            // `down <= sideways`, is not refused, and drags exactly as before
            // — verified in the same browser run. What this costs is the one
            // gesture that was ambiguous by construction: you can no longer
            // start a tab drag by pulling straight DOWN out of the chrome,
            // which is the direction the float has claimed since before the
            // tab drag existed.
            //
            // `_chromePull` OUTLIVES THE PROMOTE, and that is load-bearing
            // rather than tidy: a coalesced `pointermove` can carry the whole
            // 24px and promote on its first delivery, and Blink hands that
            // move to script BEFORE starting the drag it crossed the threshold
            // for — so a `dragstart` still arrives afterwards. Clearing the
            // record on lift left this read with nothing, so the drag was not
            // refused and a tab drag began on the pane that had just floated
            // out of the tile. The record's last coordinates are the lift's,
            // which are downward by definition, so the same test answers.
            const pull = this._chromePull;
            if (pull && _isDownwardPull(pull.y - pull.startY,
                                        Math.abs(pull.x - pull.startX))) {
                ev.preventDefault();
                return;
            }
            // Re-read the count rather than trusting the attribute: the tree
            // can gain a tab between a render and a gesture, and a stale
            // `draggable` would carry tab 0 out of a pane that now has three.
            const live = this.tree.get(leaf.id);
            if ((live?.tabs || []).length !== 1) { ev.preventDefault(); return; }
            this._beginTabDrag(ev, leaf.id, 0, chrome, { seedPlainText: true });
        });
        chrome.addEventListener('dragend', () => this._onTabDragEnd());
    }

    /**
     * C22. The `top` layout: `NotebookTabBar`, the editor tab strip.
     *
     * The component is mounted into a CHILD of the bar rather than into the bar
     * itself, because `mount()` assigns `container.className = 'tabs
     * notebook-tabs'` (`notebook_tab_bar.js:61`) — handing it `.twm-leaf__tabbar`
     * would take that class, and with it the strip's height, its background and
     * `--hidden`, off the element this file still controls.
     *
     * Every gesture routes through the SAME `ctx.onLeafTabAction` vocabulary the
     * bottom strip uses, so the WM's tree mutations, its persistence and its
     * change notifications are reached by one path from both layouts.
     */
    _renderTopTabBar(leaf, entry, tabs) {
        const bar = entry.tabBarEl;
        if (!entry.tabStrip) {
            bar.innerHTML = '';
            const host = document.createElement('div');
            bar.appendChild(host);
            const strip = new NotebookTabBar();
            strip.mount(host, this._topTabCallbacks(leaf.id));
            entry.tabStrip = strip;
            entry.tabStripHostEl = host;
            // ONE TAB CONTEXT MENU IN THE APPLICATION, not two.
            //
            // `NotebookTabBar` opens its own `.nb-context-menu` on right-click,
            // whose verbs are a notebook's (rename, duplicate, reveal in
            // explorer) and whose close verbs duplicate — in a different
            // typeface — the menu the WM already builds for the bottom strip
            // (`wm._showTabContextMenu`). A user who switches layout must not
            // discover that right-clicking a tab now means something else.
            //
            // CAPTURE phase, on the container: the component binds its handler
            // on each tab element in the bubble phase, so stopping the event on
            // the way DOWN is what keeps its menu from opening at all. There is
            // no callback for this — the menu is not a callback, it is the
            // component's own DOM.
            host.addEventListener('contextmenu', (ev) => {
                const tabEl = ev.target.closest?.('.tab');
                if (!tabEl) return;
                ev.preventDefault();
                ev.stopPropagation();
                const idx = this._topTabIndex(host, tabEl);
                if (idx < 0) return;
                this.ctx.onLeafTabAction?.(leaf.id, 'menu',
                    { idx, x: ev.clientX, y: ev.clientY });
            }, true);
        }
        const activeIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
        entry.tabStrip.update(
            tabs.map((t, i) => ({
                filePath: _tabKey(i),
                label: t.title || t.kind || '',
                // The component's `fileType` picks a glyph out of a static map
                // of FILE kinds. A tile's kinds are the embedder's, and the
                // taxonomy already answers for them — see `_paintTopTabs`.
                fileType: t.kind || 'unknown',
                // Nothing sets `dirty` on a tab spec today, so the dot is never
                // drawn. Read anyway, because the day a tile can say it holds
                // unsaved work this is where it says it, and the alternative is
                // a second place to remember.
                isDirty: !!t.dirty,
            })),
            _tabKey(activeIdx));
        this._paintTopTabs(entry.tabStripHostEl, tabs);
    }

    /**
     * The two things `NotebookTabBar` derives from a vocabulary a tile does not
     * have, corrected in one pass over the DOM it just wrote.
     *
     * Its tooltip is the file PATH (`notebook_tab_bar.js:163`) and its glyph
     * comes from a static fileType map (`:135`). Ours are `builtin://tab/3` and
     * a content kind, so left alone a tab would advertise its own array index
     * and wear the generic `description` glyph — while the tile chrome an inch
     * above it shows the taxonomy's icon for exactly the same kind.
     *
     * Reaching into a component's DOM is worth one paragraph of justification.
     * The alternative for the glyph is `NotebookTabBar.setFileTypeIcons()`,
     * which is STATIC and REPLACES the whole map — so a page that also uses the
     * editor would find its own file icons deleted by whichever of the two
     * rendered last. The class names used here are the component's published
     * contract, stated in its header comment.
     */
    _paintTopTabs(hostEl, tabs) {
        if (!hostEl) return;
        const els = hostEl.querySelectorAll('.tab');
        els.forEach((el, i) => {
            const spec = tabs[i];
            if (!spec) return;
            el.title = spec.title || spec.kind || '';
            const icon = spec.kind ? this.ctx?.taxonomy?.meta?.(spec.kind)?.icon : null;
            const glyph = el.querySelector('.tab-icon');
            if (glyph && icon) glyph.textContent = icon;
            else if (glyph && !icon) glyph.hidden = true;
        });
    }

    /** Which tab an element in the top strip is, by DOM position. Position
     *  rather than the `data-path` key because the key is only ever the index
     *  and reading it back would be a second, parallel answer to the same
     *  question. */
    _topTabIndex(hostEl, tabEl) {
        return Array.prototype.indexOf.call(hostEl.querySelectorAll('.tab'), tabEl);
    }

    /** The callbacks `NotebookTabBar` calls. Everything the component offers
     *  that a tile tab cannot honour is deliberately absent rather than stubbed
     *  — `onRename` is refused by the `builtin://` key, and the rest
     *  (`onDuplicate`, `onSplitRight`, `onRevealInExplorer`, `onCloseAll`, …)
     *  are only ever reached from the context menu this renderer suppresses.
     *
     *  `onDropFromOtherPane` IS NOW WIRED, AND THIS IS THE RECORD OF WHY IT WAS
     *  NOT. The refusal read: *"its payload is the dragged tab's key alone,
     *  which carries no source-leaf identity, and `TileTree` has no
     *  move-a-tab-between-leaves operation to receive it. Wiring it would need
     *  both, and both are tree changes."* Both were true and C33 built both.
     *  `TileTree.moveTabToLeaf` is the tree operation; `TileRenderer._tabDrag`
     *  is the source identity — held on the renderer rather than in the payload
     *  because HTML5's protected mode makes the payload unreadable at the only
     *  moment it would be needed (see `TILE_TAB_MIME`). The payload handed to
     *  the callback is therefore still ignored, exactly as the refusal said it
     *  would have to be.
     *
     *  A DROP ON A FOREIGN STRIP APPENDS. `NotebookTabBar` hands the callback a
     *  key and no event, so there is no pointer position to derive a slot from
     *  — and inventing one for this strip and not for the bottom one would give
     *  the two layouts different answers to the same gesture. "Add this tab to
     *  that tile" is what was asked for; where it sits in the strip is a
     *  reorder away, in the mechanism that already does reorders. */
    _topTabCallbacks(leafId) {
        return {
            // C33. `DragReorder` calls this through `NotebookTabBar`, which
            // sets its own `application/x-ecosim-tab` first and unchanged — so
            // an editor pane sharing the page cannot notice that tiles are
            // dragging tabs too.
            onDragStart: (ev, key, item) => {
                const idx = _tabKeyIndex(key);
                if (idx < 0) return;
                this._beginTabDrag(ev, leafId, idx, item || null);
            },
            // What lets THIS strip admit a tab dragged out of another tile's
            // strip: `#isExternalTabDrag` tests `TAB_MIME` plus whatever the
            // host names here, and defers while its own reorder is running.
            externalTabMimes: [TILE_TAB_MIME],
            onDropFromOtherPane: () => {
                const src = this._tabDrag;
                this._onTabDragEnd();
                if (!src || src.leafId === leafId) return;
                this.ctx.onLeafTabAction?.(src.leafId, 'drop-into', {
                    idx: src.idx,
                    target: { leafId, mode: 'tab', toIdx: -1 },
                });
            },
            onActivate: (key) => {
                const idx = _tabKeyIndex(key);
                if (idx >= 0) this.ctx.onLeafTabAction?.(leafId, 'switch', { idx });
            },
            onClose: (key) => {
                const idx = _tabKeyIndex(key);
                if (idx >= 0) this.ctx.onLeafTabAction?.(leafId, 'close', { idx });
            },
            // DRAG-TO-REORDER ARRIVES AS A PERMUTATION, and the tree moves ONE
            // tab at a time (`TileTree.moveLeafTab(leafId, from, to)`). They
            // reconcile because a drag only ever moves one element: every other
            // key shifts by exactly one place, so the element that travelled
            // furthest between the two orders IS the one that was dragged.
            onReorder: (order) => {
                const leaf = this.tree.get(leafId);
                const count = (leaf?.tabs || []).length;
                if (!Array.isArray(order) || order.length !== count) return;
                let from = -1;
                let to = -1;
                let furthest = 0;
                order.forEach((key, newIdx) => {
                    const oldIdx = _tabKeyIndex(key);
                    if (oldIdx < 0) return;
                    const travelled = Math.abs(newIdx - oldIdx);
                    if (travelled > furthest) {
                        furthest = travelled;
                        from = oldIdx;
                        to = newIdx;
                    }
                });
                if (from < 0 || from === to) return;
                this.ctx.onLeafTabAction?.(leafId, 'move', { from, to });
            },
        };
    }

    /** The `bottom` layout — the framework's own strip, unchanged. Hamburger
     *  button at the start, then one trapezoid-shaped tab per stored tab spec. */
    _renderBottomTabBar(leaf, entry, tabs) {
        const bar = entry.tabBarEl;
        const activeIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
        bar.innerHTML = `
            <button type="button" class="twm-leaf__tab-hamburger"
                    data-action="tab-menu"
                    title="Show open tabs" aria-label="Show open tabs">
                <span class="material-symbols-outlined">menu</span>
            </button>
            <ol class="twm-leaf__tabs" role="tablist">
                ${tabs.map((t, i) => `
                    <li class="twm-leaf__tab${i === activeIdx ? ' twm-leaf__tab--on' : ''}"
                        role="tab" data-tab-idx="${i}"
                        title="${_esc(t.title || t.kind)}"
                        draggable="true">
                        <span class="twm-leaf__tab-label">${_esc(t.title || t.kind)}</span>
                        <button type="button" class="twm-leaf__tab-close"
                                data-action="tab-close" data-tab-idx="${i}"
                                title="Close this tab"
                                aria-label="Close tab">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </li>
                `).join('')}
            </ol>
        `;

        // Tab activation. Click anywhere on a tab (except its × button)
        // switches to it; the × closes it.
        bar.querySelectorAll('.twm-leaf__tab').forEach((li) => {
            li.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-action="tab-close"]')) return;
                const idx = Number(li.dataset.tabIdx);
                this.ctx.onLeafTabAction?.(leaf.id, 'switch', { idx });
            });
            // Right-click → browser-style tab context menu (close, close
            // others, close right / left). The WM mounts the actual menu
            // — we just hand it the (idx, x, y) anchor.
            li.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const idx = Number(li.dataset.tabIdx);
                this.ctx.onLeafTabAction?.(leaf.id, 'menu',
                    { idx, x: ev.clientX, y: ev.clientY });
            });
        });
        bar.querySelectorAll('[data-action="tab-close"]').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const idx = Number(btn.dataset.tabIdx);
                this.ctx.onLeafTabAction?.(leaf.id, 'close', { idx });
            });
        });
        bar.querySelector('[data-action="tab-menu"]')
            ?.addEventListener('click', (ev) => {
                ev.preventDefault();
                const r = ev.currentTarget.getBoundingClientRect();
                this.ctx.onLeafTabAction?.(leaf.id, 'open-menu',
                    { x: r.left, y: r.top });
            });

        // Drag-to-reorder. Stash the source idx in dataTransfer; the
        // drop target reads it and emits a 'move' action. We don't use
        // HTML5 setData('text/plain') for the live state because the
        // dragstart/drop pair runs entirely within the same tab list.
        //
        // C33. …WHICH IS EXACTLY WHY `dragFromIdx` IS NOT ENOUGH ANY MORE. It
        // is a closure built per leaf render, so leaf B's handlers cannot see
        // that leaf A started a drag. It stays, unchanged, as the in-strip
        // reorder's own state — the gesture it was written for still begins and
        // ends in one list — and the cross-tile identity is taken on the
        // renderer beside it. Two facts, two homes, and neither one guessing.
        let dragFromIdx = null;
        bar.querySelectorAll('.twm-leaf__tab').forEach((li) => {
            li.addEventListener('dragstart', (ev) => {
                dragFromIdx = Number(li.dataset.tabIdx);
                ev.dataTransfer.effectAllowed = 'move';
                // Firefox refuses to start a drag unless setData is
                // called — supply a placeholder string.
                try { ev.dataTransfer.setData('text/plain', String(dragFromIdx)); }
                catch {}
                this._beginTabDrag(ev, leaf.id, dragFromIdx, li);
            });
            // C33. THE DRAGGED TAB NOW LOOKS DRAGGED. `DragReorder` has put
            // `.dragging` on the top strip's tab since it was written; this
            // strip's hand-rolled reorder set no class at all, so a drag here
            // looked exactly like a click that did nothing until the tab
            // arrived somewhere else. One rule serves both strips.
            li.addEventListener('dragend', () => { dragFromIdx = null; this._onTabDragEnd(); });
            li.addEventListener('dragover', (ev) => {
                if (dragFromIdx == null) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
            });
            li.addEventListener('drop', (ev) => {
                if (dragFromIdx == null) return;
                ev.preventDefault();
                const toIdx = Number(li.dataset.tabIdx);
                if (toIdx !== dragFromIdx) {
                    this.ctx.onLeafTabAction?.(leaf.id, 'move',
                        { from: dragFromIdx, to: toIdx });
                }
                dragFromIdx = null;
            });
        });

        // ── C33. AND A TAB FROM ANOTHER TILE, DROPPED ON THIS STRIP ──────
        //
        // The container level, not the tab level, because the useful target is
        // "this strip" rather than "this tab": the per-tab handlers above
        // return without `preventDefault` when `dragFromIdx` is null, which is
        // always true of a foreign drag, so the event reaches here by bubbling
        // and the two never contend.
        //
        // The gate is the same shape as `NotebookTabBar.#isExternalTabDrag`:
        // the type-only marker, plus a source that is not this leaf. The
        // `dragleave` is guarded with `contains(relatedTarget)` because
        // `dragleave` fires every time the pointer crosses into a CHILD, and
        // without the guard the strip would unhighlight itself the moment the
        // pointer touched a tab inside it — the same fix `editor_pane.js` and
        // `notebook_tab_bar.js` already carry.
        // BOUND ONCE PER BAR ELEMENT, not once per render. `_renderBottomTabBar`
        // rewrites `bar.innerHTML` — which takes the per-tab listeners with the
        // `<li>`s they were on — but the BAR survives, and `setTabLayout` calls
        // straight back in on the same element. Without this flag a user who
        // switched layout twice would get three copies of the drop handler and
        // three `drop-into` actions from one release.
        const foreign = (ev) => !!this._tabDrag
            && this._tabDrag.leafId !== leaf.id
            && _isTileTabDrag(ev);
        if (bar.__twmBarDropBound) return;
        bar.__twmBarDropBound = true;
        bar.addEventListener('dragover', (ev) => {
            if (!foreign(ev)) return;
            ev.preventDefault();
            try { ev.dataTransfer.dropEffect = 'move'; } catch {}
            // The tile zone and the strip zone must never be armed at once, and
            // this is the TILE zone that goes — never `_clearTabDropZone`,
            // which would take the class added on the next line straight back
            // off. See `_onTabDragOver`: this handler runs FIRST (the bar is a
            // descendant of the root, and both listeners are on the bubble
            // phase), so anything it paints has to survive what runs after it.
            this._clearTileDropZone();
            bar.classList.add('twm-leaf__tabbar--drop-target');
        });
        bar.addEventListener('dragleave', (ev) => {
            if (!bar.contains(ev.relatedTarget)) {
                bar.classList.remove('twm-leaf__tabbar--drop-target');
            }
        });
        bar.addEventListener('drop', (ev) => {
            if (!foreign(ev)) return;
            ev.preventDefault();
            bar.classList.remove('twm-leaf__tabbar--drop-target');
            const src = this._tabDrag;
            this._onTabDragEnd();
            // APPEND, like the top strip's drop does, and for the same reason:
            // one gesture must not mean two things depending on where the user
            // draws their tabs. See `_topTabCallbacks`.
            this.ctx.onLeafTabAction?.(src.leafId, 'drop-into', {
                idx: src.idx,
                target: { leafId: leaf.id, mode: 'tab', toIdx: -1 },
            });
        });
    }

    // ══ C33. THE TAB DRAG ═══════════════════════════════════════════════

    /** Take the identity of the tab now being carried, and mark it.
     *
     *  `seedPlainText` is for the CHROME source only. The two strips already
     *  set `text/plain` themselves — `DragReorder._start` writes the reorder
     *  key, the bottom strip writes the index — and overwriting either would
     *  hand `NotebookTabBar.#onStripDrop`'s `getData(TAB_MIME) ||
     *  getData('text/plain')` fallback a number where it expects a key. The
     *  chrome has no such writer and Firefox refuses to begin a drag with an
     *  empty `dataTransfer`, so it supplies its own. */
    _beginTabDrag(ev, leafId, idx, el, { seedPlainText = false } = {}) {
        this._tabDrag = { leafId, idx, el: el || null };
        this._tabDropProbe = null;
        try {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData(TILE_TAB_MIME, '1');
            if (seedPlainText) ev.dataTransfer.setData('text/plain', String(idx));
        } catch { /* a synthetic event, or a dataTransfer in protected mode */ }
        el?.classList?.add('dragging');
    }

    /**
     * Arm — or refuse — the tile under the pointer.
     *
     * NOTHING HERE MAY RENDER. `render()` clears the root, which detaches the
     * element the browser is dragging, and the browser cancels the gesture the
     * moment that happens. The DOM afterwards reads perfectly correct, which is
     * what makes this failure so hard to see; it is the drag-and-drop cousin of
     * the `mousedown`-repaint defect recorded five times against the taskbar.
     *
     * `preventDefault()` is not decoration either: without it the browser
     * refuses the drop outright and `drop` never fires, which reads exactly
     * like a broken handler.
     */
    _onTabDragOver(e) {
        const src = this._tabDrag;
        if (!src || !_isTileTabDrag(e)) return;
        // A STRIP OWNS ITS OWN DROPS. Inside a tab bar the question is a
        // position in a list, not a zone of a tile, and both strips answer it
        // themselves — so this hands the event on rather than arming a zone
        // behind them.
        //
        // `_clearTileDropZone` and NOT `_clearTabDropZone`: the strip's handler
        // has ALREADY RUN by the time this one does — it is bound on a
        // descendant of the root and both are bubble-phase — so clearing the
        // strip classes here would remove the highlight it just painted, on
        // every `dragover`, and the strip would arm and disarm invisibly for
        // the whole gesture.
        if (e.target?.closest?.('.twm-leaf__tabbar')) { this._clearTileDropZone(); return; }
        const probe = this.ctx.wm?.tabDropProbe?.(e, { sourceLeafId: src.leafId }) || null;
        this._tabDropProbe = probe;
        if (!probe) { this._clearTabDropZone(); return; }
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch {}
        for (const [leafId, entry] of this._leafCache) {
            entry.wrapEl.classList.toggle('twm-leaf--drop-target', leafId === probe.leafId);
        }
        this._showTabDropPreview(probe.rect);
    }

    /** Release. The zone that was ARMED is the zone that runs — the stashed
     *  probe rather than a fresh one — because C15's rule is that the rectangle
     *  drawn during the drag is the rectangle the drop delivers, and a pointer
     *  one pixel outside the band at release must not quietly mean something
     *  else. */
    _onTabDrop(e) {
        const src = this._tabDrag;
        const probe = this._tabDropProbe;
        if (!src || !_isTileTabDrag(e)) return;
        if (e.target?.closest?.('.twm-leaf__tabbar')) return;
        e.preventDefault();
        this._onTabDragEnd();
        if (!probe) return;
        this.ctx.onLeafTabAction?.(src.leafId, 'drop-into', {
            idx: src.idx,
            target: {
                leafId: probe.leafId,
                mode: probe.mode,
                // The same derivation `_snapCommit` applies to a window drop
                // (`wm.js`, the `_dock` literal) — one reading of a side, so a
                // tab and a window cannot land on opposite halves of one edge.
                dir: (probe.side === 'left' || probe.side === 'right') ? 'h' : 'v',
                before: (probe.side === 'left' || probe.side === 'top'),
                toIdx: -1,
            },
        });
    }

    /** Leaving the root entirely disarms, and only that. The drag is still
     *  live — it may come back — so `_tabDrag` survives and only the painting
     *  goes. */
    _onTabDragLeave(e) {
        if (!this._tabDrag) return;
        if (this.root.contains(e.relatedTarget)) return;
        this._clearTabDropZone();
        this._tabDropProbe = null;
    }

    /** The only guaranteed end of a drag. Escape produces this and no `drop`;
     *  so does a release over a target that refused. Idempotent, because the
     *  drop path calls it too and `dragend` still arrives afterwards. */
    _onTabDragEnd() {
        this._tabDrag?.el?.classList?.remove('dragging');
        this._tabDrag = null;
        this._tabDropProbe = null;
        this._clearTabDropZone();
    }

    /** The TILE zone only — the outlined pane and the preview rectangle. Split
     *  out from the whole because a strip that has just armed itself must not
     *  be disarmed by the root handler running behind it. */
    _clearTileDropZone() {
        for (const [, entry] of this._leafCache) {
            entry.wrapEl.classList.remove('twm-leaf--drop-target');
        }
        this._clearTabDropPreview();
    }

    /** Everything: the tile zone and both strips'. The end of a gesture, where
     *  nothing may be left painted. */
    _clearTabDropZone() {
        this._clearTileDropZone();
        for (const [, entry] of this._leafCache) {
            entry.tabBarEl?.classList?.remove('twm-leaf__tabbar--drop-target');
        }
    }

    /** The rectangle a release would fill.
     *
     *  IT IS THE WINDOW DROP'S OWN PREVIEW ELEMENT — same two classes, same
     *  stylesheet rules (`css/base.css`, `.twm-snap-preview`) — so a tab drop
     *  and a window drop cannot come to disagree about what a drop looks like.
     *  `--viewport` is what makes `position: fixed` apply, and that is required
     *  rather than cosmetic: the rectangle came from `getBoundingClientRect` on
     *  a leaf, which speaks viewport pixels.
     *
     *  Parented to `document.body` and not to the root, for R13's reason:
     *  `render()`'s `innerHTML = ''` takes every direct child of the root, and
     *  a repaint during a drag needs nothing more exotic than the drag itself. */
    _showTabDropPreview(rect) {
        if (!rect) { this._clearTabDropPreview(); return; }
        if (!this._tabDropPreviewEl) {
            const el = document.createElement('div');
            el.className = 'twm-snap-preview twm-snap-preview--viewport';
            el.setAttribute('aria-hidden', 'true');
            this._tabDropPreviewEl = el;
        }
        const el = this._tabDropPreviewEl;
        Object.assign(el.style, {
            left: `${rect.left ?? rect.x}px`, top: `${rect.top ?? rect.y}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
        });
        if (el.parentNode !== document.body) document.body.appendChild(el);
    }

    _clearTabDropPreview() {
        this._tabDropPreviewEl?.remove();
    }

    _updateFocusClasses() {
        const focused = this.tree.focusedLeafId;
        for (const [leafId, entry] of this._leafCache) {
            entry.wrapEl.classList.toggle('twm-leaf--focused', leafId === focused);
        }
    }

    /** The `.twm-leaf` wrap element for a leaf id, or null if it isn't
     *  currently rendered. Used by the panel-key router to resolve which
     *  DOM subtree owns keyboard input. */
    leafEl(leafId) {
        return this._leafCache.get(leafId)?.wrapEl || null;
    }

    /** C20, extended. The `chrome` veto object the mounted content declared —
     *  `{ promote: false, close: false }` — or null when the leaf is not
     *  rendered or its content declared nothing.
     *
     *  IT EXISTS BECAUSE A VETO PAINTED ON A BUTTON IS NOT A VETO. C20 landed
     *  as `_vetoStructuralActions`, which removes the button from this strip —
     *  and a removed button is only the door the CONTENT can see. The verb has
     *  three other doors: the tile's right-click menu (`shell.js`'s "Float this
     *  pane as a window"), the chrome pull-down, and the chrome's double-click.
     *  All three reach `WindowManager.floatPane` without passing this file, so
     *  a master tile that declared itself unfloatable was floated by any of
     *  them — reproduced: the ground pane floats, every window standing on it
     *  is force-closed, and the pane is re-seeded WITHOUT its `canvas` prop.
     *
     *  So the WM asks the renderer what the content said, and enforces it in
     *  `_floatableLeaf` where every door already converges. The renderer stays
     *  the only place that knows what was mounted; the WM stays the only place
     *  that decides whether a verb runs. `closeFocused` now reads `close` the
     *  same way, for the same reason and after the same defect: Alt+W, the tile
     *  context menu and the tab strip's × all closed a pane whose own button
     *  was greyed out with a tooltip saying it could not be.
     *
     *  ══ THIS RETURNS THE FACTORY'S LIVE OBJECT, AND THAT IS A CONTRACT ══
     *
     *  Not a copy and not a snapshot. `chrome` is READ ONCE, at mount — a
     *  repaint of a cached leaf re-reads only the title and the glyph — so a
     *  veto whose ANSWER CHANGES over the life of the tile must be kept up to
     *  date by the content that stated it, by mutating the object it returned.
     *  Tables' ground pane is exactly that case: its close is refused only
     *  while it is the last content pane, and it re-syncs on `wm:changed`.
     *  Repainting the button alone is not enough now that a verb consults this
     *  — a stale `{disabled: true}` refuses a close every affordance on screen
     *  says is available, which is the same class of lie as a dead control. */
    leafChrome(leafId) {
        return this._leafCache.get(leafId)?.content?.chrome || null;
    }

    // ── Drag-resize ────────────────────────────────────────────────
    _onMouseDown(e) {
        const splitter = e.target.closest('.twm-splitter');
        if (!splitter) return;
        e.preventDefault();
        const splitId = splitter.dataset.splitId;
        const slotIdx = Number(splitter.dataset.slotIdx);
        const split = this.tree.get(splitId);
        if (!split) return;
        const containerEl = splitter.parentElement;
        const horizontal = split.dir === 'h';
        const rect = containerEl.getBoundingClientRect();
        const totalPx = horizontal ? rect.width : rect.height;
        this._drag = {
            splitId, slotIdx, horizontal, totalPx,
            startSizes: split.sizes.slice(),
            startPos: horizontal ? e.clientX : e.clientY,
            split,
        };
        document.body.classList.add('twm-dragging');
        const move = (ev) => this._onMouseMove(ev);
        const up = (ev) => {
            this._onMouseUp(ev);
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    }

    _onMouseMove(e) {
        if (!this._drag) return;
        const { horizontal, totalPx, startSizes, startPos, slotIdx, split } = this._drag;
        const delta = (horizontal ? e.clientX : e.clientY) - startPos;
        const totalSize = startSizes.reduce((a, b) => a + b, 0);
        const px = totalPx - SPLITTER_PX * (split.children.length - 1);
        if (px <= 0) return;
        const deltaFrac = (delta / px) * totalSize;
        const minFrac = totalSize * 0.05;
        const newSizes = startSizes.slice();
        newSizes[slotIdx] = Math.max(minFrac, startSizes[slotIdx] + deltaFrac);
        newSizes[slotIdx + 1] = Math.max(minFrac, startSizes[slotIdx + 1] - deltaFrac);
        // Snap back to total to avoid drift.
        const sum = newSizes.reduce((a, b) => a + b, 0);
        const scale = totalSize / sum;
        for (let i = 0; i < newSizes.length; i++) newSizes[i] *= scale;
        this.tree.setSplitSizes(split.id, newSizes);
        // Cheap update: just rewrite flex on the slots.
        const containerEl = document.querySelector(`.twm-split[data-split-id="${split.id}"]`);
        if (!containerEl) return;
        const slots = containerEl.querySelectorAll(':scope > .twm-slot');
        slots.forEach((slot, i) => {
            const frac = newSizes[i] / totalSize;
            slot.style.flex = `${frac} ${frac} 0`;
        });
    }

    _onMouseUp() {
        this._drag = null;
        document.body.classList.remove('twm-dragging');
    }
}


function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/**
 * C19. Decide, and paint, the glyph left of a tile's title.
 *
 * TWO SOURCES, IN THIS ORDER, and the order is the whole design. The content
 * factory's `content.icon` wins because only the content knows what this
 * PARTICULAR thing is — one table has a cog, the next has a calendar, and the
 * taxonomy has no opinion about either. Everything else falls back to
 * `taxonomy.meta(kind).icon`, which is the glyph the top-nav, the command
 * palette and the breadcrumb already draw for that kind — so an embedder who
 * changes nothing at all still gets a tile chrome that agrees with the three
 * surfaces around it, and an embedder who has never returned an `icon` from a
 * factory gets one for free.
 *
 * A kind with neither — a `panel:*` tile, whose kinds are the framework's own
 * and are deliberately not in anybody's taxonomy — is HIDDEN rather than blank.
 * The chrome is a flex row with a gap; an empty span would still take its gap
 * and push the title off the left margin by a glyph's worth of nothing.
 */
function _paintLeafIcon(iconEl, leaf, content, ctx) {
    if (!iconEl) return;
    const kind = leaf?.content?.kind;
    const name = content?.icon || (kind ? ctx?.taxonomy?.meta?.(kind)?.icon : null);
    iconEl.textContent = name || '';
    iconEl.hidden = !name;
}

/**
 * C18. Paint a content factory's own chrome buttons into its tile's strip.
 *
 * The framework owns the tile and its verbs; the embedder owns the content and
 * ITS verbs, and until now had nowhere to put them. Tables ended up hanging a
 * table's settings and its pop-out off the grid's own toolbar, one row further
 * down, where they read as things you do to the ROWS.
 *
 * Deliberately not a registry and not a config: the factory returns them from
 * the same object it already returns `title` and `destroy` on, so they arrive
 * with the mount and leave with it.
 */
function _paintContentActions(hostEl, specs) {
    hostEl.innerHTML = '';
    if (!Array.isArray(specs) || specs.length === 0) {
        hostEl.hidden = true;
        return;
    }
    hostEl.hidden = false;
    for (const spec of specs) {
        if (!spec || !spec.icon) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'twm-leaf__btn';
        btn.title = spec.title || '';
        btn.setAttribute('aria-label', spec.title || '');
        btn.innerHTML =
            `<span class="material-symbols-outlined">${spec.icon}</span>`;
        // `stopPropagation` so a click does not also reach the leaf's own
        // mousedown, which focuses the tile and then parks focus inside the
        // body — stealing it back from whatever the action just opened.
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            try { spec.onClick?.(); } catch (err) { console.error('[tile] action threw', err); }
        });
        hostEl.appendChild(btn);
    }
}

/**
 * C20. Let a content factory say a structural verb does not apply to it.
 *
 * Three answers, and the difference between the last two is a real one:
 *
 *   (absent) / true            the verb applies. The default, so an embedder
 *                              that says nothing gets every button as before.
 *   `false`                    the verb is MEANINGLESS here — remove it. A
 *                              panel tile cannot be floated; there is nothing to
 *                              explain, and a permanently dead control is
 *                              clutter that teaches nothing.
 *   `{ disabled, title }`      the verb applies to this KIND of pane but not
 *                              right now. Keep the button, grey it, and say
 *                              why — "you may close a pane, but not the last
 *                              one" is a rule the user should be able to
 *                              discover by pointing at the thing it governs,
 *                              rather than by noticing that a button they
 *                              remember is missing.
 */
function _vetoStructuralActions(hostEl, chrome) {
    if (!chrome) return;
    for (const [action, rule] of Object.entries(chrome)) {
        const btn = hostEl.querySelector(`[data-action="${action}"]`);
        if (!btn) continue;
        if (rule === false) { btn.remove(); continue; }
        if (rule && typeof rule === 'object' && rule.disabled) {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.classList.add('twm-leaf__btn--disabled');
            if (rule.title) btn.title = rule.title;
        }
    }
}
