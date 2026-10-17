/**
 * ══ A loader.js FAILURE IS RETRIED, AND getEditorFactory() SHARES A LOAD THE
 *    CONSUMER STARTED (BUG-0023) ══
 *
 * Two flows the failure suite does not cover:
 *
 *   - after `vs/loader.js` 404s, the next call with a corrected path loads
 *     Monaco — nothing of the failed attempt is left to block it;
 *   - a consumer that calls `initMonaco(path)` itself (the documented "call
 *     once when the page initialises" entry point) and never calls
 *     `setMonacoBasePath()` gets a resolving `getEditorFactory()`, both while
 *     that load is in flight and after it has succeeded. initMonaco() returns
 *     the existing attempt BEFORE it asks for a path.
 */
import { installPage, amdLoader, tick, settle, checker, fakeMonaco } from './monaco_env.mjs';

const { ok, finish } = checker();
const { byId, scripts, lastScript } = installPage();

const { getEditorFactory, initMonaco, monacoReady } = await import('../editor.js');

// ══ 1. initMonaco(wrongPath): loader.js 404s ══════════════════════════════
console.log('1. initMonaco() with a wrong path: loader.js fails');
{
    const p = initMonaco('wrong/monaco');
    await tick();
    ok('one loader.js tag', scripts().length === 1 && lastScript().src === 'wrong/monaco/vs/loader.js',
       lastScript()?.src);
    lastScript().onerror();
    const r = await settle(p);
    ok('initMonaco() rejects', r.state === 'rejected', `state: ${r.state}`);
    ok('naming the loader that failed', /Failed to load Monaco loader: wrong\/monaco/.test(r.error?.message ?? ''),
       r.error?.message);
    const noPath = await settle(getEditorFactory());
    ok('getEditorFactory() with no path and no live attempt rejects with "needs the path"',
       /needs the path/.test(noPath.error?.message ?? ''), noPath.error?.message);
}

// ══ 2. initMonaco(goodPath) IN FLIGHT, getEditorFactory() WITHOUT setMonacoBasePath ═
console.log('2. initMonaco(path), then getEditorFactory() with no setMonacoBasePath()');
const monaco = fakeMonaco();
const amd = amdLoader((url) => (url === 'vendor/monaco/vs/editor/editor.main.js'
    ? () => { globalThis.monaco = monaco; return monaco; }
    : new Error(`Script error for ${url}`)));
let factory;
{
    const p = initMonaco('vendor/monaco');
    ok('initMonaco() returns the same promise to a second caller', initMonaco('vendor/monaco') === p);
    ok('...and to a caller with no path', initMonaco() === p);
    const f = getEditorFactory();
    await tick();
    ok('the retry injects one fresh loader.js tag', scripts().length === 2, `scripts: ${scripts().length}`);
    ok('from the consumer\'s path', lastScript().src === 'vendor/monaco/vs/loader.js', lastScript().src);
    globalThis.require = amd;
    lastScript().onload();
    const r = await settle(p);
    ok('initMonaco() resolves with monaco', r.state === 'fulfilled' && r.value === monaco,
       `${r.state} ${r.error?.message ?? ''}`);
    const fr = await settle(f);
    ok('getEditorFactory() started in flight resolves', fr.state === 'fulfilled',
       `${fr.state} ${fr.error?.message ?? ''}`);
    ok('with a factory over the loaded monaco', fr.value?.monaco === monaco);
    ok('the AMD loader was asked once', amd.calls.length === 1, `calls: ${amd.calls.length}`);
    ok('the stylesheet follows the corrected path',
       byId.get('monaco-editor-css')?.getAttribute('href') === 'vendor/monaco/vs/editor/editor.main.css',
       byId.get('monaco-editor-css')?.getAttribute('href'));
    ok('monacoReady resolved', (await settle(monacoReady)).value === monaco);
    factory = fr.value;
}

// ══ 3. AFTER SUCCESS ═════════════════════════════════════════════════════
console.log('3. after success');
{
    const r = await settle(getEditorFactory());
    ok('getEditorFactory() still resolves, to the same singleton', r.value === factory,
       `${r.state} ${r.error?.message ?? ''}`);
    ok('initMonaco() with no path resolves with monaco', (await settle(initMonaco())).value === monaco);
    ok('initMonaco(otherPath) is a no-op returning monaco', (await settle(initMonaco('other/path'))).value === monaco);
    ok('nothing further was injected or required', scripts().length === 2 && amd.calls.length === 1);
}

await finish('monaco_loader_retry');
