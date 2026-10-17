/**
 * command_palette.js — Ctrl+K center popup.
 *
 *   ┌─────────────────────────────────────────┐
 *   │ search…                                 │
 *   ├─────────────────────────────────────────┤
 *   │ [chip] [chip] [chip] [chip]             │  top-nav shortcut chips
 *   │ [chip] [chip]                           │
 *   │                                         │
 *   │ ☐ left nav   ☐ right panel   ☐ bottom   │  panel toggles
 *   ├─────────────────────────────────────────┤
 *   │ matched entity rows…                    │  search results
 *   └─────────────────────────────────────────┘
 *
 * The chips are the injected taxonomy's top-nav kinds; clicking one
 * loads it into the primary tile. The toggles flip the corresponding
 * panel-tile on/off. Typing searches the injected entity catalog
 * (fetched lazily on first open).
 *
 * ══ C39. THE GROUPED LAYOUT — "FIND ANYTHING" ═══════════════════════════
 *
 * An embedder whose palette is its product's main opener wants a box that
 * finds everything and shows nothing it did not ask for. Every option below
 * is OFF unless passed, so the box above is what an embedder that passes
 * none of them still gets:
 *
 *   ┌─────────────────────────────────────────┐
 *   │ 🔍 [scope ×] search…               Esc  │
 *   ├─────────────────────────────────────────┤
 *   │ TABLES                                  │  a header per group, groups
 *   │ ▦ Cust·omers   Sales   ↵ open  Tab rows │  ordered by their best hit;
 *   │ ▦ Cust·omer contacts           Table    │  matched characters marked
 *   │ ⌄ Show all 9 tables                     │  the cap's way out
 *   ├─────────────────────────────────────────┤
 *   │ ↑↓ move   ↵ open             note       │
 *   └─────────────────────────────────────────┘
 *
 *   chrome     `{ pages: false, panels: false }` omits the chip strip and
 *              the panel toggles.
 *   layout     `'grouped'` turns on the layout above: groups, the tiered
 *              scorer with marked matches, the taxonomy's word for a kind
 *              instead of the kind's id, key hints on the active row.
 *   groupCap   rows per group before *Show all N* (grouped, unscoped; 4).
 *   empty      `() => rows | Promise<rows>` — what the box shows before
 *              anything is typed, under `emptyLabel` ('Recent').
 *   commands   `() => rows` — the embedder's commands, beside the built-in
 *              ones. A row with `action` runs it; one without is handed to
 *              `onPick`. In the grouped layout they compete only once
 *              `commandMinChars` (2) are typed, and `>` restricts to them.
 *   drill      `(pick) => scope | null` — Tab on a row enters a scope:
 *              `{ id?, label, icon?, placeholder?, note?, emptyText?,
 *              minChars?, search(q, signal) }`. `search` answers remotely;
 *              it is debounced, and a stale answer is aborted and never
 *              drawn over a newer one.
 *   cache      true: a re-open draws the previous catalogue at once and
 *              refreshes behind it. `palette.invalidate()` drops it.
 *   tips       strings drawn under Recent when nothing is typed.
 *   footerNote a quiet sentence at the footer's right end.
 *
 * A row may carry, besides `{kind, id, label, hint}`:
 *   context    drawn after the label, NOT searched
 *   keywords   searched, NOT drawn (a string or an array of strings)
 *   cells      short values drawn in place of `context` (a scope's rows)
 *   group      the group key, when it is not `kind`
 *   groupLabel the group's header, when the group is not a taxonomy kind
 *   kindLabel  the word drawn on the right, when the taxonomy's is wrong
 *   boost      added to the match score (an embedder's "recently opened")
 *   modes      which of 'split' / 'window' the row offers (key hints). For
 *              a row whose kind is single (KindDef `single`) both are copy
 *              verbs: the hints are drawn greyed with the taxonomy's reason,
 *              and Ctrl/Shift+Enter on the row does nothing.
 *   drillLabel the Tab hint ("search rows"); Tab is offered only with it
 *   shortcut   a key binding drawn on the right
 *   verb       the Enter hint ('open' by default, 'run' for a command)
 * `hint` keeps its old meaning — drawn AND searched — for a row that sets
 * neither `context` nor `keywords`. A group's header is the taxonomy's
 * `plural` for the kind, else its `label`.
 *
 * `onPick(pick, { mode, scope })` is told how the pick was made: 'open'
 * (Enter, click), 'split' (Ctrl+Enter, Ctrl+click) or 'window'
 * (Shift+Enter, Shift+click); `scope` is the drilled scope's `id`, if any.
 */

import { HelpModal } from '../help/help_modal.js';
import { KEYBOARD_SHORTCUTS_TOPIC_ID, KEYMAP_SHORTCUTS, keyboardShortcutsTopic } from './keymap.js';

const ROOT_ID = 'twm-cmdpal';

/** The words a shortcuts table uses for the help action — the default `?` row's. */
const HELP_ACTION = KEYMAP_SHORTCUTS.find((r) => r.keys === '?').action;

/**
 * Non-entity commands surfaced in the palette's search results. They carry an
 * `action` so `commit()` runs them instead of opening a tile. `shortcuts` is
 * the table the *Keyboard shortcuts* command shows — the shell passes the one
 * its keymap's bindings produced (`keymapShortcuts`). The command's hint names
 * the keys that open help in that table: `?` by default, `F9` when an embedder
 * moved help there, none when no key opens it.
 */
