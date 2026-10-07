/**
 * THE OUTLINE EDITOR — a logic flow drawn as a list of blocks (36 §6).
 *
 *     const editor = createOutlineEditor(host, {
 *         catalogue, widgets, references, blocks,          // the consumer's types, controls, syntaxes, mapping
 *         values, summarise, summariseReads, flowSettings, // Insert a value, a row's line, the panel's id line
 *         actions, slots, strings, services,               // toolbar verbs, consumer areas, words, the bag
 *         onChange, onSelect, onFoldChange, initialFolds, history,
 *     });
 *     editor.load({ graph, flowSettings });
 *
 * THE OUTLINE IS THE GRAPH. The editor holds the consumer's graph and reads
 * the outline from it (`recognise.js`); every edit is an operation on the
 * graph (`operations.js`) and the outline is read again. Opened and saved with
 * no edit, `serialise(getGraph())` is the text it was loaded from (I2); node
 * positions are kept and never used. A graph that is not block-shaped is
 * REFUSED, never repaired: it opens read-only, listed in the order it runs,
 * with the sentence saying why above it.
 *
 * ══ WHAT IT DOES NOT DO ═════════════════════════════════════════════════
 *
 * It never fetches, never saves and starts no timer that writes. Every byte
 * that leaves it leaves through `onChange` — after every committed edit, an
 * undo and a redo — and the consumer autosaves. Whether a flow is valid is the
 * consumer's validator: its findings are drawn (`setFindings`), never made.
 *
 * ══ GESTURES ════════════════════════════════════════════════════════════
 *
 * A press SELECTS — it toggles classes and fills the settings panel, and
 * rebuilds no row, so the click lands on the node the press went down on.
 * "+" between rows (on hover AND on focus), the add rows and a row's menu
 * open the step picker and the step menu, both the kit's popovers. A step is
 * dragged by its grip with POINTER EVENTS and a ghost on `document.body`
 * after 4 px — never `draggable` (a native drag takes the pointer at ~5 px
 * and fires `pointercancel`) and never `setPointerCapture` (it retargets the
 * release). The drop line names where the step would go; a refused place
 * says why instead.
 *
 * Keys are the kit's (`bindFlowKeys`), bound on the editor's root: ↑ ↓ move
 * the selection, ← → fold and unfold, Enter opens the settings, Delete
 * removes, Ctrl+D/C/X/V, F2, Alt+↑ ↓ ←, Ctrl+Z/Y. Backspace is never the
 * editor's.
 */

import { el, icon, button, toneClass, uid, closeFlowPopovers } from '../kit/dom.js';
import { createStrings, say } from '../kit/strings.js';
import { createSettingsPanel } from '../kit/settings_panel.js';
import { fieldsFromSchema } from '../kit/settings_schema.js';
import { openStepPicker } from '../kit/step_picker.js';
import { alwaysBefore, enclosingLoops } from '../kit/always_before.js';
import { createFindingsStrip, findingsList, groupFindings } from '../kit/findings.js';
import { FlowHistory } from '../kit/history.js';
import { bindFlowKeys } from '../kit/keys.js';
import { emptyGraph, serialise } from '../kit/logic_graph.js';
import { OUTLINE_STRINGS } from './strings.js';
import { createBlockMapping, displayName } from './mapping.js';
import { describeOutline, flatRunOrder, subtreeIds } from './recognise.js';
import { createOutlineOperations } from './operations.js';
import { openStepMenu } from './menu.js';

/** The edits the outline records (36 §6.6); history refuses any other. */
export const OUTLINE_ACTIONS = Object.freeze([
    'flow:step:add', 'flow:step:remove', 'flow:step:move', 'flow:step:wrap', 'flow:step:duplicate',
    'flow:step:paste', 'flow:step:label', 'flow:step:config', 'flow:arm', 'flow:branch:add', 'flow:branch:remove',
    'flow:settings',
]);

/** Pixels a level of the outline is indented by (the mock's 22). The stylesheet holds the same number. */
export const OUTLINE_INDENT = 22;

const DRAG_START_PX = 4;

/** What Copy holds — one per page, so a step copied in one outline pastes into another. */
let CLIPBOARD = null;

/**
 * @param {HTMLElement} host
 * @param {object} options   36 §3.14 and §6
 */
