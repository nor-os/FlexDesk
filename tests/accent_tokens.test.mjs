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
 * BUG-0045 (0.17.11) extends all three sections to the accent blues in other
 * shades that 0.17.10 left as literals: the primary buttons' hover (#1486cf,
 * #1683c4), the window bar (#268bd2, #1a6aa5), the selected tile and its
 * hover icons (#78b9ff, rgba(120, 185, 255, a)), #79b8f8, #9ecfff, #9fd0f0,
 * the row cursor, snap preview and landing pane (rgba(17|23, 119, 179, a)),
 * the plot window and spinner (#4a90d9, rgba(74, 144, 217, a)), the plot
 * checkboxes and select focus (#268bd2) and the flow lanes (#5b9bd5,
 * #1683c4, #0f6fa8, rgba(22, 131, 196, a)). §1 bans them, §2 checks the new
 * derived tokens (`--accent-bright-hover`, `--accent-pressed`,
 * `--accent-lightest`), and §3 resolves every rule that held one: with no
 * override each stays within its documented ΔE (OKLab × 100) of the old
 * colour, and with the accent tokens set to magenta each turns magenta.
 *
 * Against origin/main (0.17.9) §1, §2 and §3's magenta checks fail; against
 * 0.17.10 the BUG-0045 checks of all three fail.
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
    // BUG-0045: the accent blues in other shades.
    /#1486cf\b/i, /#1683c4\b/i, /#5b9bd5\b/i, /#0f6fa8\b/i, /#78b9ff\b/i, /#79b8f8\b/i,
    /#9ecfff\b/i, /#9fd0f0\b/i, /#4a90d9\b/i, /#268bd2\b/i, /#1a6aa5\b/i,
    /rgba?\(\s*22\s*,\s*131\s*,\s*196\b/, /rgba?\(\s*120\s*,\s*185\s*,\s*255\b/,
    /rgba?\(\s*(?:17|23)\s*,\s*119\s*,\s*179\b/, /rgba?\(\s*74\s*,\s*144\s*,\s*217\b/,
];
// Type colours, not the accent: the autocomplete's syntax palette, and the
// DataTable header icons' Solarized palette (time, stock, flow, indicator).
const NOT_ACCENT = [
    '.twm-autocomplete-field__item[data-type="stock"] .twm-autocomplete-field__icon',
    '.twm-preview-table th .twm-header-icon[title="flow"]',
];
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
    ['--accent-bright-hover', 'color-mix(in srgb, var(--accent-bright) 90%, white)'],
    ['--accent-pressed', 'color-mix(in srgb, var(--accent-hover) 90%, black)'],
    ['--accent-lightest', 'color-mix(in srgb, var(--accent-bright) 36%, white)'],
]) ok(`${name} is derived from an accent token`, token(name) === want, `got ${token(name)}`);

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

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], magenta: [255, 0, 255, 1] };
// Split at the commas outside parentheses.
function splitTop(s) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth--;
        else if (s[i] === ',' && depth === 0) { parts.push(s.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(s.slice(start).trim());
    return parts;
}
function parseColour(s) {
    s = s.trim();
    if (NAMED[s]) return NAMED[s];
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /^color-mix\((.*)\)$/.exec(s);
    if (m) {
        // CSS Color 5: srgb mixing in premultiplied alpha. Nested mixes parse
        // too (`--accent-lighter` inside a tint).
        const [space, first, second] = splitTop(m[1]);
        const pm = /^(.*\S)\s+([\d.]+)%$/.exec(first);
        if (space !== 'in srgb' || !pm || /%$/.test(second)) throw new Error(`cannot parse colour ${s}`);
        const a = parseColour(pm[1]), b = parseColour(second), p = +pm[2] / 100;
        const alpha = a[3] * p + b[3] * (1 - p);
        const ch = (i) => (alpha === 0 ? 0 : (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha);
        return [ch(0), ch(1), ch(2), alpha];
    }
    throw new Error(`cannot parse colour ${s}`);
}
const near = (x, y, tol) => x.every((v, i) => Math.abs(v - y[i]) <= (i === 3 ? 0.001 : tol));
const fmt = (c) => `rgba(${c.slice(0, 3).map((v) => v.toFixed(1)).join(', ')}, ${c[3].toFixed(3)})`;

// ΔE: Euclidean distance in OKLab, × 100. A tint is composited over
// --surface-0 (#1e1e1e) first, since that is the colour one sees.
const SURFACE = [30, 30, 30];
const over = (c) => c.slice(0, 3).map((v, i) => v * c[3] + SURFACE[i] * (1 - c[3]));
function oklab([r, g, b]) {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    [r, g, b] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const deltaE = (x, y) => {
    const a = oklab(over(x)), b = oklab(over(y));
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

// BUG-0045: every rule that held an accent blue in another shade, its old
// colour, and the largest default shift docs/concepts/styling.md (0.17.11)
// documents for it (ΔE, OKLab × 100). `scope` names the rule whose custom
// properties the value reads besides :root's.
const LANES = '.twm-flow-lanes';
const SHADES = [
    ['.twm-btn--primary:hover:not(:disabled)', 'background', '#1486cf', 0.6],
    ['.twm-btn--primary:hover:not(:disabled)', 'border-color', '#1486cf', 0.6],
    ['.twm-managed-window--modal .twm-modal__actions .twm-btn--primary:hover:not(:disabled)', 'background', '#1683c4', 2.3],
    ['.twm-managed-window--modal .twm-modal__actions .twm-btn--primary:hover:not(:disabled)', 'border-color', '#1683c4', 2.3],
    ['.twm-bar-windows__item:hover', 'background', '#268bd2', 1.3],
    ['.twm-bar-windows__item:active', 'background', '#1a6aa5', 0.7],
    ['.twm-plot-series-toggle-panel__item input[type="checkbox"]', 'accent-color', '#268bd2', 0.3],
    ['.twm-data-series-plot-config input[type="checkbox"]', 'accent-color', '#268bd2', 0.3],
    ['.twm-data-series-plot-config select:focus', 'border-color', '#268bd2', 0.3],
    ['.twm-plot-window-toolbar .twm-btn-icon.twm-is-active', 'color', '#4a90d9', 2.1],
    ['.twm-computing-status__spinner', 'border-top-color', '#4a90d9', 2.1],
    ['.twm-plot-window-toolbar .twm-btn-icon.twm-is-active', 'background', 'rgba(74, 144, 217, 0.15)', 0.6],
    ['.twm-plot-window-toolbar .twm-btn-icon.twm-is-active:hover', 'background', 'rgba(74, 144, 217, 0.25)', 0.9],
    ['.twm-plot-window-container .twm-plot-tab-content .twm-preview-table tbody tr:hover', 'background', 'rgba(74, 144, 217, 0.1)', 0.5],
    ['.tile.tile--selected', 'border-color', '#78b9ff', 4.2],
    ['.tile.tile--selected .tile-header', 'background', 'rgba(120, 185, 255, 0.1)', 1],
    ['.tile.tile--selected .tile-title', 'color', '#78b9ff', 4.2],
    ['.tile-config-btn:hover, .tile-menu-btn:hover, .tile-expand-btn:hover', 'color', '#78b9ff', 4.2],
    ['.tile-menu-item:hover .material-symbols-outlined', 'color', '#78b9ff', 4.2],
    ['.twm-action-dropdown-option .twm-option-icon', 'color', '#78b9ff', 4.2],
    ['.twm-action-dropdown-option:hover .twm-option-icon, .twm-action-dropdown-option:focus .twm-option-icon', 'color', '#9ecfff', 2.8],
    ['.twm-autocomplete-field--notebook .twm-autocomplete-field__input-wrapper:focus-within', 'border-color', '#79b8f8', 3.2],
    ['.twm-landing__pane--focused .twm-landing__pane-head', 'background', 'rgba(17, 119, 179, 0.10)', 0.3],
    ['.twm-row-cursor', 'background', 'rgba(17, 119, 179, 0.12)', 0.3],
    ['.twm-action-btn:hover', 'background', 'rgba(17, 119, 179, 0.08)', 0.3],
    ['.twm-snap-preview', 'background', 'rgba(23, 119, 179, 0.18)', 0.5],
    [LANES, '--twm-lanes-wire', '#5b9bd5', 2.1],
    [LANES, '--twm-lanes-ring', '#1683c4', 2.3],
    ['.twm-flow-lanes__show-btn[aria-pressed="true"]', 'background', '#0f6fa8', 1.2],
    ['.twm-flow-lanes__cell--new, .twm-flow-lanes__cell--changed', 'background', 'rgba(22, 131, 196, 0.07)', 0.3, LANES],
    ['.twm-flow-lanes__column--new, .twm-flow-lanes__column--changed', 'background', 'rgba(22, 131, 196, 0.14)', 0.5, LANES],
    ['.twm-flow-lanes__column--new .twm-flow-lanes__column-type, .twm-flow-lanes__column--changed .twm-flow-lanes__column-type', 'color', '#9fd0f0', 0.7],
];

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
        const declared = (selector, prop) => {
            for (const sheet of doc.styleSheets) {
                for (const r of sheet.cssRules) {
                    if (r.selectorText && r.selectorText.replace(/\s+/g, ' ') === selector) {
                        const v = r.style.getPropertyValue(prop);
                        if (v) return v.trim();
                    }
                }
            }
            return null;
        };
        const subst = (v, scope, depth = 0) => {
            if (depth > 10) throw new Error(`var() cycle in ${v}`);
            const out = v.replace(/var\((--[\w-]+)(?:\s*,\s*((?:[^()]|\([^()]*\))*))?\)/g,
                (_, n, fallback) => (scope && declared(scope, n)) || root.getPropertyValue(n).trim()
                    || (fallback || '').trim());
            return out === v ? v : subst(out, scope, depth + 1);
        };
        const rule = (selector, prop, scope) => {
            const v = declared(selector, prop);
            if (!v) throw new Error(`no ${prop} on ${selector}`);
            return { raw: v, colour: parseColour(subst(v, scope)) };
        };
        return {
            thumb: rule('.twm-slider-field__input::-webkit-slider-thumb', 'background'),
            thumbActive: rule('.twm-slider-field__input::-webkit-slider-thumb:active', 'background'),
            mozThumb: rule('.twm-slider-field__input::-moz-range-thumb', 'background'),
            rowSelected: rule('.twm-preview-table:not(.twm-preview-table--readonly) tbody tr.selected td, .twm-preview-table tbody tr.selected td', 'background'),
            cellSelected: rule('.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--selected', 'background'),
            shades: SHADES.map(([sel, prop, , , scope]) => rule(sel, prop, scope)),
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

    // ── BUG-0045: the accent blues in other shades ──────────────────────────
    SHADES.forEach(([sel, prop, old, bound], i) => {
        const got = base.shades[i].colour, want = parseColour(old);
        const d = deltaE(got, want);
        ok(`no override: ${sel} { ${prop} } stays within ${bound} ΔE of ${old} (${d.toFixed(2)})`,
           d <= bound && Math.abs(got[3] - want[3]) < 0.001, `${fmt(got)} from ${base.shades[i].raw}`);
    });
    const all = resolveIn(':root { --accent: magenta; --accent-hover: magenta; --accent-bright: magenta; }');
    SHADES.forEach(([sel, prop, old], i) => {
        const got = all.shades[i].colour;
        ok(`accent tokens magenta → ${sel} { ${prop} } is a magenta shade`,
           Math.abs(got[0] - got[2]) < 0.5 && got[0] - got[1] > 50
               && Math.abs(got[3] - parseColour(old)[3]) < 0.001, fmt(got));
    });
    ok('accent tokens magenta → the primary button hover is magenta 90% with white',
       near(all.shades[0].colour, [255, 25.5, 255, 1], 0.01), fmt(all.shades[0].colour));
    ok('accent tokens magenta → the selected tile border is magenta 55% with white',
       near(all.shades[14].colour, [255, 114.75, 255, 1], 0.01), fmt(all.shades[14].colour));
    ok('accent tokens magenta → the selected tile header is that colour at 10%',
       near(all.shades[15].colour, [255, 114.75, 255, 0.1], 0.01), fmt(all.shades[15].colour));
}

if (failures) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nall assertions passed');
