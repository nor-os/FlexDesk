/**
 * ══ getEditorFactory() SETTLES ON A FAILED MONACO LOAD (BUG-0023) ══
 *
 * `getEditorFactory()` used to call `initMonaco()` without awaiting it and then
 * await `monacoReady` — a promise with no reject path. So:
 *
 *   - with no `setMonacoBasePath()`, initMonaco's "needs the path" error became
 *     an unhandled rejection and `getEditorFactory()` pended forever;
 *   - with a wrong path, loader.js 404'd, the same thing happened, and the
 *     "already started" flag — set BEFORE loader.js loaded — made every later
 *     call a no-op, so even a corrected path could never load Monaco.
 *
 * This suite pins the fix: each failure REJECTS `getEditorFactory()` with the
 * loader's own error and nothing is left unhandled. A loader.js failure can be
 * retried; an AMD-level failure cannot, because Monaco's AMD loader caches it —
 * one loader instance is kept from §3 on, as on a real page, and §4 shows that
 * a corrected path still gets the first error. (monaco_loader_retry.test.mjs
 * shows the loader.js retry succeeding.)
 */
import { installPage, amdLoader, tick, settle, checker, fakeMonaco } from './monaco_env.mjs';

const { ok, finish } = checker();
const { scripts, lastScript } = installPage();

const { getEditorFactory, setMonacoBasePath, initMonaco, monacoReady }
    = await import('../editor.js');

// ══ 1. NO BASE PATH: REJECTS WITH THE DOCUMENTED ERROR ══════════════════
console.log('1. no setMonacoBasePath()');
{
    const r = await settle(getEditorFactory());
    ok('getEditorFactory() rejects instead of pending', r.state === 'rejected', `state: ${r.state}`);
    ok('with initMonaco()\'s "needs the path" error',
       /initMonaco\(\) needs the path to your copy of Monaco/.test(r.error?.message ?? ''),
       r.error?.message);
    ok('no script was injected', scripts().length === 0);
}

// ══ 2. WRONG PATH: loader.js FAILS -> REJECTS ═══════════════════════════
console.log('2. loader.js fails to load');
setMonacoBasePath('wrong/monaco');
{
    const p = getEditorFactory();
    const again = getEditorFactory();
    ok('concurrent callers share one attempt', p === again);
    await tick();
    ok('one loader.js tag injected', scripts().length === 1, `scripts: ${scripts().length}`);
    ok('from the configured path', lastScript()?.src === 'wrong/monaco/vs/loader.js', lastScript()?.src);
    lastScript().onerror();
    const r = await settle(p);
    ok('getEditorFactory() rejects', r.state === 'rejected', `state: ${r.state}`);
    ok('naming the loader that failed',
       /Failed to load Monaco loader: wrong\/monaco\/vs\/loader\.js/.test(r.error?.message ?? ''),
       r.error?.message);
    ok('the dead tag is removed', lastScript().removed === true);
}

// ══ 3. RETRY: loader.js LOADS, vs/editor/editor.main FAILS IN THE AMD LOADER ═
// `partial/monaco` has vs/loader.js but not the editor (an incomplete copy);
// `good/monaco` has both.
console.log('3. retry; vs/editor/editor.main fails in the AMD loader');
setMonacoBasePath('partial/monaco');
const amd = amdLoader((url) => (url.startsWith('partial/')
    ? new Error(`Script error for ${url}`)
    : () => { globalThis.monaco = fakeMonaco(); return globalThis.monaco; }));
let firstError;
{
    const p = getEditorFactory();
    await tick();
    ok('the retry injects a fresh loader.js tag', scripts().length === 2, `scripts: ${scripts().length}`);
    ok('from the new path', lastScript()?.src === 'partial/monaco/vs/loader.js', lastScript()?.src);
    globalThis.require = amd;           // what Monaco's loader.js does when it runs
    lastScript().onload();
    const r = await settle(p);
    firstError = r.error;
    ok('getEditorFactory() rejects on the AMD errback', r.state === 'rejected', `state: ${r.state}`);
    ok('with a message naming where it looked',
       /Failed to load Monaco from partial\/monaco\/vs: Script error for partial\/monaco\/vs\/editor\/editor\.main\.js/
           .test(r.error?.message ?? ''),
       r.error?.message);
    ok('and saying it is final for the page',
       /final for this page: fix the path and reload/.test(r.error?.message ?? ''), r.error?.message);
}

// ══ 4. AN AMD-LEVEL FAILURE IS FINAL: A CORRECTED PATH STILL REJECTS ═════
console.log('4. corrected path after an AMD failure: still the first error');
setMonacoBasePath('good/monaco');
{
    const callsBefore = amd.calls.length;
    const r = await settle(getEditorFactory());
    ok('getEditorFactory() rejects again', r.state === 'rejected', `state: ${r.state}`);
    ok('with the SAME first error', r.error === firstError, r.error?.message);
    ok('no new loader.js tag, and window.require is still the same AMD loader',
       scripts().length === 2 && globalThis.require === amd, `scripts: ${scripts().length}`);
    ok('the AMD loader is not asked again', amd.calls.length === callsBefore,
       `calls: ${callsBefore} -> ${amd.calls.length}`);
    const direct = await settle(initMonaco('good/monaco'));
    ok('initMonaco(correctedPath) rejects with it too', direct.error === firstError, direct.error?.message);
    ok('monacoReady stays pending', (await settle(monacoReady, 50)).state === 'pending');

    // Why a retry could not help: the same loader instance, even reconfigured
    // to the good path, replays its cached failure.
    amd.config({ paths: { vs: 'good/monaco/vs' } });
    const cached = await settle(new Promise((res, rej) => amd(['vs/editor/editor.main'], res, rej)));
    ok('the AMD loader itself replays the cached failure after a path correction',
       cached.state === 'rejected' && /partial\/monaco/.test(cached.error?.message ?? ''),
       `${cached.state} ${cached.error?.message ?? ''}`);
}

await finish('monaco_loader_failure');
