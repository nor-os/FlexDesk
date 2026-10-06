/**
 * THE WIDGETS AND THE FIELD AROUND THEM (36 §3.3).
 *
 *   §1  the registry: the ten generic widgets, exactly; a second registration
 *       THROWS; a replacement is explicit
 *   §2  a name nobody registered is REFUSED ON SCREEN, BY NAME, and the stored
 *       value is never written; a widget that throws is refused the same way
 *   §3  plain controls write only what the reader gave them: untouched is
 *       absent, emptied is removed, an enum's choice is the enum's own value
 *       (a number stays a number), a stored value the list lacks is kept
 *   §4  a group of settings writes its object; x-ui-fold folds it with a line
 *   §5  template: chips, the list-or-text rule, a reference stays a reference,
 *       half-typed JSON is kept, a text-only setting is never parsed
 *   §6  a value keeps its type in a map and a list of assignments (BUG-0058's
 *       rule, carried over)
 *   §7  string-list, enum-chips, choice-cards
 *   §8  upstream-column(s): by NAME, from ctx.columns(); a missing one kept
 *   §9  Insert a value: the "{ }" is there only when the consumer gives a
 *       picker, and what it inserts lands at the caret, as text
 *   §10 x-ui-references names the syntaxes; each widget has its default
 *   §11 read-only: every control disabled, no Add or Remove
 *
 *     node tests/flow_kit_widgets.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — widgets');
const W = await import('../src/flow/kit/widgets.js');
const { TEMPLATE_REFERENCES, FORMULA_REFERENCES } = await import('../src/flow/kit/references.js');
const { fieldsFromSchema } = await import('../src/flow/kit/settings_schema.js');
const { window, document } = t;

const REFS = { template: TEMPLATE_REFERENCES, formula: FORMULA_REFERENCES };
function field(key, spec, value, extra = {}) {
    const config = extra.config ?? {};
    const writes = [];
    const widgets = extra.widgets ?? W.createWidgetRegistry();
    const f = W.renderField({ key, spec, required: Boolean(extra.required) }, value, {
        widgets, referenceMap: REFS, readOnly: Boolean(extra.readOnly), columns: extra.columns,
        openValuePicker: extra.openValuePicker ?? null,
        set: (k, v, opts) => { writes.push([k, v, opts ?? null]); if (v === undefined) delete config[k]; else config[k] = v; },
    });
    t.host().appendChild(f.el);
    return { f, el: f.el, config, writes };
}
/** The reader typing `text` into a chip input: the DOM as the browser leaves it, then `input`. */
function typeChip(host, text) {
    host.replaceChildren(document.createTextNode(text));
    const r = document.createRange();
    r.setStart(host.firstChild, text.length);
    r.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(r);
    host.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}
const chipHosts = (el) => [...el.querySelectorAll('.twm-flow-chipinput')];
/** A chip input's text as it serialises: its text nodes and each chip's reference. */
const chipText = (host) => [...host.childNodes].map((n) => (n.nodeType === 3 ? n.data : n.dataset?.ref ?? '')).join('');

t.section('§1 the registry');
{
    const reg = W.createWidgetRegistry();
    t.check('the ten generic widgets, exactly', reg.names().sort(), ['choice-cards', 'enum-chips', 'expression', 'json-body',
            'key-value-list', 'key-value-map', 'string-list', 'template', 'upstream-column', 'upstream-columns']);
    const mine = () => ({ el: document.createElement('div') });
    reg.register('table-picker', mine);
    t.ok('a consumer\'s widget is registered', reg.has('table-picker') && reg.get('table-picker') === mine);
    t.throws('a second registration of a name throws', () => reg.register('table-picker', mine), /already registered/);
    t.throws('replacing a generic one without saying so throws', () => reg.register('expression', mine));
    reg.register('expression', mine, { replace: true });
    t.ok('…and with {replace: true} it is replaced', reg.get('expression') === mine);
    t.throws('a widget must be a function', () => reg.register('x', {}));
    t.ok('each registry is its own', !W.createWidgetRegistry().has('table-picker'));
}

