/**
 * FlexDesk — the standalone demo. THE ACID TEST of the whole extraction.
 *
 * This file boots the tiling window manager, the command palette, the panels and
 * the DataTable against:
 *
 *   - a MOCK HOST     (an in-memory Map — no pywebview, no HTTP, no Python)
 *   - a FAKE ONTOLOGY (planets and moons — no agents, no markets, no economics)
 *   - a MOCK BACKEND  (a plain object; the library never calls a method on it)
 *
 * and imports NOTHING from ui/js/ecoagent/. Not one module. If this page renders
 * a working shell, the framework is a library. If it cannot, then P0-P4 produced
 * an elaborate directory rename and nothing more.
 *
 * The import purity is not a promise, it is enforced: the repo's lint_demo_purity check
 * walks the transitive import closure of this file and fails if a single
 * ecoagent/ module appears in it.
 */

// The demo consumes the BUILT PACKAGE — the same four entry points EcoAgent
// consumes and the same artifact npm publishes. Importing twm's source files
// here would test a directory; importing @flexdesk/* tests the library.
import { createShell, createTaxonomy, createEntityCatalog } from '@flexdesk/wm';
import { createHost } from '@flexdesk/host';
import { DataTable } from '@flexdesk/widgets';
import { EventBus } from '@flexdesk/core';

// ── The data. An ontology with nothing whatsoever to do with economics. ──────

const PLANETS = [
    { id: 'mercury', label: 'Mercury', moons: 0,  au: 0.39, day: 4223 },
    { id: 'venus',   label: 'Venus',   moons: 0,  au: 0.72, day: 2802 },
    { id: 'earth',   label: 'Earth',   moons: 1,  au: 1.00, day: 24 },
    { id: 'mars',    label: 'Mars',    moons: 2,  au: 1.52, day: 24.7 },
    { id: 'jupiter', label: 'Jupiter', moons: 95, au: 5.20, day: 9.9 },
    { id: 'saturn',  label: 'Saturn',  moons: 146, au: 9.58, day: 10.7 },
    { id: 'uranus',  label: 'Uranus',  moons: 28, au: 19.2, day: 17.2 },
    { id: 'neptune', label: 'Neptune', moons: 16, au: 30.1, day: 16.1 },
];

const MOONS = [
    { id: 'earth/luna',       label: 'Luna',      planet: 'earth',   km: 3475 },
    { id: 'mars/phobos',      label: 'Phobos',    planet: 'mars',    km: 22 },
    { id: 'mars/deimos',      label: 'Deimos',    planet: 'mars',    km: 12 },
    { id: 'jupiter/io',       label: 'Io',        planet: 'jupiter', km: 3643 },
    { id: 'jupiter/europa',   label: 'Europa',    planet: 'jupiter', km: 3122 },
    { id: 'jupiter/ganymede', label: 'Ganymede',  planet: 'jupiter', km: 5268 },
    { id: 'jupiter/callisto', label: 'Callisto',  planet: 'jupiter', km: 4821 },
    { id: 'saturn/titan',     label: 'Titan',     planet: 'saturn',  km: 5150 },
    { id: 'saturn/enceladus', label: 'Enceladus', planet: 'saturn',  km: 504 },
    { id: 'neptune/triton',   label: 'Triton',    planet: 'neptune', km: 2707 },
];

// ── The taxonomy. Its own root, its own naming convention. ───────────────────

const taxonomy = createTaxonomy({
    root: 'cosmos',
    kinds: {
        cosmos: { label: 'Cosmos', icon: 'public', isTopNav: true, order: 10,
                  sources: ['planet', 'moon'] },
        planets: { label: 'Planets', icon: 'circle', isTopNav: true, order: 20,
                   sources: ['planet'] },
        moons:   { label: 'Moons', icon: 'nightlight', isTopNav: true, order: 30,
                   sources: ['moon'] },
        planet: { label: 'Planet', icon: 'circle', topNav: 'planets' },
        moon: {
            label: 'Moon', icon: 'nightlight', topNav: 'moons',
            // "<planet>/<moon>" — NOT EcoAgent's "<archetype>.<instance>".
            // The WM asks the taxonomy for parents; it names no convention itself.
            ancestors: ({ id }) => {
                const i = String(id ?? '').indexOf('/');
                return i > 0 ? [{ kind: 'planet', id: String(id).slice(0, i) }] : [];
            },
        },
    },
});

// ── The entity catalog: what the command palette searches. ───────────────────

const entities = createEntityCatalog({
    sources: [
        { navKind: 'planet',
          list:  async () => PLANETS,
          shape: (p) => ({ kind: 'planet', id: p.id, label: p.label, icon: 'circle' }) },
        { navKind: 'moon',
          list:  async () => MOONS,
          shape: (m) => ({ kind: 'moon', id: m.id, label: m.label, icon: 'nightlight',
                           hint: m.planet }) },
    ],
});

