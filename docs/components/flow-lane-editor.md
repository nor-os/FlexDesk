# Flow lane editor

> **Package:** `@flexdesk/flow` · **Shared kit:** [Flow editors and the flow kit](flow-editors.md) · [All docs](../README.md)

## The lane editor

`createLaneEditor(host, options)` draws a data flow as lanes, left to right.
Every source starts a lane, and each step follows the one before it. A join
brings another lane in from below, and its line is laid out for you. Cards sit
where the layout puts them: **nothing is dragged and no line is drawn by
hand.** A step is added with the "+" on a card's right tip, which splices it in
between the card and what the card led to (`A → new → B`). *Add a source* starts
a new lane. A join's other lanes are settings (*Joined with*), not lines. Under
the lanes are a tab per step and a dock: the kit's settings panel on the left,
and on the right what the step gives — **Preview**, **Columns** and, for a sink,
**Would be rejected**. A toolbar toggle, **Steps show: The preview | The last
run**, picks what each card's status line says.

```js
import { createLaneEditor, createStepCatalogue, createWidgetRegistry, PARAMETER_REFERENCES } from '@flexdesk/flow';

const editor = createLaneEditor(host, {
    catalogue: createStepCatalogue(types, { categories }),   // roles: source | transform | operation | sink
    widgets: createWidgetRegistry(),
    references: { parameter: PARAMETER_REFERENCES },
    summarise: (step, type) => '…',            // a card's second line
    preview: async ({ pipeline, text, parameters, signal }) => ({ nodes: { [id]: {
        status, rows, total, columns: [{ name, type }], head: [[…]], caption, rejects, error } } }),
    describe: async ({ pipeline, text, parameters, signal }) => ({ nodes: { [id]: {
        columns: [{ name, type, origin, change }] } } }),
    lastRun: async ({ pipeline, signal }) => runOverlay,      // asked when Steps show turns to The last run
    actions: [{ id: 'publish', label: 'Publish', primary: true, run }],
    onChange: ({ pipeline, text, action, key }) => save(text),   // after every edit, undo and redo
});
editor.load({ graph: pipeline });
```

