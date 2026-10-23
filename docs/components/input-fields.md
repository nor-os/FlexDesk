# Input fields: slider and tags

> **Package:** `@flexdesk/widgets` · **More fields:** the toggle and colour fields are in [Forms and dialogs](forms-and-dialogs.md) · [All docs](../README.md)

Two stand-alone inputs. `SliderField` draws a range input, with an optional number box, readout, default and enable toggle. `createTagInput` draws a list of short strings as removable chips followed by a text box.

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
