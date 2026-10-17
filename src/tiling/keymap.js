/**
 * keymap.js — the window manager's keyboard shortcuts.
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
 *   F1..F12             jump to the Nth top-nav page (the table says F1..F8)
 *   Backspace           go back one step up the breadcrumb
 *   Ctrl+K              open command palette
 *   ?                   open Help
 *   Esc                 close the palette
 *   any other Alt+letter   swallowed (no browser menu-access mid-flow)
 *
 * ── The bindings are DATA, and an embedder may change them ─────────────
 * Every chord above is one row of `DEFAULT_CHORDS`: a chord id, the action it
 * runs, and whether it also fires while focus is in an editable field. An
 * embedder passes `bindings: { [chordId]: action | false | fn }` (through
 * `createShell({ keymap: { bindings } })`):
 *
 *   'F1': false            the chord is the window manager's no more; the event
 *                          is not prevented, so the application's own handler
 *                          gets it untouched
 *   'F2': 'nav:0'          the chord runs another built-in action (`ACTIONS`)
 *   'Alt+W': (e, ctx) => … the chord runs the embedder's function; the event is
 *                          prevented unless it returns `false`
 *
 * Only the chords listed in `DEFAULT_CHORDS` can be rebound — the keymap
 * owns those and nothing else. An unknown chord id, or an unknown action
 * name, is reported ONCE (a warning when the keymap is installed) and
 * ignored, so a typo shows up at boot instead of as a key that silently does
 * nothing.
 *
 * ── An event somebody else handled is theirs ──────────────────────────
 * The listener is on `document`, so every component's own keydown handler
 * runs first. One that called `preventDefault()` — a list's Backspace that
 * deletes a row, an editor's Alt+Arrow — keeps its behaviour: the keymap
 * skips every event that is already `defaultPrevented`.
 *
 * The user-facing reference is `KEYMAP_SHORTCUTS` below, which the palette's
 * built-in *Keyboard shortcuts* command shows as a help topic (see
 * `keyboardShortcutsTopic`); `keymapShortcuts(bindings)` is the same table
 * after an embedder's bindings, and that is what the shell hands the palette.
 * Keep the table and `DEFAULT_CHORDS` in step when binding new chords here.
 *
 * Unless a chord is marked as working in fields, the handler refuses to act
 * when focus is in an editable field.
 *
 * ── It returns a disposer, and that is not decoration ──────────────────
 * The listener is on `document` and is bound to ONE shell's `wm` and
 * `palette`. An embedder that can build a second shell in the same page —
 * Tables rebuilds its whole shell when you switch project, because every open
 * tab names a table by id — would otherwise leave the first one's handler
 * attached for ever. Two handlers is not "twice as responsive": `Ctrl+K`
 * toggles the dead palette open and the live one closed in the same keystroke,
 * and `Alt+W` closes a tile in a tree nobody can see. `createShell().dispose()`
 * calls this. The `?` help shortcut is one of these chords, so it comes off
 * with the rest — importing the help modal installs no listener of its own.
 */

import { HelpModal } from '../help/help_modal.js';

/**
 * The window manager's default bindings, as the user reads them: one row per
 * chord (or family of chords), `keys` as drawn, `action` in plain words.
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
 * A shortcuts table (`KEYMAP_SHORTCUTS`, or `keymapShortcuts(bindings)`) as a
 * help topic (`{id, title, html}`, the shape a HelpProvider's `loadTopic`
 * answers). The palette hands it to HelpModal as the FALLBACK for its built-in
 * command: an application whose provider defines `keyboard-shortcuts` shows
 * its own topic; one that defines none — or registers no help at all — shows
 * this table instead of an error.
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

// ══ Actions ════════════════════════════════════════════════════════════
// What a chord can run, by name. `run(ctx, e)` answers `false` when the event
// is to be left unprevented (an F-key with no Nth top-nav button, Esc). `label`
// is the shortcuts table's words; an action without one is not listed.

const DEFAULT_NAV_SELECTOR = '.twm-global-top-bar .twm-bar-center.twm-top-nav .twm-top-nav__btn';
const DIRS = ['left', 'right', 'up', 'down'];
const _where = (d) => (d === 'up' || d === 'down' ? d : `on the ${d}`);

/** The fixed-name actions. Parameterised ones (`nav:N`, `desktop:N`,
 *  `toDesktop:N`, all counted from 0) are built by `_action`. */
