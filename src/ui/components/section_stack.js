/**
 * ══ A STACK OF COLLAPSIBLE SECTIONS ══════════════════════════════════════
 *
 * Inspector-style panel content: titled sections, one above the other, each
 * opened and closed from its header (FlexDesk STORY-0036). Until this, only a
 * tree's categories could collapse, and every embedder that wanted a panel of
 * "Notes / Assistant / Parameters" built the headers, the arrows and the
 * remembering itself.
 *
 *     const stack = createSectionStack(panel, {
 *         sections: [
 *             { id: 'notes', title: 'Notes', content: notesEl },
 *             { id: 'chat',  title: 'Assistant', fill: true,
 *               actions: [{ id: 'clear', icon: 'delete', label: 'Clear', onClick: clear }] },
 *             { id: 'params', title: 'Parameters', defaultExpanded: false },
 *         ],
 *         key: 'inspector.sections',
 *         stateStore: { read: (key) => saved[key], write: (key, map) => { saved[key] = map; } },
 *     });
 *     stack.body('chat').appendChild(chatEl);
 *     const off = stack.on('toggled', ({ id, expanded }) => …);
 *
 * A SECTION is `{ id, title, icon?, content?, actions?, defaultExpanded?, fill? }`.
 * `content` is a Node put into the section's body at mount; `body(id)` hands
 * the same element over for anything mounted later. `defaultExpanded` is true
 * unless it says otherwise.
 *
 * THE HEADER TOGGLES; ITS ACTIONS DO NOT. A click anywhere on the header opens
 * or closes the section and turns its arrow — except on one of its `actions`
 * (`{ id?, icon, label, title?, onClick(sectionId, event) }`), which runs its
 * own `onClick` and leaves the section as it was.
 *
 * A FILL SECTION (`fill: true`) takes the height the others leave, and its
 * body scrolls inside it (`min-height: 0`), so a long conversation scrolls in
 * its section instead of growing the panel past the window. Give the stack's
 * container a height — it is `height: 100%` of it.
 *
 * REMEMBERING is the embedder's: `stateStore` is `{ read(key), write(key, map) }`
 * and `map` is `{ [sectionId]: expanded }`, written whenever a section opens or
 * closes. `read` may answer a promise; until it does, sections show their
 * `defaultExpanded`, and a section somebody toggled meanwhile keeps their
 * choice. A store that throws, rejects, or answers something that is not a map
 * leaves every section on its `defaultExpanded` — remembering is a convenience,
 * never a reason for a panel not to draw. `ready` resolves once the read has
 * been applied (at once without a store).
 *
 * `setVisible(id, false)` takes a section off the stack without forgetting it:
 * `setVisible(id, true)` brings it back open or closed exactly as it was.
 *
 * The `toggled` event carries `{ id, expanded, source }`, `source` being
 * `'user'` (a header click), `'api'` (expand / collapse / toggle) or
 * `'restore'` (a stored state that arrived after mount). It fires only on a
 * change. `on()` answers the function that stops listening.
 *
 * `dispose()` removes the one listener the stack adds and every node it made;
 * `content` the embedder handed in goes with its section.
 *
 * Styled by `.twm-collapsible-*` (the tree's primitive) plus `.twm-section-stack*`.
 */

/**
 * @param {HTMLElement} container
 * @param {object}  opts
 * @param {Array}   opts.sections      `{ id, title, icon?, content?, actions?, defaultExpanded?, fill? }`
 * @param {object} [opts.stateStore]   `{ read(key): map|Promise<map>, write(key, map) }`
 * @param {string} [opts.key]          the key the expanded states live under; required with a store
 */
