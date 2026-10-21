/**
 * ══ MANAGED TILES: A GRID WHOSE TILES MIRROR A LIST THE EMBEDDER OWNS ══
 *
 * A board of one tile per entity — one terminal per seat, one gauge per
 * sensor — is not a dashboard the user composes. The tiles exist because the
 * entities do, so closing one cannot delete it: it is hidden, and Reset or
 * reopening brings it back. What the user DID arrange — sizes and order — is
 * the saved layout, and it survives all of that (STORY-0094).
 *
 *   §1  opening with a saved layout shows every managed tile; new ones come
 *       after the saved ones, and opening does not save over the saved layout
 *   §2  removing hides; a changed managed set does not bring it back, a new
 *       seed does
 *   §3  Reset brings every managed tile back and moves nothing else
 *   §4  an id dropped from the set goes, and its saved position is forgotten
 *   §5  sizes and order persist through `configureLayoutPersistence`
 *   §6  a grid without managed tiles is exactly what it was
 *   §7  a layout loaded before the managed set is declared waits for it
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/tiles_managed.test.mjs           # from ../FlexDesk
 *     node tests/run.mjs                          # with every other suite
 *
 * jsdom is borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('tiles managed: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect']) {
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
const { configureLayoutPersistence, getLayoutPersistence } =
    await import('../src/tiles/layout_persistence.js');

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

/** A tile that only counts how often it was built and disposed. */
let built = 0;
let disposed = 0;
class SeatTile extends TileBase {
    static TYPE = 'seat';
    static TITLE = 'Seat';
    static DEFAULT_SIZE = { w: 4, h: 3 };
    constructor(opts) { super(opts); built += 1; }
    render() {}
    dispose() { disposed += 1; super.dispose(); }
}
registerWidget(SeatTile);

class NoteTile extends SeatTile {
    static TYPE = 'note';
    static TITLE = 'Note';
}
registerWidget(NoteTile);

const SEATS = ['lead', 'build', 'review', 'git'];
const declare = (ids) => ids.map(id => ({ id, type: 'seat', config: { seat: id } }));

function mount(opts = {}) {
    const container = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(container);
    const events = [];
    const saves = [];
    const grid = new TileGrid({
        container,
        eventBus: { emit: (name, payload) => events.push([name, payload]) },
        showToolbar: true,
        onLayoutChange: (layout) => saves.push(layout),
        ...opts,
    });
    return { grid, container, events, saves };
}

/** The tiles on the grid, in layout order: a removed managed tile is saved as `hidden`. */
const shown = (grid) => grid.getLayout().filter(l => !l.hidden);
/** Geometry only, in the grid's layout order. */
const geometry = (grid) => shown(grid).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
const ids = (grid) => shown(grid).map(l => l.id);
const at = (grid, id) => geometry(grid).find(l => l.id === id);

/** A resize the way the pointer does one, minus the pixels jsdom does not have. */
function resize(grid, id, w, h) {
    const tile = grid.tiles.get(id);
    const ev = { preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 };
    grid._onResizeStart(tile, ev);
    grid._resizeState.pendingW = w;
    grid._resizeState.pendingH = h;
    grid._onPointerUp(ev);
}

console.log('\ntiles: managed tiles (STORY-0094)\n');

