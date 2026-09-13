/**
 * tile_tree.js — i3/sway-style binary tree for the tiling window manager.
 *
 * A workspace is one tree of Node objects:
 *
 *   Node = { id, kind: 'split' | 'leaf', parentId, ... }
 *   Split: { dir: 'h' | 'v', children: [childId, ...], sizes: [number, ...] }
 *   Leaf:  { tabs: [{kind, props, title}], activeTabIdx, content, title }
 *
 * **Tabs**. Each leaf carries an ordered list of tab specs and an active
 * index. The active tab is mirrored onto the legacy `content` /
 * `title` fields so the rest of the codebase (renderer, WM,
 * breadcrumb, navigateBack, …) keeps reading `leaf.content.kind`
 * unchanged. Single-tab leaves behave identically to today; multi-tab
 * leaves expose a small TabBar at the bottom of the tile.
 *
 * The tree carries no DOM. A separate renderer maps it to flex containers.
 * Mutations return new node-id arrays; consumers re-render after each call.
 */

let _idCounter = 1;
function _newId(prefix) { return `${prefix}-${_idCounter++}`; }

function _isPanel(leaf) {
    return String(leaf?.content?.kind || '').startsWith('panel:');
}

/** Mirror the active tab back onto `leaf.content` / `leaf.title` so the
 *  rest of the system sees no diff. Called after every tab mutation. */
function _syncActiveTab(leaf) {
    if (!leaf || leaf.kind !== 'leaf') return;
    const tabs = leaf.tabs || [];
    if (tabs.length === 0) {
        leaf.content = null;
        leaf.title = leaf.title || '';
        leaf.activeTabIdx = 0;
        return;
    }
    if (leaf.activeTabIdx == null
        || leaf.activeTabIdx < 0
        || leaf.activeTabIdx >= tabs.length) {
        leaf.activeTabIdx = Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0));
    }
    const t = tabs[leaf.activeTabIdx];
    leaf.content = { kind: t.kind, props: t.props || {} };
    leaf.title = t.title || t.kind || '';
}

export function makeLeaf({ content = null, title = '' } = {}) {
    const leaf = {
        id: _newId('leaf'),
        kind: 'leaf',
        parentId: null,
        // Tabs are the source of truth; content/title mirror tabs[active].
        tabs: content
            ? [{ kind: content.kind, props: content.props || {}, title: title || content.kind || '' }]
            : [],
        activeTabIdx: content ? 0 : 0,
        content,
        title,
        // Per-top-nav-page tab archive. When a top-nav button switches
        // this leaf to another page, the current `tabs` + `activeTabIdx`
        // get stashed here under the LEAVING page's key, and the target
        // page's archived list (if any) gets restored. This is what
        // makes a tile remember its tab set when the user clicks away to
        // another top-nav page and back. Keyed by top-nav kind — see the
        // taxonomy's `topNavFor`.
        pageTabs: {},
    };
    _syncActiveTab(leaf);
    return leaf;
}

export function makeSplit({ dir = 'h', children = [], sizes = null } = {}) {
    return {
        id: _newId('split'),
        kind: 'split',
        parentId: null,
        dir,
        children: children.slice(),
        sizes: sizes ? sizes.slice() : children.map(() => 1),
    };
}

/**
 * TileTree — holds the node table and root, exposes mutation operations.
 * Every mutation operates by node id; the tree never hands out raw nodes
 * to callers (defensive copies via .get()).
 */
export class TileTree {
    constructor() {
        this.nodes = new Map();
        this.rootId = null;
        this.focusedLeafId = null;
        // Stack of recently-focused leaves. New content loads target the
        // top of this stack — i.e. the last leaf the user focused.
        this.focusStack = [];
    }

    // ── Read helpers ────────────────────────────────────────────────
    get(id) { return this.nodes.get(id) || null; }
    root() { return this.rootId ? this.get(this.rootId) : null; }
    focused() { return this.focusedLeafId ? this.get(this.focusedLeafId) : null; }

    leaves() {
        const out = [];
        const walk = (id) => {
            const n = this.get(id);
            if (!n) return;
            if (n.kind === 'leaf') out.push(n);
            else n.children.forEach(walk);
        };
        if (this.rootId) walk(this.rootId);
        return out;
    }

    // ── Construction ───────────────────────────────────────────────
    setRoot(node) {
        this._register(node);
        this.rootId = node.id;
        if (node.kind === 'leaf') {
            this.focus(node.id);
        }
        return node.id;
    }

    _register(node) {
        this.nodes.set(node.id, node);
        if (node.kind === 'split') {
            for (const cid of node.children) {
                const c = this.get(cid);
                if (c) c.parentId = node.id;
            }
        }
    }