const ACTIONS = {
    'palette':       { label: 'Open the command palette', run: ({ palette }) => { palette.toggle(); } },
    'palette:close': { label: 'Close the palette', run: ({ palette }) => {
        // Not prevented either way: a managed modal handles its own Esc.
        if (palette.isOpen()) palette.close();
        return false;
    } },
    'help':          { label: 'Open help', run: () => { HelpModal.toggle(); } },
    'back':          { label: 'Go back one step up the breadcrumb', run: ({ wm }) => { wm.navigateBack?.(); } },
    'tab:next':      { label: 'Next tab in the focused tile', run: ({ wm }) => { wm.cycleFocusedTab(1); } },
    'tab:prev':      { label: 'Previous tab in the focused tile', run: ({ wm }) => { wm.cycleFocusedTab(-1); } },
    'desktop:next':  { label: 'Next desktop', run: ({ wm }) => { wm.cycleDesktop(1); } },
    'desktop:prev':  { label: 'Previous desktop', run: ({ wm }) => { wm.cycleDesktop(-1); } },
    'panelTab:next': { label: 'Next bottom-panel tab', run: () => _cyclePanelTab(1) },
    'panelTab:prev': { label: 'Previous bottom-panel tab', run: () => _cyclePanelTab(-1) },
    'split:h':       { label: 'Split the focused tile horizontally (empty pane)', run: ({ wm }) => { wm.split('h'); } },
    'split:v':       { label: 'Split the focused tile vertically (empty pane)', run: ({ wm }) => { wm.split('v'); } },
    'splitWith:h':   { label: "Open the focused tile's content in a horizontal split", run: ({ wm }) => { wm.splitFocusedWith('h'); } },
    'splitWith:v':   { label: "Open the focused tile's content in a vertical split", run: ({ wm }) => { wm.splitFocusedWith('v'); } },
    'openInTab':     { label: "Open the focused tile's content in a new tab", run: ({ wm }) => { wm.openFocusedInTab(); } },
    'openInWindow':  { label: "Open the focused tile's content in a new window", run: ({ wm }) => { wm.openFocusedInWindow(); } },
    'close':         { label: 'Close the focused tile', run: ({ wm }) => { wm.closeFocused(); } },
    'float':         { label: 'Float the focused tile into a window, or dock it back', run: ({ wm }) => { wm.toggleManagedFocused(); } },
    // Bare Alt+letter: browsers open their menu bar on it, mid-flow.
    'suppress':      { label: null, run: () => {} },
    ...Object.fromEntries(DIRS.flatMap((d) => [
        [`focus:${d}`, { label: `Move focus to the tile ${_where(d)}`, run: ({ wm }) => { wm.focusDir(d); } }],
        [`move:${d}`, { label: `Swap the focused tile with its neighbour ${_where(d)}`, run: ({ wm }) => { wm.moveFocused(d); } }],
    ])),
};

/** The action a name refers to, or null. */
function _action(name) {
    if (typeof name !== 'string') return null;
    if (Object.hasOwn(ACTIONS, name)) return ACTIONS[name];
    const m = /^(nav|desktop|toDesktop):(\d+)$/.exec(name);
    if (!m) return null;
    const n = Number(m[2]);
    if (m[1] === 'nav') {
        return {
            label: `Jump to top-nav page ${n + 1}`,
            // The selector is a CONFIG option, not a constant. An embedder that
            // moves its sections out of the top bar — into an icon rail, say —
            // would otherwise find F1..F8 silently doing nothing. Passing
            // `navSelector` is how such an embedder keeps the keys.
            run: ({ navSelector }) => {
                const btns = document.querySelectorAll(navSelector || DEFAULT_NAV_SELECTOR);
                if (n >= btns.length) return false;
                btns[n].click();
                return undefined;
            },
        };
    }
    if (m[1] === 'desktop') {
        return { label: `Switch to desktop ${n + 1}`, run: ({ wm }) => { wm.switchDesktop(n); } };
    }
    return { label: `Move the focused tile to desktop ${n + 1}`, run: ({ wm }) => { wm.moveFocusedToDesktop(n); } };
}

/** Shift+Left/Right: previous/next bottom-panel tab; nothing without one. */
function _cyclePanelTab(dir) {
    const tabs = [...document.querySelectorAll('.twm-bp__tabs .twm-bp__tab')];
    if (!tabs.length) return false;
    const cur = tabs.findIndex((t) => t.classList.contains('twm-bp__tab--on'));
    tabs[((cur < 0 ? 0 : cur) + dir + tabs.length) % tabs.length].click();
    return undefined;
}

// ══ Chords ═════════════════════════════════════════════════════════════

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const F_KEYS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);

