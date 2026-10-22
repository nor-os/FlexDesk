/**
 * STORY-0100 (0.17.2). A PALETTE ROW CAN BE DRAWN DISABLED, WITH A REASON.
 *
 *   §1  `enabled: () => false` → the row is listed with
 *       `twm-cmdpal__item--disabled` and aria-disabled="true", in both layouts
 *   §2  picking it — click, Enter, Ctrl/Shift+Enter — runs nothing (neither
 *       `action` nor `onPick`) and the palette stays open
 *   §3  `disabledReason` is the row's `title`; without one there is none
 *   §4  the arrows still move over the disabled row, onto the next
 *   §5  a row without `enabled` (or whose `enabled()` says yes) is drawn and
 *       picked exactly as before; `enabled()` is asked again on each pick
 *   §6  the stylesheet greys the row
 *
 *     node tests/command_palette_disabled.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    const candidates = [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ];
    for (const c of candidates) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('command palette disabled: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

import { readFileSync } from 'node:fs';

const { createCommandPalette } = await import('../src/tiling/command_palette.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.log(`  FAIL ${what}${why ? ` — ${why}` : ''}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const taxonomy = createTaxonomy({
    root: 'home',
    kinds: { home: { label: 'Home', icon: 'home', isTopNav: true, order: 0 } },
});
const catalog = createEntityCatalog({ sources: [] });
const opened = [];
const wm = {
    openInPrimary: (kind, props) => opened.push({ kind, props }),
    isPanelOpen: () => false,
    getPanelAvailability: () => ({ available: true, reason: null }),
    togglePanel: () => {},
    content: { has: () => true },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const input = () => $('.twm-cmdpal__input');
function type(text) {
    input().value = text;
    input().dispatchEvent(new window.Event('input', { bubbles: true }));
}
function key(k, mods = {}) {
    input().dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
}
const rowOf = (label) => $$('.twm-cmdpal__item').find((el) => el.querySelector('.twm-cmdpal__label')?.textContent.trim() === label);
const activeLabel = () => $('.twm-cmdpal__item--active .twm-cmdpal__label')?.textContent.trim();
const isOpen = () => !!$('.twm-cmdpal');
const order = () => $$('.twm-cmdpal__item .twm-cmdpal__label').map((l) => l.textContent.trim());
/** Walk the active row to `label` with the arrows (from the top). */
function goTo(label) {
    for (let n = 0; n < 20 && activeLabel() !== label; n++) key('ArrowDown');
    return activeLabel() === label;
}

let ran = [];
let picks = [];
let canSave = false;
const commands = () => [
    { id: 'run-a',  label: 'Run alpha', action: () => ran.push('alpha') },
    { id: 'run-b',  label: 'Run beta',  action: () => ran.push('beta'),
      enabled: () => false, disabledReason: 'Nothing to run yet' },
    { id: 'run-c',  label: 'Run gamma', action: () => ran.push('gamma') },
    { id: 'run-d',  label: 'Run delta', enabled: () => false },            // no action: onPick's
    { id: 'run-e',  label: 'Run epsilon', action: () => ran.push('epsilon'), enabled: () => canSave },
];

