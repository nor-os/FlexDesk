/**
 * Monaco Loader — wraps the AMD require() bootstrap into an ES module Promise.
 *
 * Monaco ships as AMD modules. vs/loader.js is injected dynamically on demand
 * (NOT via a global <script> tag) so it does not pollute window.define before
 * Plotly loads. Plotly auto-detects AMD define and would wrap itself as a module
 * instead of setting window.Plotly if loader.js ran at page load.
 */

let _resolveMonaco;
let _monacoReady = false;

/** @type {Promise<typeof monaco>} */
export const monacoReady = new Promise(resolve => { _resolveMonaco = resolve; });

function injectLoaderScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load Monaco loader: ${src}`));
        document.head.appendChild(s);
    });
}

function injectMonacoCss(basePath) {
    const id = 'monaco-editor-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `${basePath}/vs/editor/editor.main.css`;
    document.head.appendChild(link);
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
 * @param {string} basePath Path prefix for the vs/ directory. REQUIRED.
 */
export async function initMonaco(basePath) {
    if (!basePath) {
        throw new Error(
            '[twm/editor] initMonaco() needs the path to your copy of Monaco, e.g. '
            + "initMonaco('vendor/monaco'). Monaco is a peer dependency; the library "
            + 'does not guess where you put it.');
    }
    if (_monacoReady) return monacoReady;
    _monacoReady = true;

    // Inject CSS and loader.js dynamically — kept out of the HTML to avoid global bleed
    injectMonacoCss(basePath);
    if (!window.require) {
        await injectLoaderScript(`${basePath}/vs/loader.js`);
    }

    window.require.config({
        paths: { vs: `${basePath}/vs` },
        'vs/nls': { availableLanguages: {} },
    });

    window.require(['vs/editor/editor.main'], () => {
        _resolveMonaco(window.monaco);
    });

    return monacoReady;
}
