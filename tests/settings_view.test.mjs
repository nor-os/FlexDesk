/**
 * ══ SettingsView — THE SETTINGS PAGE, DRAWN FROM THE SCHEMA ═════════════════
 *
 * STORY-0050. settings.js promised "the Settings page renders whatever is in
 * the schema", and there was no such page. This suite is the contract of the
 * one it now ships:
 *
 *   §1  THE CATEGORIES: every registered category in its `order`, and a
 *       chosen one lists its settings under their groups, in schema order.
 *   §2  A NUMBER: a change writes through setSetting (the binding's store),
 *       always in min/max and on the step grid (a range end off the grid
 *       steps inward to the nearest grid point), and the row is marked
 *       modified; an unreadable entry writes nothing.
 *   §3  LIVE: a setSetting made elsewhere moves the open view's control and
 *       marker, for every control type (a select set to a value its options
 *       lack shows it as a fresh mount does, "(not found)"); the view's own
 *       controls write back, and a select redraws as a fresh mount does.
 *   §4  SEARCH across every category's label, description and path; a query
 *       holding markup is shown as typed and makes no element; schema text
 *       holding markup is shown as text too. A query of only spaces is no
 *       search: the category stays active and its page drawn.
 *   §5  RESETS: Reset all asks to confirm and Cancel changes nothing; OK
 *       resets. Reset category asks too; a row's reset does not.
 *   §6  A SLICE REGISTERED AFTER MOUNT: its category joins the sidebar, its
 *       rows draw, and its paths are live — without a remount. A slice for
 *       another category keeps a text or number edit still being typed.
 *   §7  TEXT is debounced: written after the pause, at once on Enter.
 *   §8  dispose() takes the view down and stops listening; the content
 *       factory mounts and destroys it.
 *   §9  ITS CSS: every class the view sets has a rule, no hex literal.
 *   §10 the barrels export it.
 *   §11 STORY-0101 (0.17.2) `sidebar: false` leaves the filter, the category
 *       list and Reset all out of the page; a view made without it draws the
 *       sidebar as before.
 *   §12 A SettingsCategories bound to the view, mounted elsewhere, lists the
 *       same categories in order, filters them, and a click shows that
 *       category in the view.
 *   §13 THE FILTER AND THE CATEGORY stay in step both ways: list -> view,
 *       view -> list, and a category registered later joins the list;
 *       view.subscribe() reports each change and its unsubscribe stops it.
 *   §14 RESET ALL in the categories asks the view's confirm; Cancel changes
 *       nothing, OK resets. dispose() takes the list down and stops it.
 *
 *     node tests/settings_view.test.mjs
 *
 * It imports the sources directly, never `dist/`. jsdom is borrowed from the
 * sibling Tables checkout; absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { stripComments } from './css_rules.mjs';

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
    console.log('settings view: SKIPPED — needs jsdom '
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
globalThis.Event = dom.window.Event;

const { SettingsView, SettingsCategories, settingsViewContent, SETTINGS_TEXT_DEBOUNCE_MS } =
    await import('../src/ui/components/settings_view.js');
const {
    createSettingsStore, getSettingsStore, configureSettings, registerSettings,
    registerSettingsEventBus, setSetting, getSetting, getCategories, resetAllSettings,
} = await import('../src/core/settings.js');
const { EventBus } = await import('../src/core/event_bus.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log(`\n${t}`);

function fire(node, type) {
    node.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
}
function type(input, value) {
    input.value = value;
    fire(input, 'input');
}

/** A private store with three categories registered out of order. */
function fixture() {
    const bus = new EventBus();
    const store = createSettingsStore({
        eventBus: bus,
        defaults: { a: { n: 10, on: false, mode: 'x', name: '', dir: null, pal: ['#112233'] }, b: { k: 1 }, c: { z: 0 } },
        categories: [
            { id: 'late', label: 'Late', icon: 'tune', description: 'Third', order: 90 },
            { id: 'first', label: 'First', icon: 'tune', description: 'First of all', order: 5 },
            { id: 'mid', label: 'Middle', icon: 'tune', description: 'Second', order: 50 },
        ],
        schema: {
            'a.n':    { type: 'number', category: 'first', group: 'Numbers', label: 'Count',
                        description: 'How many.', defaultValue: 10, min: 0, max: 100, step: 5 },
            'a.on':   { type: 'boolean', category: 'first', group: 'Switches', label: 'Enabled',
                        description: 'On or off.', defaultValue: false },
            'a.mode': { type: 'select', category: 'first', group: 'Numbers', label: 'Mode',
                        description: 'Which mode.', defaultValue: 'x',
                        options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
            'a.name': { type: 'text', category: 'first', group: 'Switches', label: 'Name',
                        description: 'A name.', defaultValue: '' },
            'a.dir':  { type: 'text', category: 'first', group: 'Switches', label: 'Directory',
                        description: 'Empty is the default.', defaultValue: null, placeholder: 'default' },
            'a.pal':  { type: 'colorList', category: 'mid', group: 'Colours', label: 'Palette',
                        description: 'Series colours.', defaultValue: ['#112233'] },
            'b.k':    { type: 'number', category: 'mid', group: 'Other', label: 'Kappa',
                        description: 'A constant.', defaultValue: 1 },
            'c.z':    { type: 'number', category: 'late', group: 'Zed', label: 'Zeta',
                        description: 'Holds <b>bold</b> & more.', defaultValue: 0 },
        },
    });
    return { bus, store };
}

let lastConfirm = null;
function mount(opts) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new SettingsView(opts);
    view.mount(host);
    const q = (s) => host.querySelector(s);
    const qa = (s) => [...host.querySelectorAll(s)];
    const row = (path) => q(`.twm-settings__row[data-path="${path}"]`);
    return { view, host, q, qa, row };
}
const navLabels = (qa) => qa('.twm-settings__cat').map((b) => b.textContent.replace(/^tune|^settings/, ''));
const isModified = (r) => r.classList.contains('twm-settings__row--modified')
    && !r.querySelector('.twm-settings__marker').hidden;

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 every registered category in order; a chosen one lists its settings by group');
{
    const { bus, store } = fixture();
    const { view, q, qa, row } = mount({ store, eventBus: bus });
    check('the sidebar lists the categories by order',
          qa('.twm-settings__cat').map((b) => b.dataset.category), ['first', 'mid', 'late']);
    check('…with their labels', qa('.twm-settings__cat-label').map((n) => n.textContent),
          ['First', 'Middle', 'Late']);
    check('the first category is shown first', view.getCategory(), 'first');
    ok('…and marked active', q('.twm-settings__cat--active')?.dataset.category === 'first');
    check('its title and description', [q('.twm-settings__title').textContent,
                                        q('.twm-settings__header .twm-settings__description').textContent],
          ['First', 'First of all']);
    check('its groups in schema order', qa('.twm-settings__group-title').map((n) => n.textContent),
          ['Numbers', 'Switches']);
    check('each group holds its settings',
          qa('.twm-settings__group').map((g) => [...g.querySelectorAll('.twm-settings__row')]
              .map((r) => r.dataset.path)),
          [['a.n', 'a.mode'], ['a.on', 'a.name', 'a.dir']]);
    const r = row('a.n');
    check('a row shows label, description and path',
          [r.querySelector('.twm-settings__label').textContent,
           r.querySelector('.twm-settings__description').textContent,
           r.querySelector('.twm-settings__path').textContent], ['Count', 'How many.', 'a.n']);
    ok('an unmodified row has no marker', !isModified(r) && r.querySelector('.twm-settings__reset').hidden);

    q('.twm-settings__cat[data-category="mid"]').click();
    check('clicking a category selects it', view.getCategory(), 'mid');
    ok('…marks it active', q('.twm-settings__cat--active')?.dataset.category === 'mid');
    check('…and lists its settings by group',
          qa('.twm-settings__group').map((g) => [g.querySelector('.twm-settings__group-title').textContent,
              ...[...g.querySelectorAll('.twm-settings__row')].map((x) => x.dataset.path)]),
          [['Colours', 'a.pal'], ['Other', 'b.k']]);
    ok('a colour list row holds a ColorListField', !!row('a.pal').querySelector('.twm-color-list'));
    view.selectCategory('late');
    check('selectCategory() does the same', qa('.twm-settings__row').map((x) => x.dataset.path), ['c.z']);
    view.selectCategory('nope');
    check('an unknown category is ignored', view.getCategory(), 'late');

    const fresh = mount({ store, eventBus: bus, category: 'mid' });
    check('`category` picks the first one shown', fresh.view.getCategory(), 'mid');
    fresh.view.dispose();
    view.dispose();
}

