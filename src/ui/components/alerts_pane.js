/**
 * ══ THE ALERTS PANE ═══════════════════════════════════════════════════════
 *
 * An alert log (`alert_log.js`) drawn as the bottom panel's Alerts tab: level
 * chips with counts, a text filter, entries grouped by day with relative
 * times, an unread mark, Open and Dismiss on each row, Mark all read and Clear
 * for the lot (FlexDesk STORY-0019, from bugdesk's `alerts.js`). The same
 * layout whether the log is local or pages a server: *Load older* appears
 * when the source has more.
 *
 *     mountAlertsPane(el, { log, onOpen: (entry) => …, onBadge: ({ unread, level }) => … })
 *
 * OPTIONAL, for an embedder with rules of its own (bugdesk): `rules` is
 * `{ list() → [{ id, name, level, meta?, off? }], onEdit?, foot? }` — a column
 * of them on the left that narrows the log to one rule (entries carry
 * `ruleId`) — and `stillMatches(entry)` → true / false / null, drawn as "still
 * matches" or "no longer matches" on each row.
 *
 * NEVER REBUILT UNDER THE POINTER. A log changes on its own — a push from the
 * server, a rule firing, the minute tick — and a row repainted between a
 * mousedown and its click loses the click (Tables' recorded trap). While a
 * button is down inside the pane a repaint waits, and runs once it is up.
 * The bar (chips, the filter, the buttons) is built once and updated in
 * place, so typing in the filter never loses the caret either.
 */

import { ALERT_LEVELS, ago, dayLabel, normalizeLevel } from './alert_log.js';

const CHIPS = [['all', 'All'], ['alert', 'Alert'], ['warning', 'Warning'], ['info', 'Info']];

/**
 * @param {HTMLElement} host
 * @param {object}   opts
 * @param {object}   opts.log           `createAlertLog(…)`
 * @param {Function}[opts.onOpen]       `(entry)` — Open; the entry is marked read first
 * @param {Function}[opts.onBadge]      `({ unread, level })` after every change — a tab's badge
 * @param {object}  [opts.rules]        `{ list, onEdit?, foot? }`
 * @param {Function}[opts.stillMatches] `(entry) → boolean | null`
 * @param {Function}[opts.describe]     `(entry) → string` — a small chip on the row (bugdesk: the store)
 * @param {string}  [opts.status]       the footer line
 * @param {object}  [opts.empty]        `{ none, filtered }` — the two empty texts
 * @returns {{ refresh, destroy, root }}
 */
