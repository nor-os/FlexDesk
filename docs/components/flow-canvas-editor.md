# Flow canvas editor

> **Packages:** `@flexdesk/flow`, `@flexdesk/canvas` (the kernel) · **Shared kit:** [Flow editors and the flow kit](flow-editors.md) · [All docs](../README.md)

## The canvas editor

A flow drawn as nodes and lines: a palette of step types, a pannable canvas and
the settings of whatever is picked, under a toolbar. It stands on the
`@flexdesk/canvas` kernel, which is also usable on its own for any diagram.

**The kernel** (`@flexdesk/canvas`).

| Part | What it does |
|---|---|
| `new CanvasAdapter({container, gridSize = 16, onViewportChange, onBackgroundMenu, nodeSelector})` | A surface you put nodes and lines on: right-, middle- or Shift-drag pans, Ctrl + the wheel zooms about the pointer, a left press on the background draws a marquee (`onMarquee(box)`, `onSelectionChange(selection)`). Fields `root`, `surface`, `edgeLayer` (an SVG), `nodeLayer`, `marquee`, `selection`, `scale`, `tx`, `ty`, `gridSize`. Methods `clientToCanvas`, `canvasToClient`, `snap`, `setViewport`, `viewport`, `zoomAt`, `fit`, `visibleBox`, `contains`, `bringIntoView` (pans and never zooms, and does nothing when the box is already in view), `consumeRightDrag`, `clear`, `destroy`. **A node is whatever you put in `nodeLayer`**: a press inside one starts no pan and no marquee, and a right-click on one keeps your menu (or the browser's). Pass `nodeSelector` when the node layer holds other things too. `onViewportChange` fires once, synchronously, from the constructor, so declare what it reads before you build the adapter. `CanvasAdapter.MIN_SCALE` (0.15) and `CanvasAdapter.MAX_SCALE` (4) are the limits every zoom clamps to (0.17.0) |
| `routeEdge(from, to, {obstacles, simple})`, `selfLoop`, `returnEdge(from, to, {floor})` | SVG path data between two anchors `{x, y, side}`: a line with horizontal lead-outs (bent round obstacles up to `OBSTACLE_ROUTING_NODE_LIMIT` nodes), a node's line to itself, and a loop's line back, which runs under both nodes |
| `crowsFoot(point, side, kind)`, `footAnchor(point, side, kind)`, `cardinality({kind, optional})` | Crow's-foot ends (`many`, `one`, `zero-or-many`, `one-or-many`, `zero-or-one`, `exactly-one`) as an SVG group `twm-edge__marker twm-edge__marker--<kind>`, where the line should start so it meets the mark, and the two ends a reference implies |
| `arrange(nodes, edges, {columnGap, rowGap})` | A layered layout. **Two quirks, kept on purpose:** an edge points from child to parent (a node sits one column right of what it points at), and each column is sorted by `label`, which every node must have |
| `layeredLayout(nodes, edges, {rank, sizeOf, columnGap = 64, rowGap = 32, componentGap = 80, passes = 8})` (0.17.0) | A layered layout for any directed graph, as a diagram is read: `{from, to}` puts `from` left of `to`. Longest-path columns (cycles broken, never hung on); `rank(node)` answering `'source'` or `'sink'` puts a node in the first or the last column; barycentre sweeps reduce crossings, keeping the order with the fewest (the order given included); `sizeOf(node)` → `{width, height}` (default the node's own `width`/`height`, else 160 × 80) sizes the columns; components no line joins are stacked top to bottom, the largest first, `componentGap` apart. Returns a Map of id → the top-left `{x, y}` from (0, 0). Pure; 300 nodes and 400 edges take a few milliseconds |
| `new NodePlatform({collapsedPorts})` | The nodes and their ports: `hydrate(nodes)`, `get`, `all`, `port`, `setPosition`, `setCollapsed`, `visiblePorts(id)`, `on(event, fn)` (`hydrated`, `moved`, `collapsed`). A node is `{id, position, size, collapsed, ports, …}`; any other key is kept |
| `new ConnectorRouter({platform, selfReference, policy, endsOf, disabledEnds, strings})` | Edges and whether a drop may become one. `canConnect(source, target, {pendingEdges})` refuses, in order, a node that is gone, a port that is gone, a disabled port (with its `disabledReason`), a self-reference (unless `selfReference`), and a port at its `maxConnections`. Only then does it ask your `policy(ctx)`, which may refuse, allow, or answer `{ok: true, offer}`. Also `hydrate`, `edges` (a Map), `edgesFor`, `stage`, `unstage`, `remapNodeConnections(nodeId, portIds)` (keeps the edges whose ports survive and reports the rest) |
| `new HistoryService({actions, apply, onState, limit, requires, refusal})` | Undo over recorded edits (deltas), behind a closed action list: `record` throws on any action you did not declare. Nothing is recorded before `hydrated()`, and a batch (`startBatch`/`endBatch`) is one entry. Also `undo`, `redo`, `reset`, `adopt`, `undoStack`, `redoStack`, `canUndo`, `canRedo`. A missing `actions`, `apply` or anything named in `requires` throws at construction, not at the first silent no-op |

A diagram with its own rules subclasses the three and passes them in. For
example, a schema diagram's router answers the generic refusals in its own
words and keeps its foreign-key rules in the policy:

```js
class ConnectorRouter extends Base.ConnectorRouter {
    constructor({ platform }) {
        super({ platform, selfReference: true, disabledEnds: ['source'],
                endsOf: (e) => ({ from: `col:${e.from_col}`, to: `col:${e.to_col}` }),
                strings: { nodeGone: 'That table is no longer on the diagram.' },
                policy: (ctx) => myForeignKeyRules(ctx) });
    }
}
```

`tests/canvas_graph.test.mjs` §7 builds such a diagram on the generic layer.

**The editor.**

```js
import { createCanvasEditor, createStepCatalogue } from '@flexdesk/flow';

const editor = createCanvasEditor(host, {
    catalogue: createStepCatalogue(types, { categories }),
    flowSettings: { title: 'Sync', schema, value },          // the flow's own settings, shown when nothing is picked
    actions: [{ id: 'publish', label: 'Publish', icon: 'publish', primary: true, run: (ed) => publish(ed) }],
    onChange: ({ graph, flowSettings, text, action, key, via }) => autosave(text),
    values: async ({ stepId, field, before, loops }) => groups,   // Insert a value
    dataPortRead: (node, port) => `\${steps.${node.id}.${port.name}}`,
    summariseReads: (node) => `Later steps read it as \${steps.${node.id}.…}`,
});
editor.load({ graph });                  // a baseline: there is nothing to undo after it
editor.setFindings(validatorResult);     // on the nodes, under the fields, in the strip
editor.setRunOverlay({ steps, ports, banner });
```

| Option | Meaning |
|---|---|
| `catalogue` | `createStepCatalogue(...)`, or the raw list of types. The palette shows them by category, except start-role types (`paletteTypes(type)` decides). A type with `unavailable` is shown greyed, with its sentence under it |
| `widgets`, `references`, `strings`, `services` | The kit's widget registry, the reference syntaxes by name, your words (`CANVAS_STRINGS` and the kit's), and your bag, handed to every widget unchanged |
| `values` | *Insert a value*: called with `{graph, stepId, field, key, before, loops}`, where `before` is the steps that always run before this one (`alwaysBefore`, nearest first) and `loops` the loops around it. Returns groups, or `{groups, note}` |
| `summarise(node, type)` | A line under a node's ports. `summariseReads(node, type)` is the panel's id line |
| `dataPortRead(node, port)` | How a data port is read, in your syntax. It is shown on the port, which cannot be connected (unless `connections.dataPorts` is `'connect'`) |
| `connections` | `{dataPorts: 'connect', policy(ctx)}`, absent by default, and then nothing below is drawn or bound. With it every line is asked, in order: what the canvas cannot draw (`canConnect` with `dataPorts`: a data port connects only to a data port, and a data output carries any number of lines); the kernel's `ConnectorRouter` over the catalogue ports, which take its descriptor keys (`disabled`, `disabledReason`, `maxConnections`, `allowMultiple`); the port types (an input's `accepts: ['number']` refuses an output whose `provides` names none of them, in a sentence); and your `policy(ctx)` — the router's context plus `connection` and a copy of the `graph` — which may refuse with a `reason`, allow, or answer `{ok: true, offer: {message, accept, apply(draft)}}`. An offer is shown with Accept and Not now: Accept makes the line and runs `apply` on a copy of the graph (change it in place or return a new one), as one undo entry. An output can also be dragged: while it is, the inputs it may end on carry `twm-flow-graph__port--can-drop`; released on one it connects; released on the empty canvas it opens the step picker with the types that have an input it may connect to, and the step picked is added with the line as one `flow:node:add` |
| `flowSettings` | `{title, schema, value}` — the flow's own settings, edited as `flow:settings` |
| `readOnly` | `false`, or `{reason}`, which is shown above the editor. Every verb is then refused with that reason, and no gesture writes |
| `actions` | Your toolbar verbs, `[{id, label, icon, primary, danger, title, run(editor)}]`, after Undo, Redo, Arrange and Fit (and the zoom buttons, with `zoomControls`) |
| `slots` | `toolbarEnd(el)`, `flowPanel(el, editor)` and `stepPanel(el, node, editor)`, drawn by you; `setRunOverlay` redraws the panel slots and nothing else |
| `onChange`, `onSelect` | After every committed edit. An undo or a redo is a change too (`action: null`, `via: 'undo' \| 'redo'`), because you autosave what is undone. `onSelect({kind, id})`: `step`, `flow`, `connection` (with `connection`) or `null`; with `multiSelect`, two or more picked steps are `{kind: 'many', ids}`; with `notes`, a picked note is `{kind: 'note', id}` and a pick with notes in it `{kind: 'many', ids, notes}` |
| `multiSelect` (0.17.0) | `true` makes the pick a set (below, *Many picked*). Without it none of it is bound or drawn |
| `groups`, `notes` (0.17.0) | `true` draws the graph's groups as frames behind their steps and its notes as text on the canvas, and lets the reader make and edit them (below, *Groups and notes*). Without them none of it is bound or drawn, and a graph's groups and notes are kept as they are |
| `clipboard`, `prepareCopy(node, {from, via})` (0.17.0) | `true` keeps what Ctrl/⌘+C copies inside the editor while it is open; `{read(), write(text)}` hands it to you: `write` hears the copied JSON and `read` (text, or a promise of it) supplies what Ctrl/⌘+V pastes. `prepareCopy` may change a copy's `config` and `label` before it is added (`via`: `'paste'` or `'duplicate'`). Unset, Ctrl/⌘+C, X, V and D are not the editor's (below, *Copy and paste*) |
| `loop`, `waitsForAll` | The loop's port names (`{entry: 'in', next, body, done}`): a line into a loop-role step on any input but `entry` is its body going back round, drawn dashed under both steps. `waitsForAll(join)` goes to `alwaysBefore` |
| `removable(node, type)` | Whether a step may be removed. By default every step except a start step |
| `node` | `{width: 208, header: 34, row: 22}` (`CANVAS_NODE`). Lines are anchored by arithmetic over these numbers, and the stylesheet is held to them |
| `edgeStyle(connection, {source, target, back})` | How a line is drawn, asked for each line on every paint with copies of its two steps (`back`: it is a loop's line back). Returns `null` or `{tone, dashed, width, marker, label}`: `tone` is one of `TONES`, `width` a stroke width, `marker` `'arrow'` or a crow's-foot kind (`'many'`, `'one'`, `'zero-or-many'`, `'one-or-many'`, `'zero-or-one'`, `'exactly-one'`) drawn at the input end, and `label` text drawn at the line's midpoint, above the steps (a press on it picks the line). A picked or highlighted line still shows as one. Unset, the lines are drawn exactly as before |
| `routing` | `'simple'` (the default: direct curves) or `'obstacles'`: each line is bent round the steps between its ends by the kernel's `routeEdge`, up to `OBSTACLE_ROUTING_NODE_LIMIT` steps. Above that the lines are direct curves and the findings strip says so (code `canvas-routing-simple`) |
| `hoverHighlight` | `true`: the pointer over a step gives its lines `twm-flow-graph__edge--highlighted`, and over a line that line; leaving takes it away |
| `history`, `gridSize`, `label` | `{limit, mergeMs}`, the snap grid, and the canvas's accessible name |
| `viewport`, `onViewportChange(viewport)` | Where the reader looks, kept by you: the editor stores none of it. `viewport` (`{scale, tx, ty}`, as `getViewport()` gives it) is where the first `load` opens, instead of fitting. `onViewportChange` hears ONE report per finished gesture of the reader's (a pan's release, a run of wheel turns once the wheel has been still for 300 ms, Fit, Arrange, a zoom button, a minimap click, *Go to it*), never one per pointer move, never a gesture that ended where it began, and never what you set yourself (`load`, `setViewport`, `fit()`, `arrange()`). A wheel report still waiting is handed on by the next press and by `destroy` (0.17.0) |
| `zoomControls` | `true` adds Zoom out, Zoom in and 100% after Fit. They step through 15%, 25%, 33%, 50%, 67%, 80%, 100%, 125%, 150%, 200%, 300% and 400%, about the centre of the view. At the kernel's limits the button is refused in place with its sentence. Off by default (0.17.0) |
| `renameInPlace` | `true`: a double-click on a step's title edits its name on the node ([Edited on the node](#edited-on-the-node-0170)). Off by default, and then a double-click does nothing (0.17.0) |
| `collapsible` | `true` puts a fold button on every step's header: it folds the step to its header and back, one `flow:node:collapse` entry each way (below, *Live values and folded steps*). Off by default, and then there is no button in the DOM and a `collapsed` flag in a graph is carried through untouched, the step drawn unfolded (0.17.0) |
| `minimap` | `true` draws a small overview over the canvas's lower right corner, with the steps and the view's frame, redrawn when the canvas changes size as well as when the view moves. A click on it centres the view on that point, at the same scale. Off by default, and then there is no minimap in the DOM (0.17.0) |
| `layout` (0.17.0) | What Arrange does. `'flow'` (the default): in the order a run takes the steps, from the start step(s). `'layered'`: the kernel's `layeredLayout` over the lines, with each type's `rank` key (`'source'` or `'sink'`, read by the catalogue's `rank(typeId)`) as its hint. Or your own `fn(graph, ctx)` returning a Map of id → `{x, y}` from the origin (a step it leaves out stays where it is; a place that is not finite numbers `{x, y}`, like anything but a Map, throws), handed a copy of what is arranged and `ctx = {catalogue, node, ids, sizeOf(node), layeredLayout}` (`ids` is `null` for the whole graph). With `multiSelect` and several steps picked, the toolbar's Arrange lays out only those steps and the lines between them, and only they move. The places are anchored at the top-left corner of what is arranged and snapped to the grid |

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true, fit = true, viewport})` | Replaces the content. A baseline clears both stacks. With `baseline: false` the stacks are kept, and the loaded content becomes the present they undo from. With `viewport` it opens there and does not fit |
| `getViewport()`, `setViewport({scale, tx, ty})` | The kernel's viewport, as a copy; and putting the view there, clamped to the kernel's limits. `setViewport` drops a fit still waiting for its frame, is not reported to `onViewportChange`, and answers `false` (changing nothing) for anything that is not three finite numbers with a scale above 0 (0.17.0) |
| `getGraph()`, `serialise()`, `snapshot()`, `getFlowSettings()` | A copy of the graph; its byte-stable text; the text the history holds (graph and settings); the settings |
| `setFindings(list)`, `setRunOverlay(overlay \| null)`, `setReadOnly(false \| {reason})` | — |
| `setNodeValues({[id]: {badge, tone, ports: {[name]: text}}} \| null)` (0.17.0) | What you show on the steps right now, replacing what you showed before. Painted in place: no undo entry, no `onChange`, nothing rebuilt and the panel untouched (below) |
| `setCollapsed(id, collapsed)` (0.17.0) | With `collapsible`: fold a step to its header (`true`) or unfold it, one `flow:node:collapse` entry. `false` when refused (no `collapsible`, read only, no such step, or no change) |
| `setActionState(id, {disabled, reason, busy})`, `setStatus(text)`, `setMessage(text, tone)` | A verb refused in place, with its reason printed beside the toolbar; the status line; the gesture line |
| `align(kind)`, `distribute(axis)` (0.17.0) | With `multiSelect`: line the picked steps up (`'left'`, `'center'`, `'right'`, `'top'`, `'middle'`, `'bottom'`; two or more picked) or give them equal gaps (`'horizontal'`, `'vertical'`; three or more), one `flow:nodes:align` entry. `false` when refused (too few picked, read only, or no `multiSelect`); an unknown kind or axis throws |
| `copy()`, `cut()`, `paste(text?)`, `duplicate()` (0.17.0) | With `clipboard`: the keys' verbs from code. Each answers `{ok: true, ids}` (the steps copied, cut or made) or `{ok: false, reason}`, the reason also on the message line; `paste()` answers a promise when your `read` is async, and `paste(text)` pastes that text. Without `clipboard`: `{ok: false, reason: null}` |
| `select(id \| [id, …] \| 'flow' \| null)`, `repaintPanel()`, `focus()`, `undo()`, `redo()`, `fit({whole})` | `select([id, …])` (0.17.0, `multiSelect`) picks several steps at once (unknown ids are left out; one left is one step picked, none lets go) |
| `group(ids?, {label, tone})`, `ungroup(groupIds?)`, `setGroup(id, {label, tone})`, `setGroupMembers(id, ids)` (0.17.0) | With `groups`: group these steps (by default the picked ones), each leaving the group it was in, and answer the new group's id (`group`, `group-2`, …) or `null`; remove these groups (by default the ones the picked steps are in), their steps staying put; a group's name and tone; exactly these members, none removing the group. One `flow:group:add`, `…:remove`, `…:label` or `…:members` entry each, `false`/`null` when refused (read only, nothing to do) |
| `addNote({text, position, size})`, `editNote(id, text)`, `moveNote(id, {x, y})`, `removeNote(id)` (0.17.0) | With `notes`: a note at `position` (by default the centre of the view), answered as a copy (`note`, `note-2`, …) or `null`; its text; where it is; taking it away. One `flow:note:add`, `…:edit`, `…:move` or `…:remove` entry each |
| `setCatalogue(catalogue \| types)` | Swaps the step types while the editor is open, for a type registered after `load`: the palette is redrawn and a node whose type's definition changed is rebuilt, so a node of a type that was unknown now draws. A definition is compared by what the node is drawn from (known or not, `icon`, `label`, tone, ports, `render`, `update` and `inline`), not by object identity: a new catalogue of the same types plus one more rebuilds no node and calls no `render` again. Under the `connections` option the connection rules and the empty-drop picker judge by the new catalogue, and a pending offer is taken away. The graph and the history are untouched (0.17.0) |
| `arrange({ids})` | Arrange the whole graph, as the toolbar's button does when fewer than two steps are picked. With `ids` (0.17.0), only those steps and the lines between them are laid out and only they move, still one `flow:arrange` entry; fewer than two known steps, or a read-only editor, answers `false` |
| `history`, `canvas` | The editor's `FlowHistory` (`keep()`, `adopt(kept, editor.snapshot())`, `baseline(editor.snapshot())` for your publish) and its `CanvasAdapter` |
| `destroy()` | Removes every listener, the ghost of a drag, the minimap and any picker it opened. It saves nothing, because the editor holds nothing; a viewport report still waiting for the wheel to settle is handed to `onViewportChange` first |

Its edits are the closed list `CANVAS_ACTIONS`: `flow:node:add`,
`flow:node:remove`, `flow:node:move` (one per drag), `flow:edge:connect`,
`flow:edge:disconnect`, `flow:node:label`, `flow:node:config`,
`flow:settings`, `flow:arrange` (one entry for the whole layout), and with
`multiSelect` `flow:nodes:move`, `flow:nodes:remove` and `flow:nodes:align`
(0.17.0; one entry per gesture on several steps), with `clipboard`
`flow:paste` and `flow:node:duplicate` (0.17.0; one entry per paste or
duplicate, however many steps it makes), with `collapsible`
`flow:node:collapse` (0.17.0), and with `groups` and `notes`
`flow:group:add`, `flow:group:remove`, `flow:group:label`,
`flow:group:members`, `flow:note:add`, `flow:note:remove`, `flow:note:edit` and
`flow:note:move` (0.17.0). Typing a name
or a setting is one entry. The geometry under it is exported as well, all of it
pure: `CANVAS_NODE`, `arrangeCanvasGraph(graph, catalogue, {loopEntry})` (where
Arrange puts each step: a Map of id → `{x, y}` from the origin),
`canvasPortAnchor`, `canvasNodeBottom` (both fold a node with `collapsed: true`
to its header, or as the box's `folded(node)` says; 0.17.0), `canvasNodeWidth` (a type's own
`size.w`, else the box's; 0.17.0), `isCanvasReturnEdge`,
`canvasPathPoints(d, {steps})` (the points along a drawn line's path `d`:
absolute `M`, `L`, `C`, `S` and `Z`, each curve sampled at `steps` points) and
`canvasPathMidpoint(d)` (the point halfway along it by length, where a style's
`label` sits).

### Node bodies (0.17.0)

A catalogue type can draw its own controls and values inside its node:

```js
const gauge = {
    type_id: 'gauge', label: 'Gauge', ports, size: { w: 280, h: 170 }, accent: 'teal',
    render(body, node, ctx) {                 // once, when the node is built
        const range = document.createElement('input');
        range.type = 'range';
        range.addEventListener('change', () => ctx.setConfig({ level: Number(range.value) }));
        body.append(range);
    },
    update(body, node, ctx) {                 // after render, and on every repaint
        body.querySelector('input').value = node.config.level ?? 50;
        body.querySelector('input').disabled = ctx.readOnly;
    },
};
editor.setCatalogue(createStepCatalogue([...types, gauge], { categories }));   // after load too
```

- **The body sits below the ports** and is built once with the node. `update`
  runs on the same element on every repaint, so a control inside it keeps its
  focus and what was typed into it. `node` is a copy: the body writes only
  through `ctx`. A later `setCatalogue` keeps that body too, unless the type's
  own definition changed (its ports, `label`, `icon`, category tone, `render`
  or `update`): then the node is built again and `render` runs again. A new
  `size` or `accent` is applied in place.
- **`ctx`** is `{setConfig(patch), readOnly, values, services}`. `values` is
  what `setNodeValues` shows on this step now (`{badge, tone, ports}`, a copy),
  or `null`. `setConfig` merges
  `patch` into the node's config (an `undefined` value removes the key) as one
  `flow:node:config` edit: one undo entry, and `onChange` is called. It is
  refused (answers `false`) while the editor is read only, from inside
  `render` or `update`, and when a value in `patch` cannot be cloned (a
  function, a DOM node): then nothing is written. `services` is the editor's `services` option.
- **`size: {w, h}`** is the node's box in pixels; either may be left out. Lines
  leave a node's outputs at its own width, and a node with `h` is exactly that
  tall, its body taking what is left. A body node without `h` is as tall as
  it is drawn. Arrange spaces its columns by the widest node.
- **`accent`** is a tone (`violet`, `teal`, `amber`, `grey`, `blue`, `indigo`),
  drawn as a stripe over the node's header.
- **A `render` that throws** leaves that node drawn as a type without a body
  is, and what it threw is one of the editor's own findings: on the node and
  in the strip, beside yours from `setFindings`. An `update` that throws keeps
  the body and says so the same way until it succeeds. No other node is
  affected.
- A type without these keys is drawn exactly as before, with the same markup,
  and `serialise()` is unchanged.

### Edited on the node (0.17.0)

```js
const counter = { type_id: 'counter', label: 'Counter', ports, inline: ['count'],
                  config_schema: { type: 'object', properties: { count: { type: 'number' } } } };
