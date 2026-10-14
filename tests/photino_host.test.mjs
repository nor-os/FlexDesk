/**
 * ══ THE PHOTINO HOST, AGAINST A FAKE window.external ══
 *
 * A Photino page reaches its window only through `window.external.sendMessage`
 * and `receiveMessage`. The fake here records what the page sends and lets the
 * test answer, out of order, wrongly, or not at all — the cases a real window
 * would make hard to provoke.
 *
 *   §1  outside Photino it is NULL_HOST
 *   §2  the wire: {id, cap, op, args} out, the matching {id, ok, value} back
 *   §3  ok:false, timeouts, unknown ids, junk, events
 *   §4  the capabilities degrade the way pywebview_host's do (saveFile → null)
 *   §5  an embedder replaces or leaves out a capability
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/photino_host.test.mjs
 *     node tests/run.mjs
 *
 * No DOM. It imports `../src/host/` directly, never `dist/`.
 */

import { NULL_HOST } from '../src/host/host.js';
import { createPhotinoHost, createPhotinoTransport, isPhotinoWindow } from '../src/host/photino_host.js';

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const quiet = { warn() {} };

/** A Photino bridge whose replies the test writes. */
function fakeExternal() {
    const sent = [];
    let listener = null;
    return {
        sent,
        sendMessage(text) { sent.push(JSON.parse(text)); },
        receiveMessage(fn) { listener = fn; },
        reply(obj) { listener(typeof obj === 'string' ? obj : JSON.stringify(obj)); },
        last() { return sent[sent.length - 1]; },
    };
}
/** Answers every request with `answer(req)` → reply fields. */
function autoExternal(answer) {
    const ext = fakeExternal();
    const send = ext.sendMessage;
    ext.sendMessage = (text) => {
        send(text);
        const req = ext.last();
        const r = answer(req);
        if (r !== undefined) queueMicrotask(() => ext.reply({ id: req.id, ...r }));
    };
    return ext;
}

console.log('\nhost: the Photino adapter\n');

// ════════════════════════════════════════════════════════════════════════
// 1. OUTSIDE PHOTINO
// ════════════════════════════════════════════════════════════════════════
check('no window.external at all → NULL_HOST', createPhotinoHost() === NULL_HOST, true);
check('a browser\'s window.external (no sendMessage) → NULL_HOST',
      createPhotinoHost({ external: { AddSearchProvider() {} } }) === NULL_HOST, true);
check('isPhotinoWindow needs both halves', [isPhotinoWindow({ sendMessage() {} }), isPhotinoWindow(fakeExternal())], [false, true]);

// ════════════════════════════════════════════════════════════════════════
// 2. THE WIRE
// ════════════════════════════════════════════════════════════════════════
{
    const ext = fakeExternal();
    const { call } = createPhotinoTransport({ external: ext, logger: quiet });
    const a = call('window', 'isMaximized');
    const b = call('window', 'setBounds', { x: 1, y: 2, width: 300, height: 200 });
    check('requests carry id, cap, op and positional args', ext.sent,
          [{ id: 1, cap: 'window', op: 'isMaximized', args: [] },
           { id: 2, cap: 'window', op: 'setBounds', args: [{ x: 1, y: 2, width: 300, height: 200 }] }]);
    ext.reply({ id: 2, ok: true, value: null });          // out of order
    ext.reply({ id: 1, ok: true, value: true });
    check('replies resolve the request with the same id', [await a, await b], [true, null]);
}

