/**
 * ══ A TILE THAT FETCHES ITS OWN DATA, AND A GRID THAT LOOKS LIKE SOMETHING ══
 *
 * `@flexdesk/tiles` was extracted from an application where one simulation run
 * fed every tile on the board: `TileGrid.setData(analytics)` broadcast a single
 * dataset and each tile picked its variable out of it. A dashboard over a
 * database is the other shape — each tile owns a query, and the second tile
 * cannot find its rows inside the first tile's payload. So the library grew a
 * SECOND path beside the broadcast, not instead of it:
 *
 *     dataSource  injected into the grid, handed to every tile
 *     loadData()  a no-op hook the consumer implements; the grid owns the CALL
 *                 SITES — after mount, after a resize settles, after a config
 *                 save, and on demand through `reloadAll()`
 *     onResize()  a no-op hook for content that only sizes itself when told
 *     menuItems() the ⋯ menu, which used to be an EcoAgent literal
 *
 * D6 is the constraint the whole file is written against: FlexDesk is modified
 * UPSTREAM, ADDITIVELY AND BACK-COMPATIBLY. Every section below is therefore
 * paired — the new behaviour under a `dataSource`, and the OLD behaviour with
 * none, asserted to be exactly what it was. §3 is the important half of that
 * pair and the one a hurried reader would leave out: with no data source, no
 * tile is ever asked to load anything and `setData` still reaches `update()`.
 *
 * §6 exists because the two message states interpolated into `innerHTML`, and
 * the string reaching `showError` is a server's error text — the one string a
 * widget author controls least.
 *
 * §8 is the CSS-side check, and it is the one that would have caught the
 * defect this work started from: `src/tiles/` shipped with its JavaScript and
 * without its stylesheet, so `TileGrid` set `--grid-columns`,
 * `--grid-row-height` and `--grid-gap` on an element that no rule anywhere
 * read, and every consumer drew a column of unstyled divs. Neither a JS check
 * nor a "does this class exist" grep in the DOWNSTREAM direction can see that;
 * only asking, of every class the tiles JS sets, whether a stylesheet defines
 * it.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/tiles_data_source.test.mjs        # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * It imports `../src/tiles/*` DIRECTLY, never `dist/` and never Tables'
 * `vendor/flexdesk/`: the change under test is upstream source, the bundle is
 * re-vendored afterwards, and a test against the bundle passes for a week by
 * testing the previous build.
 *
 * jsdom is not a FlexDesk dependency (zero runtime deps, esbuild as the only
 * dev one), so it is borrowed from the sibling Tables checkout. Absent, this
 * SKIPS loudly rather than passing.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
    console.log('tiles data source: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

// ── jsdom globals, installed before the modules under test are imported ──
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const { TileBase } = await import('../src/tiles/tile_base.js');
const { TileGrid } = await import('../src/tiles/tile_grid.js');
const { registerWidget } = await import('../src/tiles/tile_registry.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A recording widget. It implements `loadData` the way a real consumer does —
 * ask the source, render what comes back — so that what is asserted below is
 * the grid's CALL SITES, which is the half that lives upstream.
 */
class ProbeTile extends TileBase {
    static TYPE = 'probe';
    static TITLE = 'Probe';
    static DEFAULT_SIZE = { w: 4, h: 3 };

    constructor(opts) {
        super(opts);
        // Not a class field: `getDefaultConfig()` runs inside the base
        // constructor, before any subclass field initialiser would have run,
        // so a field here would be undefined for anything the constructor did.
        this.calls = { load: [], resize: 0, render: [] };
    }

    async loadData(opts = {}) {
        this.calls.load.push(opts);
        this._loadSeq += 1;
        const seq = this._loadSeq;
        const dataset = await this.dataSource.resolve(this.id, this.binding, opts);
        if (seq !== this._loadSeq || this._disposed) return;  // superseded
        this._lastLoadedAt = dataset.computed_at;
        this.render(dataset);
    }

    onResize() { this.calls.resize += 1; }

    render(data) { this.calls.render.push(data); }

    get binding() { return this.config?.binding ?? null; }
}
registerWidget(ProbeTile);

/** A tile that wants no ⋯ menu at all — what every non-EcoAgent consumer wants. */
class QuietTile extends ProbeTile {
    static TYPE = 'quiet';
    static TITLE = 'Quiet';
    menuItems() { return []; }
}
registerWidget(QuietTile);

/** A tile with its own single entry, to prove the dispatch is not hard-wired. */
class OwnMenuTile extends ProbeTile {
    static TYPE = 'own-menu';
    static TITLE = 'Own menu';
    menuItems() { return [{ action: 'export', label: 'Export…', icon: 'download' }]; }
    _onMenuAction(action) { this.calls.menu = action; }
}
registerWidget(OwnMenuTile);

