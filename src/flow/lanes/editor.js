/**
 * THE LANE EDITOR — a data flow, drawn left to right (36 §7).
 *
 *     const editor = createLaneEditor(host, { catalogue, widgets, references, preview, describe, … });
 *     editor.load({ graph: pipeline });
 *
 * Every source starts a lane; a step follows the one before it; a join brings
 * another lane in from below, and that line is drawn for you. Cards sit where
 * the layout puts them (`layout.js`): NOTHING IS DRAGGED AND NO LINE IS DRAWN
 * BY HAND. A step is added with the "+" on a card's right tip (spliced between
 * the card and what it led to) or with *Add a source*, which starts a new
 * lane; a join's other lanes are SETTINGS (*Joined with*), never lines.
 *
 * Under the lanes: a tab per step, and the dock — the kit's settings panel on
 * the left, and on the right what the step gives: **Preview**, **Columns** and,
 * for a sink, **Would be rejected**, from the consumer's providers (debounced,
 * the newest answer winning: `preview.js`). A toolbar toggle, **Steps show:
 * The preview | The last run**, picks what a card's status line says.
 *
 * ══ IT NEVER FETCHES, SAVES OR DECIDES ═════════════════════════════════
 *
 * The step types, every finding, the preview's rows, the columns, the last
 * run and every byte of I/O are the consumer's. An edit is reported to
 * `onChange` with the serialised flow, and the consumer saves it. The one
 * timer is the preview's debounce, and it only ASKS.
 *
 * ══ NO PRESS REBUILDS A CARD ═══════════════════════════════════════════
 *
 * A click lands only on the node its press went down on, so choosing a card
 * toggles classes and attributes and rebuilds nothing; the lanes are rebuilt
 * only after an edit that changes their shape, and focus is put back on the
 * same step's card (or "+") when they are.
 *
 * ══ KEYS ═══════════════════════════════════════════════════════════════
 *
 * The kit's (`bindFlowKeys`, on the editor's root): ← → ↑ ↓ move between cards
 * (and between the step tabs), Enter opens the step's settings, Delete removes
 * it, F2 renames it, Ctrl/⌘+Z and Ctrl/⌘+Y undo and redo, Escape goes back
 * from the settings to the card. The context-menu key (or Shift+F10) opens a
 * card's menu. Backspace is never the editor's: a host may climb a level on it.
 */

import { createStrings, say } from '../kit/strings.js';
import { button, closeFlowPopovers, el, icon, openPopover, toneOf, uid } from '../kit/dom.js';
import { createStepCatalogue } from '../kit/catalogue.js';
import { fieldsFromSchema } from '../kit/settings_schema.js';
import { createWidgetRegistry } from '../kit/widgets.js';
import { createSettingsPanel } from '../kit/settings_panel.js';
import { openStepPicker } from '../kit/step_picker.js';
import { createFindingsStrip, findingsList, groupFindings } from '../kit/findings.js';
import { FlowHistory } from '../kit/history.js';
import { bindFlowKeys } from '../kit/keys.js';
import { DataTable } from '../../ui/components/data_table.js';
import { layoutLanes, placeLanes, stepPorts } from './layout.js';
import {
    LANE_ACTIONS, PARAMETER_NAME, addSource, addStepAfter, emptyPipeline, inputCandidates, inputOf, laneFeedOf,
    normalisePipeline, portsOf, removeParameter, removeStep, serialisePipeline, setInput, setParameter, upstreamOf,
} from './pipeline.js';
import { createPreviewRunner } from './preview.js';
import { LANE_STRINGS } from './strings.js';

const SVG = 'http://www.w3.org/2000/svg';
const ROLES = ['source', 'transform', 'operation', 'sink'];
const LINE_TONES = ['ok', 'warning', 'error', 'muted', 'info'];
/** A run overlay's `state`, as a status line's tone, when the overlay names none. */
const RUN_TONES = Object.freeze({ success: 'ok', cached: 'muted', error: 'error', skipped: 'muted',
                                  cancelled: 'muted', running: 'info' });
const PARAMETER_TYPES = Object.freeze(['text', 'number', 'integer', 'boolean', 'date']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const lineTone = (t) => (t === 'warn' ? 'warning' : LINE_TONES.includes(t) ? t : 'muted');

function sortedKeys(value) {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys(value[k])]));
    return value;
}

/**
 * @param {HTMLElement} host
 * @param {object} options   36 §3.14 and §7; the README's lane-editor section lists every one
 */