    // ── Focus ───────────────────────────────────────────────────────
    focus(leafId) {
        if (!this.nodes.has(leafId)) return;
        const node = this.get(leafId);
        if (node.kind !== 'leaf') return;
        this.focusedLeafId = leafId;
        this.focusStack = this.focusStack.filter((id) => id !== leafId);
        this.focusStack.unshift(leafId);
    }

    /** The leaf where "open content" should land — top of focus stack,
     *  skipping panel:* tiles which are chrome, not content. */
    primaryLeafId() {
        for (const id of this.focusStack) {
            const n = this.nodes.get(id);
            if (n && n.kind === 'leaf' && !_isPanel(n)) return id;
        }
        for (const leaf of this.leaves()) {
            if (!_isPanel(leaf)) return leaf.id;
        }
        return null;
    }

    // ── Mutations ───────────────────────────────────────────────────
    /** Replace the leaf's tab list with a single tab carrying `content`.
     *  Closes any existing tabs in that leaf — this is the "open in
     *  place" / "replace tile" path that the WM has always used. */
    setLeafContent(leafId, content, title = '') {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        if (content) {
            n.tabs = [{
                kind:  content.kind,
                props: content.props || {},
                title: title || content.kind || '',
            }];
            n.activeTabIdx = 0;
        } else {
            n.tabs = [];
            n.activeTabIdx = 0;
        }
        _syncActiveTab(n);
        if (title) n.title = title;
        return true;
    }

    /** Page-aware swap: archive the leaf's current tab list under its
     *  current top-nav key, then restore the target top-nav's archived
     *  list (or initialize one with the requested kind/props). Used
     *  by top-nav / palette navigation so each top-nav page keeps its
     *  own tab set across page switches.
     *
     *  Parameters:
     *    leafId         The primary leaf.
     *    target         { kind, props, title } — what the user clicked.
     *    currentTopNav  Top-nav of the leaf's current page (may be null).
     *    targetTopNav   Top-nav of the target kind (must be set).
     *
     *  When `currentTopNav === targetTopNav` (already on the right
     *  page), the swap is skipped and we either focus an existing
     *  matching tab or replace the active one. This is what makes
     *  clicking the top-nav button for the page you're already on
     *  feel like "Home for this page" without resetting tabs. */
    swapToPage(leafId, target, currentTopNav, targetTopNav, opts = {}) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        if (!target || !target.kind) return false;
        n.pageTabs = n.pageTabs || {};
        const recordHistory = opts.recordHistory !== false;

        // Helper: mirror what replaceActiveTabContent does — push the
        // outgoing tab onto the (incoming) tab's history stack so
        // Backspace can walk back. `extra` is an optional annotation
        // (e.g. `{ topNav: currentTopNav }`) for cross-page entries so
        // navigateBack can re-route via swapToPage when popping.
        const _pushPrev = (history, prev, next, extra) => {
            if (!recordHistory || !prev || !prev.kind) return history;
            const last = history[history.length - 1];
            const sameAsPrev = last
                && last.kind === prev.kind
                && String(last.props?.id ?? '') === String(prev.props?.id ?? '');
            const sameAsTarget = next
                && prev.kind === next.kind
                && String(prev.props?.id ?? '') === String(next.props?.id ?? '');
            if (!sameAsPrev && !sameAsTarget) {
                history.push({
                    kind:  prev.kind,
                    props: prev.props || {},
                    title: prev.title || '',
                    ...(extra || {}),
                });
            }
            return history;
        };

        const same = currentTopNav && currentTopNav === targetTopNav;
        if (same) {
            const tabs = n.tabs || [];
            const matchIdx = tabs.findIndex((t) =>
                t.kind === target.kind
                && String(t.props?.id ?? '') === String(target.props?.id ?? ''));
            if (matchIdx >= 0) {
                n.activeTabIdx = matchIdx;
            } else if (tabs.length === 0) {
                n.tabs = [{
                    kind: target.kind,
                    props: target.props || {},
                    title: target.title || target.kind,
                    history: [],
                }];
                n.activeTabIdx = 0;
            } else {
                const prev = tabs[n.activeTabIdx];
                const history = Array.isArray(prev?.history) ? prev.history : [];
                _pushPrev(history, prev, target, null);
                tabs[n.activeTabIdx] = {
                    kind: target.kind,
                    props: target.props || {},
                    title: target.title || target.kind,
                    history,
                };
            }
            _syncActiveTab(n);
            return true;
        }

