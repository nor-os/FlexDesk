/**
 * ══ A CATALOG SOURCE LISTED ONLY BEHIND ITS PREFIX (0.17.2) ═════════════
 *
 *   §1  createEntityCatalog accepts a per-source `scopedOnly: true`, keeps it
 *       on the frozen source, and refuses a non-boolean
 *   §2  the flat palette: a plain typed query lists no scopedOnly row; its
 *       prefix (`help: solver`, an alias, an empty `help:`) lists them
 *   §3  the grouped palette: the same, with no group and no *Show all* for
 *       the held-back kind, and none in `>` commands; the prefix lists them
 *   §4  sources without the option are searched exactly as before: the rows
 *       of a catalog with a scopedOnly source added equal the rows of the
 *       same catalog without it, and `scopedOnly: false` is no option at all
 *   §5  the mark stays inside: a picked scopedOnly row reaches onPick
 *       without it, and a cached catalogue is held back the same way
 *
 *     node tests/command_palette_scoped_only.test.mjs
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
    console.log('command palette scopedOnly: SKIPPED — needs jsdom '
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
    kinds: {
        home:  { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
        model: { label: 'Model', plural: 'Models', icon: 'schema', topNav: 'home' },
        topic: { label: 'Topic', plural: 'Topics', icon: 'help', topNav: 'home' },
    },
});

const MODELS = [{ id: 'm1', n: 'Solver test' }, { id: 'm2', n: 'Population' }, { id: 'm3', n: 'Solar output' }];
const TOPICS = [{ id: 'h1', n: 'Solver settings' }, { id: 'h2', n: 'Solar constants' }, { id: 'h3', n: 'Getting started' },
                { id: 'h4', n: 'Solver tolerances' }, { id: 'h5', n: 'Solver choice' }, { id: 'h6', n: 'Solver errors' }];
const modelSource = () => ({ navKind: 'model', list: async () => MODELS, shape: (r) => ({ id: r.id, label: r.n }) });
const topicSource = (extra = {}) => ({ navKind: 'topic', list: async () => TOPICS,
                                       shape: (r) => ({ id: r.id, label: r.n, hint: 'help' }), ...extra });

const scopedCatalog = createEntityCatalog({
    sources: [modelSource(), topicSource({ scopedOnly: true })],
    aliases: { help: ['topic'] },
});

const opened = [];
const wm = {
    openInPrimary: (kind, props) => opened.push({ kind, props }),
    isPanelOpen: () => false,
    getPanelAvailability: () => ({ available: true, reason: null }),
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
const labels = () => $$('.twm-cmdpal__item .twm-cmdpal__label').map((l) => l.textContent.trim());
const headers = () => $$('.twm-cmdpal__group').map((g) => g.textContent.trim());
const chip = () => $('.twm-cmdpal__type-chip-label')?.textContent.trim() || null;
const isTopic = (l) => TOPICS.some((t) => t.n === l);
const isModel = (l) => MODELS.some((m) => m.n === l);

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 createEntityCatalog accepts scopedOnly');
{
    ok('scopedOnly: true is accepted and kept on the source', scopedCatalog.get('topic').scopedOnly === true);
    ok('a source without it has none', scopedCatalog.get('model').scopedOnly === undefined);
    let threw = null;
    try { createEntityCatalog({ sources: [topicSource({ scopedOnly: 'yes' })] }); } catch (err) { threw = err; }
    ok('a non-boolean scopedOnly is refused', threw instanceof TypeError && /scopedOnly/.test(threw.message), String(threw));
    ok('loadAll still returns every source, scoped or not',
       (await scopedCatalog.loadAll(api)).filter((r) => r.kind === 'topic').length === TOPICS.length);
    ok('its prefix resolves as any other', JSON.stringify(scopedCatalog.resolveTypePrefix('topic')) === '["topic"]'
       && JSON.stringify(scopedCatalog.resolveTypePrefix('help')) === '["topic"]');
}

// ── §2 ───────────────────────────────────────────────────────────────────
console.log('§2 the flat palette');
{
    const p = createCommandPalette({ wm, api, taxonomy, catalog: scopedCatalog });
    await p.open(); await tick();
    type('sol');
    ok('a plain query lists the other source', labels().includes('Solver test') && labels().includes('Solar output'), labels().join('|'));
    ok('a plain query lists no scopedOnly row', !labels().some(isTopic), labels().join('|'));
    type('started');
    ok('not even when only it would match', labels().length === 0, labels().join('|'));
    type('topic: solver');
    ok('its navKind prefix makes the chip', chip() === 'Topic', chip());
    ok('…and lists its rows', labels().length === 4 && labels().every(isTopic), labels().join('|'));
    key('Backspace'); type(''); key('Backspace');
    ok('Backspace leaves the chip', chip() === null);
    type('help: solver');
    ok('an alias that resolves to it lists its rows', labels().length === 4 && labels().every(isTopic), labels().join('|'));
    type(''); key('Backspace');
    type('help:');
    ok('an empty prefix lists every row of the source', labels().length === TOPICS.length && labels().every(isTopic),
       labels().join('|'));
    p.close();
}

// ── §3 ───────────────────────────────────────────────────────────────────
console.log('§3 the grouped palette');
{
    const p = createCommandPalette({
        wm, api, taxonomy, catalog: scopedCatalog, layout: 'grouped', groupCap: 2,
        chrome: { pages: false, panels: false },
        commands: () => [{ id: 'solve', label: 'Solve now', action: () => {} }],
    });
    await p.open(); await tick();
    type('sol');
    ok('a plain query lists the other source and the commands',
       labels().includes('Solver test') && labels().includes('Solve now'), labels().join('|'));
    ok('no scopedOnly row, no group header for it', !labels().some(isTopic) && !headers().includes('Topics'),
       `${headers().join('|')} / ${labels().join('|')}`);
    ok('no Show all for it', !$$('.twm-cmdpal__item--more').some((el) => /topics/i.test(el.textContent)));
    type('>sol');
    ok('`>` lists commands only, as before', labels().join('|') === 'Solve now', labels().join('|'));
    type('help: solver');
    ok('its prefix makes the chip with the taxonomy word', chip() === 'Topics', chip());
    ok('…and lists all its rows, uncapped', labels().length === 4 && labels().every(isTopic), labels().join('|'));
    type(''); key('Backspace');
    type('topic:');
    ok('an empty prefix lists every row of the source', labels().length === TOPICS.length && labels().every(isTopic),
       labels().join('|'));
    p.close();
}

// ── §4 ───────────────────────────────────────────────────────────────────
console.log('§4 sources without the option are searched as before');
async function rowsFor(catalog, layout, queries) {
    const out = {};
    const p = createCommandPalette({ wm, api, taxonomy, catalog, layout,
                                     chrome: { pages: false, panels: false } });
    await p.open(); await tick();
    for (const q of queries) {
        type(q);
        out[q] = labels().join('|');
        while (chip()) { type(''); key('Backspace'); }
    }
    p.close();
    return out;
}
{
    const queries = ['sol', 'pop', 'o', 'model: s', 'model:'];
    const modelsOnly = createEntityCatalog({ sources: [modelSource()] });
    const withFalse = createEntityCatalog({ sources: [modelSource(), topicSource({ scopedOnly: false })] });
    const without   = createEntityCatalog({ sources: [modelSource(), topicSource()] });
    for (const layout of ['flat', 'grouped']) {
        const base = await rowsFor(modelsOnly, layout, queries);
        const scoped = await rowsFor(scopedCatalog, layout, queries);
        ok(`${layout}: adding a scopedOnly source changes no other row`,
           JSON.stringify(base) === JSON.stringify(scoped), `${JSON.stringify(base)} vs ${JSON.stringify(scoped)}`);
        ok(`${layout}: scopedOnly: false is the same as no option`,
           JSON.stringify(await rowsFor(withFalse, layout, queries)) === JSON.stringify(await rowsFor(without, layout, queries)));
        const plain = await rowsFor(without, layout, ['sol']);
        ok(`${layout}: an unmarked source still competes on a plain query`,
           plain.sol.split('|').some(isTopic) && plain.sol.split('|').some(isModel), plain.sol);
    }
}

// ── §5 ───────────────────────────────────────────────────────────────────
console.log('§5 the mark stays inside');
{
    const picks = [];
    const p = createCommandPalette({ wm, api, taxonomy, catalog: scopedCatalog, layout: 'grouped', cache: true,
                                     onPick: (pick) => { picks.push(pick); return true; } });
    await p.open(); await tick();
    type('help: getting');
    key('Enter');
    ok('the picked row reaches onPick', picks[0]?.id === 'h3' && picks[0]?.kind === 'topic', JSON.stringify(picks[0]));
    ok('…without the internal mark', picks[0] && !Object.keys(picks[0]).some((k) => k.startsWith('_')),
       JSON.stringify(picks[0]));
    // A re-open draws the cached catalogue first: it is held back the same way.
    const opening = p.open();
    type('started');
    ok('a cached catalogue holds the row back too', !labels().some(isTopic), labels().join('|'));
    await opening; await tick();
    type('started');
    ok('…and so does the reloaded one', !labels().some(isTopic), labels().join('|'));
    p.close();
}

if (failures) {
    console.log(`\ncommand palette scopedOnly: ${failures} FAILED`);
    process.exit(1);
}
console.log('\ncommand palette scopedOnly: all assertions passed');
