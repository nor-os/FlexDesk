/**
 * keymap.js — Alt-based shortcuts for the tiling window manager.
 *
 *   Alt+H               split focused tile horizontally (new empty pane)
 *   Alt+V               split focused tile vertically (new empty pane)
 *   Alt+Shift+H         open focused tile's content in a horizontal split
 *   Alt+Shift+V         open focused tile's content in a vertical split
 *   Alt+T               open focused tile's content in a new tab
 *   Alt+N               open focused tile's content in a new window
 *   Alt+W               close focused tile
 *   Alt+F               promote focused tile <-> managed window (moves it)
 *   Alt+ArrowLeft/Right/Up/Down         move focus
 *   Alt+Shift+Arrow…    swap focused tile with neighbour
 *   Alt+1..9            switch desktop
 *   Alt+Shift+1..9      move focused tile to desktop N
 *   Ctrl+ArrowLeft/Right                iterate virtual desktops
 *   Shift+ArrowLeft/Right               iterate bottom-panel tabs (when present)
 *   Ctrl+Tab / Ctrl+Shift+Tab           next / previous main-panel tab (focused tile)
 *   F1..F8              jump to the Nth top-nav page
 *   Ctrl+K              open command palette
 *   ?                   open Help (lists every shortcut) — bound globally
 *                       by help_modal.js, not here
 *   Esc                 close palette / managed-modal
 *
 * The user-facing reference is `KEYMAP_SHORTCUTS` below, which the palette's
 * built-in *Keyboard shortcuts* command shows as a help topic (see
 * `keyboardShortcutsTopic`) — keep that table in sync when binding new
 * chords here.
 *
 * The handler refuses to act when focus is in an editable field, unless
 * the chord uses the Alt modifier (which is never typed into a field).
 *
 * ── It returns a disposer, and that is not decoration ──────────────────
 * The listener is on `document` and is bound to ONE shell's `wm` and
 * `palette`. An embedder that can build a second shell in the same page —
 * Tables rebuilds its whole shell when you switch project, because every open
 * tab names a table by id — would otherwise leave the first one's handler
 * attached for ever. Two handlers is not "twice as responsive": `Ctrl+K`
 * toggles the dead palette open and the live one closed in the same keystroke,
 * and `Alt+W` closes a tile in a tree nobody can see. `createShell().dispose()`
 * calls this.
 */

/**
 * The window manager's default bindings, as the user reads them: one row per
 * chord (or family of chords), `keys` as drawn, `action` in plain words. The
 * `?` row is help_modal.js's global shortcut, listed here because it is the
 * key the user reaches for to see this list.
 */
export const KEYMAP_SHORTCUTS = Object.freeze([
    { keys: 'Ctrl+K', action: 'Open the command palette' },
    { keys: '?', action: 'Open help' },
    { keys: 'Esc', action: 'Close the palette or a modal' },
    { keys: 'F1..F8', action: 'Jump to the Nth top-nav page' },
    { keys: 'Backspace', action: 'Go back one step up the breadcrumb' },
    { keys: 'Alt+H / Alt+V', action: 'Split the focused tile horizontally / vertically (empty pane)' },
    { keys: 'Alt+Shift+H / Alt+Shift+V', action: "Open the focused tile's content in a horizontal / vertical split" },
    { keys: 'Alt+T', action: "Open the focused tile's content in a new tab" },
    { keys: 'Alt+N', action: "Open the focused tile's content in a new window" },
    { keys: 'Alt+W', action: 'Close the focused tile' },
    { keys: 'Alt+F', action: 'Float the focused tile into a window, or dock it back' },
    { keys: 'Alt+Arrow', action: 'Move focus to the neighbouring tile' },
    { keys: 'Alt+Shift+Arrow', action: 'Swap the focused tile with its neighbour' },
    { keys: 'Alt+1..9', action: 'Switch to desktop N' },
    { keys: 'Alt+Shift+1..9', action: 'Move the focused tile to desktop N' },
    { keys: 'Ctrl+Left / Ctrl+Right', action: 'Previous / next desktop' },
    { keys: 'Shift+Left / Shift+Right', action: 'Previous / next bottom-panel tab' },
    { keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'Next / previous tab in the focused tile' },
].map((r) => Object.freeze(r)));

/** The help topic id the palette's *Keyboard shortcuts* command opens. */
export const KEYBOARD_SHORTCUTS_TOPIC_ID = 'keyboard-shortcuts';