for (const layout of ['flat', 'grouped']) {
    const make = () => createCommandPalette({
        wm, api: null, taxonomy, catalog, layout, commands,
        onPick: (pick) => { picks.push(pick.id); return true; },
    });
    const query = layout === 'grouped' ? '>run' : 'run';

    console.log(`§1 ${layout}: a disabled row is listed, marked`);
    {
        const p = make();
        await p.open(); await tick();
        type(query);
        const b = rowOf('Run beta');
        ok('the disabled row is listed', !!b);
        ok('it carries the disabled class', b?.classList.contains('twm-cmdpal__item--disabled'));
        ok('it carries aria-disabled="true"', b?.getAttribute('aria-disabled') === 'true');
        ok('a row without `enabled` carries neither',
           !rowOf('Run alpha').classList.contains('twm-cmdpal__item--disabled')
           && !rowOf('Run alpha').hasAttribute('aria-disabled'));

        console.log(`§3 ${layout}: disabledReason is the tooltip`);
        ok('the reason is the row\'s title', b?.getAttribute('title') === 'Nothing to run yet');
        ok('no reason, no title', rowOf('Run delta') && !rowOf('Run delta').hasAttribute('title'));
        ok('an enabled row has no title', !rowOf('Run alpha').hasAttribute('title'));

        console.log(`§4 ${layout}: the arrows still move over it`);
        const rows = order();
        const at = rows.indexOf('Run beta');
        ok('the disabled row is not the last (the test needs a row after it)', at >= 0 && at < rows.length - 1, rows.join());
        ok('the arrows reach the disabled row', goTo('Run beta'), activeLabel());
        ok('the active disabled row keeps its marks',
           $('.twm-cmdpal__item--active')?.classList.contains('twm-cmdpal__item--disabled'));
        key('ArrowDown');
        ok('ArrowDown moves on past it, to the next row', activeLabel() === rows[at + 1], activeLabel());
        key('ArrowUp');
        ok('ArrowUp comes back onto it', activeLabel() === 'Run beta', activeLabel());

        console.log(`§2 ${layout}: picking it runs nothing and keeps the palette open`);
        ran = []; picks = [];
        key('Enter');
        ok('Enter: the action did not run', ran.length === 0, ran.join());
        ok('Enter: the palette is still open', isOpen());
        key('Enter', { ctrlKey: true });
        key('Enter', { shiftKey: true });
        ok('Ctrl/Shift+Enter: nothing ran, still open', ran.length === 0 && isOpen());
        rowOf('Run beta').querySelector('.twm-cmdpal__label').click();
        ok('click: the action did not run', ran.length === 0, ran.join());
        ok('click: the palette is still open', isOpen());
        rowOf('Run delta').click();
        ok('a disabled row without an action never reaches onPick', picks.length === 0, picks.join());
        ok('…and opens nothing', opened.length === 0);
        ok('…and the palette is still open', isOpen());
        p.close();
    }

    console.log(`§5 ${layout}: rows without \`enabled\` behave as before`);
    {
        ran = [];
        const p = make();
        await p.open(); await tick();
        type(query);
        goTo('Run alpha');
        key('Enter');
        ok('Enter on an enabled row runs it', ran.join() === 'alpha', ran.join());
        ok('…and closes the palette', !isOpen());

        await p.open(); await tick();
        type(query);
        rowOf('Run gamma').click();
        ok('a click on an enabled row runs it and closes', ran.join() === 'alpha,gamma' && !isOpen(), ran.join());

        canSave = false;
        await p.open(); await tick();
        type(query);
        ok('enabled() false at draw: marked', rowOf('Run epsilon').classList.contains('twm-cmdpal__item--disabled'));
        canSave = true;
        rowOf('Run epsilon').click();
        ok('enabled() is asked again at the pick: it runs once it says yes',
           ran.join() === 'alpha,gamma,epsilon' && !isOpen(), ran.join());

        await p.open(); await tick();
        type(query);
        ok('enabled() true: drawn as any other row',
           !rowOf('Run epsilon').classList.contains('twm-cmdpal__item--disabled')
           && !rowOf('Run epsilon').hasAttribute('aria-disabled'));
        p.close();
        canSave = false;
    }
}

console.log('§5 an enabled() that throws counts as disabled');
{
    ran = [];
    const warn = console.warn; console.warn = () => {};
    const p = createCommandPalette({ wm, api: null, taxonomy, catalog,
        commands: () => [{ id: 'boom', label: 'Boom', action: () => ran.push('boom'), enabled: () => { throw new Error('x'); } }] });
    await p.open(); await tick();
    type('boom');
    ok('drawn disabled', rowOf('Boom')?.classList.contains('twm-cmdpal__item--disabled'));
    key('Enter');
    ok('and not run', ran.length === 0 && isOpen());
    p.close();
    console.warn = warn;
}

console.log('§6 the stylesheet');
{
    const css = readFileSync(new URL('../css/flexdesk.css', import.meta.url), 'utf8');
    ok('`.twm-cmdpal__item--disabled` is greyed', /\.twm-cmdpal__item--disabled\s*\{[^}]*opacity:\s*0?\.\d+/.test(css));
}

if (failures) {
    console.log(`\ncommand palette disabled: ${failures} FAILED`);
    process.exit(1);
}
console.log('\ncommand palette disabled: all assertions passed');
