/**
 * The canvas editor's own words (36 §3.13), laid over the kit's `FLOW_STRINGS`
 * and under the consumer's: `createStrings(CANVAS_STRINGS, options.strings)`.
 *
 * English, and they name no domain. What a consumer calls a loop's next pass
 * ("the next row") or how a data port is read (`${…}`) is the consumer's, given
 * through `strings` and the `dataPortRead` option.
 */

export const CANVAS_STRINGS = Object.freeze({
    palette: 'Steps',
    canvasLabel: 'Flow canvas',
    toolbarLabel: 'Flow',
    arrange: 'Arrange',
    arrangeTitle: 'Lay the steps out left to right, in the order a run takes them',
    fit: 'Fit',
    fitTitle: 'Show the whole flow',
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
    stepId: (id) => `Step id: ${id}`,
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
    offerStale: 'The flow changed, so that suggestion no longer applies.',
});
