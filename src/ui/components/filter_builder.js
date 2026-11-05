/**
 * The filter editor: `createFilterBuilder`, mountable anywhere, and
 * `openFilterDialog`, the same builder in a modal with a name, an icon, a
 * consumer's live preview and an async submit.
 *
 * It never decides what a filter MEANS. That is the bound model's
 * (`filter_model.js`); this file only edits the expression and asks the model.
 *
 * Every row closes over the node it edits, so nothing about the expression is
 * kept in the DOM. A STRUCTURAL change (add, remove, field, operator, AND/OR, NOT)
 * redraws the tree and puts the focus back; typing in a value control writes to
 * the node and redraws nothing, so the caret survives.
 *
 * WHAT IT DOES NOT REWRITE. A condition on a field the catalogue does not know, an
 * operator it does not know and a node it cannot read stay exactly as they are
 * until someone changes or removes them: the selects show them as their own marked
 * entry and the value is read-only.
 */

import { cloneFilter, coerceFilterValue, emptyFilter, filterOptions } from './filter_model.js';
import { selectBox } from './choice_controls.js';
import { createTagInput } from './tag_input.js';
import { openConfirm, openModal } from './modal.js';

const PREVIEW_DEBOUNCE_MS = 120;
/** The icon grid's columns; `.twm-filter-dialog__icon-grid` draws the same number. */
const ICON_COLUMNS = 8;
const SUBMIT = 'submit';
const CLEAR = 'clear';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function button(className, text, onClick, { title, label } = {}) {
    const node = el('button', className, text);
    node.type = 'button';
    if (title) node.title = title;
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
}

const SELECT_CLASS = 'twm-filter-builder__input twm-filter-builder__select';
const INPUT_CLASS = 'twm-filter-builder__input';
const SMALL_BUTTON = 'twm-btn twm-filter-builder__add';
const REMOVE_BUTTON = 'twm-btn-icon twm-filter-builder__remove';

/** The root is always a group: an expression may legitimately be a bare clause. */
function asRoot(expr) {
    if (!expr || typeof expr !== 'object') return emptyFilter();
    const copy = cloneFilter(expr);
    return copy.kind === 'group' ? copy : { kind: 'group', op: 'AND', children: [copy] };
}

/**
 * Mount a filter builder.
 *
 * @param {HTMLElement} host
 * @param {object}   options
 * @param {object}   options.model     from `createFilterModel`
 * @param {object}   [options.value]   the expression to edit (copied)
 * @param {(expr: object) => void} [options.onChange]  a copy, after each change
 * @returns {{ el: HTMLElement, getValue(): object, setValue(expr: object): void,
 *             validate(): {ok: boolean, errors: string[]}, focus(): void, destroy(): void }}
 */
