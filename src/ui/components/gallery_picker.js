/**
 * gallery_picker.js — single-select card grid for the starter catalog.
 *
 * G1.3 in docs/STARTER_GALLERY_REQUIREMENTS.md. Used by every
 * "New X" modal to let the user pick a starter shape (formerly
 * called a "template"). The picker is mounted into a host element
 * and fires `onChange(entry)` whenever the selection changes.
 *
 * Each entry is the raw gallery dict from `pywebview.api.gallery_list`:
 *
 *     { id, kind, label, description, fields }
 *
 * The picker shows label + description as a card. `fields` is
 * passed through to the caller untouched on select — the New-X
 * handler decides what to do with it.
 *
 * Usage:
 *
 *     const picker = await mountGalleryPicker(hostEl, {
 *         kind: 'agent',
 *         selectedId: 'blank',
 *         onChange: (entry) => { … },
 *     });
 *
 *     // later …
 *     picker.getSelected();   // → { id, kind, label, description, fields }
 *     picker.dispose();
 */

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}


/**
 * Mount a starter-gallery picker into `hostEl`.
 *
 * @param {HTMLElement} hostEl
 * @param {object}      opts
 * @param {string}      opts.kind          — gallery entries to load (e.g. 'agent').
 *                                            When undefined, every kind shows up.
 * @param {string}      [opts.selectedId]  — id to pre-select. If absent, the
 *                                            first entry wins.
 * @param {function}    [opts.onChange]    — `(entry) => void` fired on selection
 *                                            change AND on initial mount.
 * @param {object[]}    [opts.entries]     — explicit entries (skips bridge fetch).
 *                                            Useful for tests + offline previews.
 * @param {string}      [opts.emptyLabel]  — copy shown when the catalog is empty
 *                                            for that kind.
 * @returns {Promise<{getSelected, setSelectedById, dispose}>}
 */
export async function mountGalleryPicker(hostEl, opts = {}) {
    const {
        kind         = null,
        selectedId   = null,
        onChange     = () => {},
        entries      = null,
        emptyLabel   = 'No starters available for this kind.',
    } = opts;
    if (!hostEl) throw new Error('mountGalleryPicker: hostEl is required');

    let catalog = entries;
    if (!catalog) {
        const api = window.pywebview?.api;
        try {
            catalog = (await api?.gallery_list?.(kind)) || [];
        } catch (err) {
            console.warn('[gallery-picker] gallery_list failed', err);
            catalog = [];
        }
    }
    catalog = Array.isArray(catalog) ? catalog : [];

    hostEl.classList.add('twm-gallery-picker');
    if (catalog.length === 0) {
        hostEl.innerHTML = `<div class="twm-gallery-picker__empty">${esc(emptyLabel)}</div>`;
        return {
            getSelected: () => null,
            setSelectedById: () => false,
            dispose: () => { hostEl.classList.remove('twm-gallery-picker'); },
        };
    }

    let selected = catalog.find((e) => e?.id === selectedId)
                || catalog[0];

    const render = () => {
        hostEl.innerHTML = catalog.map((e, i) => {
            const isSel = e === selected;
            const desc = e?.description
                ? `<p class="twm-gallery-card__desc">${esc(e.description)}</p>`
                : '';
            return `
                <button type="button"
                        class="twm-gallery-card ${isSel ? 'is-selected' : ''}"
                        data-idx="${i}"
                        title="${esc(e?.id || '')}">
                    <span class="twm-gallery-card__label">${esc(e?.label || e?.id || '')}</span>
                    ${desc}
                </button>
            `;
        }).join('');
    };
    render();

    const onClick = (ev) => {
        const card = ev.target.closest?.('.twm-gallery-card');
        if (!card || !hostEl.contains(card)) return;
        const idx = Number(card.dataset.idx);
        const next = catalog[idx];
        if (!next || next === selected) return;
        selected = next;
        render();
        try { onChange(selected); } catch (err) {
            console.warn('[gallery-picker] onChange threw', err);
        }
    };
    hostEl.addEventListener('click', onClick);

    // Fire the initial selection so the caller can prime any
    // downstream UI (preview pane, defaults, etc.) without a
    // special case for first-render.
    try { onChange(selected); } catch (err) {
        console.warn('[gallery-picker] initial onChange threw', err);
    }

    return {
        getSelected: () => (selected ? { ...selected } : null),
        setSelectedById: (id) => {
            const next = catalog.find((e) => e?.id === id);
            if (!next || next === selected) return false;
            selected = next;
            render();
            try { onChange(selected); } catch (err) {
                console.warn('[gallery-picker] onChange threw', err);
            }
            return true;
        },
        dispose: () => {
            hostEl.removeEventListener('click', onClick);
            hostEl.innerHTML = '';
            hostEl.classList.remove('twm-gallery-picker');
        },
    };
}
