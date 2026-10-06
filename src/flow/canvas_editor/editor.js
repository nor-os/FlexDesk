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
 */

import { CanvasAdapter } from '../../canvas/canvas_adapter.js';
import { returnEdge, routeEdge } from '../../canvas/edge_router.js';
import { button, el, icon, toneClass, closeFlowPopovers } from '../kit/dom.js';
import { createStrings, say } from '../kit/strings.js';
import { createStepCatalogue } from '../kit/catalogue.js';
import { createWidgetRegistry } from '../kit/widgets.js';
import { createSettingsPanel } from '../kit/settings_panel.js';
import { fieldsFromSchema } from '../kit/settings_schema.js';
import { FORMULA_REFERENCES, PARAMETER_REFERENCES, TEMPLATE_REFERENCES } from '../kit/references.js';
import { alwaysBefore, enclosingLoops, DEFAULT_LOOP_PORTS } from '../kit/always_before.js';
import { createFindingsStrip, findingsList, groupFindings } from '../kit/findings.js';
import { FlowHistory } from '../kit/history.js';
import { bindFlowKeys } from '../kit/keys.js';
import { addNode, connect, disconnect, emptyGraph, normalise, removeNode, sameEdge, serialise } from '../kit/logic_graph.js';
import { CANVAS_STRINGS } from './strings.js';
import { CANVAS_NODE, isReturnEdge, layoutGraph, nodeBottom, portAnchor } from './layout.js';

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
]);

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
    } = options;
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

    // ── the frame ───────────────────────────────────────────────────────
    const root = el('div', 'twm-flow-graph');
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
    /** {kind: 'flow'} | {kind: 'node', id} | {kind: 'edge', edge} | null */
    let selected = null;
    /** The output a click-then-click connection started from: {source, sourcePort}. */
    let connecting = null;
    let suppressClick = false;
    let dragCleanup = null;
    let destroyed = false;
    let fitFrame = null;
    let travelling = null;
    let lastSelect = '';
    const nodeEls = new Map();
    const consumerState = new Map();

    const canvas = new CanvasAdapter({ container: canvasHost, gridSize });
    canvas.root.setAttribute('role', 'application');
    canvas.root.setAttribute('aria-label', label || say(S, 'canvasLabel'));
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
        if (history.commit(snapshot(), action, key)) emitChange(action, key);
        paintToolbar();
    }

    function restore(state) {
        const p = JSON.parse(state);
        graph = normalise(p.graph);
        settingsValue = plainObject(p.flowSettings);
        if (connecting) cancelConnect();
        if (selected?.kind === 'node' && !nodeOf(selected.id)) selected = null;
        if (selected?.kind === 'edge' && !graph.connections.some((c) => sameEdge(c, selected.edge))) selected = null;
        findingsBy = groupFindings(findings, { graph });
        paintNodes();
        paintPanel();
        keepFocus();
        emitChange(null, null, travelling);
        announceSelection();
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
    const own = new Set(Object.keys(tools));
    const consumerTools = [];
    for (const a of Array.isArray(actions) ? actions : []) {
        if (!a || !a.id || own.has(a.id)) continue;
        const b = tool(a.id, { label: a.label ?? a.id, icon: a.icon || null, primary: Boolean(a.primary),
                               danger: Boolean(a.danger), title: a.title || null,
                               onClick: () => { if (!b.disabled) a.run?.(api); } });
        consumerTools.push({ spec: a, el: b });
    }
    toolbar.append(tools.undo, tools.redo, tools.arrange, tools.fit, ...consumerTools.map((t) => t.el),
                   status, toolbarEnd);
    if (typeof slots.toolbarEnd === 'function') slots.toolbarEnd(toolbarEnd);

    function refusals() {
        const stop = isReadOnly() ? (readOnlyReason() || say(S, 'readOnlyRefusal')) : null;
        return {
            undo: stop || (history.canUndo ? null : say(S, 'nothingToUndo')),
            redo: stop || (history.canRedo ? null : say(S, 'nothingToRedo')),
            arrange: stop || (graph.nodes.length < 2 ? say(S, 'arrangeNeedsTwo') : null),
            fit: null,
        };
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
        n.addEventListener('click', (ev) => {
            if (ev.target.closest('.twm-flow-graph__port')) return;
            if (!(selected?.kind === 'node' && selected.id === nodeRow.id)) select({ kind: 'node', id: nodeRow.id });
        });
        n.addEventListener('focus', () => {
            if (!(selected?.kind === 'node' && selected.id === nodeRow.id)) select({ kind: 'node', id: nodeRow.id });
        });
        return n;
    }

    function port(nodeRow, p) {
        const b = el('button', `twm-flow-graph__port twm-flow-graph__port--${p.direction === 'input' ? 'in' : 'out'}`);
        b.type = 'button';
        b.dataset.port = p.name;
        b.dataset.direction = p.direction;
        b.append(el('span', 'twm-flow-graph__port-dot'), el('span', 'twm-flow-graph__port-label', p.label || p.name),
                 el('span', 'twm-flow-graph__port-count'));
        if ((p.port_type || 'FLOW') !== 'FLOW') {
            b.classList.add('twm-flow-graph__port--data');
            b.disabled = true;
            b.dataset.data = '';
            b.title = say(S, 'dataPort', dataPortRead ? dataPortRead(nodeRow, p) : null);
            return b;
        }
        b.title = p.direction === 'output' ? say(S, 'connectFrom') : say(S, 'connectTo');
        b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            portClicked(nodeRow.id, p);
        });
        return b;
    }

    function portClicked(nodeId, p) {
        if (isReadOnly()) return;
        if (p.direction === 'output') {
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

    function startMove(ev, nodeId) {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        select({ kind: 'node', id: nodeId });
        if (isReadOnly()) return;
        const nodeRow = nodeOf(nodeId);
        const n = nodeEls.get(nodeId);
        if (!nodeRow || !n) return;
        const from = { ...nodeRow.position };
        const start = { x: ev.clientX, y: ev.clientY };
        let moved = false;
        const onMove = (m) => {
            const dx = (m.clientX - start.x) / canvas.scale;
            const dy = (m.clientY - start.y) / canvas.scale;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
            moved = true;
            nodeRow.position = { x: canvas.snap(from.x + dx), y: canvas.snap(from.y + dy) };
            n.style.left = `${nodeRow.position.x}px`;
            n.style.top = `${nodeRow.position.y}px`;
            paintEdges();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (moved) commit('flow:node:move');
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
            const picked = selected?.kind === 'node' && selected.id === nodeRow.id;
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

    function paintEdges() {
        if (destroyed) return;
        const byId = new Map(graph.nodes.map((x) => [x.id, x]));
        const paths = [];
        graph.connections.forEach((c) => {
            const a = byId.get(c.source);
            const b = byId.get(c.target);
            if (!a || !b) return;
            const from = anchor(a, c.sourcePort, 'output');
            const to = anchor(b, c.targetPort, 'input');
            const back = isReturn(c, b);
            // A loop's return runs UNDER both steps: drawn as a forward curve it
            // doubles back across them and reads as one more step.
            const d = back ? returnEdge(from, to, { floor: Math.max(bottomOf(a), bottomOf(b)) + RETURN_DROP })
                : routeEdge(from, to, { simple: true });
            const picked = selected?.kind === 'edge' && sameEdge(selected.edge, c);
            const mark = overlay?.ports?.[c.source]?.[c.sourcePort];
            const line = document.createElementNS(SVG, 'path');
            line.setAttribute('class', ['twm-flow-graph__edge', back ? 'twm-flow-graph__edge--back' : '',
                                        picked ? 'twm-flow-graph__edge--picked' : '',
                                        mark?.taken ? 'twm-flow-graph__edge--taken' : '',
                                        mark && !mark.taken ? 'twm-flow-graph__edge--untaken' : '']
                .filter(Boolean).join(' '));
            line.setAttribute('d', d);
            const hit = document.createElementNS(SVG, 'path');
            hit.setAttribute('class', 'twm-flow-graph__edge-hit');
            hit.setAttribute('d', d);
            if (back) {
                const title = document.createElementNS(SVG, 'title');
                title.textContent = say(S, 'returnLine');
                hit.appendChild(title);
            }
            hit.addEventListener('pointerdown', (ev) => {
                ev.stopPropagation();
                select({ kind: 'edge', edge: { ...c } });
            });
            paths.push(line, hit);
        });
        canvas.edgeLayer.replaceChildren(...paths);
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
        for (const [id, n] of nodeEls) {
            const picked = next?.kind === 'node' && next.id === id;
            n.classList.toggle('twm-flow-graph__node--picked', picked);
            if (picked) n.setAttribute('aria-current', 'true'); else n.removeAttribute('aria-current');
        }
        paintEdges();
        paintPanel();
        announceSelection();
    }

    function announceSelection() {
        const now = selected?.kind === 'node' ? `step:${selected.id}`
            : selected?.kind === 'edge' ? `connection:${JSON.stringify(selected.edge)}`
                : selected?.kind === 'flow' ? 'flow' : '';
        if (now === lastSelect) return;
        lastSelect = now;
        if (!onSelect || destroyed) return;
        if (selected?.kind === 'node') onSelect({ kind: 'step', id: selected.id });
        else if (selected?.kind === 'edge') onSelect({ kind: 'connection', id: null, connection: { ...selected.edge } });
        else if (selected?.kind === 'flow') onSelect({ kind: 'flow', id: null });
        else onSelect({ kind: null, id: null });
    }

    function removeSelected() {
        if (!selected || isReadOnly()) return false;
        if (selected.kind === 'node') {
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

    function paintConnection() {
        const e = selected.edge;
        const remove = button({ label: say(S, 'removeConnection'), icon: 'link_off', danger: true,
                                className: 'twm-flow-graph__connection-remove', onClick: () => removeSelected() });
        remove.dataset.action = 'remove-connection';
        remove.disabled = isReadOnly();
        connectionBox.replaceChildren(el('h3', 'twm-flow-graph__connection-title', say(S, 'connection')),
                                      el('p', 'twm-flow-graph__connection-line', say(S, 'connectionLine', e)),
                                      remove);
        connectionBox.hidden = false;
    }

    /**
     * The panel for whatever is picked: a step's settings, a line's, or — with
     * nothing (or the flow) picked — the flow's own. The kit's panel puts focus
     * back on the rebuilt control of the same field, caret where it was, and
     * hands it to `keepFocus` when the field is gone.
     */
    function paintPanel() {
        if (destroyed) return;
        if (selected?.kind === 'edge') {
            panel.clear();
            panel.el.hidden = true;
            paintConnection();
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
            if (!connecting) return false;
            cancelConnect();
            setMessage('');
            return undefined;
        },
    });

    // ── the page ────────────────────────────────────────────────────────

    root.append(toolbar, why, readonlyBanner, message, strip.el, banner, body);
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
            graph = normalise(g);
            if (fs !== undefined) {
                settingsSchema = fs?.schema ?? settingsSchema;
                settingsTitle = fs?.title ?? settingsTitle;
                settingsValue = structuredClone(plainObject(fs?.value));
            }
            if (selected?.kind === 'node' && !nodeOf(selected.id)) selected = null;
            if (selected?.kind === 'edge' && !graph.connections.some((c) => sameEdge(c, selected.edge))) selected = null;
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
            strip.set(findings);
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
            else if (nodeOf(String(target))) select({ kind: 'node', id: String(target) });
        },
        /** Rebuild the panel's fields, keeping the focus and the caret — for a
         *  consumer whose widget's data has arrived. */
        repaintPanel() { paintPanel(); },
        focus() { canvas.root.focus({ preventScroll: true }); },
        undo,
        redo,
        arrange: () => arrangeGraph(),
        fit,
        destroy() {
            if (destroyed) return;
            dragCleanup?.();
            if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
            closeFlowPopovers();
            unbindKeys();
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
