# Flow editors and the flow kit

> **Packages:** `@flexdesk/flow`, `@flexdesk/canvas` · **Editors:** [canvas](flow-canvas-editor.md), [outline](flow-outline-editor.md), [lanes](flow-lane-editor.md) · [All docs](../README.md)

This page introduces the flow editors and the kit they share. Each editor has its own page: the [canvas editor](flow-canvas-editor.md) (which stands on the `@flexdesk/canvas` kernel), the [outline editor](flow-outline-editor.md) and the [lane editor](flow-lane-editor.md).

## Flow editors

*New in 0.6.0.* Both entries first ship in FlexDesk 0.6.0.

`@flexdesk/flow` holds three editors for flows — a graph of steps, each with
settings — and the kit they share: a **canvas** (nodes and lines), an
**outline** (the graph drawn as a list of blocks) and **lanes** (data flows,
left to right). All three are domain-neutral. An editor never fetches, never
saves and never starts a timer that writes: the step types, the reference
grammar, every finding and every byte of I/O are the consumer's, handed in as
options and handed back through callbacks. `@flexdesk/canvas` is the kernel
under the canvas editor (and under any other diagram), on its own so that a
diagram does not download the editors.

Nothing here changes an existing entry. Both are new entry points, and their
CSS is four new sections at the end of `flexdesk.css`, read only by the classes
these modules set.

```js
import {
    createStepCatalogue, createWidgetRegistry, createSettingsPanel,
    TEMPLATE_REFERENCES, FlowHistory, bindFlowKeys,
} from '@flexdesk/flow';
```

## The kit

The parts every editor stands on, exported for a consumer that builds its own.
A test (`tests/flow_kit_vocabulary.test.mjs`) fails when a file under
`src/flow/` or `src/canvas/` names a consumer's vocabulary, calls `fetch` or
touches browser storage — and is shown to fail on a planted one.

