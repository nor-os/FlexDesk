# Panels and desktops

> **Package:** `@flexdesk/wm` · **See also:** [Shell and navigation](shell.md) · [All docs](../README.md)

The shell's left, right and bottom panels, and its virtual desktops. A kind says which panels a page offers; each desktop remembers how large the user dragged them; `mountNavPanel` builds a navigation panel you can drive from code; and an app that keeps desktops of its own can mark them so the desktop bar treats them as the app's.

**On this page**

- [Panels a page does not offer (0.17.0)](#panels-a-page-does-not-offer-0170)
- [Panels keep the size you dragged them to (0.17.0)](#panels-keep-the-size-you-dragged-them-to-0170)
- [A navigation panel you drive yourself: `mountNavPanel` (0.17.0)](#a-navigation-panel-you-drive-yourself-mountnavpanel-0170)
- [Your desktops beside the app's (0.10.0)](#your-desktops-beside-the-apps-0100)

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
