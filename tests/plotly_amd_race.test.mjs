/**
 * ══ PLOTLY vs AN AMD LOADER, IN BOTH DIRECTIONS ════════════════════════
 *
 * `ensurePlotly()` has to stop Plotly's UMD header taking its AMD branch, or
 * Plotly registers as an anonymous module nothing calls back and `window.Plotly`
 * is never set. The obvious way is to hide `window.define` for the length of the
 * load. Plotly is 4.4 MB, so "the length of the load" is a long window, and
 * hiding a global for it breaks the page two different ways. Both were reported
 * from a running deployment on 2026-08-31, minutes apart:
 *
 *   1. `window.define = undefined`, restored on load. Monaco's `loader.js`
 *      installs an AMD loader INSIDE the window, Plotly's header sees it, and:
 *          This chart could not be drawn: Plotly.js loaded but Plotly global
 *          not found
 *      — true, unhelpful, and it sends the reader hunting for a missing file
 *      that is being served correctly (that deployment's `plotly.min.js`
 *      answered 200 with 4,558,696 bytes of exactly the right content).
 *
 *   2. The mirror. Monaco loads in TWO stages: `loader.js` sets `define`,
 *      `editor.main.js` arrives later and CALLS it. Land stage two inside the
 *      window and it finds `undefined`:
 *          editor.main.js:5 Uncaught TypeError: globalDefine is not a function
 *
 * Serialising the two loaders does not fix it — Monaco's second stage is fetched
 * on demand and can land at any moment. The requirements only look
 * contradictory: Plotly asks exactly one question, `typeof define === 'function'
 * && define.amd`, so `define` may stay CALLABLE as long as `amd` is withheld.
 * Monaco needs it callable and does not need `amd` to call it.
 *
 * So the guard masks the PROPERTY, not the function. §1 covers both races in one
 * timeline. §2 keeps the genuine failure genuine. §3-§5 are the D6 half — the
 * pre-existing behaviour pinned, because an additive change that quietly alters
 * the ordinary path is not an additive change.
 */

let failures = 0;
const ok = (what, cond, detail = '') => {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
};

/** A DOM small enough to be honest about what the loader actually touches:
 *  it creates one script, sets `src`/`async`, and appends it to `document.head`.
 *  `onload` is fired by the test, which is what makes the window controllable.
 *
 *  `fetch` is deleted rather than left alone: Node has shipped a global `fetch`
 *  since v18, and calling it with a relative URL rejects ASYNCHRONOUSLY (a real
 *  URL-parse attempt), one or more microtasks after `ensurePlotly()` returns.
 *  §1–§5 below assert on the FALLBACK path — the masked-`define` script tag —
 *  and its whole contract is that the tag exists the instant `ensurePlotly()`
 *  returns; a stray ambient `fetch` pushes that append behind a microtask and
 *  every synchronous assertion here reads an empty `scripts` array instead of
 *  a real defect. A page under test never has this problem — it either has no
 *  `fetch` (this fallback's actual reason to exist, e.g. an ancient runtime)
 *  or a `fetch` this suite exercises on purpose (§0). */
function installDom() {
    const scripts = [];
    globalThis.window = globalThis;
    globalThis.document = {
        head: { appendChild(node) { scripts.push(node); } },
        createElement() { return { set src(v) { this._src = v; }, get src() { return this._src; } }; },
    };
    delete globalThis.Plotly;
    delete globalThis.define;
    delete globalThis.fetch;
    return scripts;
}

/** A fresh module instance: `_plotlyLoadPromise` is module state and one load
 *  per process would make every section after the first a no-op. */
const freshWrapper = (tag) =>
    import(`../src/charts/plotly_wrapper.js?case=${tag}`);

// ══ 0. THE PRIMARY PATH TOUCHES NO GLOBAL AT ALL ═══════════════════════
//
// §1-§5 below pin the FALLBACK — the masked-`define` script tag — but that is
// no longer what a normal load does. The primary path fetches the bundle and
// runs it through `new Function('define', 'module', 'exports', code)`, so
// `typeof define` reads "undefined" from INSIDE that call for a reason that
// has nothing to do with `window.define`: the identifier resolves to the
// function's own parameter. Nothing here masks, saves or restores a global,
// which is the whole point — a page's own AMD loader, present throughout,
// must never be touched, and no script tag is the thing that proves it.
{
    const scripts = installDom();
    const { setPlotlySource, ensurePlotly } = await freshWrapper('primary');
    setPlotlySource('/vendor/plotly/2.35.2/plotly.min.js');

    const theirs = Object.assign(function define() {}, { amd: {} });
    window.define = theirs;

    globalThis.fetch = async (src) => {
        ok('fetched the configured source', src === '/vendor/plotly/2.35.2/plotly.min.js', src);
        return {
            ok: true,
            async text() {
                // A minimal UMD header, exactly the question Plotly's asks.
                return `
                    (function (global, factory) {
                        if (typeof define === 'function' && define.amd) {
                            define(factory);
                        } else {
                            global.Plotly = factory();
                        }
                    }(this, function () { return { __tag: 'primary' }; }));
                `;
            },
        };
    };

    const resolved = await ensurePlotly();
    ok('resolves with the Plotly global', resolved?.__tag === 'primary');
    ok('no script tag was ever created', scripts.length === 0);
    ok('the page\'s own AMD loader was never touched, not even for a tick',
       window.define === theirs);
    delete globalThis.fetch;
}

