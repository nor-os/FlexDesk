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
import { openTileTabSwitcher } from './tile_tab_menu.js';
import { mountZoomControl } from './zoom.js';
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
 * @param {object}     [cfg.palette]    { placeholder, onPick } — C30. `onPick`
 *                                      is `(pick) => truthy` and CLAIMS the
 *                                      open of a picked entity, so an embedder
 *                                      with a rule about where its own entities
 *                                      belong applies that rule whichever door
 *                                      was used. Unclaimed picks still reset
 *                                      the primary tile: the behaviour every
 *                                      embedder has today.
 * @param {object}     [cfg.panels]     C14. Which panel TILES a fresh desktop
 *                                      opens with — `{left, right, bottom}`,
 *                                      merged over all-three-open. An embedder
 *                                      whose navigator is its own chrome passes
 *                                      `{left: false, right: false}` and gets no
 *                                      tile it never registered a factory for.
 * @param {boolean}    [cfg.promoteInPlace] C21. Whether a window promoted out
 *                                      of a tile stays confined to that pane
 *                                      rather than floating over the whole root.
 * @param {boolean}    [cfg.snapPromotion] C15. Whether dragging a promoted
 *                                      window onto a tile puts it back in the
 *                                      tree. Default off — it changes what a
 *                                      drag to an edge does.
 * @param {boolean}    [cfg.backToOpenList] C32. Whether Backspace on a record
 *                                      tab closes it and returns to a list of
 *                                      its section that is already open, rather
 *                                      than rewriting it into a second copy of
 *                                      that list. Default off.
 * @param {boolean}    [cfg.floatActiveTab] C34. Whether floating a tile takes
 *                                      only the tab on screen, leaving its
 *                                      siblings in the tile. Default off: the
 *                                      whole pane floats, strip and all (R8).
 * @param {'top'|'bottom'} [cfg.tabLayout] C22. Where a multi-tab leaf draws its
 *                                      tabs. `'bottom'` is the framework's own
 *                                      spreadsheet strip under the tile body
 *                                      and is the DEFAULT, so no existing
 *                                      embedder's panes rearrange on upgrade;
 *                                      `'top'` mounts the editor tab bar
 *                                      between the chrome and the body. The
 *                                      renderer mirrors this onto `root` as
 *                                      `data-twm-tabs` and watches it, so an
 *                                      embedder whose settings pane holds only
 *                                      the root element can change it live.
 * @param {object}     [cfg.chrome]     { topNav?, paletteButton?, desktops?,
 *                                        panelToggles?: { left?, right?, bottom? },
 *                                        zoom? }
 *                                      `zoom` is C31: the element the content
 *                                      zoom control is painted into — see
 *                                      zoom.js. Absent, there is no control and
 *                                      nothing is ever scaled.
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
    panels = null,
    snapPromotion = false,
    promoteInPlace = false,
    backToOpenList = false,
    floatActiveTab = false,
    tabLayout = null,
    chrome = {},
    // An embedder that moved its sections out of the top bar — into an icon
    // rail, say — passes the selector its own buttons match, and F1..F8 keep
    // working. Omitted, the default top-bar selector applies.
    navSelector = null,
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
        panelDefaults: panels,
        snapPromotion,
        promoteInPlace,
        backToOpenList,
        floatActiveTab,
        tabLayout,
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
    // `navSelector` lets an embedder that moved its sections out of the top
    // bar keep F1..F8 working. Omitted, the default top-bar selector applies —
    // the behaviour every existing embedder has today.
    const disposeKeymap = installKeymap({ wm, palette, navSelector });

    // Chrome — painted into the ELEMENTS the embedder handed over. An absent
    // key means absent chrome, not a crash.
    const paletteBtn = mountPaletteButton(chrome.paletteButton, palette);
    topNavEl = mountTopNav(chrome.topNav, taxonomy, wm);
    desktopsEl = mountDesktopBar(chrome.desktops, wm);
    // C31. The content zoom. Painted with the rest of the chrome and, unlike the
    // rest, AWAITED before the first mount: its saved value is applied to `root`
    // as a CSS variable, and a shell that mounted first would paint every tile at
    // 100% and then visibly jump to the user's zoom a moment later. A host with no
    // saved zoom — or no `state` at all — resolves immediately to the default.
    const zoom = mountZoomControl(chrome.zoom, { root, host });
    if (zoom) await zoom.ready;
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
            // `get`/`set` so an embedder can drive the zoom from its own settings
            // pane, or read it, without reaching into the control's DOM.
            zoom,
        }),
        // A shell that can be built can be built TWICE — an embedder that
        // rebuilds on a context change (a different project, a different
        // workspace) does exactly that. Everything this function installs
        // outside `root` has to come off, or the second shell shares the page
        // with the first one's keyboard.
        dispose: () => {
            try { eventBus?.off?.('wm:changed', syncChrome); } catch { /* ignore */ }
            try { disposeKeymap?.(); } catch { /* ignore */ }
            try { palette?.close?.(); } catch { /* ignore */ }
            // Every content factory gets its `destroy()`. Clearing the root
            // element would detach the DOM and tell none of them, so an ERD's
            // `window` keydown listener or a pane's interval would outlive the
            // shell that mounted it. This also stops the renderer painting, so
            // anything still holding a reference to this wm — a callback
            // captured before a rebuild, a promise that has not settled —
            // cannot repaint a dead tree into a root the live shell now owns.
            try { wm.renderer.destroy(); } catch (err) { log.warn?.('renderer teardown', err); }
            // The zoom lives on `root` as a variable and a class. A rebuilt shell on
            // the same root must not inherit the old one's scale with no control on
            // screen to change it, so dispose puts the root back to 100%.
            try { zoom?.dispose(); } catch { /* ignore */ }
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

/**
 * The palette button, REBOUND rather than reused.
 *
 * This used to return an existing `#twm-palette-btn` untouched, which is right
 * only while a page mounts one shell and keeps it. An embedder that rebuilds
 * its shell — Tables does, on every project switch — got its FIRST shell's
 * button back, still wired to the FIRST shell's palette. Clicking it opened a
 * palette over a disposed window manager, and picking a result called
 * `openInPrimary` on a tree nobody could see, whose renderer then painted it
 * into the root the live shell now owns.
 *
 * So the stale node is replaced, which is exactly what `bindPanelToggles` does
 * one function below and for the same reason.
 */
function mountPaletteButton(hostEl, palette) {
    if (!hostEl) return null;
    hostEl.querySelector('#twm-palette-btn')?.remove();
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

/** Hamburger button in a tile's tab bar. Opens a compact menu anchored to
 *  the button that lists the leaf's OPEN TABS for quick switching (a
 *  browser-style tab overflow list). Clicking a row activates that tab.
 *  The leaf id is captured at click time, so a focus change between click
 *  and pick doesn't reroute it. */
function _tileTabMenu(wm, leafId, x, y) {
    const tree = wm.desktops.active().tree;
    const leaf = tree.get(leafId);
    if (!leaf || leaf.kind !== 'leaf') return;
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs : [];
    if (tabs.length === 0) return;
    openTileTabSwitcher({
        x, y,
        tabs,
        activeIdx: Math.max(0, Math.min(tabs.length - 1, leaf.activeTabIdx || 0)),
        onPick: (idx) => {
            tree.setActiveLeafTab(leafId, idx);
            tree.focus(leafId);
            wm.renderer.render();
            wm._persist?.();
            wm._notifyChange?.('tab-switch-from-menu');
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
        // TWO DIFFERENT GLYPHS FOR TWO DIFFERENT DESTINATIONS. `web_asset` is a
        // window INSIDE the application — the same glyph `ManagedWindow` uses
        // for itself — and an embedder that can also send content to a real
        // browser window keeps `open_in_new`, which is the universal "this
        // leaves the page". One glyph for both is how a user learns that the
        // two commands are the same command, and then loses a window looking
        // for it on the other screen.
        { label: 'Open a copy in a window', icon: 'web_asset',
          action: 'open-window', disabled: isPanel || !leaf.content },
        // C20, THE OTHER HALF — and it was missing while the `close` half
        // below carried a paragraph explaining why it could not be.
        //
        // `_floatableLeaf` (`wm.js`) refuses to float content that declared
        // `chrome: { promote: false }`, and every door converges there — so
        // this row offered the verb, enabled, and returned null. The chrome's
        // own float BUTTON does not have the problem: C20 removes it from the
        // strip. That asymmetry is what hid this: the affordance the reader
        // checks is correct, and the menu one layer down is not.
        //
        // `=== false` EXACTLY, because that is the test the verb makes
        // (`wm.js`, `_floatableLeaf`: *"content that says nothing about
        // `promote` stays floatable"*). A falsy test here would grey the row
        // on every leaf whose content returned no `chrome` at all, which is
        // most of them — a menu disagreeing with its verb in the generous
        // direction is a dead control; in the mean direction it is a missing
        // feature, and this file has shipped one of each.
        { label: wm.floatActiveTab ? 'Float this tab as a window' : 'Float this pane as a window',
          icon: 'web_asset',
          action: 'promote',
          disabled: isPanel || !leaf.content
                    || wm.renderer?.leafChrome?.(leafId)?.promote === false },
    ];
    if (wm.desktops.desktops.length > 1 && !isPanel) {
        for (const [i, d] of wm.desktops.desktops.entries()) {
            if (i === wm.desktops.activeIdx) continue;
            items.push({ label: `Move to desktop ${d.label}`, icon: 'sweep',
                         action: `move:${i}` });
        }
    }
    items.push({ separator: true });
    // C20. THE MENU ROW CARRIES THE VETO, AND THE REASON WITH IT.
    //
    // `closeFocused` refuses when the content vetoed `close`, which is what
    // makes the greyed × in the chrome honest — and left this row offering the
    // same verb, enabled, doing nothing. A control that silently no-ops is the
    // dead-control failure this file has fixed three times already. The
    // tooltip is the content's own sentence, so the two doors explain the
    // refusal identically rather than one explaining it and one not.
    const closeVeto = wm.renderer?.leafChrome?.(leafId)?.close;
    const closeVetoed = closeVeto === false || closeVeto?.disabled === true;
    items.push({ label: 'Close tile', icon: 'close', action: 'close',
                 danger: true, disabled: isPanel || closeVetoed,
                 title: closeVetoed ? (closeVeto?.title || undefined) : undefined });

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
