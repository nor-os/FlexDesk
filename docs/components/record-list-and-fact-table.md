# Record lists and fact sheets

> **Package:** `@flexdesk/widgets` · **For a table of rows:** [DataTable](data-table.md) · [All docs](../README.md)

Two read-only components for the parts of an application page that are not a table of rows. `createRecordList` draws a list of a few records, each a name with a quiet line of facts, pills and verbs beside them, and a state. `createFactTable` draws a sheet of facts, a name and its value row after row, and can show a before and an after. Neither needs a height: each is as tall as its contents, in any parent.

## Record lists and fact sheets (0.7.0)

Two read-only components for the parts of an application page that are not a
table of rows. Both are new: nothing that exists changes, and a page that does
not call them looks as it did. Neither needs a height: each is exactly as tall
as its contents, in any parent.

**`createRecordList(host, config)`** draws a list of records, each as a name
with a quiet line of facts under it, pills and verbs beside them, and a state.
It is for the administration list of a few records with their own actions
(keys, connections, deliveries, members), where a table would be the wrong
shape.

```js
import { createRecordList } from '@flexdesk/widgets';

const list = createRecordList(host, {
    records: keys,
    describe: (k) => ({
        name: k.name,
        facts: [k.key_id, k.role, k.expires ? `expires ${k.expires}` : 'never expires'],
        pills: [k.paused ? { text: 'paused', tone: 'warn' } : { text: 'live', tone: 'success' }],
        state: k.revoked ? 'off' : k.paused ? 'paused' : 'active',
        verbs: [
            { label: k.paused ? 'Resume' : 'Pause', onClick: (key) => toggle(key),
              refusal: k.revoked ? 'This key is revoked.' : null },
            { label: 'Revoke', danger: true, onClick: (key) => revoke(key) },
        ],
    }),
    getKey: (k) => k.key_id,
    rowAttrs: (k) => ({ 'data-key-id': k.key_id }),
    onActivate: (k) => open(k),        // one click, or Enter
    activeKey: openKeyId,
    emptyState: 'No keys yet.',
});
list.setRecords(next);                 // focus stays on the same record's same verb
```

What `describe(record, idx)` returns (without `describe`, each record is
this object itself):

| Field | What it is |
|---|---|
| `name` | The first line: text or a node. `mono: true` draws it in the monospace face. |
| `facts` | The quiet line: text, a node, or an array whose `null`, `false` and `''` parts are left out and the rest joined with `factSeparator` (`' — '`). A part may be a node. |
| `pills` | Strings or `{ text, tone, title }`. The tones drawn are `muted`, `info`, `success`, `warn` and `danger`. |
| `verbs` | `{ label, onClick(record, ev), refusal, danger, primary, icon, title, name }`. A verb with a `refusal` is a disabled button with the reason on its `title` and `data-refusal`, **and the reason is a line of text under the facts** (`twm-record__refusal`, named by `data-refusal-for`, which the button is `aria-describedby`). A reason shared by every verb is said once. `null` and `false` verbs are left out. |
| `state` | A word: `data-state` and `twm-record--state-<word>` on the row. `paused`, `off` and `dead` dim the words and pills but never the verbs; `dead` and `error` mark the left edge in the danger colour. |
| `error` | A line in the error colour under the facts. |
| `key` | The record's key, over `getKey`. |

| Option | What it does |
|---|---|
| `getKey(record, idx)` | The key (`data-record-key`). Defaults to `spec.key`, then `record.key`, then `record.id`, then the index. Keys compare as strings. |
| `onActivate(record, idx, ev)` | Opens a record. It follows `DataTable`'s `onRowActivate` rule (`row_activation.js`): not for a press on a verb or any control, not for the click that ends a drag selecting text in the list, not for the second click of a double-click. Rows get a pointer and a hover. |
| `activateOn` | `'click'`, `'dblclick'`, `'enter'`, or an array. Default `['click', 'enter']`. |
| `keyboard` | Defaults to on exactly when `onActivate` is set. The records are then one tab stop (the last focused, else the open one, else the first), each enabled verb keeps its own, ArrowUp/ArrowDown move between records (from a record or one of its verbs), Home/End go to the ends, and Enter on a record opens it. |
| `activeKey`, `setActiveKey(key)`, `getActiveKey()` | The record that is open: `twm-record--active` and `aria-current="true"`, drawn as an accent on the left edge. It survives `setRecords`. |
| `rowClass(record, idx)`, `rowAttrs(record, idx)` | Classes and attributes for the record's `<li>`, as `DataTable`'s (`null`/`false` leaves an attribute off, `true` sets it empty). |
| `emptyState` | Text, a node, or a function returning either, shown when there are no records. |
| `facts: 'ellipsis'` | Keeps every fact line to one line and puts the whole line on its `title`. By default a long fact line wraps. |
| `verbClass` | A class string, or `(verb) => string`, for a consumer with its own buttons. By default verbs are FlexDesk's `twm-btn`, with `--primary` and `--danger`. |
| `label`, `className` | The list's `aria-label`; a class on the root. |

