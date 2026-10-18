# The Photino host: the C# side

`createPhotinoHost()` (`photino_host.js`) talks to a Photino.NET window over
`window.external.sendMessage` / `receiveMessage`. This is what the window has to
answer. One handler on the window's web messages does all of it.

## Messages

```
page → host   {"id": 7, "cap": "window", "op": "setBounds", "args": [{"x":0,"y":0,"width":1200,"height":800}]}
host → page   {"id": 7, "ok": true,  "value": null}
host → page   {"id": 8, "ok": false, "error": "unknown request window.bogus"}
host → page   {"event": "window.maximizedChanged", "value": true}
```

- Every request gets exactly one reply with the same `id`. A request that gets
  none is given up after 10 s (`timeoutMs`). `dialogs.saveFile` and
  `dialogs.openFile` are the exceptions: the page waits for them without a
  timeout, because the dialog stays open as long as the user takes. Always
  answer them.
- `ok: false` means "I can't": the adapter logs it and degrades, exactly as it
  does with pywebview. Use it for unknown ops and for failures.
- A message with no `id` and an `event` name is an event. The adapter hands it
  to the `onEvent(name, value)` option; it never answers a request.
- Anything that is not JSON, or is a reply to an id nobody waits for, is
  ignored, so the window may share the channel with other messages.

## Ops

| `cap.op` | `args` | reply `value` | Photino |
|---|---|---|---|
| `host.describe` | `[]` | `{frame: "native" \| "custom", …}` | asked once, for `chrome()` (see below) |
| `window.minimize` | `[]` | anything | `Minimized = true` |
| `window.close` | `[]` | anything | `Close()` |
| `window.isMaximized` | `[]` | `bool` | `Maximized` |
| `window.setMaximized` | `[bool]` | `bool`, the state now | `Maximized = on` |
| `window.isFullscreen` | `[]` | `bool` | `FullScreen` |
| `window.toggleFullscreen` | `[]` | `bool`, the state now | `FullScreen = !FullScreen` |
| `window.getBounds` | `[]` | `{x, y, width, height}` | `Location`, `Size` |
| `window.setBounds` | `[{x, y, width, height}]`, any of them `null` = leave alone | anything | `Location`, `Size` |
| `window.startDrag` | `[]` | anything, **after mouse-up** | custom chrome only: the OS move loop (below) |
| `window.startResize` | `[edge]`: `n` `s` `e` `w` `ne` `nw` `se` `sw` | anything, **after mouse-up** | custom chrome only: the OS size loop (below) |
| `dialogs.saveFile` | `[{data, filename, kind}]` | see below | `ShowSaveFile(...)` + write |
| `dialogs.openFile` | `[{accept, kind, encoding}]` | see below | `ShowOpenFile(...)` + read |
| `shell.openExternal` | `[url]` | `true` when opened | the OS's default browser (below) |
| `state.read` | `[key]` | the stored value, or `null` | a file per key |
| `state.write` | `[key, value]` | `true` | a file per key |

## Native or custom chrome

A FlexDesk app runs in one of three ways, and the page needs no switch for it:

| | title bar and borders | `chrome()` | FlexDesk draws |
|---|---|---|---|
| a browser tab | the browser's | (no Photino host) | nothing |
| a Photino window, native frame | the OS's | `'native'` | nothing |
| a Photino window, custom frame | none: the page's top bar | `'custom'` | buttons, resize handles, drag |

`window.chrome()` asks the native side once, with `host.describe`, the first
time it's called (that is `WindowChromeController.initialize()`). It resolves
`'custom'` when the reply's `frame` is `"custom"`, and `'native'` for anything
else: no `frame` field, an `ok: false`, no answer within 3 s. An app that knows
already can say so: `createPhotinoHost({ chrome: 'custom' })` or `'native'`
answers without asking.

**What the native side does for a custom frame (Windows).** Don't use
Photino's `SetChromeless(true)`: that makes a bare popup window, with no
snapping, no Win+arrows, no shadow and square corners, and Photino then reports
it as fullscreen. Keep the normal window and stop drawing its frame:

1. After the window exists, add `WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX |
   WS_MAXIMIZEBOX | WS_SYSMENU` to its style, and subclass it
   (`SetWindowSubclass`). These styles are what make Windows treat it as a
   normal window: Aero Snap, Win+arrows, the shadow, the rounded corners on
   Windows 11.
2. In the subclass, answer `WM_NCCALCSIZE` (with `wParam` true) with `0`, so
   the whole window is client area and nothing of the frame is drawn. While
   maximised (`IsZoomed`), set the proposed rect to the monitor's work area
   first: a maximised window is larger than the monitor by the frame's
   thickness, and the taskbar must stay visible.
3. Answer `WM_NCACTIVATE` with `DefSubclassProc(h, msg, wParam, -1)`, so
   Windows repaints no caption on activation.
