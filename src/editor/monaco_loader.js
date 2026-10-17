/**
 * Monaco Loader — wraps the AMD require() bootstrap into an ES module Promise.
 *
 * Monaco ships as AMD modules. vs/loader.js is injected dynamically on demand
 * (NOT via a global <script> tag) so it does not pollute window.define before
 * Plotly loads. Plotly auto-detects AMD define and would wrap itself as a module
 * instead of setting window.Plotly if loader.js ran at page load.
 */

let _resolveMonaco;

/**
 * The attempt in flight, or the one that succeeded. A FAILED attempt clears it,
 * so the next initMonaco() call starts over instead of being handed the
 * failure — or, as before, nothing at all: the flag this replaced was set
 * BEFORE loader.js had loaded, so one 404 blocked every retry for the life of
 * the page (BUG-0023).
 * @type {Promise<typeof monaco> | null}
 */
let _attempt = null;

/**
 * Resolves with the `monaco` namespace once any initMonaco() call has loaded it.
 *
 * It never rejects, because a failed attempt is not final — a later
 * initMonaco() may still succeed. To learn that an attempt FAILED, await
 * initMonaco() (or getEditorFactory()), which rejects.
 * @type {Promise<typeof monaco>}
 */
export const monacoReady = new Promise(resolve => { _resolveMonaco = resolve; });

function injectLoaderScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => {
            // Take the dead tag out, so a retry is a fresh request and not a
            // second tag beside the first.
            s.remove?.();
            reject(new Error(`Failed to load Monaco loader: ${src}`));
        };
        document.head.appendChild(s);
    });
}

function injectMonacoCss(basePath) {
    const id = 'monaco-editor-css';
    const href = `${basePath}/vs/editor/editor.main.css`;
    const existing = document.getElementById(id);
    if (existing) {
        // A retry with a corrected path must not keep the stylesheet of the bad one.
        if (existing.getAttribute?.('href') !== href) existing.setAttribute?.('href', href);
        return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function requireEditorMain(basePath) {
    return new Promise((resolve, reject) => {
        window.require.config({
            paths: { vs: `${basePath}/vs` },
            'vs/nls': { availableLanguages: {} },
        });
        window.require(['vs/editor/editor.main'], () => {
            if (window.monaco) resolve(window.monaco);
            else reject(new Error(
                `[twm/editor] vs/editor/editor.main loaded from ${basePath}/vs but did not `
                + 'set window.monaco.'));
        }, (err) => {
            reject(new Error(
                `[twm/editor] Failed to load Monaco from ${basePath}/vs: ${err?.message ?? err}`));
        });
    });
}

async function loadMonaco(basePath) {
    // Inject CSS and loader.js dynamically — kept out of the HTML to avoid global bleed
    injectMonacoCss(basePath);
    if (!window.require) {
        await injectLoaderScript(`${basePath}/vs/loader.js`);
    }
    return requireEditorMain(basePath);
}

/**
 * Call once when the notebook page initialises.
 * Where Monaco lives is the CONSUMER's business.
 *
 * `basePath` defaulted to 'vendor/monaco' — a path into ONE application's tree,
 * which would 404 for anyone else. Exactly the bug plotly_wrapper.js had, and it
 * takes exactly the same fix: no default, and say so if nobody supplies one.
 *
 * Monaco is a PEER dependency — 14 MB this bundle deliberately does not contain.
 *
 * Idempotent while an attempt is in flight or has succeeded: every caller gets
 * the same promise. The returned promise REJECTS when no path is given, when
 * loader.js fails to load, or when Monaco's AMD loader reports an error; after
 * a rejection the next call tries again.
 *
 * @param {string} basePath Path prefix for the vs/ directory. REQUIRED.
 * @returns {Promise<typeof monaco>}
 */
export async function initMonaco(basePath) {
    if (!basePath) {
        throw new Error(
            '[twm/editor] initMonaco() needs the path to your copy of Monaco, e.g. '
            + "initMonaco('vendor/monaco'). Monaco is a peer dependency; the library "
            + 'does not guess where you put it.');
    }
    if (!_attempt) {
        _attempt = loadMonaco(basePath).then(
            (m) => { _resolveMonaco(m); return m; },
            (err) => { _attempt = null; throw err; });
    }
    return _attempt;
}
