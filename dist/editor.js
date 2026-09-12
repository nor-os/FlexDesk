import {
  NotebookTabBar
} from "./chunk-QNQHQ24V.js";
import "./chunk-WVFGV5FT.js";
import "./chunk-JYWURG5T.js";

// src/editor/editor_pane.js
var EditorPane = class {
  /** @type {string} */
  #id;
  /** @type {HTMLElement} root element */
  #el = null;
  /** @type {NotebookTabBar} */
  #tabBar = null;
  /** @type {HTMLElement} */
  #editorContainer = null;
  /** @type {string[]} file paths in tab order */
  #filePaths = [];
  /** @type {string|null} */
  #activeFilePath = null;
  /** @type {string|null} file path of the preview (transient) tab, if any */
  #previewFilePath = null;
  /** @type {object} callbacks from parent */
  #callbacks = {};
  /** @type {boolean} whether this pane is the focused/active pane */
  #focused = false;
  /**
   * @param {string} id — unique pane identifier ('left' or 'right')
   * @param {object} callbacks
   * @param {Function} callbacks.onActivate — (paneId, filePath) => void
   * @param {Function} callbacks.onClose — (paneId, filePath) => void
   * @param {Function} callbacks.onCloseOthers — (paneId, filePath) => void
   * @param {Function} callbacks.onCloseToRight — (paneId, filePath) => void
   * @param {Function} callbacks.onCloseAll — (paneId) => void
   * @param {Function} callbacks.onCloseSaved — (paneId) => void
   * @param {Function} callbacks.onRename — (oldPath, newPath) => void
   * @param {Function} callbacks.onDuplicate — (filePath) => void
   * @param {Function} callbacks.onReorder — (paneId, orderedPaths) => void
   * @param {Function} callbacks.onRevealInExplorer — (filePath) => void
   * @param {Function} callbacks.onFocus — (paneId) => void
   * @param {Function} callbacks.onSplitRight — (paneId, filePath) => void
   * @param {Function} callbacks.onMoveToOtherPane — (paneId, filePath) => void
   */
  constructor(id, callbacks = {}) {
    this.#id = id;
    this.#callbacks = callbacks;
  }
  get id() {
    return this.#id;
  }
  get activeFilePath() {
    return this.#activeFilePath;
  }
  get filePaths() {
    return [...this.#filePaths];
  }
  get editorContainer() {
    return this.#editorContainer;
  }
  get element() {
    return this.#el;
  }
  get isEmpty() {
    return this.#filePaths.length === 0;
  }
  /**
   * Build DOM and mount the tab bar.
   * @returns {HTMLElement} the root element (to be placed in SplitPaneContainer)
   */
  mount() {
    this.#el = document.createElement("div");
    this.#el.className = "editor-pane";
    this.#el.dataset.paneId = this.#id;
    this.#el.addEventListener("mousedown", () => {
      this.#callbacks.onFocus?.(this.#id);
    }, true);
    const tabBarEl = document.createElement("div");
    this.#el.appendChild(tabBarEl);
    this.#tabBar = new NotebookTabBar();
    this.#tabBar.mount(tabBarEl, {
      onActivate: (path) => this.#callbacks.onActivate?.(this.#id, path),
      onClose: (path) => this.#callbacks.onClose?.(this.#id, path),
      onCloseOthers: (path) => this.#callbacks.onCloseOthers?.(this.#id, path),
      onCloseToRight: (path) => this.#callbacks.onCloseToRight?.(this.#id, path),
      onCloseAll: () => this.#callbacks.onCloseAll?.(this.#id),
      onCloseSaved: () => this.#callbacks.onCloseSaved?.(this.#id),
      onRename: (o, n) => this.#callbacks.onRename?.(o, n),
      onDuplicate: (path) => this.#callbacks.onDuplicate?.(path),
      onReorder: (paths) => this.#callbacks.onReorder?.(this.#id, paths),
      onRevealInExplorer: (path) => this.#callbacks.onRevealInExplorer?.(path),
      onSplitRight: (path) => this.#callbacks.onSplitRight?.(this.#id, path),
      onMoveToOtherPane: (path) => this.#callbacks.onMoveToOtherPane?.(this.#id, path),
      onDropFromOtherPane: (path) => this.#callbacks.onDropFromOtherPane?.(this.#id, path)
    });
    const body = document.createElement("div");
    body.className = "editor-pane__body";
    this.#el.appendChild(body);
    this.#editorContainer = document.createElement("div");
    this.#editorContainer.className = "notebook-editor-container";
    body.appendChild(this.#editorContainer);
    this.#editorContainer.addEventListener("dragover", (e) => {
      if (this.#isExternalTabDrag(e)) {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = "move";
        } catch {
        }
        this.#editorContainer.classList.add("notebook-editor-container--drop-target");
      }
    });
    this.#editorContainer.addEventListener("drop", (e) => {
      if (this.#isExternalTabDrag(e)) {
        e.preventDefault();
        this.#editorContainer.classList.remove("notebook-editor-container--drop-target");
        const filePath = e.dataTransfer.getData("application/x-ecosim-tab") || e.dataTransfer.getData("text/plain");
        if (filePath) {
          this.#callbacks.onDropFromOtherPane?.(this.#id, filePath);
        }
      }
    });
    this.#editorContainer.addEventListener("dragleave", (e) => {
      if (!this.#editorContainer.contains(e.relatedTarget)) {
        this.#editorContainer.classList.remove("notebook-editor-container--drop-target");
      }
    });
    return this.#el;
  }
  /**
   * Update the file list and active tab.
   * @param {Array<{filePath: string, fileType: string, isDirty: boolean}>} tabs
   * @param {string|null} activeFilePath
   */
  syncTabBar(tabs, activeFilePath) {
    this.#tabBar?.update(tabs, activeFilePath);
  }
  /**
   * Set the files assigned to this pane.
   * @param {string[]} filePaths
   */
  setFilePaths(filePaths) {
    this.#filePaths = [...filePaths];
  }
  /**
   * Add a file to this pane's tabs (at end).
   * @param {string} filePath
   */
  addFile(filePath) {
    if (!this.#filePaths.includes(filePath)) {
      this.#filePaths.push(filePath);
    }
  }
  /**
   * Remove a file from this pane's tabs.
   * @param {string} filePath
   */
  removeFile(filePath) {
    this.#filePaths = this.#filePaths.filter((p) => p !== filePath);
    if (this.#previewFilePath === filePath) this.#previewFilePath = null;
    if (this.#activeFilePath === filePath) {
      this.#activeFilePath = this.#filePaths.length > 0 ? this.#filePaths[this.#filePaths.length - 1] : null;
    }
  }
  hasFile(filePath) {
    return this.#filePaths.includes(filePath);
  }
  setActiveFile(filePath) {
    this.#activeFilePath = filePath;
  }
  setFocused(focused) {
    this.#focused = focused;
    this.#el?.classList.toggle("editor-pane--focused", focused);
  }
  markDirty(filePath, isDirty) {
    this.#tabBar?.markDirty(filePath, isDirty);
  }
  reorderFiles(orderedPaths) {
    const valid = orderedPaths.filter((p) => this.#filePaths.includes(p));
    for (const p of this.#filePaths) {
      if (!valid.includes(p)) valid.push(p);
    }
    this.#filePaths = valid;
  }
  renameFile(oldPath, newPath) {
    const idx = this.#filePaths.indexOf(oldPath);
    if (idx !== -1) this.#filePaths[idx] = newPath;
    if (this.#activeFilePath === oldPath) this.#activeFilePath = newPath;
    if (this.#previewFilePath === oldPath) this.#previewFilePath = newPath;
  }
  // ─── Preview (transient) tab ──────────────────────────────────────────────
  /** @returns {string|null} the preview file path, or null if no preview tab */
  get previewFilePath() {
    return this.#previewFilePath;
  }
  /** Mark a file as the preview tab. Only one preview tab per pane. */
  setPreview(filePath) {
    this.#previewFilePath = filePath;
  }
  /** Whether a file is the preview (transient) tab. */
  isPreview(filePath) {
    return this.#previewFilePath === filePath;
  }
  /** Pin the preview tab (promote to permanent). */
  pinPreview() {
    this.#previewFilePath = null;
  }
  /** Check if a drag event is carrying a tab from another pane. */
  #isExternalTabDrag(e) {
    try {
      return e.dataTransfer.types.includes("application/x-ecosim-tab");
    } catch {
      return false;
    }
  }
  dispose() {
    this.#tabBar?.dispose();
    this.#tabBar = null;
    this.#el?.remove();
    this.#el = null;
    this.#editorContainer = null;
    this.#filePaths = [];
    this.#activeFilePath = null;
    this.#previewFilePath = null;
  }
};

// src/editor/monaco_loader.js
var _resolveMonaco;
var _monacoReady = false;
var monacoReady = new Promise((resolve) => {
  _resolveMonaco = resolve;
});
function injectLoaderScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load Monaco loader: ${src}`));
    document.head.appendChild(s);
  });
}
function injectMonacoCss(basePath) {
  const id = "monaco-editor-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `${basePath}/vs/editor/editor.main.css`;
  document.head.appendChild(link);
}
async function initMonaco(basePath) {
  if (!basePath) {
    throw new Error(
      "[twm/editor] initMonaco() needs the path to your copy of Monaco, e.g. initMonaco('vendor/monaco'). Monaco is a peer dependency; the library does not guess where you put it."
    );
  }
  if (_monacoReady) return monacoReady;
  _monacoReady = true;
  injectMonacoCss(basePath);
  if (!window.require) {
    await injectLoaderScript(`${basePath}/vs/loader.js`);
  }
  window.require.config({
    paths: { vs: `${basePath}/vs` },
    "vs/nls": { availableLanguages: {} }
  });
  window.require(["vs/editor/editor.main"], () => {
    _resolveMonaco(window.monaco);
  });
  return monacoReady;
}

// src/editor/monaco_editor_factory.js
var _defaultLanguage = "plaintext";
function setDefaultLanguage(id) {
  if (typeof id === "string" && id) _defaultLanguage = id;
}
function safeDispose(editor) {
  try {
    editor.dispose();
  } catch (e) {
    if (e?.message !== "Canceled") throw e;
  }
}
var ECOSIM_DARK_THEME = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a9955", fontStyle: "italic" },
    { token: "keyword", foreground: "569cd6", fontStyle: "bold" },
    { token: "keyword.directive", foreground: "c586c0", fontStyle: "bold" },
    { token: "keyword.operator", foreground: "569cd6" },
    { token: "constant", foreground: "c586c0" },
    { token: "number", foreground: "b5cea8" },
    { token: "string", foreground: "ce9178" },
    { token: "type.identifier", foreground: "4ec9b0", fontStyle: "bold" },
    { token: "support.function", foreground: "a6e22e" },
    { token: "identifier", foreground: "4fc1ff" },
    { token: "operator", foreground: "d4d4d4" },
    { token: "delimiter", foreground: "808080" }
  ],
  colors: {
    // Layer-2 input well — almost black, matches the EcoAgent
    // three-layer contrast pattern (chrome #1a1a1a, content
    // #212121, input/code #0a0a0a). Makes editable surfaces
    // visually recess from the surrounding cards.
    "editor.background": "#0a0a0a",
    "editor.foreground": "#e0e0e0",
    "editor.lineHighlightBackground": "#161616",
    "editor.selectionBackground": "#264f78",
    "editor.inactiveSelectionBackground": "#1f3350",
    "editorLineNumber.foreground": "#5a5a5a",
    "editorLineNumber.activeForeground": "#c6c6c6",
    "editorCursor.foreground": "#39ff14",
    "editor.findMatchBackground": "#9e6a03",
    "editor.findMatchHighlightBackground": "#f2cc6030",
    "editorIndentGuide.background1": "#2e2e2e",
    "editorIndentGuide.activeBackground1": "#5a5a5a",
    "editorGutter.background": "#0a0a0a",
    // Pop-ups stay slightly lighter so they read as floating
    // surfaces above the editor body, not part of it.
    "editorWidget.background": "#1a1a1a",
    "editorSuggestWidget.background": "#1a1a1a",
    "editorSuggestWidget.border": "#383838",
    "editorSuggestWidget.selectedBackground": "#094771",
    "scrollbarSlider.background": "#4a4a4d40",
    "scrollbarSlider.hoverBackground": "#4a4a4d70"
  }
};
var ECOSIM_LIGHT_THEME = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a737d", fontStyle: "italic" },
    { token: "keyword", foreground: "d73a49", fontStyle: "bold" },
    { token: "keyword.directive", foreground: "6f42c1", fontStyle: "bold" },
    { token: "keyword.operator", foreground: "d73a49" },
    { token: "constant", foreground: "e36209" },
    { token: "number", foreground: "005cc5" },
    { token: "string", foreground: "22863a" },
    { token: "type.identifier", foreground: "005cc5", fontStyle: "bold" },
    { token: "support.function", foreground: "6f42c1" },
    { token: "identifier", foreground: "24292e" },
    { token: "operator", foreground: "d73a49" },
    { token: "delimiter", foreground: "586069" }
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#24292e",
    "editor.lineHighlightBackground": "#f6f8fa",
    "editor.selectionBackground": "#c8d3e6",
    "editorLineNumber.foreground": "#babbbd",
    "editorLineNumber.activeForeground": "#586069",
    "editorCursor.foreground": "#044289",
    "editorGutter.background": "#ffffff",
    "editorWidget.background": "#f6f8fa",
    "editorSuggestWidget.background": "#f6f8fa",
    "editorSuggestWidget.border": "#e1e4e8",
    "scrollbarSlider.background": "#babbbd40",
    "scrollbarSlider.hoverBackground": "#babbbd70"
  }
};
var _themesRegistered = false;
function ensureThemes(monaco) {
  if (_themesRegistered) return;
  _themesRegistered = true;
  monaco.editor.defineTheme("ecosim-dark", ECOSIM_DARK_THEME);
  monaco.editor.defineTheme("ecosim-light", ECOSIM_LIGHT_THEME);
}
function baseOptions(overrides = {}) {
  return {
    language: _defaultLanguage,
    theme: "ecosim-dark",
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    lineHeight: 19.5,
    tabSize: 4,
    insertSpaces: true,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: "gutter",
    matchBrackets: "always",
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
      snippetsPreventQuickSuggestions: false
    },
    quickSuggestions: { other: true, comments: false, strings: false },
    parameterHints: { enabled: true },
    wordWrap: "off",
    fixedOverflowWidgets: true,
    ...overrides
  };
}
function singleLineOptions(overrides = {}) {
  return baseOptions({
    lineNumbers: "off",
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    glyphMargin: false,
    folding: false,
    renderLineHighlight: "none",
    scrollbar: { vertical: "hidden", horizontal: "hidden", handleMouseWheel: false },
    wordWrap: "off",
    overviewRulerLanes: 0,
    padding: { top: 3, bottom: 3 },
    ...overrides
  });
}
var MonacoEditorFactory = class {
  #monaco = null;
  #currentTheme = "ecosim-dark";
  constructor() {
  }
  async init() {
    this.#monaco = await monacoReady;
    ensureThemes(this.#monaco);
    return this;
  }
  get monaco() {
    return this.#monaco;
  }
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
  createEditor(container, initialValue = "", overrides = {}) {
    if (!this.#monaco) throw new Error("MonacoEditorFactory not initialized");
    const { noAutoHeight, ...editorOverrides } = overrides;
    const editor = this.#monaco.editor.create(container, {
      ...baseOptions({ theme: this.#currentTheme }),
      value: initialValue,
      ...editorOverrides
    });
    let minHeight = 80;
    let heightDisposable = null;
    let updateHeight = null;
    if (noAutoHeight) {
      editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
    } else {
      updateHeight = () => {
        const maxHeightEnabled = container.closest(".notebook-editor-container")?.dataset.codeMaxHeight === "true";
        const maxH = maxHeightEnabled ? 400 : Infinity;
        const rawContent = editor.getContentHeight();
        const contentHeight = Math.min(maxH, Math.max(minHeight, rawContent));
        container.style.height = `${contentHeight}px`;
        editor.layout();
        const needsInternalScroll = maxHeightEnabled && rawContent > maxH;
        editor.updateOptions({ scrollbar: { handleMouseWheel: needsInternalScroll } });
      };
      heightDisposable = editor.onDidContentSizeChange(updateHeight);
      updateHeight();
    }
    const editorContainer = container.closest(".notebook-editor-container");
    let maxHeightObserver = null;
    if (updateHeight && editorContainer) {
      maxHeightObserver = new MutationObserver(() => updateHeight());
      maxHeightObserver.observe(editorContainer, { attributes: true, attributeFilter: ["data-code-max-height"] });
    }
    let findWidgetObserver = null;
    const observeFindWidget = () => {
      const overflowGuard = container.querySelector(".overflow-guard");
      if (!overflowGuard) return;
      findWidgetObserver = new MutationObserver(() => {
        const fw = container.querySelector(".find-widget.visible");
        if (fw) fw.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      findWidgetObserver.observe(overflowGuard, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });
    };
    requestAnimationFrame(observeFindWidget);
    return {
      editor,
      getValue: () => editor.getValue(),
      setValue: (v) => {
        if (editor.getValue() !== v) editor.setValue(v);
      },
      onDidChange: (cb) => editor.onDidChangeModelContent(cb),
      focus: () => editor.focus(),
      layout: () => editor.layout(),
      setMinHeight: (h) => {
        minHeight = h;
      },
      updateHeight,
      dispose: () => {
        findWidgetObserver?.disconnect();
        maxHeightObserver?.disconnect();
        heightDisposable?.dispose();
        safeDispose(editor);
      }
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
  createInlineEditor(container, initialValue = "", overrides = {}) {
    if (!this.#monaco) throw new Error("MonacoEditorFactory not initialized");
    container.style.height = "26px";
    const editor = this.#monaco.editor.create(container, {
      ...singleLineOptions({ theme: this.#currentTheme }),
      value: initialValue,
      ...overrides
    });
    editor.onKeyDown((e) => {
      if (e.keyCode === this.#monaco.KeyCode.Enter) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    return {
      editor,
      getValue: () => editor.getValue(),
      setValue: (v) => {
        if (editor.getValue() !== v) editor.setValue(v);
      },
      onDidChange: (cb) => editor.onDidChangeModelContent(cb),
      focus: () => editor.focus(),
      layout: () => editor.layout(),
      dispose: () => safeDispose(editor)
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
  createMarkdownEditor(container, initialValue = "") {
    return this.createEditor(container, initialValue, {
      language: "markdown",
      wordWrap: "on",
      lineNumbers: "off",
      folding: false,
      quickSuggestions: false
    });
  }
  /**
   * Create a read-only DSL viewer (shown in the "DSL" tab of a Godley/parameter cell).
   *
   * @param {HTMLElement} container
   * @param {string} dslContent
   * @returns {EditorHandle}
   */
  createDslViewer(container, dslContent = "") {
    return this.createEditor(container, dslContent, {
      readOnly: true,
      lineNumbers: "off",
      glyphMargin: false,
      folding: false
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
  createDiffEditor(container, originalContent = "", modifiedContent = "", options = {}) {
    const monaco = this.#monaco;
    const language = options.language || "plaintext";
    const originalModel = monaco.editor.createModel(originalContent, language);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language);
    const diffEditor = monaco.editor.createDiffEditor(container, {
      theme: this.#currentTheme,
      readOnly: options.readOnly !== false,
      renderSideBySide: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      renderOverviewRuler: false,
      enableSplitViewResizing: true
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
      }
    };
  }
};
var _factoryInstance = null;
var _monacoBasePath = null;
function setMonacoBasePath(basePath) {
  if (typeof basePath === "string" && basePath) _monacoBasePath = basePath;
}
async function getEditorFactory() {
  if (!_factoryInstance) {
    initMonaco(_monacoBasePath);
    _factoryInstance = await new MonacoEditorFactory().init();
  }
  return _factoryInstance;
}

// src/editor/notebook_search.js
var NotebookSearchBar = class {
  /** @type {HTMLElement} parent container (.notebook-editor-container) */
  #parent = null;
  /** @type {HTMLElement} the search bar root element */
  #el = null;
  /** @type {HTMLInputElement} */
  #searchInput = null;
  /** @type {HTMLInputElement} */
  #replaceInput = null;
  /** @type {HTMLElement} match info label */
  #matchInfo = null;
  // State
  #isOpen = false;
  #showReplace = false;
  #caseSensitive = false;
  #wholeWord = false;
  #useRegex = false;
  // Match tracking
  /** @type {SearchMatch[]} */
  #matches = [];
  #currentIndex = -1;
  // Callbacks into NotebookEditor
  #getCells = null;
  // () => [{ id, type }]
  #getCellRenderer = null;
  // (id) => CellBase|null
  #getCellElement = null;
  // (id) => HTMLElement|null
  #scrollToCell = null;
  // (id) => void
  /**
   * @param {HTMLElement} parent  — .notebook-editor-container
   * @param {{ getCells, getCellRenderer, getCellElement, scrollToCell }} callbacks
   */
  constructor(parent, { getCells, getCellRenderer, getCellElement, scrollToCell }) {
    this.#parent = parent;
    this.#getCells = getCells;
    this.#getCellRenderer = getCellRenderer;
    this.#getCellElement = getCellElement;
    this.#scrollToCell = scrollToCell;
    this.#render();
  }
  get isOpen() {
    return this.#isOpen;
  }
  // ─── Public API ──────────────────────────────────────────────────────────
  open(showReplace = false) {
    this.#isOpen = true;
    this.#showReplace = showReplace;
    this.#el.classList.add("nb-search-bar--open");
    this.#el.querySelector(".nb-search-bar__replace-row").style.display = showReplace ? "" : "none";
    this.#updateToggleIcon();
    const sel = window.getSelection()?.toString()?.trim();
    if (sel && sel.length < 200 && !sel.includes("\n")) {
      this.#searchInput.value = sel;
    }
    this.#searchInput.focus();
    this.#searchInput.select();
    if (this.#searchInput.value) this.#runSearch();
  }
  close() {
    this.#isOpen = false;
    this.#el.classList.remove("nb-search-bar--open");
    this.#clearAllHighlights();
    this.#matches = [];
    this.#currentIndex = -1;
    this.#updateMatchInfo();
  }
  dispose() {
    this.#clearAllHighlights();
    this.#el?.remove();
    this.#el = null;
  }
  // ─── Rendering ───────────────────────────────────────────────────────────
  #render() {
    const el = document.createElement("div");
    el.className = "nb-search-bar";
    el.innerHTML = `
            <div class="nb-search-bar__find-row">
                <button class="nb-search-bar__btn nb-search-bar__toggle-replace" title="Toggle Replace">
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
                <div class="nb-search-bar__input-wrap">
                    <input class="nb-search-bar__input nb-search-bar__find-input"
                           type="text" placeholder="Find" spellcheck="false" />
                </div>
                <span class="nb-search-bar__match-info">No results</span>
                <button class="nb-search-bar__btn" data-action="prev" title="Previous Match (Shift+Enter)">
                    <span class="material-symbols-outlined">arrow_upward</span>
                </button>
                <button class="nb-search-bar__btn" data-action="next" title="Next Match (Enter)">
                    <span class="material-symbols-outlined">arrow_downward</span>
                </button>
                <div class="nb-search-bar__separator"></div>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="case"
                        title="Match Case (Alt+C)">Aa</button>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="word"
                        title="Match Whole Word (Alt+W)">
                    <span class="nb-search-bar__icon-word">ab</span>
                </button>
                <button class="nb-search-bar__btn nb-search-bar__btn--toggle" data-action="regex"
                        title="Use Regular Expression (Alt+R)">.*</button>
                <div class="nb-search-bar__separator"></div>
                <button class="nb-search-bar__btn" data-action="close" title="Close (Escape)">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="nb-search-bar__replace-row" style="display:none">
                <div class="nb-search-bar__spacer"></div>
                <div class="nb-search-bar__input-wrap">
                    <input class="nb-search-bar__input nb-search-bar__replace-input"
                           type="text" placeholder="Replace" spellcheck="false" />
                </div>
                <button class="nb-search-bar__btn" data-action="replace" title="Replace (Ctrl+Shift+1)">
                    <span class="material-symbols-outlined">find_replace</span>
                </button>
                <button class="nb-search-bar__btn" data-action="replace-all" title="Replace All (Ctrl+Alt+Enter)">
                    <span class="material-symbols-outlined">swap_horiz</span>
                </button>
            </div>
        `;
    this.#el = el;
    this.#searchInput = el.querySelector(".nb-search-bar__find-input");
    this.#replaceInput = el.querySelector(".nb-search-bar__replace-input");
    this.#matchInfo = el.querySelector(".nb-search-bar__match-info");
    this.#bindEvents();
    this.#parent.prepend(el);
  }
  #bindEvents() {
    this.#searchInput.addEventListener("input", () => this.#runSearch());
    this.#searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.#navigateNext();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        this.#navigatePrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });
    this.#replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.#doReplace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });
    this.#el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      switch (btn.dataset.action) {
        case "prev":
          this.#navigatePrev();
          break;
        case "next":
          this.#navigateNext();
          break;
        case "close":
          this.close();
          break;
        case "replace":
          this.#doReplace();
          break;
        case "replace-all":
          this.#doReplaceAll();
          break;
        case "case":
          this.#caseSensitive = !this.#caseSensitive;
          btn.classList.toggle("nb-search-bar__btn--active", this.#caseSensitive);
          this.#runSearch();
          break;
        case "word":
          this.#wholeWord = !this.#wholeWord;
          btn.classList.toggle("nb-search-bar__btn--active", this.#wholeWord);
          this.#runSearch();
          break;
        case "regex":
          this.#useRegex = !this.#useRegex;
          btn.classList.toggle("nb-search-bar__btn--active", this.#useRegex);
          this.#runSearch();
          break;
      }
    });
    this.#el.querySelector(".nb-search-bar__toggle-replace").addEventListener("click", () => {
      this.#showReplace = !this.#showReplace;
      this.#el.querySelector(".nb-search-bar__replace-row").style.display = this.#showReplace ? "" : "none";
      this.#updateToggleIcon();
    });
    this.#el.addEventListener("keydown", (e) => {
      if (e.altKey && e.key === "c") {
        e.preventDefault();
        this.#caseSensitive = !this.#caseSensitive;
        this.#el.querySelector('[data-action="case"]').classList.toggle("nb-search-bar__btn--active", this.#caseSensitive);
        this.#runSearch();
      } else if (e.altKey && e.key === "w") {
        e.preventDefault();
        this.#wholeWord = !this.#wholeWord;
        this.#el.querySelector('[data-action="word"]').classList.toggle("nb-search-bar__btn--active", this.#wholeWord);
        this.#runSearch();
      } else if (e.altKey && e.key === "r") {
        e.preventDefault();
        this.#useRegex = !this.#useRegex;
        this.#el.querySelector('[data-action="regex"]').classList.toggle("nb-search-bar__btn--active", this.#useRegex);
        this.#runSearch();
      }
    });
    this.#el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.ctrlKey && (e.key === "f" || e.key === "h")) {
        e.preventDefault();
        if (e.key === "h" && !this.#showReplace) {
          this.#showReplace = true;
          this.#el.querySelector(".nb-search-bar__replace-row").style.display = "";
          this.#updateToggleIcon();
        }
      }
    });
  }
  #updateToggleIcon() {
    const icon = this.#el.querySelector(".nb-search-bar__toggle-replace .material-symbols-outlined");
    if (icon) icon.textContent = this.#showReplace ? "expand_more" : "chevron_right";
  }
  #updateMatchInfo() {
    if (!this.#matchInfo) return;
    if (this.#matches.length === 0) {
      const hasQuery = this.#searchInput?.value?.length > 0;
      this.#matchInfo.textContent = hasQuery ? "No results" : "";
      this.#matchInfo.classList.toggle("nb-search-bar__match-info--no-results", hasQuery);
    } else {
      this.#matchInfo.textContent = `${this.#currentIndex + 1} of ${this.#matches.length}`;
      this.#matchInfo.classList.remove("nb-search-bar__match-info--no-results");
    }
  }
  // ─── Search logic ────────────────────────────────────────────────────────
  #buildQuery() {
    const raw = this.#searchInput.value;
    if (!raw) return null;
    let pattern;
    if (this.#useRegex) {
      try {
        pattern = raw;
        new RegExp(pattern);
      } catch {
        return null;
      }
    } else {
      pattern = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (this.#wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = "g" + (this.#caseSensitive ? "" : "i");
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }
  #runSearch() {
    this.#clearAllHighlights();
    this.#matches = [];
    this.#currentIndex = -1;
    const query = this.#buildQuery();
    if (!query) {
      this.#updateMatchInfo();
      return;
    }
    const cells = this.#getCells();
    for (const { id } of cells) {
      const renderer = this.#getCellRenderer(id);
      if (!renderer) continue;
      const text = renderer.getSearchableText();
      if (!text) continue;
      query.lastIndex = 0;
      let m;
      let indexInCell = 0;
      while ((m = query.exec(text)) !== null) {
        this.#matches.push({ cellId: id, indexInCell, charOffset: m.index });
        indexInCell++;
        if (!query.global) break;
      }
    }
    if (this.#matches.length > 0) {
      this.#currentIndex = 0;
      this.#applyHighlights();
    }
    this.#updateMatchInfo();
  }
  // ─── Navigation ──────────────────────────────────────────────────────────
  #navigateNext() {
    if (this.#matches.length === 0) return;
    this.#currentIndex = (this.#currentIndex + 1) % this.#matches.length;
    this.#applyHighlights();
    this.#scrollToCurrentMatch();
    this.#updateMatchInfo();
  }
  #navigatePrev() {
    if (this.#matches.length === 0) return;
    this.#currentIndex = (this.#currentIndex - 1 + this.#matches.length) % this.#matches.length;
    this.#applyHighlights();
    this.#scrollToCurrentMatch();
    this.#updateMatchInfo();
  }
  #scrollToCurrentMatch() {
    const match = this.#matches[this.#currentIndex];
    if (!match) return;
    this.#scrollToCell(match.cellId);
    requestAnimationFrame(() => {
      const cellEl = this.#getCellElement(match.cellId);
      if (!cellEl) return;
      const active = cellEl.querySelector(".nb-search-match--active");
      if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }
  // ─── Highlighting ────────────────────────────────────────────────────────
  #applyHighlights() {
    const query = this.#buildQuery();
    if (!query) return;
    const matchesByCell = /* @__PURE__ */ new Map();
    for (const m of this.#matches) {
      if (!matchesByCell.has(m.cellId)) matchesByCell.set(m.cellId, []);
      matchesByCell.get(m.cellId).push(m);
    }
    const currentMatch = this.#matches[this.#currentIndex];
    const cells = this.#getCells();
    for (const { id } of cells) {
      const renderer = this.#getCellRenderer(id);
      if (!renderer) continue;
      const cellEl = this.#getCellElement(id);
      if (matchesByCell.has(id)) {
        const activeOffset = currentMatch?.cellId === id ? currentMatch.charOffset : -1;
        renderer.applySearchHighlights(query, activeOffset);
        cellEl?.classList.add("notebook-cell--search-match");
        cellEl?.classList.toggle("notebook-cell--search-active", currentMatch?.cellId === id);
      } else {
        renderer.clearSearchHighlights();
        cellEl?.classList.remove("notebook-cell--search-match", "notebook-cell--search-active");
      }
    }
  }
  #clearAllHighlights() {
    const cells = this.#getCells();
    for (const { id } of cells) {
      const renderer = this.#getCellRenderer(id);
      renderer?.clearSearchHighlights();
      const cellEl = this.#getCellElement(id);
      cellEl?.classList.remove("notebook-cell--search-match", "notebook-cell--search-active");
    }
  }
  // ─── Replace ─────────────────────────────────────────────────────────────
  #doReplace() {
    if (this.#matches.length === 0 || this.#currentIndex < 0) return;
    const match = this.#matches[this.#currentIndex];
    const renderer = this.#getCellRenderer(match.cellId);
    if (!renderer) return;
    const query = this.#buildQuery();
    if (!query) return;
    const replacement = this.#replaceInput.value;
    const success = renderer.replaceMatch(query, match.indexInCell, replacement);
    if (success) {
      const wasIndex = this.#currentIndex;
      this.#runSearch();
      if (this.#matches.length > 0) {
        this.#currentIndex = Math.min(wasIndex, this.#matches.length - 1);
        this.#applyHighlights();
        this.#scrollToCurrentMatch();
        this.#updateMatchInfo();
      }
    }
  }
  #doReplaceAll() {
    const query = this.#buildQuery();
    if (!query || this.#matches.length === 0) return;
    const replacement = this.#replaceInput.value;
    const cellIds = [...new Set(this.#matches.map((m) => m.cellId))];
    let totalReplaced = 0;
    for (const cellId of cellIds) {
      const renderer = this.#getCellRenderer(cellId);
      if (renderer) totalReplaced += renderer.replaceAll(query, replacement);
    }
    if (totalReplaced > 0) this.#runSearch();
  }
};

// src/editor/notebook_undo_manager.js
var NotebookUndoManager = class {
  /** @type {Array<{ description: string, undo: Function, redo: Function }>} */
  #undoStack = [];
  /** @type {Array<{ description: string, undo: Function, redo: Function }>} */
  #redoStack = [];
  /** @type {number} */
  #maxSize;
  /** @type {Function|null} Called with (canUndo: boolean, canRedo: boolean) after each change */
  #onStateChange;
  /** @type {boolean} Prevents re-entrant undo/redo */
  #applying = false;
  /**
   * @param {{ maxSize?: number, onStateChange?: Function }} opts
   */
  constructor({ maxSize = 100, onStateChange = null } = {}) {
    this.#maxSize = maxSize;
    this.#onStateChange = onStateChange;
  }
  // ─── Public API ───────────────────────────────────────────────────────────
  get canUndo() {
    return this.#undoStack.length > 0;
  }
  get canRedo() {
    return this.#redoStack.length > 0;
  }
  /**
   * Record a new command.  Clears the redo stack.
   * Should NOT be called from inside undo/redo callbacks.
   *
   * @param {{ description: string, undo: Function, redo: Function }} command
   */
  push(command) {
    if (this.#applying) return;
    this.#undoStack.push(command);
    if (this.#undoStack.length > this.#maxSize) {
      this.#undoStack.shift();
    }
    this.#redoStack = [];
    this.#notify();
  }
  /**
   * Undo the last command.
   * @returns {Promise<boolean>} true if something was undone
   */
  async undo() {
    const cmd = this.#undoStack.pop();
    if (!cmd) return false;
    this.#applying = true;
    try {
      await cmd.undo();
    } finally {
      this.#applying = false;
    }
    this.#redoStack.push(cmd);
    this.#notify();
    return true;
  }
  /**
   * Redo the last undone command.
   * @returns {Promise<boolean>} true if something was redone
   */
  async redo() {
    const cmd = this.#redoStack.pop();
    if (!cmd) return false;
    this.#applying = true;
    try {
      await cmd.redo();
    } finally {
      this.#applying = false;
    }
    this.#undoStack.push(cmd);
    this.#notify();
    return true;
  }
  /** Reset both stacks (e.g., after file load). */
  clear() {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#notify();
  }
  // ─── Private ──────────────────────────────────────────────────────────────
  #notify() {
    this.#onStateChange?.(this.canUndo, this.canRedo);
  }
};

// src/editor/split_pane_container.js
var SplitPaneContainer = class {
  /** @type {HTMLElement} */
  #container = null;
  /** @type {HTMLElement} */
  #pane1 = null;
  /** @type {HTMLElement} */
  #pane2 = null;
  /** @type {HTMLElement} */
  #divider = null;
  /** @type {number} 0..1, fraction of width for pane 1 */
  #ratio = 0.5;
  /** @type {boolean} */
  #isSplit = false;
  /** @type {Function|null} */
  #onRatioChanged = null;
  // Drag state
  #dragging = false;
  #boundOnMouseMove = null;
  #boundOnMouseUp = null;
  /**
   * @param {{ onRatioChanged?: (ratio: number) => void }} opts
   */
  constructor(opts = {}) {
    this.#onRatioChanged = opts.onRatioChanged ?? null;
  }
  get isSplit() {
    return this.#isSplit;
  }
  get ratio() {
    return this.#ratio;
  }
  mount(container) {
    this.#container = container;
    this.#container.classList.add("split-pane-container");
    this.#container.innerHTML = "";
    this.#divider = document.createElement("div");
    this.#divider.className = "split-pane-divider";
    this.#divider.addEventListener("mousedown", (e) => this.#onDividerMouseDown(e));
    this.#applyLayout();
  }
  /**
   * Set pane elements. Pass one element for single view, two for split.
   * @param {HTMLElement} pane1
   * @param {HTMLElement} [pane2]
   */
  setPanes(pane1, pane2) {
    this.#pane1 = pane1;
    this.#pane2 = pane2 ?? null;
    this.#isSplit = !!pane2;
    this.#applyLayout();
  }
  /**
   * Set the split ratio (fraction for left pane).
   * @param {number} ratio — 0.2..0.8
   */
  setRatio(ratio) {
    this.#ratio = Math.max(0.2, Math.min(0.8, ratio));
    if (this.#isSplit) this.#applySizes();
  }
  /**
   * Collapse to single pane (left). Returns the removed right pane element.
   * @returns {HTMLElement|null}
   */
  unsplit() {
    if (!this.#isSplit) return null;
    const removed = this.#pane2;
    this.#pane2 = null;
    this.#isSplit = false;
    this.#applyLayout();
    return removed;
  }
  dispose() {
    this.#stopDrag();
    this.#container = null;
    this.#pane1 = null;
    this.#pane2 = null;
    this.#divider = null;
  }
  // ─── Layout ──────────────────────────────────────────────────────────────
  #applyLayout() {
    if (!this.#container) return;
    this.#container.innerHTML = "";
    if (!this.#pane1) return;
    if (!this.#isSplit) {
      this.#pane1.className = "split-pane";
      this.#pane1.style.flex = "1 1 0";
      this.#pane1.style.minWidth = "0";
      this.#container.appendChild(this.#pane1);
      this.#container.classList.remove("split-pane-container--split");
    } else {
      this.#pane1.className = "split-pane";
      this.#pane2.className = "split-pane";
      this.#pane1.style.minWidth = "0";
      this.#pane2.style.minWidth = "0";
      this.#container.appendChild(this.#pane1);
      this.#container.appendChild(this.#divider);
      this.#container.appendChild(this.#pane2);
      this.#container.classList.add("split-pane-container--split");
      this.#applySizes();
    }
  }
  #applySizes() {
    if (!this.#pane1 || !this.#pane2) return;
    const r = this.#ratio;
    this.#pane1.style.flex = `${r} 1 0`;
    this.#pane2.style.flex = `${1 - r} 1 0`;
  }
  // ─── Divider drag ────────────────────────────────────────────────────────
  #onDividerMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.#dragging = true;
    this.#divider.classList.add("split-pane-divider--active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    this.#container.querySelectorAll("iframe").forEach((f) => f.style.pointerEvents = "none");
    this.#boundOnMouseMove = (e2) => this.#onMouseMove(e2);
    this.#boundOnMouseUp = () => this.#onMouseUp();
    document.addEventListener("mousemove", this.#boundOnMouseMove);
    document.addEventListener("mouseup", this.#boundOnMouseUp);
  }
  #onMouseMove(e) {
    if (!this.#dragging || !this.#container) return;
    const rect = this.#container.getBoundingClientRect();
    const dividerWidth = this.#divider.offsetWidth;
    const usable = rect.width - dividerWidth;
    if (usable <= 0) return;
    const x = e.clientX - rect.left - dividerWidth / 2;
    const ratio = Math.max(0.2, Math.min(0.8, x / usable));
    this.#ratio = ratio;
    this.#applySizes();
  }
  #onMouseUp() {
    this.#stopDrag();
    this.#onRatioChanged?.(this.#ratio);
  }
  #stopDrag() {
    if (!this.#dragging) return;
    this.#dragging = false;
    this.#divider?.classList.remove("split-pane-divider--active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.#container?.querySelectorAll("iframe").forEach((f) => f.style.pointerEvents = "");
    document.removeEventListener("mousemove", this.#boundOnMouseMove);
    document.removeEventListener("mouseup", this.#boundOnMouseUp);
    this.#boundOnMouseMove = null;
    this.#boundOnMouseUp = null;
  }
};
export {
  EditorPane,
  MonacoEditorFactory,
  NotebookSearchBar,
  NotebookTabBar,
  NotebookUndoManager,
  SplitPaneContainer,
  getEditorFactory,
  initMonaco,
  monacoReady,
  setDefaultLanguage,
  setMonacoBasePath
};
//# sourceMappingURL=editor.js.map
