/**
 * EVERY WORD A FLOW EDITOR DRAWS (36 §3.13).
 *
 * The defaults are English and name no domain: a step, a source, a value. What
 * a consumer calls its parts — what an error port means, what a loop's foot
 * says — comes from the consumer's `strings`, or from an editor's block
 * mapping, and is never guessed here.
 *
 * A string is text, or a function of its arguments for the ones that count or
 * quote something (`stepsInside(3)`). `createStrings(...layers)` lays the
 * layers over the defaults left to right, so an editor lays its own defaults
 * over the kit's and the consumer's over both:
 *
 *     const strings = createStrings(OUTLINE_STRINGS, options.strings);
 *
 * `say(strings, key, ...args)` reads one either way, and falls back to the key
 * itself — a missing string shows as its name on the screen, which a reader
 * reports, rather than as an empty label nobody notices.
 */

const plural = (n, one, many) => (n === 1 ? one : many.replace('{n}', String(n)));

export const FLOW_STRINGS = Object.freeze({
    // ── the words every editor shares ──────────────────────────────────
    step: 'step',
    steps: 'steps',
    addStep: 'Add a step',
    removeStep: 'Remove step',
    duplicate: 'Duplicate',
    rename: 'Rename',
    undo: 'Undo',
    redo: 'Redo',
    undoTitle: 'Undo (Ctrl+Z)',
    redoTitle: 'Redo (Ctrl+Y)',
    foldAll: 'Fold all',
    unfoldAll: 'Unfold all',
    stepsInside: (n) => plural(n, '1 step inside', '{n} steps inside'),
    stepsShow: 'Steps show',
    thePreview: 'The preview',
    theLastRun: 'The last run',
    addSource: 'Add a source — starts a new lane',
    settings: 'Settings',
    readOnly: 'Read only',

    // ── the settings panel and its fields ──────────────────────────────
    required: ' *',
    requiredLabel: 'required',
    choose: 'Choose…',
    defaultOption: (v) => `Default (${v})`,
    notFound: (v) => `${v} (not found)`,
    noControl: 'This setting has no control in this editor; its value is kept as it is.',
    unknownWidget: (name) => `This setting needs the "${name}" control, which this editor does not have. `
        + 'Its value is kept as it is.',
    foldDefaults: 'Defaults',
    add: 'Add',
    remove: 'Remove',
    removeNamed: (what) => `Remove ${what}`,
    addAssignment: 'Add assignment',
    name: 'Name',
    value: 'Value',
    formula: 'Formula',
    textOrValue: 'Text, or insert a value',
    noColumns: 'There are no columns to choose from yet: connect a step before this one.',
    noColumnsChosen: 'None chosen',
    fieldFinding: 'Fix this before publishing',

    // ── reference chips and Insert a value ─────────────────────────────
    insertValue: 'Insert a value',
    insertValueGlyph: '{ }',
    searchValues: 'Search values',
    wholeValue: (label) => `All of ${label}`,
    back: 'Back',
    insertsLine: (ref) => `Inserts ${ref} — shown as a chip, kept as text.`,
    noValues: 'Nothing to insert here yet.',
    valueKeys: '↑ ↓ choose · Enter inserts · Esc closes',

    // ── the step picker ────────────────────────────────────────────────
    searchSteps: 'Search steps',
    pickerKeys: '↑ ↓ choose · Enter adds · Esc closes',
    pasteStep: 'Paste a copied step · Ctrl+V',
    nothingMatches: (q) => `Nothing matches “${q}”.`,

    // ── findings ───────────────────────────────────────────────────────
    toFix: (n) => plural(n, '1 thing to fix before this can be published.',
                         '{n} things to fix before this can be published.'),
    toLookAt: (n) => plural(n, '1 thing to look at.', '{n} things to look at.'),
    goToIt: 'Go to it',
    theFlow: 'The flow',
    findingLine: (where, message) => (where ? `${where} — ${message}` : message),
});

/** The defaults with each layer laid over them, left to right; frozen. */
export function createStrings(...layers) {
    return Object.freeze(Object.assign({}, FLOW_STRINGS, ...layers.filter((l) => l && typeof l === 'object')));
}

/** One string: text as it is, a function called with `args`, the key when absent. */
export function say(strings, key, ...args) {
    const s = strings?.[key] ?? FLOW_STRINGS[key];
    if (typeof s === 'function') return s(...args);
    return s === undefined || s === null ? String(key) : String(s);
}
