/**
 * Monaco Editor Factory
 *
 * Creates and manages Monaco editor instances for cells.
 * Handles:
 *   - Creating full editors (multi-line, for CodeCells)
 *   - Creating single-line inline editors (for ParameterCell values, expression fields)
 *   - Theme registration (built-in dark and light themes, names set by
 *     setEditorThemeNames(); default flexdesk-dark, flexdesk-light)
 *   - Shared editor options
 *   - Instance lifecycle (dispose on cell removal)
 */

import { monacoReady, initMonaco } from './monaco_loader.js';
// The default language is the CONSUMER's. This imported ECOLANG_ID — EcoAgent's
// expression language — so a generic Monaco factory shipped knowing the name of one
// application's DSL. Register your language with Monaco and name it here.
let _defaultLanguage = 'plaintext';

/** @param {string} id A language id already registered with Monaco. */
export function setDefaultLanguage(id) {
    if (typeof id === 'string' && id) _defaultLanguage = id;
}

/** Dispose a Monaco editor, swallowing the benign "Canceled" error from pending async ops. */
function safeDispose(editor) {
    try { editor.dispose(); } catch (e) { if (e?.message !== 'Canceled') throw e; }
}

// ─── Theme definitions ─────────────────────────────────────────────────────────

const DARK_THEME = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'comment',           foreground: '6a9955', fontStyle: 'italic' },
        { token: 'keyword',           foreground: '569cd6', fontStyle: 'bold' },
        { token: 'keyword.directive', foreground: 'c586c0', fontStyle: 'bold' },
        { token: 'keyword.operator',  foreground: '569cd6' },
        { token: 'constant',          foreground: 'c586c0' },
        { token: 'number',            foreground: 'b5cea8' },
        { token: 'string',            foreground: 'ce9178' },
        { token: 'type.identifier',   foreground: '4ec9b0', fontStyle: 'bold' },
        { token: 'support.function',  foreground: 'a6e22e' },
        { token: 'identifier',        foreground: '4fc1ff' },
        { token: 'operator',          foreground: 'd4d4d4' },
        { token: 'delimiter',         foreground: '808080' },
    ],
    colors: {
        // Layer-2 input well — almost black, matches the EcoAgent
        // three-layer contrast pattern (chrome #1a1a1a, content
        // #212121, input/code #0a0a0a). Makes editable surfaces
        // visually recess from the surrounding cards.
        'editor.background':               '#0a0a0a',
        'editor.foreground':               '#e0e0e0',
        'editor.lineHighlightBackground':  '#161616',
        'editor.selectionBackground':      '#264f78',
        'editor.inactiveSelectionBackground': '#1f3350',
        'editorLineNumber.foreground':     '#5a5a5a',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editorCursor.foreground':         '#39ff14',
        'editor.findMatchBackground':      '#9e6a03',
        'editor.findMatchHighlightBackground': '#f2cc6030',
        'editorIndentGuide.background1':   '#2e2e2e',
        'editorIndentGuide.activeBackground1': '#5a5a5a',
        'editorGutter.background':         '#0a0a0a',
        // Pop-ups stay slightly lighter so they read as floating
        // surfaces above the editor body, not part of it.
        'editorWidget.background':         '#1a1a1a',
        'editorSuggestWidget.background':  '#1a1a1a',
        'editorSuggestWidget.border':      '#383838',
        'editorSuggestWidget.selectedBackground': '#094771',
        'scrollbarSlider.background':      '#4a4a4d40',
        'scrollbarSlider.hoverBackground': '#4a4a4d70',
    },
};

const LIGHT_THEME = {
    base: 'vs',
    inherit: true,
    rules: [
        { token: 'comment',           foreground: '6a737d', fontStyle: 'italic' },
        { token: 'keyword',           foreground: 'd73a49', fontStyle: 'bold' },
        { token: 'keyword.directive', foreground: '6f42c1', fontStyle: 'bold' },
        { token: 'keyword.operator',  foreground: 'd73a49' },
        { token: 'constant',          foreground: 'e36209' },
        { token: 'number',            foreground: '005cc5' },
        { token: 'string',            foreground: '22863a' },
        { token: 'type.identifier',   foreground: '005cc5', fontStyle: 'bold' },
        { token: 'support.function',  foreground: '6f42c1' },
        { token: 'identifier',        foreground: '24292e' },
        { token: 'operator',          foreground: 'd73a49' },
        { token: 'delimiter',         foreground: '586069' },
    ],
    colors: {
        'editor.background':               '#ffffff',
        'editor.foreground':               '#24292e',
        'editor.lineHighlightBackground':  '#f6f8fa',
        'editor.selectionBackground':      '#c8d3e6',
        'editorLineNumber.foreground':     '#babbbd',
        'editorLineNumber.activeForeground': '#586069',
        'editorCursor.foreground':         '#044289',
        'editorGutter.background':         '#ffffff',
        'editorWidget.background':         '#f6f8fa',
        'editorSuggestWidget.background':  '#f6f8fa',
        'editorSuggestWidget.border':      '#e1e4e8',
        'scrollbarSlider.background':      '#babbbd40',
        'scrollbarSlider.hoverBackground': '#babbbd70',
    },
};