// ════════════════════════════════════════════════════════════════════════
// 3. WHEN IT GOES WRONG
// ════════════════════════════════════════════════════════════════════════
{
    const ext = fakeExternal();
    const events = [];
    const t = createPhotinoTransport({ external: ext, timeoutMs: 30, logger: quiet, onEvent: (n, v) => events.push([n, v]) });
    const refused = t.call('window', 'bogus');
    ext.reply({ id: 1, ok: false, error: 'unknown request window.bogus' });
    let err = null;
    try { await refused; } catch (e) { err = e; }
    check('ok:false rejects with the host\'s error', err && err.message, 'unknown request window.bogus');

    const silent = t.call('window', 'isFullscreen');
    err = null;
    try { await silent; } catch (e) { err = e; }
    ok('no reply rejects after the timeout', err && /no answer/.test(err.message), String(err));
    check('…and is no longer pending', t.pending(), 0);

    ext.reply({ id: 99, ok: true, value: 1 });
    ext.reply('not json {');
    ext.reply({ hello: 'world' });
    ext.reply({ event: 'window.maximizedChanged', value: true });
    check('unknown ids and junk are dropped; events reach onEvent', events, [['window.maximizedChanged', true]]);

    const late = t.call('window', 'isMaximized');
    ext.reply({ id: 2, ok: true, value: true });             // the timed-out request answering late
    ext.reply({ id: 3, ok: true, value: false });
    check('a late reply to a timed-out id cannot answer a newer request', await late, false);
}
{
    const ext = fakeExternal();
    ext.sendMessage = () => { throw new Error('bridge gone'); };
    const { call } = createPhotinoTransport({ external: ext, logger: quiet });
    let err = null;
    try { await call('window', 'close'); } catch (e) { err = e; }
    check('a send that throws rejects', err && err.message, 'bridge gone');
}

// ════════════════════════════════════════════════════════════════════════
// 4. THE CAPABILITIES
// ════════════════════════════════════════════════════════════════════════
{
    const store = {};
    const ext = autoExternal((req) => {
        const k = `${req.cap}.${req.op}`;
        if (k === 'window.isMaximized') return { ok: true, value: true };
        if (k === 'window.getBounds') return { ok: true, value: { x: 10, y: 20, width: 800, height: 600, extra: 1 } };
        if (k === 'window.setMaximized') return { ok: true, value: req.args[0] };
        if (k === 'dialogs.saveFile') return { ok: true, value: { ok: true, path: 'C:/x/' + req.args[0].filename } };
        if (k === 'state.write') { store[req.args[0]] = req.args[1]; return { ok: true, value: true }; }
        if (k === 'state.read') return { ok: true, value: store[req.args[0]] ?? null };
        return { ok: false, error: `unknown request ${k}` };
    });
    const host = createPhotinoHost({ external: ext, logger: quiet });
    check('all three capabilities', Object.keys(host).sort(), ['dialogs', 'state', 'window']);
    check('chrome() is native when describe is refused', await host.window.chrome(), 'native');
    check('isMaximized', await host.window.isMaximized(), true);
    check('setMaximized answers the new state', await host.window.setMaximized(1), true);
    check('getBounds keeps x, y, width, height', await host.window.getBounds(), { x: 10, y: 20, width: 800, height: 600 });
    check('isFullscreen refused → false', await host.window.isFullscreen(), false);

    const before = ext.sent.length;
    const r = host.window.setBounds({ width: 1200 });
    check('setBounds is fire-and-forget', r, undefined);
    check('…and sends one object with nulls for what it leaves alone', ext.sent[before].args, [{ x: null, y: null, width: 1200, height: null }]);
    host.window.minimize();
    await tick(); await tick();                          // the refusal must not surface as an unhandled rejection

    check('saveFile resolves with the host\'s {ok, path}',
          await host.dialogs.saveFile({ data: 'a,b', filename: 'rows.csv', kind: 'csv' }), { ok: true, path: 'C:/x/rows.csv' });
    check('…sending {data, filename, kind} as its one arg', ext.last().args, [{ data: 'a,b', filename: 'rows.csv', kind: 'csv' }]);

    check('state.write', await host.state.write('desktops', { a: 1 }), true);
    check('state.read gets the value back', await host.state.read('desktops'), { a: 1 });
    check('state.read of a missing key', await host.state.read('nope'), null);
}
{
    const refusing = createPhotinoHost({ external: autoExternal(() => ({ ok: false, error: 'no' })), logger: quiet });
    check('saveFile refused → null (the caller downloads instead)', await refusing.dialogs.saveFile({ data: 'x', filename: 'a.csv', kind: 'csv' }), null);
    check('getBounds refused → null', await refusing.window.getBounds(), null);
    check('state.write refused → false', await refusing.state.write('k', 1), false);
    const slowExt = fakeExternal();
    const slow = createPhotinoHost({ external: slowExt, timeoutMs: 20, logger: quiet });
    let settled = false;
    const saving = slow.dialogs.saveFile({ data: 'x', filename: 'a.csv', kind: 'csv' }).then((r) => { settled = true; return r; });
    await new Promise((r) => setTimeout(r, 60));
    check('saveFile does not time out while the dialog is open (no second download behind it)', settled, false);
    slowExt.reply({ id: slowExt.last().id, ok: true, value: { ok: true, path: '/tmp/a.csv' } });
    check('…and resolves when the user is done', await saving, { ok: true, path: '/tmp/a.csv' });
    const cancelled = createPhotinoHost({ external: autoExternal(() => ({ ok: true, value: { ok: false, cancelled: true } })), logger: quiet });
    check('a cancelled save passes through as {ok:false, cancelled:true}',
          await cancelled.dialogs.saveFile({ data: 'x', filename: 'a.csv', kind: 'csv' }), { ok: false, cancelled: true });
}

