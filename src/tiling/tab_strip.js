/**
 * tab_strip.js — ONE tab strip, over one ordered list of tab specs.
 *
 * ── Why this is a module and not a method ────────────────────────────────
 *
 * C22 taught `tile_renderer.js` to draw a leaf's tabs with `NotebookTabBar`,
 * the editor's strip, and that code is not really about leaves: it is about
 * translating between a component whose vocabulary is FILE PATHS and a list of
 * `{kind, props, title}` that has no identity of its own. R8 needs exactly that
 * translation a second time — a pane floated into a window takes its tab strip
 * with it, because the pane IS its tabs and a window showing only one of them
 * is not the pane — and the strip in the window is not attached to a leaf at
 * all. Its tabs live in the WM's window record.
 *
 * So the translation moves here, where neither side owns it, and both sides
 * reach it the same way. A second implementation of it in `wm.js` would be a
 * second copy of the four corrections below, and they would drift apart
 * silently: none of them is a syntax error and none throws at import.
 *
 * ── The four corrections, and why each one exists ────────────────────────
 *
 *   1. IDENTITY. `NotebookTabBar` keys everything — its reorder, its active
 *      comparison, its rename selector — on a file path. A tab list has no ids
 *      (the tree gives tabs none and neither does a window record), so the
 *      INDEX serves, and it is the one identity such a list is guaranteed to
 *      have. The `builtin://` prefix is not decoration: `#beginInlineRename`
 *      refuses to start on a path carrying it (`notebook_tab_bar.js:402`),
 *      which is what a tab needs — double-click rename would rename a TAB, and
 *      a tab is a view of an entity whose name lives somewhere neither caller
 *      can reach.
 *   2. THE GLYPH. The component picks one out of a static map of FILE kinds.
 *      Ours are the embedder's kinds and the taxonomy already answers for them.
 *      `setFileTypeIcons()` is not the way: it is STATIC and REPLACES the whole
 *      map, so a page that also uses the editor would find its own file icons
 *      deleted by whichever of the two rendered last.
 *   3. THE TOOLTIP. Its title attribute is the file PATH — ours would read
 *      `builtin://tab/3`, i.e. a tab advertising its own array index.
 *   4. ONE TAB CONTEXT MENU IN THE APPLICATION, not two. The component opens
 *      its own `.nb-context-menu` whose verbs are a notebook's (rename,
 *      duplicate, reveal in explorer). The caller has a menu already; the
 *      component's is suppressed in the CAPTURE phase, because its handler is
 *      bound on each tab element in the bubble phase and stopping the event on
 *      the way DOWN is what keeps its menu from opening at all.
 *
 * The class names touched here are the component's published contract, stated
 * in its own header comment.
 */

import { NotebookTabBar } from '../editor/notebook_tab_bar.js';

/** A tab's identity, for a component that only understands paths. See (1). */
export function tabKey(idx) { return `builtin://tab/${idx}`; }

/** …and back. `-1` for anything that is not one of ours. */
export function tabKeyIndex(key) {
    const n = Number(String(key ?? '').replace('builtin://tab/', ''));
    return Number.isInteger(n) && n >= 0 ? n : -1;
}

/**
 * DRAG-TO-REORDER ARRIVES AS A PERMUTATION, and every tab model here moves ONE
 * tab at a time (`TileTree.moveLeafTab(leafId, from, to)`, and the window
 * record's own splice). They reconcile because a drag only ever moves one
 * element: every other key shifts by exactly one place, so the element that
 * travelled furthest between the two orders IS the one that was dragged.
 *
 * @returns {{from: number, to: number}|null} null when the order is not a
 *   permutation of `count` tabs, or when nothing actually moved.
 */
export function reorderToMove(order, count) {
    if (!Array.isArray(order) || order.length !== count) return null;
    let from = -1;
    let to = -1;
    let furthest = 0;
    order.forEach((key, newIdx) => {
        const oldIdx = tabKeyIndex(key);
        if (oldIdx < 0) return;
        const travelled = Math.abs(newIdx - oldIdx);
        if (travelled > furthest) { furthest = travelled; from = oldIdx; to = newIdx; }
    });
    if (from < 0 || from === to) return null;
    return { from, to };
}