It edits the data flow's JSON — `{nodes: [{id, type, label?, config, position?}],
connections: [{id, sourceId, sourcePort, targetId, targetPort}], parameters:
{name: {type, default?, description?}}}` — with two rules added. A step's name
is a top-level `label`, never a key inside `config`. Connection ids are
deterministic: `c1`, `c2`, … the lowest free number. `serialisePipeline` is
byte-stable, so a flow opened and saved with no edit is the same text. Keys the
editor does not know are kept, and a node's `position` is kept and never used.
**A step's ports keep their declared order**: the first FLOW input is the lane
input, and every further input takes another lane. The first output is the
continuation.

**The layout** is `layoutLanes(pipeline, catalogue)` and `placeLanes(layout,
size)`. Both are pure, and the wires are computed from the grid, never measured
from the page. A step belongs to the lane that feeds its lane input, not to
whichever lane reaches it first. An output that feeds two steps' lane inputs
forks a new lane below. A feeder lane is moved right until its last card sits
one column before the join it feeds, and never so far that the join moves.
Under each lane come its feeders, then its forks. A wire that would run through a card that is not one of its ends (a feeder that goes on past its feed, a fork drawn under a feeder) goes round by the gutters, the gaps between columns and between lanes, which hold no card. A step two lines feed on one
input (`lanes_two_inputs`), a cycle (`lanes_cycle`) or two steps with one id
(`lanes_duplicate_step`) cannot be drawn honestly as lanes. Such a flow opens
read only with the sentence, is drawn as well as it can be, and is never
repaired. The sizes are `LANE_GEOMETRY`: `regular` is 200 × 62 (the editor),
`small` is 160 × 50 (two lines a card, for a narrower host) and `strip` is
92 × 26 (`compact`). The pure edits — splice, add a source, remove, duplicate,
set an input, the input candidates, parameters — are `lanePipeline`.
`lanePipeline.duplicateStep(pipeline, catalogue, id)` (0.17.0) puts a copy right
after the step: a fresh id, a label derived from its title (`Title (copy)`, then
`(copy 2)`, …, words in `LANE_PIPELINE_STRINGS`), a deep copy of its config and
the same lines in, none out. It answers `{ok: true, node}`, or `{ok: false,
reason}` and changes nothing when there is no such step or its type is
`unavailable`.

| Option | Meaning |
|---|---|
| `catalogue` | The kit's step catalogue (or a list of types and `categories`) |
| `widgets`, `references`, `services`, `strings` | As for the kit's panel. `references.parameter` decides how the parameters strip spells a reference |
| `values` | *Insert a value*: `({pipeline, stepId, field, key, upstream, parameters}) => groups`. `upstream` is every step whose output reaches this one, nearest first |
| `summarise(step, type)`, `summariseReads(step, type)` | A card's second line; the panel's id line |
| `preview`, `describe` | The providers (above). Absent, the dock has no Preview, or no Columns |
| `previewDelayMs` | The debounce, 800 by default |
| `lastRun` | Asked once, when *Steps show* first turns to *The last run* and no overlay is set |
| `flowSettings` | `{schema, value}`: the flow's own settings, under a first tab, *The flow* |
| `readOnly` | `false`, or `{reason}`, drawn above the editor |
| `actions` | Toolbar verbs after Undo and Redo: `[{id, label, icon?, primary?, run}]` |
| `slots` | `toolbarStart(el)`, `toolbarEnd(el)`, `flowPanel(el)`, `stepPanel(el, step)` |
| `size` | `'regular'` or `'small'` |
| `stepTabs`, `parameters` | `false` leaves out the step tabs or the parameters strip |
| `height` | `'fill'` (the default: the editor fills its host, which must have a height) or `'auto'` (the editor flows, and the dock is `dockHeight`, 360 by default) |
| `compact` | `true` (or `{size: 'small'}`): the lanes alone, read only, nothing to press. This is what a step that runs a data flow shows as *What it does, left to right* |
| `parameterTypes` | The parameter types a parameter may be: `text`, `number`, `integer`, `boolean`, `date` by default |
| `select` | The step chosen on load (the first step, left to right, by default) |
| `history` | `{limit, mergeMs}` |
| `menuItems(step)` | Your own items on a card's menu, after the built-in ones: `[{id, label, icon?, danger?, disabled?, reason?, run}]`. `run({step, pipeline, editor})` gets a DRAFT of the flow to change in place (it may answer later, with a promise); what it changed is one undoable edit, `flow:step:menu`. Answering `false` takes nothing, and neither does a draft that answers after another edit. `disabled` greys the item with its `reason`; a read-only flow greys every one with the read-only reason (0.17.0) |
| `onChange`, `onSelect({kind, id})`, `onStepsShow(mode)` | Callbacks |

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true})` | Replaces the content. A baseline clears both undo stacks, and a preview is asked for at once |
| `getGraph()`, `serialise()`, `getFlowSettings()` | A copy of the flow; its byte-stable text |
| `setFindings(list)` | On the card (its status line becomes the message), under the field, and in the strip with *Go to it* |
| `setRunOverlay({steps: {[id]: {state, line, tone}}, banner})` | The last run, shown when *Steps show* is *The last run*. `line` is drawn as given |
| `setStepsShow('preview' \| 'run')`, `stepsShow` | — |
| `setReadOnly(false \| {reason})`, `readOnly` | — |
| `setActionState(id, {disabled, reason, busy})`, `setStatus(text)` | A refused verb shows its reason beside it |
| `select(id \| 'flow' \| null)`, `selected`, `focus()` | — |
| `undo()`, `redo()`, `history` | Over whole snapshots. The actions are `LANE_ACTIONS` (`flow:step:add`, `:remove`, `:label`, `:config`, `:duplicate`, `:menu`, `flow:join:set`, `flow:source:add`, `flow:parameter:add`, `:change`, `:remove`, `flow:settings`) |
| `refreshPreview()` | Asks the providers now, without the debounce |
| `inputColumns(stepId, port?)` | The columns of the frame a step reads, from the last description, else the last preview. The `upstream-column(s)` widgets read the same |
| `layout`, `placed` | The current layout and its coordinates |
| `destroy()` | Removes every listener, popover and table, and aborts the preview in flight |