// ════════════════════════════════════════════════════════════════════════
// 5. THE EMBEDDER'S OWN CAPABILITIES
// ════════════════════════════════════════════════════════════════════════
{
    const mine = { read: async () => 'server', write: async () => true };
    const host = createPhotinoHost({ external: fakeExternal(), state: mine, logger: quiet });
    check('a passed capability replaces the Photino one', await host.state.read('x'), 'server');
    const noState = createPhotinoHost({ external: fakeExternal(), state: null, logger: quiet });
    check('null leaves it out', Object.keys(noState).sort(), ['dialogs', 'window']);
    let threw = false;
    try { createPhotinoHost({ external: fakeExternal(), dialogs: {} }); } catch { threw = true; }
    check('an incomplete replacement is still refused at boot', threw, true);
}

// ── §6 native or custom chrome, and gestures handed to the OS ───────────
{
    const answer = (frame) => autoExternal((req) => {
        const k = `${req.cap}.${req.op}`;
        if (k === 'host.describe') return { ok: true, value: frame === undefined ? { host: 'photino' } : { host: 'photino', frame } };
        if (k === 'window.startDrag' || k === 'window.startResize') return { ok: true, value: null };
        return { ok: false, error: `unknown request ${k}` };
    });
    const ext = answer('custom');
    const host = createPhotinoHost({ external: ext, logger: quiet });
    check('nothing is asked before chrome() is needed', ext.sent.length, 0);
    check('frame: "custom" → custom', await host.window.chrome(), 'custom');
    check('…asked once, with host.describe', ext.sent.map((m) => `${m.cap}.${m.op}`), ['host.describe']);
    check('…and remembered: a string from then on, no second ask', [host.window.chrome(), ext.sent.length], ['custom', 1]);
    check('frame: "native" → native', await createPhotinoHost({ external: answer('native'), logger: quiet }).window.chrome(), 'native');
    check('no frame field → native', await createPhotinoHost({ external: answer(undefined), logger: quiet }).window.chrome(), 'native');
    check('an unknown value → native', await createPhotinoHost({ external: answer('fancy'), logger: quiet }).window.chrome(), 'native');

    const fixed = fakeExternal();
    const pinned = createPhotinoHost({ external: fixed, chrome: 'custom', logger: quiet });
    check('chrome: "custom" answers without asking', [pinned.window.chrome(), fixed.sent.length], ['custom', 0]);
    check('chrome: "native" too', createPhotinoHost({ external: fakeExternal(), chrome: 'native', logger: quiet }).window.chrome(), 'native');

    check('startNativeDrag → true when the host ran the drag', await host.window.startNativeDrag(), true);
    check('startNativeResize sends its edge', [await host.window.startNativeResize('se'), ext.last().op, ext.last().args], [true, 'startResize', ['se']]);
    const refusing = createPhotinoHost({ external: autoExternal(() => ({ ok: false, error: 'no' })), logger: quiet });
    check('a refused drag → false (the caller moves the window from JS)', await refusing.window.startNativeDrag(), false);
    check('a refused resize → false', await refusing.window.startNativeResize('n'), false);

    // The gesture waits for mouse-up, however long: no timeout.
    const slow = fakeExternal();
    const sh = createPhotinoHost({ external: slow, timeoutMs: 20, logger: quiet });
    let done = null;
    sh.window.startNativeDrag().then((v) => { done = v; });
    await new Promise((r) => setTimeout(r, 60));
    check('a drag still in progress after the timeout is not given up', done, null);
    slow.reply({ id: slow.last().id, ok: true, value: null });
    await tick();
    check('…and resolves when the host answers', done, true);
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
