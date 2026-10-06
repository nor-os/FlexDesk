/**
 * THE SETTINGS PANEL (36 §3.4) — and the two rules it keeps.
 *
 *   §1  show(): the header (type, name, where, description, the id line, the
 *       tone), the fields from the type's schema, `role="region"`
 *   §2  a change is REPORTED, never written into the step: onChange(stepId,
 *       key, value); the step's config object is untouched
 *   §3  A REPAINT PUTS FOCUS BACK — a reshape and an `x-ui-when` key redraw
 *       the form, and the focused control is the rebuilt one, caret and
 *       selection where they were; a field that is gone hands focus to the
 *       editor (`onFocusLost`), never to <body>
 *   §4  A REPAINT THE READER DID NOT ASK FOR REBUILDS NO FIELD: setFindings and
 *       repaintSlots leave every control — the focused one included — in place
 *   §5  findings: under the field the LONGEST prefix names, nested ones under
 *       their child; the rest at the top; another step's never; the flow's on
 *       the flow's panel; focusField opens a fold and focuses
 *   §6  extra fields among the schema's, and notes; actions refused IN PLACE
 *       with their reason on screen; read-only says why and disables all
 *   §7  rename, the value picker through the consumer's provider, columns
 *   §8  show() for another step does not steal focus back into the panel
 *
 *     node tests/flow_kit_panel.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — settings panel');
const { createSettingsPanel } = await import('../src/flow/kit/settings_panel.js');
const { createWidgetRegistry } = await import('../src/flow/kit/widgets.js');
const { TEMPLATE_REFERENCES } = await import('../src/flow/kit/references.js');
const { closeFlowPopovers, openFlowPopover } = await import('../src/flow/kit/dom.js');
const { document, window } = t;

const HTTP = {
    type_id: 'http-request', label: 'HTTP request', description: 'Calls an address.', icon: 'public',
    config_schema: { type: 'object', required: ['url'], properties: {
        method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
        url: { type: 'string', 'x-ui-widget': 'template' },
        headers: { type: 'object', 'x-ui-widget': 'key-value-map' },
        body: { type: ['string', 'object'], 'x-ui-widget': 'json-body', 'x-ui-when': { field: 'method', in: ['POST'] } },
        label_hint: { type: 'string' },
        retry: { type: 'object', 'x-ui-fold': true, properties: { max_attempts: { type: 'integer' } } },
    } },
};
function setup(opts = {}) {
    const changes = [];
    const lost = [];
    const surface = t.host();
    surface.tabIndex = 0;
    const panel = createSettingsPanel({
        widgets: createWidgetRegistry(), references: { template: TEMPLATE_REFERENCES },
        onChange: (...a) => changes.push(a), onFocusLost: () => { lost.push(1); surface.focus(); },
        host: t.host(), ...opts,
    });
    return { panel, changes, lost, surface, el: panel.el };
}
const step = (config = {}) => ({ id: 'fetch', type: 'http-request', label: 'Fetch new applications', config });
const showStep = (panel, s, extra = {}) => panel.show({
    step: s, type: HTTP, title: s.label, typeLabel: HTTP.label, where: 'Top level · the first step',
    description: HTTP.description, idLine: 'Later steps read it as …', icon: HTTP.icon, tone: 'amber', ...extra,
});
const fieldEl = (el, path) => el.querySelector(`[data-field="${path}"]`);

t.section('§1 show()');
{
    const { panel, el } = setup();
    showStep(panel, step({ url: 'https://x' }));
    t.check('a region named Settings', [el.getAttribute('role'), el.getAttribute('aria-label')], ['region', 'Settings']);
    t.check('the header\'s lines', ['.twm-flow-panel__type', '.twm-flow-panel__title', '.twm-flow-panel__where',
            '.twm-flow-panel__description', '.twm-flow-panel__id'].map((s) => el.querySelector(s)?.textContent),
            ['HTTP request', 'Fetch new applications', 'Top level · the first step', 'Calls an address.', 'Later steps read it as …']);
    t.ok('the tone is a class on the icon chip', el.querySelector('.twm-flow-panel__icon--amber') !== null);
    t.check('the schema\'s fields, x-ui-when honoured (GET hides the body)',
            [...el.querySelectorAll('.twm-flow-panel__fields > .twm-flow-field')].map((f) => f.dataset.field),
            ['method', 'url', 'headers', 'label_hint', 'retry']);
    t.check('the stepId', panel.stepId, 'fetch');
}

t.section('§2 a change is reported, never written into the step');
{
    const { panel, el, changes } = setup();
    const s = step({ url: 'https://x' });
    showStep(panel, s);
    t.typeInto(fieldEl(el, 'label_hint').querySelector('input'), 'hello');
    t.check('onChange(stepId, key, value)', changes, [['fetch', 'label_hint', 'hello']]);
    t.check('the step\'s own config object is untouched', s.config, { url: 'https://x' });
    t.check('the panel\'s working copy has it', panel.value, { url: 'https://x', label_hint: 'hello' });
}

t.section('§3 a repaint puts focus back');
{
    const { panel, el, lost } = setup();
    showStep(panel, step({}));
    const sel = fieldEl(el, 'method').querySelector('select');
    sel.focus();
    t.change(sel, '2');
    t.ok('an x-ui-when key redraws the form: the body appears', fieldEl(el, 'body') !== null);
    const again = fieldEl(el, 'method').querySelector('select');
    t.ok('the select was rebuilt, and focus is on the NEW one', again !== sel && document.activeElement === again);
    t.check('no focus was lost', lost.length, 0);
    const box = fieldEl(el, 'label_hint').querySelector('input');
    box.value = 'abcdef';
    box.focus();
    box.setSelectionRange(2, 4);
    panel.show({ ...panelSpec(panel), value: { ...panel.value, label_hint: 'abcdef' } });
    const rebuilt = fieldEl(el, 'label_hint').querySelector('input');
    t.ok('show() for the same step rebuilds and refocuses the same field', rebuilt !== box && document.activeElement === rebuilt);
    t.check('caret and selection where they were', [rebuilt.selectionStart, rebuilt.selectionEnd], [2, 4]);
    // The chip input's caret survives too.
    const url = fieldEl(el, 'url').querySelector('.twm-flow-chipinput');
    url.replaceChildren(document.createTextNode('https://example.org'));
    url.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
    url.focus();
    const range = document.createRange();
    range.setStart(url.firstChild, 8);
    range.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    panel.show({ ...panelSpec(panel) });
    const url2 = fieldEl(el, 'url').querySelector('.twm-flow-chipinput');
    t.ok('a chip input is refocused…', url2 !== url && document.activeElement === url2);
    const r2 = document.getSelection().getRangeAt(0);
    t.check('…with its caret at the same text offset', [r2.startContainer === url2.firstChild, r2.startOffset], [true, 8]);
    // A field that is gone: the editor gets the focus. (The body was focused
    // when the method changed back to GET, which hides it.)
    fieldEl(el, 'body').querySelector('.twm-flow-chipinput').focus();
    t.change(fieldEl(el, 'method').querySelector('select'), '1');
    t.ok('the body is gone', fieldEl(el, 'body') === null);
    t.check('the field that held focus is gone: focus goes to the editor', lost.length, 1);
    t.ok('never to <body>', document.activeElement !== document.body && document.activeElement === surfaceOf(el));
    fieldEl(el, 'label_hint').querySelector('input').focus();
    panel.show({ ...panelSpec(panel), fields: [] });
    t.check('a show() without the field does the same', lost.length, 2);
}
function surfaceOf() {
    return document.activeElement?.tabIndex === 0 && !document.activeElement.closest('.twm-flow-panel')
        ? document.activeElement : null;
}
function panelSpec(panel) {
    return { step: { id: panel.stepId, type: 'http-request', label: 'Fetch new applications', config: panel.value },
             type: HTTP, title: 'Fetch new applications', typeLabel: HTTP.label, value: panel.value, tone: 'amber' };
}

t.section('§4 setFindings and repaintSlots rebuild no field');
{
    let drawnAfter = 0;
    const { panel, el } = setup();
    showStep(panel, step({}), { slots: { after: (box) => { drawnAfter += 1; box.appendChild(document.createTextNode(`run ${drawnAfter}`)); } } });
    const box = fieldEl(el, 'label_hint').querySelector('input');
    box.focus();
    panel.setFindings([{ code: 'x', message: 'Url needs a value.', severity: 'error', node_id: 'fetch', field: 'url' }]);
    t.ok('findings: the same control, still focused', fieldEl(el, 'label_hint').querySelector('input') === box
         && document.activeElement === box);
    panel.repaintSlots();
    t.ok('slots: redrawn…', drawnAfter === 2 && el.querySelector('.twm-flow-panel__slot[data-slot="after"]').textContent === 'run 2');
    t.ok('…and the same control, still focused', fieldEl(el, 'label_hint').querySelector('input') === box
         && document.activeElement === box);
}

t.section('§5 findings');
{
    const { panel, el } = setup();
    showStep(panel, step({ method: 'POST' }));
    panel.setFindings({ errors: [
        { code: 'a', message: 'Url needs a value.', severity: 'error', node_id: 'fetch', field: 'url' },
        { code: 'b', message: 'A header has no name.', severity: 'error', node_id: 'fetch', field: 'headers.X-Key' },
        { code: 'c', message: 'Too many attempts.', severity: 'error', node_id: 'fetch', field: 'retry.max_attempts' },
        { code: 'd', message: 'This step is never reached.', severity: 'error', node_id: 'fetch' },
        { code: 'e', message: 'Another step.', severity: 'error', node_id: 'save', field: 'url' },
        { code: 'f', message: 'The flow has no end.', severity: 'error' },
    ], warnings: [{ code: 'g', message: 'urlx is odd.', severity: 'warning', node_id: 'fetch', field: 'urlx' }] });
    const err = (p) => fieldEl(el, p).querySelector(':scope > .twm-flow-field__body > .twm-flow-field__error');
    t.check('under its field', err('url').textContent.trim(), 'errorUrl needs a value.');
    t.ok('a deeper path under the longest prefix that is a field', err('headers').textContent.includes('A header has no name.'));
    t.ok('a nested setting under its child, not its group', err('retry.max_attempts').textContent.includes('Too many attempts.')
         && err('retry').hidden);
    t.check('no field, or no field it names: at the top', [...el.querySelectorAll('.twm-flow-panel__finding')].map((x) =>
            x.querySelector('.twm-flow-panel__finding-text').textContent), ['This step is never reached.', 'urlx is odd.']);
    t.ok('another step\'s finding is not here', !el.textContent.includes('Another step.'));
    t.ok('nor the flow\'s', !el.textContent.includes('The flow has no end.'));
    t.ok('focusField opens the fold and focuses the nested box', panel.focusField('retry.max_attempts')
         && document.activeElement === fieldEl(el, 'retry.max_attempts').querySelector('input')
         && fieldEl(el, 'retry').querySelector('details').open);
    t.ok('a path no field takes: false', panel.focusField('nothing.here') === false);
    panel.setFindings([]);
    t.ok('cleared', err('url').hidden && el.querySelector('.twm-flow-panel__findings').hidden);
    panel.setFindings([{ code: 'f', message: 'The flow has no end.', severity: 'error' }]);
    panel.show({ step: null, type: null, title: 'Sync', typeLabel: 'Flow', fields: [{ key: 'name', spec: { type: 'string' } }],
                 value: { name: 'Sync' } });
    t.ok('the flow\'s own findings on the flow\'s panel', el.textContent.includes('The flow has no end.') && panel.stepId === null);
}

t.section('§6 extra fields, notes, actions, read-only');
{
    const { panel, el } = setup();
    let armed = null;
    let removed = 0;
    showStep(panel, step({}), {
        extra: [
            { key: 'port:error', after: 'headers', value: 'fail', set: (v) => { armed = v; },
              spec: { type: 'string', enum: ['fail', 'arm'], title: 'If it fails', 'x-ui-widget': 'choice-cards',
                      'x-ui-enum-labels': { fail: 'Fail the run', arm: 'Run the steps under “If it fails”' } } },
            { note: 'True runs the steps under Then.', at: 'start' },
        ],
        actions: [{ id: 'duplicate', label: 'Duplicate', icon: 'content_copy', run: () => {} },
                  { id: 'remove', label: 'Remove step', danger: true, disabled: true, reason: 'The first step cannot be removed.',
                    run: () => { removed += 1; } }],
    });
    const order = [...el.querySelectorAll('.twm-flow-panel__fields > *')].map((n) => n.dataset.field ?? n.className);
    t.check('the note first, the extra after the field it names', order,
            ['twm-flow-panel__note', 'method', 'url', 'headers', 'port:error', 'label_hint', 'retry']);
    const radios = fieldEl(el, 'port:error').querySelectorAll('input[type="radio"]');
    radios[1].checked = true; t.fire(radios[1], 'change');
    t.check('an extra field reports to its own set', armed, 'arm');
    const remove = el.querySelector('[data-action="remove"]');
    t.ok('a refused action is disabled', remove.disabled);
    t.ok('and its reason is ON SCREEN beside it', remove.parentElement.querySelector('.twm-flow-panel__refusal')?.textContent
         === 'The first step cannot be removed.');
    t.press(remove);
    t.check('a disabled action never runs', removed, 0);
    panel.setReadOnly({ reason: 'Drawn as a list: this flow is not block-shaped.' });
    t.check('read-only says why, on screen', el.querySelector('.twm-flow-panel__readonly')?.textContent,
            'Drawn as a list: this flow is not block-shaped.');
    t.ok('every control is disabled or read-only', [...el.querySelectorAll('select, input')].every((c) => c.disabled || c.readOnly)
         && [...el.querySelectorAll('.twm-flow-chipinput')].every((c) => c.getAttribute('contenteditable') === 'false'));
    t.ok('every action too', [...el.querySelectorAll('[data-action]')].every((b) => b.disabled));
}

t.section('§7 rename, values, columns');
{
    const renames = [];
    const asked = [];
    const { panel, el, changes } = setup({
        onRename: (id, label) => renames.push([id, label]),
        values: async (q) => { asked.push(q); return { groups: [{ id: 'run', label: 'Run input', items: [{ label: 'since', ref: '${run.since}' }] }],
                                                       note: 'Only steps that always run before this one are listed.' }; },
        columns: (s) => (s?.id === 'fetch' ? [{ name: 'id' }, { name: 'email' }] : null),
    });
    const s = step({});
    showStep(panel, s, { rename: true, fields: [{ key: 'url', spec: { type: 'string', 'x-ui-widget': 'template' } },
                                                 { key: 'col', spec: { type: 'string', 'x-ui-widget': 'upstream-column' } }] });
    const title = el.querySelector('.twm-flow-panel__title-input');
    t.typeInto(title, 'Fetch');
    t.check('the title reports a rename', renames, [['fetch', 'Fetch']]);
    panel.show({ step: { ...s, label: 'Fetch' }, type: HTTP, title: 'Fetch', rename: true,
                 fields: [{ key: 'method', spec: HTTP.config_schema.properties.method },
                          { key: 'body', spec: HTTP.config_schema.properties.body }] });
    t.typeInto(el.querySelector('.twm-flow-panel__title-input'), 'Fetch them all');
    t.change(fieldEl(el, 'method').querySelector('select'), '2');
    t.ok('a reshape after a rename draws the NEW title', fieldEl(el, 'body') !== null
         && el.querySelector('.twm-flow-panel__title-input').value === 'Fetch them all');
    showStep(panel, s, { rename: true, fields: [{ key: 'url', spec: { type: 'string', 'x-ui-widget': 'template' } },
                                                 { key: 'col', spec: { type: 'string', 'x-ui-widget': 'upstream-column' } }] });
    t.check('the columns provider is asked for this step', [...fieldEl(el, 'col').querySelectorAll('option')].map((o) => o.textContent),
            ['Choose…', 'id', 'email']);
    t.press(fieldEl(el, 'url').querySelector('.twm-flow-refbox__insert'));
    await t.tick(0);
    t.check('the provider is asked for this step and field', asked.map((q) => [q.stepId, q.field]), [['fetch', 'url']]);
    const pop = openFlowPopover();
    t.ok('the picker is open, with the consumer\'s note', pop?.textContent.includes('Only steps that always run before'));
    t.press(pop.querySelector('[role="option"]'));
    t.check('the picked reference is inserted and reported', changes.at(-1), ['fetch', 'url', '${run.since}']);
    t.ok('the picker closed', openFlowPopover() === null);
    closeFlowPopovers();
}

t.section('§8 show() for another step');
{
    const { panel, el, lost } = setup();
    showStep(panel, step({}));
    fieldEl(el, 'label_hint').querySelector('input').focus();
    showStep(panel, { id: 'other', type: 'http-request', label: 'Other', config: {} });
    t.check('focus held in the old step\'s field goes to the editor, not to the new step', lost.length, 1);
    panel.clear();
    t.ok('clear() empties the panel', el.childNodes.length === 0 && panel.stepId === null);
    panel.destroy();
    t.ok('destroy() takes it off the page', !el.isConnected);
}

t.done();
