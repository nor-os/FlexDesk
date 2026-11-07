/**
 * git_pane.js — the git panel as a navigator pane: what a mode of
 * `mountNavPanel` (or any navigator that drives panes through
 * `activate` / `deactivate` / `filter` / `destroy`) mounts for source control.
 *
 *     {
 *       id: 'git', icon: 'fork_right', label: 'Git',
 *       mount: (paneEl, { setBadge }) => createGitPane(paneEl, {
 *           getAdapter: () => adapterForTheOpenProject(),
 *           onOpenDiff: ({ path, status, ref, renamedFrom }) => openIt(path),
 *           setBadge,                       // the strip button shows the change count
 *       }),
 *     }
 *
 * It does what every embedder had to do by hand: build the panel on first
 * visit, point it at the adapter `getAdapter()` returns on every visit (the
 * project may have changed meanwhile), poll status only while the pane is
 * shown, report the number of changed files, filter the changed-file rows and
 * give the pane an overlay scrollbar.
 */

import { installOverlayScrollbar } from '../ui/utils/overlay_scrollbar.js';
import { createGitPanel } from './git_panel.js';

/**
 * @param {HTMLElement} paneEl
 * @param {Object} options
 * @param {() => (Object|null)} options.getAdapter - The adapter for the repository now open, or null.
 * @param {(file: Object) => void} [options.onOpenDiff] - As createGitPanel's.
 * @param {(count: number) => void} [options.setBadge] - Told how many files have changes.
 * @param {string} [options.emptyLabel='No project open']
 * @param {number} [options.pollInterval] - As createGitPanel's.
 * @param {boolean} [options.scrollbar=true] - Install an overlay scrollbar on the pane.
 * @returns {{ panel: Object|null, activate(): void, deactivate(): void, filter(query: string): void,
 *   refresh(): Promise<void>, destroy(): void }}
 */
export function createGitPane(paneEl, options = {}) {
    const {
        getAdapter,
        onOpenDiff = undefined,
        setBadge = null,
        emptyLabel = 'No project open',
        pollInterval = undefined,
        scrollbar = true,
    } = options;
    if (typeof getAdapter !== 'function') throw new TypeError('createGitPane: getAdapter is required');

    let panel = null;
    let overlay = null;
    let query = '';
    let destroyed = false;
    let adapter = null;

    const host = document.createElement('div');
    host.className = 'twm-git-pane';
    paneEl.appendChild(host);

    return {
        get panel() { return panel; },
        activate() {
            if (destroyed) return;
            const next = getAdapter() ?? null;
            if (!panel) {
                adapter = next;
                panel = createGitPanel(host, {
                    adapter: next,
                    emptyLabel,
                    onOpenDiff,
                    onCountChange: (count) => setBadge?.(count),
                    ...(pollInterval === undefined ? {} : { pollInterval }),
                });
                panel.setFilter(query);
                if (scrollbar) overlay = installOverlayScrollbar(host, { orientation: 'vertical', watchSubtree: true });
                return;
            }
            // Another project may be open since the last visit.
            if (next !== adapter) { adapter = next; panel.setAdapter(next); }
            panel.startPolling();
            panel.refresh();
        },
        deactivate() { panel?.stopPolling(); },
        filter(q) {
            query = String(q ?? '');
            panel?.setFilter(query);
        },
        refresh() { return panel ? panel.refresh() : Promise.resolve(); },
        destroy() {
            destroyed = true;
            overlay?.cleanup?.();
            panel?.destroy();
            panel = null;
            host.remove();
        },
    };
}
