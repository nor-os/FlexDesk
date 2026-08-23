/**
 * tile_renderer.js — maps a TileTree into nested flex containers, with
 * resize splitters between siblings and a chrome strip per leaf.
 *
 * The renderer keeps a small per-leaf DOM cache so content factories
 * mount exactly once per (kind, props) pair — switching the focused
 * leaf or resizing doesn't re-mount tabs / pages.
 */

const SPLITTER_PX = 4;

export class TileRenderer {
    constructor({ root, tree, content, ctx, onFocusChange }) {
        if (!content || typeof content.mount !== 'function') {
            throw new Error('TileRenderer: a content registry is required');
        }
        this.root = root;
        this.tree = tree;
        // Shell-scoped kind -> factory table (see content_registry.js).
        this.content = content;
        this.ctx = ctx || {};
        this.onFocusChange = onFocusChange || (() => {});
        // leafId -> { wrapEl, bodyEl, chromeEl, content, kindKey }
        this._leafCache = new Map();
        this._drag = null;
        this.root.classList.add('twm-root');
        this.root.addEventListener('mousedown', this._onMouseDown.bind(this));
    }

    render() {
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
        this.root.innerHTML = '';
        const tree = this.tree;
        if (!tree.rootId) {
            const empty = document.createElement('div');
            empty.className = 'twm-empty';
            empty.textContent = 'Empty desktop — Ctrl+K to open something.';
            this.root.appendChild(empty);
            this._cleanCache(new Set());
            return;
        }
        const liveLeafIds = new Set();
        this._mount(tree.rootId, this.root, liveLeafIds);
        this._cleanCache(liveLeafIds);
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
    }

    _cleanCache(liveSet) {
        for (const [leafId, entry] of [...this._leafCache.entries()]) {
            if (!liveSet.has(leafId)) {
                try { entry.content?.destroy?.(); } catch (_) {}
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
        const tabFingerprint = (leaf.tabs || []).map((t) =>
            `${t.kind}::${JSON.stringify(t.props || {})}`).join('|') + `#${leaf.activeTabIdx || 0}`;
        const kindKey = leaf.content
            ? `${leaf.content.kind}::${JSON.stringify(leaf.content.props || {})}::tabs:${tabFingerprint}`
            : '__empty__';

        let entry = this._leafCache.get(leaf.id);
        if (entry && entry.kindKey === kindKey) {
            entry.titleEl.textContent = leaf.title || (leaf.content ? leaf.content.kind : 'empty');
            return entry.wrapEl;
        }
        // Build fresh.
        if (entry) {
            try { entry.content?.destroy?.(); } catch (_) {}
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
        const title = document.createElement('span');
        title.className = 'twm-leaf__title';
        title.textContent = leaf.title || (leaf.content ? leaf.content.kind : 'empty');
        const actions = document.createElement('span');
        actions.className = 'twm-leaf__actions';
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
                <button class="twm-leaf__btn" data-action="promote" title="Promote to window (Alt+F)">
                    <span class="material-symbols-outlined">open_in_new</span>
                </button>`}
            <button class="twm-leaf__btn" data-action="close" title="Close (Alt+W)">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
        chrome.append(title, actions);
        const body = document.createElement('div');
        body.className = 'twm-leaf__body';
        body.tabIndex = -1; // focusable via JS so document.activeElement
                            // lands inside the body when the tile is
                            // activated (keyboard-handler scope check).
        // Bottom tab strip — only rendered when the leaf carries
        // more than one tab. The strip is built/rebuilt as part of
        // the leaf element, not the body, so it stays pinned at the
        // bottom of the tile regardless of body scroll.
        const tabBar = document.createElement('div');
        tabBar.className = 'twm-leaf__tabbar';
        if (!Array.isArray(leaf.tabs) || leaf.tabs.length <= 1) {
            tabBar.classList.add('twm-leaf__tabbar--hidden');
        }
        wrap.append(chrome, body, tabBar);

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
        } else {
            body.innerHTML = `<div class="tile-placeholder"><div class="tile-placeholder__hint">empty tile</div></div>`;
        }
        entry = { wrapEl: wrap, bodyEl: body, chromeEl: chrome,
                  titleEl: title, content, kindKey, tabBarEl: tabBar };
        this._leafCache.set(leaf.id, entry);

        // Render tab strip last so it has access to the cached entry.
        this._renderTabBar(leaf, entry);
        return wrap;
    }

    /** Paint a leaf's bottom tab strip. The strip is hidden for
     *  single-tab leaves (the common case) so existing layouts read as
     *  identical to today. Hamburger button at the start, then one
     *  trapezoid-shaped tab per stored tab spec. */
    _renderTabBar(leaf, entry) {
        const bar = entry.tabBarEl;
        if (!bar) return;
        const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
        if (tabs.length <= 1) {
            bar.classList.add('twm-leaf__tabbar--hidden');
            bar.innerHTML = '';
            return;
        }
        bar.classList.remove('twm-leaf__tabbar--hidden');
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
        let dragFromIdx = null;
        bar.querySelectorAll('.twm-leaf__tab').forEach((li) => {
            li.addEventListener('dragstart', (ev) => {
                dragFromIdx = Number(li.dataset.tabIdx);
                ev.dataTransfer.effectAllowed = 'move';
                // Firefox refuses to start a drag unless setData is
                // called — supply a placeholder string.
                try { ev.dataTransfer.setData('text/plain', String(dragFromIdx)); }
                catch {}
            });
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
