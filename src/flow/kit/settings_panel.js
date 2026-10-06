/**
 * THE SETTINGS PANEL — one step's settings, or the flow's own (36 §3.4).
 *
 * The header is the type, the step's name, WHERE it is ("Inside Anything new?
 * › Then"), its description and the line saying how later steps read it; under
 * it, the step's fields, drawn from its schema by the widget registry, with
 * the editor's synthetic fields (`extra`) among them and the consumer's own
 * areas (`slots`) before and after.
 *
 * ══ TWO RULES IT KEEPS ══════════════════════════════════════════════════
 *
 * **A repaint puts focus back** on the rebuilt control of the same field —
 * caret and selection where they were — or, when that field is gone, hands it
 * to the editor (`onFocusLost`) to put on its surface. Never on `<body>`, where
 * an editor's keys never arrive.
 *
 * **A repaint the reader did not ask for rebuilds no field.** Findings are
 * applied to the fields in place (`setFindings`), and the consumer's slots are
 * redrawn on their own (`repaintSlots`) — so a run overlay refreshed every
 * second leaves a name being typed with its control, its caret and its own
 * undo. Only `show()`, and a setting whose change reshapes the form (a reshape,
 * or a key some field's `x-ui-when` reads), rebuild the fields.
 *
 * A refused control is disabled AND SAYS WHY beside it, on the screen — never
 * only on a `title` nobody hovers.
 */

import { button, el, icon, toneClass } from './dom.js';
import { createStrings, say } from './strings.js';
import { fieldsFromSchema, visibleFields, whenKeys } from './settings_schema.js';
import { renderField } from './widgets.js';
import { matchFindingField } from './findings.js';
import { openValuePicker } from './value_picker.js';
import { ownsUndo } from './keys.js';

const TITLE = 'data-twm-flow-title';

/**
 * @param {object} o
 * @param {object} o.widgets                 `createWidgetRegistry()`'s
 * @param {object} [o.references]            syntax name → syntax
 * @param {object} [o.strings]
 * @param {object} [o.services]              the consumer's bag, handed to every widget untouched
 * @param {false|true|{reason: string}} [o.readOnly]
 * @param {(stepId: string|null, key: string, value: any) => void} [o.onChange]
 * @param {(stepId: string|null, label: string) => void} [o.onRename]   the title, typed
 * @param {() => void} [o.onFocusLost]       a repaint took the focused control away
 * @param {(q: {stepId, step, field, key}) => Promise<object[]|{groups, note}>} [o.values]
 *        *Insert a value*'s groups for one field; absent, no field offers the picker
 * @param {string} [o.valuesNote]            the picker's footer sentence
 * @param {(step: object) => object[]|null} [o.columns]  a step's input columns (a data flow)
 * @param {HTMLElement} [o.host]             appended here when given
 */