// ══ 1. AN AMD LOADER ARRIVING MID-FETCH DOES NOT COST US PLOTLY ════════
//
// This section and §2-§5 exercise the FALLBACK path: what happens when this
// page cannot fetch its own copy (a CORS-restricted CDN is the real case) and
// falls back to the masked-`define` script tag from before the fetch+eval
// rewrite. `installDom()` deletes `fetch` so that path is the one taken.
{
    const scripts = installDom();
    const { setPlotlySource, ensurePlotly } = await freshWrapper('race');
    setPlotlySource('/vendor/plotly/2.35.2/plotly.min.js');

    const pending = ensurePlotly();
    ok('the loader injected exactly one script', scripts.length === 1);

    // THE WHOLE POINT: while the fetch is in flight, Plotly's UMD header asks
    // this question. It must answer "no AMD here" however long the fetch takes.
    ok('mid-fetch, `define` reads as undefined so the UMD takes the global branch',
       typeof window.define === 'undefined', String(typeof window.define));

    // Monaco lands in the middle of the window and installs its loader.
    let monacoCalls = 0;
    const monacoDefine = Object.assign(
        function define() { monacoCalls += 1; }, { amd: {}, config: 'kept' });
    window.define = monacoDefine;

    // AND HERE IS THE SECOND HALF, which the first fix got wrong. Monaco loads
    // in two stages: `loader.js` sets `define`, `editor.main.js` arrives later
    // and CALLS it. A `define` hidden as `undefined` produces, from the real
    // deployment on 2026-08-31:
    //     editor.main.js:5 Uncaught TypeError: globalDefine is not a function
    // So `define` must stay callable through the whole window.
    ok('an AMD loader installed mid-window is still CALLABLE — Monaco\'s second '
       + 'stage lands here and must not find `undefined`',
       typeof window.define === 'function', String(typeof window.define));

    window.define(['dep'], () => 'factory');
    ok('and calling it reaches the real loader', monacoCalls === 1,
       `${monacoCalls} call(s) arrived`);
    ok('other properties on the loader survive the mask',
       window.define.config === 'kept', String(window.define.config));

    // While Plotly, which asks exactly one question, still declines the branch.
    ok('but `define.amd` is withheld, so Plotly takes the global branch',
       !window.define.amd, String(window.define.amd));

    // Plotly, seeing no AMD, sets the global and the script fires onload.
    globalThis.Plotly = { __tag: 'plotly' };
    scripts[0].onload();

    const resolved = await pending;
    ok('ensurePlotly resolves with the Plotly global', resolved?.__tag === 'plotly');
    ok('and Monaco\'s loader survives — the restore prefers what ARRIVED over '
       + 'the value saved before the window opened',
       window.define === monacoDefine,
       window.define === undefined ? 'define was erased' : String(window.define));
}

// ══ 2. THE FAILURE, WHEN IT IS GENUINELY THE FAILURE ═══════════════════
//
// If Plotly really does not turn up, the rejection must still happen — and it
// must now say WHY, because "not found" on its own is what sent the last
// reader to the wrong file.
{
    const scripts = installDom();
    const { setPlotlySource, ensurePlotly } = await freshWrapper('missing');
    setPlotlySource('/vendor/plotly/2.35.2/plotly.min.js');

    const pending = ensurePlotly();
    scripts[0].onload();                      // loaded, but nothing defined
    const err = await pending.then(() => null, (e) => e);
    ok('a script that defines nothing still rejects', err instanceof Error);
    ok('and the message names the AMD cause rather than only the symptom',
       /AMD loader/i.test(err?.message || ''), err?.message);
    ok('`define` is not left behind as an own property when there was none',
       !('define' in window), `in-operator said ${'define' in window}`);
}

// ══ 3. D6: THE ORDINARY PATH IS UNCHANGED ══════════════════════════════
//
// No AMD loader anywhere, which is every consumer that does not embed Monaco.
{
    const scripts = installDom();
    const { setPlotlySource, ensurePlotly } = await freshWrapper('plain');
    setPlotlySource('/plotly.min.js');

    const pending = ensurePlotly();
    globalThis.Plotly = { __tag: 'plain' };
    scripts[0].onload();
    ok('resolves exactly as before', (await pending)?.__tag === 'plain');
    ok('and leaves no `define` on a window that never had one', !('define' in window));
}

// ══ 4. D6: A PRE-EXISTING `define` IS PUT BACK ═════════════════════════
//
// The consumer had its own AMD loader before any chart rendered. Hiding it is
// correct; keeping it hidden is not.
{
    const scripts = installDom();
    const theirs = Object.assign(function define() {}, { amd: {} });
    window.define = theirs;

    const { setPlotlySource, ensurePlotly } = await freshWrapper('restore');
    setPlotlySource('/plotly.min.js');

    const pending = ensurePlotly();
    ok('a pre-existing loader stays callable for the duration',
       typeof window.define === 'function', String(typeof window.define));
    ok('with `amd` withheld while Plotly is deciding', !window.define.amd);
    globalThis.Plotly = { __tag: 'restore' };
    scripts[0].onload();
    await pending;
    ok('and restored afterwards, unchanged', window.define === theirs);
}

// ══ 5. A FAILED FETCH RESTORES TOO ═════════════════════════════════════
//
// `onerror` shares the release path with `onload`; a 404 that left `define`
// hidden would break every AMD consumer on the page for the rest of the session.
{
    const scripts = installDom();
    const theirs = Object.assign(function define() {}, { amd: {} });
    window.define = theirs;

    const { setPlotlySource, ensurePlotly } = await freshWrapper('onerror');
    setPlotlySource('/nope.js');

    const pending = ensurePlotly();
    scripts[0].onerror();
    const err = await pending.then(() => null, (e) => e);
    ok('a failed fetch rejects naming the source', /nope\.js/.test(err?.message || ''));
    ok('and still gives `define` back', window.define === theirs);
}

console.log(failures === 0
    ? 'plotly AMD race: an AMD loader arriving mid-fetch costs neither the chart nor the editor'
    : `plotly AMD race: ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
