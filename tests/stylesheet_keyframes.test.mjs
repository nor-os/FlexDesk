/**
 * BUG-0047 — EVERY ANIMATION A STYLESHEET NAMES IS AN @keyframes IT DEFINES.
 *
 * `animation: twm-tile-loading-spin 0.7s linear infinite` and
 * `animation: data-table__spin 0.7s linear infinite` named animations that no
 * stylesheet in FlexDesk defined, and neither did the computing-status and
 * run-progress spinners' `computing-spin` and `etl-spin`. CSS does not report
 * that: an animation name with no `@keyframes` is no animation at all, so the
 * ring was drawn and never turned, and an embedder that loaded only tokens.css,
 * reset.css and flexdesk.css had four static spinners. Nothing threw, so nothing
 * but a person looking at a loading tile could see it — the same defect as
 * `windowRestore` and `notification-in` before it.
 *
 *   §1  the scanner is not vacuous: on a synthetic sheet it finds the names in
 *       the shorthand wherever they sit, in lists, in `animation-name` and
 *       inside `@media`, ignores `none`, `var()` and custom properties, and
 *       reports the one with no @keyframes
 *   §2  THE GUARD: in every sheet under css/, every animation name used has an
 *       @keyframes in the SAME sheet (base.css and overrides.css are each loaded
 *       beside a different file, flexdesk.css alone), so a new spinner cannot
 *       name a keyframes it does not ship
 *   §3  the four spinners: each rule runs its animation linear and infinite, and
 *       each keyframes turns a full 0 -> 360deg, in every sheet that has the rule
 *   §4  the four spinner classes are ones the code puts on elements, so the
 *       rules checked above are not dead
 *
 * This reads the stylesheets as text, so it needs no jsdom (jsdom runs no
 * animations); the spinner turning in a real browser was checked in headless
 * Chromium with document.getAnimations(), which is empty for an undefined name.
 * dist/ is built from css/ and is not read here; `node build.mjs --check` is
 * the gate that it is current.
 *
 *     node tests/stylesheet_keyframes.test.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { ruleBody, stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = join(HERE, '..', 'css');
const SRC_DIR = join(HERE, '..', 'src');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`); }
};
const section = (title) => console.log(`\n${title}`);

// ── reading a stylesheet ────────────────────────────────────────────────────

/** Words in an `animation` value that are not the animation's name. */
const NOT_A_NAME = new Set([
    'none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer',
    'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end',
    'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse',
    'forwards', 'backwards', 'both', 'running', 'paused',
]);

/** The names of the `@keyframes` a sheet defines (the vendor spelling counts too). */
function definedKeyframes(sheet) {
    const text = stripComments(sheet);
    return new Set([...text.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)].map((m) => m[1]));
}

/** Top-level commas only: `cubic-bezier(0.16, 1, 0.3, 1)` is one item. */
function splitList(value) {
    const out = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')') depth--;
        else if (value[i] === ',' && depth === 0) { out.push(value.slice(from, i)); from = i + 1; }
    }
    out.push(value.slice(from));
    return out;
}

/**
 * Every animation name a sheet's declarations use: the `animation` shorthand
 * (the name can sit anywhere in it, once per comma-separated item) and
 * `animation-name`. A `var()` is not resolvable from text and is skipped; a
 * custom property such as `--x-animation` is not the property.
 */
function usedAnimations(sheet) {
    const text = stripComments(sheet);
    const names = [];
    const decl = /(?<![\w-])(?:-webkit-)?(animation|animation-name)\s*:\s*([^;{}]+)/g;
    for (const [, prop, value] of text.matchAll(decl)) {
        for (const item of splitList(value)) {
            const words = item.trim().replace(/\s*!important\s*$/, '')
                // functions (cubic-bezier(), steps(), var()) are timing or unresolvable
                .replace(/[\w-]+\((?:[^()]|\([^()]*\))*\)/g, ' ')
                .split(/\s+/).filter(Boolean);
            for (const w of words) {
                if (NOT_A_NAME.has(w)) continue;
                if (/^[-+]?[\d.]+(?:m?s)?$/.test(w)) continue;    // a duration, delay or count
                if (prop === 'animation-name' || /^[A-Za-z_-][\w-]*$/.test(w)) names.push(w);
            }
        }
    }
    return names;
}

/** The text between the braces of `@keyframes <name> { … }`, or null. */
function keyframesBody(sheet, name) {
    const text = stripComments(sheet);
    const m = new RegExp(`@(?:-webkit-)?keyframes\\s+${name.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{`).exec(text);
    if (!m) return null;
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
    }
    return depth === 0 ? text.slice(start, i - 1) : null;
}

/** `{ from: 0, to: 360 }`: the degrees each end of a rotate-only keyframes sets. */
function rotation(sheet, name) {
    const body = keyframesBody(sheet, name);
    if (body === null) return null;
    const angle = (stop) => {
        const frame = new RegExp(`(?:^|[\\s}])${stop}\\s*\\{([^{}]*)\\}`).exec(body);
        const rot = frame && /transform\s*:\s*rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(frame[1]);
        return rot ? Number(rot[1]) : null;
    };
    const start = angle('(?:from|0%)');
    const end = angle('(?:to|100%)');
    return { start, end };
}

