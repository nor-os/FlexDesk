# State guard

> **Package:** `@flexdesk/core` · [All docs](../README.md)

## The state guard: who wrote that attribute (0.17.0)

`StateGuardService` blocks (`strict`) or reports (`warn`) `data-*` writes that
are on no allow-list. A module override lets one module write a key nobody
else may:

```js
import { StateGuardService, DEFAULT_STATE_GUARD_CONFIG } from '@flexdesk/core';

const guard = new StateGuardService({ eventBus, config: { ...DEFAULT_STATE_GUARD_CONFIG, mode: 'strict' } });
guard.allow('src/app/my_widget.js', ['data-foo']);   // a literal substring of the module, or a RegExp
```

A write is attributed to the frame that made it: the URL or path of the file
that called `setAttribute`, `removeAttribute` or `dataset`, without line and
column, whatever your directory layout. A FlexDesk widget's write is the
widget's, not that of the app module that called the widget. To attribute
writes further up the stack instead, pass `moduleFramePattern`: the first
frame from the writer up whose location matches names the module, by the
pattern's first capture group if it has one.

```js
config: { ...DEFAULT_STATE_GUARD_CONFIG, moduleFramePattern: /(src\/app\/[^/]+\.js)/ }
// a write made inside @flexdesk/widgets on behalf of src/app/my_widget.js
// is now attributed to 'src/app/my_widget.js'
```

The defaults are `mode: 'warn'`, no module overrides and no frame pattern.
Before 0.17.0 the module was only found under a `js_new/` path, the defaults
carried one application's override, and the mode read one application's debug
global; choose strict mode in your own code.

### The defaults cover FlexDesk's own keys (0.17.0)

`DEFAULT_STATE_GUARD_CONFIG` includes every data key FlexDesk's own widgets
write, so the shell, dialogs, forms, tooltips, tiles and flow editors run under
`mode: 'strict'` with no violation. The list also carries some keys that
FlexDesk itself does not write. Add your application's keys on top:

```js
const guard = new StateGuardService({ eventBus, logger, config: {
    ...DEFAULT_STATE_GUARD_CONFIG,
    allowedDatasetKeys: [...DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys, 'order-id'],
} });
```

An allow-list key may be spelled either way: `orderId` and `order-id` are the
same key, in the allow-list and in module overrides
(`allow(pattern, attributes, { datasetKeys })` and `config.moduleOverrides`)
alike. camelCase maps to kebab-case as the DOM does for ordinary keys: each
capital letter becomes `-` plus its lower-case form. So `rowID` is `row-i-d`
(what `dataset.rowID` writes), not `rowid`; to allow `data-id`, list `id`.
Before 0.17.0 a camelCase entry never matched, and some entries named keys no
element carries.
