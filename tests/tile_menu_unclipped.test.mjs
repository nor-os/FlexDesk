/**
 * ══ BUG-0043: A TILE'S ⋯ MENU IS NOT CLIPPED BY A NARROW TILE ════════════
 *
 * The menu was `.tile-menu-dropdown { position: absolute; right: 0;
 * min-width: 180px }` inside the tile, which clips its content. In a tile
 * under ~220px wide the menu started left of the tile's edge and its left part
 * and labels were cut off.
 *
 * Now an open menu is moved to `document.body` and placed `position: fixed`
 * by `ActionDropdown.position` (right edges aligned with the button, kept
 * inside the window), and goes back into the tile's header when it closes.
 * jsdom has no layout, so the button's and the menu's rectangles are stubbed.
 *
 *     node tests/tile_menu_unclipped.test.mjs        # from ../FlexDesk
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
    for (const c of [resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
                     resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js')]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('tile menu unclipped: SKIPPED — needs jsdom');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node',
                   'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator',
                   'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const { TileBase } = await import('../src/tiles/tile_base.js');
const { TileGrid } = await import('../src/tiles/tile_grid.js');
const { registerWidget } = await import('../src/tiles/tile_registry.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const frame = () => new Promise((r) => dom.window.requestAnimationFrame(() => r()));

class NarrowTile extends TileBase {
    static TYPE = 'narrow-menu';
    static TITLE = 'Narrow';
    static DEFAULT_SIZE = { w: 2, h: 3 };
    menuItems() {
        return [{ action: 'export', label: 'Export as a long label', icon: 'download' }];
    }
    _onMenuAction(action) { this.chosen = action; }
}
registerWidget(NarrowTile);

const rect = (left, top, width, height) => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() {},
});

const doc = dom.window.document;
Object.defineProperty(dom.window, 'innerWidth', { value: 600, configurable: true });
Object.defineProperty(dom.window, 'innerHeight', { value: 400, configurable: true });

function mount() {
    const container = doc.createElement('div');
    doc.getElementById('root').appendChild(container);
    const grid = new TileGrid({
        container, eventBus: { emit() {} }, showToolbar: false, onLayoutChange: () => {},
    });
    const tile = grid.addTile('narrow-menu', { x: 0, y: 0, w: 2, h: 3 });
    const btn = tile.element.querySelector('.tile-menu-btn');
    const menu = tile.element.querySelector('.tile-menu-dropdown');
    // A 150px tile at the window's left edge; its ⋯ button near its right edge,
    // and a 180px menu: aligned right on the button it would start at x = -40.
    tile.element.getBoundingClientRect = () => rect(0, 50, 150, 200);
    btn.getBoundingClientRect = () => rect(120, 56, 20, 20);
    menu.getBoundingClientRect = () => rect(0, 0, 180, 40);
    return { grid, tile, btn, menu };
}

console.log('\nBUG-0043: a tile\'s ⋯ menu is drawn over the page, inside the window\n');

{
    const { grid, tile, btn, menu } = mount();
    btn.click();
    ok('the menu opens', !menu.hidden);
    ok('the open menu is not inside the tile, which clips it',
       !tile.element.contains(menu), `parent: ${menu.parentNode?.className || menu.parentNode?.nodeName}`);
    ok('it is drawn on document.body', menu.parentNode === doc.body);
    ok('it is position: fixed', menu.style.position === 'fixed', `got "${menu.style.position}"`);
    const left = parseFloat(menu.style.left);
    ok('its left edge is inside the window', left >= 0, `left = ${menu.style.left}`);
    ok('its right edge is inside the window', left + 180 <= 600, `left = ${menu.style.left}`);
    ok('it opens under the button', parseFloat(menu.style.top) >= 76, `top = ${menu.style.top}`);

    // Choosing an entry closes the menu and puts it back in the header.
    menu.querySelector('.tile-menu-item').click();
    ok('choosing an entry reaches _onMenuAction', tile.chosen === 'export');
    ok('and closes the menu', menu.hidden);
    ok('which goes back into the tile header',
       !!menu.parentNode?.classList.contains('tile-menu-wrapper') && tile.element.contains(menu));
    grid.dispose();
}

{
    // A wide tile far from the edge keeps the menu's right edge on the button's.
    const { grid, btn, menu } = mount();
    btn.getBoundingClientRect = () => rect(400, 56, 20, 20);
    btn.click();
    ok('with room, the menu\'s right edge lines up with the button\'s',
       parseFloat(menu.style.left) === 420 - 180, `left = ${menu.style.left}`);

    // An outside press closes it.
    await frame();
    doc.getElementById('root').dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    ok('a press outside closes it', menu.hidden
       && menu.parentNode?.classList.contains('tile-menu-wrapper'));

    // Re-open and dispose: nothing is left on document.body.
    btn.click();
    ok('it opens again', !menu.hidden && menu.parentNode === doc.body);
    grid.dispose();
    ok('disposing the grid with the menu open leaves no menu on document.body',
       doc.body.querySelectorAll('.tile-menu-dropdown').length === 0);
}

console.log(failures === 0 ? '\nall assertions passed\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
