/**
 * recent_items.js — a most-recent-first list kept through the Host's `state`
 * capability, so it survives a restart.
 *
 *     const recent = createRecentItems({ host, key: 'recent-workspaces' });
 *     await recent.load();
 *     recent.add({ id: 'w1', name: 'North' });
 *     recent.list();    // [{ id: 'w1', name: 'North', openedAt: 1730... }]
 *
 * An entry is any plain object; `identity` says which two are the same one, and
 * `add` stamps `openedAt`. `capacity` is per `groupOf(entry)` when that is
 * given, so one busy kind of entry never pushes another kind out.
 *
 * ══ A READ THAT FAILS IS NOT AN EMPTY LIST ═════════════════════════════════
 *
 * A `host.state.read` that rejects says nothing about what is stored, so until
 * a read succeeds the stored list is never written: writing would replace
 * entries nobody has seen. Changes made in the meantime show in `list()` at
 * once, are kept, are replayed onto the stored list when it is read, and each
 * of them asks for the read again. A read that answers something other than an
 * array is a read: the store is empty.
 *
 * Writes run one at a time and the last one carries the latest list, because a
 * host may answer them out of order and the older list must not win.
 *
 * A host with no `state` capability keeps the list in memory for this session.
 */

/**
 * @param {object} options
 * @param {object} options.host - The Host; its `state` keeps the list
 * @param {string} options.key - The state key the list is stored under
 * @param {(entry: object) => string} [options.identity] - Which entries are the same one
 * @param {(entry: unknown) => boolean} [options.isValid] - Stored entries that fail this
 *   are dropped on read, as is one that makes it, `identity` or `groupOf` throw, so
 *   `identity` may assume an entry's shape.
 * @param {number} [options.capacity=10] - The most entries kept, per group
 * @param {(entry: object) => string} [options.groupOf] - Groups the capacity counts within
 * @param {() => void} [options.onChange] - After every change, and after a read that
 *   replayed changes
 * @param {object} [options.logger] - Its `warn` hears a failed read or write
 */
export function createRecentItems({
    host,
    key,
    identity = (entry) => entry.id,
    isValid = (entry) => !!entry && typeof entry === 'object' && !!identity(entry),
    capacity = 10,
    groupOf = () => '',
    onChange = null,
    logger = null,
}) {
    const state = host?.state ?? null;
    let entries = [];
    let loaded = !state;
    /** The changes made while the stored list is unread, oldest first: list => list. */
    let pending = [];
    let reading = null;
    let writing = false;
    let writeAgain = false;

    const capped = (list) => {
        const counts = new Map();
        return list.filter((entry) => {
            const group = groupOf(entry);
            const count = (counts.get(group) ?? 0) + 1;
            counts.set(group, count);
            return count <= capacity;
        });
    };

    const without = (list, entry) => {
        const id = identity(entry);
        return list.filter((other) => identity(other) !== id);
    };

    async function write() {
        if (!state) return;
        if (writing) {
            writeAgain = true;
            return;
        }
        writing = true;
        do {
            writeAgain = false;
            try {
                await state.write(key, entries);
            } catch (err) {
                logger?.warn?.(`Could not save the recent list "${key}"`, err);
            }
        } while (writeAgain);
        writing = false;
    }

    /** A stored entry the list can hold: everything it goes through accepts it. */
    const usable = (entry) => {
        try {
            if (!isValid(entry)) return false;
            identity(entry);
            groupOf(entry);
            return true;
        } catch (err) {
            logger?.warn?.(`Dropped an unreadable entry of the recent list "${key}"`, err);
            return false;
        }
    };

    async function read() {
        let stored;
        try {
            const saved = await state.read(key);
            stored = Array.isArray(saved) ? capped(saved.filter(usable)) : [];
        } catch (err) {
            logger?.warn?.(`Could not read the recent list "${key}"; the stored list is left unchanged until it can be read`, err);
            return false;
        }
        const replay = pending;
        pending = [];
        loaded = true;
        entries = replay.reduce((list, apply) => apply(list), stored);
        if (replay.length > 0) {
            onChange?.();
            void write();
        }
        return true;
    }

    /**
     * Read the stored list. Call it once at startup, before anything lists; a
     * change made while the list is unread calls it again. Once a read has
     * succeeded it does not read again.
     * @returns {Promise<boolean>} Whether the stored list has been read
     */
    function load() {
        if (!state) return Promise.resolve(false);
        if (loaded) return Promise.resolve(true);
        reading ??= read().finally(() => { reading = null; });
        return reading;
    }

    function change(apply) {
        entries = apply(entries);
        onChange?.();
        if (loaded) {
            void write();
            return;
        }
        pending.push(apply);
        void load();
    }

    return Object.freeze({
        load,
        /** @returns {ReadonlyArray<object>} Most recent first */
        list: () => Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
        /** Put an entry at the top, dropping the older one with its identity. */
        add(entry) {
            const stamped = { ...entry, openedAt: Date.now() };
            change((list) => capped([stamped, ...without(list, stamped)]));
        },
        /** Drop the entry with this one's identity. */
        remove(entry) {
            change((list) => without(list, entry));
        },
        clear() {
            change(() => []);
        },
    });
}
