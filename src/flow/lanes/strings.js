/**
 * EVERY WORD THE LANE EDITOR DRAWS, over the kit's (36 §3.13). English, and
 * naming no domain: a step, a source, a lane, a value. A consumer lays its own
 * words over these with the editor's `strings` option.
 */

const count = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : String(n));
const plural = (n, one, many) => (Number(n) === 1 ? one : many.replace('{n}', count(n)));

export const LANE_STRINGS = Object.freeze({
    // ── the lanes ──────────────────────────────────────────────────────
    lanesLabel: 'The flow, left to right',
    laneName: (n, title) => `Lane ${n}: ${title}`,
    laneNameUnconnected: (n, title) => `Lane ${n}: ${title} — not connected`,
    notConnected: 'Not connected',
    cardLabel: (kind, title, status) => (status ? `${kind}: ${title}, ${status}` : `${kind}: ${title}`),
    addAfter: (title) => `Add a step after ${title}`,
    addSourceTitle: 'Add a source',
    startsLane: 'starts a new lane',
    afterStep: (title) => `after ${title}`,
    addHint: '“+” on a step adds the next one. A join takes its other input from another lane; '
        + 'the lines are drawn for you, never by hand.',
    emptyFlow: 'Nothing here yet. A source starts the first lane.',
    stepMenu: (title) => `${title}: what to do`,
    openSettings: 'Open its settings',
    addStepAfter: 'Add a step after it',

    // ── the toolbar ────────────────────────────────────────────────────
    toolbar: 'Flow',
    readOnlyTitle: 'This flow is open to read only.',

    // ── parameters ─────────────────────────────────────────────────────
    parameters: 'Parameters',
    addParameter: 'Add parameter',
    parameterTitle: 'Parameter',
    parameterLine: (type, value) => (value === undefined ? String(type ?? '') : `${type ?? ''} · default ${value}`),
    parameterAria: (name, line) => `Parameter ${name}: ${line}`,
    parameterHelp: (ref) => `Steps read it as ${ref}.`,
    parameterSupplied: 'Whatever starts the flow supplies it.',
    parameterName: 'Name',
    parameterType: 'Type',
    parameterDefault: 'Default',
    parameterNoDefault: 'No default',
    parameterDescription: 'Description',
    parameterSave: 'Save',
    parameterCancel: 'Cancel',
    parameterRemove: 'Remove parameter',
    parameterNameRule: 'A name starts with a letter or _ and goes on with letters, digits or _.',
    parameterNameTaken: (name) => `There is already a parameter called ${name}.`,
    parameterNotNumber: 'The default must be a number.',
    parameterNotInteger: 'The default must be a whole number.',

    // ── a step's settings ──────────────────────────────────────────────
    thisLane: 'This lane',
    thisLaneHelp: 'The step before it, in its own lane.',
    connectIt: 'Choose the step it follows.',
    joinedWith: 'Joined with',
    joinedWithPort: (label) => `Joined with (${label})`,
    joinedWithHelp: 'Any step in another lane, to the left of this one.',
    laneRelation: (delta, lane) => (delta === 0 ? 'this lane' : delta === 1 ? 'the lane below'
        : delta === -1 ? 'the lane above' : `lane ${lane}`),
    candidate: (title, relation) => `${title} — ${relation}`,
    chooseStep: 'Choose a step to see its settings.',
    flowTab: 'The flow',
    flowTitle: 'The flow',
    flowType: 'Settings',
    stepsLabel: 'Steps',

    // ── the dock ───────────────────────────────────────────────────────
    dataLabel: 'What this step gives',
    previewTab: 'Preview',
    columnsTab: (n) => `Columns · ${count(n)}`,
    rejectsTab: (n) => `Would be rejected · ${count(n)}`,
    previewOn: (ms) => `Preview on · refreshed ${count(ms)} ms after your last change`,
    previewing: 'Previewing…',
    previewFailed: 'The preview could not be read.',
    previewOff: 'No preview here.',
    noPreview: 'Nothing previewed for this step yet.',
    previewCaption: (shown, total) => `First ${count(shown)} of ${count(total)} previewed rows.`,
    columnsFromDescription: (n) => `${plural(n, '1 column', '{n} columns')}, from the step’s description — no run needed.`,
    columnsFromPreview: (n) => `${plural(n, '1 column', '{n} columns')}, from the preview.`,
    columnsUnknown: 'No columns known for this step yet.',
    columnNew: 'new',
    columnChanged: 'changed',
    rejectsCaption: (n) => `${plural(n, '1 of the previewed rows would be rejected.', '{n} of the previewed rows would be rejected.')}`,
    noRejects: 'No previewed row would be rejected.',
    rejectReason: (column, reason) => (column ? `${column}: ${reason}` : String(reason ?? '')),
    noRows: 'No rows.',

    // ── what a card's status line says ─────────────────────────────────
    rows: (n) => plural(n, '1 row', '{n} rows'),
    rejected: (n) => `${count(n)} rejected`,
    skipped: 'skipped',
    stepFailed: 'failed in the preview',
    notRun: 'Not in the last run',
    noRun: 'No run to show',
    pending: '…',
});