const sheets = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort()
    .map((f) => [f, readFileSync(join(CSS_DIR, f), 'utf8')]);
const sheet = Object.fromEntries(sheets);

// ── §1 the scanner ──────────────────────────────────────────────────────────
section('§1 the scanner finds what a sheet uses and defines');
{
    const synthetic = `
        /* .commented { animation: in-a-comment 1s; } */
        .a { animation: 1s ease-in missing-one, other 2s cubic-bezier(0.16, 1, 0.3, 1) infinite; }
        .b { animation-name: missing-two; }
        .c { -webkit-animation: prefixed 1s; }
        @media (prefers-reduced-motion: reduce) { .d { animation: none; } .e { animation: var(--x) 1s; } }
        .f { --x-animation: bogus; animation-duration: 1s; }
        @keyframes other { from { opacity: 0; } to { opacity: 1; } }
        @keyframes prefixed { 0% { opacity: 0; } 100% { opacity: 1; } }`;
    const used = usedAnimations(synthetic);
    check('every name used, wherever it sits in the value',
          [...new Set(used)].sort(), ['missing-one', 'missing-two', 'other', 'prefixed']);
    const defined = definedKeyframes(synthetic);
    check('every keyframes defined', [...defined].sort(), ['other', 'prefixed']);
    check('the undefined ones are reported',
          [...new Set(used.filter((n) => !defined.has(n)))].sort(), ['missing-one', 'missing-two']);
    check('rotation() reads a rotate-only keyframes',
          rotation('@keyframes t { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }', 't'),
          { start: 0, end: 360 });
}

// ── §2 the guard ────────────────────────────────────────────────────────────
section('§2 every animation a sheet uses is an @keyframes that sheet defines');
{
    for (const f of ['flexdesk.css', 'base.css', 'overrides.css']) ok(`css/${f} is among the sheets read`, f in sheet);
    for (const [file, text] of sheets) {
        const used = [...new Set(usedAnimations(text))];
        const defined = definedKeyframes(text);
        check(`${file}: no animation without @keyframes`, used.filter((n) => !defined.has(n)), []);
    }
    // A scanner that finds nothing passes everything; flexdesk.css animates a lot.
    const used = new Set(usedAnimations(sheet['flexdesk.css']));
    ok('flexdesk.css: the scan sees its animations', used.size >= 11, `saw ${[...used].join(', ')}`);
    for (const name of ['twm-tile-loading-spin', 'data-table__spin', 'computing-spin', 'etl-spin',
                        'twm-notification-in', 'windowRestore', 'spin']) {
        ok(`flexdesk.css: the scan sees ${name}`, used.has(name));
    }
}

// ── §3 the four spinners ────────────────────────────────────────────────────
section('§3 each spinner runs linear and infinite, and its keyframes turn a full circle');
{
    const SPINNERS = [
        // selector, animation, duration, the sheets that carry the rule
        ['.twm-tile-loading__spinner', 'twm-tile-loading-spin', '0.7s', ['flexdesk.css', 'overrides.css']],
        ['.twm-data-table__spinner', 'data-table__spin', '0.7s', ['flexdesk.css', 'overrides.css']],
        ['.twm-computing-status__spinner', 'computing-spin', '0.8s', ['flexdesk.css', 'base.css']],
        ['.twm-run-progress__spinner', 'etl-spin', '0.8s', ['flexdesk.css', 'base.css']],
    ];
    for (const [selector, name, duration, files] of SPINNERS) {
        for (const file of files) {
            const tag = `${file}: ${selector}`;
            const bodies = ruleBody(sheet[file], selector, { all: true });
            ok(`${tag}: has a rule`, bodies.length >= 1);
            const anim = bodies.map((b) => /animation\s*:\s*([^;]+)/.exec(b)?.[1].trim()).find(Boolean);
            check(`${tag}: animation`, anim, `${name} ${duration} linear infinite`);
            const { start, end } = rotation(sheet[file], name) || {};
            check(`${file}: ${name} starts at 0deg`, start, 0);
            check(`${file}: ${name} ends at 360deg`, end, 360);
        }
    }
}

// ── §4 the spinners are real ────────────────────────────────────────────────
section('§4 the code puts these four classes on elements');
{
    const read = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? read(p) : e.name.endsWith('.js') ? [readFileSync(p, 'utf8')] : [];
    });
    const src = read(SRC_DIR).join('\n');
    for (const cls of ['twm-tile-loading__spinner', 'twm-data-table__spinner',
                       'twm-computing-status__spinner', 'twm-run-progress__spinner']) {
        ok(`src/ creates .${cls}`, src.includes(cls));
    }
}

if (failures) {
    console.error(`\nstylesheet_keyframes: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\nstylesheet_keyframes: all passed');
process.exit(0);