/**
 * Mount a tab strip into `hostEl` and drive it from a plain tab list.
 *
 * Every gesture leaves through ONE callback with the SAME vocabulary the tile
 * renderer's two layouts already use — `switch` / `close` / `move` / `menu` —
 * so a caller wires one function and the WM's tree mutations, its persistence
 * and its change notifications stay reachable by one path from every strip in
 * the application.
 *
 * @param {object}      cfg
 * @param {HTMLElement} cfg.hostEl    the bar element. The strip mounts into a
 *   CHILD of it, because `mount()` assigns `container.className = 'tabs
 *   notebook-tabs'` (`notebook_tab_bar.js:61`) — handing it the bar would take
 *   that class, and with it the bar's height, background and `--hidden`, off
 *   the element the caller still controls.
 * @param {object}     [cfg.taxonomy] asked for each kind's glyph. Absent ⇒ the
 *   glyph is hidden rather than wrong.
 * @param {(action: 'switch'|'close'|'move'|'menu', data: object) => void} cfg.onAction
 * @returns {{update: (tabs: object[], activeIdx: number) => void, dispose: () => void}}
 */
export function createTabStrip({ hostEl, taxonomy = null, onAction }) {
    const host = document.createElement('div');
    hostEl.appendChild(host);
    const strip = new NotebookTabBar();
    let tabs = [];

    strip.mount(host, {
        onActivate: (key) => {
            const idx = tabKeyIndex(key);
            if (idx >= 0) onAction?.('switch', { idx });
        },
        onClose: (key) => {
            const idx = tabKeyIndex(key);
            if (idx >= 0) onAction?.('close', { idx });
        },
        onReorder: (order) => {
            const move = reorderToMove(order, tabs.length);
            if (move) onAction?.('move', move);
        },
        // Everything else the component offers that a tab here cannot honour is
        // deliberately absent rather than stubbed — `onRename` is refused by the
        // `builtin://` key, and the rest (`onDuplicate`, `onSplitRight`,
        // `onRevealInExplorer`, `onCloseAll`, …) are only ever reached from the
        // context menu suppressed below.
    });

    // See (4). Capture phase, on the container.
    const onContextMenu = (ev) => {
        const tabEl = ev.target.closest?.('.tab');
        if (!tabEl) return;
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Array.prototype.indexOf.call(host.querySelectorAll('.tab'), tabEl);
        if (idx < 0) return;
        onAction?.('menu', { idx, x: ev.clientX, y: ev.clientY });
    };
    host.addEventListener('contextmenu', onContextMenu, true);

    /** See (2) and (3) — one pass over the DOM the component just wrote. */
    const repaint = () => {
        host.querySelectorAll('.tab').forEach((el, i) => {
            const spec = tabs[i];
            if (!spec) return;
            el.title = spec.title || spec.kind || '';
            const icon = spec.kind ? taxonomy?.meta?.(spec.kind)?.icon : null;
            const glyph = el.querySelector('.tab-icon');
            if (!glyph) return;
            if (icon) { glyph.textContent = icon; glyph.hidden = false; }
            else glyph.hidden = true;
        });
    };

    return {
        /** @param {Array<{kind: string, props?: object, title?: string, dirty?: boolean}>} next */
        update(next, activeIdx) {
            tabs = Array.isArray(next) ? next : [];
            const active = Math.max(0, Math.min(tabs.length - 1, activeIdx || 0));
            strip.update(
                tabs.map((t, i) => ({
                    filePath: tabKey(i),
                    label: t.title || t.kind || '',
                    fileType: t.kind || 'unknown',
                    // Nothing sets `dirty` on a tab spec today, so the dot is
                    // never drawn. Read anyway, because the day a tab can say it
                    // holds unsaved work this is where it says it, and the
                    // alternative is a second place to remember.
                    isDirty: !!t.dirty,
                })),
                tabKey(active));
            repaint();
        },
        dispose() {
            host.removeEventListener('contextmenu', onContextMenu, true);
            try { strip.dispose(); } catch (err) {
                console.error('[tab-strip] dispose threw', err);
            }
            host.remove();
        },
    };
}
