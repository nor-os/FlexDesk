# Shell and navigation

> **Package:** `@flexdesk/wm` · **Next:** [Panels and desktops](panels-and-desktops.md), [Command palette](command-palette.md), [Keys, Back and tab layout](keymap.md) · [All docs](../README.md)

`createShell` boots the tiling window manager into an element of your page: tiles that split and tab, the top navigation, dockable panels, virtual desktops and the command palette. It knows nothing about your domain. You give it a taxonomy of *kinds*, a content factory for each kind and a [host](../concepts/host-port.md), and it draws and persists the rest.

A complete first boot is in the [quickstart](../quickstart.md#hello-shell). This page covers what you can add to it: the opt-in shell features, kinds that exist only once, what happens when a link names a kind nobody registered, and what a pane can tell its own chrome.

**On this page**

- [Opt-in shell features](#opt-in-shell-features)
- [A kind that exists once: `single` (0.17.0)](#a-kind-that-exists-once-single-0170)
- [A kind that exists once per desktop: `single: 'desktop'` (0.17.17)](#a-kind-that-exists-once-per-desktop-single-desktop-01717)
- [An open single instance takes new props: `navigate(props)` (0.17.2)](#an-open-single-instance-takes-new-props-navigateprops-0172)
- [A link to a kind nobody registered (0.17.2)](#a-link-to-a-kind-nobody-registered-0172)
- [A pane that names what it shows: `ctx.setTitle` (0.12.1)](#a-pane-that-names-what-it-shows-ctxsettitle-0121)
- [Buttons that change with the pane: `ctx.setChromeActions` (0.17.0)](#buttons-that-change-with-the-pane-ctxsetchromeactions-0170)

## Opt-in shell features

These change what the user sees, so all of them are off until you ask:

```js
await createShell({
    // …everything above…
    snapPromotion: true,     // drag a floating window onto a tile: it snaps, and docks back in
    promoteInPlace: true,    // a window floated out of a tile stays inside that tile's pane
    backToOpenList: true,    // Back in a record opened beside its list closes onto that list
    floatActiveTab: true,    // floating a tile takes the tab on screen, not the whole pane
    tabLayout: 'header',     // tabs in the tile header, in place of its title, with a + (0.8.0)
    newTabButton: false,     // …and without the + (0.8.1)
    chrome: {
        topNav: document.getElementById('nav'),
        zoom:   document.getElementById('status-bar'),   // content zoom, 50–200%
    },
});
```

## A kind that exists once: `single` (0.17.0)

Some content holds heavy app-wide state and must not be mounted twice. Mark its
kind `single` in the taxonomy:

```js
createTaxonomy({
    root: 'cosmos',
    kinds: {
        cosmos:      { label: 'Cosmos', isTopNav: true },
        observatory: { label: 'Observatory', isTopNav: true, single: true },  // one, ever
        planet:      { label: 'Planet', single: 'id' },                       // one per props.id
    },
});
```

- **Every open path reveals the instance that exists** — `navigate`, the top
  nav, `openInPrimary`, `openInTab*`, `splitLeafWith`, Back. It switches to the
  desktop it is on, activates its tab (bringing back a top-nav page the tile
  had switched away from) and focuses its tile, or raises its window. Nothing
  is mounted twice, and a reveal is one `onChange` / `wm:changed`
  (`'single-reveal'`), however many steps it took.
- **A page restore never brings back a copy.** A tile's archived top-nav page
  can still list an instance that has since moved to another tile or a window;
  switching back to that page (top nav, `openInPrimary`, Back) leaves it out.
- **The copy verbs refuse.** Alt+T, Alt+N, Alt+Shift+H/V do nothing; the tile
  menu's *Open in new tab* and *Open a copy in a window* are greyed with the
  reason as their tooltip (`taxonomy.singleReason(kind)`); the palette draws its
  split and window hints greyed, and Ctrl/Shift+Enter on such a row does nothing.
- **The move verbs still work**: float, dock, drag a tab, move to a desktop.
- **A restored layout keeps the first** of any duplicates (desktop order, then
  tile order): the other leaf shows its next tab, or closes if it held nothing
  else.

The root kind cannot be `single` — every new pane, tab and desktop is seeded
with it. The taxonomy answers `isSingle(kind)`, `instanceKey(kind, props)` and
`singleReason(kind)`; the window manager answers `isSingleKind(kind)`,
`findInstance(kind, props)` and `revealInstance(kind, props)`.

## A kind that exists once per desktop: `single: 'desktop'` (0.17.17)

A virtual desktop is the tiles and panels the user arranged on it, so a page
the user opens from the top nav belongs on the desktop they are looking at,
not on another desktop that already shows it. Mark such a kind
`single: 'desktop'`: at most one instance per desktop.

```js
createTaxonomy({
    root: 'cosmos',
    kinds: {
        cosmos:  { label: 'Cosmos', isTopNav: true },
        chart:   { label: 'Star chart', isTopNav: true, single: 'desktop' },  // one per desktop
    },
});
```

- **Every open path looks only at the active desktop** — `navigate`, the top
  nav, `openInPrimary`, `openInTab*`, `splitLeafWith`, Back. When the desktop
  has the instance (in a tile, in a top-nav page a tile switched away from, or
  in a window on it) it is revealed there, as for `single: true`; when it has
  none, one is opened there. The open never switches desktop, and the
  instances on other desktops are left as they are.
- **A window is on the desktop it was opened on** or moved to. A window
  contained to a pane (`promoteInPlace`) is shown on that desktop only; a
  free-floating one (`navigate(kind, props, { dest: 'window' })`) is drawn over
  every desktop but is still the instance of the one it was opened on, never
  of another: on desktop 1, *Model* reveals desktop 1's own model even while
  desktop 2's floats in front of it.
- **The copy verbs refuse** within the desktop, as for `single: true`.
- **The move verbs refuse** to carry the kind onto a desktop that already holds
  it: *Move to desktop N* (Alt+Shift+N and the tile and window menus, whose row
  is greyed with the reason), and dropping a floating window onto another
  desktop's tile. `wm.desktopMoveRefusal({ leafId } | { windowId }, idx)`
  answers that reason, or null. Removing a desktop closes a window of it that
  holds the kind when the desktop it lands on has its own.
- **A page restore and a restored layout dedupe per desktop**: a tile's archived
  page brings its instance back unless that desktop has it live elsewhere, and
  a reload keeps the first instance on each desktop. Each desktop's instance
  survives, live or archived.

`single: true` keeps its meaning: one instance in the app, and opening it
switches to the desktop it is on. Because `'desktop'` names this mode, it is
not read as a prop name. `findInstance(kind)` answers the active desktop's
instance; the taxonomy answers `isSinglePerDesktop(kind)`, and
`instanceKey(kind, props)` is the same for every props.

## An open single instance takes new props: `navigate(props)` (0.17.2)

Revealing a `single` instance used to drop the props the open asked for: the
observatory kept showing the planet it was opened with. A content factory that
returns a `navigate(props)` hook from its mount is now handed them:

```js
content: {
    observatory: (el, props) => {
        const view = mountObservatory(el, props);
        return {
            destroy: () => view.destroy(),
            navigate: (next) => view.focusPlanet(next.planet),   // already open: go there
        };
    },
},

wm.navigate('observatory', { planet: 'mars' });   // open: revealed, then navigate({ planet: 'mars' })
```

- **Every open path that reveals the instance calls it once**, after the
  reveal, with a copy of the new props — `navigate`, the top nav,
  `openInPrimary`, `openInTab*`, `splitLeafWith`, Back. The same props twice
  are two calls; nothing is deduplicated, and no second instance is mounted.
- **The props are recorded on the instance's tab** (or its window's), so a
  top-nav page restore or a reload mounts it with the latest. The tile is not
  rebuilt by the write.
- **An open that names no props only reveals** — the top-nav button,
  `openInPrimary(kind)`, `navigate(kind)`: it asks to see the instance, not to
  empty it, so the hook is not called and the tab keeps its props.
- **A content without the hook is revealed as before**: its tab keeps its props
  and nothing is called. A hook that throws is a console warning.

## A link to a kind nobody registered (0.17.2)

`wm.navigate(kind, props, opts)` returns `true` once it has routed the
navigation. A `kind` the shell's `content` map has no factory for is refused
instead, on every destination (`main`, `origin`, a new tab, a window, a split,
the legacy `target`):

```js
if (!wm.navigate(link.kind, link.props)) {
    // nothing opened: tell the user the link is dead
}
```

- **One `console.warn` naming the kind**, per call, and `false` back.
- **Nothing changes**: no tile, tab, window or desktop, no per-tab history, no
  `onChange` — and no "no factory registered yet" placeholder tile, which is
  what such a link used to leave behind.
- **No exception reaches the caller**, whatever `kind` is (`undefined`, `null`
  and `''` included).

A shell that only navigates to kinds it registered sees no change; the return
value is new, so code that ignored it is unaffected. A split destination used
to hand back the new leaf's id; it now returns `true` like the others — call
`wm.splitLeafWith(...)` for the id. A restored layout that names an
unregistered kind still draws its placeholder: only `navigate` refuses.

## A pane that names what it shows: `ctx.setTitle` (0.12.1)

A content factory receives `(hostEl, props, ctx)`, and `ctx` carries, per pane,
`setTitle(text)`. It renames the pane's chrome title, at mount or any time
after, and the title survives repaints — including a panel's, whose tree title
the shell resets to Navigator / Inspector / Console on every layout pass:

```js
content: {
    'panel:bottom': (hostEl, props, ctx) => {
        // …a panel with tabs of its own…
        const show = (tab) => { /* swap the body */ ctx.setTitle(tab.label); };
        show(tabs[0]);
        return { destroy() {} };
    },
},
```

`setTitle(null)` or `''` gives the title back to the tree. It changes what the
chrome shows only — the tree, the tab labels and the saved layout are left
alone — and a call from content whose pane has since been rebuilt does nothing.

## A tile breadcrumb of one segment is not drawn (0.17.15)

`mountTileBreadcrumb` (and the page shell around a content, which mounts one)
draws the path to where a tile is: an optional root crumb, the top-nav page,
the trail, the entity's ancestors and the entity. When that path is a single
segment (or none), for instance a top-nav page with no root crumb, no trail and
no entity, or an `appGlobal` kind, the strip says nothing the tile's own title
bar does not already say. It is then `hidden`, and
`.twm-page-shell__breadcrumb` around it takes no room, so the tile's content
starts right under its title. `refresh()` shows the strip again as soon as the
path has two segments; a path of two or more is drawn as before. Until 0.17.14
a top-level page showed its name twice, in the title bar and in a one-segment
breadcrumb under it (STORY-0124). `renderBreadcrumb`, which draws segments a
content routes itself, is unchanged.

## A kind that lives in a window: `windowOnly` and `window` (0.17.16)

A kind can be a tool rather than a page: it opens in a managed window, never in
a tile, and it can say how big that window is.

```js
const taxonomy = createTaxonomy({
    root: 'start',
    kinds: {
        start: { label: 'Start', icon: 'apps' },
        estimation: { label: 'Parameter Estimation', icon: 'tune',
                      single: true, windowOnly: true, window: { width: 1100, height: 700 } },
    },
});
wm.navigate('estimation');   // a window, whatever `dest` says
```

- **`window: { width?, height? }`** is the initial size, in px, of a window the
  kind opens in, by `navigate(…, { dest: 'window' })` or, for a window-only
  kind, always. ManagedWindow clamps it to the screen and to its minimum
  (400 × 300), so a smaller size opens at the minimum. Without it a window
  opens at ManagedWindow's default (600 × 400).
- **`windowOnly: true`** sends every open path to a window: `navigate` with
  any `dest`, `openInPrimary`, `openInLeaf`, the tab verbs and
  `splitLeafWith`, `navigateActiveTab` (crumbs, Backspace) and
  `openInWindow`. With `single`, opening it again reveals the window that is
  open. Its window never goes into a tile: it has no *Back to tile*, its
  maximise button maximises it, and it does not snap onto a tile when dragged.
  A restored layout that still holds a tab of the kind in a tile (or archived
  under a page) drops it and warns once, naming the kinds; the rest of the
  layout stays, and the next open makes a window. An entry of it in a tab's
  back history (a layout saved before the kind was window-only) opens its
  window when Backspace reaches it. Neither the root kind nor a top-nav
  page can be window-only (`createTaxonomy` refuses).
- `taxonomy.isWindowOnly(kind)` and `taxonomy.windowSize(kind)` answer both
  (STORY-0127).

## Buttons that change with the pane: `ctx.setChromeActions` (0.17.0)

A factory may return `chromeActions` — `[{icon, title, onClick}]`, drawn in the
pane's chrome left of the split/float/close buttons — but those are read once.
`ctx.setChromeActions(specs)` replaces them at any time, the way `setTitle`
replaces the title: called during the mount it wins over the returned list, the
later call wins, the list survives repaints, `null` or `[]` clears it, and a
call from content whose pane has since been rebuilt does nothing. The content is
never re-mounted.

```js
content: {
    page: (hostEl, props, ctx) => {
        let wide = false;
        const paint = () => ctx.setChromeActions([
            { icon: wide ? 'width_normal' : 'width_wide', title: 'Page width',
              pressed: wide, onClick: () => { wide = !wide; paint(); } },
            { separator: true },
            { icon: 'add', label: 'New', title: 'Add a page', onClick: addPage },
            { icon: 'publish', title: 'Nothing to publish yet', disabled: true },
        ]);
        paint();
        return { destroy() {} };
    },
},
```

A spec may add **`label`** (text beside the glyph, or instead of it),
**`pressed`** (`aria-pressed`, plus a pressed style; leave it out for a button
that is not a toggle), **`disabled`** (greyed and inert, with its tooltip kept —
it is `aria-disabled`, not the `disabled` attribute) and **`{separator: true}`**
(a divider). A spec with none of them renders exactly as before.
