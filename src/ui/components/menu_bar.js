/**
 * menu_bar.js — a desktop menu bar, driven by a declarative model (STORY-0030).
 *
 *   const bar = createMenuBar(el, {
 *       menus: [
 *           { id: 'file', label: 'File', items: [
 *               { id: 'open',   label: 'Open…',      shortcut: 'Ctrl+O' },
 *               { id: 'recent', label: 'Open recent', submenu: () => recentItems() },
 *               { separator: true },
 *               { id: 'save',   label: 'Save',        shortcut: 'Ctrl+S', disabled: true },
 *           ] },
 *           { id: 'view', label: 'View', items: [
 *               { id: 'grid',  label: 'Show grid', checked: true },          // a check item
 *               { id: 'light', label: 'Light', radio: 'theme', checked: true }, // a radio group
 *               { id: 'dark',  label: 'Dark',  radio: 'theme', checked: false },
 *           ] },
 *       ],
 *       onAction: (id, { item, checked }) => { … },
 *   });
 *
 * ── The model ─────────────────────────────────────────────────────────
 * A menu is `{ id, label, items }`. An item is `{ id, label, shortcut?,
 * disabled?, checked?, radio?, submenu? }`, or `{ separator: true }`.
 *   checked   a boolean makes it a CHECK item (`menuitemcheckbox`); with
 *             `radio: '<group>'` it is a RADIO item (`menuitemradio`), and
 *             checking one unchecks the rest of its group.
 *   submenu   an array of items, or a FUNCTION returning one. A function is
 *             called every time the submenu opens, so a list that changes
 *             under the bar (recent files, open windows) is always current.
 *   shortcut  drawn on the right. It is a label: the bar binds no key for it.
 *
 * `onAction(id, { item, checked })` is called for an enabled leaf item —
 * never for a disabled one, a separator, or an item that opens a submenu. A
 * check or radio item has already flipped when it is called; `checked` is
 * the new state.
 *
 * ── The keyboard ──────────────────────────────────────────────────────
 * Alt (pressed and released on its own) or F10 focuses the bar, and pressing
 * either again leaves it. On a title: Left/Right move across the titles,
 * Down/Enter/Space open its menu on the first item, Up on the last. In a
 * menu: Up/Down/Home/End move within it, skipping separators and disabled
 * items; Right opens a submenu, or moves to the next menu; Left closes a
 * submenu, or moves to the previous menu; Enter/Space activate. Esc closes
 * one level at a time, and the Esc that leaves the bar gives focus back to
 * whatever had it before the bar did. Activating an item gives it back too,
 * BEFORE `onAction` runs, so a command acts on the context the user was in.
 *
 * ── The pointer ───────────────────────────────────────────────────────
 * Clicking a title opens its menu (and closes it again); while a menu is
 * open, moving over another title switches to it. Moving over an item with a
 * submenu opens it. A press outside the bar closes everything.
 *
 * ── State lives here, not in the DOM ──────────────────────────────────
 * `setEnabled(id, bool)` and `setChecked(id, bool)` record an override for
 * that id, which wins over what the model says from then on — including over
 * a function submenu's fresh items — and patch any open menu IN PLACE: the
 * bar is not rebuilt, and focus stays where it was. A radio group keeps ONE
 * recorded selection, so it shows exactly one checked item however its menu
 * is reached — opened later, a function submenu included. To find an id the
 * bar calls function submenus (as `commands()` does), open or not.
 * `commands()` returns the same model as command-palette rows (`{ id, label,
 * shortcut, context, action }`), so the palette and the bar list identical
 * verbs.
 *
 * ── Roles ─────────────────────────────────────────────────────────────
 * The WAI-ARIA menubar pattern: `role="menubar"` on the element you pass,
 * a `role="menuitem"` title per menu inside a `role="none"` wrapper, each
 * open menu a `role="menu"` beside its title (or its parent item), items
 * `menuitem` / `menuitemcheckbox` / `menuitemradio` with `aria-checked`,
 * `aria-disabled` and, on a submenu's item, `aria-haspopup`/`aria-expanded`.
 * One title is in the tab order at a time (a roving tabindex).
 *
 * Every listener outside the bar is on the element's own document, and
 * `dispose()` takes them off.
 */

