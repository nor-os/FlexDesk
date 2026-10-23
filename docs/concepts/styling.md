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
