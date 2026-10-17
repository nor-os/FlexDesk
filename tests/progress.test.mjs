/**
 * ══ DETERMINATE PROGRESS: BAR, LIST, PHASES AND THE JOB DIALOGS ══════════════
 *
 * STORY-0052. `src/ui/components/progress.js` and the `progress` / `steps`
 * options on `showRunProgressDialog` and `showComputingWindow`:
 *
 *   §1  ProgressBar: `update(0.42)` changes the existing fill's width and the
 *       readout's text without replacing a node; value/max and the count;
 *       indeterminate; elapsed time; cancel; final states.
 *   §2  ProgressList: `setItems` with the same keys at 20 updates a second
 *       keeps every row element; new keys add rows, gone keys lose theirs,
 *       order follows; an item without `total` scales against the largest
 *       item; stats line; states.
 *   §3  StepProgress: phases done / active / pending / error, in order;
 *       "pass n of m".
 *   §4  showRunProgressDialog: bar and phases; `result` settles `done` /
 *       `error`; closing while running (×, Escape, `close()`) settles
 *       `cancelled` and never calls onCancel; Stop then Escape calls it once.
 *   §5  showComputingWindow: the same, and opening another settles the first
 *       `cancelled` without calling its onCancel; a handle's `close()` still
 *       closes the active window.
 *   §6  The barrel exports the three classes; the stylesheet styles them.
 *
 *     node tests/progress.test.mjs
 *
 * It imports `../src/ui/components/*.js` DIRECTLY, never `dist/`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody } from './css_rules.mjs';

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
    console.log('progress: SKIPPED — needs jsdom '
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

const {
    ProgressBar, ProgressList, StepProgress, formatElapsed,
} = await import('../src/ui/components/progress.js');
const { showRunProgressDialog } = await import('../src/ui/components/confirm_dialog.js');
const { showComputingWindow } = await import('../src/ui/components/computing_status_window.js');

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
    ok(what, a === e, `got ${a}, expected ${e}`);
}
const section = (t) => console.log(`\n${t}`);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** Resolve `p` or report it pending after `ms`. */
const settled = (p, ms = 50) => Promise.race([p, tick(ms).then(() => 'PENDING')]);
const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };
const readout = (bar) => bar.element.querySelector('.twm-progress__readout').textContent;
const fill = (bar) => bar.element.querySelector('.twm-progress__fill');