/** A data source that records what it was asked and answers immediately. */
function recordingSource() {
    const asked = [];
    return {
        asked,
        async resolve(tileId, binding, opts) {
            asked.push({ tileId, binding, opts });
            return { rows: [], row_count: 0, computed_at: `t${asked.length}` };
        },
    };
}

function mountGrid({ dataSource = null, readonly = false } = {}) {
    const container = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(container);
    const events = [];
    const grid = new TileGrid({
        container,
        eventBus: { emit: (name, payload) => events.push([name, payload]) },
        showToolbar: false,
        readonly,
        dataSource,
        onLayoutChange: () => {},
    });
    return { grid, container, events };
}

console.log('\ntiles: per-tile data source, the two lifecycle hooks, and the menu\n');

// ════════════════════════════════════════════════════════════════════════
// 1. THE SOURCE REACHES THE WIDGET
// ════════════════════════════════════════════════════════════════════════
//
// Through `addTile` -> `createWidget`'s options literal, which is the only
// construction path there is. A tile that has to reach for a global instead is
// a tile the framework cannot hand a different source per board.
{
    const src = recordingSource();
    const { grid } = mountGrid({ dataSource: src });
    const tile = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 }, { binding: { ref: 'A' } });

    ok('the grid holds the injected source', grid.dataSource === src);
    ok('and the tile it constructed holds the same object, not a copy',
       tile.dataSource === src,
       'identity matters: a batching source shares one in-flight request across tiles');
    check('the tile starts with no load recorded against it', tile._lastLoadedAt, null);
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 2. MOUNT PULLS — ONCE
// ════════════════════════════════════════════════════════════════════════
{
    const src = recordingSource();
    const { grid } = mountGrid({ dataSource: src });
    const tile = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 }, { binding: { ref: 'A' } });
    await tick();

    check('mounting under a data source asks it exactly once', tile.calls.load.length, 1);
    check('and it asked with the tile\'s own binding, not the board\'s',
          src.asked.map((a) => [a.tileId, a.binding.ref]), [[tile.id, 'A']]);
    check('the answer was rendered', tile.calls.render.length, 1);
    check('and `_lastLoadedAt` carries the dataset\'s own stamp, for a header age readout',
          tile._lastLoadedAt, 't1');

    // A second tile is a second question, not a re-run of the first.
    const two = grid.addTile('probe', { x: 4, y: 0, w: 4, h: 3 }, { binding: { ref: 'B' } });
    await tick();
    check('a second tile asks once for itself', two.calls.load.length, 1);
    check('and the first was not asked again', tile.calls.load.length, 1);
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 3. WITHOUT A SOURCE, NOTHING CHANGED — THIS IS THE D6 HALF
// ════════════════════════════════════════════════════════════════════════
//
// The broadcast path is EcoAgent's, and it is a live consumer of this class.
// `setData` must still reach every tile's `update()`, and `loadData` must
// never be reached at all: an unconditional call would turn `tile.loadData?.()`
// into a request against a source that does not exist the moment the optional
// chain met a base-class no-op rather than nothing.
{
    const { grid } = mountGrid();                       // no dataSource
    const tile = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 });
    await tick();

    check('a tile in a grid with no source has none', tile.dataSource, null);
    check('and is never asked to load', tile.calls.load.length, 0);

    grid.setData({ stocks: { x: [1, 2, 3] } });
    check('`setData` still renders through `update()`, exactly as before',
          tile.calls.render.length, 1);
    check('and still did not call `loadData`', tile.calls.load.length, 0);

    // And a tile added AFTER a broadcast still takes the pushed dataset — the
    // pull branch is an `else if`, so it can never race the push.
    const late = grid.addTile('probe', { x: 4, y: 0, w: 4, h: 3 });
    await tick();
    check('a tile added after a broadcast renders the broadcast', late.calls.render.length, 1);
    check('and was not asked to load either', late.calls.load.length, 0);
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 4. RESIZE END NOTIFIES, IT DOES NOT REFETCH
// ════════════════════════════════════════════════════════════════════════
//
// Driven through the REAL pointer sequence — pointerdown on the handle,
// pointermove, pointerup — and never by calling `_onResizeEnd()`. A private
// method called directly is a test of the method; the risk is in the wiring,
// and the wiring is three listeners, two of them on `document`.
{
    const src = recordingSource();
    const { grid } = mountGrid({ dataSource: src });
    const tile = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 }, { binding: { ref: 'A' } });
    await tick();
    const before = tile.calls.load.length;

    const handle = tile.element.querySelector('.tile-resize-handle');
    ok('the tile has a resize handle to pull', !!handle);
    handle.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 }));
    ok('and the press survived it — the handler did not repaint its own container',
       handle.isConnected,
       'a node replaced on mousedown never receives the pointerup that ends the gesture');
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        bubbles: true, clientX: 300, clientY: 260 }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
    await tick();

    check('the settled resize told the tile once', tile.calls.resize, 1);
    check('and did NOT ask the server again — a tile 40 px wider is the same rows',
          tile.calls.load.length, before);
    ok('the tile is no longer marked resizing',
       !tile.element.classList.contains('resizing'));
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 5. THE ⋯ MENU IS A HOOK, NOT A LITERAL
// ════════════════════════════════════════════════════════════════════════
//
// It was two hard-coded EcoAgent entries, and the first one's hide condition
// is `sourceCellId && already-added` — so on a tile with no `sourceCellId` at
// all it rendered VISIBLE and emitted `tile:add-to-documentation` at an
// application with no documentation. Every consumer but one shipped a menu
// item that did nothing.
{
    const { grid } = mountGrid();
    const plain = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 });
    const items = [...plain.element.querySelectorAll('.tile-menu-item')];
    check('the default is still EcoAgent\'s two entries, unchanged',
          items.map((el) => el.dataset.action),
          ['add-to-documentation', 'show-in-documentation']);
    check('with the same hide conditions: unlinked tile shows "add", hides "show"',
          items.map((el) => el.style.display), ['', 'none']);

    const quiet = grid.addTile('quiet', { x: 4, y: 0, w: 4, h: 3 });
    check('a widget returning [] renders no menu item at all',
          quiet.element.querySelectorAll('.tile-menu-item').length, 0);
    ok('and no ⋯ button either — an empty menu reads as broken, not absent',
       !quiet.element.querySelector('.tile-menu-btn')
       && !quiet.element.querySelector('.tile-menu-wrapper'));
    ok('while the cogwheel and the remove button are untouched',
       !!quiet.element.querySelector('.tile-config-btn')
       && !!quiet.element.querySelector('.tile-remove-btn'));

    // One dispatch point: a subclass adds an entry and the click reaches it
    // without also adding a listener. Real press-release-click, not `.click()`.
    const own = grid.addTile('own-menu', { x: 8, y: 0, w: 4, h: 3 });
    const entry = own.element.querySelector('.tile-menu-item');
    check('a custom entry renders with its own label', entry?.textContent.trim().includes('Export…'), true);
    for (const type of ['mousedown', 'mouseup', 'click']) {
        entry.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    check('and selecting it dispatches through `_onMenuAction`', own.calls.menu, 'export');

    // A label is interpolated into innerHTML like everything else in the chrome.
    class RudeMenuTile extends ProbeTile {
        static TYPE = 'rude-menu';
        menuItems() { return [{ action: 'x', label: '<img src=x onerror=boom()>' }]; }
    }
    registerWidget(RudeMenuTile);
    const rude = grid.addTile('rude-menu', { x: 0, y: 3, w: 4, h: 3 });
    check('a menu label is escaped, not parsed',
          rude.element.querySelectorAll('.tile-menu-item img').length, 0);

    // Read-only chrome never had a menu; the hook must not give it one back.
    const ro = mountGrid({ readonly: true });
    const roTile = ro.grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 });
    check('read-only chrome still has no menu, no cogwheel and no remove button',
          ['.tile-menu-wrapper', '.tile-config-btn', '.tile-remove-btn']
              .map((s) => !!roTile.element.querySelector(s)),
          [false, false, false]);
    ro.grid.dispose();
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 6. THE TWO MESSAGE STATES ARE ESCAPED
// ════════════════════════════════════════════════════════════════════════
//
// `showError`'s argument is the string a widget author controls least: it is
// the server's error text, echoed back with a column name or a filter value
// inside it. Both states interpolated it straight into `innerHTML`.
{
    const { grid } = mountGrid();
    const tile = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 });

    tile.showError('<img src=x onerror=boom()> unknown column "a<b>"');
    check('showError parses no markup out of a server message',
          tile.contentElement.querySelectorAll('img').length, 0);
    ok('and the message is still readable as text',
       tile.contentElement.textContent.includes('unknown column "a<b>"'),
       `got: ${tile.contentElement.textContent.trim()}`);
    ok('inside the class showError actually emits — `.twm-tile-error`, prefixed',
       !!tile.contentElement.querySelector('.twm-tile-error'));

    tile.showEmpty('<b>nothing</b>');
    check('showEmpty escapes too', tile.contentElement.querySelectorAll('b').length, 0);
    ok('and still shows the words', tile.contentElement.textContent.includes('<b>nothing</b>'));
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 7. reloadAll, AND THE CONFIG SAVE THAT MUST NOT BE CACHED
// ════════════════════════════════════════════════════════════════════════
{
    const src = recordingSource();
    const { grid, events } = mountGrid({ dataSource: src });
    const a = grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 }, { binding: { ref: 'A' } });
    const b = grid.addTile('probe', { x: 4, y: 0, w: 4, h: 3 }, { binding: { ref: 'B' } });
    await tick();

    grid.reloadAll();
    await tick();
    check('reloadAll asks every tile again, forcing past the cache',
          [a.calls.load.length, b.calls.load.length, a.calls.load.at(-1).force], [2, 2, true]);

    grid.reloadAll([b.id]);
    await tick();
    check('and narrows to the ids it is given',
          [a.calls.load.length, b.calls.load.length], [2, 3]);

    // A saved config is usually a changed BINDING, and the source's cache is
    // keyed by the old one. This is the one reload that must bypass it.
    a.element.querySelector('.tile-config-btn').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    const modal = events.filter(([n]) => n === 'grid:config-modal-show').at(-1);
    ok('the cogwheel emitted `grid:config-modal-show` with an onSave', !!modal?.[1]?.onSave);
    modal[1].onSave({ binding: { ref: 'C' } });
    await tick();
    check('saving a config re-resolves that tile with force',
          [a.calls.load.length, a.calls.load.at(-1).force], [3, true]);
    check('against the NEW binding', src.asked.at(-1).binding.ref, 'C');
    check('and left the other tile alone', b.calls.load.length, 3);

    // With no source at all, reloadAll is a no-op rather than a throw.
    const plain = mountGrid();
    const p = plain.grid.addTile('probe', { x: 0, y: 0, w: 4, h: 3 });
    plain.grid.reloadAll();
    check('reloadAll on a broadcast-only grid does nothing, quietly', p.calls.load.length, 0);
    plain.grid.dispose();
    grid.dispose();
}

