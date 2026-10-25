# Theming and CSS

> **Stylesheets:** `flexdesk/css/tokens`, `flexdesk/css/reset`, `flexdesk/css` · [All docs](../README.md)

## Styling

Three stylesheets, and that is the whole CSS contract:

| | Specifier | Resolves to | |
|---|---|---|---|
| `dist/tokens.css` | `flexdesk/css/tokens` | `css/tokens.css` | Every rule reads `var(--…)` from here. Swap this one file and the shell restyles. |
| `dist/reset.css` | `flexdesk/css/reset` | `dist/reset.css` | The reset. |
| `dist/flexdesk.css` | `flexdesk/css` | `dist/flexdesk.css` | The library. Every class is `twm-` prefixed (the original working name; the prefix is stable and not worth a breaking rename). |

A bundler, an import-map generator or `require.resolve` reaches each one by its
specifier, through the package's `exports` map, which closes every other path
into the package. The map sends `flexdesk/css/tokens` to the source
`css/tokens.css`, not `dist/tokens.css`. The two are identical in a release,
since `dist/` is rebuilt in the release commit, but can differ on a working
checkout. `flexdesk/css/reset` is missing from 0.16.1 and earlier,
where it fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

`createDetailHeader` follows the prefix too: a badge is a `.twm-detail-header__badge`
pill (a badge's `className` is added beside it, to recolour it), and an action is a
`.twm-btn` — `variant: 'primary'` adds `.twm-btn--primary`, `'danger'` adds
`.twm-btn--danger` — that also carries `.twm-detail-header__btn` and
`.twm-detail-header__btn--<variant>`. The unprefixed `detail-header__badge` and
`detail-header__btn--<variant>` it emitted before, which no FlexDesk rule styled, are
gone.

`@flexdesk/editor`'s components keep the class names they were extracted with, and
`flexdesk.css` styles them: `SplitPaneContainer` (`.split-pane-container`,
`.split-pane`, a 4px `.split-pane-divider` with a 10px hit target),
`EditorPane` (`.editor-pane`, `.editor-pane__body`, `.notebook-editor-container`)
and `NotebookSearchBar` (`.nb-search-bar*`). `setPanes()` adds `.split-pane` to the
elements you hand it and leaves their own classes alone (it used to replace them,
which stripped `.editor-pane` off an `EditorPane`).

One exception to the prefix: `HelpModal` (`@flexdesk/widgets`) keeps its older
`help-` classes (`help-modal-overlay`, `help-modal`, `help-index`, …), and
`flexdesk.css` styles them — a centred dialog on a dimmed overlay, drawn over
managed windows. `.help-article` holds your provider's rendered HTML and styles
its plain elements (headings, code, tables, lists).

Icons are rendered by applying the `material-symbols-outlined` class. FlexDesk does
not ship the font — supply it from Google Fonts or self-host. Without it, icons fall
back to their text names and nothing breaks.

## Retheming the accent (0.17.10)

The accent colours in `flexdesk.css` that were the literal `#007acc`
(`rgb(0, 122, 204)`), its tints, and the light accent `#569cd6` /
`#6eb3e9` are now derived from an accent token. Setting the tokens on `:root`
rethemes all of them:

```css
:root {
    --accent:        #8a2be2;
    --accent-hover:  #9b4dea;
    --accent-bright: #a64dff;   /* selections, focus rings, tints, primary buttons, the slider thumb */
}
```

`--accent` and `--accent-hover` stay literals. `--accent-bright` is the one
the rest is derived from, in `tokens.css`:

- `--state-selected`: `color-mix(in srgb, var(--accent-bright) 15%, transparent)`.
  It was `rgba(0, 122, 204, 0.15)`, the same colour.
- `--shadow-glow`: `0 0 2px color-mix(in srgb, var(--accent-bright) 30%, transparent)`.
  It was `0 0 2px rgba(0, 122, 204, 0.3)`, the same colour.
- `--twm-dt-new-bg` (new): `color-mix(in srgb, var(--accent-bright) 22%, transparent)`,
  the colour a DataTable row or cell that has just arrived flashes from.
  The stylesheet read it before, with an `rgba(0, 122, 204, 0.22)`
  fallback, but nothing defined it.
- `--accent-light` (new): `color-mix(in srgb, var(--accent-bright) 70%, white)`,
  about `#4da2db`. It replaces `#569cd6`.
- `--accent-lighter` (new): `color-mix(in srgb, var(--accent-bright) 55%, white)`,
  about `#73b6e3`. It replaces `#6eb3e9`.

You can still set `--state-selected`, `--shadow-glow` or `--twm-dt-new-bg`
yourself. Set the derived tokens on `:root`, as `tokens.css` does: a custom
property that reads `var(--accent-bright)` is resolved where it is declared,
so an `--accent-bright` set on a lower element does not reach the tokens
derived from it on `:root`.

What changed in the stylesheet:

- **Tints.** The `rgba(0, 122, 204, a)` tints are now
  `color-mix(in srgb, var(--accent-bright) a%, transparent)`, with the same
  colour by default. They are the DataTable's selected rows and cells, the
  filter chip when on, the autocomplete's namespace pill and active item,
  `.add-widget-btn`, `.tile.resizing`, `.tile-ghost`, the focused leaf's inset
  shadow, the document outline's active link, the canvas marquee and the
  flow graph's port dots.
- **The light accent.** The SliderField thumb, the SortableList drop line,
  add button and input focus, the DataTable filter inputs' focus border and
  the notebook autocomplete's border read `--accent-light`. The active thumb
  reads `--accent-lighter`. `#569cd6` cannot be mixed exactly from `#007acc`,
  so these move to the nearest mix of `--accent-bright` with white: the thumb
  goes from `#569cd6` to about `#4da2db`, and the active thumb from `#6eb3e9`
  to about `#73b6e3`, a difference of about 1.5 to 1.7 ΔE (OKLab × 100).
- **No fallbacks.** `var(--accent-bright, #007acc)`, `var(--state-selected, …)`,
  `var(--ea-accent, …)` and `var(--accent, …)` no longer carry fallbacks.
  `tokens.css` defines all of them, so no computed colour changes, but
  `flexdesk.css` now needs `tokens.css` (or your own definitions of these tokens).

Not part of the accent, and still literals: the autocomplete's type colours
(`stock` is `#569cd6` beside `#4ec9b0`, `#ce9178`, …), the DataTable header
icons' type colours (`flow` is `#268bd2` beside `#6c71c4`, `#cb4b16`,
`#859900`), the notification border `#4fc1ff`, links (`#3794ff`, the about
dialog's link hover `#4da6ff`, and the breadcrumb and plot-series links), and the flow kit's categorical colours
(`--twm-flow-blue-*` beside `--twm-flow-indigo-*`, …). The (0.17.11) section
lists the rest.

0.17.10 left the accent blues in other shades as literals: the selected tile
(`#78b9ff`), the primary button's hover (`#1683c4`, `#1486cf`), the row
cursor and snap preview (`rgba(17, 119, 179, a)`), and some flow-lanes and
plot-window colours. 0.17.11 derives them too (next section).

## Retheming the accent shades (0.17.11)

The accent blues that 0.17.10 left as literals, in shades no mix of an
accent token gives exactly, are now derived from the accent tokens too, so
setting `--accent`, `--accent-hover` and `--accent-bright` on `:root`
rethemes the primary buttons' hover, the selected tile, the row cursor, the
window bar, the plot window, the spinner and the flow lanes as well.
`--accent` and `--accent-bright` stay two tokens.

Three tokens are new in `tokens.css`, each read by more than one rule:

- `--accent-bright-hover`: `color-mix(in srgb, var(--accent-bright) 90%, white)`,
  about `#1987d1`. A primary button's hover (the modal's too) and the window
  bar's hovered item.
