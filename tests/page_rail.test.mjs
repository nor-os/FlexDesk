/**
 * THE PAGES AS A VERTICAL RAIL: `chrome.rail` and `mountPageRail`.
 *
 *   §1  the rail paints one icon item per top-nav kind: pinned kinds last, the
 *       long label as tooltip and accessible name, no top-strip classes
 *   §2  a press opens the kind; the active item follows the primary tile's page,
 *       a kind under a page lights that page, a kind under none lights nothing
 *   §3  F1..F12 press the items in drawn order, with no `navSelector`
 *   §4  a tooltip opens to the right with no attribute of the embedder's, and
 *       flips at the window's edge
 *   §5  boot errors: chrome.rail with chrome.topNav, a bad `railPin`, a bad call
 *   §6  dispose empties the element and takes the listener off; a rebuilt shell
 *       on the same element drives only itself
 *   §7  mountPageRail alone: `activeKind` and `decorate`
 *   §8  the stylesheets and tokens: the rail's look, from tokens
 *   §9  the public name is reachable through the entry and its built dist, and
 *       the rail writes only data keys the state guard's defaults allow
 *
 * jsdom computes no layout, so §8 holds the rules as text; where things land was
 * checked in a browser.
 *
 *     node tests/page_rail.test.mjs
 */
import { readFileSync } from 'node:fs';
import { flowEnv } from './flow_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await flowEnv('page rail');
const { window: w, document } = t;

const { createShell, mountPageRail } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { TooltipService } = await import('../src/ui/utils/tooltip_service.js');

const KINDS = {
    start: { label: 'Start', icon: 'apps' },
    // Declared out of order, and the pinned kinds first, on purpose.
    gear: { label: 'Gear', icon: 'settings', isTopNav: true, order: 5, railPin: 'bottom' },
    help: { label: 'Help', icon: 'help', isTopNav: true, order: 90, railPin: 'bottom' },
    log: { label: 'Ship log', shortLabel: 'LOG', icon: 'article', isTopNav: true, order: 20 },
    atlas: { label: 'Atlas', icon: 'map', isTopNav: true, order: 10 },
    chart: { label: 'Chart', icon: 'route', topNav: 'atlas' },
};

const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, (h) => { h.textContent = k; return {}; }]));

function page() {
    document.body.innerHTML = '';
    const nav = document.createElement('nav');
    const root = document.createElement('div');
    document.body.append(nav, root);
    return { nav, root };
}

const build = ({ nav, root }, extra = {}) => createShell({
    root,
    entities: createEntityCatalog({ sources: [] }),
    taxonomy: createTaxonomy({ root: 'start', kinds: KINDS }),
    content,
    panels: { left: false, right: false, bottom: false },
    chrome: { rail: nav },
    ...extra,
});

const items = (nav) => [...nav.querySelectorAll('.twm-fl-item')];
const kinds = (nav) => items(nav).map((b) => b.dataset.kind);
const lit = (nav) => items(nav).filter((b) => b.classList.contains('twm-fl-item--on')).map((b) => b.dataset.kind);
const primaryKind = (shell) => {
    const tree = shell.wm.desktops.active().tree;
    return tree.get(tree.primaryLeafId())?.content?.kind ?? null;
};
const press = (k) => {
    const e = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e;
};

t.section('§1 what it paints');
{
    const p = page();
    const shell = await build(p);
    t.ok('the element is the bar', p.nav.classList.contains('twm-fl-bar'));
    t.check('order, then the pinned kinds at the end', kinds(p.nav), ['atlas', 'log', 'gear', 'help']);
    t.check('only the pinned kinds are marked',
            items(p.nav).filter((b) => b.classList.contains('twm-fl-item--bottom')).map((b) => b.dataset.kind),
            ['gear', 'help']);
    const log = items(p.nav)[1];
    t.check('the tooltip is the long label', log.getAttribute('data-tooltip'), 'Ship log');
    t.check('so is the accessible name', log.getAttribute('aria-label'), 'Ship log');
    t.ok('it can show a tooltip', log.classList.contains('twm-has-tooltip'));
    t.check('a button that submits nothing', log.getAttribute('type'), 'button');
    const glyph = log.querySelector('.material-symbols-outlined');
    t.check('the glyph is the kind\'s icon', glyph?.textContent, 'article');
    t.check('and is hidden from a screen reader', glyph?.getAttribute('aria-hidden'), 'true');
    t.check('no visible label', log.textContent, 'article');
    t.ok('nothing of the top strip', !p.nav.querySelector('.twm-top-nav__btn') && !p.nav.classList.contains('twm-top-nav'));
    t.check('the bar gets a name', p.nav.getAttribute('aria-label'), 'Pages');
    t.ok('the shell hands the element back', shell.chrome.railEl === p.nav);
    t.check('no top-nav element', shell.chrome.topNavEl, null);
    shell.dispose();

    const q = page();
    q.nav.setAttribute('aria-label', 'Sections');
    const named = await build(q);
    t.check('the embedder\'s name is kept', q.nav.getAttribute('aria-label'), 'Sections');
    named.dispose();

    const r = page();
    const none = await build(r, { chrome: {} });
    t.check('no rail element: none reported', none.chrome.railEl, null);
    none.dispose();
}

