# Flow outline editor

> **Package:** `@flexdesk/flow` · **Shared kit:** [Flow editors and the flow kit](flow-editors.md) · [All docs](../README.md)

## The outline editor

`createOutlineEditor` draws a logic flow as a list of blocks: *If … otherwise*,
*For each row* with its *Next row* foot, *At the same time* with its *Then wait
for every branch* foot, and a step's other ports (an error port, an empty-result
port) as arms under it. **The outline is the graph.** It reads the same
`{nodes, connections}` JSON the canvas edits, holds no second model, and every
edit is an operation on that graph. A graph opened and saved with no edit is the
same text, byte for byte, and node positions are kept and never used. A graph
that is not block-shaped is refused, never repaired: it opens read-only, as a
flat list in the order it runs, with the reason above it.

```js
import { createOutlineEditor, createStepCatalogue, createWidgetRegistry, TEMPLATE_REFERENCES } from '@flexdesk/flow';

const editor = createOutlineEditor(host, {
    catalogue, widgets: createWidgetRegistry(), references: { template: TEMPLATE_REFERENCES },
    blocks,                                            // which roles are blocks, and their words (below)
    values: async ({ stepId, field, before, loops }) => groupsFor(before, loops),   // Insert a value
    valuesNote: 'Only steps that always run before this one are listed.',
    summarise: (node, type) => oneLine(node),          // a row's line; {text, mono: true} for code
    summariseReads: (node, type) => howLaterStepsRead(node),   // the panel's id line
    flowSettings: { schema, value, title, typeLabel, where, description, idLine },
    actions: [{ id: 'publish', label: 'Publish', icon: 'publish', primary: true, run: () => publish() }],
    slots: { toolbarEnd: (el) => {}, flowPanel: (el) => {}, stepPanel: (el, node) => {} },
    initialFolds: saved, onFoldChange: (ids) => keep(ids),
    onChange: ({ graph, flowSettings, text, action, key }) => autosave(text),
    onSelect: ({ kind, id }) => {},                    // kind: 'flow' or 'step'
    readOnly: false,                                   // or {reason}
    history: { limit: 100, mergeMs: 1000 },
});
editor.load({ graph, flowSettings });                  // a baseline: nothing to undo
```

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true})` | Replaces the content; a baseline clears both undo stacks and emits nothing |
| `getGraph()`, `serialise()`, `getFlowSettings()` | A copy of the graph; its byte-stable text; the flow's own settings |
| `setFindings(list)` | A finding with a `node_id` replaces that row's line with its message, in the error or warning tone, marks the row, and is drawn under its field; the others go to the strip, with *Go to it* |
| `setRunOverlay({steps, ports, banner} \| null)` | A run drawn on the outline (below) |
| `setReadOnly(false \| {reason})`, `setActionState(id, {disabled, reason, busy})`, `setStatus(text)` | A refused verb is disabled with its reason beside it |
| `select(id \| 'flow' \| null)`, `focus()`, `undo()`, `redo()`, `history`, `folds`, `setFolds(ids)` | `select` unfolds the blocks around the step |
| `describe()`, `refusal` | The outline as text (`describeOutline`), or why the graph could not be drawn as one |
| `destroy()` | Removes every listener, popover and ghost. It flushes nothing, because it holds nothing |

**The block mapping.** The consumer says which catalogue roles are blocks and
what their parts are called. Nothing here guesses a domain:

```js
const blocks = {
    start:  { role: 'start', label: 'When it runs' },        // the flow row
    end:    { role: 'end', entry: { label: 'End the run', sub: 'End' } },
    step:   { input: 'in', continue: 'out' },                 // an ordinary step's two ports
    branch: { role: 'branch', arms: { true: 'Then', false: 'Otherwise' },
              entry: { label: 'If … otherwise', sub: 'Condition' }, note: 'Either arm may be empty.' },
    fanout: { role: 'fanout', join: { role: 'join', type: 'merge', field: 'join',
                                      foot: { all: 'Then wait for every branch', any: 'Then go on when the first finishes' } },
              arm: 'Branch {n}', addArm: 'Add a branch', entry: { label: 'At the same time', sub: 'Parallel + Merge' } },
    loop:   { role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
              foot: 'Next row', skip: 'Go on with the next row', addInside: 'Add a step to the loop',
              entry: { label: 'For each row', sub: 'Loop over rows' } },
    arms:   { error: { label: (step) => `If ${step.label} fails`, unconnected: 'fail',
                       setting: { label: 'If it fails', unconnected: 'Fail the run', after: 'timeout_seconds',
                                  connected: (arm) => `Run the steps under “${arm}”` } } },
    types:  { 'http-request': { arms: { error: { label: 'If the request fails' } } } },
};
```

`unconnected` is what your runtime does with a port nothing is connected to,
`'fail'` or `'stop'`, and only you can say it. An ordinary step's other flow
outputs are its arms, in the order the type declares them. **Ports become
settings** in the panel. An arm is a choice between "Fail the run" (or "Stop
here") and "Run the steps under …", which connects or disconnects the port. An
arm inside a loop also chooses between carrying on with the next step and going
on with the next row. A parallel step carries its merge's *When the branches
finish*, written to the merge step's config.

**What "block-shaped" means.** From the start step, every step is placed exactly
once: as a step, a branch, a parallel closed by one merge, a loop whose body
ends at its Next, or an end. An arm ends by rejoining what follows its block,
by going on with the loop's next row, by ending, or by leaving its port
unconnected. Anything else is refused with a code and the step it names:
`outline_no_start`, `outline_two_starts`, `outline_unknown_type`,
`outline_unknown_port`, `outline_broken_line`, `outline_unreachable`,
`outline_shared_step`, `outline_jump_out`, `outline_two_continuations`,
`outline_parallel_unjoined`, `outline_merge_unpaired`, `outline_loop_shape`,
`outline_after_end`, `outline_cycle`. Where a branch's arms meet nowhere
(every arm but one ends), the arm that goes on holds the rest of its list. The
lines cannot say more than that, and the outline does not pretend they do.

**Edits.** "+" between rows (shown on hover and on focus) and the add rows open
the kit's step picker. It says where the step will land (*"inside For each new
application, after Check eligibility"*) and offers the blocks as blocks: *At
the same time* is one entry and two steps. A step's menu (its "…", a
right-click, or the ContextMenu key) moves it up, down or out, wraps it in a
block, duplicates, copies, cuts, pastes after, renames and removes it. An entry
or a verb that would leave a graph the outline cannot draw is shown greyed with
its reason: *"Move down — already last in For each new application"*. A step is
dragged by its grip, with pointer events and a ghost after 4 px, never
`draggable` and never `setPointerCapture`. Its drop line names the place
(*"Into Branch 2 · after Write a summary"*) or says why the place is refused.
Each edit is one history entry from a closed list: `flow:step:add`, `remove`,
`move`, `wrap`, `duplicate`, `paste`, `label` and `config`, `flow:arm`,
`flow:branch:add`, `flow:branch:remove` and `flow:settings`.

**Keys.** ↑ and ↓ move the selection, ← and → fold and unfold, and Enter opens
the settings at their first field. Alt+↑, Alt+↓ and Alt+← move a step, Ctrl+D
duplicates, Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste after the selection,
F2 renames, Delete removes, and Ctrl+Z and Ctrl+Y undo and redo. All of them are
bound on the editor's root. Backspace is never the editor's.

***Insert a value*.** A field's "{ }" calls your `values` provider with
`before`, the steps that always run before this one, nearest first
(`alwaysBefore`), and `loops`, the loops the step is inside, innermost first. A
step on the other arm of a condition is never in `before`, and neither is a
loop's body for a step after the loop.

**A run drawn on the outline.** `setRunOverlay({steps: {[id]: {state, line,
tone}}, ports: {[id]: {[port]: {taken, count}}}, banner})` puts a pill beside
each step. The pill shows `line` as you give it, toned by `state`
(`completed`, `failed`, `skipped`, `running`, `cancelled`, `not-reached`). Each
arm says *taken*, *not taken* or a count, an untaken arm and its steps are
dimmed, a loop's *Next row* shows its count (`ports[loop].next.count`), and
your banner is shown above the list. It draws only what you pass, and it
rebuilds no field in the panel. A redraw you did not ask for (findings, a run
refresh, a read-only switch) waits while a press is held in the editor, because
a browser fires a click only when the press and the release land on the same
element.

**The pure parts** are exported for a consumer that reads or checks an outline
without drawing one. `outlineFromGraph(graph, catalogue, blocks)` returns
`{ok: true, tree}` or `{ok: false, code, message, node_id}`, and
`graphFromOutline(tree)` is its inverse (`outlineGraphsEqual(a, b)` compares
two graphs as sets). `describeOutline(tree)` gives the tree as text.
`createOutlineOperations({catalogue, blocks, references})` gives every edit as
a function from a graph to `{ok, graph, select}` or `{ok: false, reason}`. Also
exported: `createOutlineBlocks`, `outlineRunOrder`, `outlineFlatOrder`,
`indexOutline`, `openOutlineStepMenu`, `OUTLINE_STRINGS`, `OUTLINE_ACTIONS` and
`OUTLINE_INDENT` (22 px a level, which the stylesheet also uses).

**What it does not do.** It does not fetch, save, validate or start a timer
that writes. Your validator's findings are drawn, never made. The folds are
yours to keep (`initialFolds`, `onFoldChange`).

**Where each claim was checked.** The round trip is tested over a corpus
(`tests/fixtures/flow_outline_corpus.json`). Every block-shaped graph is
recognised as the tree the corpus states and written back equal as sets (I1).
Opened and saved with no edit, it is the same text (I2). Random sequences of
operations keep it block-shaped (I3). Every refusal names a code and a step and
leaves the graph untouched (I4). `tests/flow_outline_editor.test.mjs` mounts
the editor in jsdom, and `tests/flow_outline_css.test.mjs` checks that every
class the editor sets has a rule and every rule names a class it sets. jsdom
computes no layout and starts no drag, so `demo/flow_outline_probe.mjs` drives
`demo/flow_outline.html` in headless Edge with real input. `elementFromPoint`
at the centre of Undo, an action, Fold all, the find box, the flow row, a row,
its menu, its "+" (with its row hovered), an add row, the panel's first field,
a port drawn as a setting and the strip's *Go to it* returned each one. A "+"
whose row was not hovered caught no press, and a level measured 22 px. The step
picker and the step menu opened inside the viewport on a real press, real keys
filtered and chose, and Escape gave the focus back. Real Alt+↑, Ctrl+Z, Ctrl+D
and Delete edited the flow, and Backspace reached the window unprevented. A real
grip drag drew its ghost and a drop line naming the place, moved the step as
one edit and started no native drag (a `dragstart` counter at 0). A refused
place said why and moved nothing, and Escape cancelled the drag.

**In a narrow editor** (under 1000px the list, the settings and the aside are
stacked and the body scrolls as one), a step picked with the mouse, with Enter,
with *Go to it* or with `select()` scrolls its settings on screen (`'nearest'`)
when they lie outside the body's visible box. ↑ and ↓ leave the list where it
is, and side by side nothing scrolls. `demo/flow_outline_narrow_probe.mjs`
pressed a step at a 900px viewport and found the panel's first field with
`elementFromPoint`. At 1440px the same press moved no scroll position.
