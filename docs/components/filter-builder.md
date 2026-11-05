# Filter builder

> **Package:** `@flexdesk/widgets` · **See also:** [Forms and dialogs](forms-and-dialogs.md) · [All docs](../README.md)

Recursive AND/OR/NOT filters. `createFilterModel` binds your field catalogue into a matcher, a describer and a validator, with no DOM. `createFilterBuilder` edits an expression anywhere you mount it, and `openFilterDialog` opens the same builder in a modal with a name, an icon and your live preview. FlexDesk knows nothing of what is filtered: fields, values and previews are yours.

## The model: `createFilterModel` (0.18.0)

```js
import { createFilterModel } from '@flexdesk/widgets';

const model = createFilterModel({
    noun: 'order',
    fields: [
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'state', label: 'State', type: 'enum', options: ['open', { value: 'shut', label: 'Closed' }] },
        { key: 'total', label: 'Total', type: 'number', get: (row) => row.amount.total },
        { key: 'placed', label: 'Placed', type: 'date' },
        { key: 'labels', label: 'Labels', type: 'set' },
        { key: 'paid', label: 'Paid', type: 'bool' },
    ],
});

const expr = {
    kind: 'group', op: 'AND', children: [
        { kind: 'clause', field: 'state', op: 'is', value: 'open' },
        { kind: 'group', op: 'OR', negate: true, children: [
            { kind: 'clause', field: 'total', op: 'gt', value: 1000 },
            { kind: 'clause', field: 'labels', op: 'contains', value: 'rush' },
        ] },
    ],
};

rows.filter(model.matcherFor(expr));
model.describeFilter(expr);  // "State is open AND NOT (Total > 1000 OR Labels contains rush)"
model.validateFilter(expr);  // { ok: true, errors: [] }
```

### The expression

A group is `{ kind: 'group', op: 'AND' | 'OR', negate?: true, children: [...] }`, nested to any depth. A condition is `{ kind: 'clause', field, op, value? }`. It is plain JSON: store it as it is, or use `serializeFilter(expr)` and `parseFilter(text)`. `emptyFilter()` is a new empty AND group, and `cloneFilter(expr)` a deep copy. A node of any other kind is kept and never interpreted; it matches nothing and `validateFilter` reports it.

An empty AND matches everything. An empty OR matches everything too, unless the model is created with `emptyOr: 'nothing'`. `negate` flips either. `countConditions(expr)` counts the conditions in an expression.

### Fields