// ═════════════════════════════════════════════════════════════════════════
section('§1 ProgressBar');
{
    const bar = new ProgressBar(host(), { label: 'Working' });
    const root = bar.element;
    const f = fill(bar);
    const ro = bar.element.querySelector('.twm-progress__readout');
    const children = [...root.querySelectorAll('*')];
    const mo = new MutationObserver(() => {});
    mo.observe(root, { childList: true, subtree: true });
    bar.update(0.42);
    const childListChanges = mo.takeRecords().filter((r) => r.type === 'childList'
        && [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1));
    mo.disconnect();
    check('update(0.42): the fill is 42% wide', f.style.width, '42%');
    check('update(0.42): the readout reads 42%', ro.textContent, '42%');
    ok('update(0.42): the same fill element is still in the bar', root.querySelector('.twm-progress__fill') === f);
    ok('update(0.42): the same readout element is still in the bar', root.querySelector('.twm-progress__readout') === ro);
    ok('update(0.42): every element of the bar is the one built', children.every((n, i) => root.querySelectorAll('*')[i] === n));
    check('update(0.42): no element was added or removed', childListChanges.length, 0);
    check('aria-valuenow follows', root.querySelector('.twm-progress__track').getAttribute('aria-valuenow'), '42');
    check('the label is text', root.querySelector('.twm-progress__label').textContent, 'Working');

    const counted = new ProgressBar(host(), { value: 0, max: 50 });
    counted.update(21);
    check('value/max: 21 of 50 is 42% and reads the count', readout(counted), '42% · 21 / 50');
    check('value/max: the fill is 42%', fill(counted).style.width, '42%');
    counted.update({ value: 30, max: 60, label: 'Rows' });
    check('update({value, max, label}) changes all three', [readout(counted), counted.element.querySelector('.twm-progress__label').textContent], ['50% · 30 / 60', 'Rows']);
    const noCount = new ProgressBar(host(), { max: 10, showCount: false, value: 5 });
    check('showCount:false keeps only the percent', readout(noCount), '50%');
    const noPct = new ProgressBar(host(), { max: 10, showPercent: false, value: 5 });
    check('showPercent:false keeps only the count', readout(noPct), '5 / 10');
    check('a fraction past 1 is clamped', new ProgressBar(null, { value: 3 }).fraction, 1);

    const busy = new ProgressBar(host(), { indeterminate: true });
    ok('indeterminate: the modifier class is on', busy.element.classList.contains('twm-progress--indeterminate'));
    check('indeterminate: no readout and no aria-valuenow', [readout(busy), busy.element.querySelector('.twm-progress__track').hasAttribute('aria-valuenow')], ['', false]);
    busy.update(0.5);
    ok('a value ends indeterminate', !busy.element.classList.contains('twm-progress--indeterminate') && readout(busy) === '50%');

    let t = 1000;
    const timed = new ProgressBar(host(), { showElapsed: true, now: () => t });
    const elapsedEl = timed.element.querySelector('.twm-progress__elapsed');
    check('elapsed starts at 0:00', elapsedEl.textContent, '0:00');
    t += 65_000; timed.update(0.1);
    check('elapsed reads m:ss on the next update', elapsedEl.textContent, '1:05');
    timed.setState('done');
    t += 10_000; timed._drawElapsed();
    check('a final state freezes elapsed', elapsedEl.textContent, '1:05');
    check('formatElapsed: an hour on reads h:mm:ss', formatElapsed(3_723_000), '1:02:03');
    ok('done: the bar is full and wears --done', timed.fraction === 1 && timed.element.classList.contains('twm-progress--done'));
    timed.update(0.2);
    check('update after a final state is ignored', timed.fraction, 1);

    let cancels = 0;
    const can = new ProgressBar(host(), { onCancel: () => { cancels += 1; } });
    const btn = can.element.querySelector('.twm-progress__cancel');
    btn.click(); btn.click();
    check('Cancel calls onCancel once and disables itself', [cancels, btn.disabled], [1, true]);
    can.setState('error');
    ok('error wears --error and not --running', can.element.classList.contains('twm-progress--error')
        && !can.element.classList.contains('twm-progress--running'));
    for (const b of [bar, counted, noCount, noPct, busy, timed, can]) b.dispose();
}

