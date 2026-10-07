/**
 * What `@flexdesk/flow` exports for the OUTLINE editor (36 §6): the editor,
 * and the pure parts under it for a consumer that wants to read or check an
 * outline without drawing one — the recogniser and its inverse, the block
 * mapping, the operations.
 *
 * OWNED BY the outline agent (C, 36 §2). Every name says "outline", so the
 * three editors' barrels never export one name twice through `flow.js`.
 */

export { createOutlineEditor, OUTLINE_ACTIONS, OUTLINE_INDENT } from './editor.js';
export { OUTLINE_STRINGS } from './strings.js';
export { createBlockMapping as createOutlineBlocks, displayName as outlineStepName } from './mapping.js';
export {
    outlineFromGraph, graphFromOutline, describeOutline,
    sameGraphAsSets as outlineGraphsEqual, indexTree as indexOutline, runOrder as outlineRunOrder,
    flatRunOrder as outlineFlatOrder,
} from './recognise.js';
export { createOutlineOperations } from './operations.js';
export { openStepMenu as openOutlineStepMenu } from './menu.js';
