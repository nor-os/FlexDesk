/**
 * BUG-0032 — EVERY TARGET OF THE EXPORTS MAP IS IN THE PUBLISHED TARBALL.
 *
 * Each JavaScript entry in `exports` has an `import` condition (the bundle
 * under dist/) and a `development` condition (the source barrel at the
 * package root: `./core.js`, `./host.js`, ...). `files` published dist/ and
 * src/ but not the nine root barrels, so the installed package had no file
 * behind any `development` target. Inside this checkout every target exists,
 * which is why nothing noticed: only the tarball lacks them.
 *
 *   §1  `npm pack --dry-run` lists every target of every condition of every
 *       entry in the exports map — the tarball, not the checkout, is asked
 *   §2  each of those targets also exists on disk, so §1 is not satisfied by
 *       a stale build that npm happens to find
 *   §3  the `development` targets are what the map says they are: the root
 *       barrels, each re-exporting only files under src/ that the tarball
 *       also contains, so the barrel resolves once installed
 *   §4  `import` still wins under `--conditions=development`: an ES import of
 *       every entry resolves to its dist/ bundle, as it did before
 *
 * Against 0.17.0, §1 fails for all nine `development` targets.
 *
 * Needs `npm` on PATH (it is how the tarball's file list is computed).
 *
 *     node tests/exports_packed.test.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
}
function ok(name, cond, detail = '') {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? '\n    ' + detail : ''}`); }
}

/** Every [entry, condition, target] in the map; a bare string is condition `default`. */
function targets(entry, value, condition = 'default') {
    if (typeof value === 'string') return [[entry, condition, value]];
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([cond, v]) => targets(entry, v, cond));
    }
    return [];
}
const ALL = Object.entries(PKG.exports).flatMap(([entry, value]) => targets(entry, value));
const strip = (t) => t.replace(/^\.\//, '');

// ── the tarball's file list ──────────────────────────────────────────────
const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'],
                       { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
if (pack.error || pack.status !== 0) {
    console.error(`  FAIL npm pack --dry-run did not run: ${pack.error?.message ?? pack.stderr}`);
    console.log('exports packed: 1 FAILURE(S)');
    process.exit(1);
}
const json = JSON.parse(pack.stdout.slice(pack.stdout.indexOf('[')));
const packed = new Set(json[0].files.map((f) => f.path.replace(/\\/g, '/')));
ok('npm pack lists a non-trivial tarball', packed.size > 50 && packed.has('package.json'), `${packed.size} files`);

// ── §1 every target is in the tarball ────────────────────────────────────
ok('§1 the map has development targets to check', ALL.some(([, c]) => c === 'development'));
for (const [entry, cond, target] of ALL) {
    ok(`§1 ${entry} [${cond}] -> ${target} is in the tarball`, packed.has(strip(target)));
}

// ── §2 and on disk ───────────────────────────────────────────────────────
for (const [entry, cond, target] of ALL) {
    ok(`§2 ${entry} [${cond}] -> ${target} exists`, existsSync(join(ROOT, strip(target))));
}

// ── §3 the development barrels resolve once installed ────────────────────
const JS_ENTRIES = Object.entries(PKG.exports).filter(([, v]) => v && typeof v === 'object');
check('§3 the nine JavaScript entries carry a development condition',
      JS_ENTRIES.map(([entry, v]) => [entry, v.development]),
      JS_ENTRIES.map(([entry]) => [entry, `${entry}.js`]));
for (const [entry, value] of JS_ENTRIES) {
    const barrel = strip(value.development);
    if (!existsSync(join(ROOT, barrel))) continue; // §2 has reported it
    const specs = [...readFileSync(join(ROOT, barrel), 'utf8').matchAll(/^\s*export\s[^;]*?from\s+'([^']+)';/gm)]
        .map((m) => m[1]);
    ok(`§3 ${barrel} re-exports something`, specs.length > 0);
    for (const spec of specs) {
        ok(`§3 ${barrel} imports ${spec} from src/`, spec.startsWith('./src/'));
        ok(`§3 ${barrel} -> ${spec} is in the tarball`, packed.has(strip(spec)));
    }
}

// ── §4 import still resolves to dist/ under the development condition ────
const probe = `for (const e of ${JSON.stringify(JS_ENTRIES.map(([e]) => e))}) {
    const u = import.meta.resolve(${JSON.stringify(PKG.name)} + e.slice(1));
    console.log(e + ' ' + new URL(u).pathname.split('/').slice(-2).join('/'));
}`;
const resolved = spawnSync(process.execPath, ['--conditions=development', '--input-type=module', '-e', probe],
                           { cwd: ROOT, encoding: 'utf8' });
ok('§4 the resolution probe ran', resolved.status === 0, resolved.stderr);
const got = Object.fromEntries(resolved.stdout.trim().split('\n').filter(Boolean).map((l) => l.split(' ')));
for (const [entry] of JS_ENTRIES) {
    check(`§4 import ${PKG.name}${entry.slice(1)} under --conditions=development -> dist`,
          got[entry], `dist${entry.slice(1)}.js`);
}

console.log(failures === 0 ? 'exports packed: OK' : `exports packed: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
