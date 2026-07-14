/**
 * table_state_store.js — persist DataTable view-state (sort, filters,
 * column widths), keyed by a caller-supplied `persistKey`.
 *
 * A FACTORY, not a singleton: the store reads and writes through a Host's
 * `state` capability (see ui/js/host/host.js) under one logical state key.
 * One blob holds a map of `{ [persistKey]: state }` for every persisted table.
 * Where that key lands on disk is the embedder's business, not ours — it is
 * decided by the host's `resolvePath`.
 *
 * A host without a `state` capability is legal: tables simply stay ephemeral.
 *
 * The in-memory cache must be dropped when the project changes (the app swaps
 * projects in-place without a page reload) — `reset()` is wired to the
 * `project:opened` event in app_bootstrap.
 */

/**
 * @param {object}  opts
 * @param {object}  opts.host        a Host. May lack `state` -> tables become ephemeral.
 * @param {string}  opts.key         logical state key, e.g. 'datatable_state'
 * @param {object}  [opts.logger]
 * @param {number}  [opts.debounceMs=500]
 */
export function createTableStateStore({ host, key, logger = console, debounceMs = 500 }) {
    if (!key) throw new Error('createTableStateStore requires { key }');
    const state = host?.state || null;

    let cache = null;        // { [persistKey]: state } — null until first load
    let loadPromise = null;
    let saveTimer = null;

    const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            saveTimer = null;
            if (!state || !cache) return;
            try { await state.write(key, cache); }
            catch (err) { logger.warn?.('[table-state] save failed', err); }
        }, debounceMs);
    };

    return {
        /** Resolve once the persisted blob has been read into the cache. Safe
         *  to call repeatedly — the read happens at most once per project. */
        ready() {
            if (loadPromise) return loadPromise;
            loadPromise = (async () => {
                if (!state) { cache = {}; return cache; }
                try { cache = (await state.read(key)) || {}; }
                catch (err) { logger.warn?.('[table-state] load failed', err); cache = {}; }
                return cache;
            })();
            return loadPromise;
        },

        /** Synchronous read of a table's persisted state. Returns null until
         *  the cache is loaded (await `ready()` first to be sure). */
        get(k) {
            if (!k || !cache) return null;
            return cache[k] || null;
        },

        /** Merge-and-persist a table's state (debounced). Pass null to forget
         *  a key. Writes the whole map back atomically through the host. */
        set(k, s) {
            if (!k) return;
            if (!cache) cache = {};
            if (s == null) delete cache[k]; else cache[k] = s;
            scheduleSave();
        },

        /** Drop the cache + pending read so the next access reloads from the
         *  newly-opened project. Cancels any in-flight save for the old one. */
        reset() {
            cache = null;
            loadPromise = null;
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        },
    };
}
