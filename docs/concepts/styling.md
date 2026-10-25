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
(`stock` is `#569cd6` beside `#4ec9b0`, `#ce9178`, …), the notification
border `#4fc1ff`, and links (`#3794ff`).

Some accent blues in other shades are still literals, because no mix of an
accent token gives their colour exactly. They include the selected tile
(`#78b9ff`), the primary button's hover (`#1683c4`, `#1486cf`), the row
cursor and snap preview (`rgba(17, 119, 179, a)`), and some flow-lanes and
plot-window colours. To retheme them, override their rules.