// ── The host. An in-memory Map. No pywebview, no HTTP, no Python. ────────────
//
// `window` and `dialogs` are simply ABSENT — createHost allows that, and the
// framework degrades: no native chrome buttons, CSV export falls back to a Blob
// download. That is the contract working, not a gap.

const store = new Map();
const host = createHost({
    state: {
        async read(key) { return store.get(key) ?? null; },
        async write(key, value) { store.set(key, value); return true; },
    },
});

// ── Content. Each kind renders into a tile. ─────────────────────────────────

const note = (hostEl, title, body) => {
    const el = document.createElement('div');
    el.style.cssText = 'padding:14px 16px; color:var(--text-2); max-width:60ch; line-height:1.5;';
    el.innerHTML = `<div style="font-weight:600; color:var(--text-1); margin-bottom:6px;">${title}</div>`
                 + `<div style="font-size:12px;">${body}</div>`;
    hostEl.appendChild(el);
};

const table = (hostEl, headers, rows) => {
    const el = document.createElement('div');
    // NORMAL FLOW, not `position:absolute; inset:0`.
    //
    // A tile body is not a positioning context — it is a flex column. Absolutely
    // positioning content inside one makes it escape the tile and lay itself out
    // against the viewport, which looks fine with a single tile and paints straight
    // over your panels the moment there are four. (I shipped exactly that bug in the
    // first cut of this demo; it is the kind of thing a screenshot catches and a test
    // does not.)
    el.style.cssText = 'height:100%; display:flex; flex-direction:column; min-height:0;';
    hostEl.appendChild(el);
    new DataTable(el, { headers, rows, showExportButton: true }).render();
};

const content = {
    // The WM asks the content registry for its panels by kind. Register them or you
    // get the placeholder — which is the registry working, but it reads like a bug.
    'panel:left':   (hostEl) => note(hostEl, 'Left panel',
        'Anything you like lives here. The WM only asks the content registry for a '
        + 'factory named `panel:left`; it has no idea what a panel contains.'),
    'panel:right':  (hostEl) => note(hostEl, 'Right panel',
        'Panels dock, toggle and persist through the Host. This one is a div.'),
    'panel:bottom': (hostEl) => note(hostEl, 'Bottom panel',
        'Press the panel buttons in the top bar, or split a tile, or hit the command '
        + 'palette and search for a moon.'),

    cosmos: (hostEl) => table(hostEl,
        ['Body', 'Kind', 'Parent'],
        [...PLANETS.map(p => [p.label, 'planet', '—']),
         ...MOONS.map(m => [m.label, 'moon', m.planet])]),

    planets: (hostEl) => table(hostEl,
        ['Planet', 'Moons', 'Distance (AU)', 'Day (h)'],
        PLANETS.map(p => [p.label, String(p.moons), p.au.toFixed(2), String(p.day)])),

    moons: (hostEl) => table(hostEl,
        ['Moon', 'Planet', 'Diameter (km)'],
        MOONS.map(m => [m.label, m.planet, String(m.km)])),

    planet: (hostEl, props) => {
        const p = PLANETS.find(x => x.id === props?.id) ?? PLANETS[0];
        table(hostEl, ['Property', 'Value'], [
            ['Name', p.label], ['Moons', String(p.moons)],
            ['Distance (AU)', p.au.toFixed(2)], ['Day length (h)', String(p.day)],
        ]);
    },

    moon: (hostEl, props) => {
        const m = MOONS.find(x => x.id === props?.id) ?? MOONS[0];
        table(hostEl, ['Property', 'Value'], [
            ['Name', m.label], ['Orbits', m.planet], ['Diameter (km)', String(m.km)],
        ]);
    },
};

// ── Boot. ───────────────────────────────────────────────────────────────────

const shell = await createShell({
    root: document.getElementById('demo-root'),
    taxonomy,
    entities,
    content,
    host,
    api: {},                       // an opaque handle; the library never calls it
    eventBus: new EventBus(),
    rootCrumb: { label: 'Cosmos', icon: 'public' },
    palette: { placeholder: 'Search planets and moons…' },

    // Chrome is ELEMENTS, not selectors. The library never guesses at someone
    // else's markup; it paints into the nodes it is handed, and skips whatever
    // it is not given.
    chrome: {
        topNav:        document.getElementById('top-nav'),
        paletteButton: document.getElementById('palette-btn'),
        desktops:      document.getElementById('desktops'),
        panelToggles:  { host: document.getElementById('panel-toggles') },
    },
});

// Published so the UI harness can drive it, exactly as EcoAgent's shell does.
window.__twm = shell;
window.__demoReady = true;