t.section('§2 pressing and following');
{
    const p = page();
    const shell = await build(p);
    t.check('the root kind is under no page: nothing lit', lit(p.nav), []);
    items(p.nav)[1].click();
    t.check('a press opens the kind in the primary tile', primaryKind(shell), 'log');
    t.check('and lights it', lit(p.nav), ['log']);
    t.check('aria-current says so', items(p.nav)[1].getAttribute('aria-current'), 'page');
    items(p.nav)[0].querySelector('.material-symbols-outlined').click();
    t.check('a press on the glyph is a press', primaryKind(shell), 'atlas');
    t.check('the light moved', lit(p.nav), ['atlas']);
    t.ok('and aria-current with it', !items(p.nav)[1].hasAttribute('aria-current'));
    shell.wm.openInPrimary('log');
    t.check('an open from anywhere else moves it too', lit(p.nav), ['log']);
    shell.wm.openInPrimary('chart');
    t.check('a kind under a page lights the page', lit(p.nav), ['atlas']);
    p.nav.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    t.check('a press on the bar itself opens nothing', primaryKind(shell), 'chart');
    shell.dispose();
}

t.section('§3 F-keys with no navSelector');
{
    const p = page();
    const shell = await build(p);
    t.ok('F1 is taken', press('F1').defaultPrevented);
    t.check('F1 opens the first item', primaryKind(shell), 'atlas');
    press('F3');
    t.check('F3 opens the first pinned item, in drawn order', primaryKind(shell), 'gear');
    press('F4');
    t.check('F4 the second', primaryKind(shell), 'help');
    t.ok('F5 has no item, and stays the page\'s', !press('F5').defaultPrevented);

    // An fl-item that is no page is not counted.
    const stray = document.createElement('button');
    stray.className = 'twm-fl-item';
    p.nav.insertBefore(stray, p.nav.firstChild);
    press('F1');
    t.check('an item without a kind is not a page', primaryKind(shell), 'atlas');
    stray.remove();
    shell.dispose();

    const q = page();
    const custom = document.createElement('button');
    custom.className = 'mine';
    let pressed = 0;
    custom.addEventListener('click', () => { pressed++; });
    document.body.append(custom);
    const own = await build(q, { navSelector: '.mine' });
    press('F1');
    t.check('navSelector still wins', pressed, 1);
    own.dispose();
}

t.section('§4 tooltips');
{
    const p = page();
    const shell = await build(p);
    const frame = () => new Promise((r) => w.requestAnimationFrame(() => r()));
    const log = items(p.nav)[1];
    t.ok('no placement is written', !log.hasAttribute('data-tooltip-placement'));
    TooltipService.show(log);
    await frame();
    await frame();
    const tip = document.querySelector('.twm-latex-tooltip');
    t.check('it opens to the right', tip?.getAttribute('data-placement'), 'right');
    t.check('with the label', tip?.textContent, 'Ship log');
    TooltipService.hide();

    // At the window's right edge with the room on the left, it flips.
    log.getBoundingClientRect = () => ({ left: w.innerWidth - 20, right: w.innerWidth - 5, top: 0, bottom: 44, width: 15, height: 44 });
    tip.getBoundingClientRect = () => ({ left: 0, right: 60, top: 0, bottom: 20, width: 60, height: 20 });
    TooltipService.show(log);
    await frame();
    await frame();
    t.check('it flips at the edge', tip.getAttribute('data-placement'), 'left');
    TooltipService.hide();
    shell.dispose();
}

