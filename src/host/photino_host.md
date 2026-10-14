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
  none is given up after 10 s (`timeoutMs`). `dialogs.saveFile` is the
  exception: the page waits for it without a timeout, because the dialog stays
  open as long as the user takes. Always answer it.
- `ok: false` means "I can't": the adapter logs it and degrades, exactly as it
  does with pywebview. Use it for unknown ops and for failures.
- A message with no `id` and an `event` name is an event. The adapter hands it
  to the `onEvent(name, value)` option; it never answers a request.
- Anything that is not JSON, or is a reply to an id nobody waits for, is
  ignored, so the window may share the channel with other messages.

## Ops

| `cap.op` | `args` | reply `value` | Photino |
|---|---|---|---|
| `window.minimize` | `[]` | anything | `Minimized = true` |
| `window.close` | `[]` | anything | `Close()` |
| `window.isMaximized` | `[]` | `bool` | `Maximized` |
| `window.setMaximized` | `[bool]` | `bool`, the state now | `Maximized = on` |
| `window.isFullscreen` | `[]` | `bool` | `FullScreen` |
| `window.toggleFullscreen` | `[]` | `bool`, the state now | `FullScreen = !FullScreen` |
| `window.getBounds` | `[]` | `{x, y, width, height}` | `Location`, `Size` |
| `window.setBounds` | `[{x, y, width, height}]`, any of them `null` = leave alone | anything | `Location`, `Size` |
| `dialogs.saveFile` | `[{data, filename, kind}]` | see below | `ShowSaveFile(...)` + write |
| `state.read` | `[key]` | the stored value, or `null` | a file per key |
| `state.write` | `[key, value]` | `true` | a file per key |

`window.chrome()` is answered by the adapter itself (`'native'`): Photino draws a
native title bar, so FlexDesk draws no buttons of its own. `startNativeDrag` is
not offered.

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
