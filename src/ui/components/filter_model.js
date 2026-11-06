/**
 * The filter expression language: recursive AND/OR/NOT groups of conditions,
 * with no idea what it is filtering. No DOM; `filter_builder.js` is the editor.
 *
 *   Group  = { kind: 'group', op: 'AND' | 'OR', negate?: boolean, children: [...] }
 *   Clause = { kind: 'clause', field: string, op: string, value?: any }
 *
 * A node of any other kind is carried untouched and never interpreted (it is how
 * `fromConditionTree` keeps a node it cannot read). The expression is plain JSON,
 * so it round-trips through a bridge, a store and the editor as it is.
 *
 * A FIELD CATALOGUE goes in, a bound MODEL comes out:
 *
 *   const model = createFilterModel({ fields: [...] });
 *   model.matcherFor(expr)(row);
 *   model.describeFilter(expr);   // "Status is open AND Size one of s, m"
 *
 * A field is `{ key, label, type, get?, options?, operators?, editor?, hidden?,
 * group?, time? }`. `get` pulls the COMPARABLE value, not always the displayed
 * one, and defaults to `row[key]`. `options` may be a getter over live data; it
 * is read at use, never cached.
 */

/* ── operators ──────────────────────────────────────────────────────────
 *
 * `arity` is what the editor draws and what a condition needs: 0 no value, 1 one,
 * 2 a range. `multi` still has arity 1, but the value is an ARRAY. `input: 'days'`
 * marks a value that is a count of days on a date field. */

const OPERATOR_LIST = [
    { id: 'is', label: 'is', arity: 1 },
    { id: 'is_not', label: 'is not', arity: 1 },
    { id: 'contains', label: 'contains', arity: 1 },
    { id: 'not_contains', label: 'does not contain', arity: 1 },
    { id: 'starts_with', label: 'starts with', arity: 1 },
    { id: 'ends_with', label: 'ends with', arity: 1 },
    { id: 'gt', label: '>', arity: 1 },
    { id: 'lt', label: '<', arity: 1 },
    { id: 'gte', label: '>=', arity: 1 },
    { id: 'lte', label: '<=', arity: 1 },
    { id: 'between', label: 'between', arity: 2 },
    { id: 'before', label: 'before', arity: 1 },
    { id: 'after', label: 'after', arity: 1 },
    { id: 'in_last_days', label: 'in the last N days', arity: 1, input: 'days' },
    { id: 'one_of', label: 'one of', arity: 1, multi: true },
    { id: 'none_of', label: 'none of', arity: 1, multi: true },
    { id: 'all_of', label: 'all of', arity: 1, multi: true },
    { id: 'is_empty', label: 'is empty', arity: 0 },
    { id: 'is_not_empty', label: 'is not empty', arity: 0 },
    { id: 'is_null', label: 'has no value', arity: 0 },
    { id: 'is_not_null', label: 'has a value', arity: 0 },
    { id: 'is_true', label: 'is true', arity: 0 },
    { id: 'is_false', label: 'is false', arity: 0 },
];

/** Every operator FlexDesk knows, by id. */
export const FILTER_OPERATORS = Object.freeze(
    Object.fromEntries(OPERATOR_LIST.map((o) => [o.id, Object.freeze(o)])),
);

/** What a field of each type is offered unless its `operators` says otherwise. */
export const FILTER_TYPE_OPERATORS = Object.freeze({
    enum: Object.freeze(['is', 'is_not', 'one_of', 'none_of', 'is_empty', 'is_not_empty']),
    text: Object.freeze(['is', 'is_not', 'contains', 'not_contains', 'starts_with', 'ends_with',
                         'one_of', 'none_of', 'is_empty', 'is_not_empty']),
    number: Object.freeze(['is', 'is_not', 'gt', 'lt', 'gte', 'lte', 'between',
                           'one_of', 'none_of', 'is_empty', 'is_not_empty']),
    date: Object.freeze(['is', 'is_not', 'before', 'after', 'between', 'in_last_days',
                         'is_empty', 'is_not_empty']),
    set: Object.freeze(['contains', 'not_contains', 'one_of', 'none_of', 'all_of',
                        'is_empty', 'is_not_empty']),
    bool: Object.freeze(['is_true', 'is_false', 'is_empty']),
});