export function createFilterBuilder(host, { model, value = null, onChange = null } = {}) {
    if (!model) throw new Error('[FilterBuilder] needs a filter model');
    const rootEl = el('div', 'twm-filter-builder');
    let root = asRoot(value);
    /** Node to its parent group, for removal; rebuilt by each redraw. */
    let parents = new WeakMap();
    /** Node to its focusable controls by role; rebuilt by each redraw. */
    let controls = new WeakMap();
    /** Each value cell's disposer: a redraw releases what the cells mounted. */
    const cells = new Set();

    const changed = () => onChange?.(cloneFilter(root));

    const register = (node, role, control) => {
        if (!controls.has(node)) controls.set(node, {});
        controls.get(node)[role] = control;
    };

    function redraw(focusNode = null, focusRole = null) {
        for (const cell of cells) cell.dispose();
        cells.clear();
        parents = new WeakMap();
        controls = new WeakMap();
        rootEl.replaceChildren(groupEl(root, true));
        if (focusNode) controls.get(focusNode)?.[focusRole]?.focus();
    }

    /** A structural edit: the expression changed shape, so the tree is redrawn. */
    function restructure(focusNode, focusRole) {
        redraw(focusNode, focusRole);
        changed();
    }

    /** Remove `node`, and any nested group that leaves empty. Returns the group that remains. */
    function removeNode(node) {
        let gone = node;
        for (;;) {
            const parent = parents.get(gone);
            parent.children.splice(parent.children.indexOf(gone), 1);
            if (parent.children.length || !parents.has(parent)) return parent;
            gone = parent;
        }
    }

    const removeButton = (node, label) => button(REMOVE_BUTTON, '×', () => {
        restructure(removeNode(node), 'addClause');
    }, { title: label, label });

    function groupEl(group, isRoot) {
        if (!Array.isArray(group.children)) group.children = [];
        const box = el('div', `twm-filter-builder__group${isRoot ? ' twm-filter-builder__group--root' : ''}`);
        const noun = model.noun;

        const head = el('div', 'twm-filter-builder__group-head');
        const seg = el('div', 'twm-filter-builder__seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Match mode');
        for (const op of ['AND', 'OR']) {
            const on = group.op === op;
            const toggle = button(`twm-filter-builder__seg-btn${on ? ' twm-filter-builder__seg-btn--on' : ''}`, op, () => {
                if (group.op === op) return;
                group.op = op;
                restructure(group, op);
            });
            toggle.setAttribute('aria-pressed', String(on));
            register(group, op, toggle);
            seg.appendChild(toggle);
        }
        const not = button(`twm-filter-builder__not${group.negate ? ' twm-filter-builder__not--on' : ''}`, 'NOT', () => {
            if (group.negate) delete group.negate;
            else group.negate = true;
            restructure(group, 'not');
        }, { title: 'Invert this group' });
        not.setAttribute('aria-pressed', String(!!group.negate));
        register(group, 'not', not);
        head.append(seg, not, el('span', 'twm-filter-builder__hint',
            group.op === 'OR' ? 'any condition matches' : 'all conditions match'));
        if (!isRoot) head.appendChild(removeButton(group, 'Remove group'));
        box.appendChild(head);

        const children = el('div', 'twm-filter-builder__children');
        for (const child of group.children) {
            parents.set(child, group);
            if (child?.kind === 'group') children.appendChild(groupEl(child, false));
            else if (child?.kind === 'clause') children.appendChild(clauseEl(child));
            else children.appendChild(carriedEl(child));
        }
        if (!group.children.length) {
            const matches = model.emptyMatches(group) !== !!group.negate;
            children.appendChild(el('div', 'twm-filter-builder__empty', matches
                ? `No conditions: this group matches every ${noun}.`
                : `No conditions: this group matches no ${noun}.`));
        }
        box.appendChild(children);

        const foot = el('div', 'twm-filter-builder__group-foot');
        const add = (factory, focusRole) => {
            const node = factory();
            if (!node) return;
            group.children.push(node);
            restructure(node, focusRole);
        };
        const offerable = !!model.newClause();
        const addClause = button(SMALL_BUTTON, '+ Condition', () => add(() => model.newClause(), 'field'));
        addClause.disabled = !offerable;
        register(group, 'addClause', addClause);
        // Seeded with one condition: an empty group matches everything, which
        // reads as a mistake the moment it appears.
        const addGroup = button(SMALL_BUTTON, '+ Group', () => add(
            () => ({ kind: 'group', op: 'AND', children: [model.newClause()] }), 'addClause',
        ));
        addGroup.disabled = !offerable;
        foot.append(addClause, addGroup);
        box.appendChild(foot);
        return box;
    }

    /** A node the model cannot read: shown as it is and kept as it is. */
    function carriedEl(node) {
        const row = el('div', 'twm-filter-builder__row twm-filter-builder__row--carried');
        const text = el('span', 'twm-filter-builder__carried', model.describeFilter(node));
        text.title = 'This editor cannot draw this condition. It is kept exactly as it is; remove it to drop it.';
        row.append(text, removeButton(node, 'Remove condition'));
        return row;
    }

    function fieldChoices(current) {
        const list = [];
        const groups = new Map();
        for (const field of model.fields) {
            if (field.hidden && field.key !== current) continue;
            const option = { value: field.key, label: field.label };
            if (!field.group) {
                list.push(option);
            } else if (groups.has(field.group)) {
                groups.get(field.group).options.push(option);
            } else {
                const entry = { group: field.group, options: [option] };
                groups.set(field.group, entry);
                list.push(entry);
            }
        }
        return list;
    }

    function operatorChoices(clause) {
        const offered = model.operatorsFor(clause.field);
        const held = model.operatorById(clause.op);
        const list = held && model.fieldByKey(clause.field) && !offered.includes(held)
            ? [...offered, held] : offered;
        return list.map((op) => ({ value: op.id, label: op.label }));
    }

    function clauseEl(clause) {
        const row = el('div', 'twm-filter-builder__row');

        const fieldSelect = selectBox(fieldChoices(clause.field), clause.field, {
            label: 'Field',
            className: `${SELECT_CLASS} twm-filter-builder__select--field`,
            notFound: () => `⚠ unknown field “${model.unknownName(String(clause.field ?? ''))}”`,
        });
        fieldSelect.box.addEventListener('change', () => {
            const next = model.newClause(fieldSelect.valueOf());
            for (const key of ['op', 'value']) delete clause[key];
            Object.assign(clause, next);
            restructure(clause, 'field');
        });
        register(clause, 'field', fieldSelect.box);

        const opSelect = selectBox(operatorChoices(clause), clause.op, {
            label: 'Operator',
            className: `${SELECT_CLASS} twm-filter-builder__select--op`,
            notFound: (id) => `${id} (unknown)`,
        });
        opSelect.box.addEventListener('change', () => {
            clause.op = opSelect.valueOf();
            const fresh = model.defaultValue(model.fieldByKey(clause.field), model.operatorById(clause.op));
            if (fresh === undefined) delete clause.value;
            else clause.value = fresh;
            restructure(clause, 'op');
        });
        register(clause, 'op', opSelect.box);

        const cellEl = el('div', 'twm-filter-builder__value');
        const cell = { dispose() {} };
        cells.add(cell);
        const drawCell = (focus = false) => {
            cell.dispose();
            cell.dispose = () => {};
            cellEl.replaceChildren();
            drawValue(clause, cellEl, cell, drawCell);
            if (focus) cellEl.querySelector('select, input')?.focus();
        };
        drawCell();

        row.append(fieldSelect.box, opSelect.box, cellEl, removeButton(clause, 'Remove condition'));
        return row;
    }

    function drawValue(clause, cellEl, cell, drawCell) {
        const field = model.fieldByKey(clause.field);
        const op = model.operatorById(clause.op);
        if (!field || !op) {
            if (clause.value !== undefined) {
                cellEl.appendChild(el('span', 'twm-filter-builder__carried', JSON.stringify(clause.value)));
            }
            return;
        }
        if (!op.arity) return;

        const write = (next) => {
            clause.value = next;
            changed();
        };
        const custom = field.editor?.({ field, op, value: clause.value, label: field.label, onChange: write });
        if (custom) {
            cellEl.appendChild(custom.el);
            cell.dispose = () => custom.destroy?.();
            return;
        }

        if (op.multi) {
            if (filterOptions(field).length) drawChosenOptions(clause, field, cellEl, drawCell, write);
            else drawTags(clause, field, cellEl, cell, write);
            return;
        }
        if (op.arity === 2) {
            const pair = Array.isArray(clause.value) ? [...clause.value] : ['', ''];
            const box = (i) => scalarInput(field, op, pair[i], (v) => {
                pair[i] = v;
                write([...pair]);
            });
            cellEl.append(box(0), el('span', 'twm-filter-builder__and', 'and'), box(1));
            return;
        }
        const options = field.type === 'enum' ? filterOptions(field) : [];
        if (options.length) {
            const choice = selectBox(options, clause.value, {
                label: field.label,
                className: `${SELECT_CLASS} twm-filter-builder__select--value`,
                notFound: (v) => `${v} (unknown)`,
            });
            // A select cannot show "nothing": what it holds is the honest value.
            if (clause.value === undefined || clause.value === null || clause.value === '') {
                clause.value = choice.valueOf();
            }
            choice.box.addEventListener('change', () => write(choice.valueOf()));
            cellEl.appendChild(choice.box);
            return;
        }
        cellEl.appendChild(scalarInput(field, op, Array.isArray(clause.value) ? clause.value[0] : clause.value, write));
        if (op.input === 'days') cellEl.appendChild(el('span', 'twm-filter-builder__and', 'days'));
    }

    function scalarInput(field, op, current, write) {
        const input = el('input', INPUT_CLASS);
        const numeric = field.type === 'number' || op.input === 'days';
        if (numeric) {
            input.type = 'number';
            input.step = 'any';
        } else if (field.type === 'date') {
            input.type = field.time ? 'datetime-local' : 'date';
        } else {
            input.type = 'text';
            input.placeholder = 'value…';
        }
        input.setAttribute('aria-label', field.label);
        input.value = current ?? '';
        const type = numeric ? { type: 'number' } : field;
        input.addEventListener('input', () => write(coerceFilterValue(type, input.value)));
        return input;
    }

    function asList(value) {
        if (Array.isArray(value)) return value;
        return value === '' || value === null || value === undefined ? [] : [value];
    }

    /** Free values, as tags. */
    function drawTags(clause, field, cellEl, cell, write) {
        const tags = createTagInput(cellEl, {
            value: asList(clause.value).map(String),
            placeholder: 'value…',
            label: field.label,
            className: 'twm-filter-builder__tags',
            onChange: (list) => write(list.map((v) => coerceFilterValue(field, v))),
        });
        cell.dispose = () => tags.dispose();
    }

    /** Values from a fixed list: the chosen as chips, and a select of what is left. */
    function drawChosenOptions(clause, field, cellEl, drawCell, write) {
        const options = filterOptions(field);
        const chosen = asList(clause.value);
        const labelOf = (v) => options.find((o) => o.value === v)?.label ?? String(v);
        const box = el('div', 'twm-filter-builder__chosen');
        chosen.forEach((v, i) => {
            const chip = el('span', 'twm-filter-builder__chip', labelOf(v));
            chip.appendChild(button('twm-filter-builder__chip-remove', '×', () => {
                write(chosen.filter((_, at) => at !== i));
                drawCell(true);
            }, { label: `Remove ${labelOf(v)}` }));
            box.appendChild(chip);
        });
        const rest = options.filter((o) => !chosen.includes(o.value));
        if (rest.length) {
            const adder = selectBox(rest, undefined, {
                empty: '+ value',
                keepMissing: false,
                label: `Add a value to ${field.label}`,
                className: `${SELECT_CLASS} twm-filter-builder__select--add`,
            });
            adder.box.addEventListener('change', () => {
                const next = adder.valueOf();
                if (next === undefined) return;
                write([...chosen, next]);
                drawCell(true);
            });
            box.appendChild(adder.box);
        }
        cellEl.appendChild(box);
    }

    redraw();
    host.appendChild(rootEl);

    return {
        el: rootEl,
        getValue: () => cloneFilter(root),
        /** Replaces the expression. Does not call `onChange`. */
        setValue(expr) {
            root = asRoot(expr);
            redraw();
        },
        validate: () => model.validateFilter(root),
        focus() { rootEl.querySelector('select, input, button')?.focus(); },
        destroy() {
            for (const cell of cells) cell.dispose();
            cells.clear();
            rootEl.remove();
        },
    };
}