/**
 * Every chord the window manager binds: `[chordId, action, worksInFields]`.
 * Alt is never typed into a field, and Ctrl+K / Ctrl+Tab / Esc are not text
 * keys; everything else would steal an editing key, so it is skipped while
 * focus is in an input, a textarea, a select or a contenteditable.
 *
 * `Alt+Letter` is not a key but the family "any Alt+letter no other row
 * binds"; it only prevents the browser's menu-access.
 */
const DEFAULT_CHORDS = [
    ['Ctrl+K', 'palette', true],
    ['Meta+K', 'palette', true],
    ['?', 'help', false],
    ['Escape', 'palette:close', true],
    ...F_KEYS.map((f, i) => [f, `nav:${i}`, false]),
    ['Backspace', 'back', false],
    ['Alt+H', 'split:h', true],
    ['Alt+V', 'split:v', true],
    ['Alt+Shift+H', 'splitWith:h', true],
    ['Alt+Shift+V', 'splitWith:v', true],
    ['Alt+T', 'openInTab', true],
    ['Alt+N', 'openInWindow', true],
    ['Alt+W', 'close', true],
    ['Alt+F', 'float', true],
    ...ARROWS.map((k, i) => [`Alt+${k}`, `focus:${DIRS[i]}`, true]),
    ...ARROWS.map((k, i) => [`Alt+Shift+${k}`, `move:${DIRS[i]}`, true]),
    ...DIGITS.map((d) => [`Alt+${d}`, `desktop:${d - 1}`, true]),
    ...DIGITS.map((d) => [`Alt+Shift+${d}`, `toDesktop:${d - 1}`, true]),
    ['Ctrl+ArrowLeft', 'desktop:prev', false],
    ['Ctrl+ArrowRight', 'desktop:next', false],
    ['Shift+ArrowLeft', 'panelTab:prev', false],
    ['Shift+ArrowRight', 'panelTab:next', false],
    ['Ctrl+Tab', 'tab:next', true],
    ['Meta+Tab', 'tab:next', true],
    ['Ctrl+Shift+Tab', 'tab:prev', true],
    ['Meta+Shift+Tab', 'tab:prev', true],
    ['Alt+Letter', 'suppress', false],
];

/** The chords each `KEYMAP_SHORTCUTS` row stands for, row for row. */
const SHORTCUT_CHORDS = [
    ['Ctrl+K', 'Meta+K'],
    ['?'],
    ['Escape'],
    F_KEYS,
    ['Backspace'],
    ['Alt+H', 'Alt+V'],
    ['Alt+Shift+H', 'Alt+Shift+V'],
    ['Alt+T'],
    ['Alt+N'],
    ['Alt+W'],
    ['Alt+F'],
    ARROWS.map((k) => `Alt+${k}`),
    ARROWS.map((k) => `Alt+Shift+${k}`),
    DIGITS.map((d) => `Alt+${d}`),
    DIGITS.map((d) => `Alt+Shift+${d}`),
    ['Ctrl+ArrowLeft', 'Ctrl+ArrowRight'],
    ['Shift+ArrowLeft', 'Shift+ArrowRight'],
    ['Ctrl+Tab', 'Meta+Tab', 'Ctrl+Shift+Tab', 'Meta+Shift+Tab'],
];

