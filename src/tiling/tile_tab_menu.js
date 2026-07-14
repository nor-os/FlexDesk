/**
 * tile_tab_menu.js — pop-out menu mounted by the tile's hamburger
 * button. Surfaces the same content the tile's *home page* would
 * list, grouped into one section per source table, with a built-in
 * search, per-section pagination, and full keyboard navigation.
 *
 * Click (or Enter on the active row) to open the entity in a NEW TAB
 * on the same tile. The menu only exists when the tab bar is visible
 * (≥2 tabs).
 *
 * Source resolution: the menu asks the injected taxonomy which entity
 * sources a tile on this page should list (`taxonomy.sourcesFor`), then
 * asks the injected catalog to fetch and shape them. It knows the name
 * of neither. Which sources a page offers is one field on the
 * embedder's KindDef; it used to be a hardcoded table right here.
 *
 * Keyboard interactions:
 *   ↑ ↓        move the row cursor across ALL visible items (the
 *              cursor flows section-to-section, not just within one).
 *   Home/End   jump to the first / last visible row.
 *   PageDown/  flip the focused section's pager when no search is active.
 *   PageUp
 *   Enter      pick the cursor row.
 *   Esc        close.
 *
 * Search semantics:
 *   - Match runs against the shaped (label, id, hint) of every raw row,
 *     so the menu's search behaves the same as the command palette's.
 *   - Pagination is OFF when a query is active — all matches show flat
 *     within each section. Without a query, each section caps to
 *     `PAGE_SIZE` rows with prev/next controls.
 */

/** Items per category in browse mode (no search). Tuned small so the
 *  menu stays compact; users page through with prev/next or type to
 *  search the entire set. */
const PAGE_SIZE = 10;


/** Open the menu anchored at (x, y). Closes on Escape, click-outside,
 *  or selection. Returns a teardown closure for the caller, but the
 *  menu also self-disposes on close. */
