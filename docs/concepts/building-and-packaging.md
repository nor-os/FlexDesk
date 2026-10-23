# Build and packaging

> **Files:** `build.mjs`, `dist/`, the `exports` map in `package.json` · [All docs](../README.md)

## Build

```bash
npm install
npm run build      # -> dist/
```

`dist/` is committed. The packaging decision is *prebuilt dist*: this repo owns the
build so that a consumer with no bundler can load the library through a plain import
map. See `.gitignore` — it says so there too, because it is the kind of thing someone
"tidies up" later.

### The `development` condition resolves in the installed package (0.17.1)

Every JavaScript entry in the `exports` map has two conditions: `import`, the
prebuilt bundle under `dist/`, and `development`, the source barrel at the
package root (`core.js`, `host.js`, `wm.js`, `widgets.js`, `charts.js`,
`tiles.js`, `editor.js`, `canvas.js`, `flow.js`), which re-exports `src/`.
Up to 0.17.0 those nine barrels were missing from `files`, so the published
package did not contain them and a resolver that took the `development` branch
(`require.resolve` under `--conditions=development`, for one) got a path to
nothing. From 0.17.1 they ship, beside the `src/` they import.

Nothing about which file an `import` resolves to has changed: `import` is
listed first, so an ES import still gets `dist/`, with or without the
`development` condition.

A suite (`tests/exports_packed.test.mjs`) runs `npm pack --dry-run` and fails
if any target of any condition in the `exports` map is not in the tarball.
