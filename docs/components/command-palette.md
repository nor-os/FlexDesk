# Command palette

> **Package:** `@flexdesk/wm` · **See also:** [Keys, Back and tab layout](keymap.md) · [All docs](../README.md)

Ctrl+K opens the command palette. It searches the entity catalog you pass to `createShell` (built with `createEntityCatalog`) and the commands you give it, and a pick can open in place, in a split or in a window. Everything here is passed as `palette: { … }`, and the options are opt-in: a shell that passes none keeps the chip strip, the panel toggles and the flat list.

## The palette that finds anything (0.9.0; matching tightened in 0.9.1)

Ctrl+K's grouped layout. Every option is off unless you pass it, so a shell that
passes none of them keeps the chip strip, the panel toggles and the flat list:

```js
await createShell({
    // …everything above…
    palette: {
        placeholder: 'Search everything…',
        layout: 'grouped',                       // a header per kind, matches marked
        chrome: { pages: false, panels: false }, // nothing between the input and the results
        groupCap: 4,                             // then "Show all N", which scopes to the kind
        cache: true,                             // a re-open draws the last catalogue at once
        empty: async () => recentRows(),         // shown before anything is typed, under "Recent"
        commands: () => commandRows(),           // `{label, action}`; `>` restricts to them
        drill: (pick) => pick.kind === 'planet'  // Tab on a row enters a scope
            ? { label: `${pick.label} › moons`, search: (q, signal) => findMoons(pick.id, q, signal) }
            : null,
        onPick: (pick, { mode, scope }) => openSomewhere(pick, mode), // 'open' | 'split' | 'window'
    },
});
```

A row may carry `context` (drawn, not searched), `keywords` (searched, not
drawn), `modes` (which of `split`/`window` its keys offer), `drillLabel` (the Tab
hint), `boost`, `group`/`groupLabel`, `kindLabel`, `shortcut` and `verb`. A group's
header is the taxonomy's `plural` for the kind, else its `label`. Matching ranks
exact, prefix, word starts (`ord li` finds *Order lines*), substring, then an
abbreviation: it starts at a word, and the letters it skips outside word starts are
at most half the query (`cstmr` finds *customer*; `cour` does not find *Scroll up
to*). A drill's `search` is debounced, and a stale answer is aborted and
never drawn. `palette.invalidate()` drops the cache.

**The built-in *Keyboard shortcuts* command** opens the help topic
`keyboard-shortcuts`. If your `HelpProvider` defines that id, your topic is
shown. If it does not, or you register no help at all, the modal shows the window
manager's own bindings, `KEYMAP_SHORTCUTS` from `@flexdesk/wm`, as a table
(`keyboardShortcutsTopic()`). Before this the modal showed *Failed to load help
topic.* The fallback comes from `HelpModal.open(id, { fallback })`
(`@flexdesk/widgets`), and you can pass one yourself. A topic id that nobody
provides now shows *Help topic not found.* where it used to raise a load error.

## A palette row drawn disabled, with a reason (0.17.2)

A palette row (a command from `commands`, or any other row) may carry
`enabled: () => boolean` and `disabledReason`. While `enabled()` returns false
the row is still listed, so it can say why it does nothing:

```js
palette: {
    commands: () => [
        { id: 'save', label: 'Save', action: save,
          enabled: () => dirty, disabledReason: 'Nothing to save' },
    ],
},
```

- The row gets the class `twm-cmdpal__item--disabled` and `aria-disabled="true"`,
  and `disabledReason`, when given, is its `title` (the tooltip). The stylesheet
  greys it.
- Picking it with a click, Enter, Ctrl+Enter or Shift+Enter runs nothing: not
  its `action`, not `onPick`. The palette stays open on it.
- The arrow keys still move onto it and past it.
- `enabled()` is called again on every draw and every pick, so the row follows
  your state while the palette is open. An `enabled()` that throws counts as
  false.
- A row without `enabled` is drawn and picked as before. Both layouts (flat and
  `grouped`) behave the same way.

`tests/command_palette_disabled.test.mjs` drives it in jsdom.

## A catalog source only behind its prefix: `scopedOnly` (0.17.2)

A source can be too broad to compete with everything else in the palette: help
topics, say, which would crowd every query. Mark it `scopedOnly` and its rows are
listed only once its prefix has made the type chip:

```js
createEntityCatalog({
    sources: [
        { navKind: 'model', list: listModels, shape: toRow },
        { navKind: 'topic', list: listTopics, shape: toRow, scopedOnly: true },
    ],
    aliases: { help: ['topic'] },
});
```

A plain typed query (`solver`) lists no `topic` row, in the flat and the grouped
layout alike: no row, no group header, no *Show all*. `help: solver` or
`topic: solver` lists its rows as any source's, and `help:` alone lists them all.
The mark is the palette's business: `loadAll`, `loadGrouped` and the tile menu
still return every source, a picked row reaches `onPick` as its `shape` made it,
and commands and `empty()` rows of the same kind are not held back. A source
without the option, or with `scopedOnly: false`, is searched exactly as in
0.17.1. A value that is not a boolean is refused with a `TypeError`.
