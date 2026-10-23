# Peer dependencies: Plotly and Monaco

> **Used by:** [Charts](../components/charts.md), [Editor](../components/editor.md), the chart and figure [tiles](../components/tiles.md) · [All docs](../README.md)

## Peer dependencies

`@flexdesk/charts` needs Plotly (4.4 MB). `@flexdesk/editor` needs Monaco (14 MB).
Neither is bundled, and **neither is guessed at**:

```js
import { setPlotlySource } from '@flexdesk/charts';
import { setMonacoBasePath, setDefaultLanguage } from '@flexdesk/editor';

setPlotlySource('/vendor/plotly/plotly.min.js');
setMonacoBasePath('/vendor/monaco');
setDefaultLanguage('my-dsl');              // default: 'plaintext'
```

There is deliberately **no default path**. A hardcoded `'vendor/monaco'` is one
application's directory layout, and for everyone else it is a 404 that surfaces as
an editor which silently never appears. `initMonaco()` throws instead.

`getEditorFactory()` and `initMonaco()` **reject** when no path was set, when
`vs/loader.js` fails to load, or when Monaco's AMD loader reports an error, so a
consumer can show a message instead of waiting forever. What happens next
depends on which of those it was:

- **`vs/loader.js` failed to load** (a 404, a wrong path): not sticky. Fix the
  path (`setMonacoBasePath`, or pass it to `initMonaco`) and the next call
  tries again.
- **Monaco's AMD loader reported an error** (`vs/editor/editor.main` or a
  dependency failed): **final for the page**. Monaco's loader caches the failed
  module and has no way to forget it, so every later call rejects with that
  same first error, whatever path it is given. Fix the path and reload.

Loading is shared: if you call `initMonaco(path)` yourself, `getEditorFactory()`
uses that load and needs no `setMonacoBasePath()`. `monacoReady` only ever
resolves — it is the "Monaco has arrived" signal, not the place to learn that
an attempt failed.

If you already load Plotly yourself (a `<script>` tag that sets `window.Plotly`),
the chart loader short-circuits and you can skip `setPlotlySource`.