const SEL_TITLE = '.twm-menubar__title';
const SEL_ITEM = '.twm-menubar__item';
const SEL_MENU = '.twm-menubar__menu';

/** @returns {MenuBar} */
export function createMenuBar(el, opts) {
    return new MenuBar(el, opts);
}

export class MenuBar {
    /**
     * @param {Element} el                the element that becomes the bar
     * @param {object}  opts
     * @param {Array}   opts.menus        `[{ id, label, items }]`
     * @param {Function} [opts.onAction]  `(id, { item, checked }) => void`
     * @param {string}  [opts.label]      the bar's accessible name ('Menu')
     * @param {string}  [opts.emptyLabel] the disabled row an empty submenu shows ('Empty')
     */
    constructor(el, { menus, onAction = null, label = 'Menu', emptyLabel = 'Empty' } = {}) {
        if (!el || typeof el.appendChild !== 'function') {
            throw new TypeError('createMenuBar: `el` must be an element');
        }
        _validateMenus(menus);
        this.el = el;
        this.menus = menus;
        this._onAction = typeof onAction === 'function' ? onAction : null;
        this._emptyLabel = emptyLabel;
        this._doc = el.ownerDocument;
        this._disabled = new Map();     // id -> boolean (override)
        this._checked = new Map();      // id -> boolean (override, check items)
        this._radio = new Map();        // radio group -> the checked id (or null: none)
        this._models = new WeakMap();   // item element -> model item
        this._stack = [];               // open menus: [{ menu, parent }]
        this._openIdx = -1;             // which title's menu is open
        this._active = false;           // focus is in the bar, or a menu is open
        this._returnTo = null;          // what had focus before the bar did
        this._altArmed = false;

        el.innerHTML = '';
        el.classList.add('twm-menubar');
        el.setAttribute('role', 'menubar');
        el.setAttribute('aria-label', label);
        this._titles = menus.map((m, i) => {
            const entry = this._doc.createElement('div');
            entry.className = 'twm-menubar__entry';
            entry.setAttribute('role', 'none');
            const btn = this._doc.createElement('button');
            btn.type = 'button';
            btn.className = 'twm-menubar__title';
            btn.setAttribute('role', 'menuitem');
            btn.setAttribute('aria-haspopup', 'menu');
            btn.setAttribute('aria-expanded', 'false');
            btn.tabIndex = i === 0 ? 0 : -1;
            btn.textContent = m.label;
            entry.appendChild(btn);
            el.appendChild(entry);
            return btn;
        });

        this._h = {
            mousedown: (e) => this._onMouseDown(e),
            click: (e) => this._onClick(e),
            mouseover: (e) => this._onMouseOver(e),
            keydown: (e) => this._onKey(e),
            keyup: (e) => { if (e.key === ' ' && this.el.contains(e.target)) e.preventDefault(); },
            focusin: (e) => this._onFocusIn(e),
            focusout: (e) => this._onFocusOut(e),
            docKeydown: (e) => this._onDocKeyDown(e),
            docKeyup: (e) => this._onDocKeyUp(e),
            docMousedown: (e) => this._onDocMouseDown(e),
            // Alt+Tab, Alt+F4, Alt+Space: the second key goes to the OS, so no
            // keydown reaches the page to disarm Alt. The window losing focus
            // does, or the Alt keyup on return would take focus to the bar.
            winBlur: () => { this._altArmed = false; },
        };
        for (const k of ['mousedown', 'click', 'mouseover', 'keydown', 'keyup', 'focusin', 'focusout']) {
            el.addEventListener(k, this._h[k]);
        }
        this._doc.addEventListener('keydown', this._h.docKeydown, true);
        this._doc.addEventListener('keyup', this._h.docKeyup, true);
        this._doc.addEventListener('mousedown', this._h.docMousedown, true);
        this._doc.defaultView?.addEventListener('blur', this._h.winBlur);
    }

    // ── public ────────────────────────────────────────────────────────

    /** Whether a menu is open. */
    isOpen() { return this._openIdx >= 0; }

