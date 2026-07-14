/**
 * shell.js — `createShell()`, the library's composition entry point.
 *
 * Requires:  root, taxonomy, entities, content
 * Hosts:     chrome (ELEMENTS, never selectors), host port, bus, stores
 * Owns:      the content registry, the WM, the palette, the keymap, the
 *            chrome painters, the tile context menus.
 * Knows:     nothing about the embedder. No `document.body`, no selector it
 *            did not author, no bus-event string, no content kind.
 *
 * ── The seam ──────────────────────────────────────────────────────────
 * The embedder does everything up to "hand the framework a root element and
 * a content map", and everything after `createShell()` resolves:
 *
 *     embedder:  gate (is there anything to show?) -> install its own widgets
 *                -> build/clear the root element -> build the content map
 *     library:   registry -> WM -> palette -> keymap -> chrome -> wm.load()
 *     embedder:  publish the shell, install post-mount extras
 *
 * That order is not stylistic. The widgets decorate DOM the embedder then
 * DELETES to make room for the root element, so `root` cannot exist before
 * the widgets have run — which is exactly why `createShell` does not try to
 * own a `prepare`/`widgets` lifecycle. It takes a root element that already
 * exists and mounts into it.
 *
 * ── Content is a constructor argument ─────────────────────────────────
 * `content` is REQUIRED, validated, and frozen into a per-shell registry
 * BEFORE the WM is built. There is no module-level `register()` to call
 * late. That matters: a leaf mounted against a missing factory renders a
 * placeholder, and the renderer caches tile DOM per (kind, props) — a late
 * registration invalidates nothing, so a whole restored session stays wrong.
 * Making registration impossible after the first mount is the fix.
 *
 * ── Chrome is elements, not selectors ─────────────────────────────────
 * A selector parameter would be the coupling wearing a hat: the framework
 * would still have to know that a "top-nav host" is a thing you find by CSS
 * in someone else's markup. Handing it a node is the smallest honest
 * abstraction — and an embedder with no chrome passes `chrome: {}` and gets
 * a working WM with none.
 */

import { WindowManager } from './wm.js';
import { createContentRegistry } from './content_registry.js';
import { createCommandPalette } from './command_palette.js';
import { installKeymap } from './keymap.js';
import { openTileTabMenu } from './tile_tab_menu.js';
import { showContextMenu } from '../ui/components/context_menu.js';
import { openForm } from '../ui/components/modal.js';

/**
 * @param {object}      cfg
 * @param {Element}     cfg.root       the element the WM mounts into
 * @param {object}      cfg.taxonomy   createTaxonomy(...)          — required
 * @param {object}      cfg.entities   createEntityCatalog(...)     — required
 * @param {object}      cfg.content    { [kind]: (hostEl, props, ctx) => {...} }
 * @param {object}     [cfg.host]      the host port (createHost)
 * @param {object}     [cfg.api]       an opaque back-end handle, threaded into
 *                                     ctx.api for content factories. The library
 *                                     never calls a method on it; it only passes
 *                                     it through (the palette + tile tab menu
 *                                     hand it to the entity catalog's fetchers).
 * @param {object}     [cfg.eventBus]
 * @param {object}     [cfg.logger]
 * @param {object}     [cfg.tableStore] threaded into ctx for table persistence
 * @param {object}     [cfg.events]     bus-event NAMES the WM listens for
 * @param {object}     [cfg.rootCrumb]  the breadcrumb's leading segment
 * @param {object}     [cfg.palette]    { placeholder }
 * @param {object}     [cfg.chrome]     { topNav?, paletteButton?, desktops?,
 *                                        panelToggles?: { left?, right?, bottom? } }
 * @returns {Promise<object>} the frozen shell
 */
