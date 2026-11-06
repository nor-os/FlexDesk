/**
 * workspace_picker.js — the field in a top bar that names what the window is
 * working in, and the switcher that changes it.
 *
 *     field                     switcher, opened in the field's place
 *   +-----------------------+   +------------------------------------+
 *   | (i)    North  Ctrl+P  |   | (o) nor|                           |
 *   +-----------------------+   | heading                      2 of 9|
 *                               | North                    (check)(x)|
 *                               | Northwest                          |
 *                               | Load 20 more · 2 of 9 shown        |
 *                               | + New "nor"…                       |
 *                               | card: the current one's links      |
 *                               | status                footer verbs |
 *                               +------------------------------------+
 *
 * Three exports, each usable alone:
 *
 *   mountPickerField       the field: a name, an icon, a key hint; centred in
 *                          its host at the width the host can spare, or inline
 *   createPickerSwitcher   the switcher, on any anchor or on none
 *   createWorkspacePicker  both, wired together, with an optional chord
 *
 * It knows nothing of what is being picked. Items are the caller's, `describe`
 * turns one into what a row draws, and every string is the caller's or a
 * neutral default the caller can replace through `labels`.
 *
 * ══ ITEMS ARE ASKED FOR ON EVERY OPEN ══════════════════════════════════════
 *
 * `load({ query, offset, limit, signal })` answers an array, or
 * `{ items, total?, status? }`, now or in a promise. With `search: 'local'` it
 * is asked once per open and typing filters what it answered, names ahead of
 * other matches. With `search: 'remote'` typing is debounced and asked again,
 * and a `total` above what is drawn offers Load more. Either way only the
 * newest question's answer paints: every read carries a sequence number and an
 * AbortSignal, and an answer to an older question is dropped however it
 * arrives. The last unsearched answer, per `cacheKey()`, is drawn at once on
 * the next open while it is asked for again.
 *
 * ══ THE KEYBOARD ═══════════════════════════════════════════════════════════
 *
 * Focus is real: what the keyboard is on is `document.activeElement`, so a screen
 * reader says each stop, a button in the card or the footer included, and Tab and
 * the arrows agree about where the reader is.
 *
 * Opening puts the caret in the input. The arrows walk focus over every stop,
 * wrapping: the input, the rows a person can choose (a disabled one is stepped
 * over), Load more, the action rows, the card's buttons, the footer's; after
 * `open({ select })` they start from the row it chose. Tab is shorter: the rows are
 * ONE tab stop (the row last focused, else the current one, else the first), and so
 * are the action rows. An answer or a redraw leaves focus where it is, on a row that
 * moved too; Load more stays focusable while it loads.
 *
 * Typing always types: a character pressed anywhere in the panel goes to the input.
 * In the input, the first row or action row of what is shown wears the highlight,
 * and Enter takes it, or, while the answer to what was typed is on its way, takes
 * the first one when it lands. Enter or Space on a row takes that row. Shift+Delete
 * removes the highlighted row, and focus goes on to the next. Backspace away from
 * the input stops at the panel. Esc closes and gives focus back to where it was, as
 * does a pick or a verb, before it runs, so a dialog it opens opens over nothing. A
 * press outside closes and leaves focus where it was pressed. Tab out of the panel
 * closes it.
 *
 * ══ NOTHING IS REBUILT UNDER A POINTER ═════════════════════════════════════
 *
 * A click fires only when the press and the release land on one node. So every
 * part is reconciled by key: an answer, a card or a `setCurrent` updates nodes
 * in place, and a node is created or removed only for a key that came or went.
 * Which node holds what lives in maps here, never in DOM attributes.
 *
 * Nor is a list moved under one. The list scrolls to the highlight only when the
 * keyboard moved it, `open({ select })` asked for a row, or the row the arrows chose
 * went away (focus then goes to the input); typing and a new query's answer go back
 * to the top.
 * A redraw, Load more by the mouse and a removal leave the scroll where it is.
 *
 * ══ AN ASYNC REMOVE MAY ASK ════════════════════════════════════════════════
 *
 * While the promise `onRemove` returned is unsettled the panel and its backdrop
 * step below managed windows and do not close on a press outside, so a
 * confirmation dialog can be answered and the switcher is still there afterwards.
 */

import { ActionDropdown } from './action_dropdown.js';
import { createRafResizeObserver } from '../utils/raf_resize_observer.js';

const DEFAULT_LABELS = Object.freeze({
    loading: 'Loading…',
    empty: () => 'Nothing to show.',
    noMatch: (query) => `Nothing matches “${query}”.`,
    failed: (err) => `The list could not be read. ${err?.message || ''}`.trim(),
    failedMore: (err) => `The next page could not be read. ${err?.message || ''}`.trim(),
    failedRemove: (err) => `Could not remove it. ${err?.message || ''}`.trim(),
    loadMore: ({ next, shown, total }) => `Load ${next} more · ${shown} of ${total} shown`,
    remove: (name) => `Remove ${name}`,
});

const PANEL_EDGE = 8;
/** How far the panel's input row stands above the field it covers. */
const OVER_LIFT = 3;

let nextUid = 0;