- `--accent-pressed`: `color-mix(in srgb, var(--accent-hover) 90%, black)`,
  about `#0f6ba8`. The window bar's pressed item and the flow lanes' pressed
  show button.
- `--accent-lightest`: `color-mix(in srgb, var(--accent-bright) 36%, white)`,
  about `#a3cfed`. The lightest accent text, after `--accent-light` and
  `--accent-lighter`.

They are defined from the accent tokens in `tokens.css`. If you supply your
own token definitions instead of `tokens.css`, define these three as well:
the rules that read them have no fallback.

None of the old colours is an exact mix, so each moves to the nearest one,
by the ΔE (OKLab × 100) below. A tint's ΔE is measured over `--surface-0`
(`#1e1e1e`), where it is seen, and every colour is rounded to 8 bits per
channel first.

| Where | Was | Now reads | Default now | ΔE |
|---|---|---|---|---|
| `.twm-btn--primary:hover` | `#1486cf` | `--accent-bright-hover` | `#1987d1` | 0.4 |
| the modal's primary button hover | `#1683c4` | `--accent-bright-hover` | `#1987d1` | 2.2 |
| `.twm-bar-windows__item:hover` | `#268bd2` | `--accent-bright-hover` | `#1987d1` | 1.3 |
| `.twm-bar-windows__item:active` | `#1a6aa5` | `--accent-pressed` | `#0f6ba8` | 0.6 |
| the plot series and plot config checkboxes (`accent-color`), the plot config select's focus border | `#268bd2` | `color-mix(in srgb, var(--accent-bright) 87%, white)` | `#218bd3` | 0.3 |
| the plot window toolbar's active button, the computing spinner | `#4a90d9` | `color-mix(in srgb, var(--accent-bright) 80%, white)` | `#3395d6` | 2.1 |
| the active button's tint and hover tint, the plot table's hovered row | `rgba(74, 144, 217, 0.15 \| 0.25 \| 0.1)` | that 80% mix at the same alpha | | 0.6, 0.9, 0.5 |
| the selected tile's border and title, the tile header buttons' and tile menu's hover icons, the action dropdown's icons | `#78b9ff` | `--accent-lighter` | `#73b6e3` | 4.1 |
| the selected tile's ring and header tint | `rgba(120, 185, 255, 0.3 \| 0.1)` | `--accent-lighter` at the same alpha | | 1.6, 0.6 |
| the action dropdown's hovered or focused icon | `#9ecfff` | `--accent-lightest` | `#a3cfed` | 2.6 |
| the notebook autocomplete's focused border | `#79b8f8` | `--accent-lighter` | `#73b6e3` | 3.2 |
| `.twm-row-cursor`, the focused landing pane's head, `.twm-action-btn:hover` | `rgba(17, 119, 179, 0.12 \| 0.10 \| 0.08)` | `--accent-hover` at the same alpha | | 0.2, 0.2, 0.2 |
| `.twm-snap-preview` | `rgba(23, 119, 179, 0.18)` | `--accent-hover` at 18% | | 0.2 |
| the flow lanes' wire, `--twm-lanes-wire` | `#5b9bd5` | `--accent-light` | `#4da2db` | 2.0 |
| the flow lanes' ring, `--twm-lanes-ring` | `#1683c4` | `--accent-bright-hover` | `#1987d1` | 2.2 |
| the flow lanes' pressed show button | `#0f6fa8` | `--accent-pressed` | `#0f6ba8` | 1.2 |
| the selected card's glow, a new or changed cell and column | `rgba(22, 131, 196, 0.8 \| 0.07 \| 0.14)` | `--twm-lanes-ring` at the same alpha | | 1.7, 0.3, 0.4 |
| a new or changed column's type | `#9fd0f0` | `--accent-lightest` | `#a3cfed` | 0.6 |

The largest shift is the selected tile's light blue: `#78b9ff` is bluer
than any mix of `#007acc` with white, and `--accent-lighter` is the nearest.
`--twm-lanes-wire` and `--twm-lanes-ring` are set on `.twm-flow-lanes` and
read `--accent-light` and `--accent-bright-hover`, so they follow the accent
set on `:root` and can still be set per lanes view.

Still literals, because they are not the accent: the colours listed in the
(0.17.10) section above, the charts' series palette (`#268bd2` first in
`COLOR_PALETTE`, `#1f77b4` as the colour pickers' default), and the Monaco
editor theme's selection colours, which Monaco takes as hex values and not
as CSS.
