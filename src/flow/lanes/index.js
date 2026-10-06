/**
 * What `@flexdesk/flow` exports for the LANE editor (`createLaneEditor`):
 * a data flow drawn as lanes, left to right (36 §7).
 *
 * OWNED BY the lanes agent (D, 36 §2 and §7).
 *
 *   editor.js    createLaneEditor — the editor, and its compact strip
 *   layout.js    layoutLanes, placeLanes — PURE: lanes, columns and wires
 *   pipeline.js  the flow's JSON and every edit the editor makes to it — PURE
 *   preview.js   the debounced provider runner: the newest answer wins
 *   strings.js   every word it draws
 *
 * Every name is the lane editor's own — `lane…`, `LANE_…`, `…Pipeline` — so the
 * three editors' `export *` in `flow.js` cannot collide; the pure edits are one
 * namespace, `lanePipeline`, rather than a dozen loose verbs.
 */

export { createLaneEditor } from './editor.js';
export {
    LANE_GEOMETRY, LANE_PAD, LANE_GAP, CW as LANE_CW, CH as LANE_CH, GAP as LANE_COLUMN_GAP,
    LAYOUT_STRINGS as LANE_LAYOUT_STRINGS, layoutLanes, placeLanes, stepPorts as laneStepPorts,
} from './layout.js';
export { LANE_ACTIONS, emptyPipeline, normalisePipeline, serialisePipeline } from './pipeline.js';
export * as lanePipeline from './pipeline.js';
export { createPreviewRunner as createLanePreviewRunner } from './preview.js';
export { LANE_STRINGS } from './strings.js';
