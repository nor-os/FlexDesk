# Input fields: slider, tags, select and combobox

> **Package:** `@flexdesk/widgets` · **More fields:** the toggle and colour fields are in [Forms and dialogs](forms-and-dialogs.md) · [All docs](../README.md)

Stand-alone inputs. `SliderField` draws a range input, with an optional number box, readout, default and enable toggle. `createTagInput` draws a list of short strings as removable chips followed by a text box. `createSelect` is a select drawn in the DOM, and `createCombobox` a text box that also offers a list.

## SliderField: a number box, a readout, a default and an enable toggle (0.17.0)

`new SliderField({ fieldId, field, onChange })` (from `@flexdesk/widgets`)
draws a range input. Its companions are opt-in through `field`; with none of
them the DOM is the range and the helper line, as it always was.

```js
import { SliderField } from '@flexdesk/widgets';

const slider = new SliderField({
    fieldId: 'rate',
    field: {
        min: 0, max: 1, step: 0.01, value: 0.25,
        numberInput: true,                         // an editable box, kept in sync both ways
        readout: (v) => `${Math.round(v * 100)}%`, // or true for the plain value
        defaultValue: 0.25,                        // --modified state and a reset button
        toggleable: true, disabledValue: null,     // an enable checkbox before the slider
    },
    onChange: (value, { immediate }) => save(value),
});
host.appendChild(slider.render());
```

| Field / method | What it does |
| --- | --- |
| `numberInput` | A text box beside the slider. Dragging updates it on every frame; Enter (or leaving the box) commits what was typed, clamped to `[min, max]` and snapped to `step`. Text that is not a finite number (`abc`, empty, `Infinity`) changes nothing and the box shows the value again; Escape does the same |
| `readout` | A span after the slider: `true` shows the value, a function `(value: number) => string` formats it. It follows the drag live |
| `defaultValue` | While the value differs from it the root carries `twm-slider-field--modified` and the reset button shows; reset restores it and reports it through `onChange`, like a release |
| `toggleable`, `enabled`, `disabledValue` | A checkbox before the slider (`enabled: false` starts it off). While off, the inputs are disabled, the root carries `twm-slider-field--off`, and `onChange`/`getValue()` report `disabledValue` (default `null`) |
| `onChange(value, { immediate })` | Called once per commit: a drag release, a typed Enter, a reset, a toggle. The value is the slider's value as a string, as before. With `emitOnInput` it is also called on every drag frame with `immediate: true` |
| `setValue(x, { silent })`, `setRange({ min, max, step }, { silent })`, `setEnabled(on, { silent })`, `reset({ silent })` | Change the field from code. Each reports at most once, nothing with `silent: true`, and nothing when the reported value did not move, so a caller that writes back from its own `onChange` does not loop. `setValue` refuses a non-finite value (returns `false`); `setRange` refits the value and the default |
| `getValue()`, `isEnabled()`, `isModified()` | What `onChange` would report now, the toggle state, and whether the value differs from `defaultValue` |

## A list of tags: `createTagInput` (0.17.0)

`createTagInput(host, { value, placeholder, readOnly, allowDuplicates, onChange })`
(in `@flexdesk/widgets`) draws a list of short strings as removable chips
followed by a text box, and appends it to `host`.

```js
const tags = createTagInput(host, {
    value: ['baseline'],
    placeholder: 'Add a tag…',
    onChange: (list) => save(list),   // a fresh copy after each change the reader makes
});
tags.getValue();            // ['baseline']
tags.setValue(['a', 'b']);  // redraws; does not call onChange
tags.dispose();
```

- **Enter**, a **comma** and **blur** commit what was typed: it is split at
  commas and each piece trimmed, so `a, b` then Enter adds two chips and
  `onChange` receives `['a', 'b']`.
- Empty pieces are ignored, and so is a piece already in the list unless
  `allowDuplicates` is set. A commit that adds nothing calls no `onChange`.
- **Backspace** in an empty box removes the last chip.
- A **paste** that carries a comma is split into chips at once; a paste
  without one is ordinary text in the box.
- Each chip's remove button has an `aria-label`, "Remove <tag>" by default;
  `removeLabel(tag)` words it (for another language). `label` names the text
  box and the group.
- `readOnly` draws the chips alone: no remove buttons and no text box.

The handle is `{ element, input, getValue, setValue, focus, dispose }`
(`input` is `null` when read-only). The styles are the `twm-tag-input` block in
`flexdesk.css`. `tests/tag_input.test.mjs` covers each of the above in jsdom.

## Suggestions and one spelling for tags: `suggestions`, `normalise` (0.18.0)

`createTagInput` takes two more options. Neither changes a tag input that does
not pass them.

```js
createTagInput(host, {
    value: ['baseline'],
    suggestions: ['baseline', 'stress', 'path-finding'],     // or async (query, { signal }) => [...]
    normalise: (s) => s.toLowerCase().replace(/\s+/g, '-'),
    onChange: save,
});
```