// ════════════════════════════════════════════════════════════════════════
// 8. EVERY CLASS THE TILES JS SETS HAS A RULE
// ════════════════════════════════════════════════════════════════════════
//
// THE CSS-SIDE DIRECTION, which is the half found only by looking. `src/tiles/`
// was extracted with its JavaScript and without its stylesheet: `TileGrid`
// wrote `--grid-columns`, `--grid-row-height` and `--grid-gap` onto an element
// no rule read, so there was no `display: grid` and every consumer drew a
// column of unstyled divs. Nothing in any gate could see it.
//
// `css/flexdesk.css` is the file that ships (`build.mjs` copies it verbatim
// into `dist/`); `css/base.css` is hand-mirrored and is checked here too,
// because a rule that lands in only one of them is a rule that works until
// someone regenerates the other.
{
    const stylesheets = Object.fromEntries(['css/flexdesk.css', 'css/base.css'].map((f) => [
        f, readFileSync(join(HERE, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
    ]));

    const sources = ['tile_base.js', 'tile_grid.js']
        .map((f) => readFileSync(join(HERE, '../src/tiles', f), 'utf8')).join('\n');

    const found = new Set();
    for (const re of [/class="([^"$]+)"/g, /className = '([^']+)'/g,
                      /classList\.(?:add|remove|toggle)\('([^']+)'/g]) {
        for (const m of sources.matchAll(re)) {
            for (const cls of m[1].trim().split(/\s+/)) found.add(cls);
        }
    }
    // Set through a template literal, so the regexes above cannot see it.
    found.add('tile--readonly');
    // The icon font is the consumer's (`vendor/material-symbols/`), not this
    // library's; asking for a rule here would be asking the wrong repository.
    found.delete('material-symbols-outlined');

    ok(`found ${found.size} classes set by the tiles JS`, found.size >= 25,
        [...found].sort().join(' '));

    for (const [file, css] of Object.entries(stylesheets)) {
        const missing = [...found].filter((c) => !css.includes(`.${c}`)).sort();
        check(`every one of them is defined in ${file}`, missing, [],
              'a class the JS sets that no rule defines is the shape that cost'
            + ' this repository four separate diagnoses');
    }

    // And the three custom properties, which are the reverse direction: values
    // written by the JS that a rule has to READ or the grid does not lay out.
    const shipped = stylesheets['css/flexdesk.css'];
    for (const prop of ['--grid-columns', '--grid-row-height', '--grid-gap']) {
        ok(`something reads var(${prop})`, shipped.includes(`var(${prop}`),
           'TileGrid._init() sets it as inline style on the grid element');
    }
    ok('and `.tile-grid` is an actual CSS grid', /\.tile-grid\s*\{[^}]*display:\s*grid/.test(shipped));

    // The donor's `.tile-error` must NOT be here: `showError()` emits
    // `.twm-tile-error`, so the unprefixed spelling would be a dead rule sitting
    // beside a live class — this repository's signature bug, from the CSS side.
    for (const [file, css] of Object.entries(stylesheets)) {
        ok(`${file} defines no unprefixed .tile-error`,
           !/(^|[\s,}])\.tile-error\b/.test(css),
           'showError emits .twm-tile-error; the unprefixed rule matches nothing');
    }
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
