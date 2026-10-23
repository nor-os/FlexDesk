# Editor

> **Package:** `@flexdesk/editor` · **Needs:** Monaco, as a [peer dependency](../concepts/peer-dependencies.md) · [All docs](../README.md)

A Monaco-backed multi-file editor: the loader, the editor factory, the tab bar, search, a split-pane container and an undo manager. Monaco itself is not in the bundle, and its location is not guessed: call `setMonacoBasePath()` and `setDefaultLanguage()` first.

## Auto-height editors: `maxHeight` (0.17.0)

`createEditor()` sizes its container to the content (80px at least, see
`setMinHeight`). Cap it with `maxHeight`, in px; `Infinity`, the default, is
no cap. Past the cap Monaco scrolls internally and takes the mouse wheel;
below it the wheel reaches whatever scrolls around the editor.

```js
const h = factory.createEditor(el, source, { maxHeight: 400 });
h.setMaxHeight(Infinity);   // applies at once: grows to the content
```

A non-positive or non-number cap throws a `RangeError`. With `noAutoHeight`
the container's own layout decides the size and `setMaxHeight` has no effect.
Before 0.17.0 the cap was a fixed 400px, switched on by `data-code-max-height="true"`
on a `.notebook-editor-container` ancestor; that attribute is no longer read.
