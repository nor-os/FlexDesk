# Panels and desktops

> **Package:** `@flexdesk/wm` · **See also:** [Shell and navigation](shell.md) · [All docs](../README.md)

The shell's left, right and bottom panels, and its virtual desktops. A kind says which panels a page offers; each desktop remembers how large the user dragged them; `mountNavPanel` builds a navigation panel you can drive from code; and an app that keeps desktops of its own can mark them so the desktop bar treats them as the app's.

**On this page**

- [Panels a page does not offer (0.17.0)](#panels-a-page-does-not-offer-0170)
- [Panels keep the size you dragged them to (0.17.0)](#panels-keep-the-size-you-dragged-them-to-0170)
- [A navigation panel you drive yourself: `mountNavPanel` (0.17.0)](#a-navigation-panel-you-drive-yourself-mountnavpanel-0170)
- [Your desktops beside the app's (0.10.0)](#your-desktops-beside-the-apps-0100)
- [A page that opens on the desktop you are on (0.17.17)](#a-page-that-opens-on-the-desktop-you-are-on-01717)
- [A saved layout that cannot be read (0.17.14)](#a-saved-layout-that-cannot-be-read-01714)

## Panels a page does not offer (0.17.0)

A kind says which panels it offers while it is the primary tile. Each side is
`true`, `false` or `{ reason }`; a side it does not name is offered, and a kind
that does not name a side takes it from its top-nav kind, so one declaration on
a page covers every record opened under it:

```js
kinds: {
    paper: { label: 'Paper', isTopNav: true, panels: { bottom: { reason: 'No console here' } } },
    sheet: { label: 'Sheet', topNav: 'paper' },                        // withholds it too
    slide: { label: 'Slide', topNav: 'paper', panels: { bottom: true } }, // offers it
},
```

While a panel is withheld it is not in the layout, `wm.togglePanel(side)`
answers `false` and changes nothing (nor what is saved), `wm.isPanelOpen(side)`
is `false`, and the shell's toggle button and the palette chip carry
`aria-disabled="true"` with the reason as their tooltip (`data-tooltip` on a
`twm-has-tooltip` button, `title` otherwise; the button's own comes back after).
The desktop still remembers the panel was open, and it comes back open when the
user returns to a page that offers it. With no declarations every panel is
offered, exactly as before.

Content overrides its kind at runtime, until it clears the override with `null`:

```js
ctx.wm.setPanelAvailability('bottom', { reason: 'Run the model first' });
ctx.wm.setPanelAvailability('bottom', null);           // e.g. in destroy()
```

`wm.isPanelAvailable(side)` and `wm.getPanelAvailability(side)` (`{ available,
reason }`) read it, and a change is announced once — whatever caused it and
however many sides it moved — to `wm.onPanelAvailabilityChange(fn)` (which
returns the unsubscribe) and on the bus as `wm:panels:availability`, both with
`{ panels, changed }`. `togglePanel` now answers `true` when it flipped a panel.

`PanelStateMachine`, `PANEL_STATES` and `PANEL_TRANSITIONS` are gone from
`@flexdesk/widgets`: nothing in the library used them, and which panels a page
offers is now said once, in the taxonomy.

`tests/panel_availability.test.mjs` drives all of it against a real shell.

## Panels keep the size you dragged them to (0.17.0)

Each desktop remembers every panel's share of the window-manager area along
its axis (width for left and right, height for bottom), taken when a splitter
drag ends, and saves it with the layout as `panelShares`. A reload, a switch to
another desktop and back, and toggling one panel all rebuild the panels at
those shares, and a closed panel comes back at the size it had. Only a panel
that has never been sized on that desktop opens at the default 1:4. No split is
built tighter than a drag allows (`TileRenderer.MIN_SLOT_FRACTION` of it per
slot). A `TileRenderer` built by hand takes `onSplitResized(splitId)`, called
once when a drag that changed a split's sizes ends.

`tests/panel_sizes_kept.test.mjs` covers each of these.

## A navigation panel you drive yourself: `mountNavPanel` (0.17.0)

`mountNavPanel(hostEl, { modes })` (from `@flexdesk/wm`) builds a mode strip, a
shared filter box and one lazily-mounted pane per mode. A strip click is no
longer the only way to switch: the handle's `select(modeId)` takes the same
path — it mounts the mode on first use, runs its `activate()`, restores that
mode's filter text — and its promise resolves once `activate()` has run. An
unknown id is ignored. `active()` names the mode shown.

```js
const nav = mountNavPanel(hostEl, {
    modes: [
        { id: 'files',  icon: 'folder',   label: 'Files',  mount: mountFiles },
        { id: 'runs',   icon: 'history',  label: 'Runs',   mount: mountRuns,
          filter: false },                // a pane with controls of its own
    ],
    showModeStrip: false,   // no strip: the app switches with select()
    initialMode: 'runs',    // the mode shown at mount (default: the first)
});
await nav.select('files');  // mounted and activated
nav.active();               // 'files'
```

A mode with `filter: false` hides the filter box while it is active, and its
pane is never handed a query; the next mode with a filter shows its own saved
text again. `showFilter: false` renders no filter box at all. All three options
default to the old behaviour, so a panel built without them renders exactly as
before.

## Your desktops beside the app's (0.10.0)

Pass `chrome.desktops` and the shell paints a desktop bar: a chip per desktop
and a `+`. An app that keeps desktops of its own (one per page, say) marks them
on the desktop objects themselves:

```js
const shell = await createShell({ /* … */ eventBus,
    chrome: { desktops: barEl }, desktopBar: { switchOnAdd: true } });
shell.wm.desktops.ensureCount(pages.length);
shell.wm.desktops.desktops.slice(0, pages.length)
    .forEach((d) => { d.group = 'Workbench'; d.fixed = true; });
eventBus.emit('wm:changed', {});          // repaint the bar
```

Desktops that share a **`group`** are one chip, labelled by the group, and one
stop for Ctrl+Left/Right; the chip goes back to the member that was on screen
last (`wm.desktops.chips()` says what the bar draws). A **`fixed`** desktop is
the app's: the bar offers no rename and no delete, no menu offers it as a
*Move to desktop* target, and `removeDesktop`, `moveFocusedToDesktop` and
`moveWindowToDesktop` refuse it. Both are persisted. A desktop the user adds is
numbered among the ungrouped ones, and `desktopBar.switchOnAdd` puts it on
screen. With neither set anywhere, the bar is what it always was.

*Move to desktop* now carries every tab of the pane and adds them to the target's
main pane; it used to replace that pane with the active tab alone. A target still
holding only its seed is replaced, as before. `dispose()` removes the bar, so a
rebuilt shell paints a fresh one.

## A page that opens on the desktop you are on (0.17.17)

A desktop is the tiles and panels arranged on it. A kind marked `single: true`
exists once in the app, so opening it from another desktop switches to the
desktop that has it. A kind marked `single: 'desktop'` exists once per desktop
instead: the top-nav button, `navigate` and `openInPrimary` reveal the
instance on the active desktop, or open one there when that desktop has none,
and never switch desktop.

```js
kinds: {
    model: { label: 'Model', isTopNav: true, single: 'desktop' },
}
```

On desktop 2, clicking *Model* opens the model on desktop 2 even while
desktop 1 shows its own; clicking it again reveals desktop 2's. Each desktop's
instance is saved with its layout and restored there. The details, and what
counts as a window on a desktop, are in
[Shell and navigation](shell.md#a-kind-that-exists-once-per-desktop-single-desktop-01717).

## A saved layout that cannot be read (0.17.14)

The shell saves its layout through the host's `state` under the key `desktops`
and reads it back when it boots. That file can be truncated or edited by hand.
Text that is not JSON was always handled: the host logs `[host] bad JSON for
state key desktops` and answers `null`. A layout that is valid JSON but not a
layout (a split whose `sizes` is a number, a `null` desktop, a split with no
`children`) used to make `createShell` throw, on every start, until the file was
deleted by hand, so an app had to vet the file before booting. Others were let
through half understood: a desktop with no `tree` came back as an empty one.

Now such a layout is ignored. `createShell` resolves, the shell opens its
default layout exactly as it does when nothing was saved, and one warning names
the state key and the first thing wrong. The warning reads:

```
[wm] bad layout for state key desktops (opening the default layout): desktops[0].tree.root.children[1].sizes: expected 2 non-negative numbers, one per child, found 5
```

The warning goes to the `logger` you pass to `createShell`, else to
`console.warn`, once per start. It is a single string, like the keymap's, so it
arrives whole at any logger: a `LoggingService` (or one of its `scoped()`
loggers) records that line as the message, with the key and the cause in it.

- **All or nothing.** One bad desktop sets the whole layout aside; the shell does
  not guess which parts to keep. Nothing of the bad layout is drawn, not even
  the tiles before the damage.
- **The file is left where it is.** Deleting it would destroy the only copy of
  what the user was trying to restore. The next time the shell saves the layout
  (any change to it) that save replaces the file, and until then every start
  warns again.
- **What is unreadable** is a shape `serialize()` could not have written:
  `desktops` not a non-empty array; a desktop that is not an object, or has no
  `tree` (a `tree` of `null` is a desktop with nothing on it, and is fine); a
  `panels` or `panelShares` that is not an object; a node that is not a `leaf`
  or a `split`; a split without a `dir` of `h` or `v`, without children, or
  whose `sizes` are not one non-negative number per child; a tab without a
  string `kind`; and a leaf's `tabs`, `pageTabs` or `activeTabIdx` of the wrong
  type.
- **What still loads.** Values that are only drawn or coerced are taken as they
  are: a title (a content factory can return a number), a desktop's `label`,
  `group` and `fixed`, a panel's flag, a tab's props. A layout saved by an
  earlier release loads too: the keys that came later (`panelShares`, `group`,
  `fixed`, a leaf's `pageTabs`) may be missing, and so may a desktop's `id`,
  `label` and `panels`, and a leaf's `tabs`. Keys it does not know are ignored, a
  tab of a kind with no factory registered is the usual placeholder tile, and an
  `activeIdx` past the last desktop is clamped.

`DESKTOPS_KEY` (`'desktops'`) names the key, and `DesktopManager.deserialize`
throws the `TypeError` above for a blob that cannot be read, which is what
`wm.load()` catches; `wm.load()` itself does not throw for one.

`tests/saved_layout_unreadable.test.mjs` boots a real shell over each of 78
shapes of broken layout and over the readable ones.
