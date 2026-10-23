# Settings page

> **Package:** `@flexdesk/widgets` (the store is in `@flexdesk/core`) · [All docs](../README.md)

`SettingsView` draws a settings store's schema as a page: a category list, a filter, and the settings themselves. `SettingsCategories` draws the sidebar parts for a view somewhere else, such as an app's left navigation. Where the settings are *saved* is a separate choice, covered under [storage keys](../concepts/domain-neutrality.md#storage-keys-and-names-are-yours-0170).

## A settings page: `SettingsView` (0.17.0)

`new SettingsView({ store, eventBus })` (in `@flexdesk/widgets`) draws a
settings store's schema as a page. `store` is a `createSettingsStore()` handle
or the app-global binding's own, `getSettingsStore()` from `@flexdesk/core`
(its `set` is the one `setSetting` calls); `eventBus` is the bus that store
emits on (`registerSettingsEventBus(bus)` for the binding).

```js
import { getSettingsStore, registerSettingsEventBus } from '@flexdesk/core';
import { SettingsView, settingsViewContent } from '@flexdesk/widgets';

registerSettingsEventBus(bus);
const view = new SettingsView({ store: getSettingsStore(), eventBus: bus });
view.mount(host);
view.selectCategory('window');
view.setQuery('shadow');        // what the filter box does
await view.resetAll();           // asks first; true when it reset
view.dispose();

// or as tile content (props.category picks the category shown first):
createShell({ content: { settings: settingsViewContent({ store: getSettingsStore(), eventBus: bus }) } });
```

The sidebar holds a filter box, every category in `CategoryDef.order` and
*Reset all*. Beside it the chosen category's settings are listed under its
title, description and *Reset category*, grouped by `SettingDef.group` in
schema order. A row shows the label, a *Modified* marker while the value
differs from its default, the description, the path, its control and a reset
button. Text in the filter searches every category's labels, descriptions and
paths; the matches are listed under "Category › Group", and choosing a
category clears it.

| `type` | Control |
| --- | --- |
| `boolean` | a `ToggleField` |
| `select` | a select over `options`; a value the options lack (stored, or set elsewhere while the view is open) is kept and shown as *value (not found)* |
| `number` | a number box with `min`, `max` and `step`; a written value is always in the range and on the step grid (`min + k·step`, or `k·step` with no `min`): snapped to the nearest grid point, and one outside the range moved inward to the nearest grid point inside it (with `max` below `min` the range holds none, and the value is `min`); with no `step` it is only clamped; an empty or unreadable box goes back to the value |
| `text` | a text box, written `textDebounceMs` (default `SETTINGS_TEXT_DEBOUNCE_MS`, 300) after the last keystroke, or at once on Enter or blur; emptied, it writes `null` when the default is `null` |
| `colorList` | a `ColorListField`, written on each committed edit while every row holds a colour |

A type it does not know shows the value as text, read only.

The view is live both ways: a control writes with `store.set`, and the view
listens for `settings:<path>:changed` on every schema path, `settings:changed`
with a null path (the resets) and `settings:registered`, which the store now
emits from `extend()` / `registerSettings()` with `{ paths, categories }`. So a
`setSetting` made anywhere moves the open view, and a slice registered after
mount adds its categories and rows without a remount. A row's reset button
resets that one setting; *Reset category* and *Reset all* first ask
`confirm({ title, message, confirmLabel, danger })` (default `openConfirm`) and
change nothing unless it resolves true. Every label, description, category name
and query is set as text, so markup in any of them is shown as typed.

Options: `store`, `eventBus` (both required), `confirm`, `category`,
`textDebounceMs`, `title` (the sidebar heading, and the content factory's tab
title; default "Settings"). The markup is `.twm-settings` >
`.twm-settings__sidebar` + `.twm-settings__content`, with rows
`.twm-settings__row` (`--modified`); `flexdesk.css` styles it from tokens.
`tests/settings_view.test.mjs` covers it in jsdom.

## The settings categories outside the page: `SettingsCategories` (0.17.2)

A `SettingsView` made with `sidebar: false` draws no sidebar: no heading, no
filter box, no category list and no *Reset all*, only the chosen category's
settings (or the filter's matches). `new SettingsCategories({ view })` (in
`@flexdesk/widgets`) draws those parts for that view wherever it is mounted,
for example in an app's left navigator:

```js
import { SettingsView, SettingsCategories } from '@flexdesk/widgets';

const view = new SettingsView({ store, eventBus: bus, sidebar: false });
view.mount(pageHost);
const cats = new SettingsCategories({ view });
cats.mount(navigatorHost);

const off = view.subscribe(({ category, query }) => { /* e.g. a tab title */ });
// …
off();
cats.dispose();
view.dispose();
```

It keeps no state of its own. Typing in its filter box is `view.setQuery()`,
clicking a category is `view.selectCategory()` and its *Reset all* is
`view.resetAll()`, which asks the view's `confirm` first and changes nothing
unless it resolves true. It redraws from the view whenever the view's category,
filter or registered categories change, so the two agree whichever side moved
them: `view.selectCategory('window')` marks that category in the list, and
`view.setQuery('shadow')` puts the text in its filter box. As in the view's own
sidebar, choosing a category clears the filter, and no category is marked while
the filter is in effect. Its clicks and keystrokes act once the view is mounted.

Two methods on `SettingsView` serve it and anything else that follows the view:
`subscribe(fn)` calls `fn({ category, query })` after each such change and
answers the unsubscribe; `isFiltering()` is true while the filter's trimmed
text is not empty. `settingsViewContent({ …, sidebar: false })` passes the
option through. A view made without `sidebar` (or with `sidebar: true`) draws
exactly as in 0.17.1.

The markup is `.twm-settings-categories` > `.twm-settings__search`,
`.twm-settings__nav` (`button.twm-settings__cat`, `--active`) and
`.twm-settings__reset-all`, the same parts and classes as the sidebar's;
`flexdesk.css` styles it, leaving its width and padding to the host.
`tests/settings_view.test.mjs` §11–§14 cover it.