function _staticCommands(shortcuts) {
    const helpKeys = shortcuts.filter((r) => r.action === HELP_ACTION).map((r) => r.keys).join(' / ');
    return [
        { kind: 'command', id: 'shortcuts', label: 'Keyboard shortcuts',
          hint: helpKeys ? `Show all key bindings (${helpKeys})` : 'Show all key bindings',
          icon: 'keyboard', ...(helpKeys ? { shortcut: helpKeys } : {}), verb: 'run',
          // The application's help may define the topic; when it does not, the
          // window manager's own bindings are shown rather than an error.
          action: () => HelpModal.open(KEYBOARD_SHORTCUTS_TOPIC_ID,
                                       { fallback: keyboardShortcutsTopic(shortcuts) }) },
    ];
}

const DEFAULT_GROUP_CAP = 4;
const DEFAULT_COMMAND_MIN_CHARS = 2;
const REMOTE_DEBOUNCE_MS = 150;
const MAX_ROWS = 200;

/** @param taxonomy    injected ontology — supplies the chip strip + row icons
 *  @param catalog     injected entity catalog — supplies the searchable rows
 *  @param placeholder input placeholder. It names the embedder's entity types
 *                     ("try foo:bar"), so the embedder owns the string.
 *  @param onPick      C30. `(pick, how) => truthy` CLAIMS the open, exactly the
 *                     way `ManagedWindow.onMaximize` claims the maximise
 *                     gesture. See `commit` for what it is for; omitted, the
 *                     palette behaves as it always has.
 *  @param chrome, layout, groupCap, empty, emptyLabel, commands,
 *         commandMinChars, drill, cache, tips, footerNote — C39, above.
 *  @param shortcuts   the rows the built-in *Keyboard shortcuts* command lists
 *                     (`{keys, action}`); `KEYMAP_SHORTCUTS` when omitted. */