export async function createShell({
    root,
    taxonomy,
    entities,
    content,
    host = null,
    api = null,
    eventBus = null,
    logger = null,
    tableStore = null,
    events = {},
    rootCrumb = null,
    palette: paletteCfg = {},
    chrome = {},
} = {}) {
    // A bad shell is a BOOT error, not a runtime surprise. Same doctrine as
    // createHost / createTaxonomy.
    if (!root || typeof root.appendChild !== 'function') {
        throw new TypeError('createShell: `root` must be an element');
    }
    if (!taxonomy) throw new Error('createShell: a taxonomy is required');
    if (!entities) throw new Error('createShell: an entity catalog is required');

    const log = logger ?? { info(){}, warn(){}, error(){}, debug(){} };
    const registry = createContentRegistry(content);   // throws on a non-function

    let wm = null;
    let topNavEl = null;
    let desktopsEl = null;
    let toggles = null;

    const syncChrome = () => {
        if (!wm) return;
        syncPanelToggles(toggles, wm);
        syncDesktopBar(desktopsEl, wm);
        syncTopNav(topNavEl, wm);
    };

    wm = new WindowManager({
        rootEl: root,
        content: registry,
        api,
        eventBus,
        host,
        taxonomy,
        events,
        // `ctx` is the delivery vehicle for leaf-mounted chrome: tile_renderer
        // spreads it into every content factory, which is how the breadcrumb
        // gets `taxonomy` + `rootCrumb` without a content factory knowing they
        // exist. The two `onTile*Menu` keys are read with OPTIONAL CHAINING in
        // tile_renderer — drop one and right-click silently does nothing.
        ctx: {
            api, eventBus, host, tableStore,
            taxonomy, entities, rootCrumb, events,
            onTileContextMenu: (leafId, x, y) => _tileContextMenu(wm, leafId, x, y),
            onTileTabMenu:     (leafId, x, y) => _tileTabMenu(wm, leafId, x, y),
        },
        onChange: () => syncChrome(),
    });

    const palette = createCommandPalette({
        wm, api, taxonomy, catalog: entities, ...paletteCfg,
    });
    installKeymap({ wm, palette });

    // Chrome — painted into the ELEMENTS the embedder handed over. An absent
    // key means absent chrome, not a crash.
    const paletteBtn = mountPaletteButton(chrome.paletteButton, palette);
    topNavEl = mountTopNav(chrome.topNav, taxonomy, wm);
    desktopsEl = mountDesktopBar(chrome.desktops, wm);
    // NOTE: bindPanelToggles CLONES the buttons (to strip whatever state the
    // embedder's own machinery left on them) and returns the FRESH nodes. The
    // originals are detached from here on — sync against the returned map, not
    // against `chrome.panelToggles`.
    toggles = bindPanelToggles(chrome.panelToggles, wm);

    // Belt-and-braces: anything else that mutates the WM fans out to chrome.
    eventBus?.on?.('wm:changed', syncChrome);

    await wm.load();          // ← FIRST MOUNT
    syncChrome();

    log.info?.('shell mounted');

    return Object.freeze({
        wm,
        palette,
        taxonomy,
        entities,
        root,
        content: registry,
        chrome: Object.freeze({
            paletteButtonEl: paletteBtn,
            topNavEl,
            desktopsEl,
            panelToggles: toggles,
        }),
        dispose: () => {
            try { eventBus?.off?.('wm:changed', syncChrome); } catch { /* ignore */ }
        },
    });
}


// ══ Chrome painters ═══════════════════════════════════════════════════
// Each takes an ELEMENT (or nothing) and returns whatever the sync half
// needs. None of them queries the document.

/** One shortcut button per top-nav kind in the taxonomy, painted into the
 *  element the embedder gave us. Clicking opens that kind in the primary tile. */
function mountTopNav(hostEl, taxonomy, wm) {
    if (!hostEl) return null;
    hostEl.innerHTML = '';
    hostEl.classList.add('twm-top-nav');
    for (const k of taxonomy.topNavEntries()) {
        const btn = document.createElement('button');
        btn.className = 'twm-top-nav__btn twm-has-tooltip';
        btn.dataset.kind = k.kind;
        btn.dataset.tooltip = k.label;
        btn.dataset.tooltipPlacement = 'bottom';
        btn.setAttribute('aria-label', k.label);
        btn.innerHTML = `
            <span class="material-symbols-outlined twm-top-nav__icon">${k.icon}</span>
            <span class="twm-top-nav__label">${k.label}</span>
        `;
        hostEl.appendChild(btn);
    }
    hostEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-kind]');
        if (!btn) return;
        wm.openInPrimary(btn.dataset.kind);
    });
    return hostEl;
}

function syncTopNav(hostEl, wm) {
    if (!hostEl) return;
    const tree = wm.desktops.active().tree;
    const primaryId = tree.primaryLeafId();
    const primaryKind = primaryId ? tree.get(primaryId)?.content?.kind : null;
    // topNavFor maps an entity kind onto its owning top-nav category. Falls
    // back to the primary kind so unknown kinds at least try to match a button.
    const topNavKind = wm.taxonomy.topNavFor(primaryKind) || primaryKind;
    hostEl.querySelectorAll('[data-kind]').forEach((b) => {
        b.classList.toggle('twm-top-nav__btn--on', b.dataset.kind === topNavKind);
    });
}

