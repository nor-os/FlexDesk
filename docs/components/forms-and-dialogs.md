# Forms and dialogs

> **Package:** `@flexdesk/widgets` · **See also:** [Input fields](input-fields.md), [Wizard](wizard.md) · [All docs](../README.md)

`openForm` opens a modal form and resolves with the values, or with `null` when the user cancels. `openConfirm` asks a yes-or-no question. The field types are `text`, `number`, `password`, `select`, `textarea`, `checkbox`, `toggle`, `picker`, `checklist`, `radio`, `color` and `colorList`.

## Forms: `openForm`

`openForm({ title, fields, defaults, submitLabel })` (in `@flexdesk/widgets`)
opens a modal form and resolves with `{ [name]: value }`, or `null` when it is
cancelled. Fields are `text`, `number`, `password`, `select`, `textarea`,
`checkbox`, `toggle`, `picker`, `checklist`, `radio`, `color` and `colorList`;
`{ section: 'Label' }` entries are headings and `{ row: [...] }` entries put
fields side by side. The additions below are opt-in, with one change every form
sees, even one that uses none of them: a `select` or `radio` comes back with
its option's OWN value and type (a numeric option submits `2`, not `'2'`; an
option whose value is `null` submits `null`), a default of that type selects
its option (`defaults: { s: 2 }` selects the option whose value is `2`), and an
option object with no `label` shows its value. A select with no option
selected still reads and submits `''`.

### A form that adapts: `onFieldChange`

```js
openForm({
    fields: [
        { name: 'type', label: 'Type', type: 'select', options: ['bug', 'story'] },
        { section: 'Story', name: 'story' },          // a NAMED section can be hidden
        { name: 'points', label: 'Points', type: 'number', required: true },
    ],
    onFieldChange: (name, value, api) => {
        const story = api.get('type') === 'story';
        api.setVisible('story', story);
        api.setVisible('points', story);
    },
});
```

`onFieldChange(name, value, api)` is called once when the form opens (with
`name === null`, so the form starts consistent with its defaults) and after
every field's `change`. `api` addresses fields and named sections by name:

- `setVisible(name, on)` hides or shows the row. A hidden row keeps its value
  and is still submitted (a disabled option it holds submits as no value:
  `''` for a select or combobox, `null` for a radio), but it is not asked
  about: its `required` and its
  `validator` stand down until it is shown again.
- `get(name)` reads the control as it stands: a checkbox as a boolean, a
  select or radio as its option's own value (a select with no option selected
  as `''`, a radio with none as `null`), a combobox as the value of the option
  its text names — exactly what it submits — or as its text when it names
  none, a checklist as the array of chosen values, anything else as its
  string.
- `set(name, value)` writes it. It does not call `onFieldChange` back, so a
  hook that fills one field from another cannot loop. A value a select or
  radio does not offer, or offers only disabled, clears it (a select then
  submits `''`, a radio `null`).
