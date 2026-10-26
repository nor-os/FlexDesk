/**
 * ══ STORY-0128: A DOUBLE-CLICK ON A TILE'S TITLE STRIP OPENS ITS CONFIG ═══
 *
 * The cogwheel (`.tile-config-btn`) was the only way into a tile's config;
 * EcoSim built the double-click on FlexDesk's private DOM. Now the header's
 * double-click calls the cogwheel's own `_onConfigClick`, except on a button
 * of the strip or an editable field in it, and `configOnDoubleClick: false`
 * (on the tile or the grid) turns it off.
 *
 *     node tests/tile_title_dblclick_config.test.mjs        # from ../FlexDesk
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
    console.log('tile title dblclick config: SKIPPED — needs jsdom');
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

class ConfTile extends TileBase {
    static TYPE = 'dbl-conf';
    static TITLE = 'Configurable';
    menuItems() { return [{ action: 'x', label: 'X' }]; }
}
registerWidget(ConfTile);

const doc = dom.window.document;
const dbl = (el) => el.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));

function mount(gridOpts = {}) {
    const container = doc.createElement('div');
    doc.getElementById('root').appendChild(container);
    const emitted = [];
    const grid = new TileGrid({
        container, showToolbar: false, onLayoutChange: () => {},
        eventBus: { emit: (name, payload) => emitted.push({ name, payload }) },
        ...gridOpts,
    });
    const tile = grid.addTile('dbl-conf', { x: 0, y: 0, w: 4, h: 3 });
    const domEvents = [];
    container.addEventListener('tile:config-request', (e) => domEvents.push(e.detail));
    const requests = () => emitted.filter((e) => e.name === 'tile:config-request');
    return { grid, tile, container, requests, domEvents };
}

console.log('\nSTORY-0128: the title strip\'s double-click does what the cogwheel does\n');

{
    const { grid, tile, requests, domEvents } = mount();
    const header = tile.element.querySelector('.tile-header');
    tile.element.querySelector('.tile-config-btn').click();
    const viaCog = requests()[0]?.payload;
    ok('the cogwheel asks for config', requests().length === 1 && domEvents.length === 1);

    let calls = 0;
    const orig = tile._onConfigClick.bind(tile);
    tile._onConfigClick = () => { calls += 1; orig(); };

    dbl(tile.element.querySelector('.tile-title'));
    ok('a double-click on the title goes through _onConfigClick', calls === 1, `calls = ${calls}`);
    ok('…and emits the same tile:config-request on the bus',
       requests().length === 2
       && JSON.stringify(requests()[1].payload) === JSON.stringify(viaCog));
    ok('…and dispatches the same DOM event', domEvents.length === 2
       && domEvents[1].tileId === tile.id);
    ok('…and selects the tile, as the cogwheel does', tile.element.classList.contains('tile--selected'));

    dbl(header);
    ok('a double-click on the strip itself (between items) opens config too', calls === 2);
    dbl(tile.element.querySelector('.tile-drag-handle'));
    ok('…and on the drag grip, which is part of the strip', calls === 3);

    for (const sel of ['.tile-config-btn', '.tile-remove-btn', '.tile-menu-btn']) {
        const before = calls;
        dbl(tile.element.querySelector(`${sel} .material-symbols-outlined`) || tile.element.querySelector(sel));
        ok(`a double-click on ${sel} does not open config`, calls === before);
    }

    // An editable title, as an embedder puts one in the strip to rename.
    const title = tile.element.querySelector('.tile-title');
    const input = doc.createElement('input');
    title.appendChild(input);
    let before = calls;
    dbl(input);
    ok('a double-click in an editable title input does not open config', calls === before);
    const editable = doc.createElement('span');
    editable.setAttribute('contenteditable', 'true');
    title.appendChild(editable);
    dbl(editable);
    ok('…nor in a contenteditable title', calls === before);

    // A double-click in the content is not the strip.
    dbl(tile.contentElement);
    ok('a double-click in the content does not open config', calls === before);
    grid.dispose();
}

{
    const { grid, tile, requests } = mount({ configOnDoubleClick: false });
    ok('configOnDoubleClick: false on the grid reaches the tile', tile.configOnDoubleClick === false);
    dbl(tile.element.querySelector('.tile-title'));
    ok('…and the double-click opens nothing', requests().length === 0);
    tile.element.querySelector('.tile-config-btn').click();
    ok('…while the cogwheel still does', requests().length === 1);
    grid.dispose();
}

{
    const { grid, tile, requests } = mount();
    tile.configOnDoubleClick = false;
    dbl(tile.element.querySelector('.tile-title'));
    ok('the option is read at the double-click, so a tile can turn it off later', requests().length === 0);
    grid.dispose();
}

{
    const { grid, tile, requests } = mount({ readonly: true });
    ok('a read-only tile has no cogwheel', !tile.element.querySelector('.tile-config-btn'));
    dbl(tile.element.querySelector('.tile-title'));
    ok('…and its double-click opens nothing', requests().length === 0);
    grid.dispose();
}

{
    const t = new ConfTile({ id: 't', grid: null });
    ok('the default is on', t.configOnDoubleClick === true);
}

console.log('\nSTORY-0128: several tiles can be marked as being configured\n');
{
    const { grid, tile: a } = mount();
    const b = grid.addTile('dbl-conf', { x: 4, y: 0, w: 4, h: 3 });
    ok('a tile is not configuring to begin with', a.isConfiguring === false
       && !a.element.classList.contains('tile--configuring'));
    a.setConfiguring(true);
    ok('setConfiguring(true) marks it', a.isConfiguring && a.element.classList.contains('tile--configuring'));
    a.element.querySelector('.tile-config-btn').click();
    b.setConfiguring(true);
    dbl(b.element.querySelector('.tile-title'));
    ok('a second tile\'s config request moves the selection to it',
       b.element.classList.contains('tile--selected') && !a.element.classList.contains('tile--selected'));
    ok('…and leaves the first tile\'s configuring mark alone',
       a.element.classList.contains('tile--configuring') && b.element.classList.contains('tile--configuring'));
    a.setConfiguring(false);
    ok('setConfiguring(false) clears only that tile\'s mark',
       !a.element.classList.contains('tile--configuring') && b.element.classList.contains('tile--configuring')
       && a.isConfiguring === false);
    // The mark is state on the tile, so a re-mount draws it again.
    const host = b.element.parentNode;
    b.element.remove();
    b.mount(host);
    ok('the mark survives a re-mount', b.element.classList.contains('tile--configuring'));
    grid.dispose();
}

{
    const { readFileSync } = await import('node:fs');
    const { ruleBody } = await import('./css_rules.mjs');
    for (const sheet of ['base.css', 'flexdesk.css']) {
        const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
        ok(`${sheet}: tile--configuring is drawn like tile--selected`,
           !!ruleBody(css, '.tile.tile--selected, .tile.tile--configuring')
           && !!ruleBody(css, '.tile.tile--selected .tile-header, .tile.tile--configuring .tile-header')
           && !!ruleBody(css, '.tile.tile--selected .tile-title, .tile.tile--configuring .tile-title'));
    }
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