    /** Open the menu with this id (focus on its title, or on its first item). */
    open(menuId, { focusItem = false } = {}) {
        const i = this.menus.findIndex((m) => m.id === menuId);
        if (i < 0) return;
        this._enter();
        this._open(i, focusItem ? 'first' : null);
    }

    /** Close every open menu. Focus stays in the bar if it was there. */
    close() { this._closeAll(); }

    /** Focus the bar's first title, as Alt or F10 does. */
    focus() {
        this._enter();
        this._focusTitle(0);
    }

    isEnabled(id) {
        const item = this._findModel(id);
        return item ? !this._isDisabled(item) : !this._disabled.get(id);
    }

    isChecked(id) {
        const item = this._findModel(id);
        return item ? this._isChecked(item) : !!this._checked.get(id);
    }

    /** Enable or disable every item with this id; an open menu is patched in place. */
    setEnabled(id, enabled) {
        this._disabled.set(id, !enabled);
        this._patch(id);
    }

    /** Check or uncheck every item with this id; checking a radio item
     *  unchecks the rest of its group. An open menu is patched in place. */
    setChecked(id, checked) {
        this._check(this._findModel(id), id, checked);
    }

    /**
     * The model as command-palette rows: one per enabled leaf item, labelled
     * as in the menu, with its `shortcut`, and its menu path as `context`
     * ('File › Open recent'). A function submenu is called now, so the rows
     * are as current as the menu would be. `action` runs the item exactly as
     * a click would, including flipping a check or radio item.
     */
    commands() {
        const rows = [];
        const walk = (items, path) => {
            for (const it of _resolve(items)) {
                if (!it || it.separator || this._isDisabled(it)) continue;
                if (it.submenu != null) { walk(it.submenu, [...path, it.label]); continue; }
                rows.push({
                    id: `menubar:${it.id}`,
                    label: it.label,
                    ...(it.shortcut ? { shortcut: it.shortcut } : {}),
                    context: path.join(' › '),
                    verb: 'run',
                    action: () => this._fire(it),
                });
            }
        };
        for (const m of this.menus) walk(m.items, [m.label]);
        return rows;
    }

    dispose() {
        this._closeAll();
        for (const k of ['mousedown', 'click', 'mouseover', 'keydown', 'keyup', 'focusin', 'focusout']) {
            this.el.removeEventListener(k, this._h[k]);
        }
        this._doc.removeEventListener('keydown', this._h.docKeydown, true);
        this._doc.removeEventListener('keyup', this._h.docKeyup, true);
        this._doc.removeEventListener('mousedown', this._h.docMousedown, true);
        this._doc.defaultView?.removeEventListener('blur', this._h.winBlur);
        this.el.innerHTML = '';
        this.el.classList.remove('twm-menubar');
        this.el.removeAttribute('role');
        this.el.removeAttribute('aria-label');
    }

    // ── state ─────────────────────────────────────────────────────────

    _isDisabled(item) {
        return this._disabled.has(item.id) ? this._disabled.get(item.id) : !!item.disabled;
    }

    _isChecked(item) {
        if (item.radio != null && this._radio.has(item.radio)) return this._radio.get(item.radio) === item.id;
        return this._checked.has(item.id) ? this._checked.get(item.id) : !!item.checked;
    }

    /** Record a check. `item` is the model item when the bar knows it (a
     *  radio item then records its group's selection); `id` alone is kept as
     *  an override for an item the model does not hold yet. */
    _check(item, id, checked) {
        if (item?.radio != null) {
            const group = item.radio;
            if (checked) this._radio.set(group, id);
            else if (this._isChecked(item)) this._radio.set(group, null);
            this._patchGroup(group);
            return;
        }
        this._checked.set(id, !!checked);
        this._patch(id);
    }

    /** Every model item the bar knows of: the model, with every function
     *  submenu called now (as `commands()` does), and whatever is on screen. */
    _knownItems() {
        const out = [];
        const walk = (items) => {
            for (const it of _resolve(items)) {
                if (!it || it.separator) continue;
                out.push(it);
                if (it.submenu != null) walk(it.submenu);
            }
        };
        for (const m of this.menus) walk(m.items);
        for (const b of this.el.querySelectorAll(SEL_ITEM)) {
            const it = this._models.get(b);
            if (it && !out.includes(it)) out.push(it);
        }
        return out;
    }

