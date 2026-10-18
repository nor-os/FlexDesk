/**
 * ══ ACTIONDROPDOWN SEPARATORS ════════════════════════════════════════════════
 *
 * STORY-0049. `ActionDropdown` mapped its options one to one to buttons, so a
 * menu with two groups had no way to show where one ended. An entry
 * `{ separator: true }` now draws a divider:
 *
 *   §1  a separator between options renders as one `role="separator"` element,
 *       not a button, and takes no focus
 *   §2  ArrowDown / ArrowUp pass over it (wrapping too), clicking it reaches
 *       no `onSelect`, and the options either side still select their own
 *       entry
 *   §3  two consecutive separators render as one; a leading or a trailing one
 *       renders as none; `setOptions` collapses the same way
 *   §4  the stylesheet styles the divider (flexdesk.css and its base.css mirror)
 *
 * Against 0.16.1, §1–§3 fail (a separator became an unlabelled button that the
 * arrows landed on and that called `onSelect({separator: true})`).
 *
 *     node tests/action_dropdown_separators.test.mjs
 *
 * It imports `../src/ui/components/action_dropdown.js` DIRECTLY, never
 * `dist/`. jsdom is borrowed from the sibling Tables checkout; absent, this
 * SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

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
if (!JSDOM) {
    console.log('action dropdown separators: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

const { ActionDropdown } = await import('../src/ui/components/action_dropdown.js');
const widgets = await import('../widgets.js');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond, detail = '') => {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`); }
    else console.log(`  ok   ${name}`);
};
const section = (t) => console.log(`\n${t}`);

/** The menu's children, as `---` for a separator and the label for an option. */
const shape = (menu) => [...menu.children].map((el) => (
    el.getAttribute('role') === 'separator' ? '---'
        : el.querySelector('.twm-option-label').textContent));
const key = (k) => document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const focusedLabel = () => document.activeElement?.querySelector?.('.twm-option-label')?.textContent ?? null;

function make(options) {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const selected = [];
    const dd = new ActionDropdown({ trigger, options, onSelect: (o) => selected.push(o) });
    return { dd, trigger, selected, menu: dd.menuEl };
}

const A = { type: 'a', label: 'Alpha' };
const B = { type: 'b', label: 'Bravo' };
const C = { type: 'c', label: 'Charlie' };
const SEP = { separator: true };

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 a separator between options renders with role="separator"');
{
    const { dd, menu } = make([A, B, SEP, C]);
    check('options and one divider, in order', shape(menu), ['Alpha', 'Bravo', '---', 'Charlie']);
    const seps = menu.querySelectorAll('[role="separator"]');
    check('exactly one role="separator"', seps.length, 1);
    const sep = seps[0];
    check('it is a div, not a button', sep.tagName, 'DIV');
    ok('it wears twm-action-dropdown-separator', sep.classList.contains('twm-action-dropdown-separator'));
    ok('it is not an option', !sep.classList.contains('twm-action-dropdown-option'));
    check('it has no tabindex', sep.getAttribute('tabindex'), null);
    check('it is not a menuitem', sep.getAttribute('role'), 'separator');
    check('three option buttons', menu.querySelectorAll('button.twm-action-dropdown-option').length, 3);
    check('data-index stays the index into options',
          [...menu.querySelectorAll('.twm-action-dropdown-option')].map((b) => b.dataset.index),
          ['0', '1', '3']);
    sep.focus();
    ok('focusing it does not take focus', document.activeElement !== sep);
    dd.destroy();
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 the arrows skip it, and it never reaches onSelect');
{
    const { dd, menu, selected } = make([A, SEP, B, SEP, C]);
    dd.open();
    check('open focuses the first option', focusedLabel(), 'Alpha');
    key('ArrowDown');
    check('ArrowDown from Alpha lands on Bravo, past the divider', focusedLabel(), 'Bravo');
    key('ArrowDown');
    check('ArrowDown from Bravo lands on Charlie', focusedLabel(), 'Charlie');
    key('ArrowDown');
    check('ArrowDown wraps to Alpha', focusedLabel(), 'Alpha');
    key('ArrowUp');
    check('ArrowUp wraps to Charlie', focusedLabel(), 'Charlie');
    key('ArrowUp');
    check('ArrowUp from Charlie lands on Bravo', focusedLabel(), 'Bravo');
    key('ArrowUp');
    check('ArrowUp from Bravo lands on Alpha', focusedLabel(), 'Alpha');
    ok('no focus ever sat on a separator', document.activeElement?.getAttribute('role') !== 'separator');

    for (const sep of menu.querySelectorAll('[role="separator"]')) {
        sep.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    check('clicking a separator selects nothing', selected.length, 0);
    ok('…and leaves the menu open', dd.isOpen);

    menu.querySelectorAll('.twm-action-dropdown-option')[1]
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('the option after a separator selects its own entry', selected, [B]);
    dd.open();
    menu.querySelectorAll('.twm-action-dropdown-option')[2]
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('…and so does the last', selected, [B, C]);
    ok('no separator entry ever reached onSelect', selected.every((o) => !o.separator));
    dd.destroy();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 doubled, leading and trailing separators collapse');
{
    const { dd, menu } = make([A, SEP, SEP, B]);
    check('two consecutive separators render as one', shape(menu), ['Alpha', '---', 'Bravo']);
    dd.setOptions([SEP, A, SEP, SEP, SEP, B, SEP]);
    check('leading and trailing go, a run of three is one (setOptions)', shape(menu), ['Alpha', '---', 'Bravo']);
    dd.setOptions([SEP, SEP]);
    check('separators alone render nothing', shape(menu), []);
    dd.setOptions([A, B]);
    check('a list without separators is unchanged', shape(menu), ['Alpha', 'Bravo']);
    dd.destroy();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 the stylesheet draws the divider');
for (const file of ['flexdesk.css', 'base.css']) {
    const css = readFileSync(resolvePath(HERE, '../css', file), 'utf8');
    const rule = ruleBody(css, '.twm-action-dropdown-separator') || '';
    ok(`${file}: .twm-action-dropdown-separator has a height`, /height:\s*1px/.test(rule), `rule: ${JSON.stringify(rule)}`);
    ok(`${file}: …and a background from a token`, /background:\s*var\(--/.test(rule), `rule: ${JSON.stringify(rule)}`);
}
ok('widgets.js still exports ActionDropdown', widgets.ActionDropdown === ActionDropdown);

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
