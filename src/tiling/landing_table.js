/**
 * landing_table.js — shared helpers for the "navigation table"
 * pattern used by SFC / Markets / Scenarios / KPIs landings (and the
 * market-archetype instances table). Three responsibilities:
 *
 *   1. Single-click row → open the entity (handled by callers).
 *   2. Right-click row → custom context menu with Open / Edit / Delete
 *      (replaces DataTable's default copy-as-TSV menu for these tables;
 *      the default still applies to data tables outside this helper).
 *   3. Renders an "actions" column with inline edit + delete icons so
 *      the user can act on a row without opening it first.
 *
 * Callers configure the per-kind behaviour via the `entityActions`
 * object: `{ open(row), edit(row), delete(row) }` — any of which may be
 * omitted to hide the corresponding action.
 */

import { showContextMenu } from '../ui/components/context_menu.js';
import { registerPanelKeys } from './panel_keys.js';

/** Attach the navigation-table interactions to a host element that
 *  contains a `<table>` already rendered by DataTable. Returns a
 *  teardown function.
 *
 *  `entityActions` maps action names to handlers. The canonical names
 *  are `open` / `edit` / `delete` (plus `openInTab` / `openInWindow`),
 *  but ANY `data-twm-action="<name>"` button or context-menu item
 *  dispatches to `entityActions[<name>]` — so tree landings can wire
 *  `toggle`, `contract`, etc. through the same robust path instead of
 *  hand-rolling their own tbody listeners (which is how the Agents /
 *  Markets pages used to drift out of sync with this helper).
 *
 *  `options.buildMenu(row) => items[]` overrides the default
 *  Open / Edit / Delete right-click menu for tree-shaped rows that need
 *  conditional entries (expand/collapse, contract detail). Each item's
 *  `action` is dispatched the same way as a button. */