    _findModel(id) { return this._knownItems().find((it) => it.id === id) || null; }

    /** Re-apply the state of every rendered item with this id. */
    _patch(id) {
        for (const b of this.el.querySelectorAll(SEL_ITEM)) {
            const it = this._models.get(b);
            if (it && it.id === id) this._apply(b, it);
        }
    }

    /** Re-apply the state of every rendered item of this radio group. */
    _patchGroup(group) {
        for (const b of this.el.querySelectorAll(SEL_ITEM)) {
            const it = this._models.get(b);
            if (it && it.radio === group) this._apply(b, it);
        }
    }

    _apply(btn, item) {
        const off = this._isDisabled(item);
        btn.classList.toggle('twm-menubar__item--disabled', off);
        if (off) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
        if (_kind(item) !== 'menuitem') {
            btn.setAttribute('aria-checked', this._isChecked(item) ? 'true' : 'false');
        }
    }

    // ── open / close ──────────────────────────────────────────────────

    _setRoving(i) {
        this._titles.forEach((t, j) => { t.tabIndex = j === i ? 0 : -1; });
    }

    _focusTitle(i) {
        this._setRoving(i);
        this._titles[i]?.focus({ preventScroll: true });
    }

    /** The bar becomes active; remember what to give focus back to. */
    _enter(from = this._doc.activeElement) {
        if (this._active) return;
        this._active = true;
        this._returnTo = from && from !== this._doc.body && !this.el.contains(from) ? from : null;
    }

    /** Leave the bar and give focus back. */
    _exit() {
        const back = this._returnTo;
        this._closeAll();
        this._active = false;
        this._returnTo = null;
        if (back?.isConnected) back.focus({ preventScroll: true });
        else if (this.el.contains(this._doc.activeElement)) this._doc.activeElement.blur();
    }

    /** Focus went elsewhere on purpose: close, give nothing back. */
    _deactivate() {
        this._closeAll();
        this._active = false;
        this._returnTo = null;
    }

    _open(i, focus) {
        const n = this._titles.length;
        i = ((i % n) + n) % n;
        // Focus moves to the title BEFORE the old menu goes, so the element
        // being removed never holds focus.
        this._focusTitle(i);
        this._closeAll();
        const m = this.menus[i];
        const title = this._titles[i];
        const menu = this._buildMenu(m.items, m.label);
        title.parentElement.appendChild(menu);
        title.setAttribute('aria-expanded', 'true');
        this._stack = [{ menu, parent: title }];
        this._openIdx = i;
        _place(menu, title, 'below');
        this._focusIn(menu, focus);
    }

    _openSub(btn, focus) {
        const item = this._models.get(btn);
        if (!item || item.submenu == null || this._isDisabled(item)) return;
        const level = this._levelOf(btn);
        if (level < 0) return;
        const open = this._stack[level + 1];
        if (open && open.parent === btn) { this._focusIn(open.menu, focus); return; }
        this._closeFrom(level + 1);
        const menu = this._buildMenu(item.submenu, item.label);   // a function is called here, every time
        btn.parentElement.appendChild(menu);
        btn.setAttribute('aria-expanded', 'true');
        this._stack.push({ menu, parent: btn });
        _place(menu, btn, 'right');
        this._focusIn(menu, focus);
    }

