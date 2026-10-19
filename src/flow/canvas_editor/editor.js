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
 * `destroy` flushes nothing, because nothing is held.
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
 */

import { CanvasAdapter } from '../../canvas/canvas_adapter.js';
import { OBSTACLE_ROUTING_NODE_LIMIT, crowsFoot, footAnchor, returnEdge, routeEdge } from '../../canvas/edge_router.js';
import { TONES, button, el, icon, toneClass, closeFlowPopovers } from '../kit/dom.js';
import { createStrings, say } from '../kit/strings.js';
import { createStepCatalogue } from '../kit/catalogue.js';
import { createWidgetRegistry } from '../kit/widgets.js';
import { createSettingsPanel } from '../kit/settings_panel.js';
import { fieldsFromSchema } from '../kit/settings_schema.js';
import { FORMULA_REFERENCES, PARAMETER_REFERENCES, TEMPLATE_REFERENCES } from '../kit/references.js';
import { alwaysBefore, enclosingArms, enclosingLoops, DEFAULT_LOOP_PORTS } from '../kit/always_before.js';
import { createFindingsStrip, findingsList, groupFindings } from '../kit/findings.js';
import { openStepPicker } from '../kit/step_picker.js';
import { FlowHistory } from '../kit/history.js';
import { bindFlowKeys } from '../kit/keys.js';
import { addConnection, addNode, connect, disconnect, emptyGraph, normalise, removeNode, sameEdge, serialise } from '../kit/logic_graph.js';
import { CANVAS_STRINGS } from './strings.js';
import { connectionRules } from './connections.js';
import { CANVAS_NODE, isReturnEdge, layoutGraph, nodeBottom, pathMidpoint, portAnchor } from './layout.js';

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
]);

/** `editor.align(kind)` and the toolbar's align verbs, in toolbar order. */
const ALIGN = Object.freeze(['left', 'center', 'right', 'top', 'middle', 'bottom']);
const ALIGN_ICON = Object.freeze({ left: 'align_horizontal_left', center: 'align_horizontal_center',
                                   right: 'align_horizontal_right', top: 'align_vertical_top',
                                   middle: 'align_vertical_center', bottom: 'align_vertical_bottom' });
/** `editor.distribute(axis)`. */
const DISTRIBUTE = Object.freeze(['horizontal', 'vertical']);
const DISTRIBUTE_ICON = Object.freeze({ horizontal: 'horizontal_distribute', vertical: 'vertical_distribute' });
/** Shift+arrow nudges this many grid steps. */
const NUDGE_FAR = 10;

/** The scale a fit frames at most: natural size. The kernel's own ceiling is
 *  4×, so a new flow — one step — was framed at it: the step drew 514 px wide
 *  on a 634 px canvas, and every step dropped beside it landed on top of it.
 *  Zooming in past this is the reader's choice (the wheel), never a fit's. */
const NATURAL = 1;
/** Opening (and Arrange) keeps a long flow at this or above, from its first
 *  step on the left; a press on Fit frames ALL of it, however small. */
