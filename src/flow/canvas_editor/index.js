/**
 * What `@flexdesk/flow` exports for the CANVAS editor (36 §5).
 *
 * OWNED BY the canvas agent (B, 36 §2 and §5): `createCanvasEditor`, its
 * closed action list, its words, the node box its edges are anchored by, and
 * the pure geometry under it. The geometry is exported under canvas-prefixed
 * names, because `flow.js` re-exports three editors with `export *`, and two
 * modules exporting one name make that name silently vanish from the barrel.
 */

export { createCanvasEditor, CANVAS_ACTIONS } from './editor.js';
export { CANVAS_STRINGS } from './strings.js';
export {
    CANVAS_NODE, layoutGraph as arrangeCanvasGraph, portAnchor as canvasPortAnchor, nodeBottom as canvasNodeBottom,
    isReturnEdge as isCanvasReturnEdge,
} from './layout.js';