export function openTileTabMenu({
    x, y, leafKind, onPick, api, taxonomy, entities,
}) {
    if (!taxonomy || !entities) {
        console.error('[tile-tab-menu] taxonomy + entity catalog are required');
        return () => {};
    }
    // Resolve which sources to list for the leaf's current page. An
    // unknown kind falls back to the root's list, which is the
    // "everything" default.
    const topNav  = taxonomy.topNavFor(leafKind) || leafKind;
    const sources = taxonomy.sourcesFor(topNav)
        .map((nav) => entities.get(nav))
        .filter(Boolean);

    // Build the overlay + panel chrome.
    const overlay = document.createElement('div');
    overlay.className = 'twm-tile-tabmenu-overlay';
    overlay.innerHTML = `
        <div class="twm-tile-tabmenu" role="dialog" aria-label="Open in new tab">
            <header class="twm-tile-tabmenu__head">
                <span class="material-symbols-outlined twm-tile-tabmenu__head-icon">tab</span>
                <span class="twm-tile-tabmenu__head-label">Open in new tab</span>
                <button type="button" class="twm-tile-tabmenu__close"
                        data-action="close"
                        aria-label="Close">×</button>
            </header>
            <div class="twm-tile-tabmenu__search">
                <span class="material-symbols-outlined">search</span>
                <input type="search"
                       data-role="search"
                       placeholder="Filter rows across all sections…"
                       autocomplete="off" />
            </div>
            <div class="twm-tile-tabmenu__body" data-role="body">
                <div class="twm-tile-tabmenu__loading">Loading…</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Anchor below the hamburger. clip to viewport so it never opens
    // off-screen when the tile sits at the right edge.
    const panel = overlay.querySelector('.twm-tile-tabmenu');
    panel.style.position = 'fixed';
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, x))}px`;
    panel.style.top  = `${Math.max(8, Math.min(window.innerHeight - 480, y - 480 + 22))}px`;

    let alive = true;
    let _query = '';
    let _cursor = 0;          // index into _visibleItems
    let _visibleItems = [];   // flat list rebuilt on every render
    // navKind → { rows, page, shaped (pre-shaped per row in source order) }
    const sectionState = new Map(sources.map((s) =>
        [s.navKind, { rows: [], page: 0, shaped: [] }]));

    const close = () => {
        if (!alive) return;
        alive = false;
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
    };
    const onOutside = (ev) => {
        if (!overlay.contains(ev.target)) close();
    };

    const moveCursor = (delta) => {
        if (_visibleItems.length === 0) return;
        _cursor = Math.max(0, Math.min(_visibleItems.length - 1, _cursor + delta));
        _paintCursor();
    };
    const jumpCursor = (toEnd) => {
        if (_visibleItems.length === 0) return;
        _cursor = toEnd ? _visibleItems.length - 1 : 0;
        _paintCursor();
    };
    const pickCursor = () => {
        const cur = _visibleItems[_cursor];
        if (!cur) return;
        close();
        try { onPick?.(cur.navKind, cur.shaped); }
        catch (err) { console.warn('[tile-tab-menu] pick failed', err); }
    };

    const onKey = (ev) => {
        if (!alive) return;
        // Ignore arrow/Enter typed inside the search box's IME, etc.
        if (ev.isComposing) return;
        switch (ev.key) {
            case 'Escape':
                ev.preventDefault(); close(); return;
            case 'ArrowDown':
                ev.preventDefault(); moveCursor(+1); return;
            case 'ArrowUp':
                ev.preventDefault(); moveCursor(-1); return;
            case 'Home':
                ev.preventDefault(); jumpCursor(false); return;
            case 'End':
                ev.preventDefault(); jumpCursor(true); return;
            case 'Enter':
                ev.preventDefault(); pickCursor(); return;
            case 'PageDown': {
                if (_query) return;
                ev.preventDefault();
                const cur = _visibleItems[_cursor];
                const st  = cur ? sectionState.get(cur.navKind) : null;
                if (st) {
                    const pages = _pageCountFor(cur.navKind);
                    if (st.page < pages - 1) { st.page += 1; _render(); }
                }
                return;
            }
            case 'PageUp': {
                if (_query) return;
                ev.preventDefault();
                const cur = _visibleItems[_cursor];
                const st  = cur ? sectionState.get(cur.navKind) : null;
                if (st && st.page > 0) { st.page -= 1; _render(); }
                return;
            }
        }
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('[data-action="close"]')
        .addEventListener('click', close);

    const searchInput = overlay.querySelector('[data-role="search"]');
    searchInput.addEventListener('input', () => {
        _query = searchInput.value.trim().toLowerCase();
        for (const st of sectionState.values()) st.page = 0;
        _cursor = 0;
        _render();
    });

    const bodyEl = overlay.querySelector('[data-role="body"]');

    const _pageCountFor = (navKind) => {
        const st = sectionState.get(navKind);
        if (!st) return 1;
        const total = (_query
            ? st.shaped.filter((s) => _matchesShaped(s, _query))
            : st.shaped).length;
        return Math.max(1, Math.ceil(total / PAGE_SIZE));
    };

    const _render = () => {
        if (!alive) return;
        _visibleItems = [];
        const sections = [];
        for (const src of sources) {
            const st = sectionState.get(src.navKind);
            const meta = taxonomy.meta(src.navKind);
            const all = st.shaped;
            const filtered = _query
                ? all.filter((s) => _matchesShaped(s, _query))
                : all;
            const total = filtered.length;
            // Pagination is OFF during search — show every match. In
            // browse mode each section caps to PAGE_SIZE.
            let view;
            let page = 0;
            let pages = 1;
            if (_query) {
                view = filtered;
            } else {
                pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                page  = Math.min(st.page, pages - 1);
                const start = page * PAGE_SIZE;
                view  = filtered.slice(start, start + PAGE_SIZE);
            }
            // Append to the flat cursor list, in render order.
            for (const shaped of view) {
                _visibleItems.push({ navKind: src.navKind, shaped });
            }
            sections.push({ src, meta, view, total, page, pages });
        }
        if (_cursor >= _visibleItems.length) {
            _cursor = Math.max(0, _visibleItems.length - 1);
        }
        let flatIdx = 0;
        bodyEl.innerHTML = sections.map((s) => {
            const items = s.view.map((shaped) => {
                const idx = flatIdx++;
                const label = shaped.label || shaped.id || '';
                const hint  = shaped.hint  || '';
                return `
                    <li class="twm-tile-tabmenu__item${idx === _cursor ? ' twm-tile-tabmenu__item--cursor' : ''}"
                        data-flat-idx="${idx}">
                        <span class="twm-tile-tabmenu__item-label">${_esc(label)}</span>
                        ${hint ? `<span class="twm-tile-tabmenu__item-hint">${_esc(hint)}</span>` : ''}
                    </li>
                `;
            }).join('');
            return `
                <section class="twm-tile-tabmenu__section"
                         data-section="${_esc(s.src.navKind)}">
                    <header class="twm-tile-tabmenu__section-head">
                        <span class="material-symbols-outlined">${_esc(s.meta?.icon || 'arrow_right')}</span>
                        <span class="twm-tile-tabmenu__section-label">${_esc(s.meta?.label || s.src.navKind)}</span>
                        <span class="twm-tile-tabmenu__section-count">${s.total}</span>
                    </header>
                    ${s.view.length === 0 ? `
                        <div class="twm-tile-tabmenu__empty">${
                            _query ? 'No matches.' : '— none —'
                        }</div>
                    ` : `<ul class="twm-tile-tabmenu__list">${items}</ul>`}
                    ${(!_query && s.pages > 1) ? `
                        <div class="twm-tile-tabmenu__pager">
                            <button type="button" data-action="prev"
                                    data-section="${_esc(s.src.navKind)}"
                                    ${s.page === 0 ? 'disabled' : ''}>&lt;</button>
                            <span>${s.page + 1} / ${s.pages}</span>
                            <button type="button" data-action="next"
                                    data-section="${_esc(s.src.navKind)}"
                                    ${s.page >= s.pages - 1 ? 'disabled' : ''}>&gt;</button>
                        </div>
                    ` : ''}
                </section>
            `;
        }).join('');
        bodyEl.querySelectorAll('.twm-tile-tabmenu__item').forEach((li) => {
            const idx = Number(li.dataset.flatIdx);
            li.addEventListener('mousemove', () => {
                if (_cursor !== idx) { _cursor = idx; _paintCursor(); }
            });
            li.addEventListener('click', () => {
                _cursor = idx;
                pickCursor();
            });
        });
        bodyEl.querySelectorAll('[data-action="prev"], [data-action="next"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const navKind = btn.dataset.section;
                const st = sectionState.get(navKind);
                if (!st) return;
                st.page += (btn.dataset.action === 'next') ? 1 : -1;
                _render();
            });
        });
    };

    const _paintCursor = () => {
        bodyEl.querySelectorAll('.twm-tile-tabmenu__item').forEach((li) => {
            const idx = Number(li.dataset.flatIdx);
            const on  = idx === _cursor;
            li.classList.toggle('twm-tile-tabmenu__item--cursor', on);
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
    };

    // Kick off the fetch — in parallel, and only for the sources this
    // tile cares about. `loadOne` + `shapeRows` are the catalog's own
    // primitives, so this menu and the command palette cannot drift
    // apart on what a row is or which rows get dropped (they used to:
    // this loop was a hand-rolled copy of the palette's).
    (async () => {
        await Promise.all(sources.map(async (src) => {
            const st = sectionState.get(src.navKind);
            if (!st) return;
            st.rows = await entities.loadOne(src.navKind, api);
            // Pre-shape once and stash so search/render don't re-shape
            // on every keystroke. Rows that shape() rejects are dropped.
            st.shaped = entities.shapeRows(src.navKind, st.rows);
        }));
        _render();
        // Park the cursor on the first visible row so Enter picks
        // something immediately after open.
        if (_visibleItems.length > 0) {
            _cursor = 0;
            _paintCursor();
        }
    })();

    searchInput.focus();
    return close;
}


/** Match a shaped record (`{id, label, hint}`) against `query`.
 *  Case-insensitive substring against any field. Mirrors the command
 *  palette's matching so search semantics are consistent across both
 *  surfaces. */
function _matchesShaped(shaped, query) {
    if (!shaped) return false;
    const id    = String(shaped.id    ?? '').toLowerCase();
    const label = String(shaped.label ?? '').toLowerCase();
    const hint  = String(shaped.hint  ?? '').toLowerCase();
    return id.includes(query) || label.includes(query) || hint.includes(query);
}


function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
