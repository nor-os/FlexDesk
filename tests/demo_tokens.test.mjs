/**
 * BUG-0028 — THE DEMO PAGES READ ONLY TOKENS THE LIBRARY DEFINES.
 *
 * `demo/index.html` styled its body and global bars from `--text-1/2/3`,
 * `--border-1`, `--space-3` and `--font-ui`. tokens.css defines none of them
 * (its names are `--text-primary/secondary/muted`, `--border-default`,
 * `--space-md`, `--font-family-sans`), so the body text came up black on
 * #1e1e1e and the bars had no borders — and a consumer copying the demo's CSS
 * copied the broken names with it. A `var(--x, fallback)` hid some of it.
 *
 * The demo is the page consumers copy from, so every custom property a demo
 * page reads must be one the library's stylesheets declare, or one the page
 * declares itself. jsdom resolves no `var()`, so this suite holds the text.
 *
 *   §1  every `var(--name)` in demo/*.html and demo/*.js is declared in
 *       css/*.css or in that same demo file
 *   §2  the tokens BUG-0028 named are the ones index.html now reads
 *
 * Against the 0.16 demo, §1 fails for index.html (six undefined names) and
 * demo.js (`--text-1`, `--text-2` in its placeholder panes), and §2 fails.
 *
 *     node tests/demo_tokens.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = resolve(HERE, '../css');
const DEMO_DIR = resolve(HERE, '../demo');

let failures = 0;
const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Every custom property a text DECLARES (`--name:`), comments out. */
const declared = (text) => new Set(
    [...stripComments(text).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
);
/** Every custom property a text READS (`var(--name`), comments out. */
const read = (text) => new Set(
    [...stripComments(text).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]),
);

const library = new Set();
for (const f of readdirSync(CSS_DIR).filter((n) => n.endsWith('.css'))) {
    for (const name of declared(readFileSync(resolve(CSS_DIR, f), 'utf8'))) library.add(name);
}
ok('the library stylesheets declare tokens at all (the scan is not broken)', library.has('--text-primary'));

console.log('\n§1 every token a demo page reads is declared');
const pages = readdirSync(DEMO_DIR).filter((n) => /\.(html|js)$/.test(n)).sort();
ok('there are demo pages to check', pages.includes('index.html'));
for (const page of pages) {
    const text = readFileSync(resolve(DEMO_DIR, page), 'utf8');
    const own = declared(text);
    const missing = [...read(text)].filter((n) => !library.has(n) && !own.has(n));
    ok(`demo/${page}`, missing.length === 0, `undefined: ${missing.join(', ')}`);
}

console.log('\n§2 index.html reads the canonical names BUG-0028 named');
{
    const uses = read(readFileSync(resolve(DEMO_DIR, 'index.html'), 'utf8'));
    for (const name of ['--text-primary', '--text-secondary', '--text-muted',
        '--border-default', '--space-md', '--font-family-sans']) {
        ok(`reads ${name}`, uses.has(name));
    }
    for (const name of ['--text-1', '--text-2', '--text-3', '--border-1', '--space-3', '--font-ui']) {
        ok(`does not read ${name}`, !uses.has(name));
    }
}

if (failures) {
    console.error(`\ndemo_tokens: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\ndemo_tokens: all passed');
