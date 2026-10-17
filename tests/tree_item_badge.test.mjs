/**
 * BUG-0012 — A TREE ITEM'S BADGE AND STATUS DOT WEAR THEIR VARIANT, AND THE
 * LIBRARY'S OWN STYLESHEET COLOURS IT.
 *
 * `createTreeItem({badge})` emitted `tree-item__badge--<variant>` and
 * `tree-item__status-dot--<variant>` — unprefixed names no FlexDesk rule
 * styles — so with only FlexDesk's CSS a badge was uncoloured and a status dot
 * had no background at all: invisible.
 *
 *   §1  a badge with text carries `twm-tree-item__badge--<variant>`; no
 *       variant means 'muted'; nothing unprefixed is emitted
 *   §2  a badge without text is a status dot carrying
 *       `twm-tree-item__status-dot--<variant>`
 *   §3  flexdesk.css colours every documented variant ('muted', 'pass',
 *       'fail', 'error') of both, from tokens; the base dot has a background
 *       of its own, so a dot is never invisible
 *
 * jsdom applies no stylesheet, so §3 reads the rules as text.
 * Against the unfixed tree_view.js and flexdesk.css, §1–§3 fail.
 *
 *     node tests/tree_item_badge.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('tree item badge');
const { check, ok, section, done } = T;
const { createTreeItem } = await import('../src/ui/components/tree_view.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'css', 'flexdesk.css'), 'utf8');

const VARIANTS = ['muted', 'pass', 'fail', 'error'];
const unprefixed = (el) => [...el.classList].filter((c) => c.startsWith('tree-item'));

section('§1 a badge with text');
for (const variant of VARIANTS) {
    const item = createTreeItem({ id: 'a', label: 'A', badge: { text: '3', variant } });
    const badge = item.querySelector('.twm-tree-item__badge');
    ok(`${variant}: a badge`, badge);
    ok(`${variant}: twm-tree-item__badge--${variant}`,
        badge?.classList.contains(`twm-tree-item__badge--${variant}`));
    check(`${variant}: no unprefixed class`, unprefixed(badge), []);
    check(`${variant}: its text`, badge?.textContent, '3');
}
{
    const item = createTreeItem({ id: 'a', label: 'A', badge: { text: '3' } });
    ok('no variant: muted',
        item.querySelector('.twm-tree-item__badge')?.classList.contains('twm-tree-item__badge--muted'));
}

section('§2 a badge without text is a status dot');
for (const variant of VARIANTS) {
    const item = createTreeItem({ id: 'a', label: 'A', badge: { variant } });
    const dot = item.querySelector('.twm-tree-item__status-dot');
    ok(`${variant}: a dot`, dot);
    ok(`${variant}: no text badge`, !item.querySelector('.twm-tree-item__badge'));
    ok(`${variant}: twm-tree-item__status-dot--${variant}`,
        dot?.classList.contains(`twm-tree-item__status-dot--${variant}`));
    check(`${variant}: no unprefixed class`, unprefixed(dot), []);
}

section('§3 flexdesk.css colours every variant');
const declares = (selector, prop) => {
    const body = ruleBody(css, selector);
    const m = body && new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return m ? m[1].trim() : null;
};
for (const variant of VARIANTS) {
    const badgeBg = declares(`.twm-tree-item__badge--${variant}`, 'background');
    const badgeColor = declares(`.twm-tree-item__badge--${variant}`, 'color');
    const dotBg = declares(`.twm-tree-item__status-dot--${variant}`, 'background');
    ok(`badge--${variant}: a background from a token`, badgeBg?.includes('var(--'));
    ok(`badge--${variant}: a colour from a token`, badgeColor?.startsWith('var(--'));
    ok(`status-dot--${variant}: a background from a token`, dotBg?.startsWith('var(--'));
}
check('pass is the success colour', declares('.twm-tree-item__status-dot--pass', 'background'),
    'var(--color-success)');
check('fail is the danger colour', declares('.twm-tree-item__status-dot--fail', 'background'),
    'var(--color-danger)');
ok('the base dot has a background of its own',
    declares('.twm-tree-item__status-dot', 'background')?.startsWith('var(--'));
ok('no rule left for the unprefixed names',
    !/(^|[^-\w])\.tree-item__(badge|status-dot)/.test(css));

done();
