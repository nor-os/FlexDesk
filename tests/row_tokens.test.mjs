/**
 * 0.5.0 — THE ROW-GEOMETRY TOKENS: one row height for every DataTable,
 * whatever its density.
 *
 * DataTable has two densities with fixed paddings — normal (`--space-sm` by
 * 8px, an inherited line height: 27px at 12px in headless Edge) and compact
 * (2px by 6px, 1.35: 21.19px). With the three tokens set to the compact values,
 * both measured 21.19px there. A consumer that wanted every table at one height (*"100% must
 * mean one thing"*) overrode both cell rules with a selector heavy enough to
 * win. Three tokens now do it from the outside:
 *
 *     --twm-dt-cell-pad-block   --twm-dt-cell-pad-inline   --twm-dt-cell-line-height
 *
 * They are UNSET by default, and every rule that reads one falls back to
 * exactly the value it had in 0.4 — so a consumer that sets none of them gets
 * 0.4's tables to the pixel. jsdom resolves no `var()`, so this suite holds the
 * stylesheet text; the heights themselves were measured in headless Edge.
 *
 *   §0  tokens.css does not DEFINE them (a default there would replace both
 *       densities' values with one) — it documents them
 *   §1  the normal cell rules read the padding tokens over their 0.4 values,
 *       in both copies of the rule, in both sheets
 *   §2  the compact cell rule reads all three over ITS 0.4 values
 *   §3  normal's line height is a ZERO-specificity rule with no fallback:
 *       unset, it computes to inheritance, exactly what no declaration gives,
 *       and any consumer rule still beats it
 *   §4  no cell rule is left with a bare 0.4 padding the tokens cannot reach
 *
 * Against 0.4.7, every section but §0's first half fails.
 *
 *     node tests/row_tokens.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ruleBody, stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = (n) => readFileSync(resolve(HERE, '../css', n), 'utf8');

let failures = 0;
const ok = (name, cond) => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}`); }
};

const NORMAL_PAD = 'padding: var(--twm-dt-cell-pad-block, var(--space-sm)) var(--twm-dt-cell-pad-inline, 8px);';
const COMPACT_PAD = 'padding: var(--twm-dt-cell-pad-block, 2px) var(--twm-dt-cell-pad-inline, 6px);';
const COMPACT_LINE = 'line-height: var(--twm-dt-cell-line-height, 1.35);';
const has = (body, decl) => !!body && body.replace(/\s+/g, ' ').includes(decl);

console.log('\n§0 tokens.css documents them and does not define them');
{
    const tokens = stripComments(css('tokens.css'));
    ok('no declaration of any of the three', !/--twm-dt-cell-[\w-]+\s*:/.test(tokens));
    ok('…and they are documented there', /--twm-dt-cell-line-height/.test(css('tokens.css')));
}

console.log('\n§1 the normal cell rules read the padding tokens over the 0.4 padding');
for (const sheet of ['base.css', 'flexdesk.css']) {
    const a = ruleBody(css(sheet), '.twm-preview-table th,\n.twm-preview-table td');
    const b = ruleBody(css(sheet), '.twm-preview-table th, .twm-preview-table td');
    ok(`${sheet}: the first copy of the rule`, has(a, NORMAL_PAD));
    ok(`${sheet}: the second copy`, has(b, NORMAL_PAD));
}

console.log('\n§2 the compact cell rule reads all three over the 0.4 compact values');
for (const sheet of ['overrides.css', 'flexdesk.css']) {
    const c = ruleBody(css(sheet), '.twm-data-table-component--compact .twm-preview-table th,\n.twm-data-table-component--compact .twm-preview-table td');
    ok(`${sheet}: padding`, has(c, COMPACT_PAD));
    ok(`${sheet}: line height`, has(c, COMPACT_LINE));
}

console.log('\n§3 normal\'s line height: zero specificity, no fallback');
for (const sheet of ['base.css', 'flexdesk.css']) {
    const w = ruleBody(css(sheet), ':where(.twm-preview-table) :where(th, td)');
    ok(`${sheet}: the :where() rule reads the token with NO fallback`,
       has(w, 'line-height: var(--twm-dt-cell-line-height);'));
}

console.log('\n§4 no table cell rule keeps a padding the tokens cannot reach');
for (const sheet of ['base.css', 'flexdesk.css', 'overrides.css']) {
    const text = stripComments(css(sheet));
    const bare = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const sel = m[1].replace(/\s+/g, ' ').trim();
        // The two density rules and nothing scoped to another component.
        const isCellRule = sel === '.twm-preview-table th, .twm-preview-table td'
            || sel === '.twm-data-table-component--compact .twm-preview-table th, .twm-data-table-component--compact .twm-preview-table td';
        if (isCellRule && /padding:(?!\s*var\(--twm-dt)/.test(m[2])) bare.push(sel);
    }
    ok(`${sheet}: every density's cell padding goes through the tokens`, bare.length === 0);
}

if (failures) {
    console.error(`\nrow tokens: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