// ── §2 ──────────────────────────────────────────────────────────────────
// The app-global binding, on a key of this suite's own. `getSettingsStore()`
// is the store whose `set` is the one `setSetting` calls.
configureSettings({ storageKey: 'flexdesk.test.settings-view' });
const globalBus = new EventBus();
registerSettingsEventBus(globalBus);

section('§2 a number setting writes via setSetting, snapped and clamped, and is marked modified');
{
    const store = getSettingsStore();
    ok('getSettingsStore() is a settings store', typeof store.set === 'function'
       && typeof store.getSchema === 'function');
    const heard = [];
    const sub = globalBus.on('settings:notifications.durationMs:changed', (p) => heard.push(p.value));
    const { view, row } = mount({ store, eventBus: globalBus, category: 'general' });
    const r = row('notifications.durationMs');
    const box = r.querySelector('input[type=number]');
    check('the box honours min/max/step', [box.min, box.max, box.step], ['1000', '15000', '500']);
    check('…and shows the value', box.value, '3500');
    ok('not modified yet', !isModified(r));

    box.value = '5000';
    fire(box, 'change');
    check('the change is written: getSetting reads it', getSetting('notifications.durationMs'), 5000);
    check('…as settings:<path>:changed, from setSetting\'s store', heard, [5000]);
    ok('the row shows the modified marker', isModified(r));
    ok('…and its reset button', !r.querySelector('.twm-settings__reset').hidden);

    box.value = '5260';
    fire(box, 'change');
    check('a value off the step is snapped to it', getSetting('notifications.durationMs'), 5500);
    check('…and the box shows what was written', box.value, '5500');
    box.value = '99999';
    fire(box, 'change');
    check('a value over max is clamped', getSetting('notifications.durationMs'), 15000);
    box.value = '2';
    fire(box, 'change');
    check('a value under min is clamped', getSetting('notifications.durationMs'), 1000);
    const before = heard.length;
    box.value = '';
    fire(box, 'change');
    check('an empty box writes nothing', heard.length, before);
    check('…and shows the value again', box.value, '1000');

    r.querySelector('.twm-settings__reset').click();
    check('the row\'s reset puts the default back', getSetting('notifications.durationMs'), 3500);
    ok('…and the marker goes', !isModified(r));
    check('…and the box follows', box.value, '3500');
    sub.dispose();
    view.dispose();
}
{
    // A range whose ends are off the step grid: a written value stays on it.
    const bus = new EventBus();
    const store = createSettingsStore({
        eventBus: bus,
        defaults: { g: { odd: 3, tenth: 0.5, none: 4, bad: 6 } },
        categories: [{ id: 'grid', label: 'Grid', icon: 'tune', description: 'Grid', order: 1 }],
        schema: {
            'g.odd':   { type: 'number', category: 'grid', group: 'G', label: 'Odd', description: 'Odd.',
                         defaultValue: 3, min: 1, max: 10, step: 2 },
            'g.tenth': { type: 'number', category: 'grid', group: 'G', label: 'Tenth', description: 'Tenth.',
                         defaultValue: 0.5, max: 0.35, step: 0.1 },
            'g.none':  { type: 'number', category: 'grid', group: 'G', label: 'None', description: 'None.',
                         defaultValue: 4, min: 2, max: 7.5 },
            'g.bad':   { type: 'number', category: 'grid', group: 'G', label: 'Bad', description: 'Bad.',
                         defaultValue: 6, min: 5, max: 4, step: 1 },
        },
    });
    const written = [];
    const sub = bus.on('settings:g.odd:changed', (p) => written.push(['g.odd', p.value]));
    const { view, row } = mount({ store, eventBus: bus, category: 'grid' });
    const odd = row('g.odd').querySelector('input[type=number]');
    odd.value = '10';
    fire(odd, 'change');
    check('a max off the grid: the value steps inward to the last grid point', written.at(-1), ['g.odd', 9]);
    check('…the box shows it', odd.value, '9');
    ok('…which is in range and on the 1, 3, 5, 7, 9 grid', (store.get('g.odd') - 1) % 2 === 0 && store.get('g.odd') <= 10);
    odd.value = '-4';
    fire(odd, 'change');
    check('under min: min itself, a grid point', store.get('g.odd'), 1);
    odd.value = '6';
    fire(odd, 'change');
    check('inside the range, the nearest grid point', store.get('g.odd'), 7);
    const tenth = row('g.tenth').querySelector('input[type=number]');
    tenth.value = '0.9';
    fire(tenth, 'change');
    check('no min, max 0.35, step 0.1: the last grid point under max, exactly', store.get('g.tenth'), 0.3);
    const none = row('g.none').querySelector('input[type=number]');
    none.value = '9';
    fire(none, 'change');
    check('no step: only clamped', store.get('g.none'), 7.5);
    const bad = row('g.bad').querySelector('input[type=number]');
    bad.value = '4';
    fire(bad, 'change');
    check('max below min holds no grid point: the value is min', store.get('g.bad'), 5);
    sub.dispose();
    view.dispose();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 a setSetting call made elsewhere updates the open view');
{
    const { view, row, q } = mount({ store: getSettingsStore(), eventBus: globalBus, category: 'general' });
    setSetting('workspace.autosave.intervalSeconds', 120);
    const r = row('workspace.autosave.intervalSeconds');
    check('a number box follows', r.querySelector('input').value, '120');
    ok('…and is marked modified', isModified(r));
    setSetting('workspace.autosave.intervalSeconds', 60);
    ok('set back to its default, the marker goes', !isModified(r));

    const t = row('workspace.autosave.enabled').querySelector('input[role=switch]');
    ok('a switch starts on', t.checked === true);
    setSetting('workspace.autosave.enabled', false);
    ok('a switch follows', t.checked === false && t.getAttribute('aria-checked') === 'false');
    ok('…marked', isModified(row('workspace.autosave.enabled')));
    t.click();
    check('clicking the switch writes it back', getSetting('workspace.autosave.enabled'), true);

    setSetting('projects.directory', '/srv/projects');
    const dir = row('projects.directory').querySelector('input[type=text]');
    check('a text box follows', dir.value, '/srv/projects');
    check('…with the schema placeholder', dir.placeholder, 'OS default');

    view.selectCategory('logging');
    setSetting('logging.minLevel', 'debug');
    const sel = row('logging.minLevel').querySelector('select');
    check('a select follows', sel.value, 'debug');
    sel.value = 'error';
    fire(sel, 'change');
    check('choosing in the select writes it', getSetting('logging.minLevel'), 'error');
    ok('…and marks it', isModified(row('logging.minLevel')));

    // A colorList, on a private store.
    const { bus, store } = fixture();
    const v2 = mount({ store, eventBus: bus, category: 'mid' });

    // A select set elsewhere to a value its options lack shows what a fresh
    // mount shows for that value: its '(not found)' entry.
    v2.view.selectCategory('first');
    const shown = () => {
        const s = v2.row('a.mode').querySelector('select');
        return { value: s.value, text: s.options[s.selectedIndex]?.textContent,
                 options: [...s.options].map((o) => o.textContent) };
    };
    store.set('a.mode', 'z');
    check('an unoffered value set elsewhere shows as not found', shown(),
          { value: 'z', text: 'z (not found)', options: ['X', 'Y', 'z (not found)'] });
    ok('…marked', isModified(v2.row('a.mode')));
    {
        const fresh = mount({ store, eventBus: bus, category: 'first' });
        const fs = fresh.row('a.mode').querySelector('select');
        check('…as a fresh mount shows it',
              { value: fs.value, text: fs.options[fs.selectedIndex]?.textContent,
                options: [...fs.options].map((o) => o.textContent) }, shown());
        fresh.view.dispose();
    }
    store.set('a.mode', 'y');
    check('switched back to an offered value, the stray entry goes', shown(),
          { value: 'y', text: 'Y', options: ['X', 'Y'] });
    store.set('a.mode', 'z');
    check('set to the unoffered value again, it shows as not found again', shown(),
          { value: 'z', text: 'z (not found)', options: ['X', 'Y', 'z (not found)'] });
    store.set('a.mode', 'q');
    check('another unoffered value replaces the stray entry', shown(),
          { value: 'q', text: 'q (not found)', options: ['X', 'Y', 'q (not found)'] });
    const ms = v2.row('a.mode').querySelector('select');
    ms.value = 'x';
    fire(ms, 'change');
    check('choosing an offered value in the box writes it', store.get('a.mode'), 'x');
    check('…and the stray entry goes, as for a value set elsewhere', shown(),
          { value: 'x', text: 'X', options: ['X', 'Y'] });
    ok('…and the marker goes', !isModified(v2.row('a.mode')));
    v2.view.selectCategory('mid');
    store.set('a.pal', ['#aabbcc', '#ddeeff']);
    check('a colour list follows',
          [...v2.row('a.pal').querySelectorAll('.twm-color-field__hex')].map((i) => i.value),
          ['#aabbcc', '#ddeeff']);
    ok('…marked', isModified(v2.row('a.pal')));
    v2.row('a.pal').querySelector('.twm-sortable-list__add').click();
    check('adding a colour writes the list', store.get('a.pal'), ['#aabbcc', '#ddeeff', '#000000']);
    v2.view.dispose();

    resetAllSettings();
    ok('a reset made elsewhere moves the view too', !q('.twm-settings__row--modified'));
    view.dispose();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 search matches across categories; markup in a query is shown literally');
{
    const { bus, store } = fixture();
    const { view, q, qa, host } = mount({ store, eventBus: bus });
    const input = q('.twm-settings__search-input');
    type(input, 'a constant');
    check('a description matches, in another category', qa('.twm-settings__row').map((r) => r.dataset.path), ['b.k']);
    ok('no category is active while searching', !q('.twm-settings__cat--active'));
    type(input, 'EN');
    check('a label matches, case-insensitive',
          qa('.twm-settings__row').map((r) => r.dataset.path), ['a.on']);
    type(input, 'a.');
    check('paths match, across every category, in category order, grouped',
          qa('.twm-settings__row').map((r) => r.dataset.path),
          ['a.n', 'a.mode', 'a.on', 'a.name', 'a.dir', 'a.pal']);
    check('results are grouped under category › group',
          qa('.twm-settings__group-title').map((n) => n.textContent),
          ['First › Numbers', 'First › Switches', 'Middle › Colours']);
    check('the header counts them', q('.twm-settings__title').textContent, '6 results for “a.”');
    type(input, 'Z');
    check('a match in the last category', qa('.twm-settings__row').map((r) => r.dataset.path), ['c.z']);

    const evil = '<img src=x onerror="globalThis.__pwned=1">';
    type(input, evil);
    check('the header shows the query as typed', q('.twm-settings__title').textContent, `0 results for “${evil}”`);
    ok('…and no element came of it', !host.querySelector('img'));
    ok('…and nothing ran', globalThis.__pwned === undefined);
    check('no match says so', q('.twm-settings__empty').textContent, 'No setting matches the filter.');
    type(input, '<b>bold</b>');
    check('markup in a description is matched as text', qa('.twm-settings__row').map((r) => r.dataset.path), ['c.z']);
    const d = q('.twm-settings__row .twm-settings__description');
    check('…and shown as text', d.textContent, 'Holds <b>bold</b> & more.');
    ok('…with no element made', !d.querySelector('b'));

    type(input, '');
    check('clearing the filter goes back to the category', view.getCategory(), 'first');
    ok('…active again', q('.twm-settings__cat--active')?.dataset.category === 'first');
    view.setQuery('  ');
    ok('a query of only spaces is no search: the category stays marked active',
       q('.twm-settings__cat--active')?.dataset.category === 'first');
    check('…and its page is drawn', [q('.twm-settings__title').textContent, !!q('.twm-settings__reset-category')],
          ['First', true]);
    store.extend({ categories: [{ id: 'spaced', label: 'Spaced', order: 99 }] });
    ok('…and stays so when another slice registers',
       q('.twm-settings__cat--active')?.dataset.category === 'first'
       && q('.twm-settings__title').textContent === 'First');
    view.setQuery('');
    view.setQuery('kappa');
    check('setQuery() searches too, and fills the box', [input.value, qa('.twm-settings__row').length], ['kappa', 1]);
    q('.twm-settings__cat[data-category="late"]').click();
    check('choosing a category clears the filter', [input.value, view.getQuery(), view.getCategory()],
          ['', '', 'late']);
    view.dispose();
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 reset all asks to confirm, and Cancel changes nothing');
{
    const { bus, store } = fixture();
    const { view, q, row } = mount({ store, eventBus: bus });
    store.set('a.n', 50);
    store.set('b.k', 7);
    const resets = [];
    bus.on('settings:reset', () => resets.push('all'));
    bus.on('settings:category:reset', (p) => resets.push(p.category));
    const before = JSON.stringify(store.getAll());

    q('.twm-settings__reset-all').click();
    await tick();
    const dialog = () => document.querySelector('.twm-managed-window--modal');
    ok('a confirm dialog opens', !!dialog());
    ok('…asking about every setting',
       /Reset every setting to its default\?/.test(dialog()?.textContent || ''));
    document.querySelector('.twm-managed-window--modal [data-action="cancel"]').click();
    await tick();
    ok('Cancel closes it', !dialog());
    check('…and every value is as it was', JSON.stringify(store.getAll()), before);
    check('…and no reset was made', resets, []);
    ok('…and the rows are still marked', isModified(row('a.n')));

    q('.twm-settings__reset-all').click();
    await tick();
    document.querySelector('.twm-managed-window--modal [data-action="confirm"]').click();
    await tick();
    check('OK resets every setting', [store.get('a.n'), store.get('b.k')], [10, 1]);
    check('…once', resets, ['all']);
    ok('…and the markers go', !isModified(row('a.n')));

    // Reset category confirms too, with an injected confirm.
    const asked = [];
    let answer = false;
    const v2 = mount({ store, eventBus: bus, confirm: async (o) => { asked.push(o); return answer; } });
    store.set('a.n', 20);
    store.set('b.k', 3);
    v2.q('.twm-settings__reset-category').click();
    await tick();
    check('reset category asks first, naming the category', asked.map((o) => o.message),
          ['Reset every setting in “First” to its default?']);
    check('…and on Cancel changes nothing', [store.get('a.n'), store.get('b.k')], [20, 3]);
    answer = true;
    v2.q('.twm-settings__reset-category').click();
    await tick();
    check('…and on OK resets only that category', [store.get('a.n'), store.get('b.k')], [10, 3]);
    ok('…and the view follows', !isModified(v2.row('a.n')));
    store.set('a.n', 25);
    v2.row('a.n').querySelector('.twm-settings__reset').click();
    check('a row\'s reset asks nothing', [asked.length, store.get('a.n')], [2, 10]);
    v2.view.dispose();
    view.dispose();
}

// ── §6 ──────────────────────────────────────────────────────────────────
section('§6 a slice registered after mount appears without remounting');
{
    const { view, q, qa, row, host } = mount({ store: getSettingsStore(), eventBus: globalBus, category: 'general' });
    const rootBefore = host.querySelector('.twm-settings');
    registerSettings({
        defaults: { plugin: { speed: 3, label: 'hi' }, workspace: { extraFlag: false } },
        categories: [{ id: 'plugin', label: 'Plugin <i>x</i>', icon: 'extension', description: 'Late slice', order: 20 }],
        schema: {
            'plugin.speed': { type: 'number', category: 'plugin', group: 'Motion', label: 'Speed',
                              description: 'How fast.', defaultValue: 3, min: 1, max: 9, step: 1 },
            'plugin.label': { type: 'text', category: 'plugin', group: 'Motion', label: 'Caption',
                              description: 'Shown under it.', defaultValue: 'hi' },
            'workspace.extraFlag': { type: 'boolean', category: 'general', group: 'Late group',
                                     label: 'Late flag', description: 'Registered late.', defaultValue: false },
        },
    });
    ok('the view was not remounted', host.querySelector('.twm-settings') === rootBefore);
    const ids = qa('.twm-settings__cat').map((b) => b.dataset.category);
    check('the new category joins the sidebar in its order', ids, getCategories().map((c) => c.id));
    check('…between general (10) and ai (30)', ids.slice(0, 3), ['general', 'plugin', 'ai']);
    check('…its label shown as text', q('[data-category="plugin"] .twm-settings__cat-label').textContent,
          'Plugin <i>x</i>');
    ok('a late setting in the open category draws at once', !!row('workspace.extraFlag'));
    check('…under its group', row('workspace.extraFlag').closest('.twm-settings__group')
        .querySelector('.twm-settings__group-title').textContent, 'Late group');
    q('[data-category="plugin"]').click();
    check('the new category lists its settings', qa('.twm-settings__row').map((r) => r.dataset.path),
          ['plugin.speed', 'plugin.label']);
    setSetting('plugin.speed', 7);
    check('its paths are live', row('plugin.speed').querySelector('input').value, '7');
    ok('…and marked', isModified(row('plugin.speed')));
    const sb = row('plugin.speed').querySelector('input');
    sb.value = '8';
    fire(sb, 'change');
    check('…both ways', getSetting('plugin.speed'), 8);
    resetAllSettings();
    view.dispose();
}
{
    // A slice for another category must not drop an edit still being typed.
    const { bus, store } = fixture();
    const { view, row } = mount({ store, eventBus: bus, textDebounceMs: 30 });
    const box = row('a.name').querySelector('input');
    type(box, 'typed');
    const num = row('a.n').querySelector('input');
    type(num, '35');
    store.extend({
        defaults: { two: { t: 1 } },
        categories: [{ id: 'two', label: 'Two', order: 95 }],
        schema: { 'two.t': { type: 'number', category: 'two', group: 'G', label: 'T', defaultValue: 1 } },
    });
    check('a pending text edit stays in its box when another category registers', box.value, 'typed');
    check('…digits typed into a number box stay too', num.value, '35');
    check('…and both reach the store', [store.get('a.name'), store.get('a.n')], ['typed', 35]);
    await wait(60);
    check('…and are still there after the debounce', [store.get('a.name'), box.value], ['typed', 'typed']);
    ok('…the rows on screen are the same rows', row('a.name').querySelector('input') === box);
    view.dispose();
}
{
    // Mounted with no `category`: a slice ordered before the category on
    // screen must not change which category is shown.
    const { bus, store } = fixture();
    let asked = null;
    const confirm = async ({ message }) => { asked = message; return false; };
    const { view, q, row } = mount({ store, eventBus: bus, confirm });
    const shown = () => [view.getCategory(), q('.twm-settings__cat--active')?.dataset.category,
                         q('.twm-settings__title').textContent];
    check('mounted with no category shows the first', shown(), ['first', 'first', 'First']);
    store.extend({ categories: [{ id: 'zero', label: 'Zero', order: 1 }] });
    check('a category ordered before it keeps the one on screen (state, sidebar, title)',
          shown(), ['first', 'first', 'First']);
    ok('…its rows stay', !!row('a.n'));
    check('…the new category joins the sidebar first', q('.twm-settings__cat')?.dataset.category, 'zero');
    store.extend({
        defaults: { zz: { m: 2 } },
        categories: [{ id: 'zero2', label: 'Zero2', order: 0 }],
        schema: { 'zz.m': { type: 'number', category: 'mid', group: 'Late', label: 'M', defaultValue: 2 } },
    });
    check('…as does one whose paths go into another category', shown(), ['first', 'first', 'First']);
    await view.resetCategory();
    ok('resetCategory() with no argument names the category on screen', /“First”/.test(asked ?? ''));
    view.dispose();
}

// ── §7 ──────────────────────────────────────────────────────────────────
section('§7 a text setting is debounced, and written at once on Enter');
{
    const { bus, store } = fixture();
    const { view, row } = mount({ store, eventBus: bus, textDebounceMs: 30 });
    check('the default debounce is exported', typeof SETTINGS_TEXT_DEBOUNCE_MS, 'number');
    const box = row('a.name').querySelector('input');
    type(box, 'ab');
    type(box, 'abc');
    check('nothing is written while typing', store.get('a.name'), '');
    await wait(60);
    check('the last text is written after the pause', store.get('a.name'), 'abc');
    ok('…and the row is marked', isModified(row('a.name')));
    type(box, 'abcd');
    box.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('Enter writes it at once', store.get('a.name'), 'abcd');
    const dir = row('a.dir').querySelector('input');
    type(dir, '/x');
    fire(dir, 'change');
    check('blur (change) writes it at once', store.get('a.dir'), '/x');
    type(dir, '');
    fire(dir, 'change');
    check('emptied, a text whose default is null writes null', store.get('a.dir'), null);
    ok('…which is the default again', !isModified(row('a.dir')));
    type(box, 'pending');
    view.dispose();
    check('dispose writes a pending edit rather than lose it', store.get('a.name'), 'pending');
}

// ── §8 ──────────────────────────────────────────────────────────────────
section('§8 dispose() stops listening; the content factory mounts and destroys');
{
    const { bus, store } = fixture();
    const base = bus.listenerIndex.size;
    const { view, host } = mount({ store, eventBus: bus });
    ok('mounting subscribes', bus.listenerIndex.size > base);
    view.dispose();
    check('dispose unsubscribes every listener', bus.listenerIndex.size, base);
    ok('…and removes the view', !host.querySelector('.twm-settings'));
    store.set('a.n', 40);       // nothing listening, nothing to throw
    view.dispose();             // twice is harmless
    ok('dispose twice is harmless', true);

    const factory = settingsViewContent({ store, eventBus: bus, title: 'Preferences' });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const handle = factory(el, { category: 'late' }, {});
    check('the factory gives a title', handle.title, 'Preferences');
    ok('…mounts the view', !!el.querySelector('.twm-settings'));
    check('…on props.category', handle.view.getCategory(), 'late');
    handle.destroy();
    ok('destroy() takes it down', !el.querySelector('.twm-settings') && bus.listenerIndex.size === base);

    let threw = false;
    try { new SettingsView({ store, eventBus: null }); } catch { threw = true; }
    ok('a view with no bus is refused', threw);
}

// ── §9 ──────────────────────────────────────────────────────────────────
section('§9 its CSS: every class has a rule, and no hex literal');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const start = css.indexOf('/* ══ SETTINGS VIEW ');
    const end = css.indexOf('/* ══ end SETTINGS VIEW ══ */');
    ok('flexdesk.css has a SETTINGS VIEW section', start >= 0 && end > start);
    const sheet = stripComments(css.slice(start, end));
    check('no hex colour literal in it', sheet.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
    const tokens = readFileSync(resolvePath(HERE, '../css/tokens.css'), 'utf8');
    const missing = [...new Set(sheet.match(/var\(--[a-z0-9-]+/g) || [])]
        .map((v) => v.slice(4)).filter((t) => !tokens.includes(`${t}:`));
    check('every token it reads is defined in tokens.css', missing, []);
    const src = readFileSync(resolvePath(HERE, '../src/ui/components/settings_view.js'), 'utf8');
    const used = [...new Set(src.match(/twm-settings(__[a-z-]+)?(--[a-z]+)?/g))];
    const unstyled = used.filter((c) => !new RegExp(`\\.${c}(?![a-z_-])`).test(sheet));
    check('every class the view sets has a rule', unstyled, []);
}

// ── §10 ─────────────────────────────────────────────────────────────────
section('§10 the barrels export it');
{
    const widgets = readFileSync(resolvePath(HERE, '../widgets.js'), 'utf8');
    ok('widgets.js re-exports settings_view.js',
       widgets.includes("export * from './src/ui/components/settings_view.js';"));
    const w = await import('../widgets.js');
    ok('…SettingsView and settingsViewContent', typeof w.SettingsView === 'function'
       && typeof w.settingsViewContent === 'function');
    const c = await import('../core.js');
    ok('core.js exports getSettingsStore', typeof c.getSettingsStore === 'function');
    const docs = readFileSync(resolvePath(HERE, '../docs/components/settings-view.md'), 'utf8');
    ok('the docs document SettingsView', docs.includes('SettingsView')
       && docs.includes('settingsViewContent') && docs.includes('getSettingsStore'));
}

// ── §11 ─────────────────────────────────────────────────────────────────
section('§11 sidebar: false leaves the filter, the categories and Reset all out');
{
    const { bus, store } = fixture();
    const { view, q, qa } = mount({ store, eventBus: bus, sidebar: false });
    ok('no sidebar', !q('.twm-settings__sidebar'));
    ok('…no filter box, no category list, no Reset all',
       !q('.twm-settings__search-input') && !qa('.twm-settings__cat').length && !q('.twm-settings__reset-all'));
    ok('the content is drawn', !!q('.twm-settings__content .twm-settings__title'));
    check('…for the first category', q('.twm-settings__title').textContent, 'First');
    view.selectCategory('mid');
    check('selectCategory() still shows a category', q('.twm-settings__title').textContent, 'Middle');
    view.setQuery('kappa');
    check('setQuery() still filters', qa('.twm-settings__row').map((r) => r.dataset.path), ['b.k']);
    view.dispose();

    const plain = mount({ store, eventBus: bus });
    ok('without the option the sidebar is drawn',
       !!plain.q('.twm-settings__sidebar .twm-settings__search-input')
       && plain.qa('.twm-settings__sidebar .twm-settings__cat').length === 3
       && !!plain.q('.twm-settings__sidebar .twm-settings__reset-all'));
    plain.view.dispose();
    const factory = settingsViewContent({ store, eventBus: bus, sidebar: false });
    const host = document.createElement('div');
    const made = factory(host, {});
    ok('the content factory passes sidebar: false through', !host.querySelector('.twm-settings__sidebar'));
    made.destroy();
    let threw = null;
    try { new SettingsCategories({ view: {} }); } catch (e) { threw = e; }
    ok('SettingsCategories refuses something that is not a SettingsView', threw instanceof TypeError);
}

function mountCategories(view) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cats = new SettingsCategories({ view });
    cats.mount(host);
    const q = (s) => host.querySelector(s);
    const qa = (s) => [...host.querySelectorAll(s)];
    return { cats, host, q, qa };
}

// ── §12 ─────────────────────────────────────────────────────────────────
section('§12 SettingsCategories mounted elsewhere lists, filters and selects');
{
    const { bus, store } = fixture();
    const page = mount({ store, eventBus: bus, sidebar: false });
    const nav = mountCategories(page.view);
    ok('it is its own element, outside the view', !!nav.q('.twm-settings-categories')
       && !page.host.contains(nav.host) && !nav.host.contains(page.host));
    check('it lists the categories in order', nav.qa('.twm-settings__cat').map((b) => b.dataset.category),
          ['first', 'mid', 'late']);
    check('…with their labels', nav.qa('.twm-settings__cat-label').map((n) => n.textContent),
          ['First', 'Middle', 'Late']);
    ok('the view\'s category is marked', nav.q('.twm-settings__cat--active')?.dataset.category === 'first'
       && nav.q('.twm-settings__cat--active').getAttribute('aria-current') === 'page');
    ok('it holds a filter box and Reset all',
       !!nav.q('.twm-settings__search-input') && !!nav.q('.twm-settings__reset-all'));

    nav.q('.twm-settings__cat[data-category="late"]').click();
    check('a click shows that category in the view', page.view.getCategory(), 'late');
    check('…its page drawn', [page.q('.twm-settings__title').textContent,
                             page.qa('.twm-settings__row').map((r) => r.dataset.path)], ['Late', ['c.z']]);
    ok('…and marked in the list', nav.q('.twm-settings__cat--active')?.dataset.category === 'late');

    type(nav.q('.twm-settings__search-input'), 'Count');
    check('typing in its filter filters the view', page.view.getQuery(), 'Count');
    check('…the matches drawn', page.qa('.twm-settings__row').map((r) => r.dataset.path), ['a.n']);
    ok('…and no category is marked while filtering', !nav.q('.twm-settings__cat--active'));
    type(nav.q('.twm-settings__search-input'), '<img src=x onerror=alert(1)>');
    ok('a query holding markup makes no element', !page.q('img') && !nav.q('img'));
    nav.cats.dispose();
    page.view.dispose();
}

// ── §13 ─────────────────────────────────────────────────────────────────
section('§13 the filter and the category stay in step, both ways');
{
    const { bus, store } = fixture();
    const page = mount({ store, eventBus: bus, sidebar: false });
    const nav = mountCategories(page.view);
    const seen = [];
    const off = page.view.subscribe((s) => seen.push(s));
    const input = () => nav.q('.twm-settings__search-input');
    const active = () => nav.q('.twm-settings__cat--active')?.dataset.category ?? null;

    page.view.selectCategory('mid');
    check('view.selectCategory() marks it in the list', active(), 'mid');
    page.view.setQuery('zeta');
    check('view.setQuery() puts the text in the list\'s filter', input().value, 'zeta');
    check('…and unmarks the category', active(), null);
    page.view.setQuery('');
    check('clearing the filter in the view clears the list\'s', input().value, '');
    check('…and marks the category again', active(), 'mid');

    type(input(), 'kappa');
    nav.q('.twm-settings__cat[data-category="first"]').click();
    check('choosing a category in the list clears the filter in both',
          [page.view.getQuery(), input().value], ['', '']);
    check('…and the view shows it', [page.view.getCategory(), page.q('.twm-settings__title').textContent],
          ['first', 'First']);
    type(input(), '   ');
    check('a filter of only spaces keeps the category marked', active(), 'first');

    check('subscribe() reported each change', seen.map((s) => [s.category, s.query]), [
        ['mid', ''], ['mid', 'zeta'], ['mid', ''], ['mid', 'kappa'], ['first', ''], ['first', '   '],
    ]);

    store.extend({ defaults: { d: { q: 1 } },
        categories: [{ id: 'early', label: 'Early', icon: 'tune', order: 1 }],
        schema: { 'd.q': { type: 'number', category: 'early', group: 'G', label: 'Q', defaultValue: 1 } } });
    check('a category registered later joins the list in order',
          nav.qa('.twm-settings__cat').map((b) => b.dataset.category), ['early', 'first', 'mid', 'late']);
    check('…the selection stays', [active(), page.view.getCategory()], ['first', 'first']);

    const before = seen.length;
    off();
    page.view.selectCategory('late');
    check('the unsubscribe stops the reports', seen.length, before);
    check('…while the list still follows', active(), 'late');

    // Both the view's own sidebar and a list elsewhere: all three agree.
    const both = mount({ store, eventBus: bus });
    const nav2 = mountCategories(both.view);
    type(both.q('.twm-settings__search-input'), 'Name');
    check('the view\'s own filter moves the list\'s', nav2.q('.twm-settings__search-input').value, 'Name');
    nav2.q('.twm-settings__cat[data-category="mid"]').click();
    check('the list\'s click clears the view\'s own filter and marks there too',
          [both.q('.twm-settings__search-input').value, both.q('.twm-settings__cat--active')?.dataset.category],
          ['', 'mid']);
    nav2.cats.dispose();
    both.view.dispose();
    nav.cats.dispose();
    page.view.dispose();
}

// ── §14 ─────────────────────────────────────────────────────────────────
section('§14 Reset all in the categories asks to confirm; dispose() takes it down');
{
    const { bus, store } = fixture();
    const asked = [];
    let answer = false;
    const confirm = async (o) => { asked.push(o.title); return answer; };
    const page = mount({ store, eventBus: bus, sidebar: false, confirm });
    const nav = mountCategories(page.view);
    store.set('a.n', 50);
    nav.q('.twm-settings__reset-all').click();
    await tick();
    check('it asks the view\'s confirm', asked, ['Reset all settings']);
    check('Cancel changes nothing', store.get('a.n'), 50);
    answer = true;
    nav.q('.twm-settings__reset-all').click();
    await tick();
    check('OK resets every setting', [asked.length, store.get('a.n')], [2, 10]);
    ok('…and the view\'s row is no longer modified', !isModified(page.row('a.n')));

    const { bus: bus2, store: store2 } = fixture();
    const page2 = mount({ store: store2, eventBus: bus2, sidebar: false });
    const nav3 = mountCategories(page2.view);
    // the default confirm is openConfirm, as in the view's own sidebar
    nav3.q('.twm-settings__reset-all').click();
    await tick();
    const dialog = document.querySelector('.twm-managed-window--modal');
    ok('with no confirm given it opens the confirm dialog',
       /Reset every setting to its default\?/.test(dialog?.textContent || ''));
    [...(dialog?.querySelectorAll('button') || [])].find((b) => /Cancel/.test(b.textContent))?.click();
    await tick();

    nav.cats.dispose();
    ok('dispose() removes the list', !nav.host.querySelector('.twm-settings-categories'));
    page.view.selectCategory('late');
    ok('…and it no longer follows the view', !nav.host.querySelector('.twm-settings__cat'));
    nav.cats.dispose();
    ok('dispose() twice is harmless', true);
    nav3.cats.dispose();
    page2.view.dispose();
    page.view.dispose();

    const css = stripComments(readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8'));
    ok('flexdesk.css styles .twm-settings-categories', /\.twm-settings-categories\s*\{/.test(css));
    const w = await import('../widgets.js');
    ok('widgets.js exports SettingsCategories', w.SettingsCategories === SettingsCategories);
    const docs = readFileSync(resolvePath(HERE, '../docs/components/settings-view.md'), 'utf8');
    ok('the docs document it under a (0.17.2) heading',
       /^## .*SettingsCategories.*\(0\.17\.2\)$/m.test(docs) && docs.includes('sidebar: false'));
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