/** The dialog's icon choice: a button over a searchable grid. */
function createIconPicker({ value, options, onChange }) {
    let current = value;
    const root = el('div', 'twm-filter-dialog__icon');
    const glyph = (name) => el('span', 'material-symbols-outlined', name);
    const trigger = button('twm-btn twm-filter-dialog__icon-trigger', null, () => (pop.hidden ? open() : close()), {
        title: 'Icon', label: 'Icon',
    });
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const face = glyph(current);
    trigger.appendChild(face);

    const pop = el('div', 'twm-filter-dialog__icon-pop');
    pop.hidden = true;
    const search = el('input', `${INPUT_CLASS} twm-filter-dialog__icon-search`);
    search.type = 'text';
    search.placeholder = 'Search icons…';
    search.setAttribute('aria-label', 'Search icons');
    const grid = el('div', 'twm-filter-dialog__icon-grid');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Icon');
    const none = el('div', 'twm-filter-dialog__icon-none', 'No icon matches.');
    pop.append(search, grid, none);
    root.append(trigger, pop);

    const pick = (name) => {
        current = name;
        face.textContent = name;
        close();
        onChange(name);
    };
    const drawGrid = () => {
        const query = search.value.trim().toLowerCase();
        const list = query ? options.filter((n) => n.toLowerCase().includes(query)) : options;
        none.hidden = list.length > 0;
        grid.replaceChildren(...list.map((name) => {
            const on = name === current;
            const option = button(`twm-filter-dialog__icon-option${on ? ' twm-filter-dialog__icon-option--on' : ''}`,
                null, () => pick(name), { title: name });
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(on));
            option.appendChild(glyph(name));
            return option;
        }));
    };
    function open() {
        search.value = '';
        drawGrid();
        pop.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        search.focus();
    }
    function close(refocus = true) {
        if (pop.hidden) return;
        pop.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (refocus) trigger.focus();
    }

    search.addEventListener('input', drawGrid);
    search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            grid.firstElementChild?.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            grid.firstElementChild?.click();
        }
    });
    grid.addEventListener('keydown', (e) => {
        const items = [...grid.children];
        const at = items.indexOf(e.target.closest('button'));
        if (at < 0) return;
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: ICON_COLUMNS, ArrowUp: -ICON_COLUMNS }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        if (at + step < 0 && e.key === 'ArrowUp') search.focus();
        else items[at + step]?.focus();
    });
    // The window answers an Esc nobody else has: this one closes only the grid.
    pop.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
    });

    return { el: root, close, value: () => current };
}

