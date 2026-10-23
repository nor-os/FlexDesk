# DataTable as a grid

> **Package:** `@flexdesk/widgets` · **Basics:** [DataTable](data-table.md) · [All docs](../README.md)

Cell mode turns a `DataTable` into a grid: a cursor and a range of selected cells, editors that open in place, edits staged in the table with undo and redo until you commit them in one call, a fill handle, and pasting a block from Excel. The same page covers a grouped header row with callbacks to add, rename and delete columns and rows, and the crosstab: a matrix with spanned header rows and pinned label columns. Every option is off until you set it, and a table that sets none selects rows and behaves as before.

## DataTable: a grid of cells you can edit (0.17.0)

`selectionMode: 'cells'` turns a table into a grid: a click selects a cell, the
keyboard moves a cursor over cells, and with `editable` a cell opens an editor
in place. A table that sets none of these options selects rows and behaves as
in 0.16.

```js
const grid = DataTable.mount(host, {
    headers: ['Item', 'Qty', 'Note'],
    rows,
    pagination: false,
    virtualize: true,
    selectionMode: 'cells',
    editable: [1, 2],                       // or true, or (colIdx, row, rowIdx) => boolean
    editors: { num: myNumberEditor },       // by column index or by type
    onCellCommit: async ({ rowIdx, colIdx, value, previous }) => {
        const r = await api.save(rowIdx, colIdx, value);
        return r.ok ? { ok: true } : { ok: false, error: r.message };
    },
    headerMenu: (colIdx, ctx) => [{ label: `Sort by ${ctx.header}`, action: 'sort', icon: 'sort' }],
    onHeaderMenuAction: (action, colIdx) => { if (action === 'sort') grid.sortBy(colIdx); },
    columnChooser: true,
});
grid.getCellSelection();   // { anchor, focus, range }
```