const _esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * `KEYMAP_SHORTCUTS` as a help topic (`{id, title, html}`, the shape a
 * HelpProvider's `loadTopic` answers). The palette hands it to HelpModal as
 * the FALLBACK for its built-in command: an application whose provider
 * defines `keyboard-shortcuts` shows its own topic; one that defines none —
 * or registers no help at all — shows this table instead of an error.
 */
export function keyboardShortcutsTopic(shortcuts = KEYMAP_SHORTCUTS) {
    const rows = shortcuts.map((r) =>
        `<tr><td><kbd>${_esc(r.keys)}</kbd></td><td>${_esc(r.action)}</td></tr>`).join('');
    return {
        id: KEYBOARD_SHORTCUTS_TOPIC_ID,
        title: 'Keyboard shortcuts',
        html: '<table class="help-shortcuts"><thead><tr><th>Keys</th><th>Action</th></tr></thead>'
            + `<tbody>${rows}</tbody></table>`,
    };
}

export function installKeymap({ wm, palette, ...opts } = {}) {
    const onKeyDown = (e) => {
        const inField = e.target?.closest?.(
            'input, textarea, select, [contenteditable="true"]');

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
            e.preventDefault();
            palette.toggle();
            return;
        }
        // ── Ctrl+Tab / Ctrl+Shift+Tab → next / previous main-panel tab in the
        // focused tile (wraps). Works everywhere (Tab isn't a text key here);
        // no-op when the tile has a single tab.
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Tab') {
            e.preventDefault();
            wm.cycleFocusedTab(e.shiftKey ? -1 : 1);
            return;
        }
        if (e.key === 'Escape') {
            if (palette.isOpen()) { palette.close(); return; }
            // Let managed-window system handle its own Esc.
        }
        // Backspace = walk one step up the breadcrumb hierarchy. Skips
        // when the user is typing in a field so it doesn't steal
        // text-deletion.
        if (e.key === 'Backspace' && !inField && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            wm.navigateBack?.();
            return;
        }

        // ── F1..F8 → jump straight to the Nth top-nav page. F-keys never
        // type, but we still skip while a field is focused so editing
        // flows (query editor, filters) keep keyboard focus.
        const fMatch = /^F([1-9]|1[0-2])$/.exec(e.key);
        if (fMatch && !inField && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            // The selector is a CONFIG option, not a constant. An embedder that
            // moves its sections out of the top bar — into an icon rail, say —
            // would otherwise find F1..F8 silently doing nothing: the query
            // returns an empty NodeList, `idx < btns.length` is false, and the
            // handler falls through without a hint that anything is bound.
            // Passing `navSelector` is how such an embedder keeps the keys.
            const btns = document.querySelectorAll(
                opts.navSelector
                || '.twm-global-top-bar .twm-bar-center.twm-top-nav .twm-top-nav__btn');
            const idx = Number(fMatch[1]) - 1;
            if (idx < btns.length) {
                e.preventDefault();
                btns[idx].click();
                return;
            }
        }

        // ── Shift+Left/Right → previous/next bottom-panel tab. No-op when
        // no bottom panel is mounted. Skipped in fields so Shift+Arrow
        // keeps selecting text there.
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !inField
            && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            const tabs = [...document.querySelectorAll('.twm-bp__tabs .twm-bp__tab')];
            if (tabs.length) {
                const cur = tabs.findIndex((t) => t.classList.contains('twm-bp__tab--on'));
                const dir = e.key === 'ArrowRight' ? 1 : -1;
                const next = ((cur < 0 ? 0 : cur) + dir + tabs.length) % tabs.length;
                e.preventDefault();
                tabs[next].click();
                return;
            }
        }

        // ── Ctrl+Left/Right → iterate virtual desktops (wraps).
        if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !inField
            && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            wm.cycleDesktop(e.key === 'ArrowRight' ? 1 : -1);
            return;
        }

        if (!e.altKey) return;
        // Browser Alt+letter triggers menu-access in some browsers — always preventDefault.
        const key = e.key.toLowerCase();

        // Desktop switch / move — Alt+digit
        if (/^[1-9]$/.test(e.key)) {
            e.preventDefault();
            const idx = Number(e.key) - 1;
            if (e.shiftKey) wm.moveFocusedToDesktop(idx);
            else wm.switchDesktop(idx);
            return;
        }

        switch (key) {
            // Plain Alt+H/V split into an empty pane; with Shift they open
            // the focused tile's own content in the new split.
            case 'h':
                e.preventDefault();
                e.shiftKey ? wm.splitFocusedWith('h') : wm.split('h');
                return;
            case 'v':
                e.preventDefault();
                e.shiftKey ? wm.splitFocusedWith('v') : wm.split('v');
                return;
            case 't': e.preventDefault(); wm.openFocusedInTab(); return;
            case 'n': e.preventDefault(); wm.openFocusedInWindow(); return;
            case 'w': e.preventDefault(); wm.closeFocused(); return;
            case 'f': e.preventDefault(); wm.toggleManagedFocused(); return;
            case 'arrowleft':
                e.preventDefault();
                e.shiftKey ? wm.moveFocused('left') : wm.focusDir('left');
                return;
            case 'arrowright':
                e.preventDefault();
                e.shiftKey ? wm.moveFocused('right') : wm.focusDir('right');
                return;
            case 'arrowup':
                e.preventDefault();
                e.shiftKey ? wm.moveFocused('up') : wm.focusDir('up');
                return;
            case 'arrowdown':
                e.preventDefault();
                e.shiftKey ? wm.moveFocused('down') : wm.focusDir('down');
                return;
        }

        // Suppress accidental browser menu-access on bare Alt+letter
        // chords we don't bind (so the user doesn't get a Firefox/Chromium
        // menu popping open mid-flow).
        if (key.length === 1 && /[a-z]/.test(key) && !inField) {
            e.preventDefault();
        }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}