/**
 * Open the builder in a modal.
 *
 * @param {object}   options
 * @param {object}   options.model      from `createFilterModel`
 * @param {object}   [options.value]    the expression to edit (copied; Cancel is lossless)
 * @param {string}   [options.seedField]  a field key: a new empty condition on it is
 *   added, so "filter by this" lands on a form about that field
 * @param {string}   [options.title]
 * @param {string}   [options.icon]     the window's icon
 * @param {HTMLElement} [options.head]  drawn above the conditions
 * @param {{value?: string, label?: string, placeholder?: string, required?: boolean}} [options.name]
 *   adds a name box; the result carries `name`
 * @param {{value?: string, options: string[]}} [options.iconChoice]
 *   adds an icon picker over those Material Symbols names; the result carries `icon`
 * @param {(host: HTMLElement, state: {expr: object, sentence: string, signal: AbortSignal}) => void} [options.preview]
 *   the live preview: draws into `host` on open and, debounced, after each change
 *   while the expression can be submitted. `signal` aborts when this drawing is
 *   superseded or the dialog closes, for a preview that asks a server.
 * @param {boolean}  [options.requireValid]  submit only a valid expression (default
 *   true); its errors are listed. False lets one with an unknown field through.
 * @param {boolean}  [options.prune]    drop half-built rows from what is validated,
 *   previewed and submitted (`model.pruneFilter`); `expr` is null when nothing is left
 * @param {boolean}  [options.confirmDiscard]  ask before closing with unsaved changes
 * @param {string}   [options.submitLabel]
 * @param {(result: object) => any} [options.onSubmit]  may be async: until it settles
 *   every button is off and Esc and the X do nothing, so the answer is what happened.
 *   If it throws, the dialog shows the error and stays.
 * @param {string}   [options.clearLabel]  adds a button answering `{ action: 'clear', expr: null }`
 * @param {Array<{label: string, value: string, danger?: boolean, icon?: string,
 *   confirm?: object, run?: (result: object) => any}>} [options.actions]
 *   more buttons, before Cancel. `confirm` is `openConfirm`'s options, asked first;
 *   `run` is like `onSubmit`.
 * @param {number}   [options.width]
 * @param {number}   [options.height]
 * @returns {Promise<{action: string, expr: object|null, name?: string, icon?: string}|null>}
 *   null when dismissed
 */