// ── §1 opening ──────────────────────────────────────────────────────────
console.log('§1 a grid opened with a saved layout shows every managed tile');
{
    const { grid, saves } = mount({ managedTiles: declare(SEATS) });
    check('with no saved layout, every managed tile is seeded in declaration order',
        ids(grid), SEATS);
    check('each at its widget\'s default size, packed after the one before',
        geometry(grid).slice(0, 4), [
            { id: 'lead', x: 0, y: 0, w: 4, h: 3 }, { id: 'build', x: 4, y: 0, w: 4, h: 3 },
            { id: 'review', x: 8, y: 0, w: 4, h: 3 }, { id: 'git', x: 0, y: 3, w: 4, h: 3 }]);
    check('seeding at construction saves nothing: there was nothing to save over',
        saves.length, 0);
    check('a managed tile carries its declared config', grid.tiles.get('build').config.seat, 'build');
    ok('the layout marks the managed tiles', grid.getLayout().every(l => l.managed === true));
    ok('isManaged knows them', grid.isManaged('lead') && !grid.isManaged('nope'));
    grid.dispose();
}
{
    // The user made `build` wide and put it first; `git` is new since the save.
    const saved = [
        { id: 'build', type: 'seat', x: 0, y: 0, w: 8, h: 4, config: { seat: 'build', theme: 'dark' }, managed: true },
        { id: 'lead', type: 'seat', x: 8, y: 0, w: 4, h: 4, config: { seat: 'lead' }, managed: true },
        { id: 'review', type: 'seat', x: 0, y: 4, w: 6, h: 3, config: { seat: 'review' }, managed: true },
    ];
    built = 0;
    const { grid, saves } = mount({ managedTiles: declare(SEATS), layout: saved });
    check('every managed tile is shown, the saved ones first, in their saved order',
        ids(grid), ['build', 'lead', 'review', 'git']);
    check('the saved ones exactly where the user left them',
        geometry(grid).slice(0, 3), saved.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
    check('the new one after them (the rest of the last row), not in a gap above',
        at(grid, 'git'), { id: 'git', x: 6, y: 4, w: 4, h: 3 });
    check('each tile is built once: the constructor did not seed and then rebuild', built, 4);
    check('the reconciled layout is reported once, because it differs from what was saved',
        saves.length, 1);
    check('the saved config wins over the declaration', grid.tiles.get('build').config.theme, 'dark');
    grid.dispose();
}
{
    const saved = SEATS.map((id, i) => ({ id, type: 'seat', x: (i % 3) * 4, y: Math.floor(i / 3) * 3, w: 4, h: 3, config: { seat: id }, managed: true }));
    const { grid, saves } = mount({ managedTiles: declare(SEATS), layout: saved });
    check('opening onto a layout that already matches saves nothing', saves.length, 0);
    grid.dispose();
}
{
    const { grid } = mount({ managedTiles: declare(['a']) });
    grid.setLayout([{ id: 'x', type: 'note', x: 0, y: 0, w: 12, h: 2, config: {} }]);
    check('`setLayout` after construction seeds the managed tiles after the saved ones too',
        geometry(grid), [{ id: 'x', x: 0, y: 0, w: 12, h: 2 }, { id: 'a', x: 0, y: 2, w: 4, h: 3 }]);
    let threw = false;
    try { grid.setManagedTiles([{ id: '', type: 'seat' }]); } catch { threw = true; }
    ok('a managed tile with no id is refused', threw);
    grid.dispose();
}
{
    // The last row has a gap on its left, beside a tile taller than one row.
    const saved = [
        { id: 'A', type: 'seat', x: 0, y: 0, w: 12, h: 4, config: {}, managed: true },
        { id: 'B', type: 'seat', x: 6, y: 4, w: 6, h: 3, config: {}, managed: true },
    ];
    const { grid } = mount({ managedTiles: declare(['A', 'B', 'new']), layout: saved });
    check('a new tile goes below the last row, not into the gap beside it',
        at(grid, 'new'), { id: 'new', x: 0, y: 7, w: 4, h: 3 });
    grid.dispose();
}
{
    const { grid } = mount({ managedTiles: declare(['a', 'b', 'c']) });
    grid.removeTile('a');
    grid.restoreManagedTiles();
    check('a restored tile comes back below the others, not in its old slot in front of them',
        at(grid, 'a'), { id: 'a', x: 0, y: 3, w: 4, h: 3 });
    grid.dispose();
}

// ── §2 removing ─────────────────────────────────────────────────────────
console.log('§2 removing a managed tile hides it');
{
    const { grid, events, saves } = mount({ managedTiles: declare(SEATS) });
    resize(grid, 'review', 6, 4);
    disposed = 0;
    grid.removeTile('review');
    check('it is off the grid and out of the layout', ids(grid), ['lead', 'build', 'git']);
    check('its widget was disposed', disposed, 1);
    ok('no element is left for it', !grid.gridElement.querySelector('[data-tile-id="review"]'));
    check('the grid says it is hidden', grid.getHiddenManagedTiles(), ['review']);
    ok('`grid:managed-tile-hidden` names it',
        events.some(([n, p]) => n === 'grid:managed-tile-hidden' && p.tileId === 'review'));
    ok('and the layout without it was reported (an autosave keeps the others\' sizes)',
        !saves.at(-1).some(l => l.id === 'review' && !l.hidden));
    check('saved as a hidden entry that holds only its size',
        saves.at(-1).find(l => l.id === 'review'),
        { id: 'review', type: 'seat', w: 6, h: 4, managed: true, hidden: true });

    const r = grid.setManagedTiles(declare([...SEATS, 'ops']));
    check('a changed managed set adds the new id', r.added, ['ops']);
    ok('but does not bring the hidden one back', !grid.tiles.has('review'));
    check('it stays hidden', grid.getHiddenManagedTiles(), ['review']);

    grid.setManagedTiles(declare([...SEATS, 'ops']), { restore: true });
    ok('a new seed (`restore: true`) brings it back', grid.tiles.has('review'));
    check('at the size it had', [at(grid, 'review').w, at(grid, 'review').h], [6, 4]);
    check('nothing is hidden any more', grid.getHiddenManagedTiles(), []);
    grid.dispose();
}
{
    const { grid } = mount({ managedTiles: declare(SEATS) });
    const tile = grid.tiles.get('git');
    tile.element.dispatchEvent(new CustomEvent('tile:remove-request', { bubbles: true, detail: { tileId: 'git' } }));
    ok('a remove REQUEST alone still removes nothing (the dashboard confirms first)', grid.tiles.has('git'));
    grid.removeTile('git');
    const saved = grid.getLayout();
    grid.dispose();

    // Reopening: a new grid over the layout saved after the removal.
    const again = mount({ managedTiles: declare(SEATS), layout: saved }).grid;
    ok('reopening brings a removed tile back', again.tiles.has('git'));
    check('after the others', ids(again).at(-1), 'git');
    check('nothing is hidden after reopening', again.getHiddenManagedTiles(), []);
    again.dispose();
}
{
    // Resized, then closed, then the page reloaded: back at the size the user gave it.
    const { grid } = mount({ managedTiles: declare(SEATS) });
    resize(grid, 'build', 8, 5);
    grid.removeTile('build');
    const saved = JSON.parse(JSON.stringify(grid.getLayout()));
    grid.dispose();
    const { grid: again, saves } = mount({ managedTiles: declare(SEATS), layout: saved });
    check('reopening brings a closed tile back at the size it had, not its default',
        [at(again, 'build').w, at(again, 'build').h], [8, 5]);
    ok('and saves the reopened layout, the tile no longer hidden',
        saves.length === 1 && saves[0].some(l => l.id === 'build' && !l.hidden));
    again.dispose();
}

// ── §3 Reset ────────────────────────────────────────────────────────────
console.log('§3 Reset brings back every managed tile and keeps the rest');
{
    const { grid, events, container } = mount({ managedTiles: declare(SEATS) });
    resize(grid, 'lead', 8, 4);
    grid.removeTile('build');
    grid.removeTile('git');
    const kept = geometry(grid);
    container.querySelector('.reset-layout-btn').click();
    check('the toolbar\'s Reset brought both back', grid.getHiddenManagedTiles(), []);
    check('every managed tile is on the grid again', [...grid.tiles.keys()].sort(), [...SEATS].sort());
    check('the tiles never removed kept their sizes, order and places',
        geometry(grid).slice(0, kept.length), kept);
    check('the returning ones come after them', ids(grid).slice(kept.length), ['build', 'git']);
    const lowest = Math.max(...kept.map(l => l.y + l.h));
    ok('below the kept tiles, not in the gaps they left beside them',
        ['build', 'git'].every(id => at(grid, id).y >= lowest),
        JSON.stringify(geometry(grid)));
    ok('Reset on a managed grid asks no confirmation: nothing arranged is lost',
        !events.some(([n]) => n === 'grid:reset-layout-confirm'));
    ok('`grid:managed-tiles-restored` names what came back',
        events.some(([n, p]) => n === 'grid:managed-tiles-restored'
            && JSON.stringify(p.ids) === '["build","git"]'));
    check('a second Reset has nothing to bring back', grid.restoreManagedTiles(), []);
    grid.dispose();
}

// ── §4 dropping an id ───────────────────────────────────────────────────
console.log('§4 an id dropped from the managed set goes, and is forgotten');
{
    const { grid, saves } = mount({ managedTiles: declare(SEATS) });
    resize(grid, 'review', 6, 4);
    grid.removeTile('git');
    const before = saves.length;
    const r = grid.setManagedTiles(declare(['lead', 'build']));
    check('both the shown and the hidden one are reported removed', r.removed, ['review', 'git']);
    check('the shown one\'s tile went', ids(grid), ['lead', 'build']);
    check('the hidden one is forgotten too', grid.getHiddenManagedTiles(), []);
    ok('the layout without them was reported', saves.length === before + 1
        && saves.at(-1).every(l => l.id === 'lead' || l.id === 'build'));
    grid.setManagedTiles(declare(['lead', 'build', 'review']));
    check('declared again, it starts over at the default size, not its old one',
        [at(grid, 'review').w, at(grid, 'review').h], [4, 3]);
    grid.dispose();
}
{
    const saved = [
        { id: 'gone', type: 'seat', x: 0, y: 0, w: 12, h: 4, config: {}, managed: true },
        { id: 'mine', type: 'note', x: 0, y: 4, w: 6, h: 2, config: {} },
        { id: 'lead', type: 'seat', x: 6, y: 4, w: 6, h: 2, config: {}, managed: true },
    ];
    const { grid, saves } = mount({ managedTiles: declare(['lead']), layout: saved });
    ok('a saved managed entry whose id left the set while the grid was closed is dropped',
        !grid.tiles.has('gone'));
    ok('a tile the user added beside the managed ones is kept', grid.tiles.has('mine'));
    ok('and the layout without the dropped entry is reported, so the next save forgets it',
        saves.length === 1 && !saves[0].some(l => l.id === 'gone'));
    ok('removing an unmanaged tile still deletes it',
        (grid.removeTile('mine'), !grid.tiles.has('mine') && grid.getHiddenManagedTiles().length === 0));
    grid.dispose();
}

// ── §5 persistence ──────────────────────────────────────────────────────
console.log('§5 sizes and order persist through configureLayoutPersistence');
{
    const store = new Map();
    const storage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    configureLayoutPersistence({ storage, layoutsKey: 'test.managed.layouts' });
    const open = () => {
        const persistence = getLayoutPersistence();
        return mount({
            managedTiles: declare(SEATS),
            layout: persistence.getLayout('team-dev'),
            onLayoutChange: (layout) => persistence.saveLayout('team-dev', layout),
        }).grid;
    };
    const first = open();
    check('a first opening (an empty saved layout) saves the seeded one',
        JSON.parse(store.get('test.managed.layouts'))['team-dev'].tiles.map(l => l.id), SEATS);
    resize(first, 'build', 8, 5);
    first.removeTile('lead');
    const arranged = geometry(first);
    first.dispose();

    // A reload: the singleton is rebuilt and reads the store from scratch.
    configureLayoutPersistence({ storage, layoutsKey: 'test.managed.layouts' });
    const second = open();
    check('after a reload the saved sizes and order are kept',
        geometry(second).slice(0, arranged.length), arranged);
    check('and the removed tile is back, after them', ids(second).at(-1), 'lead');
    second.dispose();
    configureLayoutPersistence({});
}

// ── §6 no managed tiles ─────────────────────────────────────────────────
console.log('§6 a grid without managed tiles behaves as it always did');
{
    const { grid, events, saves, container } = mount();
    check('it starts empty', grid.getLayout(), []);
    check('and the constructor reported nothing', saves.length, 0);
    grid.addTile('note', { x: 0, y: 0, w: 4, h: 3 }, { title: 'n' }, 'n1');
    check('a layout entry has exactly the keys it always had',
        Object.keys(grid.getLayout()[0]), ['id', 'type', 'x', 'y', 'w', 'h', 'config']);
    check('`setLayout` still answers nothing to speak of', grid.setLayout(grid.getLayout()), false);
    grid.removeTile('n1');
    check('removing deletes', grid.getLayout(), []);
    check('nothing is hidden', grid.getHiddenManagedTiles(), []);
    container.querySelector('.reset-layout-btn').click();
    ok('Reset still asks the embedder to confirm',
        events.some(([n]) => n === 'grid:reset-layout-confirm'));
    ok('and restores nothing by itself', !events.some(([n]) => n === 'grid:managed-tiles-restored'));
    grid.dispose();
}

// ── §7 the managed set arrives after the layout ─────────────────────────
console.log('§7 a layout loaded before the managed set is declared waits for it');
const SAVED_EARLY = [
    { id: 'lead', type: 'seat', x: 0, y: 0, w: 6, h: 4, config: { seat: 'lead' }, managed: true },
    { id: 'gone', type: 'seat', x: 6, y: 0, w: 6, h: 4, config: { seat: 'gone' }, managed: true },
    { id: 'mine', type: 'note', x: 0, y: 4, w: 4, h: 2, config: {} },
    { id: 'closed', type: 'seat', w: 8, h: 5, managed: true, hidden: true },
];
for (const [how, open] of [
    ['`setLayout` and then `setManagedTiles`', () => { const m = mount(); m.grid.setLayout(SAVED_EARLY); return m; }],
    ['`managedTiles: []` with `layout:`', () => mount({ managedTiles: [], layout: SAVED_EARLY })],
]) {
    const { grid, saves } = open();
    ok(`${how}: before the set, the saved managed entries keep their marker`,
        grid.getLayout().filter(l => l.managed).map(l => l.id).join() === 'lead,gone,closed');
    ok(`${how}: a hidden one is not built yet`, !grid.tiles.has('closed'));
    const r = grid.setManagedTiles(declare(['lead', 'closed']));
    check(`${how}: the declaration drops the entry whose id left the set`, r.removed, ['gone']);
    check(`${how}: and keeps the declared one and the user's own tile`, ids(grid).slice(0, 2), ['lead', 'mine']);
    ok(`${how}: the declared one is managed now`, grid.isManaged('lead') && !grid.isManaged('gone'));
    check(`${how}: the hidden one is shown again at its saved size (an opening)`,
        [at(grid, 'closed')?.w, at(grid, 'closed')?.h], [8, 5]);
    ok(`${how}: and the next save has neither \'gone\' nor an unmanaged copy of it`,
        !saves.at(-1).some(l => l.id === 'gone'));
    grid.dispose();
}
{
    const { grid } = mount();
    grid.setLayout(SAVED_EARLY);
    grid.removeTile('lead');
    ok('a not-yet-settled tile removed before the set arrives is hidden, not deleted',
        grid.getLayout().some(l => l.id === 'lead' && l.hidden && l.w === 6));
    grid.setManagedTiles(declare(['lead']));
    check('and comes back at its size when the set settles it',
        [at(grid, 'lead').w, at(grid, 'lead').h], [6, 4]);
    grid.dispose();
}

console.log(failures ? `\ntiles managed: ${failures} FAILED\n` : '\ntiles managed: all passed\n');
process.exit(failures ? 1 : 0);