/* ── the expression, without a model ───────────────────────────────────── */

/** A fresh, empty AND group. */
export const emptyFilter = () => ({ kind: 'group', op: 'AND', children: [] });

/** A deep copy. The expression is JSON by contract, so this is total. */
export const cloneFilter = (expr) => (expr == null ? expr : JSON.parse(JSON.stringify(expr)));

/** The expression as text. */
export const serializeFilter = (expr) => JSON.stringify(expr);

/** An expression from `serializeFilter`'s text. Throws on text that is not one. */
export function parseFilter(text) {
    const expr = JSON.parse(text);
    if (!expr || typeof expr !== 'object' || Array.isArray(expr) || !expr.kind) {
        throw new Error('[FilterModel] not a filter expression');
    }
    return expr;
}

/** How many conditions an expression holds. A carried node counts as one. */
export function countConditions(node) {
    if (!node) return 0;
    if (node.kind !== 'group') return 1;
    return (node.children || []).reduce((n, child) => n + countConditions(child), 0);
}

/** A field's options as `{ value, label }`. Bare strings and `{ value | id, label }` are legal. */
export function filterOptions(field) {
    return (field?.options || []).map((o) => {
        if (o === null || typeof o !== 'object') return { value: o, label: String(o ?? '') };
        const value = o.value ?? o.id ?? '';
        return { value, label: String(o.label ?? value) };
    });
}

/* ── the value a text box writes ───────────────────────────────────────── */

/** How many significant decimal digits a double holds exactly. */
const EXACT_DIGITS = 15;

function significantDigits(text) {
    const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
    const lead = whole.replace(/^0+/, '');
    const tail = fraction.replace(/0+$/, '');
    return lead ? lead.length + tail.length : tail.replace(/^0+/, '').length;
}

/**
 * The value a control's string becomes, typed by the field's declared type, not
 * by sniffing: a number field writes a number when the string is a plain decimal
 * a double holds exactly. It declines (returns `raw`) whenever converting would
 * change the filter rather than type it: an empty box is empty and not zero, a
 * half-typed `-` stays text, and a wider decimal is not rounded. Every other
 * field type keeps the string.
 */
export function coerceFilterValue(field, raw) {
    if (typeof raw !== 'string' || field?.type !== 'number') return raw;
    const text = raw.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return raw;
    if (significantDigits(text) > EXACT_DIGITS) return raw;
    const value = Number(text);
    // Too small for a double: "greater than zero" is a different filter.
    if (value === 0 && /[1-9]/.test(text)) return raw;
    return value;
}

/* ── value coercion for matching ───────────────────────────────────────
 *
 * Text comparisons are case-insensitive. A date degrades to a DAY number, so "is"
 * means "same day" without timezone arithmetic; a field with `time: true` compares
 * instants instead. */

const low = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const arr = (v) => (Array.isArray(v) ? v : v === '' || v === null || v === undefined ? [] : [v]);
const first = (v) => (Array.isArray(v) ? v[0] : v);

