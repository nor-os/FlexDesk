/**
 * ══ TOASTS, THE GALLERY PICKER AND THE PLOT WINDOW READ NO GLOBALS (0.17.0, STORY-0039) ══
 *
 * Three widgets used to reach for one application's globals: the toast helpers
 * found their bus on `window.__ecoagent`, the gallery picker called
 * `window.pywebview.api.gallery_list`, and the plot window listened for two
 * fixed streaming event names. Everything now arrives by injection:
 *
 *   §1  no file under src/ outside src/host names `window.__ecoagent` or
 *       `window.pywebview`
 *   §2  toastError before any NotificationCenter exists goes to the console
 *       and throws nothing
 *   §3  toastError after NotificationCenter.mount shows a toast, no global set;
 *       dispose hands the helpers back to the console; setToastBus overrides
 *   §4  mountGalleryPicker: no entries and no host capability -> the empty
 *       label and one warning; `host.gallery.list(kind)` supplies entries;
 *       a pywebview-shaped global is never asked
 *   §5  PlotPopoutWindow redraws on the `streamEvents` it is given and has
 *       no default names: without them it subscribes to `refreshEvent` only
 *   §6  the barrels export setToastBus / getToastBus; the host contract has
 *       the optional `gallery` capability
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/no_app_globals.test.mjs           # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly. Plotly is a FAKE on `globalThis` that records
 * every `react()`. jsdom is borrowed from the sibling Tables checkout; absent,
 * this SKIPS loudly rather than passing.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve as resolvePath } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, '..');

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
    console.log('no app globals: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
// jsdom lays nothing out; the popout skips a zero-width chart div.
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get: () => 400 });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get: () => 300 });

/** A Plotly that records every figure it is asked to draw. */
const Plotly = {
    reacts: [],
    async react(gd, data, layout) { Plotly.reacts.push({ gd, data, layout }); return gd; },
    async newPlot(gd, data, layout) { return Plotly.react(gd, data, layout); },
    purge() {},
    relayout() {},
    Plots: { resize() {} },
};
globalThis.Plotly = Plotly;
dom.window.Plotly = Plotly;

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

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
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const frames = () => new Promise((r) => setTimeout(r, 60));   // past a jsdom rAF

/** Run `fn` with console.warn/info/log recorded instead of printed. */
async function capturingConsole(fn) {
    const seen = { warn: [], info: [], log: [] };
    const saved = { warn: console.warn, info: console.info, log: console.log };
    for (const k of Object.keys(seen)) console[k] = (...a) => seen[k].push(a);
    let threw = null;
    try { await fn(); } catch (err) { threw = err; } finally { Object.assign(console, saved); }
    return { ...seen, threw };
}

const toast = await import('../src/ui/components/toast.js');
const { NotificationCenter } = await import('../src/ui/notification_center.js');
const { EventBus } = await import('../src/core/event_bus.js');
const { mountGalleryPicker } = await import('../src/ui/components/gallery_picker.js');
const { createHost, NULL_HOST, HOST_CONTRACT } = await import('../src/host/host.js');
const { makeDefaultSubplot } = await import('../src/charts/plot_config.js');
const { PlotPopoutWindow } = await import('../src/charts/plot_popout_window.js');
const widgets = await import('../widgets.js');
const hostBarrel = await import('../host.js');

console.log('\nno app globals: toasts, gallery picker, plot window\n');

// ════════════════════════════════════════════════════════════════════════
// §1 NO APP GLOBAL OUTSIDE src/host
// ════════════════════════════════════════════════════════════════════════
{
    console.log('§1 no window.__ecoagent / window.pywebview outside src/host');
    const hits = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const p = resolvePath(dir, name);
            if (statSync(p).isDirectory()) {
                if (relative(ROOT, p) !== 'src/host') walk(p);
                continue;
            }
            readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
                if (/window\.__ecoagent|window\.pywebview/.test(line)) {
                    hits.push(`${relative(ROOT, p)}:${i + 1}: ${line.trim()}`);
                }
            });
        }
    };
    walk(resolvePath(ROOT, 'src'));
    check('no hits', hits, []);
}

