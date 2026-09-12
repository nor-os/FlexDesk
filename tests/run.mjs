/**
 * RUN EVERY SUITE UNDER `tests/`, FOUND RATHER THAN LISTED.
 *
 * The two suites this file was written for had each been added by a different
 * hand, into two different directories — `test/` and `tests/` — and neither was
 * run by anything: not `npm run build`, not `--check`, and not the downstream
 * consumer's `make test-js`, which globs only its own `web/js/**\/*.test.mjs`.
 * Both passed, and both would have gone on passing while the code beneath them
 * rotted, because nothing ever asked them.
 *
 * A hand-written list is how that happens twice, so this finds them:
 *
 *     npm test           # or, equivalently and more reliably:
 *     node tests/run.mjs
 *
 * PREFER THE SECOND FORM UNDER WSL. On a WSL checkout of a repo that lives on
 * the Windows filesystem, `npm` commonly resolves to
 * `/mnt/c/Program Files/nodejs/npm` — Windows npm, which runs Windows node
 * against a `C:\...` path and a different `node_modules`. jsdom then loads from
 * somewhere else and the DOM suites fail for reasons that have nothing to do
 * with this repository. `node` on PATH is the Linux one; run the file with it
 * directly and the suites agree with every other gate.
 *
 * Each suite is a standalone ES module that exits non-zero on failure. They run
 * in a child process each, so one suite's globals — several install a jsdom
 * `document` on `globalThis` — cannot leak into the next.
 */
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const suites = (await readdir(HERE)).filter((f) => f.endsWith('.test.mjs')).sort();

if (!suites.length) {
    console.error('FAIL: no *.test.mjs found under tests/ — the glob is broken, not the code.');
    process.exit(1);
}

let failed = 0;
for (const s of suites) {
    process.stdout.write(`\n── ${s} ${'─'.repeat(Math.max(0, 60 - s.length))}\n`);
    const r = spawnSync(process.execPath, [join(HERE, s)], { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.error(`FAIL: ${s} exited ${r.status}`); }
}

console.log(failed === 0
    ? `\nFLEXDESK TESTS: GREEN — ${suites.length} suite(s)\n`
    : `\nFLEXDESK TESTS: ${failed} of ${suites.length} suite(s) FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
