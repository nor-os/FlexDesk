/**
 * ══ THE RECENT-ITEMS STORE ════════════════════════════════════════════════
 *
 *   §1  add, list, remove, clear: most recent first, one per identity, stamped
 *       `openedAt`; list() is frozen copies; every change is written and heard
 *   §2  capacity: over the whole list, or per group so one group never pushes
 *       another out
 *   §3  a stored list is read back; invalid entries are dropped, also one that
 *       makes `identity` throw, and the others survive; a non-array answer is
 *       an empty store
 *   §4  A READ THAT FAILS IS NOT AN EMPTY LIST: nothing is written until a read
 *       succeeds; changes show at once, each asks for the read again, and they
 *       are replayed onto the stored list, which is then written once read
 *   §5  writes run one at a time and the last carries the latest list, whatever
 *       order the host answers in; a failed write is reported and the next runs
 *   §6  a host without `state` keeps the list in memory; load() does not read
 *       again after it has succeeded
 *
 *     node tests/recent_items.test.mjs
 *
 * Needs no DOM.
 */
import { createRecentItems } from '../src/ui/components/recent_items.js';

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond) => check(name, !!cond, true);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A host whose state is a value; `failReads` rejects that many reads. */
function memoryHost(stored = null, { failReads = 0 } = {}) {
    const writes = [];
    const host = {
        reads: 0,
        failReads,
        stored,
        writes,
        state: {
            read: async () => {
                host.reads += 1;
                if (host.failReads > 0) {
                    host.failReads -= 1;
                    throw new Error('unreadable');
                }
                return host.stored;
            },
            write: async (key, value) => {
                writes.push({ key, value });
                host.stored = value;
            },
        },
    };
    return host;
}

const names = (store) => store.list().map((e) => e.id);

console.log('\n§1 add, list, remove, clear');
{
    const host = memoryHost();
    let heard = 0;
    const store = createRecentItems({ host, key: 'recent', onChange: () => { heard += 1; } });
    await store.load();
    store.add({ id: 'a', name: 'A' });
    await tick();
    store.add({ id: 'b', name: 'B' });
    await tick();
    store.add({ id: 'a', name: 'A again' });
    await tick();
    check('most recent first, one per identity', names(store), ['a', 'b']);
    check('the newest copy wins', store.list()[0].name, 'A again');
    ok('stamped openedAt', Number.isFinite(store.list()[0].openedAt));
    ok('list() is frozen', Object.isFrozen(store.list()) && Object.isFrozen(store.list()[0]));
    check('every change was heard', heard, 3);
    check('every change was written, under the key', host.writes.map((w) => w.key), ['recent', 'recent', 'recent']);
    store.remove({ id: 'b' });
    await tick();
    check('remove takes the identity', names(store), ['a']);
    store.clear();
    await tick();
    check('clear empties it', names(store), []);
    check('and the store', host.stored, []);
}

console.log('\n§2 capacity');
{
    const store = createRecentItems({ host: memoryHost(), key: 'k', capacity: 2 });
    await store.load();
    ['a', 'b', 'c'].forEach((id) => store.add({ id }));
    check('the oldest falls off', names(store), ['c', 'b']);

    const grouped = createRecentItems({
        host: memoryHost(),
        key: 'k',
        capacity: 2,
        identity: (e) => `${e.kind}:${e.id}`,
        groupOf: (e) => e.kind,
    });
    await grouped.load();
    grouped.add({ kind: 'x', id: '1' });
    ['2', '3', '4'].forEach((id) => grouped.add({ kind: 'y', id }));
    check('one group does not push another out',
        grouped.list().map((e) => `${e.kind}${e.id}`), ['y4', 'y3', 'x1']);
    const same = createRecentItems({
        host: memoryHost(),
        key: 'k',
        identity: (e) => e.id.replace(/\\/g, '/'),
    });
    await same.load();
    same.add({ id: 'a\\b' });
    same.add({ id: 'a/b' });
    check('identity decides what is the same one', same.list().length, 1);
}

console.log('\n§3 reading back');
{
    const store = createRecentItems({
        host: memoryHost([{ id: 'a' }, null, { nope: 1 }, 'x', { id: 'b' }]),
        key: 'k',
    });
    check('the read answers true', await store.load(), true);
    check('invalid entries are dropped', names(store), ['a', 'b']);

    const custom = createRecentItems({
        host: memoryHost([{ id: 'a', kind: 'good' }, { id: 'b', kind: 'bad' }]),
        key: 'k',
        isValid: (e) => e.kind === 'good',
    });
    await custom.load();
    check('isValid is the caller\'s', names(custom), ['a']);

    const odd = createRecentItems({ host: memoryHost({ not: 'a list' }), key: 'k' });
    check('a non-array is a read', await odd.load(), true);
    check('of an empty store', names(odd), []);
}