t.section('§5 boot errors');
{
    const p = page();
    const other = document.createElement('div');
    let msg = '';
    try { await build(p, { chrome: { rail: p.nav, topNav: other } }); } catch (e) { msg = e.message; }
    t.ok('chrome.rail with chrome.topNav is refused', /both paint the pages/.test(msg), msg);
    const make = (def) => () => createTaxonomy({ root: 'start', kinds: { start: { label: 'Start' }, x: def } });
    t.throws('a railPin of another value', make({ label: 'X', isTopNav: true, railPin: 'top' }), /must be 'bottom'/);
    t.throws('a railPin on a kind that is no page', make({ label: 'X', railPin: 'bottom' }), /not a top-nav kind/);
    t.throws('mountPageRail without an element', () => mountPageRail(null, { wm: {} }), /must be an element/);
    t.throws('mountPageRail without a wm', () => mountPageRail(document.createElement('nav')), /`wm` is required/);
    const entries = createTaxonomy({ root: 'start', kinds: KINDS }).topNavEntries();
    t.check('an entry carries its railPin', entries.find((e) => e.kind === 'gear').railPin, 'bottom');
    t.check('or null', entries.find((e) => e.kind === 'log').railPin, null);
}

t.section('§6 dispose and rebuild');
{
    const p = page();
    const first = await build(p);
    first.wm.openInPrimary('log');
    const before = primaryKind(first);
    first.dispose();
    t.check('the element is emptied', p.nav.children.length, 0);
    t.ok('it stays the bar', p.nav.classList.contains('twm-fl-bar'));

    p.root.replaceChildren();
    const second = await build(p);
    t.check('the next shell paints its own', kinds(p.nav), ['atlas', 'log', 'gear', 'help']);
    items(p.nav)[0].click();
    t.check('a press drives the live shell', primaryKind(second), 'atlas');
    t.check('and not the disposed one', primaryKind(first), before);
    second.dispose();
}

t.section('§7 mountPageRail alone');
{
    const p = page();
    const shell = await build(p, { chrome: {} });
    let page_ = 'help';
    const seen = [];
    const rail = mountPageRail(p.nav, {
        wm: shell.wm,
        activeKind: (wm) => { seen.push(wm === shell.wm); return page_; },
        decorate: (btn, entry) => {
            if (entry.kind === 'log') {
                btn.classList.add('mine');
                btn.dataset.tooltip = 'Shared by every crew';
            }
        },
    });
    t.ok('it returns the element', rail.el === p.nav);
    t.check('nothing is lit before the first sync', lit(p.nav), []);
    rail.sync();
    t.check('activeKind decides what is lit', lit(p.nav), ['help']);
    t.ok('and is given the wm', seen.every(Boolean) && seen.length === 1);
    page_ = null;
    rail.sync();
    t.check('null lights nothing', lit(p.nav), []);
    const log = items(p.nav)[1];
    t.ok('decorate adds a class', log.classList.contains('mine'));
    t.check('and changes a tooltip', log.getAttribute('data-tooltip'), 'Shared by every crew');
    log.click();
    t.check('a press opens the kind', primaryKind(shell), 'log');
    rail.dispose();
    shell.dispose();
    t.check('dispose empties it', p.nav.children.length, 0);
}