t.section('§2 an unknown widget is refused by name, and never written');
{
    const { el, writes } = field('secret', { type: 'string', 'x-ui-widget': 'secret-picker' }, 'kept');
    t.check('the field carries the refusal', el.dataset.refusal, 'secret-picker');
    t.ok('the sentence is on screen and names the widget', el.textContent.includes('"secret-picker"'));
    t.check('it wrote nothing', writes, []);
    const reg = W.createWidgetRegistry();
    reg.register('broken', () => { throw new Error('no api'); });
    const broken = field('x', { 'x-ui-widget': 'broken' }, 'v', { widgets: reg });
    t.ok('a widget that throws is refused on screen, with why', broken.el.textContent.includes('no api') && broken.writes.length === 0);
    const none = field('list', { type: 'array' }, [1]);
    t.ok('a type with no plain control says so', none.el.querySelector('.twm-flow-field__refusal') !== null && none.writes.length === 0);
}

t.section('§3 plain controls write only what the reader gave');
{
    const schema = { properties: {
        level: { type: 'string', enum: ['info', 'error'], default: 'info' },
        size: { type: 'integer', enum: [1, 2, 3] },
        flag: { type: 'boolean', default: false },
        count: { type: 'integer', minimum: 1, maximum: 9 },
        name: { type: 'string', 'x-ui-placeholder': 'A name' },
        notes: { type: 'string', 'x-ui-multiline': true },
    }, required: ['level'] };
    const fields = fieldsFromSchema(schema);
    const config = {};
    const drawn = fields.map((f) => field(f.key, f.spec, undefined, { config, required: f.required }));
    t.check('untouched is absent', config, {});
    t.ok('required is marked on screen', drawn[0].el.querySelector('.twm-flow-field__required') !== null);
    const sel = drawn[0].el.querySelector('select');
    t.check('the empty option names the default', sel.options[0].textContent, 'Default (info)');
    t.change(sel, '2');
    t.check('a choice is the enum\'s value', config.level, 'error');
    t.change(sel, '');
    t.ok('choosing the default again removes it', !('level' in config));
    const sizes = drawn[1].el.querySelector('select');
    t.change(sizes, '2');
    t.check('a number enum writes a NUMBER', [config.size, typeof config.size], [2, 'number']);
    const box = drawn[2].el.querySelector('input[type="checkbox"]');
    box.checked = true; t.fire(box, 'change');
    t.check('a box ticked away from its default is written', config.flag, true);
    box.checked = false; t.fire(box, 'change');
    t.ok('ticked back to the default, removed', !('flag' in config));
    const n = drawn[3].el.querySelector('input[type="number"]');
    t.check('a number box carries its bounds', [n.min, n.max, n.step], ['1', '9', '1']);
    t.typeInto(n, '4');
    t.check('a number is written as a number', config.count, 4);
    t.typeInto(n, '');
    t.ok('emptied, removed', !('count' in config));
    const name = drawn[4].el.querySelector('input');
    t.check('the placeholder hint', name.placeholder, 'A name');
    t.typeInto(name, '  ');
    t.ok('blank text is no value', !('name' in config));
    t.typeInto(name, 'Ada');
    t.check('text', config.name, 'Ada');
    t.ok('x-ui-multiline is a textarea', drawn[5].el.querySelector('textarea') !== null);
    t.ok('the label names the control', drawn[4].el.querySelector('label').htmlFor === name.id);
    const kept = field('level', schema.properties.level, 'debug');
    t.check('a stored value the list lacks is kept as its own option', kept.el.querySelector('select').selectedOptions[0].textContent,
            'debug (not found)');
    t.change(kept.el.querySelector('select'));
    t.check('…and written back as itself when the reader re-picks it', kept.config.level, 'debug');
}

