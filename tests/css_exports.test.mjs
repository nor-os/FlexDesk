/**
 * BUG-0027 — EVERY STYLESHEET OF THE CSS CONTRACT IS REACHABLE BY SPECIFIER.
 *
 * The README's Styling section names three stylesheets — tokens, reset and the
 * library — as the whole CSS contract, and `files` publishes all three. The
 * `exports` map had `./css` and `./css/tokens` but no reset, and an exports
 * map closes every path it does not list, so `import 'flexdesk/css/reset'`
 * and the deep `flexdesk/dist/reset.css` both failed with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. A consumer that resolves through the package
 * (a bundler, an import-map generator, `require.resolve`) could not reach the
 * reset at all.
 *
 *   §1  `flexdesk/css/reset` resolves, under `import` and under `require`, to
 *       dist/reset.css — the file the contract documents
 *   §2  the other two contract specifiers still resolve, to files that exist
 *   §3  every `./css*` export exists on disk and sits under a path `files`
 *       publishes, so no CSS specifier points at a file the tarball lacks
 *
 * The package resolves itself by name (Node's self-reference), so this runs
 * against this checkout's package.json with nothing installed.
 *
 * Against 0.16.0, §1 fails (ERR_PACKAGE_PATH_NOT_EXPORTED).
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

// ── §2 the rest of the contract ──────────────────────────────────────────
for (const [spec, file] of [['css', 'flexdesk.css'], ['css/tokens', 'tokens.css']]) {
    const got = viaImport(`${PKG.name}/${spec}`);
    ok(`§2 flexdesk/${spec} resolves to a ${file}`, got.endsWith(`/${file}`), `got ${got}`);
    ok(`§2 flexdesk/${spec} target exists`, existsSync(join(ROOT, got)), `got ${got}`);
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

console.log(failures === 0 ? 'css exports: OK' : `css exports: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