// ════════════════════════════════════════════════════════════════════════
// §2 BEFORE ANY NotificationCenter: THE CONSOLE, AND NOTHING THROWS
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§2 toastError before any NotificationCenter');
    check('no bus yet', toast.getToastBus(), null);
    const seen = await capturingConsole(() => {
        toast.toastError('x');
        toast.toastInfo('Title', 'body');
        toast.reportBridgeError('Save', new Error('nope'));
    });
    ok('nothing throws', seen.threw === null, String(seen.threw));
    check('toastError logs the message as a warning', seen.warn[0], ['[toast/error]', '', 'x']);
    check('toastInfo logs title and message', seen.info[0], ['[toast/info]', 'Title:', 'body']);
    check('reportBridgeError logs too', seen.warn[1], ['[toast/error]', 'Save:', 'nope']);
}

// ════════════════════════════════════════════════════════════════════════
// §3 AFTER NotificationCenter.mount: A TOAST, NO GLOBAL SET
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§3 toastError after NotificationCenter.mount');
    ok('no __ecoagent global', window.__ecoagent === undefined && globalThis.__ecoagent === undefined);
    const bus = new EventBus();
    const nc = new NotificationCenter({ eventBus: bus, logger: null });
    nc.mount(document.body);
    check('mount hands its bus to the toast helpers', toast.getToastBus() === bus, true);

    const seen = await capturingConsole(() => toast.toastError('x'));
    ok('nothing throws', seen.threw === null, String(seen.threw));
    const bodies = [...document.querySelectorAll('.twm-notification__body')].map((b) => b.textContent);
    check('one toast reading "x" is on screen', bodies, ['x']);
    check('it is an error toast', nc.notifications.map((n) => n.severity), ['error']);

    // An explicit bus wins, and the centre's dispose leaves it alone.
    const other = new EventBus();
    const got = [];
    other.on('toast:show', (p) => got.push(p.message));
    const prev = toast.setToastBus(other);
    check('setToastBus returns the bus it replaced', prev === bus, true);
    toast.toastWarn('elsewhere');
    check('setToastBus routes the helpers to that bus', got, ['elsewhere']);
    nc.dispose();
    check('dispose leaves a bus set by someone else', toast.getToastBus() === other, true);

    // And a disposed centre that still owns the helpers gives them back.
    toast.setToastBus(null);
    const nc2 = new NotificationCenter({ eventBus: bus, logger: null });
    nc2.mount(document.body);
    check('a second centre claims the helpers', toast.getToastBus() === bus, true);
    nc2.dispose();
    check('its dispose hands them back to the console', toast.getToastBus(), null);
    const after = await capturingConsole(() => toast.toastError('late'));
    ok('after dispose: nothing throws', after.threw === null);
    check('after dispose: the console', after.warn[0], ['[toast/error]', '', 'late']);
    check('setToastBus ignores something that cannot emit', (toast.setToastBus({}), toast.getToastBus()), null);
}