    _focusIn(menu, focus) {
        if (!focus) return;
        const items = this._enabledIn(menu);
        (focus === 'last' ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
    }

    /** Close the menus at `level` and deeper. Focus inside them goes to the
     *  item (or title) they hang from. */
    _closeFrom(level) {
        if (level >= this._stack.length) return;
        const first = this._stack[level];
        if (this._stack.slice(level).some((s) => s.menu.contains(this._doc.activeElement))) {
            first.parent.focus({ preventScroll: true });
        }
        for (const s of this._stack.splice(level)) {
            s.menu.remove();
            s.parent.setAttribute('aria-expanded', 'false');
        }
        if (level === 0) this._openIdx = -1;
    }

    _closeAll() { this._closeFrom(0); }

    _levelOf(el) {
        const menu = el.closest(SEL_MENU);
        return this._stack.findIndex((s) => s.menu === menu);
    }

    /** The items the keyboard can land on: no separators, nothing disabled. */
    _enabledIn(menu) {
        return this._itemsIn(menu).filter((b) => !this._isDisabled(this._models.get(b)));
    }

    /** Every item cell of `menu` in DOM order, disabled ones included. */
    _itemsIn(menu) {
        return [...menu.children]
            .map((w) => w.firstElementChild)
            .filter((b) => b?.matches?.(SEL_ITEM));
    }

    /** The next (`dir` 1) or previous (-1) enabled item from `btn`'s place
     *  among all the cells, wrapping. `btn` itself may be disabled: one
     *  setEnabled(id, false) leaves focus on it. */
    _stepFrom(menu, btn, dir) {
        const all = this._itemsIn(menu);
        const n = all.length;
        const at = all.indexOf(btn);
        for (let k = 1; k <= n; k++) {
            const b = all[(((at + dir * k) % n) + n) % n];
            if (!this._isDisabled(this._models.get(b))) return b;
        }
        return null;
    }

    _buildMenu(items, label) {
        const d = this._doc;
        const menu = d.createElement('div');
        menu.className = 'twm-menubar__menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', label);
        const list = _resolve(items).filter((it) => {
            if (it && (it.separator || (it.id != null && it.label != null))) return true;
            console.warn('[menubar] an item needs an id and a label', it);
            return false;
        });
        const shown = list.length ? list : [{ id: null, label: this._emptyLabel, disabled: true, _empty: true }];
        for (const it of shown) {
            if (it.separator) {
                const sep = d.createElement('div');
                sep.className = 'twm-menubar__separator';
                sep.setAttribute('role', 'separator');
                menu.appendChild(sep);
                continue;
            }
            const wrap = d.createElement('div');
            wrap.className = 'twm-menubar__cell';
            wrap.setAttribute('role', 'none');
            const btn = d.createElement('button');
            btn.type = 'button';
            btn.tabIndex = -1;
            const kind = _kind(it);
            btn.className = 'twm-menubar__item';
            if (kind !== 'menuitem') btn.classList.add(kind === 'menuitemradio' ? 'twm-menubar__item--radio' : 'twm-menubar__item--check');
            btn.setAttribute('role', kind);
            if (it.id != null) btn.dataset.itemId = it.id;
            const check = d.createElement('span');
            check.className = 'twm-menubar__check';
            check.setAttribute('aria-hidden', 'true');
            const text = d.createElement('span');
            text.className = 'twm-menubar__label';
            text.textContent = it.label;
            btn.append(check, text);
            if (it.shortcut) {
                const sc = d.createElement('span');
                sc.className = 'twm-menubar__shortcut';
                sc.textContent = it.shortcut;
                btn.appendChild(sc);
            }
            if (it.submenu != null) {
                btn.setAttribute('aria-haspopup', 'menu');
                btn.setAttribute('aria-expanded', 'false');
                btn.classList.add('twm-menubar__item--submenu');
                const arrow = d.createElement('span');
                arrow.className = 'twm-menubar__arrow';
                arrow.setAttribute('aria-hidden', 'true');
                btn.appendChild(arrow);
            }
            this._models.set(btn, it);
            this._apply(btn, it);
            wrap.appendChild(btn);
            menu.appendChild(wrap);
        }
        return menu;
    }

    // ── activation ────────────────────────────────────────────────────

    _activate(btn) {
        const item = this._models.get(btn);
        if (!item || this._isDisabled(item)) return;
        if (item.submenu != null) { this._openSub(btn, 'first'); return; }
        this._exit();
        this._fire(item);
    }

    /** Flip a check/radio item and tell the embedder. The ONE door to
     *  `onAction`, for clicks, keys and palette rows alike. */
    _fire(item) {
        if (!item || item.separator || item._empty || this._isDisabled(item) || item.submenu != null) return;
        let checked;
        // The item itself, not its id: it carries its own radio group even
        // when it came from a function submenu that is not on screen.
        if (_kind(item) === 'menuitemradio') { this._check(item, item.id, true); checked = true; }
        else if (_kind(item) === 'menuitemcheckbox') { checked = !this._isChecked(item); this._check(item, item.id, checked); }
        this._onAction?.(item.id, { item, checked });
    }