// ═════════════════════════════════════════════════════════════════════════
section('§2 ProgressList');
{
    const list = new ProgressList(host());
    const items = (n) => ['w1', 'w2', 'w3', 'w4'].map((key, i) => ({
        key, name: `Worker ${i + 1}`, completed: Math.min(50, n + i), total: 50,
        state: n + i >= 50 ? 'done' : 'running',
    }));
    list.setItems(items(0));
    const before = ['w1', 'w2', 'w3', 'w4'].map((k) => list.rowFor(k));
    const fillsBefore = before.map((r) => r.querySelector('.twm-progress-list__fill'));
    // Records are delivered to the callback between the awaits below, so the
    // callback collects them; takeRecords() picks up any still queued.
    const seenRecords = [];
    const mo = new MutationObserver((recs) => { seenRecords.push(...recs); });
    mo.observe(list.element, { childList: true, subtree: true });
    // 20 updates a second, for two seconds, on a real clock.
    for (let n = 1; n <= 40; n++) {
        list.setItems(items(n));
        await tick(50);
    }
    const elementChanges = [...seenRecords, ...mo.takeRecords()].filter((r) => r.type === 'childList'
        && [...r.addedNodes, ...r.removedNodes].some((x) => x.nodeType === 1));
    mo.disconnect();
    const after = ['w1', 'w2', 'w3', 'w4'].map((k) => list.rowFor(k));
    ok('40 setItems at 20/s with the same keys: every row is the same element',
        before.every((r, i) => r === after[i] && r.isConnected));
    ok('…and every fill is the same element',
        fillsBefore.every((f, i) => after[i].querySelector('.twm-progress-list__fill') === f));
    check('…and no element was added to or removed from the list', elementChanges.length, 0);
    check('the rows show the latest counts', after.map((r) => r.querySelector('.twm-progress-list__count').textContent),
        ['40 / 50', '41 / 50', '42 / 50', '43 / 50']);
    check('the fills follow', after.map((r) => r.querySelector('.twm-progress-list__fill').style.width),
        ['80%', '82%', '84%', '86%']);
    ok('a running row wears --running', after[0].classList.contains('twm-progress-list__row--running'));

    list.setItems([{ key: 'w3', completed: 1, total: 2, state: 'failed' }, { key: 'w1', completed: 50, total: 50, state: 'done' }, { key: 'w9', name: 'New', state: 'pending' }]);
    const rows = [...list.element.querySelectorAll('.twm-progress-list__row')];
    check('setItems: rows follow the new order and gone keys are removed', rows.length, 3);
    ok('…a kept key keeps its element in its new place', rows[0] === after[2] && rows[1] === after[0]);
    ok('…a removed row is detached', !after[1].isConnected && !after[3].isConnected);
    ok('…a new key gets a row', rows[2] === list.rowFor('w9') && !before.includes(rows[2]));
    check('…the name defaults to the key, and a new row is pending', [list.rowFor('w3').querySelector('.twm-progress-list__name').textContent,
        rows[2].classList.contains('twm-progress-list__row--pending')], ['w3', true]);
    ok('…failed and done wear their classes', rows[0].classList.contains('twm-progress-list__row--failed')
        && rows[1].classList.contains('twm-progress-list__row--done')
        && !rows[1].classList.contains('twm-progress-list__row--running'));
    check('the default stats line counts the states', list.element.querySelector('.twm-progress-list__stats').textContent,
        '1 / 3 done · 1 failed · 1 pending · 51 completed');

    // An item without total scales against the largest item.
    const scaled = new ProgressList(host(), { items: [
        { key: 'a', completed: 30, total: 80, state: 'running' },
        { key: 'b', completed: 20, state: 'running' },
        { key: 'c', completed: 40, state: 'running' },
    ] });
    const w = (k) => scaled.rowFor(k).querySelector('.twm-progress-list__fill').style.width;
    check('an item with total is drawn against its own total', w('a'), '37.5%');
    check('an item without total is drawn against the largest item (80)', [w('b'), w('c')], ['25%', '50%']);
    check('an item without total reads its count alone', scaled.rowFor('b').querySelector('.twm-progress-list__count').textContent, '20');
    scaled.setItems([{ key: 'b', completed: 20 }, { key: 'c', completed: 40 }]);
    check('with no totals, the largest item is full and the rest scale to it', [w('b'), w('c')], ['50%', '100%']);

    const custom = new ProgressList(host(), { stats: (its) => `${its.length} jobs`, items: [{ key: 1 }] });
    check('a stats function writes the line', custom.element.querySelector('.twm-progress-list__stats').textContent, '1 jobs');
    const none = new ProgressList(host(), { stats: false, items: [{ key: 1 }] });
    ok('stats:false hides the line', none.element.querySelector('.twm-progress-list__stats').hidden);
    const evil = new ProgressList(host(), { items: [{ key: 'x', name: '<img src=x onerror=alert(1)>' }] });
    ok('a name is text', !evil.element.querySelector('img'));
    ok('pulse is on by default', list.element.classList.contains('twm-progress-list--pulse'));
}

