/**
 * ══ getEditorFactory() SETTLES, AND A FAILED LOAD CAN BE RETRIED (BUG-0023) ══
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
 * loader's own error, nothing is left unhandled, and the next call starts a
 * fresh attempt that can succeed.
 *
 * No jsdom: the loader touches exactly `document.head.appendChild`,
 * `document.createElement` and `document.getElementById`, and the test fires
 * each script's `onload` / `onerror` itself — that is what makes the failure
 * deterministic.
 */

let failures = 0;
const ok = (what, cond, detail = '') => {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
};

const unhandled = [];
process.on('unhandledRejection', (reason) => { unhandled.push(reason); });

// ── a DOM just big enough ────────────────────────────────────────────────
const appended = [];
const byId = new Map();
function makeNode(tag) {
    const attrs = {};
    return {
        tag,
        set id(v) { attrs.id = v; byId.set(v, this); },
        get id() { return attrs.id; },
        set href(v) { attrs.href = v; },
        get href() { return attrs.href; },
        getAttribute(k) { return attrs[k]; },
        setAttribute(k, v) { attrs[k] = v; },
        remove() { this.removed = true; },
    };
}
globalThis.window = globalThis;
globalThis.document = {
    head: { appendChild(node) { appended.push(node); } },
    createElement: (tag) => makeNode(tag),
    getElementById: (id) => byId.get(id) ?? null,
};
delete globalThis.require;
delete globalThis.monaco;

const scripts = () => appended.filter((n) => n.tag === 'script');
const lastScript = () => scripts().at(-1);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Settles within `ms`, or reports that it did not — the old bug was a hang. */
async function settle(promise, ms = 500) {
    let timer;
    const timeout = new Promise((r) => { timer = setTimeout(() => r({ state: 'pending' }), ms); });
    const result = await Promise.race([
        promise.then((value) => ({ state: 'fulfilled', value }),
                     (error) => ({ state: 'rejected', error })),
        timeout,
    ]);
    clearTimeout(timer);
    return result;
}

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

// ══ 3. A LATER CALL RETRIES — AND AN AMD ERROR ALSO REJECTS ═════════════
console.log('3. retry; vs/editor/editor.main fails in the AMD loader');
{
    const p = getEditorFactory();
    await tick();
    ok('the retry injects a fresh loader.js tag', scripts().length === 2, `scripts: ${scripts().length}`);
    // loader.js "loads" and installs an AMD require whose module load fails.
    let configured = null;
    globalThis.require = Object.assign(
        (deps, onLoad, onError) => { setTimeout(() => onError(new Error('Script error for vs/editor/editor.main'))); },
        { config(c) { configured = c; } });
    lastScript().onload();
    const r = await settle(p);
    ok('AMD require configured with the base path', configured?.paths?.vs === 'wrong/monaco/vs',
       JSON.stringify(configured));
    ok('getEditorFactory() rejects on the AMD errback', r.state === 'rejected', `state: ${r.state}`);
    ok('with a message naming where it looked',
       /Failed to load Monaco from wrong\/monaco\/vs: Script error/.test(r.error?.message ?? ''),
       r.error?.message);
}

// ══ 4. CORRECTED PATH: THE NEXT CALL SUCCEEDS ═══════════════════════════
console.log('4. corrected path loads');
setMonacoBasePath('good/monaco');
{
    const themes = [];
    const fakeMonaco = { editor: { defineTheme: (name) => themes.push(name), setTheme() {} } };
    let configured = null;
    globalThis.require = Object.assign(
        (deps, onLoad) => { setTimeout(() => { globalThis.monaco = fakeMonaco; onLoad(); }); },
        { config(c) { configured = c; } });
    const r = await settle(getEditorFactory());
    ok('getEditorFactory() resolves', r.state === 'fulfilled', `state: ${r.state} ${r.error?.message ?? ''}`);
    ok('with a factory over the loaded monaco', r.value?.monaco === fakeMonaco);
    ok('AMD paths point at the corrected base', configured?.paths?.vs === 'good/monaco/vs');
    ok('the stylesheet follows the corrected path',
       byId.get('monaco-editor-css')?.getAttribute('href') === 'good/monaco/vs/editor/editor.main.css',
       byId.get('monaco-editor-css')?.getAttribute('href'));
    ok('monacoReady resolved too', (await settle(monacoReady)).value === fakeMonaco);
    ok('the singleton is reused', (await getEditorFactory()) === r.value);
    ok('initMonaco() is idempotent after success', (await initMonaco('other/path')) === fakeMonaco);
}

await tick();
ok('no unhandled rejection anywhere', unhandled.length === 0,
   unhandled.map((e) => e?.message ?? String(e)).join(' | '));

if (failures) {
    console.log(`monaco_loader_failure: ${failures} FAILED`);
    process.exit(1);
}
console.log('monaco_loader_failure: all passed');
