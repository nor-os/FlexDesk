/**
 * ══ BUG-0003. FLEXDESK'S OWN WIDGETS PASS THE GUARD FLEXDESK SHIPS ═══════
 *
 * `DEFAULT_STATE_GUARD_CONFIG` had two defects: the `twm-` class rename had
 * rewritten allow-list strings (`twm-latex-tooltip`, `twm-node-name`, …) that
 * no element ever carries, and its camelCase entries never matched, because
 * the guard compares kebab-cased keys. And FlexDesk's widgets wrote data keys
 * the list did not name, so a strict guard threw out of `createShell`, every
 * dialog, a hidden required form row and a LaTeX tooltip.
 *
 *   §1  allow-list keys are compared kebab-cased, whichever spelling an
 *       embedder lists (`fooBar` and `foo-bar` are one key), in the global
 *       list and in module overrides (`allow()` and `config.moduleOverrides`);
 *       a capital letter maps as the DOM maps it (`rowID` is `row-i-d`)
 *   §2  the mangled entries are gone; the keys they stood for are allowed
 *   §3  EVERY literal data-attribute key written anywhere under `src/` passes
 *       a strict guard built from the defaults — a new widget key that is not
 *       listed fails here, not in an embedder's debug build
 *   §4  the record's steps, run for real under a strict guard: createShell
 *       (with a bottom panel), showChoiceDialog, a hidden required openForm
 *       row, a LaTeX tooltip, and a list tile — no throw and no violation
 *
 * ══ BUG-0029. THIRTEEN APPLICATION KEYS LEAVE THE DEFAULTS ═══════════════
 *
 * The same list also held thirteen keys that belonged to one embedding
 * application (`scenario-id`, `run-id`, `dsl-state`, …) and that no widget
 * under `src/` writes. A strict guard built from the defaults let every OTHER
 * application write them without a word. They are out of the defaults; an
 * application that wrote one lists it, as it lists any key of its own.
 *
 *   §5  none of the thirteen is in the defaults, in either spelling, and
 *       FlexDesk writes none (the §3 scan); a strict guard blocks and reports
 *       a write of each, as an attribute and as a dataset key, and the default
 *       `warn` guard reports it; the generic words they sat beside, and every
 *       key FlexDesk writes, are still allowed; the migration the docs show
 *       restores a removed key, listed kebab-case or camelCase; and the docs
 *       section lists exactly these thirteen
 *
 *     The defaults are NOT free of application keys, though: nine more that
 *     look like one application's (`series-id`, `dataset-id`, …) were not part
 *     of the change and no widget writes them, and the rest of the list has
 *     not been audited. So the prose (the docs, best practices item 15, the
 *     comment above the list) may not say the defaults carry no application's
 *     keys; it says the list is unaudited and that a strict guard built from
 *     the defaults lets such a key through, and the docs show how to filter
 *     keys out.
 *
 *     node tests/state_guard_defaults.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
         writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

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
    console.log('state guard defaults: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'DragEvent', 'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

const { StateGuardService } = await import('../src/core/state_guard.js');
const { DEFAULT_STATE_GUARD_CONFIG } = await import('../src/core/state_guard_config.js');
const { EventBus } = await import('../src/core/event_bus.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const section = (t) => console.log(`\n${t}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };
/** Every `data-*` attribute §3 finds a widget under src/ writing; §5 reads it. */
const writtenByFlexDesk = new Set();