export function createCommandPalette({ wm, api, taxonomy, catalog, placeholder = 'Search…',
                                       onPick = null,
                                       chrome = {}, layout = 'flat',
                                       groupCap = DEFAULT_GROUP_CAP,
                                       empty = null, emptyLabel = 'Recent',
                                       commands = null,
                                       commandMinChars = DEFAULT_COMMAND_MIN_CHARS,
                                       drill = null, cache = false,
                                       tips = null, footerNote = '',
                                       shortcuts = KEYMAP_SHORTCUTS }) {
    if (!taxonomy) throw new Error('createCommandPalette: a taxonomy is required');
    if (!catalog)  throw new Error('createCommandPalette: an entity catalog is required');
    const grouped = layout === 'grouped';
    let overlay = null;
    let entities = [];
    let cached = null;            // C39 `cache`: the last loaded catalogue
    let onClose = null;

    /** A row whose kind exists once (KindDef `single`): no split, no window. */
    const isSingle = (row) => !!row && !!taxonomy.isSingle?.(row.kind);

    const isOpen = () => !!overlay;
    const close = () => {
        if (!overlay) return;
        try { onClose?.(); } catch { /* ignore */ }
        onClose = null;
        overlay.remove();
        overlay = null;
    };
    const toggle = () => { isOpen() ? close() : open(); };
    const invalidate = () => { cached = null; };
    const staticCommands = _staticCommands(shortcuts);

    const open = async () => {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = ROOT_ID;
        overlay.className = 'twm-cmdpal-overlay' + (grouped ? ' twm-cmdpal-overlay--grouped' : '');
        overlay.innerHTML = _markup(taxonomy, placeholder, wm, { chrome, grouped });
        document.body.appendChild(overlay);
        const mine = overlay;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const input = overlay.querySelector('.twm-cmdpal__input');
        const list = overlay.querySelector('[data-role="list"]');
        const foot = overlay.querySelector('[data-role="footer"]');
        const chipSlot = overlay.querySelector('[data-role="type-chip"]');
        const chips = overlay.querySelectorAll('[data-shortcut]');
        const toggles = overlay.querySelectorAll('[data-toggle]');

        // Reflect current panel state in toggle buttons.
        for (const btn of toggles) {
            const which = btn.dataset.toggle;
            btn.classList.toggle('twm-chip--on', wm.isPanelOpen(which));
        }

        chips.forEach((btn) => btn.addEventListener('click', () => {
            const kind = btn.dataset.shortcut;
            wm.openInPrimary(kind);
            close();
        }));
        toggles.forEach((btn) => btn.addEventListener('click', () => {
            const which = btn.dataset.toggle;
            wm.togglePanel(which);
            btn.classList.toggle('twm-chip--on', wm.isPanelOpen(which));
        }));

        // Scoped-search state. Typing `<prefix>:` converts the prefix
        // into a visual chip that lives to the left of the input;
        // subsequent typing only matches entities whose navKind is in
        // the chip's set. Cleared by clicking the chip's ×, by pressing
        // Backspace when the input is empty, or by Esc (which closes the
        // palette). A prefix can resolve to MULTIPLE navKinds, so the
        // user's mental model can win over the embedder's internal
        // taxonomy. The resolver lives on the injected catalog, next to
        // the alias table it consults.
        let filtered = [];
        let active = 0;
        let typeFilter = null;        // null | string[] (navKinds)
        let typeFilterLabel = null;   // chip text, derived from the resolved kinds

        // C39 state: the rows the empty box shows, a drilled scope and its
        // in-flight remote search.
        let emptyRows = [];
        let scope = null;
        let remote = { seq: 0, ctl: null, timer: null, rows: [], pending: false, error: null };
        const cancelRemote = () => {
            clearTimeout(remote.timer);
            try { remote.ctl?.abort(); } catch { /* ignore */ }
            remote.ctl = null;
        };
        onClose = cancelRemote;

        const renderChip = () => {
            if (scope) {
                chipSlot.innerHTML = `
                    <span class="twm-cmdpal__type-chip" title="${_esc(scope.label)}">
                        <span class="material-symbols-outlined twm-cmdpal__type-chip-icon">${_esc(scope.icon || 'arrow_right')}</span>
                        <span class="twm-cmdpal__type-chip-label twm-cmdpal__type-chip-label--scope">${_esc(scope.label)}</span>
                        <button type="button" class="twm-cmdpal__type-chip-x"
                                data-action="clear-type"
                                aria-label="Leave ${_esc(scope.label)}">×</button>
                    </span>`;
                chipSlot.querySelector('[data-action="clear-type"]')
                    ?.addEventListener('click', (ev) => { ev.preventDefault(); leaveScope(); input.focus(); });
                return;
            }
            if (!typeFilter) {
                chipSlot.innerHTML = '';
                return;
            }
            // Display: first kind's icon/label from the taxonomy. A
            // multi-kind alias gets the leading kind's label, which
            // reads as narrower than the alias actually is — so we
            // override with the typed alias (passed from `refilter`)
            // when it carries information the taxonomy can't infer.
            const head = typeFilter[0];
            const meta = taxonomy.meta(head);
            const label = typeFilterLabel || meta?.label || head;
            chipSlot.innerHTML = `
                <span class="twm-cmdpal__type-chip" title="Filtering by ${_esc(label)} (${typeFilter.length} kind${typeFilter.length === 1 ? '' : 's'})">
                    <span class="material-symbols-outlined twm-cmdpal__type-chip-icon">${meta?.icon || 'arrow_right'}</span>
                    <span class="twm-cmdpal__type-chip-label">${_esc(label)}</span>
                    <button type="button" class="twm-cmdpal__type-chip-x"
                            data-action="clear-type"
                            aria-label="Clear type filter">×</button>
                </span>
            `;
            chipSlot.querySelector('[data-action="clear-type"]')
                ?.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    typeFilter = null;
                    typeFilterLabel = null;
                    renderChip();
                    input.focus();
                    refilter();
                });
        };

        const render = () => {
            if (grouped) { renderGrouped(); return; }
            list.innerHTML = filtered.slice(0, MAX_ROWS).map((e, i) => `
                <div class="twm-cmdpal__item${i === active ? ' twm-cmdpal__item--active' : ''}"
                     data-idx="${i}">
                    <span class="material-symbols-outlined twm-cmdpal__icon">${e.icon || 'arrow_right'}</span>
                    <span class="twm-cmdpal__label">${_esc(e.label || e.id)}</span>
                    <span class="twm-cmdpal__kind">${e.kind}</span>
                    <span class="twm-cmdpal__hint">${_esc(e.hint || '')}</span>
                </div>
            `).join('') || '';
            list.querySelectorAll('[data-idx]').forEach((el) => {
                el.addEventListener('click', () => commit(Number(el.dataset.idx)));
            });
        };

        // ── C39: the grouped layout ─────────────────────────────────────
        //
        // `filtered` stays the ONE flat list the keys walk; `sections` says
        // where its headers go. A "show all" row is an item like any other
        // (`more: <group key>`), so arrows and Enter need no special case.
        let sections = [];            // [{ title, start, count }]

        // A row may name its own group (`groupLabel`) when the group is not a
        // taxonomy kind — "Go to" over an embedder's pages, say.
        const namedGroups = new Map();
        const groupLabel = (key) => {
            if (namedGroups.has(key)) return namedGroups.get(key);
            if (key === 'command') return 'Commands';
            const m = taxonomy.meta(key);
            return m?.plural || m?.label || _titleCase(key);
        };
        const kindLabel = (row) => {
            if (row.kindLabel) return row.kindLabel;
            if (row.kind === 'command') return 'Command';
            return taxonomy.meta(row.kind)?.label || _titleCase(row.kind);
        };

        const rowHtml = (r, i) => {
            const on = i === active ? ' twm-cmdpal__item--active' : '';
            if (r.more) {
                return `<div class="twm-cmdpal__item twm-cmdpal__item--more${on}" data-idx="${i}" role="option">
                    <span class="material-symbols-outlined twm-cmdpal__icon">expand_more</span>
                    <span class="twm-cmdpal__main"><span class="twm-cmdpal__label">${_esc(r.label)}</span></span>
                    <span class="twm-cmdpal__side"><span class="twm-cmdpal__acts"><span><kbd>Enter</kbd> show all</span></span></span>
                </div>`;
            }
            const drawn = _drawn(r);
            const ctx = r.cells?.length
                ? `<span class="twm-cmdpal__cells">${r.cells.map(_esc).join(' · ')}</span>`
                : drawn ? `<span class="twm-cmdpal__context">${_esc(drawn)}</span>` : '';
            const verb = r.verb || (r.action || r.kind === 'command' ? 'run' : 'open');
            const modes = Array.isArray(r.modes) ? r.modes : [];
            const acts = [`<span><kbd>Enter</kbd> ${_esc(verb)}</span>`];
            if (r.drillLabel && drill) acts.push(`<span><kbd>Tab</kbd> ${_esc(r.drillLabel)}</span>`);
            // A single kind has no copies: its split and window hints are
            // drawn refused, with the reason, rather than offered.
            const refused = isSingle(r)
                ? ` class="twm-cmdpal__act--disabled" aria-disabled="true" title="${_esc(taxonomy.singleReason(r.kind))}"`
                : '';
            if (modes.includes('split'))  acts.push(`<span${refused}><kbd>Ctrl Enter</kbd> split</span>`);
            if (modes.includes('window')) acts.push(`<span${refused}><kbd>Shift Enter</kbd> window</span>`);
            const side = r.shortcut
                ? `<kbd class="twm-cmdpal__shortcut">${_esc(r.shortcut)}</kbd>`
                : `<span class="twm-cmdpal__kind">${_esc(kindLabel(r))}</span>`;
            return `<div class="twm-cmdpal__item${on}" data-idx="${i}" role="option">
                <span class="material-symbols-outlined twm-cmdpal__icon">${_esc(r.icon || 'arrow_right')}</span>
                <span class="twm-cmdpal__main"><span class="twm-cmdpal__label">${_mark(r.label || r.id, r._hits)}</span>${ctx}</span>
                <span class="twm-cmdpal__side">${side}<span class="twm-cmdpal__acts">${acts.join('')}</span></span>
            </div>`;
        };

        const renderGrouped = () => {
            let html = '';
            for (const s of sections) {
                if (!s.count) continue;
                if (s.title) html += `<div class="twm-cmdpal__group" role="presentation">${_esc(s.title)}</div>`;
                for (let i = s.start; i < s.start + s.count; i++) html += rowHtml(filtered[i], i);
            }
            const q = input.value.trim();
            if (!filtered.length) {
                if (scope) {
                    const msg = remote.error ? remote.error
                              : remote.pending ? 'Searching…'
                              : q ? `Nothing in ${scope.label} matches “${q}”.`
                              : (scope.emptyText || `Type to search ${scope.label}.`);
                    html += `<div class="twm-cmdpal__empty">${_esc(msg)}</div>`;
                } else if (q && q !== '>') {
                    html += `<div class="twm-cmdpal__empty">Nothing matches “${_esc(q)}”.</div>`;
                }
            } else if (scope && remote.pending) {
                html += '<div class="twm-cmdpal__empty twm-cmdpal__empty--quiet">Searching…</div>';
            }
            if (!q && !scope && !typeFilter && Array.isArray(tips) && tips.length) {
                html += `<div class="twm-cmdpal__tips">${tips.map((t) => `<span>${_esc(t)}</span>`).join('')}</div>`;
            }
            list.innerHTML = html;
            renderFooter();
        };

        // Moving the pointer re-paints CLASSES, never the rows: a list
        // rebuilt between mousedown and mouseup loses the click (the press
        // and the release land on different nodes).
        const paintActive = () => {
            list.querySelectorAll('[data-idx]').forEach((el) => {
                const on = Number(el.dataset.idx) === active;
                el.classList.toggle('twm-cmdpal__item--active', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
                if (on) el.scrollIntoView?.({ block: 'nearest' });
            });
        };

        const renderFooter = () => {
            if (!foot || !grouped) return;
            const parts = ['<span><kbd>↑</kbd><kbd>↓</kbd> move</span>', '<span><kbd>Enter</kbd> open</span>'];
            if (scope || typeFilter) parts.push('<span><kbd>Backspace</kbd> leave</span>');
            parts.push('<span><kbd>Esc</kbd> close</span>');
            const note = scope?.note || footerNote;
            foot.innerHTML = parts.join('')
                + (note ? `<span class="twm-cmdpal__footnote">${_esc(note)}</span>` : '');
        };

        if (grouped) {
            list.addEventListener('mousemove', (e) => {
                const el = e.target.closest?.('[data-idx]');
                if (!el) return;
                const i = Number(el.dataset.idx);
                if (i !== active) { active = i; paintActive(); }
            });
            list.addEventListener('click', (e) => {
                const el = e.target.closest?.('[data-idx]');
                if (!el) return;
                commit(Number(el.dataset.idx), _modeOf(e));
            });
        }

        /**
         * ══ C30. THE PALETTE IS A DOOR, NOT A PLACEMENT POLICY ══════════
         *
         * `openInPrimary` is the wrong verb for a picked ENTITY and it was the
         * only one here. It RESETS the primary leaf to a single fresh tab —
         * its own doc says so, and says why: navigation from outside the tile
         * is a page change, and a page change replaces the page. So picking a
         * table from Ctrl+K threw away every other tab in that leaf, ignored
         * whatever rule the embedder has about where its entities open (a tab
         * beside its siblings, a floating window on a canvas pane, a split),
         * and bypassed any per-mount-site bookkeeping the embedder keeps —
         * for Tables, the grid registry keyed on `(mount site, table)`, which
         * is what holds staged edits across a re-render.
         *
         * The result was a door that did something different from every other
         * door onto the same object: the rail opened a table one way, the
         * palette another, and only the palette destroyed work. Reported as
         * "open table via Ctrl+K does not work" — which is exactly what it
         * looks like from the outside when the tab you were in is replaced.
         *
         * The library cannot decide this. It does not know what a `table` is,
         * which is the whole point of the injected taxonomy and catalogue. So
         * the embedder is offered the pick and may CLAIM it, on the same
         * contract as `ManagedWindow.onMaximize` (`managed_window.js:230`):
         * return truthy and nothing else happens. Guarded, because a throwing
         * embedder must not leave the palette closed over a half-done open —
         * and unclaimed picks still land in the primary tile, so no existing
         * embedder changes behaviour by upgrading.
         *
         * `pick` is the catalogue row (`{kind, id, label, hint, props?}`)
         * rather than a re-shaped argument: the embedder wrote the `shape`
         * that produced it, so it is the one party that can read it. C39 adds
         * a second argument, `{ mode, scope }`; an embedder that reads one
         * argument is unaffected.
         */
        const commit = (i, mode = 'open') => {
            const picked = filtered[i];
            if (!picked) return;
            if (picked.more) { showAll(picked.more); return; }
            // Split and window open a COPY; a single kind refuses both, and the
            // palette stays open on the row whose hints say why.
            if (mode !== 'open' && isSingle(picked)) return;
            const pick = _public(picked);
            const how = { mode, scope: scope?.id ?? null };
            close();
            if (pick.action) { try { pick.action(how); } catch (err) { console.error(err); } return; }
            if (onPick) {
                let handled = false;
                try { handled = onPick(pick, how) ?? false; }
                catch (err) { console.error('[cmdpal] onPick threw', err); }
                if (handled) return;
            }
            wm.openInPrimary(pick.kind, pick.props || { id: pick.id, label: pick.label });
        };

        /** Look for a `<prefix>:` at the start of the raw input. If the
         *  prefix resolves to one or more known kinds, promote it to
         *  the visual chip and strip it from the input field. Returns
         *  true when a chip was set so the caller can decide whether
         *  to re-render. */
        const tryConsumePrefix = () => {
            if (typeFilter || scope) return false;
            const m = input.value.match(/^([a-zA-Z][a-zA-Z0-9_-]*):/);
            if (!m) return false;
            const kinds = catalog.resolveTypePrefix(m[1]);
            if (!kinds || kinds.length === 0) return false;
            typeFilter = kinds;
            typeFilterLabel = _titleCase(m[1]);
            input.value = input.value.slice(m[0].length);
            if (grouped) {
                input.value = input.value.replace(/^\s+/, '');
                typeFilterLabel = groupLabel(kinds[0]);
            }
            renderChip();
            return true;
        };

        /** *Show all N <group>* — the cap's way out. It narrows the box to
         *  that group exactly as a typed `kind:` would, so Backspace leaves
         *  it the same way. */
        const showAll = (key) => {
            typeFilter = [key];
            typeFilterLabel = groupLabel(key);
            if (input.value.startsWith('>')) input.value = input.value.slice(1);
            renderChip();
            refilter();
            input.focus();
        };

        const enterScope = (row) => {
            if (!drill || !row || row.more) return false;
            let next = null;
            try { next = drill(_public(row)); } catch (err) { console.error('[cmdpal] drill threw', err); }
            if (!next || typeof next.search !== 'function') return false;
            cancelRemote();
            scope = next;
            typeFilter = null;
            typeFilterLabel = null;
            input.value = '';
            input.placeholder = next.placeholder || `Search ${next.label}…`;
            remote = { seq: 0, ctl: null, timer: null, rows: [], pending: false, error: null };
            renderChip();
            refilter();
            return true;
        };
        const leaveScope = () => {
            cancelRemote();
            remote.seq++;
            scope = null;
            typeFilter = null;
            typeFilterLabel = null;
            input.placeholder = placeholder;
            renderChip();
            refilter();
        };

        const runRemote = (q) => {
            cancelRemote();
            const seq = ++remote.seq;
            if (q.length < (scope.minChars ?? 1)) {
                remote.rows = []; remote.pending = false; remote.error = null;
                return;
            }
            remote.pending = true;
            remote.error = null;
            const s = scope;
            remote.timer = setTimeout(async () => {
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                remote.ctl = ctl;
                let rows = [];
                let error = null;
                try { rows = await s.search(q, ctl?.signal); }
                catch (err) {
                    if (err?.name === 'AbortError') return;
                    error = err?.userMessage || 'The search failed.';
                    console.warn('[cmdpal] scope search failed', err);
                }
                // A newer keystroke, a left scope or a closed box: drop it.
                if (seq !== remote.seq || scope !== s || overlay !== mine) return;
                remote.rows = _decorateIcons(Array.isArray(rows) ? rows : [], taxonomy)
                    .map((r) => ({ ...r, _hits: _match(String(r.label || ''), q)?.hits || [] }));
                remote.pending = false;
                remote.error = error;
                filtered = remote.rows.slice(0, MAX_ROWS);
                sections = [{ title: s.label, start: 0, count: filtered.length }];
                active = 0;
                render();
            }, REMOTE_DEBOUNCE_MS);
        };

        const refilterGrouped = () => {
            const raw = input.value;
            if (scope) {
                runRemote(raw.trim());
                filtered = remote.rows;
                sections = [{ title: scope.label, start: 0, count: filtered.length }];
                active = 0;
                render();
                return;
            }
            const commandsOnly = !typeFilter && raw.startsWith('>');
            const q = (commandsOnly ? raw.slice(1) : raw).trim();
            const filterSet = typeFilter ? new Set(typeFilter) : null;
            if (!q && !commandsOnly && !filterSet) {
                filtered = emptyRows.slice(0, MAX_ROWS).map((r) => ({ ...r, _hits: [] }));
                sections = [{ title: filtered.length ? emptyLabel : '', start: 0, count: filtered.length }];
                active = 0;
                render();
                return;
            }
            let pool = entities;
            if (commandsOnly) pool = pool.filter((e) => e.kind === 'command');
            else if (filterSet) pool = pool.filter((e) => filterSet.has(_groupOf(e)) || filterSet.has(e.kind));
            else if (q.length < commandMinChars) pool = pool.filter((e) => e.kind !== 'command');

            const scored = [];
            if (!q) {
                for (const e of pool) scored.push({ ...e, _hits: [], _score: 0 });
                scored.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
            } else {
                for (const e of pool) {
                    let m = _match(String(e.label || e.id || ''), q);
                    if (!m) {
                        const extra = _searched(e);
                        const k = extra ? _match(extra, q) : null;
                        if (k) m = { s: Math.min(k.s, 20), hits: [] };
                    }
                    if (!m) continue;
                    // A command a few points under an object it ties with: typing a
                    // table's name must not lead with "Customise interface".
                    const penalty = e.kind === 'command' && !commandsOnly ? 5 : 0;
                    scored.push({ ...e, _hits: m.hits, _score: m.s + (Number(e.boost) || 0) - penalty });
                }
            }
            // Group, and order the groups by their best hit (ties: first seen).
            const order = [];
            const by = new Map();
            for (const r of scored) {
                const key = commandsOnly ? 'command' : _groupOf(r);
                if (!by.has(key)) { by.set(key, []); order.push(key); }
                by.get(key).push(r);
                if (r.groupLabel && !namedGroups.has(key)) namedGroups.set(key, r.groupLabel);
            }
            // A group is as good as its best row, compared the way rows are
            // (score, then the shorter label): "Customers settings" must not
            // lead the table called "Customers" because both are prefixes.
            const top = (k) => by.get(k).slice().sort(_byScore)[0];
            const keys = order.slice().sort((a, b) => (q ? _byScore(top(a), top(b)) : 0)
                || order.indexOf(a) - order.indexOf(b));
            const capped = !filterSet && !commandsOnly;
            filtered = [];
            sections = [];
            for (const key of keys) {
                const rows = by.get(key);
                if (q) rows.sort(_byScore);
                const shown = capped ? rows.slice(0, groupCap) : rows;
                const start = filtered.length;
                filtered.push(...shown);
                if (shown.length < rows.length) {
                    filtered.push({ more: key, label: `Show all ${rows.length} ${groupLabel(key).toLowerCase()}` });
                }
                sections.push({ title: groupLabel(key), start, count: filtered.length - start });
                if (filtered.length >= MAX_ROWS) break;
            }
            active = 0;
            render();
        };

        const refilter = () => {
            tryConsumePrefix();
            if (grouped) { refilterGrouped(); return; }
            const q = input.value.trim().toLowerCase();
            const filterSet = typeFilter ? new Set(typeFilter) : null;
            const pool = filterSet
                ? entities.filter((e) => filterSet.has(e.kind))
                : entities;
            if (!q) {
                // Scoped + empty query → list every entity of that
                // kind so the user sees what's available. Unscoped +
                // empty query → blank list (matches the old behavior
                // where typing nothing meant nothing).
                filtered = typeFilter
                    ? pool.slice().sort((a, b) =>
                        String(a.label || a.id).localeCompare(b.label || b.id))
                    : [];
            } else {
                filtered = _search(pool, q);
            }
            active = 0;
            render();
        };
        input.addEventListener('input', refilter);
        input.addEventListener('keydown', (e) => {
            const move = (to) => {
                active = to;
                if (grouped) paintActive(); else render();
            };
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                move(Math.min(filtered.length - 1, active + 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                move(Math.max(0, active - 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                commit(active, _modeOf(e));
            } else if (e.key === 'Escape') {
                close();
            } else if (grouped && e.key === 'Tab' && !e.shiftKey) {
                const row = filtered[active];
                if (row?.more) { e.preventDefault(); showAll(row.more); }
                else if (row?.drillLabel && enterScope(row)) e.preventDefault();
            } else if (e.key === 'Backspace' && input.value === '' && (typeFilter || scope)) {
                // Empty input + active chip → consume Backspace to drop
                // the chip. Same idiom as Gmail / Linear / VS Code's
                // command palette: the chip behaves like a token before
                // the caret.
                e.preventDefault();
                if (scope) { leaveScope(); return; }
                typeFilter = null;
                typeFilterLabel = null;
                renderChip();
                refilter();
            }
        });
        input.focus();

        // Commands are searchable instantly; entity rows are lazy-loaded
        // — the palette stays usable for shortcuts/commands while we wait.
        // The set is rebuilt on every open so the palette reflects
        // entities the user just added this session (cheap; the catalog
        // runs every source in parallel). With `cache`, the previous set
        // is drawn first and the rebuild replaces it when it lands.
        const commandRows = () => {
            let extra = [];
            if (typeof commands === 'function') {
                try { extra = (commands() || []).map((c) => ({ kind: 'command', ...c })); }
                catch (err) { console.warn('[cmdpal] commands() threw', err); }
            }
            return [...staticCommands, ...extra];
        };
        // Objects before commands in the grouped layout, so that a tie that
        // survives every rule goes to the object (first seen wins).
        const withCommands = (rows) => (grouped ? [...rows, ...commandRows()] : [...commandRows(), ...rows]);
        entities = _decorateIcons(withCommands(cache && cached ? cached : []), taxonomy);
        if (grouped) {
            refilter();
            if (typeof empty === 'function') {
                try {
                    const got = await empty();
                    if (overlay !== mine) return;
                    emptyRows = _decorateIcons(Array.isArray(got) ? got : [], taxonomy);
                    if (!input.value && !typeFilter && !scope) refilter();
                } catch (err) { console.warn('[cmdpal] empty() failed', err); }
            }
        }
        if (api) {
            try {
                const loaded = await catalog.loadAll(api);
                if (cache) cached = loaded;
                if (overlay !== mine) return;
                entities = _decorateIcons(withCommands(loaded), taxonomy);
                if (grouped ? (!scope && (input.value || typeFilter)) : input.value) refilter();
            } catch (err) {
                console.warn('[cmdpal] entity load failed', err);
            }
        }
    };

    return { open, close, toggle, isOpen, invalidate };
}

function _markup(taxonomy, placeholder, wm, { chrome = {}, grouped = false } = {}) {
    // ONLY THE PANELS THIS SHELL CAN ACTUALLY SHOW.
    //
    // The three toggles were hardcoded, so the palette offered `panel:left` to
    // an embedder that has no factory for it — and `togglePanel` then
    // canonicalized a leaf whose only possible rendering is "no factory
    // registered yet", permanently, because the renderer caches tile DOM per
    // (kind, props). C14 closed that path at boot; this closes the other end of
    // it. A panel with no factory is not a panel this shell can show, and the
    // registry is the thing that knows.
    const PANEL_CHIPS = [
        { side: 'left',   icon: 'menu',            label: 'Left nav' },
        { side: 'right',  icon: 'dock_to_left',    label: 'Right panel' },
        { side: 'bottom', icon: 'dock_to_bottom',  label: 'Bottom panel' },
    ];
    const panelToggles = chrome.panels === false ? '' : PANEL_CHIPS
        .filter((p) => wm.content?.has?.(`panel:${p.side}`) !== false)
        .map((p) => `
                <button class="twm-chip" data-toggle="${p.side}">
                    <span class="material-symbols-outlined">${p.icon}</span>
                    ${p.label}
                </button>`).join('');

    const chips = chrome.pages === false ? '' : taxonomy.topNavEntries().map((k) => `
        <button class="twm-chip" data-shortcut="${k.kind}">
            <span class="material-symbols-outlined">${k.icon}</span>
            ${k.label}
        </button>
    `).join('');
    if (grouped) {
        // C39. A strip with nothing in it is not drawn at all: an empty
        // bordered div is a 1px line between the input and the results.
        return `
        <div class="twm-cmdpal twm-cmdpal--grouped" role="dialog" aria-label="Command palette">
            <div class="twm-cmdpal__inputrow">
                <span class="material-symbols-outlined twm-cmdpal__search-icon">search</span>
                <span class="twm-cmdpal__type-chip-slot" data-role="type-chip"></span>
                <input type="text" class="twm-cmdpal__input"
                       placeholder="${_esc(placeholder)}"
                       autocomplete="off" spellcheck="false" role="combobox"
                       aria-expanded="true" aria-controls="twm-cmdpal-list" />
                <kbd class="twm-cmdpal__esc">Esc</kbd>
            </div>
            ${chips ? `<div class="twm-cmdpal__chips">${chips}</div>` : ''}
            ${panelToggles ? `<div class="twm-cmdpal__toggles">${panelToggles}</div>` : ''}
            <div class="twm-cmdpal__list" id="twm-cmdpal-list" role="listbox" data-role="list"></div>
            <div class="twm-cmdpal__footer" data-role="footer"></div>
        </div>`;
    }
    return `
        <div class="twm-cmdpal" role="dialog" aria-label="Command palette">
            <div class="twm-cmdpal__inputrow">
                <span class="twm-cmdpal__type-chip-slot" data-role="type-chip"></span>
                <input type="text" class="twm-cmdpal__input"
                       placeholder="${_esc(placeholder)}"
                       autocomplete="off" />
            </div>
            <div class="twm-cmdpal__chips">${chips}</div>
            <div class="twm-cmdpal__toggles">${panelToggles}</div>
            <div class="twm-cmdpal__list" data-role="list"></div>
            <div class="twm-cmdpal__footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
            </div>
        </div>
    `;
}

/** Attach an icon per row by consulting the injected taxonomy. Keeps the
 *  palette and breadcrumb visually consistent: one source of truth for
 *  what icon represents a given kind. */
function _decorateIcons(rows, taxonomy) {
    return rows.map((r) => {
        if (r.icon) return r;
        const meta = taxonomy.meta(r.kind);
        return { ...r, icon: meta?.icon || 'arrow_right' };
    });
}

function _search(entities, q) {
    const scored = [];
    for (const e of entities) {
        const id = String(e.id || '').toLowerCase();
        const label = String(e.label || '').toLowerCase();
        const hint = String(e.hint || '').toLowerCase();
        let r;
        if (id === q || label === q) r = 0;
        else if (id.startsWith(q))    r = 1;
        else if (label.startsWith(q)) r = 2;
        else if (id.includes(q))      r = 3;
        else if (label.includes(q))   r = 4;
        else if (hint.includes(q))    r = 5;
        else continue;
        scored.push({ e, r });
    }
    scored.sort((a, b) => a.r - b.r || a.e.label.localeCompare(b.e.label));
    return scored.map((x) => x.e);
}

// ── C39: matching, and what a row draws and searches ─────────────────────

/** What a row draws after its label: `context`, else the old `hint`. */
function _drawn(r) {
    return r.context !== undefined ? r.context : (r.hint || '');
}
/** What a row is searched by besides its label: `keywords`, else `hint`. */
function _searched(r) {
    const k = r.keywords !== undefined ? r.keywords : r.hint;
    return Array.isArray(k) ? k.join(' ') : String(k || '');
}
function _groupOf(r) { return r.group || r.kind; }

/** Strip the palette's private fields before a row leaves it. */
function _public(r) {
    const { _hits, _score, ...rest } = r;
    return rest;
}

function _byScore(a, b) {
    return b._score - a._score
        || String(a.label || '').length - String(b.label || '').length
        || String(a.label || '').localeCompare(String(b.label || ''));
}

function _modeOf(e) {
    if (e?.ctrlKey || e?.metaKey) return 'split';
    if (e?.shiftKey) return 'window';
    return 'open';
}

const _WORD_BREAK = /[\s_\-–—.:/\\()[\]&,+·›]/;

/**
 * Score `text` against `query`, returning `{ s, hits }` — the tier's score
 * and the matched character positions — or null.
 *
 *   100  exact
 *    90  prefix
 *   ~72  every query word starts a word of the text, in order
 *        (`ord li` → *Order lines*, `cust no` → `customer_no`)
 *    60  substring
 *  ≤30   subsequence, worse the more it is spread out
 */
export function matchLabel(text, query) { return _match(text, query); }

function _match(text, query) {
    const t = String(text || '').toLowerCase();
    const q = String(query || '').toLowerCase().trim();
    if (!q || !t) return null;
    const span = (a, n) => Array.from({ length: n }, (_, i) => a + i);
    if (t === q) return { s: 100, hits: span(0, q.length) };
    if (t.startsWith(q)) return { s: 90, hits: span(0, q.length) };

    const words = q.split(/\s+/).filter(Boolean);
    {
        const hits = [];
        let from = 0;
        let ok = true;
        for (const w of words) {
            let at = -1;
            for (let i = from; i <= t.length - w.length; i++) {
                if ((i === 0 || _WORD_BREAK.test(t[i - 1])) && t.startsWith(w, i)) { at = i; break; }
            }
            if (at < 0) { ok = false; break; }
            hits.push(...span(at, w.length));
            from = at + w.length;
        }
        if (ok) return { s: 75 - Math.min(words.length, 5), hits };
    }

    const sub = t.indexOf(q);
    if (sub >= 0) return { s: 60, hits: span(sub, q.length) };

    // TIGHT OR NOT AT ALL. A subsequence is for an abbreviation — "cstmr",
    // "ord ln" — not for any label that happens to hold the letters in order:
    // with a loose bound, "cour" found "Scroll up to: 1,000 rows" and "new"
    // found "Below the pane", and those rows buried the ones meant. So the
    // match starts at a word start, a jump that lands on a word start is free
    // (that is what an abbreviation is), and every other skipped letter counts:
    // together they may be half the query, no more.
    const flat = q.replace(/\s+/g, '');
    const startsWord = (i) => i === 0 || _WORD_BREAK.test(t[i - 1]);
    const hits = [];
    let j = 0;
    for (let i = 0; i < t.length && j < flat.length; i++) {
        if (t[i] === flat[j]) { hits.push(i); j++; }
    }
    if (j < flat.length || !startsWord(hits[0])) return null;
    let spread = 0;
    for (let k = 1; k < hits.length; k++) {
        const gap = hits[k] - hits[k - 1] - 1;
        if (gap > 0 && !startsWord(hits[k])) spread += gap;
    }
    if (spread > Math.floor(flat.length / 2)) return null;
    return { s: Math.max(1, 30 - spread), hits };
}

/** The label with matched characters wrapped in `<mark>`, escaped. */
function _mark(text, hits) {
    const s = String(text ?? '');
    if (!hits?.length) return _esc(s);
    const set = new Set(hits);
    let out = '';
    let open = false;
    for (let i = 0; i < s.length; i++) {
        const on = set.has(i);
        if (on && !open) { out += '<mark>'; open = true; }
        if (!on && open) { out += '</mark>'; open = false; }
        out += _esc(s[i]);
    }
    if (open) out += '</mark>';
    return out;
}

function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/** Display form for a typed prefix: capitalise the first letter, and
 *  swap any underscores/hyphens for spaces so a multi-word alias reads
 *  as prose. Used for the scope chip's label, so it reflects what the
 *  user actually typed rather than the kind it resolved to. */
function _titleCase(s) {
    const str = String(s || '').replace(/[_-]+/g, ' ').trim();
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
