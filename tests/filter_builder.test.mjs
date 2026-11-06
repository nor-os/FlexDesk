/**
 * The filter expression language and its editor.
 *
 *   §1  the model: operators per type, match (every type, NOT, nesting, empty
 *       groups), consumer operators, live options
 *   §2  describe, validate, unknown fields, prune, count, coercion, serialisation
 *   §3  saved expressions in the group/clause shape load unchanged and match
 *   §4  the condition tree: mapping and round trips, nothing lost
 *   §5  the builder: draws, edits, no rewrite of what it cannot read, focus, the
 *       caret survives typing, custom value editors mount and are released
 *   §6  the dialog: a real modal, result shapes, gating, async submit and its
 *       error, preview slot and its signal, discard guard, name and icon
 *   §7  exports, CSS (every class styled, tokens only),
 *       no DOM state, no application words
 *
 *     node tests/filter_builder.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';
import { stripComments } from './css_rules.mjs';

const T = await dataTableEnv('filter builder');
const { check, ok, section, done, css, document, window } = T;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The window's events are jsdom's; Node's own globals of these names are not.
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;

const {
    createFilterModel, emptyFilter, cloneFilter, serializeFilter, parseFilter, countConditions,
    coerceFilterValue, toConditionTree, fromConditionTree, FILTER_OPERATORS, FILTER_TYPE_OPERATORS,
    filterOptions,
} = await import('../src/ui/components/filter_model.js');
const { createFilterBuilder, openFilterDialog } = await import('../src/ui/components/filter_builder.js');
const widgets = await import('../widgets.js');

const silenced = [];
const realWarn = console.warn;
console.warn = (...args) => silenced.push(args.join(' '));

const FIELDS = () => [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'size', label: 'Size', type: 'enum', options: ['s', { value: 'm', label: 'Medium' }, { id: 'l', label: 'Large' }] },
    { key: 'count', label: 'Count', type: 'number', get: (r) => r.n },
    { key: 'when', label: 'When', type: 'date' },
    { key: 'at', label: 'At', type: 'date', time: true },
    { key: 'tags', label: 'Tags', type: 'set' },
    { key: 'done', label: 'Done', type: 'bool' },
    { key: 'secret', label: 'Secret', type: 'text', hidden: true },
];
const model = createFilterModel({ fields: FIELDS(), noun: 'item' });
const clause = (field, op, value) => (value === undefined ? { kind: 'clause', field, op } : { kind: 'clause', field, op, value });
const group = (op, ...children) => ({ kind: 'group', op, children });
const matches = (expr, row, m = model) => m.evaluateFilter(expr, row);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 the model');
{
    check('a text field is offered its operators', model.operatorsFor('name').map((o) => o.id), FILTER_TYPE_OPERATORS.text);
    check('an unknown field is offered none', model.operatorsFor('gone'), []);
    ok('the catalogue is frozen', Object.isFrozen(FILTER_OPERATORS) && Object.isFrozen(FILTER_OPERATORS.is));
    check('options normalise', filterOptions(FIELDS()[1]), [
        { value: 's', label: 's' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' },
    ]);

    const row = { name: 'Alpha', size: 'M', n: 5, when: '2026-03-10', at: '2026-03-10T12:00:00Z', tags: ['Red', 'blue'], done: true };
    const table = [
        [clause('name', 'is', 'alpha'), true],
        [clause('name', 'is_not', 'alpha'), false],
        [clause('name', 'contains', 'LPH'), true],
        [clause('name', 'not_contains', 'lph'), false],
        [clause('name', 'starts_with', 'al'), true],
        [clause('name', 'ends_with', 'ha'), true],
        [clause('name', 'one_of', ['x', 'alpha']), true],
        [clause('name', 'none_of', ['x', 'alpha']), false],
        [clause('size', 'is', 'm'), true],
        [clause('count', 'is', 5), true],
        [clause('count', 'is_not', '5'), false],
        [clause('count', 'gt', 4), true],
        [clause('count', 'lt', 4), false],
        [clause('count', 'gte', 5), true],
        [clause('count', 'lte', 4), false],
        [clause('count', 'between', [7, 3]), true],
        [clause('count', 'one_of', [5, 6]), true],
        [clause('count', 'none_of', [5, 6]), false],
        [clause('when', 'is', '2026-03-10'), true],
        [clause('when', 'before', '2026-03-11'), true],
        [clause('when', 'after', '2026-03-11'), false],
        [clause('when', 'lt', '2026-03-11'), true],
        [clause('when', 'gte', '2026-03-10'), true],
        [clause('when', 'lte', '2026-03-09'), false],
        [clause('when', 'gt', '2026-03-09'), true],
        [clause('when', 'between', ['2026-03-01', '2026-03-31']), true],
        [clause('at', 'is', '2026-03-10T12:00:00Z'), true],
        [clause('at', 'is', '2026-03-10T13:00:00Z'), false],
        [clause('at', 'gt', '2026-03-10T11:59:00Z'), true],
        [clause('tags', 'contains', 'red'), true],
        [clause('tags', 'not_contains', 'red'), false],
        [clause('tags', 'one_of', ['x', 'BLUE']), true],
        [clause('tags', 'none_of', ['x']), true],
        [clause('tags', 'all_of', ['red', 'blue']), true],
        [clause('tags', 'all_of', ['red', 'x']), false],
        [clause('tags', 'is_empty'), false],
        [clause('done', 'is_true'), true],
        [clause('done', 'is_false'), false],
        [clause('name', 'is_not_empty'), true],
        [clause('name', 'is_null'), false],
        [clause('name', 'is_not_null'), true],
    ];
    for (const [expr, want] of table) check(`${expr.field} ${expr.op} ${JSON.stringify(expr.value)}`, matches(expr, row), want);

    check('in the last 7 days, today', matches(clause('when', 'in_last_days', 7), { when: daysAgo(0) }), true);
    check('in the last 7 days, the 7th day back', matches(clause('when', 'in_last_days', 7), { when: daysAgo(6) }), true);
    check('in the last 7 days, the 8th day back', matches(clause('when', 'in_last_days', 7), { when: daysAgo(7) }), false);
    check('a blank date never compares', matches(clause('when', 'before', '2026-01-01'), { when: '' }), false);

    const a = clause('name', 'is', 'alpha');
    const b = clause('count', 'gt', 100);
    check('AND', matches(group('AND', a, b), row), false);
    check('OR', matches(group('OR', a, b), row), true);
    check('NOT', matches({ ...group('AND', b), negate: true }, row), true);
    check('nested', matches(group('AND', a, group('OR', b, clause('size', 'is', 'm'))), row), true);
    check('null matches everything', matches(null, row), true);
    check('an empty AND matches everything', matches(emptyFilter(), row), true);
    check('an empty OR matches everything by default', matches(group('OR'), row), true);
    check('a negated empty group matches nothing', matches({ ...emptyFilter(), negate: true }, row), false);
    const strict = createFilterModel({ fields: FIELDS(), emptyOr: 'nothing' });
    check('emptyOr: nothing', matches(group('OR'), row, strict), false);
    check('emptyOr: nothing, negated', matches({ ...group('OR'), negate: true }, row, strict), true);
    check('emptyOr leaves AND alone', matches(group('AND'), row, strict), true);
    check('an unknown field matches nothing', matches(clause('gone', 'is', 'x'), row), false);
    check('a carried node matches nothing', matches({ kind: 'opaque', node: {} }, row), false);
    check('an operator its type cannot run matches nothing', matches(clause('name', 'gt', 'a'), row), false);
    ok('and they warn', silenced.length >= 3);
    check('the matcher is cached', model.matcherFor(a) === model.matcherFor(cloneFilter(a)), true);

    const custom = createFilterModel({
        fields: [{ key: 'owner', label: 'Owner', type: 'text', operators: ['is', 'is_me', 'is_empty'] }],
        operators: [{ id: 'is_me', label: 'is me', arity: 0, match: (v) => v === 'me' }, { id: 'is', label: 'equals' }],
    });
    check('a consumer operator is offered', custom.operatorsFor('owner').map((o) => o.id), ['is', 'is_me', 'is_empty']);
    check('a known operator can be relabelled', custom.operatorsFor('owner')[0], { ...FILTER_OPERATORS.is, label: 'equals' });
    check('a consumer operator runs its match', matches(clause('owner', 'is_me'), { owner: 'me' }, custom), true);
    check('and validates with no value', custom.validateFilter(clause('owner', 'is_me')).ok, true);
    check('and describes', custom.describeFilter(clause('owner', 'is_me')), 'Owner is me');
    let threw = false;
    try { createFilterModel({ fields: [{ key: 'k', label: 'K', type: 'text', operators: ['nope'] }] }); } catch { threw = true; }
    ok('a field naming an unknown operator throws', threw);
    threw = false;
    try { createFilterModel({ fields: [], operators: [{ id: 'nope', label: 'x' }] }); } catch { threw = true; }
    ok('a new operator without an arity throws', threw);

    let opts = ['one'];
    const live = createFilterModel({ fields: [{ key: 'k', label: 'K', type: 'enum', get options() { return opts; } }] });
    check('options are read at use', live.newClause().value, 'one');
    opts = ['two'];
    check('and stay live', live.newClause().value, 'two');

    check('newClause skips a hidden field', model.newClause().field, 'name');
    check('newClause takes a key, hidden or not', model.newClause('secret').field, 'secret');
    check('an operator with no value starts with none', 'value' in model.newClause('done'), false);
    check('an empty catalogue offers nothing', createFilterModel({ fields: [] }).newClause(), null);
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 describe, validate, prune, count, coerce, serialise');
{
    check('describe', model.describeFilter(group('AND', clause('name', 'is', 'x'), group('OR', clause('count', 'gt', 1), clause('size', 'one_of', ['s', 'm'])))),
        'Name is x AND (Count > 1 OR Size one of s, m)');
    check('describe a range', model.describeFilter(clause('count', 'between', [1, 2])), 'Count between 1 and 2');
    check('describe no value', model.describeFilter(clause('name', 'is_empty')), 'Name is empty');
    check('describe NOT', model.describeFilter({ ...group('AND', clause('name', 'is', 'x')), negate: true }), 'NOT (Name is x)');
    check('describe empty', model.describeFilter(emptyFilter()), 'everything');
    check('describe negated empty', model.describeFilter({ ...emptyFilter(), negate: true }), 'nothing');
    check('describe an empty OR under emptyOr: nothing', createFilterModel({ fields: [], emptyOr: 'nothing' }).describeFilter(group('OR')), 'nothing');
    check('an unknown field is said, with what it asks', model.describeFilter(clause('gone', 'is', 'x')), '⚠ unknown field “gone” is x');
    check('an unknown field under no value', model.describeFilter(clause('gone', 'is_empty')), '⚠ unknown field “gone” is empty');
    check('an unknown field under an unknown operator', model.describeFilter(clause('gone', 'nope', 'x')), '⚠ unknown field “gone” nope x');
    check('an unknown operator keeps its value', model.describeFilter(clause('name', 'nope', 'x')), 'Name nope x');
    check('unknownName shapes it', createFilterModel({ fields: [], unknownName: (k) => k.slice(3) }).describeFilter(clause('cf.gone', 'is', 'x')), '⚠ unknown field “gone” is x');
    check('formatValue is not asked about a field nobody knows', model.describeFilter(clause('gone', 'is', 'x'), { formatValue: (v, f) => f.key }), '⚠ unknown field “gone” is x');
    check('every value of a list under a single-value operator', model.describeFilter(clause('tags', 'contains', ['a', 'b'])), 'Tags contains a, b');
    check('named too', model.describeFilter(clause('tags', 'contains', ['a', 'b']), { formatValue: (v) => v.toUpperCase() }), 'Tags contains A, B');
    const nested = group('AND', clause('name', 'is', 'x'), group('OR', clause('count', 'gt', 1), clause('count', 'lt', 0)));
    check('groupBrackets: the root too', model.describeFilter(nested, { groupBrackets: true }), '(Name is x AND (Count > 1 OR Count < 0))');
    check('groupBrackets: a group of one has none', model.describeFilter(group('AND', clause('name', 'is', 'x')), { groupBrackets: true }), 'Name is x');
    check('groupBrackets: NOT of one', model.describeFilter({ ...group('AND', clause('name', 'is', 'x')), negate: true }, { groupBrackets: true }), 'NOT Name is x');
    check('groupBrackets: NOT of two', model.describeFilter({ ...group('OR', clause('name', 'is', 'x'), clause('name', 'is', 'y')), negate: true }, { groupBrackets: true }), 'NOT (Name is x OR Name is y)');
    check('without it the root has none', model.describeFilter(nested), 'Name is x AND (Count > 1 OR Count < 0)');
    check('formatValue names values', model.describeFilter(group('AND', clause('name', 'one_of', ['a', 'b'])), { formatValue: (v, f) => `${f.key}:${v.toUpperCase()}` }), 'Name one of name:A, name:B');
    check('a carried node shows as data', model.describeFilter({ kind: 'opaque', node: { op: 'xor' } }), '⚠ {"op":"xor"}');

    check('unknownFields', model.unknownFields(group('AND', clause('gone', 'is', 1), group('OR', clause('name', 'is', 1), clause('lost', 'is', 1)))), ['gone', 'lost']);

    const errors = (e) => model.validateFilter(e).errors;
    check('an empty group is valid', model.validateFilter(emptyFilter()), { ok: true, errors: [] });
    check('every problem is listed', errors(group('AND', clause('gone', 'is', 1), clause('name', 'nope', 1), clause('name', 'is', ''))), [
        'expr/0: unknown field "gone"', 'Name: "nope" is not a valid operator', 'Name is: needs a value',
    ]);
    check('group op', errors({ kind: 'group', op: 'and', children: [] }), ['expr: group op must be AND or OR']);
    check('group children', errors({ kind: 'group', op: 'AND' }), ['expr: group children must be an array']);
    check('not a node', errors(null), ['expr: not an expression node']);
    check('unknown kind', errors({ kind: 'x' }), ['expr: unknown node kind "x"']);
    check('multi needs one', errors(clause('name', 'one_of', [])), ['Name one of: pick at least one value']);
    check('range needs two', errors(clause('count', 'between', [1, ''])), ['Count between: needs two values']);
    check('number', errors(clause('count', 'gt', 'abc')), ['Count >: value must be a number']);
    check('range numbers', errors(clause('count', 'between', [1, 'x'])), ['Count between: value must be a number']);
    check('date', errors(clause('when', 'before', 'soon')), ['When before: value must be a date (YYYY-MM-DD)']);
    check('date and time', errors(clause('at', 'after', 'soon')), ['At after: value must be a date and time']);
    check('days', errors(clause('when', 'in_last_days', 0)), ['When in the last N days: value must be a positive number of days']);
    check('no value needed', errors(clause('name', 'is_empty')), []);
    check('zero is a value', errors(clause('count', 'is', 0)), []);

    const half = group('AND', clause('name', 'is', ''), clause('count', 'is', 0), group('OR', clause('count', 'between', ['', ''])),
        group('AND', group('OR', clause('name', 'is', 'x'), clause('size', 'is', 's'))), clause('gone', 'is', ''), clause('name', 'nope', ''),
        clause('done', 'is_true'), { kind: 'opaque', node: { op: 'xor' } });
    check('prune', model.pruneFilter(half), group('AND', clause('count', 'is', 0),
        group('OR', clause('name', 'is', 'x'), clause('size', 'is', 's')), clause('gone', 'is', ''), clause('name', 'nope', ''),
        clause('done', 'is_true'), { kind: 'opaque', node: { op: 'xor' } }));
    check('prune to nothing', model.pruneFilter(group('AND', clause('name', 'is', ''), group('OR'))), null);
    check('prune flattens', model.pruneFilter(group('AND', group('OR', clause('name', 'is', 'x')))), group('OR', clause('name', 'is', 'x')));
    check('prune keeps a NOT', model.pruneFilter({ ...group('AND', group('OR', clause('name', 'is', 'x'))), negate: true }),
        { ...group('AND', group('OR', clause('name', 'is', 'x'))), negate: true });
    const original = group('AND', clause('name', 'is', ''));
    model.pruneFilter(original);
    check('prune copies', original.children.length, 1);

    check('count', countConditions(group('AND', clause('a', 'is', 1), group('OR', clause('b', 'is', 1), { kind: 'opaque', node: {} }))), 3);
    check('count nothing', countConditions(null), 0);

    const number = { type: 'number' };
    check('a number field writes a number', coerceFilterValue(number, '1000'), 1000);
    check('negative decimal', coerceFilterValue(number, ' -1.5 '), -1.5);
    check('an empty box stays empty', coerceFilterValue(number, ''), '');
    check('half-typed stays text', coerceFilterValue(number, '-'), '-');
    check('hex is refused', coerceFilterValue(number, '0x10'), '0x10');
    check('wider than a double stays text', coerceFilterValue(number, '1234567890.12345678'), '1234567890.12345678');
    check('too small for a double stays text', coerceFilterValue(number, `0.${'0'.repeat(400)}1`), `0.${'0'.repeat(400)}1`);
    check('0.00125 is three digits', coerceFilterValue(number, '0.00125'), 0.00125);
    check('other types keep the string', coerceFilterValue({ type: 'date' }, '2026-01-01'), '2026-01-01');
    check('a non-string passes', coerceFilterValue(number, 5), 5);

    const e = group('OR', clause('name', 'is', 'x'));
    check('serialise round trip', parseFilter(serializeFilter(e)), e);
    let threw = false;
    try { parseFilter('[1]'); } catch { threw = true; }
    ok('text that is not an expression throws', threw);
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 saved expressions');
{
    const saved = JSON.parse(`{"kind":"group","op":"AND","children":[
        {"kind":"clause","field":"size","op":"is","value":"s"},
        {"kind":"clause","field":"name","op":"is_empty","value":null},
        {"kind":"group","op":"OR","negate":true,"children":[
            {"kind":"clause","field":"when","op":"in_last_days","value":7},
            {"kind":"clause","field":"tags","op":"all_of","value":["a"]}
        ]}]}`);
    check('it validates', model.validateFilter(saved).ok, true);
    check('it describes', model.describeFilter(saved),
        'Size is s AND Name is empty AND NOT (When in the last N days 7 OR Tags all of a)');
    check('it matches', matches(saved, { size: 's', name: '', when: '2000-01-01', tags: [] }), true);
    const host = document.createElement('div');
    const builder = createFilterBuilder(host, { model, value: saved });
    check('the builder holds it untouched', builder.getValue(), saved);
    builder.destroy();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 the condition tree');
{
    const pairs = [
        ['is', 'eq'], ['is_not', 'ne'], ['one_of', 'in'], ['none_of', 'not_in'],
        ['is_empty', 'is_blank'], ['is_not_empty', 'is_not_blank'],
        ['gt', 'gt'], ['gte', 'gte'], ['lt', 'lt'], ['lte', 'lte'],
        ['contains', 'contains'], ['not_contains', 'not_contains'], ['starts_with', 'starts_with'],
        ['ends_with', 'ends_with'], ['between', 'between'], ['is_null', 'is_null'], ['is_not_null', 'is_not_null'],
        ['is_true', 'is_true'], ['is_false', 'is_false'], ['is_me', 'is_me'],
    ];
    for (const [ours, theirs] of pairs) {
        check(`${ours} -> ${theirs}`, toConditionTree(clause('x', ours, 1)), { column: 'x', operator: theirs, value: 1 });
        check(`${theirs} -> ${ours}`, fromConditionTree({ column: 'x', operator: theirs, value: 1 }), clause('x', ours, 1));
    }
    check('before is lt', toConditionTree(clause('x', 'before', '2026-01-01')).operator, 'lt');
    check('after is gt', toConditionTree(clause('x', 'after', '2026-01-01')).operator, 'gt');
    check('an operator nobody maps passes through', toConditionTree(clause('x', 'in_last_days', 7)).operator, 'in_last_days');
    check('no value stays no value', toConditionTree(clause('x', 'is_empty')), { column: 'x', operator: 'is_blank' });
    check('a condition with no operator is eq', fromConditionTree({ column: 'x', value: 1 }), clause('x', 'is', 1));
    check('null is the empty filter', fromConditionTree(null), emptyFilter());

    const a = { column: 'status', operator: 'eq', value: 'open' };
    const b = { column: 'amount', operator: 'gt', value: 1000 };
    const c = { column: 'priority', operator: 'in', value: ['high', 'urgent'] };
    const trees = [
        { op: 'and', children: [a, { op: 'or', children: [b, c] }] },
        { op: 'not', children: [a] },
        { op: 'not', children: [{ op: 'and', children: [a, b] }] },
        { op: 'not', children: [{ op: 'or', children: [a, b] }] },
        { op: 'not', children: [{ op: 'or', children: [a] }] },
        { op: 'not', children: [{ op: 'not', children: [a] }] },
        { op: 'not', children: [{ op: 'and', children: [] }] },
        { op: 'and', children: [] },
        { op: 'or', children: [] },
        { op: 'and', children: [{ column: 'owner', operator: 'is_me' }] },
        { op: 'and', children: [{ column: 'x', operator: 'between', value: [1, 2] }, { column: 'gone', operator: 'made_up', value: { any: 'thing' } }] },
        { op: 'and', children: [{ column: 'x', operator: 'eq', value: null, extra: 1 }] },
        { op: 'and', children: [{ op: 'xor', children: [a, b] }, { op: 'not', children: [a, b] }, { op: 'not' }, { nonsense: true }, 7] },
        a,
        { op: 'xor', children: [] },
    ];
    for (const tree of trees) check(`tree -> expression -> tree ${JSON.stringify(tree).slice(0, 60)}`, toConditionTree(fromConditionTree(tree)), tree);

    const negated = { ...group('OR', clause('x', 'is', 1), clause('y', 'is', 2)), negate: true };
    check('expression -> tree -> expression', fromConditionTree(toConditionTree(negated)), negated);
    const nested = group('AND', clause('x', 'one_of', [1]), group('OR', clause('y', 'is_empty')));
    check('nested', fromConditionTree(toConditionTree(nested)), nested);
    check('a carried node in an expression', toConditionTree({ kind: 'opaque', node: { op: 'xor' } }), { op: 'xor' });
    check('upper-case input is read as the compiler reads it', fromConditionTree({ op: 'AND', children: [{ column: 'x', operator: 'EQ', value: 1 }] }), group('AND', clause('x', 'is', 1)));

    // countConditions reads expressions: a tree goes through the conversion.
    const counted = [
        [null, 0],
        [{ op: 'and', children: [] }, 0],
        [{ op: 'not', children: [{ op: 'and', children: [] }] }, 0],
        [a, 1],
        [{ op: 'and', children: [a, b] }, 2],
        [{ op: 'and', children: [a, { op: 'or', children: [b, c] }] }, 3],
        [{ op: 'not', children: [a] }, 1],
        [{ op: 'not', children: [{ op: 'and', children: [a, b] }] }, 2],
        [{ op: 'xor', children: [a, b] }, 1],
    ];
    for (const [tree, n] of counted) check(`count of a tree ${JSON.stringify(tree)?.slice(0, 50)}`, countConditions(fromConditionTree(tree)), n);

    // A server's own operator table, under its own ids, is what a model is built from.
    const serverTable = {
        eq: ['is', 1], ne: ['is not', 1], gt: ['is greater than', 1], gte: ['is at least', 1],
        lt: ['is less than', 1], lte: ['is at most', 1], contains: ['contains', 1],
        not_contains: ['does not contain', 1], starts_with: ['starts with', 1], ends_with: ['ends with', 1],
        is_blank: ['is empty', 0], is_not_blank: ['is not empty', 0], is_null: ['has no value', 0],
        is_not_null: ['has a value', 0], in: ['is any of', 1], not_in: ['is none of', 1],
        between: ['is between', 2], is_true: ['is true', 0], is_false: ['is false', 0], is_me: ['is me', 0],
    };
    const ourId = (id) => fromConditionTree({ column: '', operator: id }).op;
    const served = createFilterModel({
        fields: [{ key: 'x', label: 'X', type: 'text', operators: ['eq', 'in', 'is_blank', 'is_me'].map(ourId) }],
        operators: Object.entries(serverTable).map(([id, [label, arity]]) => ({ id: ourId(id), label, arity })),
    });
    for (const [id, [label, arity]] of Object.entries(serverTable)) {
        check(`${id} comes back under its own id`, toConditionTree(clause('x', ourId(id))).operator, id);
        const known = FILTER_OPERATORS[ourId(id)];
        if (known) check(`${id} has the arity FlexDesk's ${known.id} has`, known.arity, arity);
        const def = served.operatorById(ourId(id));
        check(`${id} is offered under the server's words`, [def.label, def.arity], [label, arity]);
    }
    ok('a relabelled list operator still takes a list', served.operatorById(ourId('in')).multi === true);
    check('a field offered server ids', served.operatorsFor('x').map((o) => o.label), ['is', 'is any of', 'is empty', 'is me']);
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 the builder');
const q = (root, sel) => root.querySelector(sel);
const qa = (root, sel) => [...root.querySelectorAll(sel)];
const mountBuilder = (value, m = model) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const changes = [];
    const builder = createFilterBuilder(host, { model: m, value, onChange: (e) => changes.push(e) });
    return { host, builder, changes };
};
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const setSelect = (el, text) => {
    el.selectedIndex = [...el.options].findIndex((o) => o.textContent === text);
    if (el.selectedIndex < 0) throw new Error(`no option ${text}`);
    fire(el, 'change');
};
const typeIn = (el, text) => { el.value = text; fire(el, 'input'); };
const btn = (root, text) => qa(root, 'button').find((b) => b.textContent === text);
{
    let threw = false;
    try { createFilterBuilder(document.createElement('div'), {}); } catch { threw = true; }
    ok('a builder needs a model', threw);

    const { host, builder, changes } = mountBuilder(null);
    check('it starts empty', builder.getValue(), emptyFilter());
    ok('and says what that means', q(host, '.twm-filter-builder__empty').textContent.includes('every item'));

    btn(host, '+ Condition').click();
    check('+ Condition adds the first offered field', builder.getValue().children, [clause('name', 'is', '')]);
    check('and reports it', changes.length, 1);
    ok('focus lands on the new field', document.activeElement === q(host, '.twm-filter-builder__select--field'));

    const fieldLabels = qa(q(host, '.twm-filter-builder__select--field'), 'option').map((o) => o.textContent);
    check('a hidden field is not offered', fieldLabels.includes('Secret'), false);

    const input = q(host, '.twm-filter-builder__value input');
    input.focus();
    typeIn(input, 'abc');
    check('typing writes the node', builder.getValue().children[0].value, 'abc');
    ok('and redraws nothing: the same box keeps the focus', document.activeElement === input && input.isConnected);

    setSelect(q(host, '.twm-filter-builder__select--op'), 'is empty');
    check('an operator with no value drops it', builder.getValue().children[0], clause('name', 'is_empty'));
    check('and draws no box', qa(host, '.twm-filter-builder__value input').length, 0);
    ok('focus returns to the operator', document.activeElement === q(host, '.twm-filter-builder__select--op'));

    setSelect(q(host, '.twm-filter-builder__select--field'), 'Count');
    check('a new field keeps an operator it offers', builder.getValue().children[0], clause('count', 'is_empty'));
    setSelect(q(host, '.twm-filter-builder__select--op'), 'is');
    check('a number starts blank', builder.getValue().children[0], clause('count', 'is', null));
    const num = q(host, '.twm-filter-builder__value input');
    check('a number box', num.type, 'number');
    typeIn(num, '1000');
    check('a number field stores a number', builder.getValue().children[0].value, 1000);

    setSelect(q(host, '.twm-filter-builder__select--op'), 'between');
    const pair = qa(host, '.twm-filter-builder__value input');
    check('between draws two boxes', pair.length, 2);
    typeIn(pair[0], '1');
    typeIn(pair[1], '2');
    check('between stores a pair', builder.getValue().children[0].value, [1, 2]);

    setSelect(q(host, '.twm-filter-builder__select--op'), 'one of');
    const tag = q(host, '.twm-tag-input__input');
    typeIn(tag, '3,4,');
    check('free values become a list, typed', builder.getValue().children[0].value, [3, 4]);

    setSelect(q(host, '.twm-filter-builder__select--field'), 'When');
    check('a date box', q(host, '.twm-filter-builder__value input').type, 'date');
    setSelect(q(host, '.twm-filter-builder__select--op'), 'in the last N days');
    check('days start at 7', builder.getValue().children[0].value, 7);
    check('as a number box', q(host, '.twm-filter-builder__value input').type, 'number');
    setSelect(q(host, '.twm-filter-builder__select--field'), 'At');
    check('the days stay, on a date field that offers them', builder.getValue().children[0], clause('at', 'in_last_days', 7));
    setSelect(q(host, '.twm-filter-builder__select--op'), 'before');
    check('a date and time box', q(host, '.twm-filter-builder__value input').type, 'datetime-local');

    setSelect(q(host, '.twm-filter-builder__select--field'), 'Size');
    check('an enum starts on its first option', builder.getValue().children[0], clause('size', 'is', 's'));
    setSelect(q(host, '.twm-filter-builder__select--value'), 'Large');
    check('the option value is stored, not its label', builder.getValue().children[0].value, 'l');

    setSelect(q(host, '.twm-filter-builder__select--op'), 'one of');
    setSelect(q(host, '.twm-filter-builder__select--add'), 'Medium');
    setSelect(q(host, '.twm-filter-builder__select--add'), 'Large');
    check('chosen options collect', builder.getValue().children[0].value, ['m', 'l']);
    check('as chips, by label', qa(host, '.twm-filter-builder__chip').map((c) => c.firstChild.textContent), ['Medium', 'Large']);
    check('what is left is offered', qa(q(host, '.twm-filter-builder__select--add'), 'option').map((o) => o.textContent), ['+ value', 's']);
    ok('and focus stays on the adder', document.activeElement === q(host, '.twm-filter-builder__select--add'));
    q(host, '.twm-filter-builder__chip-remove').click();
    check('a chip removes', builder.getValue().children[0].value, ['l']);

    btn(host, '+ Group').click();
    check('+ Group comes with one condition', builder.getValue().children[1], group('AND', clause('name', 'is', '')));
    const nested = qa(host, '.twm-filter-builder__group')[1];
    btn(nested, 'OR').click();
    check('AND/OR toggles that group', builder.getValue().children[1].op, 'OR');
    check('the root is untouched', builder.getValue().op, 'AND');
    const nestedAgain = qa(host, '.twm-filter-builder__group')[1];
    ok('focus returns to the toggle', document.activeElement === btn(nestedAgain, 'OR'));
    btn(nestedAgain, 'NOT').click();
    check('NOT sets negate', builder.getValue().children[1].negate, true);
    btn(qa(host, '.twm-filter-builder__group')[1], 'NOT').click();
    check('and clears it, leaving no flag', 'negate' in builder.getValue().children[1], false);

    q(qa(host, '.twm-filter-builder__group')[1], '.twm-filter-builder__row .twm-filter-builder__remove').click();
    check('removing the last condition removes its nested group', builder.getValue().children.length, 1);
    q(host, '.twm-filter-builder__row .twm-filter-builder__remove').click();
    check('the root may stay empty', builder.getValue().children, []);
    ok('focus lands on the group that remains', document.activeElement === btn(host, '+ Condition'));

    const before = changes.length;
    builder.setValue(group('OR', clause('name', 'is', 'z')));
    check('setValue draws without reporting', [changes.length, q(host, '.twm-filter-builder__value input').value], [before, 'z']);
    builder.focus();
    ok('focus() takes the focus', host.contains(document.activeElement));
    check('validate()', builder.validate().ok, true);
    builder.destroy();
    check('destroy() removes it', host.children.length, 0);
}
{
    // WHAT IT CANNOT READ STAYS AS IT IS.
    const held = group('AND',
        clause('gone', 'is', 'kept'),
        clause('name', 'made_up', { any: 'thing' }),
        clause('name', 'is_null'),
        clause('size', 'is', 'vanished'),
        { kind: 'opaque', node: { op: 'xor', children: [] } });
    const { host, builder, changes } = mountBuilder(held);
    check('opening rewrites nothing', builder.getValue(), held);
    check('and reports nothing', changes.length, 0);
    const fields = qa(host, '.twm-filter-builder__select--field');
    check('an unknown field keeps its own entry', fields[0].selectedOptions[0].textContent, '⚠ unknown field “gone”');
    check('its value is shown read-only', q(host, '.twm-filter-builder__value .twm-filter-builder__carried').textContent, '"kept"');
    const ops = qa(host, '.twm-filter-builder__select--op');
    check('a catalogue operator on an unknown field reads as itself', ops[0].selectedOptions[0].textContent, 'is');
    check('the whole warning is its tooltip', fields[0].title, '⚠ unknown field “gone”');
    ok('and the select takes its width from it', fields[0].classList.contains('twm-filter-builder__select--unknown'));
    ok('a known field neither', !fields[1].title && !fields[1].classList.contains('twm-filter-builder__select--unknown'));
    check('an unknown operator keeps its own entry', ops[1].selectedOptions[0].textContent, 'made_up (unknown)');
    check('a known operator this field is not offered is kept, in words', ops[2].selectedOptions[0].textContent, 'has no value');
    check('an enum value no longer offered is kept', q(host, '.twm-filter-builder__select--value').selectedOptions[0].textContent, 'vanished (unknown)');
    check('a carried node is a read-only row', q(host, '.twm-filter-builder__row--carried .twm-filter-builder__carried').textContent, '⚠ {"op":"xor","children":[]}');
    btn(host, '+ Condition').click();
    check('editing elsewhere leaves them alone', builder.getValue().children.slice(0, 5), held.children);
    setSelect(qa(host, '.twm-filter-builder__select--field')[0], 'Name');
    check('choosing a real field makes it a condition on that field', builder.getValue().children[0], clause('name', 'is', 'kept'));
    qa(host, '.twm-filter-builder__row--carried .twm-filter-builder__remove')[0].click();
    check('a carried node can be removed', builder.getValue().children.some((c) => c.kind === 'opaque'), false);
    builder.destroy();

    const bare = mountBuilder(clause('name', 'is', 'x'));
    check('a bare clause is wrapped', bare.builder.getValue(), group('AND', clause('name', 'is', 'x')));
    bare.builder.destroy();
    const input = group('AND', clause('name', 'is', 'x'));
    const copy = mountBuilder(input);
    typeIn(q(copy.host, '.twm-filter-builder__value input'), 'y');
    check('the value handed in is not edited', input.children[0].value, 'x');
    copy.builder.destroy();
    const blank = mountBuilder(group('AND', clause('size', 'is', '')));
    check('a select holds what it shows', blank.builder.getValue().children[0].value, 's');
    check('without reporting a change', blank.changes.length, 0);
    blank.builder.destroy();
    const none = mountBuilder(null, createFilterModel({ fields: [] }));
    ok('nothing to offer disables adding', btn(none.host, '+ Condition').disabled && btn(none.host, '+ Group').disabled);
    none.builder.destroy();
    const enumNoOptions = mountBuilder(group('AND', clause('k', 'is', 'typed')), createFilterModel({ fields: [{ key: 'k', label: 'K', type: 'enum', options: [] }] }));
    check('an enum with no options is a text box', q(enumNoOptions.host, '.twm-filter-builder__value input').value, 'typed');
    enumNoOptions.builder.destroy();
    const grouped = mountBuilder(null, createFilterModel({ fields: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'text', group: 'Custom' },
        { key: 'c', label: 'C', type: 'text', group: 'Custom' },
    ] }));
    btn(grouped.host, '+ Condition').click();
    check('a field group is an optgroup', qa(q(grouped.host, '.twm-filter-builder__select--field'), 'optgroup').map((g) => [g.label, g.children.length]), [['Custom', 2]]);
    grouped.builder.destroy();
}
{
    // A CUSTOM VALUE EDITOR.
    const made = [];
    const released = [];
    const editorModel = createFilterModel({ fields: [
        {
            key: 'who', label: 'Who', type: 'text', operators: ['is', 'is_empty'],
            editor: (ctx) => {
                const el = document.createElement('span');
                el.className = 'custom-editor';
                el.textContent = String(ctx.value);
                made.push(ctx);
                return { el, destroy: () => released.push(ctx.value) };
            },
        },
        { key: 'plain', label: 'Plain', type: 'text', editor: ({ op }) => (op.id === 'is' ? null : undefined) },
    ] });
    const { host, builder, changes } = mountBuilder(group('AND', clause('who', 'is', 'sub-1')), editorModel);
    check('it is mounted in the value cell', q(host, '.twm-filter-builder__value .custom-editor').textContent, 'sub-1');
    check('and told what it edits', [made[0].field.key, made[0].op.id, made[0].value, made[0].label], ['who', 'is', 'sub-1', 'Who']);
    made[0].onChange('sub-2');
    check('its onChange writes the node', builder.getValue().children[0].value, 'sub-2');
    check('and reports', changes.length, 1);
    setSelect(q(host, '.twm-filter-builder__select--op'), 'is empty');
    check('a redraw releases it', released, ['sub-1']);
    check('an operator with no value mounts none', qa(host, '.custom-editor').length, 0);
    setSelect(q(host, '.twm-filter-builder__select--op'), 'is');
    builder.destroy();
    check('destroy releases it', released.length, 2);
    const fallback = mountBuilder(group('AND', clause('plain', 'is', 'x')), editorModel);
    check('a factory answering nothing gets the default control', q(fallback.host, '.twm-filter-builder__value input').value, 'x');
    fallback.builder.destroy();
}

// ── §6 ──────────────────────────────────────────────────────────────────
section('§6 the dialog');
const lastModal = () => [...document.querySelectorAll('.twm-managed-window--modal')].at(-1);
const action = (text) => btn(q(lastModal(), '.twm-modal__actions'), text);
const pressEsc = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
{
    let threw = false;
    try { await openFilterDialog({}); } catch { threw = true; }
    ok('a dialog needs a model', threw);

    // Cancel, Esc.
    let open = openFilterDialog({ model, value: group('AND', clause('name', 'is', 'x')) });
    ok('it is a FlexDesk modal', !!lastModal() && !!q(lastModal(), '.twm-filter-dialog .twm-filter-builder'));
    await nextFrame();
    action('Cancel').click();
    check('Cancel answers null', await open, null);
    check('the window is gone', document.querySelectorAll('.twm-managed-window--modal').length, 0);

    open = openFilterDialog({ model });
    pressEsc();
    check('Esc answers null', await open, null);

    // Apply: the value, a copy.
    const original = group('AND', clause('name', 'is', 'x'));
    open = openFilterDialog({ model, value: original });
    await nextFrame();
    typeIn(q(lastModal(), '.twm-filter-builder__value input'), 'y');
    await nextFrame();
    action('Apply').click();
    const applied = await open;
    check('Apply answers the expression', applied, { action: 'submit', expr: group('AND', clause('name', 'is', 'y')) });
    check('the expression handed in is untouched', original.children[0].value, 'x');

    // Gating: invalid blocks, and says why.
    open = openFilterDialog({ model, value: group('AND', clause('name', 'is', '')) });
    await nextFrame();
    ok('an invalid expression cannot be submitted', action('Apply').disabled);
    check('and the errors are listed', q(lastModal(), '.twm-filter-dialog__errors').textContent, 'Name is: needs a value');
    typeIn(q(lastModal(), '.twm-filter-builder__value input'), 'v');
    ok('fixing it enables the button at once', !action('Apply').disabled);
    await wait(150);
    check('and the errors clear on the debounce', q(lastModal(), '.twm-filter-dialog__errors').hidden, true);
    action('Cancel').click();
    await open;

    // requireValid: false + prune + clear + seed: the "apply what is there" flow.
    open = openFilterDialog({ model, requireValid: false, prune: true, seedField: 'size', clearLabel: 'Clear the filter',
                              value: group('AND', clause('gone', 'is', 'kept')) });
    await nextFrame();
    check('the seed adds a condition', qa(lastModal(), '.twm-filter-builder__row').length, 2);
    action('Apply').click();
    check('it submits with an unknown field', await open, { action: 'submit', expr: group('AND', clause('gone', 'is', 'kept'), clause('size', 'is', 's')) });

    // A range with one end filled: it is not blank, and it matches nothing.
    {
        const half = group('AND', clause('count', 'between', [5, null]));
        for (const [words, extra] of [['prune, requireValid false', { prune: true, requireValid: false }],
                                      ['requireValid false', { requireValid: false }]]) {
            open = openFilterDialog({ model, value: half, ...extra });
            await nextFrame();
            ok(`${words}: Apply is refused`, action('Apply').disabled);
            check(`${words}: and says why`, q(lastModal(), '.twm-filter-dialog__errors').textContent, 'Count between: needs two values');
            const boxes = qa(lastModal(), '.twm-filter-builder__value input');
            typeIn(boxes[1], '9');
            ok(`${words}: filling it frees Apply`, !action('Apply').disabled);
            action('Apply').click();
            check(`${words}: and it leaves whole`, await open, { action: 'submit', expr: group('AND', clause('count', 'between', [5, 9])) });
        }
        open = openFilterDialog({ model, prune: true, requireValid: false, value: group('AND', clause('count', 'between', [null, null])) });
        await nextFrame();
        action('Apply').click();
        check('a range with neither end is still pruned', await open, { action: 'submit', expr: null });
        check('the model names them', model.partialRanges(group('OR', clause('count', 'between', [null, 3]), clause('when', 'between', ['', '']), clause('gone', 'between', [1, null]))), ['Count between: needs two values']);
        check('pruneFilter keeps one', model.pruneFilter(half), half);
    }

    // A seed beside a negated root: it narrows the filter and does not undo it.
    {
        const negated = { ...group('AND', clause('name', 'is', 'x')), negate: true };
        open = openFilterDialog({ model, seedField: 'count', value: negated });
        await nextFrame();
        typeIn(qa(lastModal(), '.twm-filter-builder__value input').at(-1), '7');
        action('Apply').click();
        check('a seed goes beside a negated root', (await open).expr, group('AND', negated, clause('count', 'is', 7)));
    }

    // The name box opens selected.
    {
        open = openFilterDialog({ model, name: { value: 'Mine' } });
        await nextFrame();
        await nextFrame();
        const box = q(lastModal(), '.twm-filter-dialog__name input');
        check('the name box opens with focus and its text selected', [document.activeElement === box, box.selectionStart, box.selectionEnd], [true, 0, 4]);
        action('Cancel').click();
        await open;
    }

    // A click beside the dialog, opted in.
    {
        const backdrop = () => [...document.querySelectorAll('.twm-managed-window__backdrop')].at(-1);
        open = openFilterDialog({ model });
        await nextFrame();
        const stays = lastModal();
        backdrop().click();
        await nextFrame();
        ok('by default the backdrop only blocks', stays.isConnected);
        action('Cancel').click();
        await open;

        open = openFilterDialog({ model, dismissOnBackdrop: true });
        await nextFrame();
        backdrop().click();
        check('with dismissOnBackdrop a click beside it dismisses', await open, null);

        // The press would blur the field, and a refused dismissal would leave the
        // keyboard on nothing.
        const press = () => backdrop().dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        open = openFilterDialog({ model });
        await nextFrame();
        ok('by default a press on the backdrop is the browser\'s', press());
        action('Cancel').click();
        await open;
        open = openFilterDialog({ model, dismissOnBackdrop: true });
        await nextFrame();
        ok('with dismissOnBackdrop the press takes no focus', !press());
        backdrop().click();
        await open;

        open = openFilterDialog({ model, dismissOnBackdrop: true, confirmDiscard: true, value: group('AND', clause('name', 'is', 'x')) });
        await nextFrame();
        const asking = lastModal();
        typeIn(q(asking, '.twm-filter-builder__value input'), 'changed');
        backdrop().click();
        await nextFrame();
        check('and confirmDiscard still asks', q(lastModal(), '.twm-modal__body--text').textContent, 'This filter has unsaved changes. Closing now throws them away.');
        q(lastModal(), '[data-action="cancel"]').click();
        await nextFrame();
        ok('kept: it stays', asking.isConnected);
        backdrop().click();
        await nextFrame();
        q(lastModal(), '[data-action="confirm"]').click();
        check('discarded: it is dismissed', await open, null);
    }

    // A question that quotes what was typed.
    {
        const asked = [];
        open = openFilterDialog({
            model,
            name: { value: 'Old' },
            actions: [{
                label: 'Delete',
                value: 'delete',
                confirm: {
                    title: 'Delete?',
                    message: (result) => { asked.push(result); return `Delete "${result.name}"?`; },
                    confirmLabel: 'Delete',
                },
            }],
        });
        await nextFrame();
        typeIn(q(lastModal(), '.twm-filter-dialog__name input'), 'Typed');
        action('Delete').click();
        await nextFrame();
        check('a confirm message is computed when it is asked', q(lastModal(), '.twm-modal__body--text').textContent, 'Delete "Typed"?');
        check('from the result', [asked.length, asked[0].action], [1, 'delete']);
        q(lastModal(), '[data-action="confirm"]').click();
        check('and the result is what comes back', (await open).name, 'Typed');
    }
    open = openFilterDialog({ model, requireValid: false, prune: true, value: group('AND', clause('name', 'is', '')) });
    await nextFrame();
    action('Apply').click();
    check('pruned to nothing, expr is null', await open, { action: 'submit', expr: null });
    open = openFilterDialog({ model, clearLabel: 'Clear the filter', value: group('AND', clause('name', 'is', 'x')) });
    await nextFrame();
    action('Clear the filter').click();
    check('Clear answers null expr', await open, { action: 'clear', expr: null });

    // Name + icon.
    const picks = ['star', 'flag', 'event'];
    open = openFilterDialog({ model, name: { value: '', placeholder: 'Name it' }, iconChoice: { options: picks, value: 'flag' }, submitLabel: 'Save' });
    await nextFrame();
    const dlg = lastModal();
    const nameBox = q(dlg, '.twm-filter-dialog__name input');
    check('the name box', nameBox.placeholder, 'Name it');
    ok('Save waits for a name', action('Save').disabled);
    typeIn(nameBox, '  Mine  ');
    ok('then enables', !action('Save').disabled);
    const trigger = q(dlg, '.twm-filter-dialog__icon-trigger');
    check('the icon shown', trigger.textContent, 'flag');
    const pop = q(dlg, '.twm-filter-dialog__icon-pop');
    ok('the grid starts closed', pop.hidden);
    trigger.click();
    ok('it opens on the search box', !pop.hidden && document.activeElement === q(dlg, '.twm-filter-dialog__icon-search'));
    check('aria-expanded', trigger.getAttribute('aria-expanded'), 'true');
    check('the current one is marked', qa(dlg, '.twm-filter-dialog__icon-option--on').map((b) => b.title), ['flag']);
    const search = q(dlg, '.twm-filter-dialog__icon-search');
    typeIn(search, 'ev');
    check('search narrows', qa(dlg, '.twm-filter-dialog__icon-option').map((b) => b.title), ['event']);
    typeIn(search, 'zzz');
    ok('and says when nothing matches', !q(dlg, '.twm-filter-dialog__icon-none').hidden);
    typeIn(search, '');
    search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const options = qa(dlg, '.twm-filter-dialog__icon-option');
    ok('Down enters the grid', document.activeElement === options[0]);
    options[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    ok('Right moves', document.activeElement === options[1]);
    options[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    ok('Up from the first row returns to the search box', document.activeElement === search);
    search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok('Esc closes only the grid', pop.hidden && !!dlg.isConnected);
    ok('and focus returns', document.activeElement === trigger);
    trigger.click();
    q(dlg, '.twm-filter-dialog').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    ok('a press elsewhere closes the grid', pop.hidden);
    trigger.click();
    qa(dlg, '.twm-filter-dialog__icon-option')[2].click();
    check('an option picks', trigger.textContent, 'event');
    action('Save').click();
    const named = await open;
    check('the result carries name and icon', [named.name, named.icon], ['Mine', 'event']);

    // Async submit: stays open, single flight, error shown, then succeeds.
    let attempts = 0;
    let release;
    open = openFilterDialog({
        model,
        onSubmit: (result) => {
            attempts += 1;
            check('onSubmit gets the result', result.action, 'submit');
            if (attempts === 1) throw new Error('disk full');
            return new Promise((r) => { release = r; });
        },
    });
    await nextFrame();
    action('Apply').click();
    await wait(0);
    check('a failed submit is shown', q(lastModal(), '.twm-filter-dialog__failure').textContent, 'disk full');
    ok('and the dialog stays', !!lastModal());
    ok('the button comes back', !action('Apply').disabled);
    action('Apply').click();
    await wait(0);
    ok('while saving the button is off', action('Apply').disabled);
    check('the failure clears', q(lastModal(), '.twm-filter-dialog__failure').hidden, true);
    action('Apply').click();
    check('a second press does not save twice', attempts, 2);
    release();
    check('it closes when the save settles', (await open).action, 'submit');

    // In flight, nothing dismisses it: the caller's answer is what happened.
    const dismissers = (dlg) => ({
        Esc: pressEsc,
        X: () => dlg.querySelector('.twm-managed-window__btn--close').click(),
    });
    {
        let settle;
        let answered = false;
        open = openFilterDialog({
            model,
            value: group('AND', clause('name', 'is', 'x')),
            confirmDiscard: true,
            clearLabel: 'Clear',
            actions: [{ label: 'Other', value: 'other', run: () => { throw new Error('must not run'); } }],
            onSubmit: () => new Promise((resolve, reject) => { settle = { resolve, reject }; }),
        });
        open.then(() => { answered = true; });
        await nextFrame();
        const dlg = lastModal();
        typeIn(q(dlg, '.twm-filter-builder__value input'), 'edited');
        action('Apply').click();
        await wait(0);
        ok('in flight every button is off',
           ['Apply', 'Cancel', 'Clear', 'Other'].every((label) => action(label).disabled));
        action('Cancel').click();
        await wait(0);
        ok('Cancel does nothing in flight', !answered && lastModal() === dlg);
        for (const [how, press] of Object.entries(dismissers(dlg))) {
            press();
            await wait(0);
            ok(`${how} does nothing in flight, and asks nothing`, !answered && lastModal() === dlg);
        }
        settle.reject(new Error('server said no'));
        await wait(0);
        check('a rejection after those is still shown', q(dlg, '.twm-filter-dialog__failure').textContent, 'server said no');
        ok('the dialog is still there', !answered && lastModal() === dlg);
        ok('the buttons come back',
           ['Apply', 'Cancel', 'Clear', 'Other'].every((label) => !action(label).disabled));

        action('Apply').click();
        await wait(0);
        pressEsc();
        await wait(0);
        settle.resolve();
        check('a save that succeeds after Esc answers the save', (await open).action, 'submit');
    }
    {
        // The same for an extra action, and only once its question is answered.
        let settle;
        open = openFilterDialog({
            model,
            actions: [{ label: 'Delete', value: 'delete',
                        confirm: { title: 'Delete?', message: 'Sure?', confirmLabel: 'Yes' },
                        run: () => new Promise((resolve) => { settle = resolve; }) }],
        });
        await nextFrame();
        const dlg = lastModal();
        action('Delete').click();
        await wait(0);
        ok('asking is not in flight: the button stays on for focus to return to',
           !btn(q(dlg, '.twm-modal__actions'), 'Delete').disabled);
        action('Yes').click();
        await wait(0);
        ok('run in flight: every button is off',
           ['Delete', 'Cancel', 'Apply'].every((label) => action(label).disabled));
        pressEsc();
        await wait(0);
        ok('and Esc does nothing', lastModal() === dlg);
        settle();
        check('it answers when run settles', (await open).action, 'delete');
    }

    // An extra action: confirm, run, error.
    const ran = [];
    let confirmed = false;
    open = openFilterDialog({
        model,
        actions: [{ label: 'Delete', value: 'delete', danger: true,
                    confirm: { title: 'Delete?', message: 'Sure?', confirmLabel: 'Yes' },
                    run: (r) => { ran.push(r.action); } }],
    });
    await nextFrame();
    action('Delete').click();
    await wait(0);
    check('it asks first', lastModal().textContent.includes('Sure?'), true);
    action('Cancel').click();
    await wait(0);
    check('No leaves it undone', ran, []);
    action('Delete').click();
    await wait(0);
    action('Yes').click();
    confirmed = true;
    check('Yes runs it and answers its value', (await open).action, 'delete');
    check('run ran', ran, ['delete']);
    ok('confirmed', confirmed);

    // Preview slot.
    const seen = [];
    open = openFilterDialog({
        model,
        value: group('AND', clause('name', 'is', 'x')),
        preview: (host, state) => {
            seen.push(state);
            host.textContent = `${state.sentence}!`;
        },
    });
    const slot = q(lastModal(), '.twm-filter-dialog__preview');
    check('the preview draws on open', [seen.length, slot.textContent], [1, 'Name is x!']);
    check('with the sentence over it', q(lastModal(), '.twm-filter-dialog__sentence').textContent, 'Name is x');
    const box = q(lastModal(), '.twm-filter-builder__value input');
    typeIn(box, 'y');
    typeIn(box, 'yz');
    check('typing is debounced', seen.length, 1);
    await wait(150);
    check('a burst redraws once', [seen.length, slot.textContent], [2, 'Name is yz!']);
    ok('the superseded drawing is aborted', seen[0].signal.aborted && !seen[1].signal.aborted);
    typeIn(box, '');
    await wait(150);
    check('an invalid expression is not previewed', seen.length, 2);
    ok('the slot is cleared and hidden', slot.hidden && slot.children.length === 0 && slot.textContent === '');
    check('the errors are there instead', q(lastModal(), '.twm-filter-dialog__errors').textContent, 'Name is: needs a value');
    typeIn(box, 'q');
    await nextFrame();
    action('Cancel').click();
    await open;
    await wait(150);
    check('no preview after closing', seen.length, 2);
    ok('closing aborts it', seen[1].signal.aborted);

    let previewThrows = true;
    open = openFilterDialog({ model, preview: () => { if (previewThrows) throw new Error('boom'); } });
    check('a throwing preview is shown', q(lastModal(), '.twm-filter-dialog__failure').textContent, 'Preview failed: boom');
    previewThrows = false;
    await nextFrame();
    action('Cancel').click();
    await open;

    // Prune applies to what is previewed.
    const prunedSeen = [];
    open = openFilterDialog({ model, prune: true, value: group('AND', clause('name', 'is', '')), preview: (h, s) => prunedSeen.push(s) });
    check('a half-built row is not previewed', model.describeFilter(prunedSeen[0].expr), 'everything');
    await nextFrame();
    action('Cancel').click();
    await open;

    // Discard guard.
    open = openFilterDialog({ model, confirmDiscard: true, value: group('AND', clause('name', 'is', 'x')) });
    await nextFrame();
    const guarded = lastModal();
    action('Cancel').click();
    check('clean: Cancel asks nothing', await open, null);
    open = openFilterDialog({ model, confirmDiscard: true, value: group('AND', clause('name', 'is', 'x')) });
    await nextFrame();
    const dirtyDialog = lastModal();
    typeIn(q(dirtyDialog, '.twm-filter-builder__value input'), 'y');
    action('Cancel').click();
    await wait(0);
    ok('dirty: Cancel asks', lastModal() !== dirtyDialog && lastModal().textContent.includes('unsaved'));
    action('Keep editing').click();
    await wait(0);
    ok('Keep editing returns to the dialog', lastModal() === dirtyDialog && dirtyDialog.isConnected);
    pressEsc();
    await wait(0);
    ok('Esc asks too', lastModal() !== dirtyDialog);
    action('Discard').click();
    check('Discard answers null', await open, null);
    check('nothing is left open', document.querySelectorAll('.twm-managed-window--modal').length, 0);
    ok('the first guarded dialog is gone', !guarded.isConnected);

    // The modal option on its own.
    const { openModal } = await import('../src/ui/components/modal.js');
    let allow = false;
    const asked = openModal({ title: 'T', beforeClose: () => allow });
    pressEsc();
    await nextFrame();
    ok('openModal: beforeClose false keeps it open', !!lastModal());
    allow = true;
    pressEsc();
    check('openModal: true lets it close', await asked, null);
}

// ── §7 ──────────────────────────────────────────────────────────────────
section('§7 exports, CSS, domain words');
{
    for (const name of ['createFilterModel', 'createFilterBuilder', 'openFilterDialog', 'FILTER_OPERATORS', 'FILTER_TYPE_OPERATORS',
                        'emptyFilter', 'cloneFilter', 'serializeFilter', 'parseFilter', 'countConditions', 'filterOptions',
                        'coerceFilterValue', 'toConditionTree', 'fromConditionTree']) {
        ok(`@flexdesk/widgets exports ${name}`, name in widgets);
    }

    const BLOCK = /\/\* ══ FILTER BUILDER[\s\S]*?\/\* ══ end FILTER BUILDER ══ \*\//;
    const block = css('flexdesk.css').match(BLOCK)?.[0];
    ok('flexdesk.css carries the block', !!block);
    const rules = stripComments(block || '');
    check('no hex colour literals', rules.match(/#[0-9a-fA-F]{3,8}\b/g), null);
    check('no rgb()/rgba() literals', rules.match(/rgba?\(/g), null);

    const js = ['filter_builder.js', 'filter_model.js'].map((f) => readFileSync(join(ROOT, 'src/ui/components', f), 'utf8')).join('\n');
    const classes = new Set([...js.matchAll(/twm-filter-[a-z]+(?:__[a-z-]+)?(?:--[a-z]+)?/g)].map((m) => m[0]));
    const unstyled = [...classes].filter((c) => !rules.includes(`.${c}`));
    check('every class it sets is styled', unstyled.filter((c) => !c.endsWith('-')), []);
    ok('it draws many classes', classes.size > 20);

    const code = stripComments(js);
    check('no state in data attributes', code.match(/dataset\.|data-[a-z]/g), null);
    const words = /\b(bugs?|tickets?|backlog|epics?|sprints?|simulation|ecosim|ecoagent|bugdesk|tables?|workspace|project)\b/i;
    const doc = readFileSync(join(ROOT, 'docs/components/filter-builder.md'), 'utf8');
    check('no application word in the code', js.match(words)?.[0] ?? null, null);
    check('nor in the block', block.match(words)?.[0] ?? null, null);
    check('nor in the docs', doc.match(words)?.[0] ?? null, null);
    ok('the docs carry the version', /\(0\.18\.0\)/.test(doc) && /\(0\.18\.1\)/.test(doc));
    ok('the docs index links the page', readFileSync(join(ROOT, 'docs/README.md'), 'utf8').includes('components/filter-builder.md'));
}

section('§8 what a condition keeps');
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fieldsel = () => q(host, '.twm-filter-builder__select--field');
    const value = () => builder.getValue().children[0];
    const wider = createFilterModel({ fields: [...FIELDS(), { key: 'title', label: 'Title', type: 'text' }] });
    const builder = createFilterBuilder(host, { model: wider, value: group('AND', clause('name', 'is', 'keepme')) });

    setSelect(fieldsel(), 'Title');
    check('a field offering the operator keeps it and the value', value(), clause('title', 'is', 'keepme'));
    setSelect(fieldsel(), 'Count');
    check('a value the new field cannot hold starts blank', value(), clause('count', 'is', null));
    typeIn(q(host, '.twm-filter-builder__value input'), '5');
    setSelect(fieldsel(), 'Name');
    check('one it can hold stays', value(), clause('name', 'is', 5));
    setSelect(fieldsel(), 'Size');
    check('a value not among the options falls to the first', value(), clause('size', 'is', 's'));
    setSelect(fieldsel(), 'Name');
    check('from there it is text', value(), clause('name', 'is', 's'));
    setSelect(fieldsel(), 'Done');
    check('an operator the field does not offer goes to its first', value(), clause('done', 'is_true'));
    builder.setValue(group('AND', clause('name', 'one_of', ['a', 'b'])));
    setSelect(fieldsel(), 'Tags');
    check('a list stays', value(), clause('tags', 'one_of', ['a', 'b']));
    setSelect(fieldsel(), 'Size');
    check('a list no longer offered starts empty', value(), clause('size', 'one_of', []));
    builder.setValue(group('AND', clause('count', 'between', [1, 2])));
    setSelect(fieldsel(), 'When');
    check('a range that is not dates starts blank', value(), clause('when', 'between', ['', '']));
    builder.destroy();

    check('moveClause on no such field is null', wider.moveClause(clause('name', 'is', 'x'), 'gone'), null);
}
{
    // A held condition under an operator its field does not offer.
    const strict = createFilterModel({ fields: [
        { key: 'qty', label: 'Qty', type: 'number', operators: ['is', 'gt'] },
        { key: 'on', label: 'On', type: 'date' },
    ] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const held = group('AND', clause('qty', 'contains', 'abc'), clause('on', 'contains', 'xyz'), clause('qty', 'is_empty'));
    const builder = createFilterBuilder(host, { model: strict, value: held });
    const cells = qa(host, '.twm-filter-builder__value');
    check('a number field shows the value it holds', cells[0].querySelector('.twm-filter-builder__carried')?.textContent, '"abc"');
    check('and draws no box', cells[0].querySelectorAll('input').length, 0);
    check('a date field too', cells[1].querySelector('.twm-filter-builder__carried')?.textContent, '"xyz"');
    check('an operator with no value draws nothing', cells[2].childElementCount, 0);
    check('the value stands', builder.getValue(), held);
    builder.destroy();

    // A days box.
    const days = document.createElement('div');
    const dayBuilder = createFilterBuilder(days, { model, value: group('AND', clause('when', 'in_last_days', 7), clause('count', 'gt', 1)) });
    const inputs = qa(days, '.twm-filter-builder__value input');
    check('a days box stops at zero', inputs[0].min, '0');
    check('a number box does not', inputs[1].min, '');
    dayBuilder.destroy();
}

console.warn = realWarn;
done();
