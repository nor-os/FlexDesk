/**
 * ══ THE ALERT LOG ═════════════════════════════════════════════════════════
 *
 * What an application told its user, kept: every entry, newest first, read or
 * not, until it is dismissed or falls off the end (FlexDesk STORY-0019, from
 * bugdesk's `alerts.js`). NotificationCenter's toasts are the moment; this is
 * the history the Alerts pane (`alerts_pane.js`) and the bell
 * (NotificationHistory's `alertLog` option) read.
 *
 * An ENTRY is `{ id, at, level, title, body?, ref?, read, ruleId?, rule? }`.
 * `at` is a Date; `level` is one of `info`, `warning`, `alert` (`normalizeLevel`
 * maps the toast's `warn`/`error` and the server's `danger` onto them).
 *
 * WHERE ENTRIES LIVE IS THE EMBEDDER'S — a pluggable SOURCE:
 *
 *     load({ offset, limit })  → { entries, more?, unread? }   a page, newest first
 *     markRead(ids | null)     → null is "all"
 *     dismiss(ids | null)      → optional; without it nothing can be dismissed
 *
 * bugdesk keeps the whole log in its workspace state (`localSource`: one
 * blob, read once, written on every change); Tables pages its server's
 * notifications and has no dismiss. A source's `unread` is the count beyond
 * the loaded page — the server knows it, the page does not.
 *
 * CHANGES ARE APPLIED HERE FIRST and the source told after, so a click marks
 * read at once; a source that refuses is logged and the log re-read, rather
 * than the click being made to wait on a round trip.
 */

/** The three levels, worst last; `icon` is a Material Symbols name. */
export const ALERT_LEVELS = Object.freeze({
    info: Object.freeze({ label: 'Info', icon: 'info' }),
    warning: Object.freeze({ label: 'Warning', icon: 'warning' }),
    alert: Object.freeze({ label: 'Alert', icon: 'notifications_active' }),
});

const LEVEL_ALIASES = { warn: 'warning', error: 'alert', danger: 'alert', critical: 'alert', success: 'info' };

/** One of `info`, `warning`, `alert`, whatever the caller spelt. */
export function normalizeLevel(level) {
    const l = String(level ?? '').toLowerCase();
    if (ALERT_LEVELS[l]) return l;
    return LEVEL_ALIASES[l] ?? 'info';
}

/** The worst level among these entries — a badge's colour — or null for none. */
export function worstLevel(entries) {
    let worst = null;
    for (const e of entries || []) {
        const l = normalizeLevel(e?.level);
        if (l === 'alert') return 'alert';
        if (l === 'warning') worst = 'warning';
        else if (!worst) worst = 'info';
    }
    return worst;
}

