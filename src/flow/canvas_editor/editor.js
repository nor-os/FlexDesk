/**
 * THE CANVAS EDITOR — a flow drawn as nodes and lines (36 §5).
 *
 * Three columns — the step palette, the canvas, the settings of whatever is
 * picked — under a toolbar: Undo, Redo, Arrange, Fit, then the consumer's own
 * verbs. It is a designer that was built for one product and moved here MINUS
 * everything that was that product's: loading, saving, autosave, validating,
 * publishing, running and a run's records are all the consumer's, reached
 * through options and callbacks. What stayed is what any flow on a canvas
 * needs.
 *
 * ══ THE EDITOR DECIDES NOTHING A PUBLISH DEPENDS ON ═════════════════════
 *
 * Whether the graph is a valid flow is the consumer's validator's answer,
 * handed in as findings and drawn where it applies: one with a `node_id` on
 * that node (and on its field while its settings are open), every one of them
 * in the strip with *Go to it*. The editor has no validator of its own to
 * disagree with. `canConnect` refuses only what the canvas cannot DRAW
 * honestly — a port that does not exist, a flow line into a data port, a
 * second line out of a port that carries one, a step connected to itself —
 * each refusal a sentence on the screen.
 *
 * ══ THE EDITOR NEVER FETCHES, NEVER SAVES, NEVER STARTS A TIMER THAT WRITES
 *
 * Every committed edit calls `onChange({graph, flowSettings, text, action,
 * key})` and the CONSUMER autosaves — undo and redo included (`via: 'undo'` or
 * `'redo'`), because an undo is a change to what the consumer holds. `load` is
 * a baseline, so opening a flow and looking at it makes nothing to undo; a
 * consumer's publish is a baseline too (`history.baseline(editor.snapshot())`).
 * `destroy` flushes nothing, because nothing is held (a viewport report
 * waiting for the wheel to settle is told, not saved: see below).
 *
 * ══ THE KEYS STOP AT THIS ROOT ══════════════════════════════════════════
 *
 * `bindFlowKeys` binds on the editor's root and stops Ctrl+Z there even inside
 * a text field (whose own undo is the browser's), so a tile beside it that
 * listens on `window` never hears it. Backspace is never the editor's: Delete
 * removes the picked step or line. And a panel repaint that takes the focused
 * control away puts focus back on the rebuilt control of the same field — or,
 * when that field is gone, on the canvas; never on `<body>`, where the keys
 * never arrive. A repaint the reader did not ask for (a run overlay, new
 * findings) rebuilds no field at all.
 *
 * ══ GESTURES ════════════════════════════════════════════════════════════
 *
 * Separated by WHERE the press lands: a node's header moves it; a port
 * connects, by click-then-click (an output, then an input) — which is also
 * what a render test can drive, where a drag ending in `elementFromPoint`
 * cannot be. No press rebuilds a node: pressing a header toggles classes, so
 * the node the click lands on is the node the press went down on (a click
 * fires only when press and release land on the same node).
 *
 * A palette step is added by a CLICK (at the centre of the view) or by a DRAG
 * onto the canvas (where it is dropped). The drag is pointer events on the
 * palette button and a ghost on `document.body` — NEVER `draggable` (a native
 * drag cancels the pointer at ~5 px) and NEVER `setPointerCapture` (capture
 * retargets the release, and then the click, to the button, which would add a
 * second step). A drag swallows the click that follows it; Escape,
 * `pointercancel` and a destroy each take the ghost away.
 *
 * ══ UNDER `connections` ═════════════════════════════════════════════════
 *
 * With the option every line is asked of `connectionRules` (the kernel's
 * `ConnectorRouter` over the catalogue's port descriptors, the port types,
 * then the host's `policy`); `dataPorts: 'connect'` makes data ports
 * connectable, any number of lines out of one. An output can also be DRAGGED:
 * released on an input it connects, on the empty canvas it opens the step
 * picker with the types that have an input it may connect to, and the step
 * picked arrives connected — one undo entry. While a line is being drawn the
 * inputs it may end on carry `--can-drop`. A policy's `{ok: true, offer}` is
 * shown with Accept and Not now; Accept makes the line (and the step) and runs
 * the offer's `apply(draft)` on a copy of the graph, as one undo entry. Without
 * the option none of this is drawn or bound.
 *
 * ══ MANY PICKED, ONLY WHEN ASKED (`multiSelect: true`) ══════════════════
 *
 * The pick becomes a set: a marquee over the empty surface picks every node
 * it touches, Shift/Ctrl/⌘+click adds or takes one away, Ctrl+A picks all and
 * Escape lets go. Dragging any picked node moves them all, Delete removes
 * them all, an arrow key nudges them a grid step (Shift: ten), and the
 * toolbar aligns and distributes them — each gesture ONE undo entry
 * (`flow:nodes:move`, `flow:nodes:remove`, `flow:nodes:align`). Tab and
 * Shift+Tab walk the nodes, the keyboard's way round the canvas. Without the
 * option none of it is bound, drawn or reported.
 *
 * ══ A TYPE MAY DRAW ITS OWN BODY ════════════════════════════════════════
 *
 * A catalogue type with `render(body, node, ctx)` has a body element below
 * its ports, built ONCE with the node and filled by `render`; its `update`
 * runs after it and on every repaint, onto the same element, so a control
 * inside keeps its focus and its value. `ctx.setConfig(patch)` is the body's
 * one way to write: a `flow:node:config` edit, one undo entry. A `size` sets
 * the node's box (its outputs are anchored at its own width) and an `accent`
 * marks it in a tone. A `render` that throws leaves the node drawn as every
 * other step is, and what it threw is one of the editor's own findings beside
 * the consumer's. A type without these keys is drawn exactly as before.
 * `setCatalogue` swaps the types while the editor is open: the palette is
 * redrawn and only the nodes whose type's definition changed are rebuilt. A
 * definition is compared by what the node is built from — known or not, its
 * icon, label and tone, its ports, its `render` and `update` functions and
 * its `inline` settings —
 * never by object identity, so a new catalogue made from the same types plus
 * one more keeps every existing node, its body and what was typed into it.
 * A `size` or an `accent` is applied on every repaint and rebuilds nothing.
 *
 * ══ EDITED ON THE NODE, ONLY WHEN ASKED ═════════════════════════════════
 *
 * `renameInPlace: true`: a double-click on a node's title puts a text box in
 * its place with the name selected. Enter or leaving it is ONE
 * `flow:node:label` edit (none when the name is what it was); Escape puts the
 * name back and records nothing; an empty name is refused with its sentence
 * on the gesture line and the name it had stays. Read only, a double-click
 * opens nothing. A type's `inline: ['key', …]` draws those settings on the
 * node by the panel's own widget registry (`renderField`): a change there is
 * the same `flow:node:config` edit as in the panel, the panel showing it at
 * once, and a change in the panel redraws the node's control — unless the
 * reader is typing in it, when it already holds what the graph does. Without
 * the option and the key nothing is bound or drawn.
 *
 * ══ THE VIEWPORT IS THE CONSUMER'S TO KEEP ══════════════════════════════
 *
 * `viewport` opens there instead of fitting; `onViewportChange` hears ONE
 * report per finished gesture of the reader's — a pan's release, a run of
 * wheel turns once it has settled, a zoom button, Fit, Arrange, a minimap
 * click, *Go to it* — never one per pointer move, and never what the consumer
 * set itself (`load`, `setViewport`, `fit()`). The wheel has no release, so its
 * report waits until the wheel has been still for `WHEEL_SETTLE_MS`; the next
 * press, the next gesture and `destroy` each hand a waiting one on at once.
 * That is the editor's only timer, and it writes nothing: it tells.
 *
 * ══ COPY, CUT, PASTE, DUPLICATE, ONLY WHEN ASKED (`clipboard`) ══════════
 *
 * `clipboard: true` keeps what is copied in the editor, for as long as it is
 * open; `clipboard: {read, write}` hands it to the consumer — `write(text)`
 * hears the copied JSON (the graph's own `{nodes, connections}` text: the
 * picked steps and the lines among them, never a line to a step left out) and
 * `read()` supplies what Ctrl+V pastes, as text or a promise of it. A paste
 * gives every step a fresh id (`nextId`), takes the lines between them along,
 * sets the copy off from where it was copied (one more step off at each paste
 * of the same text, none for the first paste after a cut), picks it and is ONE
 * `flow:paste` entry; Ctrl+D is the same without the clipboard, as one
 * `flow:node:duplicate`. A label the flow already has is derived (`Title
 * (copy)`, `(copy 2)`, …), and `prepareCopy(node, {from, via})` may change a
 * copy's config and label before it is added. Read only, copy still copies
 * and the rest are refused with the reason on the message line. With `notes`
 * the picked notes go along (under fresh ids when pasted), and with `groups`
 * each group wholly inside the copy is made again round the copies.
 *
 * ══ LIVE VALUES ARE PAINTED, NEVER EDITED ═══════════════════════════════
 *
 * `setNodeValues({[id]: {badge, tone, ports: {[name]: text}}})` is what the
 * host is showing right now — a value on a node's header, a value beside a
 * port — and it extends the run overlay: no node is rebuilt, nothing is
 * recorded, `onChange` is not called and the panel is not touched, so a
 * field being typed into keeps its focus however often the host paints. The
 * values reach a type's own body through `ctx.values`, and its `update` runs
 * for each node whose values changed. Their elements exist only while there
 * is a value to show.
 *
 * ══ A NODE FOLDS TO ITS HEADER, ONLY WHEN ASKED (`collapsible: true`) ═══
 *
 * A button on each header folds its node away to the header and back, one
 * `flow:node:collapse` entry each way. Its port rows, its body and what is
 * drawn under them are hidden; its lines stay, meeting the header's middle on
 * its two sides (as a kernel node's `collapsedPorts` stand in for the ports a
 * folded node hides). A folded node is `collapsed: true` in the graph; an unfolded one has no such
 * key. Without the option a `collapsed` flag is carried through untouched and
 * the node is drawn unfolded.
 * ══ GROUPS AND NOTES, ONLY WHEN ASKED (`groups: true`, `notes: true`) ════
 *
 * A group is a named, toned frame drawn BEHIND its nodes, round all of them;
 * its title bar is its handle: dragging it moves every member (one
 * `flow:nodes:move`), a double-click renames it in place. Groups are flat and
 * a node is in one at most: Ctrl/⌘+G groups the pick (taking each node out of
 * the group it was in), Ctrl/⌘+Shift+G ungroups the groups the pick is in,
 * and removing a node shrinks its group, the last member taking the group with
 * it. A note is free text on the canvas: added by the toolbar's Note, edited
 * in place (a double-click, or Enter on it), moved by dragging it, removed by
 * Delete. A marquee picks notes with the nodes, and a drag or a Delete takes
 * every picked one along. Each is one closed-list edit — `flow:group:add`,
 * `…:remove`, `…:label`, `…:members`, `flow:note:add`, `…:remove`, `…:edit`,
 * `…:move` — and the graph carries them as `groups` and `notes` only when it
 * has some, so a graph without them serialises exactly as before. Without the
 * options a graph's groups and notes are kept, never drawn.
 */

import { CanvasAdapter } from '../../canvas/canvas_adapter.js';
import { OBSTACLE_ROUTING_NODE_LIMIT, crowsFoot, footAnchor, returnEdge, routeEdge } from '../../canvas/edge_router.js';
import { layeredLayout } from '../../canvas/layered_layout.js';
import { TONES, button, el, icon, toneClass, closeFlowPopovers } from '../kit/dom.js';
import { createStrings, say } from '../kit/strings.js';
import { createStepCatalogue } from '../kit/catalogue.js';
import { createWidgetRegistry, renderField } from '../kit/widgets.js';
import { createSettingsPanel } from '../kit/settings_panel.js';
import { fieldsFromSchema } from '../kit/settings_schema.js';
import { FORMULA_REFERENCES, PARAMETER_REFERENCES, TEMPLATE_REFERENCES } from '../kit/references.js';
import { alwaysBefore, enclosingArms, enclosingLoops, DEFAULT_LOOP_PORTS } from '../kit/always_before.js';
import { createFindingsStrip, findingsList, groupFindings } from '../kit/findings.js';
import { openStepPicker } from '../kit/step_picker.js';
import { FlowHistory } from '../kit/history.js';
import { bindFlowKeys } from '../kit/keys.js';
import { addConnection, addNode, connect, disconnect, emptyGraph, nextId, normalise, removeNode, sameEdge, serialise } from '../kit/logic_graph.js';
import { CANVAS_STRINGS } from './strings.js';
import { connectionRules } from './connections.js';
import { CANVAS_NODE, isReturnEdge, layoutGraph, nodeBottom, nodeWidth, pathMidpoint, portAnchor } from './layout.js';

/** Every edit the canvas editor records (36 §5.4). Anything else is a programming error. */
export const CANVAS_ACTIONS = Object.freeze([
    'flow:node:add',
    'flow:node:remove',
    'flow:node:move',
    'flow:edge:connect',
    'flow:edge:disconnect',
    'flow:node:label',
    'flow:node:config',
    'flow:settings',
    'flow:arrange',
    'flow:nodes:move',
    'flow:nodes:remove',
    'flow:nodes:align',
    'flow:paste',
    'flow:node:duplicate',
    'flow:node:collapse',
    'flow:group:add',
    'flow:group:remove',
    'flow:group:label',
    'flow:group:members',
    'flow:note:add',
    'flow:note:remove',
    'flow:note:edit',
    'flow:note:move',
]);

/** `editor.align(kind)` and the toolbar's align verbs, in toolbar order. */
const ALIGN = Object.freeze(['left', 'center', 'right', 'top', 'middle', 'bottom']);
const ALIGN_ICON = Object.freeze({ left: 'align_horizontal_left', center: 'align_horizontal_center',
                                   right: 'align_horizontal_right', top: 'align_vertical_top',
                                   middle: 'align_vertical_center', bottom: 'align_vertical_bottom' });
/** `editor.distribute(axis)`. */
const DISTRIBUTE = Object.freeze(['horizontal', 'vertical']);
const DISTRIBUTE_ICON = Object.freeze({ horizontal: 'horizontal_distribute', vertical: 'vertical_distribute' });
/** A paste or a duplicate is set off from what it copies by this many grid steps, right and down. */
const COPY_OFFSET = 2;
/** Shift+arrow nudges this many grid steps. */
const NUDGE_FAR = 10;
/** A group's frame: how far it stands clear of its members, and its title bar's height. */
const FRAME = Object.freeze({ pad: 16, head: 26 });
/** A note without a `size` of its own is this wide; its height is its text's. */
const NOTE_WIDTH = 192;

/** The scale a fit frames at most: natural size. The kernel's own ceiling is
 *  4×, so a new flow — one step — was framed at it: the step drew 514 px wide
 *  on a 634 px canvas, and every step dropped beside it landed on top of it.
 *  Zooming in past this is the reader's choice (the wheel), never a fit's. */
const NATURAL = 1;
/** Opening (and Arrange) keeps a long flow at this or above, from its first
 *  step on the left; a press on Fit frames ALL of it, however small. */
const READABLE = 0.8;
/** The zoom buttons' steps: from the kernel's floor to its ceiling, through
 *  natural size. A press goes to the next step, whatever scale the wheel left. */
const ZOOM_STEPS = Object.freeze([CanvasAdapter.MIN_SCALE, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3,
                                  CanvasAdapter.MAX_SCALE]);
const ZOOM_EPSILON = 1e-6;
/** How long the wheel is still before a run of turns is one finished zoom or pan. */
const WHEEL_SETTLE_MS = 300;
/** The minimap's drawing, in screen pixels, and its margin round what it shows, in canvas pixels. */
const MINIMAP = Object.freeze({ width: 180, height: 120, margin: 40 });
/** How far a palette press must travel before it is a drag, not a click. */
const DRAG_PX = 4;
/** How far below the lower of its two ends a loop's return line runs. */
const RETURN_DROP = 40;
/** How far clear of a step a routed line is kept (`routing: 'obstacles'`):
 *  each step is handed to the kernel this much larger on every side, so a
 *  line bent round one passes beside its border, not along it. */
const CLEARANCE = 16;
/** An arrowhead's depth along the line and its half-width across it. */
const ARROW = Object.freeze({ length: 9, half: 4.5 });
const ROUTINGS = Object.freeze(['simple', 'obstacles']);
const SVG = 'http://www.w3.org/2000/svg';

const DEFAULT_REFERENCES = Object.freeze({
    template: TEMPLATE_REFERENCES, formula: FORMULA_REFERENCES, parameter: PARAMETER_REFERENCES,
});

function sortedKeys(value) {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys(value[k])]));
    }
    return value;
}

const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** A step catalogue, or the raw list of types made into one. */
function toCatalogue(value, who) {
    const catalogue = Array.isArray(value) ? createStepCatalogue(value) : value;
    if (!catalogue?.get || !catalogue?.byCategory) {
        throw new Error(`${who} needs a step catalogue (createStepCatalogue(types, …)).`);
    }
    return catalogue;
}

/**
 * @param {HTMLElement|null} host  the editor is appended here when given
 * @param {object} options          36 §3.14 and §5.2; the README lists every one
 */
