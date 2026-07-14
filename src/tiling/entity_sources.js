/**
 * entity_sources.js — the entity-source PORT.
 *
 * The command palette, the tile hamburger menu, and any other "find me a
 * thing" surface need a list of every searchable entity. Where those
 * entities come from — which endpoint returns them, what a row looks
 * like, what to call it — is the EMBEDDER's knowledge, not the shell's.
 *
 * So the source list is INJECTED. The embedder describes its sources and
 * hands them to `createEntityCatalog()` at boot. Nothing in this file
 * names an entity type or a bridge route.
 *
 * ## EntitySource
 *
 *   navKind   The content kind used to open a row via `wm.navigate`.
 *             The taxonomy resolves its icon + label.
 *
 *   list      `(api) => Promise<rawList>` — per-source fetcher. Used by
 *             the fan-out path, and by `loadOne` when a caller wants a
 *             subset rather than the whole catalog.
 *
 *   pluck?    `(raw) => Array` — extract the actual list when the
 *             endpoint wraps it. Defaults to "raw is an array, else
 *             raw.items if that's an array, else []".
 *
 *   shape     `(row) => { id, label, hint? } | null` — normalise one raw
 *             row to the record shape every search surface consumes.
 *             Return `null` to skip the row.
 *
 * ## Aggregation
 *
 * An embedder whose backend can answer for every source in ONE call
 * passes `aggregate: (api) => Promise<{ [navKind]: rawList } | null>`.
 * The catalog prefers it and fans out only for the navKinds it failed to
 * answer for. Absent ⇒ straight fan-out. Absent capability, absent key:
 * the shell never probes for a named endpoint of its own accord.
 *
 * Errors from any single source are logged and treated as "empty", so
 * one broken endpoint can't blank the entire palette.
 */

export function createEntityCatalog({ sources, aliases = {}, aggregate = null } = {}) {
    if (!Array.isArray(sources)) {
        throw new TypeError('createEntityCatalog: `sources` must be an array');
    }
    for (const s of sources) {
        if (!s?.navKind || typeof s.list !== 'function' || typeof s.shape !== 'function') {
            throw new TypeError(
                `createEntityCatalog: source '${s?.navKind ?? '?'}' needs navKind + list() + shape()`);
        }
    }
    if (aggregate != null && typeof aggregate !== 'function') {
        throw new TypeError('createEntityCatalog: `aggregate` must be a function when present');
    }

    const _sources = Object.freeze(sources.map((s) => Object.freeze({ ...s })));
    const _byKind  = new Map(_sources.map((s) => [s.navKind, s]));
    const _aliases = Object.freeze({ ...aliases });

    const get = (navKind) => _byKind.get(navKind) || null;

    /** Unwrap one source's raw payload into a row array. */
    const _extract = (src, raw) => {
        const list = src.pluck
            ? src.pluck(raw)
            : (Array.isArray(raw) ? raw
              : Array.isArray(raw?.items) ? raw.items
              : []);
        return Array.isArray(list) ? list : [];
    };

    /** Shape a source's rows, dropping the ones `shape` rejects or
     *  throws on. Shared by the palette AND the tile menu so their
     *  semantics cannot drift apart — the menu used to re-implement
     *  this loop by hand. */
    const shapeRows = (navKind, rows) => {
        const src = _byKind.get(navKind);
        if (!src || !Array.isArray(rows)) return [];
        const out = [];
        for (const row of rows) {
            let shaped;
            try { shaped = src.shape(row); }
            catch (err) {
                console.warn('[entity-catalog]', navKind, 'shape failed', err, row);
                continue;
            }
            if (!shaped || !shaped.id) continue;
            out.push(shaped);
        }
        return out;
    };

    /** Fetch ONE source's raw rows. Used by surfaces that only care
     *  about a subset of the catalog. */
    const loadOne = async (navKind, api) => {
        const src = _byKind.get(navKind);
        if (!src || !api) return [];
        try { return _extract(src, await src.list(api)); }
        catch (err) {
            console.warn('[entity-catalog]', navKind, 'fetch failed', err);
            return [];
        }
    };

    /** Fetch every source's raw rows, grouped by navKind.
     *
     *  The aggregator runs first when the embedder supplied one; the
     *  fan-out only fires for sources it didn't answer for (it threw, it
     *  isn't there, or it doesn't know a newly-added navKind yet).
     *
     *  Shape: `{ [navKind]: rawRow[] }` — every navKind is always
     *  present (empty on failure) so consumers can destructure safely. */
    const loadGrouped = async (api) => {
        const out = {};
        for (const s of _sources) out[s.navKind] = [];
        if (!api) return out;

        let bulk = null;
        if (aggregate) {
            try { bulk = await aggregate(api); }
            catch (err) {
                console.warn('[entity-catalog] aggregate failed, falling back to fan-out', err);
            }
            if (bulk && typeof bulk !== 'object') bulk = null;
        }

        const missing = [];
        for (const src of _sources) {
            const raw = bulk ? bulk[src.navKind] : undefined;
            if (raw == null) { missing.push(src); continue; }
            out[src.navKind] = _extract(src, raw);
        }
        if (missing.length === 0) return out;

        await Promise.all(missing.map(async (src) => {
            out[src.navKind] = await loadOne(src.navKind, api);
        }));
        return out;
    };

    /** Flat-and-shaped form for search surfaces. Builds on
     *  `loadGrouped` so there is a single fetch path and the palette /
     *  explorer can't drift apart in coverage. */
    const loadAll = async (api) => {
        const grouped = await loadGrouped(api);
        const out = [];
        for (const src of _sources) {
            for (const shaped of shapeRows(src.navKind, grouped[src.navKind] || [])) {
                out.push({ kind: src.navKind, ...shaped });
            }
        }
        return out;
    };

    /** Resolve a user-typed type prefix to a list of canonical navKinds.
     *  Accepts the embedder's aliases first, then navKinds verbatim,
     *  then the underscore spelling of a hyphenated kind. Returns an
     *  array of navKinds on hit, `null` otherwise. */
    const resolveTypePrefix = (prefix) => {
        const p = String(prefix || '').toLowerCase().trim();
        if (!p) return null;
        if (_aliases[p]) return _aliases[p];
        for (const src of _sources) {
            if (src.navKind === p) return [src.navKind];
            if (src.navKind.replace(/-/g, '_') === p) return [src.navKind];
        }
        return null;
    };

    return Object.freeze({
        sources: _sources,
        get,
        loadOne,
        loadGrouped,
        loadAll,
        shapeRows,
        resolveTypePrefix,
    });
}