t.section('§8 the stylesheets');
{
    const decl = (body, prop) => (body ?? '').match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`))?.[1].trim() ?? null;
    for (const name of ['flexdesk.css']) {
        const sheet = t.css(name);
        const bar = ruleBody(sheet, '.twm-fl-bar');
        t.check(`${name}: the bar's width`, decl(bar, 'width'), 'var(--twm-rail-width)');
        t.check(`${name}: it does not shrink`, decl(bar, 'flex'), '0 0 var(--twm-rail-width)');
        t.check(`${name}: its background`, decl(bar, 'background'), 'var(--twm-rail-bg)');
        t.check(`${name}: a column`, decl(bar, 'flex-direction'), 'column');
        t.check(`${name}: it scrolls`, decl(bar, 'overflow-y'), 'auto');
        const item = ruleBody(sheet, '.twm-fl-item');
        t.check(`${name}: an item's height`, decl(item, 'height'), 'var(--twm-rail-item-height)');
        t.check(`${name}: an item does not squash`, decl(item, 'flex'), '0 0 var(--twm-rail-item-height)');
        t.check(`${name}: an item at rest`, decl(item, 'color'), 'var(--twm-rail-icon)');
        t.check(`${name}: the bar's place is reserved`, decl(item, 'border-left'), '2px solid transparent');
        const glyph = ruleBody(sheet, '.twm-fl-item .material-symbols-outlined');
        t.check(`${name}: the icon's size`, decl(glyph, 'font-size'), 'var(--twm-rail-icon-size)');
        t.ok(`${name}: the icon's weight`, /'wght' 300/.test(glyph ?? ''));
        t.check(`${name}: hover`, decl(ruleBody(sheet, '.twm-fl-item:hover'), 'color'), 'var(--twm-rail-icon-on)');
        const on = ruleBody(sheet, '.twm-fl-item--on, .twm-fl-item--on:hover');
        t.check(`${name}: the active item's colour`, decl(on, 'color'), 'var(--twm-rail-icon-on)');
        t.check(`${name}: the active item's bar`, decl(on, 'border-left-color'), 'var(--twm-rail-icon-on)');
        t.check(`${name}: on transparent`, decl(on, 'background'), 'transparent');
        t.check(`${name}: focus draws an outline`, decl(ruleBody(sheet, '.twm-fl-item:focus-visible'), 'outline'),
                '2px solid var(--accent-bright)');
        t.check(`${name}: the first pinned item takes the space`,
                decl(ruleBody(sheet, '.twm-fl-item--bottom'), 'margin-top'), 'auto');
        t.check(`${name}: the next one stays beside it`,
                decl(ruleBody(sheet, '.twm-fl-item--bottom ~ .twm-fl-item--bottom'), 'margin-top'), '0');
        const rules = [...stripComments(sheet).matchAll(/([^{}]*\.twm-fl-[^{}]*)\{([^{}]*)\}/g)].map((m) => m[2]).join('');
        t.ok(`${name}: no colour literal in the rail's rules`, !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(rules));
    }
    for (const name of ['flexdesk.css']) {
        const sheet = t.css(name);
        const row = ruleBody(sheet, '.twm-workspace');
        t.check(`${name}: the row fills the column`, decl(row, 'flex'), '1 1 auto');
        t.check(`${name}: and is a row`, decl(row, 'display'), 'flex');
        t.check(`${name}: and may shrink`, decl(row, 'min-height'), '0');
        const host = ruleBody(sheet, 'body.twm-body > .twm-host, .twm-workspace > .twm-host');
        t.check(`${name}: a host in the row is a host under the body`, decl(host, 'flex'), '1 1 auto');
        t.check(`${name}: and fills what is left`, decl(host, 'min-width'), '0');
    }
    const tokens = t.css('tokens.css');
    for (const [token, value] of [
        ['--twm-rail-width', '50px'], ['--twm-rail-item-height', '44px'], ['--twm-rail-icon-size', '22px'],
        ['--twm-rail-bg', '#333333'], ['--twm-rail-icon', '#9e9e9e'], ['--twm-rail-icon-on', 'var(--text-bright)'],
    ]) {
        t.check(`tokens.css: ${token}`, tokens.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))?.[1].trim(), value);
    }
}

t.section('§9 reachable, and under the guard');
{
    const entry = await import('../wm.js');
    t.check('@flexdesk/wm exports mountPageRail', typeof entry.mountPageRail, 'function');
    const built = t.read('dist/wm.js');
    t.ok('the built entry exports it', /\bmountPageRail\b/.test(built));
    t.ok('the built sheet has the rail', /twm-fl-item--on/.test(t.read('dist/flexdesk.css')));
    t.ok('the built tokens have the rail', /--twm-rail-bg/.test(t.read('dist/tokens.css')));
    const { DEFAULT_STATE_GUARD_CONFIG } = await import('../src/core/state_guard_config.js');
    for (const key of ['kind', 'tooltip']) {
        t.ok(`the guard's defaults allow data-${key}`, DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.includes(key));
    }
    t.ok('docs name it', readFileSync(new URL('../docs/components/shell.md', import.meta.url), 'utf8').includes('(0.18.0)'));
}

TooltipService.hide();
t.done();
process.exit(0);