function part(tag, className, text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function glyph(name, className = '') {
    const node = part('span', `material-symbols-outlined ${className}`.trim(), name);
    node.setAttribute('aria-hidden', 'true');
    return node;
}

/** Write text only when it changed: a write that changes nothing is still a
 *  mutation, and a screen reader hears it. */
function setText(node, text) {
    const value = String(text ?? '');
    if (node.textContent !== value) node.textContent = value;
}

function show(node, shown) {
    node.hidden = !shown;
}

function button(className) {
    const node = part('button', className);
    node.type = 'button';
    return node;
}

/**
 * Keep `container`'s children one per key: `build()` makes `{ node, ... }` for
 * a new key, `update(entry, item)` brings any entry up to date, a key that went
 * loses its node, and a node already in its place is not moved (moving one
 * under a pressed pointer is half of rebuilding it). The node holding focus is
 * never moved, wherever it belongs now: the others go round it, because moving it
 * would drop the keyboard on the body.
 * @returns {(items: object[], keyOf: (item: object) => unknown) => Map<string, object>}
 */
function keyedChildren(container, build, update) {
    let drawn = new Map();
    return (items, keyOf) => {
        const next = new Map();
        const nodes = items.map((item) => {
            const key = String(keyOf(item));
            const entry = drawn.get(key) ?? build();
            update(entry, item);
            next.set(key, entry);
            return entry.node;
        });
        for (const [key, entry] of drawn) {
            if (!next.has(key)) entry.node.remove();
        }
        drawn = next;
        const focused = document.activeElement;
        nodes.forEach((node, index) => {
            if (node.contains(focused)) {
                while (container.children[index] !== node) container.append(container.children[index]);
            } else if (container.children[index] !== node) {
                container.insertBefore(node, container.children[index] || null);
            }
        });
        return drawn;
    };
}

function parseChord(chord) {
    const parts = String(chord).split('+').map((p) => p.trim().toLowerCase());
    const key = parts.pop();
    const known = new Set(['ctrl', 'cmd', 'meta', 'shift', 'alt']);
    if (!key || parts.some((p) => !known.has(p))) {
        throw new TypeError(`createWorkspacePicker: cannot read the chord "${chord}"`);
    }
    return {
        key,
        ctrl: parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
    };
}

function chordMatches(parsed, event) {
    return (event.ctrlKey || event.metaKey) === parsed.ctrl
        && event.shiftKey === parsed.shift
        && event.altKey === parsed.alt
        && String(event.key).toLowerCase() === parsed.key;
}

/**
 * Mount the field into `hostEl`.
 *
 * `layout: 'centered'` places it in the middle of `hostEl` (which must be
 * positioned) at the width the host can spare between the elements `avoid`
 * selects: at most `maxWidth`, without the key hint below `tightWidth`, and
 * hidden below `minWidth`. `layout: 'inline'` leaves its width to the host and
 * only drops the key hint.
 *
 * @param {HTMLElement} hostEl
 * @param {object} [options]
 * @param {string} [options.name] - The name it shows
 * @param {string} [options.icon] - A Material Symbols name
 * @param {string} [options.keyHint] - Drawn as a key; none by default
 * @param {boolean} [options.muted] - Draw the name as naming nothing
 * @param {boolean} [options.caret] - A trailing caret, for an inline field
 * @param {string} [options.tooltip]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.className] - Extra classes
 * @param {'centered'|'inline'} [options.layout]
 * @param {string} [options.avoid] - Selector, within `hostEl`, of what it must not cover
 * @param {number} [options.maxWidth]
 * @param {number} [options.minWidth]
 * @param {number} [options.tightWidth]
 * @param {number} [options.gap] - Room kept free in all, shared between the two sides
 * @param {() => void} [options.onActivate] - A click
 * @returns {{ el: HTMLButtonElement, update: (patch: object) => void, setOpen: (open: boolean) => void, fit: () => void, destroy: () => void }}
 */
export function mountPickerField(hostEl, {
    name = '',
    icon = '',
    keyHint = '',
    muted = false,
    caret = false,
    tooltip = '',
    ariaLabel = '',
    className = '',
    layout = 'inline',
    avoid = '',
    maxWidth = 440,
    minWidth = 120,
    tightWidth = 230,
    gap = 24,
    onActivate = null,
} = {}) {
    const centered = layout === 'centered';
    const el = button(['twm-wspicker-field', centered ? 'twm-wspicker-field--centered' : '', className]
        .filter(Boolean).join(' '));
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-expanded', 'false');
    const iconEl = glyph('', 'twm-wspicker-field__icon');
    const nameEl = part('span', 'twm-wspicker-field__name');
    const keyEl = part('kbd', 'twm-wspicker-field__key');
    el.append(iconEl, nameEl, keyEl);
    if (caret) el.append(glyph('expand_more', 'twm-wspicker-field__caret'));

    const update = (patch) => {
        if ('name' in patch) setText(nameEl, patch.name);
        if ('icon' in patch) {
            setText(iconEl, patch.icon);
            show(iconEl, !!patch.icon);
        }
        if ('keyHint' in patch) {
            setText(keyEl, patch.keyHint);
            show(keyEl, !!patch.keyHint);
        }
        if ('muted' in patch) el.classList.toggle('twm-wspicker-field--muted', !!patch.muted);
        if ('tooltip' in patch) {
            el.classList.toggle('twm-has-tooltip', !!patch.tooltip);
            if (patch.tooltip) {
                el.setAttribute('data-tooltip', patch.tooltip);
                el.setAttribute('data-tooltip-placement', 'bottom');
            } else {
                el.removeAttribute('data-tooltip');
                el.removeAttribute('data-tooltip-placement');
            }
        }
        if ('ariaLabel' in patch) {
            if (patch.ariaLabel) el.setAttribute('aria-label', patch.ariaLabel);
            else el.removeAttribute('aria-label');
        }
    };
    update({ name, icon, keyHint, muted, tooltip, ariaLabel });

    const fit = () => {
        if (!centered) {
            el.classList.toggle('twm-wspicker-field--tight', el.getBoundingClientRect().width < tightWidth);
            return;
        }
        const box = hostEl.getBoundingClientRect();
        const middle = box.left + box.width / 2;
        let leftEdge = box.left;
        let rightEdge = box.right;
        for (const other of avoid ? hostEl.querySelectorAll(avoid) : []) {
            if (el.contains(other)) continue;
            const r = other.getBoundingClientRect();
            if (r.width <= 0) continue;
            if (r.left + r.width / 2 < middle) leftEdge = Math.max(leftEdge, r.right);
            else rightEdge = Math.min(rightEdge, r.left);
        }
        const width = Math.min(maxWidth, 2 * Math.min(middle - leftEdge, rightEdge - middle) - gap);
        el.classList.toggle('twm-wspicker-field--hidden', width < minWidth);
        el.classList.toggle('twm-wspicker-field--tight', width < tightWidth);
        el.style.width = `${Math.max(minWidth, width)}px`;
    };

    let destroyed = false;
    const onClick = () => onActivate?.();
    el.addEventListener('click', onClick);
    hostEl.appendChild(el);
    const observer = createRafResizeObserver(() => {
        if (!destroyed) fit();
    });
    observer.observe(centered ? hostEl : el);
    fit();
    document.fonts?.ready?.then(() => {
        if (!destroyed) fit();
    });

    return {
        el,
        update,
        fit,
        setOpen(open) {
            el.classList.toggle('twm-wspicker-field--open', open);
            el.setAttribute('aria-expanded', String(open));
        },
        destroy() {
            destroyed = true;
            observer.disconnect();
            el.removeEventListener('click', onClick);
            el.remove();
        },
    };
}

/**
 * The switcher. See the file's header for how it asks and how it behaves.
 *
 * @param {object} options
 * @param {HTMLElement} [options.anchor] - What it opens from. With none, or one
 *   that takes no room, it opens centred over a dimmed page.
 * @param {'over'|'below'} [options.placement] - `over` lays the input over the
 *   anchor; `below` hangs from it, flipped above when there is no room.
 * @param {number} [options.minWidth] - The anchored panel's least width
 * @param {number} [options.visibleRows] - Scroll past this many two-line rows
 * @param {string} [options.className] - Extra classes on the panel
 * @param {string} [options.label] - The panel's accessible name
 * @param {string} [options.listLabel] - The list's accessible name
 * @param {string} [options.placeholder] - The input's placeholder
 * @param {string} [options.glyph] - The icon before the input
 * @param {(request: {query: string, offset: number, limit: number, signal: AbortSignal}) => (object[]|{items: object[], total?: number, status?: string|{text: string, error?: boolean}}|Promise)} options.load
 * @param {'local'|'remote'} [options.search]
 * @param {number} [options.pageSize] - `limit`, in remote search
 * @param {number} [options.debounceMs] - How long typing waits, in remote search
 * @param {() => string} [options.cacheKey] - Whose list the kept answer is
 * @param {(item: object, ctx: {current: boolean}) => {id: string|number, name: string, detail?: string, icon?: string, badge?: string, title?: string, keywords?: string|string[], disabled?: boolean, removable?: boolean}} options.describe
 * @param {(item: object) => void} [options.onPick] - A row other than the current one chosen
 * @param {(item: object) => (boolean|void|Promise<boolean|void>)} [options.onRemove] -
 *   Offers a bin on each row whose `removable` is not false. Answering `false`
 *   keeps the row; rejecting keeps it and shows the error.
 * @param {(ctx: {query: string}) => Array<{id: string, label: string, detail?: string, icon?: string, always?: boolean, run: (ctx: {query: string}) => void}>} [options.actions] -
 *   Rows after the items, narrowed by typing unless `always`.
 * @param {(ctx: {query: string, shown: number, total: number|null}) => ({title?: string, count?: string}|null)} [options.heading]
 * @param {(ctx: {current: object|null, row: object|null}) => ({heading?: string, icon?: string, name: string, detail?: string, open?: {label: string, icon?: string, run: Function}, columns?: number, tiles?: Array<{id: string, label: string, icon?: string, run: Function}>}|null)} [options.card]
 * @param {() => ({start?: object[], end?: object[], keys?: Array<{keys: string[], label: string}>}|null)} [options.footer] -
 *   Buttons are `{ id, label, icon?, trailing?, primary?, run }`. `keys` are drawn
 *   only when the panel is centred.
 * @param {object} [options.labels] - Replaces any of the default strings
 * @param {(open: boolean) => void} [options.onOpenChange]
 */
export function createPickerSwitcher({
    anchor = null,
    placement = 'over',
    minWidth = 520,
    visibleRows = 0,
    className = '',
    label = '',
    listLabel = '',
    placeholder = '',
    glyph: inputGlyph = 'search',
    load,
    search = 'local',
    pageSize = 20,
    debounceMs = 200,
    cacheKey = () => '',
    describe,
    onPick = null,
    onRemove = null,
    actions = null,
    heading = null,
    card = null,
    footer = null,
    labels: labelOverrides = {},
    onOpenChange = null,
}) {
    const labels = { ...DEFAULT_LABELS, ...labelOverrides };
    const remote = search === 'remote';
    const uid = `twm-wspicker-${++nextUid}`;

    let isOpen = false;
    let destroyed = false;
    let current = null;
    /** What the last answer held, in its order. */
    let items = [];
    let total = null;
    let status = null;
    /** The query the drawn items answer, and the newest one asked. */
    let answered = '';
    let asked = '';
    let seq = 0;
    let abort = null;
    let loading = false;
    let loadingMore = false;
    let failure = null;
    let timer = null;
    /** Enter came before the answer to what was typed. */
    let pickFirst = false;
    /** Which row to highlight when the next answer lands. */
    let selectId = null;
    /** An `onRemove` promise is unsettled. */
    let busy = false;
    /** Where focus was when it opened. */
    let opener = null;
    /** Every place the arrows stop, in order. */
    let stops = [];
    let activeKey = null;
    let activeNode = null;
    /** The arrows chose the highlight; an answer does not move it. */
    let moved = false;
    /** The row last focused, per list of rows. */
    const rovingKeys = {};
    let nextEntryId = 0;
    const kept = new Map();

    const idOf = (item) => String(describe(item, { current: false }).id);
    const isCurrent = (item) => current != null && idOf(item) === idOf(current);
    const modelOf = (item) => describe(item, { current: isCurrent(item) });
    const typed = () => input.value.trim();

    // ── the panel, built once ───────────────────────────────────────────
    const backdrop = part('div', 'twm-wspicker-backdrop');
    const panel = part('div', `twm-wspicker ${className}`.trim());
    panel.setAttribute('role', 'dialog');
    if (label) panel.setAttribute('aria-label', label);

    const searchRow = part('div', 'twm-wspicker__search');
    const input = part('input', 'twm-wspicker__input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = placeholder;
    if (placeholder) input.setAttribute('aria-label', placeholder);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', `${uid}-list`);
    searchRow.append(glyph(inputGlyph, 'twm-wspicker__glyph'), input);

    const head = part('div', 'twm-wspicker__head');
    const headTitle = part('span', 'twm-wspicker__title');
    const headCount = part('span', 'twm-wspicker__count');
    head.append(headTitle, headCount);

    const scroller = part('div', 'twm-wspicker__scroll');
    if (visibleRows > 0) {
        scroller.classList.add('twm-wspicker__scroll--capped');
        scroller.style.setProperty('--twm-wspicker-rows', String(visibleRows));
    }
    const list = part('div', 'twm-wspicker__list');
    list.id = `${uid}-list`;
    list.setAttribute('role', 'listbox');
    if (listLabel) list.setAttribute('aria-label', listLabel);
    const note = part('p', 'twm-wspicker__note');
    note.setAttribute('role', 'status');
    const more = button('twm-btn twm-wspicker__more');
    const moreLabel = part('span', 'twm-wspicker__more-label');
    more.append(glyph('expand_more'), moreLabel);
    const actionList = part('div', 'twm-wspicker__actions');
    actionList.setAttribute('role', 'listbox');
    scroller.append(list, note, more, actionList);

    const cardEl = part('section', 'twm-wspicker__card');
    const cardHeading = part('h3', 'twm-wspicker__card-heading');
    const cardHead = part('div', 'twm-wspicker__card-head');
    const cardIcon = glyph('', 'twm-wspicker__card-icon');
    const cardText = part('span', 'twm-wspicker__card-text');
    const cardName = part('span', 'twm-wspicker__card-name');
    const cardDetail = part('span', 'twm-wspicker__card-detail');
    cardText.append(cardName, cardDetail);
    const cardOpen = button('twm-btn twm-wspicker__card-open');
    const cardOpenIcon = glyph('');
    const cardOpenLabel = part('span', '');
    cardOpen.append(cardOpenIcon, cardOpenLabel);
    cardHead.append(cardIcon, cardText, cardOpen);
    const tiles = part('div', 'twm-wspicker__tiles');
    cardEl.append(cardHeading, cardHead, tiles);

    const foot = part('div', 'twm-wspicker__foot');
    const footStatus = part('span', 'twm-wspicker__status');
    const footStart = part('div', 'twm-wspicker__foot-group');
    const footEnd = part('div', 'twm-wspicker__foot-group');
    const footKeys = part('span', 'twm-wspicker__keys');
    foot.append(footStart, footStatus, footEnd, footKeys);

    panel.append(searchRow, head, scroller, cardEl, foot);

    // ── rows, the items' and the action rows' ───────────────────────────
    function buildRow() {
        const node = part('div', 'twm-wspicker__row');
        node.id = `${uid}-row-${++nextEntryId}`;
        node.setAttribute('role', 'option');
        node.tabIndex = -1;
        const icon = glyph('', 'twm-wspicker__row-icon');
        const text = part('span', 'twm-wspicker__row-text');
        const name = part('span', 'twm-wspicker__row-name');
        const detail = part('span', 'twm-wspicker__row-detail');
        text.append(name, detail);
        const badge = part('span', 'twm-wspicker__row-badge');
        const check = glyph('check', 'twm-wspicker__row-check');
        const bin = button('twm-wspicker__row-remove');
        bin.tabIndex = -1;
        bin.append(glyph('delete'));
        node.append(icon, text, badge, check, bin);
        const entry = { node, icon, name, detail, badge, check, bin, run: null, remove: null };
        node.addEventListener('click', () => entry.run?.());
        bin.addEventListener('click', (event) => {
            event.stopPropagation();
            entry.remove?.();
        });
        return entry;
    }

    function paintRow(entry, { name, detail, icon, badge, title, disabled = false, isCurrentRow = false }) {
        setText(entry.icon, icon);
        setText(entry.name, name);
        setText(entry.detail, detail);
        show(entry.detail, !!detail);
        setText(entry.badge, badge);
        show(entry.badge, !!badge);
        show(entry.check, isCurrentRow);
        entry.node.classList.toggle('twm-wspicker__row--current', isCurrentRow);
        entry.node.classList.toggle('twm-wspicker__row--disabled', disabled);
        entry.node.setAttribute('aria-selected', String(isCurrentRow));
        if (disabled) entry.node.setAttribute('aria-disabled', 'true');
        else entry.node.removeAttribute('aria-disabled');
        entry.node.title = title ?? (detail ? `${name} — ${detail}` : name);
    }

    const syncRows = keyedChildren(list, buildRow, (entry, item) => {
        const model = modelOf(item);
        const disabled = !!model.disabled;
        paintRow(entry, { ...model, disabled, isCurrentRow: isCurrent(item) });
        entry.run = disabled ? null : () => pick(item);
        if (disabled) entry.node.tabIndex = -1;
        const removable = !!onRemove && model.removable !== false;
        entry.remove = removable ? () => removeItem(item) : null;
        show(entry.bin, removable);
        if (removable) {
            const words = labels.remove(model.name);
            entry.bin.setAttribute('aria-label', words);
            entry.bin.title = words;
        }
    });

    const syncActions = keyedChildren(actionList, buildRow, (entry, action) => {
        paintRow(entry, { name: action.label, detail: action.detail, icon: action.icon, title: action.title });
        entry.run = () => runVerb(action.run);
        show(entry.bin, false);
    });

    /** What typing leaves of the answer: names ahead of other matches. */
    function shownItems() {
        const query = typed().toLowerCase();
        if (remote || !query) return items;
        const names = [];
        const others = [];
        for (const item of items) {
            const { name, detail, keywords } = modelOf(item);
            if (String(name).toLowerCase().includes(query)) names.push(item);
            else if ([detail, keywords].flat().some((text) => String(text ?? '').toLowerCase().includes(query))) others.push(item);
        }
        return [...names, ...others];
    }

    function shownActions() {
        if (!actions) return [];
        const query = typed();
        const lower = query.toLowerCase();
        return actions({ query }).filter((action) => action.always || !lower
            || String(action.label).toLowerCase().includes(lower));
    }

    // ── the card and the footer ─────────────────────────────────────────
    function buildVerb(hook) {
        return () => {
            const node = button(`twm-btn ${hook}`);
            const icon = glyph('');
            const text = part('span', '');
            const trailing = glyph('');
            node.append(icon, text, trailing);
            const entry = { node, icon, text, trailing, run: null };
            node.addEventListener('click', () => entry.run?.());
            return entry;
        };
    }

    function paintVerb(entry, verb) {
        setText(entry.icon, verb.icon);
        setText(entry.text, verb.label);
        setText(entry.trailing, verb.trailing);
        entry.node.classList.toggle('twm-btn--primary', !!verb.primary);
        entry.node.title = verb.label;
        entry.run = () => runVerb(verb.run);
    }

    const syncTiles = keyedChildren(tiles, buildVerb('twm-wspicker__tile'), paintVerb);
    const syncFootStart = keyedChildren(footStart, buildVerb('twm-wspicker__foot-btn'), paintVerb);
    const syncFootEnd = keyedChildren(footEnd, buildVerb('twm-wspicker__foot-btn'), paintVerb);
    let drawnTiles = new Map();
    let drawnFoot = new Map();
    let cardOpenRun = null;

    cardOpen.addEventListener('click', () => cardOpenRun?.());

    function renderCard() {
        const row = current == null ? null : items.find((item) => isCurrent(item)) ?? null;
        const model = card ? card({ current, row }) : null;
        show(cardEl, !!model);
        drawnTiles = syncTiles(model?.tiles || [], (tile) => tile.id);
        cardOpenRun = model?.open ? () => runVerb(model.open.run) : null;
        show(cardOpen, !!model?.open);
        if (!model) return;
        setText(cardHeading, model.heading);
        show(cardHeading, !!model.heading);
        setText(cardIcon, model.icon);
        setText(cardName, model.name);
        setText(cardDetail, model.detail);
        cardName.title = model.name;
        setText(cardOpenIcon, model.open?.icon);
        setText(cardOpenLabel, model.open?.label);
        tiles.style.setProperty('--twm-wspicker-columns', String(model.columns || 2));
    }

    function renderFooter() {
        const model = footer ? footer() : null;
        const start = syncFootStart(model?.start || [], (verb) => verb.id);
        const end = syncFootEnd(model?.end || [], (verb) => verb.id);
        drawnFoot = new Map([...[...start].map(([key, entry]) => [`start:${key}`, entry]),
                             ...[...end].map(([key, entry]) => [`end:${key}`, entry])]);
        footKeys.replaceChildren(...(model?.keys || []).map(({ keys, label: words }) => {
            const hint = part('span', 'twm-wspicker__key-hint');
            hint.append(...keys.map((key) => part('kbd', '', key)), ` ${words}`);
            return hint;
        }));
        const { text = '', error = false } = typeof status === 'string' ? { text: status } : status ?? {};
        setText(footStatus, text);
        show(footStatus, !!text);
        footStatus.classList.toggle('twm-wspicker__status--error', !!error);
        const keysShown = footKeys.childElementCount > 0 && panel.classList.contains('twm-wspicker--centered');
        show(foot, !!text || keysShown || drawnFoot.size > 0);
    }

    // ── the highlight ───────────────────────────────────────────────────
    function collectStops(rowEntries, actionEntries, shown) {
        const next = [];
        for (const item of shown) {
            const entry = rowEntries.get(idOf(item));
            if (entry?.run) next.push({ key: `row:${idOf(item)}`, node: entry.node, run: entry.run, remove: entry.remove, primary: true });
        }
        if (!more.hidden) next.push({ key: 'more', node: more, run: () => loadMore({ byKey: true }) });
        for (const [key, entry] of actionEntries) next.push({ key: `action:${key}`, node: entry.node, run: entry.run, primary: true });
        if (!cardEl.hidden) {
            if (!cardOpen.hidden) next.push({ key: 'card-open', node: cardOpen, run: () => cardOpenRun?.() });
            for (const [key, entry] of drawnTiles) next.push({ key: `tile:${key}`, node: entry.node, run: entry.run });
        }
        for (const [key, entry] of drawnFoot) next.push({ key: `foot:${key}`, node: entry.node, run: entry.run });
        stops = next;
        syncTabStops();
    }

    /** One tab stop per list of rows: the row last focused, else the current one, else the first. */
    function syncTabStops() {
        const currentKey = current == null ? null : `row:${idOf(current)}`;
        for (const prefix of ['row:', 'action:']) {
            const rows = stops.filter((s) => s.key.startsWith(prefix));
            const chosen = rows.find((s) => s.key === rovingKeys[prefix])
                ?? rows.find((s) => s.key === currentKey) ?? rows[0];
            for (const stop of rows) stop.node.tabIndex = stop === chosen ? 0 : -1;
        }
    }

    function paintActive() {
        const stop = stops.find((s) => s.key === activeKey) ?? null;
        if (activeNode && activeNode !== stop?.node) activeNode.classList.remove('twm-wspicker__stop--active');
        activeNode = stop?.node ?? null;
        activeNode?.classList.add('twm-wspicker__stop--active');
        if (activeNode?.id) input.setAttribute('aria-activedescendant', activeNode.id);
        else input.removeAttribute('aria-activedescendant');
    }

    function revealActive() {
        activeNode?.scrollIntoView?.({ block: 'nearest' });
    }

    function settleActive() {
        let reveal = false;
        if (selectId != null && stops.some((s) => s.key === `row:${selectId}`)) {
            activeKey = `row:${selectId}`;
            moved = true;
            selectId = null;
            reveal = true;
        }
        if (!moved || !stops.some((s) => s.key === activeKey)) {
            reveal = moved;
            // The stop that held focus went, with its node or by being hidden: the
            // keyboard must not be left on the body, where none of this panel's keys
            // are heard, or on what no longer is a stop.
            const at = document.activeElement;
            if (moved && isOpen && (at === document.body || (panel.contains(at) && at !== input))) input.focus();
            moved = false;
            activeKey = stops.find((s) => s.primary)?.key ?? null;
        }
        paintActive();
        if (reveal) revealActive();
    }

    /** Focus on `stop`, without the browser's own scroll: `revealActive` is the one that may. */
    function focusStop(stop) {
        activeKey = stop.key;
        moved = true;
        stop.node.focus({ preventScroll: true });
        paintActive();
    }

    function move(step) {
        const walk = [input, ...stops.map((s) => s.node)];
        // `open({ select })` chose a row and left the caret in the input: the arrows
        // go on from that row.
        const from = document.activeElement === input && moved ? activeNode : document.activeElement;
        const next = walk[(walk.indexOf(from) + step + walk.length) % walk.length];
        if (next === input) {
            input.focus();
            return;
        }
        focusStop(stops.find((s) => s.node === next));
        revealActive();
    }

    // ── drawing ─────────────────────────────────────────────────────────
    function render() {
        const shown = shownItems();
        const query = remote ? answered : typed();
        const rowEntries = syncRows(shown, idOf);
        const actionEntries = syncActions(shownActions(), (action) => action.id);

        const words = heading ? heading({ query, shown: shown.length, total }) : null;
        show(head, !!(words?.title || words?.count));
        setText(headTitle, words?.title);
        setText(headCount, words?.count);

        let said = '';
        if (failure) said = failure;
        else if (!shown.length && (loading || total == null)) said = labels.loading;
        else if (!shown.length) said = query ? labels.noMatch(query) : labels.empty();
        setText(note, said);
        show(note, !!said);
        note.classList.toggle('twm-wspicker__note--error', !!failure);

        const remaining = remote && total != null ? Math.max(0, total - items.length) : 0;
        show(more, remaining > 0 && !failure);
        if (remaining > 0) {
            setText(moreLabel, labels.loadMore({ next: Math.min(pageSize, remaining), shown: items.length, total }));
        }
        // Not `disabled`: that would drop focus on the body. `loadMore` refuses for itself.
        more.setAttribute('aria-disabled', String(loading || loadingMore));

        collectStops(rowEntries, actionEntries, shown);
        settleActive();
    }

    function renderEverything() {
        renderCard();
        renderFooter();
        render();
    }

    // ── asking ──────────────────────────────────────────────────────────
    function normalize(answer) {
        if (Array.isArray(answer)) return { items: answer, total: answer.length, status: null };
        const list_ = answer?.items || [];
        return {
            items: list_,
            total: Number.isFinite(answer?.total) ? answer.total : list_.length,
            status: answer?.status ?? null,
        };
    }

    function unique(all) {
        const seen = new Set();
        return all.filter((item) => {
            const id = idOf(item);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    async function ask(query) {
        const mine = ++seq;
        asked = query;
        abort?.abort();
        abort = new AbortController();
        const { signal } = abort;
        loading = true;
        failure = null;
        loadingMore = false;
        render();
        try {
            const answer = normalize(await load({ query, offset: 0, limit: pageSize, signal }));
            if (destroyed || mine !== seq) return;
            items = unique(answer.items);
            total = answer.total;
            status = answer.status;
            if (query !== answered) scroller.scrollTop = 0;
            answered = query;
            loading = false;
            if (!query) kept.set(cacheKey(), { items: [...items], total, status });
            renderEverything();
            if (placementNow() === 'below') place();
            if (pickFirst) {
                pickFirst = false;
                stops.find((s) => s.primary)?.run();
            }
        } catch (err) {
            if (destroyed || mine !== seq || err?.name === 'AbortError') return;
            loading = false;
            pickFirst = false;
            items = [];
            total = null;
            status = null;
            answered = query;
            failure = labels.failed(err);
            renderEverything();
        }
    }

    async function loadMore({ byKey = false } = {}) {
        if (loading || loadingMore || total == null || items.length >= total) return;
        const mine = seq;
        loadingMore = true;
        render();
        let added = [];
        try {
            const answer = normalize(await load({ query: answered, offset: items.length, limit: pageSize, signal: abort?.signal }));
            if (destroyed || mine !== seq) return;
            const seen = new Set(items.map(idOf));
            added = unique(answer.items).filter((item) => !seen.has(idOf(item)));
            items = items.concat(added);
            // A server that ignores the paging hands back what is drawn: there
            // is no more, whatever it said before.
            total = added.length && Number.isFinite(answer.total) ? answer.total : items.length;
            if (answer.status != null) status = answer.status;
        } catch (err) {
            if (destroyed || mine !== seq || err?.name === 'AbortError') return;
            failure = labels.failedMore(err);
        }
        loadingMore = false;
        // Focus stays on Load more while there is more, else goes to the first
        // row it brought that can be chosen. Only the keyboard scrolls to it.
        const stayed = activeKey === 'more';
        if (stayed && items.length >= total) {
            const first = added.find((item) => !modelOf(item).disabled);
            if (first) {
                activeKey = `row:${idOf(first)}`;
                moved = true;
            }
        }
        renderEverything();
        if (stayed) {
            const stop = stops.find((s) => s.key === activeKey);
            if (stop) focusStop(stop);
            if (byKey) revealActive();
        }
    }

    more.addEventListener('click', () => loadMore());

    function setBusy(waiting) {
        busy = waiting;
        panel.classList.toggle('twm-wspicker--waiting', waiting);
        backdrop.classList.toggle('twm-wspicker-backdrop--waiting', waiting);
    }

    async function removeItem(item) {
        if (busy) return;
        const removedKey = `row:${idOf(item)}`;
        const at = stops.findIndex((s) => s.key === removedKey);
        const following = stops.slice(at + 1).find((s) => s.key.startsWith('row:'))
            ?? stops.slice(0, Math.max(at, 0)).reverse().find((s) => s.key.startsWith('row:'));
        const fromRow = stops[at]?.node === document.activeElement;
        // Before the call: a dialog it opens takes focus before it returns.
        setBusy(true);
        let outcome;
        try {
            outcome = await onRemove(item);
        } catch (err) {
            setBusy(false);
            if (isOpen) {
                failure = labels.failedRemove(err);
                render();
                input.focus();
            }
            return;
        }
        setBusy(false);
        if (!isOpen) return;
        if (outcome !== false) {
            items = items.filter((other) => idOf(other) !== idOf(item));
            if (total != null) total = Math.max(0, total - 1);
            if (activeKey === removedKey && following) {
                activeKey = following.key;
                moved = true;
            }
            ask(remote ? answered : '');
            if (fromRow && following) {
                focusStop(following);
                revealActive();
                return;
            }
        }
        input.focus();
    }

    // ── choosing ────────────────────────────────────────────────────────
    function pick(item) {
        const same = isCurrent(item);
        close({ restoreFocus: true });
        if (!same) onPick?.(item);
    }

    function runVerb(run) {
        const query = typed();
        close({ restoreFocus: true });
        run?.({ query });
    }

    function enter() {
        const query = typed();
        if (remote && query !== asked) {
            clearTimeout(timer);
            timer = null;
            pickFirst = true;
            ask(query);
            return;
        }
        if (loading && !moved) {
            pickFirst = true;
            return;
        }
        stops.find((s) => s.key === activeKey)?.run();
    }

    // ── placing ─────────────────────────────────────────────────────────
    function placementNow() {
        if (!anchor?.isConnected) return 'centered';
        return anchor.getBoundingClientRect().width > 0 ? placement : 'centered';
    }

    function place() {
        const mode = placementNow();
        for (const name of ['over', 'below', 'centered']) {
            panel.classList.toggle(`twm-wspicker--${name}`, mode === name);
        }
        show(backdrop, mode === 'centered');
        for (const side of ['top', 'bottom', 'left', 'right', 'width', 'maxHeight', 'overflowY', 'position']) panel.style[side] = '';
        if (mode === 'centered') return;
        const r = anchor.getBoundingClientRect();
        const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 2 * PANEL_EDGE);
        panel.style.width = `${width}px`;
        if (mode === 'below') {
            ActionDropdown.position(anchor, panel);
            return;
        }
        const left = r.left + r.width / 2 - width / 2;
        panel.style.left = `${Math.max(PANEL_EDGE, Math.min(left, window.innerWidth - width - PANEL_EDGE))}px`;
        // A field in the lower half (a bottom bar) grows upward, its bottom edge
        // where the field's is, because a list hanging below it has no room.
        if (r.top + r.height / 2 > window.innerHeight / 2) {
            panel.style.bottom = `${Math.max(2, window.innerHeight - r.bottom - OVER_LIFT)}px`;
        } else {
            panel.style.top = `${Math.max(2, r.top - OVER_LIFT)}px`;
        }
    }

    // ── opening and closing ─────────────────────────────────────────────
    function openPanel({ select = null } = {}) {
        if (isOpen || destroyed) return;
        isOpen = true;
        opener = document.activeElement;
        selectId = select == null ? null : String(select);
        input.value = '';
        clearTimeout(timer);
        timer = null;
        pickFirst = false;
        moved = false;
        activeKey = null;
        delete rovingKeys['row:'];
        delete rovingKeys['action:'];
        const last = kept.get(cacheKey());
        items = last ? [...last.items] : [];
        total = last ? last.total : null;
        status = last ? last.status : null;
        answered = '';
        asked = '';
        failure = null;
        document.body.append(backdrop, panel);
        place();
        renderEverything();
        scroller.scrollTop = 0;
        document.addEventListener('mousedown', onDocumentDown, true);
        document.addEventListener('keydown', onDocumentKey);
        window.addEventListener('resize', place);
        input.focus();
        onOpenChange?.(true);
        ask('');
    }

    function close({ restoreFocus = false } = {}) {
        if (!isOpen) return;
        isOpen = false;
        clearTimeout(timer);
        timer = null;
        pickFirst = false;
        selectId = null;
        // An answer that lands after the panel closed paints nothing.
        seq += 1;
        abort?.abort();
        loading = false;
        loadingMore = false;
        setBusy(false);
        panel.remove();
        backdrop.remove();
        document.removeEventListener('mousedown', onDocumentDown, true);
        document.removeEventListener('keydown', onDocumentKey);
        window.removeEventListener('resize', place);
        onOpenChange?.(false);
        if (restoreFocus && !destroyed) {
            const back = opener?.isConnected && opener !== document.body ? opener : anchor;
            back?.focus?.();
        }
        opener = null;
    }

    /** In the capture phase, so a surface that stops the event still closes it. */
    function onDocumentDown(event) {
        if (busy || panel.contains(event.target) || anchor?.contains?.(event.target)) return;
        close();
    }

    /** Esc with the focus outside the panel: on the anchor, say. */
    function onDocumentKey(event) {
        if (busy || event.key !== 'Escape' || panel.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        close({ restoreFocus: true });
    }

    // A press in the panel leaves focus where it is: on a row or a button it is
    // about to act and close; anywhere else it would drop the keyboard on nothing.
    panel.addEventListener('mousedown', (event) => {
        if (event.target !== input) event.preventDefault();
    });

    // Focus gets here by the arrows, Tab or a script, and the highlight goes with it.
    panel.addEventListener('focusin', ({ target, relatedTarget }) => {
        if (target === input) {
            // Back from a stop, not in from outside: `open({ select })` chose first.
            if (panel.contains(relatedTarget)) {
                moved = false;
                settleActive();
            }
            return;
        }
        const stop = stops.find((s) => s.node === target);
        if (!stop) return;
        activeKey = stop.key;
        moved = true;
        // The reader has gone on: an answer still to land does not pull the highlight back.
        selectId = null;
        const prefix = ['row:', 'action:'].find((p) => stop.key.startsWith(p));
        if (prefix) rovingKeys[prefix] = stop.key;
        syncTabStops();
        paintActive();
    });

    input.addEventListener('input', () => {
        moved = false;
        scroller.scrollTop = 0;
        if (remote) {
            clearTimeout(timer);
            const query = typed();
            timer = setTimeout(() => {
                timer = null;
                if (query !== asked) ask(query);
            }, debounceMs);
        }
        render();
    });

    panel.addEventListener('keydown', (event) => {
        if (event.isComposing || busy) return;
        const { key, shiftKey, target } = event;
        const handled = () => {
            event.preventDefault();
            event.stopPropagation();
        };
        const stop = stops.find((s) => s.node === target);
        if (key === 'Escape') {
            handled();
            close({ restoreFocus: true });
        } else if (key === 'ArrowDown' || key === 'ArrowUp') {
            handled();
            move(key === 'ArrowDown' ? 1 : -1);
        } else if (key === 'Enter' && target === input) {
            handled();
            enter();
        } else if ((key === 'Enter' || key === ' ') && stop) {
            // A row is no button, because it holds one; and Load more scrolls for
            // a key and not for a click.
            handled();
            stop.run();
        } else if (key === 'Delete' && shiftKey) {
            handled();
            stops.find((s) => s.key === activeKey)?.remove?.();
        } else if (key === 'Backspace' && target !== input) {
            // A window manager's keymap reads Backspace on anything that is not
            // a field as "up one level"; a row or a button here is not a field.
            handled();
        } else if (target !== input && key.length === 1 && key !== ' '
                   && !event.ctrlKey && !event.metaKey && !event.altKey) {
            // Moved before the press lands, so the character lands in the input;
            // and no further, because a keymap would read it as a shortcut: the
            // press began on something that is not a field.
            event.stopPropagation();
            input.focus();
        }
    });

    panel.addEventListener('focusout', (event) => {
        const to = event.relatedTarget;
        if (!busy && to && !panel.contains(to) && !anchor?.contains?.(to)) close();
    });

    return {
        panel,
        input,
        get isOpen() { return isOpen; },
        get current() { return current; },
        open: openPanel,
        close,
        toggle() {
            if (isOpen) close({ restoreFocus: true });
            else openPanel();
        },
        /** Which one the window is in, whether or not an answer holds it. */
        setCurrent(item) {
            current = item ?? null;
            if (isOpen) renderEverything();
        },
        /** Ask `actions`, `card` and `footer` again: who may do what changed. */
        refresh() {
            if (isOpen) renderEverything();
        },
        /** Ask `load` again: the list changed behind the switcher's back. */
        reload() {
            if (isOpen) ask(remote ? typed() : '');
        },
        destroy() {
            close();
            destroyed = true;
        },
    };
}

/**
 * The field and the switcher together: a click on the field, or the chord,
 * opens the switcher in the field's place; `setCurrent` names the current item
 * on the field and marks it in the list.
 *
 * `chord` is none by default. Given (`'Ctrl+P'`; Ctrl also answers to Cmd), it
 * is taken on `window` in the capture phase, ahead of an embedded editor and of
 * the browser's own use of the key, and it is the key hint unless
 * `field.keyHint` says otherwise. It still works while the field is hidden for
 * want of room.
 *
 * @param {HTMLElement} hostEl - Where the field mounts
 * @param {object} options - `createPickerSwitcher`'s, and:
 * @param {object} [options.field] - `mountPickerField`'s. `field.placeholder` is
 *   its name while nothing is current; `field.icon`, when given, is its icon
 *   whatever is current, and otherwise the current item's `icon` is.
 * @param {string} [options.chord]
 */
export function createWorkspacePicker(hostEl, { field: fieldOptions = {}, chord = null, ...switcherOptions }) {
    const { placeholder = '', icon: fixedIcon, ...mountOptions } = fieldOptions;
    const parsed = chord ? parseChord(chord) : null;
    const field = mountPickerField(hostEl, {
        ariaLabel: switcherOptions.label,
        keyHint: chord ?? '',
        ...mountOptions,
        onActivate: () => switcher.toggle(),
    });
    const switcher = createPickerSwitcher({
        ...switcherOptions,
        anchor: field.el,
        onOpenChange: (open) => {
            field.setOpen(open);
            switcherOptions.onOpenChange?.(open);
        },
    });

    const paint = () => {
        const item = switcher.current;
        const model = item == null ? null : switcherOptions.describe(item, { current: true });
        field.update({
            name: model ? model.name : placeholder,
            icon: fixedIcon ?? model?.icon ?? '',
            muted: !model,
        });
    };
    paint();

    const onKeydown = (event) => {
        if (!chordMatches(parsed, event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) switcher.toggle();
    };
    if (parsed) window.addEventListener('keydown', onKeydown, true);

    return {
        field,
        switcher,
        get el() { return field.el; },
        get isOpen() { return switcher.isOpen; },
        get current() { return switcher.current; },
        open: switcher.open,
        close: switcher.close,
        toggle: switcher.toggle,
        refresh: switcher.refresh,
        reload: switcher.reload,
        setCurrent(item) {
            switcher.setCurrent(item);
            paint();
        },
        destroy() {
            if (parsed) window.removeEventListener('keydown', onKeydown, true);
            switcher.destroy();
            field.destroy();
        },
    };
}
