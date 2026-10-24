/**
 * ══ MONACO'S ASYNCHRONOUS 'Canceled' NEVER REACHES THE PAGE; NOTHING ELSE IS
 *    HIDDEN (BUG-0038) ══
 *
 * Monaco's WordHighlighter starts a 50 ms Delayer when an editor gets focus and
 * never catches its promise. Dispose the editor inside those 50 ms and
 * `Delayer.dispose() -> cancel()` rejects it with a CancellationError (name and
 * message both 'Canceled'). `safeDispose` only catches what `dispose()` throws
 * synchronously, so the browser reported an uncaught 'Canceled' — in EcoSim on
 * every Edit > Undo after a Monaco edit.
 *
 * initMonaco() now installs ONE window 'unhandledrejection' listener that calls
 * preventDefault() for exactly that error. This suite dispatches the event a
 * browser would (a cancelable 'unhandledrejection' carrying `reason`) and checks:
 *
 *   - a Monaco-like CancellationError is prevented;
 *   - an unrelated rejection, and near-misses (right message but wrong name,
 *     right name but wrong message, a bare string), are NOT;
 *   - the listener is installed once, however often initMonaco() is called,
 *     including across a failed loader.js attempt and its retry.
 *
 * Node has no PromiseRejectionEvent, and the stand-in page has no event target,
 * so the window gets a real EventTarget and the event is a cancelable Event with
 * `reason` and `promise` set, as PromiseRejectionEvent has them.
 */
import { installPage, amdLoader, tick, settle, checker, fakeMonaco } from './monaco_env.mjs';

const { ok, finish } = checker();
const { lastScript } = installPage();

// A real event target for the stand-in window, counting the listeners added.
const target = new EventTarget();
const added = [];
globalThis.addEventListener = (type, fn, opts) => {
    added.push(type);
    target.addEventListener(type, fn, opts);
};
globalThis.removeEventListener = (type, fn, opts) => target.removeEventListener(type, fn, opts);
globalThis.dispatchEvent = (event) => target.dispatchEvent(event);
const guards = () => added.filter((t) => t === 'unhandledrejection').length;

/** What Monaco's `vs/base/common/errors` CancellationError looks like. */
class CancellationError extends Error {
    constructor() { super('Canceled'); this.name = 'Canceled'; }
}

/** The event a browser dispatches on window for an unhandled rejection. */
function rejectionEvent(reason) {
    const event = new Event('unhandledrejection', { cancelable: true });
    const promise = Promise.reject(reason);
    promise.catch(() => {});        // this suite's own promise must not go unhandled
    Object.defineProperty(event, 'reason', { value: reason });
    Object.defineProperty(event, 'promise', { value: promise });
    return event;
}

/** @returns {boolean} whether a listener called preventDefault() */
function dispatchRejection(reason) {
    const event = rejectionEvent(reason);
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

const { initMonaco } = await import('../editor.js');

// ══ 1. BEFORE MONACO LOADS, NOTHING IS INSTALLED ═════════════════════════
console.log('1. importing the editor installs no listener');
ok('no unhandledrejection listener yet', guards() === 0, `listeners: ${guards()}`);

// ══ 2. A FAILED loader.js ATTEMPT, THEN A RETRY THAT LOADS ═══════════════
console.log('2. initMonaco(): a failed attempt and a retry install one listener');
{
    const bad = initMonaco('wrong/monaco');
    await tick();
    lastScript().onerror();
    ok('the failed attempt rejects', (await settle(bad)).state === 'rejected');

    const monaco = fakeMonaco();
    const amd = amdLoader((url) => (url === 'vendor/monaco/vs/editor/editor.main.js'
        ? () => { globalThis.monaco = monaco; return monaco; }
        : new Error(`Script error for ${url}`)));
    const good = initMonaco('vendor/monaco');
    initMonaco();
    await tick();
    globalThis.require = amd;
    lastScript().onload();
    ok('the retry loads monaco', (await settle(good)).value === monaco);
    initMonaco('other/path');
    ok('exactly one unhandledrejection listener', guards() === 1, `listeners: ${guards()}`);
}

// ══ 3. MONACO'S CANCELLATION IS PREVENTED ════════════════════════════════
console.log("3. Monaco's asynchronous CancellationError");
ok("a CancellationError (name and message 'Canceled') is prevented",
   dispatchRejection(new CancellationError()) === true);
{
    // The shape it arrives in from Monaco's bundle: a plain Error renamed.
    const e = new Error('Canceled');
    e.name = 'Canceled';
    ok('so is a plain Error named and messaged "Canceled"', dispatchRejection(e) === true);
}

// ══ 4. EVERY OTHER REJECTION STILL SURFACES ══════════════════════════════
console.log('4. other rejections are left alone');
ok('an unrelated Error is not prevented', dispatchRejection(new Error('boom')) === false);
ok('an Error whose message is "Canceled" but name is "Error" is not prevented',
   dispatchRejection(new Error('Canceled')) === false);
{
    const e = new Error('Canceled: user aborted');
    e.name = 'Canceled';
    ok('a "Canceled" error with another message is not prevented', dispatchRejection(e) === false);
}
{
    const e = new Error('Canceled');
    e.name = 'AbortError';
    ok('an AbortError is not prevented', dispatchRejection(e) === false);
}
ok('a bare string "Canceled" is not prevented', dispatchRejection('Canceled') === false);
ok('an undefined reason is not prevented', dispatchRejection(undefined) === false);
ok('a null reason is not prevented', dispatchRejection(null) === false);

await finish('monaco_cancellation_guard');