export function createOutlineEditor(host, options = {}) {
    const {
        catalogue, widgets, references = {}, blocks = {}, values = null, valuesNote = null,
        summarise = null, summariseReads = null, flowSettings = null, readOnly = false, actions = [],
        slots = {}, strings = null, services = null, onChange = null, onSelect = null,
        onFoldChange = null, initialFolds = [], history: historyOptions = {},
    } = options;
    if (!catalogue?.get) throw new Error('createOutlineEditor needs a step catalogue (createStepCatalogue()).');
    if (!widgets?.get) throw new Error('createOutlineEditor needs a widget registry (createWidgetRegistry()).');

    const S = createStrings(OUTLINE_STRINGS, strings);
    const map = createBlockMapping(blocks, catalogue);
    const ops = createOutlineOperations({ catalogue, blocks: map, strings, references });

    // ── state ──────────────────────────────────────────────────────────
    let graph = emptyGraph();
    let settings = flowSettings ? { ...flowSettings, value: structuredClone(flowSettings.value ?? {}) } : null;
    let view = null;
    let refusal = null;
    let consumerRO = readOnly || false;
    let selected = 'flow';
    const folds = new Set(Array.isArray(initialFolds) ? initialFolds : []);
    let findings = [];
    let overlay = null;
    let findText = '';
    let destroyed = false;
    let drag = null;
    const actionState = new Map();
    const itemEls = new Map();

    const nodeOf = (id) => graph.nodes.find((n) => n.id === id) ?? null;
    const typeOf = (id) => catalogue.get(nodeOf(id)?.type) ?? null;
    const nameOf = (id) => (id ? displayName(nodeOf(id), catalogue) || String(id) : say(S, 'theFlow'));
    const editable = () => !refusal && !consumerRO;
    const roReason = () => (refusal ? say(S, 'readOnlyBecause', refusal.message)
        : (consumerRO && typeof consumerRO === 'object' && consumerRO.reason ? String(consumerRO.reason) : ''));
    const startId = () => graph.nodes.find((n) => map.kindOf(n.type) === 'start')?.id ?? null;

    // ── the frame ──────────────────────────────────────────────────────
    const root = el('div', 'twm-flow-outline');
    root.tabIndex = -1;

    const toolbar = el('div', 'twm-flow-outline__toolbar');
    toolbar.setAttribute('role', 'toolbar');
    const undoBtn = button({ label: say(S, 'undo'), icon: 'undo', title: say(S, 'undoTitle'), className: 'twm-flow-outline__tool' });
    const redoBtn = button({ label: say(S, 'redo'), icon: 'redo', title: say(S, 'redoTitle'), className: 'twm-flow-outline__tool' });
    undoBtn.dataset.action = 'undo';
    redoBtn.dataset.action = 'redo';
    undoBtn.addEventListener('click', () => api.undo());
    redoBtn.addEventListener('click', () => api.redo());
    toolbar.append(undoBtn, redoBtn);
    const actionEls = new Map();
    if (actions.length) {
        const sep = el('span', 'twm-flow-outline__sep');
        sep.setAttribute('aria-hidden', 'true');
        toolbar.appendChild(sep);
    }
    for (const a of actions) {
        const wrap = el('span', 'twm-flow-outline__tool-wrap');
        const b = button({ label: a.label, icon: a.icon || null, primary: Boolean(a.primary),
                           className: 'twm-flow-outline__tool' });
        b.dataset.action = a.id;
        b.addEventListener('click', () => { if (!b.disabled) a.run?.(api); });
        const why = el('span', 'twm-flow-outline__refusal');
        why.hidden = true;
        wrap.append(b, why);
        toolbar.appendChild(wrap);
        actionEls.set(a.id, { button: b, why });
    }
    const statusEl = el('span', 'twm-flow-outline__status');
    statusEl.setAttribute('aria-live', 'polite');
    const spacer = el('span', 'twm-flow-outline__spacer');
    const toolbarEnd = el('div', 'twm-flow-outline__toolbar-end');
    toolbar.append(statusEl, spacer, toolbarEnd);

    const roBanner = el('div', 'twm-flow-outline__readonly');
    roBanner.setAttribute('role', 'status');
    roBanner.hidden = true;

    const strip = createFindingsStrip({
        strings: S,
        nameOf: (id) => nameOf(id),
        onGoTo: (f) => goTo(f),
    });

    const runBanner = el('div', 'twm-flow-outline__banner');
    runBanner.hidden = true;

    const body = el('div', 'twm-flow-outline__body');
    const list = el('section', 'twm-flow-outline__list');
    list.setAttribute('aria-label', say(S, 'stepsHeading'));
    const head = el('div', 'twm-flow-outline__list-head');
    const heading = el('h2', 'twm-flow-outline__heading', say(S, 'stepsHeading'));
    const countEl = el('span', 'twm-flow-outline__count');
    const foldAllBtn = el('button', 'twm-flow-outline__fold-all', say(S, 'foldAll'));
    foldAllBtn.type = 'button';
    const unfoldAllBtn = el('button', 'twm-flow-outline__fold-all', say(S, 'unfoldAll'));
    unfoldAllBtn.type = 'button';
    foldAllBtn.addEventListener('click', () => setFolds(blockIds()));
    unfoldAllBtn.addEventListener('click', () => setFolds([]));
    head.append(heading, countEl, el('span', 'twm-flow-outline__spacer'), foldAllBtn, unfoldAllBtn);
    const findBox = el('input', 'twm-flow-outline__find');
    findBox.type = 'search';
    findBox.placeholder = say(S, 'findStep');
    findBox.setAttribute('aria-label', say(S, 'findStep'));
    findBox.autocomplete = 'off';
    findBox.addEventListener('input', () => { findText = findBox.value; render(); });
    findBox.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && findBox.value) {
            ev.preventDefault();
            ev.stopPropagation();
            findBox.value = '';
            findText = '';
            render();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const first = [...tree.querySelectorAll('[role="treeitem"][data-match]')][0];
            if (first) select(first.dataset.step || 'flow', { focus: true });
        }
    });
    const scroller = el('div', 'twm-flow-outline__scroll');
    const tree = el('div', 'twm-flow-outline__tree');
    tree.setAttribute('role', 'tree');
    tree.setAttribute('aria-label', say(S, 'stepsHeading'));
    scroller.appendChild(tree);
    const message = el('p', 'twm-flow-outline__message');
    message.setAttribute('aria-live', 'polite');
    message.hidden = true;
    const keysLine = el('p', 'twm-flow-outline__keys', say(S, 'statusKeys'));
    list.append(head, findBox, scroller, message, keysLine);

    const settingsHost = el('section', 'twm-flow-outline__settings');
    const aside = el('aside', 'twm-flow-outline__aside');
    aside.hidden = true;
    body.append(list, settingsHost, aside);
    root.append(toolbar, roBanner, strip.el, runBanner, body);
    host.appendChild(root);
    if (typeof slots.toolbarEnd === 'function') slots.toolbarEnd(toolbarEnd);
    toolbarEnd.hidden = toolbarEnd.childNodes.length === 0;

    // ── the settings panel (the kit's) ─────────────────────────────────
    const panel = createSettingsPanel({
        widgets, references, strings: S, services, readOnly: false, host: settingsHost, valuesNote,
        onChange: (stepId, key, value) => onPanelChange(stepId, key, value),
        onRename: (stepId, label) => onRename(stepId, label),
        onFocusLost: () => focusSelected(),
        values: values ? (q) => valuesFor(q) : null,
        columns: null,
    });

    function valuesFor({ stepId, field, key }) {
        const g = structuredClone(graph);
        if (!stepId) return values({ graph: g, stepId: null, field, key, before: [], loops: [], parameters: null });
        const loopPorts = map.loopPorts;
        const before = alwaysBefore(graph, catalogue, stepId, {
            loopPorts, waitsForAll: (join) => map.joinValue(join) !== 'any',
        });
        const loops = enclosingLoops(graph, catalogue, stepId, { loopPorts });
        return values({ graph: g, stepId, step: nodeOf(stepId), field, key, before, loops, parameters: null });
    }

    // ── history ────────────────────────────────────────────────────────
    const stateText = () => JSON.stringify({ graph, settings: settings ? settings.value : null });
    const history = new FlowHistory({
        actions: OUTLINE_ACTIONS,
        limit: historyOptions.limit ?? 100,
        mergeMs: historyOptions.mergeMs ?? 1000,
        now: historyOptions.now,
        restore: (state) => {
            const s = JSON.parse(state);
            graph = s.graph;
            if (settings) settings.value = s.settings ?? {};
            reread();
            if (selected !== 'flow' && selected !== null && !nodeOf(selected)) selected = 'flow';
            render();
            showPanel();
            drawAside();
        },
        onState: () => updateTools(),
    });

    function emit(action, key = null) {
        onChange?.({ graph: structuredClone(graph), flowSettings: settings ? structuredClone(settings.value) : null,
                     text: serialise(graph), action, key });
    }

    function commit(action, key = null) {
        if (history.commit(stateText(), action, key)) emit(action, key);
    }

    // ── reading the outline ────────────────────────────────────────────
    function reread() {
        const r = ops.read(graph);
        view = r.ok ? r : null;
        refusal = r.ok ? null : r.refusal;
        drawReadOnly();
    }

    function drawReadOnly() {
        const why = roReason();
        roBanner.replaceChildren();
        roBanner.hidden = !why;
        if (why) roBanner.append(icon('lock', 'twm-flow-outline__readonly-icon'), el('span', 'twm-flow-outline__readonly-text', why));
        root.classList.toggle('twm-flow-outline--readonly', !editable());
        updateTools();
    }

    function updateTools() {
        const can = editable();
        undoBtn.disabled = !can || !history.canUndo;
        redoBtn.disabled = !can || !history.canRedo;
        foldAllBtn.disabled = !view;
        unfoldAllBtn.disabled = !view;
        for (const [id, { button: b, why }] of actionEls) {
            const st = actionState.get(id) || {};
            b.disabled = Boolean(st.disabled || st.busy);
            b.classList.toggle('twm-flow-outline__tool--busy', Boolean(st.busy));
            why.textContent = st.disabled && st.reason ? String(st.reason) : '';
            why.hidden = !why.textContent;
        }
    }

    function announce(text) {
        message.textContent = text || '';
        message.hidden = !text;
    }

    // ── what is drawn ──────────────────────────────────────────────────
    const findingsBy = () => groupFindings(findings, { graph });

    function blockIds() {
        if (!view) return [];
        const out = [];
        for (const p of view.index.at.values()) {
            if (!p.seq || p.join) continue;
            if (hasChildren(p.item)) out.push(p.item.id);
        }
        return out;
    }

    function drawnArms(item) {
        if (item.kind === 'step' || item.kind === 'start') {
            return item.arms.filter((a) => !(a.seq.exit === 'open' && a.seq.items.length === 0));
        }
        return item.arms || [];
    }

    function hasChildren(item) {
        if (item.kind === 'loop' || item.kind === 'fanout' || item.kind === 'branch') return true;
        return drawnArms(item).length > 0;
    }

    /** Steps inside an item, for "N steps inside". */
    function stepsInside(item) {
        return subtreeIds(item).filter((id) => id !== item.id && map.kindOf(nodeOf(id)?.type) !== 'join').length;
    }

    /**
     * The consumer's one line for a row: `summarise` answers text, or
     * `{text, mono}` for a line that is code (a formula) and is drawn in the
     * code face, as the mock draws a condition's.
     */
    function lineOf(node, type) {
        const s = node && summarise ? summarise(node, type) : null;
        if (s && typeof s === 'object') return { text: s.text === undefined || s.text === null ? '' : String(s.text), mono: Boolean(s.mono) };
        return { text: s === undefined || s === null ? '' : String(s), mono: false };
    }

    function findFilter() {
        const q = findText.trim().toLowerCase();
        if (!q || !view) return null;
        const match = new Set();
        for (const n of graph.nodes) {
            if (map.kindOf(n.type) === 'start' || map.kindOf(n.type) === 'join') continue;
            const t = catalogue.get(n.type);
            const hay = [displayName(n, catalogue), t?.label, lineOf(n, t).text].map((s) => String(s ?? '').toLowerCase()).join(' ');
            if (hay.includes(q)) match.add(n.id);
        }
        const show = new Set(match);
        for (const id of match) {
            const p = view.index.at.get(id);
            for (const step of p?.path || []) show.add(step.owner.id);
        }
        return { match, show, query: findText.trim() };
    }

    // overlay helpers
    const stepRun = (id) => overlay?.steps?.[id] ?? null;
    const portRun = (id, port) => overlay?.ports?.[id]?.[port] ?? null;
    const RUN_TONES = { completed: 'ok', failed: 'fail', skipped: 'skip', 'not-reached': 'skip', running: 'running',
                        cancelled: 'skip' };
    const isOff = (id) => ['skipped', 'not-reached'].includes(stepRun(id)?.state);

    // ── rendering ──────────────────────────────────────────────────────
    function render() {
        if (destroyed) return;
        // Focus in the tree survives a redraw: on the same step's row (or its
        // menu button), else on the selection — never on <body>.
        const active = root.ownerDocument.activeElement;
        const held = tree.contains(active)
            ? { step: active.closest('[role="treeitem"]')?.dataset.step || 'flow',
                menu: Boolean(active.closest('.twm-flow-outline__menu')) }
            : null;
        tree.replaceChildren();
        itemEls.clear();
        gapEls = [];
        offArm.clear();
        const filter = findFilter();
        if (view) renderOutline(filter);
        else renderFlat();
        countEl.textContent = say(S, 'stepsCount', graph.nodes.filter((n) => !['start', 'join'].includes(map.kindOf(n.type))).length);
        if (filter && !filter.match.size) announce(say(S, 'findNothing', filter.query));
        else if (filter || message.dataset.kind === 'find') announce('');
        message.dataset.kind = filter ? 'find' : '';
        drawRunBanner();
        applySelection();
        if (held) {
            const item = itemEls.get(held.step) ?? itemEls.get(selected) ?? itemEls.get('flow');
            const target = held.menu ? item?.querySelector(':scope > .twm-flow-outline__row > .twm-flow-outline__menu') : null;
            (target || item)?.focus({ preventScroll: true });
        }
        // A redraw in the middle of a drag (a consumer's findings arriving)
        // keeps the drag: its line, its places, its marked row.
        if (drag?.started) {
            tree.appendChild(drag.line);
            drag.targets = dropTargets(drag.id);
            itemEls.get(drag.id)?.querySelector(':scope > .twm-flow-outline__row')?.classList.add('twm-flow-outline__row--dragging');
        }
    }

    /**
     * A redraw the reader did not ask for — findings, a run overlay, a
     * read-only switch — waits while a press is held in the editor. The
     * browser fires a click only when press and release land on the SAME
     * node, and a run refreshed every second would otherwise rebuild the row
     * under a press now and then and swallow its click.
     */
    let pressing = false;
    let pendingRender = false;
    function renderSoon() {
        if (pressing) { pendingRender = true; return; }
        render();
    }
    const onPressStart = () => { pressing = true; };
    const onPressEnd = () => {
        if (!pressing) return;
        pressing = false;
        if (!pendingRender) return;
        pendingRender = false;
        // After the click this release makes, which is dispatched in this same turn.
        setTimeout(() => { if (!destroyed && !pressing) render(); else if (pressing) pendingRender = true; }, 0);
    };

    function guides(row, depth) {
        for (let k = 0; k < depth; k += 1) {
            const g = el('span', 'twm-flow-outline__guide');
            g.setAttribute('aria-hidden', 'true');
            g.style.setProperty('--twm-outline-guide', String(k));
            row.appendChild(g);
        }
    }

    function rowAt(cls, depth) {
        const row = el('div', `twm-flow-outline__row ${cls}`);
        row.style.setProperty('--twm-outline-depth', String(depth));
        guides(row, depth);
        return row;
    }

    function renderFlat() {
        const order = flatRunOrder(graph, catalogue, map);
        for (const id of order) {
            const n = nodeOf(id);
            if (!n) continue;
            if (map.kindOf(n.type) === 'start') tree.appendChild(flowItem(null));
            else tree.appendChild(stepItem({ kind: 'step', id, arms: [] }, 0, null));
        }
    }

    function renderOutline(filter) {
        const flow = flowItem(filter);
        tree.appendChild(flow);
        const flowRow = flow.querySelector(':scope > .twm-flow-outline__row');
        gap(flowRow, view.tree.top, 0, 0);
        renderSeq(view.tree.top, 0, tree, filter);
        if (editable() && !filter) {
            const add = addRow(0, map.addLabel(), () => addAnchor(view.tree.top));
            if (add) tree.appendChild(add);
        }
    }

    /**
     * Where an add row inserts: the end of its Seq, or just before the End
     * that closes it. Null when nothing could be added there — no add row is
     * drawn that every entry would refuse — and when the end of the Seq is
     * really another place: after a branch only one arm of which goes on,
     * "after the block" IS the end of that arm, and a row drawn at the foot of
     * the Seq would add a step somewhere it is not drawn.
     */
    function addAnchor(seq) {
        let at = ops.resolve(view, ops.anchorOf(seq, seq.items.length)) ?? { seq, index: seq.items.length };
        if (at.seq !== seq) return null;
        const last = at.seq.items[at.index - 1];
        if (at.index === at.seq.items.length && last?.kind === 'end') at = { seq: at.seq, index: at.index - 1 };
        const facts = ops.gapAt(view, at.seq, at.index);
        if (facts.afterEnd || !facts.arriving.length) return null;
        return { anchor: ops.anchorOf(at.seq, at.index), seq: at.seq, index: at.index };
    }

    function renderSeq(seq, depth, container, filter) {
        seq.items.forEach((item, i) => {
            if (filter && !filter.show.has(item.id)) return;
            const itemEl = stepItem(item, depth, filter);
            container.appendChild(itemEl);
            const rows = itemEl.querySelectorAll('.twm-flow-outline__row');
            const visible = [...rows].filter((r) => !r.closest('[hidden]'));
            gap(visible[visible.length - 1] || rows[0], seq, i + 1, depth);
        });
    }

    function flowItem(filter) {
        const id = startId();
        const node = id ? nodeOf(id) : null;
        const type = node ? catalogue.get(node.type) : null;
        const item = el('div', 'twm-flow-outline__item twm-flow-outline__item--flow');
        item.setAttribute('role', 'treeitem');
        item.setAttribute('aria-level', '1');
        item.dataset.twmFlowItem = '';
        item.dataset.flow = '';
        item.tabIndex = -1;
        const row = rowAt('twm-flow-outline__row--flow', 0);
        const chip = el('span', `twm-flow-outline__chip ${toneClass('twm-flow-outline__chip', map.start.tone || 'blue')}`);
        chip.setAttribute('aria-hidden', 'true');
        chip.appendChild(icon(map.start.icon || type?.icon || 'play_arrow'));
        const words = el('span', 'twm-flow-outline__words');
        const line = el('span', 'twm-flow-outline__line');
        line.appendChild(el('span', 'twm-flow-outline__title', map.startLabel(S)));
        words.appendChild(line);
        const said = node ? lineOf(node, type) : { text: '', mono: false };
        const sum = said.text;
        if (sum) words.appendChild(summaryEl(said));
        row.append(chip, words);
        const fs = findingsBy().get(null) || [];
        if (fs.length) row.appendChild(badge(fs));
        item.appendChild(row);
        item.setAttribute('aria-label', [map.startLabel(S), sum].filter(Boolean).join(', '));
        row.addEventListener('click', () => select('flow', { focus: true }));
        if (filter) item.classList.add('twm-flow-outline__item--context');
        itemEls.set('flow', item);
        return item;
    }

    function summaryEl({ text, mono }) {
        return el('span', `twm-flow-outline__summary${mono ? ' twm-flow-outline__summary--mono' : ''}`, text);
    }

    function badge(list) {
        const errors = list.filter((f) => f.severity !== 'warning');
        const b = el('span', `twm-flow-outline__badge${errors.length ? '' : ' twm-flow-outline__badge--warning'}`);
        b.appendChild(icon(errors.length ? 'error' : 'warning'));
        b.title = errors.length ? say(S, 'toFix', errors.length) : say(S, 'toLookAt', list.length);
        return b;
    }

    function stepItem(item, depth, filter) {
        const blocky = view ? hasChildren(item) : false;
        const folded = blocky && folds.has(item.id) && !filter;
        const li = el('div', 'twm-flow-outline__item');
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-level', String(depth + 1));
        li.dataset.twmFlowItem = '';
        li.dataset.step = item.id;
        li.tabIndex = -1;
        if (blocky) li.setAttribute('aria-expanded', String(!folded));
        if (filter) {
            if (filter.match.has(item.id)) li.dataset.match = '';
            else li.classList.add('twm-flow-outline__item--context');
        }
        const { row, label } = stepRow(item, depth, filter);
        li.setAttribute('aria-label', label);
        li.appendChild(row);
        itemEls.set(item.id, li);
        if (view && blocky) {
            const inside = el('div', 'twm-flow-outline__inside');
            inside.hidden = folded;
            buildInside(item, depth, inside, filter, row);
            li.appendChild(inside);
        }
        return li;
    }

    /** One step's row: grip, fold, chip, words, the run's word, a finding's mark, the menu. */
    function stepRow(item, depth, filter) {
        const node = nodeOf(item.id);
        const type = catalogue.get(node?.type);
        const name = nameOf(item.id);
        const blocky = view ? hasChildren(item) : false;
        const folded = blocky && folds.has(item.id) && !filter;
        const row = rowAt('twm-flow-outline__row--step', depth);
        if (isOff(item.id) || offArm.has(item.id)) row.classList.add('twm-flow-outline__row--off');
        const grip = el('span', 'twm-flow-outline__grip');
        grip.setAttribute('aria-hidden', 'true');
        grip.title = say(S, 'dragToMove');
        grip.appendChild(icon('drag_indicator'));
        if (editable() && view) grip.addEventListener('pointerdown', (ev) => armDrag(ev, item.id));
        else grip.classList.add('twm-flow-outline__grip--off');
        row.appendChild(grip);
        if (blocky) {
            const f = el('button', 'twm-flow-outline__fold');
            f.type = 'button';
            f.tabIndex = -1;
            f.setAttribute('aria-label', say(S, folded ? 'unfold' : 'fold', name));
            f.setAttribute('aria-expanded', String(!folded));
            f.appendChild(icon(folded ? 'chevron_right' : 'expand_more'));
            f.addEventListener('click', (ev) => { ev.stopPropagation(); toggleFold(item.id); });
            row.appendChild(f);
        } else {
            const sp = el('span', 'twm-flow-outline__fold-space');
            sp.setAttribute('aria-hidden', 'true');
            row.appendChild(sp);
        }
        const chip = el('span', `twm-flow-outline__chip ${toneClass('twm-flow-outline__chip', catalogue.tone(node?.type))}`);
        chip.setAttribute('aria-hidden', 'true');
        chip.appendChild(icon(type?.icon || ''));
        row.appendChild(chip);
        const words = el('span', 'twm-flow-outline__words');
        const line = el('span', 'twm-flow-outline__line');
        line.appendChild(el('span', 'twm-flow-outline__title', name));
        if (type?.label && type.label !== name) line.appendChild(el('span', 'twm-flow-outline__type', type.label));
        words.appendChild(line);
        const mine = findingsBy().get(item.id) || [];
        const said = lineOf(node, type);
        const summary = said.text;
        if (mine.length) {
            const errors = mine.filter((f) => f.severity !== 'warning');
            words.appendChild(el('span', `twm-flow-outline__summary twm-flow-outline__summary--${errors.length ? 'error' : 'warning'}`,
                String((errors[0] || mine[0]).message ?? '')));
        } else if (summary) {
            words.appendChild(summaryEl(said));
        }
        row.appendChild(words);
        if (folded) row.appendChild(el('span', 'twm-flow-outline__note', say(S, 'stepsInside', stepsInside(item))));
        const run = stepRun(item.id);
        if (run) {
            const tone = run.tone || RUN_TONES[run.state] || 'skip';
            const pill = el('span', `twm-flow-outline__run twm-flow-outline__run--${['ok', 'warn', 'fail', 'skip', 'running'].includes(tone) ? tone : 'skip'}`,
                run.line ?? say(S, 'runState', run.state));
            row.appendChild(pill);
        }
        if (mine.length) row.appendChild(badge(mine));
        if (view) {
            const menu = el('button', 'twm-flow-outline__menu');
            menu.type = 'button';
            menu.tabIndex = -1;
            menu.setAttribute('aria-label', say(S, 'menuFor', name));
            menu.setAttribute('aria-haspopup', 'menu');
            menu.appendChild(icon('more_horiz'));
            // The menu acts on its step, so its step is the one selected: the
            // settings beside it are the ones its verbs change.
            menu.addEventListener('click', (ev) => { ev.stopPropagation(); select(item.id); openMenu(item.id, menu); });
            row.appendChild(menu);
            row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); select(item.id); openMenu(item.id, menu); });
        }
        row.addEventListener('click', () => select(item.id, { focus: true }));
        return { row, label: [name, type?.label !== name ? type?.label : null, summary].filter(Boolean).join(', ') };
    }

    const offArm = new Set();

    function armGroup(label, depth, tone, container, filter, note = null, removable = null) {
        const group = el('div', 'twm-flow-outline__arm');
        group.setAttribute('role', 'group');
        // An arm's words are drawn in one of three tones the stylesheet knows
        // (Then, Otherwise, a failure); any other is the plain arm tone.
        const known = ['then', 'else', 'fail'].includes(tone) ? ` twm-flow-outline__row--${tone}` : '';
        const row = rowAt(`twm-flow-outline__row--arm${known}`, depth);
        row.appendChild(icon('subdirectory_arrow_right', 'twm-flow-outline__arm-icon'));
        const words = el('span', 'twm-flow-outline__arm-label', label);
        words.id = uid('outline-arm');
        row.appendChild(words);
        if (note) row.appendChild(el('span', 'twm-flow-outline__arm-note', note));
        if (removable) {
            const x = el('button', 'twm-flow-outline__arm-remove');
            x.type = 'button';
            x.setAttribute('aria-label', say(S, 'removeBranch', label));
            x.title = say(S, 'removeBranch', label);
            x.appendChild(icon('close'));
            x.addEventListener('click', (ev) => { ev.stopPropagation(); removable(); });
            row.appendChild(x);
        }
        group.setAttribute('aria-labelledby', words.id);
        group.appendChild(row);
        container.appendChild(group);
        return { group, row };
    }

    function footRow(depth, glyph, label, note, container) {
        const row = rowAt('twm-flow-outline__row--foot', depth);
        row.appendChild(icon(glyph, 'twm-flow-outline__foot-icon'));
        row.appendChild(el('span', 'twm-flow-outline__foot-label', label));
        if (note) row.appendChild(el('span', 'twm-flow-outline__foot-note', note));
        container.appendChild(row);
        return row;
    }

    function addRow(depth, label, where, onPick = null) {
        if (!editable()) return null;
        if (!onPick && !where()) return null;
        const row = rowAt('twm-flow-outline__row--add', depth);
        if (depth === 0) row.classList.add('twm-flow-outline__row--add-top');
        const b = el('button', 'twm-flow-outline__add');
        b.type = 'button';
        b.appendChild(icon('add'));
        b.appendChild(el('span', 'twm-flow-outline__add-label', label));
        b.addEventListener('click', () => {
            const w = where();
            if (onPick) onPick(b);
            else if (w) openPicker(b, w.seq, w.index);
        });
        row.appendChild(b);
        return row;
    }

    function armNote(owner, arm) {
        if (!overlay) return null;
        const r = portRun(owner, arm.port);
        if (!r) return null;
        if (r.count) return say(S, 'runCount', r.count);
        return r.taken ? say(S, 'runTaken') : say(S, 'runNotTaken');
    }

    function markOff(seq) {
        for (const it of seq.items) for (const id of subtreeIds(it)) offArm.add(id);
    }

    function buildInside(item, depth, inside, filter, headRow) {
        const node = nodeOf(item.id);
        const d = depth + 1;
        const seqFoot = (arm, owner) => {
            if (filter) return;
            if (arm.seq.exit === 'next') {
                const loop = ops.loopAround(view, arm.seq);
                footRow(d, 'skip_next', map.loopSkip(nodeOf(loop)), portRun(owner, arm.port)?.count
                    ? say(S, 'runCount', portRun(owner, arm.port).count) : null, armInside(arm));
            } else if (arm.seq.exit === 'open' && (item.kind === 'branch' || arm.seq.items.length)) {
                footRow(d, 'block', say(S, 'armStops'), null, armInside(arm));
            }
        };
        const groups = new Map();
        const armInside = (arm) => groups.get(arm);
        const drawArm = (arm, label, tone, removable = null) => {
            const visibleInFilter = !filter || arm.seq.items.some((x) => filter.show.has(x.id));
            if (!visibleInFilter) return;
            // A parallel's branches are all lines out of ONE port: what a run took
            // of each is told by its first step, not by the port.
            const perPort = item.kind !== 'fanout';
            const note = perPort ? armNote(item.id, arm) : null;
            const r = perPort ? portRun(item.id, arm.port) : null;
            if (overlay && r && r.taken === false && !r.count) markOff(arm.seq);
            const { group, row } = armGroup(label, d, tone, inside, filter, note, removable);
            if (overlay && r && r.taken === false && !r.count) row.classList.add('twm-flow-outline__row--off');
            groups.set(arm, group);
            gap(row, arm.seq, 0, d);
            renderSeq(arm.seq, d, group, filter);
            seqFoot(arm, item.id);
        };
        if (item.kind === 'loop') {
            const body = el('div', 'twm-flow-outline__arm');
            body.setAttribute('role', 'group');
            body.setAttribute('aria-label', nameOf(item.id));
            inside.appendChild(body);
            groups.set(item.body, body);
            gap(headRow, item.body.seq, 0, d);
            renderSeq(item.body.seq, d, body, filter);
            if (!filter) {
                const add = addRow(d, map.loopAddInside(node), () => addAnchor(item.body.seq));
                if (add) body.appendChild(add);
                const count = portRun(item.id, map.loopPorts.next)?.count;
                footRow(d, 'repeat', map.loopFoot(node), count ? say(S, 'runCount', count) : null, body);
            }
            for (const arm of drawnArms(item)) drawArm(arm, map.armLabel(node, arm.port), map.armSetting(node, arm.port).tone);
            return;
        }
        if (item.kind === 'fanout') {
            item.arms.forEach((arm, i) => {
                const removable = editable() && item.arms.length > 1
                    ? () => apply(ops.removeBranch(graph, item.id, i), 'flow:branch:remove') : null;
                const first = arm.seq.items[0];
                if (overlay && first && isOff(first.id)) markOff(arm.seq);
                drawArm(arm, map.fanoutArmLabel(i + 1), 'arm', removable);
            });
            if (!filter) {
                const add = addRow(d, map.fanoutAddArm(node), () => null, (anchorBtn) => openBranchPicker(anchorBtn, item.id));
                if (add) inside.appendChild(add);
                if (item.join) {
                    const jn = nodeOf(item.join.id);
                    footRow(d, 'merge', map.joinFoot(jn, S), stepRun(item.join.id)?.line ?? null, inside);
                }
            }
            return;
        }
        if (item.kind === 'branch') {
            item.arms.forEach((arm, i) => drawArm(arm, map.branchArmLabel(node, arm.port), map.branchArmTone(node, arm.port, i)));
            return;
        }
        for (const arm of drawnArms(item)) drawArm(arm, map.armLabel(node, arm.port), map.armSetting(node, arm.port).tone);
    }

    /** The "+" between rows: a gap in `seq` before `index`, drawn at the bottom edge of `row`. */
    function gap(row, seq, index, depth) {
        if (!row || !editable() || !view || findText.trim()) return;
        if (!ops.isCanonical(view, seq, index)) return;
        const facts = ops.gapAt(view, seq, index);
        if (facts.afterEnd || !facts.arriving.length) return;
        const where = ops.gapWords(view, seq, index);
        const b = el('button', 'twm-flow-outline__gap');
        b.type = 'button';
        b.tabIndex = -1;
        b.style.setProperty('--twm-outline-depth', String(depth));
        b.setAttribute('aria-label', say(S, 'addStepHere', where));
        b.title = say(S, 'addStepHere', where);
        b.dataset.gap = JSON.stringify(ops.anchorOf(seq, index));
        const line = el('span', 'twm-flow-outline__gap-line');
        line.setAttribute('aria-hidden', 'true');
        b.append(line, icon('add', 'twm-flow-outline__gap-plus'));
        b.addEventListener('click', (ev) => { ev.stopPropagation(); openPicker(b, seq, index); });
        b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        row.appendChild(b);
        gapEls.push({ el: b, row, seq, index, depth });
    }
    let gapEls = [];

    // ── selection and focus ────────────────────────────────────────────
    function applySelection() {
        const key = selected === null ? 'flow' : selected;
        const current = itemEls.get(key) ?? itemEls.get('flow') ?? null;
        for (const li of itemEls.values()) {
            const on = li === current;
            const row = li.querySelector(':scope > .twm-flow-outline__row');
            li.setAttribute('aria-selected', String(on));
            row?.classList.toggle('twm-flow-outline__row--selected', on);
            if (on) row?.setAttribute('aria-current', 'true');
            else row?.removeAttribute('aria-current');
        }
        // Roving: the current row, its menu and every "+" that belongs to it are
        // the tree's tab stops — the "+" after a block sits on its last row (a
        // foot, an arm's last step), and the one into an arm on the arm's row,
        // so "belongs" is "the nearest step around it", never "on its own row".
        for (const li of itemEls.values()) li.tabIndex = li === current ? 0 : -1;
        for (const b of tree.querySelectorAll('.twm-flow-outline__menu, .twm-flow-outline__gap')) {
            b.tabIndex = current && b.closest('[role="treeitem"]') === current ? 0 : -1;
        }
    }

    function select(id, { focus = false, silent = false } = {}) {
        const next = id === null || id === undefined ? 'flow' : id;
        const changed = next !== selected;
        selected = next;
        applySelection();
        if (changed) { showPanel(); drawAside(); }
        void silent;
        if (focus) itemEls.get(selected)?.focus({ preventScroll: false });
        if (changed) onSelect?.({ kind: selected === 'flow' ? 'flow' : 'step', id: selected === 'flow' ? null : selected });
    }

    function focusSelected() {
        const li = itemEls.get(selected) ?? itemEls.get('flow');
        if (li) li.focus({ preventScroll: true });
        else root.focus({ preventScroll: true });
    }

    function visibleItems() {
        return [...tree.querySelectorAll('[role="treeitem"]')].filter((li) => !li.parentElement.closest('[hidden]'));
    }

    // ── the panel ──────────────────────────────────────────────────────
    function showPanel() {
        if (destroyed) return;
        panel.setReadOnly(editable() ? false : true);
        if (selected === 'flow' || selected === null || !nodeOf(selected)) {
            const s = settings || {};
            const sid = startId();
            const st = sid ? typeOf(sid) : null;
            panel.show({
                step: null, type: null, title: s.title ?? map.startLabel(S), typeLabel: s.typeLabel ?? say(S, 'startType'),
                where: s.where ?? '', description: s.description ?? '', idLine: s.idLine ?? null,
                icon: map.start.icon || st?.icon || 'play_arrow', tone: map.start.tone || 'blue',
                fields: s.schema ? fieldsFromSchema(s.schema) : [], value: s.value ?? {},
            });
            panel.setFindings(findings);
            return;
        }
        const node = nodeOf(selected);
        const type = catalogue.get(node.type);
        const place = view?.index.at.get(selected);
        const canEdit = editable();
        const dup = canEdit && view ? ops.duplicate(graph, selected) : null;
        panel.show({
            step: node, type, title: node.label ?? '', placeholderTitle: type?.label ?? node.id, rename: true,
            typeLabel: type?.label ?? node.type, where: view ? ops.whereText(view, selected) : '',
            description: type?.description ?? '', idLine: summariseReads?.(node, type) ?? null,
            icon: type?.icon ?? '', tone: catalogue.tone(node.type),
            value: node.config ?? {},
            extra: view && place ? extrasFor(place.item, node) : [],
            actions: view ? [
                { id: 'duplicate', label: say(S, 'duplicate'), icon: 'content_copy', disabled: !dup?.ok,
                  reason: dup && !dup.ok ? dup.reason : '', run: () => runOp(() => ops.duplicate(graph, selected), 'flow:step:duplicate') },
                { id: 'remove', label: say(S, 'removeStep'), icon: 'delete', danger: true,
                  run: () => runOp(() => ops.remove(graph, selected), 'flow:step:remove') },
            ] : [],
        });
        panel.setFindings(findings);
    }

    /** Ports drawn as settings (36 §6.5): an arm on or off, where it goes after, a parallel's join. */
    function extrasFor(item, node) {
        const out = [];
        const note = map.note(item.kind, node);
        if (note) out.push({ note, at: 'start' });
        if (item.kind === 'step' || (item.kind === 'loop' && item.arms.length)) {
            for (const arm of item.arms) {
                const words = map.armSetting(node, arm.port);
                const connected = !(arm.seq.exit === 'open' && !arm.seq.items.length);
                const placed = words.after ? { after: words.after } : {};
                out.push({
                    key: `__arm:${arm.port}`, ...placed,
                    spec: { type: 'string', title: words.label, enum: ['open', 'connected'], 'x-ui-widget': 'choice-cards',
                            'x-ui-enum-labels': { open: words.unconnected, connected: words.connected } },
                    value: connected ? 'connected' : 'open',
                    set: (v) => runOp(() => ops.setArm(graph, item.id, arm.port, v === 'connected'), 'flow:arm',
                                      { keepPanel: true }),
                });
                const loop = ops.loopAround(view, view.index.at.get(item.id).seq);
                const cont = ops.gapAt(view, view.index.at.get(item.id).seq, view.index.at.get(item.id).index + 1).succ;
                if (connected && loop && cont && !(cont.id === loop && cont.port === map.loopPorts.next)
                    && ['rejoin', 'next'].includes(arm.seq.exit)) {
                    out.push({
                        key: `__exit:${arm.port}`, ...placed,
                        spec: { type: 'string', title: say(S, 'armExitLabel'), enum: ['rejoin', 'next'], 'x-ui-widget': 'choice-cards',
                                'x-ui-enum-labels': { rejoin: say(S, 'armExitRejoin', nameOf(cont.id)), next: map.loopSkip(nodeOf(loop)) } },
                        value: arm.seq.exit,
                        set: (v) => runOp(() => ops.setArmExit(graph, item.id, arm.port, v), 'flow:arm', { keepPanel: true }),
                    });
                }
            }
        }
        if (item.kind === 'fanout' && item.join) {
            const jn = nodeOf(item.join.id);
            const field = map.joinField;
            const prop = catalogue.get(jn.type)?.config_schema?.properties?.[field] || {};
            const labels = prop['x-ui-enum-labels'] || {};
            out.push({
                key: '__join',
                spec: { type: 'string', title: map.joinChoices.label ?? say(S, 'joinSettingLabel'), enum: ['all', 'any'],
                        'x-ui-widget': 'choice-cards',
                        'x-ui-enum-labels': { all: map.joinChoices.all ?? labels.all ?? say(S, 'joinAll'),
                                              any: map.joinChoices.any ?? labels.any ?? say(S, 'joinAny') } },
                value: map.joinValue(jn),
                set: (v) => runOp(() => ops.setJoin(graph, item.id, v), 'flow:arm', { keepPanel: true }),
            });
        }
        return out;
    }

    function onPanelChange(stepId, key, value) {
        if (!editable()) return;
        if (stepId === null) {
            if (!settings) return;
            const next = { ...(settings.value || {}) };
            if (value === undefined) delete next[key]; else next[key] = value;
            settings.value = next;
            commit('flow:settings', `settings:${key}`);
            refreshFlowRow();
            return;
        }
        const node = nodeOf(stepId);
        if (!node) return;
        const config = { ...(node.config || {}) };
        if (value === undefined) delete config[key]; else config[key] = value;
        node.config = config;
        refreshRow(stepId);
        commit('flow:step:config', `config:${stepId}:${key}`);
    }

    function onRename(stepId, label) {
        if (!editable() || stepId === null) return;
        const node = nodeOf(stepId);
        if (!node) return;
        if (label) node.label = label; else delete node.label;
        refreshRow(stepId);
        commit('flow:step:label', `label:${stepId}`);
    }

    /** Redraw one row's words in place — no other row is rebuilt, the panel is left alone. */
    function swapRow(li, newRow, label) {
        const oldRow = li.querySelector(':scope > .twm-flow-outline__row');
        for (const g of oldRow.querySelectorAll(':scope > .twm-flow-outline__gap')) newRow.appendChild(g);
        for (const g of gapEls) if (g.row === oldRow) g.row = newRow;
        oldRow.replaceWith(newRow);
        if (label) li.setAttribute('aria-label', label);
        applySelection();
    }

    function refreshRow(id) {
        const li = itemEls.get(id);
        if (!li) return;
        const item = view?.index.at.get(id)?.item ?? { kind: 'step', id, arms: [] };
        const { row, label } = stepRow(item, Number(li.getAttribute('aria-level')) - 1, findFilter());
        swapRow(li, row, label);
    }

    function refreshFlowRow() {
        const li = itemEls.get('flow');
        if (!li) return;
        const fresh = flowItem(findFilter());
        itemEls.set('flow', li);
        swapRow(li, fresh.querySelector(':scope > .twm-flow-outline__row'), fresh.getAttribute('aria-label'));
    }

    function drawAside() {
        aside.replaceChildren();
        if (selected !== 'flow' && selected !== null && nodeOf(selected)) {
            if (typeof slots.stepPanel === 'function') slots.stepPanel(aside, nodeOf(selected));
        } else if (typeof slots.flowPanel === 'function') {
            slots.flowPanel(aside);
        }
        aside.hidden = aside.childNodes.length === 0;
    }

    function drawRunBanner() {
        runBanner.replaceChildren();
        const text = overlay?.banner;
        runBanner.hidden = !text;
        if (text) runBanner.append(icon('info', 'twm-flow-outline__banner-icon'), el('span', 'twm-flow-outline__banner-text', text));
    }

    // ── operations ─────────────────────────────────────────────────────
    function apply(result, action, { keepPanel = false } = {}) {
        if (!result || !result.ok) {
            announce(result?.reason || '');
            return false;
        }
        announce('');
        graph = result.graph;
        reread();
        if (result.select && nodeOf(result.select) && !keepPanel) selected = result.select;
        const held = tree.contains(root.ownerDocument.activeElement);
        render();
        showPanel();
        drawAside();
        commit(action);
        if (held) focusSelected();
        return true;
    }

    function runOp(fn, action, opts = {}) {
        if (!editable()) { announce(roReason()); return false; }
        return apply(fn(), action, opts);
    }

    function insertAt(seq, index, entry) {
        const anchor = ops.anchorOf(seq, index);
        if (entry.paste) return runOp(() => ops.paste(graph, anchor, CLIPBOARD), 'flow:step:paste');
        return runOp(() => ops.insert(graph, anchor, entry.id), 'flow:step:add');
    }

    function entriesFor(dryRun) {
        const order = { branch: 0, loop: 1, fanout: 2, step: 3, end: 4 };
        const types = catalogue.list().filter((t) => !['start', 'join'].includes(map.kindOf(t.type_id)));
        const cats = catalogue.categories.map((c) => c.id);
        types.sort((a, b) => (cats.indexOf(a.category ?? '') - cats.indexOf(b.category ?? ''))
            || (order[map.kindOf(a.type_id)] - order[map.kindOf(b.type_id)]) || String(a.label).localeCompare(String(b.label)));
        return types.map((t) => {
            const words = map.entryFor(t.type_id);
            const r = dryRun(t.type_id);
            return { id: t.type_id, label: words.label, sub: words.sub, description: words.description, icon: t.icon,
                     tone: catalogue.tone(t.type_id), category: t.category ?? '', refusal: r.ok ? null : r.reason };
        });
    }

    async function openPicker(anchor, seq, index) {
        if (!editable() || !view) return;
        const a = ops.anchorOf(seq, index);
        const pasteOk = CLIPBOARD ? ops.paste(graph, a, CLIPBOARD).ok : false;
        const picked = await openStepPicker({
            anchor, strings: S, categories: catalogue.categories, where: ops.gapWords(view, seq, index),
            paste: pasteOk ? { label: say(S, 'pasteStep') } : null,
            entries: entriesFor((typeId) => ops.insert(graph, a, typeId)),
        });
        if (!picked || destroyed) return;
        insertAt(seq, index, picked.paste ? { paste: true } : picked.entry);
    }

    async function openBranchPicker(anchor, fanoutId) {
        if (!editable() || !view) return;
        const picked = await openStepPicker({
            anchor, strings: S, categories: catalogue.categories, title: map.fanoutAddArm(nodeOf(fanoutId)),
            where: say(S, 'insidePath', nameOf(fanoutId)),
            entries: entriesFor((typeId) => ops.addBranch(graph, fanoutId, typeId)),
        });
        if (!picked?.entry || destroyed) return;
        runOp(() => ops.addBranch(graph, fanoutId, picked.entry.id), 'flow:branch:add');
    }

    function blockEntries() {
        return catalogue.list().filter((t) => ['branch', 'loop', 'fanout'].includes(map.kindOf(t.type_id)) && !t.unavailable);
    }

    function openMenu(id, anchor) {
        if (!view) return;
        const can = editable();
        const ro = can ? null : (roReason() || say(S, 'readOnlyRefusal'));
        const why = (r) => (ro ?? (r.ok ? null : r.reason));
        const place = view.index.at.get(id);
        const owner = place?.owner;
        const up = can ? ops.moveUp(graph, id) : null;
        const down = can ? ops.moveDown(graph, id) : null;
        const out = can ? ops.moveOut(graph, id) : null;
        const dup = can ? ops.duplicate(graph, id) : null;
        const paste = can ? (CLIPBOARD ? ops.paste(graph, { after: id }, CLIPBOARD) : { ok: false, reason: say(S, 'nothingCopied') }) : null;
        const remove = can ? ops.remove(graph, id) : null;
        const wraps = blockEntries().map((t) => {
            const r = can ? ops.wrap(graph, id, t.type_id) : null;
            return { id: `wrap:${t.type_id}`, label: map.entryFor(t.type_id).label, icon: t.icon, tone: catalogue.tone(t.type_id),
                     refusal: ro ?? (r.ok ? null : r.reason),
                     run: () => runOp(() => ops.wrap(graph, id, t.type_id), 'flow:step:wrap') };
        });
        const outLabel = owner && owner.kind !== 'start' ? say(S, 'moveOut', nameOf(owner.id)) : say(S, 'moveOutTop');
        openStepMenu({
            anchor, label: nameOf(id), strings: S,
            items: [
                { id: 'up', label: say(S, 'moveUp'), keys: say(S, 'keyMoveUp'), refusal: ro ?? (up.ok ? null : up.reason),
                  run: () => runOp(() => ops.moveUp(graph, id), 'flow:step:move') },
                { id: 'down', label: say(S, 'moveDown'), keys: say(S, 'keyMoveDown'), refusal: ro ?? (down.ok ? null : down.reason),
                  run: () => runOp(() => ops.moveDown(graph, id), 'flow:step:move') },
                { id: 'out', label: outLabel, keys: say(S, 'keyMoveOut'), refusal: ro ?? (out.ok ? null : out.reason),
                  run: () => runOp(() => ops.moveOut(graph, id), 'flow:step:move') },
                { id: 'wrap', label: say(S, 'wrapIn'), items: wraps, refusal: wraps.every((w) => w.refusal) ? (ro ?? wraps[0]?.refusal ?? null) : null },
                { separator: true },
                { id: 'duplicate', label: say(S, 'duplicate'), keys: say(S, 'keyDuplicate'), refusal: dup ? why(dup) : ro,
                  run: () => runOp(() => ops.duplicate(graph, id), 'flow:step:duplicate') },
                { id: 'copy', label: say(S, 'copy'), keys: say(S, 'keyCopy'), run: () => copy(id) },
                { id: 'cut', label: say(S, 'cut'), keys: say(S, 'keyCut'), refusal: remove ? why(remove) : ro, run: () => cut(id) },
                { id: 'paste', label: say(S, 'pasteAfter'), keys: say(S, 'keyPaste'), refusal: paste ? why(paste) : ro,
                  run: () => runOp(() => ops.paste(graph, { after: id }, CLIPBOARD), 'flow:step:paste') },
                { separator: true },
                { id: 'rename', label: say(S, 'rename'), keys: say(S, 'renameKey'), refusal: ro, run: () => rename(id) },
                { separator: true },
                { id: 'remove', label: say(S, 'removeStep'), keys: say(S, 'keyRemove'), danger: true,
                  refusal: remove ? why(remove) : ro, run: () => runOp(() => ops.remove(graph, id), 'flow:step:remove') },
            ],
        });
    }

    function copy(id) {
        const c = ops.copy(graph, id);
        if (c) CLIPBOARD = c;
        return Boolean(c);
    }

    function cut(id) {
        if (!editable()) return false;
        const c = ops.copy(graph, id);
        const r = ops.remove(graph, id);
        if (!c || !r.ok) { announce(r.reason); return false; }
        CLIPBOARD = c;
        return apply(r, 'flow:step:remove');
    }

    function rename(id) {
        select(id);
        const input = settingsHost.querySelector('[data-twm-flow-title]');
        if (input) { input.focus({ preventScroll: true }); input.select?.(); }
    }

    /** Unfold the blocks around a step; true when one was folded. */
    function reveal(id) {
        let unfolded = false;
        for (const step of view?.index.at.get(id)?.path || []) if (folds.delete(step.owner.id)) unfolded = true;
        if (unfolded) onFoldChange?.([...folds]);
        return unfolded;
    }

    function goTo(f) {
        const id = f?.node_id && nodeOf(f.node_id) ? f.node_id : 'flow';
        if (reveal(id)) render();
        select(id, { focus: true });
        if (f?.field) panel.focusField(f.field);
    }

    // ── folding ────────────────────────────────────────────────────────
    function setFolds(ids) {
        folds.clear();
        for (const id of ids) folds.add(id);
        onFoldChange?.([...folds]);
        render();
    }

    function toggleFold(id) {
        if (folds.has(id)) folds.delete(id); else folds.add(id);
        onFoldChange?.([...folds]);
        render();
        itemEls.get(id)?.focus({ preventScroll: true });
    }

    // ── keys ───────────────────────────────────────────────────────────
    const inTree = (ev) => tree.contains(ev.target);
    const stepSelected = () => (selected !== 'flow' && selected !== null && nodeOf(selected) && view ? selected : null);
    /** A step verb from the tree: taken (its key prevented) whether it succeeds or is refused. */
    const onStep = (ev, fn) => {
        if (!inTree(ev) || !stepSelected()) return false;
        fn();
        return undefined;
    };
    const unbind = bindFlowKeys(root, {
        undo: () => { api.undo(); },
        redo: () => { api.redo(); },
        up: (ev) => (inTree(ev) ? moveSelection(-1) : false),
        down: (ev) => (inTree(ev) ? moveSelection(1) : false),
        left: (ev) => (inTree(ev) ? leftKey() : false),
        right: (ev) => (inTree(ev) ? rightKey() : false),
        open: (ev) => {
            if (!inTree(ev) || ev.target.closest('button')) return false;
            const f = settingsHost.querySelector('.twm-flow-panel__fields input, .twm-flow-panel__fields select, '
                + '.twm-flow-panel__fields textarea, .twm-flow-panel__fields [contenteditable="true"], .twm-flow-panel__fields button')
                || settingsHost.querySelector('[data-twm-flow-title]');
            f?.focus({ preventScroll: false });
            return Boolean(f);
        },
        remove: (ev) => onStep(ev, () => runOp(() => ops.remove(graph, selected), 'flow:step:remove')),
        duplicate: (ev) => onStep(ev, () => runOp(() => ops.duplicate(graph, selected), 'flow:step:duplicate')),
        copy: (ev) => onStep(ev, () => copy(selected)),
        cut: (ev) => onStep(ev, () => cut(selected)),
        paste: (ev) => {
            if (!inTree(ev) || !view) return false;
            if (!CLIPBOARD) { announce(say(S, 'nothingCopied')); return undefined; }
            const anchor = stepSelected() ? { after: selected } : { into: 'top' };
            runOp(() => ops.paste(graph, anchor, CLIPBOARD), 'flow:step:paste');
            return undefined;
        },
        rename: (ev) => onStep(ev, () => rename(selected)),
        moveUp: (ev) => onStep(ev, () => runOp(() => ops.moveUp(graph, selected), 'flow:step:move')),
        moveDown: (ev) => onStep(ev, () => runOp(() => ops.moveDown(graph, selected), 'flow:step:move')),
        moveOut: (ev) => onStep(ev, () => runOp(() => ops.moveOut(graph, selected), 'flow:step:move')),
        escape: () => {
            if (drag) { endDrag(false); return undefined; }
            return false;
        },
    });
    tree.addEventListener('keydown', (ev) => {
        if ((ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) && stepSelected()) {
            ev.preventDefault();
            const m = itemEls.get(selected)?.querySelector(':scope > .twm-flow-outline__row .twm-flow-outline__menu');
            if (m) openMenu(selected, m);
        }
    });
    const pressDoc = root.ownerDocument;
    root.addEventListener('pointerdown', onPressStart, true);
    pressDoc.addEventListener('pointerup', onPressEnd, true);
    pressDoc.addEventListener('pointercancel', onPressEnd, true);
    pressDoc.defaultView?.addEventListener('blur', onPressEnd);

    function moveSelection(step) {
        const items = visibleItems();
        const cur = items.indexOf(itemEls.get(selected) ?? itemEls.get('flow'));
        const next = items[Math.max(0, Math.min(items.length - 1, cur + step))];
        if (next) select(next.dataset.step || 'flow', { focus: true });
        return undefined;
    }

    function leftKey() {
        const li = itemEls.get(selected);
        if (!li) return false;
        if (li.getAttribute('aria-expanded') === 'true') { toggleFold(selected); return undefined; }
        const parent = li.parentElement?.closest('[role="treeitem"]');
        if (parent) select(parent.dataset.step || 'flow', { focus: true });
        return undefined;
    }

    function rightKey() {
        const li = itemEls.get(selected);
        if (!li) return false;
        if (li.getAttribute('aria-expanded') === 'false') { toggleFold(selected); return undefined; }
        if (li.getAttribute('aria-expanded') === 'true') {
            const child = li.querySelector('.twm-flow-outline__inside [role="treeitem"]');
            if (child) select(child.dataset.step, { focus: true });
        }
        return undefined;
    }

    // ── the grip drag ──────────────────────────────────────────────────
    function armDrag(ev, id) {
        if (ev.button !== 0 || !editable() || !view) return;
        ev.preventDefault();
        ev.stopPropagation();
        endDrag(false);
        drag = { id, x: ev.clientX, y: ev.clientY, started: false, ghost: null, line: null, target: null, cache: new Map() };
        const doc = root.ownerDocument;
        doc.addEventListener('pointermove', onDragMove, true);
        doc.addEventListener('pointerup', onDragUp, true);
        doc.addEventListener('pointercancel', onDragCancel, true);
        doc.addEventListener('keydown', onDragKey, true);
        root.ownerDocument.defaultView?.addEventListener('blur', onDragCancel);
    }

    function startDrag() {
        const id = drag.id;
        const ghost = el('div', 'twm-flow-outline__ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.appendChild(icon('drag_indicator', 'twm-flow-outline__ghost-grip'));
        const chip = el('span', `twm-flow-outline__chip ${toneClass('twm-flow-outline__chip', catalogue.tone(nodeOf(id)?.type))}`);
        chip.appendChild(icon(typeOf(id)?.icon || ''));
        ghost.append(chip, el('span', 'twm-flow-outline__ghost-title', nameOf(id)));
        root.ownerDocument.body.appendChild(ghost);
        const line = el('div', 'twm-flow-outline__drop');
        line.setAttribute('aria-hidden', 'true');
        line.appendChild(el('span', 'twm-flow-outline__drop-label'));
        line.hidden = true;
        tree.appendChild(line);
        drag.ghost = ghost;
        drag.line = line;
        drag.started = true;
        root.classList.add('twm-flow-outline--dragging');
        itemEls.get(id)?.querySelector(':scope > .twm-flow-outline__row')?.classList.add('twm-flow-outline__row--dragging');
        drag.targets = dropTargets(id);
    }

    /** Every place the dragged step could go: each "+" place, but not inside itself or where it already is. */
    function dropTargets(id) {
        const item = view.index.at.get(id)?.item;
        const inside = new Set(item ? subtreeIds(item) : [id]);
        const place = view.index.at.get(id);
        const out = [];
        for (const g of collectGaps()) {
            // A place inside a folded block is not on the screen to be dropped on.
            if (g.row.closest('[hidden]')) continue;
            const owner = view.index.seqs.find((x) => x.seq === g.seq)?.owner;
            if (owner && inside.has(owner.id)) continue;
            if (g.seq === place?.seq && (g.index === place.index || g.index === place.index + 1)) continue;
            out.push(g);
        }
        return out;
    }

    /** Every gap position in the drawn outline, with the row it sits under (drawn or not — a gap button is only drawn where "+" is offered). */
    function collectGaps() {
        return gapEls.map((g) => ({ ...g }));
    }

    function onDragMove(ev) {
        if (!drag) return;
        if (!drag.started) {
            if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < DRAG_START_PX) return;
            startDrag();
        }
        ev.preventDefault();
        // Below the pointer: the drop line and its words are drawn AT the
        // pointer, and a ghost over them would hide the one thing to read.
        drag.ghost.style.left = `${Math.round(ev.clientX + 12)}px`;
        drag.ghost.style.top = `${Math.round(ev.clientY + 28)}px`;
        autoScroll(ev);
        pickTarget(ev);
    }

    /** Near an edge of whatever scrolls the list — its own box, or, wrapped in a narrow editor, the body. */
    function autoScroll(ev) {
        const box = scroller.scrollHeight > scroller.clientHeight ? scroller : body;
        const r = box.getBoundingClientRect();
        if (!r.height) return;
        if (ev.clientY < r.top + 24) box.scrollTop -= 12;
        else if (ev.clientY > r.bottom - 24) box.scrollTop += 12;
    }

    function pickTarget(ev) {
        let best = null;
        let bestScore = Infinity;
        for (const t of drag.targets) {
            const r = t.row.getBoundingClientRect();
            const y = r.bottom;
            const x = r.left + 8 + t.depth * OUTLINE_INDENT;
            const score = Math.abs(ev.clientY - y) * 4 + Math.abs(ev.clientX - x);
            if (score < bestScore) { bestScore = score; best = t; }
        }
        drag.target = best;
        if (!best) { drag.line.hidden = true; return; }
        const key = JSON.stringify(ops.anchorOf(best.seq, best.index));
        if (!drag.cache.has(key)) drag.cache.set(key, ops.move(graph, drag.id, JSON.parse(key)));
        const verdict = drag.cache.get(key);
        const tr = tree.getBoundingClientRect();
        const rr = best.row.getBoundingClientRect();
        drag.line.hidden = false;
        drag.line.style.top = `${Math.round(rr.bottom - tr.top)}px`;
        drag.line.style.setProperty('--twm-outline-depth', String(best.depth));
        drag.line.classList.toggle('twm-flow-outline__drop--refused', !verdict.ok);
        drag.line.firstChild.textContent = verdict.ok ? ops.dropWords(view, best.seq, best.index) : verdict.reason;
    }

    function onDragUp(ev) {
        if (!drag) return;
        const wasDrag = drag.started;
        if (wasDrag) { ev.preventDefault(); ev.stopPropagation(); }
        endDrag(wasDrag);
    }

    function onDragCancel() { endDrag(false); }

    function onDragKey(ev) {
        if (ev.key === 'Escape' && drag) {
            ev.preventDefault();
            ev.stopPropagation();
            endDrag(false);
        }
    }

    function endDrag(drop) {
        if (!drag) return;
        const d = drag;
        drag = null;
        const doc = root.ownerDocument;
        doc.removeEventListener('pointermove', onDragMove, true);
        doc.removeEventListener('pointerup', onDragUp, true);
        doc.removeEventListener('pointercancel', onDragCancel, true);
        doc.removeEventListener('keydown', onDragKey, true);
        doc.defaultView?.removeEventListener('blur', onDragCancel);
        d.ghost?.remove();
        d.line?.remove();
        root.classList.remove('twm-flow-outline--dragging');
        tree.querySelector('.twm-flow-outline__row--dragging')?.classList.remove('twm-flow-outline__row--dragging');
        if (!drop || !d.started) return;
        // The release that drops also makes a click, on whatever is under it now.
        const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
        doc.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => doc.removeEventListener('click', swallow, true), 0);
        if (!d.target) { announce(say(S, 'dropNowhere')); return; }
        const key = JSON.stringify(ops.anchorOf(d.target.seq, d.target.index));
        const verdict = d.cache.get(key) ?? ops.move(graph, d.id, JSON.parse(key));
        apply(verdict, 'flow:step:move');
    }

    // ── the API ────────────────────────────────────────────────────────
    const api = {
        el: root,
        get history() { return history; },
        get selection() { return selected === 'flow' ? { kind: 'flow', id: null } : { kind: 'step', id: selected }; },

        /** Replace the content; a baseline clears both undo stacks. */
        load({ graph: g = null, flowSettings: fs = null } = {}, { baseline = true } = {}) {
            graph = g && typeof g === 'object' ? structuredClone(g) : emptyGraph();
            if (!Array.isArray(graph.nodes)) graph.nodes = [];
            if (!Array.isArray(graph.connections)) graph.connections = [];
            if (fs) settings = { ...(settings || {}), ...fs, value: structuredClone(fs.value ?? settings?.value ?? {}) };
            reread();
            if (selected !== 'flow' && !nodeOf(selected)) selected = 'flow';
            render();
            showPanel();
            drawAside();
            if (baseline) history.baseline(stateText());
            updateTools();
        },
        /** The current graph, as the consumer's own shape (a copy). */
        getGraph() { return structuredClone(graph); },
        /** Its byte-stable text (`serialise`). */
        serialise() { return serialise(graph); },
        /** The flow's own settings, or null. */
        getFlowSettings() { return settings ? structuredClone(settings.value) : null; },
        /** The outline as text (`describeOutline`), or null when the graph is not block-shaped. */
        describe() { return view ? describeOutline(view.tree) : null; },
        /** Why the graph cannot be drawn as an outline, or null. */
        get refusal() { return refusal ? { ...refusal } : null; },

        setFindings(list) {
            findings = findingsList(list);
            strip.set(findings);
            panel.setFindings(findings);
            renderSoon();
        },
        setRunOverlay(o) {
            overlay = o && typeof o === 'object' ? o : null;
            // A run's rows say the step and how it went; the type steps aside (the Run mock).
            root.classList.toggle('twm-flow-outline--run', Boolean(overlay));
            offArm.clear();
            renderSoon();
            drawAside();
        },
        setReadOnly(next) {
            consumerRO = next || false;
            drawReadOnly();
            renderSoon();
            showPanel();
        },
        setActionState(id, state = {}) {
            actionState.set(id, { ...(actionState.get(id) || {}), ...state });
            updateTools();
        },
        setStatus(text) { statusEl.textContent = text ?? ''; },
        /** Select a step (unfolding the blocks around it, so it is on the screen), the flow, or nothing. */
        select(id) {
            const want = id === null || id === undefined ? 'flow' : id;
            if (want !== 'flow' && reveal(want)) render();
            select(want);
        },
        focus() { focusSelected(); },
        undo() { if (editable() && history.undo()) emit('undo'); },
        redo() { if (editable() && history.redo()) emit('redo'); },
        /** The folded blocks' ids. */
        get folds() { return [...folds]; },
        setFolds(ids) { setFolds(Array.isArray(ids) ? ids : []); },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            endDrag(false);
            closeFlowPopovers();
            unbind();
            root.removeEventListener('pointerdown', onPressStart, true);
            pressDoc.removeEventListener('pointerup', onPressEnd, true);
            pressDoc.removeEventListener('pointercancel', onPressEnd, true);
            pressDoc.defaultView?.removeEventListener('blur', onPressEnd);
            panel.destroy();
            strip.destroy();
            root.remove();
        },
    };

    if (options.graph) api.load({ graph: options.graph });
    else { updateTools(); showPanel(); }
    return api;
}