export function createSectionStack(container, { sections = [], stateStore = null, key = null } = {}) {
    if (stateStore && !key) throw new Error('createSectionStack: a stateStore needs a { key }');
    const doc = container.ownerDocument;

    const root = doc.createElement('div');
    root.className = 'twm-section-stack';

    /** id -> { def, box, header, toggle, arrow, body, expanded, visible, touched } */
    const byId = new Map();
    /** action button -> { sectionId, action } */
    const actionOf = new Map();
    /** header -> section id */
    const headerOf = new Map();
    const listeners = new Set();
    let disposed = false;

    for (const def of sections) {
        if (!def || def.id == null || byId.has(def.id)) {
            throw new Error(`createSectionStack: every section needs a unique id (got ${def?.id})`);
        }
        const expanded = def.defaultExpanded !== false;

        const box = doc.createElement('section');
        box.className = 'twm-collapsible-box twm-section-stack__section'
            + (def.fill ? ' twm-section-stack__section--fill' : '');

        const header = doc.createElement('div');
        header.className = 'twm-collapsible-header twm-section-stack__header';

        const toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'twm-section-stack__toggle';
        const arrow = doc.createElement('span');
        arrow.className = 'twm-collapsible-arrow material-symbols-outlined';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = 'expand_more';
        toggle.appendChild(arrow);
        if (def.icon) {
            const icon = doc.createElement('span');
            icon.className = 'twm-section-stack__icon material-symbols-outlined';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = def.icon;
            toggle.appendChild(icon);
        }
        const title = doc.createElement('span');
        title.className = 'twm-section-stack__title';
        title.textContent = def.title ?? String(def.id);
        toggle.appendChild(title);
        header.appendChild(toggle);

        if (Array.isArray(def.actions) && def.actions.length) {
            const bar = doc.createElement('div');
            bar.className = 'twm-section-stack__actions';
            for (const action of def.actions) {
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = 'twm-section-stack__action';
                if (action.label) btn.setAttribute('aria-label', action.label);
                if (action.title ?? action.label) btn.setAttribute('title', action.title ?? action.label);
                const glyph = doc.createElement('span');
                glyph.className = 'material-symbols-outlined';
                glyph.setAttribute('aria-hidden', 'true');
                glyph.textContent = action.icon ?? '';
                btn.appendChild(glyph);
                bar.appendChild(btn);
                actionOf.set(btn, { sectionId: def.id, action });
            }
            header.appendChild(bar);
        }

        const body = doc.createElement('div');
        body.className = 'twm-collapsible-content twm-section-stack__body';
        if (def.content) body.appendChild(def.content);

        box.append(header, body);
        root.appendChild(box);
        headerOf.set(header, def.id);
        const entry = { def, box, toggle, arrow, body, expanded, visible: true, touched: false };
        byId.set(def.id, entry);
        paint(entry);
    }

    function paint(entry) {
        entry.box.classList.toggle('twm-section-stack__section--expanded', entry.expanded);
        entry.body.classList.toggle('visible', entry.expanded);
        entry.arrow.classList.toggle('collapsed', !entry.expanded);
        entry.toggle.setAttribute('aria-expanded', String(entry.expanded));
        entry.box.hidden = !entry.visible;
    }

    function emit(detail) {
        for (const fn of [...listeners]) {
            try { fn(detail); } catch (err) { console.error('[section-stack] toggled listener failed', err); }
        }
    }

    function persist() {
        if (!stateStore?.write) return;
        const map = {};
        for (const [id, entry] of byId) map[id] = entry.expanded;
        try {
            const pending = stateStore.write(key, map);
            pending?.catch?.(() => { /* storage refused: not ours to fix */ });
        } catch { /* storage refused: not ours to fix */ }
    }

    /** Set one section's state; true when it changed. */
    function set(id, expanded, source) {
        const entry = byId.get(id);
        if (disposed || !entry || entry.expanded === expanded) return false;
        entry.expanded = expanded;
        if (source !== 'restore') entry.touched = true;
        paint(entry);
        if (source !== 'restore') persist();
        emit({ id, expanded, source });
        return true;
    }

    function restore(saved, source) {
        if (disposed || !saved || typeof saved !== 'object' || Array.isArray(saved)) return;
        for (const [id, entry] of byId) {
            if (entry.touched || typeof saved[id] !== 'boolean') continue;
            if (source === 'restore') set(id, saved[id], 'restore');
            else { entry.expanded = saved[id]; paint(entry); }
        }
    }

    function onClick(event) {
        const target = event.target;
        const btn = target?.closest?.('.twm-section-stack__action');
        if (btn && actionOf.has(btn)) {
            const { sectionId, action } = actionOf.get(btn);
            event.stopPropagation();
            try { action.onClick?.(sectionId, event); } catch (err) {
                console.error(`[section-stack] action on "${sectionId}" failed`, err);
            }
            return;
        }
        const header = target?.closest?.('.twm-section-stack__header');
        if (!header || !headerOf.has(header)) return;
        const id = headerOf.get(header);
        set(id, !byId.get(id).expanded, 'user');
    }
    root.addEventListener('click', onClick);

    // Synchronous stored state is applied before the stack is on screen, so it
    // never flashes the defaults; a promise is applied when it answers.
    let ready = Promise.resolve();
    if (stateStore?.read) {
        let saved = null;
        try { saved = stateStore.read(key); } catch { saved = null; }
        if (saved && typeof saved.then === 'function') {
            ready = Promise.resolve(saved)
                .then((value) => restore(value, 'restore'), () => { /* defaults stand */ });
        } else {
            restore(saved, 'mount');
        }
    }

    container.appendChild(root);

    const need = (id) => {
        if (!byId.has(id)) throw new Error(`createSectionStack: no section "${id}"`);
        return byId.get(id);
    };

    return {
        root,
        ready,
        /** The section's body element, for content mounted after the stack. */
        body: (id) => need(id).body,
        expand(id) { need(id); set(id, true, 'api'); },
        collapse(id) { need(id); set(id, false, 'api'); },
        toggle(id) { set(id, !need(id).expanded, 'api'); },
        isExpanded: (id) => need(id).expanded,
        /** Off the stack, or back on it — its expanded state is kept either way. */
        setVisible(id, visible) {
            const entry = need(id);
            entry.visible = !!visible;
            paint(entry);
        },
        isVisible: (id) => need(id).visible,
        /** `on('toggled', fn)` — answers the function that stops listening. */
        on(event, fn) {
            if (event !== 'toggled') throw new Error(`createSectionStack: no "${event}" event`);
            if (disposed) return () => {};
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            root.removeEventListener('click', onClick);
            listeners.clear();
            actionOf.clear();
            headerOf.clear();
            root.remove();
        },
    };
}