// ═════════════════════════════════════════════════════════════════════════
section('§3 StepProgress');
{
    const sp = new StepProgress(host(), { steps: [
        { key: 'prepare', label: 'Prepare' }, { key: 'solve', label: 'Solve' },
        { key: 'render', label: 'Render' }, { key: 'write', label: 'Write' },
    ] });
    const states = () => sp.steps.map((s) => s.state);
    const classes = () => [...sp.element.children].map((li) => ['done', 'active', 'pending', 'error']
        .filter((s) => li.classList.contains(`twm-steps__step--${s}`)).join());
    check('all phases start pending', states(), ['pending', 'pending', 'pending', 'pending']);
    sp.setStep('solve', { pass: 2, passes: 5 });
    check('setStep: before done, it active, after pending', states(), ['done', 'active', 'pending', 'pending']);
    check('…and the classes say the same, in order', classes(), ['done', 'active', 'pending', 'pending']);
    check('…the active phase reads "pass n of m"', sp.element.children[1].querySelector('.twm-steps__pass').textContent, 'pass 2 of 5');
    ok('…and only the active phase is aria-current', sp.element.children[1].getAttribute('aria-current') === 'step'
        && !sp.element.children[0].hasAttribute('aria-current'));
    sp.setStep(2);
    check('setStep by index moves on', states(), ['done', 'done', 'active', 'pending']);
    ok('…the pass text leaves the phase it was on', sp.element.children[1].querySelector('.twm-steps__pass').hidden);
    sp.fail();
    check('fail(): the active phase is error, later pending', classes(), ['done', 'done', 'error', 'pending']);
    sp.complete();
    check('complete(): every phase done', states(), ['done', 'done', 'done', 'done']);
    let threw = false;
    try { sp.setStep('nope'); } catch { threw = true; }
    ok('an unknown step throws', threw);
    check('string steps take their index as key', new StepProgress(null, { steps: ['A', 'B'] }).setStep('1').steps.map((s) => s.state), ['done', 'active']);
}

// ═════════════════════════════════════════════════════════════════════════
section('§4 showRunProgressDialog');
{
    const windowEl = () => document.querySelector('.twm-run-progress__body')?.closest('.run-progress');
    let cancels = 0;
    const dlg = showRunProgressDialog({ title: 'Job', progress: { max: 10 }, steps: ['Load', 'Run', 'Save'], onCancel: () => { cancels += 1; } });
    const content = windowEl();
    ok('a bar and the phases are in the dialog', content.querySelector('.twm-progress') && content.querySelector('.twm-steps'));
    ok('…the spinner is hidden while a bar shows', content.querySelector('.twm-run-progress__spinner').hidden);
    dlg.setStep(1); dlg.setProgress(4);
    check('setProgress and setStep reach them', [content.querySelector('.twm-progress__readout').textContent,
        [...content.querySelectorAll('.twm-steps__step--active')].length], ['40% · 4 / 10', 1]);
    check('result is pending while running', await settled(dlg.result), 'PENDING');
    dlg.complete({ ok: true, message: 'All done' });
    check('complete({ok:true}) settles done', await settled(dlg.result), { status: 'done', message: 'All done' });
    ok('…the bar is done and every phase done', content.querySelector('.twm-progress--done')
        && content.querySelectorAll('.twm-steps__step--done').length === 3);
    dlg.close();
    check('closing after complete does not cancel', cancels, 0);
    ok('the dialog is gone', !windowEl());

    const bad = showRunProgressDialog({ steps: ['A', 'B'] });
    bad.setStep(1);
    bad.complete({ ok: false, message: 'Broke' });
    check('complete({ok:false}) settles error', await settled(bad.result), { status: 'error', message: 'Broke' });
    ok('…and marks the active phase error', windowEl().querySelector('.twm-steps__step--error'));
    bad.close();

    let userCancels = 0;
    const running = showRunProgressDialog({ progress: true, onCancel: () => { userCancels += 1; } });
    running.setProgress(0.3);
    const xBtn = windowEl().closest('.twm-managed-window').querySelector('.twm-managed-window__btn--close');
    ok('the window has a close button in its chrome', xBtn);
    xBtn.click();
    check('closing by × while running settles cancelled', await settled(running.result), { status: 'cancelled', message: 'Cancelled.' });
    check('…and does not call onCancel', userCancels, 0);
    ok('…and the dialog is gone', !windowEl());

    let esc = 0;
    const byEsc = showRunProgressDialog({ onCancel: () => { esc += 1; } });
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape while running settles cancelled without calling onCancel', [await settled(byEsc.result), esc], [{ status: 'cancelled', message: 'Cancelled.' }, 0]);

    let stops = 0;
    const stopThenEsc = showRunProgressDialog({ onCancel: () => { stops += 1; } });
    windowEl().querySelector('.twm-run-progress__stop-btn').click();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Stop then Escape calls onCancel once and settles cancelled', [stops, await settled(stopThenEsc.result)], [1, { status: 'cancelled', message: 'Cancelled.' }]);

    let handleCancels = 0;
    const byHandle = showRunProgressDialog({ onCancel: () => { handleCancels += 1; } });
    byHandle.close();
    check('close() while running settles cancelled without calling onCancel', [await settled(byHandle.result), handleCancels], [{ status: 'cancelled', message: 'Cancelled.' }, 0]);

    const plain = showRunProgressDialog({});
    ok('without progress or steps there is no bar and no phases', !windowEl().querySelector('.twm-progress, .twm-steps'));
    plain.cancelled('Stopped');
    check('cancelled(msg) settles cancelled', await settled(plain.result), { status: 'cancelled', message: 'Stopped' });
    plain.close();
}