// ════════════════════════════════════════════════════════════════════════
// §4 THE GALLERY PICKER: ENTRIES OR A HOST CAPABILITY
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§4 mountGalleryPicker');
    // A pywebview-shaped global that must never be asked.
    let globalAsked = 0;
    window.pywebview = { api: { gallery_list: async () => { globalAsked += 1; return [{ id: 'g', label: 'G' }]; } } };

    for (const [what, opts] of [['no host', {}], ['NULL_HOST', { host: NULL_HOST }]]) {
        const el = document.createElement('div');
        const seen = await capturingConsole(() => mountGalleryPicker(el, { kind: 'agent', emptyLabel: 'Nothing here.', ...opts }));
        ok(`${what}: nothing throws`, seen.threw === null, String(seen.threw));
        check(`${what}: shows its empty label`,
              el.querySelector('.twm-gallery-picker__empty')?.textContent, 'Nothing here.');
        check(`${what}: logs one warning`, seen.warn.length, 1);
    }
    check('the pywebview-shaped global was never asked', globalAsked, 0);

    const asked = [];
    const host = createHost({ gallery: { list: async (kind) => {
        asked.push(kind);
        return [{ id: 'blank', label: 'Blank' }, { id: 'full', label: 'Full', description: 'All of it' }];
    } } });
    const el = document.createElement('div');
    const picked = [];
    const seen = await capturingConsole(async () => {
        const p = await mountGalleryPicker(el, { kind: 'agent', host, selectedId: 'full', onChange: (e) => picked.push(e.id) });
        check('getSelected is the pre-selected entry', p.getSelected()?.id, 'full');
    });
    check('host.gallery.list is asked for the kind', asked, ['agent']);
    check('its entries are the cards', [...el.querySelectorAll('.twm-gallery-card__label')].map((n) => n.textContent),
          ['Blank', 'Full']);
    check('initial onChange fires', picked, ['full']);
    check('no warning with a capability', seen.warn.length, 0);

    const failing = createHost({ gallery: { list: async () => { throw new Error('down'); } } });
    const el2 = document.createElement('div');
    const seen2 = await capturingConsole(() => mountGalleryPicker(el2, { host: failing }));
    ok('a failing capability throws nothing', seen2.threw === null);
    ok('…shows the empty label', !!el2.querySelector('.twm-gallery-picker__empty'));
    check('…and logs one warning', seen2.warn.length, 1);

    const el3 = document.createElement('div');
    const seen3 = await capturingConsole(() => mountGalleryPicker(el3, { host, entries: [{ id: 'e', label: 'E' }] }));
    check('explicit entries win over the host', [...el3.querySelectorAll('.twm-gallery-card__label')].map((n) => n.textContent), ['E']);
    check('…the host is not asked', asked.length, 1);
    check('…and nothing is logged', seen3.warn.length, 0);
    check('the pywebview-shaped global was still never asked', globalAsked, 0);
    delete window.pywebview;
}