/** A strict guard and the violations it reports. */
function strictGuard(config = DEFAULT_STATE_GUARD_CONFIG) {
    const bus = new EventBus();
    const violations = [];
    bus.on('state-guard:violation', (p) => violations.push(p?.attribute ?? p?.data?.attribute ?? p));
    const guard = new StateGuardService({ eventBus: bus, config: { ...config, mode: 'strict' } });
    return { guard, violations };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 allow-list keys are compared kebab-cased');
{
    strictGuard({
        ...DEFAULT_STATE_GUARD_CONFIG,
        allowedDatasetKeys: ['fooBar', 'baz-qux'],
        allowedAttributes: ['data-Upper-Case'],
    });
    const el = document.createElement('div');
    ok('a camelCase entry allows dataset.fooBar', !threw(() => { el.dataset.fooBar = '1'; }));
    ok('…and setAttribute("data-foo-bar")', !threw(() => el.setAttribute('data-foo-bar', '1')));
    ok('a kebab entry allows dataset.bazQux', !threw(() => { el.dataset.bazQux = '1'; }));
    ok('an attribute entry is case-insensitive', !threw(() => el.setAttribute('data-upper-case', '1')));
    ok('an unlisted key still throws', !!threw(() => { el.dataset.notListed = '1'; }));
}
{
    // A capital letter maps as the DOM maps it: '-' plus its lower-case form.
    strictGuard({ ...DEFAULT_STATE_GUARD_CONFIG, allowedDatasetKeys: ['rowID'] });
    const el = document.createElement('div');
    ok('a "rowID" entry allows dataset.rowID', !threw(() => { el.dataset.rowID = '1'; }));
    ok('…which is setAttribute("data-row-i-d")', !threw(() => el.setAttribute('data-row-i-d', '1')));
    ok('…and not setAttribute("data-rowid")', !!threw(() => el.setAttribute('data-rowid', '1')));
}
{
    // Module overrides normalise their keys the same way. The guard attributes
    // a write to the frame that made it, so the writes come from a fixture
    // module the overrides name.
    const dir = mkdtempSync(join(tmpdir(), 'flexdesk-state-guard-'));
    mkdirSync(join(dir, 'app'));
    const fixture = join(dir, 'app', 'writer.mjs');
    writeFileSync(fixture, [
        'export function writeDataset(el, key) { el.dataset[key] = "1"; }',
        'export function writeAttribute(el, name) { el.setAttribute(name, "1"); }',
        '',
    ].join('\n'));
    try {
        const writer = await import(pathToFileURL(fixture).href);
        const fromWriter = (el) => [
            ['dataset.fooBar', () => writer.writeDataset(el, 'fooBar')],
            ['setAttribute("data-foo-bar")', () => writer.writeAttribute(el, 'data-foo-bar')],
        ];

        const viaAllow = strictGuard();
        viaAllow.guard.allow('app/writer.mjs', [], { datasetKeys: ['fooBar'] });
        const a = document.createElement('div');
        for (const [what, fn] of fromWriter(a)) {
            const e = threw(fn);
            ok(`allow() with camelCase "fooBar" allows ${what} from that module`, !e, String(e?.message));
        }
        ok('…an unlisted key from that module still throws',
           !!threw(() => writer.writeDataset(a, 'notListed')));
        ok('…and "fooBar" is not allowed outside that module',
           !!threw(() => { a.dataset.fooBar = '1'; }));

        strictGuard({
            ...DEFAULT_STATE_GUARD_CONFIG,
            moduleOverrides: [{ pattern: 'app/writer.mjs', datasetKeys: ['fooBar'] }],
        });
        const b = document.createElement('div');
        for (const [what, fn] of fromWriter(b)) {
            const e = threw(fn);
            ok(`config.moduleOverrides with "fooBar" allows ${what} from that module`, !e,
               String(e?.message));
        }
        ok('…an unlisted key from that module still throws',
           !!threw(() => writer.writeDataset(b, 'notListed')));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 the mangled entries are gone');
{
    const all = [...DEFAULT_STATE_GUARD_CONFIG.allowedAttributes,
                 ...DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys];
    for (const bad of ['twm-has-tooltip', 'twm-collapsible-header', 'twm-collapsible-content',
                       'twm-latex-tooltip', 'twm-node-name']) {
        ok(`no "${bad}" entry`, !all.includes(bad));
    }
    ok('no camelCase dataset entry (they are spelled as the attribute is)',
       DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.every((k) => k === k.toLowerCase()),
       DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.filter((k) => k !== k.toLowerCase()).join(', '));
    strictGuard();
    const el = document.createElement('div');
    for (const key of ['latexTooltip', 'collapsibleHeader', 'collapsibleContent', 'nodeName']) {
        ok(`dataset.${key} passes the defaults`, !threw(() => { el.dataset[key] = '1'; }));
    }
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 every literal data key FlexDesk writes passes the defaults');
{
    const SRC = resolvePath(HERE, '../src');
    const files = [];
    const walk = (d) => {
        for (const n of readdirSync(d)) {
            const p = join(d, n);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.js')) files.push(p);
        }
    };
    walk(SRC);
    const camelToKebab = (k) => k.replace(/([A-Z])/g, '-$1').toLowerCase();
    const found = new Map();   // attribute -> first "file:line"
    const note = (attr, file, line) => {
        if (!found.has(attr)) found.set(attr, `${file.slice(SRC.length + 1)}:${line}`);
    };
    // Constants a file names its attribute through (`const TAIL = 'data-…'`).
    const CONST = /\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"](data-[a-z0-9-]+)['"]/g;
    const WRITE_DATASET = /\.dataset\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
    const DELETE_DATASET = /delete\s+[\w$.?]+\.dataset\.([A-Za-z_$][\w$]*)/g;
    const ATTR_CALL = /\.(?:setAttribute|removeAttribute|toggleAttribute)\(\s*(?:['"`](data-[a-z0-9-]+)['"`]|([A-Z_][A-Z0-9_]*)\s*[,)])/g;
    // A widget that writes `data-{dataKey}` (createTabs) names the key as an
    // option: its default (`dataKey = 'tab-id'`) and each caller's value.
    const DATA_KEY_OPTION = /\bdataKey\s*[:=]\s*['"]([a-z0-9-]+)['"]/g;
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        const consts = new Map([...text.matchAll(CONST)].map((m) => [m[1], m[2]]));
        text.split('\n').forEach((line, i) => {
            for (const m of line.matchAll(WRITE_DATASET)) note(`data-${camelToKebab(m[1])}`, file, i + 1);
            for (const m of line.matchAll(DELETE_DATASET)) note(`data-${camelToKebab(m[1])}`, file, i + 1);
            for (const m of line.matchAll(ATTR_CALL)) {
                const attr = m[1] ?? consts.get(m[2]);
                if (attr) note(attr, file, i + 1);
            }
            for (const m of line.matchAll(DATA_KEY_OPTION)) note(`data-${m[1]}`, file, i + 1);
        });
    }
    ok('the scan finds the keys the record names',
       ['data-twm-tabs', 'data-latex-tooltip', 'data-twm-required', 'data-action-idx',
        'data-action-value', 'data-pane'].every((a) => found.has(a)));
    ok('the scan resolves attribute constants', found.has('data-twm-flow-item'));
    for (const attr of found.keys()) writtenByFlexDesk.add(attr.slice('data-'.length));
    const { violations } = strictGuard();
    const el = document.createElement('div');
    const blocked = [];
    for (const [attr, where] of [...found].sort()) {
        if (threw(() => el.setAttribute(attr, 'x'))) blocked.push(`${attr} (${where})`);
    }
    ok(`all ${found.size} keys pass a strict default guard`, blocked.length === 0,
       `blocked: ${blocked.join(', ')}`);
    ok('…and report no violation', violations.length === 0);
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 the steps to reproduce, under a strict default guard');
{
    const { createShell } = await import('../src/tiling/shell.js');
    const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
    const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
    const { createBottomPanelTabs } = await import('../src/tiling/bottom_panel_tabs.js');
    const { showChoiceDialog } = await import('../src/ui/components/confirm_dialog.js');
    const { openForm } = await import('../src/ui/components/modal.js');
    const { TooltipService } = await import('../src/ui/utils/tooltip_service.js');
    const { ListTile } = await import('../src/tiles/list_tiles.js');

    const { violations } = strictGuard();

    let shell = null;
    const shellError = await (async () => {
        try {
            shell = await createShell({
                root: document.getElementById('root'),
                entities: createEntityCatalog({ sources: [] }),
                taxonomy: createTaxonomy({
                    kinds: { home: { label: 'Home' }, other: { label: 'Other' } }, root: 'home' }),
                content: {
                    home: (host) => { host.textContent = 'home'; return {}; },
                    other: (host) => { host.textContent = 'other'; return {}; },
                },
            });
            shell.wm.renderer.render();
            shell.wm.newTab();
            shell.wm.renderer.render();
            return null;
        } catch (e) { return e; }
    })();
    ok('createShell builds', !shellError, String(shellError?.message));
    ok('…and draws a leaf', !!document.querySelector('[data-leaf-id]'));

    const bpHost = document.createElement('div');
    document.body.appendChild(bpHost);
    const pane = (id) => ({ id, label: id, mount: (el) => { el.textContent = id; return {}; } });
    const bpError = threw(() => {
        const tabs = createBottomPanelTabs(bpHost, { panes: [pane('a'), pane('b')] });
        tabs.select?.('b');
    });
    ok('bottom panel tabs build', !bpError, String(bpError?.message));

    let choice = null;
    const choiceError = await (async () => {
        try {
            const pending = showChoiceDialog({
                title: 'Pick', message: 'which',
                actions: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two', variant: 'primary' }],
            });
            await tick();
            document.querySelector('[data-action-value="two"]').click();
            choice = await pending;
            return null;
        } catch (e) { return e; }
    })();
    ok('showChoiceDialog builds and resolves', !choiceError && choice === 'two',
       String(choiceError?.message ?? choice));

    const formError = await (async () => {
        try {
            let api = null;
            const pending = openForm({
                title: 'Form',
                fields: [{ name: 'kind', label: 'Kind' }, { name: 'need', label: 'Need', required: true }],
                onFieldChange: (_n, _v, a) => { api = a; },
            });
            await tick();
            api.setVisible('need', false);
            api.setVisible('need', true);
            document.querySelector('.twm-modal__form [data-action="cancel"]').click();
            await pending;
            return null;
        } catch (e) { return e; }
    })();
    ok('openForm hides and shows a required row', !formError, String(formError?.message));

    const tipError = threw(() => {
        const el = document.createElement('span');
        document.body.appendChild(el);
        TooltipService.set(el, 'x^2', true);
        TooltipService.set(el, 'plain');
    });
    ok('a LaTeX tooltip is set', !tipError, String(tipError?.message));

    const listError = threw(() => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const tile = new ListTile({ id: 'list-1', grid: null, config: {} });
        tile.mount(host);
        tile.setData({ rows: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }],
                       action: { label: 'All' } });
        if (!host.querySelector('[data-row-key="b"]') || !host.querySelector('[data-list-action]')) {
            throw new Error('the list tile drew no rows or action');
        }
    });
    ok('a list tile draws its rows and action', !listError, String(listError?.message));

    ok('no violation was reported', violations.length === 0, violations.join(', '));
    shell?.dispose?.();
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 thirteen application keys leave the defaults (BUG-0029)');
{
    // The thirteen keys that were taken out, no more and no fewer. They sat in
    // four groups the list labelled "Simulation/scenario state keys", "Scenario
    // editor keys", "Calibration page keys" and "DSL generator keys"; the other
    // keys of those groups are generic words and stay (below).
    const REMOVED = [
        'scenario-id', 'run-id', 'run-state',
        'mirror-input', 'mirror-input-bound', 'mirror-change-bound', 'override-type',
        'info-for',
        'dsl-state', 'dsl-section-registered', 'dsl-scrollbars-installed',
        'dsl-tabs-bound', 'dsl-controls-bound',
    ];
    const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const defaults = DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys;
    const names = (keys) => keys.join(', ');

    ok('there are thirteen, each once', REMOVED.length === 13 && new Set(REMOVED).size === 13);
    ok('none is in the defaults', REMOVED.every((k) => !defaults.includes(k)),
       `still listed: ${names(REMOVED.filter((k) => defaults.includes(k)))}`);
    ok('…nor under its camelCase spelling', REMOVED.every((k) => !defaults.includes(camel(k))));
    ok('FlexDesk writes none of them (the §3 scan found no widget doing so)',
       REMOVED.every((k) => !writtenByFlexDesk.has(k)),
       `a widget writes: ${names(REMOVED.filter((k) => writtenByFlexDesk.has(k)))} — keep that key`);
    ok('…and the scan did run (it found keys FlexDesk does write)',
       ['tab-id', 'twm-tabs', 'latex-tooltip', 'action-value'].every((k) => writtenByFlexDesk.has(k)));

    {
        const { violations } = strictGuard();
        const el = document.createElement('div');
        const quiet = [];
        for (const key of REMOVED) {
            const viaAttribute = threw(() => el.setAttribute(`data-${key}`, '1'));
            const viaDataset = threw(() => { el.dataset[camel(key)] = '1'; });
            if (!viaAttribute || !viaDataset) quiet.push(key);
        }
        ok('a strict guard blocks a write of each, as setAttribute and as a dataset key',
           quiet.length === 0, `let through: ${names(quiet)}`);
        ok('…and reports each',
           REMOVED.every((k) => violations.includes(`data-${k}`)),
           `unreported: ${names(REMOVED.filter((k) => !violations.includes(`data-${k}`)))}`);
        ok('…and removing one is refused too',
           REMOVED.every((k) => !!threw(() => el.removeAttribute(`data-${k}`))));
    }
    {
        // The default mode is warn, which is where most embedders will see this:
        // no throw, one violation per call.
        const bus = new EventBus();
        const seen = [];
        bus.on('state-guard:violation', (p) => seen.push(p.attribute));
        new StateGuardService({ eventBus: bus, config: DEFAULT_STATE_GUARD_CONFIG });
        const el = document.createElement('div');
        const thrown = REMOVED.filter((k) => threw(() => el.setAttribute(`data-${k}`, '1')));
        ok('the default (warn) guard does not throw on them', thrown.length === 0, names(thrown));
        ok('…and reports each', REMOVED.every((k) => seen.includes(`data-${k}`)));
    }

    // What stays. The generic words the removed keys sat beside in their groups
    // (they are not one application's), then the keys the owner has not decided
    // (written by no widget, but not the thirteen: see the record).
    const GENERIC = [
        'status', 'selected', 'active', 'disabled', 'expanded', 'collapsed', 'visible', 'hidden',
        'source', 'bound', 'field', 'key', 'column',
        'readonly', 'id', 'action', 'type', 'name', 'path', 'index', 'count', 'total', 'page',
        'sort', 'order', 'filter', 'search', 'value', 'label', 'title', 'description',
    ];
    const UNDECIDED = [
        'series-id', 'dataset-id', 'param-id', 'target-id', 'namespace', 'namespace-id',
        'playback-control', 'inline-hl', 'node-name',
    ];
    {
        const { violations } = strictGuard();
        const el = document.createElement('div');
        const blocked = [...GENERIC, ...UNDECIDED].filter(
            (k) => threw(() => el.setAttribute(`data-${k}`, '1'))
                || threw(() => { el.dataset[camel(k)] = '1'; }));
        ok('every generic key that stays is allowed, as setAttribute and as a dataset key',
           GENERIC.every((k) => !blocked.includes(k)), `blocked: ${names(blocked)}`);
        ok('…and so is every key not part of this change',
           UNDECIDED.every((k) => !blocked.includes(k)), `blocked: ${names(blocked)}`);
        ok('…without a violation', violations.length === 0, names(violations));
    }
    ok('the groups that held the thirteen are not labelled for one application',
       !/Simulation\/scenario|Scenario editor|Calibration page|DSL generator/i.test(
           readFileSync(resolvePath(HERE, '../src/core/state_guard_config.js'), 'utf8')),
       'a group comment in state_guard_config.js still names one');

    // The migration docs/concepts/state-guard.md shows: the defaults, plus the
    // application's own keys.
    const migrated = (extra) => strictGuard({
        ...DEFAULT_STATE_GUARD_CONFIG,
        allowedDatasetKeys: [...DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys, ...extra],
    });
    {
        migrated(['scenario-id', 'run-id']);
        const el = document.createElement('div');
        ok('listing "scenario-id" restores it as setAttribute', !threw(() => el.setAttribute('data-scenario-id', '1')));
        ok('…and as dataset.scenarioId', !threw(() => { el.dataset.scenarioId = '1'; }));
        ok('…and "run-id" with it', !threw(() => el.setAttribute('data-run-id', '1')));
        ok('…but a removed key the application did not list stays blocked',
           !!threw(() => el.setAttribute('data-run-state', '1')));
        ok('…and the defaults stay allowed', !threw(() => el.setAttribute('data-status', '1')));
    }
    {
        migrated(['scenarioId', 'dslTabsBound']);
        const el = document.createElement('div');
        ok('listing "scenarioId" (camelCase) restores data-scenario-id',
           !threw(() => el.setAttribute('data-scenario-id', '1')));
        ok('…and dataset.scenarioId', !threw(() => { el.dataset.scenarioId = '1'; }));
        ok('"dslTabsBound" restores data-dsl-tabs-bound', !threw(() => el.setAttribute('data-dsl-tabs-bound', '1')));
        ok('…and not its neighbour data-dsl-controls-bound',
           !!threw(() => el.setAttribute('data-dsl-controls-bound', '1')));
    }
    {
        migrated(REMOVED);
        const el = document.createElement('div');
        const blocked = REMOVED.filter((k) => threw(() => el.setAttribute(`data-${k}`, '1')));
        ok('listing all thirteen restores all thirteen', blocked.length === 0, names(blocked));
    }

    // The docs list exactly these. A table row names a removed key in backticks;
    // nothing else in the section's table rows does.
    {
        const page = readFileSync(resolvePath(HERE, '../docs/concepts/state-guard.md'), 'utf8');
        const lines = page.split('\n');
        const at = lines.findIndex((l) => /^#{2,4} .*\(0\.18\.0\)\s*$/.test(l));
        ok('state-guard.md has a section headed "(0.18.0)"', at >= 0);
        const end = lines.findIndex((l, i) => i > at && /^#{1,4} /.test(l));
        const body = at < 0 ? [] : lines.slice(at + 1, end < 0 ? undefined : end);
        const listed = body.filter((l) => l.startsWith('|'))
            .flatMap((l) => [...l.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]));
        ok('…whose table lists exactly the thirteen removed keys',
           [...listed].sort().join() === [...REMOVED].sort().join(), `listed: ${names(listed)}`);
        ok('…and shows the spread-plus-your-keys migration',
           /\.\.\.DEFAULT_STATE_GUARD_CONFIG\.allowedDatasetKeys,/.test(body.join('\n')));

        // best-practices.md item 15 links to that heading by its slug.
        const slug = (h = '') => h.replace(/^#+\s*/, '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');
        const bp = readFileSync(resolvePath(HERE, '../docs/best-practices.md'), 'utf8');
        const target = bp.match(/state-guard\.md#([a-z0-9-]*0180)\)/)?.[1];
        ok('best-practices.md links to that section, and the anchor resolves',
           !!target && target === slug(lines[at]), `link: ${target}, heading: ${slug(lines[at])}`);
        ok('…and so does the 0.17.0 section\'s link to it, on the same page',
           page.includes(`](#${slug(lines[at])})`), `heading: ${slug(lines[at])}`);
    }

    // The prose may not claim more than the list delivers. The keys in
    // UNDECIDED are in the defaults and no widget writes them, so "the defaults
    // name no application's keys" is false for as long as they stay. The
    // docs, best-practices item 15 and the comment above the list say instead
    // which keys they are, that a strict guard built from the defaults lets
    // them through, and how to filter them out.
    {
        const read = (p) => readFileSync(resolvePath(HERE, p), 'utf8');
        const page = read('../docs/concepts/state-guard.md');
        const item15 = read('../docs/best-practices.md').split('\n').find((l) => l.startsWith('**15.')) ?? '';
        const config = read('../src/core/state_guard_config.js');
        const comment = config.slice(config.indexOf('// What belongs here'),
                                     config.indexOf('const DEFAULT_ALLOWED_DATASET_KEYS'));
        const stillIn = UNDECIDED.filter((k) => defaults.includes(k));

        ok('the keys not part of this change are written by no widget (so they are not FlexDesk\'s)',
           UNDECIDED.every((k) => !writtenByFlexDesk.has(k)),
           `a widget writes: ${names(UNDECIDED.filter((k) => writtenByFlexDesk.has(k)))}`
           + ' — it is FlexDesk\'s: take it off UNDECIDED');
        ok('the comment above the list says it has not been audited', /has not been audited/.test(comment.replace(/\s+/g, ' ')));

        // The wording the first version used, in the three places it used it.
        const OVERCLAIM = /\b(?:names?|carr(?:y|ies)|holds?|contains?)\s+no\s+(?:key\s+that\s+names?\s+)?(?:one\s+|any\s+)?application/i;
        const claims = (text) => stillIn.length === 0 || !OVERCLAIM.test(text.replace(/\s+/g, ' '));
        ok('state-guard.md does not say the defaults carry no application\'s keys', claims(page),
           page.replace(/\s+/g, ' ').match(OVERCLAIM)?.[0]);
        ok('…nor does best-practices item 15', item15.length > 0 && claims(item15), item15.match(OVERCLAIM)?.[0]);
        ok('…nor does the comment above the list', comment.length > 0 && claims(comment),
           comment.replace(/\s+/g, ' ').match(OVERCLAIM)?.[0]);

        // The docs paragraph, in the (0.18.0) section.
        const lines = page.split('\n');
        const at = lines.findIndex((l) => /^#{2,4} .*\(0\.18\.0\)\s*$/.test(l));
        const end = lines.findIndex((l, i) => i > at && /^#{1,4} /.test(l));
        const body = at < 0 ? [] : lines.slice(at + 1, end < 0 ? undefined : end);
        const lead = body.findIndex((l) => /^\*\*What stays\b/.test(l));
        const para = [];
        for (let i = lead; lead >= 0 && i < body.length && body[i].trim() !== ''; i += 1) para.push(body[i]);
        ok('the (0.18.0) section has a paragraph on what stays although FlexDesk does not write it', lead >= 0);
        ok('…which says the list has not been audited key by key',
           /has not been audited key by\s+key/.test(para.join(' ')));
        ok('…and that a strict guard built from the defaults lets a write of such a key through',
           /strict guard\s+built from the defaults therefore lets a write of any such key through/.test(para.join(' ')));
        ok('…and shows how to filter keys out of the defaults',
           /allowedDatasetKeys\.filter\(\(k\) => !NOT_MINE\.has\(k\)\)/.test(body.join('\n')));

        // The filter the docs show: a key the application does not write is
        // blocked, a key it did not name stays allowed.
        const NOT_MINE = new Set(['series-id', 'dataset-id']);
        const { violations } = strictGuard({
            ...DEFAULT_STATE_GUARD_CONFIG,
            allowedDatasetKeys: DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.filter((k) => !NOT_MINE.has(k)),
        });
        const el = document.createElement('div');
        ok('filtering "series-id" and "dataset-id" out blocks both, as attribute and as dataset key',
           !!threw(() => el.setAttribute('data-series-id', '1')) && !!threw(() => { el.dataset.datasetId = '1'; }));
        ok('…and reports them', violations.includes('data-series-id') && violations.includes('data-dataset-id'));
        ok('…while keys the application did not name stay allowed',
           !threw(() => el.setAttribute('data-param-id', '1')) && !threw(() => el.setAttribute('data-status', '1')));
    }
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