/** The names the built-in themes are registered under when the embedder
 *  names none. */
export const DEFAULT_EDITOR_THEME_NAMES = Object.freeze({
    dark: 'flexdesk-dark',
    light: 'flexdesk-light',
});

let _themeNames = DEFAULT_EDITOR_THEME_NAMES;

/**
 * Name the built-in dark and light Monaco themes. Call before the first
 * factory is created: a factory starts on the dark name, and init() registers
 * the built-in themes under the names current at that moment. An embedder with
 * its own theme defines it with `monaco.editor.defineTheme(name, …)` and passes
 * that name to `factory.setTheme(name)` instead.
 *
 * @param {{ dark?: string, light?: string }} [names]
 */
export function setEditorThemeNames({ dark, light } = {}) {
    _themeNames = Object.freeze({
        dark: (typeof dark === 'string' && dark) ? dark : DEFAULT_EDITOR_THEME_NAMES.dark,
        light: (typeof light === 'string' && light) ? light : DEFAULT_EDITOR_THEME_NAMES.light,
    });
}

/** @returns {{ dark: string, light: string }} The built-in themes' names. */
export function getEditorThemeNames() {
    return _themeNames;
}

/** Monaco instance -> names already defined on it, so each name is defined once. */
const _definedThemes = new WeakMap();

function ensureThemes(monaco) {
    let defined = _definedThemes.get(monaco);
    if (!defined) { defined = new Set(); _definedThemes.set(monaco, defined); }
    for (const [name, theme] of [[_themeNames.dark, DARK_THEME], [_themeNames.light, LIGHT_THEME]]) {
        if (defined.has(name)) continue;
        defined.add(name);
        monaco.editor.defineTheme(name, theme);
    }
}

// ─── Shared editor options ─────────────────────────────────────────────────────

function baseOptions(overrides = {}) {
    return {
        language: _defaultLanguage,
        theme: _themeNames.dark,
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 19.5,
        tabSize: 4,
        insertSpaces: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'gutter',
        matchBrackets: 'always',
        padding: { top: 8, bottom: 8 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: { handleMouseWheel: false },
        folding: true,
        lineDecorationsWidth: 0,
        // Reserve a couple extra gutter columns so the right-aligned line
        // numbers get some breathing room on the left instead of sitting flush
        // against the editor edge (digits stay right-aligned; the slack lands
        // on the left). Covers up to 5-digit files too.
        lineNumbersMinChars: 5,
        suggest: {
            showKeywords: true,
            showFunctions: true,
            showVariables: true,
            showConstants: true,
            showModules: true,
            snippetsPreventQuickSuggestions: false,
        },
        quickSuggestions: { other: true, comments: false, strings: false },
        parameterHints: { enabled: true },
        wordWrap: 'off',
        fixedOverflowWidgets: true,
        ...overrides,
    };
}

function singleLineOptions(overrides = {}) {
    return baseOptions({
        lineNumbers: 'off',
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        glyphMargin: false,
        folding: false,
        renderLineHighlight: 'none',
        scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false },
        wordWrap: 'off',
        overviewRulerLanes: 0,
        padding: { top: 3, bottom: 3 },
        ...overrides,
    });
}