function mountPaletteButton(hostEl, palette) {
    if (!hostEl) return null;
    const existing = hostEl.querySelector('#twm-palette-btn');
    if (existing) return existing;
    const btn = document.createElement('button');
    btn.id = 'twm-palette-btn';
    btn.className = 'twm-panel-toggle-btn twm-has-tooltip';
    btn.dataset.tooltip = 'Command palette (Ctrl+K)';
    btn.dataset.tooltipPlacement = 'bottom';
    btn.setAttribute('aria-label', 'Open command palette');
    btn.innerHTML = '<span class="material-symbols-outlined">menu_open</span>';
    btn.addEventListener('click', () => palette.toggle());
    hostEl.insertBefore(btn, hostEl.firstChild);
    return btn;
}

/**
 * Take ownership of the embedder's three panel-toggle buttons.
 *
 * cloneNode copies any state the embedder's own machinery left on a button
 * (.active/.pinned/.disabled, the disabled attr, aria-pressed). We strip it so
 * the WM is the sole, clean source of truth — `syncPanelToggles` manages only
 * `.panel-toggle-btn--on` from here on. The clone keeps the id, so an embedder
 * that drives a toggle by `getElementById(...).click()` still works.
 *
 * @returns {{left?:Element, right?:Element, bottom?:Element}} the FRESH nodes
 */
function bindPanelToggles(map, wm) {
    const fresh = {};
    for (const side of ['left', 'right', 'bottom']) {
        const btn = map?.[side];
        if (!btn) continue;
        const el = btn.cloneNode(true);
        el.classList.remove('active', 'pinned', 'disabled');
        el.disabled = false;
        el.removeAttribute('aria-disabled');
        el.removeAttribute('aria-pressed');
        btn.replaceWith(el);
        el.addEventListener('click', () => wm.togglePanel(side));
        fresh[side] = el;
    }
    return fresh;
}

function syncPanelToggles(map, wm) {
    for (const side of ['left', 'right', 'bottom']) {
        const btn = map?.[side];
        if (!btn) continue;
        btn.classList.toggle('twm-panel-toggle-btn--on', wm.isPanelOpen(side));
    }
}

function mountDesktopBar(hostEl, wm) {
    if (!hostEl) return null;
    let el = hostEl.querySelector('#twm-desktops');
    if (!el) {
        el = document.createElement('div');
        el.id = 'twm-desktops';
        el.className = 'twm-desktops';
        hostEl.appendChild(el);
    }
    el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-desktop]');
        if (!btn) return;
        const v = btn.dataset.desktop;
        if (v === '+') { wm.addDesktop(); syncDesktopBar(el, wm); return; }
        wm.switchDesktop(Number(v));
    });
    // Double-click a desktop chip → inline rename. Faster than the context
    // menu's Rename… for the common case. Persists via wm._persist so the new
    // label survives a restart.
    el.addEventListener('dblclick', async (e) => {
        const btn = e.target.closest('[data-desktop]');
        if (!btn || btn.dataset.desktop === '+') return;
        e.preventDefault();
        const idx = Number(btn.dataset.desktop);
        const d = wm.desktops.desktops[idx];
        if (!d) return;
        const result = await openForm({
            title: 'Rename desktop',
            fields: [{ name: 'label', label: 'Name', type: 'text', required: true,
                       hint: 'Up to 24 characters. Shown in the bottom-bar chip and the Alt+N tooltip.' }],
            defaults: { label: d.label },
            submitLabel: 'Rename',
        });
        if (!result || !result.label) return;
        d.label = String(result.label).slice(0, 24);
        syncDesktopBar(el, wm);
        wm._persist();
    });
    el.addEventListener('contextmenu', (e) => {
        const btn = e.target.closest('[data-desktop]');
        if (!btn || btn.dataset.desktop === '+') return;
        e.preventDefault();
        const idx = Number(btn.dataset.desktop);
        const m = wm.desktops;
        const d = m.desktops[idx];
        const canDelete = m.desktops.length > 1;
        showContextMenu(e.clientX, e.clientY, [
            { label: `Switch to ${d.label}`, icon: 'desktop_windows',
              action: 'switch', disabled: idx === m.activeIdx },
            { label: 'Rename…',      icon: 'edit', action: 'rename' },
            { separator: true },
            { label: 'New desktop',  icon: 'add',  action: 'add' },
            { label: 'Delete desktop', icon: 'delete', action: 'delete',
              danger: true, disabled: !canDelete },
        ], async (action) => {
            if (action === 'switch') wm.switchDesktop(idx);
            else if (action === 'rename') {
                const result = await openForm({
                    title: 'Rename desktop',
                    fields: [{ name: 'label', label: 'Name', type: 'text', required: true }],
                    defaults: { label: d.label },
                    submitLabel: 'Rename',
                });
                if (!result || !result.label) return;
                d.label = String(result.label).slice(0, 24);
                syncDesktopBar(el, wm);
                wm._persist();
            }
            else if (action === 'add')    { wm.addDesktop(); syncDesktopBar(el, wm); }
            else if (action === 'delete') { wm.removeDesktop(idx); syncDesktopBar(el, wm); }
        });
    });
    return el;
}