t.section('§4 a group of settings');
{
    const spec = { type: 'object', properties: { max_attempts: { type: 'integer' }, backoff: { type: 'string', enum: ['fixed', 'doubling'] } } };
    const open = field('retry', spec, undefined);
    t.ok('drawn open without x-ui-fold', open.el.querySelector('details').open);
    t.typeInto(open.el.querySelector('input[type="number"]'), '4');
    t.check('a nested setting writes its object', open.config.retry, { max_attempts: 4 });
    t.ok('nested fields carry dotted paths', open.el.querySelector('[data-field="retry.max_attempts"]') !== null);
    const folded = field('retry', { ...spec, 'x-ui-fold': true }, { max_attempts: 3, backoff: 'doubling' });
    t.ok('x-ui-fold: folded', !folded.el.querySelector('details').open);
    t.check('with a one-line summary of what is set', folded.el.querySelector('summary').textContent,
            'Max attempts 3 · Backoff doubling');
    t.check('nothing set: "Defaults"', field('retry', { ...spec, 'x-ui-fold': true }, undefined).el.querySelector('summary').textContent,
            'Defaults');
    t.typeInto(open.el.querySelector('input[type="number"]'), '');
    t.ok('emptying the last nested setting removes the group', !('retry' in open.config));
    t.check('paths() lists the group and its children', open.f.paths(), ['retry', 'retry.max_attempts', 'retry.backoff']);
}

t.section('§5 template');
{
    const rows = [{ key: 'grade:${row.id}', reason: 'below', done: false }];
    const list = field('rows', { type: ['string', 'array'], 'x-ui-widget': 'template' }, rows);
    const host = chipHosts(list.el)[0];
    t.check('a list is shown as JSON, its reference a chip', [JSON.parse(chipText(host)),
            [...host.querySelectorAll('[data-ref]')].map((c) => c.dataset.ref)], [rows, ['${row.id}']]);
    t.check('building it wrote nothing', list.writes, []);
    typeChip(host, JSON.stringify(rows, null, 2).replace('below', 'other'));
    t.ok('an edit is written back as the LIST, values typed as they were', Array.isArray(list.config.rows)
         && list.config.rows[0].reason === 'other' && list.config.rows[0].done === false);
    typeChip(host, '${steps.fetch.body}');
    t.check('a reference stays a reference', list.config.rows, '${steps.fetch.body}');
    typeChip(host, '[{"key": ');
    t.check('half-typed JSON is kept as typed', list.config.rows, '[{"key": ');
    typeChip(host, '   ');
    t.ok('blank is removed', !('rows' in list.config));
    const text = field('message', { type: 'string', 'x-ui-widget': 'template' }, 'x');
    typeChip(chipHosts(text.el)[0], '[1, 2] are the first two');
    t.check('a text-only setting is never parsed', text.config.message, '[1, 2] are the first two');
    t.check('a template is multi-line', chipHosts(text.el)[0].getAttribute('aria-multiline'), 'true');
    t.check('its label names the chip input', chipHosts(text.el)[0].getAttribute('aria-labelledby'),
            text.el.querySelector('label').id);
    t.check('and a list of rows is a group its label names', list.el.ownerDocument && field('h', { type: 'object',
            'x-ui-widget': 'key-value-map' }, {}).el.querySelector('.twm-flow-field__rows').getAttribute('role'), 'group');
    const body = field('body', { type: ['object', 'string'], 'x-ui-widget': 'json-body' }, undefined);
    typeChip(chipHosts(body.el)[0], '{"to": "${row.email}"}');
    t.check('json-body: JSON when it parses', body.config.body, { to: '${row.email}' });
    t.ok('json-body is monospace', chipHosts(body.el)[0].classList.contains('twm-flow-chipinput--mono'));
    const expr = field('formula', { type: 'string', 'x-ui-widget': 'expression' }, '[a] > 1');
    t.check('expression: its default syntax is the formula one', [...chipHosts(expr.el)[0].querySelectorAll('[data-ref]')]
            .map((c) => c.dataset.ref), ['[a]']);
}