const READABLE = 0.8;
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
    } = options;
    const multi = Boolean(multiSelect);
    if (!ROUTINGS.includes(routing)) {
        throw new Error(`createCanvasEditor: routing is ${ROUTINGS.map((r) => `'${r}'`).join(' or ')}, not '${routing}'.`);
    }
    const styled = typeof edgeStyle === 'function';
    const catalogue = Array.isArray(options.catalogue) ? createStepCatalogue(options.catalogue)
        : options.catalogue;
    if (!catalogue?.get || !catalogue?.byCategory) {
        throw new Error('createCanvasEditor needs a step catalogue (createStepCatalogue(types, …)).');
    }
    const S = createStrings(CANVAS_STRINGS, strings);
    const BOX = Object.freeze({
        width: Number(nodeOptions.width) || CANVAS_NODE.width,
        header: Number(nodeOptions.header) || CANVAS_NODE.header,
        row: Number(nodeOptions.row) || CANVAS_NODE.row,
    });
    const loopPorts = Object.freeze({ ...DEFAULT_LOOP_PORTS, ...plainObject(loop) });
    const canRemove = typeof removable === 'function' ? removable
        : (_node, type) => (type?.role || 'step') !== 'start';
    const offered = typeof paletteTypes === 'function' ? paletteTypes : (type) => type.role !== 'start';
    /** The `connections` option: absent, the editor draws and binds exactly what it did without it. */
    const linking = linkOptions && typeof linkOptions === 'object' ? linkOptions : null;
    const dataConnect = linking?.dataPorts === 'connect';
    const verdictOf = linking
        ? connectionRules({ catalogue, policy: linking.policy, dataPorts: dataConnect, strings: S }) : null;

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
    /** {kind: 'flow'} | {kind: 'node', id} | {kind: 'many', ids} (two or more, `multiSelect`)
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
    const consumerState = new Map();

    const canvas = new CanvasAdapter({ container: canvasHost, gridSize });
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
        const p = JSON.parse(state);
        graph = normalise(p.graph);
        settingsValue = plainObject(p.flowSettings);
        if (connecting) cancelConnect();
        if (pendingOffer) clearOffer();
        prunePick();
        findingsBy = groupFindings(findings, { graph });
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
        if (selected?.kind === 'many') {
            const live = new Set(graph.nodes.map((x) => x.id));
            const ids = selected.ids.filter((id) => live.has(id));
            selected = ids.length > 1 ? { kind: 'many', ids } : ids.length ? { kind: 'node', id: ids[0] } : null;
        }
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
        arrange: tool('arrange', { label: say(S, 'arrange'), icon: 'account_tree', title: say(S, 'arrangeTitle'),
                                   onClick: () => arrangeGraph() }),
        fit: tool('fit', { label: say(S, 'fit'), icon: 'fit_screen', title: say(S, 'fitTitle'),
                           onClick: () => fit({ whole: true }) }),
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
    const own = new Set(Object.keys(tools));
    const consumerTools = [];
    for (const a of Array.isArray(actions) ? actions : []) {
        if (!a || !a.id || own.has(a.id)) continue;
        const b = tool(a.id, { label: a.label ?? a.id, icon: a.icon || null, primary: Boolean(a.primary),
                               danger: Boolean(a.danger), title: a.title || null,
                               onClick: () => { if (!b.disabled) a.run?.(api); } });
        consumerTools.push({ spec: a, el: b });
    }
    toolbar.append(tools.undo, tools.redo, tools.arrange, tools.fit, ...pickTools, ...consumerTools.map((t) => t.el),
                   status, toolbarEnd);
    if (typeof slots.toolbarEnd === 'function') slots.toolbarEnd(toolbarEnd);

    function refusals() {
        const stop = isReadOnly() ? (readOnlyReason() || say(S, 'readOnlyRefusal')) : null;
        const r = {
            undo: stop || (history.canUndo ? null : say(S, 'nothingToUndo')),
            redo: stop || (history.canRedo ? null : say(S, 'nothingToRedo')),
            arrange: stop || (graph.nodes.length < 2 ? say(S, 'arrangeNeedsTwo') : null),
            fit: null,
        };
        if (multi) {
            const n = pickedIds().length;
            for (const kind of ALIGN) r[`align-${kind}`] = stop || (n < 2 ? say(S, 'alignNeedsTwo') : null);
            for (const axis of DISTRIBUTE) r[`distribute-${axis}`] = stop || (n < 3 ? say(S, 'distributeNeedsThree') : null);
        }
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
            where = {
                x: canvas.snap((box.width ? box.x + box.width / 2 - BOX.width / 2 : 80) + (n % 4) * 24),
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
            addStep(t.type_id, { x: canvas.snap(p.x - BOX.width / 2), y: canvas.snap(p.y - BOX.header / 2) });
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
    const bottomOf = (n) => nodeBottom(catalogue, n, BOX);
    const isReturn = (c, target) => isReturnEdge(c, target, catalogue, loopPorts.entry);

    function buildNode(nodeRow) {
        const def = typeOf(nodeRow);
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
        const tag = el('span', 'twm-flow-graph__node-tag', nodeRow.id);
        tag.title = say(S, 'stepId', nodeRow.id);
        header.append(chip, title, tag);
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

    function port(nodeRow, p) {
        const b = el('button', `twm-flow-graph__port twm-flow-graph__port--${p.direction === 'input' ? 'in' : 'out'}`);
        b.type = 'button';
        b.dataset.port = p.name;
        b.dataset.direction = p.direction;
        b.append(el('span', 'twm-flow-graph__port-dot'), el('span', 'twm-flow-graph__port-label', p.label || p.name),
                 el('span', 'twm-flow-graph__port-count'));
        if ((p.port_type || 'FLOW') !== 'FLOW' && dataConnect) b.classList.add('twm-flow-graph__port--data');
        else if ((p.port_type || 'FLOW') !== 'FLOW') {
            b.classList.add('twm-flow-graph__port--data');
            b.disabled = true;
            b.dataset.data = '';
            b.title = say(S, 'dataPort', dataPortRead ? dataPortRead(nodeRow, p) : null);
            return b;
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
        findingsBy = groupFindings(findings, { graph });
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
        const rows = ids.map((id) => ({ nodeRow: nodeOf(id), n: nodeEls.get(id) })).filter((r) => r.nodeRow && r.n);
        if (!rows.some((r) => r.nodeRow.id === nodeId)) return;
        const from = rows.map((r) => ({ ...r.nodeRow.position }));
        const start = { x: ev.clientX, y: ev.clientY };
        let moved = false;
        const onMove = (m) => {
            const dx = (m.clientX - start.x) / canvas.scale;
            const dy = (m.clientY - start.y) / canvas.scale;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            moved = true;
            if (pressed?.id === nodeId) pressed.moved = true;
            rows.forEach(({ nodeRow, n }, i) => {
                nodeRow.position = { x: canvas.snap(from[i].x + dx), y: canvas.snap(from[i].y + dy) };
                n.style.left = `${nodeRow.position.x}px`;
                n.style.top = `${nodeRow.position.y}px`;
            });
            paintEdges();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (moved) commit(rows.length > 1 ? 'flow:nodes:move' : 'flow:node:move');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /** Positions and classes onto the nodes that exist; a node is BUILT only
     *  when it is new or its type or label changed, never on a press. */
    function paintNodes() {
        if (destroyed) return;
        const live = new Set(graph.nodes.map((x) => x.id));
        for (const [id, n] of nodeEls) {
            if (!live.has(id)) { n.remove(); nodeEls.delete(id); }
        }
        const picks = pickedSet();
        for (const nodeRow of graph.nodes) {
            let n = nodeEls.get(nodeRow.id);
            const shape = `${nodeRow.type}|${nodeRow.label || ''}`;
            if (!n || n.dataset.shape !== shape) {
                const fresh = buildNode(nodeRow);
                fresh.dataset.shape = shape;
                const focused = n && n.contains(document.activeElement);
                if (n) n.replaceWith(fresh); else canvas.nodeLayer.appendChild(fresh);
                nodeEls.set(nodeRow.id, fresh);
                n = fresh;
                if (focused) fresh.focus({ preventScroll: true });
            }
            n.style.left = `${nodeRow.position.x}px`;
            n.style.top = `${nodeRow.position.y}px`;
            n.style.width = `${BOX.width}px`;
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
        strip.set(routingFallback ? [...findings, { code: 'canvas-routing-simple', severity: 'warning',
                                                     message: say(S, 'routingFallback', OBSTACLE_ROUTING_NODE_LIMIT) }]
            : findings);
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
            width: BOX.width + 2 * CLEARANCE, height: bottomOf(x) - x.position.y + 2 * CLEARANCE,
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
        const xs = graph.nodes.map((x) => x.position.x);
        const ys = graph.nodes.map((x) => x.position.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const height = Math.max(...graph.nodes.map(bottomOf)) - y;
        canvas.fit({ x, y, width: Math.max(...xs) + BOX.width - x, height });
        const scale = canvas.scale > NATURAL ? NATURAL
            : !whole && canvas.scale < READABLE ? READABLE : null;
        if (scale !== null) {
            const box = canvas.root.getBoundingClientRect();
            canvas.setViewport({ scale, tx: 40 - x * scale, ty: box.height / 2 - (y + height / 2) * scale });
        }
    }

    /** ARRANGE: `layoutGraph`, anchored at the graph's current top-left corner
     *  so nothing jumps off screen, and ONE undo entry. */
    function arrangeGraph() {
        if (refusals().arrange) return false;
        const at = layoutGraph(graph, catalogue, { ...BOX, loopEntry: loopPorts.entry });
        const ox = Math.min(...graph.nodes.map((x) => x.position.x));
        const oy = Math.min(...graph.nodes.map((x) => x.position.y));
        for (const nodeRow of graph.nodes) {
            const p = at.get(nodeRow.id);
            if (p) nodeRow.position = { x: canvas.snap(ox + p.x), y: canvas.snap(oy + p.y) };
        }
        paintNodes();
        commit('flow:arrange');
        fit();
        return true;
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
            const nodeRow = nodeOf(stepId);
            if (!nodeRow) return;
            if (text) nodeRow.label = text; else delete nodeRow.label;
            // In place: the node's title and its shape key, so the next paint
            // does not rebuild a node a press may be on.
            const n = nodeEls.get(nodeRow.id);
            const name = text || typeOf(nodeRow)?.label || nodeRow.type;
            const title = n?.querySelector('.twm-flow-graph__node-title');
            if (title) title.textContent = title.title = name;
            if (n) {
                n.dataset.shape = `${nodeRow.type}|${nodeRow.label || ''}`;
                n.setAttribute('aria-label', name);
            }
            commit('flow:node:label', `label:${stepId}`);
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
                canvas.bringIntoView({ x: n.position.x, y: n.position.y, width: BOX.width,
                                       height: bottomOf(n) - n.position.y });
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
        paintEdges();
        paintPanel();
        announceSelection();
        if (multi) paintToolbar();
    }

    /** Pick exactly these nodes (`multiSelect`): none, one, or several. */
    function pickNodes(ids) {
        const live = new Set(graph.nodes.map((x) => x.id));
        const list = [...new Set(ids)].filter((id) => live.has(id));
        const next = list.length > 1 ? { kind: 'many', ids: list } : list.length ? { kind: 'node', id: list[0] } : null;
        // A marquee asks on every pointer move: only a change repaints.
        if (JSON.stringify(next) !== JSON.stringify(selected)) select(next);
    }

    function togglePick(id) {
        const ids = pickedIds();
        pickNodes(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    }

    /** The nodes a marquee box (canvas units) touches, in graph order. */
    function nodesIn(box) {
        return graph.nodes.filter((x) => x.position.x < box.x + box.width && x.position.x + BOX.width > box.x
                                         && x.position.y < box.y + box.height && bottomOf(x) > box.y)
            .map((x) => x.id);
    }

    function announceSelection() {
        const now = selected?.kind === 'node' ? `step:${selected.id}`
            : selected?.kind === 'many' ? `many:${JSON.stringify(selected.ids)}`
                : selected?.kind === 'edge' ? `connection:${JSON.stringify(selected.edge)}`
                    : selected?.kind === 'flow' ? 'flow' : '';
        if (now === lastSelect) return;
        lastSelect = now;
        if (!onSelect || destroyed) return;
        if (selected?.kind === 'node') onSelect({ kind: 'step', id: selected.id });
        else if (selected?.kind === 'many') onSelect({ kind: 'many', ids: [...selected.ids] });
        else if (selected?.kind === 'edge') onSelect({ kind: 'connection', id: null, connection: { ...selected.edge } });
        else if (selected?.kind === 'flow') onSelect({ kind: 'flow', id: null });
        else onSelect({ kind: null, id: null });
    }

    function removeSelected() {
        if (!selected || isReadOnly()) return false;
        if (selected.kind === 'many') {
            const doomed = removableOf(selected.ids);
            if (!doomed.length) return false;
            for (const id of doomed) removeNode(graph, id);
            findingsBy = groupFindings(findings, { graph });
            select(null);
            paintNodes();
            commit('flow:nodes:remove');
        } else if (selected.kind === 'node') {
            const nodeRow = nodeOf(selected.id);
            if (!nodeRow || !canRemove(nodeRow, typeOf(nodeRow))) return false;
            removeNode(graph, selected.id);
            findingsBy = groupFindings(findings, { graph });
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
        paintPickBox({ title: say(S, 'stepsPicked', selected.ids.length), line: say(S, 'stepsPickedLine'),
                       removeLabel: say(S, 'removeSteps', n), removeIcon: 'delete', action: 'remove-steps',
                       refused: n === 0 });
    }

    /**
     * The panel for whatever is picked: a step's settings, a line's, or — with
     * nothing (or the flow) picked — the flow's own. The kit's panel puts focus
     * back on the rebuilt control of the same field, caret where it was, and
     * hands it to `keepFocus` when the field is gone.
     */
    function paintPanel() {
        if (destroyed) return;
        if (selected?.kind === 'edge' || selected?.kind === 'many') {
            panel.clear();
            panel.el.hidden = true;
            if (selected.kind === 'edge') paintConnection(); else paintMany();
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
        panel.setFindings(findings);
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
        const right = Math.max(...rows.map((n) => n.position.x + BOX.width));
        const top = Math.min(...rows.map((n) => n.position.y));
        const bottom = Math.max(...rows.map(bottomOf));
        for (const n of rows) {
            const { x, y } = n.position;
            const h = heightOf(n);
            n.position = {
                x: kind === 'left' ? left : kind === 'right' ? right - BOX.width
                    : kind === 'center' ? Math.round((left + right - BOX.width) / 2) : x,
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
        const size = (n) => (across ? BOX.width : heightOf(n));
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
        if (!rows.length || isReadOnly()) return false;
        const step = (canvas.gridSize || 1) * (ev.shiftKey ? NUDGE_FAR : 1);
        for (const n of rows) {
            n.position = { x: n.position.x + dx * step, y: n.position.y + dy * step };
            const box = nodeEls.get(n.id);
            if (box) { box.style.left = `${n.position.x}px`; box.style.top = `${n.position.y}px`; }
        }
        paintEdges();
        commit(rows.length > 1 ? 'flow:nodes:move' : 'flow:node:move', `nudge:${rows.map((n) => n.id).join(',')}`);
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
        canvas.bringIntoView({ x: n.position.x, y: n.position.y, width: BOX.width, height: heightOf(n) });
    }

    /** A press lasts until it is let go: whatever it was, the keyboard's
     *  focus picks again after it. */
    function pressLetGo(ev) {
        released = ev.type === 'pointerup' ? pressed : null;
        pressed = null;
    }

    if (multi) {
        canvas.onMarquee = (box) => pickNodes(nodesIn(box));
        canvas.root.addEventListener('keydown', onTab);
        window.addEventListener('pointerup', pressLetGo, true);
        window.addEventListener('pointercancel', pressLetGo, true);
    }

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
                if (!multi || !pickedIds().length) return false;
                select(null);
                return undefined;
            }
            cancelConnect();
            setMessage('');
            return undefined;
        },
        selectAll: () => {
            if (!multi) return false;
            pickNodes(graph.nodes.map((x) => x.id));
            return undefined;
        },
        up: (ev) => nudge(0, -1, ev),
        down: (ev) => nudge(0, 1, ev),
        left: (ev) => nudge(-1, 0, ev),
        right: (ev) => nudge(1, 0, ev),
    });

    // ── the page ────────────────────────────────────────────────────────

    root.append(toolbar, why, readonlyBanner, message, ...(offerBox ? [offerBox] : []), strip.el, banner, body);
    if (host) host.appendChild(root);

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
        load({ graph: g = null, flowSettings: fs } = {}, { baseline = true, fit: andFit = true } = {}) {
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
            findingsBy = groupFindings(findings, { graph });
            paintNodes();
            paintPanel();
            const state = snapshot();
            if (baseline) history.baseline(state);
            else if (state !== history.settled) history.adopt({ ...history.keep(), settled: state }, state);
            paintToolbar();
            announceSelection();
            if (andFit) {
                if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
                fitFrame = globalThis.requestAnimationFrame
                    ? globalThis.requestAnimationFrame(() => { fitFrame = null; fit(); }) : (fit(), null);
            }
        },
        getGraph: () => normalise(graph),
        serialise: () => serialise(graph),
        /** The text `onChange` hands on and the history holds: the graph and the flow's settings. */
        snapshot,
        getFlowSettings: () => structuredClone(settingsValue),
        setFindings(list) {
            findings = findingsList(list);
            findingsBy = groupFindings(findings, { graph });
            paintStrip();
            paintNodes();
            panel.setFindings(findings);
        },
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
        arrange: () => arrangeGraph(),
        /** `multiSelect`: line the picked nodes up — left, center, right, top,
         *  middle or bottom. False when refused (fewer than two, read only). */
        align: (kind) => (multi ? alignNodes(kind) : false),
        /** `multiSelect`: equal gaps, horizontal or vertical (three or more). */
        distribute: (axis) => (multi ? distributeNodes(axis) : false),
        fit,
        destroy() {
            if (destroyed) return;
            dragCleanup?.();
            if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
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
    history.baseline(snapshot());
    return api;
}
