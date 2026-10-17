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
        });
    }
    ok('the scan finds the keys the record names',
       ['data-twm-tabs', 'data-latex-tooltip', 'data-twm-required', 'data-action-idx',
        'data-action-value', 'data-pane'].every((a) => found.has(a)));
    ok('the scan resolves attribute constants', found.has('data-twm-flow-item'));
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

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
