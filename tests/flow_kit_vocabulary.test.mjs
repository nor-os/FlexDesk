/**
 * THE VOCABULARY GATE (36 §1, §8) — FlexDesk "knows nothing about" its
 * consumers, and the flow work is where that would most easily stop being true.
 *
 * No file under `src/flow/` or `src/canvas/` may contain a word of the first
 * consumer's domain — `table_id`, `project_id`, `organization_id`,
 * `workflow:`, `cred://`, `${input`, `${nodes`, `RowService`, a `tbl-` class —
 * nor call `fetch`, nor touch `localStorage`, `sessionStorage` or IndexedDB:
 * the editors never fetch and never store, and every byte that leaves one
 * leaves through a callback its consumer supplied. The flow sections of the
 * stylesheet may not carry a `tbl-` class either. Comments count: a word in a
 * comment is a word in a shipped file.
 *
 *   §1  the tree as it is passes
 *   §2  THE GATE FAILS when a file under src/flow/ holds `table_id` — planted
 *       for real, then removed (a gate that has never failed is not known to
 *       work: BRIEF-flows, definition of done 3)
 *   §3  every word on the list is caught, each in a planted line
 *
 * Every agent building in src/flow/ or src/canvas/ keeps this green.
 *
 *     node tests/flow_kit_vocabulary.test.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assertions } from './flow_env.mjs';

const t = assertions('flow kit — vocabulary gate');

/** [what it is, how it is found] — the list 36 §1 names, and the I/O it forbids. */
export const BANNED = Object.freeze([
    ['table_id', /table_id/],
    ['project_id', /project_id/],
    ['organization_id', /organization_id/],
    ['workflow:', /workflow:/],
    ['cred://', /cred:\/\//],
    ['${input', /\$\{input/],
    ['${nodes', /\$\{nodes/],
    ['RowService', /RowService/],
    ['a tbl- class', /(?<![A-Za-z0-9_-])tbl-/],
    ['fetch(', /(?<![A-Za-z0-9_.$])fetch\s*\(/],
    ['localStorage', /localStorage/],
    ['sessionStorage', /sessionStorage/],
    ['IndexedDB', /indexedDB/i],
]);
const ROOTS = ['src/flow', 'src/canvas'];
const PLANT = 'src/flow/__vocabulary_plant__.js';

function files(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? files(p) : [p];
    });
}

/** Every banned word in every file under the roots, and in the flow CSS sections. */
export function scan(root) {
    const hits = [];
    for (const r of ROOTS) {
        for (const file of files(join(root, r))) {
            const lines = readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                for (const [what, re] of BANNED) {
                    if (re.test(line)) hits.push(`${relative(root, file).replace(/\\/g, '/')}:${i + 1}: ${what}`);
                }
            });
        }
    }
    for (const sheet of ['css/flexdesk.css', 'css/base.css']) {
        const text = readFileSync(join(root, sheet), 'utf8');
        const at = text.indexOf('/* ══ FLOW · KIT');
        if (at < 0) continue;
        text.slice(at).split('\n').forEach((line, i) => {
            if (BANNED[8][1].test(line)) hits.push(`${sheet}: flow section line ${i + 1}: a tbl- class`);
        });
    }
    return hits;
}

const plantPath = join(t.root, PLANT);
if (existsSync(plantPath)) unlinkSync(plantPath);        // a run that died mid-plant

t.section('§1 the tree passes');
{
    const hits = scan(t.root);
    t.check('no consumer word, no fetch, no storage under src/flow or src/canvas', hits, []);
    t.ok('the gate looked at something', files(join(t.root, 'src/flow')).length >= 15,
         `${files(join(t.root, 'src/flow')).length} files`);
}

t.section('§2 the gate fails on a planted table_id');
try {
    writeFileSync(plantPath, "export const planted = 'table_id';\n");
    const hits = scan(t.root);
    t.check('it names the file, the line and the word', hits, [`${PLANT}:1: table_id`]);
} finally {
    if (existsSync(plantPath)) unlinkSync(plantPath);
}
t.ok('and the plant is gone again', !existsSync(plantPath));

t.section('§3 every word on the list is caught');
try {
    const lines = ['a.table_id', 'project_id', 'organization_id', "'workflow:node:add'", 'cred://crm', '`${input.since}`',
                   '`${nodes.fetch}`', 'new RowService()', "el.className = 'tbl-wf-field'", 'await fetch(url)',
                   'localStorage.getItem(k)', 'sessionStorage', 'indexedDB.open()'];
    writeFileSync(plantPath, `${lines.join('\n')}\n`);
    const hits = scan(t.root).map((h) => h.split(': ').pop());
    t.check('one hit per line, each the word it is', hits, BANNED.map(([what]) => what));
    writeFileSync(plantPath, "const f = x.prefetch(a); // the editors never fetch\nclass Stbl-x {}\n");
    t.check('a method called prefetch, the word in prose and a longer name are not', scan(t.root), []);
} finally {
    if (existsSync(plantPath)) unlinkSync(plantPath);
}

t.done();