export function mountAlertsPane(host, {
    log, onOpen = null, onBadge = null, rules = null, stillMatches = null, describe = null,
    status = '', empty = {},
} = {}) {
    const doc = host.ownerDocument;
    const el = (tag, cls, text) => {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const icon = (name) => el('span', 'material-symbols-outlined', name);

    let level = 'all';
    let rule = null;
    let q = '';
    let pointerDown = false;
    let pending = false;
    let destroyed = false;

    // ── the frame, built once ────────────────────────────────────────────
    const root = el('div', 'twm-alerts');
    let ruleList = null;
    if (rules) {
        const side = el('div', 'twm-alerts__rules');
        const head = el('div', 'twm-alerts__head');
        head.append(el('span', 'twm-alerts__caps', 'RULES'), el('span', 'twm-alerts__spacer'));
        if (rules.onEdit) {
            const edit = el('button', 'twm-alerts__link', 'Edit rules');
            edit.type = 'button';
            edit.dataset.act = 'edit-rules';
            head.append(edit);
        }
        ruleList = el('div', 'twm-alerts__rulelist');
        side.append(head, ruleList);
        if (rules.foot) side.append(el('div', 'twm-alerts__foot', rules.foot));
        root.append(side);
    }
    const main = el('div', 'twm-alerts__main');
    const bar = el('div', 'twm-alerts__bar');
    const chips = el('div', 'twm-alerts__chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Level');
    const chipEls = new Map();
    for (const [key, label] of CHIPS) {
        const chip = el('button', 'twm-alerts__chip');
        chip.type = 'button';
        chip.dataset.level = key;
        chip.append(doc.createTextNode(`${label} `), el('span', 'twm-alerts__count', '0'));
        chips.append(chip);
        chipEls.set(key, chip);
    }
    const input = el('input', 'twm-alerts__q');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Filter';
    input.setAttribute('aria-label', 'Filter alerts');
    const readAll = el('button', 'twm-btn twm-alerts__btn', 'Mark all read');
    readAll.type = 'button';
    readAll.dataset.act = 'read-all';
    const clear = el('button', 'twm-btn twm-alerts__btn', 'Clear');
    clear.type = 'button';
    clear.dataset.act = 'clear';
    bar.append(chips, input, el('span', 'twm-alerts__spacer'), readAll, clear);
    const list = el('div', 'twm-alerts__log');
    const foot = el('div', 'twm-alerts__status', status);
    foot.hidden = !status;
    main.append(bar, list, foot);
    root.append(main);
    host.append(root);

    // ── what is shown ───────────────────────────────────────────────────
    const byRule = () => (rule ? log.entries().filter((e) => String(e.ruleId) === rule) : log.entries());
    const shown = () => {
        const needle = q.trim().toLowerCase();
        return byRule()
            .filter((e) => level === 'all' || e.level === level)
            .filter((e) => !needle || `${e.ref ?? ''} ${e.title} ${e.body ?? ''} ${e.rule ?? ''}`
                .toLowerCase().includes(needle));
    };

    function row(entry, now) {
        const lv = ALERT_LEVELS[normalizeLevel(entry.level)];
        const r = el('div', `twm-alerts__row twm-alerts__row--${entry.level}${entry.read ? '' : ' twm-alerts__row--unread'}`);
        r.dataset.id = entry.id;
        const mark = el('span', 'twm-alerts__unread');
        mark.setAttribute('aria-label', entry.read ? 'Read' : 'Unread');
        const ic = icon(lv.icon);
        ic.classList.add('twm-alerts__icon');
        ic.title = lv.label;
        const time = el('span', 'twm-alerts__time', ago(entry.at, now));
        time.title = entry.at.toLocaleString();
        const text = el('span', 'twm-alerts__text');
        text.append(el('span', 'twm-alerts__title', entry.title));
        if (entry.body) text.append(el('span', 'twm-alerts__body', entry.body));
        const cells = [mark, ic, time];
        if (rules) cells.push(el('span', 'twm-alerts__rule', entry.rule ?? ''));
        const tag = describe?.(entry);
        cells.push(el('span', tag ? 'twm-alerts__tag' : 'twm-alerts__tag twm-alerts__tag--none', tag ?? ''));
        const ref = el(entry.ref && onOpen ? 'button' : 'span', 'twm-alerts__ref', entry.ref ?? '');
        if (ref.tagName === 'BUTTON') { ref.type = 'button'; ref.dataset.open = entry.id; }
        cells.push(ref, text);
        if (stillMatches) {
            const still = stillMatches(entry);
            cells.push(el('span', `twm-alerts__state${still === false ? ' twm-alerts__state--gone' : ''}`,
                still === true ? 'still matches' : still === false ? 'no longer matches' : ''));
        }
        const acts = el('span', 'twm-alerts__acts');
        if (onOpen) {
            const open = el('button', 'twm-alerts__icon-btn');
            open.type = 'button';
            open.dataset.open = entry.id;
            open.title = 'Open';
            open.setAttribute('aria-label', 'Open');
            open.append(icon('open_in_new'));
            acts.append(open);
        }
        if (log.canDismiss()) {
            const dis = el('button', 'twm-alerts__icon-btn');
            dis.type = 'button';
            dis.dataset.dismiss = entry.id;
            dis.title = 'Dismiss';
            dis.setAttribute('aria-label', 'Dismiss');
            dis.append(icon('close'));
            acts.append(dis);
        }
        cells.push(acts);
        r.append(...cells);
        return r;
    }

    function paint() {
        if (destroyed) return;
        if (pointerDown) { pending = true; return; }
        pending = false;
        const now = new Date();
        const all = log.entries();
        const scoped = byRule();

        for (const [key, chip] of chipEls) {
            const on = level === key;
            chip.classList.toggle('twm-alerts__chip--on', on);
            chip.setAttribute('aria-pressed', String(on));
            chip.querySelector('.twm-alerts__count').textContent =
                String(scoped.filter((e) => key === 'all' || e.level === key).length);
        }
        readAll.disabled = !all.some((e) => !e.read) && log.unreadCount() === 0;
        clear.hidden = !log.canDismiss();
        clear.disabled = !all.length;

        if (ruleList) {
            const items = [{ id: null, name: 'All alerts', meta: String(all.length) }, ...(rules.list?.() ?? [])];
            ruleList.replaceChildren(...items.map((r) => {
                const key = r.id === null ? null : String(r.id);
                const b = el('button', `twm-alerts__rulebtn${rule === key ? ' twm-alerts__rulebtn--on' : ''}${r.off ? ' twm-alerts__rulebtn--off' : ''}`);
                b.type = 'button';
                b.dataset.rule = key ?? '';
                b.setAttribute('aria-pressed', String(rule === key));
                b.append(el('span', `twm-alerts__dot${r.level ? ` twm-alerts__dot--${normalizeLevel(r.level)}` : ''}`),
                         el('span', 'twm-alerts__rulename', r.name || 'Unnamed rule'),
                         el('span', 'twm-alerts__meta', r.meta ?? ''));
                return b;
            }));
        }

        const rows = [];
        let lastDay = '';
        for (const entry of shown()) {
            const day = dayLabel(entry.at, now);
            if (day !== lastDay) rows.push(el('div', 'twm-alerts__day', day));
            lastDay = day;
            rows.push(row(entry, now));
        }
        if (!rows.length) {
            rows.push(el('div', 'twm-alerts__none', !log.loaded() ? 'Loading…'
                : all.length ? (empty.filtered ?? 'No alerts match.') : (empty.none ?? 'Nothing yet.')));
        }
        if (log.hasMore()) {
            const older = el('button', 'twm-btn twm-alerts__more', 'Load older');
            older.type = 'button';
            older.dataset.act = 'more';
            rows.push(older);
        }
        const scroll = list.scrollTop;
        list.replaceChildren(...rows);
        list.scrollTop = scroll;
        onBadge?.({ unread: log.unreadCount(), level: log.worstUnread() });
    }

    // ── input ───────────────────────────────────────────────────────────
    const onDown = () => { pointerDown = true; };
    const onUp = () => {
        if (!pointerDown) return;
        // After the click this mouseup belongs to has been dispatched.
        setTimeout(() => {
            pointerDown = false;
            if (pending) paint();
        }, 0);
    };
    root.addEventListener('mousedown', onDown, true);
    root.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('mouseup', onUp, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);

    root.addEventListener('click', (event) => {
        const t = event.target;
        const chip = t.closest('[data-level]');
        if (chip) { level = chip.dataset.level; paint(); return; }
        const r = t.closest('[data-rule]');
        if (r) { rule = r.dataset.rule || null; paint(); return; }
        const open = t.closest('[data-open]');
        if (open) {
            const entry = log.get(open.dataset.open);
            if (!entry) return;
            log.markRead([entry.id]);
            onOpen?.(entry);
            return;
        }
        const dis = t.closest('[data-dismiss]');
        if (dis) { log.dismiss([dis.dataset.dismiss]); return; }
        const act = t.closest('[data-act]')?.dataset.act;
        if (act === 'read-all') log.markRead();
        else if (act === 'clear') log.dismiss();
        else if (act === 'more') log.loadMore();
        else if (act === 'edit-rules') rules?.onEdit?.();
    });
    input.addEventListener('input', () => { q = input.value; paint(); });

    const unsubscribe = log.subscribe(() => paint());
    // "5 min ago" moves on its own.
    const timer = setInterval(paint, 60000);
    paint();
    log.load?.();

    return {
        root,
        refresh: paint,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            clearInterval(timer);
            unsubscribe();
            doc.removeEventListener('mouseup', onUp, true);
            doc.removeEventListener('pointerup', onUp, true);
            doc.removeEventListener('pointercancel', onUp, true);
            root.remove();
        },
    };
}
