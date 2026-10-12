---
id: 8
type: story
title: "Command palette: hideable chrome, grouped and highlighted results, embedder commands, an empty-query list, pick modes and drill-in scopes"
status: review
parent: 9
phase:
assignee: norman
reporter: norman
points: 5
subsystem: tiling
labels: [palette, tables-consumer, additive]
links: []
created: 2026-10-12
updated: 2026-10-12T12:30Z
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

- [x] With no new option passed, the palette's markup and behaviour are unchanged (existing suites green, and a suite asserting the old markup)
- [x] `chrome: {pages:false, panels:false}` leaves nothing between the input and the list
- [x] `group: true` renders a header per kind, ordered by best hit, capped at `groupCap` with a *Show all N* row that scopes to the kind
- [x] Matched characters are marked; `ord ln` finds *Order lines*; `context` is drawn but not searched, `keywords` searched but not drawn
- [x] `empty()` rows show before typing; `commands()` rows join the results, and `>` restricts to them
- [x] Enter / Ctrl+Enter / Shift+Enter hand `onPick` the modes open / split / window
- [x] `drill(pick)` lets Tab enter a scope whose `search(q, signal)` answers remotely, and a stale answer never overwrites a newer one
- [x] A second open shows the previous catalogue at once while it refreshes
- [x] Released to npm; `tests/run.mjs` green and `build --check` OK

## History

- 2026-10-12 · norman_agent · status: draft -> refined
- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-12 · norman_agent · status: in-progress -> review
- 2026-10-12 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-12T12:30Z · norman_agent

Released and handed back.

- **0.9.0 (80a835b):** the grouped layout and every option in the table.
- **0.9.1 (09308ec):** the last matching tier is now an abbreviation. In Tables' live app a looser tier listed *Scroll up to: 1,000 rows* for `cour`.
- **Not in the table but added:** a row's `groupLabel`. A group is now ordered by its best row with the same tie-break as rows.

`tests/command_palette_grouped.test.mjs` is new, and §1 asserts the old markup when no option is passed. `tests/run.mjs` is GREEN and `build --check` is OK.

Seen in headless Edge in `demo/` at 1300 and 480 px, and in Tables on the live stack. Tables pins 0.9.1 (Tables 3f34471).

Pushing is yours: `git push` to GitHub returns 403 from here, as tables-9d reported.