export function attachLandingTableBehavior(host, getRow, entityActions, options = {}) {
    if (!host) return () => {};

    // Delegate from the stable `host` container, NOT the <tbody>. DataTable
    // rebuilds its <tbody> on every internal re-render — pagination, filter,
    // sort, and the post-layout column-width sync — and each re-render
    // re-installs ITS OWN row listeners (data_table.js `_installInteractions`)
    // but knows nothing about ours. A listener bound directly to the tbody
    // therefore goes silently dead after the first re-render: events still
    // reach the live tbody (DataTable's copy menu still pops) while our
    // handlers sit orphaned on a detached node. Binding on `host` and
    // resolving the row at event time survives any number of tbody rebuilds.

    // Dispatch an action name to its handler. The `open-tab` /
    // `open-window` menu aliases map onto the `openInTab` /
    // `openInWindow` handlers; every other name (including `edit`,
    // `delete`, and tree-only verbs like `toggle` / `contract`) routes
    // straight to `entityActions[name]`.
    const dispatch = (action, row) => {
        if (!row) return;
        const fn = action === 'open-tab'    ? entityActions.openInTab
                 : action === 'open-window' ? entityActions.openInWindow
                 :                            entityActions[action];
        try { fn?.(row); }
        catch (e) { console.warn(`[landing] action "${action}" failed`, e); }
    };

    // The BODY <tr> for an event, re-found live each time. Excludes the
    // header / filter row (it lives in the separate non-scrolling header
    // wrap, not inside `.preview-table-wrap`'s tbody).
    const bodyRowFor = (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr || !tr.closest('tbody')) return null;
        const wrap = tr.closest('.twm-preview-table-wrap');
        if (!wrap || !host.contains(wrap)) return null;
        return tr;
    };

    const onClick = (ev) => {
        // Inline action buttons short-circuit the row-open default and
        // suppress every other listener (DataTable's row-selection
        // listener, etc.). `stopImmediatePropagation` is load-bearing.
        const actionBtn = ev.target.closest('[data-twm-action]');
        if (actionBtn && host.contains(actionBtn)) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const tr = actionBtn.closest('tr');
            dispatch(actionBtn.dataset.twmAction, tr ? getRow(tr.__rowIndex) : null);
            return;
        }
        // Plain row click → open. Ignore clicks on interactive controls
        // (buttons, filter inputs, links) and anything outside a body row
        // (pagination strip, header, empty space).
        if (ev.target.closest('button, a, input, select, textarea')) return;
        const tr = bodyRowFor(ev);
        if (tr) dispatch('open', getRow(tr.__rowIndex));
    };

    const defaultMenu = (row) => {
        const items = [];
        if (entityActions.open) {
            items.push({ label: 'Open',          icon: 'open_in_new', action: 'open' });
            if (entityActions.openInTab) {
                items.push({ label: 'Open in new tab', icon: 'tab',  action: 'open-tab' });
            }
            if (entityActions.openInWindow) {
                items.push({ label: 'Open in new window', icon: 'open_in_full',
                             action: 'open-window' });
            }
        }
        if (entityActions.edit)   items.push({ label: 'Rename / edit', icon: 'edit',      action: 'edit'   });
        if (entityActions.delete) {
            if (items.length) items.push({ separator: true });
            items.push({ label: 'Delete', icon: 'delete', action: 'delete', danger: true });
        }
        return items;
    };
    const buildMenu = typeof options.buildMenu === 'function'
        ? options.buildMenu
        : defaultMenu;

    const onContextMenu = (ev) => {
        const tr = bodyRowFor(ev);
        if (!tr) return;
        ev.preventDefault();
        // Bypass DataTable's own copy-as-TSV/CSV menu by stopping
        // propagation — the right-click for a navigation row is about the
        // *entity*, not the cell text. Capture phase on `host` runs before
        // DataTable's bubble-phase contextmenu on the tbody.
        ev.stopPropagation();
        const row = getRow(tr.__rowIndex);
        if (!row) return;
        const items = buildMenu(row) || [];
        if (items.length === 0) return;
        showContextMenu(ev.clientX, ev.clientY, items, (action) => dispatch(action, row));
    };

    // Click in bubble phase (after DataTable's row-selection); contextmenu
    // in CAPTURE phase so ours runs before DataTable's bubble copy menu.
    host.addEventListener('click', onClick);
    host.addEventListener('contextmenu', onContextMenu, true);
    return () => {
        host.removeEventListener('click', onClick);
        host.removeEventListener('contextmenu', onContextMenu, true);
    };
}

/** Wire pane-focus highlighting. SfcLandingTab gives each
 *  `.ea-sfc-landing__pane` an `--focused` modifier when it's the
 *  active pane — that's what paints the blue head + accent title.
 *  Other landings need the same treatment to read as consistent.
 *
 *  Single-pane landings can call this once: the only pane stays
 *  focused at all times. Multi-pane landings get mousedown wiring
 *  per pane and a reflectFocus() helper they can call from keyboard
 *  navigation if they implement it. */
export function wireLandingPaneFocus(hostEl) {
    const panes = Array.from(hostEl.querySelectorAll('.twm-landing__pane'));
    if (panes.length === 0) return { focus: () => {}, panes };
    let focused = panes[0];
    const reflect = () => {
        for (const p of panes) {
            p.classList.toggle('twm-landing__pane--focused', p === focused);
        }
    };
    reflect();
    for (const p of panes) {
        p.addEventListener('mousedown', () => {
            if (focused === p) return;
            focused = p;
            reflect();
        });
    }
    return {
        focus: (pane) => { if (pane && panes.includes(pane)) { focused = pane; reflect(); } },
        panes,
    };
}

/** Arrow-key navigation for a landing page's DataTable.
 *
 *   - ArrowDown / ArrowUp moves a row cursor within `host`.
 *   - Enter (and the optional `activateKey`, e.g. `o`) opens the row.
 *   - Home / End jump to the first / last row.
 *   - Captures the keys at the document level so the user doesn't have
 *     to click inside the table first — same UX as sfc_landing_tab.
 *
 *  The visible cursor is the `ea-row-cursor` CSS class on the active
 *  `<tr>`; the row also `scrollIntoView({block:'nearest'})` so the
 *  selection stays visible during keyboard scroll-through.
 *
 *  Returns `{ teardown, refresh, focusFirst }`. Call `refresh()` after
 *  the table re-renders so the cursor lands on the right row again.
 */
