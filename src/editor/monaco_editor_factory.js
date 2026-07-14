/**
 * Monaco Editor Factory
 *
 * Creates and manages Monaco editor instances for cells.
 * Handles:
 *   - Creating full editors (multi-line, for CodeCells)
 *   - Creating single-line inline editors (for ParameterCell values, expression fields)
 *   - Theme registration (ecosim-dark, ecosim-light)
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

const ECOSIM_DARK_THEME = {
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

const ECOSIM_LIGHT_THEME = {
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

let _themesRegistered = false;

function ensureThemes(monaco) {
    if (_themesRegistered) return;
    _themesRegistered = true;
    monaco.editor.defineTheme('ecosim-dark',  ECOSIM_DARK_THEME);
    monaco.editor.defineTheme('ecosim-light', ECOSIM_LIGHT_THEME);
}

// ─── Shared editor options ─────────────────────────────────────────────────────

function baseOptions(overrides = {}) {
    return {
        language: _defaultLanguage,
        theme: 'ecosim-dark',
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

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * @typedef {{ editor: object, dispose: () => void, getValue: () => string, setValue: (v: string) => void, onDidChange: (cb: () => void) => object }} EditorHandle
 */

export class MonacoEditorFactory {
    #monaco = null;
    #currentTheme = 'ecosim-dark';

    constructor() {}

    async init() {
        this.#monaco = await monacoReady;
        ensureThemes(this.#monaco);
        return this;
    }

    get monaco() { return this.#monaco; }

    /**
     * Set global theme for all editors.
     * @param {'ecosim-dark'|'ecosim-light'} theme
     */
    setTheme(theme) {
        this.#currentTheme = theme;
        this.#monaco?.editor.setTheme(theme);
    }

    /**
     * Create a full multi-line editor (for CodeCell).
     *
     * @param {HTMLElement} container
     * @param {string} initialValue
     * @param {{ language?: string, readOnly?: boolean, lineNumbers?: string } & object} [overrides]
     * @returns {EditorHandle}
     */
    createEditor(container, initialValue = '', overrides = {}) {
        if (!this.#monaco) throw new Error('MonacoEditorFactory not initialized');

        const { noAutoHeight, ...editorOverrides } = overrides;

        const editor = this.#monaco.editor.create(container, {
            ...baseOptions({ theme: this.#currentTheme }),
            value: initialValue,
            ...editorOverrides,
        });

        // Auto-resize to content height.
        // When the "limit code cell height" setting is active (data-code-max-height="true"
        // on the editor container), cap at 400px so Monaco handles internal scrolling.
        // Otherwise, grow to fit all content with no upper bound.
        //
        // Monaco's handleMouseWheel is toggled dynamically: disabled when the editor
        // auto-sizes to fit content (so wheel events propagate to the notebook scroller),
        // enabled only when content is capped and there is actual internal overflow.
        //
        // When noAutoHeight is true, skip auto-sizing entirely and let the container
        // control dimensions (e.g. flex layout). Mouse wheel scrolling stays enabled.
        let minHeight = 80;
        let heightDisposable = null;
        let updateHeight = null;
        if (noAutoHeight) {
            editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
        } else {
            updateHeight = () => {
                const maxHeightEnabled = container.closest('.notebook-editor-container')?.dataset.codeMaxHeight === 'true';
                const maxH = maxHeightEnabled ? 400 : Infinity;
                const rawContent = editor.getContentHeight();
                const contentHeight = Math.min(maxH, Math.max(minHeight, rawContent));
                container.style.height = `${contentHeight}px`;
                editor.layout();

                // Enable Monaco wheel handling only when content overflows the capped height
                const needsInternalScroll = maxHeightEnabled && rawContent > maxH;
                editor.updateOptions({ scrollbar: { handleMouseWheel: needsInternalScroll } });
            };
            heightDisposable = editor.onDidContentSizeChange(updateHeight);
            updateHeight();
        }

        // Re-evaluate height when the code-max-height setting changes on the ancestor
        const editorContainer = container.closest('.notebook-editor-container');
        let maxHeightObserver = null;
        if (updateHeight && editorContainer) {
            maxHeightObserver = new MutationObserver(() => updateHeight());
            maxHeightObserver.observe(editorContainer, { attributes: true, attributeFilter: ['data-code-max-height'] });
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
            updateHeight,
            dispose: () => {
                findWidgetObserver?.disconnect();
                maxHeightObserver?.disconnect();
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

        const originalModel = monaco.editor.createModel(originalContent, language);
        const modifiedModel = monaco.editor.createModel(modifiedContent, language);

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

        diffEditor.setModel({ original: originalModel, modified: modifiedModel });

        return {
            editor: diffEditor,
            setModels(original, modified, lang) {
                originalModel.dispose();
                modifiedModel.dispose();
                const newOrig = monaco.editor.createModel(original, lang || language);
                const newMod = monaco.editor.createModel(modified, lang || language);
                diffEditor.setModel({ original: newOrig, modified: newMod });
            },
            dispose() {
                safeDispose(diffEditor);
                safeDispose(originalModel);
                safeDispose(modifiedModel);
            },
        };
    }
}

/** Singleton instance, initialized lazily. */
let _factoryInstance = null;

// Where the app keeps Monaco. Set once, at boot.
let _monacoBasePath = null;

/** @param {string} basePath */
export function setMonacoBasePath(basePath) {
    if (typeof basePath === 'string' && basePath) _monacoBasePath = basePath;
}

export async function getEditorFactory() {
    if (!_factoryInstance) {
        // Ensure Monaco is initialized — initMonaco is idempotent, safe to call from any entry point
        initMonaco(_monacoBasePath);
        _factoryInstance = await new MonacoEditorFactory().init();
    }
    return _factoryInstance;
}