// ════════════════════════════════════════════════════════════════════════
// §5 PlotPopoutWindow: INJECTED STREAM EVENT NAMES
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§5 PlotPopoutWindow streamEvents');
    const plotConfig = () => {
        const sp = makeDefaultSubplot(0);
        sp.yAxes[0].series = [{ id: 's1', variable: 'a', label: 'Alpha', color: '#ff0000' }];
        return { layout: '1x1', subplots: [sp] };
    };
    let reads = 0;
    let values = [1, 2, 3];
    const getResults = () => { reads += 1; return { time: [0, 1, 2], series: { a: values } }; };

    const open = async (bus, extra = {}) => {
        const win = new PlotPopoutWindow({
            id: `w-${Math.random().toString(36).slice(2, 7)}`, title: 'T',
            plotConfig: plotConfig(), getResults, services: { eventBus: bus }, ...extra,
        });
        await win.show();
        await ticks();
        await frames();
        await ticks();
        return win;
    };
    const after = async (bus, name) => {
        const before = { reads, draws: Plotly.reacts.length };
        bus.emit(name, {});
        await frames();
        await ticks();
        return { reads: reads - before.reads, draws: Plotly.reacts.length - before.draws };
    };

    const bus = new EventBus();
    const win = await open(bus, { streamEvents: { delta: 'sim:delta', complete: 'sim:done' } });
    check('the given names are kept', win.streamEvents, { delta: 'sim:delta', complete: 'sim:done' });
    ok('the window drew once on show', Plotly.reacts.length > 0);

    values = [4, 5, 6];
    const d = await after(bus, 'sim:delta');
    ok('sim:delta re-reads the results', d.reads >= 1, JSON.stringify(d));
    ok('sim:delta redraws', d.draws >= 1, JSON.stringify(d));
    check('…with the new values', Plotly.reacts.at(-1)?.data?.[0]?.y, [4, 5, 6]);

    values = [7, 8, 9];
    const c = await after(bus, 'sim:done');
    ok('sim:done re-reads the results', c.reads >= 1, JSON.stringify(c));
    ok('sim:done redraws', c.draws >= 1, JSON.stringify(c));
    check('…with the new values', Plotly.reacts.at(-1)?.data?.[0]?.y, [7, 8, 9]);

    check('streaming:delta no longer redraws it', await after(bus, 'streaming:delta'), { reads: 0, draws: 0 });
    check('streaming:complete no longer redraws it', await after(bus, 'streaming:complete'), { reads: 0, draws: 0 });
    check('refreshEvent still redraws it', (await after(bus, 'data:changed')).draws >= 1, true);
    win.close();
    await ticks();
    check('closed: sim:delta does nothing', await after(bus, 'sim:delta'), { reads: 0, draws: 0 });

    // No default names (BUG-0031): an embedder that passes no `streamEvents`
    // gets no stream subscriptions at all, only its `refreshEvent`.
    const subscribed = (bus) => {
        const names = [];
        const on = bus.on.bind(bus);
        bus.on = (name, ...rest) => { names.push(name); return on(name, ...rest); };
        return names;
    };
    const bus2 = new EventBus();
    const heard2 = subscribed(bus2);
    const dflt = await open(bus2);
    check('no default names', dflt.streamEvents, { delta: null, complete: null });
    check('without streamEvents it subscribes to refreshEvent only', heard2, ['data:changed']);
    check('without streamEvents: streaming:delta does nothing', await after(bus2, 'streaming:delta'), { reads: 0, draws: 0 });
    check('without streamEvents: streaming:complete does nothing', await after(bus2, 'streaming:complete'), { reads: 0, draws: 0 });
    values = [10, 11, 12];
    ok('without streamEvents: refreshEvent still redraws', (await after(bus2, 'data:changed')).draws >= 1);
    check('…with the new values', Plotly.reacts.at(-1)?.data?.[0]?.y, [10, 11, 12]);
    dflt.close();

    const bus3 = new EventBus();
    const heard3 = subscribed(bus3);
    const half = await open(bus3, { streamEvents: { delta: null, complete: 'sim:done' } });
    check('a null name is not listened for', half.streamEvents, { delta: null, complete: 'sim:done' });
    check('…only the named one and refreshEvent are subscribed', heard3, ['sim:done', 'data:changed']);
    ok('…the named one redraws', (await after(bus3, 'sim:done')).draws >= 1);
    half.close();

    const bus4 = new EventBus();
    const heard4 = subscribed(bus4);
    const only = await open(bus4, { streamEvents: { delta: 'sim:delta' } });
    check('a name left out is not filled in', only.streamEvents, { delta: 'sim:delta', complete: null });
    check('…only the given one and refreshEvent are subscribed', heard4, ['sim:delta', 'data:changed']);
    only.close();
}

// ════════════════════════════════════════════════════════════════════════
// §6 BARRELS AND THE HOST CONTRACT
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§6 exports and the host contract');
    ok('@flexdesk/widgets exports setToastBus', widgets.setToastBus === toast.setToastBus);
    ok('@flexdesk/widgets exports getToastBus', widgets.getToastBus === toast.getToastBus);
    check('the host contract has a gallery capability', HOST_CONTRACT.gallery?.required, ['list']);
    ok('@flexdesk/host shares it', hostBarrel.HOST_CONTRACT === HOST_CONTRACT);
    let threw = null;
    try { createHost({ gallery: {} }); } catch (err) { threw = err; }
    ok('an incomplete gallery capability is refused at boot', /gallery.*list/.test(threw?.message || ''), threw?.message);
}

await ticks();
check('no unhandled rejections', unhandled, 0);

if (failures) {
    console.error(`\nno app globals: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