t.section('§6 a value keeps its type');
{
    const stored = [
        { variable: 'count', value: 0 }, { variable: 'on', value: true }, { variable: 'label', value: '5' },
        { variable: 'n', expression: '[vars.count] + 1' }, { variable: 'shape', value: { a: 1, b: [2, 'x'] } },
        { variable: 'nothing', value: null },
    ];
    const list = field('assignments', { type: 'array', 'x-ui-widget': 'key-value-list' }, structuredClone(stored));
    const rows = () => [...list.el.querySelectorAll('.twm-flow-field__row')];
    const nameBox = (i) => rows()[i].querySelector('input.twm-flow-input');
    const valueBox = (i) => rows()[i].querySelector('.twm-flow-chipinput');
    t.check('a number and a boolean are shown as themselves', [valueBox(0).textContent, valueBox(1).textContent], ['0', 'true']);
    t.check('a formula row shows its formula, as a formula', [rows()[3].querySelector('select').selectedOptions[0].textContent,
            [...valueBox(3).querySelectorAll('[data-ref]')].map((c) => c.dataset.ref)], ['Formula', ['[vars.count]']]);
    t.typeInto(nameBox(2), 'label2');
    t.check('an edit to one row writes every other value back with its type', list.config.assignments,
            [stored[0], stored[1], { variable: 'label2', value: '5' }, stored[3], stored[4], stored[5]]);
    typeChip(valueBox(0), '7');
    typeChip(valueBox(1), 'false');
    typeChip(valueBox(4), '{"a": 2}');
    typeChip(valueBox(5), '3');
    const byName = () => Object.fromEntries(list.config.assignments.map((a) => [a.variable, a]));
    t.ok('an edited number is a number, a boolean a boolean', byName().count.value === 7 && byName().on.value === false);
    t.ok('an edited object is an object; null takes the number typed', byName().shape.value?.a === 2 && byName().nothing.value === 3);
    typeChip(valueBox(2), '6');
    t.check('a value that was text stays text', byName().label2.value, '6');
    typeChip(valueBox(0), 'many');
    t.check('text that is not JSON is written as typed', byName().count.value, 'many');
    t.check('a formula is written as its text', byName().n, { variable: 'n', expression: '[vars.count] + 1' });
    const mode = rows()[2].querySelector('select');
    t.change(mode, '1');
    t.check('switching a row to a formula keeps its text as the formula', byName().label2, { variable: 'label2', expression: '6' });
    t.press(list.el.querySelector('.twm-flow-field__add'));
    t.typeInto(nameBox(6), 'fresh');
    typeChip(valueBox(6), '5');
    t.check('a new row\'s value is text', byName().fresh.value, '5');
    t.press(rows()[6].querySelector('.twm-flow-field__remove'));
    t.ok('Remove takes the row out', !('fresh' in byName()));

    const map = field('fields', { type: 'object', 'x-ui-widget': 'key-value-map', 'x-ui-add-label': 'Add field' },
                      { graded: 531, rate: 4.7, ok: false, note: 'fine' });
    const values = chipHosts(map.el);
    typeChip(values[3], 'all fine');
    t.check('a map writes its other entries back with their types', map.config.fields,
            { graded: 531, rate: 4.7, ok: false, note: 'all fine' });
    typeChip(values[0], '600');
    t.check('an edited number stays a number', map.config.fields.graded, 600);
    t.check('the add label from the schema', map.el.querySelector('.twm-flow-field__add .twm-btn__label').textContent, 'Add field');
    t.typeInto(map.el.querySelectorAll('input.twm-flow-input')[0], '');
    t.ok('a row with no name is not written', !('graded' in map.config.fields));
}