export async function openFilterDialog({
    model, value = null, seedField = null, title = 'Filter', icon = 'filter_alt', head = null,
    name = null, iconChoice = null, preview = null,
    requireValid = true, prune = false, confirmDiscard = false,
    submitLabel = 'Apply', onSubmit = null, clearLabel = null, actions = [],
    width = preview ? 920 : 760, height = 560,
} = {}) {
    if (!model) throw new Error('[FilterDialog] needs a filter model');

    const start = asRoot(value);
    if (seedField) {
        const seeded = model.newClause(seedField);
        if (seeded) start.children.push(seeded);
    }

    const content = el('div', 'twm-filter-dialog');
    if (head) content.appendChild(head);

    let picker = null;
    let nameInput = null;
    if (name || iconChoice) {
        const row = el('div', 'twm-filter-dialog__identity');
        if (name) {
            const label = el('label', 'twm-filter-dialog__name');
            label.appendChild(el('span', 'twm-filter-dialog__name-label', name.label ?? 'Name'));
            nameInput = el('input', INPUT_CLASS);
            nameInput.type = 'text';
            nameInput.autocomplete = 'off';
            nameInput.value = name.value ?? '';
            if (name.placeholder) nameInput.placeholder = name.placeholder;
            nameInput.addEventListener('input', refresh);
            label.appendChild(nameInput);
            row.appendChild(label);
        }
        if (iconChoice) {
            picker = createIconPicker({
                value: iconChoice.value ?? iconChoice.options[0],
                options: iconChoice.options,
                onChange: refresh,
            });
            row.appendChild(picker.el);
            content.addEventListener('mousedown', (e) => {
                if (!picker.el.contains(e.target)) picker.close(false);
            });
        }
        content.appendChild(row);
    }

    const columns = el('div', 'twm-filter-dialog__columns');
    const buildPane = el('section', 'twm-filter-dialog__pane twm-filter-dialog__pane--build');
    columns.appendChild(buildPane);
    content.appendChild(columns);

    const errorsEl = el('ul', 'twm-filter-dialog__errors');
    errorsEl.hidden = true;
    const failureEl = el('div', 'twm-filter-dialog__failure');
    failureEl.setAttribute('role', 'alert');
    failureEl.hidden = true;

    let sentenceEl = null;
    let slot = null;
    if (preview) {
        const pane = el('section', 'twm-filter-dialog__pane twm-filter-dialog__pane--preview');
        sentenceEl = el('div', 'twm-filter-dialog__sentence');
        slot = el('div', 'twm-filter-dialog__preview');
        pane.append(sentenceEl, errorsEl, slot);
        columns.appendChild(pane);
    }

    let previewTimer = 0;
    let previewRun = null;
    let controls = null;
    let busy = false;

    const builder = createFilterBuilder(buildPane, {
        model,
        value: start,
        onChange: () => {
            refresh();
            clearTimeout(previewTimer);
            previewTimer = setTimeout(drawPreview, PREVIEW_DEBOUNCE_MS);
        },
    });
    if (!preview) buildPane.appendChild(errorsEl);
    content.appendChild(failureEl);

    /** The expression as it would be submitted. */
    function current() {
        const expr = builder.getValue();
        return prune ? model.pruneFilter(expr) : expr;
    }
    const checkOf = (expr) => (expr ? model.validateFilter(expr) : { ok: true, errors: [] });

    const nameMissing = () => !!nameInput && name.required !== false && !nameInput.value.trim();
    const canSubmit = () => !busy && !nameMissing() && (!requireValid || checkOf(current()).ok);

    function refresh() {
        if (!controls) return;
        for (const { value } of modalActions) {
            controls.setActionEnabled(value, value === SUBMIT ? canSubmit() : !busy);
        }
    }

    function showErrors(errors) {
        errorsEl.replaceChildren(...errors.map((message) => el('li', '', message)));
        errorsEl.hidden = errors.length === 0;
    }
    function showFailure(message) {
        failureEl.textContent = message;
        failureEl.hidden = !message;
    }

    function drawPreview() {
        const expr = current();
        const { ok, errors } = checkOf(expr);
        previewRun?.abort();
        previewRun = null;
        const blocked = requireValid && !ok;
        showErrors(blocked ? errors : []);
        if (!preview) return;
        slot.hidden = blocked;
        if (blocked) {
            sentenceEl.textContent = '';
            slot.replaceChildren();
            return;
        }
        const shown = expr ?? emptyFilter();
        const sentence = model.describeFilter(shown);
        sentenceEl.textContent = sentence;
        previewRun = new AbortController();
        try {
            preview(slot, { expr: shown, sentence, signal: previewRun.signal });
        } catch (err) {
            showFailure(`Preview failed: ${err?.message ?? err}`);
        }
    }

    const snapshot = () => JSON.stringify([builder.getValue(), nameInput?.value ?? null, picker?.value() ?? null]);
    const initial = snapshot();

    /**
     * May the dialog close without an answer? Not while an action is in flight:
     * the caller would hear "dismissed" about a save that then completes, or
     * never see the error of one that fails. Otherwise, not without asking if
     * that loses what was typed.
     */
    function mayDiscard() {
        if (busy) return false;
        if (!confirmDiscard || snapshot() === initial) return true;
        return openConfirm({
            title: 'Discard changes?',
            message: 'This filter has unsaved changes. Closing now throws them away.',
            confirmLabel: 'Discard',
            cancelLabel: 'Keep editing',
            danger: true,
        });
    }

    async function runAction(action, close) {
        if (busy || (action.value === SUBMIT && !canSubmit())) return;
        showFailure('');
        busy = true;
        try {
            // Its question stacks over this window, so the buttons stay as they
            // are until it is answered and focus has a button to come back to.
            if (action.confirm && !await openConfirm(action.confirm)) return;
            refresh();
            const result = { action: action.value, expr: action.value === CLEAR ? null : current() };
            if (nameInput) result.name = nameInput.value.trim();
            if (picker) result.icon = picker.value();
            await action.run?.(result);
            close(result);
        } catch (err) {
            showFailure(err?.message ?? String(err));
        } finally {
            busy = false;
            refresh();
        }
    }
    const asModalAction = (action) => ({
        ...action,
        keepOpen: true,
        onClick: (close) => runAction(action, close),
    });

    const modalActions = [
        ...actions.map(asModalAction),
        {
            label: 'Cancel',
            value: 'cancel',
            keepOpen: true,
            onClick: async (close) => { if (await mayDiscard()) close(null); },
        },
    ];
    if (clearLabel) modalActions.push(asModalAction({ label: clearLabel, value: CLEAR }));
    modalActions.push({
        ...asModalAction({ label: submitLabel, value: SUBMIT, run: onSubmit }),
        primary: true,
        disabled: !canSubmit(),
    });

    const closed = openModal({
        title,
        icon,
        content,
        actions: modalActions,
        width,
        height,
        maximizable: true,
        beforeClose: mayDiscard,
        onMount: (_body, modalControls) => {
            controls = modalControls;
            refresh();
        },
    });
    drawPreview();

    try {
        return await closed;
    } finally {
        clearTimeout(previewTimer);
        previewRun?.abort();
        builder.destroy();
    }
}