export function createCanvasEditor(host, options = {}) {
    const {
        widgets = createWidgetRegistry(), references = DEFAULT_REFERENCES, values = null, valuesNote = null,
        summarise = null, summariseReads = null, flowSettings = null, readOnly = false, actions = [],
        slots = {}, strings = null, services = null, onChange = null, onSelect = null,
        history: historyOptions = {}, loop = {}, node: nodeOptions = {}, dataPortRead = null,
        removable = null, paletteTypes = null, label = null, gridSize = 16, waitsForAll = undefined,
        connections: linkOptions = null,
        multiSelect = false,
        edgeStyle = null, routing = 'simple', hoverHighlight = false,
        onViewportChange = null, zoomControls = false, minimap = false, renameInPlace = false,
        clipboard = null, prepareCopy = null, collapsible = false,
        groups: groupsOption = false, notes: notesOption = false,
        layout = 'flow',
    } = options;
    const folding = Boolean(collapsible);
    const multi = Boolean(multiSelect);
    const grouping = Boolean(groupsOption);
    const noting = Boolean(notesOption);
    if (layout !== 'flow' && layout !== 'layered' && typeof layout !== 'function') {
        throw new Error(`createCanvasEditor's layout is 'flow', 'layered' or a function (graph, ctx) → Map; got ${String(layout)}.`);
    }
    if (!ROUTINGS.includes(routing)) {
        throw new Error(`createCanvasEditor: routing is ${ROUTINGS.map((r) => `'${r}'`).join(' or ')}, not '${routing}'.`);
    }
    if (clipboard && clipboard !== true
        && (typeof clipboard.read !== 'function' || typeof clipboard.write !== 'function')) {
        throw new Error('createCanvasEditor: clipboard is true or {read(), write(text)}.');
    }
    /** `'memory'`: what is copied stays in the editor; else the consumer's `{read, write}`; null: off. */
    const clip = clipboard === true ? 'memory' : clipboard || null;
    const styled = typeof edgeStyle === 'function';
    let catalogue = toCatalogue(options.catalogue, 'createCanvasEditor');
    const S = createStrings(CANVAS_STRINGS, strings);
    const BOX = Object.freeze({
        width: Number(nodeOptions.width) || CANVAS_NODE.width,
        header: Number(nodeOptions.header) || CANVAS_NODE.header,
        row: Number(nodeOptions.row) || CANVAS_NODE.row,
        /** Is this node drawn folded to its header? Only with `collapsible`. */
        folded: (n) => folding && n?.collapsed === true,
    });
    const loopPorts = Object.freeze({ ...DEFAULT_LOOP_PORTS, ...plainObject(loop) });
    const canRemove = typeof removable === 'function' ? removable
        : (_node, type) => (type?.role || 'step') !== 'start';
    const offered = typeof paletteTypes === 'function' ? paletteTypes : (type) => type.role !== 'start';
    /** The `connections` option: absent, the editor draws and binds exactly what it did without it. */
    const linking = linkOptions && typeof linkOptions === 'object' ? linkOptions : null;
    const dataConnect = linking?.dataPorts === 'connect';
    /** The connection rules over the current catalogue: `setCatalogue` builds them again. */
    const rulesFor = (types) => (linking
        ? connectionRules({ catalogue: types, policy: linking.policy, dataPorts: dataConnect, strings: S }) : null);
    let verdictOf = rulesFor(catalogue);

    // ── the frame ───────────────────────────────────────────────────────
    const root = el('div', 'twm-flow-graph');
    if (linking) root.classList.add('twm-flow-graph--linking');
    if (BOX.width !== CANVAS_NODE.width) root.style.setProperty('--twm-canvas-node-width', `${BOX.width}px`);
    if (BOX.header !== CANVAS_NODE.header) root.style.setProperty('--twm-canvas-node-header', `${BOX.header}px`);
    if (BOX.row !== CANVAS_NODE.row) root.style.setProperty('--twm-canvas-node-row', `${BOX.row}px`);
    const toolbar = el('div', 'twm-flow-graph__toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', say(S, 'toolbarLabel'));
    const status = el('span', 'twm-flow-graph__status');
    const toolbarEnd = el('span', 'twm-flow-graph__toolbar-end');
    const why = el('p', 'twm-flow-graph__why');
    const readonlyBanner = el('p', 'twm-flow-graph__readonly');
    readonlyBanner.hidden = true;
    const message = el('p', 'twm-flow-graph__message');
    message.setAttribute('aria-live', 'polite');
    const banner = el('p', 'twm-flow-graph__banner');
    banner.hidden = true;
    const offerBox = linking ? el('div', 'twm-flow-graph__offer') : null;
    if (offerBox) {
        offerBox.hidden = true;
        offerBox.setAttribute('role', 'status');
    }
    const body = el('div', 'twm-flow-graph__body');
    const palette = el('nav', 'twm-flow-graph__palette');
    palette.setAttribute('aria-label', say(S, 'palette'));
    const canvasHost = el('div', 'twm-flow-graph__canvas');
    const aside = el('aside', 'twm-flow-graph__aside');
    const connectionBox = el('section', 'twm-flow-graph__connection');
    connectionBox.hidden = true;
    body.append(palette, canvasHost, aside);

    // Everything `onViewportChange` could read is declared BEFORE the adapter
    // is built: its constructor fires that callback synchronously.
    let graph = emptyGraph();
    let settingsSchema = flowSettings?.schema ?? null;
    let settingsTitle = flowSettings?.title ?? null;
    let settingsValue = structuredClone(plainObject(flowSettings?.value));
    let ro = readOnly;
    let findings = [];
    let findingsBy = new Map();
    let overlay = null;
    /** What the host shows on each node now (`setNodeValues`), by node id: {badge, tone, ports}. */
    let liveValues = new Map();
    /** {kind: 'flow'} | {kind: 'node', id} | {kind: 'many', ids, notes?} (two or more,
     *  `multiSelect`; `notes` the picked notes' ids, with `notes`) | {kind: 'note', id}
     *  | {kind: 'edge', edge} | null */
    let selected = null;
    /** The node a left press went down on (`multiSelect`), while it is held:
     *  the focus it brings is the press's, settled by its click. A port's
     *  press is the port's and sets nothing. */
    let pressed = null;
    /** That press once let go, for the click that follows it: a press that
     *  dragged does not narrow the pick. The next press replaces it. */
    let released = null;
    /** The output a click-then-click connection started from: {source, sourcePort}. */
    let connecting = null;
    /** A policy's offer on the screen: {offer, build, action, after}. It needs no staleness check:
     *  every commit, restore, load and read-only switch clears it. */
    let pendingOffer = null;
    let suppressClick = false;
    let dragCleanup = null;
    let destroyed = false;
    let fitFrame = null;
    let travelling = null;
    let lastSelect = '';
    /** What the pointer is over, with `hoverHighlight`: {kind: 'node', id} | {kind: 'edge', edge} | null. */
    let hovered = null;
    /** Every drawn line and the connection it draws, from the last paint. */
    let edgeEls = [];
    /** Whether `routing: 'obstacles'` is drawing plain curves, the graph being over the kernel's limit. */
    let routingFallback = false;
    const nodeEls = new Map();
    /** A group's frame and a note's box, by id (`groups`, `notes`). */
    const frameEls = new Map();
    const noteEls = new Map();
    /** The note or the group being typed into in place: {kind, id, done(keep)} | null. */
    let editing = null;
    /** What each node element was built from (`buildKey`), by node id. */
    const builtFrom = new Map();
    /** A node's own body, by node id: {el, ctx, update} — built once with the node. */
    const bodies = new Map();
    /** A type's `inline` settings drawn on the node, by node id: {readOnly, fields: [{key, spec, shown, field}]}. */
    const inlines = new Map();
    /** The title being typed in place (`renameInPlace`): {id, finish(keep)}. */
    let renaming = null;
    /** What a type's own `render` or `update` threw, by node id: the editor's own findings. */
    const bodyFindings = new Map();
    let painting = false;
    const consumerState = new Map();
    /** The `viewport` option, until the first `load` opens there instead of fitting. */
    let startView = viewportOf(options.viewport);
    /** The viewport the consumer last heard of (or set): a gesture ending there is no change. */
    let reportedView = '';
    let wheelTimer = null;
    let pressEnd = null;
    let zoomLimit = '';
    let miniMap = null;
    /** What `clipboard: true` holds: the last copied text. */
    let copiedText = null;
    /** The text pasted last and how many times, so each paste of it is set off one step more. */
    let pasteRun = { text: null, times: 0 };

    const canvas = new CanvasAdapter({ container: canvasHost, gridSize });
    if (startView) canvas.setViewport(startView);
    canvas.root.setAttribute('role', 'application');
    canvas.root.setAttribute('aria-label', label || say(S, 'canvasLabel'));
    // A line's label lives in the NODE layer, above every node (the stylesheet
    // stacks it), so a label is never hidden behind a step; a press on it is
    // the editor's, never a pan.
    const labelLayer = styled ? el('div', 'twm-flow-graph__edge-labels') : null;
    if (labelLayer) canvas.nodeLayer.appendChild(labelLayer);
    // A press on the empty surface lets go of the pick (and of a connection
    // being drawn); with nothing but the flow picked it repaints nothing.
    canvas.onSelectionChange = () => {
        if (connecting) cancelConnect();
        if (selected && selected.kind !== 'flow') select(null);
    };

    const isReadOnly = () => Boolean(ro);
    const readOnlyReason = () => (ro && typeof ro === 'object' && ro.reason ? String(ro.reason) : '');
    const nodeOf = (id) => graph.nodes.find((x) => x.id === id) || null;
    const typeOf = (n) => catalogue.get(n?.type);
    /** The picked nodes' ids: none, one, or (`multiSelect`) several. */
    const pickedIds = () => (selected?.kind === 'node' ? [selected.id]
        : selected?.kind === 'many' ? selected.ids : []);
    const pickedSet = () => new Set(pickedIds());
    const isPicked = (id) => (selected?.kind === 'node' ? selected.id === id
        : selected?.kind === 'many' ? selected.ids.includes(id) : false);
    const toggles = (ev) => multi && Boolean(ev.shiftKey || ev.ctrlKey || ev.metaKey);
    const groupList = () => (Array.isArray(graph.groups) ? graph.groups : []);
    const noteList = () => (Array.isArray(graph.notes) ? graph.notes : []);
    const groupOf = (id) => groupList().find((gr) => gr.id === id) || null;
    const noteOf = (id) => noteList().find((x) => x.id === id) || null;
    /** The picked notes' ids (`notes`). */
    const pickedNotes = () => (selected?.kind === 'note' ? [selected.id]
        : selected?.kind === 'many' ? selected.notes || [] : []);
    const isNotePicked = (id) => pickedNotes().includes(id);
    /** The consumer's findings, then the editor's own (a node body that threw). */
    const allFindings = () => (bodyFindings.size ? [...findings, ...bodyFindings.values()] : findings);

    // ── state ───────────────────────────────────────────────────────────

    /** The whole flow as ONE text: what undo puts back and what `onChange` hands on. */
    const snapshot = () => JSON.stringify({ graph: JSON.parse(serialise(graph)), flowSettings: sortedKeys(settingsValue) });

    const history = new FlowHistory({
        actions: CANVAS_ACTIONS,
        restore: (state) => restore(state),
        onState: () => paintToolbar(),
        limit: historyOptions.limit ?? 100,
        mergeMs: historyOptions.mergeMs ?? 1000,
        now: historyOptions.now,
    });

    function emitChange(action, key, via = null) {
        if (!onChange || destroyed) return;
        const text = snapshot();
        onChange({ graph: normalise(graph), flowSettings: structuredClone(settingsValue), text, action, key, via });
    }

    /** After every edit: one undo entry (the closed list), and the consumer told. */
    function commit(action, key = null) {
        if (pendingOffer) clearOffer();
        if (history.commit(snapshot(), action, key)) emitChange(action, key);
        paintToolbar();
    }

    function restore(state) {
        editing?.done(false);
        const p = JSON.parse(state);
        graph = normalise(p.graph);
        settingsValue = plainObject(p.flowSettings);
        if (connecting) cancelConnect();
        if (pendingOffer) clearOffer();
        prunePick();
        findingsBy = groupFindings(allFindings(), { graph });
        paintNodes();
        paintPanel();
        keepFocus();
        emitChange(null, null, travelling);
        announceSelection();
    }

    /** What is picked and no longer there is let go of (an undo, a load). */
    function prunePick() {
        if (selected?.kind === 'node' && !nodeOf(selected.id)) selected = null;
        if (selected?.kind === 'edge' && !graph.connections.some((c) => sameEdge(c, selected.edge))) selected = null;
        if (selected?.kind === 'note' && !noteOf(selected.id)) selected = null;
        if (selected?.kind === 'many') selected = pickOf(selected.ids, selected.notes || []);
    }

    /** The pick of these nodes and notes that are still there: none, one, or several. */
    function pickOf(ids, noteIds = []) {
        const live = new Set(graph.nodes.map((x) => x.id));
        const list = [...new Set(ids)].filter((id) => live.has(id));
        const liveNotes = new Set(noteList().map((x) => x.id));
        const notes = [...new Set(noteIds)].filter((id) => liveNotes.has(id));
        if (list.length + notes.length > 1) return { kind: 'many', ids: list, ...(notes.length ? { notes } : {}) };
        if (list.length) return { kind: 'node', id: list[0] };
        return notes.length ? { kind: 'note', id: notes[0] } : null;
    }

    /** A verb that repainted away the focused control leaves focus on the body,
     *  where the root's keys never arrive — so it goes back to the canvas. */
    function keepFocus() {
        if (destroyed || !root.isConnected) return;
        const active = document.activeElement;
        if (!active || active === document.body || !active.isConnected) canvas.root.focus({ preventScroll: true });
    }

    function setMessage(line, tone = null) {
        message.textContent = line || '';
        message.className = 'twm-flow-graph__message' + (tone ? ` twm-flow-graph__message--${tone === 'ok' ? 'ok' : 'warning'}` : '');
    }

    // ── the toolbar ─────────────────────────────────────────────────────

    // BUILT ONCE AND REFUSED IN PLACE. A toolbar rebuilt on every edit would
    // replace the button under a press that an edit's event lands between (a
    // field's blur fires on the next button's mousedown), and the click would
    // reach a node that is gone.
    const tool = (id, opts) => {
        const b = button(opts);
        b.dataset.action = id;
        b.classList.add('twm-flow-graph__tool');
        b.dataset.tip = opts.title || '';
        return b;
    };
    const tools = {
        undo: tool('undo', { label: say(S, 'undo'), icon: 'undo', title: say(S, 'undoTitle'), onClick: () => undo() }),
        redo: tool('redo', { label: say(S, 'redo'), icon: 'redo', title: say(S, 'redoTitle'), onClick: () => redo() }),
        arrange: tool('arrange', { label: say(S, 'arrange'), icon: 'account_tree',
                                   title: say(S, layout === 'flow' ? 'arrangeTitle' : 'arrangeLayeredTitle'),
                                   onClick: () => { if (arrangeGraph(arrangeTarget())) viewportSettled(); } }),
        fit: tool('fit', { label: say(S, 'fit'), icon: 'fit_screen', title: say(S, 'fitTitle'),
                           onClick: () => { fit({ whole: true }); viewportSettled(); } }),
    };
    // The align and distribute verbs, icon-only, after Fit (`multiSelect`).
    const pickTools = [];
    if (multi) {
        for (const kind of ALIGN) {
            const id = `align-${kind}`;
            const words = say(S, `align${cap(kind)}`);
            tools[id] = tool(id, { label: words, title: words, icon: ALIGN_ICON[kind], iconOnly: true,
                                   onClick: () => alignNodes(kind) });
            pickTools.push(tools[id]);
        }
        for (const axis of DISTRIBUTE) {
            const id = `distribute-${axis}`;
            const words = say(S, `distribute${cap(axis)}`);
            tools[id] = tool(id, { label: words, title: words, icon: DISTRIBUTE_ICON[axis], iconOnly: true,
                                   onClick: () => distributeNodes(axis) });
            pickTools.push(tools[id]);
        }
    }
    // Group, Ungroup and Note, after the align verbs (`groups`, `notes`).
    const itemTools = [];
    if (grouping) {
        tools.group = tool('group', { label: say(S, 'group'), title: say(S, 'groupTitle'), icon: 'select_all',
                                      iconOnly: true, onClick: () => groupPicked() });
        tools.ungroup = tool('ungroup', { label: say(S, 'ungroup'), title: say(S, 'ungroupTitle'), icon: 'deselect',
                                          iconOnly: true, onClick: () => ungroupPicked() });
        itemTools.push(tools.group, tools.ungroup);
    }
    if (noting) {
        tools.note = tool('note', { label: say(S, 'note'), title: say(S, 'noteTitle'), icon: 'sticky_note_2',
                                    onClick: () => { const n = addNote(); if (n) editNote(n.id); } });
        itemTools.push(tools.note);
    }
    if (zoomControls) {
        tools['zoom-out'] = tool('zoom-out', { label: say(S, 'zoomOut'), icon: 'zoom_out', title: say(S, 'zoomOutTitle'),
                                               onClick: () => zoomStep(-1) });
        tools['zoom-in'] = tool('zoom-in', { label: say(S, 'zoomIn'), icon: 'zoom_in', title: say(S, 'zoomInTitle'),
                                             onClick: () => zoomStep(1) });
        tools['zoom-reset'] = tool('zoom-reset', { label: say(S, 'zoomReset'), title: say(S, 'zoomResetTitle'),
                                                   onClick: () => zoomTo(NATURAL) });
    }
    const own = new Set(Object.keys(tools));
    const consumerTools = [];
    for (const a of Array.isArray(actions) ? actions : []) {
        if (!a || !a.id || own.has(a.id)) continue;
        const b = tool(a.id, { label: a.label ?? a.id, icon: a.icon || null, primary: Boolean(a.primary),
                               danger: Boolean(a.danger), title: a.title || null,
                               onClick: () => { if (!b.disabled) a.run?.(api); } });
        consumerTools.push({ spec: a, el: b });
    }
    toolbar.append(tools.undo, tools.redo, tools.arrange, tools.fit,
                   ...['zoom-out', 'zoom-in', 'zoom-reset'].filter((id) => tools[id]).map((id) => tools[id]),
                   ...pickTools, ...itemTools, ...consumerTools.map((t) => t.el), status, toolbarEnd);
    if (typeof slots.toolbarEnd === 'function') slots.toolbarEnd(toolbarEnd);

    function refusals() {
        const stop = isReadOnly() ? (readOnlyReason() || say(S, 'readOnlyRefusal')) : null;
        const r = {
            undo: stop || (history.canUndo ? null : say(S, 'nothingToUndo')),
            redo: stop || (history.canRedo ? null : say(S, 'nothingToRedo')),
            arrange: stop || (graph.nodes.length < 2 ? say(S, 'arrangeNeedsTwo') : null),
            fit: null,
            'zoom-out': canvas.scale <= ZOOM_STEPS[0] + ZOOM_EPSILON ? say(S, 'zoomAtMin') : null,
            'zoom-in': canvas.scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - ZOOM_EPSILON ? say(S, 'zoomAtMax') : null,
            'zoom-reset': null,
        };
        if (multi) {
            const n = pickedIds().length;
            for (const kind of ALIGN) r[`align-${kind}`] = stop || (n < 2 ? say(S, 'alignNeedsTwo') : null);
            for (const axis of DISTRIBUTE) r[`distribute-${axis}`] = stop || (n < 3 ? say(S, 'distributeNeedsThree') : null);
        }
        if (grouping) {
            r.group = stop || (pickedIds().length ? null : say(S, 'groupNeedsOne'));
            r.ungroup = stop || (groupsOfPick().length ? null : say(S, 'ungroupNeedsGroup'));
        }
        if (noting) r.note = stop;
        return r;
    }

    function refuse(control, sentence) {
        control.disabled = Boolean(sentence);
        control.title = sentence || control.dataset.tip || '';
        if (sentence) control.dataset.refusal = sentence; else delete control.dataset.refusal;
    }

    function paintToolbar() {
        if (destroyed) return;
        const r = refusals();
        for (const id of Object.keys(tools)) {
            const extra = consumerState.get(id);
            refuse(tools[id], r[id] || (extra?.disabled ? extra.reason || '' : null) || null);
            if (extra?.disabled && !r[id] && !extra.reason) tools[id].disabled = true;
        }
        const said = [];
        for (const { spec, el: b } of consumerTools) {
            const state = consumerState.get(spec.id) || {};
            const reason = state.disabled ? (state.reason || '') : '';
            refuse(b, reason || null);
            if (state.disabled && !reason) b.disabled = true;
            b.classList.toggle('twm-flow-graph__tool--busy', Boolean(state.busy));
            if (state.busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
            // THE REFUSAL ON THE SCREEN, not only in a tooltip: a disabled verb
            // with its reason in `title` reads as "the button does nothing".
            if (reason && !said.includes(reason)) said.push(reason);
        }
        why.textContent = said.join(' · ');
        why.hidden = said.length === 0;
    }

    function undo() {
        if (refusals().undo) return false;
        if (connecting) { cancelConnect(); setMessage(''); }
        travelling = 'undo';
        try { return history.undo(); } finally { travelling = null; }
    }

    function redo() {
        if (refusals().redo) return false;
        if (connecting) { cancelConnect(); setMessage(''); }
        travelling = 'redo';
        try { return history.redo(); } finally { travelling = null; }
    }

    // ── the viewport ────────────────────────────────────────────────────

    const viewKey = (v) => `${v.scale}|${v.tx}|${v.ty}`;

    /** What the consumer set is what it has: nothing to report back. */
    function viewportBaseline() {
        reportedView = viewKey(canvas.viewport());
    }

    /** A gesture of the reader's has finished: one report, if it moved the view. */
    function viewportSettled() {
        if (wheelTimer !== null) { clearTimeout(wheelTimer); wheelTimer = null; }
        if (destroyed) return;
        const now = canvas.viewport();
        const key = viewKey(now);
        if (key === reportedView) return;
        reportedView = key;
        onViewportChange?.({ ...now });
    }

    /** Scale to `scale` about the centre of the view, so what is in the middle stays there. */
    function zoomTo(scale) {
        const r = canvas.root.getBoundingClientRect();
        const centre = canvas.clientToCanvas(r.left + r.width / 2, r.top + r.height / 2);
        const s = Math.max(ZOOM_STEPS[0], Math.min(scale, ZOOM_STEPS[ZOOM_STEPS.length - 1]));
        canvas.setViewport({ scale: s, tx: r.width / 2 - centre.x * s, ty: r.height / 2 - centre.y * s });
        viewportSettled();
    }

    /** The next step up (+1) or down (-1) from the scale the view is at; none past a limit. */
    function zoomStep(direction) {
        const s = canvas.scale;
        const next = direction > 0 ? ZOOM_STEPS.find((z) => z > s + ZOOM_EPSILON)
            : [...ZOOM_STEPS].reverse().find((z) => z < s - ZOOM_EPSILON);
        if (next === undefined) return false;
        zoomTo(next);
        return true;
    }

    /** Every kernel move: the zoom buttons' limits, and the minimap's frame. */
    function viewportMoved() {
        if (destroyed) return;
        if (zoomControls) {
            const r = refusals();
            const limit = `${r['zoom-out'] || ''}|${r['zoom-in'] || ''}`;
            if (limit !== zoomLimit) { zoomLimit = limit; paintToolbar(); }
        }
        paintMinimap();
    }

    if (zoomControls || minimap) canvas.onViewportChange = () => viewportMoved();

    if (typeof onViewportChange === 'function') {
        // A press on the canvas is a gesture until it is released, wherever it
        // is released; capture, because a node's header stops its press.
        canvas.root.addEventListener('pointerdown', () => {
            viewportSettled();
            pressEnd?.();
            const end = () => { pressEnd?.(); viewportSettled(); };
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            pressEnd = () => {
                window.removeEventListener('pointerup', end, true);
                window.removeEventListener('pointercancel', end, true);
                pressEnd = null;
            };
        }, true);
        canvas.root.addEventListener('wheel', () => {
            if (wheelTimer !== null) clearTimeout(wheelTimer);
            wheelTimer = setTimeout(() => { wheelTimer = null; viewportSettled(); }, WHEEL_SETTLE_MS);
        }, { passive: true });
    }

    // ── the minimap ─────────────────────────────────────────────────────

    const mini = minimap ? el('div', 'twm-flow-graph__minimap') : null;
    const miniSvg = minimap ? document.createElementNS(SVG, 'svg') : null;
    if (mini) {
        miniSvg.setAttribute('class', 'twm-flow-graph__minimap-map');
        miniSvg.setAttribute('width', String(MINIMAP.width));
        miniSvg.setAttribute('height', String(MINIMAP.height));
        mini.title = say(S, 'minimapTitle');
        // A pointer's shortcut: the keyboard has the zoom buttons, Fit and *Go to it*.
        mini.setAttribute('aria-hidden', 'true');
        mini.appendChild(miniSvg);
        mini.addEventListener('click', (ev) => {
            if (!miniMap) return;
            const r = miniSvg.getBoundingClientRect();
            const x = (ev.clientX - r.left - miniMap.ox) / miniMap.k;
            const y = (ev.clientY - r.top - miniMap.oy) / miniMap.k;
            const view = canvas.root.getBoundingClientRect();
            canvas.setViewport({ tx: view.width / 2 - x * canvas.scale, ty: view.height / 2 - y * canvas.scale });
            viewportSettled();
        });
        canvasHost.appendChild(mini);
    }
    // The frame is the canvas's visible box: a pane or window resized, or a
    // host laid out only after the editor was built, moves no viewport.
    const miniSized = mini && typeof ResizeObserver === 'function' ? new ResizeObserver(() => paintMinimap()) : null;
    miniSized?.observe(canvas.root);

    /** The whole flow and the view's frame, small: what is drawn spans both. */
    function paintMinimap() {
        if (!mini || destroyed) return;
        const view = canvas.visibleBox();
        const boxes = graph.nodes.map((n) => ({ x: n.position.x, y: n.position.y, width: BOX.width,
                                                height: bottomOf(n) - n.position.y }));
        const all = view.width > 0 && view.height > 0 ? [...boxes, view] : boxes;
        if (!all.length) { miniMap = null; miniSvg.replaceChildren(); return; }
        const x0 = Math.min(...all.map((b) => b.x)) - MINIMAP.margin;
        const y0 = Math.min(...all.map((b) => b.y)) - MINIMAP.margin;
        const x1 = Math.max(...all.map((b) => b.x + b.width)) + MINIMAP.margin;
        const y1 = Math.max(...all.map((b) => b.y + b.height)) + MINIMAP.margin;
        const k = Math.min(MINIMAP.width / (x1 - x0), MINIMAP.height / (y1 - y0));
        miniMap = { k, ox: (MINIMAP.width - (x1 - x0) * k) / 2 - x0 * k, oy: (MINIMAP.height - (y1 - y0) * k) / 2 - y0 * k };
        const rect = (b, cls) => {
            const r = document.createElementNS(SVG, 'rect');
            r.setAttribute('class', cls);
            r.setAttribute('x', String(b.x * k + miniMap.ox));
            r.setAttribute('y', String(b.y * k + miniMap.oy));
            r.setAttribute('width', String(b.width * k));
            r.setAttribute('height', String(b.height * k));
            return r;
        };
        const parts = boxes.map((b) => rect(b, 'twm-flow-graph__minimap-node'));
        if (view.width > 0 && view.height > 0) parts.push(rect(view, 'twm-flow-graph__minimap-view'));
        miniSvg.replaceChildren(...parts);
    }

    // ── the palette ─────────────────────────────────────────────────────

    function paintPalette() {
        palette.replaceChildren(el('h3', 'twm-flow-graph__palette-title', say(S, 'palette')));
        for (const { category, types } of catalogue.byCategory()) {
            const list = types.filter((t) => offered(t));
            if (!list.length) continue;
            if (category.label) palette.appendChild(el('h4', 'twm-flow-graph__palette-group', category.label));
            for (const t of list) {
                const item = el('button', 'twm-flow-graph__palette-item');
                item.type = 'button';
                item.dataset.type = t.type_id;
                const chip = el('span', `twm-flow-graph__palette-icon ${toneClass('twm-flow-graph__palette-icon', category.tone)}`);
                chip.appendChild(icon(t.icon || 'widgets'));
                item.append(chip, el('span', 'twm-flow-graph__palette-label', t.label));
                // The label first: a narrow palette ellipsises it.
                item.title = t.description ? `${t.label} — ${t.description}` : t.label;
                if (t.unavailable) {
                    // Greyed WITH its sentence under it, never hidden.
                    item.disabled = true;
                    item.dataset.refusal = String(t.unavailable);
                    palette.append(item, el('p', 'twm-flow-graph__palette-why', String(t.unavailable)));
                    continue;
                }
                item.disabled = isReadOnly();
                item.addEventListener('pointerdown', (ev) => startPaletteDrag(ev, t));
                item.addEventListener('click', () => {
                    if (suppressClick || isReadOnly()) return;           // the tail of a drag
                    addStep(t.type_id);
                });
                palette.appendChild(item);
            }
        }
    }

    /** Add a step at `at`, or — a click — at the centre of what is on screen. */
    function addStep(typeId, at = null) {
        if (isReadOnly()) return null;
        const n = graph.nodes.length;
        let where = at;
        if (!where) {
            const box = canvas.visibleBox();
            const width = nodeWidth(catalogue, { type: typeId }, BOX);
            where = {
                x: canvas.snap((box.width ? box.x + box.width / 2 - width / 2 : 80) + (n % 4) * 24),
                y: canvas.snap((box.height ? box.y + box.height / 3 : 80) + (n % 4) * 24),
            };
        }
        const added = addNode(graph, typeId, where, { catalogue });
        selected = { kind: 'node', id: added.id };
        paintNodes();
        paintPanel();
        announceSelection();
        commit('flow:node:add');
        return added;
    }

    /** Is the client point over the canvas? Rect arithmetic, because the ghost
     *  follows the pointer and `elementFromPoint` would answer "the ghost". */
    function overCanvas(x, y) {
        const r = canvas.root.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    /** The click that follows a drag's release is swallowed, and only that one. */
    function swallowNextClick({ afterRelease = false } = {}) {
        suppressClick = true;
        const clear = () => setTimeout(() => { suppressClick = false; }, 0);
        if (afterRelease) clear();
        else window.addEventListener('pointerup', clear, { once: true, capture: true });
    }

    function startPaletteDrag(ev, t) {
        if (ev.button !== 0 || ev.isPrimary === false || isReadOnly()) return;
        dragCleanup?.();
        const start = { x: ev.clientX, y: ev.clientY };
        let ghost = null;
        const onMove = (m) => {
            if (!ghost) {
                if (Math.abs(m.clientX - start.x) + Math.abs(m.clientY - start.y) < DRAG_PX) return;
                ghost = el('div', 'twm-flow-graph__ghost');
                ghost.append(icon(t.icon || 'widgets'), el('span', 'twm-flow-graph__ghost-label', t.label));
                document.body.appendChild(ghost);
            }
            ghost.style.left = `${m.clientX + 8}px`;
            ghost.style.top = `${m.clientY + 8}px`;
            canvasHost.classList.toggle('twm-flow-graph__canvas--drop', overCanvas(m.clientX, m.clientY));
        };
        const finish = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey, true);
            ghost?.remove();
            canvasHost.classList.remove('twm-flow-graph__canvas--drop');
            dragCleanup = null;
        };
        function onUp(u) {
            const dragged = Boolean(ghost);
            finish();
            if (!dragged) return;                        // a click: the click handler adds it
            swallowNextClick({ afterRelease: true });
            if (!overCanvas(u.clientX, u.clientY)) {
                setMessage(say(S, 'dropHere'));
                return;
            }
            const p = canvas.clientToCanvas(u.clientX, u.clientY);
            const width = nodeWidth(catalogue, { type: t.type_id }, BOX);
            addStep(t.type_id, { x: canvas.snap(p.x - width / 2), y: canvas.snap(p.y - BOX.header / 2) });
        }
        function onCancel() {
            finish();
        }
        function onKey(k) {
            if (k.key !== 'Escape') return;
            k.preventDefault();
            k.stopPropagation();
            const dragged = Boolean(ghost);
            finish();
            // The button is still pressed: its release would click it.
            if (dragged) swallowNextClick();
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey, true);
        dragCleanup = finish;
    }

    // ── the canvas ──────────────────────────────────────────────────────

    const anchor = (n, port, direction) => portAnchor(catalogue, n, port, direction, BOX);
    const widthOf = (n) => nodeWidth(catalogue, n, BOX);
    /** A node with its own body and no `size.h` is as tall as it is drawn,
     *  measured (so is one with `inline` settings); jsdom (and a node not yet laid out) answers 0, and then the
     *  arithmetic box stands. */
    const measured = (n) => ((bodies.has(n.id) || inlines.has(n.id)) && !catalogue.size?.(n.type)?.h && !BOX.folded(n)
        ? nodeEls.get(n.id)?.offsetHeight || 0 : 0);
    const bottomOf = (n) => Math.max(nodeBottom(catalogue, n, BOX), n.position.y + measured(n));
    const isReturn = (c, target) => isReturnEdge(c, target, catalogue, loopPorts.entry);

    /** A port as the node draws it and hands it on: its JSON, or the port
     *  itself when it has none (then only the same object is the same port). */
    const portKey = (p) => {
        try { return JSON.stringify(p); } catch { return p; }
    };

    /** What `buildNode` reads from the catalogue for this node — compared
     *  field by field (`sameBuild`), so an equal definition in a new
     *  catalogue is the same build and a changed one is not. */
    function buildKey(nodeRow) {
        const def = typeOf(nodeRow);
        const own = def ? catalogue.body?.(nodeRow.type) : null;
        return {
            known: Boolean(def),
            icon: def?.icon || '',
            label: def?.label ?? null,
            tone: catalogue.tone(nodeRow.type),
            ports: [...catalogue.inputs(nodeRow.type), ...catalogue.outputs(nodeRow.type)].map(portKey),
            render: own?.render ?? null,
            update: own?.update ?? null,
            inline: def ? portKey(inlineFields(nodeRow)) : '',
        };
    }

    /** The settings a node's type draws on it (`inline`), as the panel's fields. */
    function inlineFields(nodeRow) {
        const keys = catalogue.inline?.(nodeRow.type) || [];
        if (!keys.length) return [];
        const all = fieldsFromSchema(typeOf(nodeRow)?.config_schema);
        return keys.map((k) => all.find((f) => f.key === k)).filter(Boolean);
    }

    const sameBuild = (a, b) => Boolean(a && b) && a.known === b.known && a.icon === b.icon
        && a.label === b.label && a.tone === b.tone && a.render === b.render && a.update === b.update
        && a.inline === b.inline
        && a.ports.length === b.ports.length && a.ports.every((p, i) => p === b.ports[i]);

    function buildNode(nodeRow, def) {
        const tone = catalogue.tone(nodeRow.type);
        const n = el('div', 'twm-flow-graph__node');
        n.dataset.nodeId = nodeRow.id;
        n.setAttribute('data-twm-flow-item', '');
        n.setAttribute('role', 'group');
        n.tabIndex = 0;
        const header = el('div', 'twm-flow-graph__node-head');
        const chip = el('span', `twm-flow-graph__node-icon ${toneClass('twm-flow-graph__node-icon', tone)}`);
        chip.appendChild(icon(def?.icon || 'widgets'));
        // Each says itself on hover: a label or an id too long for the header
        // is cut with an ellipsis, and a cut name with no way to read the rest
        // is the first thing a reader notices.
        const name = nodeRow.label || def?.label || nodeRow.type;
        n.setAttribute('aria-label', name);
        const title = el('span', 'twm-flow-graph__node-title', name);
        title.title = name;
        if (renameInPlace) title.addEventListener('dblclick', () => startRename(nodeRow.id));
        const tag = el('span', 'twm-flow-graph__node-tag', nodeRow.id);
        tag.title = say(S, 'stepId', nodeRow.id);
        header.append(chip, title, tag);
        if (folding) header.appendChild(foldButton(nodeRow.id));
        header.addEventListener('pointerdown', (ev) => startMove(ev, nodeRow.id));
        n.appendChild(header);
        const inputs = catalogue.inputs(nodeRow.type);
        const outputs = catalogue.outputs(nodeRow.type);
        const rows = Math.max(inputs.length, outputs.length);
        for (let i = 0; i < rows; i += 1) {
            const row = el('div', 'twm-flow-graph__node-row');
            row.append(inputs[i] ? port(nodeRow, inputs[i]) : el('span', 'twm-flow-graph__node-gap'),
                       outputs[i] ? port(nodeRow, outputs[i]) : el('span', 'twm-flow-graph__node-gap'));
            n.appendChild(row);
        }
        if (def) mountInline(n, nodeRow);
        const own = def ? catalogue.body?.(nodeRow.type) : null;
        if (own) mountBody(n, nodeRow, own);
        if (!def) n.appendChild(el('p', 'twm-flow-graph__node-finding', say(S, 'unknownType', nodeRow.type)));
        if (typeof summarise === 'function') n.appendChild(el('p', 'twm-flow-graph__node-summary'));
        const notes = el('div', 'twm-flow-graph__node-findings');
        const runLine = el('p', 'twm-flow-graph__node-run');
        n.append(notes, runLine);
        if (multi) {
            // Ahead of the header's own press, which stops it from going on.
            n.addEventListener('pointerdown', (ev) => {
                released = null;
                if (ev.button !== 0 || ev.target.closest('.twm-flow-graph__port')) return;
                pressed = { id: nodeRow.id, moved: false };
            }, true);
        }
        n.addEventListener('click', (ev) => {
            if (ev.target.closest('.twm-flow-graph__port')) return;
            if (multi) {
                const press = pressed || released;
                pressed = released = null;
                if (toggles(ev)) { togglePick(nodeRow.id); return; }
                if (press?.id === nodeRow.id && press.moved) return;     // the tail of a drag
            }
            if (!(selected?.kind === 'node' && selected.id === nodeRow.id)) select({ kind: 'node', id: nodeRow.id });
        });
        n.addEventListener('focus', () => {
            // A press's focus is the press's to settle (its click); a node of
            // the picked set keeps the set when the keyboard arrives on it.
            if (multi && (pressed?.id === nodeRow.id || isPicked(nodeRow.id))) return;
            if (!(selected?.kind === 'node' && selected.id === nodeRow.id)) select({ kind: 'node', id: nodeRow.id });
        });
        if (hoverHighlight) {
            n.addEventListener('pointerenter', () => hover({ kind: 'node', id: nodeRow.id }));
            n.addEventListener('pointerleave', () => {
                if (hovered?.kind === 'node' && hovered.id === nodeRow.id) hover(null);
            });
        }
        return n;
    }

    // ── edited on the node ──────────────────────────────────────────────

    /** The type's `inline` settings under the node's ports, each drawn by the
     *  panel's widget registry; their writes are the panel's `flow:node:config`. */
    function mountInline(n, nodeRow) {
        const list = inlineFields(nodeRow);
        if (!list.length) return;
        const box = el('div', 'twm-flow-graph__node-inline');
        const drawn = { readOnly: isReadOnly(), fields: [] };
        for (const f of list) {
            const slot = { key: f.key, spec: f, shown: shownKey(nodeRow.config[f.key]), field: null };
            slot.field = inlineField(nodeRow.id, slot, nodeRow.config[f.key]);
            drawn.fields.push(slot);
            box.appendChild(slot.field.el);
        }
        n.appendChild(box);
        inlines.set(nodeRow.id, drawn);
    }

    const shownKey = (v) => (v === undefined ? '' : JSON.stringify(v));

    function inlineField(id, slot, value) {
        return renderField(slot.spec, value, {
            widgets, referenceMap: references, strings: S, services, readOnly: isReadOnly(),
            step: nodeOf(id), type: typeOf(nodeOf(id)), path: '',
            set: (key, v) => {
                const before = slot.shown;
                slot.shown = shownKey(v);
                // Its own merge key: typing on the node, then in the panel, is two gestures.
                if (!setNodeConfig(id, { [key]: v }, 'inline')) slot.shown = before;
            },
        });
    }

    /** The node's inline controls brought in step with its config: a control
     *  whose value changed elsewhere (the panel, an undo) is drawn again, and
     *  every one is when read only changed. The one being typed in already
     *  shows what it wrote (its `set` moved `shown`), so it is left alone; a
     *  focused one drawn again gets its focus and caret back. */
    function paintInline(nodeRow) {
        const drawn = inlines.get(nodeRow.id);
        if (!drawn) return;
        const roNow = isReadOnly();
        const roChanged = drawn.readOnly !== roNow;
        drawn.readOnly = roNow;
        for (const slot of drawn.fields) {
            const value = nodeRow.config[slot.key];
            const shown = shownKey(value);
            if (!roChanged && shown === slot.shown) continue;
            const held = heldCaret(slot.field);
            slot.field.destroy();
            const fresh = inlineField(nodeRow.id, slot, value);
            slot.field.el.replaceWith(fresh.el);
            slot.field = fresh;
            slot.shown = shown;
            if (held) restoreCaret(fresh, held.caret);
        }
    }

    /** Whether `field` holds the focus, and where its caret is: {caret} | null. */
    function heldCaret(field) {
        const active = document.activeElement;
        if (!active || !field.el.contains(active)) return null;
        let caret = field.caret?.() ?? null;
        if (!caret) {
            try {
                if (Number.isInteger(active.selectionStart)) {
                    caret = { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
                }
            } catch { /* a type without a caret */ }
        }
        return { caret };
    }

    function restoreCaret(field, caret) {
        if (!field.focus() || !caret) return;
        if (field.caret?.()) { field.restoreCaret(caret); return; }
        const box = document.activeElement;
        try {
            const end = box.value.length;
            box.setSelectionRange(Math.min(caret.start, end), Math.min(caret.end, end), caret.direction || 'none');
        } catch { /* no caret */ }
    }

    function dropInline(id) {
        inlines.get(id)?.fields.forEach((slot) => slot.field.destroy());
        inlines.delete(id);
    }

    const shownName = (nodeRow) => nodeRow.label || typeOf(nodeRow)?.label || nodeRow.type;

    /** The node's name as `text` (empty: back to its type's), in place: the
     *  node's title and shape key, so the next paint does not rebuild a node
     *  a press may be on. ONE `flow:node:label` edit. */
    function renameNode(id, text) {
        const nodeRow = nodeOf(id);
        if (!nodeRow) return;
        if (text) nodeRow.label = text; else delete nodeRow.label;
        const n = nodeEls.get(nodeRow.id);
        const name = shownName(nodeRow);
        const title = n?.querySelector('.twm-flow-graph__node-title');
        if (title) title.textContent = title.title = name;
        if (n) {
            n.dataset.shape = `${nodeRow.type}|${nodeRow.label || ''}`;
            n.setAttribute('aria-label', name);
        }
        commit('flow:node:label', `label:${id}`);
    }

    /** `renameInPlace`: a text box over the node's title, the name selected. */
    function startRename(id) {
        if (!renameInPlace || isReadOnly() || destroyed) return false;
        renaming?.finish(false);
        const nodeRow = nodeOf(id);
        const n = nodeEls.get(id);
        const title = n?.querySelector('.twm-flow-graph__node-title');
        if (!nodeRow || !title) return false;
        const before = shownName(nodeRow);
        const input = el('input', 'twm-flow-graph__node-title-input');
        input.type = 'text';
        input.value = before;
        input.setAttribute('aria-label', say(S, 'rename'));
        const edit = { id };
        let done = false;
        edit.finish = (keep, { enter = false } = {}) => {
            if (done) return;
            const text = input.value.trim();
            if (keep && !text) {
                setMessage(say(S, 'nameEmpty'), 'warning');
                input.setAttribute('aria-invalid', 'true');
                if (enter && input.isConnected) return;          // still open, to be typed again
            } else if (input.getAttribute('aria-invalid')) setMessage('');
            done = true;
            if (renaming === edit) renaming = null;
            const hadFocus = input === document.activeElement;
            input.remove();
            title.hidden = false;
            if (keep && text && text !== before && nodeOf(id)) {
                renameNode(id, text);
                if (selected?.kind === 'node' && selected.id === id) paintPanel();
            }
            if (hadFocus && n.isConnected) n.focus({ preventScroll: true });
        };
        input.addEventListener('keydown', (ev) => {
            if (ev.isComposing) return;
            if (ev.key === 'Enter') { ev.preventDefault(); edit.finish(true, { enter: true }); }
            else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); edit.finish(false); }
        });
        input.addEventListener('blur', () => edit.finish(true));
        // The box's press is the box's: no move, no pan.
        input.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        title.hidden = true;
        title.after(input);
        renaming = edit;
        input.focus({ preventScroll: true });
        input.select();
        return true;
    }

    /** A copy of the node for a body to read: it writes through `ctx.setConfig` only. */
    const nodeCopy = (nodeRow) => normalise({ nodes: [nodeRow], connections: [] }).nodes[0];

    /** The node's own body: `render` fills it once. One that throws leaves the
     *  node with no body of its own, and says so as one of the editor's findings. */
    function mountBody(n, nodeRow, own) {
        const id = nodeRow.id;
        const box = el('div', 'twm-flow-graph__node-body');
        const ctx = Object.freeze({
            get readOnly() { return isReadOnly(); },
            /** What the host shows on this node now (`setNodeValues`), a copy; null when nothing. */
            get values() { return valuesCopy(id); },
            services,
            setConfig: (patch) => setNodeConfig(id, patch),
        });
        try {
            own.render(box, nodeCopy(nodeRow), ctx);
        } catch (err) {
            bodyFailed(nodeRow, 'render', err);
            return;
        }
        n.appendChild(box);
        bodies.set(id, { el: box, ctx, update: own.update });
    }

    function bodyFailed(nodeRow, stage, err) {
        const name = nodeRow.label || typeOf(nodeRow)?.label || nodeRow.type;
        const why = err && typeof err === 'object' && 'message' in err ? err.message : err;
        bodyFindings.set(nodeRow.id, Object.freeze({
            code: `node-${stage}`, severity: 'error', node_id: nodeRow.id,
            message: say(S, stage === 'render' ? 'renderFailed' : 'updateFailed', name, String(why ?? '')),
        }));
    }

    /** A body's write: the node's config merged with `patch` (an `undefined`
     *  value removes that key), as ONE `flow:node:config` edit. Refused while
     *  read only, from inside a `render` or `update`, and whole (nothing
     *  written) when a value in `patch` cannot be cloned. */
    function setNodeConfig(id, patch, from = 'config') {
        if (destroyed || painting || isReadOnly()) return false;
        const nodeRow = nodeOf(id);
        if (!nodeRow || !patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
        const keys = Object.keys(patch).sort();
        if (!keys.length) return false;
        // Clone the whole patch before touching the node: a value that cannot
        // be cloned throws here, so a bad patch changes nothing.
        let next;
        try { next = structuredClone(patch); } catch { return false; }
        for (const k of keys) {
            if (next[k] === undefined) delete nodeRow.config[k]; else nodeRow.config[k] = next[k];
        }
        paintNodes();
        if (selected?.kind === 'node' && selected.id === id) paintPanel();
        commit('flow:node:config', `${from}:${id}:${keys.join(',')}`);
        return true;
    }

    /** The header's fold button (`collapsible`): its press is its own, never a drag. */
    function foldButton(id) {
        const b = el('button', 'twm-flow-graph__node-fold');
        b.type = 'button';
        b.appendChild(icon('expand_less'));
        b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const nodeRow = nodeOf(id);
            if (nodeRow) setCollapsed(id, nodeRow.collapsed !== true);
        });
        return b;
    }

    /** Fold a node to its header, or unfold it: ONE `flow:node:collapse` entry.
     *  False when refused: no `collapsible`, read only, no such node, no change. */
    function setCollapsed(id, collapsed) {
        if (!folding || destroyed || isReadOnly()) return false;
        const nodeRow = nodeOf(id);
        if (!nodeRow || (nodeRow.collapsed === true) === Boolean(collapsed)) return false;
        if (collapsed) nodeRow.collapsed = true; else delete nodeRow.collapsed;
        if (connecting?.source === id) cancelConnect();
        paintNodes();
        commit('flow:node:collapse');
        return true;
    }

    /** One node's entry of `setNodeValues`, read into what is drawn; null when it shows nothing. */
    function valueEntry(v) {
        if (!v || typeof v !== 'object') return null;
        const text = (x) => (x === undefined || x === null || x === '' ? null : String(x));
        const ports = {};
        for (const [name, x] of Object.entries(plainObject(v.ports))) {
            const shown = text(x);
            if (shown !== null) ports[name] = shown;
        }
        const badge = text(v.badge);
        if (badge === null && !Object.keys(ports).length) return null;
        return Object.freeze({ badge, tone: TONES.includes(v.tone) ? v.tone : null, ports: Object.freeze(ports) });
    }

    const valuesCopy = (id) => {
        const v = liveValues.get(id);
        return v ? { badge: v.badge, tone: v.tone, ports: { ...v.ports } } : null;
    };

    /** A node's live values onto its header and its ports, in place. An
     *  element is there only while it has a value to show. */
    function paintValues(n, nodeRow) {
        const v = liveValues.get(nodeRow.id) || null;
        const header = n.querySelector('.twm-flow-graph__node-head');
        let badge = header.querySelector('.twm-flow-graph__node-badge');
        if (v?.badge !== null && v?.badge !== undefined) {
            if (!badge) {
                badge = el('span', 'twm-flow-graph__node-badge');
                header.insertBefore(badge, header.querySelector('.twm-flow-graph__node-tag'));
            }
            if (badge.textContent !== v.badge) badge.textContent = badge.title = v.badge;
            if (v.tone) badge.dataset.tone = v.tone; else delete badge.dataset.tone;
        } else badge?.remove();
        for (const b of n.querySelectorAll('.twm-flow-graph__port')) {
            const shown = v && Object.hasOwn(v.ports, b.dataset.port) ? v.ports[b.dataset.port] : null;
            let tag = b.querySelector('.twm-flow-graph__port-value');
            if (shown === null) { tag?.remove(); continue; }
            if (!tag) {
                tag = el('span', 'twm-flow-graph__port-value');
                b.insertBefore(tag, b.querySelector('.twm-flow-graph__port-count'));
            }
            if (tag.textContent !== shown) tag.textContent = shown;
        }
    }

    /** A node's own `update`, onto its body; true when its body's findings changed. */
    function runUpdate(nodeRow) {
        const own = bodies.get(nodeRow.id);
        if (typeof own?.update !== 'function') return false;
        try {
            own.update(own.el, nodeCopy(nodeRow), own.ctx);
            if (bodyFindings.get(nodeRow.id)?.code !== 'node-update') return false;
            bodyFindings.delete(nodeRow.id);
            return true;
        } catch (err) {
            const before = bodyFindings.get(nodeRow.id)?.message;
            bodyFailed(nodeRow, 'update', err);
            return before !== bodyFindings.get(nodeRow.id).message;
        }
    }

    function port(nodeRow, p) {
        const b = el('button', `twm-flow-graph__port twm-flow-graph__port--${p.direction === 'input' ? 'in' : 'out'}`);
        b.type = 'button';
        b.dataset.port = p.name;
        b.dataset.direction = p.direction;
        b.append(el('span', 'twm-flow-graph__port-dot'), el('span', 'twm-flow-graph__port-label', p.label || p.name),
                 el('span', 'twm-flow-graph__port-count'));
        const isData = (p.port_type || 'FLOW') !== 'FLOW';
        if (isData) {
            b.classList.add('twm-flow-graph__port--data');
            if (!dataConnect) {
                b.disabled = true;
                b.dataset.data = '';
                b.title = say(S, 'dataPort', dataPortRead ? dataPortRead(nodeRow, p) : null);
                return b;
            }
        }
        b.title = p.direction === 'output' ? say(S, 'connectFrom') : say(S, 'connectTo');
        b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (linking && suppressClick) return;                // the tail of a connection drag
            portClicked(nodeRow.id, p);
        });
        if (linking && p.direction === 'output') b.addEventListener('pointerdown', (ev) => startConnectDrag(ev, nodeRow.id, p));
        return b;
    }

    function portClicked(nodeId, p) {
        if (isReadOnly()) return;
        if (p.direction === 'output') {
            if (pendingOffer) clearOffer();
            connecting = { source: nodeId, sourcePort: p.name };
            root.classList.add('twm-flow-graph--connecting');
            paintNodes();
            setMessage(say(S, 'connectStarted'));
            return;
        }
        if (!connecting) {
            setMessage(say(S, 'connectFirst'));
            return;
        }
        const edge = { ...connecting, target: nodeId, targetPort: p.name };
        if (verdictOf) {
            cancelConnect();
            linkTo(edge);
            return;
        }
        const verdict = connect(graph, catalogue, edge, { strings: S });
        cancelConnect();
        if (!verdict.ok) { setMessage(verdict.reason, 'warning'); return; }
        setMessage(isReturn(edge, nodeOf(nodeId)) ? say(S, 'connectedReturn') : '');
        paintEdges();
        commit('flow:edge:connect');
    }

    function cancelConnect() {
        connecting = null;
        root.classList.remove('twm-flow-graph--connecting');
        paintNodes();
    }

    // ── connections under the `connections` option ──────────────────────

    /** Ask the rules; refuse in words, show an offer, or connect. */
    function linkTo(edge) {
        const verdict = verdictOf(graph, edge);
        if (!verdict.ok) { setMessage(verdict.reason, 'warning'); return; }
        const build = () => addConnection(graph, edge);
        if (verdict.offer) { showOffer(verdict.offer, build, 'flow:edge:connect'); return; }
        build();
        setMessage(isReturn(edge, nodeOf(edge.target)) ? say(S, 'connectedReturn') : '');
        paintEdges();
        commit('flow:edge:connect');
    }

    /** A legal-once-something-else-changes line: its sentence, Accept and Not now. */
    function showOffer(offer, build, action, after = null) {
        const words = String(offer?.message ?? '');
        pendingOffer = { offer, build, action, after };
        const accept = button({ label: offer?.accept ? String(offer.accept) : say(S, 'offerAccept'), primary: true,
                                className: 'twm-flow-graph__offer-accept', onClick: () => acceptOffer() });
        accept.dataset.action = 'accept-offer';
        const dismiss = button({ label: say(S, 'offerDismiss'), className: 'twm-flow-graph__offer-dismiss',
                                 onClick: () => { clearOffer(); keepFocus(); } });
        dismiss.dataset.action = 'dismiss-offer';
        offerBox.replaceChildren(el('p', 'twm-flow-graph__offer-text', words), accept, dismiss);
        offerBox.hidden = false;
        setMessage('');
    }

    function clearOffer() {
        pendingOffer = null;
        if (!offerBox) return;
        offerBox.hidden = true;
        offerBox.replaceChildren();
    }

    /** The line (and step) the offer was made for, then its `apply` on a copy — ONE undo entry. */
    function acceptOffer() {
        const held = pendingOffer;
        if (!held || destroyed) return;
        clearOffer();
        if (isReadOnly()) return;
        const made = held.build();
        if (typeof held.offer?.apply === 'function') {
            const draft = normalise(graph);
            const back = held.offer.apply(draft);
            graph = normalise(back && typeof back === 'object' ? back : draft);
        }
        held.after?.(made);
        prunePick();
        findingsBy = groupFindings(allFindings(), { graph });
        paintNodes();
        paintPanel();
        announceSelection();
        commit(held.action);
        keepFocus();
    }

    /** An output dragged: released on an input it connects, on the empty canvas it asks for a step. */
    function startConnectDrag(ev, nodeId, p) {
        if (ev.button !== 0 || ev.isPrimary === false || isReadOnly()) return;
        dragCleanup?.();
        const start = { x: ev.clientX, y: ev.clientY };
        let draft = null;
        const onMove = (m) => {
            if (!draft) {
                if (Math.abs(m.clientX - start.x) + Math.abs(m.clientY - start.y) < DRAG_PX) return;
                if (pendingOffer) clearOffer();
                connecting = { source: nodeId, sourcePort: p.name };
                root.classList.add('twm-flow-graph--connecting');
                paintNodes();
                setMessage(say(S, 'connectDrag'));
                draft = document.createElementNS(SVG, 'path');
                draft.setAttribute('class', 'twm-flow-graph__edge twm-flow-graph__edge--draft');
            }
            const from = nodeOf(nodeId);
            if (!from) return;
            if (!draft.isConnected) canvas.edgeLayer.appendChild(draft);
            draft.setAttribute('d', routeEdge(anchor(from, p.name, 'output'),
                                              canvas.clientToCanvas(m.clientX, m.clientY), { simple: true }));
        };
        const finish = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey, true);
            draft?.remove();
            dragCleanup = null;
        };
        function onUp(u) {
            const dragged = Boolean(draft);
            finish();
            if (!dragged) return;                        // a click: click-then-click
            swallowNextClick({ afterRelease: true });
            dropConnection(u);
        }
        function onCancel() {
            const dragged = Boolean(draft);
            finish();
            if (dragged) { cancelConnect(); setMessage(''); }
        }
        function onKey(k) {
            if (k.key !== 'Escape') return;
            k.preventDefault();
            k.stopPropagation();
            const dragged = Boolean(draft);
            finish();
            if (!dragged) return;
            cancelConnect();
            setMessage('');
            swallowNextClick();                          // the port is still pressed
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey, true);
        dragCleanup = finish;
    }

    /** Where a dragged line was let go. The element under the pointer, not the
     *  release's target: a touch pointer is captured by the port it started on,
     *  so `u.target` is the source port. Released outside the window the point
     *  has no element (null) and the line is let go over nothing. */
    function dropConnection(u) {
        const from = connecting;
        const under = document.elementFromPoint(u.clientX, u.clientY);
        const nodeHit = under?.closest('[data-node-id]');
        const onNode = Boolean(nodeHit && canvas.nodeLayer.contains(nodeHit));
        const portHit = onNode ? under.closest('.twm-flow-graph__port') : null;
        if (portHit && portHit.dataset.direction === 'input') {
            portClicked(nodeHit.dataset.nodeId, { direction: 'input', name: portHit.dataset.port });
            return;
        }
        cancelConnect();
        if (onNode) { setMessage(say(S, 'dropOnInput')); return; }
        if ((under && canvas.root.contains(under)) || overCanvas(u.clientX, u.clientY)) { openDropPicker(from, u); return; }
        setMessage('');
    }

    /** The step picker at the drop, offering only the types with an input `from` may connect to. */
    function openDropPicker(from, u) {
        const p = canvas.clientToCanvas(u.clientX, u.clientY);
        const where = { x: canvas.snap(p.x), y: canvas.snap(p.y - BOX.header / 2) };
        const fits = new Map();
        for (const t of catalogue.list()) {
            if (t.unavailable || !offered(t)) continue;
            const trial = normalise(graph);
            const added = addNode(trial, t.type_id, where, { catalogue });
            let pick = null;
            for (const inp of catalogue.inputs(t.type_id)) {
                const v = verdictOf(trial, { ...from, target: added.id, targetPort: inp.name });
                if (v.ok && (!pick || (pick.offer && !v.offer))) pick = { port: inp.name, offer: v.offer || null };
                if (pick && !pick.offer) break;
            }
            if (pick) fits.set(t.type_id, pick);
        }
        if (!fits.size) { setMessage(say(S, 'dropNothingFits'), 'warning'); return; }
        const mark = el('span', 'twm-flow-graph__drop-anchor');
        const box = canvasHost.getBoundingClientRect();
        mark.style.left = `${Math.round(u.clientX - box.left)}px`;
        mark.style.top = `${Math.round(u.clientY - box.top)}px`;
        canvasHost.appendChild(mark);
        const asked = snapshot();
        openStepPicker({
            anchor: mark, strings: S, title: say(S, 'dropPickerTitle'),
            categories: catalogue.categories.map((c) => ({ id: c.id, label: c.label, layout: c.layout })),
            entries: catalogue.list().filter((t) => fits.has(t.type_id)).map((t) => ({
                id: t.type_id, label: t.label, description: t.description, icon: t.icon || 'widgets',
                tone: catalogue.tone(t.type_id), category: t.category ?? '' })),
        }).then((choice) => {
            mark.remove();
            if (destroyed) return;
            if (!choice?.entry || isReadOnly() || snapshot() !== asked) { keepFocus(); return; }
            const fitting = fits.get(choice.entry.id);
            const build = () => {
                const added = addNode(graph, choice.entry.id, where, { catalogue });
                addConnection(graph, { ...from, target: added.id, targetPort: fitting.port });
                return added.id;
            };
            const after = (id) => { if (nodeOf(id)) selected = { kind: 'node', id }; };
            if (fitting.offer) { showOffer(fitting.offer, build, 'flow:node:add', after); keepFocus(); return; }
            after(build());
            paintNodes();
            paintPanel();
            announceSelection();
            commit('flow:node:add');
            keepFocus();
        });
    }

    /** A press on a node's header: it picks the node and drags it — or, when
     *  it is one of several picked (`multiSelect`), drags them all. A
     *  Shift/Ctrl press is a toggle, settled by its click, and drags nothing. */
    function startMove(ev, nodeId) {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        if (toggles(ev)) return;
        if (!(multi && isPicked(nodeId))) select({ kind: 'node', id: nodeId });
        if (isReadOnly()) return;
        const ids = selected?.kind === 'many' ? selected.ids : [nodeId];
        if (!ids.includes(nodeId)) return;
        dragItems(ev, ids, pickedNotes(), () => { if (pressed?.id === nodeId) pressed.moved = true; });
    }

    /** Drag these nodes and notes together by the pointer: ONE entry when it
     *  moved — `flow:node:move` for one node, `flow:note:move` for notes only,
     *  `flow:nodes:move` for anything more. */
    function dragItems(ev, nodeIds, noteIds, onFirstMove = null) {
        const rows = [
            ...nodeIds.map((id) => ({ item: nodeOf(id), n: nodeEls.get(id) })),
            ...noteIds.map((id) => ({ item: noteOf(id), n: noteEls.get(id), note: true })),
        ].filter((r) => r.item && r.n);
        if (!rows.length) return;
        const from = rows.map((r) => ({ ...r.item.position }));
        const start = { x: ev.clientX, y: ev.clientY };
        let moved = false;
        const onMove = (m) => {
            const dx = (m.clientX - start.x) / canvas.scale;
            const dy = (m.clientY - start.y) / canvas.scale;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            moved = true;
            onFirstMove?.();
            rows.forEach(({ item, n }, i) => {
                item.position = { x: canvas.snap(from[i].x + dx), y: canvas.snap(from[i].y + dy) };
                n.style.left = `${item.position.x}px`;
                n.style.top = `${item.position.y}px`;
            });
            paintEdges();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (!moved) return;
            const nodes = rows.filter((r) => !r.note).length;
            commit(!nodes ? 'flow:note:move' : rows.length > 1 ? 'flow:nodes:move' : 'flow:node:move');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /** Positions and classes onto the nodes that exist; a node is BUILT only
     *  when it is new or its type, its type's definition or its label changed,
     *  never on a press. A node's own body is brought up to date in place. */
    function paintNodes() {
        if (destroyed) return;
        painting = true;
        let bodyChanged = false;
        try {
            const live = new Set(graph.nodes.map((x) => x.id));
            for (const [id, n] of nodeEls) {
                if (!live.has(id)) {
                    n.remove();
                    nodeEls.delete(id);
                    builtFrom.delete(id);
                    bodies.delete(id);
                    dropInline(id);
                    if (renaming?.id === id) renaming.finish(false);
                    bodyChanged = bodyFindings.delete(id) || bodyChanged;
                }
            }
            if (bodyChanged) findingsBy = groupFindings(allFindings(), { graph });
            const picks = pickedSet();
            for (const nodeRow of graph.nodes) bodyChanged = paintNode(nodeRow, picks) || bodyChanged;
            paintNotes();
        } finally {
            painting = false;
        }
        if (bodyChanged) {
            // The editor's own findings moved: the strip and the panel say so too.
            paintStrip();
            panel.setFindings(allFindings());
        }
        paintEdges();
    }

    /** The consumer's `edgeStyle` for one line, read into what the editor draws. */
    function edgeLook(c, source, target, back) {
        const look = edgeStyle({ ...c }, { source, target, back });
        if (!look || typeof look !== 'object') return null;
        const width = Number(look.width);
        return {
            tone: TONES.includes(look.tone) ? look.tone : null,
            dashed: Boolean(look.dashed),
            width: Number.isFinite(width) && width > 0 ? width : null,
            marker: typeof look.marker === 'string' && look.marker ? look.marker : null,
            label: look.label === undefined || look.label === null || look.label === '' ? null : String(look.label),
        };
    }

    /** A line's colour and width are custom properties the stylesheet reads,
     *  so a picked or highlighted line still wins over the consumer's. */
    function applyLook(element, look) {
        if (look.tone) element.style.setProperty('--twm-canvas-edge-stroke', `var(--twm-flow-${look.tone}-fg)`);
        if (look.width) element.style.setProperty('--twm-canvas-edge-width', String(look.width));
    }

    /** The arrowhead: its tip on the input port, its base where the line ends. */
    function arrowHead(tip, side) {
        const out = side === 'right' ? 1 : -1;
        const baseX = tip.x + out * ARROW.length;
        const head = document.createElementNS(SVG, 'path');
        head.setAttribute('class', 'twm-flow-graph__edge-arrow');
        head.setAttribute('d', `M ${tip.x} ${tip.y} L ${baseX} ${tip.y - ARROW.half} L ${baseX} ${tip.y + ARROW.half} Z`);
        return head;
    }

    /** Where a line into `to` stops: behind its marker, which ends it. */
    function lineEnd(to, marker) {
        if (marker === 'arrow') return { ...to, x: to.x + (to.side === 'right' ? 1 : -1) * ARROW.length };
        return marker ? footAnchor(to, to.side, marker) : to;
    }

    /** Does the line drawing `c` touch what the pointer is over? */
    const touches = (c) => (hovered?.kind === 'node' ? c.source === hovered.id || c.target === hovered.id
        : hovered?.kind === 'edge' ? sameEdge(c, hovered.edge) : false);

    /** The highlight follows the pointer IN PLACE: a line rebuilt under the
     *  pointer would be entered again, and repaint again, on every move. */
    function hover(next) {
        hovered = next;
        for (const { c, line } of edgeEls) line.classList.toggle('twm-flow-graph__edge--highlighted', touches(c));
    }

    /** The consumer's findings, and — while `routing: 'obstacles'` is over the
     *  kernel's limit — the editor's own sentence saying the lines are plain. */
    function paintStrip() {
        strip.set(routingFallback ? [...allFindings(), { code: 'canvas-routing-simple', severity: 'warning',
                                                     message: say(S, 'routingFallback', OBSTACLE_ROUTING_NODE_LIMIT) }]
            : allFindings());
    }

    /** One node onto the canvas; true when its body's findings changed. */
    function paintNode(nodeRow, picks) {
        let bodyChanged = false;
        let n = nodeEls.get(nodeRow.id);
        const def = typeOf(nodeRow);
        const shape = `${nodeRow.type}|${nodeRow.label || ''}`;
        const key = buildKey(nodeRow);
        if (!n || n.dataset.shape !== shape || !sameBuild(builtFrom.get(nodeRow.id), key)) {
            if (renaming?.id === nodeRow.id) renaming.finish(false);
            bodies.delete(nodeRow.id);
            dropInline(nodeRow.id);
            bodyChanged = bodyFindings.delete(nodeRow.id);
            const fresh = buildNode(nodeRow, def);
            bodyChanged = bodyChanged || bodyFindings.has(nodeRow.id);
            fresh.dataset.shape = shape;
            const focused = n && n.contains(document.activeElement);
            if (n) n.replaceWith(fresh); else canvas.nodeLayer.appendChild(fresh);
            nodeEls.set(nodeRow.id, fresh);
            builtFrom.set(nodeRow.id, key);
            n = fresh;
            if (focused) fresh.focus({ preventScroll: true });
        } else paintInline(nodeRow);
        bodyChanged = runUpdate(nodeRow) || bodyChanged;
        if (bodyChanged) findingsBy = groupFindings(allFindings(), { graph });
        n.style.left = `${nodeRow.position.x}px`;
        n.style.top = `${nodeRow.position.y}px`;
        n.style.width = `${widthOf(nodeRow)}px`;
        const folded = BOX.folded(nodeRow);
        const h = folded ? null : catalogue.size?.(nodeRow.type)?.h;
        if (h) n.style.height = `${h}px`; else n.style.removeProperty('height');
        n.classList.toggle('twm-flow-graph__node--sized', Boolean(h));
        if (folding) paintFold(n, folded);
        if (liveValues.size || n.querySelector('.twm-flow-graph__node-badge, .twm-flow-graph__port-value')) {
            paintValues(n, nodeRow);
        }
        const accent = catalogue.accent?.(nodeRow.type) || null;
        if (accent) n.dataset.accent = accent; else delete n.dataset.accent;
        const picked = picks.has(nodeRow.id);
        n.classList.toggle('twm-flow-graph__node--picked', picked);
        if (picked) n.setAttribute('aria-current', 'true'); else n.removeAttribute('aria-current');
        n.classList.toggle('twm-flow-graph__node--connect-source', connecting?.source === nodeRow.id);
        const mine = findingsBy.get(nodeRow.id) || [];
        const errors = mine.filter((f) => f.severity !== 'warning');
        n.classList.toggle('twm-flow-graph__node--error', errors.length > 0);
        n.classList.toggle('twm-flow-graph__node--warning', errors.length === 0 && mine.length > 0);
        n.querySelector('.twm-flow-graph__node-findings').replaceChildren(...mine.slice(0, 2).map((f) => el('p',
            `twm-flow-graph__node-finding${f.severity === 'warning' ? ' twm-flow-graph__node-finding--warning' : ''}`,
            String(f.message ?? ''))));
        const summary = n.querySelector('.twm-flow-graph__node-summary');
        if (summary) summary.textContent = summarise(nodeRow, typeOf(nodeRow)) || '';
        const step = overlay?.steps?.[nodeRow.id] || null;
        const line = n.querySelector('.twm-flow-graph__node-run');
        line.textContent = step ? String(step.line ?? step.state ?? '') : '';
        if (step?.state) line.dataset.state = String(step.state); else delete line.dataset.state;
        if (step?.tone) line.dataset.tone = String(step.tone); else delete line.dataset.tone;
        n.classList.toggle('twm-flow-graph__node--skipped', step?.state === 'skipped' || step?.state === 'not-reached');
        const ports = overlay?.ports?.[nodeRow.id] || null;
        for (const b of n.querySelectorAll('.twm-flow-graph__port')) {
            if (!('data' in b.dataset)) b.disabled = isReadOnly();
            if (verdictOf && b.dataset.direction === 'input') {
                b.classList.toggle('twm-flow-graph__port--can-drop', Boolean(connecting) && verdictOf(graph, {
                    ...connecting, target: nodeRow.id, targetPort: b.dataset.port }).ok);
            }
            const mark = b.dataset.direction === 'output' ? ports?.[b.dataset.port] : null;
            b.classList.toggle('twm-flow-graph__port--taken', Boolean(mark?.taken));
            b.classList.toggle('twm-flow-graph__port--untaken', Boolean(mark) && !mark.taken);
            const count = b.querySelector('.twm-flow-graph__port-count');
            count.textContent = mark?.taken && Number.isFinite(Number(mark.count)) && mark.count !== null
                ? say(S, 'portCount', mark.count) : mark && !mark.taken ? say(S, 'portNotTaken') : '';
        }
        return bodyChanged;
    }

    /** A node folded or not (`collapsible`): its class and its button's state, in place. */
    function paintFold(n, folded) {
        n.classList.toggle('twm-flow-graph__node--collapsed', folded);
        const b = n.querySelector('.twm-flow-graph__node-fold');
        if (!b) return;
        b.disabled = isReadOnly();
        b.setAttribute('aria-expanded', String(!folded));
        b.title = say(S, folded ? 'expandNode' : 'collapseNode');
        b.setAttribute('aria-label', b.title);
        const glyph = b.querySelector('.material-symbols-outlined');
        const name = folded ? 'expand_more' : 'expand_less';
        if (glyph && glyph.textContent !== name) glyph.textContent = name;
    }

    function paintEdges() {
        if (destroyed) return;
        const fallback = routing === 'obstacles' && graph.nodes.length > OBSTACLE_ROUTING_NODE_LIMIT;
        if (fallback !== routingFallback) {
            routingFallback = fallback;
            paintStrip();
        }
        const routed = routing === 'obstacles' && !fallback;
        const byId = new Map(graph.nodes.map((x) => [x.id, x]));
        const copies = styled ? new Map(normalise(graph).nodes.map((x) => [x.id, x])) : null;
        const boxes = routed ? graph.nodes.map((x) => ({
            id: x.id, x: x.position.x - CLEARANCE, y: x.position.y - CLEARANCE,
            width: widthOf(x) + 2 * CLEARANCE, height: bottomOf(x) - x.position.y + 2 * CLEARANCE,
        })) : null;
        const paths = [];
        const labels = [];
        edgeEls = [];
        graph.connections.forEach((c) => {
            const a = byId.get(c.source);
            const b = byId.get(c.target);
            if (!a || !b) return;
            const from = anchor(a, c.sourcePort, 'output');
            const to = anchor(b, c.targetPort, 'input');
            const back = isReturn(c, b);
            const look = styled ? edgeLook(c, copies.get(c.source), copies.get(c.target), back) : null;
            const end = look?.marker ? lineEnd(to, look.marker) : to;
            // A loop's return runs UNDER both steps: drawn as a forward curve it
            // doubles back across them and reads as one more step.
            const d = back ? returnEdge(from, end, { floor: Math.max(bottomOf(a), bottomOf(b)) + RETURN_DROP })
                : routed ? routeEdge(from, end, { obstacles: boxes.filter((x) => x.id !== a.id && x.id !== b.id) })
                    : routeEdge(from, end, { simple: true });
            const picked = selected?.kind === 'edge' && sameEdge(selected.edge, c);
            const mark = overlay?.ports?.[c.source]?.[c.sourcePort];
            const line = document.createElementNS(SVG, 'path');
            line.setAttribute('class', ['twm-flow-graph__edge', back ? 'twm-flow-graph__edge--back' : '',
                                        look?.dashed ? 'twm-flow-graph__edge--dashed' : '',
                                        picked ? 'twm-flow-graph__edge--picked' : '',
                                        mark?.taken ? 'twm-flow-graph__edge--taken' : '',
                                        mark && !mark.taken ? 'twm-flow-graph__edge--untaken' : '',
                                        hovered && touches(c) ? 'twm-flow-graph__edge--highlighted' : '']
                .filter(Boolean).join(' '));
            line.setAttribute('d', d);
            if (look) applyLook(line, look);
            const hit = document.createElementNS(SVG, 'path');
            hit.setAttribute('class', 'twm-flow-graph__edge-hit');
            hit.setAttribute('d', d);
            if (back) {
                const title = document.createElementNS(SVG, 'title');
                title.textContent = say(S, 'returnLine');
                hit.appendChild(title);
            }
            const pick = (ev) => {
                ev.stopPropagation();
                select({ kind: 'edge', edge: { ...c } });
            };
            hit.addEventListener('pointerdown', pick);
            if (hoverHighlight) {
                hit.addEventListener('pointerenter', () => hover({ kind: 'edge', edge: { ...c } }));
                hit.addEventListener('pointerleave', () => {
                    if (hovered?.kind === 'edge' && sameEdge(hovered.edge, c)) hover(null);
                });
            }
            paths.push(line);
            if (look?.marker) {
                const head = look.marker === 'arrow' ? arrowHead(to, to.side) : crowsFoot(to, to.side, look.marker);
                if (look.marker !== 'arrow') head.classList.add('twm-flow-graph__edge-foot');
                applyLook(head, look);
                paths.push(head);
            }
            paths.push(hit);
            if (look?.label !== null && look?.label !== undefined) {
                const at = pathMidpoint(d);
                const tag = el('div', 'twm-flow-graph__edge-label', look.label);
                tag.style.left = `${at.x}px`;
                tag.style.top = `${at.y}px`;
                applyLook(tag, look);
                tag.addEventListener('pointerdown', pick);
                labels.push(tag);
            }
            edgeEls.push({ c, line });
        });
        canvas.edgeLayer.replaceChildren(...paths);
        labelLayer?.replaceChildren(...labels);
        paintFrames();
        paintMinimap();
    }

    /** Frame the graph. Never above NATURAL: a short flow is not blown up until
     *  there is no room to add to it. Opening (and Arrange) also keeps it at
     *  READABLE or above — below that a long flow fitted whole draws steps too
     *  small to read or hit — and starts at its first step, at the left, so the
     *  rest is a pan away. **Fit (`whole`) frames ALL of it**, however small:
     *  the reader asked to see the whole, and a Fit that left a long flow where
     *  it was looked like a button that does nothing. */
    function fit({ whole = false } = {}) {
        if (!graph.nodes.length || destroyed) return;
        // A drawn note is framed with the steps.
        const notes = noting ? noteList().map((n) => ({ x: n.position.x, y: n.position.y,
                                                         right: n.position.x + (n.size?.w || NOTE_WIDTH),
                                                         bottom: n.position.y + (n.size?.h || noteEls.get(n.id)?.offsetHeight || 0) })) : [];
        const x = Math.min(...graph.nodes.map((n) => n.position.x), ...notes.map((n) => n.x));
        const y = Math.min(...graph.nodes.map((n) => n.position.y), ...notes.map((n) => n.y));
        const height = Math.max(...graph.nodes.map(bottomOf), ...notes.map((n) => n.bottom)) - y;
        const right = Math.max(...graph.nodes.map((n) => n.position.x + widthOf(n)), ...notes.map((n) => n.right));
        canvas.fit({ x, y, width: right - x, height });
        const scale = canvas.scale > NATURAL ? NATURAL
            : !whole && canvas.scale < READABLE ? READABLE : null;
        if (scale !== null) {
            const box = canvas.root.getBoundingClientRect();
            canvas.setViewport({ scale, tx: 40 - x * scale, ty: box.height / 2 - (y + height / 2) * scale });
        }
    }

    /** Where the `layout` option puts each of `part`'s steps: a Map of id →
     *  `{x, y}` from the origin. */
    function placeSteps(part, ids) {
        if (layout === 'flow') {
            return layoutGraph(part, catalogue, { ...BOX, loopEntry: loopPorts.entry, heightOf: (n) => measured(n) || null });
        }
        const sizeOf = (n) => ({ width: widthOf(n), height: heightOf(n) });
        if (layout === 'layered') {
            return layeredLayout(part.nodes, part.connections.map((c) => ({ from: c.source, to: c.target })), {
                rank: (n) => catalogue.rank(n.type), sizeOf, columnGap: 96, rowGap: 40, componentGap: 80 });
        }
        const at = layout(normalise(part), { catalogue, node: BOX, ids, sizeOf, layeredLayout });
        if (!(at instanceof Map)) throw new Error('The canvas editor\'s layout function must return a Map of id → {x, y}.');
        for (const [id, p] of at) {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
                throw new Error(`The canvas editor's layout function placed "${id}" at ${JSON.stringify(p)}; a place must be finite numbers {x, y}.`);
            }
        }
        return at;
    }

    /** What the toolbar's Arrange lays out: the picked steps when several are
     *  picked (`multiSelect`), else the whole graph. Picked notes do not count:
     *  one step and a note arrange the whole graph. */
    const arrangeTarget = () => (selected?.kind === 'many' && selected.ids.length >= 2 ? { ids: [...selected.ids] } : {});

    /** ARRANGE: the `layout` option's places, anchored at the current top-left
     *  corner of what is arranged so nothing jumps off screen, and ONE undo
     *  entry. With `ids`, only those steps (two or more) and the lines between
     *  them are laid out, and only they move. */
    function arrangeGraph({ ids = null } = {}) {
        if (refusals().arrange) return false;
        const only = Array.isArray(ids) ? new Set(ids.map(String)) : null;
        const nodes = only ? graph.nodes.filter((n) => only.has(n.id)) : graph.nodes;
        if (nodes.length < 2) return false;
        const part = only ? { nodes, connections: graph.connections.filter((c) => only.has(c.source) && only.has(c.target)) }
            : graph;
        const at = placeSteps(part, only ? nodes.map((n) => n.id) : null);
        const ox = Math.min(...nodes.map((x) => x.position.x));
        const oy = Math.min(...nodes.map((x) => x.position.y));
        for (const nodeRow of nodes) {
            const p = at.get(nodeRow.id);
            if (p) {
                nodeRow.position = { x: canvas.snap(ox + p.x), y: canvas.snap(oy + p.y) };
            }
        }
        paintNodes();
        commit('flow:arrange');
        if (!only) fit();
        return true;
    }

    // ── groups and notes (`groups`, `notes`) ────────────────────────────

    /** A fresh id among `list`'s: `stem`, `stem-2`, … */
    function freshId(list, stem) {
        const taken = new Set(list.map((x) => x.id));
        if (!taken.has(stem)) return stem;
        for (let i = 2; ; i += 1) if (!taken.has(`${stem}-${i}`)) return `${stem}-${i}`;
    }

    /** The groups the picked nodes are in, in graph order. */
    const groupsOfPick = () => {
        const ids = pickedSet();
        return groupList().filter((gr) => gr.nodes.some((id) => ids.has(id)));
    };

    /** Take `ids` out of every group (a node is in one at most); a group left
     *  with no member goes. */
    function ungroupNodes(ids) {
        const out = new Set(ids);
        for (const gr of groupList()) gr.nodes = gr.nodes.filter((id) => !out.has(id));
        setGroups(groupList().filter((gr) => gr.nodes.length));
    }

    function setGroups(list) {
        if (list.length) graph.groups = list; else delete graph.groups;
    }

    /** Group these nodes (default: the pick) as ONE `flow:group:add`; each
     *  leaves the group it was in. The new group's id, or null when refused. */
    function groupNodes(ids, { label = '', tone = null } = {}) {
        if (!grouping || isReadOnly()) return null;
        const want = new Set(ids);
        const members = graph.nodes.filter((x) => want.has(x.id)).map((x) => x.id);
        if (!members.length) return null;
        ungroupNodes(members);
        const id = freshId(groupList(), 'group');
        setGroups([...groupList(), { id, ...(label ? { label: String(label) } : {}),
                                     ...(tone ? { tone: String(tone) } : {}), nodes: members }]);
        paintFrames();
        commit('flow:group:add');
        paintToolbar();
        return id;
    }

    function groupPicked() {
        if (refusals().group) return false;
        return groupNodes(pickedIds()) !== null;
    }

    /** Ungroup these groups (default: the ones the pick is in) as ONE `flow:group:remove`. */
    function ungroupGroups(groupIds) {
        if (!grouping || isReadOnly()) return false;
        const gone = new Set(groupIds.filter((id) => groupOf(id)));
        if (!gone.size) return false;
        setGroups(groupList().filter((gr) => !gone.has(gr.id)));
        paintFrames();
        commit('flow:group:remove');
        paintToolbar();
        return true;
    }

    function ungroupPicked() {
        if (refusals().ungroup) return false;
        return ungroupGroups(groupsOfPick().map((gr) => gr.id));
    }

    /** A group's name and tone, as ONE `flow:group:label` (typing merges). */
    function setGroupLook(id, { label, tone } = {}) {
        const gr = grouping && !isReadOnly() ? groupOf(id) : null;
        if (!gr) return false;
        const name = label === undefined ? gr.label || '' : String(label ?? '');
        const look = tone === undefined ? gr.tone || '' : String(tone ?? '');
        if (name === (gr.label || '') && look === (gr.tone || '')) return false;
        setGroups(groupList().map((x) => (x.id !== id ? x : {
            id, ...(name ? { label: name } : {}), ...(look ? { tone: look } : {}), nodes: x.nodes })));
        paintFrames();
        commit('flow:group:label', `group:${id}`);
        return true;
    }

    /** Exactly these members, as ONE `flow:group:members`: each leaves the
     *  group it was in, and none left removes the group. */
    function setGroupMembers(id, ids) {
        const gr = grouping && !isReadOnly() ? groupOf(id) : null;
        if (!gr) return false;
        const want = new Set(ids);
        const members = graph.nodes.filter((x) => want.has(x.id)).map((x) => x.id);
        if (members.length === gr.nodes.length && members.every((m, i) => m === gr.nodes[i])) return false;
        const taken = new Set(members);
        setGroups(groupList().map((x) => (x.id === id ? { ...x, nodes: members }
            : { ...x, nodes: x.nodes.filter((n) => !taken.has(n)) })).filter((x) => x.nodes.length));
        paintFrames();
        commit('flow:group:members');
        paintToolbar();
        return true;
    }

    /** The box round a group's members, its title bar included. */
    function frameBox(gr) {
        const rows = gr.nodes.map(nodeOf).filter(Boolean);
        if (!rows.length) return null;
        const x = Math.min(...rows.map((n) => n.position.x)) - FRAME.pad;
        const y = Math.min(...rows.map((n) => n.position.y)) - FRAME.pad - FRAME.head;
        const right = Math.max(...rows.map((n) => n.position.x + widthOf(n))) + FRAME.pad;
        const bottom = Math.max(...rows.map(bottomOf)) + FRAME.pad;
        return { x, y, width: right - x, height: bottom - y };
    }

    function buildFrame(id) {
        const f = el('div', 'twm-flow-graph__group');
        f.dataset.groupId = id;
        const head = el('div', 'twm-flow-graph__group-head');
        head.appendChild(el('span', 'twm-flow-graph__group-label'));
        head.addEventListener('pointerdown', (ev) => {
            if (ev.button !== 0 || (editing?.kind === 'group' && editing.id === id)) return;
            ev.stopPropagation();
            const gr = groupOf(id);
            if (!gr) return;
            if (multi) pickNodes(gr.nodes);
            if (!isReadOnly()) dragItems(ev, gr.nodes, []);
        });
        head.addEventListener('dblclick', () => editGroupLabel(id));
        f.appendChild(head);
        return f;
    }

    /** The frames, behind the nodes, round their members wherever they are now. */
    function paintFrames() {
        if (!grouping || destroyed) return;
        const live = new Set(groupList().map((gr) => gr.id));
        for (const [id, f] of frameEls) if (!live.has(id)) { f.remove(); frameEls.delete(id); }
        for (const gr of groupList()) {
            let f = frameEls.get(gr.id);
            if (!f) {
                f = buildFrame(gr.id);
                frameEls.set(gr.id, f);
            }
            const box = frameBox(gr);
            Object.assign(f.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`,
                                     height: `${box.height}px` });
            if (TONES.includes(gr.tone)) f.dataset.tone = gr.tone; else delete f.dataset.tone;
            const name = gr.label || say(S, 'groupUntitled');
            f.setAttribute('aria-label', name);
            if (editing?.kind !== 'group' || editing.id !== gr.id) {
                const tag = f.querySelector('.twm-flow-graph__group-label');
                tag.textContent = name;
                tag.title = name;
                tag.classList.toggle('twm-flow-graph__group-label--untitled', !gr.label);
            }
        }
        // Behind every node: first in the node layer, in group order (the
        // first group lowest), and moved only when out of that order.
        const order = groupList().map((gr) => frameEls.get(gr.id));
        const lead = [...canvas.nodeLayer.children].slice(0, order.length);
        if (order.some((f, i) => lead[i] !== f)) canvas.nodeLayer.prepend(...order);
    }

    /** Type into a box in place of `shown`: Enter (a note: Ctrl/⌘+Enter) or
     *  leaving keeps it, Escape puts it back. */
    function typeInPlace(kind, id, shown, input, keep) {
        editing?.done(true);
        input.value = kind === 'note' ? noteOf(id)?.text ?? '' : groupOf(id)?.label ?? '';
        shown.hidden = true;
        shown.after(input);
        let over = false;
        const done = (save) => {
            if (over) return;
            over = true;
            editing = null;
            const text = input.value;
            input.remove();
            shown.hidden = false;
            if (save) keep(text);
            if (kind === 'note') paintNotes(); else paintFrames();
            keepFocus();
        };
        input.addEventListener('keydown', (k) => {
            if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); done(false); return; }
            if (k.key === 'Enter' && (kind !== 'note' || k.ctrlKey || k.metaKey)) {
                k.preventDefault();
                k.stopPropagation();
                done(true);
            }
        });
        input.addEventListener('blur', () => done(true));
        input.addEventListener('pointerdown', (p) => p.stopPropagation());
        editing = { kind, id, done };
        input.focus({ preventScroll: true });
        input.select?.();
    }

    function editGroupLabel(id) {
        const f = frameEls.get(id);
        if (!f || !groupOf(id) || isReadOnly()) return false;
        if (editing?.kind === 'group' && editing.id === id) return true;
        const input = el('input', 'twm-flow-graph__group-input');
        input.type = 'text';
        input.setAttribute('aria-label', say(S, 'groupName'));
        typeInPlace('group', id, f.querySelector('.twm-flow-graph__group-label'), input,
                    (text) => setGroupLook(id, { label: text.trim() }));
        return true;
    }

    /** Add a note as ONE `flow:note:add`: at `position`, or at the centre of the view. */
    function addNote({ text = '', position = null, size = null } = {}) {
        if (!noting || isReadOnly()) return null;
        let where = position;
        if (!where) {
            const box = canvas.visibleBox();
            where = { x: canvas.snap(box.width ? box.x + box.width / 2 - NOTE_WIDTH / 2 : 80),
                      y: canvas.snap(box.height ? box.y + box.height / 3 : 80) };
        }
        const id = freshId(noteList(), 'note');
        const next = normalise({ nodes: [], connections: [], notes: [{ id, text, position: where, size }] }).notes[0];
        graph.notes = [...noteList(), next];
        selected = { kind: 'note', id };
        paintNodes();
        paintPanel();
        announceSelection();
        commit('flow:note:add');
        return structuredClone(next);
    }

    /** A note's text, as ONE `flow:note:edit`. */
    function setNoteText(id, text) {
        const note = noting && !isReadOnly() ? noteOf(id) : null;
        if (!note || note.text === String(text ?? '')) return false;
        note.text = String(text ?? '');
        paintNotes();
        if (selected?.kind === 'note' && selected.id === id) paintPanel();
        commit('flow:note:edit', `note:${id}`);
        return true;
    }

    /** A note put somewhere, as ONE `flow:note:move`. */
    function moveNote(id, position) {
        const note = noting && !isReadOnly() ? noteOf(id) : null;
        const x = Math.round(Number(position?.x));
        const y = Math.round(Number(position?.y));
        if (!note || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (note.position.x === x && note.position.y === y) return false;
        note.position = { x, y };
        paintNotes();
        commit('flow:note:move');
        return true;
    }

    /** Take these notes away, as ONE `flow:note:remove` (the editor's own,
     *  so no commit when `commitAs` is null: the caller's edit carries it). */
    function dropNotes(ids, commitAs = 'flow:note:remove') {
        const gone = new Set(ids);
        const kept = noteList().filter((x) => !gone.has(x.id));
        if (kept.length === noteList().length) return false;
        if (kept.length) graph.notes = kept; else delete graph.notes;
        if (commitAs) {
            prunePick();
            paintNodes();
            paintPanel();
            announceSelection();
            commit(commitAs);
        }
        return true;
    }

    function editNote(id) {
        const box = noteEls.get(id);
        if (!box || !noteOf(id) || isReadOnly()) return false;
        if (editing?.kind === 'note' && editing.id === id) return true;
        const input = el('textarea', 'twm-flow-graph__note-input');
        input.setAttribute('aria-label', say(S, 'noteText'));
        typeInPlace('note', id, box.querySelector('.twm-flow-graph__note-text'), input,
                    (text) => setNoteText(id, text));
        return true;
    }

    function buildNote(id) {
        const box = el('div', 'twm-flow-graph__note');
        box.dataset.noteId = id;
        box.setAttribute('data-twm-flow-item', '');
        box.setAttribute('role', 'note');
        box.tabIndex = 0;
        box.appendChild(el('p', 'twm-flow-graph__note-text'));
        box.addEventListener('pointerdown', (ev) => {
            if (ev.button !== 0 || (editing?.kind === 'note' && editing.id === id)) return;
            ev.stopPropagation();
            if (toggles(ev)) return;                                   // its click toggles it
            if (!isNotePicked(id)) select({ kind: 'note', id });
            if (isReadOnly()) return;
            dragItems(ev, selected?.kind === 'many' ? selected.ids : [], pickedNotes());
        });
        box.addEventListener('click', (ev) => {
            if (!toggles(ev)) return;
            const notes = pickedNotes();
            pickItems(pickedIds(), notes.includes(id) ? notes.filter((x) => x !== id) : [...notes, id]);
        });
        box.addEventListener('dblclick', () => editNote(id));
        return box;
    }

    /** The notes, in place: a note being typed into keeps its box and its text. */
    function paintNotes() {
        if (!noting || destroyed) return;
        const live = new Set(noteList().map((x) => x.id));
        for (const [id, box] of noteEls) if (!live.has(id)) { box.remove(); noteEls.delete(id); }
        const picks = new Set(pickedNotes());
        for (const note of noteList()) {
            let box = noteEls.get(note.id);
            if (!box) {
                box = buildNote(note.id);
                noteEls.set(note.id, box);
                canvas.nodeLayer.appendChild(box);
            }
            box.style.left = `${note.position.x}px`;
            box.style.top = `${note.position.y}px`;
            box.style.width = `${note.size?.w || NOTE_WIDTH}px`;
            if (note.size?.h) box.style.height = `${note.size.h}px`; else box.style.removeProperty('height');
            const picked = picks.has(note.id);
            box.classList.toggle('twm-flow-graph__note--picked', picked);
            if (picked) box.setAttribute('aria-current', 'true'); else box.removeAttribute('aria-current');
            const shown = box.querySelector('.twm-flow-graph__note-text');
            shown.textContent = note.text || say(S, 'noteEmpty');
            shown.classList.toggle('twm-flow-graph__note-text--empty', !note.text);
            box.setAttribute('aria-label', note.text || say(S, 'noteEmpty'));
        }
    }

    /** The notes a marquee box (canvas units) touches, in graph order. */
    function notesIn(box) {
        return noteList().filter((x) => {
            const el2 = noteEls.get(x.id);
            const w = x.size?.w || NOTE_WIDTH;
            const h = x.size?.h || el2?.offsetHeight || FRAME.head;
            return x.position.x < box.x + box.width && x.position.x + w > box.x
                && x.position.y < box.y + box.height && x.position.y + h > box.y;
        }).map((x) => x.id);
    }

    // ── the panel ───────────────────────────────────────────────────────

    const panel = createSettingsPanel({
        widgets, references, strings: S, services, readOnly: isReadOnly(),
        onChange: (stepId, key, value) => {
            if (isReadOnly()) return;
            if (stepId === null) {
                if (value === undefined) delete settingsValue[key]; else settingsValue[key] = value;
                commit('flow:settings', `settings:${key}`);
                return;
            }
            const nodeRow = nodeOf(stepId);
            if (!nodeRow) return;
            if (value === undefined) delete nodeRow.config[key]; else nodeRow.config[key] = value;
            paintNodes();
            commit('flow:node:config', `config:${stepId}:${key}`);
        },
        onRename: (stepId, text) => {
            if (isReadOnly()) return;
            renameNode(stepId, text);
        },
        onFocusLost: () => keepFocus(),
        values: typeof values === 'function' ? (q) => values({
            graph: normalise(graph), stepId: q.stepId, field: q.field, key: q.key,
            before: q.stepId ? alwaysBefore(graph, catalogue, q.stepId, { loopPorts,
                                                                          ...(waitsForAll ? { waitsForAll } : {}) }) : [],
            loops: q.stepId ? enclosingLoops(graph, catalogue, q.stepId, { loopPorts }) : [],
            arms: q.stepId ? enclosingArms(graph, catalogue, q.stepId, { loopPorts }) : [],
            parameters: null,
        }) : null,
        valuesNote,
        host: aside,
    });
    aside.appendChild(connectionBox);

    const strip = createFindingsStrip({
        strings: S,
        nameOf: (id) => {
            if (id === null) return say(S, 'theFlow');
            const n = nodeOf(id);
            return n ? (n.label || typeOf(n)?.label || n.id) : String(id);
        },
        onGoTo: (f) => {
            const target = f.node_id && nodeOf(f.node_id) ? { kind: 'node', id: f.node_id } : { kind: 'flow' };
            select(target);
            if (target.kind === 'node') {
                const n = nodeOf(target.id);
                canvas.bringIntoView({ x: n.position.x, y: n.position.y, width: widthOf(n),
                                       height: bottomOf(n) - n.position.y });
                viewportSettled();
            }
            if (!(f.field && panel.focusField(f.field))) focusFirstField();
        },
    });

    function focusFirstField() {
        const control = panel.el.querySelector('[data-field] input, [data-field] select, [data-field] textarea, '
                                               + '[data-field] [contenteditable="true"]')
            || panel.el.querySelector('[data-twm-flow-title]');
        if (control) { control.focus({ preventScroll: true }); return true; }
        return false;
    }

    function select(next) {
        selected = next;
        const picks = pickedSet();
        for (const [id, n] of nodeEls) {
            const picked = picks.has(id);
            n.classList.toggle('twm-flow-graph__node--picked', picked);
            if (picked) n.setAttribute('aria-current', 'true'); else n.removeAttribute('aria-current');
        }
        paintNotes();
        paintEdges();
        paintPanel();
        announceSelection();
        if (multi || grouping) paintToolbar();
    }

    /** Pick exactly these nodes and notes (`multiSelect`): none, one, or several. */
    function pickItems(ids, noteIds = []) {
        const next = pickOf(ids, noteIds);
        // A marquee asks on every pointer move: only a change repaints.
        if (JSON.stringify(next) !== JSON.stringify(selected)) select(next);
    }

    const pickNodes = (ids) => pickItems(ids);

    function togglePick(id) {
        const ids = pickedIds();
        pickItems(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id], pickedNotes());
    }

    /** The nodes a marquee box (canvas units) touches, in graph order. */
    function nodesIn(box) {
        return graph.nodes.filter((x) => x.position.x < box.x + box.width && x.position.x + widthOf(x) > box.x
                                         && x.position.y < box.y + box.height && bottomOf(x) > box.y)
            .map((x) => x.id);
    }

    function announceSelection() {
        const now = selected?.kind === 'node' ? `step:${selected.id}`
            : selected?.kind === 'many' ? `many:${JSON.stringify([selected.ids, selected.notes || []])}`
                : selected?.kind === 'note' ? `note:${selected.id}`
                : selected?.kind === 'edge' ? `connection:${JSON.stringify(selected.edge)}`
                    : selected?.kind === 'flow' ? 'flow' : '';
        if (now === lastSelect) return;
        lastSelect = now;
        if (!onSelect || destroyed) return;
        if (selected?.kind === 'node') onSelect({ kind: 'step', id: selected.id });
        else if (selected?.kind === 'many') {
            onSelect({ kind: 'many', ids: [...selected.ids], ...(selected.notes ? { notes: [...selected.notes] } : {}) });
        } else if (selected?.kind === 'note') onSelect({ kind: 'note', id: selected.id });
        else if (selected?.kind === 'edge') onSelect({ kind: 'connection', id: null, connection: { ...selected.edge } });
        else if (selected?.kind === 'flow') onSelect({ kind: 'flow', id: null });
        else onSelect({ kind: null, id: null });
    }

    function removeSelected() {
        if (!selected || isReadOnly()) return false;
        if (selected.kind === 'many') {
            const doomed = removableOf(selected.ids);
            const notes = selected.notes || [];
            if (!doomed.length && !notes.length) return false;
            for (const id of doomed) removeNode(graph, id);
            dropNotes(notes, null);
            findingsBy = groupFindings(allFindings(), { graph });
            select(null);
            paintNodes();
            commit(doomed.length ? 'flow:nodes:remove' : 'flow:note:remove');
        } else if (selected.kind === 'note') {
            if (!dropNotes([selected.id])) return false;
        } else if (selected.kind === 'node') {
            const nodeRow = nodeOf(selected.id);
            if (!nodeRow || !canRemove(nodeRow, typeOf(nodeRow))) return false;
            removeNode(graph, selected.id);
            findingsBy = groupFindings(allFindings(), { graph });
            select(null);
            paintNodes();
            commit('flow:node:remove');
        } else if (selected.kind === 'edge') {
            disconnect(graph, selected.edge);
            select(null);
            paintNodes();
            commit('flow:edge:disconnect');
        } else return false;
        keepFocus();
        return true;
    }

    /** The picked ids that may be removed. */
    const removableOf = (ids) => ids.filter((id) => {
        const nodeRow = nodeOf(id);
        return nodeRow && canRemove(nodeRow, typeOf(nodeRow));
    });

    /** The box in place of the settings for a pick that has none: a line, or
     *  several steps — what it is, and its Remove. */
    function paintPickBox({ title, line, removeLabel, removeIcon, action, refused = false }) {
        const remove = button({ label: removeLabel, icon: removeIcon, danger: true,
                                className: 'twm-flow-graph__connection-remove', onClick: () => removeSelected() });
        remove.dataset.action = action;
        remove.disabled = isReadOnly() || refused;
        connectionBox.replaceChildren(el('h3', 'twm-flow-graph__connection-title', title),
                                      el('p', 'twm-flow-graph__connection-line', line), remove);
        connectionBox.hidden = false;
    }

    function paintConnection() {
        paintPickBox({ title: say(S, 'connection'), line: say(S, 'connectionLine', selected.edge),
                       removeLabel: say(S, 'removeConnection'), removeIcon: 'link_off', action: 'remove-connection' });
    }

    function paintMany() {
        const n = removableOf(selected.ids).length;
        const notes = selected.notes?.length || 0;
        if (!notes) {
            paintPickBox({ title: say(S, 'stepsPicked', selected.ids.length), line: say(S, 'stepsPickedLine'),
                           removeLabel: say(S, 'removeSteps', n), removeIcon: 'delete', action: 'remove-steps',
                           refused: n === 0 });
            return;
        }
        paintPickBox({ title: say(S, 'itemsPicked', selected.ids.length, notes), line: say(S, 'stepsPickedLine'),
                       removeLabel: say(S, 'removeItems', n + notes), removeIcon: 'delete', action: 'remove-steps' });
    }

    function paintNote() {
        const text = noteOf(selected.id)?.text || '';
        paintPickBox({ title: say(S, 'noteKind'), line: text || say(S, 'noteEmpty'), removeLabel: say(S, 'removeNote'),
                       removeIcon: 'delete', action: 'remove-note' });
    }

    /**
     * The panel for whatever is picked: a step's settings, a line's, or — with
     * nothing (or the flow) picked — the flow's own. The kit's panel puts focus
     * back on the rebuilt control of the same field, caret where it was, and
     * hands it to `keepFocus` when the field is gone.
     */
    function paintPanel() {
        if (destroyed) return;
        if (selected?.kind === 'edge' || selected?.kind === 'many' || selected?.kind === 'note') {
            panel.clear();
            panel.el.hidden = true;
            if (selected.kind === 'edge') paintConnection(); else if (selected.kind === 'note') paintNote(); else paintMany();
            return;
        }
        connectionBox.hidden = true;
        connectionBox.replaceChildren();
        panel.el.hidden = false;
        const nodeRow = selected?.kind === 'node' ? nodeOf(selected.id) : null;
        if (nodeRow) {
            const def = typeOf(nodeRow);
            const after = typeof slots.stepPanel === 'function' ? (box) => slots.stepPanel(box, normalise({
                nodes: [nodeRow], connections: [] }).nodes[0], api) : null;
            panel.show({
                step: nodeRow, type: def, value: nodeRow.config,
                title: nodeRow.label || '', placeholderTitle: def?.label || nodeRow.type, rename: true,
                typeLabel: def?.label || nodeRow.type,
                description: def ? (def.description || '') : say(S, 'unknownType', nodeRow.type),
                idLine: typeof summariseReads === 'function' ? summariseReads(nodeRow, def) || null : null,
                icon: def?.icon || 'widgets', tone: catalogue.tone(nodeRow.type),
                actions: canRemove(nodeRow, def) ? [{ id: 'remove', label: say(S, 'removeStep'), icon: 'delete',
                                                      danger: true, run: () => removeSelected() }] : [],
                slots: { after },
            });
        } else {
            const after = typeof slots.flowPanel === 'function' ? (box) => slots.flowPanel(box, api) : null;
            panel.show({
                step: null, type: null, value: settingsValue,
                title: settingsTitle || say(S, 'theFlow'),
                fields: settingsSchema ? fieldsFromSchema(settingsSchema) : [],
                icon: 'tune', tone: 'grey',
                slots: { after },
            });
        }
        panel.setFindings(allFindings());
    }

    // ── many picked (`multiSelect`) ─────────────────────────────────────

    const heightOf = (n) => bottomOf(n) - n.position.y;
    const pickedRows = () => pickedIds().map(nodeOf).filter(Boolean);

    /** Line the picked nodes up on one edge (or centre) of the box around
     *  them: ONE `flow:nodes:align` entry. */
    function alignNodes(kind) {
        if (!ALIGN.includes(kind)) throw new Error(`align("${kind}"): the kinds are ${ALIGN.join(', ')}.`);
        if (refusals()[`align-${kind}`]) return false;
        const rows = pickedRows();
        const left = Math.min(...rows.map((n) => n.position.x));
        const right = Math.max(...rows.map((n) => n.position.x + widthOf(n)));
        const top = Math.min(...rows.map((n) => n.position.y));
        const bottom = Math.max(...rows.map(bottomOf));
        for (const n of rows) {
            const { x, y } = n.position;
            const w = widthOf(n);
            const h = heightOf(n);
            n.position = {
                x: kind === 'left' ? left : kind === 'right' ? right - w
                    : kind === 'center' ? Math.round((left + right - w) / 2) : x,
                y: kind === 'top' ? top : kind === 'bottom' ? bottom - h
                    : kind === 'middle' ? Math.round((top + bottom - h) / 2) : y,
            };
        }
        paintNodes();
        commit('flow:nodes:align');
        return true;
    }

    /** Spread the picked nodes so the gaps between them are equal, the first
     *  and the last staying where they are: ONE `flow:nodes:align` entry. */
    function distributeNodes(axis) {
        if (!DISTRIBUTE.includes(axis)) throw new Error(`distribute("${axis}"): the axes are ${DISTRIBUTE.join(', ')}.`);
        if (refusals()[`distribute-${axis}`]) return false;
        const across = axis === 'horizontal';
        const at = (n) => (across ? n.position.x : n.position.y);
        const size = (n) => (across ? widthOf(n) : heightOf(n));
        const rows = pickedRows().sort((a, b) => at(a) - at(b));
        const first = at(rows[0]);
        const end = Math.max(...rows.map((n) => at(n) + size(n)));
        const gap = (end - first - rows.reduce((sum, n) => sum + size(n), 0)) / (rows.length - 1);
        let cursor = first;
        for (const n of rows) {
            const p = Math.round(cursor);
            n.position = across ? { x: p, y: n.position.y } : { x: n.position.x, y: p };
            cursor += size(n) + gap;
        }
        paintNodes();
        commit('flow:nodes:align');
        return true;
    }

    /** An arrow key on the canvas: the picked nodes one grid step along (ten
     *  with Shift). Held down, it is one entry (a keyed commit merges). */
    function nudge(dx, dy, ev) {
        if (!multi || !canvas.root.contains(ev.target)) return false;
        const rows = pickedRows();
        const notes = pickedNotes().map(noteOf).filter(Boolean);
        if (!(rows.length + notes.length) || isReadOnly()) return false;
        const step = (canvas.gridSize || 1) * (ev.shiftKey ? NUDGE_FAR : 1);
        for (const n of [...rows, ...notes]) {
            n.position = { x: n.position.x + dx * step, y: n.position.y + dy * step };
            const box = (rows.includes(n) ? nodeEls : noteEls).get(n.id);
            if (box) { box.style.left = `${n.position.x}px`; box.style.top = `${n.position.y}px`; }
        }
        paintEdges();
        const action = !rows.length ? 'flow:note:move' : rows.length + notes.length > 1 ? 'flow:nodes:move' : 'flow:node:move';
        commit(action, `nudge:${[...rows, ...notes].map((n) => n.id).join(',')}`);
        return undefined;
    }

    /** Tab and Shift+Tab from a node (or from the canvas itself) go to the
     *  next node and the one before, in graph order. Past either end it is
     *  the browser's Tab again, so the keyboard can leave the canvas. */
    function onTab(ev) {
        if (ev.key !== 'Tab' || ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
        const from = ev.target.closest?.('[data-node-id]');
        if (!from && (ev.target !== canvas.root || ev.shiftKey)) return;
        const ids = graph.nodes.map((x) => x.id);
        const i = from ? ids.indexOf(from.dataset.nodeId) : -1;
        const next = nodeEls.get(ids[ev.shiftKey ? i - 1 : i + 1]);
        if (!next) return;
        ev.preventDefault();
        next.focus({ preventScroll: true });
        const n = nodeOf(next.dataset.nodeId);
        canvas.bringIntoView({ x: n.position.x, y: n.position.y, width: widthOf(n), height: heightOf(n) });
    }

    /** A press lasts until it is let go: whatever it was, the keyboard's
     *  focus picks again after it. */
    function pressLetGo(ev) {
        released = ev.type === 'pointerup' ? pressed : null;
        pressed = null;
    }

    if (multi) {
        canvas.onMarquee = (box) => pickItems(nodesIn(box), noting ? notesIn(box) : []);
        canvas.root.addEventListener('keydown', onTab);
        window.addEventListener('pointerup', pressLetGo, true);
        window.addEventListener('pointercancel', pressLetGo, true);
    }

    // ── copy, cut, paste, duplicate (`clipboard`) ───────────────────────

    /** What a method answers without the `clipboard` option: nothing done, nothing said. */
    const CLIPBOARD_OFF = Object.freeze({ ok: false, reason: null });

    /** A refusal, said on the message line and handed back. */
    function refused(reason) {
        setMessage(reason, 'warning');
        return { ok: false, reason };
    }

    const roRefusal = () => refused(readOnlyReason() || say(S, 'readOnlyRefusal'));
    const titleOf = (n) => n.label || typeOf(n)?.label || n.type;

    /** May a step of this type be added again: a type the palette offers, and available here. */
    const addable = (type) => Boolean(type) && !type.unavailable && offered(type);

    /** The picked steps a copy is made of, in graph order. */
    const copyRows = () => {
        const picks = pickedSet();
        return graph.nodes.filter((n) => picks.has(n.id) && addable(typeOf(n)));
    };

    /** The picked notes a copy takes along (`notes`), in graph order. */
    const copyNoteRows = () => {
        if (!noting) return [];
        const picks = new Set(pickedNotes());
        return noteList().filter((x) => picks.has(x.id));
    };

    /** Is anything picked a copy could be made of: a step, or (`notes`) a note. */
    const pickedAny = () => pickedIds().length > 0 || copyNoteRows().length > 0;

    /** The steps, the lines among them, (`groups`) the groups whose every
     *  member is copied and (`notes`) the picked notes, as the graph's own
     *  text; a line to a step left out is not copied, nor a group with a
     *  member left out. */
    function copyText(rows, notes = []) {
        const ids = new Set(rows.map((n) => n.id));
        const groups = grouping ? groupList().filter((gr) => gr.nodes.every((id) => ids.has(id))) : [];
        return serialise({ nodes: rows,
                           connections: graph.connections.filter((c) => ids.has(c.source) && ids.has(c.target)),
                           ...(groups.length ? { groups } : {}), ...(notes.length ? { notes } : {}) });
    }

    /** What a copy or a cut says it took: steps, or steps and notes. */
    const tookSay = (key, rows, notes) => (notes.length ? say(S, `${key}Items`, rows.length, notes.length)
        : say(S, key, rows.length));
    /** What a copy or a cut answers: the steps' ids, and the notes' when there are some. */
    const tookIds = (rows, notes) => ({ ok: true, ids: rows.map((n) => n.id),
                                        ...(notes.length ? { notes: notes.map((x) => x.id) } : {}) });

    /** Onto the clipboard: the editor's own, or the consumer's `write`. */
    function writeClipboard(text, times) {
        pasteRun = { text, times };
        if (clip === 'memory') { copiedText = text; return true; }
        const failed = () => setMessage(say(S, 'clipboardFailed'), 'warning');
        try {
            const done = clip.write(text);
            if (done && typeof done.then === 'function') done.then(null, failed);
        } catch {
            failed();
            return false;
        }
        return true;
    }

    /** COPY: the picked steps and the lines among them (and the picked notes,
     *  and the groups wholly inside the pick) onto the clipboard. Read only, too. */
    function copyNodes() {
        if (!clip) return CLIPBOARD_OFF;
        if (!pickedAny()) return refused(say(S, 'nothingPicked'));
        const rows = copyRows();
        const notes = copyNoteRows();
        if (!rows.length && !notes.length) return refused(say(S, 'cannotCopy'));
        if (!writeClipboard(copyText(rows, notes), 0)) return { ok: false, reason: say(S, 'clipboardFailed') };
        setMessage(tookSay('copied', rows, notes), 'ok');
        return tookIds(rows, notes);
    }

    /** CUT: a copy, then the copied steps removed with their lines — one remove entry. */
    function cutNodes() {
        if (!clip) return CLIPBOARD_OFF;
        if (isReadOnly()) return roRefusal();
        if (!pickedAny()) return refused(say(S, 'nothingPicked'));
        const rows = copyRows().filter((n) => canRemove(n, typeOf(n)));
        const notes = copyNoteRows();
        if (!rows.length && !notes.length) return refused(say(S, 'cannotCut'));
        // The first paste after a cut puts the steps back where they were.
        if (!writeClipboard(copyText(rows, notes), -1)) return { ok: false, reason: say(S, 'clipboardFailed') };
        for (const n of rows) removeNode(graph, n.id);
        dropNotes(notes.map((x) => x.id), null);
        findingsBy = groupFindings(allFindings(), { graph });
        select(null);
        paintNodes();
        commit(!rows.length ? 'flow:note:remove'
            : rows.length + notes.length > 1 ? 'flow:nodes:remove' : 'flow:node:remove');
        setMessage(tookSay('cutDone', rows, notes), 'ok');
        keepFocus();
        return tookIds(rows, notes);
    }

    /** What is on the clipboard, read as steps: the graph text, or a refusal. */
    function stepsOf(text) {
        if (typeof text !== 'string' || !text.trim()) return { reason: say(S, 'nothingToPaste') };
        let raw;
        try { raw = JSON.parse(text); } catch { return { reason: say(S, 'pasteNotSteps') }; }
        // Notes alone paste too, where the editor draws notes.
        const notesToo = noting && Array.isArray(raw?.notes) && raw.notes.length > 0;
        if (!raw || !Array.isArray(raw.nodes) || (!raw.nodes.length && !notesToo)
            || raw.nodes.some((n) => !n || typeof n !== 'object' || !n.id || !n.type)) {
            return { reason: say(S, 'pasteNotSteps') };
        }
        const g = normalise(raw);
        const odd = g.nodes.find((n) => !addable(typeOf(n)));
        if (odd) return { reason: typeOf(odd) ? say(S, 'notAddable', titleOf(odd)) : say(S, 'unknownType', odd.type) };
        return { g };
    }

    /**
     * The copies into the graph, `offset` grid steps off: fresh ids, a label
     * derived when the flow already has it, `prepareCopy`, the lines among
     * them, (`notes`) the notes under fresh ids, (`groups`) each group made
     * again round the copies of its members, then picked — ONE `action`
     * entry. Nothing is written until every copy is made, so a `prepareCopy`
     * that throws changes nothing.
     */
    function addCopies(g, offset, via, action) {
        const step = (canvas.gridSize || CANVAS_NODE.row) * offset;
        const titles = new Set(graph.nodes.map(titleOf));
        const made = [];
        const idOf = new Map();
        for (const from of g.nodes) {
            const id = nextId({ nodes: [...graph.nodes, ...made] }, from.type, { catalogue });
            const title = titleOf(from);
            let label = from.label || null;
            if (titles.has(title)) {
                let i = 1;
                label = say(S, 'copyLabel', title, i);
                while (titles.has(label)) { i += 1; label = say(S, 'copyLabel', title, i); }
                titles.add(label);
            }
            const copy = { id, type: from.type, ...(label ? { label } : {}), config: structuredClone(from.config),
                           position: { x: from.position.x + step, y: from.position.y + step } };
            if (typeof prepareCopy === 'function') prepareCopy(copy, { from: from.id, via });
            const [clean] = normalise({ nodes: [{ ...copy, id, type: from.type, position: { ...copy.position } }],
                                        connections: [] }).nodes;
            made.push(clean);
            idOf.set(from.id, id);
        }
        graph.nodes.push(...made);
        for (const c of g.connections) {
            const source = idOf.get(c.source);
            const target = idOf.get(c.target);
            if (source && target) connect(graph, catalogue, { ...c, source, target }, { strings: S });
        }
        const noteIds = [];
        for (const from of noting ? g.notes || [] : []) {
            const id = freshId(noteList(), 'note');
            graph.notes = [...noteList(), { ...structuredClone(from), id,
                                            position: { x: from.position.x + step, y: from.position.y + step } }];
            noteIds.push(id);
        }
        const groupIds = [];
        for (const gr of grouping ? g.groups || [] : []) {
            const members = gr.nodes.map((id) => idOf.get(id)).filter(Boolean);
            if (!members.length || members.length !== gr.nodes.length) continue;
            const id = freshId(groupList(), 'group');
            setGroups([...groupList(), { id, ...(gr.label ? { label: gr.label } : {}),
                                         ...(gr.tone ? { tone: gr.tone } : {}), nodes: members }]);
            groupIds.push(id);
        }
        const ids = made.map((n) => n.id);
        if (connecting) cancelConnect();
        paintNodes();
        if (multi) pickItems(ids, noteIds);
        else select(ids.length ? { kind: 'node', id: ids[0] } : { kind: 'note', id: noteIds[0] });
        commit(action);
        setMessage('');
        return { ok: true, ids, ...(noteIds.length ? { notes: noteIds } : {}),
                 ...(groupIds.length ? { groups: groupIds } : {}) };
    }

    /** PASTE `text` — or, without it, what the clipboard holds (a promise of
     *  the answer when the consumer's `read` is one). */
    function pasteNodes(text) {
        if (!clip) return CLIPBOARD_OFF;
        if (isReadOnly()) return roRefusal();
        const settle = (t) => {
            if (destroyed) return CLIPBOARD_OFF;
            if (isReadOnly()) return roRefusal();
            const { g, reason } = stepsOf(t);
            if (!g) return refused(reason);
            const times = pasteRun.text === t ? pasteRun.times + 1 : 1;
            pasteRun = { text: t, times };
            return addCopies(g, COPY_OFFSET * times, 'paste', 'flow:paste');
        };
        if (text !== undefined) return settle(text);
        if (clip === 'memory') return settle(copiedText);
        let got;
        try { got = clip.read(); } catch { return refused(say(S, 'clipboardFailed')); }
        if (got && typeof got.then === 'function') {
            return got.then(settle, () => (destroyed ? CLIPBOARD_OFF : refused(say(S, 'clipboardFailed'))));
        }
        return settle(got);
    }

    /** DUPLICATE: a copy of the picked steps beside them, the clipboard untouched. */
    function duplicateNodes() {
        if (!clip) return CLIPBOARD_OFF;
        if (isReadOnly()) return roRefusal();
        if (!pickedAny()) return refused(say(S, 'nothingPicked'));
        const rows = copyRows();
        const notes = copyNoteRows();
        if (!rows.length && !notes.length) return refused(say(S, 'cannotCopy'));
        return addCopies(JSON.parse(copyText(rows, notes)), COPY_OFFSET, 'duplicate', 'flow:node:duplicate');
    }

    /** A clipboard key: with nothing picked, Ctrl+C, X and D are not the editor's. */
    const clipKey = (run, needsPick = true) => () => {
        if (!clip || (needsPick && !pickedAny())) return false;
        run();
        return undefined;
    };

    // ── keys ────────────────────────────────────────────────────────────

    const unbindKeys = bindFlowKeys(root, {
        undo: () => { undo(); },
        redo: () => { redo(); },
        remove: () => (removeSelected() ? undefined : false),
        rename: () => {
            if (selected?.kind !== 'node' || isReadOnly()) return false;
            const t = panel.el.querySelector('[data-twm-flow-title]');
            if (!t) return false;
            t.focus({ preventScroll: true });
            t.select?.();
            return undefined;
        },
        open: (ev) => {
            if (ev.target.closest?.('.twm-flow-graph__port')) return false;     // a port's Enter is its own
            const noteEl = noting ? ev.target.closest?.('[data-note-id]') : null;
            if (noteEl && canvas.nodeLayer.contains(noteEl)) return editNote(noteEl.dataset.noteId) ? undefined : false;
            const nodeEl = ev.target.closest?.('[data-node-id]');
            if (nodeEl && canvas.nodeLayer.contains(nodeEl)) {
                if (!(selected?.kind === 'node' && selected.id === nodeEl.dataset.nodeId)) {
                    select({ kind: 'node', id: nodeEl.dataset.nodeId });
                }
                return focusFirstField() ? undefined : false;
            }
            return false;
        },
        escape: () => {
            if (!connecting) {
                if (!pickedNotes().length && !(multi && pickedIds().length)) return false;
                select(null);
                return undefined;
            }
            cancelConnect();
            setMessage('');
            return undefined;
        },
        copy: clipKey(copyNodes),
        cut: clipKey(cutNodes),
        paste: clipKey(() => pasteNodes(), false),
        duplicate: clipKey(duplicateNodes),
        selectAll: () => {
            if (!multi) return false;
            pickItems(graph.nodes.map((x) => x.id), noting ? noteList().map((x) => x.id) : []);
            return undefined;
        },
        group: () => (grouping && groupPicked() ? undefined : false),
        ungroup: () => (grouping && ungroupPicked() ? undefined : false),
        up: (ev) => nudge(0, -1, ev),
        down: (ev) => nudge(0, 1, ev),
        left: (ev) => nudge(-1, 0, ev),
        right: (ev) => nudge(1, 0, ev),
    });

    // ── the page ────────────────────────────────────────────────────────

    root.append(toolbar, why, readonlyBanner, message, ...(offerBox ? [offerBox] : []), strip.el, banner, body);
    if (host) host.appendChild(root);

    function cancelFit() {
        if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
        fitFrame = null;
    }

    function paintReadOnly() {
        root.classList.toggle('twm-flow-graph--readonly', isReadOnly());
        readonlyBanner.textContent = readOnlyReason() || (isReadOnly() ? say(S, 'readOnlyRefusal') : '');
        readonlyBanner.hidden = !isReadOnly();
    }

    const api = {
        el: root,
        /** The editor's own history — `keep()`, `adopt(kept, editor.snapshot())`, `baseline(...)`. */
        history,
        /** The kernel underneath, for a consumer that needs the viewport. */
        canvas,
        /**
         * Replace the content. `baseline` (the default) clears both stacks: what
         * was loaded is where undo starts. With `baseline: false` the stacks are
         * kept and the loaded content is the present they undo from.
         */
        load({ graph: g = null, flowSettings: fs } = {}, { baseline = true, fit: andFit = true, viewport } = {}) {
            if (destroyed) return;
            if (connecting) cancelConnect();
            if (pendingOffer) clearOffer();
            graph = normalise(g);
            if (fs !== undefined) {
                settingsSchema = fs?.schema ?? settingsSchema;
                settingsTitle = fs?.title ?? settingsTitle;
                settingsValue = structuredClone(plainObject(fs?.value));
            }
            prunePick();
            findingsBy = groupFindings(allFindings(), { graph });
            paintNodes();
            paintPanel();
            const state = snapshot();
            if (baseline) history.baseline(state);
            else if (state !== history.settled) history.adopt({ ...history.keep(), settled: state }, state);
            paintToolbar();
            announceSelection();
            // A viewport to open at is where the consumer left the reader: no fit.
            const at = viewportOf(viewport) || startView;
            startView = null;
            if (at) {
                cancelFit();
                canvas.setViewport(at);
                viewportBaseline();
            } else if (andFit) {
                cancelFit();
                const fitNow = () => { fit(); viewportBaseline(); };
                fitFrame = globalThis.requestAnimationFrame
                    ? globalThis.requestAnimationFrame(() => { fitFrame = null; fitNow(); }) : (fitNow(), null);
            }
        },
        /**
         * Swap the step types while the editor is open — a type registered
         * after `load`. The palette is redrawn; a node whose type's definition
         * changed — what it is built from, not the object — is rebuilt (so a node
         * of a type that was unknown now draws); the rest keep their elements;
         * the graph, and so the history, are untouched.
         */
        setCatalogue(next) {
            if (destroyed) return;
            catalogue = toCatalogue(next, 'setCatalogue');
            verdictOf = rulesFor(catalogue);
            if (connecting) cancelConnect();
            if (pendingOffer) clearOffer();
            paintPalette();
            paintNodes();
            paintPanel();
        },
        /** `{scale, tx, ty}`, as the kernel holds it. */
        getViewport: () => canvas.viewport(),
        /** Put the view there (clamped to the kernel's limits) — a fit still waiting
         *  for its frame is dropped, and nothing is reported back. */
        setViewport(next) {
            const at = viewportOf(next);
            if (!at || destroyed) return false;
            cancelFit();
            canvas.setViewport(at);
            viewportBaseline();
            return true;
        },
        getGraph: () => normalise(graph),
        serialise: () => serialise(graph),
        /** The text `onChange` hands on and the history holds: the graph and the flow's settings. */
        snapshot,
        getFlowSettings: () => structuredClone(settingsValue),
        setFindings(list) {
            findings = findingsList(list);
            findingsBy = groupFindings(allFindings(), { graph });
            paintStrip();
            paintNodes();
            panel.setFindings(allFindings());
        },
        /**
         * What the host shows on the nodes now — `{[id]: {badge, tone, ports:
         * {[name]: text}}}`, or null for none — replacing what it showed
         * before. Painted in place: nothing is rebuilt or recorded, `onChange`
         * is not called and the panel is not touched. A type's own `update`
         * runs for each node whose values changed, and reads them as `ctx.values`.
         */
        setNodeValues(next) {
            if (destroyed) return;
            const fresh = new Map();
            for (const [id, v] of Object.entries(plainObject(next))) {
                const entry = valueEntry(v);
                if (entry) fresh.set(String(id), entry);
            }
            const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
            const changed = [...new Set([...liveValues.keys(), ...fresh.keys()])]
                .filter((id) => !same(liveValues.get(id), fresh.get(id)));
            liveValues = fresh;
            let bodyChanged = false;
            painting = true;
            try {
                for (const id of changed) {
                    const nodeRow = nodeOf(id);
                    const n = nodeEls.get(id);
                    if (!nodeRow || !n) continue;
                    paintValues(n, nodeRow);
                    bodyChanged = runUpdate(nodeRow) || bodyChanged;
                }
            } finally {
                painting = false;
            }
            // A body's `update` that started or stopped throwing: its finding is drawn.
            if (bodyChanged) {
                findingsBy = groupFindings(allFindings(), { graph });
                paintNodes();
                paintStrip();
                panel.setFindings(allFindings());
            }
        },
        /** `collapsible`: fold a node to its header (true) or unfold it, one
         *  `flow:node:collapse` entry; false when refused or nothing changes. */
        setCollapsed: (id, collapsed) => setCollapsed(String(id), collapsed),
        /** Draw a run on the canvas — never changes the graph and rebuilds no field. */
        setRunOverlay(next) {
            overlay = next && typeof next === 'object' ? next : null;
            banner.textContent = overlay?.banner ? String(overlay.banner) : '';
            banner.hidden = !overlay?.banner;
            paintNodes();
            panel.repaintSlots();
        },
        setReadOnly(next) {
            ro = next;
            if (ro && connecting) cancelConnect();
            if (ro) editing?.done(false);
            if (isReadOnly()) renaming?.finish(false);
            if (ro && pendingOffer) clearOffer();
            dragCleanup?.();
            paintReadOnly();
            paintPalette();
            paintNodes();
            panel.setReadOnly(isReadOnly());
            paintToolbar();
        },
        /** A verb refused IN PLACE, its reason beside it; or marked busy. */
        setActionState(id, { disabled = false, reason = null, busy = false } = {}) {
            consumerState.set(id, { disabled: Boolean(disabled), reason, busy: Boolean(busy) });
            paintToolbar();
        },
        setStatus(text) { status.textContent = text || ''; },
        setMessage,
        select(target) {
            if (target === null || target === undefined) select(null);
            else if (target === 'flow') select({ kind: 'flow' });
            else if (multi && Array.isArray(target)) pickNodes(target.map(String));
            else if (nodeOf(String(target))) select({ kind: 'node', id: String(target) });
        },
        /** Rebuild the panel's fields, keeping the focus and the caret — for a
         *  consumer whose widget's data has arrived. */
        repaintPanel() { paintPanel(); },
        focus() { canvas.root.focus({ preventScroll: true }); },
        undo,
        redo,
        arrange: (opts) => { const done = arrangeGraph(opts); viewportBaseline(); return done; },
        /** `multiSelect`: line the picked nodes up — left, center, right, top,
         *  middle or bottom. False when refused (fewer than two, read only). */
        align: (kind) => (multi ? alignNodes(kind) : false),
        /** `multiSelect`: equal gaps, horizontal or vertical (three or more). */
        distribute: (axis) => (multi ? distributeNodes(axis) : false),
        fit: (opts) => { fit(opts); viewportBaseline(); },
        /** `groups`: group these steps (default: the picked ones), each leaving
         *  the group it was in — one `flow:group:add`. The new group's id, or null. */
        group: (ids = null, look = {}) => (ids === null ? (refusals().group ? null : groupNodes(pickedIds(), look))
            : groupNodes(Array.isArray(ids) ? ids.map(String) : [], look)),
        /** `groups`: remove these groups (default: the ones the pick is in), their
         *  steps staying where they are — one `flow:group:remove`. */
        ungroup: (ids = null) => (ids === null ? ungroupPicked()
            : ungroupGroups((Array.isArray(ids) ? ids : [ids]).map(String))),
        /** `groups`: a group's `{label, tone}` — one `flow:group:label`. */
        setGroup: (id, look) => setGroupLook(String(id), look || {}),
        /** `groups`: exactly these steps in the group — one `flow:group:members`. */
        setGroupMembers: (id, ids) => setGroupMembers(String(id), Array.isArray(ids) ? ids.map(String) : []),
        /** `notes`: add a note — one `flow:note:add`. A copy of it, or null. */
        addNote: (note) => addNote(note || {}),
        /** `notes`: a note's text — one `flow:note:edit`. */
        editNote: (id, text) => setNoteText(String(id), text),
        /** `notes`: put a note at `{x, y}` — one `flow:note:move`. */
        moveNote: (id, position) => moveNote(String(id), position),
        /** `notes`: take a note away — one `flow:note:remove`. */
        removeNote: (id) => (noting && !isReadOnly() ? dropNotes([String(id)]) : false),
        /** `clipboard`: copy the picked steps and the lines among them (and the picked notes, the groups wholly
         *  inside); `{ok, ids, notes?}` or `{ok: false, reason}`. */
        copy: () => copyNodes(),
        /** `clipboard`: copy, then remove what was copied (one remove entry). Refused read only. */
        cut: () => cutNodes(),
        /** `clipboard`: paste `text`, or what the clipboard holds — a promise when the consumer's `read` is async. */
        paste: (text) => pasteNodes(text),
        /** `clipboard`: a copy of the picked steps beside them, one `flow:node:duplicate` entry. */
        duplicate: () => duplicateNodes(),
        destroy() {
            if (destroyed) return;
            editing?.done(false);
            // A wheel's report still waiting is handed on: the reader did zoom.
            if (wheelTimer !== null) viewportSettled();
            pressEnd?.();
            dragCleanup?.();
            cancelFit();
            renaming?.finish(false);
            for (const id of [...inlines.keys()]) dropInline(id);
            miniSized?.disconnect();
            closeFlowPopovers();
            unbindKeys();
            canvas.root.removeEventListener('keydown', onTab);
            window.removeEventListener('pointerup', pressLetGo, true);
            window.removeEventListener('pointercancel', pressLetGo, true);
            panel.destroy();
            strip.destroy();
            destroyed = true;
            canvas.destroy();
            root.remove();
        },
    };
    // The first paint, once `api` exists: a consumer's slot is handed it.
    paintReadOnly();
    paintPalette();
    paintNodes();
    paintPanel();
    paintToolbar();
    viewportBaseline();
    history.baseline(snapshot());
    return api;
}

/** A viewport worth opening at: `{scale, tx, ty}`, every one a finite number, the scale above 0. */
function viewportOf(v) {
    if (!v || typeof v !== 'object') return null;
    const scale = Number(v.scale);
    const tx = Number(v.tx);
    const ty = Number(v.ty);
    if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { scale, tx, ty };
}
