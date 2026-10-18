/**
 * A TOOLTIP ON A `twm-has-tooltip` ELEMENT SHOWS (BUG-0001). The service builds
 * `.twm-latex-tooltip` at `opacity: 0` and adds `visible` once it is
 * positioned. Through 0.16.1 no stylesheet said what `visible` does, so every
 * tooltip was positioned and invisible.
 *
 *   §1  hovering a `twm-has-tooltip` element builds the tooltip, with its text,
 *       and marks it `visible`; leaving it takes `visible` off again
 *   §2  both stylesheets give `.twm-latex-tooltip.visible` `opacity: 1`, and that
 *       rule outranks the `opacity: 0` of `.twm-latex-tooltip`
 *   §3  with the library sheet's tooltip rules in the document, the hovered
 *       tooltip computes to opacity 1 and the hidden one to 0 (jsdom cascades
 *       declared values)
 *
 *     node tests/tooltip_visible.test.mjs
 */
import { flowEnv } from './flow_env.mjs';
import { ruleBody, specificity, compareSpecificity, stripComments } from './css_rules.mjs';

const t = await flowEnv('tooltip — visible');
const { window: w, document } = t;

// The library sheet's tooltip rules, as written: the whole sheet makes jsdom's
// cascade take minutes per getComputedStyle, and no other rule in it names the tooltip.
const tooltipRules = [...stripComments(t.css('flexdesk.css')).matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .filter((m) => m[1].trim().startsWith('.twm-latex-tooltip'))
    .map((m) => m[0].trim());
const style = document.createElement('style');
style.textContent = tooltipRules.join('\n');
document.head.appendChild(style);

const { TooltipService } = await import('../widgets.js');

// No KaTeX here, so the service attaches its listeners on its 2 s fallback —
// the path every plain-text consumer takes.
await t.tick(2100);

const target = document.createElement('button');
target.className = 'twm-has-tooltip';
target.setAttribute('data-tooltip', 'Save&#10;Writes the layout');
document.body.appendChild(target);

const frame = () => new Promise((r) => w.requestAnimationFrame(() => r()));

t.section('§1 hover shows, leave hides');
target.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: false }));
await frame();
await frame();
const tip = document.querySelector('.twm-latex-tooltip');
t.ok('the tooltip element is built', tip);
t.check('its header is the first line', tip?.querySelector('strong')?.textContent, 'Save');
t.ok('its body carries the second line', tip?.textContent.includes('Writes the layout'));
t.ok('it is marked visible', tip?.classList.contains('visible'));

t.section('§3 computed opacity while shown');
t.check('a shown tooltip computes to opacity 1', w.getComputedStyle(tip).opacity, '1');

target.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: false }));
t.section('§1 leave');
t.ok('leaving takes visible off', !tip.classList.contains('visible'));
t.section('§3 computed opacity once hidden');
t.check('a hidden tooltip computes to opacity 0', w.getComputedStyle(tip).opacity, '0');

t.section('§2 the rule, in both stylesheets');
const opacity = (body) => (body ?? '').match(/opacity\s*:\s*([^;]+)/)?.[1].trim() ?? null;
for (const name of ['base.css', 'flexdesk.css']) {
    const sheet = t.css(name);
    t.check(`${name}: .twm-latex-tooltip is opacity 0`, opacity(ruleBody(sheet, '.twm-latex-tooltip')), '0');
    t.check(`${name}: .twm-latex-tooltip.visible is opacity 1`,
            opacity(ruleBody(sheet, '.twm-latex-tooltip.visible')), '1');
}
t.ok('.twm-latex-tooltip.visible outranks .twm-latex-tooltip',
     compareSpecificity(specificity('.twm-latex-tooltip.visible'), specificity('.twm-latex-tooltip')) > 0);

TooltipService.hide();
t.done();
process.exit(0);
