/**
 * ══ C39. THE COMMAND PALETTE FINDS ANYTHING ═════════════════════════════
 *
 *   §1  no option passed: the chip strip, the toggles, the flat rows and the
 *       old footer are all still there (the change is additive)
 *   §2  `chrome: {pages:false, panels:false}` leaves nothing between the
 *       input and the list
 *   §3  before typing: `empty()` rows under Recent, and the tips
 *   §4  groups: a header per kind (the taxonomy's plural), ordered by best
 *       hit, capped, with *Show all N* that scopes; Backspace leaves
 *   §5  matching: word starts (`ord li`), marks, `context` drawn but not
 *       searched, `keywords` searched but not drawn
 *   §6  commands: not before two characters, `>` restricts to them, an
 *       `action` runs
 *   §7  Enter / Ctrl+Enter / Shift+Enter → onPick modes
 *   §8  drill: Tab enters a scope, the remote answer is drawn, a stale one
 *       is not, Backspace leaves
 *   §9  cache: a re-open draws the previous catalogue before the reload
 *   §10 a click survives the pointer moving between press and release
 *
 *     node tests/command_palette_grouped.test.mjs
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
    console.log('command palette grouped: SKIPPED — needs jsdom '
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

const { createCommandPalette, matchLabel } = await import('../src/tiling/command_palette.js');
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
    kinds: {
        home:      { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
        boards:    { label: 'Boards', icon: 'dashboard', isTopNav: true, order: 1 },
        table:     { label: 'Table', plural: 'Tables', icon: 'table', topNav: 'home' },
        dashboard: { label: 'Dashboard', plural: 'Dashboards', icon: 'dashboard', topNav: 'boards' },
        column:    { label: 'Column', plural: 'Columns', icon: 'view_column', topNav: 'home' },
    },
});

const TABLES = ['Customers', 'Customer contacts', 'Customer segments', 'Customer notes',
                'Customer visits', 'Orders', 'Order lines'];
let loads = 0;
let gate = null;          // a promise loadAll waits on, when a test wants it held
const catalog = createEntityCatalog({
    sources: [
        { navKind: 'table', list: async () => { loads++; if (gate) await gate; return TABLES.map((n, i) => ({ id: `t${i}`, n })); },
          shape: (r) => ({ id: r.id, label: r.n, context: 'Sales', keywords: r.n === 'Orders' ? 'purchase' : '',
                           modes: ['split', 'window'], drillLabel: 'search rows' }) },
        { navKind: 'dashboard', list: async () => [{ id: 'd1', n: 'Customer health' }, { id: 'd2', n: 'Weekly sales' }],
          shape: (r) => ({ id: r.id, label: r.n, hint: 'a board' }) },
    ],
    aliases: { board: ['dashboard'] },
});

const opened = [];
const wm = {
    openInPrimary: (kind, props) => opened.push({ kind, props }),
    isPanelOpen: () => false,
    togglePanel: () => {},
    content: { has: () => true },
};
const api = {};

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
const headers = () => $$('.twm-cmdpal__group').map((g) => g.textContent.trim());
const labels = () => $$('.twm-cmdpal__item .twm-cmdpal__label').map((l) => l.textContent.trim());

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 no option: the palette is the old palette');
{
    const p = createCommandPalette({ wm, api, taxonomy, catalog, placeholder: 'Find…' });
    await p.open(); await tick();
    ok('the chip strip is drawn with a chip per top-nav kind', $$('.twm-cmdpal__chips [data-shortcut]').length === 2);
    ok('the panel toggles are drawn', $$('.twm-cmdpal__toggles [data-toggle]').length === 3);
    ok('no grouped class', !$('.twm-cmdpal--grouped'));
    ok('the old footer', /navigate/.test($('.twm-cmdpal__footer').textContent));
    type('cust');
    ok('flat rows, no group headers', $$('.twm-cmdpal__item').length > 0 && headers().length === 0);
    ok('the raw kind is printed, as before', $('.twm-cmdpal__kind').textContent === 'table');
    ok('no <mark> in the flat layout', !$('.twm-cmdpal__label mark'));
    p.close();
}

const picks = [];
let actionRan = null;
let searches = [];
const drill = (row) => row.kind === 'table' ? {
    id: `rows:${row.id}`, label: `${row.label} › rows`, icon: 'table',
    search: (q, signal) => new Promise((resolve, reject) => {
        searches.push({ q, resolve, reject, signal });
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
} : null;

function grouped(extra = {}) {
    return createCommandPalette({
        wm, api, taxonomy, catalog, placeholder: 'Search everything…',
        chrome: { pages: false, panels: false }, layout: 'grouped', groupCap: 3,
        empty: async () => [{ kind: 'dashboard', id: 'd2', label: 'Weekly sales' }],
        commands: () => [{ id: 'new-table', label: 'New table', action: () => { actionRan = 'new-table'; } },
                         { id: 'cust-cmd', label: 'Customise', context: 'interface' },
                         { id: 'lineage', label: 'Lineage', kind: 'page', group: 'go', groupLabel: 'Go to', verb: 'go' },
                         { id: 'cs', label: 'Customers settings', kind: 'page', group: 'go', groupLabel: 'Go to' }],
        tips: ['> commands'],
        footerNote: 'Searches this project',
        onPick: (pick, how) => { picks.push({ pick, how }); return true; },
        drill,
        ...extra,
    });
}

// ── §2, §3 ───────────────────────────────────────────────────────────────
console.log('§2 chrome off, §3 the empty box');
{
    const p = grouped();
    await p.open(); await tick();
    ok('no chip strip element at all', !$('.twm-cmdpal__chips'));
    ok('no toggles element at all', !$('.twm-cmdpal__toggles'));
    const kids = [...$('.twm-cmdpal').children].map((c) => c.className.split(' ')[0]);
    ok('input row → list → footer, nothing else', kids.join(',') === 'twm-cmdpal__inputrow,twm-cmdpal__list,twm-cmdpal__footer', kids.join(','));
    ok('Recent header over the empty() rows', headers()[0] === 'Recent' && labels()[0] === 'Weekly sales');
    ok('the tips are drawn when nothing is typed', /commands/.test($('.twm-cmdpal__tips')?.textContent || ''));
    ok('the footer note', /Searches this project/.test($('.twm-cmdpal__footer').textContent));
    p.close();
}

// ── §4, §5 ───────────────────────────────────────────────────────────────
console.log('§4 groups, §5 matching');
{
    const p = grouped();
    await p.open(); await tick();
    type('cust');
    ok('groups use the plural label', headers().includes('Tables') && headers().includes('Dashboards'), headers().join('|'));
    ok('objects before commands they tie with (Tables first, Commands after)', headers()[0] === 'Tables'
       && headers().indexOf('Commands') > headers().indexOf('Tables'), headers().join('|'));
    ok('the shortest prefix match leads its group', labels()[0] === 'Customers', labels().join('|'));
    ok('capped at groupCap, with Show all N', $$('.twm-cmdpal__item--more').length === 1
        && /Show all 5 tables/.test($('.twm-cmdpal__item--more').textContent));
    ok('commands compete from two characters (Customise is listed)', labels().includes('Customise'));
    ok('the kind is the taxonomy word', $$('.twm-cmdpal__kind').some((k) => k.textContent === 'Table'));
    ok('matched characters are marked', $('.twm-cmdpal__label mark')?.textContent.toLowerCase() === 'cust');
    // Show all: arrow down to it and press Enter.
    const idx = $$('.twm-cmdpal__item').findIndex((el) => el.classList.contains('twm-cmdpal__item--more'));
    for (let i = 0; i < idx; i++) key('ArrowDown');
    key('Enter');
    ok('Show all scopes to the group (chip drawn)', /Tables/.test($('.twm-cmdpal__type-chip')?.textContent || ''));
    ok('scoped: all five tables, no cap, no other group', labels().length === 5 && headers().join() === 'Tables', labels().join('|'));
    ok('the palette stayed open', !!$('#twm-cmdpal'));
    type('');
    key('Backspace');
    ok('Backspace on an empty input leaves the scope', !$('.twm-cmdpal__type-chip'));

    type('ord li');
    ok('`ord li` finds Order lines by word starts', labels()[0] === 'Order lines', labels().join('|'));
    const marks = () => $$('.twm-cmdpal__item--active mark').map((m) => m.textContent).join('+');
    ok('both words marked', marks() === 'Ord+li', marks());
    type('ord ln');
    ok('`ord ln` still finds it, as a subsequence', labels()[0] === 'Order lines' && marks() === 'Ord+l+n', marks());
    type('sales');
    ok('`context` is drawn but not searched (Sales is no table\'s name)', !labels().some((l) => TABLES.includes(l)), labels().join('|'));
    ok('a hint-only row is still searched by its hint (legacy meaning)', (type('a board'), labels().includes('Customer health')));
    type('purchase');
    ok('`keywords` are searched', labels()[0] === 'Orders');
    ok('…but not drawn', !/purchase/.test($('.twm-cmdpal__list').textContent));
    type('customers');
    ok('an object leads a page that only shares its prefix', headers()[0] === 'Tables' && labels()[0] === 'Customers', headers().join('|'));
    type('lineage');
    ok('a row may name its group (`groupLabel`)', headers()[0] === 'Go to', headers().join('|'));
    type('board:');
    ok('`board:` still resolves through the catalogue aliases', /Dashboards/.test($('.twm-cmdpal__type-chip')?.textContent || '')
        && labels().join() === 'Customer health,Weekly sales', labels().join('|'));
    p.close();
}

// ── §6 ───────────────────────────────────────────────────────────────────
console.log('§6 commands');
{
    const p = grouped();
    await p.open(); await tick();
    type('n');
    ok('one character: no command', !labels().includes('New table'));
    type('>');
    ok('`>` alone lists every command', labels().includes('New table') && labels().includes('Keyboard shortcuts')
        && !labels().includes('Customers'));
    type('>new');
    ok('`>new` → only New table', labels().join() === 'New table', labels().join('|'));
    ok('a command shows "run" on the active row', /run/.test($('.twm-cmdpal__item--active .twm-cmdpal__acts').textContent));
    key('Enter');
    ok('the action ran and the palette closed', actionRan === 'new-table' && !$('#twm-cmdpal'));
}

// ── §7 ───────────────────────────────────────────────────────────────────
console.log('§7 pick modes');
for (const [mods, mode] of [[{}, 'open'], [{ ctrlKey: true }, 'split'], [{ shiftKey: true }, 'window']]) {
    const p = grouped();
    await p.open(); await tick();
    type('orders');
    picks.length = 0;
    key('Enter', mods);
    ok(`Enter ${JSON.stringify(mods)} → mode '${mode}'`, picks[0]?.how.mode === mode && picks[0]?.pick.id === 't5',
       JSON.stringify(picks[0]?.how));
    ok('the pick carries no private fields', picks[0] && !('_hits' in picks[0].pick) && !('_score' in picks[0].pick));
}
{
    const p = grouped();
    await p.open(); await tick();
    type('orders');
    const acts = $('.twm-cmdpal__item--active .twm-cmdpal__acts').textContent;
    ok('the active row lists its keys (Tab, split, window)', /Tab/.test(acts) && /split/.test(acts) && /window/.test(acts), acts);
    p.close();
}

// ── §8 ───────────────────────────────────────────────────────────────────
console.log('§8 drill-in');
{
    const p = grouped();
    await p.open(); await tick();
    type('customers');
    key('Tab');
    ok('Tab enters the scope (chip + placeholder)', /Customers › rows/.test($('.twm-cmdpal__type-chip')?.textContent || '')
        && /Customers › rows/.test(input().placeholder));
    ok('the input was cleared', input().value === '');
    searches = [];
    type('br');
    type('bra');
    await tick(200);
    ok('one debounced search for the last value', searches.length === 1 && searches[0].q === 'bra', searches.map((s) => s.q).join('|'));
    searches[0].resolve([{ kind: 'row', id: 'r1', label: 'Brandt & Söhne', cells: ['C-1', 'Zurich'] }]);
    await tick();
    ok('the answer is drawn with its cells', labels()[0] === 'Brandt & Söhne' && /C-1 · Zurich/.test($('.twm-cmdpal__cells')?.textContent || ''));
    ok('& is escaped, and the match marked', $('.twm-cmdpal__label').innerHTML.includes('&amp;') && $('.twm-cmdpal__label mark')?.textContent === 'Bra');

    // A slow answer for "x" must not land over the answer for "xy".
    type('x');
    await tick(200);
    const slow = searches[searches.length - 1];
    type('xy');
    await tick(200);
    const fast = searches[searches.length - 1];
    ok('the earlier request was aborted', slow.signal?.aborted === true);
    fast.resolve([{ kind: 'row', id: 'r2', label: 'Xylo AG' }]);
    await tick();
    slow.resolve([{ kind: 'row', id: 'r3', label: 'STALE' }]);
    await tick();
    ok('the stale answer is never drawn', labels().join() === 'Xylo AG', labels().join('|'));
    picks.length = 0;
    key('Enter');
    ok('a pick in a scope carries the scope id', picks[0]?.how.scope === 'rows:t0' && picks[0]?.pick.id === 'r2', JSON.stringify(picks[0]?.how));

    const p2 = grouped();
    await p2.open(); await tick();
    type('customers');
    key('Tab');
    type('');
    key('Backspace');
    ok('Backspace leaves the scope back to the catalogue', !$('.twm-cmdpal__type-chip') && input().placeholder === 'Search everything…');
    p2.close();
}

// ── §9 ───────────────────────────────────────────────────────────────────
console.log('§9 cache');
{
    const p = grouped({ cache: true });
    await p.open(); await tick();
    p.close();
    let release;
    gate = new Promise((r) => { release = r; });
    const opening = p.open();
    await tick();
    type('orders');
    ok('the previous catalogue answers while the reload is held', labels()[0] === 'Orders');
    release(); gate = null;
    await opening;
    p.invalidate();
    p.close();
    gate = new Promise((r) => { release = r; });
    const reopening = p.open();
    await tick();
    type('orders');
    ok('after invalidate(), nothing stale is drawn', !labels().includes('Orders'));
    release(); gate = null;
    await reopening;
    await tick();
    p.close();
}

// ── §10 ──────────────────────────────────────────────────────────────────
console.log('§10 a click survives pointer movement');
{
    const p = grouped();
    await p.open(); await tick();
    type('cust');
    const rows = $$('.twm-cmdpal__item');
    const target = rows[2];
    const before = target;
    const want = labels()[2];
    const fire = (type, el, extra = {}) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, ...extra }));
    picks.length = 0;
    fire('mousedown', target);
    fire('mousemove', target);
    ok('moving the pointer made the row active without rebuilding it',
       target.classList.contains('twm-cmdpal__item--active') && $$('.twm-cmdpal__item')[2] === before);
    fire('mouseup', target);
    fire('click', target, { ctrlKey: true });
    ok('the click committed that row in split mode', picks[0]?.pick.label === want && picks[0]?.how.mode === 'split',
       JSON.stringify(picks[0]));
}

// ── the scorer on its own ────────────────────────────────────────────────
console.log('scorer');
ok('exact > prefix > words > substring > subsequence',
   matchLabel('orders', 'orders').s > matchLabel('orders', 'ord').s
   && matchLabel('orders', 'ord').s > matchLabel('order lines', 'ord li').s
   && matchLabel('order lines', 'ord li').s > matchLabel('reorder', 'order').s
   && matchLabel('reorder', 'order').s > matchLabel('order lines', 'olns').s);
ok('`cust no` → customer_no', !!matchLabel('customer_no', 'cust no') && matchLabel('customer_no', 'cust no').s >= 70);
ok('letters strewn across a long label do not match', matchLabel('a very long label about nothing', 'avln') === null
   || matchLabel('a very long label about nothing', 'avln').s <= 30);
ok('no match → null', matchLabel('orders', 'zz') === null);

if (failures) {
    console.log(`\ncommand palette grouped: ${failures} FAILED`);
    process.exit(1);
}
console.log('\ncommand palette grouped: all assertions passed');
