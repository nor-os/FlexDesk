/**
 * BUG-0027 — EVERY STYLESHEET OF THE CSS CONTRACT IS REACHABLE BY SPECIFIER.
 *
 * The Styling section of the docs (docs/concepts/styling.md) names three
 * stylesheets — tokens, reset and the library — as the whole CSS contract, and
 * `files` publishes all three. The
 * `exports` map had `./css` and `./css/tokens` but no reset, and an exports
 * map closes every path it does not list, so `import 'flexdesk/css/reset'`
 * and the deep `flexdesk/dist/reset.css` both failed with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. A consumer that resolves through the package
 * (a bundler, an import-map generator, `require.resolve`) could not reach the
 * reset at all.
 *
 *   §1  `flexdesk/css/reset` resolves, under `import` and under `require`, to
 *       dist/reset.css — the file the contract documents
 *   §2  the other two contract specifiers resolve, under `import` and under
 *       `require`, to exactly the files the docs name: `flexdesk/css` to
 *       dist/flexdesk.css, `flexdesk/css/tokens` to the source css/tokens.css
 *       (not dist/ — BUG-0030 tracks that split)
 *   §3  every `./css*` export exists on disk and sits under a path `files`
 *       publishes, so no CSS specifier points at a file the tarball lacks
 *   §4  the docs' Styling table names, for every specifier, the file the
 *       exports map really resolves it to, so the docs cannot drift from it
 *
 * The package resolves itself by name (Node's self-reference), so this runs
 * against this checkout's package.json with nothing installed.
 *
 * Against 0.16.1, §1 fails (ERR_PACKAGE_PATH_NOT_EXPORTED).
 *
 *     node tests/css_exports.test.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
}
function ok(name, cond, detail = '') {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? '\n    ' + detail : ''}`); }
}

const rel = (abs) => relative(ROOT, abs).split(sep).join('/');
function viaImport(spec) {
    try { return rel(fileURLToPath(import.meta.resolve(spec))); } catch (e) { return e.code || String(e); }
}
function viaRequire(spec) {
    try { return rel(require.resolve(spec)); } catch (e) { return e.code || String(e); }
}

// ── §1 the reset ─────────────────────────────────────────────────────────
check('§1 import.meta.resolve(flexdesk/css/reset) -> dist/reset.css',
      viaImport(`${PKG.name}/css/reset`), 'dist/reset.css');
check('§1 require.resolve(flexdesk/css/reset) -> dist/reset.css',
      viaRequire(`${PKG.name}/css/reset`), 'dist/reset.css');
ok('§1 dist/reset.css exists', existsSync(join(ROOT, 'dist', 'reset.css')));

// ── §2 the rest of the contract, pinned exactly ──────────────────────────
const EXPECTED = { css: 'dist/flexdesk.css', 'css/tokens': 'css/tokens.css', 'css/reset': 'dist/reset.css' };
for (const spec of ['css', 'css/tokens']) {
    check(`§2 import.meta.resolve(flexdesk/${spec}) -> ${EXPECTED[spec]}`,
          viaImport(`${PKG.name}/${spec}`), EXPECTED[spec]);
    check(`§2 require.resolve(flexdesk/${spec}) -> ${EXPECTED[spec]}`,
          viaRequire(`${PKG.name}/${spec}`), EXPECTED[spec]);
    ok(`§2 ${EXPECTED[spec]} exists`, existsSync(join(ROOT, EXPECTED[spec])));
}

// ── §3 every CSS export target is real and published ─────────────────────
function targets(value) {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value).flatMap(targets);
    return [];
}
const published = PKG.files;
const cssExports = Object.entries(PKG.exports).filter(([key]) => key === './css' || key.startsWith('./css/'));
check('§3 the map exports the three contract stylesheets',
      cssExports.map(([key]) => key).sort(), ['./css', './css/reset', './css/tokens']);
for (const [key, value] of cssExports) {
    for (const t of targets(value)) {
        const path = t.replace(/^\.\//, '');
        ok(`§3 ${key} -> ${t} exists`, existsSync(join(ROOT, path)));
        ok(`§3 ${key} -> ${t} is under a published path`,
           published.some((f) => path === f || path.startsWith(`${f}/`)),
           `files: ${JSON.stringify(published)}`);
    }
}

// ── §4 the docs document what the map does ───────────────────────────────
const doc = readFileSync(join(ROOT, 'docs/concepts/styling.md'), 'utf8');
const styling = doc.slice(doc.indexOf('\n## Styling\n'));
const rows = [...styling.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|/gm)]
    .map(([, file, spec, target]) => ({ file, spec, target }));
check('§4 the Styling table lists the three specifiers',
      rows.map((r) => r.spec).sort(), [`${PKG.name}/css`, `${PKG.name}/css/reset`, `${PKG.name}/css/tokens`]);
for (const { spec, target } of rows) {
    check(`§4 docs: ${spec} resolves to ${target}`, viaImport(spec), target);
    check(`§4 docs: ${spec} target is the one this suite pins`,
          target, EXPECTED[spec.slice(PKG.name.length + 1)]);
}

console.log(failures === 0 ? 'css exports: OK' : `css exports: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