| Property | |
|---|---|
| `key`, `label`, `type` | `type` is `text`, `enum`, `number`, `date`, `set` (the value is a list) or `bool`. |
| `get(row)` | The COMPARABLE value, which need not be the displayed one. Default: `row[key]`. |
| `options` | An `enum` field's values, and a `set` field's when they are a fixed list: bare values, `{ value, label }` or `{ id, label }`. It may be a getter over live data; it is read at use. `filterOptions(field)` normalises them. |
| `operators` | Operator ids this field is offered, replacing its type's list. |
| `editor` | A custom value editor ([below](#a-custom-value-editor-0180)). |
| `hidden` | Not offered for a new condition. A condition already on it keeps working. |
| `group` | The field select's `<optgroup>` caption. |
| `time` | On a `date` field: compare instants and draw a date-and-time box, rather than compare days. |

Text comparison ignores case. A date compares by day: `'YYYY-MM-DD'`, and anything after the 10th character is ignored.

### Operators

`FILTER_OPERATORS` is the catalogue by id, and `FILTER_TYPE_OPERATORS` what each type is offered by default:

| Type | Default operators |
|---|---|
| `text` | `is`, `is_not`, `contains`, `not_contains`, `starts_with`, `ends_with`, `one_of`, `none_of`, `is_empty`, `is_not_empty` |
| `enum` | `is`, `is_not`, `one_of`, `none_of`, `is_empty`, `is_not_empty` |
| `number` | `is`, `is_not`, `gt`, `lt`, `gte`, `lte`, `between`, `one_of`, `none_of`, `is_empty`, `is_not_empty` |
| `date` | `is`, `is_not`, `before`, `after`, `between`, `in_last_days`, `is_empty`, `is_not_empty` |
| `set` | `contains`, `not_contains`, `one_of`, `none_of`, `all_of`, `is_empty`, `is_not_empty` |
| `bool` | `is_true`, `is_false`, `is_empty` |

Also in the catalogue, for a field's `operators`: `is_null` and `is_not_null` (no value at all, as against empty), `gt`, `gte`, `lt` and `lte` on a date.

The `operators` option of `createFilterModel` adds an operator or relabels one. An id FlexDesk knows keeps what you leave out; a new one needs an `arity` (0 no value, 1 one, 2 a range). `multi: true` makes the value a list. `match(rowValue, clauseValue, row)` is what `matcherFor` runs for it; without one, a condition using it matches nothing here, which is fine for an operator only a server runs:

```js
const model = createFilterModel({
    fields: [{ key: 'owner', label: 'Owner', type: 'text', operators: ['is', 'is_me', 'is_empty'] }],
    operators: [
        { id: 'is', label: 'equals' },
        { id: 'is_me', label: 'is me', arity: 0, match: (value) => value === me },
    ],
});
```

A field naming an operator the catalogue lacks throws when the model is created.

### What the model answers

| | |
|---|---|
| `matcherFor(expr)` | `(row) => boolean`, compiled once and cached by the expression's JSON. An unknown field or operator matches nothing and warns. |
| `evaluateFilter(expr, row)` | One row. |
| `describeFilter(expr, { formatValue })` | One line of words. `formatValue(value, field)` names each value (a key shown as a name, say). An unknown field is said: `⚠ unknown field “gone”`; the `unknownName(key)` option of `createFilterModel` shapes the key shown. |
| `validateFilter(expr)` | `{ ok, errors }`, listing every problem, not the first. |
| `unknownFields(expr)` | The keys it names that the catalogue lacks, for a marker wherever a saved filter is listed. |
| `pruneFilter(expr)` | A copy without empty groups and conditions with nothing to compare against, or null when nothing is left. A condition the catalogue cannot read is kept. |
| `operatorsFor(key)`, `operatorById(id)`, `newClause(key?)`, `defaultValue(field, op)`, `fieldByKey(key)` | What the builder uses. |

`coerceFilterValue(field, text)` is the one place a control's string becomes a value. A `number` field writes a number when the string is a plain decimal a double holds exactly. It leaves the string alone when converting would change the filter: an empty box, a half-typed `-`, or a decimal wider than a double.

## The condition tree (0.18.0)

A server that compiles conditions usually wants a different spelling. `toConditionTree(expr)` and `fromConditionTree(tree)` convert to and from:

```js
{ op: 'and', children: [
    { column: 'state', operator: 'eq', value: 'open' },
    { op: 'not', children: [{ op: 'or', children: [
        { column: 'total', operator: 'gt', value: 1000 },
        { column: 'labels', operator: 'contains', value: 'rush' },
    ] }] },
] }
```

| Expression | Tree |
|---|---|
| `{ kind: 'group', op: 'AND', children }` | `{ op: 'and', children }` |
| `{ kind: 'group', op: 'OR', children }` | `{ op: 'or', children }` |
| `negate: true` on a group of one child | `{ op: 'not', children: [child] }` |
| `negate: true` on any other group | `{ op: 'not', children: [{ op, children }] }` |
| `{ kind: 'clause', field, op, value }` | `{ column, operator, value }` |
| `{ kind: 'opaque', node }` | `node`, untouched |
| `is`, `is_not` | `eq`, `ne` |
| `one_of`, `none_of` | `in`, `not_in` |
| `is_empty`, `is_not_empty` | `is_blank`, `is_not_blank` |
| `before`, `after` | `lt`, `gt` (one way: reading back gives `lt`, `gt`) |
| any other operator id | the same id |

What it preserves:

- **A tree comes back identical.** `toConditionTree(fromConditionTree(tree))` equals `tree`, up to the case of `op` and `operator`, which the conversion lower-cases. That includes an operator nobody knows, a `value` of any shape, keys it has never heard of on a node, and a missing `value`. A node it cannot read (an unknown `op`, a `not` of anything but one child) is carried as `{ kind: 'opaque', node }`, which the builder shows read-only.
- **An expression comes back the same predicate.** The ids may differ in two ways: `before`/`after` read back as `lt`/`gt`, and a negated group of one child reads back as a negated AND.
- `fromConditionTree(null)` is the empty filter. To send "no filter" as null: `const kept = model.pruneFilter(expr); return kept && toConditionTree(kept);`.

Nothing else differs, except what an empty OR means: the model's default is "everything", and a compiler following SQL's identities says "nothing", so a model whose expressions go to one is created with `emptyOr: 'nothing'`.

## The builder: `createFilterBuilder` (0.18.0)

```js
import { createFilterBuilder } from '@flexdesk/widgets';

const builder = createFilterBuilder(hostEl, {
    model,
    value: expr,                       // copied; omit for an empty group
    onChange: (next) => apply(next),   // a copy, after each change
});
builder.getValue();
builder.setValue(other);               // does not call onChange
builder.validate();
builder.focus();
builder.destroy();
```

Each group has an AND/OR toggle, NOT, `+ Condition` and `+ Group`; each condition a field select, an operator select and a value control drawn from the field's type and the operator. Removing the last condition of a nested group removes the group; the root may stay empty. A structural change redraws the tree and puts the focus back on what you were using; typing redraws nothing, so the caret stays.

**It rewrites nothing it cannot read.** A condition on a field the catalogue lacks, an operator it lacks, an operator this field is not offered, an `enum` value no longer offered and a carried node all stay exactly as they are until someone changes or removes them: the selects show them as their own entry (`⚠ unknown field “gone”`, `made_up (unknown)`), and a value it cannot interpret is shown read-only. Opening and closing a builder leaves the expression byte-identical, with one exception: an `enum` condition with no value takes the first option, because a select cannot show nothing.

### A custom value editor (0.18.0)

`field.editor` replaces the value control. It is a factory, called each time the value cell is drawn:

```js
{
    key: 'owner', label: 'Owner', type: 'text',
    operators: ['is', 'is_not', 'is_empty'],
    editor: ({ field, op, value, label, onChange }) => {
        const picker = createPersonPicker({ value, ariaLabel: label, onPick: (p) => onChange(p?.id ?? '') });
        return { el: picker.el, destroy: () => picker.destroy() };
    },
}
```

Return `{ el, destroy? }`; `destroy` is called when the cell is redrawn or the builder destroyed, so an editor with a floating list can take it off the page. Return nothing to get the default control for that operator. It is not called for an operator with no value. For a `multi` or range operator, `value` and `onChange` deal in the whole list. To show a stored key as a name in the description, pass `formatValue` to `describeFilter`.

## The dialog: `openFilterDialog` (0.18.0)

The builder in a [modal](forms-and-dialogs.md#windows-closing-focus-and-esc-01716), so its chrome, focus trap, Esc handling and stacking are every other modal's.

```js
const result = await openFilterDialog({
    model,
    value: saved?.expr,
    title: saved ? 'Edit filter' : 'New filter',
    name: { value: saved?.label ?? '', placeholder: 'e.g. Large open orders' },
    iconChoice: { value: saved?.icon, options: ['flag', 'star', 'bolt'] },
    confirmDiscard: true,
    submitLabel: 'Save',
    onSubmit: (r) => store.save({ id: saved?.id, label: r.name, icon: r.icon, expr: r.expr }),
    actions: saved ? [{
        label: 'Delete', value: 'delete', danger: true,
        confirm: { title: 'Delete this filter?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true },
        run: () => store.remove(saved.id),
    }] : [],
    preview: (host, { expr, signal }) => {
        const hits = rows.filter(model.matcherFor(expr));
        host.textContent = `${hits.length} of ${rows.length} orders match`;
    },
});
// null when dismissed; else { action: 'submit' | 'clear' | yours, expr, name?, icon? }
```

| Option | |
|---|---|
| `model`, `value` | As the builder's. `value` is copied, so dismissing loses nothing. |
| `seedField` | A field key: adds a new condition on it, for "filter by this". |
| `title`, `icon`, `width`, `height` | The window. |
| `head` | An element drawn above the conditions. |
| `name` | `{ value, label, placeholder, required }` adds a name box. `required` defaults to true and holds the submit button off until it is filled. The result's `name` is trimmed. |
| `iconChoice` | `{ value, options }` adds a searchable grid over those Material Symbols names. |
| `preview` | `(host, { expr, sentence, signal })`: yours to draw into. Called on open and, debounced, after each change, while the expression can be submitted; otherwise the slot is emptied and hidden and the errors are shown. `signal` aborts when this drawing is superseded or the dialog closes, for a preview that asks a server. The dialog shows `sentence` above the slot. |
| `requireValid` | Default true: the submit button is off, and the errors are listed, while `validateFilter` objects. False submits regardless. |
| `prune` | Validate, preview and submit `model.pruneFilter(...)`, so a half-built row is dropped rather than refused. `expr` is null when nothing is left. |
| `confirmDiscard` | Ask before Cancel, Esc, the X or the backdrop throws away a change. |
| `submitLabel`, `onSubmit` | `onSubmit(result)` may be async: the dialog stays open and the button off until it settles, a second press does nothing, and if it throws the message is shown and the dialog stays. |
| `clearLabel` | Adds a button answering `{ action: 'clear', expr: null }`, for a caller to whom "no filter" and "leave it alone" are different answers. |
| `actions` | More buttons, before Cancel: `{ label, value, danger, icon, confirm, run }`. `confirm` is `openConfirm`'s options, asked first, and `run` behaves as `onSubmit` does. |

**`openModal` gains `beforeClose`** for this: `() => boolean | Promise<boolean>`, asked when Esc, the X or the backdrop would dismiss, as `ManagedWindow`'s is. An action button does not ask it.

## Styling

Classes are `twm-filter-builder*` and `twm-filter-dialog*`. Every rule reads tokens; retheme through those.
