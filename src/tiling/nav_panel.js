/**
 * nav_panel.js — the left navigation panel-tile: a mode strip, a shared
 * filter box, and one lazily-mounted pane per mode.
 *
 *   ┌─[ mode ][ mode ][ mode ]─────┐   mode tabs
 *   │ ┌──────────────────────────┐ │
 *   │ │ Filter…                  │ │   unified filter (sidebar-controls)
 *   │ └──────────────────────────┘ │
 *   │ ┌──────────────────────────┐ │
 *   │ │ (pane body)              │ │
 *   │ └──────────────────────────┘ │
 *
 * The panel owns the strip, the filter and the pane hosts. It owns NONE of
 * the panes: the embedder passes them in. There used to be three hardcoded
 * modes here (a file tree, an object tree, a git view) plus a dead category
 * browser; all of that is the embedder's, and lives on its side now.
 *
 * A mode:
 *
 *   {
 *     id, icon, label,
 *     mount(paneEl, { wm, eventBus }) -> {
 *        activate?(),       // called every time the mode is selected (may be async)
 *        filter?(query),    // the shared filter box changed
 *        destroy?(),
 *     }
 *   }
 *
 * `mount()` runs at most once, the first time its mode is selected.
 * `activate()` runs on every selection, INCLUDING the first — a pane that
 * has to rebuild on each visit (a git status list, say) does its work there.
 * The filter query is remembered per mode.
 */

export function mountNavPanel(hostEl, {
    modes = [],
    wm = null,
    eventBus = null,
    filterPlaceholder = 'Filter…',
} = {}) {
    if (!Array.isArray(modes) || modes.length === 0) {
        throw new Error('mountNavPanel: at least one mode is required');
    }

    hostEl.classList.add('twm-nav');
    hostEl.innerHTML = `
        <div class="twm-nav__modes" data-role="modes"></div>
        <div class="twm-sidebar-controls twm-nav__filter">
            <span class="material-symbols-outlined twm-sidebar-search-icon">search</span>
            <input class="twm-data-page__search twm-nav__filter-input"
                   type="search" placeholder="${_esc(filterPlaceholder)}"
                   autocomplete="off" />
        </div>
        <div class="twm-nav__body" data-role="body"></div>
    `;
    const modesEl = hostEl.querySelector('[data-role="modes"]');
    const bodyEl  = hostEl.querySelector('[data-role="body"]');
    const filterEl = hostEl.querySelector('.twm-nav__filter-input');

    modesEl.innerHTML = modes.map((m) => `
        <button class="twm-nav__mode twm-has-tooltip" data-mode="${_esc(m.id)}"
                data-tooltip="${_esc(m.label)}">
            <span class="material-symbols-outlined">${_esc(m.icon)}</span>
            <span>${_esc(m.label)}</span>
        </button>
    `).join('');

    const byId = new Map(modes.map((m) => [m.id, m]));
    const hosts = {};   // mode id -> pane host element
    const panes = {};   // mode id -> the object the mode's mount() returned
    const filterByMode = Object.fromEntries(modes.map((m) => [m.id, '']));
    let mode = modes[0].id;

    const ensureHost = (id) => {
        if (hosts[id]) return hosts[id];
        const el = document.createElement('div');
        el.className = `twm-nav__pane twm-nav__pane--${id}`;
        el.style.display = 'none';
        bodyEl.appendChild(el);
        hosts[id] = el;
        return el;
    };

    const activate = async (next) => {
        const def = byId.get(next);
        if (!def) return;
        mode = next;
        for (const m of modes) {
            ensureHost(m.id).style.display = (m.id === next) ? 'flex' : 'none';
        }
        modesEl.querySelectorAll('[data-mode]').forEach((b) =>
            b.classList.toggle('twm-nav__mode--on', b.dataset.mode === next));
        filterEl.value = filterByMode[next] || '';

        const paneEl = ensureHost(next);
        if (!panes[next]) {
            try { panes[next] = def.mount(paneEl, { wm, eventBus }) || {}; }
            catch (err) {
                console.error('[nav] mode mount failed', next, err);
                panes[next] = {};
            }
        }
        // `activate()` runs on EVERY selection, including the first. A pane that
        // must rebuild on each visit (a git status list) does its work here.
        try { await panes[next].activate?.(); }
        catch (err) { console.error('[nav] mode activate failed', next, err); }
        _applyFilter();
    };

    const _applyFilter = () => {
        const q = filterByMode[mode] || '';
        try { panes[mode]?.filter?.(q); }
        catch (err) { console.warn('[nav] filter failed', mode, err); }
    };

    filterEl.addEventListener('input', () => {
        filterByMode[mode] = filterEl.value;
        _applyFilter();
    });

    modesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]');
        if (btn) activate(btn.dataset.mode);
    });

    activate(mode);

    return {
        refresh: () => activate(mode),
        destroy: () => {
            for (const p of Object.values(panes)) {
                try { p?.destroy?.(); } catch { /* ignore */ }
            }
        },
    };
}

function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