export function createLaneEditor(host, options = {}) {
    if (!host) throw new Error('createLaneEditor needs a host element.');
    const S = createStrings(LANE_STRINGS, options.strings);
    const compact = Boolean(options.compact);
    const size = compact ? (options.compact?.size === 'small' ? 'small' : 'strip')
        : (options.size === 'small' ? 'small' : 'regular');
    const catalogue = Array.isArray(options.catalogue)
        ? createStepCatalogue(options.catalogue, { categories: options.categories })
        : options.catalogue;
    if (!catalogue?.get) throw new Error('createLaneEditor needs a step catalogue (createStepCatalogue()).');
    const widgets = options.widgets ?? createWidgetRegistry();
    const references = options.references ?? {};
    const slots = options.slots ?? {};
    const showTabs = !compact && options.stepTabs !== false;
    const showParams = !compact && options.parameters !== false;
    const parameterTypes = (Array.isArray(options.parameterTypes) && options.parameterTypes.length
        ? options.parameterTypes : PARAMETER_TYPES).map((t) => (isObject(t) ? { id: String(t.id), label: t.label ?? String(t.id) }
        : { id: String(t), label: String(t) }));
    const delayMs = Number.isFinite(options.previewDelayMs) ? options.previewDelayMs : 800;

    // ── state ────────────────────────────────────────────────────────────
    let pipeline = emptyPipeline();
    let flowSchema = isObject(options.flowSettings?.schema) ? options.flowSettings.schema : null;
    let flowValue = isObject(options.flowSettings?.value) ? clone(options.flowSettings.value) : (flowSchema ? {} : null);
    let layout = layoutLanes(pipeline, catalogue);
    let placed = placeLanes(layout, size);
    let selected = null;            // a step id, 'flow' or null
    let readOnlyOpt = options.readOnly || false;
    let findings = [];
    let byNode = new Map();
    let runOverlay = null;
    let mode = 'preview';
    let previewNodes = {};
    let previewError = null;
    let describeNodes = {};
    let previewState = { enabled: false, waiting: false, busy: false };
    let dockTab = 'preview';
    let table = null;
    let lastRunAsk = null;
    let destroyed = false;
    let travelling = null;          // 'undo' | 'redo' while a history step is applied
    let shownColumns = '';          // the selected step's input columns the panel was drawn with
    let panelReadOnly = false;      // what the panel was last told

    const node = (id) => pipeline.nodes.find((n) => n.id === id) ?? null;
    const typeOf = (n) => catalogue.get(n?.type) ?? null;
    const typeLabel = (n) => typeOf(n)?.label ?? String(n?.type ?? '');
    const titleOf = (id) => {
        const n = node(id);
        return n ? (n.label || typeLabel(n)) : String(id);
    };
    const roleOf = (n) => {
        const r = typeOf(n)?.role;
        return ROLES.includes(r) ? r : 'transform';
    };
    const problems = () => layout.problems;
    const isReadOnly = () => compact || Boolean(readOnlyOpt) || problems().length > 0;
    const readOnlyReason = () => {
        const lines = [];
        if (readOnlyOpt && typeof readOnlyOpt === 'object' && readOnlyOpt.reason) lines.push(String(readOnlyOpt.reason));
        for (const p of problems()) lines.push(p.message);
        if (!lines.length && readOnlyOpt) lines.push(say(S, 'readOnlyTitle'));
        return lines;
    };
    /** Every step, left to right: by column, then by lane. */
    const stepOrder = () => placed.cards.slice().sort((a, b) => (a.column - b.column) || (a.lane - b.lane))
        .map((c) => c.id);

    // ── the DOM ──────────────────────────────────────────────────────────
    const root = el('div', `twm-flow-lanes twm-flow-lanes--${size}${compact ? ' twm-flow-lanes--compact' : ''}`
        + `${options.height === 'auto' ? ' twm-flow-lanes--auto' : ''}`);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', options.label ?? say(S, 'lanesLabel'));

    const banner = el('div', 'twm-flow-lanes__readonly');
    banner.setAttribute('role', 'status');
    banner.hidden = true;

    // The toolbar: Undo, Redo, the consumer's verbs, the status, Steps show.
    let toolbar = null;
    let undoBtn = null;
    let redoBtn = null;
    let statusEl = null;
    let showPreviewBtn = null;
    let showRunBtn = null;
    const actionButtons = new Map();
    if (!compact) {
        toolbar = el('div', 'twm-flow-lanes__toolbar');
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', say(S, 'toolbar'));
        if (typeof slots.toolbarStart === 'function') {
            const box = el('div', 'twm-flow-lanes__toolbar-slot');
            slots.toolbarStart(box);
            toolbar.appendChild(box);
        }
        undoBtn = button({ label: say(S, 'undo'), icon: 'undo', title: say(S, 'undoTitle'), onClick: () => undo() });
        redoBtn = button({ label: say(S, 'redo'), icon: 'redo', title: say(S, 'redoTitle'), onClick: () => redo() });
        undoBtn.dataset.action = 'undo';
        redoBtn.dataset.action = 'redo';
        toolbar.append(undoBtn, redoBtn);
        const verbs = Array.isArray(options.actions) ? options.actions : [];
        if (verbs.length) {
            const sep = el('span', 'twm-flow-lanes__toolbar-sep');
            sep.setAttribute('aria-hidden', 'true');
            toolbar.appendChild(sep);
            const box = el('div', 'twm-flow-lanes__actions');
            for (const a of verbs) {
                const wrap = el('span', 'twm-flow-lanes__action');
                const b = button({ label: a.label ?? a.id, icon: a.icon || null, primary: Boolean(a.primary),
                                   onClick: () => { if (!b.disabled) a.run?.({ editor: api }); } });
                b.dataset.action = String(a.id);
                const why = el('span', 'twm-flow-lanes__refusal');
                why.hidden = true;
                wrap.append(b, why);
                box.appendChild(wrap);
                actionButtons.set(String(a.id), { wrap, b, why });
            }
            toolbar.appendChild(box);
        }
        statusEl = el('span', 'twm-flow-lanes__status');
        statusEl.setAttribute('aria-live', 'polite');
        toolbar.appendChild(statusEl);
        toolbar.appendChild(el('span', 'twm-flow-lanes__spacer'));
        const showId = uid('lanes-show');
        const showLabel = el('span', 'twm-flow-lanes__show-label', say(S, 'stepsShow'));
        showLabel.id = showId;
        const show = el('div', 'twm-flow-lanes__show');
        show.setAttribute('role', 'group');
        show.setAttribute('aria-labelledby', showId);
        showPreviewBtn = el('button', 'twm-flow-lanes__show-btn', say(S, 'thePreview'));
        showRunBtn = el('button', 'twm-flow-lanes__show-btn', say(S, 'theLastRun'));
        for (const [b, m] of [[showPreviewBtn, 'preview'], [showRunBtn, 'run']]) {
            b.type = 'button';
            b.dataset.mode = m;
            b.addEventListener('click', () => setStepsShow(m));
            show.appendChild(b);
        }
        toolbar.append(showLabel, show);
        if (typeof slots.toolbarEnd === 'function') {
            const box = el('div', 'twm-flow-lanes__toolbar-slot');
            slots.toolbarEnd(box);
            toolbar.appendChild(box);
        }
    }

    const strip = compact ? null : createFindingsStrip({
        strings: S,
        nameOf: (id) => (id ? titleOf(id) : say(S, 'theFlow')),
        onGoTo: (f) => goTo(f),
    });

    const params = showParams ? el('div', 'twm-flow-lanes__params') : null;

    const flow = el('section', 'twm-flow-lanes__flow');
    flow.setAttribute('aria-label', say(S, 'lanesLabel'));
    const runBanner = el('p', 'twm-flow-lanes__banner');
    runBanner.hidden = true;
    const scroller = el('div', 'twm-flow-lanes__scroller');
    const surface = el('div', 'twm-flow-lanes__surface');
    scroller.appendChild(surface);
    const empty = el('p', 'twm-flow-lanes__empty', say(S, 'emptyFlow'));
    empty.hidden = true;
    flow.append(runBanner, scroller, empty);
    let addSourceBtn = null;
    if (!compact) {
        const foot = el('div', 'twm-flow-lanes__foot');
        addSourceBtn = el('button', 'twm-flow-lanes__add-source');
        addSourceBtn.type = 'button';
        addSourceBtn.setAttribute('aria-haspopup', 'dialog');
        addSourceBtn.append(icon('add'), el('span', '', say(S, 'addSource')));
        addSourceBtn.addEventListener('click', () => pickSource());
        foot.append(addSourceBtn, el('span', 'twm-flow-lanes__hint', say(S, 'addHint')));
        flow.appendChild(foot);
    }

    let tabs = null;
    let dock = null;
    let settingsCol = null;
    let settingsHint = null;
    let dataCol = null;
    let dataTabs = null;
    let dataState = null;
    let dataBody = null;
    let panel = null;
    const dockId = uid('lanes-dock');
    if (!compact) {
        if (showTabs) {
            tabs = el('div', 'twm-flow-lanes__tabs');
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', say(S, 'stepsLabel'));
        }
        dock = el('div', 'twm-flow-lanes__dock');
        dock.id = dockId;
        if (showTabs) dock.setAttribute('role', 'tabpanel');
        if (options.height === 'auto') dock.style.height = `${Number(options.dockHeight) || 360}px`;
        settingsCol = el('div', 'twm-flow-lanes__settings');
        settingsHint = el('p', 'twm-flow-lanes__settings-hint', say(S, 'chooseStep'));
        settingsHint.hidden = true;
        settingsCol.appendChild(settingsHint);
        dataCol = el('section', 'twm-flow-lanes__data');
        dataCol.setAttribute('aria-label', say(S, 'dataLabel'));
        dataTabs = el('div', 'twm-flow-lanes__datatabs');
        dataState = el('span', 'twm-flow-lanes__datastate');
        dataState.setAttribute('aria-live', 'polite');
        dataBody = el('div', 'twm-flow-lanes__databody');
        dataCol.append(dataTabs, dataBody);
        dock.append(settingsCol, dataCol);
        panel = createSettingsPanel({
            widgets, references, strings: S, services: options.services ?? null, readOnly: false,
            onChange: (stepId, key, value) => changeSetting(stepId, key, value),
            onRename: (stepId, label) => rename(stepId, label),
            onFocusLost: () => focusCard(selected),
            values: typeof options.values === 'function' ? (q) => options.values({
                pipeline: getGraph(), graph: getGraph(), stepId: q.stepId, field: q.field, key: q.key,
                upstream: q.stepId ? upstreamOf(pipeline, q.stepId) : [], parameters: clone(pipeline.parameters),
            }) : null,
            valuesNote: options.valuesNote ?? null,
            columns: (step) => (step ? inputColumns(step.id) : null),
            host: settingsCol,
        });
    }

    root.append(banner);
    if (toolbar) root.appendChild(toolbar);
    if (strip) root.appendChild(strip.el);
    if (params) root.appendChild(params);
    root.appendChild(flow);
    if (tabs) root.appendChild(tabs);
    if (dock) root.appendChild(dock);
    host.appendChild(root);

    // ── history ──────────────────────────────────────────────────────────
    const snapshot = () => JSON.stringify([serialisePipeline(pipeline), flowValue === null ? null : sortedKeys(flowValue)]);
    const history = new FlowHistory({
        actions: LANE_ACTIONS,
        restore: (state) => restore(state),
        onState: () => paintToolbar(),
        limit: options.history?.limit ?? 100,
        mergeMs: options.history?.mergeMs ?? 1000,
        ...(typeof options.history?.now === 'function' ? { now: options.history.now } : {}),
    });

    const runner = createPreviewRunner({
        preview: compact ? null : options.preview,
        describe: compact ? null : options.describe,
        delayMs,
        clock: options.clock ?? null,
        request: () => ({ pipeline: getGraph(), text: serialisePipeline(pipeline), parameters: clone(pipeline.parameters) }),
        onAnswer: ({ kind, answer }) => {
            if (kind === 'preview') {
                previewNodes = isObject(answer?.nodes) ? answer.nodes : {};
                previewError = null;
            } else {
                describeNodes = isObject(answer?.nodes) ? answer.nodes : {};
            }
            paintCards();
            paintDock();
            reshowForColumns();
        },
        onError: ({ kind, error }) => {
            if (error?.name === 'AbortError') return;
            if (kind === 'preview') previewError = String(error?.message || say(S, 'previewFailed'));
            paintDock();
        },
        onState: (s) => {
            previewState = s;
            paintDataState();
        },
    });
    previewState = runner.state;

    function report(action, key = null) {
        options.onChange?.({ graph: getGraph(), pipeline: getGraph(), flowSettings: flowValue === null ? null : clone(flowValue),
                             text: serialisePipeline(pipeline), action, key });
    }

    /** Record an edit already made to `pipeline`; false when nothing changed. */
    function commit(action, key = null, { preview = true } = {}) {
        const moved = history.commit(snapshot(), action, key);
        if (!moved) return false;
        report(action, key);
        if (preview) runner.schedule();
        return true;
    }

    function restore(state) {
        let text = null;
        let settings = null;
        try {
            [text, settings] = JSON.parse(state);
        } catch {
            return;
        }
        pipeline = normalisePipeline(JSON.parse(text));
        flowValue = settings === null ? null : settings;
        relayout();
        if (selected && selected !== 'flow' && !node(selected)) selected = firstStep();
        paintAll();
        runner.schedule();
        report(travelling ?? 'undo');
    }

    function undo() {
        if (isReadOnly() || !history.canUndo) return false;
        travelling = 'undo';
        try { return history.undo(); } finally { travelling = null; }
    }

    function redo() {
        if (isReadOnly() || !history.canRedo) return false;
        travelling = 'redo';
        try { return history.redo(); } finally { travelling = null; }
    }

    // ── layout and painting ──────────────────────────────────────────────
    function relayout() {
        layout = layoutLanes(pipeline, catalogue, { strings: options.strings });
        placed = placeLanes(layout, size);
        byNode = groupFindings(findings, { graph: pipeline });
    }

    function firstStep() {
        return stepOrder()[0] ?? null;
    }

    /** The step whose card is in the Tab order: the chosen one, else the first. */
    function rovingStep() {
        return selected && selected !== 'flow' && layout.at[selected] ? selected : firstStep();
    }

    function statusOf(id) {
        const fs = byNode.get(id) || [];
        if (fs.length) {
            const err = fs.find((f) => f.severity !== 'warning');
            return { text: String((err ?? fs[0]).message ?? ''), tone: err ? 'error' : 'warning' };
        }
        if (mode === 'run') {
            if (!runOverlay) return { text: say(S, 'noRun'), tone: 'muted' };
            const s = runOverlay.steps?.[id];
            if (!s) return { text: say(S, 'notRun'), tone: 'muted' };
            return { text: String(s.line ?? s.state ?? ''), tone: lineTone(s.tone ?? RUN_TONES[s.state]) };
        }
        if (!runner.enabled) return { text: '', tone: 'muted' };
        const n = previewNodes[id];
        if (!n) return { text: say(S, 'pending'), tone: 'muted' };
        if (n.status === 'error') return { text: String(n.error?.message || say(S, 'stepFailed')), tone: 'error' };
        if (n.status === 'skipped') return { text: say(S, 'skipped'), tone: 'muted' };
        const rejected = Array.isArray(n.rejects) ? n.rejects.length : 0;
        if (rejected) return { text: say(S, 'rejected', rejected), tone: 'warning' };
        if (n.rows !== undefined && n.rows !== null) return { text: say(S, 'rows', n.rows), tone: 'ok' };
        return { text: '', tone: 'muted' };
    }

    function subOf(n) {
        const type = typeOf(n);
        const line = typeof options.summarise === 'function' ? options.summarise(n, type) : typeLabel(n);
        const title = n.label || typeLabel(n);
        return line && line !== title ? String(line) : '';
    }

    function canAddAfter(id) {
        const n = node(id);
        if (!n || isReadOnly() || roleOf(n) === 'sink') return false;
        return stepPorts(catalogue, n, pipeline.connections).continuation !== null;
    }

    function heldInSurface() {
        const a = root.ownerDocument.activeElement;
        if (!a || !surface.contains(a)) return null;
        const holder = a.closest('[data-step]');
        if (!holder) return null;
        return { step: holder.dataset.step, add: a.classList.contains('twm-flow-lanes__add') };
    }

    function paintLanes() {
        const held = heldInSurface();
        surface.replaceChildren();
        surface.style.width = `${placed.width}px`;
        surface.style.height = `${placed.height}px`;
        empty.hidden = placed.cards.length > 0;
        scroller.hidden = placed.cards.length === 0;

        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('class', 'twm-flow-lanes__wires');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', String(placed.width));
        svg.setAttribute('height', String(placed.height));
        svg.setAttribute('viewBox', `0 0 ${placed.width} ${placed.height}`);
        for (const w of placed.wires) {
            const path = document.createElementNS(SVG, 'path');
            path.setAttribute('class', `twm-flow-lanes__wire${w.cycle ? ' twm-flow-lanes__wire--cycle' : ''}`);
            path.dataset.kind = w.kind;
            path.setAttribute('d', w.d);
            path.dataset.from = w.from;
            path.dataset.to = w.to;
            path.dataset.port = w.toPort;
            svg.appendChild(path);
        }
        for (const w of placed.wires) {
            if (!w.port) continue;
            const dot = document.createElementNS(SVG, 'circle');
            dot.setAttribute('class', 'twm-flow-lanes__port');
            dot.setAttribute('cx', String(w.port.x));
            dot.setAttribute('cy', String(w.port.y));
            dot.setAttribute('r', '5');
            dot.dataset.to = w.to;
            dot.dataset.port = w.toPort;
            svg.appendChild(dot);
        }

        const bands = placed.bands.map((b) => {
            const lane = el('div', `twm-flow-lanes__lane${b.unconnected ? ' twm-flow-lanes__lane--unconnected' : ''}`);
            lane.style.top = `${b.top}px`;
            lane.style.height = `${b.height}px`;
            lane.dataset.lane = String(b.index);
            const first = layout.lanes[b.index].steps[0]?.id;
            lane.setAttribute('role', 'group');
            lane.setAttribute('aria-label', say(S, b.unconnected ? 'laneNameUnconnected' : 'laneName', b.index + 1,
                                               first ? titleOf(first) : ''));
            if (b.unconnected && !compact) lane.appendChild(el('span', 'twm-flow-lanes__flag', say(S, 'notConnected')));
            return lane;
        });
        surface.append(...bands, svg);
        const roving = rovingStep();
        for (const c of placed.cards) {
            const n = node(c.id);
            if (!n) continue;
            bands[c.lane].appendChild(compact ? stripCard(n, c) : card(n, c, roving));
        }
        paintCards();
        if (held && !destroyed) {
            const target = surface.querySelector(`[data-step="${cssEscape(held.step)}"] ${held.add ? '.twm-flow-lanes__add' : '.twm-flow-lanes__card'}`)
                || surface.querySelector(`[data-step="${cssEscape(held.step)}"] .twm-flow-lanes__card`);
            if (target) target.focus({ preventScroll: true });
            else focusCard(selected);
        }
    }

    function card(n, c, roving) {
        const role = roleOf(n);
        const tone = toneOf(catalogue.tone(n.type));
        const wrap = el('div', `twm-flow-lanes__node twm-flow-lanes__node--${role} twm-flow-lanes__node--${tone}`);
        wrap.dataset.step = n.id;
        wrap.style.left = `${c.x}px`;
        wrap.style.top = `${c.y - placed.bands[c.lane].top}px`;
        const b = el('button', 'twm-flow-lanes__card');
        b.type = 'button';
        b.setAttribute('data-twm-flow-item', '');
        b.tabIndex = n.id === roving ? 0 : -1;
        const body = el('span', 'twm-flow-lanes__body');
        const glyph = el('span', 'twm-flow-lanes__icon');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.appendChild(icon(typeOf(n)?.icon || ''));
        const sep = el('span', 'twm-flow-lanes__sep');
        sep.setAttribute('aria-hidden', 'true');
        const text = el('span', 'twm-flow-lanes__text');
        text.append(el('span', 'twm-flow-lanes__title'), el('span', 'twm-flow-lanes__sub'), el('span', 'twm-flow-lanes__line'));
        body.append(glyph, sep, text);
        b.appendChild(body);
        b.addEventListener('click', () => select(n.id));
        b.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            select(n.id);
            openMenu(n.id, b);
        });
        wrap.appendChild(b);
        if (canAddAfter(n.id)) {
            const add = el('button', 'twm-flow-lanes__add');
            add.type = 'button';
            add.setAttribute('aria-haspopup', 'dialog');
            add.tabIndex = n.id === roving ? 0 : -1;
            add.appendChild(icon('add'));
            add.addEventListener('click', () => pickAfter(n.id, add));
            wrap.appendChild(add);
        }
        return wrap;
    }

    function stripCard(n, c) {
        const role = roleOf(n);
        const tone = toneOf(catalogue.tone(n.type));
        const wrap = el('div', `twm-flow-lanes__node twm-flow-lanes__node--${role} twm-flow-lanes__node--${tone}`);
        wrap.dataset.step = n.id;
        wrap.style.left = `${c.x}px`;
        wrap.style.top = `${c.y - placed.bands[c.lane].top}px`;
        wrap.setAttribute('role', 'img');
        const body = el('span', 'twm-flow-lanes__body');
        const text = el('span', 'twm-flow-lanes__text');
        text.append(el('span', 'twm-flow-lanes__title'), el('span', 'twm-flow-lanes__line'));
        body.appendChild(text);
        wrap.appendChild(body);
        return wrap;
    }

    /** Every card's words, status, selection and findings — IN PLACE, rebuilding nothing. */
    function paintCards() {
        const roving = rovingStep();
        for (const wrap of surface.querySelectorAll('.twm-flow-lanes__node')) {
            const id = wrap.dataset.step;
            const n = node(id);
            if (!n) continue;
            const title = n.label || typeLabel(n);
            const status = compact ? { text: '', tone: 'muted' } : statusOf(id);
            wrap.querySelector('.twm-flow-lanes__title').textContent = title;
            const sub = wrap.querySelector('.twm-flow-lanes__sub');
            if (sub) {
                const s = subOf(n);
                sub.textContent = s;
                sub.hidden = !s;
            }
            const line = wrap.querySelector('.twm-flow-lanes__line');
            line.textContent = size === 'small' && !compact
                ? [typeLabel(n), status.text].filter(Boolean).join(' · ') : status.text;
            line.className = `twm-flow-lanes__line twm-flow-lanes__line--${status.tone}`;
            if (compact) line.hidden = !line.textContent;
            const fs = byNode.get(id) || [];
            wrap.classList.toggle('twm-flow-lanes__node--error', fs.some((f) => f.severity !== 'warning'));
            wrap.classList.toggle('twm-flow-lanes__node--warning', fs.length > 0 && fs.every((f) => f.severity === 'warning'));
            const on = id === selected;
            wrap.classList.toggle('twm-flow-lanes__node--selected', on);
            const label = say(S, 'cardLabel', typeLabel(n), title, status.text);
            if (compact) {
                wrap.setAttribute('aria-label', label);
                continue;
            }
            const b = wrap.querySelector('.twm-flow-lanes__card');
            b.setAttribute('aria-label', label);
            b.setAttribute('aria-current', on ? 'true' : 'false');
            b.tabIndex = id === roving ? 0 : -1;
            const add = wrap.querySelector('.twm-flow-lanes__add');
            if (add) {
                add.tabIndex = id === roving ? 0 : -1;
                add.setAttribute('aria-label', say(S, 'addAfter', title));
                add.title = say(S, 'addAfter', title);
            }
        }
    }

    function paintTabs() {
        if (!tabs) return;
        const focused = tabs.contains(root.ownerDocument.activeElement);
        tabs.replaceChildren();
        const make = (id, label, tone) => {
            const t = el('button', `twm-flow-lanes__tab twm-flow-lanes__tab--${tone}`);
            t.type = 'button';
            t.id = `${dockId}-tab-${id}`;
            t.setAttribute('role', 'tab');
            t.setAttribute('data-twm-flow-item', '');
            t.setAttribute('aria-controls', dockId);
            t.dataset.tab = id;
            const dot = el('span', 'twm-flow-lanes__tab-dot');
            dot.setAttribute('aria-hidden', 'true');
            t.append(dot, el('span', 'twm-flow-lanes__tab-label', label));
            t.addEventListener('click', () => select(id));
            tabs.appendChild(t);
        };
        if (flowSchema) make('flow', say(S, 'flowTab'), 'grey');
        for (const id of stepOrder()) {
            const n = node(id);
            if (n) make(id, n.label || typeLabel(n), toneOf(catalogue.tone(n.type)));
        }
        paintTabState();
        if (focused) tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    }

    function paintTabState() {
        if (!tabs) return;
        const list = [...tabs.querySelectorAll('[role="tab"]')];
        const current = list.find((t) => t.dataset.tab === selected) ?? null;
        for (const t of list) {
            const on = t === current;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on || (!current && t === list[0]) ? 0 : -1;
            const n = node(t.dataset.tab);
            if (n) t.querySelector('.twm-flow-lanes__tab-label').textContent = n.label || typeLabel(n);
        }
        if (dock) {
            if (current) dock.setAttribute('aria-labelledby', current.id);
            else dock.removeAttribute('aria-labelledby');
        }
    }

    function paintBanner() {
        const lines = isReadOnly() && !compact ? readOnlyReason() : [];
        banner.replaceChildren(...lines.map((l) => el('p', 'twm-flow-lanes__readonly-line', l)));
        banner.hidden = lines.length === 0;
        root.classList.toggle('twm-flow-lanes--readonly', isReadOnly() && !compact);
        if (addSourceBtn) addSourceBtn.hidden = isReadOnly();
        const runText = mode === 'run' && runOverlay?.banner ? String(runOverlay.banner) : '';
        runBanner.textContent = runText;
        runBanner.hidden = !runText;
    }

    function paintToolbar() {
        if (!toolbar) return;
        const ro = isReadOnly();
        undoBtn.disabled = ro || !history.canUndo;
        redoBtn.disabled = ro || !history.canRedo;
        showPreviewBtn.setAttribute('aria-pressed', mode === 'preview' ? 'true' : 'false');
        showRunBtn.setAttribute('aria-pressed', mode === 'run' ? 'true' : 'false');
    }

    function paintParams() {
        if (!params) return;
        const focused = root.ownerDocument.activeElement;
        const heldName = focused && params.contains(focused) ? focused.dataset.parameter ?? (focused.dataset.add ? '+' : null) : null;
        params.replaceChildren();
        params.appendChild(el('span', 'twm-flow-lanes__params-title', say(S, 'parameters')));
        const names = Object.keys(pipeline.parameters || {});
        for (const name of names) {
            const def = isObject(pipeline.parameters[name]) ? pipeline.parameters[name] : {};
            const line = say(S, 'parameterLine', def.type, def.default === undefined ? undefined
                : (typeof def.default === 'string' ? def.default : JSON.stringify(def.default)));
            const chip = el('button', 'twm-flow-lanes__param');
            chip.type = 'button';
            chip.dataset.parameter = name;
            chip.setAttribute('aria-haspopup', 'dialog');
            chip.setAttribute('aria-label', say(S, 'parameterAria', name, line));
            chip.append(el('span', 'twm-flow-lanes__param-name', name), el('span', 'twm-flow-lanes__param-line', line));
            chip.addEventListener('click', () => editParameter(name, chip));
            params.appendChild(chip);
        }
        if (!isReadOnly()) {
            const add = el('button', 'twm-flow-lanes__param-add');
            add.type = 'button';
            add.dataset.add = '1';
            add.setAttribute('aria-haspopup', 'dialog');
            add.append(icon('add'), el('span', '', say(S, 'addParameter')));
            add.addEventListener('click', () => editParameter(null, add));
            params.appendChild(add);
        }
        if (names.length) {
            const syntax = references.parameter;
            const ref = syntax?.format ? syntax.format(names[0]) : `{{${names[0]}}}`;
            params.appendChild(el('span', 'twm-flow-lanes__params-help',
                                  `${say(S, 'parameterHelp', ref)} ${say(S, 'parameterSupplied')}`));
        }
        if (heldName) {
            const again = heldName === '+' ? params.querySelector('[data-add]')
                : [...params.querySelectorAll('[data-parameter]')].find((c) => c.dataset.parameter === heldName);
            (again || params.querySelector('button'))?.focus({ preventScroll: true });
        }
    }

    function stepPanelSpec(n) {
        const type = typeOf(n);
        const ports = portsOf(pipeline, catalogue, n.id);
        const extra = [];
        const inputs = ports?.inputs ?? [];
        if (ports && ports.laneInput !== null && (inputs.length > 1 || !laneFeedOf(pipeline, catalogue, n.id))) {
            extra.push(inputField(n, ports.laneInput, true, inputs));
        }
        for (const port of inputs.slice(1)) extra.push(inputField(n, port, false, inputs));
        const ro = isReadOnly();
        return {
            step: n, type, value: n.config,
            title: n.label ?? '', placeholderTitle: typeLabel(n), rename: true,
            typeLabel: typeLabel(n), description: type?.description ?? '',
            idLine: typeof options.summariseReads === 'function' ? options.summariseReads(n, type) : null,
            icon: type?.icon ?? '', tone: toneOf(catalogue.tone(n.type)),
            extra,
            actions: [{ id: 'remove', label: say(S, 'removeStep'), icon: 'delete', danger: true, disabled: ro,
                        reason: ro ? readOnlyReason()[0] ?? '' : '', run: () => remove(n.id) }],
            slots: { after: typeof slots.stepPanel === 'function' ? (box) => slots.stepPanel(box, n) : null },
        };
    }

    function inputField(n, port, lane, inputs) {
        const here = layout.at[n.id]?.lane ?? 0;
        const candidates = inputCandidates(pipeline, catalogue, layout, n.id);
        const labels = {};
        for (const c of candidates) labels[c.id] = say(S, 'candidate', titleOf(c.id), say(S, 'laneRelation', c.lane - here, c.lane + 1));
        const current = inputOf(pipeline, n.id, port)?.sourceId;
        const portDef = catalogue.port(n.type, port, 'input');
        const title = lane ? say(S, 'thisLane')
            : (inputs.length > 2 ? say(S, 'joinedWithPort', portDef?.label ?? port) : say(S, 'joinedWith'));
        return {
            key: `__input:${port}`,
            spec: { type: 'string', title, description: lane ? (current ? say(S, 'thisLaneHelp') : say(S, 'connectIt'))
                : say(S, 'joinedWithHelp'), enum: candidates.map((c) => c.id), 'x-ui-enum-labels': labels },
            required: lane || Boolean(portDef?.required),
            value: current,
            at: 'start',
            set: (v) => setJoin(n.id, port, v ?? null),
        };
    }

    function paintPanel() {
        if (!panel) return;
        if (panelReadOnly !== isReadOnly()) {
            panelReadOnly = isReadOnly();
            panel.setReadOnly(panelReadOnly ? { reason: '' } : false);
        }
        const n = selected && selected !== 'flow' ? node(selected) : null;
        settingsHint.hidden = true;
        if (n) {
            panel.show(stepPanelSpec(n));
            shownColumns = JSON.stringify(inputColumns(n.id));
        } else if (selected === 'flow' && flowSchema) {
            panel.show({ title: say(S, 'flowTitle'), typeLabel: say(S, 'flowType'),
                         description: options.flowSettings?.description ?? '', icon: 'tune', tone: 'grey',
                         fields: fieldsFromSchema(flowSchema), value: flowValue ?? {},
                         slots: { after: typeof slots.flowPanel === 'function' ? (box) => slots.flowPanel(box) : null } });
            shownColumns = '';
        } else {
            panel.clear();
            settingsHint.hidden = false;
            shownColumns = '';
        }
        panel.setFindings(findings);
    }

    /** A describe or preview answer changed the selected step's input columns: redraw its fields, unless
     *  the reader is in them — a repaint the reader did not ask for rebuilds no field they hold. */
    function reshowForColumns() {
        if (!panel || !selected || selected === 'flow' || !node(selected)) return;
        const now = JSON.stringify(inputColumns(selected));
        if (now === shownColumns) return;
        if (panel.el.contains(root.ownerDocument.activeElement)) return;
        paintPanel();
    }

    function availableDataTabs() {
        const n = selected && selected !== 'flow' ? node(selected) : null;
        if (!n) return [];
        const out = [];
        if (typeof options.preview === 'function') out.push('preview');
        if (typeof options.preview === 'function' || typeof options.describe === 'function') out.push('columns');
        if (typeof options.preview === 'function' && roleOf(n) === 'sink') out.push('rejects');
        return out;
    }

    function columnsOf(id) {
        const d = describeNodes[id];
        if (Array.isArray(d?.columns)) return { from: 'describe', list: d.columns };
        const p = previewNodes[id];
        if (Array.isArray(p?.columns)) return { from: 'preview', list: p.columns };
        return { from: null, list: [] };
    }

    function paintDataState() {
        if (!dataState) return;
        const s = previewState;
        dataState.replaceChildren();
        if (!s.enabled) {
            dataState.hidden = true;
            return;
        }
        dataState.hidden = false;
        const tone = previewError ? 'error' : (s.waiting || s.busy) ? 'busy' : 'ok';
        dataState.className = `twm-flow-lanes__datastate twm-flow-lanes__datastate--${tone}`;
        const dot = el('span', 'twm-flow-lanes__datastate-dot');
        dot.setAttribute('aria-hidden', 'true');
        dataState.append(dot, el('span', 'twm-flow-lanes__datastate-text',
                                 tone === 'busy' ? say(S, 'previewing') : say(S, 'previewOn', delayMs)));
    }

    function paintDock() {
        if (!dock) return;
        const active = root.ownerDocument.activeElement;
        const heldTab = active && dataTabs.contains(active) ? active.dataset.data ?? null : null;
        table?.dispose?.();
        table = null;
        dataTabs.replaceChildren();
        dataBody.replaceChildren();
        const id = selected && selected !== 'flow' ? selected : null;
        const avail = availableDataTabs();
        dataCol.hidden = avail.length === 0;
        if (!avail.length || !id) return;
        if (!avail.includes(dockTab)) dockTab = avail[0];
        const p = previewNodes[id];
        const cols = columnsOf(id);
        const rejects = Array.isArray(p?.rejects) ? p.rejects : [];
        const words = { preview: say(S, 'previewTab'), columns: say(S, 'columnsTab', cols.list.length),
                        rejects: say(S, 'rejectsTab', rejects.length) };
        for (const t of avail) {
            const b = el('button', 'twm-flow-lanes__datatab', words[t]);
            b.type = 'button';
            b.dataset.data = t;
            b.setAttribute('aria-pressed', t === dockTab ? 'true' : 'false');
            b.addEventListener('click', () => {
                dockTab = t;
                paintDock();
            });
            dataTabs.appendChild(b);
        }
        dataTabs.appendChild(el('span', 'twm-flow-lanes__spacer'));
        dataTabs.appendChild(dataState);
        paintDataState();
        if (heldTab) dataTabs.querySelector(`[data-data="${heldTab}"]`)?.focus({ preventScroll: true });

        if (previewError && dockTab !== 'columns') dataBody.appendChild(el('p', 'twm-flow-lanes__error', previewError));
        if (dockTab === 'preview') {
            if (!p) {
                dataBody.appendChild(el('p', 'twm-flow-lanes__nodata', say(S, 'noPreview')));
                return;
            }
            if (p.status === 'error') {
                dataBody.appendChild(el('p', 'twm-flow-lanes__error', String(p.error?.message || say(S, 'stepFailed'))));
                return;
            }
            const head = Array.isArray(p.head) ? p.head : [];
            const columns = Array.isArray(p.columns) ? p.columns : [];
            dataBody.appendChild(el('p', 'twm-flow-lanes__caption',
                                    p.caption ?? say(S, 'previewCaption', head.length, p.rows ?? head.length)));
            const box = el('div', 'twm-flow-lanes__table');
            dataBody.appendChild(box);
            const marks = columns.map((c) => describeNodes[id]?.columns?.find((d) => d.name === c.name)?.change ?? null);
            table = new DataTable(box, {
                headers: columns.map((c) => String(c.name)),
                rows: head.map((r) => (Array.isArray(r) ? r : columns.map((c) => r?.[c.name]))),
                pagination: false, selectable: false, readonly: true, copyable: true, sortable: false,
                mode: 'compact', firstColumn: 'plain', columnFit: 'content', nullDisplay: '',
                emptyState: say(S, 'noRows'),
                cellClass: (_v, colIdx) => (marks[colIdx] ? `twm-flow-lanes__cell--${marks[colIdx] === 'new' ? 'new' : 'changed'}` : null),
            });
            table.render();
        } else if (dockTab === 'columns') {
            if (!cols.list.length) {
                dataBody.appendChild(el('p', 'twm-flow-lanes__nodata', say(S, 'columnsUnknown')));
                return;
            }
            dataBody.appendChild(el('p', 'twm-flow-lanes__caption', say(S, cols.from === 'describe'
                ? 'columnsFromDescription' : 'columnsFromPreview', cols.list.length)));
            const list = el('ul', 'twm-flow-lanes__columns');
            for (const c of cols.list) {
                const change = c.change === 'new' || c.change === 'changed' ? c.change : null;
                const li = el('li', `twm-flow-lanes__column${change ? ` twm-flow-lanes__column--${change}` : ''}`);
                const type = [c.type, change ? say(S, change === 'new' ? 'columnNew' : 'columnChanged') : null]
                    .filter(Boolean).join(' · ');
                li.append(el('span', 'twm-flow-lanes__column-name', String(c.name)),
                          el('span', 'twm-flow-lanes__column-type', type),
                          el('span', 'twm-flow-lanes__column-origin', c.origin ?? ''));
                list.appendChild(li);
            }
            dataBody.appendChild(list);
        } else {
            dataBody.appendChild(el('p', 'twm-flow-lanes__caption', rejects.length
                ? (p?.rejectsCaption ?? say(S, 'rejectsCaption', rejects.length)) : say(S, 'noRejects')));
            const list = el('ul', 'twm-flow-lanes__rejects');
            for (const r of rejects) {
                const li = el('li', 'twm-flow-lanes__reject');
                const row = Array.isArray(r.row) ? r.row : [];
                if (row.length) li.appendChild(el('span', 'twm-flow-lanes__reject-key', String(row[0])));
                if (row.length > 1) li.appendChild(el('span', 'twm-flow-lanes__reject-value', String(row[1])));
                li.appendChild(el('span', 'twm-flow-lanes__reject-reason', say(S, 'rejectReason', r.column, r.reason)));
                list.appendChild(li);
            }
            dataBody.appendChild(list);
        }
    }

    function paintAll() {
        paintBanner();
        paintToolbar();
        paintParams();
        paintLanes();
        paintTabs();
        paintPanel();
        paintDock();
    }

    // ── choosing and focusing ────────────────────────────────────────────
    function select(id, { notify = true } = {}) {
        const next = id === 'flow' ? (flowSchema ? 'flow' : null) : (id && node(id) ? id : null);
        if (next === selected) return;
        selected = next;
        paintCards();
        paintTabState();
        paintPanel();
        paintDock();
        if (notify) options.onSelect?.({ kind: selected === null ? null : selected === 'flow' ? 'flow' : 'step', id: selected });
    }

    function cardEl(id) {
        if (!id) return null;
        return [...surface.querySelectorAll('.twm-flow-lanes__node')].find((w) => w.dataset.step === id)
            ?.querySelector('.twm-flow-lanes__card') ?? null;
    }

    function focusCard(id) {
        const b = cardEl(id && id !== 'flow' ? id : rovingStep());
        if (b) {
            b.focus({ preventScroll: true });
            b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            return true;
        }
        (addSourceBtn && !addSourceBtn.hidden ? addSourceBtn : root).focus?.({ preventScroll: true });
        return false;
    }

    function goTo(f) {
        if (f?.node_id && node(f.node_id)) {
            select(f.node_id);
            if (!(f.field && panel?.focusField(f.field))) focusCard(f.node_id);
            return;
        }
        if (flowSchema) {
            select('flow');
            if (f?.field) panel?.focusField(f.field);
        }
    }

    /** The step beside `id` in the direction of the arrow, or null. */
    function neighbour(id, dir) {
        const at = layout.at[id];
        if (!at) return null;
        const lane = layout.lanes[at.lane];
        if (dir === 'left') return lane.steps[at.position - 1]?.id ?? null;
        if (dir === 'right') return lane.steps[at.position + 1]?.id ?? null;
        const other = layout.lanes[at.lane + (dir === 'down' ? 1 : -1)];
        if (!other || !other.steps.length) return null;
        let best = other.steps[0];
        for (const s of other.steps) {
            const d = Math.abs(s.column - at.column);
            const bd = Math.abs(best.column - at.column);
            if (d < bd || (d === bd && s.column < best.column)) best = s;
        }
        return best.id;
    }

    // ── edits ────────────────────────────────────────────────────────────
    function afterShapeChange(focusId = null) {
        relayout();
        paintAll();
        if (focusId) focusCard(focusId);
    }

    async function pickAfter(id, anchor) {
        if (isReadOnly() || !node(id)) return;
        const entries = catalogue.list().filter((t) => t.role !== 'source').map((t) => ({
            id: t.type_id, label: t.label, sub: '', description: t.description, icon: t.icon,
            tone: catalogue.tone(t.type_id), category: t.category ?? '', refusal: t.unavailable || undefined,
        }));
        const picked = await openStepPicker({ anchor, entries, categories: pickerCategories(),
                                              where: say(S, 'afterStep', titleOf(id)), strings: S });
        if (destroyed || !picked?.entry || isReadOnly()) return;
        const created = addStepAfter(pipeline, catalogue, id, picked.entry.id);
        if (!created) return;
        selected = created.id;
        commit('flow:step:add');
        afterShapeChange(created.id);
        options.onSelect?.({ kind: 'step', id: created.id });
    }

    async function pickSource() {
        if (isReadOnly() || !addSourceBtn) return;
        const entries = catalogue.list().filter((t) => t.role === 'source').map((t) => ({
            id: t.type_id, label: t.label, description: t.description, icon: t.icon,
            tone: catalogue.tone(t.type_id), category: t.category ?? '', refusal: t.unavailable || undefined,
        }));
        const picked = await openStepPicker({ anchor: addSourceBtn, entries, categories: pickerCategories(),
                                              title: say(S, 'addSourceTitle'), where: say(S, 'startsLane'), strings: S });
        if (destroyed || !picked?.entry || isReadOnly()) return;
        const created = addSource(pipeline, catalogue, picked.entry.id);
        selected = created.id;
        commit('flow:source:add');
        afterShapeChange(created.id);
        options.onSelect?.({ kind: 'step', id: created.id });
    }

    function pickerCategories() {
        return catalogue.categories.map((c) => ({ id: c.id, label: c.label, layout: c.layout }));
    }

    function remove(id) {
        if (isReadOnly() || !node(id)) return false;
        const at = layout.at[id];
        const lane = at ? layout.lanes[at.lane] : null;
        const fallback = lane ? (lane.steps[at.position - 1]?.id ?? lane.steps[at.position + 1]?.id ?? null) : null;
        const hadFocus = root.contains(root.ownerDocument.activeElement);
        removeStep(pipeline, catalogue, id);
        if (selected === id) selected = fallback && node(fallback) ? fallback : null;
        commit('flow:step:remove');
        relayout();
        if (!selected) selected = firstStep();
        paintAll();
        if (hadFocus) focusCard(selected);
        options.onSelect?.({ kind: selected ? 'step' : null, id: selected });
        return true;
    }

    function changeSetting(stepId, key, value) {
        if (isReadOnly()) return;
        if (stepId === null) {
            flowValue = { ...(flowValue ?? {}) };
            if (value === undefined) delete flowValue[key]; else flowValue[key] = clone(value);
            commit('flow:settings', `settings:${key}`);
            return;
        }
        const n = node(stepId);
        if (!n) return;
        if (value === undefined) delete n.config[key]; else n.config[key] = clone(value);
        commit('flow:step:config', `config:${stepId}:${key}`);
        paintCards();
    }

    function rename(stepId, label) {
        if (isReadOnly()) return;
        const n = node(stepId);
        if (!n) return;
        if (String(label ?? '').trim()) n.label = String(label); else delete n.label;
        commit('flow:step:label', `label:${stepId}`, { preview: false });
        paintCards();
        paintTabState();
    }

    function setJoin(stepId, port, sourceId) {
        if (isReadOnly()) return;
        if (!setInput(pipeline, catalogue, stepId, port, sourceId)) return;
        commit('flow:join:set', null);
        afterShapeChange();
    }

    // ── parameters ───────────────────────────────────────────────────────
    function editParameter(name, anchor) {
        if (!params) return;
        const editing = name !== null;
        const def = editing && isObject(pipeline.parameters[name]) ? pipeline.parameters[name] : {};
        const ro = isReadOnly();
        const form = el('form', 'twm-flow-lanes__form');
        form.noValidate = true;
        form.appendChild(el('div', 'twm-flow-lanes__form-title', editing ? say(S, 'parameterTitle') : say(S, 'addParameter')));
        const row = (label, control) => {
            const r = el('label', 'twm-flow-lanes__form-row');
            r.append(el('span', 'twm-flow-lanes__form-label', label), control);
            form.appendChild(r);
            return control;
        };
        const nameBox = row(say(S, 'parameterName'), el('input', 'twm-flow-input'));
        nameBox.type = 'text';
        nameBox.value = name ?? '';
        nameBox.spellcheck = false;
        nameBox.dataset.field = 'name';
        const typeBox = row(say(S, 'parameterType'), el('select', 'twm-flow-input twm-flow-input--select'));
        typeBox.dataset.field = 'type';
        for (const t of parameterTypes) typeBox.appendChild(new Option(t.label, t.id));
        if (def.type !== undefined && !parameterTypes.some((t) => t.id === def.type)) typeBox.appendChild(new Option(String(def.type), String(def.type)));
        typeBox.value = def.type !== undefined ? String(def.type) : parameterTypes[0].id;
        const defaultHolder = el('span', 'twm-flow-lanes__form-control');
        row(say(S, 'parameterDefault'), defaultHolder);
        let defaultBox = null;
        const drawDefault = () => {
            const was = defaultBox ? defaultBox.value : (def.default === undefined ? ''
                : typeof def.default === 'string' ? def.default : JSON.stringify(def.default));
            defaultHolder.replaceChildren();
            if (typeBox.value === 'boolean') {
                defaultBox = el('select', 'twm-flow-input twm-flow-input--select');
                defaultBox.append(new Option(say(S, 'parameterNoDefault'), ''), new Option('true', 'true'), new Option('false', 'false'));
                defaultBox.value = ['true', 'false'].includes(was) ? was : '';
            } else {
                defaultBox = el('input', 'twm-flow-input');
                defaultBox.type = 'text';
                defaultBox.value = was;
            }
            defaultBox.dataset.field = 'default';
            defaultBox.disabled = ro;
            defaultHolder.appendChild(defaultBox);
        };
        drawDefault();
        typeBox.addEventListener('change', drawDefault);
        const descBox = row(say(S, 'parameterDescription'), el('input', 'twm-flow-input'));
        descBox.type = 'text';
        descBox.value = def.description ?? '';
        descBox.dataset.field = 'description';
        for (const b of [nameBox, typeBox, descBox]) b.disabled = ro;
        const refusal = el('p', 'twm-flow-lanes__form-refusal');
        refusal.setAttribute('role', 'alert');
        refusal.hidden = true;
        form.appendChild(refusal);
        const acts = el('div', 'twm-flow-lanes__form-actions');
        let handle = null;
        const save = button({ label: say(S, 'parameterSave'), primary: true, type: 'submit' });
        const cancel = button({ label: say(S, 'parameterCancel'), onClick: () => handle?.close('cancel') });
        save.disabled = ro;
        acts.appendChild(save);
        if (editing) {
            const del = button({ label: say(S, 'parameterRemove'), danger: true, onClick: () => {
                if (isReadOnly()) return;
                removeParameter(pipeline, name);
                handle?.close('removed');
                commit('flow:parameter:remove');
                paintParams();
                params.querySelector('[data-add]')?.focus({ preventScroll: true });
            } });
            del.disabled = ro;
            acts.appendChild(del);
        }
        acts.appendChild(cancel);
        form.appendChild(acts);
        const refuse = (text, box) => {
            refusal.textContent = text;
            refusal.hidden = false;
            box?.focus();
        };
        form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            if (isReadOnly()) return;
            const next = nameBox.value.trim();
            if (!PARAMETER_NAME.test(next)) return refuse(say(S, 'parameterNameRule'), nameBox);
            if (next !== name && Object.prototype.hasOwnProperty.call(pipeline.parameters, next)) {
                return refuse(say(S, 'parameterNameTaken', next), nameBox);
            }
            const type = typeBox.value;
            const raw = defaultBox.value;
            let value;
            if (raw !== '') {
                if (type === 'number' || type === 'integer') {
                    const v = Number(raw);
                    if (!Number.isFinite(v)) return refuse(say(S, 'parameterNotNumber'), defaultBox);
                    if (type === 'integer' && !Number.isInteger(v)) return refuse(say(S, 'parameterNotInteger'), defaultBox);
                    value = v;
                } else if (type === 'boolean') {
                    value = raw === 'true';
                } else {
                    value = raw;
                }
            }
            setParameter(pipeline, next, { type, default: value, description: descBox.value.trim() }, { rename: name });
            handle?.close('saved');
            commit(editing ? 'flow:parameter:change' : 'flow:parameter:add');
            paintParams();
            [...params.querySelectorAll('[data-parameter]')].find((c) => c.dataset.parameter === next)
                ?.focus({ preventScroll: true });
            return undefined;
        });
        handle = openPopover({ anchor, content: form, label: editing ? say(S, 'parameterTitle') : say(S, 'addParameter'),
                               className: 'twm-flow-lanes__popover', focus: ro ? cancel : nameBox });
    }

    // ── the card's menu ──────────────────────────────────────────────────
    function openMenu(id, anchor) {
        if (compact || !node(id)) return;
        const menu = el('div', 'twm-flow-lanes__menu');
        menu.setAttribute('role', 'menu');
        let handle = null;
        const item = (label, glyph, run, { danger = false, disabled = false } = {}) => {
            const b = el('button', `twm-flow-lanes__menu-item${danger ? ' twm-flow-lanes__menu-item--danger' : ''}`);
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.disabled = disabled;
            b.append(icon(glyph), el('span', '', label));
            b.addEventListener('click', () => {
                handle?.close('chosen');
                run();
            });
            menu.appendChild(b);
            return b;
        };
        const first = item(say(S, 'openSettings'), 'tune', () => openSettingsOf(id));
        if (canAddAfter(id)) {
            item(say(S, 'addStepAfter'), 'add', () => {
                const add = [...surface.querySelectorAll('.twm-flow-lanes__node')].find((w) => w.dataset.step === id)
                    ?.querySelector('.twm-flow-lanes__add');
                if (add) pickAfter(id, add);
            });
        }
        if (!isReadOnly()) item(say(S, 'removeStep'), 'delete', () => remove(id), { danger: true });
        menu.addEventListener('keydown', (ev) => {
            if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
            ev.preventDefault();
            const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
            const at = items.indexOf(root.ownerDocument.activeElement);
            const next = items[(at + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
            next?.focus();
        });
        handle = openPopover({ anchor, content: menu, label: say(S, 'stepMenu', titleOf(id)),
                               className: 'twm-flow-lanes__popover', focus: first });
    }

    /** Choose a step and put the focus on its FIRST FIELD (else its name, else the panel's first control). */
    function openSettingsOf(id) {
        if (id && node(id)) select(id);
        if (!panel) return;
        const controls = 'input, select, textarea, [contenteditable="true"], button';
        const target = [...panel.el.querySelectorAll('.twm-flow-panel__fields *')].find((c) => c.matches(controls) && !c.disabled)
            ?? panel.el.querySelector('[data-twm-flow-title]') ?? panel.el.querySelector(controls);
        target?.focus({ preventScroll: true });
    }

    // ── keys ─────────────────────────────────────────────────────────────
    const inSurface = (ev) => surface.contains(ev.target);
    const inTabs = (ev) => Boolean(tabs && tabs.contains(ev.target));
    /** The step a key was pressed on: its card's, or its tab's. */
    const stepAt = (ev) => (inSurface(ev) ? ev.target.closest?.('[data-step]')?.dataset.step
        : inTabs(ev) ? ev.target.closest?.('[role="tab"]')?.dataset.tab : null) ?? null;
    const unbindKeys = compact ? () => {} : bindFlowKeys(root, {
        undo: () => { if (isReadOnly()) return false; undo(); return true; },
        redo: () => { if (isReadOnly()) return false; redo(); return true; },
        remove: (ev) => {
            if (!(inSurface(ev) || inTabs(ev)) || isReadOnly()) return false;
            const id = stepAt(ev) ?? selected;
            if (!id || id === 'flow' || !node(id)) return false;
            remove(id);
            return true;
        },
        rename: () => {
            if (!selected || selected === 'flow' || !panel) return false;
            const t = panel.el.querySelector('[data-twm-flow-title]');
            if (!t) return false;
            t.focus();
            t.select?.();
            return true;
        },
        left: (ev) => arrow(ev, 'left'),
        right: (ev) => arrow(ev, 'right'),
        up: (ev) => arrow(ev, 'up'),
        down: (ev) => arrow(ev, 'down'),
        open: (ev) => {
            if (!(inSurface(ev) || inTabs(ev))) return false;
            const id = stepAt(ev);
            if (id) select(id);
            openSettingsOf(selected && selected !== 'flow' ? selected : null);
            return true;
        },
        escape: (ev) => {
            if (!dock?.contains(ev.target) || settingsCol.contains(ev.target)) return false;
            return focusCard(selected);
        },
    });

    // Escape in the settings — in a field too — goes back to the chosen card,
    // unless something in the panel took the key first (a picker, an editor's
    // own suggestion list).
    const onPanelKey = (ev) => {
        if (ev.key !== 'Escape' || ev.defaultPrevented || ev.isComposing) return;
        if (focusCard(selected)) ev.preventDefault();
    };
    settingsCol?.addEventListener('keydown', onPanelKey);

    function arrow(ev, dir) {
        if (inTabs(ev)) {
            if (dir !== 'left' && dir !== 'right') return false;
            const list = [...tabs.querySelectorAll('[role="tab"]')];
            const at = list.indexOf(ev.target.closest('[role="tab"]'));
            const next = list[at + (dir === 'right' ? 1 : -1)];
            if (!next) return true;
            select(next.dataset.tab);
            next.focus({ preventScroll: true });
            return true;
        }
        if (!inSurface(ev) || !ev.target.closest('.twm-flow-lanes__card')) return false;
        const from = ev.target.closest('[data-step]')?.dataset.step;
        const to = from ? neighbour(from, dir) : null;
        if (!to) return true;
        select(to);
        focusCard(to);
        return true;
    }


    // ── the toggle and the last run ──────────────────────────────────────
    function setStepsShow(next) {
        const m = next === 'run' ? 'run' : 'preview';
        if (m === mode) return;
        mode = m;
        paintToolbar();
        paintBanner();
        paintCards();
        options.onStepsShow?.(mode);
        if (mode === 'run' && !runOverlay && typeof options.lastRun === 'function') {
            lastRunAsk?.abort();
            const controller = new AbortController();
            lastRunAsk = controller;
            Promise.resolve(options.lastRun({ pipeline: getGraph(), signal: controller.signal })).then((overlay) => {
                if (destroyed || controller.signal.aborted || lastRunAsk !== controller) return;
                lastRunAsk = null;
                if (overlay) api.setRunOverlay(overlay);
            }, () => { if (lastRunAsk === controller) lastRunAsk = null; });
        }
    }

    // ── reading ──────────────────────────────────────────────────────────
    function getGraph() {
        return normalisePipeline(pipeline);
    }

    /** The columns of the frame a step reads on `port` (its lane input by default), or null. */
    function inputColumns(stepId, port = null) {
        const ports = portsOf(pipeline, catalogue, stepId);
        const at = port ?? ports?.laneInput;
        if (!at) return null;
        const c = inputOf(pipeline, stepId, at);
        if (!c) return null;
        const cols = columnsOf(c.sourceId);
        return cols.from ? cols.list.map((x) => ({ ...x })) : null;
    }

    function cssEscape(v) {
        return String(v).replace(/["\\]/g, '\\$&');
    }

    // ── the API ──────────────────────────────────────────────────────────
    const api = {
        el: root,
        /** Replace the content. A baseline (the default) clears both undo stacks. */
        load({ graph = null, pipeline: given = null, flowSettings } = {}, { baseline = true } = {}) {
            pipeline = normalisePipeline(given ?? graph ?? emptyPipeline());
            if (flowSettings !== undefined) {
                flowSchema = isObject(flowSettings?.schema) ? flowSettings.schema : null;
                flowValue = isObject(flowSettings?.value) ? clone(flowSettings.value) : (flowSchema ? {} : null);
            }
            previewNodes = {};
            describeNodes = {};
            previewError = null;
            relayout();
            if (!(selected && (selected === 'flow' ? flowSchema : node(selected)))) {
                selected = options.select !== undefined && (options.select === 'flow' ? flowSchema : node(options.select))
                    ? options.select : (compact ? null : firstStep());
            }
            paintAll();
            if (baseline) history.baseline(snapshot());
            runner.schedule({ immediate: true });
        },
        getGraph,
        /** The flow's byte-stable text. */
        serialise: () => serialisePipeline(pipeline),
        getFlowSettings: () => (flowValue === null ? null : clone(flowValue)),
        /** The current layout (`layoutLanes`) and its coordinates (`placeLanes`). */
        get layout() { return layout; },
        get placed() { return placed; },
        setFindings(list) {
            findings = findingsList(list);
            byNode = groupFindings(findings, { graph: pipeline });
            strip?.set(findings);
            paintCards();
            panel?.setFindings(findings);
        },
        setRunOverlay(overlay) {
            runOverlay = isObject(overlay) ? overlay : null;
            paintBanner();
            paintCards();
        },
        setStepsShow,
        get stepsShow() { return mode; },
        setReadOnly(next) {
            readOnlyOpt = next || false;
            paintAll();
        },
        get readOnly() { return isReadOnly(); },
        setActionState(id, { disabled = false, reason = '', busy = false } = {}) {
            const a = actionButtons.get(String(id));
            if (!a) return;
            a.b.disabled = Boolean(disabled || busy);
            a.b.setAttribute('aria-busy', busy ? 'true' : 'false');
            a.wrap.classList.toggle('twm-flow-lanes__action--busy', Boolean(busy));
            a.why.textContent = disabled && reason ? String(reason) : '';
            a.why.hidden = !(disabled && reason);
        },
        setStatus(text) {
            if (statusEl) statusEl.textContent = String(text ?? '');
        },
        select(id) { select(id); },
        get selected() { return selected; },
        focus() { focusCard(selected); },
        undo,
        redo,
        history,
        /** Ask the providers now, without waiting for the debounce. */
        refreshPreview() { runner.now(); },
        inputColumns,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            runner.destroy();
            lastRunAsk?.abort();
            unbindKeys();
            settingsCol?.removeEventListener('keydown', onPanelKey);
            closeFlowPopovers();
            table?.dispose?.();
            table = null;
            panel?.destroy();
            strip?.destroy();
            root.remove();
        },
    };

    if (isObject(options.graph) || isObject(options.pipeline)) {
        api.load({ graph: options.graph ?? options.pipeline });
    } else {
        relayout();
        paintAll();
        history.baseline(snapshot());
    }
    return api;
}
