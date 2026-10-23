# Slide-out panel

> **Package:** `@flexdesk/widgets` · **Used by:** [the tile settings form](tiles.md#a-tiles-settings-as-a-form-mounttileconfigform-0170) · [All docs](../README.md)

`SlideOutPanel` is an inline panel that slides in over its host container from the right edge. A page uses it to show the settings of the element the user picked (a plot, a widget, a node) without taking over the shell's right panel.

## A slide-out panel: `SlideOutPanel`

```js
import { SlideOutPanel } from '@flexdesk/widgets';

const panel = new SlideOutPanel({ width: 480, onClose: () => commit() });
panel.mount(hostEl);                               // hostEl: position: relative; overflow: hidden

const body = panel.open('Plot settings', 'tune');  // a title and a Material Symbols icon name
body.append(settingsForm);                         // you draw the content

panel.close();                                     // or Esc, the × button, or a click outside the panel
panel.dispose();                                   // closes it if open, then removes it from the host
```

- **The host.** It must be `position: relative; overflow: hidden`. `mount(host)` adds a transparent, click-catching backdrop and the panel to it. A second `mount` does nothing.
- **Options.** `width` is in px and defaults to 700. The stylesheet gives the panel `min-width: 400px`, so a smaller width is held at 400. `onClose` is called after the panel has closed and its content has been cleared.
- **`open(title, icon)`** clears the content, sets the header and returns the content element, which is also `panel.contentEl` and scrolls vertically. With no `icon` the header draws none. Opening a panel that is already open replaces its title, icon and content without sliding it in again. Before `mount`, `open` returns `null`. `isOpen` says whether it is open.
- **Closing.** The close button, a click on the backdrop and Esc all call `close()`. Esc is heard on the document while the panel is open, and the panel calls `stopPropagation()` on it. `close()` on a closed panel does nothing. `dispose()` closes first, so `onClose` runs if the panel was open.

## Where it sits

While it is open the panel is `position: fixed`, pinned to the right edge of its host's visible frame, at the host's full height. A host may be a scroll container, and an absolutely positioned child of one would scroll away with the content. Fixed positioning keeps it in place, and the panel measures its host again whenever the geometry can have changed:

- on window scroll and window resize;
- when the host, or any of its ancestors, is resized. A tile splitter drag or a dock panel toggling moves the host without any window event, and a toggle beside a fixed-width tile resizes an ancestor while the tile only shifts;
- under the shell's content zoom the host's rectangle is read in screen pixels, so the panel divides it by its effective zoom (`currentCSSZoom`). It stays flush with the host's right edge, top and height at 50% and at 150%. An engine without `currentCSSZoom` is treated as 100%.

`tests/slide_out_host_resize.test.mjs` and `tests/slide_out_panel_zoom.test.mjs` drive the tracking in jsdom.

## Styling

| Class | What it is |
|---|---|
| `.twm-slide-out-panel` | The panel. `--open` is added while it is open; it slides in over 200 ms |
| `.twm-slide-out-panel__header` | The header row: the icon, the title and the close button |
| `.twm-slide-out-panel__title` | The title, on one line, cut with an ellipsis |
| `.twm-slide-out-panel__close` | The close button, also a `.twm-btn-icon` |
| `.twm-slide-out-panel__body` | The content area, `overflow-y: auto` |
| `.twm-slide-out-panel__backdrop` | The transparent click-catcher over the host. `--visible` is added while the panel is open |

The header icon and the close button are `material-symbols-outlined` glyphs, so they follow the icon-font rule in [Theming and CSS](../concepts/styling.md).
