# DataTable

> **Package:** `@flexdesk/widgets` · **Continues in:** [cells, groups and crosstab](data-table-grid.md) · **Not a table of rows?** See [record lists and fact sheets](record-list-and-fact-table.md) · [All docs](../README.md)

`DataTable` is FlexDesk's table: sticky headers, sorting, filtering, paging, a CSV export, a row's detail folded under it, and rows fetched from a server. Every option on this page is off until you set it, and each section says what a table that sets none of them does.

**Where to look**

- An everyday list in a page (opening a row, marking the open one, dates and durations as values, `DataTable.mount`, `DataTable.withDefaults`): [DataTable options in 0.5.0: lists that need no help](#datatable-options-in-050-lists-that-need-no-help)
- Column widths and sorting: [Column sizing](#column-sizing), [Sorting a paged DataTable](#sorting-a-paged-datatable)
- Rows from a server (pages or one scrolling list, `dataSource`, row details, following, chip filters): [A server's rows in pages or as one list](#a-servers-rows-in-pages-or-as-one-list-paging) and [DataTable options in 0.7.0: details, rows from a server, and filters that are not text](#datatable-options-in-070-details-rows-from-a-server-and-filters-that-are-not-text)
- Two tables side by side: [Comparing two tables: `diff` and `createScrollLock`](#comparing-two-tables-diff-and-createscrolllock)
- Your own right-click items, a render hook, the keyboard, a remembered page: [Right-click items, a render hook, the keyboard, a remembered page](#datatable-your-own-right-click-items-a-render-hook-the-keyboard-a-remembered-page)
- Which columns show, and in what order: [Columns hidden until somebody asks for them](#datatable-columns-hidden-until-somebody-asks-for-them), [Columns in the order somebody puts them](#datatable-columns-in-the-order-somebody-puts-them-0170)
- CSV export and a select mode: [The CSV button](#datatable-the-csv-button-on-every-table-0141), [A select mode](#datatable-a-select-mode-0120)
- Editing cells, column groups, crosstabs: [DataTable as a grid](data-table-grid.md)

## Column sizing

`fitColumns(columns, avail)` (from `@flexdesk/widgets`) turns per-column
measurements into widths. Pass each column's widest cell (`natural`), the width
most cells fit (`typical`), the header label (`header`) and any user-dragged
width (`pinned`). Short columns such as ids, dates and statuses keep their full
values, and free-text columns (`text`, or anything 240px and wider) take the
rest. When space runs short, short columns lose their rare outliers first,
then text shrinks to a floor. The widths are fractional and add up to `avail`
exactly whenever the floors fit. `DataTable` does not use it yet; an embedder
that measures its own columns can.

## Sorting a paged DataTable

A client-paged `DataTable` (no `onPageChange`) keeps its page when it is
sorted, so a sort on page 3 shows rows 201–300 of the new order. Pass
`resetPageOnSort: true` (0.4.7) to start every new order at the first page, a
header click included, the way a new filter already does. It is off by default
because keeping the page is what every earlier release did. Server-side paging
is not affected: its page is your `offset`, which a sort never changes.

## DataTable options in 0.5.0: lists that need no help

0.5.0 adds options for the ordinary list in an application: one that sits in a
page, opens a row, marks the open one, and sorts dates as dates. Every option
is off until you set it. A table that sets none of them looks and behaves as it
did in 0.4, apart from the few changes listed at the end of this section. This
was measured in headless Edge: 64 cells in 7 default tables, an empty and a
loading one among them, computed the same under 0.4.7 and 0.5.0.

```js
import { DataTable } from '@flexdesk/widgets';

// House rules once, then one call per list: build AND draw.
const ListTable = DataTable.withDefaults({
    mode: 'compact', sortable: true, pagination: false,
    fitContent: true, firstColumn: 'plain', autoDispose: true,
});

const table = ListTable.mount(host, {
    headers: ['Name', 'Role', 'Last seen', 'Took'],
    rows,                                    // values, not formatted text
    columnTypes: [null, null, 'datetime', 'duration'],
    getRowKey: (row) => row[0],
    activeRow: openName,
    onRowActivate: (i, row) => open(row),    // one click opens
    rowClass: (row) => (row[1] === 'Suspended' ? 'is-off' : null),
    emptyState: 'Nobody yet.',
});
```

**Layout**

| Option | What it does |
|---|---|
| `fitContent: true` | Makes the table as tall as its rows. By default the wrapper is `height: 100%`. In a parent without a height (an ordinary block in a page that scrolls) that resolves to nothing, so the header draws and the rows do not. |
| `maxHeight: 240` | Implies `fitContent` and caps the table at this height. A number is px; a string is used as CSS. Past the cap, the body scrolls under its header. |
| `firstColumn: 'plain'` | Styles the first column like the others. By default it is styled as a time column: 120–150px wide, grey, weight 500. |
| `--twm-dt-cell-pad-block`, `--twm-dt-cell-pad-inline`, `--twm-dt-cell-line-height` | Three CSS tokens. Set them on `:root` or on any ancestor to give both densities one row height. They are unset by default, and then each density keeps its own 0.4 values. In Edge, with the tokens set to `2px`, `6px` and `1.35`, normal and compact rows both measured 21.19px. Without them, normal rows measured 27px. The normal density reads the line-height token on the table's `thead`/`tbody` and the cells inherit it, so your own line-height for the cells, the rows or the table still wins, from a cascade layer too. |

**Opening a row, and which one is open**

| Option | What it does |
|---|---|
| `onRowActivate(rowIdx, row, ev)` | Opens a row. It fires after the selection has been updated (`onRowClick` still fires before it, as in 0.4). It does not fire for a press on a control in the row (a button, link, field, label, `<summary>`, editable text, or `[data-twm-action]`), for a click that ends a drag selecting text in the table, for the second click of a double-click, or for the Ctrl click that takes a `selectable: 'single'` table's row off the selection. `ev.type` tells you which gesture fired it. If your `onSelectionChange` or `onRowClick` redraws the table (`setData`, `render`), the row that was pressed still opens; `row` is that row as it was drawn. |
| `activateOn` | Which gestures open a row: `'click'` (the default), `'dblclick'`, `'enter'`, or an array of them. A pick list, where one click selects, uses `['dblclick', 'enter']`. Enter opens the selected row (the one row selected, or the selection's anchor), which is the row a double-click on it would open. If nothing is selected, Enter opens the active row. |
| `clickable` | Adds `twm-dt--clickable` to the table, which gives rows a pointer cursor and a hover, readonly tables included. It defaults to on exactly when `onRowActivate` is set. |
| `selectable: 'single'` | Lets a click select exactly one row. Shift and Ctrl do not extend the selection, Ctrl+A selects nothing, and `setSelection` keeps the last index it is given. |
| `getRowKey(row, idx)`, `activeRow`, `setActiveRow(key)`, `getActiveRow()` | Mark the open row: `twm-dt-row--active` and `aria-current="true"`, drawn as an accent on the left edge. The mark is not the selection. It survives `setData`, sorting, filtering and paging, and a right-click does not move it. |

The landing helper `attachLandingTableBehavior` now uses the same rule as
`onRowActivate` to decide whether a click opens a row. That changes three
things, with no option (see the list at the end of this section).

**Row state**

| Option | What it does |
|---|---|
| `rowClass(row, idx)`, `rowAttrs(row, idx)` | Add classes and attributes to the row's `<tr>`. They follow the row through sorts and filters, and `updateRow` asks again, so a class the row no longer earns is removed. |
| `cellClass(value, colIdx, row, idx)` | Adds classes to a cell, after its type class. |
| `rowIcon(row, idx)` | Draws an icon (`'name'` or `{ icon, title, tone }`) at the start of the first cell. It is drawn from an attribute, so the icon's name is not part of the cell's text, its tooltip or a copy. |
| `emptyState` | Text, a node, or a function, shown in place of `emptyMessage`. It is hidden while `setLoading(true)` is on. |
| `setError(message \| node \| Error \| null)` | Shows a failure inside the table. If there are rows on screen, they stay, under a `role="alert"` banner. If there are none, the failure takes the place of the empty row. `setData({ rows })` and `setError(null)` clear it. |
| `showRowNumbers: 'position'` | Numbers rows 1, 2, 3 in the order shown, after a sort, a filter, or on a later page. `true` still numbers rows by their original index. |
| `nullDisplay: 'NULL'` | Draws `null` and `undefined` as this text, adds `twm-dt-cell--null` to the cell, and copies the text as well. |

**Values, not text**

| Option | What it does |
|---|---|
| `columnTypes: [..., 'date' \| 'datetime' \| 'duration']` | Sorts and filters the column by its value: an ISO 8601 string, a `Date` or epoch ms for dates, and milliseconds or text such as `'3.2 s'` for durations. A date-only value such as `2026-10-05` is a calendar date, so the time zone never moves it. Any other text, and a date that does not exist (`2026-02-31`), is shown as it came and sorts last. Non-ISO text is not passed to `Date.parse`, because browsers read it differently (V8 reads `'12'` as a date in 2001). Only `columnTypes` makes a column a typed column. A `getColumnType` that returns `'date'` still sets only the cell's class name, as in 0.4. |
| `dateFormat`, `dateTimeFormat` | **Default ISO: `YYYY-MM-DD` and `YYYY-MM-DD HH:mm`.** Pass a pattern (`DD.MM.YYYY`, `D MMM YYYY, h:mm a`, with `[literal]` text) or a function `(date) => string`, for every column or per column index. |
| `durationFormat` | `'auto'` (`850 ms`, `3.2 s`, `2m 5s`, `1h 2m`), `'clock'` (`1:02:05`), or a function. |
| `dateTimeZone: 'UTC'` | Reads and draws typed dates in UTC instead of the local zone. |
| `sortValue(value, colIdx, row)` | Sets what a column sorts by, for every column or (as an object or array) per column. Return `undefined` to fall back to the column's own rule. |

The column filters work on values. On a date column, `2026-10` matches October,
`>2026-10` matches after October, `<=2026-10-05` includes the 5th, and
`2026-01..2026-03` matches January through the end of March. A date operand is
ISO with two-digit parts, so an operator over a half-typed one (`>20`,
`>2026-1`) filters nothing until it is complete. Text without an operator that
is not such a date (`5 Oct`, `Oct`, `2026-1`) is matched against the cell as
drawn, so a filter narrows as you type it. On a duration column, `>1s`,
`<500ms` and `1s..1m` work. `formatDate`, `formatDuration`, `parseDateValue`
and `parseDuration` are exported, so text drawn elsewhere can use the same
words as the table.

**Housekeeping**

| Option | What it does |
|---|---|
| `DataTable.mount(host, config)` | Builds the table and draws it. The constructor still draws nothing until `render()`. |
| `DataTable.withDefaults(defaults)` | Returns a subclass whose `defaults` sit under every config it is given. `instanceof DataTable` holds, and it can be narrowed again. |
| `autoDispose: true` | Disposes the table once it has been taken out of the document and is still out a task later. It lets go of everything `dispose()` does, but it removes only the table's own elements and never empties the host. By then you may have mounted the next list into the host or written your own message there, and that stays. Do not set it on a table you detach and attach again later, such as a cached tab, because a disposed table comes back empty. |
| `resetColumnWidths()` | Forgets every dragged, fitted or restored width, the persisted ones included, and measures the columns again. Use it after a zoom or a font change. |

**Changes that need no option.** A table that sets none of the options above
behaves as it did in 0.4, except for these:

- The copy menu's document listeners (click, scroll, Escape, resize) now exist
  only while the menu is open. Before 0.5.0, a table that had ever been
  right-clicked kept them until `dispose()`.
- `attachLandingTableBehavior` judges a click by the `onRowActivate` rule:
  - A double-click opens the row once, not twice.
  - A click while text in the host is selected does not open the row. That is
    the click that ends a drag across a cell.
  - A click on a `<label>`, a `<summary>` or editable (`contenteditable`) text
    in a row does not open the row either. 0.4.7 skipped only buttons, links
    and form fields. A `[data-twm-action]` control still runs its action.
- The CSS reads the new tokens with the 0.4 values as fallbacks, so the
  computed styles are the same while the tokens are unset. One exception: the
  normal density's line-height token is declared on the `thead` and `tbody`.
  A line-height rule of yours aimed at those two elements themselves now loses
  to it if it is in a cascade layer, or has zero specificity and loads before
  `flexdesk.css`. A rule for the cells, the rows or the table does not.

## Comparing two tables: `diff` and `createScrollLock`

A side-by-side comparison is two `DataTable`s drawn from ONE aligned row list:
the rows as they are on one side, as they were on the other, and a gap where
a side has no row. Both options are off until you set them.

```js
import { DataTable, createScrollLock } from '@flexdesk/widgets';

const lock = createScrollLock({ axis: 'y' });   // 'x', 'y' or 'both'
const side = (host, pick) => DataTable.mount(host, {
    headers, rows: aligned.map((r) => pick(r) ?? blank), pagination: false,
    scrollLock: lock,
    diff: (_row, i) => ({ status: statusOf(aligned[i], pick), cells: changedCols(aligned[i]) }),
});
side(left,  (r) => r.now);
side(right, (r) => r.then);
lock.setEnabled(false);   // scroll each side on its own; true brings them level
```

- `diff: (row, rowIdx) => {status, cells?}` draws the row
  `twm-dt-diff twm-dt-diff--<status>`, for `added`, `removed`, `changed`,
  `same` or `gap`, and each column index in `cells` (an array or a Set)
  `twm-dt-diff__cell--changed`. `null` or any other status draws the row as
  without `diff`. A `gap` row's cells are drawn empty, whatever its values and
  `renderCell`, so the two sides keep their rows level. `updateRow` asks again.
- `scrollLock` takes a group from `createScrollLock()`. The table's body box
  joins it on every render and leaves on the next render and on `dispose()`.
  Any element can join with `lock.attach(el)`, which returns its detach. A
  box that joins starts at the group's last position, and the echo of a
  position the lock itself wrote moves nobody back. The lock copies pixels, so
  it lines rows up only when both sides draw rows of the same height.

## A server's rows in pages or as one list: `paging`

`paging` (off unless you set it) shows rows that your code fetches from a
server either one page at a time or as one list that loads more as the reader
scrolls. A strip under the body shows which rows are loaded. It has the page
buttons or a *Load all rows* button, and a Pages / Scroll switch if you pass
`onModeChange`. Set `paging` and the old pager (`pagination`) is not drawn.

```js
new DataTable(host, {
    headers, rows,                       // the rows you hold: one page, or all scrolled so far
    virtualize: true,
    paging: {
        mode: 'scroll',                  // what was asked for: 'pages' or 'scroll'
        pageSize: 1000,
        softLimit: 10000,                // above this many rows the table is always paged
        total: 22521,                    // exact count, or null if unknown
        atLeast: 0,                      // a lower bound when the count is not known
        offset: 0,                       // in pages: where rows[0] is in the source
        hasMore: true,
        onPage: (offset, limit) => fetchPage(offset),
        onLoadMore: () => fetchNext(),   // called near the end of the scroll
        onLoadAll: () => fetchRest(),
        onModeChange: (mode) => remember(mode),
    },
});
```

Your code holds the rows and fetches them. The table decides how to show them
with `resolvePaging`, which is exported so your code gets the same answer when
it decides what to fetch. A source with more rows than `softLimit` is shown in
pages even if scroll was asked for. The strip says so, and Scroll is disabled
with the reason. `softLimit` can't be more than `hardLimit` (default and
ceiling `PAGING_HARD_LIMIT`, 100,000), and a scrolling table never asks for rows
past it. If no count is known, the rows already loaded count as evidence: a
table that has loaded more than `softLimit` rows and still has more is paged.
While scrolling, `onLoadMore` is called within 400px of the end, or after
render when the rows don't fill the box. It is never called when the box has
no height, for example in a hidden tab. A callback that returns a Promise
blocks the next call until it settles, and the strip shows the table busy.
`setPaging(patch)` redraws the strip only, for example when a count arrives.
In pages, `showRowNumbers: 'position'` numbers rows from `offset`. Row indexes
(`__rowIndex`, the selection, `onRowClick`) still refer to positions in `rows`.
In 0.7.0 the table can fetch the rows for you: see `dataSource` with `paging`
below.

## DataTable options in 0.7.0: details, rows from a server, and filters that are not text

0.7.0 adds what a log viewer needs: a row's detail folded under it, rows read
page by page from a server, a pager that does not need a total, a live tail,
and column filters that are not text boxes. Every option is off until you set
it, and a table that sets none of them draws and behaves as in 0.6.

```js
import { DataTable } from '@flexdesk/widgets';

const LEVELS = { kind: 'chips', options: [
    { value: '', label: 'All', icon: 'list_alt' },
    { value: 'warn', label: 'Warn', icon: 'warning' },
    { value: 'error', label: 'Error', icon: 'error' },
] };
const entryOf = new WeakMap();             // each drawn row -> the entry it came from

const log = DataTable.mount(host, {
    headers: ['When', 'Level', 'Who', 'What'],
    columnTypes: ['datetime', null, null, null],
    getRowKey: (row) => entryOf.get(row)?.id,
    pageSize: 100,
    sortable: true, filterable: true,
    filterKinds: { 1: LEVELS },
    // Rows from the server. Only the newest answer is drawn; `signal` aborts the rest.
    dataSource: async (query, { signal }) => {
        const [page, facets] = await Promise.all([api.audit(query, { signal }), api.facets(query)]);
        const rows = page.data.map((e) => {
            const row = [e.at, e.level, e.who, e.action];
            entryOf.set(row, e);
            return row;
        });
        return { rows, total: facets.total ?? null, hasMore: page.meta.has_more,
                 filterCounts: { 1: { '': facets.total, ...facets.levels } } };
    },
    pagerLabels: { first: 'Newest', prev: 'Newer', next: 'Older', last: 'Oldest' },
    pagerPosition: 'bottom',
    maxJumpOffset: 50_000,
    follow: { interval: 10_000 },
    onFollowChange: (on) => followButton.setAttribute('aria-pressed', String(on)),
    rowDetail: (row) => {
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(entryOf.get(row).detail, null, 2);
        return pre;
    },
    hasRowDetail: (row) => !!entryOf.get(row)?.detail,
});
// Your own filters, outside the table, ask again from the first page:
searchBox.oninput = () => log.reload();
```

**A row's detail**

| Option | What it does |
|---|---|
| `rowDetail(row, idx, { host, key })` | Gives each row a toggle at the start of its first cell. Opening it draws a row under the row, one cell across every column; the function fills `host` or returns a node or text for it. The detail is drawn when opened and dropped when closed. Its content does not change the column widths, wraps instead of being clipped, and is not part of a copy. A click in it selects nothing, and a right-click there opens the browser's own menu. |
| `hasRowDetail(row, idx)` | Which rows have a detail. A row without one gets no toggle. |
| `expandedRows`, `setRowExpanded(key, open)`, `isRowExpanded(key)`, `getExpandedRows()`, `collapseAllRows()` | Which details are open, by key (`getRowKey`, or the row's index). The state survives a sort, a filter, a page, `setData` and `refresh()`. A key that is not on screen opens when its row is drawn. Under `dataSource`, give `getRowKey`: without it a row's index is only its place in the page drawn, so a detail stays open across a new answer only where that answer has the same row (equal values) at the same place. |
| `onRowDetailToggle(idx, row, open, key)` | Called after a detail opens or closes. |
| `rowDetailLabel` | The toggle's accessible name (default `'Details'`). Its state is `aria-expanded`, and `aria-controls` names the detail. |

The toggle is a button, so Tab reaches it and Enter or Space opens it. It
neither selects the row nor opens it (`onRowActivate`). On the focused table,
ArrowRight opens the current row's detail and ArrowLeft closes it; the same
keys work on a toggle. Rows under an open detail keep their stripes. Under
`virtualize`, an open detail counts in its row's height, and it leaves and
re-enters the window with its row. It is measured when it is drawn and again
whenever the rows are (0.6.3: on every window update, on a resize and once the
column widths are fixed), so a detail that wraps differently at the final
widths does not leave the offsets wrong. A detail is never one of the rows the
row height is measured from.

**Rows from a server**

| Option | What it does |
|---|---|
| `dataSource(query, { signal })` | Asks for a page whenever the sort, a column filter or the page changes. `query` is `{ offset, limit, sort: { column, header, ascending } \| null, filters: [{ column, header, value }], reason }`, and `reason` is `'initial'`, `'sort'`, `'filter'`, `'page'`, `'reload'` or `'refresh'` (and, with `paging`, `'more'`, `'all'` or `'mode'`). Return `{ rows, total, hasMore, filterCounts }`, or just the rows. The answer is drawn as given, with no sort, filter or slice in the browser. |
| Only the newest answer is drawn | A request sent while another is out aborts the older one (`signal`), and an older answer that still arrives is dropped. So is an older request's failure. |
| A failure keeps the rows | The rows on screen stay, under `setError`'s banner with the error's message, and `onLoadError(error, query)` is called. The next answer clears it. |
| `onLoad(result, query)` | Called after each answer that was drawn. |
| `reload()` | Asks again from the first page. Call it when a filter of your own, outside the table, changes. It resolves with the answer, or with `undefined` if a newer request replaced it. |
| `getQuery()`, `getPageInfo()` | The last query sent, and `{ offset, total, hasMore }` for the page drawn. |
| `goToPage(page)`, `goToRow(idx)` | Ask the source for that page (the one holding row `idx`), up to the last page when the total is known, and resolve when it is drawn. |

While a request is out, the loading overlay shows and the empty state stays
hidden. An empty answer under a filter keeps the filter row, so the filter can
be cleared. A filter that is still being typed when an answer arrives keeps its
text, its focus and its pending request. Row indices (`onRowActivate`,
`getSelection`, `updateRow`) are positions in the page drawn, so they always
point at a row on screen. `showRowNumbers: 'position'` numbers rows from the
page's offset.

**A pager for an unknown total**

| Option | What it does |
|---|---|
| `total: null` in the answer | The total is unknown. The pager says `Rows 101–200` and `Page 2`, with no total. Next is enabled while `hasMore` is true or, without `hasMore`, while pages come back full. Last is disabled, and the reason is on the button (`data-refusal`, and its tooltip). |
| `hasMore` (with `onPageChange`) | The same pager for a table that pages through `onPageChange`: with `totalCount: null`, set `hasMore` to `true` or `false`. |
| `pagerLabels` | `{ first, prev, next, last }` draw a word beside each button's icon, such as `Newest`, `Newer`, `Older` and `Oldest` for a log read newest first; a labelled button is never narrower than its word. `noLast` is the reason given when there is no total, and `tooDeep(max)` the reason given past `maxJumpOffset`. |
| `maxJumpOffset` | The deepest offset that Last and Go-to-row may jump to. Past it, Last is disabled with its reason, and Go asks for nothing and marks the box `aria-invalid`, with the reason on it. Use it where a deep `OFFSET` would be slow. |
| `pagerPosition: 'bottom'` | Puts the pager under the rows. |

An empty page after the first says `Page 4 · no rows` and keeps the pager, so
you can go back. A table without these options keeps the 0.6 pager.

**Pages or one scrolling list from a server: `dataSource` with `paging`**

0.6.2's `paging` and 0.7.0's `dataSource` answer two different questions, and
they combine. `paging` decides how the rows are shown: in pages, or as one list
that loads more near the end, with its strip under the body and its soft and
hard limits. `dataSource` decides who fetches them: the table. Without
`dataSource`, your code fetches, exactly as in 0.6.2. With it, the table is its
own `paging` consumer:

```js
DataTable.mount(host, {
    headers, virtualize: true,
    dataSource: (query, { signal }) => api.rows(query, { signal }),   // { rows, total, hasMore }
    paging: { mode: 'scroll', pageSize: 1000, softLimit: 10000, onModeChange: remember },
});
```

| `paging` key | Without `dataSource` (0.6.2) | With `dataSource` (0.7.0) |
|---|---|---|
| `mode`, `pageSize`, `softLimit`, `hardLimit`, `loadMorePx` | Yours | Yours. `pageSize` is also each question's `limit`. |
| `offset`, `total`, `atLeast`, `hasMore`, `held` | Yours, kept up to date with `setPaging` | Read from the source's answers (`atLeast` may be in the answer). What you pass is ignored. |
| `onPage(offset, limit)` | Yours: fetch the page | The table's: asks `{ offset, reason: 'page' }`. |
| `onLoadMore()` | Yours: fetch the next rows | The table's: asks `{ offset: rows held, limit: pageSize, reason: 'more' }` and draws the answer under the rows held. |
| `onLoadAll()` | Yours | The table's: one question, `{ limit: hardLimit − rows held, reason: 'all' }`. The source answers as many rows as it will, and `hasMore` says whether there are more. |
| `onModeChange(mode)` | Yours: show the rows the other way | Called after the table has switched and asked again from the first row (`reason: 'mode'`). Without it there is no switch, as in 0.6.2. |

So there is one strip, one set of limits and one load trigger. With `paging`
the 0.7.0 pager is not drawn, and `pagerPosition` does nothing. `pagerLabels`
and `maxJumpOffset` apply to the strip's page buttons.

- While the source answers a sort, a filter or a refresh, the table asks for no
  more rows. A sort or filter sent while more rows are on their way aborts that
  request, as any newer question does. More rows do not show the loading
  overlay; the strip shows the table is busy.
- More rows keep the scroll position, the selection and the open details.
- When the rows scrolled in prove the source holds more than `softLimit`, the
  table is shown in pages from then on (`resolvePaging`, as in 0.6.2). The page
  shown is the rows just loaded, so nothing is fetched again and the reader
  carries on where they were.
- `refresh()` and `follow` in scroll mode read the rows held again, in one
  question from the first row. Scrolling down to load more turns following
  off, the way paging away does. Rows loaded only because the first ones did not
  fill the box do not, since the reader is still at the top.
- `setPaging({ mode })` that changes how the rows are shown asks again from the
  first row. Other patches only redraw the strip, as in 0.6.2.
- `goToPage`, `goToRow` and `getPageInfo` work as they do without `paging`,
  in `paging.pageSize` pages.

**Refresh and follow**

| Option | What it does |
|---|---|
| `refresh()` | Reads the current page again in place. A reader at the top sees the rows that arrived. A reader scrolled down keeps the rows they were reading at the same place on screen, because new rows above move the scroll position instead of the rows. The selection is kept by key, as are the active row and the open details. Rows that the last answer did not hold are drawn `twm-dt-row--new` (a short highlight); this needs `getRowKey`. |
| `follow: true` or `{ interval }` | Calls `refresh()` every `interval` ms (default 10 000) while the table is on its first page, in the document, and has no request out. A tick also waits while somebody is reading: while text inside the table is selected, or the focus is inside an open detail, it reads nothing, and following resumes at the next tick after. A `refresh()` you call yourself does not wait, and puts the focus back on the same place in a detail it draws again. Paging away turns following off and calls `onFollowChange(false)`. Coming back to the first page does not turn it on again. |
| `setFollow(on)`, `isFollowing()`, `onFollowChange(on)` | Turn following on and off from your own toggle, and hear when the table turns it off. |

The follow timer holds the table weakly, so it never keeps a discarded table
alive, and it stops on `dispose()`.

**Filters that are not text**

| Option | What it does |
|---|---|
| `filterKinds` | A filter control per column, as an object or array keyed by column index, or a function `(colIdx, header) => spec`. `'text'` (or nothing) is the usual text box. `{ kind: 'chips', options: [{ value, label, icon, title }], multiple }` draws chips. `{ create(ctx) }`, or a function, is your own control. A column is never narrower than its control at its narrowest (for chips, the widest chip); above that the cell wraps the control. |
| The chips | One chip per option, each with a count. An option whose value is `''` or `null` means no filter, and it is pressed when nothing is chosen. Pressing the chosen chip again clears the filter. With `multiple`, each chip toggles its value in a list. A chip whose count is 0 is dimmed, not hidden. `createChipsFilter(ctx, spec)` builds the same control outside a table. |
| Your own control | `create(ctx)` receives `{ column, header, value, counts, setValue(v), table }` and returns `{ el, setValue(v), setCounts(c), destroy(), match(cell, value, row) }`. Only `el` is required. Call `ctx.setValue` with the new value, which can be anything, such as `{ from, to }` for a date range or a person's id. |
| `setFilterCounts(colIdx, counts)` or `setFilterCounts({ [colIdx]: counts })` | Gives a column's control its counts, keyed by option value. They are kept, so a control built later starts with them. A `dataSource` answer can carry them as `filterCounts`. `getFilterCounts(colIdx)` reads them back. |
| `setFilter(colIdx, value)`, `getFilters()`, `onFilterChange(filters)` | Set one column's filter from code (an empty value clears it), read the filters in force as `[{ column, header, value }]`, and hear every change. `clearFilters()` resets each control as well. |

Under `dataSource`, a filter's value goes to the server as it is. Without a
server, the control's `match` decides which rows pass. If it has none, the
chips use equality (or membership, with `multiple`), a `{ from, to }` value is
an inclusive range over dates or numbers, a list means "one of these", and text
means "contains". A control is built once, and the same element is put back
after every render, so its own state, the focus and the text selection inside
it survive a redraw. It is destroyed when the columns change or the table is
disposed.

**Housekeeping**

| Option | What it does |
|---|---|
| `keepWhileDetached` | With `autoDispose`, how long a table may be out of the document and still come back drawn. A number is a grace period in ms. `true` keeps the table for as long as it is out: it is disposed only by `dispose()`, and while out it holds nothing on the document. A table put back within its grace is not disposed, however many tasks it was out, and the grace counts from its last departure, not its first. Use it for a tab whose content you detach and attach again later. Without it, `autoDispose` gives one task's grace, as in 0.5.0. |

**One change that needs no option.** `autoDispose` now cancels a pending
dispose when the table is put back. Before 0.7.0, a table taken out, put back
and taken out again could be disposed by the first departure's timer.

## DataTable: your own right-click items, a render hook, the keyboard, a remembered page

These options let an application drop a private copy of the DataTable kept for
them. Every one is off until you set it, and a table that sets none of them
draws and behaves as in 0.9.1.

```js
const queue = DataTable.mount(host, {
    headers, rows, pagination: true, sortable: true, filterable: true,
    stateStore, persistKey: `queue:${view}`,
    persistPage: !!savedView,              // an ad-hoc view shares its key: start it on page 1
    getRowKey: (row) => row[0],
    contextMenuItems: (row, rowIdx, ctx) => [
        { label: ctx.selection.length > 1 ? `Open ${ctx.selection.length}` : 'Open',
          icon: 'open_in_new', action: 'open' },
        { separator: true },
        { label: 'Delete…', icon: 'delete', action: 'delete', danger: true,
          disabled: !canDelete(row), title: canDelete(row) ? '' : 'Closed records stay' },
    ],
    onContextMenuAction: (action, rowIdx, row, ctx) => run(action, ctx.selectedRows),
    onRender: (t) => status.textContent = `${t.getDisplayedRows().length} of ${rows.length} shown`,
    keyboardNav: true,
    onRowKeyDown: (rowIdx, row, ev) => {
        if (row && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { openElsewhere(row); return true; }
        if (row && ev.altKey && ev.key.toLowerCase() === 't') { openInTab(row); return true; }
    },
    onRowActivate: (i, row) => open(row),
    activateOn: ['click', 'enter'],
});
queue.focus();
```

**The right-click menu**

| Option | What it does |
|---|---|
| `contextMenuItems` | Your items in the table's own right-click menu: an array, or `(row, rowIdx, ctx) => items`, asked on every right-click of a row. An item is `{ label, icon, action, disabled, danger, title }` or `{ separator: true }`, drawn like the copy items (`disabled` greys it out, `danger` draws it red, `title` says why). `ctx` is `{ rowIdx, row, colIdx, value, selection, selectedRows }`: the row and the cell under the pointer (`colIdx` is null on the row-number column) and the selection, which by then includes the row. Your items come first; with `copyable`, a separator and the two copy items follow. Set without `copyable`, the menu has your items only, and a row you give no items gets the browser's own menu. |
| `onContextMenuAction(action, rowIdx, row, ctx)` | Called when one of your items is chosen, after the menu has closed. The copy items never call it, so an action may be named anything. |

**What the table shows**

| Option | What it does |
|---|---|
| `onRender(table)` | Called at the end of every render: the first one, `setData`, a sort, a filter, a page. A hook that throws is reported on the console and the table still draws. |
| `getDisplayedRows()` | The rows the table shows, filtered and sorted, across every page and not only the one on screen. It returns a copy. With server-side paging it is the page held. |

**The keyboard**

| Option | What it does |
|---|---|
| `keyboardNav: true` | On the focused table, ArrowUp and ArrowDown move the selection one row through the page shown, in the order shown, and Home and End go to its first and last row. With Shift they select the range from the anchor, as Shift-click does (not on a `selectable: 'single'` table). The row is scrolled into view and `onSelectionChange` is told. Keys pressed in a control inside the table are left alone. Needs `selectable`. |
| `onRowKeyDown(rowIdx, row, ev)` | Called for every key pressed on the focused table, before the table's own keys, with the row Enter would open (the one row selected, the selection's anchor, or else the active row) or `null`. Return `true` to take the key: its default is prevented and nothing after it sees it, neither the table (Enter's `onRowActivate`, the arrows, copy) nor the page. Use it for the keys `activateOn` does not take, such as Ctrl+Enter or Alt+T. |
| `focus()` | Puts the keyboard focus on the table's body without scrolling the page. Returns `false` when nothing is drawn yet. |

**A remembered page**

| Option | What it does |
|---|---|
| `persistPage: true` | With `persistKey` and `stateStore`, saves the client page with the sort and filters, and opens the table on it again. If the rows have shrunk since, it opens on the last page. A new filter, and a sort under `resetPageOnSort`, go to the first page and save that. Rows given after mounting (`rows: []`, then `setData`) still open on the saved page. Server-side paging is not affected: its page is your `offset`. Off by default, because a key shared by different row sets, such as ad-hoc filters or search results, must not reopen on a page of the previous list. Without it, the saved state is exactly what 0.9.1 saves. |

## DataTable: columns hidden until somebody asks for them

A column can be part of the row data without being drawn. People choose which
columns they see from the header's right-click menu, and the choice is
remembered. A table that sets none of these options draws every column, as in
0.9.1.

```js
const list = DataTable.mount(host, {
    headers: ['Id', 'Summary', 'Status', ...customFields.map((f) => f.label)],
    rows,
    hiddenColumns: customFields.map((_, i) => 3 + i),   // not shown until picked
    columnChooser: true,
    stateStore, persistKey: 'bugs:queue',
    onColumnsChange: (hidden) => console.log('hidden now', hidden),
});
list.setColumnVisible(3, true);
```

| Option | What it does |
|---|---|
| `hiddenColumns: [colIdx, ...]` | These columns are not drawn: no header, no filter box, no cell, no width in the fit, and they are left out of a copy and of `downloadCSV()`. They stay in the row data, so `renderCell`, `contextMenuItems`, `sortBy` and `setFilter` still see them. The last column shown can never be hidden; a list that hides all of them keeps the first. `setData({ hiddenColumns })` applies a new list. Column indices are positions, so a new `headers` list keeps the set by position. |
| `columnChooser: true` | A right-click on the header opens a menu that lists every column, with a check mark on those shown. Choosing one shows or hides it. The last column shown is greyed out and says why. Without the option the header keeps the browser's menu. |
| `setColumnVisible(colIdx, on)` | Shows or hides a column from code. Returns whether anything changed. The widths of the other columns, dragged or fitted, stay with their columns; a column shown again is measured. |
| `getHiddenColumns()` | The hidden columns' indices, ascending. |
| `onColumnsChange(hidden, { hidden, order })` | Called after every change of the set: the chooser, `setColumnVisible` and `setData({ hiddenColumns })`, and after every change of the column order (see below). `order` is `getColumnOrder()`. |
| With `persistKey` | The set is saved with the sort and the filters and restored on mount. A saved set wins over `hiddenColumns`, so a column somebody chose stays chosen. A table without these options saves exactly what 0.9.1 saves. |

A column sorted on and then hidden keeps the order; its arrow comes back with
the column.

## DataTable: columns in the order somebody puts them (0.17.0)

Columns can be dragged into a new order by their headers, or ordered from
code, and the order is remembered. The order is kept by data index, so
`hiddenColumns`, the sort, the filters, `renderCell`'s `colIdx` and cell
mode's `col` stay on their columns. A table that sets none of these options
draws its columns in their natural order and saves what 0.16 saves.

```js
const list = DataTable.mount(host, {
    headers: ['Id', 'Summary', 'Status', 'Owner'],
    rows,
    reorderable: true,
    columnOrder: [0, 3, 1, 2],              // optional starting order
    stateStore, persistKey: 'bugs:queue',
    onColumnsChange: (hidden, { order }) => console.log('order now', order),
});
list.moveColumn(3, 1);                       // positions in getColumnOrder()
```

| Option | What it does |
|---|---|
| `reorderable: true` | Every data column's header can be dragged onto another; dropped, it takes that column's place (to its left when moved left, to its right when moved right). A press that starts on a column's resize grip resizes it and never starts a drag. The row-number and select columns stay first: they cannot be dragged, and nothing can be dropped on or in front of them. The header's right-click menu offers Move left and Move right, after any `headerMenu` items and before the `columnChooser` items; they pass over hidden columns. |
| `columnOrder: [colIdx, ...]` | The order to draw the columns in: every data index once, hidden ones included. A list that is not a permutation of the columns is ignored with a console warning, and the natural order is drawn; a table mounted with no headers yet checks it, and warns once, when `setData` brings the first ones. Works without `reorderable`, in which case only code moves columns. `setData({ columnOrder })` applies a new order; `null` goes back to the natural one. |
| `moveColumn(from, to)` | Moves the column at position `from` of `getColumnOrder()` to position `to`, the others closing up: from the natural order, `moveColumn(3, 1)` draws 0, 3, 1, 2. Returns whether the order changed. Dragged widths stay with their columns. |
| `getColumnOrder()` | Every data index, hidden ones included, in the order drawn (a copy). |
| With `persistKey` | The order is saved with the sort, the filters and the widths, and restored on mount. A saved order wins over `columnOrder`. A saved order for a different number of columns than the table has today is ignored: `columnOrder` is drawn, or the natural order when there is none. That holds whether the headers are known when the blob is read or come later with `setData`; likewise, a dragged order that new headers no longer fit gives way to `columnOrder`, or the natural order. A blob saved before 0.17 (no order) loads as it did. |
| Copies and the CSV | Ctrl+C, the copy menu and `downloadCSV()` write the columns in the order shown. |

The drag is HTML5 drag-and-drop on the header cells. The cell being dragged is
`twm-dt-col--dragging`, the one under the pointer `twm-dt-col--drop` (plus
`twm-dt-col--drop-after` when the column would land to its right). The logic
lives in `column_order.js`, which is internal to the table.

## DataTable: the CSV button on every table (0.14.1)

`showExportButton: true` draws "Download visible rows as CSV" in the pagination
strip, and now draws the strip for it on a table that fits on one page too (the
button alone, no page buttons). `exportFilename` — a string, or `(table) =>
string` — names the file (default `data.csv`). With a `host` that has `dialogs`
the button opens the native Save dialog, suggesting that name; without one it
is a browser download.

```js
DataTable.mount(el, { headers, rows, pagination: true, showExportButton: true,
                      exportFilename: 'bugs.csv', host });
```

## DataTable: a select mode (0.12.0)

A list whose click opens a row can still let people pick many rows: a toggle
in the table's own header turns on a select mode, with a checkbox per row and
a click that ticks instead of opening. A table that sets none of these options
draws and behaves as in 0.11.

```js
const list = DataTable.mount(host, {
    headers, rows,
    getRowKey: (row) => row[0],            // keeps the ticks across new rows
    onRowActivate: (i, row) => open(row),  // not called while selecting
    selectToggle: true,
    onSelectModeChange: (on) => bar.hidden = !on,
    onSelectionChange: (ticked) => bar.count = ticked.length,
});
list.setSelectMode(true);
```

| Option | What it does |
|---|---|
| `selectToggle: true` | Draws a narrow leading column whose header holds a toggle button. While the mode is on, every row shows a checkbox and the header a select-all box. Needs a multi-row `selectable` (on `false` or `'single'` it is ignored, with a console warning). |
| `selectMode: true` | Starts in the mode. Draws the column even without `selectToggle`; the consumer then leaves the mode with `setSelectMode(false)`. |
| `setSelectMode(on)` / `isSelectMode()` | Turns the mode on or off from code (returns whether it changed), and says whether it is on. The selection is kept either way. |
| `onSelectModeChange(on)` | Called after every change of the mode: the toggle, Escape, `setSelectMode`. |
| In the mode | A plain click or Space ticks or unticks one row; Shift-click adds the range from the last row ticked. The arrows move a cursor without changing the ticks (Shift ticks the rows passed). A right-click keeps the ticks. Escape clears them, and a second Escape leaves the mode. Nothing opens a row: `onRowActivate` is not called (`onRowClick` still is, so a consumer that opens rows from it checks `isSelectMode()`). New rows (`setData`) keep the ticks by `getRowKey`. |
| Select-all | Ticks every row the filters let through, on every page; when all are ticked it clears them. It shows checked, mixed or clear. |

The select column is not a data column: it is not in a copy, a CSV,
`ctx.colIdx` or `hiddenColumns`, and it cannot be resized. It is drawn for the
table's whole life, so remembered widths stay on their columns when the mode
flips, and widths saved by a table without it land on the same columns.
