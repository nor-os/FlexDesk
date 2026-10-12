---
id: 8
type: story
title: "Command palette: hideable chrome, grouped and highlighted results, embedder commands, an empty-query list, pick modes and drill-in scopes"
status: refined
parent: 9
phase:
assignee:
reporter: norman
points: 5
subsystem: tiling
labels: [palette, tables-consumer, additive]
links: []
created: 2026-10-12
updated: 2026-10-12T10:37Z
---

## Description

Tables wants Ctrl+K to find anything and to lose the buttons under the input (Tables EPIC-0275,
`../Tables/backlog/EPIC-0275.md`; the design is `../Tables/docs/39-find-anything.md`, recorded as C39 in Tables'
doc 05). The palette (`src/tiling/command_palette.js`) cannot do that today. Every option below is **additive
and off by default**, so EcoAgent and EcoSim see no change by upgrading.

| Option | Does |
|---|---|
| `chrome: { pages: false, panels: false }` | Omits the top-nav chip strip and the panel toggles |
| `group: true`, `groupCap` | Results under a header per kind (`taxonomy.meta(kind).plural`, falling back to `label`), groups ordered by best hit, capped, with a *Show all N* row that scopes to that kind |
| row `context`, `keywords` | `context` is rendered and not searched; `keywords` is searched and not rendered. `hint` keeps its present meaning |
| scorer | exact > prefix > word-start (`ord ln` → *Order lines*) > substring > subsequence, then shorter label. It returns the match positions, which are drawn as `<mark>` |
| `empty: () => rows` | What to show before anything is typed (default: nothing, as now) |
| `commands: () => rows` | Embedder commands beside the built-in ones; `>` restricts to commands |
| `onPick(pick, { mode })` | `mode` is `'open'`, `'split'` or `'window'`, from Enter, Ctrl+Enter or Shift+Enter |
| `drill: (pick) => scope \| null` | `Tab` enters a scope. A scope may carry `search(q, signal)` for remote rows, debounced, with stale answers aborted |
| catalogue cache | `loadAll` answers from the previous result at once and refreshes behind it |
| restyle | Group headers, an active-row edge, marks, key hints on the active row. Existing tokens only |

## Acceptance criteria

- [ ] With no new option passed, the palette's markup and behaviour are unchanged (existing suites green, and a suite asserting the old markup)
- [ ] `chrome: {pages:false, panels:false}` leaves nothing between the input and the list
- [ ] `group: true` renders a header per kind, ordered by best hit, capped at `groupCap` with a *Show all N* row that scopes to the kind
- [ ] Matched characters are marked; `ord ln` finds *Order lines*; `context` is drawn but not searched, `keywords` searched but not drawn
- [ ] `empty()` rows show before typing; `commands()` rows join the results, and `>` restricts to them
- [ ] Enter / Ctrl+Enter / Shift+Enter hand `onPick` the modes open / split / window
- [ ] `drill(pick)` lets Tab enter a scope whose `search(q, signal)` answers remotely, and a stale answer never overwrites a newer one
- [ ] A second open shows the previous catalogue at once while it refreshes
- [ ] Released to npm; `tests/run.mjs` green and `build --check` OK

## History

- 2026-10-12 · norman_agent · status: draft -> refined

## Comments