console.log('\n§3 an entry that makes identity throw');
{
    const strays = [];
    const onStray = (err) => strays.push(err);
    process.on('unhandledRejection', onStray);
    const identity = (e) => e.path.replace(/\\/g, '/');
    const warned = [];
    const logger = { warn: (words) => warned.push(words) };

    // With the default isValid, which itself calls identity.
    let host = memoryHost([{ name: 'x' }, null, 7, { path: 'C:/keep' }]);
    let store = createRecentItems({ host, key: 'recent', identity, logger });
    check('load answers true', await store.load(), true);
    check('the entry that throws is dropped, the others kept', store.list().map((e) => e.path), ['C:/keep']);
    ok('and it is reported', warned.length >= 1);
    store.add({ path: 'C:/new' });
    await tick();
    check('a later write keeps what was stored', host.stored.map((e) => e.path), ['C:/new', 'C:/keep']);

    // A change before the read: the read runs from inside it, unawaited.
    host = memoryHost([{ name: 'x' }, { path: 'C:/keep' }]);
    store = createRecentItems({ host, key: 'recent', identity });
    store.add({ path: 'C:/new' });
    await tick();
    await tick();
    check('replayed onto what was stored', host.stored.map((e) => e.path), ['C:/new', 'C:/keep']);

    // An isValid that lets it through: identity would throw later, in add.
    host = memoryHost([{ name: 'x' }, { path: 'C:/keep' }]);
    store = createRecentItems({ host, key: 'recent', identity, isValid: (e) => !!e });
    await store.load();
    store.add({ path: 'C:/new' });
    await tick();
    check('a permissive isValid does not let it through', host.stored.map((e) => e.path), ['C:/new', 'C:/keep']);

    // Nor a groupOf that throws.
    host = memoryHost([{ id: 'a' }, { id: 'b', kind: 'k' }]);
    store = createRecentItems({ host, key: 'recent', groupOf: (e) => e.kind.toUpperCase() });
    await store.load();
    check('a groupOf that throws drops the entry', names(store), ['b']);

    await tick();
    check('no unhandled rejection', strays.length, 0);
    process.off('unhandledRejection', onStray);
}

console.log('\n§4 a failed read is not an empty list');
{
    const logged = [];
    const logger = { warn: (msg) => logged.push(msg) };
    const host = memoryHost([{ id: 'stored' }], { failReads: 2 });
    let heard = 0;
    const store = createRecentItems({ host, key: 'k', logger, onChange: () => { heard += 1; } });

    check('the read answers false', await store.load(), false);
    ok('and is reported', logged.length === 1);
    check('no write', host.writes.length, 0);

    store.add({ id: 'new' });
    check('a change shows at once', names(store), ['new']);
    await tick();
    check('it asked for the read again', host.reads, 2);
    check('still no write: the stored list is unread', host.writes.length, 0);
    check('the stored list is untouched', host.stored, [{ id: 'stored' }]);

    store.add({ id: 'newer' });
    await tick();
    await tick();
    check('the next change read it', host.reads, 3);
    check('the changes are replayed onto the stored list', names(store), ['newer', 'new', 'stored']);
    check('and written, once', host.writes.length, 1);
    check('with the stored entry in it', host.stored.map((e) => e.id), ['newer', 'new', 'stored']);
    check('each change was heard, and the replay', heard, 3);

    const removing = memoryHost([{ id: 'a' }, { id: 'b' }], { failReads: 1 });
    const store2 = createRecentItems({ host: removing, key: 'k' });
    await store2.load();
    store2.remove({ id: 'a' });
    await tick();
    await tick();
    check('a remove is replayed too', names(store2), ['b']);
    check('and reaches the store', removing.stored.map((e) => e.id), ['b']);

    const clearing = memoryHost([{ id: 'a' }], { failReads: 1 });
    const store3 = createRecentItems({ host: clearing, key: 'k' });
    await store3.load();
    store3.clear();
    await tick();
    await tick();
    check('and a clear', clearing.stored, []);
}

console.log('\n§5 writes run one at a time');
{
    const started = [];
    const settle = [];
    const logged = [];
    const host = {
        state: {
            read: async () => [],
            write: (key, value) => {
                started.push(value.map((e) => e.id));
                return new Promise((resolve, reject) => settle.push({ resolve, reject }));
            },
        },
    };
    const store = createRecentItems({ host, key: 'k', logger: { warn: (m) => logged.push(m) } });
    await store.load();
    store.add({ id: 'a' });
    store.add({ id: 'b' });
    store.add({ id: 'c' });
    check('one write in flight', started, [['a']]);
    settle[0].reject(new Error('disk full'));
    await tick();
    ok('a failed write is reported', logged.length === 1);
    check('the next carries the latest list, and only it', started, [['a'], ['c', 'b', 'a']]);
    settle[1].resolve();
    await tick();
    check('nothing more to write', started.length, 2);
    store.add({ id: 'd' });
    check('and it writes again afterwards', started.length, 3);
    settle[2].resolve();
    await tick();
}

console.log('\n§6 no state; load is once');
{
    const store = createRecentItems({ host: {}, key: 'k' });
    check('no state: load answers false', await store.load(), false);
    store.add({ id: 'a' });
    check('and the list lives in memory', names(store), ['a']);

    const host = memoryHost([{ id: 'a' }]);
    const once = createRecentItems({ host, key: 'k' });
    await once.load();
    once.add({ id: 'b' });
    check('a second load answers true', await once.load(), true);
    check('without reading again', host.reads, 1);
    check('so it cannot overwrite a change', names(once), ['b', 'a']);
}

if (failures) {
    console.error(`\nrecent items: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
