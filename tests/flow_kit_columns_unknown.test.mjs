/**
 * A COLUMN SETTING BEFORE THE COLUMNS ARE KNOWN (STORY-0065) — the kit's
 * `upstream-column` and `upstream-columns` widgets when `ctx.columns()` is
 * null, then the lane editor switching the same field over when a
 * description arrives. jsdom, through tests/flow_env.mjs.
 *
 *   §1  upstream-column, no columns: a text box with the stored name and the
 *       "Columns not known yet" hint; typing stores the name, emptying removes
 *       it; read only is read only
 *   §2  upstream-columns, no columns: a free-text chip list — Enter, a comma
 *       or leaving the box makes a chip, a name twice is kept once, pressing
 *       a chip removes it; read only is read only
 *   §3  in the lane editor: before the first description the join's "Match
 *       on" is typed; once columns arrive the SAME field is a select with
 *       the stored name selected; a name the columns lack is kept and marked
 *       not found; columns that arrive while the reader is in the field are
 *       drawn when the focus leaves it; the columns list does the same
 *
 *     node tests/flow_kit_columns_unknown.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — columns not known yet');
const { document } = t;
const W = await import('../src/flow/kit/widgets.js');
const kit = await import('../src/flow/kit/index.js');
const { createLaneEditor } = await import('../src/flow/lanes/index.js');
const { CATEGORIES, MOCK_DESCRIBE, MOCK_PIPELINE, TYPES } = await import('./fixtures/flow_lanes_fixture.mjs');

const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

function field(key, spec, value, extra = {}) {
    const config = value === undefined ? {} : { [key]: value };
    const writes = [];
    const f = W.renderField({ key, spec }, value, {
        widgets: W.createWidgetRegistry(), referenceMap: {}, readOnly: Boolean(extra.readOnly), columns: () => null,
        set: (k, v) => { writes.push([k, v]); if (v === undefined) delete config[k]; else config[k] = v; },
    });
    t.host().appendChild(f.el);
    return { el: f.el, config, writes };
}
const enter = (box, text, key = 'Enter') => { box.value = text; t.key(box, key); };

t.section('§1 upstream-column, columns not known');
{
    const one = field('on', { type: 'string', 'x-ui-widget': 'upstream-column' }, 'programme_code');
    const box = $(one.el, 'input');
    t.check('a text box with the stored name, no select', [box?.type, box?.value, $(one.el, 'select')], ['text', 'programme_code', null]);
    t.check('the hint says why', $(one.el, '.twm-flow-field__note')?.textContent, 'Columns not known yet: type the name.');
    t.check('nothing written until the reader types', one.writes.length, 0);
    t.typeInto(box, 'submitted_at');
    t.check('typing a column name stores it', one.config.on, 'submitted_at');
    t.typeInto(box, '  ');
    t.check('emptying it removes the setting', 'on' in one.config, false);
    const fresh = field('on', { type: 'string', 'x-ui-widget': 'upstream-column' }, undefined);
    t.check('an untouched one stays absent, with a placeholder', [fresh.writes.length, $(fresh.el, 'input').placeholder], [0, 'Column name']);
    const ro = field('on', { type: 'string', 'x-ui-widget': 'upstream-column' }, 'x', { readOnly: true });
    t.check('read only: the box is read only', $(ro.el, 'input').readOnly, true);
}

t.section('§2 upstream-columns, columns not known');
{
    const many = field('keep', { type: 'array', 'x-ui-widget': 'upstream-columns' }, ['id']);
    const box = $(many.el, '.twm-flow-typedchips__input');
    const chips = () => $$(many.el, '.twm-flow-togglechip').map((c) => c.textContent);
    t.check('the stored names as chips, a box to type more, the hint', [chips(), Boolean(box), $(many.el, '.twm-flow-field__note')?.textContent],
            [['id'], true, 'Columns not known yet: type the name.']);
    enter(box, 'email');
    t.check('Enter makes a chip and stores it', [chips(), many.config.keep, box.value], [['id', 'email'], ['id', 'email'], '']);
    enter(box, 'Programme', ',');
    t.check('a comma does too', many.config.keep, ['id', 'email', 'Programme']);
    enter(box, 'email');
    t.check('a name given twice is kept once', many.config.keep, ['id', 'email', 'Programme']);
    box.value = 'Faculty';
    t.fire(box, 'blur', {}, t.window.FocusEvent);
    t.check('leaving the box keeps what was typed', many.config.keep, ['id', 'email', 'Programme', 'Faculty']);
    t.check('a chip says it removes', $$(many.el, '.twm-flow-togglechip')[1].getAttribute('aria-label'), 'Remove email');
    t.press($$(many.el, '.twm-flow-togglechip')[1]);
    t.check('pressing a chip removes it', [chips(), many.config.keep], [['id', 'Programme', 'Faculty'], ['id', 'Programme', 'Faculty']]);
    for (const _ of [0, 1, 2]) t.press($$(many.el, '.twm-flow-togglechip')[0]);
    t.check('removing the last one removes the setting', 'keep' in many.config, false);
    const ro = field('keep', { type: 'array', 'x-ui-widget': 'upstream-columns' }, ['a'], { readOnly: true });
    t.check('read only: chips disabled, the box read only', [$(ro.el, '.twm-flow-togglechip').disabled, $(ro.el, 'input').readOnly], [true, true]);
}

t.section('§3 the lane editor: typed first, a choice once the columns are known');
{
    const catalogue = kit.createStepCatalogue(TYPES, { categories: CATEGORIES });
    const timers = [];
    const clock = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} };
    const run = () => { for (const fn of timers.splice(0)) fn(); };
    const asks = [];
    const describe = (q) => new Promise((resolve) => asks.push({ q, resolve }));
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const host = t.host();
    const editor = createLaneEditor(host, { catalogue, describe, clock });
    editor.load({ graph: MOCK_PIPELINE });
    const root = editor.el;
    editor.select('join');
    const on = () => $(root, '[data-field="on"]');
    t.check('before any description: the join\'s input columns are not known', editor.inputColumns('join'), null);
    t.check('…so "Match on" is a text box holding the stored name', [$(on(), 'input')?.value, $(on(), 'select')], ['programme_code', null]);
    t.typeInto($(on(), 'input'), 'submitted_at');
    t.check('typing a column name stores it in the step', editor.getGraph().nodes.find((n) => n.id === 'join').config.on, 'submitted_at');
    run();
    asks.at(-1).resolve(MOCK_DESCRIBE);
    await flush();
    const sel = $(on(), 'select');
    t.ok('the columns arrived: the SAME field is now a select', Boolean(sel) && !$(on(), 'input'));
    t.check('…with the stored name selected', sel.options[sel.selectedIndex].textContent, 'submitted_at · date & time');
    t.check('…and the setting untouched', editor.getGraph().nodes.find((n) => n.id === 'join').config.on, 'submitted_at');

    // A name the columns lack, typed while they were unknown.
    editor.load({ graph: { ...MOCK_PIPELINE, nodes: MOCK_PIPELINE.nodes.map((n) => (n.id === 'join'
        ? { ...n, config: { ...n.config, on: 'prog_code' } } : n)) } });
    editor.select('join');
    t.check('loaded again, nothing described: typed', $(on(), 'input')?.value, 'prog_code');
    $(on(), 'input').focus();
    run();
    asks.at(-1).resolve(MOCK_DESCRIBE);
    await flush();
    t.ok('columns that arrive while the reader is in the field rebuild nothing under them',
         document.activeElement === $(on(), 'input'));
    $(on(), 'input').blur();
    const kept = $(on(), 'select');
    t.ok('…and are drawn when the focus leaves it', Boolean(kept));
    t.check('a stored name not among the columns is kept, selected, and marked not found',
            kept.options[kept.selectedIndex].textContent, 'prog_code (not found)');
    t.check('…and kept in the step', editor.getGraph().nodes.find((n) => n.id === 'join').config.on, 'prog_code');

    editor.load({ graph: MOCK_PIPELINE });
    editor.select('rename');
    const keep = () => $(root, '[data-field="keep"]');
    t.ok('the columns list, nothing described: a typed chip list', Boolean($(keep(), '.twm-flow-typedchips')));
    run();
    asks.at(-1).resolve(MOCK_DESCRIBE);
    await flush();
    t.ok('…toggle chips over the input\'s columns once they are known', !$(keep(), '.twm-flow-typedchips')
         && $$(keep(), '.twm-flow-togglechip').length > 0);
    editor.destroy();
}

t.done();