Methods: `setRecords(records)` (keeps the focus on the same record's same verb,
by key), `getRecords()`, `refresh(key)` (asks `describe` again for that record
only; with no key, all), `getItem(key)`, `focusRecord(key)`, `dispose()`, and
`element` (the root).

**`createFactTable(host, config)`** draws a sheet of facts: a name and its
value, row after row. A `DataTable` is the wrong tool for this, because it
draws a header row, clips a long value to one line and needs a box with a
height. A fact sheet has no header row, never truncates (a value wraps at
spaces, inside a long word or URL when it must, and keeps its own line breaks),
and is as tall as its rows. The label column stays on one line.

```js
import { createFactTable } from '@flexdesk/widgets';

createFactTable(host, {
    rows: [
        { label: 'Server', value: 'db-main-01.internal' },
        { label: 'Connection string', value: dsn, mono: true },
        { label: 'Options', value: { pool: { min: 2, max: 16 } } },   // drawn as indented JSON
        { label: 'Replica', value: null },
    ],
    nullDisplay: '—',
});

// Before and after:
createFactTable(host, {
    compare: true,
    headers: ['Field', 'Now', 'After the restore'],
    rows: [{ label: 'Amount', before: 1200, after: 950 }, { label: 'Reviewer', after: 'Bea Beta' }],
});
```

| Option | What it does |
|---|---|
| `rows` | Objects `{ label, value }` (or `{ label, before, after }` with `compare`), with optional `mono`, `numeric`, `labelTitle` (a tooltip on the label), `key` (`data-key`) and `status`; or arrays of cells, `[label, value, …]`. A value is text, a number, a node, or an object (drawn as indented JSON). |
| `compare: true` | Each row draws its label, its before, an arrow and its after. A row is `twm-facts__row--changed`, `--same`, `--added` (no `before`) or `--removed` (no `after`), worked out from the two sides (objects by their JSON, a node always changed) unless the row's `status` says otherwise; `data-status` says the same. An absent side reads as `missing` (`'—'`). A row with a plain `value` spans both sides. |
| `headers` | Adds a header row (there is none by default). With `compare`, three names stand over the label, before and after columns. |
| `numeric` | Column indices drawn in tabular numerals (`twm-facts__num`), header included. |
| `mono` | Every value in the monospace face. A row's own `mono` does it for that row. |
| `nullDisplay` | What `null` and `undefined` read as (`twm-facts__null`). By default the cell is empty. |
| `labelColumn: false` | The first column is ordinary data, not a label. |
| `wrapLabels: true` | Lets a long label wrap. |
| `wrap` | How a value wraps. `'anywhere'` (the default) wraps at spaces, and inside a long word or URL when it must. `'words'` wraps at spaces only, so a long word stays whole and the sheet grows wider; use it inside a sideways scroller. `'none'` keeps only the value's own line breaks. |
| `rowClass(row, idx)`, `rowAttrs(row, idx)` | Classes and attributes for each `<tr>`. |
| `emptyState`, `label`, `className` | Shown (spanning the sheet) when there are no rows; the `aria-label`; a class on the `<table>`. |

Methods: `setRows(rows)`, `getRows()`, `getRow(idx)` (the `<tr>`), `dispose()`,
and `element` (the `<table>`).

Both were measured in headless Edge with real input (`demo/records.html`,
driven by `demo/records_probe.mjs`): no list, record, sheet or row has zero
height and none overflows its card; a long fact line, a long URL, a connection
string and a JSON value wrap inside their column while labels stay on one line;
every verb, refused ones included, is what `elementFromPoint` finds at its
centre, and a real press runs it without opening the record; real Tab,
ArrowDown and Enter open a record; at 300px the verbs go under the record's
words, inside the card.