export function createSettingsPanel({ widgets, references = {}, strings = null, services = null, readOnly = false,
                                      onChange = null, onRename = null, onFocusLost = null, values = null,
                                      valuesNote = null, columns = null, host = null } = {}) {
    if (!widgets?.get) throw new Error('createSettingsPanel needs a widget registry (createWidgetRegistry()).');
    const S = createStrings(strings);
    const root = el('section', 'twm-flow-panel');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', say(S, 'settings'));
    if (host) host.appendChild(root);

    let ro = readOnly;
    let spec = null;
    let current = {};
    let fields = [];          // the rendered fields, in order
    let allFields = [];       // the schema's fields, before x-ui-when
    let findings = [];
    let findingsBox = null;
    let slotBefore = null;
    let slotAfter = null;
    let destroyed = false;

    const stepId = () => spec?.step?.id ?? null;
    const isReadOnly = () => Boolean(ro);
    const readOnlyReason = () => (ro && typeof ro === 'object' && ro.reason ? String(ro.reason) : '');

    function pickerFor() {
        if (!values) return null;
        return async ({ anchor, insert, path, key }) => {
            const answer = await values({ stepId: stepId(), step: spec?.step ?? null, field: path, key });
            const groups = Array.isArray(answer) ? answer : (answer?.groups || []);
            const note = Array.isArray(answer) ? valuesNote : (answer?.note ?? valuesNote);
            if (destroyed || !anchor.isConnected) return;
            openValuePicker({ anchor, groups, note, strings: S, onPick: (item) => insert(item.ref) });
        };
    }

    function setValue(key, v, opts = {}) {
        if (v === undefined) delete current[key]; else current[key] = v;
        onChange?.(stepId(), key, v);
        if (opts?.reshape || whenKeys(allFields).has(key)) repaint();
    }

    function fieldCtx() {
        return {
            widgets, referenceMap: references, strings: S, services, readOnly: isReadOnly(),
            step: spec?.step ?? null, type: spec?.type ?? null, path: '',
            openValuePicker: pickerFor(),
            columns: columns ? () => columns(spec?.step ?? null) : () => null,
            describeContext: { step: spec?.step ?? null, type: spec?.type ?? null, services },
            set: setValue,
        };
    }

    function paintHeader() {
        const head = el('header', 'twm-flow-panel__head');
        const chip = el('span', `twm-flow-panel__icon ${toneClass('twm-flow-panel__icon', spec.tone)}`);
        chip.appendChild(icon(spec.icon || ''));
        chip.setAttribute('aria-hidden', 'true');
        const titles = el('div', 'twm-flow-panel__titles');
        if (spec.typeLabel) titles.appendChild(el('span', 'twm-flow-panel__type', spec.typeLabel));
        if (spec.rename && spec.step) {
            const input = el('input', 'twm-flow-panel__title-input');
            input.type = 'text';
            input.value = spec.title ?? '';
            input.placeholder = spec.placeholderTitle ?? spec.typeLabel ?? '';
            input.setAttribute('aria-label', say(S, 'rename'));
            input.setAttribute(TITLE, '');
            input.readOnly = isReadOnly();
            input.addEventListener('input', () => {
                // What was typed is the title now: a repaint the reader asks for
                // next (a reshape) must not draw the old one back.
                spec.title = input.value;
                onRename?.(stepId(), input.value);
            });
            titles.appendChild(input);
        } else {
            titles.appendChild(el('h3', 'twm-flow-panel__title', spec.title ?? ''));
        }
        if (spec.where) titles.appendChild(el('span', 'twm-flow-panel__where', spec.where));
        head.append(chip, titles);
        const acts = Array.isArray(spec.actions) ? spec.actions : [];
        if (acts.length) {
            const box = el('div', 'twm-flow-panel__actions');
            for (const a of acts) {
                const refusal = isReadOnly() ? (readOnlyReason() || say(S, 'readOnly')) : (a.disabled ? a.reason || '' : '');
                const b = button({ label: a.label, icon: a.icon || null, danger: Boolean(a.danger),
                                   primary: Boolean(a.primary), className: 'twm-flow-panel__action',
                                   onClick: () => { if (!b.disabled) a.run?.(); } });
                b.dataset.action = a.id ?? '';
                b.disabled = Boolean(isReadOnly() || a.disabled);
                const wrap = el('span', 'twm-flow-panel__action-wrap');
                wrap.appendChild(b);
                if (b.disabled && refusal && !isReadOnly()) wrap.appendChild(el('span', 'twm-flow-panel__refusal', refusal));
                box.appendChild(wrap);
            }
            head.appendChild(box);
        }
        return head;
    }

    function paintSlots() {
        for (const [box, name] of [[slotBefore, 'before'], [slotAfter, 'after']]) {
            if (!box) continue;
            box.replaceChildren();
            const fn = spec?.slots?.[name];
            if (typeof fn === 'function') fn(box);
            box.hidden = box.childNodes.length === 0;
        }
    }

    function paint() {
        for (const f of fields) f.destroy?.();
        fields = [];
        root.replaceChildren();
        if (!spec) return;
        if (isReadOnly() && readOnlyReason()) root.appendChild(el('p', 'twm-flow-panel__readonly', readOnlyReason()));
        root.appendChild(paintHeader());
        if (spec.description) root.appendChild(el('p', 'twm-flow-panel__description', spec.description));
        if (spec.idLine) root.appendChild(el('div', 'twm-flow-panel__id', spec.idLine));
        findingsBox = el('ul', 'twm-flow-panel__findings');
        findingsBox.hidden = true;
        root.appendChild(findingsBox);
        slotBefore = el('div', 'twm-flow-panel__slot');
        slotBefore.dataset.slot = 'before';
        root.appendChild(slotBefore);

        const list = el('div', 'twm-flow-panel__fields');
        allFields = Array.isArray(spec.fields) ? spec.fields : fieldsFromSchema(spec.type?.config_schema);
        const drawn = visibleFields(allFields, current);
        const extra = Array.isArray(spec.extra) ? spec.extra : [];
        const placed = (e) => e.after ?? e.before ?? null;
        const extrasAt = (key, where) => extra.filter((e) => (where === 'after' ? e.after === key : e.before === key));
        const drawExtra = (e) => {
            if (e.note !== undefined) {
                list.appendChild(el('p', `twm-flow-panel__note${e.tone ? ` twm-flow-panel__note--${e.tone === 'warning' ? 'warning' : 'info'}` : ''}`, e.note));
                return;
            }
            const f = renderField({ key: e.key, spec: e.spec || {}, required: Boolean(e.required) }, e.value, {
                ...fieldCtx(),
                set: (_k, v, opts) => {
                    e.set?.(v, opts);
                    if (opts?.reshape) repaint();
                },
            });
            f.el.dataset.extra = '';
            fields.push(f);
            list.appendChild(f.el);
        };
        for (const e of extra.filter((x) => x.at === 'start')) drawExtra(e);
        for (const f of drawn) {
            for (const e of extrasAt(f.key, 'before')) drawExtra(e);
            const field = renderField(f, current[f.key], fieldCtx());
            fields.push(field);
            list.appendChild(field.el);
            for (const e of extrasAt(f.key, 'after')) drawExtra(e);
        }
        const keys = new Set(drawn.map((f) => f.key));
        for (const e of extra) {
            if (e.at === 'start') continue;
            const anchor = placed(e);
            if (anchor === null || !keys.has(anchor)) drawExtra(e);
        }
        root.appendChild(list);
        slotAfter = el('div', 'twm-flow-panel__slot');
        slotAfter.dataset.slot = 'after';
        root.appendChild(slotAfter);
        paintSlots();
        applyFindings();
    }

    /** Where focus is in the panel, so a repaint can put it back. */
    function heldFocus() {
        const active = root.ownerDocument.activeElement;
        if (!active || active === root || !root.contains(active)) return null;
        if (active.hasAttribute?.(TITLE)) {
            return { title: true, caret: { start: active.selectionStart, end: active.selectionEnd } };
        }
        const path = active.closest('[data-field]')?.dataset.field ?? null;
        const field = path ? fields.map((f) => f.fieldAt(path)).find(Boolean) : null;
        let caret = field?.caret?.() ?? null;
        if (!caret && ownsUndo(active) && active.matches?.('input, textarea')) {
            try {
                if (Number.isInteger(active.selectionStart)) {
                    caret = { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
                }
            } catch { /* a type without a caret */ }
        }
        return { path, caret, tag: active.tagName };
    }

    function restoreFocus(held) {
        if (!held || destroyed || !root.isConnected) return;
        if (held.title) {
            const t = root.querySelector(`[${TITLE}]`);
            if (t) {
                t.focus({ preventScroll: true });
                try { t.setSelectionRange(held.caret.start, held.caret.end); } catch { /* no caret */ }
                return;
            }
        }
        const field = held.path ? fields.map((f) => f.fieldAt(held.path)).find(Boolean) : null;
        if (field && field.focus()) {
            if (held.caret) {
                if (field.control?.restoreCaret) field.restoreCaret(held.caret);
                else {
                    const box = root.ownerDocument.activeElement;
                    try {
                        const end = box.value.length;
                        box.setSelectionRange(Math.min(held.caret.start, end), Math.min(held.caret.end, end),
                                              held.caret.direction || 'none');
                    } catch { /* no caret */ }
                }
            }
            return;
        }
        onFocusLost?.();
    }

    function repaint() {
        const held = heldFocus();
        paint();
        restoreFocus(held);
    }

    function applyFindings() {
        if (!spec || !findingsBox) return;
        const mine = findings.filter((f) => (f.node_id ?? null) === stepId());
        const paths = fields.flatMap((f) => f.paths());
        const byPath = new Map();
        const loose = [];
        for (const f of mine) {
            const hit = matchFindingField(paths, f.field);
            if (hit) {
                if (!byPath.has(hit)) byPath.set(hit, []);
                byPath.get(hit).push(f);
            } else loose.push(f);
        }
        for (const field of fields) {
            for (const p of field.paths()) {
                const target = field.fieldAt(p);
                const list = byPath.get(p) || [];
                const errors = list.filter((f) => f.severity !== 'warning');
                target.setError(list.map((f) => f.message).join(' '), errors.length ? 'error' : 'warning');
            }
        }
        findingsBox.replaceChildren();
        for (const f of loose) {
            const li = el('li', `twm-flow-panel__finding${f.severity === 'warning' ? ' twm-flow-panel__finding--warning' : ''}`);
            li.append(icon(f.severity === 'warning' ? 'warning' : 'error', 'twm-flow-panel__finding-icon'),
                      el('span', 'twm-flow-panel__finding-text', String(f.message ?? '')));
            findingsBox.appendChild(li);
        }
        findingsBox.hidden = loose.length === 0;
    }

    return {
        el: root,
        /** Draw a step's (or, with no `step`, the flow's) settings. */
        show(next) {
            const sameStep = spec && next && (spec.step?.id ?? null) === (next.step?.id ?? null);
            const held = heldFocus();
            spec = { ...next };
            current = { ...(next.value ?? next.step?.config ?? {}) };
            paint();
            if (held && sameStep) restoreFocus(held);
            else if (held) onFocusLost?.();
        },
        /** Empty the panel. */
        clear() {
            const held = heldFocus();
            spec = null;
            current = {};
            paint();
            if (held) onFocusLost?.();
        },
        get stepId() { return stepId(); },
        get value() { return { ...current }; },
        setFindings(list) {
            findings = Array.isArray(list) ? list.filter((f) => f && typeof f === 'object')
                : [...(list?.errors || []), ...(list?.warnings || [])];
            applyFindings();
        },
        /** Focus the field a finding's `field` names (the longest prefix); false when none. */
        focusField(path) {
            const hit = matchFindingField(fields.flatMap((f) => f.paths()), path);
            const field = hit ? fields.map((f) => f.fieldAt(hit)).find(Boolean) : null;
            if (!field) return false;
            field.el.scrollIntoView?.({ block: 'nearest' });
            return field.focus();
        },
        /** Redraw the consumer's slots only — no field is rebuilt. */
        repaintSlots() { paintSlots(); },
        setReadOnly(next) {
            ro = next;
            repaint();
        },
        destroy() {
            destroyed = true;
            for (const f of fields) f.destroy?.();
            fields = [];
            root.remove();
        },
    };
}
