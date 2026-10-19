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
    // `collapsible`
    collapseNode: 'Fold this step to its header',
    expandNode: 'Show this step\'s ports again',
    connection: 'Connection',
    connectionLine: (e) => `${e.source} · ${e.sourcePort} → ${e.target} · ${e.targetPort}`,
    removeConnection: 'Remove connection',
    portCount: (n) => `×${n}`,
    portNotTaken: 'not taken',
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
    routingFallback: (n) => `More than ${n} steps: the lines are drawn as plain curves, not routed round the steps.`,
});