export function attachLandingKeyboardNav(host, getRows, onActivate, options = {}) {
    if (!host) return { teardown: () => {}, refresh: () => {}, focusFirst: () => {} };

    let cursor = 0;
    const tbody = () => host.querySelector('tbody');

    const repaintCursor = () => {
        const tb = tbody();
        if (!tb) return;
        const rows = getRows() || [];
        if (rows.length === 0) { cursor = 0; return; }
        if (cursor >= rows.length) cursor = rows.length - 1;
        if (cursor < 0) cursor = 0;
        let active = null;
        tb.querySelectorAll('tr').forEach((tr) => {
            const on = tr.__rowIndex === cursor;
            tr.classList.toggle('twm-row-cursor', on);
            if (on) active = tr;
        });
        if (active) active.scrollIntoView({ block: 'nearest' });
    };

    const move = (delta) => {
        const rows = getRows() || [];
        if (rows.length === 0) return;
        cursor = Math.max(0, Math.min(rows.length - 1, cursor + delta));
        repaintCursor();
    };

    const open = () => {
        const rows = getRows() || [];
        const row = rows[cursor];
        if (row) onActivate(row);
    };

    const onKey = (ev) => {
        if (!host.isConnected) return;
        // Stay out of the way of inputs and unrelated focus targets.
        const t = ev.target;
        const editable = t && (
            t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' || t.isContentEditable);
        if (editable) return;
        // Scope (which tile is selected) is owned by the panel-key router.

        if (ev.key === 'ArrowDown')      { ev.preventDefault(); move(+1); }
        else if (ev.key === 'ArrowUp')   { ev.preventDefault(); move(-1); }
        else if (ev.key === 'Home')      { ev.preventDefault(); cursor = 0; repaintCursor(); }
        else if (ev.key === 'End')       {
            ev.preventDefault();
            const rows = getRows() || [];
            cursor = Math.max(0, rows.length - 1);
            repaintCursor();
        }
        else if (ev.key === 'Enter')     { ev.preventDefault(); open(); }
        else if (options.activateKey && ev.key === options.activateKey
                 && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
            ev.preventDefault(); open();
        }
    };

    const offKey = registerPanelKeys(host, onKey);
    // Re-paint immediately so the cursor is visible from first render.
    setTimeout(repaintCursor, 0);

    return {
        teardown: () => offKey(),
        refresh:  () => repaintCursor(),
        focusFirst: () => { cursor = 0; repaintCursor(); },
    };
}


/** Unified landing-page keyboard shell.
 *
 *  Wires the four behaviors every landing should share, in one call:
 *
 *    - Pane focus highlight (`.ea-sfc-landing__pane--focused`) — click
 *      on a pane or Tab to it, the header band lights up.
 *    - ArrowUp / ArrowDown moves the row cursor within the focused
 *      pane's table; Home / End jump to first / last. The visible cursor
 *      is `.ea-row-cursor` on the active `<tr>`.
 *    - Tab / Shift+Tab cycles between panes. Single-pane landings just
 *      no-op the Tab — the behaviour is a property of the shell, not
 *      the page.
 *    - Enter activates the cursor row via `onActivate(row)`.
 *    - ArrowRight / ArrowLeft expand / collapse the cursor row when
 *      the pane provides `onExpandToggle` + `isExpanded` (tree-shaped
 *      tables; harmless on flat tables that don't define them).
 *
 *  Each pane spec:
 *      {
 *          paneEl,                       // .ea-sfc-landing__pane element
 *          getRows,                      // () => Array<row>
 *          onActivate,                   // (row) => void  — Enter
 *          onExpandToggle?,              // (row, expand:bool) => void
 *          isExpanded?,                  // (row) => bool
 *          isExpandable?,                // (row) => bool  — gates Left/Right
 *          tableHost?,                   // override pane.querySelector('.twm-landing__table')
 *      }
 *
 *  Returns `{ teardown, refresh, focusPane(idx) }`. Call `refresh()` after
 *  the pane tables re-render so the cursor lands on the right row again.
 *
 *  Backspace is intentionally **not** handled here — `keymap.js` owns
 *  it globally and walks `wm.navigateBack()` regardless of which
 *  landing is showing. */
export function attachLandingShell(hostEl, { panes, initialPane = 0 } = {}) {
    if (!hostEl || !Array.isArray(panes) || panes.length === 0) {
        return { teardown: () => {}, refresh: () => {}, focusPane: () => {} };
    }

    const state = panes.map((spec) => ({
        spec,
        paneEl: spec.paneEl,
        tableHost: spec.tableHost
            || spec.paneEl?.querySelector('.twm-landing__table')
            || spec.paneEl,
        cursor: 0,
    }));
    let focusedIdx = Math.max(0, Math.min(panes.length - 1, initialPane));

    const reflectPaneFocus = () => {
        state.forEach((s, i) => {
            s.paneEl?.classList.toggle(
                'twm-landing__pane--focused', i === focusedIdx);
        });
    };

    const repaintCursor = (idx = focusedIdx) => {
        const s = state[idx];
        if (!s) return;
        const tbody = s.tableHost?.querySelector('tbody');
        if (!tbody) return;
        const rows = s.spec.getRows?.() || [];
        if (rows.length === 0) { s.cursor = 0; return; }
        if (s.cursor >= rows.length) s.cursor = rows.length - 1;
        if (s.cursor < 0) s.cursor = 0;
        let active = null;
        tbody.querySelectorAll('tr').forEach((tr) => {
            const on = tr.__rowIndex === s.cursor;
            tr.classList.toggle('twm-row-cursor', on);
            if (on) active = tr;
        });
        if (active && idx === focusedIdx) {
            active.scrollIntoView({ block: 'nearest' });
        }
    };

    const move = (delta) => {
        const s = state[focusedIdx];
        if (!s) return;
        const rows = s.spec.getRows?.() || [];
        if (rows.length === 0) return;
        s.cursor = Math.max(0, Math.min(rows.length - 1, s.cursor + delta));
        repaintCursor();
    };

    const jump = (toEnd) => {
        const s = state[focusedIdx];
        if (!s) return;
        const rows = s.spec.getRows?.() || [];
        s.cursor = toEnd ? Math.max(0, rows.length - 1) : 0;
        repaintCursor();
    };

    const currentRow = () => {
        const s = state[focusedIdx];
        if (!s) return null;
        const rows = s.spec.getRows?.() || [];
        return rows[s.cursor] ?? null;
    };

    const activate = () => {
        const row = currentRow();
        if (!row) return;
        try { state[focusedIdx].spec.onActivate?.(row); }
        catch (err) { console.warn('[landing-shell] activate failed', err); }
    };

    /** Open the current row in a new tab on the tile. Pane spec opts in
     *  by providing `onActivateInTab(row)`; the default-Enter handler
     *  remains `onActivate`. Falls back to `onActivate` so panes that
     *  haven't been migrated still respond to Ctrl+Enter. */
    const activateInTab = () => {
        const row = currentRow();
        if (!row) return;
        const spec = state[focusedIdx].spec;
        const fn = spec.onActivateInTab || spec.onActivate;
        try { fn?.(row); }
        catch (err) { console.warn('[landing-shell] activate-tab failed', err); }
    };

    /** Open the current row in a fresh managed window. Same opt-in
     *  pattern as activateInTab — panes provide `onActivateInWindow`
     *  for Shift+Enter, fall back to onActivate when absent. */
    const activateInWindow = () => {
        const row = currentRow();
        if (!row) return;
        const spec = state[focusedIdx].spec;
        const fn = spec.onActivateInWindow || spec.onActivate;
        try { fn?.(row); }
        catch (err) { console.warn('[landing-shell] activate-window failed', err); }
    };

    const expandToggle = (expand) => {
        const s = state[focusedIdx];
        if (!s?.spec.onExpandToggle) return false;
        const row = currentRow();
        if (!row) return false;
        if (s.spec.isExpandable && !s.spec.isExpandable(row)) return false;
        const currentlyExpanded = s.spec.isExpanded
            ? !!s.spec.isExpanded(row)
            : false;
        if (expand === currentlyExpanded) return false;
        try { s.spec.onExpandToggle(row, expand); }
        catch (err) { console.warn('[landing-shell] expand failed', err); }
        return true;
    };

    const focusPane = (idx) => {
        if (idx < 0 || idx >= state.length) return;
        if (idx === focusedIdx) return;
        focusedIdx = idx;
        reflectPaneFocus();
        repaintCursor();
    };

    const cyclePane = (dir) => {
        if (state.length < 2) return;
        focusPane((focusedIdx + dir + state.length) % state.length);
    };

    const onMouseDown = (ev) => {
        // Find which pane the click landed in. Inline action buttons
        // and the like still focus the surrounding pane.
        const paneEl = ev.target.closest?.('.twm-landing__pane');
        if (!paneEl) return;
        const idx = state.findIndex((s) => s.paneEl === paneEl);
        if (idx < 0 || idx === focusedIdx) return;
        focusedIdx = idx;
        reflectPaneFocus();
        repaintCursor();
    };

    const onKey = (ev) => {
        if (!hostEl.isConnected) return;
        // Scope is owned by the panel-key router: this handler only runs
        // when our tile is the selected one. We still skip editable
        // targets so typing in a field inside the tile isn't hijacked.
        const t = ev.target;
        const editable = t && (
            t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' || t.isContentEditable);
        if (editable) return;
        // Browser-style activation chords (caught BEFORE the modifier
        // guard so the WM keymap doesn't swallow them):
        //   Ctrl/Cmd + Enter → open in new TAB on this tile
        //   Shift + Enter    → open in new managed WINDOW
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ev.altKey) {
            ev.preventDefault();
            activateInTab();
            return;
        }
        if (ev.key === 'Enter' && ev.shiftKey && !ev.altKey
            && !ev.metaKey && !ev.ctrlKey) {
            ev.preventDefault();
            activateInWindow();
            return;
        }
        // Other modifier chords belong to the WM / browser.
        if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;

        switch (ev.key) {
            case 'ArrowDown':
                ev.preventDefault(); move(+1); return;
            case 'ArrowUp':
                ev.preventDefault(); move(-1); return;
            case 'Home':
                ev.preventDefault(); jump(false); return;
            case 'End':
                ev.preventDefault(); jump(true); return;
            case 'Enter':
                ev.preventDefault(); activate(); return;
            case 'Tab':
                // Cycle panes; single-pane case still preventDefault so
                // focus doesn't escape into the browser chrome.
                ev.preventDefault();
                cyclePane(ev.shiftKey ? -1 : +1);
                return;
            case 'ArrowRight':
                if (expandToggle(true)) ev.preventDefault();
                return;
            case 'ArrowLeft':
                if (expandToggle(false)) ev.preventDefault();
                return;
        }
    };

    hostEl.addEventListener('mousedown', onMouseDown);
    const offKey = registerPanelKeys(hostEl, onKey);
    reflectPaneFocus();
    // Initial cursor paint runs after the synchronous mount returns so
    // tables that render asynchronously already have their tbody.
    setTimeout(() => state.forEach((_, i) => repaintCursor(i)), 0);

    // Park native focus on hostEl when our leaf is the active one. The
    // panel-key router no longer depends on this for arrow routing (it
    // keys off the focused leaf, not document.activeElement), but parking
    // focus keeps native focus semantics — scroll-into-view, :focus-within
    // styling, and screen-reader context — anchored to the live tile.
    //
    // Guarded by the WM's `.twm-leaf--focused` class so we don't steal
    // focus when another tile owns the user's attention. The
    // requestAnimationFrame second pass catches the case where the
    // focus class is applied a frame after mount.
    const parkFocusIfActive = () => {
        const leaf = hostEl.closest?.('.twm-leaf');
        // Page is rendered outside a tile (managed window / floating
        // shell) — there is no focused-leaf concept; safe to take focus.
        const inTile = !!leaf;
        if (inTile && !leaf.classList.contains('twm-leaf--focused')) return;
        if (hostEl.contains(document.activeElement)) return;
        if (hostEl.tabIndex == null || hostEl.tabIndex < -1) hostEl.tabIndex = -1;
        try { hostEl.focus({ preventScroll: true }); } catch {}
    };
    parkFocusIfActive();
    requestAnimationFrame(parkFocusIfActive);

    return {
        teardown: () => {
            hostEl.removeEventListener('mousedown', onMouseDown);
            offKey();
        },
        refresh: () => state.forEach((_, i) => repaintCursor(i)),
        focusPane,
        currentRow,
    };
}


/** Standardized action-footer renderer.
 *
 *  Each action: `{ id, label, icon, shortcut?, title?, onClick }`.
 *
 *  When `shortcut` is set (single letter), the button label gets a
 *  `[N]` suffix and pressing that key (without modifiers, outside any
 *  text input, while focus is in `hostEl` or on the body) fires the
 *  action. The visible chip + the keydown handler are the same source
 *  of truth, so users can never wonder which letter triggers what.
 *
 *  Returns `{ teardown, refresh(actions) }`. */


// ─── #143 — shared landing shell ────────────────────────────────────
/** Mount the boilerplate every landing repeats: a detail-header with
 *  title + stat fields, a single `.ea-sfc-landing__pane` with title +
 *  keyboard-shortcut hint, the DataTable host, and a footer slot for
 *  `mountLandingActions` to fill.
 *
 *  Callers receive `{paneEl, tableHost, footerEl, setStat(key, value)}`
 *  — `paneEl` feeds straight into `attachLandingShell({panes: [{paneEl,
 *  …}]})`; `tableHost` is where `new DataTable(host, …)` mounts;
 *  `footerEl` is the second arg to `mountLandingActions`; `setStat`
 *  patches a single stat by `data-role` without rebuilding the header.
 *
 *  HTML output is identical to what each landing built by hand before
 *  this helper existed — only the source location moves.
 *
 *  @param {HTMLElement} hostEl
 *  @param {object}      opts
 *  @param {string}      opts.title    — `<h2>` text on the left of the header.
 *  @param {Array<{key,label,initial?}>} [opts.stats] — header chip per stat. `key` is the `data-role` for setStat(); `label` is the muted label above the value; `initial` defaults to `0`.
 *  @param {object}      opts.pane
 *  @param {string}      opts.pane.key    — the `data-pane="…"` value (also doubles as the table-host's `data-role="<key>-host"`).
 *  @param {string}      opts.pane.title  — pane-head title.
 *  @param {string}      opts.pane.hint   — pane-head keyboard-shortcut hint.
 *  @returns {{headerEl: HTMLElement, paneEl: HTMLElement, tableHost: HTMLElement, footerEl: HTMLElement, setStat: (key: string, value: any) => void}}
 */
export function mountLandingShell(hostEl, opts) {
    const {
        title = '',
        stats = [],
        pane  = { key: 'rows', title: '', hint: '' },
    } = opts || {};
    const paneKey = String(pane.key || 'rows');

    const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    const statsHtml = (stats || []).map((s) => `
        <span class="twm-landing__stat twm-entity-header__field">
            <span>${_esc(s.label || '')}</span>
            <strong data-role="${_esc(s.key)}">${_esc(s.initial != null ? s.initial : 0)}</strong>
        </span>
    `).join('');

    hostEl.classList.add('twm-landing');
    hostEl.innerHTML = `
        <header class="twm-entity-header">
            <h2>${_esc(title)}</h2>
            ${statsHtml}
            <span class="twm-entity-header__spacer"></span>
        </header>
        <div class="twm-landing__split twm-landing__split--single">
            <section class="twm-landing__pane" data-pane="${_esc(paneKey)}">
                <div class="twm-landing__pane-head">
                    <span class="twm-landing__pane-title">${_esc(pane.title || '')}</span>
                    <span class="twm-landing__pane-hint">${_esc(pane.hint || '')}</span>
                </div>
                <div class="twm-landing__table" data-role="${_esc(paneKey)}-host"></div>
            </section>
        </div>
        <footer class="twm-landing__actions" data-role="actions"></footer>
    `;

    const headerEl  = hostEl.querySelector('.twm-entity-header');
    const paneEl    = hostEl.querySelector(`[data-pane="${paneKey}"]`);
    const tableHost = hostEl.querySelector(`[data-role="${paneKey}-host"]`);
    const footerEl  = hostEl.querySelector('[data-role="actions"]');

    const setStat = (key, value) => {
        const el = hostEl.querySelector(`[data-role="${key}"]`);
        if (el) el.textContent = String(value);
    };

    return { headerEl, paneEl, tableHost, footerEl, setStat };
}


export function mountLandingActions(footerEl, actions, hostEl) {
    if (!footerEl) return { teardown: () => {}, refresh: () => {} };
    let current = [];
    const renderInto = (list) => {
        current = (list || []).filter(Boolean);
        footerEl.innerHTML = '';
        for (const a of current) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'twm-action-btn';
            if (a.id)    btn.dataset.action = a.id;
            if (a.title) btn.title = a.title;
            const icon = a.icon
                ? `<span class="material-symbols-outlined">${_esc(a.icon)}</span>`
                : '';
            const sc = a.shortcut
                ? ` <span class="twm-action-btn__kbd">[${_esc(a.shortcut.toUpperCase())}]</span>`
                : '';
            btn.innerHTML = `${icon}<span>${_esc(a.label || '')}</span>${sc}`;
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { a.onClick?.(ev); }
                catch (err) { console.warn('[landing-actions] click failed', err); }
            });
            footerEl.appendChild(btn);
        }
    };

    const onKey = (ev) => {
        if (!footerEl.isConnected) return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        // Scope is owned by the panel-key router; we only guard editable
        // targets so single-letter shortcuts don't fire while typing.
        const t = ev.target;
        const editable = t && (
            t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' || t.isContentEditable);
        if (editable) return;
        const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        const hit = current.find((a) =>
            a.shortcut && String(a.shortcut).toLowerCase() === k);
        if (!hit) return;
        ev.preventDefault();
        try { hit.onClick?.(ev); }
        catch (err) { console.warn('[landing-actions] shortcut failed', err); }
    };

    renderInto(actions);
    const scopeEl = hostEl || footerEl.closest('.twm-landing') || footerEl;
    const offKey = registerPanelKeys(scopeEl, onKey);
    return {
        teardown: () => offKey(),
        refresh: renderInto,
    };
}


/** A DataTable `renderCell` hook that paints inline Edit + Delete icon
 *  buttons in the configured action column. Use as:
 *
 *      renderCell: actionsCellRenderer(actionsColIdx, { edit: true, delete: true })
 *
 *  Other columns fall through to the default text renderer. */
export function actionsCellRenderer(actionsColIdx, options = { edit: true, delete: true }) {
    return (td, _value, colIdx) => {
        if (colIdx !== actionsColIdx) return false;
        const parts = [];
        if (options.edit) {
            parts.push(`<button type="button" class="twm-row-action"
                                  data-twm-action="edit"
                                  title="Edit"
                                  aria-label="Edit">
                          <span class="material-symbols-outlined">edit</span>
                        </button>`);
        }
        if (options.delete) {
            parts.push(`<button type="button" class="twm-row-action twm-row-action--danger"
                                  data-twm-action="delete"
                                  title="Delete"
                                  aria-label="Delete">
                          <span class="material-symbols-outlined">delete</span>
                        </button>`);
        }
        td.classList.add('twm-row-actions-cell');
        td.innerHTML = parts.join('');
        return true;
    };
}


function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