- `setOptions(name, options)` replaces the options of a `select` (a
  combobox's suggestions too), `checklist` or `radio` while the form is open
  — see below.

A hook that throws is logged and the form carries on.

### Hidden rows stay hidden

`.twm-modal__row` is a grid, and a grid rule beats the `display: none` that
the `hidden` attribute gets from the browser, so a hidden row stayed on
screen. `flexdesk.css` now has `.twm-modal__row[hidden],
.twm-modal__section[hidden] { display: none !important }`, and `setVisible`
also sets the row's inline `display`, so it holds under a stylesheet of your
own as well.

### A value you look up: `type: 'picker'`

```js
{ name: 'parent', label: 'Parent', type: 'picker', required: true,
  pick: async (current) => ({ value: 'EPIC-0001', label: 'EPIC-0001 — Auth rewrite' }),
  displayFor: (value) => titleOf(value) }
```

The row shows a read-only box and a search button. The button, or a click on
the box, awaits `pick(currentValue)`. Return `{ value, label }` (the label is
shown, the value is submitted), a bare value (shown through `displayFor`, or
as itself), or `null` to leave the field as it was. `displayFor(value)` gives
the text for the value the form opens with and for `api.set`. The value is
kept in a hidden input, which the browser's own `required` check skips, so
`required: true` on a picker is checked by the form instead. The markup is
`.twm-picker` > `.twm-picker__display` + `.twm-btn.twm-picker__btn`.

### A select you may type into: `create`

A `select` with a `create` spec is a type-ahead combobox: pick an option or
type a new value. `create: { onCreate, hint }` makes the typed value into an
entity before the form resolves, and shows "↳ will create *hint* …" while you
type. `create: true` is the plain case: the typed value is submitted as typed,
with no hint, because nothing is created. Until now `create: true` failed the
submit with "onCreate is not a function".

`tests/open_form.test.mjs` mounts the real `openForm` in jsdom and covers all
four, plus a plain form submitting as before.

### Options: typed, unavailable, grouped, and changed while open (0.17.0)

```js
openForm({
    fields: [
        { name: 'country', label: 'Country', type: 'select', options: ['no', 'it'] },
        { name: 'town', label: 'Town', type: 'select', options: [] },
        { name: 'plan', label: 'Plan', type: 'select', options: [
            { value: 1, label: 'Free' },
            { value: 2, label: 'Pro', disabled: true, reason: 'needs a licence' },
            { group: 'Teams', options: [{ value: 10, label: 'Small team' }, { value: 50, label: 'Large team' }] },
        ] },
        { name: 'days', label: 'Days', type: 'checklist', required: true,
          options: [{ value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' }] },
        { name: 'mode', label: 'Mode', type: 'radio', options: [
            { value: 'fast', label: 'Fast', description: 'Skips the checks.' },
            { value: 'safe', label: 'Safe' },
        ] },
    ],
    onFieldChange: (name, value, api) => {
        if (name === null || name === 'country') api.setOptions('town', townsOf(api.get('country')));
    },
});
// → { country: 'it', town: 'Rome', plan: 10, days: ['mon'], mode: 'fast' }
```

An option is a bare value or `{ value, label?, disabled?, reason?,
description? }`.

- **Values keep their type.** An option whose value is the number 10 submits
  10, and `api.get` reads 10 — not `'10'`. A default matches an option of the
  same text, so `defaults: { plan: '10' }` selects 10. A combobox entry typed
  as an option's text submits (and `api.get` reads) that option's value. An
  option whose value IS the given one wins over one that only has its text:
  with options `[1, '1']`, a default `'1'` submits `'1'`.
- **A disabled option** is shown with its `reason` (in a select's option text
  and tooltip, under a radio, on a chip) and is never the submitted value: a
  default naming it does not select it, `api.set` to it clears a select,
  radio or combobox and leaves a checklist's chip unpressed, the reader
  cannot pick it, a combobox does not suggest it, and a submit
  that finds one selected anyway (a script set `.value`, or every option is
  disabled) is refused with "Not available: *reason*" on the field. In a
  hidden row, which is not asked about, it submits as no value instead.
- **`{ group, options }`** in a select's list is an `<optgroup>` headed
  *group*. In a checklist or radio it is a `.twm-choice__group` heading over
  that group's chips or rows (a group with no options draws none). A combobox
  suggests a group's enabled options, without headings.
- **`api.setOptions(name, options)`** replaces the list while the form is
  open and keeps the current value when the new list offers it enabled.
  Otherwise a select falls to its first enabled option, a radio to none and a
  checklist drops what is gone. It does not call `onFieldChange` back.
- **`type: 'checklist'`** draws toggle chips and submits the array of chosen
  values in the list's order (`[]` for none). `required` means at least one,
  and nothing chosen is "Required." on the field.
- **`type: 'radio'`** draws one radio row per option, with its `description`
  under it, and submits the chosen value, or `null`. `required` means one is
  chosen.

The select, the chips and the radio list are the flow kit's
(`src/ui/components/choice_controls.js`): the settings panel's `enum` select,
`enum-chips`, `upstream-columns` and `choice-cards` draw with the same code, so
a form and a settings panel cannot drift apart. In a form they are classed
`.twm-flow-togglechips` / `.twm-flow-togglechip` and `.twm-flow-choices` /
`.twm-flow-choice`; an unavailable option's reason is `.twm-choice__reason`.

`tests/open_form_choices.test.mjs` covers each of these in jsdom.

### Colours: `type: 'color'` and `type: 'colorList'` (0.17.0)

```js
openForm({
    fields: [
        { name: 'accent', label: 'Accent', type: 'color', default: 'rgb(31,119,180)',
          presets: ['#1f77b4', '#ff7f0e', '#2ca02c'] },
        { name: 'palette', label: 'Palette', type: 'colorList', default: ['#1f77b4', '#ff7f0e'] },
    ],
});
// -> { accent: '#1f77b4', palette: ['#1f77b4', '#ff7f0e'] }
```

A `color` row is a swatch that opens the native picker, a hex box kept in step
with it (picking writes the box; typing a valid hex moves the swatch), and,
with `presets`, a strip of preset swatches. It submits lowercase `#rrggbb`, or
`''` when left empty. A `colorList` row is an ordered list of such fields: add,
remove, and reorder by drag or by the up / down buttons; `presets` are offered
on every row, and it submits the colours in their current order as an array of
`#rrggbb`. An `rgb()` / `rgba()` default (or `api.set` value) is shown as its
hex; alpha is dropped, because the native picker has none. A box that does not
hold `#rgb` or `#rrggbb` is a field error ("Not a hex colour", with the row
numbers for a list) and the form does not resolve; `required` on either is
checked by the form. `api.get` reads a `color` as its box text and a
`colorList` as the array of its rows' text.

Both are also components of their own in `@flexdesk/widgets`:
`new ColorField({ value, presets, name, label, onChange })` and
`new ColorListField({ value, presets, newColor, addLabel, name, onChange })`,
each with `render()`, `getValue()` (null while something typed is not a
colour), `setValue()`, `focus()` and `dispose()`; `onChange(value, { commit })`
reports every edit and, with `commit: true`, every committed one.
`normalizeHex(value)` (`#rgb`, `#rrggbb`, `rgb()` -> `#rrggbb` or null) and
`isHexColor(value)` are exported with them, and `validateField` (in
`@flexdesk/tiles`) now rejects a `FieldTypes.COLOR` value that is not a hex
colour. The markup is `.twm-color-field` > `.twm-color-field__swatch` +
`.twm-color-field__hex` (+ `.twm-color-field__presets`), and `.twm-color-list`
rows are `.twm-color-list__row`. `tests/color_field.test.mjs` covers all of it.

### Number bounds and fields side by side: `min`, `max` and `{ row }` (0.17.0)

```js
openForm({
    fields: [
        { name: 'steps', label: 'Steps', type: 'number', min: 2, max: 200, step: 1 },
        { row: [
            { name: 'lo', label: 'Min', type: 'number', hint: 'lowest value' },
            { name: 'hi', label: 'Max', type: 'number', min: 0 },
        ] },
    ],
});
// → { steps: 50, lo: 0, hi: 10 }
```

- **`min` / `max`** on a `number` field are the input's own `min` and `max`
  attributes, and a value outside them is refused on submit with an error
  under that field: "Must be between 2 and 200." (or "Must be at least 2." /
  "Must be at most 200." with only one). The browser's own range check stops
  such a submit first; the form cancels its bubble and shows the field error
  instead, and it checks the range itself as well, before the field's
  `validator`. An empty field that is not `required` is not out of range. A
  row hidden by `setVisible` drops its bounds until it is shown again, as it
  drops `required`. As with any `<input type="number">`, a `min` is also where
  `step` counts from.
- **`{ row: [field, ...] }`** puts its fields on one line; their inputs share
  what the labels leave equally (see below).
  The row is layout only and has no name: each field in it is an ordinary
  field with its own label, hint, error, `setVisible`, value and submitted
  key, so hiding one hides only that one. The first keeps the form's label
  column; the others size their label to its text. A form narrower than
  360px stacks them (a container query, `twm-form`, on a form that has a row;
  a form without one is not made a container). A form with a row opens at the
  wide (640px) layout, or wider for a row of three or more fields (below).
  The row is `.twm-modal__field-group`.

A form with neither renders exactly as before.
`tests/open_form_rows_bounds.test.mjs` covers both in jsdom.

### The inputs of a row are equally wide (0.17.15)

Every input in a `{ row }` gets the same width: each field takes its label's
width (the first one the form's 130px label column), and what is left of the
row is shared equally between the inputs. The share is equal up to each
control's own padding and border: a native `<input>` or `<textarea>` keeps its
~18px, a select, toggle or picker (which sit in a padding-less slot) does not,
so in a row that mixes the two the native input is that much wider. A form
whose widest row has three or more fields opens wider: `170 + 230 × fields` px
(860px for three, 1090px for four), at least 640px, otherwise at most 90% of the
window; forms without such a row open as before. Until 0.17.14 every field was
an equal share of the row, including the first one's label column, so its input
was a sliver beside the others: about 15px for the first of four number fields
in a 640px form (BUG-0050).

### A switch: `ToggleField` and `type: 'toggle'` (0.17.0)

```js
import { ToggleField } from '@flexdesk/widgets';

const autosave = new ToggleField({
    label: 'Autosave', onText: 'On', offText: 'Off',   // all optional
    checked: true, compact: false, disabled: false,
    onChange: (on) => settings.set('autosave', on),
});
host.appendChild(autosave.render());
autosave.get();              // true
autosave.set(false);         // does not call onChange
autosave.setDisabled(true);
autosave.dispose();
```

A track and a knob drawn over a real checkbox with `role="switch"` and an
`aria-checked` that follows it. Space and Enter toggle the focused switch, a
click on the track, the state text or the label toggles it, the focused input
draws a ring on the track, and a disabled switch ignores clicks and keys alike.
`ariaLabel` names a switch with no visible label. The markup is
`label.twm-toggle` (`--compact`, `--disabled`) > `.twm-toggle__control` >
`input.twm-toggle__input` + `.twm-toggle__track` > `.twm-toggle__knob`, then
`.twm-toggle__state` and `.twm-toggle__label`; `flexdesk.css` styles it from
tokens alone, with no colour literal.

In a form, `{ name, label, type: 'toggle', onText?, offText?, disabled?,
compact? }` mounts one and submits a boolean, like a checkbox; `api.get` reads
it as a boolean and `api.set` moves it. `tests/toggle_field.test.mjs` covers
both.

## Confirms show text, not markup (0.17.0)

`openConfirm({ title, message, confirmLabel, cancelLabel, danger, icon })`
resolves `true` or `false`. Its `message` and both labels are **text**: they
are set with `textContent`, so a `<` shows as a `<`. Until 0.17.0 they went into
`innerHTML`, and `showDeleteConfirmDialog` / `showCloseConfirmDialog` put
`itemName` and `itemType` into that message raw: a flow named
`<img src=x onerror=…>` rendered an image and ran its handler, and a name with
an unclosed `<` swallowed the rest of the message.

A caller that passed markup in `message` now sees the tags; write a `\n` for a
line break instead (the message body is `white-space: pre-line`).
`additionalMessage` on `showDeleteConfirmDialog` follows on its own paragraph
exactly as before. A body that needs real markup is `openModal`'s job: it takes
the caller's own DOM.

`tests/confirm_escaping.test.mjs` opens each of them in jsdom with hostile
names and labels.
