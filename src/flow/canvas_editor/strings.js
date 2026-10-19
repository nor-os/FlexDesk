/**
 * The canvas editor's own words (36 §3.13), laid over the kit's `FLOW_STRINGS`
 * and under the consumer's: `createStrings(CANVAS_STRINGS, options.strings)`.
 *
 * English, and they name no domain. What a consumer calls a loop's next pass
 * ("the next row") or how a data port is read (`${…}`) is the consumer's, given
 * through `strings` and the `dataPortRead` option.
 */

/** `1 step`, `2 notes`, …; a count of none is left out of what is said. */
const counted = (steps, notes) => [[steps, 'step'], [notes, 'note']].filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(' and ');

export const CANVAS_STRINGS = Object.freeze({
    palette: 'Steps',
    canvasLabel: 'Flow canvas',
    toolbarLabel: 'Flow',
    arrange: 'Arrange',
    arrangeTitle: 'Lay the steps out left to right, in the order a run takes them',
    fit: 'Fit',
    fitTitle: 'Show the whole flow',
    zoomOut: 'Zoom out',
    zoomOutTitle: 'Make the flow smaller, one step',
    zoomIn: 'Zoom in',
    zoomInTitle: 'Make the flow larger, one step',
    zoomReset: '100%',
    zoomResetTitle: 'Show the flow at its natural size',
    zoomAtMin: 'This is as small as the flow is drawn.',
    zoomAtMax: 'This is as large as the flow is drawn.',
    minimapTitle: 'Click to move the view there',
    nothingToUndo: 'There is nothing to undo.',
    nothingToRedo: 'There is nothing to redo.',
    arrangeNeedsTwo: 'Arrange needs two steps or more.',
    readOnlyRefusal: 'This flow is read only.',
    connectFrom: 'Click, then click the input to connect to',
    connectTo: 'Connect an output here',
    connectStarted: 'Now click the input to connect to. Esc cancels.',
    connectFirst: 'Click an output first, then this input.',
    dataPort: (how) => (how ? `Read it in a later step as ${how}` : 'A data port: it is read, not connected.'),
    dropHere: 'Drop a step on the canvas to add it.',
    returnLine: 'Back to the loop for its next pass',
    connectedReturn: 'Goes round the loop again.',
    unknownType: (type) => `There is no step type "${type}".`,
    renderFailed: (name, why) => `${name} could not draw its body${why ? `: ${why}` : '.'}`,
    updateFailed: (name, why) => `${name} could not bring its body up to date${why ? `: ${why}` : '.'}`,
    stepId: (id) => `Step id: ${id}`,
    // `renameInPlace`
    nameEmpty: 'A step needs a name: the one it had is kept.',
    // `collapsible`
    collapseNode: 'Fold this step to its header',
    expandNode: 'Show this step\'s ports again',
    connection: 'Connection',
    connectionLine: (e) => `${e.source} · ${e.sourcePort} → ${e.target} · ${e.targetPort}`,
    removeConnection: 'Remove connection',
    portCount: (n) => `×${n}`,
    portNotTaken: 'not taken',

    // ── under the `connections` option ───────────────────────────────
    connectTypes: ({ from, fromStep, to, toStep, accepts, provides }) => `${to} on ${toStep} takes `
        + `${accepts.join(' or ')}, and ${from} on ${fromStep} gives ${provides.join(' or ')}.`,
    connectRefused: 'These two cannot be connected.',
    connectDrag: 'Drop it on an input to connect, or on the canvas to add a step there. Esc cancels.',
    dropOnInput: 'Drop the line on an input to connect it.',
    dropPickerTitle: 'Add a step and connect it',
    dropNothingFits: 'No step has an input this output can connect to.',
    offerAccept: 'Accept',
    offerDismiss: 'Not now',

    // `multiSelect`
    alignLeft: 'Align left edges',
    alignCenter: 'Align centres',
    alignRight: 'Align right edges',
    alignTop: 'Align top edges',
    alignMiddle: 'Align middles',
    alignBottom: 'Align bottom edges',
    distributeHorizontal: 'Distribute horizontally',
    distributeVertical: 'Distribute vertically',
    alignNeedsTwo: 'Pick two steps or more to align them.',
    distributeNeedsThree: 'Pick three steps or more to distribute them.',
    stepsPicked: (n) => `${n} steps picked`,
    stepsPickedLine: 'Drag one to move them all. The arrow keys nudge them.',
    removeSteps: (n) => (n === 1 ? 'Remove 1 step' : `Remove ${n} steps`),
    // `groups`
    group: 'Group',
    groupTitle: 'Group the picked steps (Ctrl+G)',
    ungroup: 'Ungroup',
    ungroupTitle: 'Ungroup the groups the picked steps are in (Ctrl+Shift+G)',
    groupNeedsOne: 'Pick the steps to group first.',
    ungroupNeedsGroup: 'None of the picked steps is in a group.',
    groupUntitled: 'Group',
    groupName: 'Group name',
    // `notes`
    note: 'Note',
    noteTitle: 'Add a note to the canvas',
    noteKind: 'Note',
    noteText: 'Note text',
    noteEmpty: 'Empty note — double-click to write in it',
    removeNote: 'Remove note',
    itemsPicked: (steps, notes) => `${counted(steps, notes)} picked`,
    removeItems: (n) => (n === 1 ? 'Remove 1 item' : `Remove ${n} items`),
    // `clipboard`
    copyLabel: (title, n) => (n > 1 ? `${title} (copy ${n})` : `${title} (copy)`),
    copied: (n) => (n === 1 ? 'Copied 1 step.' : `Copied ${n} steps.`),
    cutDone: (n) => (n === 1 ? 'Cut 1 step.' : `Cut ${n} steps.`),
    // a copy or a cut that took notes too (`notes`)
    copiedItems: (steps, notes) => `Copied ${counted(steps, notes)}.`,
    cutDoneItems: (steps, notes) => `Cut ${counted(steps, notes)}.`,
    nothingPicked: 'Pick a step first.',
    cannotCopy: 'None of the picked steps can be copied.',
    cannotCut: 'None of the picked steps can be removed, so none can be cut.',
    nothingToPaste: 'There is nothing to paste.',
    pasteNotSteps: 'What is on the clipboard is not steps of a flow.',
    notAddable: (name) => `‘${name}’ cannot be added to this flow.`,
    clipboardFailed: 'The clipboard could not be reached.',
    routingFallback: (n) => `More than ${n} steps: the lines are drawn as plain curves, not routed round the steps.`,
});