4. `DwmExtendFrameIntoClientArea` with a top margin of 1 keeps DWM drawing
   the shadow. `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND` asks for the
   rounded corners.
5. Call `SetWindowPos(..., SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE |
   SWP_NOZORDER)` to apply it.

The WebView covers the whole window, so the window never sees the mouse. That
is what `startDrag` and `startResize` are for. The page asks when the mouse
goes down on its top bar or on a resize handle. On the window's thread, call
`ReleaseCapture()`, then `SendMessage(hwnd, WM_NCLBUTTONDOWN, hit, cursor)`
with `HTCAPTION` for a drag, or `HTTOP` / `HTBOTTOM` / `HTLEFT` / `HTRIGHT` /
`HTTOPLEFT` / … for the edge. Windows then runs its own move or size loop,
exactly as for a click on a real caption or border, and `SendMessage` returns
when the mouse is released. Reply then. The page waits without a timeout, and a
reply of `ok: false` makes it move or resize the window from JS instead.

`describe`'s reply says `frame: "custom"` only when all of this was done. A
Photino window on Linux or macOS keeps its native frame and says `"native"`, or
leaves `frame` out.

**`dialogs.saveFile`.** `kind` is the file type the caller is saving, `'csv'`
or `'png'` today. `data` is the file's text for `csv` and the file's bytes,
base64, for `png` (decode it before writing). Show a save dialog suggesting
`filename`, write the file, and reply with one of:

```
{"ok": true,  "path": "C:\\Users\\me\\Documents\\rows.csv"}      saved
{"ok": false, "cancelled": true}                                the user cancelled: nothing is said
{"ok": false, "error": "Access to the path is denied."}        shown to the user
```

as the reply's `value` (the envelope's own `ok` stays `true`). A reply with the
envelope's `ok: false`, or none at all, makes `saveFile` resolve `null`, and the
caller downloads the file the browser way instead.

**`dialogs.openFile`** (0.17.0, optional). `accept` is a list of extensions or
MIME types to filter by (`[".json"]`, may be empty), `kind` a label for the
filter or `null`, and `encoding` `"text"` or `"base64"`. Show an open dialog,
read the chosen file, and reply with one of:

```
{"ok": true,  "name": "model.json", "path": "C:\\Users\\me\\model.json", "text": "{...}"}   encoding "text": UTF-8
{"ok": true,  "name": "pic.png",    "path": "C:\\Users\\me\\pic.png",    "data": "iVBO..."}  encoding "base64": the bytes
{"ok": false, "cancelled": true}
{"ok": false, "error": "The file is in use."}
```

as the reply's `value`. A reply with the envelope's `ok: false` (an older
native side without the op) makes `openFile` resolve `null`, and `pickFile()`
opens the browser's file chooser instead.

**`state`.** `value` is any JSON value; store it and give it back unchanged. A
string value that holds JSON is parsed on the way back, for hosts that store
the text.

## A dispatcher

```csharp
window.RegisterWebMessageReceivedHandler((sender, message) =>
{
    var w = (PhotinoWindow)sender!;
    using var doc = JsonDocument.Parse(message);
    var req = doc.RootElement;
    if (!req.TryGetProperty("id", out var id)) return;
    var args = req.GetProperty("args");
    string reply;
    try
    {
        object? value = (req.GetProperty("cap").GetString(), req.GetProperty("op").GetString()) switch
        {
            ("window", "isMaximized") => w.Maximized,
            ("window", "setMaximized") => w.Maximized = args[0].GetBoolean(),
            ("window", "getBounds") => new { x = w.Left, y = w.Top, width = w.Width, height = w.Height },
            // ... the rest of the table
            var (c, o) => throw new InvalidOperationException($"unknown request {c}.{o}"),
        };
        reply = JsonSerializer.Serialize(new { id = JsonSerializer.Deserialize<object>(id.GetRawText()), ok = true, value });
    }
    catch (Exception ex)
    {
        reply = JsonSerializer.Serialize(new { id = JsonSerializer.Deserialize<object>(id.GetRawText()), ok = false, error = ex.Message });
    }
    w.SendWebMessage(reply);
});
```

The handler runs on the window's thread; a save dialog shown from it is modal to
the window, which is what you want.

## Opening links in the system browser

`shell.openExternal` takes one absolute URL and opens it with the OS's default
handler: `Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })`
on Windows, `xdg-open` on Linux, `open` on macOS. Answer `true` once it has
been handed over.

**Refuse anything but `http:`, `https:` and `mailto:`** with `ok: false`. The
URL comes from page content (a link in a record somebody else wrote), and a
`file:` path or a custom protocol handed to the shell runs whatever the OS
associates with it. Refused, the page falls back to `window.open`, which is
no worse than a native side that doesn't have the op.

The page side is `routeExternalLinks({ host })` (`external_links.js`). It
sends external link clicks and `window.open` calls here; without a `shell`
capability it changes nothing.