/** "just now", "5 min ago", "3 h ago"; older than a day, the clock time (the day header has the date). */
export function ago(at, now = new Date()) {
    const s = Math.max(0, (now - at) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** TODAY, YESTERDAY, or the date — the Alerts pane's day header. */
export function dayLabel(at, now = new Date()) {
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((t - d) / 86400000);
    if (days === 0) return 'TODAY';
    if (days === 1) return 'YESTERDAY';
    return at.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        .toUpperCase();
}

let _seq = 0;

/** An entry in the shape the log keeps, from whatever a source or a caller handed in. */
function normalizeEntry(raw) {
    const at = raw.at instanceof Date ? raw.at : new Date(raw.at ?? Date.now());
    return {
        ...raw,
        id: String(raw.id ?? `${Date.now().toString(36)}-${(_seq++).toString(36)}`),
        at: Number.isNaN(at.getTime()) ? new Date() : at,
        level: normalizeLevel(raw.level),
        title: String(raw.title ?? ''),
        read: !!raw.read,
    };
}

/**
 * A source that keeps the whole log in one stored value — bugdesk's workspace
 * state, or localStorage. `read()` answers the saved array (or a promise of
 * it); `write(array)` stores one. Dates are written as ISO strings.
 */
export function localSource({ read, write, limit = 300 } = {}) {
    let all = null;
    const save = () => {
        try {
            write?.(all.map((e) => ({ ...e, at: e.at.toISOString() })));
        } catch (err) { console.warn('[alert-log] the log could not be saved', err); }
    };
    const ensure = async () => {
        if (all) return all;
        let saved = [];
        try { saved = (await read?.()) ?? []; } catch (err) {
            console.warn('[alert-log] the log could not be read', err);
        }
        all = (Array.isArray(saved) ? saved : []).filter((e) => e && typeof e === 'object')
            .map(normalizeEntry).sort((a, b) => b.at - a.at).slice(0, limit);
        return all;
    };
    return {
        local: true,
        async load({ offset = 0, limit: n = limit } = {}) {
            const list = await ensure();
            return { entries: list.slice(offset, offset + n), more: offset + n < list.length };
        },
        async add(entry) {
            const list = await ensure();
            list.unshift(entry);
            if (list.length > limit) list.length = limit;
            save();
        },
        async markRead(ids) {
            const want = ids ? new Set(ids) : null;
            for (const e of await ensure()) if (!want || want.has(e.id)) e.read = true;
            save();
        },
        async dismiss(ids) {
            const want = ids ? new Set(ids) : null;
            all = (await ensure()).filter((e) => want && !want.has(e.id));
            save();
        },
    };
}

/**
 * @param {object}  [opts]
 * @param {object}  [opts.source]  where entries live; none keeps them in memory only
 * @param {number}  [opts.limit]   most entries held, and a page's size
 * @returns the log
 */
export function createAlertLog({ source = null, limit = 300 } = {}) {
    let entries = [];
    let more = false;
    let remoteUnread = null;
    let loaded = false;
    let loading = null;
    const listeners = new Set();

    const changed = () => {
        for (const fn of [...listeners]) {
            try { fn(log); } catch (err) { console.warn('[alert-log] listener failed', err); }
        }
    };
    const tell = (verb, ...args) => {
        const fn = source?.[verb];
        if (typeof fn !== 'function') return;
        Promise.resolve().then(() => fn.apply(source, args)).catch((err) => {
            console.warn(`[alert-log] the source refused ${verb}`, err);
            log.refresh();
        });
    };
    const page = async (offset) => {
        const res = (await source?.load?.({ offset, limit })) ?? {};
        const got = (res.entries ?? []).map(normalizeEntry);
        return { got, more: !!res.more, unread: Number.isFinite(res.unread) ? res.unread : null };
    };

    const log = {
        /** Loaded entries, newest first. */
        entries: () => entries,
        loaded: () => loaded,
        /** Whether the source has older entries than those loaded. */
        hasMore: () => more,
        /** Whether entries can be dismissed: a log with no source, or a source that can. */
        canDismiss: () => !source || typeof source.dismiss === 'function',
        /** Unread entries: the source's count when it knows one, else the loaded ones. */
        unreadCount() {
            const here = entries.filter((e) => !e.read).length;
            return remoteUnread === null ? here : Math.max(remoteUnread, here);
        },
        /** The worst level among unread entries, or null. */
        worstUnread: () => worstLevel(entries.filter((e) => !e.read)),
        get: (id) => entries.find((e) => e.id === String(id)) ?? null,

        /** `fn(log)` after every change; answers the unsubscribe. */
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        /** The first page, again. */
        refresh() {
            if (!source?.load) { loaded = true; changed(); return Promise.resolve(log); }
            loading = page(0).then(({ got, more: m, unread }) => {
                entries = got;
                more = m;
                remoteUnread = unread;
                loaded = true;
                changed();
                return log;
            }).catch((err) => {
                console.warn('[alert-log] the log could not be loaded', err);
                loaded = true;
                changed();
                return log;
            }).finally(() => { loading = null; });
            return loading;
        },
        /** Load once; later calls answer the same promise or nothing. */
        load() { return loading ?? (loaded ? Promise.resolve(log) : log.refresh()); },
        /** The next page, after the loaded ones. */
        async loadMore() {
            if (!more || !source?.load) return log;
            const { got, more: m, unread } = await page(entries.length);
            const seen = new Set(entries.map((e) => e.id));
            entries = [...entries, ...got.filter((e) => !seen.has(e.id))];
            more = m;
            if (unread !== null) remoteUnread = unread;
            changed();
            return log;
        },

        /** A new entry raised HERE (bugdesk's rules): kept, and handed to the source to save. */
        add(raw) {
            const entry = normalizeEntry(raw);
            entries = [entry, ...entries.filter((e) => e.id !== entry.id)];
            if (entries.length > limit) entries.length = limit;
            if (remoteUnread !== null && !entry.read) remoteUnread += 1;
            tell('add', entry);
            changed();
            return entry;
        },
        /** Entries that arrived from the source's side (a push): shown, not saved back. */
        receive(raws) {
            const got = (Array.isArray(raws) ? raws : [raws]).map(normalizeEntry);
            const ids = new Set(got.map((e) => e.id));
            const fresh = got.filter((e) => !entries.some((x) => x.id === e.id));
            entries = [...got, ...entries.filter((e) => !ids.has(e.id))]
                .sort((a, b) => b.at - a.at).slice(0, limit);
            if (remoteUnread !== null) remoteUnread += fresh.filter((e) => !e.read).length;
            changed();
        },
        /** Mark these read — all of them when `ids` is omitted. */
        markRead(ids = null) {
            const want = ids ? new Set(ids.map(String)) : null;
            let n = 0;
            for (const e of entries) if (!e.read && (!want || want.has(e.id))) { e.read = true; n++; }
            if (remoteUnread !== null) remoteUnread = want ? Math.max(0, remoteUnread - n) : 0;
            if (!n && want) return;
            tell('markRead', want ? [...want] : null);
            changed();
        },
        /** Remove these — all of them when `ids` is omitted. Nothing, when the source cannot. */
        dismiss(ids = null) {
            if (!log.canDismiss()) return;
            const want = ids ? new Set(ids.map(String)) : null;
            const gone = entries.filter((e) => !want || want.has(e.id));
            if (!gone.length) return;
            entries = want ? entries.filter((e) => !want.has(e.id)) : [];
            if (remoteUnread !== null) {
                remoteUnread = want ? Math.max(0, remoteUnread - gone.filter((e) => !e.read).length) : 0;
            }
            tell('dismiss', want ? [...want] : null);
            changed();
        },
    };
    if (!source?.load) loaded = true;
    return log;
}