    // ── events ────────────────────────────────────────────────────────

    _onMouseDown(e) {
        // Before the button could take focus: remember what had it. No press
        // in the bar moves focus by itself — not on a title or an item, nor
        // on a separator, a menu's padding or the bar's empty space — the bar
        // moves it (a title on click, an item on hover), so focus never drops
        // to nothing on the way, which would end the bar's activation (see
        // _onFocusOut).
        if (e.target.closest?.(SEL_TITLE)) this._enter();
        e.preventDefault();
    }

    _onClick(e) {
        const title = e.target.closest?.(SEL_TITLE);
        if (title) {
            const i = this._titles.indexOf(title);
            this._enter();
            if (this._openIdx === i) this._closeAll();
            else this._open(i, null);
            return;
        }
        const btn = e.target.closest?.(SEL_ITEM);
        if (btn) { e.stopPropagation(); this._activate(btn); }
    }

    _onMouseOver(e) {
        const title = e.target.closest?.(SEL_TITLE);
        if (title) {
            const i = this._titles.indexOf(title);
            if (this._openIdx >= 0 && this._openIdx !== i) this._open(i, null);
            return;
        }
        const btn = e.target.closest?.(SEL_ITEM);
        if (!btn) return;
        const item = this._models.get(btn);
        if (!item || this._isDisabled(item)) return;
        btn.focus({ preventScroll: true });
        const level = this._levelOf(btn);
        if (item.submenu != null) this._openSub(btn, null);
        else if (level >= 0) this._closeFrom(level + 1);
    }

    /** Tabbed into: what had focus is the event's `relatedTarget`. */
    _onFocusIn(e) {
        if (!this._active) this._enter(e.relatedTarget);
    }

    /** Focus left the bar: to an element outside it, or to nothing (a press
     *  on a non-focusable area, the window losing focus). Either way the
     *  activation ends, so the next Alt/F10 remembers what has focus THEN. */
    _onFocusOut(e) {
        const to = e.relatedTarget;
        if (!to || !this.el.contains(to)) this._deactivate();
    }