        // Snapshot the source tab BEFORE archiving — used to seed the
        // target tab's history with a cross-page back entry.
        const srcTabs = Array.isArray(n.tabs) ? n.tabs : [];
        const srcActive = srcTabs[n.activeTabIdx];
        const sourceEntry = (currentTopNav && srcActive?.kind) ? {
            kind:  srcActive.kind,
            props: srcActive.props || {},
            title: srcActive.title || '',
            topNav: currentTopNav,
        } : null;

        // Archive the current page — preserve `history` so the user
        // doesn't lose in-tile back depth when they walk away and
        // return to this page.
        if (currentTopNav && srcTabs.length > 0) {
            // Don't archive transient tabs (add-row forms etc.) — they
            // shouldn't reappear when the user returns to this page.
            const archived = srcTabs
                .filter((t) => !t.transient)
                .map((t) => ({
                    kind: t.kind, props: { ...(t.props || {}) }, title: t.title,
                    history: Array.isArray(t.history) ? t.history.slice() : [],
                }));
            n.pageTabs[currentTopNav] = {
                tabs: archived,
                activeTabIdx: Math.max(0, Math.min(archived.length - 1, n.activeTabIdx || 0)),
            };
        }

        // Restore the target page, or initialize fresh.
        const saved = n.pageTabs[targetTopNav];
        if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) {
            n.tabs = saved.tabs.map((t) => ({
                kind: t.kind, props: { ...(t.props || {}) }, title: t.title,
                history: Array.isArray(t.history) ? t.history.slice() : [],
            }));
            n.activeTabIdx = Math.max(0,
                Math.min(n.tabs.length - 1, saved.activeTabIdx || 0));
            // The caller asked for a specific entity (props.id), for a page
            // kind that ISN'T the nav category itself (e.g. `settings` lives
            // under the `home` topNav), or for this page WITH PARTICULAR PROPS
            // (a filter, an ad-hoc expression). In all three we must surface the
            // requested target rather than silently showing whatever the
            // restored page happened to hold.
            //
            // THE THIRD CASE WAS MISSING, and it is not a corner: "show me
            // everything open on bo" is `kind: 'backlog'` with an `expr` and no
            // id — no entity, and `backlog` IS its own nav category — so it fell
            // through to the bare-restore branch and put back whatever the page
            // last held. If that was a record you had been reading, the tile did
            // not visibly change at all, and the click looked broken. (Found and
            // fixed in BugDesk's fork first; this is that fix, upstream.)
            //
            // A BARE page switch still restores as-is, which is the whole point
            // of archiving tabs: clicking a top-nav chip carries no props and
            // must put back the tab you left open.
            const wantsTarget = target.props?.id != null
                             || target.kind !== targetTopNav
                             || Object.keys(target.props || {}).length > 0;
            if (wantsTarget) {
                const wantId = target.props?.id != null;
                const matchIdx = n.tabs.findIndex((t) =>
                    t.kind === target.kind
                    && (!wantId
                        || String(t.props?.id ?? '') === String(target.props.id)));
                if (matchIdx >= 0) {
                    n.activeTabIdx = matchIdx;
                } else {
                    const history = [];
                    if (sourceEntry) _pushPrev(history, sourceEntry, target, { topNav: currentTopNav });
                    n.tabs.push({
                        kind: target.kind,
                        props: target.props || {},
                        title: target.title || target.kind,
                        history,
                    });
                    n.activeTabIdx = n.tabs.length - 1;
                }
            }
        } else {
            const history = [];
            if (sourceEntry) _pushPrev(history, sourceEntry, target, { topNav: currentTopNav });
            n.tabs = [{
                kind: target.kind,
                props: target.props || {},
                title: target.title || target.kind,
                history,
            }];
            n.activeTabIdx = 0;
        }
        _syncActiveTab(n);
        return true;
    }

    /** Update any tab whose (kind, props.id) matches the given pair to
     *  reflect a new label. Called from the WM in response to the
     *  embedder's entity-renamed bus event, so tab titles stay live as
     *  the underlying entity is renamed. */
    renameMatchingTabs(kind, id, newLabel) {
        if (!kind || !id || !newLabel) return false;
        let touched = false;
        const visit = (tabs) => {
            if (!Array.isArray(tabs)) return;
            for (const t of tabs) {
                if (t.kind === kind && String(t.props?.id ?? '') === String(id)) {
                    t.title = String(newLabel);
                    if (t.props) t.props.label = String(newLabel);
                    touched = true;
                }
            }
        };
        for (const n of this.nodes.values()) {
            if (n.kind !== 'leaf') continue;
            visit(n.tabs);
            if (n.pageTabs) {
                for (const arc of Object.values(n.pageTabs)) visit(arc?.tabs);
            }
            _syncActiveTab(n);
        }
        return touched;
    }

    /** Replace the active tab's content in place, preserving every
     *  other tab in the leaf. This is the "in-tile navigation" path:
     *  clicking a row on a landing page, walking back via Backspace,
     *  or clicking a breadcrumb segment should swap THIS tab's
     *  content without disturbing the user's other open tabs.
     *
     *  By default the previous content is pushed onto the active
     *  tab's `history` stack so the user can Backspace through their
     *  own click-path (per-tab "browser back"). Callers that are
     *  themselves popping the history pass `{ recordHistory: false }`
     *  so we don't double-record. Same applies to programmatic loads
     *  that aren't user navigations.
     *
     *  Falls back to `setLeafContent` for empty leaves so the WM
     *  never has to special-case the initial load. Returns true on
     *  success. */
    replaceActiveTabContent(leafId, content, title = '', opts = {}) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = Array.isArray(n.tabs) ? n.tabs : [];
        if (tabs.length === 0) {
            return this.setLeafContent(leafId, content, title);
        }
        if (!content) return false;
        const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
        const prev = tabs[idx];
        const recordHistory = opts.recordHistory !== false;
        const history = Array.isArray(prev?.history) ? prev.history : [];
        if (recordHistory && prev && prev.kind) {
            // Avoid pushing duplicates when the user re-clicks the
            // same row — same kind + same primary id → no-op.
            const last = history[history.length - 1];
            const sameAsPrev = last
                && last.kind === prev.kind
                && String(last.props?.id ?? '') === String(prev.props?.id ?? '');
            const sameAsTarget = prev.kind === content.kind
                && String(prev.props?.id ?? '') === String(content.props?.id ?? '');
            if (!sameAsPrev && !sameAsTarget) {
                history.push({
                    kind:  prev.kind,
                    props: prev.props || {},
                    title: prev.title || '',
                });
            }
        }
        tabs[idx] = {
            kind:  content.kind,
            props: content.props || {},
            title: title || content.kind || '',
            history,
        };
        _syncActiveTab(n);
        return true;
    }

    /** Merge `patch` into the active tab's `props`. Used when an
     *  in-tile editor surfaces metadata that should be captured in
     *  history snapshots (e.g. which sub-tab is open) so Backspace
     *  restores the user's view, not the default landing. Does not
     *  re-render or push history — pure metadata write. */
    updateActiveTabProps(leafId, patch) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = Array.isArray(n.tabs) ? n.tabs : [];
        if (tabs.length === 0) return false;
        const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
        const cur = tabs[idx];
        if (!cur) return false;
        cur.props = { ...(cur.props || {}), ...(patch || {}) };
        return true;
    }

    /** Pop one entry off the active tab's history stack and return it,
     *  or null when empty. Doesn't mutate the tab beyond the stack —
     *  the caller is expected to apply the returned content via
     *  `replaceActiveTabContent(..., { recordHistory: false })`. */
    popActiveTabHistory(leafId) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return null;
        const tabs = Array.isArray(n.tabs) ? n.tabs : [];
        if (tabs.length === 0) return null;
        const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
        const cur = tabs[idx];
        const history = Array.isArray(cur?.history) ? cur.history : [];
        if (history.length === 0) return null;
        return history.pop();
    }

    /** Inspect the active tab's history stack without popping. Used
     *  by the keymap to show / hide the back affordance and for
     *  diagnostics. */
    activeTabHistory(leafId) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return [];
        const tabs = Array.isArray(n.tabs) ? n.tabs : [];
        if (tabs.length === 0) return [];
        const idx = Math.max(0, Math.min(tabs.length - 1, n.activeTabIdx || 0));
        const cur = tabs[idx];
        return Array.isArray(cur?.history) ? cur.history : [];
    }

    /** Append a new tab to a leaf and focus it. Returns the new tab's
     *  index, or -1 on failure. Panel tiles never grow tabs (they're
     *  chrome). */
    appendLeafTab(leafId, content, title = '', opts = {}) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return -1;
        if (_isPanel(n)) return -1;
        if (!content) return -1;
        const tab = {
            kind:  content.kind,
            props: content.props || {},
            title: title || content.kind || '',
            // Transient tabs (e.g. an add-row form) are not persisted /
            // restored — see serialize() + the pageTabs archive.
            ...(opts.transient ? { transient: true } : {}),
        };
        n.tabs = Array.isArray(n.tabs) ? n.tabs : [];
        n.tabs.push(tab);
        // `background` appends WITHOUT switching to it — the caller asked for a
        // tab to come back to, not for the page to change under them. Without
        // this, "open in a background tab" was indistinguishable from an
        // ordinary click: the tab arrived and took the screen with it.
        //
        // Returns the new tab's index either way, NOT `activeTabIdx`: for a
        // background tab those differ, and a caller that wants to address the
        // tab it just made needs the index of that tab.
        if (!opts.background) {
            n.activeTabIdx = n.tabs.length - 1;
            _syncActiveTab(n);
        }
        return n.tabs.length - 1;
    }

    /** Switch the active tab on a leaf. No-op if `idx` is out of range. */
    setActiveLeafTab(leafId, idx) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        if (!Array.isArray(n.tabs) || idx < 0 || idx >= n.tabs.length) return false;
        n.activeTabIdx = idx;
        _syncActiveTab(n);
        return true;
    }

    /** Remove a tab. If the active tab was removed, the previous one
     *  becomes active. If the last tab was removed, the leaf's content
     *  drops to null (and the WM should treat that as an empty tile —
     *  same as before tabs existed). Returns the (possibly clamped)
     *  active index after the operation, or -1 on failure. */
    removeLeafTab(leafId, idx) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return -1;
        if (!Array.isArray(n.tabs) || idx < 0 || idx >= n.tabs.length) return -1;
        n.tabs.splice(idx, 1);
        if (n.tabs.length === 0) {
            n.activeTabIdx = 0;
            _syncActiveTab(n);
            return 0;
        }
        if (idx < n.activeTabIdx) n.activeTabIdx -= 1;
        else if (idx === n.activeTabIdx) n.activeTabIdx = Math.max(0, idx - 1);
        _syncActiveTab(n);
        return n.activeTabIdx;
    }

    /** Bulk-close every tab in a leaf except the one at `keepIdx`.
     *  Used by the tab right-click "Close others" action. */
    closeOtherTabs(leafId, keepIdx) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = n.tabs || [];
        if (keepIdx < 0 || keepIdx >= tabs.length) return false;
        n.tabs = [tabs[keepIdx]];
        n.activeTabIdx = 0;
        _syncActiveTab(n);
        return true;
    }

    /** Close every tab after `idx`. */
    closeTabsAfter(leafId, idx) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = n.tabs || [];
        if (idx < 0 || idx >= tabs.length - 1) return false;
        n.tabs = tabs.slice(0, idx + 1);
        if (n.activeTabIdx > idx) n.activeTabIdx = idx;
        _syncActiveTab(n);
        return true;
    }

    /** Close every tab before `idx`. */
    closeTabsBefore(leafId, idx) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = n.tabs || [];
        if (idx <= 0 || idx >= tabs.length) return false;
        n.tabs = tabs.slice(idx);
        n.activeTabIdx = Math.max(0, n.activeTabIdx - idx);
        _syncActiveTab(n);
        return true;
    }

    /** Reorder a tab from `from` to `to` within the same leaf. */
    moveLeafTab(leafId, from, to) {
        const n = this.get(leafId);
        if (!n || n.kind !== 'leaf') return false;
        const tabs = n.tabs || [];
        if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return false;
        const moved = tabs.splice(from, 1)[0];
        tabs.splice(to, 0, moved);
        // Keep the moved tab focused if it was the active one.
        if (n.activeTabIdx === from) n.activeTabIdx = to;
        else if (from < n.activeTabIdx && to >= n.activeTabIdx) n.activeTabIdx -= 1;
        else if (from > n.activeTabIdx && to <= n.activeTabIdx) n.activeTabIdx += 1;
        _syncActiveTab(n);
        return true;
    }

    /**
     * C33. MOVE ONE TAB FROM ONE LEAF TO ANOTHER, AS ONE MUTATION.
     *
     * Every other tab operation on this class takes ONE `leafId`, and that was
     * a complete description of the model until a tab could be dragged into a
     * different tile: `appendLeafTab`, `removeLeafTab`, `moveLeafTab` and the
     * three bulk closes all begin and end inside a single leaf. The renderer's
     * refusal to wire `onDropFromOtherPane` named this absence as one of its
     * two reasons (`tile_renderer.js`, `_topTabCallbacks`); this is that half.
     *
     * ONE FUNCTION RATHER THAN A COMPOSE, and that is why it lives here rather
     * than in the WM. `removeLeafTab` then `appendLeafTab` is two mutations
     * with a moment between them in which the tab exists nowhere — and the
     * second can FAIL (a panel destination refuses tabs), which leaves the tree
     * short one tab and nothing on screen saying where it went. Every guard is
     * therefore taken before the first splice.
     *
     * TWO NODES ARE RE-SYNCED, WHICH IS WHAT MAKES THIS DIFFERENT. `tabs` is
     * the source of truth and `content`/`title` mirror `tabs[active]`
     * (`_syncActiveTab`). Every existing mutation touches one leaf, so one
     * re-sync is right; this one touches two, and skipping the SOURCE's leaves
     * a pane whose chrome still names — and whose body still mounts — a tab it
     * no longer holds. That is the mistake this operation invites, and it is
     * what `web/js/shell/tab_drop.test.mjs` asserts against in the consumer.
     *
     * A same-leaf call is a REORDER and delegates, so there is one
     * implementation of "a tab changed position within its strip" rather than
     * two that will disagree about the active-index clamp.
     *
     * @param {string} fromLeafId
     * @param {number} fromIdx
     * @param {string} toLeafId
     * @param {number} [toIdx=-1]  where to insert; -1 (or past the end) appends
     * @returns {{ok: boolean, toIdx: number, emptied: boolean}|null} null when
     *   the move was refused. `emptied` tells the caller the source pane now
     *   holds nothing, which is its cue to re-seed rather than leave a blank
     *   tile — the never-empty-tile invariant is the WM's to keep, not this
     *   class's.
     */
    moveTabToLeaf(fromLeafId, fromIdx, toLeafId, toIdx = -1) {
        const from = this.get(fromLeafId);
        const to = this.get(toLeafId);
        if (!from || from.kind !== 'leaf') return null;
        if (!to || to.kind !== 'leaf') return null;
        const tabs = Array.isArray(from.tabs) ? from.tabs : [];
        if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= tabs.length) return null;
        // Panel tiles are chrome, not content, and never grow tabs — the same
        // refusal `appendLeafTab` makes, taken here BEFORE anything is spliced
        // so a refused destination cannot cost the source its tab.
        if (_isPanel(to)) return null;
        if (fromLeafId === toLeafId) {
            const dest = (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= tabs.length)
                ? tabs.length - 1 : toIdx;
            if (!this.moveLeafTab(fromLeafId, fromIdx, dest)) return null;
            return { ok: true, toIdx: dest, emptied: false };
        }

        const [moved] = from.tabs.splice(fromIdx, 1);
        // THE SOURCE'S ACTIVE INDEX, WITH `removeLeafTab`'S OWN THREE BRANCHES.
        // Spelled out rather than delegated because `removeLeafTab` re-syncs
        // and returns, and the splice above has already happened; the
        // arithmetic is the contract, so it is written where it can be compared
        // against the original line for line.
        if (from.tabs.length === 0) from.activeTabIdx = 0;
        else if (fromIdx < from.activeTabIdx) from.activeTabIdx -= 1;
        else if (fromIdx === from.activeTabIdx) from.activeTabIdx = Math.max(0, fromIdx - 1);

        to.tabs = Array.isArray(to.tabs) ? to.tabs : [];
        const at = (!Number.isInteger(toIdx) || toIdx < 0 || toIdx > to.tabs.length)
            ? to.tabs.length : toIdx;
        to.tabs.splice(at, 0, moved);
        // THE ARRIVING TAB IS THE ONE YOU WANTED TO SEE. A drop is a deliberate
        // act naming one tab and one destination; leaving the destination on
        // whatever it was already showing would make the gesture look like it
        // did nothing, which is the failure mode of every silent move.
        to.activeTabIdx = at;

        _syncActiveTab(from);
        _syncActiveTab(to);
        return { ok: true, toIdx: at, emptied: from.tabs.length === 0 };
    }

    /**
     * Split a leaf in the given direction; existing content stays in the
     * original leaf, a new empty leaf is added next to it. Returns the
     * new leaf id, or null on failure.
     */
    split(leafId, dir /* 'h' | 'v' */) {
        const leaf = this.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return null;
        // A PANEL IS NEVER SPLIT. The left, right and bottom panels are fixed
        // chrome around the content area, and a split of one put a second
        // pane inside the navigator. Refused here, where every split path
        // meets, so no chord, menu or drop can do it by another route.
        if (_isPanel(leaf)) return null;

        const newLeaf = makeLeaf();
        // Case 1: root split. Wrap root in a new Split.
        if (!leaf.parentId) {
            const wrap = makeSplit({ dir, children: [leaf.id, newLeaf.id] });
            this._register(newLeaf);
            this._register(wrap);
            this.rootId = wrap.id;
            leaf.parentId = wrap.id;
            newLeaf.parentId = wrap.id;
            this.focus(newLeaf.id);
            return newLeaf.id;
        }

        const parent = this.get(leaf.parentId);
        const idx = parent.children.indexOf(leaf.id);
        if (idx < 0) return null;

        // Case 2: parent already matches the split direction — insert
        // the new leaf as a sibling.
        if (parent.dir === dir) {
            parent.children.splice(idx + 1, 0, newLeaf.id);
            const avg = parent.sizes.reduce((a, b) => a + b, 0) / parent.children.length;
            parent.sizes.splice(idx + 1, 0, avg);
            newLeaf.parentId = parent.id;
            this._register(newLeaf);
            this.focus(newLeaf.id);
            return newLeaf.id;
        }

        // Case 3: cross-direction — wrap the original leaf in a new
        // Split that contains [leaf, newLeaf]. Replace leaf in parent.
        const wrap = makeSplit({ dir, children: [leaf.id, newLeaf.id] });
        wrap.parentId = parent.id;
        parent.children[idx] = wrap.id;
        leaf.parentId = wrap.id;
        newLeaf.parentId = wrap.id;
        this._register(newLeaf);
        this._register(wrap);
        this.focus(newLeaf.id);
        return newLeaf.id;
    }

    /**
     * Close a leaf, collapsing any single-child splits that result. If
     * the last leaf is closed, leaves an empty tree (no root) — caller
     * is expected to repopulate.
     */
    close(leafId) {
        const leaf = this.get(leafId);
        if (!leaf || leaf.kind !== 'leaf') return false;

        // Root leaf — clear the tree.
        if (!leaf.parentId) {
            this.nodes.clear();
            this.rootId = null;
            this.focusedLeafId = null;
            this.focusStack = [];
            return true;
        }

        const parent = this.get(leaf.parentId);
        const idx = parent.children.indexOf(leaf.id);
        parent.children.splice(idx, 1);
        parent.sizes.splice(idx, 1);
        this.nodes.delete(leaf.id);
        this.focusStack = this.focusStack.filter((id) => id !== leaf.id);

        // Parent collapse — if a Split has only one child left, replace
        // it with that child in *its* parent (or as root).
        this._collapse(parent);

        if (this.focusedLeafId === leaf.id) {
            const remaining = this.leaves();
            this.focusedLeafId = remaining.length ? remaining[0].id : null;
            if (this.focusedLeafId) this.focus(this.focusedLeafId);
        }
        return true;
    }

    _collapse(node) {
        if (!node || node.kind !== 'split') return;
        if (node.children.length > 1) return;
        if (node.children.length === 0) {
            // Empty split — remove from its parent (or clear root).
            if (!node.parentId) {
                this.nodes.delete(node.id);
                this.rootId = null;
                return;
            }
            const gp = this.get(node.parentId);
            const idx = gp.children.indexOf(node.id);
            gp.children.splice(idx, 1);
            gp.sizes.splice(idx, 1);
            this.nodes.delete(node.id);
            this._collapse(gp);
            return;
        }
        // Exactly one child — promote it.
        const only = this.get(node.children[0]);
        if (!node.parentId) {
            this.rootId = only.id;
            only.parentId = null;
        } else {
            const gp = this.get(node.parentId);
            const idx = gp.children.indexOf(node.id);
            gp.children[idx] = only.id;
            only.parentId = gp.id;
        }
        this.nodes.delete(node.id);
    }

    // ── Directional focus ──────────────────────────────────────────
    /**
     * Move focus from current leaf in the given direction. Walks up the
     * tree looking for an ancestor split whose direction matches the
     * move (h for left/right, v for up/down) and which has a sibling on
     * the requested side; then descends along the matching edge.
     */
    focusDir(dir /* 'left' | 'right' | 'up' | 'down' */) {
        const cur = this.focused();
        if (!cur) return false;
        const wantDir = (dir === 'left' || dir === 'right') ? 'h' : 'v';
        const forward = (dir === 'right' || dir === 'down');

        let child = cur;
        let parent = child.parentId ? this.get(child.parentId) : null;
        while (parent) {
            if (parent.dir === wantDir) {
                const idx = parent.children.indexOf(child.id);
                const sibIdx = forward ? idx + 1 : idx - 1;
                if (sibIdx >= 0 && sibIdx < parent.children.length) {
                    const target = this._descendEdge(parent.children[sibIdx],
                        wantDir, !forward);
                    if (target) {
                        this.focus(target);
                        return true;
                    }
                }
            }
            child = parent;
            parent = child.parentId ? this.get(child.parentId) : null;
        }
        return false;
    }

    /**
     * Walk down to a leaf. For the matching direction we take the
     * `edge` end (first/last). For the orthogonal direction we just
     * take the first child.
     */
    _descendEdge(nodeId, matchDir, takeFirst) {
        let n = this.get(nodeId);
        while (n && n.kind !== 'leaf') {
            const idx = n.dir === matchDir
                ? (takeFirst ? 0 : n.children.length - 1)
                : 0;
            n = this.get(n.children[idx]);
        }
        return n ? n.id : null;
    }

    // ── Move tile ──────────────────────────────────────────────────
    /**
     * Move the focused leaf one position in the given direction. Simple
     * version: swap with the immediate sibling in the matching parent;
     * if no such sibling, no-op (deep moves come later if needed).
     */
    moveDir(dir) {
        const cur = this.focused();
        if (!cur || !cur.parentId) return false;
        const wantDir = (dir === 'left' || dir === 'right') ? 'h' : 'v';
        const forward = (dir === 'right' || dir === 'down');

        let child = cur;
        let parent = this.get(child.parentId);
        while (parent && parent.dir !== wantDir) {
            child = parent;
            parent = child.parentId ? this.get(child.parentId) : null;
        }
        if (!parent) return false;
        const idx = parent.children.indexOf(child.id);
        const swap = forward ? idx + 1 : idx - 1;
        if (swap < 0 || swap >= parent.children.length) return false;
        [parent.children[idx], parent.children[swap]] =
            [parent.children[swap], parent.children[idx]];
        [parent.sizes[idx], parent.sizes[swap]] =
            [parent.sizes[swap], parent.sizes[idx]];
        return true;
    }

    // ── Resize ──────────────────────────────────────────────────────
    setSplitSizes(splitId, sizes) {
        const n = this.get(splitId);
        if (!n || n.kind !== 'split') return false;
        if (sizes.length !== n.children.length) return false;
        n.sizes = sizes.slice();
        return true;
    }

    // ── Serialization (for desktops persistence) ──────────────────
    serialize() {
        if (!this.rootId) return null;
        const dump = (id) => {
            const n = this.get(id);
            if (n.kind === 'leaf') {
                // Transient tabs (add-row forms etc.) are not persisted.
                const liveTabs = (Array.isArray(n.tabs) ? n.tabs : [])
                    .filter((t) => !t.transient)
                    .map((t) => ({ kind: t.kind, props: t.props, title: t.title }));
                return {
                    kind: 'leaf',
                    title: n.title,
                    content: n.content,
                    tabs: liveTabs,
                    activeTabIdx: Math.max(0, Math.min(liveTabs.length - 1, n.activeTabIdx || 0)),
                    // Page-archive: per-top-nav-kind saved tab lists so
                    // switching to a previously-visited page restores
                    // its tabs across reloads.
                    pageTabs: n.pageTabs
                        ? Object.fromEntries(
                            Object.entries(n.pageTabs).map(([k, v]) => {
                                const pt = (v.tabs || [])
                                    .filter((t) => !t.transient)
                                    .map((t) => ({ kind: t.kind, props: t.props, title: t.title }));
                                return [k, {
                                    tabs: pt,
                                    activeTabIdx: Math.max(0, Math.min(pt.length - 1, v.activeTabIdx || 0)),
                                }];
                            }))
                        : {},
                };
            }
            return {
                kind: 'split', dir: n.dir, sizes: n.sizes.slice(),
                children: n.children.map(dump),
            };
        };
        return {
            root: dump(this.rootId),
            focusedTitle: this.focused()?.title || null,
        };
    }

    static deserialize(blob) {
        const t = new TileTree();
        if (!blob || !blob.root) return t;
        const build = (raw) => {
            if (raw.kind === 'leaf') {
                // Forward-compat with the pre-tabs layout: an old
                // serialized leaf carries `content` but no `tabs`.
                // makeLeaf will derive a single-tab list from `content`.
                const leaf = makeLeaf({ content: raw.content, title: raw.title });
                if (Array.isArray(raw.tabs) && raw.tabs.length > 0) {
                    leaf.tabs = raw.tabs.map((tab) => ({
                        kind:  tab.kind,
                        props: tab.props || {},
                        title: tab.title || tab.kind || '',
                    }));
                    leaf.activeTabIdx = Math.max(0,
                        Math.min(leaf.tabs.length - 1, raw.activeTabIdx || 0));
                    _syncActiveTab(leaf);
                }
                if (raw.pageTabs && typeof raw.pageTabs === 'object') {
                    leaf.pageTabs = {};
                    for (const [k, v] of Object.entries(raw.pageTabs)) {
                        if (!v || !Array.isArray(v.tabs)) continue;
                        leaf.pageTabs[k] = {
                            tabs: v.tabs.map((t) => ({
                                kind:  t.kind,
                                props: t.props || {},
                                title: t.title || t.kind || '',
                            })),
                            activeTabIdx: v.activeTabIdx || 0,
                        };
                    }
                }
                return leaf;
            }
            const children = raw.children.map(build);
            const split = makeSplit({
                dir: raw.dir, children: children.map((c) => c.id),
                sizes: raw.sizes,
            });
            children.forEach((c) => t._register(c));
            return split;
        };
        const root = build(blob.root);
        t.setRoot(root);
        return t;
    }
}