function syncDesktopBar(el, wm) {
    if (!el) return;
    const m = wm.desktops;
    el.innerHTML =
        m.desktops.map((d, i) => `
            <button class="twm-desk__btn${i === m.activeIdx ? ' twm-desk__btn--on' : ''}"
                    data-desktop="${i}"
                    title="Desktop ${d.label} (Alt+${i + 1}) · right-click to delete">
                ${d.label}
            </button>`).join('')
        + `<button class="twm-desk__btn twm-desk__btn--add"
                  data-desktop="+" title="Add desktop">+</button>`;
}


// ══ Tile menus ════════════════════════════════════════════════════════

/** Hamburger button in a tile's tab bar. Lists the same content the tile's
 *  home page would, with search + pagination. Clicking a row opens the entity
 *  in a NEW TAB on the ORIGINATING tile (the leaf id is captured at click
 *  time, so a focus change between click and pick doesn't reroute it). */
function _tileTabMenu(wm, leafId, x, y) {
    const tree = wm.desktops.active().tree;
    const leaf = tree.get(leafId);
    if (!leaf) return;
    const kind = leaf.content?.kind || wm.taxonomy.root;
    openTileTabMenu({
        x, y, leafKind: kind, api: wm.api,
        taxonomy: wm.taxonomy, entities: wm.ctx.entities,
        onPick: (navKind, shaped) => {
            tree.appendLeafTab(leafId, {
                kind: navKind,
                props: { id: shaped.id, label: shaped.label },
            }, shaped.label || shaped.id);
            tree.focus(leafId);
            wm.renderer.render();
            wm._persist?.();
            wm._notifyChange?.('tab-open-from-menu');
        },
    });
}

/** Right-click on a tile's chrome strip: structural actions on that leaf. */
function _tileContextMenu(wm, leafId, x, y) {
    const tree = wm.desktops.active().tree;
    const leaf = tree.get(leafId);
    if (!leaf) return;
    const isPanel = String(leaf.content?.kind || '').startsWith('panel:');
    tree.focus(leafId);
    wm.renderer._updateFocusClasses();

    const items = [
        { label: 'Split horizontally', icon: 'splitscreen_vertical_add', action: 'split-h' },
        { label: 'Split vertically',   icon: 'splitscreen_add',          action: 'split-v' },
        { separator: true },
        { label: 'Open in new tab',    icon: 'tab',
          action: 'open-tab',    disabled: isPanel || !leaf.content },
        { label: 'Open in new window', icon: 'open_in_full',
          action: 'open-window', disabled: isPanel || !leaf.content },
        { label: 'Promote to window', icon: 'open_in_new',
          action: 'promote', disabled: isPanel || !leaf.content },
    ];
    if (wm.desktops.desktops.length > 1 && !isPanel) {
        for (const [i, d] of wm.desktops.desktops.entries()) {
            if (i === wm.desktops.activeIdx) continue;
            items.push({ label: `Move to desktop ${d.label}`, icon: 'sweep',
                         action: `move:${i}` });
        }
    }
    items.push({ separator: true });
    items.push({ label: 'Close tile', icon: 'close', action: 'close',
                 danger: true, disabled: isPanel });

    showContextMenu(x, y, items, (action) => {
        if (action === 'split-h') wm.split('h');
        else if (action === 'split-v') wm.split('v');
        else if (action === 'open-tab') {
            const c = leaf.content;
            if (c) wm.openInTabFromContext({ leafId }, c.kind, c.props || {});
        }
        else if (action === 'open-window') {
            const c = leaf.content;
            if (c) wm.navigate(c.kind, c.props || {}, { target: 'window' });
        }
        else if (action === 'promote') wm.toggleManagedFocused();
        else if (action === 'close')   wm.closeFocused();
        else if (action?.startsWith?.('move:')) {
            wm.moveFocusedToDesktop(Number(action.slice(5)));
        }
    });
}
