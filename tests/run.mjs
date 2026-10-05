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
 *
 * ── A SKIPPED SUITE IS NOT A GREEN ONE ─────────────────────────────────
 *
 * The DOM suites need jsdom, which is not a FlexDesk dependency: they borrow it
 * from the sibling Tables checkout (`../Tables/web/node_modules`), and without
 * it they print `<suite>: SKIPPED — needs jsdom` and exit 0. This runner used to
 * read only the exit status, so a checkout with no Tables beside it printed
 * GREEN while the DataTable, the tab strip, the tile header and C37's mounted
 * checks had not run at all (the 0.4.7 review). It now reads each suite's
 * output too, and a line carrying `: SKIPPED` fails the run — the rule the
 * Tables gate has (`make test-js`, its BUG-0040). To accept skips on purpose:
 *
 *     node tests/run.mjs --allow-skips
 *
 * which still names every suite that skipped. A suite that skips must keep
 * printing that marker; a suite that skips SILENTLY is the defect this exists
 * to stop.
 */
import { readdir } from 'node:fs/promises';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOW_SKIPS = process.argv.includes('--allow-skips');
/** The one marker every skipping suite prints: `<suite name>: SKIPPED — <why>`. */
const SKIP_MARKER = /: SKIPPED\b/;

const suites = (await readdir(HERE)).filter((f) => f.endsWith('.test.mjs')).sort();

if (!suites.length) {
    console.error('FAIL: no *.test.mjs found under tests/ — the glob is broken, not the code.');
    process.exit(1);
}

// stdout and stderr go to ONE file, so a suite's FAIL lines (console.error)
// stay where they happened among its ok lines; it is echoed whole, then read
// for the marker.
const scratch = mkdtempSync(join(tmpdir(), 'flexdesk-tests-'));
let failed = 0;
const skipped = [];
try {
    for (const s of suites) {
        process.stdout.write(`\n── ${s} ${'─'.repeat(Math.max(0, 60 - s.length))}\n`);
        const file = join(scratch, `${s}.log`);
        const fd = openSync(file, 'w');
        let r;
        try {
            r = spawnSync(process.execPath, [join(HERE, s)], { stdio: ['inherit', fd, fd] });
        } finally {
            closeSync(fd);
        }
        const output = readFileSync(file, 'utf8');
        process.stdout.write(output);
        if (r.status !== 0) {
            failed++;
            console.error(`FAIL: ${s} exited ${r.status}${r.error ? ` (${r.error.message})` : ''}`);
        } else if (output.split('\n').some((line) => SKIP_MARKER.test(line))) {
            skipped.push(s);
            if (!ALLOW_SKIPS) console.error(`FAIL: ${s} SKIPPED — it did not run (pass --allow-skips to accept that)`);
        }
    }
} finally {
    rmSync(scratch, { recursive: true, force: true });
}

const skipFails = ALLOW_SKIPS ? 0 : skipped.length;
const skipNote = skipped.length
    ? ` (${skipped.length} SKIPPED${ALLOW_SKIPS ? ', allowed by --allow-skips' : ''}: ${skipped.join(', ')})`
    : '';
console.log(failed + skipFails === 0
    ? `\nFLEXDESK TESTS: GREEN — ${suites.length} suite(s)${skipNote}\n`
    : `\nFLEXDESK TESTS: ${failed + skipFails} of ${suites.length} suite(s) FAILED${skipNote}\n`);
process.exit(failed + skipFails === 0 ? 0 : 1);
