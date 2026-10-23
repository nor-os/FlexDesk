# Host port

> **Package:** `@flexdesk/host` · [All docs](../README.md)

## The host port

FlexDesk never touches `pywebview`, `fetch`, `localStorage` or the filesystem. It
asks a **Host**, and you supply one. `createHost({...})` validates the capabilities
you pass and freezes the result; anything you leave out is simply absent, and the
library degrades rather than throwing.

```js
createHost({
    state:   { read, write },              // layout persistence
    dialogs: { saveFile, openFile? },      // optional — CSV export falls back to a Blob;
                                           // openFile (itself optional) to pickFile()
    window:  { minimize, maximize, ... },  // optional — no native chrome buttons without it
    gallery: { list },                     // optional (0.17.0) — mountGalleryPicker's entries
})
```

`NULL_HOST` is a valid host with nothing behind it.

Two adapters ship ready-made. `createPywebviewHost()` speaks to a pywebview
window, and `createPhotinoHost()` (0.14.0) to a Photino.NET window over
`window.external.sendMessage` / `receiveMessage`:

```js
import { createPhotinoHost } from '@flexdesk/host';

// In a browser tab this is NULL_HOST. Keep a capability of your own by passing
// it in, or leave one out with null.
const host = createPhotinoHost({ state: myServerState, onEvent: (name, value) => {} });
```

`dialogs.saveFile` falls back to a Blob download when the window refuses, and
the messages the C# side has to answer are in
[`src/host/photino_host.md`](../../src/host/photino_host.md).

**The dialogs a pywebview bridge answers.** `createPywebviewHost()` calls these
methods on `window.pywebview.api`, positionally. Each is optional: a missing
one makes its capability answer `null`, and FlexDesk degrades.

| Bridge method | Arguments | Reply | Behind |
|---|---|---|---|
| `save_file_dialog` | `(data, filename, kind)`: the file's text (`csv`) or base64 bytes (`png`), the suggested name, the type | `{ok: true, path}` \| `{ok: false, cancelled: true}` \| `{ok: false, error}` | `dialogs.saveFile` |
| `read_file_dialog` (0.17.0) | `(accept, kind, encoding)`: a list of extensions or MIME types to filter by (`['.json']`, may be empty), a label for the filter or `null`, and `'text'` or `'base64'` | `{ok: true, name, path, text}` (`'text'`, read as UTF-8) or `{ok: true, name, path, data}` (`'base64'`, the bytes) \| `{ok: false, cancelled: true}` \| `{ok: false, error}` | `dialogs.openFile` |

### Opening a file: `pickFile` (0.17.0)

```js
import { pickFile } from '@flexdesk/host';

const r = await pickFile(host, { accept: ['.json'], kind: 'json' });   // encoding: 'text' (default) or 'base64'
if (r.ok) load(JSON.parse(r.text));
else if (r.error) toast(r.error);                                     // r.cancelled: say nothing
```

`pickFile(host, {accept, kind, encoding})` takes `accept` as a list or as a
comma-separated string (`'.json,.csv'`); the host always receives the list
(`['.json', '.csv']`). It asks the host's
`dialogs.openFile` first, a new optional member of `dialogs`: a host whose
`dialogs` has only `saveFile` is still complete. Without it, or when it
answers `null` (no dialog behind it), a transient hidden
`<input type="file">` opens the browser's chooser, so the same call works in a
browser tab, under `NULL_HOST`. Either way it resolves one of

```
{ok: true, name, path?, text}      encoding 'text'
{ok: true, name, path?, data}      encoding 'base64': the file's bytes
{ok: false, cancelled: true}       the user closed the chooser
{ok: false, error}                 show it
```

`path` comes only from a native host. The pywebview adapter maps `openFile` to
`read_file_dialog(accept, kind, encoding)` (the table above); the Photino
adapter sends `dialogs.openFile`, documented in
[`photino_host.md`](../../src/host/photino_host.md). The browser chooser reports a
cancel through the input's `cancel` event, which every current engine fires.

### A window with its own chrome (0.15.0)

The same app runs three ways, and the page needs no switch for it:

| | title bar and borders | FlexDesk draws |
|---|---|---|
| a browser tab | the browser's | nothing |
| a Photino window, native frame | the OS's | nothing |
| a Photino window, custom frame | none: your top bar is the title bar | minimise / maximise / close, resize handles, drag |

```js
import { WindowChromeController } from '@flexdesk/widgets';

new WindowChromeController({
    host,                                  // createPhotinoHost(), or any Host
    topBar: '.my-top-bar',                 // drags the window (default .twm-global-top-bar)
    controls: '.my-top-bar .right',        // where the three buttons go (default: the bar's .twm-bar-right)
    noDrag: '.my-search',                  // more that never starts a drag
}).initialize();                           // resolves true only with custom chrome
```

`host.window.chrome()` decides. The Photino host asks its native side once
(`host.describe`, its `frame` field) and answers `'custom'` only when the
window was made frameless, so a browser tab and a native-frame window get no
handles, no buttons and no CSS. With custom chrome, a drag on the top bar and
a press on a resize handle go to the host's `startNativeDrag()` /
`startNativeResize(edge)`. On Windows the native side hands them to the OS,
so the window snaps, takes Win+arrows and resizes like any other.
[`photino_host.md`](../../src/host/photino_host.md) has the native half: keep the
frame styles, return the whole window from `WM_NCCALCSIZE`, start gestures with
`WM_NCLBUTTONDOWN`. Don't use Photino's `SetChromeless`, which loses all of that.

### Links out, and the browser's right-click menu (0.16.0)

In a native window a `target="_blank"` link or a `window.open()` opens nothing,
or a bare popup with no way back. Hand them to the system browser instead:

```js
import { routeExternalLinks } from '@flexdesk/host';
import { suppressNativeContextMenu } from '@flexdesk/widgets';

routeExternalLinks({ host });    // a no-op without host.shell, so call it anywhere
suppressNativeContextMenu();     // only your own menus, plus the native one in text
```

`routeExternalLinks` sends http(s) and mailto links that leave the app (a
`_blank` target, another origin, a middle click) and external `window.open`
calls to `host.shell.openExternal(url)`. That is a new optional host
capability, which `createPhotinoHost()` offers as `shell.openExternal`. If the
native side refuses, the original `window.open` runs. In a browser tab the
host has no `shell`, and nothing changes.

`suppressNativeContextMenu` prevents the browser's or webview's own menu (Back,
Reload, Print, Inspect) on any right-click that no handler claimed with
`preventDefault()`. It keeps the native menu in editable text and on selected
text, where Paste and Copy are the point, and wherever `allow(event)` says so.
Both calls return `{ dispose }`.
