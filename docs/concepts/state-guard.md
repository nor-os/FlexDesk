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
`mode: 'strict'` with no violation. The list also carries keys that FlexDesk
itself does not write, and it has not been audited key by key
([what 0.18.0 took out and what stayed](#thirteen-application-keys-leave-the-defaults-0180)).
A key that names your application's concepts is yours to add, on top:

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

### Thirteen application keys leave the defaults (0.18.0)

**Breaking for an application that writes one of these keys under a strict
guard.** `DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys` no longer lists
thirteen keys that belonged to one embedding application, not to FlexDesk. No
FlexDesk widget writes any of them, so nothing FlexDesk draws changes; what
changes is that a write of one is now on no allow-list. Before 0.18.0 the
defaults let it through silently, for every application that used them.

| Group, as the list labelled it | Keys removed |
|---|---|
| Simulation/scenario state | `scenario-id`, `run-id`, `run-state` |
| Scenario editor | `mirror-input`, `mirror-input-bound`, `mirror-change-bound`, `override-type` |
| Calibration page | `info-for` |
| DSL generator | `dsl-state`, `dsl-section-registered`, `dsl-scrollbars-installed`, `dsl-tabs-bound`, `dsl-controls-bound` |

Those thirteen are the whole change. Every key FlexDesk writes is still
allowed, and so is every other key those groups held: the generic words
(`status`, `selected`, `active`, `disabled`, `expanded`, `collapsed`,
`visible`, `hidden`, `source`, `bound`, `field`, `key`, `column`) and the rest.

**What stays although FlexDesk does not write it.** The defaults are meant to
include every key a FlexDesk widget writes, and are not limited to them: many
listed keys are written by no widget, and the list has not been audited key by
key. Some look like one application's (`series-id`, `dataset-id`, `func-name`
and `connector-id` among them) and were not part of this change. A strict guard
built from the defaults therefore lets a write of any such key through without
a word. If your application does not write one, leave it out of the list you
pass, spelled kebab-case as the defaults spell it:

```js
const NOT_MINE = new Set(['series-id', 'dataset-id']);
const guard = new StateGuardService({ eventBus, logger, config: {
    ...DEFAULT_STATE_GUARD_CONFIG,
    mode: 'strict',
    allowedDatasetKeys: DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.filter((k) => !NOT_MINE.has(k)),
} });
```

**Who is affected.** An application whose guard takes its `allowedDatasetKeys`
from the defaults, by spreading `DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys`
or by leaving the option out, and that writes or removes one of the thirteen
keys (as `data-scenario-id`, or `dataset.scenarioId`: they are one key). In
`strict` the call throws
`StateGuard blocked setAttribute on "data-scenario-id" from …`; in the default
`warn` mode it is logged and emitted as `state-guard:violation`, on every
call. An application that passes its own complete list, or that allows the key
to one module through `allow()` or `moduleOverrides`, is not affected.

**To restore a key**, list it on top of the defaults, as for any key of your
own (the spelling does not matter: `scenarioId` and `scenario-id` are the same
key):

```js
const guard = new StateGuardService({ eventBus, logger, config: {
    ...DEFAULT_STATE_GUARD_CONFIG,
    mode: 'strict',
    allowedDatasetKeys: [...DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys, 'scenario-id', 'run-id', 'run-state'],
} });
```