t.section('§7 string-list, enum-chips, choice-cards');
{
    const strings = field('tags', { type: 'array', 'x-ui-widget': 'string-list' }, ['a']);
    t.press(strings.el.querySelector('.twm-flow-field__add'));
    t.typeInto(strings.el.querySelectorAll('input')[1], 'b');
    t.check('a list of strings', strings.config.tags, ['a', 'b']);
    t.typeInto(strings.el.querySelectorAll('input')[0], '');
    t.check('an empty line is not written', strings.config.tags, ['b']);

    const spec = { type: 'array', 'x-ui-widget': 'enum-chips',
                   items: { type: 'string', enum: ['name', 'email', 'programme'], 'x-ui-enum-labels': { name: 'Name' } } };
    const chipsField = field('columns', spec, ['programme', 'gone']);
    const buttons = [...chipsField.el.querySelectorAll('.twm-flow-togglechip')];
    t.check('one chip per value, labelled; a stored value the list lacks kept and marked',
            buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
            [['Name', 'false'], ['email', 'false'], ['programme', 'true'], ['gone (not found)', 'true']]);
    t.check('untouched, nothing written', chipsField.writes, []);
    t.press(buttons[0]);
    t.check('the stored list follows the enum\'s order, the stray at the end', chipsField.config.columns, ['name', 'programme', 'gone']);
    t.press(buttons[3]);
    t.press(buttons[0]);
    t.press(buttons[2]);
    t.ok('none chosen is no setting', !('columns' in chipsField.config));

    const cards = field('on_error', { type: 'string', enum: ['fail', 'arm'], default: 'fail', 'x-ui-widget': 'choice-cards',
                                      'x-ui-enum-labels': { fail: 'Fail the run', arm: 'Run the steps under “If it fails”' },
                                      'x-ui-enum-descriptions': { arm: 'Inside a loop, those steps may go on with the next row.' } },
                        undefined);
    const radios = [...cards.el.querySelectorAll('input[type="radio"]')];
    t.check('radio rows with their words', [...cards.el.querySelectorAll('.twm-flow-choice__label')].map((x) => x.textContent),
            ['Fail the run', 'Run the steps under “If it fails”']);
    t.ok('a sentence under the one that has one', cards.el.querySelector('.twm-flow-choice__sub')?.textContent.startsWith('Inside a loop'));
    t.ok('absent: the default is the one checked, and nothing is written', radios[0].checked && cards.writes.length === 0);
    t.ok('one group name', radios[0].name === radios[1].name && cards.el.querySelector('[role="radiogroup"]') !== null);
    radios[1].checked = true; t.fire(radios[1], 'change');
    t.check('choosing writes the enum value', cards.config.on_error, 'arm');
}

t.section('§8 upstream columns, by name');
{
    const none = field('key', { type: 'string', 'x-ui-widget': 'upstream-column' }, 'id', { columns: () => null });
    t.ok('no input yet: a sentence, and the stored name kept on screen', none.el.textContent.includes('connect a step before')
         && none.el.textContent.includes('id') && none.writes.length === 0);
    const cols = [{ name: 'id', type: 'integer' }, { name: 'email', type: 'text' }];
    const one = field('key', { type: 'string', 'x-ui-widget': 'upstream-column' }, 'gone', { columns: () => cols });
    const sel = one.el.querySelector('select');
    t.check('the input\'s columns with their types, and the stored one kept', [...sel.options].map((o) => o.textContent),
            ['Choose…', 'id · integer', 'email · text', 'gone (not found)']);
    t.change(sel, '2');
    t.check('written by NAME', one.config.key, 'email');
    const many = field('keys', { type: 'array', 'x-ui-widget': 'upstream-columns' }, ['email'], { columns: () => cols });
    t.press(many.el.querySelectorAll('.twm-flow-togglechip')[0]);
    t.check('several, in the input\'s order', many.config.keys, ['id', 'email']);
}