- **`suggestions`** offers known tags under the text box: strings, or
  `{ value, label?, description?, icon?, hint? }`. Focus shows them and typing
  narrows them. Whatever their source, a row is in the one spelling, says a tag once and is not
  a tag already in the list. An array is filtered here with the earliest match first and then
  alphabetically. A function is asked with what is in the box, keeps its own order and may
  return a promise, as in [`createCombobox`](#a-text-box-that-also-offers-a-list-createcombobox-0180).
- The arrow keys walk the rows, and **Enter** or a **comma** takes the active one. With no row
  active, which is how it starts, both still commit what was typed, and so does a blur:
  a list of known tags never stops you adding a new one.
- **`normalise(text)`** is the one spelling of a tag, handed the trimmed text and applied to the
  value it opens with, to what is typed, to the suggestions and to `setValue`. With it
  `Path Finding` and `path-finding` cannot both exist.

Since 0.18.0 the list a tag input opens with, and `setValue`'s, drop a repeat
unless `allowDuplicates` is set, as typing always did.

## A select drawn in the DOM: `createSelect` (0.18.0)

A native `<select>` styles down to its closed box: the list belongs to the
operating system. `createSelect` draws the list itself, so a row can have a glyph,
a second line, a hint and a reason, under group headings, with a search box and a
way to type a value nobody listed. `selectBox`, the native one, stays for a list with
nothing to say in a tight strip.

```js
import { createSelect } from '@flexdesk/widgets';

const phase = createSelect({
    value: 'review',
    allowNew: true,
    options: [
        { value: 'draft', label: 'Draft', icon: 'edit', description: 'Not ready for anyone', hint: 'D' },
        { group: 'In progress', options: [
            { value: 'review', label: 'Review', icon: 'rate_review' },
            { value: 'held', label: 'Held', disabled: true, reason: 'needs an owner' },
        ] },
    ],
    onChange: (value, option) => save(value),
});
toolbar.appendChild(phase.el);
```

| Option | What it does |
| --- | --- |
| `options` | Bare values, `{ value, label?, icon?, description?, hint?, keywords?, disabled?, reason? }`, or `{ group, options }`. `keywords` is searched and never drawn. A function is read each time the list opens and the trigger is painted, for a list that grows while the page lives |
| `value`, `onChange(value, option)` | `onChange` hears the reader choosing a different value, with the entry as you gave it (`null` for a new value). A value keeps its type: an option whose value is 4 gives 4 |
| `search` | The search box. By default it is there with `allowNew` or more than seven options; `true`, `false` or `{ placeholder }` decides. It narrows on the label, the value, the description and `keywords`, is emptied on every open, and takes focus |
| `allowNew`, `newLabel(typed)` | A typed text no option has as its value or label is offered as a last row, "Use “…”" by default, and is the value when chosen |
| `placeholder` | Shown while nothing is chosen: `null`, `undefined` or `''`, with no option of its own. `setPlaceholder(text)` changes it, for a list that is being fetched |
| `notFound(value)` | How a value in no option reads on the trigger; as itself by default |
| `loose` | A stored `'2'` names option `2` |
| `showIcon` | Draw the chosen option's glyph on the trigger too. On by default |
| `name` | A hidden input of this name carries the value as text, for a surrounding form, and fires a bubbling `change` when the reader chooses. `el` is then a wrapper round the trigger and the input |
| `carrier` | That hidden input, yours, instead of `name`: a form template's field that something finds by `[data-f]` or an id. Its attributes are left as they are |
| `className`, `panelClassName`, `title`, `ariaLabel`, `disabled`, `align` | Extra classes on the trigger and on the list's panel, its tooltip and name, whether it is disabled, and which trigger edge the list lines up with |
| `emptyText(typed)` | What a list with no rows says |

The handle is `{ el, input, value, isOpen, setOptions(options, value?), setPlaceholder(text), setDisabled(on), open(), close(), focus(), destroy() }`.
`value` reads and writes, and writing does not call `onChange`; so does `setOptions`, which
leaves the value alone unless you pass one.

**The value is never silently changed.** A value in none of the options, or naming a
disabled one, stays the value and is shown. A list that arrives late or has moved on
does not turn it into something else on the next save.

**Keys.** ArrowDown, ArrowUp, Enter or Space open the list; the arrows walk the rows
that may be chosen and wrap; Enter takes the active row (Space too, with no search box).
With no search box Home and End go to the ends and a printable key walks to the
label it begins. Tab closes the list and goes on from the trigger. Escape closes
the list and nothing else, so the dialog around it stays open. Focus stays on the
trigger, or in the search box, and `aria-activedescendant` names the active row.

The list is on an [anchored layer](menus.md#an-anchored-layer-positionanchored-openanchoredlayer-0180):
it is on the page only while open, and `destroy()` takes everything away. The classes are `.twm-select`
(`--empty`, `.twm-is-open`), `.twm-option-panel` and `.twm-option-list__row` (`--active`;
`aria-selected` marks the current value). No state is held in a `data-*` attribute.

## A text box that also offers a list: `createCombobox` (0.18.0)

The text in the box is the value; the list only suggests. For a value that may be
anything but usually is one of a few known ones: a code, a unit, a name. A field
whose value is an opaque id with a separate name is `createSelect`'s.

```js
import { createCombobox } from '@flexdesk/widgets';

const code = createCombobox({
    value: 'gbp',
    options: [
        { value: 'GBP', label: 'GBP · £', description: 'Pound sterling' },
        { value: 'CAD', label: 'CAD · $', description: 'Canadian dollar', keywords: 'loonie' },
    ],
    normalise: (text) => text.toUpperCase(),
    isCandidate: (text) => /^[A-Z]{3}$/.test(text),
    validate: (value) => (/^[A-Z]{3}$/.test(value) ? null : 'Three letters.'),
    onChange: (value, option) => { model.code = value; },
});
form.appendChild(code.el);
```

- **The box holds the value.** `label` is what the list shows; choosing a row puts its
  `value` in the box.
- **`onChange(value, option)`** fires on every keystroke and pick (`option` is the
  entry you gave when one was picked, else `null`), so "type a value, click Save"
  cannot save the previous one.
- **`normalise(text)`** applies to what is reported every time, and rewrites the box
  only when the text is settled (a pick, Enter, Tab or blur), because rewriting
  an input moves the caret. A handed value it changes is reported once at
  construction, so your model does not keep what the box no longer shows.
- **`autoHighlight`** (on by default) makes the first surviving row active as you
  type, so Enter completes it; the row whose value IS the typed text wins. Since the
  list also searches labels, descriptions and `keywords`, a complete code typed in full
  can sit inside another row's words: **`isCandidate(text)`** says the text is already a
  well-formed value, so that nothing is made active and Enter keeps it.
- **`validate(value)`** warns under the box once the text is settled, and `error` reads it.
  It does not refuse: the value is still reported.
- **Enter and Escape** are swallowed while the list is open, and only then: they close
  the list and not the dialog around it.

**Options found as the reader types.** `options` may be a function:

```js
createCombobox({
    options: async (query, { signal }) => {
        const res = await fetch(`/people?q=${encodeURIComponent(query)}`, { signal });
        return res.json();                // [{ value, label, description? }]
    },
    debounce: 200,                        // ms before it is asked; 150 by default
});
```

It does its own filtering and is asked with `''` when the list opens without typing. An
answer that is no longer the latest is dropped, and `signal` aborts when a newer
one is asked for. While the first answer is coming the list says `loadingText`; rows
already drawn stay until the next answer; no rows closes the list; a rejection is logged
and the list says `errorText`. An answer after Escape does not reopen it.

The handle is `{ el, input, value, error, isOpen, setOptions(options), open(text?), close(), focus(), destroy() }`.
It also takes `name`, `placeholder`, `title`, `ariaLabel`, `disabled`, `className` and `panelClassName`. A pick
fires a bubbling `change` on the input, for a form around it.

**`attachInputOptions(input, options)`** is the list on its own, under a text box of yours.
`createCombobox` and the tag input's suggestions are this. It takes `options`,
`onPick(option)` (the entry you gave is `option.source`), `anchor`, `isCurrent`, `autoHighlight`,
`isCandidate`, `normalise`, `openOnFocus`, `passEnter`, `loadingText`, `errorText`, `debounce`,
`panelClassName` and `onSettle`, and answers `{ isOpen, open, close, takeActive, setOptions, destroy }`.
`takeActive()` chooses the active row and says whether there was one, for a key of your own that
also means "this one", such as the tag input's comma.

`tests/select_combobox_popover.test.mjs` covers these and the tag input's options in jsdom.

## A list under a name being edited: `attachInlineRenamer` (0.18.1)

`attachInlineRenamer`'s `onStart` now runs before the renamer adds its own key listeners, and is handed the input as `{ value, triggerEvent, input }`. So what it attaches hears each key first, which is what [`attachInputOptions`](#a-text-box-that-also-offers-a-list-createcombobox-0180) asks for:

```js
const renamer = attachInlineRenamer({
    label,
    onStart: ({ input }) => {
        list = attachInputOptions(input, {
            options: names,
            onPick: (option) => {
                input.value = option.value;
                renamer.commit('pick');
            },
        });
    },
    onCommit: (name) => save(name),
    onFinish: () => list.destroy(),
    onCancel: () => list.destroy(),
});
```

Enter on an arrow-highlighted row commits the row; with no row highlighted it commits what was typed. Esc with the list open closes only the list, and the next one cancels. Taking the field off the page ends the edit first, so the blur a browser fires for it commits nothing after a commit or an Esc.