const editor = createCanvasEditor(host, { catalogue: [counter], renameInPlace: true });
```

- **`renameInPlace: true`.** A double-click on a step's title puts a text box
  in its place, the name selected. Enter, or leaving the box, is one
  `flow:node:label` edit, and none when the name is unchanged. Escape puts the
  name back and records nothing. An empty name is refused with a sentence on
  the gesture line and the name stays: on Enter the box stays open
  (`aria-invalid`), on leaving it the box closes. Read only, a double-click
  opens nothing, and going read only closes an open box without writing. The
  settings panel, if it is showing that step, shows the new name.
- **A type's `inline` settings** are drawn under the node's ports, above its
  own body, by the same widget registry as the panel (`widgets`), with the
  same labels and controls. A change on the node is a `flow:node:config` edit,
  and the panel shows it at once. A change in the panel, or an undo, redraws
  the node's control. The control being typed in is never redrawn under the
  reader; a focused control whose value changes elsewhere (an undo pressed
  while it holds the focus) is redrawn with its focus and caret kept. Typing
  on the node and then in the panel are two undo entries. Read only disables
  the node's controls. A node with inline settings and no
  `size.h` is as tall as it is drawn.
- Without the option and the key nothing is bound or drawn: the same markup,
  and `serialise()` is unchanged.

### Live values and folded steps (0.17.0)

```js
const editor = createCanvasEditor(host, { catalogue, collapsible: true });
editor.setNodeValues({ mix: { badge: '0.42', tone: 'teal', ports: { out: '0.42' } } });   // as often as you like
editor.setNodeValues(null);                                                               // none shown
```

- **`setNodeValues`** paints what you are showing right now: `badge` is drawn
  on the step's header, before its id tag, in a tone of `TONES` when `tone`
  names one, and each `ports[name]` beside that port. It replaces what the
  last call showed, and a step it leaves out shows nothing. It extends the run
  overlay: nothing is rebuilt or recorded, `onChange` is not called, and the
  settings panel is not touched, so a field being typed into keeps its focus
  and its selection however often you call it. A type with its own body reads
  them as `ctx.values`, and its `update` runs for each step whose values
  changed (a `setConfig` from there is refused, as from any `update`). The
  badge and port-value elements exist only while there is a value to show;
  the editor keeps nothing of them past the next call.
- **`collapsible: true`** puts a fold button on each header. A folded step
  shows its header only: its port rows, its body and what is drawn under them
  are hidden, and its lines stay, meeting the middle of the header on its left
  (lines in) and its right (lines out). Each fold or unfold is one
  `flow:node:collapse` entry, so Ctrl+Z unfolds a step just folded. The graph
  carries `collapsed: true` on a folded step, written last in its `serialise()`
  text; an unfolded step has no `collapsed` key, so a graph that never folded
  a step is the text it always was. Read only refuses it.

**Gestures.** A node's header moves it. A connection is made by clicking an
output and then an input, and Escape cancels one in progress. Under the
`connections` option an output can also be dragged to an input, or onto the
empty canvas to pick a step that arrives connected. A line is picked
by clicking it, and Delete removes it or the picked step. A palette step is
added by clicking it (at the centre of the view) or by dragging it onto the
canvas (where it is dropped). The drag uses pointer events and a ghost on
`document.body`. It never uses `draggable`, which cancels the pointer after
about 5px, and never `setPointerCapture`, which would send the release, and so
a second click, to the palette button. No press rebuilds a node, so a click lands
on the node it went down on. Arrange lays the run out left to right, a branch's
arms in their declared order, from the graph's own top-left corner. Fit frames
the graph at natural size or smaller; pressing Fit frames all of it.

**Many picked** (`multiSelect: true`, 0.17.0). A left drag on the empty canvas
draws a marquee and picks every step it touches; Shift-, Ctrl- or ⌘-click on
a step adds it to the pick or takes it away; Ctrl/⌘+A picks every step and
Escape lets go. `select([id, …])` picks several from code. Dragging any picked
step moves them all (`flow:nodes:move`), Delete removes every one that may be
removed, with their lines (`flow:nodes:remove`; a start step stays), and the
panel says how many are picked, with their Remove. On the canvas the arrow
keys nudge the pick one grid step (`gridSize`), ten with Shift; a held arrow is
one entry. Eight icon verbs after Fit align the pick's left edges, centres,
right edges, tops, middles and bottoms, and distribute it horizontally and
vertically, each refused in place with fewer than two (three) picked. Arrange
lays out only the pick and the lines between them, and nothing else moves. Tab and
Shift+Tab move the focus from step to step in graph order, and past either end
Tab is the browser's again, so the keyboard can leave the canvas. Every one of
these is a single undo entry. In read-only mode a marquee still picks, and no
gesture writes.

**Groups and notes** (`groups: true`, `notes: true`, 0.17.0). A group is a
named frame, in one of `TONES` if it has a `tone`, drawn behind its steps and
round all of them wherever they are. Its title bar is its handle: dragging it
moves every member (one `flow:nodes:move`; with `multiSelect` the press picks
them), and a double-click renames it in place (Enter keeps, Escape puts it
back). Groups are flat and a step is in one at most: Ctrl/⌘+G (or Group on the
toolbar) groups the picked steps, taking each out of the group it was in, and
a group left empty goes; Ctrl/⌘+Shift+G (or Ungroup) removes the groups the
picked steps are in. Removing a step shrinks its group, and removing its last
member removes the group. Between the steps the frame takes no pointer, so a
marquee or a pan can start inside it. A note is free text on the canvas: Note
on the toolbar adds one at the centre of the view and opens it for typing; a
double-click, or Enter on a focused note, opens it again (Ctrl/⌘+Enter or
leaving the box keeps the text, Escape puts it back); dragging it moves it,
and Delete removes the picked one. With `multiSelect` a marquee picks notes
with the steps, Shift/Ctrl+click adds or takes one away, Ctrl/⌘+A picks them
too, and dragging or deleting the pick takes its notes along, one entry. A
graph keeps them as `groups` and `notes` (see `normalise` above) and
`serialise()` writes them after the connections; a graph without any is the
same text as before.

**Copy and paste** (`clipboard`, 0.17.0). Ctrl/⌘+C copies the picked steps
and the lines among them; a line to a step left out of the pick is not copied,
nor is a step whose type the palette does not offer (a start step) or that is
`unavailable`. What is copied is the graph's own text, `{nodes, connections}`
as `serialise()` writes it, so a graph from elsewhere pastes too. Ctrl/⌘+V
gives every pasted step a fresh id (as a new step gets one), keeps the lines
between them (data lines too, under `connections` with `dataPorts: 'connect'`, from 0.17.1), sets the copy off two grid steps right and down (each further
paste of the same text one more), picks it, and is one `flow:paste` entry. A
paste right after Ctrl/⌘+X puts the steps back where they were; a cut is one
remove entry. A step whose title the flow already has gets a derived label,
`Title (copy)`, then `Title (copy 2)`, …, as the lanes editor's duplicate does.
Ctrl/⌘+D does the same beside the pick without touching the clipboard, as one
`flow:node:duplicate`. With nothing picked Ctrl/⌘+C, X and D are not the
editor's. What is not steps, or names a type the flow does not have, is refused
with its sentence on the message line. In read-only mode copying still works,
and Paste, Cut and Duplicate are refused with the read-only reason and change
nothing. With `notes` the picked notes are copied, cut and duplicated with the
steps (a note alone too), and pasted under fresh ids, set off as the steps
are; with `groups` a group whose every member is copied is in the copy, and a
paste makes it again round the copies of its members (a fresh id, its name and
tone kept), while a group with a member left out is not copied. `copy()` and
`cut()` answer `notes: [id, …]` and `paste()` and `duplicate()` answer `notes`
and `groups`, each only when there are some.

**Keys** (bound on the editor's root): Ctrl/⌘+Z and Ctrl/⌘+Y or Ctrl/⌘+Shift+Z,
stopped at the root even inside a text field; Delete; F2 renames the picked
step; Enter on a focused node opens its settings; Escape; with `groups`,
Ctrl/⌘+G and Ctrl/⌘+Shift+G. Backspace is never the editor's.

**What it does not do.** It does not load, save, validate, publish or run
anything, and it does not keep the stacks across page loads. Those belong to
the consumer. Nor does it add anything a flow must have: a consumer whose new
flow opens on a start step adds that step to the graph before `load`, so it is
part of the baseline and the first Ctrl+Z does not take it away.

**Where each claim was checked.** `tests/canvas_adapter.test.mjs`,
`canvas_edge_router`, `canvas_graph`, `flow_canvas_layout`, `flow_canvas_editor`,
`flow_canvas_multiselect`, `flow_canvas_clipboard`, `flow_canvas_node_body`, `flow_canvas_live_values`, `flow_canvas_groups_notes` and `flow_canvas_css` check the DOM, the events, the
geometry and the stylesheet as text. In headless Edge, `demo/flow_canvas_probe.mjs` drives
`demo/flow_canvas.html` with real input:
- `elementFromPoint` at the centre of Undo, Arrange, Fit, a consumer verb, a
  palette item, a node's header, a port, and the panel's name box, first field
  and Remove step returned each one, and the panel was not covered.
- Every line began and ended within 1px of its ports' dots, measured.
- The loop's line back ran below both of its steps.
- A real pointer drag from the palette added exactly one step, under the
  pointer, with a `dragstart` counter of 0. A drag ending off the canvas added
  nothing.
- A real click-then-click connected two steps.
- A header drag moved its node, and a real Ctrl+Z put it back. Backspace removed
  nothing, Delete removed the step, and the focus stayed on the canvas.
- On a 300-step graph with `multiSelect`, a real marquee picked three steps, a
  real drag of one moved all three and one real Ctrl+Z put them back; a move
  of 50 picked steps and its undo each finished in under 100 ms.
- With `groups` and `notes`, a real Ctrl+G on two picked steps drew one frame
  round both and not round the third. Its title bar, and a step inside it, were
  each the element at their own centre, and between the steps the canvas was
  (the frame takes no pointer). A real drag of the title bar moved both by the
  pointer's travel as one entry, and one real Ctrl+Z put them back. A real
  double-click opened a note for typing, real keys and Ctrl+Enter kept the
  text, a real drag moved it, and a real marquee picked the steps and the note
  together.
- With `collapsible`, ten `setNodeValues` calls 100 ms apart each put their
  value on the step's badge, inside its header, while real keys typed into a
  settings field: the field kept the focus and every key, and the values made
  no undo entry and no `onChange`. A real click on a header's fold button hid
  every port row and left the step as tall as its header, with its lines
  ending on the header's middle at its edges, within 1px; a real Ctrl+Z
  unfolded it and its lines met their port dots again.
- A type registered with `setCatalogue` after the page opened was in the
  palette. Its node was drawn at its 280×170 size, with its body below its
  ports and its accent. Every line into and out of it began and ended on its
  port dots, within 1px.
- At 700px the canvas took the editor's whole width.

`tests/flow_canvas_edge_style.test.mjs` checks `edgeStyle`, `routing` and
`hoverHighlight` in the DOM, and `demo/flow_canvas_edges_probe.mjs` in headless
Edge:
- A dashed line had a computed dash pattern, and an unstyled line kept its old
  stroke and width.
- An arrowhead's tip sat on the input port's centre line, and the line ended at
  its base.
- A label sat on its line's midpoint over a step, and `elementFromPoint` there
  returned the label.
- With `routing: 'obstacles'`, no point of a line lay inside the drawn box of
  the step between its ends. Above the node limit the strip said so.
- A real pointer over a step highlighted its lines, and moving off cleared them.

### Building a modeler (0.17.1)

A typed node modeler (a dataflow, a signal chain, a diagram of blocks) is the
canvas editor with its modeler options turned on. Every one of them is a
`createCanvasEditor` option or a key on a catalogue type, off by default: an
editor that sets none of them draws, binds and serialises exactly as before.
None of them stores anything: the graph, the viewport and the values shown are
the host's, handed in and handed back. Each edit they add is on the closed list
`CANVAS_ACTIONS`, so one gesture is one undo entry. `demo/flow_modeler.html`
(linked from `demo/index.html`) uses all of them together on a signal-flow
diagram of sources, gains, a sum and displays.

| Option | What it gives | Details |
|---|---|---|
| `render`, `update`, `size`, `accent` (type keys) | A node that draws its own controls and values, at its own size, marked in a tone; `setCatalogue` adds a type while the editor is open | [Node bodies](#node-bodies-0170) |
| `connections` (`dataPorts`, `policy`) with `accepts` / `provides` (port keys) | Data ports that connect, typed, under the host's rules, by drag or click; an empty drop picks a step that arrives connected | `connections` above |
| `multiSelect` | Marquee, bulk move and delete, nudge, align and distribute | *Many picked* above |
| `clipboard`, `prepareCopy` | Copy, cut, paste and duplicate of the picked steps and the lines among them | *Copy and paste* above |
| `groups`, `notes` | Flat named frames round steps, and free-text notes | *Groups and notes* above |
| `layout`, `rank` (type key) | Arrange by the kernel's layered layout, sources first and sinks last, or your own | `layout` above |
| `edgeStyle`, `routing`, `hoverHighlight` | Lines in a tone, dashed, wider, with an arrow or a crow's foot and a label; bent round steps; lit while pointed at | `edgeStyle` above |
| `viewport`, `onViewportChange`, `zoomControls`, `minimap` | Where the reader looks, kept by you; zoom buttons; an overview | `viewport` above |
| `renameInPlace`, `inline` (type key) | A step's name and chosen settings edited on the node | [Edited on the node](#edited-on-the-node-0170) |
| `setNodeValues`, `collapsible` | Values painted on the steps as often as you like; steps folded to their header | [Live values and folded steps](#live-values-and-folded-steps-0170) |

A type draws its own body (`render` once, `update` on every repaint), with its
own `size` and `accent`; `inline` draws chosen settings on the node, and
`rank` places it when Arrange runs the layered layout:

```js
const IN = { name: 'in', direction: 'input', port_type: 'DATA', accepts: ['number'], maxConnections: 1 };
const OUT = { name: 'out', direction: 'output', port_type: 'DATA', provides: ['number'] };
const types = [
    { type_id: 'source', label: 'Source', rank: 'source', inline: ['amplitude'], ports: [OUT],
      config_schema: { type: 'object', properties: { amplitude: { type: 'number', title: 'Amplitude' } } } },
    { type_id: 'gain', label: 'Gain', size: { w: 224, h: 132 }, accent: 'amber', ports: [IN, OUT],
      render(body, node, ctx) {
          const range = Object.assign(document.createElement('input'), { type: 'range', min: -2, max: 2, step: 0.1 });
          range.addEventListener('change', () => ctx.setConfig({ k: Number(range.value) }));   // one undo entry
          body.append(range);
      },
      update(body, node, ctx) { body.querySelector('input').value = node.config.k ?? 1; } },
    { type_id: 'display', label: 'Display', rank: 'sink', ports: [IN],
      render: (body) => body.append(document.createElement('output')),
      update: (body, node, ctx) => { body.querySelector('output').textContent = ctx.values?.badge ?? '—'; } },
];
editor.setCatalogue(createStepCatalogue([...types, laterType], { categories }));   // a type added after load
```

The editor's options, each one independent of the others:

```js
const editor = createCanvasEditor(host, {
    catalogue: createStepCatalogue(types, { categories }),
    connections: {                                        // data ports connect, typed by accepts/provides
        dataPorts: 'connect',
        policy: ({ connection, graph }) => (closesLoop(graph, connection)
            ? { ok: false, reason: 'That line would feed a block its own output.' } : null),
    },
    multiSelect: true,                                    // marquee, bulk move, align, distribute
    clipboard: true,                                      // or {read(), write(text)} to hold it yourself
    prepareCopy: (copy, { from, via }) => { copy.config.phase = 0; },
    groups: true, notes: true,                            // Ctrl+G frames, free-text notes
    layout: 'layered',                                    // Arrange: columns by the lines, `rank` hints
    edgeStyle: (c, { source, target }) => ({ tone: 'teal', marker: 'arrow', width: 2,
                                             dashed: c.targetPort === 'b', label: source.label }),
    routing: 'obstacles', hoverHighlight: true,
    viewport: savedView,                                  // opens there instead of fitting
    onViewportChange: (view) => { savedView = view; },    // once per finished pan or zoom
    zoomControls: true, minimap: true,
    renameInPlace: true,                                  // double-click a title to rename it
    collapsible: true,                                    // a fold button on every header
});
editor.load({ graph }, { viewport: savedView });
setInterval(() => editor.setNodeValues({ mix: { badge: '0.42', tone: 'teal', ports: { out: '0.42' } } }), 250);
```

`setNodeValues` records nothing and leaves the focus where it is, so a host
can paint as often as its values change.

**Where it was checked.** `tests/flow_modeler_demo.test.mjs` mounts the demo
under jsdom: what it shows, its live badges, and this section's list against
the options. `tests/flow_kit_vocabulary.test.mjs` §4 holds every flow and
canvas source the demo imports, and the demo itself, to the vocabulary gate.
In headless Edge, `demo/flow_modeler_probe.mjs` opens the page by a real click
on its link in `demo/index.html` and drives it with real input:
- The bodies were drawn at their own size below their ports; every line left
  its output dot and its arrowhead ended on its input dot, within 1px; the
  group frame was round both sources and nothing else; a dashed line had a
  dash pattern and a label was the element at its own centre.
- The badges changed in each of three seconds while a settings field, focused
  by a real click, kept the focus, and nothing was recorded.
- A real drag from an output to an input added one line, dot to dot, as one
  undo entry. The gesture line appears above the canvas when a drag starts and
  moves the canvas down by its height, so the probe aims at the input where it
  is drawn once the line has started, as a reader would.
- A real click and Shift+click and a real Ctrl+G drew a second frame round
  exactly the two steps; real Ctrl+C and Ctrl+V put two copies two grid steps
  right of and below the originals, with the line between them; a real click
  on Arrange ran every line left to right, the sources first and the displays
  last, with no two steps overlapping. Each was one undo entry.
- A real Ctrl+Z after each, last first, put the steps back where they were on
  the canvas, took the copies, the second frame and the dragged line away, and
  left the graph the text it was before each step.