const DEFAULTS = new Map(DEFAULT_CHORDS.map(([id, action, inField]) => [id, { action, inField }]));
const BY_LOWER = new Map([...DEFAULTS.keys()].map((id) => [id.toLowerCase(), id]));

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'];
const MODIFIER_NAMES = {
    ctrl: 'Ctrl', control: 'Ctrl', meta: 'Meta', cmd: 'Meta', command: 'Meta',
    alt: 'Alt', option: 'Alt', shift: 'Shift',
};
const KEY_ALIASES = { esc: 'Escape', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

/** Shift is how a `?` is typed, so it is not part of that chord; letters,
 *  digits and named keys (Tab, ArrowLeft) keep it. */
const _shiftCounts = (key) => key.length !== 1 || /^[\p{L}\p{N}]$/u.test(key);

function _compose(mods, key) {
    const k = key.length === 1 ? key.toUpperCase() : key;
    const used = MODIFIER_ORDER.filter((m) => mods.has(m) && (m !== 'Shift' || _shiftCounts(key)));
    return [...used, k].join('+');
}

/** The chord id of a keydown event, in `DEFAULT_CHORDS`' spelling. */
function _chordOfEvent(e) {
    const key = e.key;
    if (!key || key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null;
    const mods = new Set();
    if (e.ctrlKey) mods.add('Ctrl');
    if (e.metaKey) mods.add('Meta');
    if (e.altKey) mods.add('Alt');
    if (e.shiftKey) mods.add('Shift');
    return _compose(mods, key);
}

/** An embedder's chord id in canonical spelling, or null if the keymap does
 *  not bind it. Modifiers in any order and case; `Esc` and `Left` are read. */
function _canonicalChord(id) {
    if (typeof id !== 'string' || !id) return null;
    const parts = id.split('+').map((p) => p.trim());
    const keyRaw = parts.pop();
    if (!keyRaw) return null;
    const mods = new Set();
    for (const p of parts) {
        const m = MODIFIER_NAMES[p.toLowerCase()];
        if (!m) return null;
        mods.add(m);
    }
    const key = KEY_ALIASES[keyRaw.toLowerCase()] ?? keyRaw;
    return BY_LOWER.get(_compose(mods, key).toLowerCase()) ?? null;
}

/**
 * The defaults with an embedder's bindings applied: a `Map` of chord id →
 * `{ run, label, inField, isDefault }`, or `{ disabled: true }` for a chord the
 * embedder took away — and what was wrong with `bindings`, for the caller to
 * report.
 */
function _resolve(bindings) {
    const table = new Map();
    for (const [id, { action, inField }] of DEFAULTS) {
        const a = _action(action);
        table.set(id, { run: a.run, label: a.label, inField, isDefault: true });
    }
    const problems = [];
    if (bindings == null) return { table, problems };
    if (typeof bindings !== 'object') {
        problems.push('`bindings` must be an object of { chord: action | false | function } — ignored');
        return { table, problems };
    }
    for (const [rawId, value] of Object.entries(bindings)) {
        const id = _canonicalChord(rawId);
        if (!id) { problems.push(`unknown chord "${rawId}" in bindings — ignored`); continue; }
        const { action: defaultAction, inField } = DEFAULTS.get(id);
        if (value === false) {
            table.set(id, { disabled: true });
        } else if (typeof value === 'function') {
            table.set(id, {
                run: (ctx, e) => value(e, { wm: ctx.wm, palette: ctx.palette }),
                label: 'Defined by the application', inField, isDefault: false,
            });
        } else {
            const a = _action(value);
            if (!a) { problems.push(`unknown action ${JSON.stringify(value)} for chord "${rawId}" — ignored`); continue; }
            table.set(id, { run: a.run, label: a.label, inField, isDefault: value === defaultAction });
        }
    }
    return { table, problems };
}

/**
 * The shortcuts table after `bindings`: a `KEYMAP_SHORTCUTS` row where nothing
 * it stands for was changed and, for a row that was, one line per chord still
 * bound, naming the action it now runs. A disabled chord is not listed. Pure:
 * it reports nothing (`installKeymap` does).
 *
 * @param {object} [bindings]  as for `installKeymap`
 * @returns {ReadonlyArray<{keys: string, action: string}>}
 */
export function keymapShortcuts(bindings = null) {
    const { table } = _resolve(bindings);
    const rows = [];
    SHORTCUT_CHORDS.forEach((chords, i) => {
        if (chords.every((id) => table.get(id).isDefault)) { rows.push(KEYMAP_SHORTCUTS[i]); return; }
        for (const id of chords) {
            const b = table.get(id);
            if (b.disabled || !b.label) continue;
            rows.push(Object.freeze({ keys: id, action: b.label }));
        }
    });
    return Object.freeze(rows);
}

/**
 * Install the window manager's keyboard shortcuts on `document`.
 *
 * @param {object}  cfg
 * @param {object}  cfg.wm
 * @param {object}  cfg.palette
 * @param {string} [cfg.navSelector]  what F1..F12 click (see `nav:N`)
 * @param {object} [cfg.bindings]     `{ [chordId]: action | false | fn }` —
 *                                    see the head of this file
 * @param {object} [cfg.logger]       told of each problem with `bindings` once,
 *                                    as a warning; `console` when omitted
 * @returns {() => void} the disposer
 */
export function installKeymap({ wm, palette, navSelector = null, bindings = null, logger = null } = {}) {
    const { table, problems } = _resolve(bindings);
    const log = logger ?? console;
    for (const p of problems) log.warn?.(`[keymap] ${p}`);
    const ctx = { wm, palette, navSelector };
    const altLetter = table.get('Alt+Letter');

    const onKeyDown = (e) => {
        // A component that handled the key keeps it.
        if (e.defaultPrevented) return;
        const chord = _chordOfEvent(e);
        if (!chord) return;
        let b = table.get(chord);
        if (!b && e.altKey && /^[a-z]$/i.test(e.key)) b = altLetter;
        if (!b || b.disabled) return;
        if (!b.inField && e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        if (b.run(ctx, e) !== false) e.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}