t.section('§9 Insert a value');
{
    const without = field('url', { type: 'string', 'x-ui-widget': 'template' }, '');
    t.ok('no picker given: no "{ }"', without.el.querySelector('.twm-flow-refbox__insert') === null);
    let asked = null;
    const withPicker = field('url', { type: 'string', 'x-ui-widget': 'template' }, 'https://x/', {
        openValuePicker: (q) => { asked = q; },
    });
    const btn = withPicker.el.querySelector('.twm-flow-refbox__insert');
    t.check('the button is named', [btn.getAttribute('aria-label'), btn.textContent], ['Insert a value', '{ }']);
    t.press(btn);
    t.ok('it asks with its anchor, the field\'s path and an insert', asked?.anchor === btn && asked.path === 'url'
         && typeof asked.insert === 'function');
    asked.insert('${run.since}');
    t.check('what is inserted lands as TEXT, drawn as a chip', [withPicker.config.url,
            [...chipHosts(withPicker.el)[0].querySelectorAll('[data-ref]')].map((c) => c.dataset.ref)],
            ['https://x/${run.since}', ['${run.since}']]);
}

t.section('§10 x-ui-references');
{
    const both = field('f', { type: 'string', 'x-ui-widget': 'template', 'x-ui-references': ['formula', 'template'] }, '[a] ${b}');
    t.check('the syntaxes the schema names', [...chipHosts(both.el)[0].querySelectorAll('[data-ref]')].map((c) => c.dataset.ref),
            ['[a]', '${b}']);
    const named = field('f', { type: 'string', 'x-ui-widget': 'template', 'x-ui-references': 'formula' }, '[a] ${b}');
    t.check('one name as a string', [...chipHosts(named.el)[0].querySelectorAll('[data-ref]')].map((c) => c.dataset.ref), ['[a]']);
    t.check('the per-widget defaults', W.DEFAULT_WIDGET_REFERENCES.template, ['template']);
}

t.section('§11 read-only');
{
    const ro = { readOnly: true };
    const kv = field('h', { type: 'object', 'x-ui-widget': 'key-value-map' }, { a: '1' }, ro);
    t.ok('no Add, no Remove', !kv.el.querySelector('.twm-flow-field__add') && !kv.el.querySelector('.twm-flow-field__remove'));
    t.ok('the name box is disabled, the value not editable', kv.el.querySelector('input').disabled
         && chipHosts(kv.el)[0].getAttribute('contenteditable') === 'false');
    t.ok('a select is disabled', field('l', { enum: ['a'] }, 'a', ro).el.querySelector('select').disabled);
    t.ok('a text box is read-only', field('n', { type: 'string' }, 'x', ro).el.querySelector('input').readOnly);
    const ins = field('u', { type: 'string', 'x-ui-widget': 'template' }, '', { ...ro, openValuePicker: () => {} });
    t.ok('no "{ }" when read-only', ins.el.querySelector('.twm-flow-refbox__insert') === null);
}

t.section('§12 a finding under a field');
{
    const { f, el } = field('url', { type: 'string', description: 'The address.' }, '');
    f.setError('Url needs a value.');
    t.ok('the error line is on screen', !el.querySelector('.twm-flow-field__error').hidden
         && el.querySelector('.twm-flow-field__error').textContent.includes('Url needs a value.'));
    t.ok('the field and the control say so', el.classList.contains('twm-flow-field--error')
         && el.querySelector('input').getAttribute('aria-invalid') === 'true');
    t.ok('the control is described by its help and its error', el.querySelector('input').getAttribute('aria-describedby')
         .split(' ').length === 2);
    f.setError('Consider a timeout.', 'warning');
    t.ok('a warning is a warning', el.classList.contains('twm-flow-field--warning') && !el.classList.contains('twm-flow-field--error'));
    f.setError(null);
    t.ok('cleared', el.querySelector('.twm-flow-field__error').hidden && !el.classList.contains('twm-flow-field--warning'));
}

t.done();