    _onKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;   // app chords pass through
        const title = e.target.closest?.(SEL_TITLE);
        const btn = title ? null : e.target.closest?.(SEL_ITEM);
        if (!title && !btn) return;
        if (e.key === 'Tab') { this._deactivate(); return; }   // focus moves on, as Tab says
        const handled = title ? this._titleKey(e.key, this._titles.indexOf(title))
                              : this._itemKey(e.key, btn);
        if (handled) e.preventDefault();
        // Keys meant for the bar do not reach the page's own bindings
        // (Backspace is a "go back" in the window manager). F-keys do.
        if (handled || !/^F\d+$/.test(e.key)) e.stopPropagation();
    }

    _titleKey(key, i) {
        const n = this._titles.length;
        const open = this._openIdx >= 0;
        switch (key) {
            case 'ArrowRight': open ? this._open(i + 1, null) : this._focusTitle((i + 1) % n); return true;
            case 'ArrowLeft':  open ? this._open(i - 1, null) : this._focusTitle((i - 1 + n) % n); return true;
            case 'Home': open ? this._open(0, null) : this._focusTitle(0); return true;
            case 'End':  open ? this._open(n - 1, null) : this._focusTitle(n - 1); return true;
            case 'ArrowDown': case 'Enter': case ' ':
                if (open && this._openIdx === i) this._focusIn(this._stack[0].menu, 'first');
                else this._open(i, 'first');
                return true;
            case 'ArrowUp':
                if (open && this._openIdx === i) this._focusIn(this._stack[0].menu, 'last');
                else this._open(i, 'last');
                return true;
            case 'Escape':
                if (open) this._closeAll();
                else this._exit();
                return true;
            default: return false;
        }
    }

    _itemKey(key, btn) {
        const level = this._levelOf(btn);
        if (level < 0) return false;
        const menu = this._stack[level].menu;
        const item = this._models.get(btn);
        const go = (b) => b?.focus({ preventScroll: true });
        // A submenu can be open while focus is still on the item it hangs
        // from (opened by the pointer, or with no row the keyboard can land
        // on). Left and Esc close that submenu first, keeping focus here.
        if ((key === 'ArrowLeft' || key === 'Escape') && this._stack[level + 1]?.parent === btn) {
            this._closeFrom(level + 1);
            return true;
        }
        switch (key) {
            case 'ArrowDown': go(this._stepFrom(menu, btn, 1)); return true;
            case 'ArrowUp':   go(this._stepFrom(menu, btn, -1)); return true;
            case 'Home': this._focusIn(menu, 'first'); return true;
            case 'End':  this._focusIn(menu, 'last'); return true;
            case 'ArrowRight':
                if (item?.submenu != null && !this._isDisabled(item)) this._openSub(btn, 'first');
                else this._open(this._openIdx + 1, 'first');
                return true;
            case 'ArrowLeft':
                if (level > 0) this._closeFrom(level);
                else this._open(this._openIdx - 1, 'first');
                return true;
            case 'Enter': case ' ':
                this._activate(btn);
                return true;
            case 'Escape':
                if (level > 0) this._closeFrom(level);
                else this._closeAll();
                return true;
            default: return false;
        }
    }

    /** Alt on its own, and F10: armed on keydown, acted on here or on keyup. */
    _onDocKeyDown(e) {
        if (e.key === 'Alt') {
            this._altArmed = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat;
            return;
        }
        this._altArmed = false;
        if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();   // F10 is the bar's while one is mounted
            this._toggle();
        }
    }

    _onDocKeyUp(e) {
        if (e.key !== 'Alt') return;
        const armed = this._altArmed;
        this._altArmed = false;
        if (!armed) return;
        e.preventDefault();
        this._toggle();
    }

    _onDocMouseDown(e) {
        this._altArmed = false;
        if (this._openIdx >= 0 && !this.el.contains(e.target)) this._deactivate();
    }

    _toggle() {
        if (this._active && (this._openIdx >= 0 || this.el.contains(this._doc.activeElement))) this._exit();
        else this.focus();
    }
}

// ── helpers ──────────────────────────────────────────────────────────

function _resolve(items) {
    const v = typeof items === 'function' ? items() : items;
    return Array.isArray(v) ? v : [];
}

function _kind(item) {
    if (item.radio != null) return 'menuitemradio';
    if (typeof item.checked === 'boolean') return 'menuitemcheckbox';
    return 'menuitem';
}

/** A bad model is a boot error, not a menu that silently lacks a row. */
function _validateMenus(menus) {
    if (!Array.isArray(menus) || !menus.length) {
        throw new TypeError('createMenuBar: `menus` must be a non-empty array');
    }
    const walk = (items, where) => {
        if (typeof items === 'function') return;
        if (!Array.isArray(items)) throw new TypeError(`createMenuBar: ${where} needs \`items\` (an array or a function)`);
        for (const it of items) {
            if (it?.separator) continue;
            if (it?.id == null || it?.label == null) {
                throw new TypeError(`createMenuBar: an item in ${where} needs an id and a label`);
            }
            if (it.submenu != null) walk(it.submenu, `"${it.label}"`);
        }
    };
    for (const m of menus) {
        if (m?.id == null || m?.label == null) throw new TypeError('createMenuBar: a menu needs an id and a label');
        walk(m.items, `menu "${m.label}"`);
    }
}

/** Fixed, so a bar inside an `overflow: hidden` chrome strip is not clipped;
 *  kept on screen. `below` drops from a title, `right` flies out of an item. */
function _place(menu, anchor, side) {
    const view = menu.ownerDocument.defaultView;
    const a = anchor.getBoundingClientRect();
    const r = menu.getBoundingClientRect();
    const vw = view?.innerWidth || 0;
    const vh = view?.innerHeight || 0;
    let left = side === 'below' ? a.left : a.right;
    let top = side === 'below' ? a.bottom : a.top;
    if (vw && left + r.width > vw) left = side === 'below' ? vw - r.width - 4 : a.left - r.width;
    if (vh && top + r.height > vh) top = Math.max(0, vh - r.height - 4);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top = `${Math.max(0, top)}px`;
}