| Part | What it does |
|---|---|
| `createStepCatalogue(types, {categories, idBase})` | The step types the consumer passes in, read as they arrive (`type_id`, `label`, `category`, `role`, `description`, `icon`, `ports`, `config_schema`, `unavailable`; any other key is kept). `get`, `list`, `byCategory`, `role`, `tone`, `inputs(typeId, {flow})`, `outputs`, `port`, `idBase`, and `problems` — a broken type is listed there, never thrown. A type may also carry `render`, `update`, `size: {w, h}` and `accent` (a tone), which only the canvas editor reads ([Node bodies](flow-canvas-editor.md#node-bodies-0170)); `size(typeId)`, `accent(typeId)` and `body(typeId)` answer them, `null` when a type has none, and a `size`, `accent` or hook of the wrong kind is a line in `problems` and is not used (0.17.0). `inline: ['key', …]` names settings of its `config_schema` the canvas editor draws on the node ([Edited on the node](flow-canvas-editor.md#edited-on-the-node-0170)); `inline(typeId)` answers the names the schema has, `[]` when none, and a name it lacks (or an `inline` that is not a list) is a line in `problems` and is not drawn (0.17.0). `rank: 'source' \| 'sink'` is the hint the canvas editor's `layout: 'layered'` Arrange gives the type's steps (the first or the last column); `rank(typeId)` answers it, `null` when a type has none, and any other value is a line in `problems` and is not used (0.17.0). **Ports keep their declared order**: a lane reads the first input as its own and an outline draws the other outputs as arms in order, so nothing sorts them |
| `checkSettingsSchema(schema)` | The JSON-Schema subset a step's settings may use: `type`, `enum`, `const`, `required`, `properties`, `additionalProperties` (a boolean), `items`, `minItems`/`maxItems`, `minimum`/`maximum`, `minLength`/`maxLength`, `format: "uuid"`, the annotations and any `x-` hint. Returns the first refusal as the server's own sentence, or `null`. `oneOf`, `anyOf`, `$ref` and `pattern` are refused. `tests/fixtures/flow_kit_settings_schema.json` holds 30 schemas and their verdicts. Tables' own `check_schema` gave the same 30 verdicts when the file was written, and is meant to read this file in a test of its own |
| `createWidgetRegistry()` | The controls, by name. The ten generic widgets are registered already; `register(name, widget)` throws for a name that exists, and replacing one takes `{replace: true}`. A widget is `(spec, value, ctx) => {el, destroy?, focus?, caret?, restoreCaret?}` and reports with `ctx.set(value)`; `undefined` removes the setting |
| `createSettingsPanel(options)` | One step's settings, or the flow's own, drawn from the schema (below) |
| `createReferenceSyntax({name, pattern, format, describe, stepScope})` | What a chip is. Three are ready: `TEMPLATE_REFERENCES` (`${a.b[0]}`), `FORMULA_REFERENCES` (`[a.b]`), `PARAMETER_REFERENCES` (`{{name}}`). `find`, `format`, `rename(text, map)` and the consumer's `describe(match, ctx) → {label, tone, known}` |
| `createChipInput({value, syntaxes, multiline, readOnly, onInput})` | Text with references drawn as chips. **The value is always the plain text**; a chip is a view of it |
| `openStepPicker({anchor, entries, categories, where, paste})` | What "+" opens: grouped, searchable, ↑ ↓ and Enter; a refused entry is shown greyed with its reason. Resolves `{entry}`, `{paste: true}` or `null` |
| `openValuePicker({anchor, groups, note, onPick})` | *Insert a value*: the consumer's groups of values, a level down for a value with children (`body ›`), searchable across levels |
| `alwaysBefore(graph, catalogue, stepId, {loopPorts, waitsForAll})` | The steps that run before this one on every path, nearest first: the only ones *Insert a value* should offer. A parallel whose merge waits for every branch counts each branch's steps; a loop's body never counts for a step after the loop. `enclosingLoops` lists the loops around a step |
| `groupFindings(list)`, `createFindingsStrip({onGoTo, nameOf})` | The consumer's findings (`{code, message, severity, node_id?, field?}`) by step, and the strip: *"N things to fix before this can be published."*, a line each, *Go to it* |
| `new FlowHistory({actions, restore, onState, limit, mergeMs})` | Undo and redo over whole snapshots. The editor passes its own list of actions and `commit` throws on any other, so an edit nobody named fails its first test. Loading and publishing are `baseline`s, never entries. Keyed commits within `mergeMs` merge (typing a name is one entry), never across an undo. `keep()` and `adopt(kept, state)` carry the stacks to a successor that loaded the same bytes |
| `bindFlowKeys(root, handlers)`, `ownsUndo(target)` | An editor's keys, bound on its root, never on `window` (below) |
| `emptyGraph`, `normalise`, `serialise`, `nextId`, `addNode`, `removeNode`, `connect`, `addConnection`, `canConnect`, `disconnect`, `inputNamesOf` | A logic flow's graph — `{nodes: [{id, type, label?, config, position}], connections: [{source, target, sourcePort, targetPort}]}`, the shape the canvas and the outline both save. `serialise` is byte-stable: a graph opened and saved with no edit is the same text. `canConnect(graph, catalogue, edge, {strings, dataRead, dataPorts})` refuses only what an editor cannot draw; with `dataPorts: true` a data port connects to a data port, any number of lines out of one. `connect` adds the line when `canConnect` allows it; `addConnection(graph, edge)` adds it asking nothing, for a caller whose own rules already allowed it. It may also carry `groups: [{id, label?, tone?, nodes: [id, …]}]` and `notes: [{id, text, position, size?: {w?, h?}}]` (0.17.0), and only when it has some, so a graph without them is the same text as before. Groups are flat: `normalise` keeps a node in the first group that names it, leaves out ids that are not nodes, and drops a group with no member; `removeNode` takes the node out of its group, and the group with its last member |
| `createStrings(...layers)`, `FLOW_STRINGS` | Every word drawn, English and domain-free by default; an editor lays its own words over these, and the consumer lays its words over both |

**The settings panel.**

```js
const panel = createSettingsPanel({
    widgets, references: { template: TEMPLATE_REFERENCES },
    onChange: (stepId, key, value) => apply(stepId, key, value),   // you write it into your graph
    onRename: (stepId, label) => rename(stepId, label),
    onFocusLost: () => surface.focus(),
    values: async ({ stepId, field }) => groupsFor(stepId),         // Insert a value; absent, no "{ }"
    columns: (step) => inputColumnsOf(step),                         // upstream-column(s); null in a logic flow
    host,
});
panel.show({ step, type, title, typeLabel, where, description, idLine, icon, tone,
             rename: true, extra: [...], actions: [...], slots: { before, after } });
panel.setFindings(findings);     // under each field, the rest at the top; rebuilds nothing
panel.focusField('retry.max_attempts');
panel.repaintSlots();            // your areas only; no field is rebuilt
```

It never writes into the step: a change is reported to `onChange`, and the
consumer writes it. A redraw puts focus back on the rebuilt control of the same
field, with the caret where it was, or hands it to `onFocusLost`, never to
`<body>`. Findings and slot redraws rebuild no field, so a run overlay that
refreshes every second leaves a name being typed alone. A control that cannot
be used is disabled and its reason is shown next to it, not only in a tooltip.
`extra` holds the editor's own fields (a port shown as a setting) and notes,
placed with `after: '<key>'` or `at: 'start'`.

**The widgets.** A schema type with no `x-ui-widget` draws its plain control: an
`enum` a select (writing the enum's own value, so a number stays a number), a
string a text box, a number a number box, a boolean a checkbox, an object with
properties a group of its own fields. A control never writes a value the reader
did not give it. An untouched setting stays absent, and emptying one removes it.
A list or map entry keeps its stored type when another entry is edited. A widget
name nobody registered is refused on screen, by name, and its value is kept.

**A widget is built before it is in the document.** The panel calls the widget,
then attaches what it returns, and a field inside a folded (`x-ui-fold`) group
is built inside a closed `<details>`. A widget that measures itself — a Monaco
editor registered as `expression` — must create that editor once its element is
connected and has a size (a `ResizeObserver` on `el` will tell it), never inside
the widget call: an editor built into a box with no size measures a zero
character width and paints a viewport of no lines, and nothing repaints it.

| Generic widget | Draws |
|---|---|
| `template` | Text with chips and *Insert a value*. A setting that may also be a list or an object is shown as JSON and written back as one when the text parses |
| `expression` | A formula: monospace, with chips. Replace it with your own editor (`{replace: true}`) |
| `json-body` | JSON when the text parses, text otherwise |
| `key-value-map` | Names to values |
| `key-value-list` | Ordered assignments: `{variable, value}` or `{variable, expression}` |
| `string-list` | Short strings |
| `enum-chips` | A multi-select of `items.enum`, as chips, in the enum's order |
| `choice-cards` | One of N as radio rows, each with its words |
| `upstream-column`, `upstream-columns` | One or several columns of the step's input, by name, from the panel's `columns`. While `columns` answers `null` (the columns are not known yet) the name is typed instead — a text box, or a chip list that takes a name on Enter or a comma — under the hint *Columns not known yet*; once columns arrive the same setting is a select (or toggle chips) with the stored name chosen, and a name the columns lack is kept and marked *(not found)* (0.17.0) |

| Schema hint | Meaning |
|---|---|
| `x-ui-widget` | The widget that draws the field |
| `x-ui-references` | The syntaxes its chips are recognised in, by name. Without it, `template`, `json-body` and the two key-value widgets use `template`, and `expression` uses `formula` |
| `x-ui-when` | `{field, in}`: drawn only while that sibling holds one of those values (its stored value, else its default) |
| `x-ui-placeholder`, `x-ui-multiline` | A placeholder; a string as a growing textarea |
| `x-ui-enum-labels`, `x-ui-enum-descriptions` | An enum's words, and a sentence under each choice card |
| `x-ui-fold` | An object drawn folded, with a one-line summary of what is set in it |
| `x-ui-add-label` | The words on a list's *Add* button |
| `x-ui-formula-references` | `key-value-list`: the syntaxes of a formula row (default `formula`) |

**References and chips.** A syntax recognises references in order to draw them.
It is not a grammar. A reference your server would refuse is still drawn as a chip
(`describe` can mark it `known: false`) and kept as text. Each syntax has a
default tone for its chips (`PARAMETER_REFERENCES` is violet, the others blue),
so two syntaxes in one field read as two kinds of chip. In the chip input the
browser does the typing, so an IME works. After every input the text is read
back and re-tokenised. Everything else the control does on the text itself:
← and → step over a chip, one Backspace removes a whole chip, a paste is plain
text, a copy puts the exact text on the clipboard, and Enter adds a line only in
a multi-line field. It keeps its own undo, because a script that redraws a
`contenteditable` breaks the browser's. `rename(text, map)` rewrites only the
path segment that names a step, and only once the syntax is told which segment
that is (`stepScope: 'steps'`, or a `stepSegment` function). A syntax nobody
configured renames nothing.

**Keys.** `bindFlowKeys(root, handlers)` binds Ctrl/⌘+Z (`undo`), Ctrl/⌘+Y and
Ctrl/⌘+Shift+Z (`redo`), Delete (`remove`), Ctrl/⌘+D, C, X and V (`duplicate`,
`copy`, `cut`, `paste`), Ctrl/⌘+A (`selectAll`, 0.17.0), Ctrl/⌘+G and Ctrl/⌘+Shift+G (`group`, `ungroup`, 0.17.0), F2 (`rename`), Alt+↑, Alt+↓ and Alt+← (`moveUp`,
`moveDown`, `moveOut`), the arrows (`up`, `down`, `left`, `right`), Enter
(`open`) and Escape (`escape`), and returns an unbind. A key whose handler is
absent, or returns `false`, is not taken. An editor's own row or card marks
itself `data-twm-flow-item`, so Enter on it opens it. Inside a text field Ctrl+Z is the field's own, but it is
still stopped at the editor's root, so a tile beside the editor never hears it.
In a field every other key belongs to the field, and Enter on a button belongs
to the button. **Backspace is never an editor key.** It is not handled and not
stopped, because a host may use it to go back a level.

**Tones and strings.** A category names a tone (`violet`, `teal`, `amber`,
`grey`, `blue`, `indigo`), and `tokens.css` maps each tone to colours:
`--twm-flow-<tone>-bg`, `-fg`, `-line`, `-icon-bg`, `-text-bg` and `-dot`.

**What it does not do.** It does not validate a value against its schema, decide
whether a reference is valid, save, fetch, or keep anything between page loads.
Those belong to the consumer.

**Where each claim was checked.** jsdom computes no layout and does no editing,
so the suites (`tests/flow_kit_*.test.mjs`) assert the DOM, the events and the
text. The rest was checked in headless Edge with real input over the DevTools
protocol: `demo/flow_kit_probe.mjs` serves the repository, opens
`demo/flow_kit.html` and drives it (`demo/flow_cdp.mjs` is the small driver it
uses, for the editors' pages too). The demo pages load the source barrels;
`FLOW_DIST=1 node demo/flow_<kit|canvas|outline|lanes>_probe.mjs` redirects
`flow.js`, `canvas.js` and the three sheets to `dist/`, so the same checks run
against the built bundle. All four probes passed both ways on the integration
build. In the chip input, typing on either side of
a chip, ← and → over it, one Backspace removing it, a real paste of `${a.b}`
becoming a chip, a real copy giving the exact text, an IME composition leaving
the text alone until it committed, and the field's own Ctrl+Z all passed. The
same Backspace in a plain `contenteditable` whose chips are not
`contenteditable="false"` split its chip. A pointer drag across a chip started
no native drag. `elementFromPoint` at the centre of Undo, "+", the panel's
first field, its title, a field's "{ }", an action, a choice and the strip's
*Go to it* returned each one. Both pickers opened inside the viewport, their
search box focused, and gave the focus back to "+" on Escape.
