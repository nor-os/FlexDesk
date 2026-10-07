/**
 * The shared flow-editor kit (36 §3) — what every one of the three editors
 * stands on, and what `@flexdesk/flow` exports for a consumer that builds its
 * own. OWNED BY the kit agent (A); frozen once it lands.
 */

export { FLOW_STRINGS, createStrings, say } from './strings.js';
export {
    TONES, el, icon, button, toneClass, toneOf, uid, openPopover, closeFlowPopovers, openFlowPopover, nextOption,
} from './dom.js';
export {
    SETTINGS_SCHEMA_ANNOTATIONS, SETTINGS_SCHEMA_KEYWORDS, SETTINGS_SCHEMA_TYPES, UI_HINTS,
    checkSettingsSchema, fieldsFromSchema, fieldVisible, visibleFields, whenKeys, titleOf, enumLabel,
    primaryType, admittedTypes, pyRepr,
} from './settings_schema.js';
export { createStepCatalogue, defaultIdBase } from './catalogue.js';
export {
    createReferenceSyntax, TEMPLATE_REFERENCES, FORMULA_REFERENCES, PARAMETER_REFERENCES,
    findReferences, tokenize, describeReference, resolveSyntaxes, pathSegments,
} from './references.js';
export { createChipInput } from './chip_input.js';
export {
    createWidgetRegistry, GENERIC_WIDGETS, DEFAULT_WIDGET_REFERENCES, renderField, shownValue, typedValue,
    fitToText,
} from './widgets.js';
export { createSettingsPanel } from './settings_panel.js';
export { openStepPicker } from './step_picker.js';
export { openValuePicker } from './value_picker.js';
export { alwaysBefore, enclosingLoops, enclosingArms, flowStructure, DEFAULT_LOOP_PORTS } from './always_before.js';
export {
    groupFindings, findingsList, createFindingsStrip, matchFindingField, isPathPrefix,
} from './findings.js';
export { FlowHistory } from './history.js';
export { bindFlowKeys, ownsUndo, isTextField, isOwnControl } from './keys.js';
export {
    ID_OK, LOGIC_GRAPH_STRINGS, emptyGraph, normalise, serialise, nextId, addNode, removeNode, moveNode,
    canConnect, connect, disconnect, sameEdge, inputNamesOf,
} from './logic_graph.js';