/** A cap is a positive number of px, or `Infinity` for none. */
function checkMaxHeight(px) {
    if (typeof px !== 'number' || Number.isNaN(px) || px <= 0) {
        throw new RangeError(`maxHeight must be a positive number of px or Infinity, got ${String(px)}`);
    }
    return px;
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * @typedef {{ editor: object, dispose: () => void, getValue: () => string, setValue: (v: string) => void, onDidChange: (cb: () => void) => object, setMaxHeight?: (px: number) => void }} EditorHandle
 */

export class MonacoEditorFactory {
    #monaco = null;
    #currentTheme = _themeNames.dark;

    constructor() {}

    async init() {
        this.#monaco = await monacoReady;
        ensureThemes(this.#monaco);
        return this;
    }

    get monaco() { return this.#monaco; }

    /**
     * Set global theme for all editors.
     * @param {string} theme  A theme name Monaco knows: one of
     *   getEditorThemeNames(), or one the embedder defined itself.
     */
    setTheme(theme) {
        this.#currentTheme = theme;
        this.#monaco?.editor.setTheme(theme);
    }

    /**
     * Create a full multi-line editor.
     *
     * Unless `noAutoHeight` is set, the editor sizes `container` to its content,
     * never below `setMinHeight()` (80px by default) and never above `maxHeight`.
     * Past the cap, Monaco scrolls internally and handles the mouse wheel; below
     * it, Monaco leaves the wheel alone, so it reaches whatever scrolls around
     * the editor.
     *
     * @param {HTMLElement} container
     * @param {string} initialValue
     * @param {{ language?: string, readOnly?: boolean, lineNumbers?: string, maxHeight?: number, noAutoHeight?: boolean } & object} [overrides]
     *     `maxHeight`: the auto-height cap in px, `Infinity` (the default) for none.
     *     `noAutoHeight`: leave the container's size to its layout; the wheel always scrolls the editor.
     * @returns {EditorHandle}
     */
    createEditor(container, initialValue = '', overrides = {}) {
        if (!this.#monaco) throw new Error('MonacoEditorFactory not initialized');

        const { noAutoHeight, maxHeight: maxHeightOption = Infinity, ...editorOverrides } = overrides;
        let maxHeight = checkMaxHeight(maxHeightOption);

        const editor = this.#monaco.editor.create(container, {
            ...baseOptions({ theme: this.#currentTheme }),
            value: initialValue,
            ...editorOverrides,
        });

        // Monaco's handleMouseWheel is toggled with the height: off while the
        // editor fits its content (the wheel scrolls the page around it), on only
        // when the content overflows the cap and the editor has something to scroll.
        let minHeight = 80;
        let heightDisposable = null;
        let updateHeight = null;
        if (noAutoHeight) {
            editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
        } else {
            updateHeight = () => {
                const rawContent = editor.getContentHeight();
                const contentHeight = Math.min(maxHeight, Math.max(minHeight, rawContent));
                container.style.height = `${contentHeight}px`;
                editor.layout();
                editor.updateOptions({ scrollbar: { handleMouseWheel: rawContent > maxHeight } });
            };
            heightDisposable = editor.onDidContentSizeChange(updateHeight);
            updateHeight();
        }

        // Scroll the find widget into view when it becomes visible.
        // The editor auto-sizes to content (no internal scroll), so the notebook
        // container scrolls instead. The find widget sits at top:0 of the editor,
        // which may be above the viewport for tall cells.
        let findWidgetObserver = null;
        const observeFindWidget = () => {
            const overflowGuard = container.querySelector('.overflow-guard');
            if (!overflowGuard) return;

            findWidgetObserver = new MutationObserver(() => {
                const fw = container.querySelector('.find-widget.visible');
                if (fw) fw.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            });
            findWidgetObserver.observe(overflowGuard, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
            });
        };
        // Defer slightly — Monaco builds DOM asynchronously after create()
        requestAnimationFrame(observeFindWidget);

        return {
            editor,
            getValue: () => editor.getValue(),
            setValue: (v) => { if (editor.getValue() !== v) editor.setValue(v); },
            onDidChange: (cb) => editor.onDidChangeModelContent(cb),
            focus: () => editor.focus(),
            layout: () => editor.layout(),
            setMinHeight: (h) => { minHeight = h; },
            /** The auto-height cap in px, `Infinity` for none; applies at once. No effect with `noAutoHeight`. */
            setMaxHeight: (px) => {
                maxHeight = checkMaxHeight(px);
                updateHeight?.();
            },
            updateHeight,
            dispose: () => {
                findWidgetObserver?.disconnect();
                heightDisposable?.dispose();
                safeDispose(editor);
            },
        };
    }

    /**
     * Create a single-line inline editor (for ParameterCell value, expression fields).
     *
     * @param {HTMLElement} container
     * @param {string} initialValue
     * @param {{ language?: string, placeholder?: string } & object} [overrides]
     * @returns {EditorHandle}
     */
    createInlineEditor(container, initialValue = '', overrides = {}) {
        if (!this.#monaco) throw new Error('MonacoEditorFactory not initialized');

        container.style.height = '26px';

        const editor = this.#monaco.editor.create(container, {
            ...singleLineOptions({ theme: this.#currentTheme }),
            value: initialValue,
            ...overrides,
        });

        // Prevent newlines in single-line mode
        editor.onKeyDown((e) => {
            if (e.keyCode === this.#monaco.KeyCode.Enter) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        return {
            editor,
            getValue: () => editor.getValue(),
            setValue: (v) => { if (editor.getValue() !== v) editor.setValue(v); },
            onDidChange: (cb) => editor.onDidChangeModelContent(cb),
            focus: () => editor.focus(),
            layout: () => editor.layout(),
            dispose: () => safeDispose(editor),
        };
    }

    /**
     * Create a plain text editor (for documentation cells with markdown).
     * Uses VS Code's built-in markdown language, no EcoLang features.
     *
     * @param {HTMLElement} container
     * @param {string} initialValue
     * @returns {EditorHandle}
     */
    createMarkdownEditor(container, initialValue = '') {
        return this.createEditor(container, initialValue, {
            language: 'markdown',
            wordWrap: 'on',
            lineNumbers: 'off',
            folding: false,
            quickSuggestions: false,
        });
    }

    /**
     * Create a read-only DSL viewer (shown in the "DSL" tab of a Godley/parameter cell).
     *
     * @param {HTMLElement} container
     * @param {string} dslContent
     * @returns {EditorHandle}
     */
    createDslViewer(container, dslContent = '') {
        return this.createEditor(container, dslContent, {
            readOnly: true,
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
        });
    }

    /**
     * Create a side-by-side diff editor for comparing two versions of a file.
     *
     * @param {HTMLElement} container
     * @param {string} originalContent  - Left side (e.g. HEAD version)
     * @param {string} modifiedContent  - Right side (e.g. working copy)
     * @param {{ language?: string, readOnly?: boolean }} [options]
     * @returns {{ editor: object, dispose: Function, setModels: Function }}
     */
    createDiffEditor(container, originalContent = '', modifiedContent = '', options = {}) {
        const monaco = this.#monaco;
        const language = options.language || 'plaintext';

        // The pair currently attached to the diff editor. setModels() replaces it, and
        // dispose() frees whichever pair is attached at that moment — not the first one.
        let models = {
            original: monaco.editor.createModel(originalContent, language),
            modified: monaco.editor.createModel(modifiedContent, language),
        };

        const diffEditor = monaco.editor.createDiffEditor(container, {
            theme: this.#currentTheme,
            readOnly: options.readOnly !== false,
            renderSideBySide: true,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            renderOverviewRuler: false,
            enableSplitViewResizing: true,
        });

        diffEditor.setModel(models);

        return {
            editor: diffEditor,
            setModels(original, modified, lang) {
                const previous = models;
                models = {
                    original: monaco.editor.createModel(original, lang || language),
                    modified: monaco.editor.createModel(modified, lang || language),
                };
                // Attach the new pair first: a model must not be disposed while the
                // diff editor still holds it.
                diffEditor.setModel(models);
                safeDispose(previous.original);
                safeDispose(previous.modified);
            },
            dispose() {
                safeDispose(diffEditor);
                safeDispose(models.original);
                safeDispose(models.modified);
            },
        };
    }
}

/**
 * The singleton, as a promise: concurrent callers share one load, and a FAILED
 * load clears it so the next call can retry.
 * @type {Promise<MonacoEditorFactory> | null}
 */
let _factoryPromise = null;

// Where the app keeps Monaco. Set once, at boot.
let _monacoBasePath = null;

/** @param {string} basePath */
export function setMonacoBasePath(basePath) {
    if (typeof basePath === 'string' && basePath) _monacoBasePath = basePath;
}

/**
 * The shared editor factory, once Monaco has loaded.
 *
 * Uses a load already started by initMonaco(path), so a consumer that calls
 * initMonaco() itself needs no setMonacoBasePath(). Otherwise it starts one
 * from setMonacoBasePath()'s path.
 *
 * Rejects — rather than pending forever (BUG-0023) — with initMonaco()'s error
 * when no path was set and no load was started, or when Monaco cannot be
 * loaded. A later call asks initMonaco() again: after a loader.js failure that
 * is a fresh attempt (fix the path first); after an AMD-level failure it is
 * the same rejection, because that one is final for the page.
 *
 * @returns {Promise<MonacoEditorFactory>}
 */
export function getEditorFactory() {
    if (!_factoryPromise) {
        _factoryPromise = initMonaco(_monacoBasePath)
            .then(() => new MonacoEditorFactory().init())
            .catch((err) => { _factoryPromise = null; throw err; });
    }
    return _factoryPromise;
}
