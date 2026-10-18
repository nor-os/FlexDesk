/**
 * A STAND-IN PAGE FOR THE MONACO LOADER SUITES — NOT A SUITE ITSELF.
 *
 * No jsdom: the loader touches exactly `document.head.appendChild`,
 * `document.createElement` and `document.getElementById`, and a suite fires
 * each script's `onload` / `onerror` itself, which is what makes a failure
 * deterministic.
 *
 * `amdLoader()` models the part of Monaco's real `vs/loader.js` that decides
 * whether a failed load can be retried: a module that failed is recorded as
 * complete-with-error (`_onLoadError`), and every later `require()` of it gets
 * that same error straight away (`_resolve`), whatever `require.config()` says
 * now. There is no `undef`. A suite installs ONE instance when loader.js
 * "loads" and keeps it for the life of the page, as a real page does.
 */

export function installPage() {
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
    return { byId, scripts, lastScript: () => scripts().at(-1) };
}

/**
 * @param {(url: string) => (Function | Error)} serve what the server has at
 *     `url`: a function run as the module body (its return value is the
 *     module's exports), or an Error when that load fails.
 */
export function amdLoader(serve) {
    let paths = {};
    const modules = new Map();          // id -> { error } | { exports }
    const calls = [];
    const urlOf = (id) => {
        const [head, ...rest] = id.split('/');
        return `${paths[head] ?? head}/${rest.join('/')}.js`;
    };
    const require = (deps, onLoad, onError) => {
        calls.push(deps);
        setTimeout(() => {
            for (const id of deps) {
                if (!modules.has(id)) {
                    const got = serve(urlOf(id));
                    modules.set(id, got instanceof Error ? { error: got } : { exports: got() });
                }
                const m = modules.get(id);
                if (m.error) { onError?.(m.error); return; }
            }
            onLoad?.(...deps.map((id) => modules.get(id).exports));
        });
    };
    require.config = (c) => { paths = { ...paths, ...(c.paths ?? {}) }; };
    require.calls = calls;
    return require;
}

export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Settles within `ms`, or reports that it did not — the original bug was a hang. */
export async function settle(promise, ms = 500) {
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

export function checker() {
    let failures = 0;
    const unhandled = [];
    process.on('unhandledRejection', (reason) => { unhandled.push(reason); });
    const ok = (what, cond, detail = '') => {
        if (cond) { console.log(`  ok   ${what}`); return; }
        failures += 1;
        console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
    };
    return {
        ok,
        async finish(name) {
            await tick();
            ok('no unhandled rejection anywhere', unhandled.length === 0,
               unhandled.map((e) => e?.message ?? String(e)).join(' | '));
            if (failures) {
                console.log(`${name}: ${failures} FAILED`);
                process.exit(1);
            }
            console.log(`${name}: all passed`);
        },
    };
}

/** A `monaco` namespace just big enough for MonacoEditorFactory.init(). */
export function fakeMonaco() {
    return { editor: { defineTheme() {}, setTheme() {} } };
}