function day(v) {
    const s = String(v ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}
const instant = (v) => (v === null || v === undefined || v === '' ? NaN : Date.parse(String(v)));

const todayUtc = () => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const isBlank = (v) => v === null || v === undefined || v === ''
    || (Array.isArray(v) && v.length === 0);

/* ── the condition tree ────────────────────────────────────────────────
 *
 * The other form an expression travels in, for a server that compiles conditions:
 *
 *   { op: 'and' | 'or', children: [...] }
 *   { op: 'not', children: [one] }
 *   { column, operator, value? }
 *
 * docs/components/filter-builder.md has the mapping and what it preserves. */

const TO_TREE_OPERATOR = Object.freeze({
    is: 'eq',
    is_not: 'ne',
    one_of: 'in',
    none_of: 'not_in',
    is_empty: 'is_blank',
    is_not_empty: 'is_not_blank',
    before: 'lt',
    after: 'gt',
});

const FROM_TREE_OPERATOR = Object.freeze({
    eq: 'is',
    ne: 'is_not',
    in: 'one_of',
    not_in: 'none_of',
    is_blank: 'is_empty',
    is_not_blank: 'is_not_empty',
});

const isBareNode = (node) => node !== null && typeof node === 'object';

/** An expression as a condition tree. A carried node comes back as it went in. */
export function toConditionTree(node) {
    if (!isBareNode(node)) return node;
    if (node.kind === 'clause') {
        const { kind: _kind, field, op, ...rest } = node;
        return { column: field, operator: TO_TREE_OPERATOR[op] ?? op, ...rest };
    }
    if (node.kind !== 'group') return node.kind === 'opaque' ? node.node : node;
    const { kind: _kind, op, negate, children, ...rest } = node;
    const list = (children || []).map(toConditionTree);
    const treeOp = String(op).toLowerCase();
    if (!negate) return { op: treeOp, children: list, ...rest };
    // `not` takes exactly one child, and a group of one needs no group around it.
    return { op: 'not', children: [list.length === 1 ? list[0] : { op: treeOp, children: list }], ...rest };
}

/**
 * A condition tree as an expression. `null` is the empty filter. A node that is
 * neither a condition, an `and`/`or` group nor a `not` of exactly one child is
 * carried as `{ kind: 'opaque', node }`: the editor shows it read-only, and
 * `toConditionTree` returns it untouched.
 */
export function fromConditionTree(node) {
    if (node === null || node === undefined) return emptyFilter();
    if (!isBareNode(node)) return { kind: 'opaque', node };
    const op = String(node.op ?? '').toLowerCase();
    if (!node.op && 'column' in node) {
        const { column, operator, ...rest } = node;
        const id = String(operator ?? 'eq').toLowerCase();
        return { kind: 'clause', field: column, op: FROM_TREE_OPERATOR[id] ?? id, ...rest };
    }
    if ((op === 'and' || op === 'or') && Array.isArray(node.children ?? [])) {
        const { op: _op, children, ...rest } = node;
        return { kind: 'group', op: op.toUpperCase(), children: (children || []).map(fromConditionTree), ...rest };
    }
    if (op === 'not' && Array.isArray(node.children) && node.children.length === 1) {
        const { op: _op, children, ...rest } = node;
        const inner = fromConditionTree(children[0]);
        // `not(and(a, b))` is one negated group. A one-child inner group stays a
        // group, so that the tree comes back with the level it arrived with.
        if (inner.kind === 'group' && !inner.negate && inner.children.length !== 1) {
            return { ...inner, negate: true, ...rest };
        }
        return { kind: 'group', op: 'AND', negate: true, children: [inner], ...rest };
    }
    return { kind: 'opaque', node };
}

/* ── the model ─────────────────────────────────────────────────────────── */

const CACHE_MAX = 200;

/**
 * Bind a field catalogue into everything that needs to know about it.
 *
 * @param {object}   o
 * @param {Array}    o.fields  the catalogue (see the top of this file)
 * @param {string}   [o.noun]  what one row is called, for messages
 * @param {Array}    [o.operators]  operators added to the catalogue, or known ones
 *   relabelled: `{ id, label, arity?, multi?, input?, match? }`. An id FlexDesk
 *   knows keeps what you leave out. `match(rowValue, clauseValue, row)` is what
 *   `matcherFor` runs for it; without one a clause using it matches nothing.
 * @param {'everything'|'nothing'} [o.emptyOr]  what an empty OR group matches. An
 *   empty AND always matches everything.
 * @param {(key: string) => string} [o.unknownName]  how a field key the catalogue
 *   does not know is shown.
 */
export function createFilterModel({
    fields, noun = 'row', operators = [], emptyOr = 'everything', unknownName = (key) => key,
}) {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const fieldByKey = (key) => byKey.get(key) || null;

    const catalogue = new Map(OPERATOR_LIST.map((o) => [o.id, o]));
    for (const o of operators) {
        const known = catalogue.get(o.id);
        if (!known && !Number.isInteger(o.arity)) {
            throw new Error(`[FilterModel] operator "${o.id}" needs an arity`);
        }
        catalogue.set(o.id, { ...known, ...o });
    }
    for (const f of fields) {
        for (const id of f.operators || []) {
            if (!catalogue.has(id)) {
                throw new Error(`[FilterModel] field "${f.key}" names unknown operator "${id}"`);
            }
        }
    }

    /** The operators a field is offered, as definitions. An unknown field has none. */
    const operatorsFor = (fieldKey) => {
        const field = byKey.get(fieldKey);
        if (!field) return [];
        const ids = field.operators || FILTER_TYPE_OPERATORS[field.type] || [];
        return ids.map((id) => catalogue.get(id));
    };
    /** Any operator's definition by id, offered on a field or not; null when unknown. */
    const operatorById = (id) => catalogue.get(id) || null;

    /** What a freshly picked (field, operator) starts from; undefined means no value. */
    function defaultValue(field, op) {
        if (!field || !op || !op.arity) return undefined;
        if (op.multi) return [];
        if (op.input === 'days') return 7;
        if (op.arity === 2) return field.type === 'number' ? [null, null] : ['', ''];
        if (field.type === 'number') return null;
        if (field.type === 'enum') return filterOptions(field)[0]?.value ?? '';
        return '';
    }

    /** A clause on `key` (default: the first field offered), on its first operator.
     *  Null when the catalogue offers nothing. */
    function newClause(key) {
        const field = key ? byKey.get(key) : fields.find((f) => !f.hidden);
        if (!field) return null;
        const op = operatorsFor(field.key)[0] || null;
        const clause = { kind: 'clause', field: field.key, op: op ? op.id : '' };
        const value = defaultValue(field, op);
        if (value !== undefined) clause.value = value;
        return clause;
    }

    /** Does `clause`'s value still mean something on `field`, under `op`? */
    function valueFits(field, op, value) {
        const errors = [];
        validateClause({ field: field.key, op: op.id, value }, errors, '');
        if (errors.length) return false;
        // A list the editor offers: a text field's single value is typed freely.
        const options = op.multi || field.type === 'enum' ? filterOptions(field) : [];
        return !options.length || arr(value).every((v) => options.some((o) => o.value === v));
    }

    /**
     * `clause` moved to the field `key`: its operator stays when that field offers
     * it, and its value when the value still fits; otherwise they start as
     * `newClause(key)`'s do. Null when the catalogue has no such field.
     */
    function moveClause(clause, key) {
        const next = newClause(key);
        if (!next) return null;
        const field = byKey.get(key);
        const op = operatorsFor(key).find((o) => o.id === clause.op);
        if (!op) return next;
        next.op = op.id;
        delete next.value;
        const value = op.arity && valueFits(field, op, clause.value) ? clause.value : defaultValue(field, op);
        if (value !== undefined) next.value = value;
        return next;
    }

    /* Compiled per type so a clause does its type dispatch ONCE, not on every row. */
    function compileClause(clause) {
        const field = byKey.get(clause?.field);
        if (!field) {
            console.warn('[FilterModel] clause references unknown field', clause?.field);
            return () => false;
        }
        const op = clause.op;
        const raw = clause.value;
        const get = field.get || ((row) => row?.[field.key]);

        const custom = catalogue.get(op)?.match;
        if (custom) return (row) => !!custom(get(row), raw, row);

        switch (op) {
            case 'is_empty': return (r) => isBlank(get(r));
            case 'is_not_empty': return (r) => !isBlank(get(r));
            case 'is_null': return (r) => get(r) === null || get(r) === undefined;
            case 'is_not_null': return (r) => get(r) !== null && get(r) !== undefined;
            case 'is_true': return (r) => get(r) === true || low(get(r)) === 'true';
            case 'is_false': return (r) => get(r) === false || low(get(r)) === 'false';
            default:
        }

        if (field.type === 'number') {
            const a = num(first(raw));
            const b = num(Array.isArray(raw) ? raw[1] : undefined);
            const list = arr(raw).map(num);
            switch (op) {
                case 'is': return (r) => num(get(r)) === a;
                case 'is_not': return (r) => num(get(r)) !== a;
                case 'gt': return (r) => num(get(r)) > a;
                case 'lt': return (r) => num(get(r)) < a;
                case 'gte': return (r) => num(get(r)) >= a;
                case 'lte': return (r) => num(get(r)) <= a;
                case 'between': return (r) => {
                    const n = num(get(r));
                    return n >= Math.min(a, b) && n <= Math.max(a, b);
                };
                case 'one_of': return (r) => list.includes(num(get(r)));
                case 'none_of': return (r) => !list.includes(num(get(r)));
                default:
            }
        }

        if (field.type === 'date') {
            const at = field.time ? instant : day;
            const a = at(first(raw));
            const b = Array.isArray(raw) ? at(raw[1]) : NaN;
            const compare = (test) => (r) => {
                const d = at(get(r));
                return !Number.isNaN(d) && test(d);
            };
            switch (op) {
                case 'is': return (r) => at(get(r)) === a;
                case 'is_not': return (r) => at(get(r)) !== a;
                case 'before': case 'lt': return compare((d) => d < a);
                case 'after': case 'gt': return compare((d) => d > a);
                case 'lte': return compare((d) => d <= a);
                case 'gte': return compare((d) => d >= a);
                case 'between': return compare((d) => d >= Math.min(a, b) && d <= Math.max(a, b));
                // Inclusive of today and of the Nth day back.
                case 'in_last_days': {
                    const days = num(first(raw));
                    return (r) => {
                        const d = day(get(r));
                        if (Number.isNaN(d) || Number.isNaN(days)) return false;
                        return d >= todayUtc() - (days - 1) * 86400000 && d <= todayUtc();
                    };
                }
                default:
            }
        }

        const one = low(first(raw));
        const many = arr(raw).map(low).filter((s) => s !== '');

        if (field.type === 'set') {
            const vals = (r) => arr(get(r)).map(low);
            switch (op) {
                case 'contains': return (r) => vals(r).includes(one);
                case 'not_contains': return (r) => !vals(r).includes(one);
                case 'one_of': return (r) => { const v = vals(r); return many.some((m) => v.includes(m)); };
                case 'none_of': return (r) => { const v = vals(r); return !many.some((m) => v.includes(m)); };
                case 'all_of': return (r) => { const v = vals(r); return many.every((m) => v.includes(m)); };
                default:
            }
        }

        // enum and text share string semantics: enum only constrains what the
        // editor offers, not how a comparison behaves.
        if (field.type === 'enum' || field.type === 'text') {
            switch (op) {
                case 'is': return (r) => low(get(r)) === one;
                case 'is_not': return (r) => low(get(r)) !== one;
                case 'contains': return (r) => low(get(r)).includes(one);
                case 'not_contains': return (r) => !low(get(r)).includes(one);
                case 'starts_with': return (r) => low(get(r)).startsWith(one);
                case 'ends_with': return (r) => low(get(r)).endsWith(one);
                case 'one_of': return (r) => many.includes(low(get(r)));
                case 'none_of': return (r) => !many.includes(low(get(r)));
                default:
            }
        }

        console.warn('[FilterModel] clause uses an operator its field cannot run', op, field.key);
        return () => false;
    }

    /** What a group with no children matches, before its NOT. */
    const emptyMatches = (group) => String(group?.op).toUpperCase() !== 'OR' || emptyOr === 'everything';

    function compile(node) {
        if (!node) return () => true;
        if (node.kind === 'clause') return compileClause(node);
        if (node.kind !== 'group') {
            console.warn('[FilterModel] cannot run a node of kind', node.kind);
            return () => false;
        }
        const children = (Array.isArray(node.children) ? node.children : []).map(compile);
        const negate = !!node.negate;
        if (!children.length) {
            const result = emptyMatches(node) !== negate;
            return () => result;
        }
        const test = String(node.op || 'AND').toUpperCase() === 'OR'
            ? (row) => children.some((c) => c(row))
            : (row) => children.every((c) => c(row));
        return negate ? (row) => !test(row) : test;
    }

    /* Cached by the expression's JSON, so a page may call this once per render or
     * per row without recompiling. Bounded: an editor changes the expression on
     * every keystroke. */
    const cache = new Map();
    function matcherFor(expr) {
        const key = JSON.stringify(expr);
        const hit = cache.get(key);
        if (hit) return hit;
        const fn = compile(expr);
        if (cache.size >= CACHE_MAX) cache.clear();
        cache.set(key, fn);
        return fn;
    }
    const evaluateFilter = (expr, row) => matcherFor(expr)(row);

    /* ── description: "Status is open AND (Size is s OR Size is m)" ─────── */

    function describeValue(field, op, value, format) {
        if (op.arity === 0) return '';
        const shown = (v) => (format && v !== '' && v !== null && v !== undefined ? format(v, field) : String(v ?? ''));
        if (op.multi) return arr(value).map(shown).join(', ');
        if (op.arity === 2) {
            const [a, b] = arr(value);
            return `${shown(a)} and ${shown(b)}`;
        }
        // Every value of a list, even under an operator that takes one: a saved
        // or foreign condition may hold several, and the sentence must not hide them.
        return Array.isArray(value) ? value.map(shown).join(', ') : shown(value);
    }

    function describeNode(node, depth, opts) {
        if (!node) return '';
        if (node.kind === 'clause') {
            const field = byKey.get(node.field);
            const op = catalogue.get(node.op) ?? { label: node.op ?? '', arity: 1 };
            // A field that has gone is SAID, so a filter matching nothing reads
            // as broken, not as empty, and what it asked stays readable.
            const subject = field ? field.label : `⚠ unknown field “${unknownName(String(node.field ?? ''))}”`;
            const value = describeValue(field, op, node.value, field ? opts.formatValue : null);
            return [subject, op.label, value].filter(Boolean).join(' ');
        }
        if (node.kind !== 'group') return `⚠ ${JSON.stringify(node.node ?? node)}`;
        const parts = (Array.isArray(node.children) ? node.children : [])
            .map((c) => describeNode(c, depth + 1, opts)).filter(Boolean);
        if (!parts.length) return emptyMatches(node) !== !!node.negate ? 'everything' : 'nothing';
        const joined = parts.join(String(node.op || 'AND').toUpperCase() === 'OR' ? ' OR ' : ' AND ');
        const many = parts.length > 1;
        if (opts.groupBrackets) {
            const group = many ? `(${joined})` : joined;
            return node.negate ? `NOT ${group}` : group;
        }
        if (node.negate) return `NOT (${joined})`;
        return depth > 0 && many ? `(${joined})` : joined;
    }

    /**
     * One line of words. `formatValue(value, field)` names each value (a key shown
     * as a person's name, say); without it a value is shown as itself. A condition
     * on a field the catalogue does not know says so, with its operator and value,
     * and its value is shown as itself.
     *
     * Brackets go where the sentence would misread without them: a nested group of
     * two or more, and whatever a NOT covers. `groupBrackets` brackets every group of
     * two or more, the root too, and leaves a NOT of one thing unbracketed: `(A AND B)`,
     * `NOT A`, for a surface that reads a group by its brackets.
     */
    const describeFilter = (expr, { formatValue = null, groupBrackets = false } = {}) => (
        describeNode(expr, 0, { formatValue, groupBrackets })
    );

    /** The field keys an expression names that the catalogue does not know. */
    function unknownFields(expr) {
        const out = new Set();
        const walk = (n) => {
            if (!n) return;
            if (n.kind === 'clause') {
                if (!byKey.has(n.field)) out.add(n.field);
            } else if (n.kind === 'group') {
                (Array.isArray(n.children) ? n.children : []).forEach(walk);
            }
        };
        walk(expr);
        return [...out];
    }

    /* ── validation: EVERY problem, not the first ───────────────────────── */

    function validateClause(node, errors, path) {
        const field = byKey.get(node.field);
        if (!field) {
            errors.push(`${path}: unknown field "${unknownName(String(node.field ?? ''))}"`);
            return;
        }
        const op = operatorsFor(field.key).find((o) => o.id === node.op);
        if (!op) {
            errors.push(`${field.label}: "${node.op}" is not a valid operator`);
            return;
        }
        if (op.arity === 0) return;
        const say = (what) => errors.push(`${field.label} ${op.label}: ${what}`);
        if (op.multi) {
            if (!Array.isArray(node.value) || node.value.length === 0) say('pick at least one value');
            return;
        }
        const values = op.arity === 2 ? arr(node.value).slice(0, 2) : [first(node.value)];
        const needed = op.arity === 2 ? 2 : 1;
        if (values.length < needed || values.some(isBlank)) {
            say(needed === 2 ? 'needs two values' : 'needs a value');
            return;
        }
        if (op.input === 'days') {
            if (!(num(values[0]) > 0)) say('value must be a positive number of days');
        } else if (field.type === 'number') {
            if (values.some((v) => Number.isNaN(num(v)))) say('value must be a number');
        } else if (field.type === 'date') {
            const at = field.time ? instant : day;
            if (values.some((v) => Number.isNaN(at(v)))) {
                say(field.time ? 'value must be a date and time' : 'value must be a date (YYYY-MM-DD)');
            }
        }
    }

    function validateNode(node, errors, path) {
        if (!node || typeof node !== 'object') {
            errors.push(`${path}: not an expression node`);
        } else if (node.kind === 'group') {
            if (node.op !== 'AND' && node.op !== 'OR') errors.push(`${path}: group op must be AND or OR`);
            if (!Array.isArray(node.children)) {
                errors.push(`${path}: group children must be an array`);
                return;
            }
            node.children.forEach((c, i) => validateNode(c, errors, `${path}/${i}`));
        } else if (node.kind === 'clause') {
            validateClause(node, errors, path);
        } else {
            errors.push(`${path}: unknown node kind "${node.kind}"`);
        }
    }

    /** `{ ok, errors }`. An empty group is valid. */
    function validateFilter(expr) {
        const errors = [];
        validateNode(expr, errors, 'expr');
        return { ok: errors.length === 0, errors };
    }

    /**
     * What is said of each range in `expr` with one end filled: it is not blank, so
     * `pruneFilter` keeps it, and what it asks (between 5 and nothing) matches nothing.
     */
    function partialRanges(expr) {
        const said = [];
        const walk = (node) => {
            if (node?.kind === 'group') {
                (Array.isArray(node.children) ? node.children : []).forEach(walk);
                return;
            }
            if (node?.kind !== 'clause') return;
            const field = byKey.get(node.field);
            const op = catalogue.get(node.op);
            if (!field || op?.arity !== 2 || op.multi) return;
            const ends = arr(node.value).slice(0, 2);
            const filled = ends.filter((v) => !isBlank(v)).length;
            if (filled === 1) said.push(`${field.label} ${op.label}: needs two values`);
        };
        walk(expr);
        return said;
    }

    /* ── prune: what is left once half-built rows are dropped ───────────── */

    function prune(node) {
        if (!node || typeof node !== 'object') return null;
        if (node.kind === 'clause') {
            const op = catalogue.get(node.op);
            if (!op || !byKey.has(node.field) || op.arity === 0) return node;
            const blank = Array.isArray(node.value) ? node.value.every(isBlank) : isBlank(node.value);
            return blank ? null : node;
        }
        if (node.kind !== 'group') return node;
        const children = (node.children || []).map(prune).filter(Boolean);
        if (!children.length) return null;
        // A group of one group is the same predicate with a level nobody asked
        // for, so a round trip does not grow a layer each time.
        if (children.length === 1 && children[0].kind === 'group' && !node.negate) return children[0];
        return { ...node, children };
    }

    /**
     * A copy with empty groups and conditions with nothing to compare against
     * dropped, or null when nothing is left. A condition this catalogue cannot
     * read, and a carried node, are kept: they were not built here. So is a range
     * with one end filled, which `partialRanges` names: someone meant that.
     */
    const pruneFilter = (expr) => prune(cloneFilter(expr));

    return Object.freeze({
        fields, noun, fieldByKey, operatorsFor, operatorById, defaultValue, newClause, moveClause, emptyMatches,
        unknownName, matcherFor, evaluateFilter, describeFilter, validateFilter, unknownFields, pruneFilter,
        partialRanges,
    });
}
