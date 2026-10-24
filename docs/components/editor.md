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

## Monaco's `Canceled` rejections are hidden (0.17.6)

When an editor gets focus, Monaco's word highlighter starts a 50 ms timer and
never catches its promise. Dispose the editor inside those 50 ms (re-render a
view right after focus moves back to it, as an Edit > Undo from the menu bar
does) and Monaco rejects that promise with its CancellationError, which nothing
handles. VS Code hides these with its own handler; standalone Monaco has none.

The first `initMonaco()` that starts a load now installs one window
`unhandledrejection` listener. It calls `preventDefault()` only when the
rejection's reason has `name === 'Canceled'` and `message === 'Canceled'`, which
is Monaco's CancellationError. Every other rejection still reaches the page and
its console. The listener is installed once per page, however often
`initMonaco()` is called or retried, and stays for the life of the page, as
Monaco does.

Until 0.17.6 the browser logged an uncaught `Canceled: Canceled` from
`Delayer.cancel`. The editor handle's `dispose()` caught only a `Canceled` that
Monaco's `dispose()` throws at once, not this later one.
`tests/monaco_cancellation_guard.test.mjs` holds it.
