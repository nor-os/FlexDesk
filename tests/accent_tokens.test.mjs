/**
 * ══ EVERY ACCENT COLOUR IS DERIVED FROM AN ACCENT TOKEN (BUG-0044) ══════════
 *
 * An embedder rethemes the accent by setting FlexDesk's accent tokens
 * (`--accent`, `--accent-hover`, `--accent-bright`, `--state-selected`,
 * `--shadow-glow`) on :root. Part of the accent was written as literal colours
 * no token reaches — the SliderField thumb (#569cd6, #6eb3e9 when active),
 * about 29 `rgba(0, 122, 204, a)` tints (DataTable selection, filter chip,
 * autocomplete, tiles, the focused leaf, the doc outline, the canvas marquee,
 * the flow-graph ports), the undefined `--twm-dt-new-bg` with a literal
 * fallback, and `--state-selected` / `--shadow-glow` themselves — so they
 * stayed blue.
 *
 *   §1  the shipped dist/flexdesk.css (and its css/ sources) hold no accent
 *       literal: rgb(0, 122, 204) in any spelling, #0e639c, #1177bb, the
 *       light accent #569cd6 / rgb(86, 156, 214), #6eb3e9 — not even as a
 *       var() fallback. The one exception is the autocomplete's `stock` TYPE
 *       colour, which sits in a syntax palette beside #4ec9b0, #ce9178, … and
 *       is not the accent.
 *   §2  dist/tokens.css defines the accent literals once, on :root, and every
 *       derived token (`--state-selected`, `--shadow-glow`, `--twm-dt-new-bg`,
 *       `--accent-light`, `--accent-lighter`) reads `--accent-bright`
 *   §3  in jsdom, with tokens.css and flexdesk.css loaded: with no override
 *       the DataTable selection still resolves to rgba(0, 122, 204, 0.15) and
 *       the slider thumb to within a small distance of #569cd6; setting ONLY
 *       `--accent-bright: magenta` on :root makes both resolve to a magenta
 *       mix. jsdom applies the cascade to custom properties but resolves no
 *       var() and no color-mix(), so the test substitutes and mixes itself.
 *
 *     node tests/accent_tokens.test.mjs
 *
 * Against origin/main (0.17.9) §1, §2 and §3's magenta checks fail.
 * jsdom is borrowed from the sibling Tables checkout. Absent, §3 SKIPS loudly.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`); }
};

// ── §1 no accent literal in the library sheets ──────────────────────────────
const ACCENT_LITERALS = [
    /#007acc\b/i, /#0e639c\b/i, /#1177bb\b/i, /#569cd6\b/i, /#6eb3e9\b/i,
    /rgba?\(\s*0\s*,\s*122\s*,\s*204\b/, /rgba?\(\s*86\s*,\s*156\s*,\s*214\b/,
];
// A type colour, not the accent: the autocomplete's syntax palette.
const NOT_ACCENT = ['.twm-autocomplete-field__item[data-type="stock"] .twm-autocomplete-field__icon'];
function accentLiterals(css) {
    const found = [];
    const text = stripComments(css);
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const sel = m[1].trim().replace(/\s+/g, ' ');
        if (NOT_ACCENT.includes(sel)) continue;
        for (const decl of m[2].split(';')) {
            if (ACCENT_LITERALS.some((lit) => lit.test(decl))) found.push(`${sel} { ${decl.trim()} }`);
        }
    }
    return found;
}
for (const sheet of ['dist/flexdesk.css', 'css/flexdesk.css', 'css/base.css', 'css/overrides.css']) {
    const left = accentLiterals(read(sheet));
    ok(`${sheet}: no accent literal outside the token definitions`, left.length === 0,
       `${left.length} left, e.g.\n    ${left.slice(0, 8).join('\n    ')}`);
}
for (const sheet of ['dist/flexdesk.css', 'css/flexdesk.css', 'css/base.css']) {
    ok(`${sheet}: no var(--twm-dt-new-bg, …) fallback (the token is defined)`,
       !/var\(--twm-dt-new-bg\s*,/.test(stripComments(read(sheet))));
}

// ── §2 the tokens ───────────────────────────────────────────────────────────
const tokensText = stripComments(read('dist/tokens.css'));
ok('dist/tokens.css matches css/tokens.css', tokensText === stripComments(read('css/tokens.css')));
const token = (name) => {
    const m = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`).exec(tokensText);
    return m ? m[1].trim() : null;
};
ok('--accent-bright is the literal #007acc', token('--accent-bright') === '#007acc');
ok('--accent and --accent-hover stay literals (#0e639c, #1177bb)',
   token('--accent') === '#0e639c' && token('--accent-hover') === '#1177bb');
for (const [name, want] of [
    ['--state-selected', 'color-mix(in srgb, var(--accent-bright) 15%, transparent)'],
    ['--shadow-glow', '0 0 2px color-mix(in srgb, var(--accent-bright) 30%, transparent)'],
    ['--twm-dt-new-bg', 'color-mix(in srgb, var(--accent-bright) 22%, transparent)'],
    ['--accent-light', 'color-mix(in srgb, var(--accent-bright) 70%, white)'],
    ['--accent-lighter', 'color-mix(in srgb, var(--accent-bright) 55%, white)'],
]) ok(`${name} is derived from --accent-bright`, token(name) === want, `got ${token(name)}`);

// ── §3 resolved in jsdom ────────────────────────────────────────────────────
let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}

const NAMED = { white: [255, 255, 255, 1], transparent: [0, 0, 0, 0], magenta: [255, 0, 255, 1] };
function parseColour(s) {
    s = s.trim();
    if (NAMED[s]) return NAMED[s];
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/.exec(s);
    if (m) {
        // CSS Color 5: srgb mixing in premultiplied alpha.
        const a = parseColour(m[1]), b = parseColour(m[3]), p = +m[2] / 100;
        const alpha = a[3] * p + b[3] * (1 - p);
        const ch = (i) => (alpha === 0 ? 0 : (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha);
        return [ch(0), ch(1), ch(2), alpha];
    }
    throw new Error(`cannot parse colour ${s}`);
}
const near = (x, y, tol) => x.every((v, i) => Math.abs(v - y[i]) <= (i === 3 ? 0.001 : tol));
const fmt = (c) => `rgba(${c.slice(0, 3).map((v) => v.toFixed(1)).join(', ')}, ${c[3].toFixed(3)})`;

if (!JSDOM) {
    console.log('accent_tokens §3: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
} else {
    const resolveIn = (override) => {
        const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'http://localhost/' });
        const doc = dom.window.document;
        for (const text of [read('dist/tokens.css'), read('dist/flexdesk.css'), override]) {
            const el = doc.createElement('style');
            el.textContent = text;
            doc.head.appendChild(el);
        }
        const root = dom.window.getComputedStyle(doc.documentElement);
        const subst = (v, depth = 0) => {
            if (depth > 10) throw new Error(`var() cycle in ${v}`);
            const out = v.replace(/var\((--[\w-]+)(?:\s*,\s*((?:[^()]|\([^()]*\))*))?\)/g,
                (_, n, fallback) => root.getPropertyValue(n).trim() || (fallback || '').trim());
            return out === v ? v : subst(out, depth + 1);
        };
        const rule = (selector, prop) => {
            for (const sheet of doc.styleSheets) {
                for (const r of sheet.cssRules) {
                    if (r.selectorText && r.selectorText.replace(/\s+/g, ' ') === selector) {
                        const v = r.style.getPropertyValue(prop);
                        if (v) return { raw: v, colour: parseColour(subst(v)) };
                    }
                }
            }
            throw new Error(`no ${prop} on ${selector}`);
        };
        return {
            thumb: rule('.twm-slider-field__input::-webkit-slider-thumb', 'background'),
            thumbActive: rule('.twm-slider-field__input::-webkit-slider-thumb:active', 'background'),
            mozThumb: rule('.twm-slider-field__input::-moz-range-thumb', 'background'),
            rowSelected: rule('.twm-preview-table:not(.twm-preview-table--readonly) tbody tr.selected td, .twm-preview-table tbody tr.selected td', 'background'),
            cellSelected: rule('.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--selected', 'background'),
        };
    };

    const base = resolveIn('');
    ok('no override: a selected row is still rgba(0, 122, 204, 0.15)',
       near(base.rowSelected.colour, [0, 122, 204, 0.15], 0.01), fmt(base.rowSelected.colour));
    ok('no override: a selected cell is still rgba(0, 122, 204, 0.15)',
       near(base.cellSelected.colour, [0, 122, 204, 0.15], 0.01), fmt(base.cellSelected.colour));
    ok('no override: the slider thumb is the nearest derived colour to #569cd6 (within 10 per channel)',
       near(base.thumb.colour, [86, 156, 214, 1], 10) && near(base.mozThumb.colour, [86, 156, 214, 1], 10),
       fmt(base.thumb.colour));
    ok('no override: the active thumb is near #6eb3e9 (within 10 per channel)',
       near(base.thumbActive.colour, [110, 179, 233, 1], 10), fmt(base.thumbActive.colour));

    const pink = resolveIn(':root { --accent-bright: magenta; }');
    ok('--accent-bright: magenta → a selected row is magenta at 15%',
       near(pink.rowSelected.colour, [255, 0, 255, 0.15], 0.01), fmt(pink.rowSelected.colour));
    ok('--accent-bright: magenta → a selected cell is magenta at 15%',
       near(pink.cellSelected.colour, [255, 0, 255, 0.15], 0.01), fmt(pink.cellSelected.colour));
    ok('--accent-bright: magenta → the slider thumb is a light magenta',
       near(pink.thumb.colour, [255, 76.5, 255, 1], 0.01) && near(pink.mozThumb.colour, [255, 76.5, 255, 1], 0.01),
       fmt(pink.thumb.colour));
    ok('--accent-bright: magenta → the active thumb is a lighter magenta',
       near(pink.thumbActive.colour, [255, 114.75, 255, 1], 0.01), fmt(pink.thumbActive.colour));
}

if (failures) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nall assertions passed');