**Columns that arrive while you are in the settings** are drawn when the focus
leaves them, so a column typed by name before the columns were known becomes a
choice then, and nothing is rebuilt under the reader's caret.

**The preview** is one request for the whole flow to each provider. It is sent
800 ms after the last edit and once after a load. A rename does not send one,
because it changes no row. Every request carries a sequence number and an
`AbortSignal`. A newer edit aborts the request in flight, and an answer that is
not the newest is dropped even when it arrives. A failure is shown as the
provider's own sentence in the dock, and nothing else changes. The rows are a
FlexDesk `DataTable` in a box with a definite height. How many rows a preview
reads, as whom it reads them and that it writes nothing are all the provider's
business; the editor knows only what it is handed.

**Keys.** These are the kit's, on the editor's root. ← → ↑ ↓ move between cards
and between the step tabs. Enter opens a step's settings on their first field,
and Escape goes back to the card. Delete removes the step, Ctrl/⌘+D duplicates
it (the copy is chosen and focused) and F2 renames it.
Ctrl/⌘+Z and Ctrl/⌘+Y undo and redo, and are stopped at the editor even inside
a field. The context-menu key or a right press opens a card's menu: *Open its
settings*, *Add a step after it*, *Duplicate*, *Remove step*, then your
`menuItems`. An item that cannot be chosen — *Duplicate* on a read-only flow, or
on a step whose type is not available — is greyed with its reason in its own
line, and a refused Ctrl/⌘+D says the reason beside the status. Backspace is never the
editor's. The cards are one Tab stop, the chosen one, and its "+" comes next in
the Tab order. The "+" shows on hover, on focus and on the chosen card, never
on hover alone.

**What it does not do.** It does not fetch, save, validate, propagate a schema,
coerce a value or run anything. Steps are never dragged and lines are never
drawn by hand. The editor does not draw a page trail, a breadcrumb or a "you
are editing the shared flow" banner either: a host draws those around it.

**Where each claim was checked.** The layout, the JSON, the edits and the
preview runner are pure, and `tests/flow_lanes_layout.test.mjs`,
`flow_lanes_pipeline.test.mjs` and `flow_lanes_preview.test.mjs` test them under
plain node. The layout suite reproduces the mock and shows that the earlier
layout (EcoSim's `buildLanes`, copied verbatim) puts the join in the feeder's
lane when the feeder is listed first. The preview suite has a provider that
answers out of order, and the stale answer is shown to be dropped.
`flow_lanes_editor.test.mjs` mounts the editor in jsdom: choosing a card
rebuilds no node, every edit is one undo entry, and a flow that cannot be drawn
is never written. `flow_lanes_css.test.mjs` holds the classes and the rules to
each other and the sheet's card sizes to `LANE_GEOMETRY`. The rest was checked
in headless Edge with real input (`node demo/flow_lanes_probe.mjs`, which opens
`demo/flow_lanes.html` at all three sizes). In a laid-out page every wire
starts at its card's tip and ends in the next card's notch, and the join's line
and its port dot meet the join's bottom centre. `elementFromPoint` at the centre
of Undo, a card, a "+", *Add a source*, a step tab, *Steps show*, a parameter,
the panel's first field, its name, *Remove step*, a dock tab and a preview cell
returns each one, and the settings are covered by nothing. The preview's
`DataTable` draws its rows with a height, and every card's words stay inside
the card. A real press on "+" opens the picker inside the viewport with its
search focused, and real keys filter it and add the step. A real drag across a
card starts no native drag (a `dragstart` counter at 0) and moves nothing. Real
arrows, Delete, Ctrl+Z and Backspace do what is said above, and three real
keystrokes ask the preview once.