| Option | What it does |
|---|---|
| `selectionMode: 'cells'` | Cell mode. A click selects one cell and puts the cursor on it; Shift+click selects the range from the anchor to it. Every cell of the range is drawn `twm-dt-cell--selected`, the cursor `twm-dt-cell--cursor`; rows are not lit. Combined with `selectToggle`, `selectMode` or `keyboardNav` those are ignored, with a console warning. |
| The keys (focused table) | Arrows move the cursor (Shift extends the range). Ctrl+arrow jumps to the edge of the block of filled cells, as a spreadsheet does. Home/End go to the row's first and last cell (Ctrl: the page's first and last cell). Tab moves right and wraps to the next row (Shift+Tab back); on the last cell (Shift+Tab: the first) the table does not take the key, so focus moves on out of the table. ArrowDown on the last row stays put. Ctrl+A selects every cell of the page; Escape collapses the range onto the cursor. The cursor stays on the page drawn and is scrolled into view; under `virtualize` its row is drawn. |
| `getCellSelection()` | `{anchor, focus, range}`. A cell is `{row, col, rowIdx}`: `row` is the position in the order shown (as `getDisplayedRows()` lists them, after sort and filter), `col` the data column, `rowIdx` the original row index. `range` is `{top, bottom, left, right, rows, columns}`: positions, the data columns at its edges, and the original row indices and data columns it covers (a hidden column inside it is not one of them). Null outside cell mode. |
| `setCellSelection(focus, anchor?)` | Puts the cursor on `{row, col}`, or selects from `anchor` to it; `null` clears. The row is brought into view. |
| `getSelection()`, `setSelection()` | Still about rows: `getSelection()` returns the rows the range touches and `onSelectionChange` hears them. `setSelection(indices)` selects the cells of those rows, first to last as shown. Ctrl+C and the copy menu copy cells, not rows, from 0.17.1 (below). |
| `onCellSelectionChange(sel)` | Called with `getCellSelection()` after every change. |
| `editable` | Which cells open an editor: `true`, an array of data column indices, or `(colIdx, row, rowIdx) => boolean`. Needs cell mode. F2, Enter, a double-click or a printable key opens it on the cursor cell (a printable key replaces the value with that character). In the editor Enter commits and moves down, Tab commits and moves right (Shift: up, left), Escape restores the cell and calls nothing; the focus leaving it commits without moving. `editCell(row, col)` opens one from code; `isEditing()` says whether one is open. |
| `editors: {[colIdx \| type]: factory}` | The editor for a column, looked up by column index and then by type (`columnTypes`, else the detected `num`/`text`). A factory gets `{value, row, rowIdx, colIdx, column: {index, header, type}, initialText, commit(value), cancel()}` and returns an element or `{el, getValue?, focus?, destroy?}`. An input, select or textarea commits its `value` on Enter and Tab; any other editor calls `commit(value)` itself. Without one, a column gets the built-in editor for its type, else a text box (`createTextEditor`); see [Built-in cell editors](#built-in-cell-editors-0171) for the editors, the `editTypes`, `locale` and `editorMessages` options and what a factory is told since 0.17.1. |
| `onCellCommit({rowIdx, colIdx, value, previous})` | Called exactly once per commit; `previous` is the value the row holds, and a value left as the cell showed it is no commit. Return nothing or `{ok: true}` (or a Promise of it) and the value is written into the row the table holds for `rowIdx` when it settles (`rows[rowIdx][colIdx]`, so a row put in by `updateRow` meanwhile keeps its other cells) and drawn. `{ok: false, error}`, a rejection or a throw leaves the typed value in the cell, drawn `twm-dt-cell--error` with the message as its `title` and `data-error`, until a later commit of that cell succeeds, the value the row holds is committed back (no call: nothing to save), or new rows arrive. While the Promise is out the cell is `twm-dt-cell--pending`. The editor always opens with the value the cell shows, a refused or pending one included. |
| While an editor is open | `render()`, and so `setData`, a sort or a page, waits and runs when the editor closes, so what is being typed is never thrown away. A commit that settles while another editor is open in its row marks its cell at once and draws the row when that editor closes. `updateRow` on the row the editor is in stores the data at once (`config.rows`, the window's row list) and returns `true`, and the row is drawn with it when the editor closes; the editor's cell is left as it is. A row that scrolls out of the virtual window commits its editor first. An editor with no `getValue` (a `{el}` around an element that is not an input, select or textarea) has no value the table can read: Enter, Tab and the focus leaving do nothing, and its row scrolling out cancels it, so what it holds is lost unless it has called `commit(value)` itself. |
| `headerMenu(colIdx, ctx) => items` | Items for the header's right-click menu, asked for the data column right-clicked (`ctx` is `{colIdx, header, hiddenColumns, table}`). Items are `{label, action, icon?, disabled?, danger?, title?}` or `{separator: true}`. Choosing one calls `onHeaderMenuAction(action, colIdx)`. With `columnChooser` the chooser's items follow behind a separator. `[]` or `null` shows only what would show without the hook: the chooser, or the page's own menu. Works in either selection mode. |

The two modules behind cell mode are exported for a consumer that builds its
own grid: `CellSelection` (the anchor, the cursor and every key's move, with no
DOM), `CellEditorHost` (one cell's editor, opened and closed exactly once) and
`createTextEditor` (the default text box). The table's own half of cell mode
is internal.

### Built-in cell editors (0.17.1)

An editable column opens the editor for its type: `text`, `multitext`,
`number`, `bool`, `choice` or `datetime`. Each reads what is typed with a
parse, and a value that does not parse is refused on the cell. `editors`
replaces any of them, for its type or its column only.

```js
const grid = DataTable.mount(host, {
    headers: ['Item', 'Qty', 'Colour', 'Note'],
    rows,
    selectionMode: 'cells',
    editable: true,
    editTypes: [null, 'number', { type: 'choice', options: ['red', 'green'] }, 'multitext'],
    locale: 'de-DE',                        // '1.234,56' is 1234.56
    editorMessages: { number: 'Keine Zahl' },
    editors: { 3: myNoteEditor },           // by column index or by type
    onCellCommit: ({ value }) => save(value),   // Qty commits a Number
});
```

| Option | What it does |
|---|---|
| The built-in editors | `text` a text box; `multitext` a text area (Enter is a new line, Ctrl/Cmd+Enter commits); `number` a text box that commits a Number; `bool` a checkbox that commits `true`/`false` when ticked or unticked (a space that opens it ticks it over); `choice` an `AutocompleteField` over the column's `options` that commits the option's value; `datetime` a text box that commits a Date. A blank number, date or choice commits `null`. A value opened and left as it was commits nothing. |
| `editTypes` | Each column's editor type, by position (an array) or by data column index (an object): a name (`'text'`, `'multitext'`, `'number'`, `'bool'`, `'choice'`, `'datetime'`, or any name `editors` is keyed by) or `{type, options?, allowOther?, rows?}`. Unset, it is the column's `columnTypes` type, else the detected one, so a numeric column opens the number editor and a `date` column the datetime editor. `choice` offers `options` (values, or `{value, label}`), filtered as you type; a pick commits its value, and typed text matching an option's label or value (any case) commits that value. Other text is refused unless `allowOther`, when it is the value. With the list open, Escape closes the list only. `rows` is a `multitext` area's height in lines (3). Only editing reads `editTypes`: drawing, sorting and filtering are as without it. |
| `locale` | The locale the number and datetime editors read and show text in (Intl's; unset: the runtime's). `'1.234,56'` is 1234.56 under `de-DE` and `'1,234.56'` is under `en-US`, and `'1 234,5'` is 1234.5 under `fr-FR` (any space, a no-break one included, where the locale groups with a space); a group separator anywhere but between groups of three digits, or a space inside the number anywhere else, is refused, never misread. Spaces around the text are ignored. A number opens without groups, in the locale's decimal separator. A datetime reads ISO 8601 (`2026-12-31`, `2026-12-31T08:30`, with `Z` or an offset an exact instant) in any locale, and day, month and year in the locale's order with a four-digit year and an optional time (`31/12/2026 08:30` under `en-GB`); when the locale's order makes no date but the day-month swap does, the swap is read. A date with no zone is in `dateTimeZone`'s. It opens as ISO. |
| A value that does not parse | `abc` in a number, `31/02/2026` in a date, a choice outside the options: Enter and Tab are refused, the editor stays open, and the cell carries the message (`twm-dt-cell--error`, `title`, `data-error`) until the next keystroke. Nothing is committed. If the focus leaves (or the row scrolls out of the window) with it, the editor closes and the cell keeps the text, marked as a refused commit is, and `onCellCommit` is not called. Under `staged` nothing is staged; anything staged into the cell afterwards (a typed value, a fill, the value the row holds) ends the refusal. The words are `EDITOR_MESSAGES`, overridden by `editorMessages: {number, datetime, bool, choice}`. |
| `editors` (0.17.1) | The editor for a column, looked up by column index and then by type (`editTypes`, else `columnTypes`, else the detected `num`/`text`; as named, then as the built-in editors name it: `num` is `number`, `date` is `datetime`). A factory gets `{value, row, rowIdx, colIdx, column: {index, header, type, ...the editTypes entry}, locale, utc, messages, initialText, commit(value, move?), cancel()}` and returns an element or `{el, getValue?, parse?, multiline?, focus?, destroy?}`. An input, select or textarea commits its `value` on Enter and Tab; any other editor calls `commit(value)` itself. With `parse()` (`=> {ok: true, value} \| {ok: false, error}`) Enter, Tab and the focus leaving commit what it reads, and a refusal is handled as the built-in editors' is. `multiline` keeps Enter for a new line (Ctrl/Cmd+Enter commits). An injected editor replaces the built-in one for its type (or its column) only. Without one, a column gets the built-in editor for its type, else a text box (`createTextEditor`). |

Exported from cell_editors.js for a consumer that builds its own grid or
reads pasted text: the six editors as `CELL_EDITORS` (`{text, multitext,
number, bool, choice, datetime}`, each `{create, parse}`: `create` a factory,
`parse(text, {locale, utc, options, allowOther, messages})` the same reading
of plain text, for a paste) with their parts: `parseNumber`, `parseDateTime`,
`parseBool`, `parseChoice`, `formatNumberForEdit`, `formatDateTimeForEdit`,
`numberSeparators`, `dateOrder`, `normalizeOptions`, `editorTypeOf`,
`EDITOR_MESSAGES` and `createNumberEditor`, `createMultiTextEditor`,
`createBoolEditor`, `createChoiceEditor`, `createDateTimeEditor`.
`CellEditorHost` takes an `onRefuse(session, error, text, reason)` beside
`onCommit` and `onCancel`, called when an editor closes holding a value that
does not parse (without it, such a close is a cancel).

### Copying cells as tab-separated values (0.17.1)

In cell mode Ctrl+C copies the cells selected, as the tab-separated text Excel
and Google Sheets paste into cells.

| What | What it does |
|---|---|
| Ctrl+C, the copy menu, `copyToClipboard()` | With `copyable` (the default), copy the CELLS selected, not their rows: a 3×4 range is 3 lines of 4 tab-separated values, in the order shown after sort and filter, its shown columns only (a hidden column inside it is left out), with no header line. With no range beyond the cursor, the cursor cell's value alone. A cell is its RAW value, not the text it shows: no `formatValue`, typed-column format, rounding or `nullDisplay` (a Price drawn `1,234.50`, value 1234.5, copies as `1234.5`); the value the cell holds now, a staged, pending or refused one included; `null` is empty. Dates copy as ISO 8601: a `Date` as `toISOString()`, in a column declared `'date'` as its day `YYYY-MM-DD` in the table's zone (`dateTimeZone`); a number in a declared `'date'`/`'datetime'` column is read as epoch ms the same way; text is copied as it is. A value holding a tab, a newline or a quote is quoted the way Excel quotes it (`"say ""hi"""`), so Excel and Google Sheets paste it back into one cell. Cell mode has no CSV copy: the right-click menu's copy item is "Copy Cells" alone (the same text as Ctrl+C), Ctrl+Shift+C is not bound (the key is left to the page), and `copyToClipboard('csv')` copies nothing and warns. Without cell mode, Ctrl+C, Ctrl+Shift+C and the copy menu ("Copy Row(s)", "Copy as CSV") copy the selected rows with a header line, as in 0.16. |

`toTSV(matrix)` and `tsvCell(value)` write tab-separated text with Excel's
quoting (a cell holding a tab, a newline or a quote is quoted and its quotes
doubled; `null` is empty; no newline after the last row): the writer cell mode
copies with.

### Pasting a block from Excel (0.17.1)

With `pasteable: true` beside `staged`, Ctrl+V on the focused table pastes the
tab-separated block Excel and Google Sheets copy at the CURSOR cell: it fills
right over the columns shown and down over the rows in the order shown, each
value read by its column's editor, and every cell is STAGED as one undo entry.

```js
const grid = DataTable.mount(host, {
    headers: ['Item', 'Qty', 'When'],
    rows,
    selectionMode: 'cells',
    editable: (colIdx, row) => colIdx !== 0 || !row.locked,
    editTypes: [null, 'number', 'datetime'],
    staged: true,
    pasteable: true,
    onPasteOverrun: ({ rows }) => confirm(`Add ${rows} row(s)?`),
    onRowsAppend: ({ rows, errors }) => store.addRows(rows),
    onCommit: ({ edits }) => api.saveBatch(edits),
});
await grid.paste('Bolt\t4\t2026-12-31\nNut\t9\t2027-01-02');   // what Ctrl+V does
```

| Option or method | What it does |
|---|---|
| `pasteable: true` | Needs `staged` (ignored with a warning without it). Ctrl+V on the focused table takes the browser's `paste` event (its `text/plain`, read by `fromTSV`); a paste inside an open editor or another field is that field's. The block lands at the cursor cell; a hidden column is stepped over. Each value is read by the parse of its column's editor: the built-in editor's for its type (`editTypes`, else `columnTypes`, else the detected one; `locale`, the zone and `editorMessages` as an editor reads them), or an injected `editors` factory's own `parse` property (`factory.parse = (text, ctx) => ({ok: true, value} \| {ok: false, error})`), else the text as it is. Every cell that reads is staged as ONE undo entry: one Ctrl+Z takes the whole paste back. A value equal to what the row holds is no change. The range then covers the block, the cursor on the cell it began at. Nothing is pasted while an editor is open, a commit is out or another paste waits. |
| Columns past the last | Dropped. A console warning and a `'warn'` toast (`toast:show` on `services.eventBus`) name how many: "3 column(s) past the last column were not pasted." |
| Rows past the last loaded row | The last loaded row is the last row in the order shown (filtered and sorted; for a server's page, the last row it sent). `onPasteOverrun({rows: n})` is asked first, `n` the rows past it. Anything but `true` (or a Promise of `true`) stages NOTHING; without the hook, such a paste stages nothing and warns. `true` hands the extra rows to `onRowsAppend({rows, errors})` and, once that settles, stages the rows that fit: `rows` are data rows (as long as `headers`, every pasted column read by its parse, the others `null`), and `errors` the values that did not read (`{row, colIdx, text, error}`, `row` an index into `rows`; that cell is `null`). Adding them is the consumer's: the table holds no row it was not given. A consumer that adds them with `setData({rows})` (the old rows first, the new ones after) keeps the paste's staged cells, because they are staged after it. Without `onRowsAppend` the extra rows are dropped with a warning. |
| A value that does not parse | `abc` in a number column: its cell is marked as an editor's refusal is (`twm-dt-cell--error`, the message as `title` and `data-error`, the pasted text kept in the cell) and nothing is staged in it; the rest of the block still stages. Anything staged into the cell afterwards ends the mark. |
| A cell `editable` refuses | Skipped: nothing is staged in it and its row is untouched. It is drawn `twm-dt-cell--paste-skipped` until the selection moves, the next paste or fill, or new rows. |
| `paste(text)` | What Ctrl+V does, from code. Resolves `{rows, cols, staged, skipped, refused, droppedColumns, appended}` (`staged` the NUMBER of cells that changed; `skipped` `[{row, col, rowIdx}]`; `refused` the same with `text` and `error`; `appended` the rows handed to `onRowsAppend`), or `null` when nothing was pasted: no `pasteable`, empty text, no cursor, an editor open, a commit or another paste out, an overrun not accepted, or new rows while `onPasteOverrun` was asked. |

`fromTSV(text)` reads tab-separated text as a matrix of strings, as Excel
writes it: character by character, so a quoted cell holding a tab, a newline
or doubled quotes is one cell; a quote opens a quoted cell only at its start;
CRLF lines read as LF ones; the newline after the last row (and any empty
lines after it) is no row; empty text is `[]`. Exported beside `toTSV`.

### Staged edits, undo and redo, one commit (0.17.0)

With `staged: true` beside `editable`, a commit from an editor is STAGED
rather than sent to `onCellCommit`: it stays in the table, drawn
`twm-dt-cell--staged`, until `commit()` hands every staged cell to the
consumer in one call. Ctrl+Z and Ctrl+Y walk the staged edits.

```js
const grid = DataTable.mount(host, {
    headers, rows,
    selectionMode: 'cells',
    editable: true,
    staged: true,
    historyLimit: 100,                      // the default
    onCommit: async ({ edits }) => {        // [{rowIdx, colIdx, value, previous}, …]
        const r = await api.saveBatch(edits);
        return { errors: r.failed };        // [{rowIdx, colIdx, error}] — empty or absent: success
    },
    onStagedChange: ({ count, canUndo, canRedo, committing }) => paintSaveButton(count),
});
saveButton.onclick = () => grid.commit();
discardButton.onclick = () => grid.discard();
```

| Option or method | What it does |
|---|---|
| `staged: true` | Needs `editable` (ignored with a warning without it). A commit stages the value: the cell shows it, drawn `twm-dt-cell--staged`, and nothing is called. Staging the value the row holds is no change. The editor opens with the staged value. |
| Ctrl+Z, Ctrl+Y (focused table) | Ctrl+Z takes the last staged edit back; Ctrl+Y or Ctrl+Shift+Z puts it back. A cell staged as `null` undoes to NO CHANGE, not to a staged null. In an open editor the keys are the editor's. `undo()` and `redo()` do the same from code. |
| `historyLimit` | The ring keeps the last this-many entries (default 100); the limit counts entries, not cells. The oldest fall off, and their cells stay staged. An entry is one cell's before/after change or one fill (a group of cell changes, undone together), never a copy of the staged set. |
| `commit()` | Calls `onCommit({edits})` ONCE with every staged cell, `{rowIdx, colIdx, value, previous}` by row then column (`previous` is what the row holds); an open editor's value is staged first. Resolves `{ok: true, committed}` on success: the values are written into the rows the table holds, and the staged cells and the ring are cleared (a Ctrl+Z after a commit does nothing). If `onCommit` resolves `{errors: [{rowIdx, colIdx, error}]}` (non-empty), each of those cells is drawn `twm-dt-cell--error` with the message as its `title` and `data-error`, every staged value stays, and `commit()` resolves `{ok: false, errors}`; `{ok: false, error}`, a rejection or a throw marks every staged cell with the message. Staging a marked cell again clears its mark. While the commit is out no editor opens and undo, redo and `discard()` do nothing. |
| `discard()` | Drops every staged cell, its marks and the ring. |
| `getStagedEdits()` | The staged cells, as `onCommit` would get them. |
| `onStagedChange({count, canUndo, canRedo, committing})` | After every change of the staged cells. |
| The freeze | While any cell is staged, sorting, filtering and paging are held: the sortable headers, the filter row's controls, the pager's buttons and the `paging` strip are disabled with the reason on them (`data-refusal`, `title`), and `sortBy`, `setFilter`, `clearFilters`, `goToPage`, `goToRow` and the paging calls refuse with a console warning. The export button is not held. `stagedRefusal` (a string, or `(count) => string`) gives the reason in the app's words. |
| New rows | `setData({rows})` drops the staged cells and the ring: the row indices they named are other rows now. |

`StagedHistory` (the ring, with no DOM: `record`, `beginGroup`/`endGroup`,
`undo`, `redo`, `reset`, writing through an injected `apply(entry, direction)`)
is exported with `ACTIONS` and `DEFAULT_HISTORY_LIMIT` for a consumer that
builds its own grid.

### Fill handle (0.17.0)

With `fillHandle: true` beside `staged`, the bottom-right cell of the range
carries a small square (`.twm-dt-fill-handle`). Dragging it up, down, left or
right over the cells beyond the range fills them as a spreadsheet does, and
stages the values: nothing is sent until `commit()`.

```js
const grid = DataTable.mount(host, {
    headers, rows,
    selectionMode: 'cells',
    editable: (colIdx, row) => !row.locked,  // a refused cell is skipped by a fill
    staged: true,
    fillHandle: true,
    onCommit: ({ edits }) => api.saveBatch(edits),
});
grid.fill({ row: 20, col: 3 });              // what dragging the handle to (20, 3) does
```

| Option or method | What it does |
|---|---|
| `fillHandle: true` | Needs `staged` (ignored with a warning without it). The handle sits in the range's corner cell (`twm-dt-cell--fill-corner`); it is not drawn while an editor is open or a commit is out. During a drag the cells it covers are drawn `twm-dt-cell--fill-preview`; the direction is the one the pointer is furthest out in (up and down win a tie), up to the page's edge. Escape, or a cancelled pointer, ends the drag without filling. A drag is never a click on the table: the click the browser makes of the press and release (on the corner cell, the row or the body) is swallowed, filled or not, so neither the range nor `onRowClick` / `onRowActivate` sees it. On release the cells are staged as ONE undo entry — one Ctrl+Z takes the whole fill back — and the range grows over them. |
| What is written | Each column of the range (each row, filling left or right) is a seed, continued by `projectSeries`: one cell repeats its value; numbers a constant step apart continue (`1, 2` filled three further gives `3, 4, 5`); `YYYY-MM-DD` dates or `Date`s a constant number of days apart continue that many days apart; texts like `Item 1, Item 2` continue their number (`INV-001` keeps its zeros); any other block repeats in a cycle. Filling up or left runs the series away from the block (`3, 4` filled up gives `2, 1`). Holding Ctrl (Cmd) at release repeats the block instead of continuing it. A hidden column is stepped over. |
| A cell `editable` refuses | Is skipped: nothing is staged in it and the row is untouched. It is drawn `twm-dt-cell--fill-skipped` until the selection moves, the next fill or new rows. |
| `fill(to, {forceCopy})` | The fill a drag to cell `to` (`{row, col}`: position shown, data column) makes, from code; `forceCopy` is Ctrl. Returns `{direction, count, staged, skipped}` (`staged` the NUMBER of cells that changed, `skipped` the refused cells as `{row, col, rowIdx}`), or null when nothing was filled. |

`detectSeries(values)` (what a seed is: `{kind, step}` with kind `copy`,
`number`, `date`, `text-number` or `cycle`, or null for blanks) and
`projectSeries(values, count, {forceCopy})` (the next `count` values; a
series keeps its seed's type) are exported as pure functions for a consumer
that builds its own grid. `values` is the seed in fill order.

## DataTable: column groups and structural edits (0.17.0)

`columnGroups` draws a second header row over the column headers, and a few
callbacks let a person add, rename and delete columns and rows from the
headers and the row menu. The consumer owns the data: every edit is a call,
and the consumer answers it with `setData`. A table that sets none of these
options draws exactly as in 0.16.

```js
const table = DataTable.mount(host, {
    headers: ['Cash', 'Loans', 'Deposits'],
    rows,
    columnGroups: [
        { key: 'assets', label: 'Assets', columns: [0, 1] },
        { key: 'liabilities', label: 'Liabilities', columns: [2] },
        { key: 'equity', label: 'Equity', columns: [] },   // drawn as a placeholder column
    ],
    onColumnAdd: (groupKey) => model.addColumn(groupKey),
    onColumnRename: (colIdx, name) => model.renameColumn(colIdx, name),
    onColumnDelete: (colIdx) => model.deleteColumn(colIdx),
    onRowAdd: (afterRowIdx) => model.addRow(afterRowIdx),        // null: from the header
    onRowDelete: (rowIdx) => model.deleteRow(rowIdx),
});
```

| Option | What it does |
|---|---|
| `columnGroups: [{key, label?, columns}]` | A group row above the headers: one cell per run of shown columns of a group, spanning them (`th.twm-dt-group`), and a blank cell over the row number, the select column and any column in no group. `columns` are data column indices; a column is in the first group that lists it; a hidden column leaves its group's span; with `columnOrder` the runs follow the order drawn, so a group whose columns are not side by side gets one cell per run. The row is its own table in the header wrap (`table.twm-dt-groups`), which takes the header's column widths, table width and sideways scroll after every fit, auto-size and drag. `setData({columnGroups})` changes the groups. |
| An empty group | Keeps one placeholder column so it stays visible and its add control reachable: `th.twm-dt-col--placeholder` in the header, an empty filter cell, and an empty `td.twm-dt-cell--placeholder` in every row. It stands after the columns of the groups listed before it, and is no data column: not in a copy, the CSV, a menu's `ctx.colIdx` or cell mode. |
| `onColumnAdd(groupKey)` | An add button (`.twm-dt-group__add`) in every group's header cell and in a placeholder's header. |
| `groupActions(group, {key, columns, table}) => items`, `onGroupAction(action, groupKey)` | The consumer's buttons in a group's header cell. Items are `{action, icon?, label?, title?, disabled?}`. |
| `columnActions(colIdx, {colIdx, header, table}) => items`, `onColumnAction(action, colIdx)` | The consumer's buttons in a column's header (`.twm-dt-col-action`), with the same items. A click on one does not sort. |
| `onColumnRename(colIdx, name)` | Renames a column in place with `attachInlineRenamer`. "Rename column" in the header's right-click menu, `renameColumn(colIdx)`, or a double-click on the header's label (on a table that is not `sortable`) opens it. Enter, or the focus leaving, with a different non-empty name calls it once. Escape, or the name left as it was, restores the header and calls nothing. The new name shows until the next render; returning `false` or `{ok: false}` (or a Promise of it) restores the old one. |
| `onColumnDelete(colIdx)` | "Delete column" in the header's right-click menu. |
| `onRowAdd(afterRowIdx)` | "Insert row below" in a row's right-click menu (the row's original index), and "Add row" in the header's (`null`), so a table with no rows can get its first. |
| `onRowDelete(rowIdx)` | "Delete row" in a row's right-click menu. |

The structural items follow the consumer's own: in the header menu after the
`headerMenu` items and before the column chooser, in a row's menu after the
`contextMenuItems` and before the copy items, each behind a separator.

## DataTable: a crosstab, with spanned header rows and pinned label columns (0.17.0)

`crosstab` draws the table as a matrix: rows of spanned headers over the
column headers, the leading columns as row labels, and all of it in ONE table
in ONE scroller. The header rows stick to the top, the label columns (with the
select and row-number columns in front of them) stick to the left, and the
corner, the header cells over the label columns, sticks to both. Each header
row's `top` is the measured height of the rows above it, and each pinned
column's `left` the measured width of the pinned columns before it. Both are
read after layout and again whenever a header row or a pinned header cell
changes size (a label that wraps, a font, a zoom). The consumer supplies every
value and every label: rows and columns that add others up are ordinary rows
and columns, marked with `rowClass`, `cellClass` and a header cell's
`className`. A table without `crosstab` draws exactly as in 0.16.

```js
const table = DataTable.mount(host, {
    headers: ['Region', 'City', 'Q1', 'Q2', 'Q1', 'Q2', 'All'],
    rows,                                   // ['North', 'Oslo', 1, 2, 3, 4, 10], …
    pagination: false,
    virtualize: true,                       // a large matrix: draw the rows in view
    rowClass: (row) => (row[0] === 'All' ? 'my-sum-row' : null),
    crosstab: {
        labelColumns: 2,                    // 'Region' and 'City' are row labels
        headerRows: [[                      // one row of spans per level, top first
            { label: '2024', columns: [2, 3] },
            { label: '2025', columns: [4, 5] },
            { label: 'All', columns: [6], className: 'my-sum-head' },
        ]],
    },
});
```

| `crosstab` key | What it does |
|---|---|
| `labelColumns` | How many of the leading drawn data columns are row labels (default 0). They are marked `twm-dt-pin` in every row, the header and the filter row, and pinned at the measured widths. One column with the depth drawn by the consumer (`cellClass`, `renderCell`), or one per level: both are just a count. |
| `headerRows: [[{label, columns, className?, title?}]]` | The rows of spans above the column headers, top first. A cell spans the run of drawn body columns it lists (`columns` are data column indices, as in `columnGroups`; a column is in the first cell of its row that lists it); a run of columns in no cell of a row is a blank cell. Every row's spans add up to the body's columns. Above the label columns stands the corner: one `th.twm-dt-crosstab__corner` per pinned column, spanning every header row. |
| `emptyLabel` | With no body column at all (an empty axis), one column headed with this text (default `'(none)'`) and an empty cell in every row, and no header rows. It is no data column. |

The table carries `twm-dt-crosstab`, the header rows `tr.twm-dt-crosstab__band`
and the column headers `tr.twm-dt-crosstab__leaf`; the spanned header cells are
`columnGroups`' group cells (`th.twm-dt-group`) and are styled as those. There
is no separate header table, so the split layout's column fit, resize grips,
header right-click menu (`columnChooser`, `headerMenu`, and the header items of
`onColumnRename`, `onColumnDelete` and `onRowAdd`), `columnActions`,
`reorderable` and `columnGroups` row do not apply (`columnGroups` is ignored
with a warning).

A row's background is the custom property `--twm-dt-row-bg` on its `<tr>`
(the zebra stripe sets it on even rows, at no specificity). Every crosstab row
paints it, and the pinned label cells lay it over their opaque surface, so a
coloured row keeps its colour across the label cells too. To colour a row, set
the property from its `rowClass`, not `background` on the `tr` (the crosstab's
row rule paints the property instead):

```css
.my-sum-row { --twm-dt-row-bg: rgba(255, 255, 255, 0.06); }
```
The pinned cells' background is one opaque stack the crosstab owns (it is
`!important`, so neither a state rule nor an animation can make it see-through):
every tint FlexDesk paints on a cell — hover, the clickable hover, row and cell
selection, `staged`, the fill's skipped mark, placeholders, `diff` and the
new-row flash — is drawn as a layer over the row's `--twm-dt-row-bg` over the
surface (`--surface-0`), the same tint the unpinned cells of that row show.
Under `virtualize` the columns are held at the widths first measured, so they
do not shift as rows scroll in and out. With 1,000 rows and 50 body columns
under `virtualize`, the first draw stays well under 300 ms in jsdom (tests/crosstab.test.mjs §6).
