/**
 * What `@flexdesk/flow` exports for the CANVAS editor (36 §5).
 *
 * OWNED BY the canvas agent (B, 36 §2 and §5): `createCanvasEditor`, its
 * closed action list, its words, the node box its edges are anchored by, and
 * the pure geometry under it (Arrange's `layoutGraph`, a port's anchor, a loop's
 * return line).
 */

export { createCanvasEditor, CANVAS_ACTIONS } from './editor.js';
export { CANVAS_STRINGS } from './strings.js';
export { CANVAS_NODE, layoutGraph, portAnchor, nodeBottom, isReturnEdge } from './layout.js';