// ═════════════════════════════════════════════════════════════════════════
section('§5 showComputingWindow');
{
    const content = () => document.querySelector('.twm-computing-status');
    let cancels = 0;
    const w = showComputingWindow({ title: 'Busy', message: 'Working', progress: { showElapsed: true }, steps: ['One', 'Two'], onCancel: () => { cancels += 1; } });
    ok('a bar and the phases are in the window', content().querySelector('.twm-progress') && content().querySelector('.twm-steps'));
    w.setProgress(0.5); w.setStep(1, { pass: 1, passes: 3 });
    check('setProgress and setStep reach them', [content().querySelector('.twm-progress__readout').textContent,
        content().querySelector('.twm-steps__step--active .twm-steps__pass').textContent], ['50%', 'pass 1 of 3']);
    w.complete({ ok: false, message: 'Failed' });
    check('complete({ok:false}) settles error', await settled(w.result), { status: 'error', message: 'Failed' });
    ok('…the message wears is-err and a Close button shows', content().querySelector('.twm-computing-status__message.is-err')
        && !content().querySelector('.twm-computing-status__close-btn').hidden);
    content().querySelector('.twm-computing-status__close-btn').click();
    ok('Close closes it', !content());
    check('…without cancelling', cancels, 0);

    let c2 = 0;
    const first = showComputingWindow({ onCancel: () => { c2 += 1; } });
    const firstEl = content();
    let c3 = 0;
    const second = showComputingWindow({ message: 'Next', onCancel: () => { c3 += 1; } });
    check('opening another settles the first cancelled', await settled(first.result), { status: 'cancelled', message: 'Cancelled.' });
    check('…without calling its onCancel', c2, 0);
    ok('…and replaces its window', !firstEl.isConnected && content());
    content().querySelector('.twm-computing-status__cancel-btn').click();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Cancel then Escape calls onCancel once and settles cancelled', [c3, await settled(second.result)], [1, { status: 'cancelled', message: 'Cancelled.' }]);

    let c4 = 0;
    showComputingWindow({ onCancel: () => { c4 += 1; } });
    const third = showComputingWindow({});
    first.close();
    ok('a handle\'s close() closes the active window, as before', !content());
    check('…settling it cancelled without calling any onCancel', [await settled(third.result), c4], [{ status: 'cancelled', message: 'Cancelled.' }, 0]);

    const done = showComputingWindow({});
    done.setProgress(0.9);
    done.complete({ ok: true, message: 'Ok' });
    check('complete({ok:true}) settles done', await settled(done.result), { status: 'done', message: 'Ok' });
    ok('…and fills the bar', content().querySelector('.twm-progress--done .twm-progress__fill').style.width === '100%');
    done.close();
}

// ═════════════════════════════════════════════════════════════════════════
section('§6 barrel and stylesheet');
{
    const barrel = await import('../widgets.js');
    ok('widgets exports ProgressBar, ProgressList, StepProgress',
        barrel.ProgressBar === ProgressBar && barrel.ProgressList === ProgressList && barrel.StepProgress === StepProgress);
    for (const name of ['base.css', 'flexdesk.css']) {
        const css = readFileSync(resolvePath(HERE, '../css', name), 'utf8');
        for (const sel of ['.twm-progress__fill, .twm-progress-list__fill', '.twm-progress--indeterminate .twm-progress__fill',
            '.twm-progress-list__row', '.twm-steps__step--active .twm-steps__marker', '.twm-steps__step--error']) {
            ok(`${name} styles ${sel}`, ruleBody(css, sel) !== null);
        }
    }
}

if (failures) {
    console.error(`\nprogress: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
process.exit(0);
