/**
 * STORY-0053 NotificationCenter PROGRESS TOASTS — A JOB'S TOAST IS PATCHED,
 * NEVER REDRAWN, AND NEVER HIDDEN WHILE IT RUNS.
 *
 *   §1  show({ progress, status, counts }) draws a ProgressBar in the toast;
 *       a fraction, { value, total } and null (indeterminate) all read
 *   §2  update(id, { progress: 0.5 }) moves that bar — same nodes — and no
 *       other toast sees a single DOM mutation
 *   §3  collapse and expand; a new info toast arriving (and one leaving)
 *       leaves the progress toast's element, collapsed state and bar alone
 *   §4  a running progress toast is persistent; update(id, { progress: 1,
 *       severity: 'success', durationMs: 3000 }) shows success, fills the bar,
 *       and dismisses it after exactly 3 s; error without a duration stays
 *   §5  overflow 'collapse', four info toasts: the running progress toast is
 *       on screen whichever came first, and "+N more" counts only the others;
 *       finished, it folds like any other; 'drop' never drops a running one
 *   §6  an action button on a progress toast calls its handler and leaves a
 *       running toast up; a click on the toast's body does not dismiss it
 *   §7  the stylesheets carry the progress-toast rules
 *
 *     node tests/notification_progress.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('notification progress');
const { check, ok, section, document, css } = T;
const { NotificationCenter } = await import('../src/ui/notification_center.js');

// A virtual clock for the auto-dismiss timers: setTimeout is the global the
// centre schedules with, so the suite swaps it for one it can advance.
const clock = (() => {
    let now = 0, seq = 0;
    const timers = new Map();
    return {
        install() {
            globalThis.setTimeout = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn }); return id; };
            globalThis.clearTimeout = (id) => { timers.delete(id); };
        },
        advance(ms) {
            const until = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = until;
        },
    };
})();
clock.install();

const fresh = (opts) => {
    document.getElementById('notification-center-root')?.remove();
    const nc = new NotificationCenter({ maxVisible: 3, ...opts });
    nc.mount(document.body);
    return nc;
};
const toastEl = (id) => document.querySelector(`[data-notification-id="${id}"]`);
const fill = (id) => toastEl(id)?.querySelector('.twm-progress__fill');
const shownIds = () => [...document.querySelectorAll('.twm-notification-center__list > [data-notification-id]')]
    .map((el) => el.getAttribute('data-notification-id'));
const summary = () => document.querySelector('.twm-notification--summary');
const click = (el) => el.dispatchEvent(new T.window.MouseEvent('click', { bubbles: true }));
const job = (extra = {}) => ({ title: 'Job', message: 'Running', progress: 0, status: 'starting', counts: '0 / 200', ...extra });

section('§1 a progress toast draws a bar');
{
    const nc = fresh();
    const a = nc.show(job({ progress: 0.25 }));
    const b = nc.show(job({ progress: { value: 30, total: 120 }, counts: '30 / 120 runs' }));
    const c = nc.show(job({ progress: null }));
    check('a fraction', fill(a)?.style.width, '25%');
    check('{ value, total }', fill(b)?.style.width, '25%');
    check('…with its counts label', toastEl(b).querySelector('.twm-progress__label')?.textContent, '30 / 120 runs');
    ok('null is indeterminate', toastEl(c).querySelector('.twm-progress--indeterminate'));
    check('the status line', toastEl(a).querySelector('.twm-notification__status')?.textContent, 'starting');
    ok('it is marked a progress toast', toastEl(a).classList.contains('twm-notification--progress'));
    ok('a plain toast has no bar', !toastEl(nc.show({ message: 'plain' }))?.querySelector('.twm-progress'));
    nc.dispose();
}

section('§2 update moves the bar without re-rendering other toasts');
{
    const nc = fresh({ maxVisible: 5 });
    const other1 = nc.show({ message: 'one', persistent: true });
    const p = nc.show(job());
    const other2 = nc.show({ message: 'two', persistent: true });
    const before = { o1: toastEl(other1), o2: toastEl(other2), p: toastEl(p), fill: fill(p) };
    const mo = new T.window.MutationObserver(() => {});
    mo.observe(before.o1, { subtree: true, childList: true, attributes: true, characterData: true });
    mo.observe(before.o2, { subtree: true, childList: true, attributes: true, characterData: true });
    const listMo = new T.window.MutationObserver(() => {});
    listMo.observe(document.querySelector('.twm-notification-center__list'), { childList: true });

    check('update finds the toast', nc.update(p, { progress: 0.5, status: 'halfway', counts: '100 / 200' }), true);
    check('the bar moved', fill(p).style.width, '50%');
    check('the status changed', toastEl(p).querySelector('.twm-notification__status').textContent, 'halfway');
    check('the counts changed', toastEl(p).querySelector('.twm-progress__label').textContent, '100 / 200');
    ok('same toast element', toastEl(p) === before.p);
    ok('same fill element', fill(p) === before.fill);
    ok('the other toasts are the same elements', toastEl(other1) === before.o1 && toastEl(other2) === before.o2);
    check('…and saw no mutation at all', mo.takeRecords().length, 0);
    check('no toast was added to or removed from the list', listMo.takeRecords().length, 0);
    mo.disconnect(); listMo.disconnect();
    nc.dispose();
}

section('§3 collapsed state and bar survive other toasts');
{
    const nc = fresh({ maxVisible: 5 });
    const p = nc.show(job({ progress: 0.3 }));
    const toggle = toastEl(p).querySelector('.twm-notification__collapse');
    check('expanded at first', toggle.getAttribute('aria-expanded'), 'true');
    click(toggle);
    ok('the toggle collapses it', toastEl(p).classList.contains('twm-notification--collapsed'));
    check('…and says so', toggle.getAttribute('aria-expanded'), 'false');
    const el = toastEl(p), barFill = fill(p);
    const info = nc.show({ message: 'new info', persistent: true });
    ok('a new info toast is drawn', toastEl(info));
    ok('the progress toast is the same element', toastEl(p) === el);
    ok('still collapsed', toastEl(p).classList.contains('twm-notification--collapsed'));
    ok('the same bar, at the same place', fill(p) === barFill && fill(p).style.width === '30%');
    nc.dismiss(info, 'manual');
    ok('one leaving does not reset it either', toastEl(p) === el && el.classList.contains('twm-notification--collapsed'));
    nc.update(p, { progress: 0.6 });
    check('a collapsed toast still moves its bar', fill(p).style.width, '60%');
    click(toggle);
    ok('and expands again', !toastEl(p).classList.contains('twm-notification--collapsed'));
    nc.update(p, { collapsed: true });
    ok('update can collapse it too', toastEl(p).classList.contains('twm-notification--collapsed'));
    nc.dispose();
}

section('§4 persistent while running; finishing into success dismisses after 3 s');
{
    const nc = fresh({ defaultDurationMs: 1000 });
    const p = nc.show(job({ durationMs: 500 }));
    clock.advance(10_000);
    ok('a running progress toast ignores timers and stays', toastEl(p));
    nc.update(p, { progress: 1, severity: 'success', message: 'Done', durationMs: 3000 });
    ok('it shows success', toastEl(p).classList.contains('notification--success'));
    ok('…not info any more', !toastEl(p).classList.contains('notification--info'));
    ok('its bar is done and full', toastEl(p).querySelector('.twm-progress--done') && fill(p).style.width === '100%');
    check('the message changed', toastEl(p).querySelector('.twm-notification__body').textContent, 'Done');
    clock.advance(2999);
    ok('still there at 2.999 s', toastEl(p));
    clock.advance(1);
    ok('gone at 3 s', !toastEl(p));
    check('history says why', nc.history.at(-1)?.reason, 'timeout');

    const e = nc.show(job());
    nc.update(e, { severity: 'error', message: 'Failed' });
    clock.advance(60_000);
    ok('an error without a duration stays until dismissed', toastEl(e)?.querySelector('.twm-progress--error'));
    const w = nc.show(job());
    nc.update(w, { severity: 'warn', message: 'Stopped' });
    ok('warn ends the bar cancelled', toastEl(w)?.querySelector('.twm-progress--cancelled'));
    nc.dispose();
}

section("§5 overflow 'collapse': a running progress toast is never folded");
{
    let nc = fresh({ overflow: 'collapse' });
    const p = nc.show(job());
    const infos = ['a', 'b', 'c', 'd'].map((m) => nc.show({ message: m, persistent: true }));
    ok('progress first: it is visible', shownIds().includes(p));
    check('three on screen in all', shownIds().length, 3);
    check('"+N more" counts only the info toasts', summary()?.textContent, '+2 more');
    ok('the progress toast is not among the held', !nc.held.some((h) => h.id === p));
    nc.dispose();

    nc = fresh({ overflow: 'collapse' });
    const ids = ['a', 'b', 'c', 'd'].map((m) => nc.show({ message: m, persistent: true }));
    const q = nc.show(job());
    ok('progress last: it is visible anyway', shownIds().includes(q));
    check('it took the place of the newest info toast', shownIds(), [ids[0], ids[1], q]);
    check('"+N more" counts the info toasts only', summary()?.textContent, '+2 more');
    check('the stepped-back toast leads the queue', nc.held.map((h) => h.id), [ids[2], ids[3]]);

    nc.update(q, { severity: 'success', progress: 1 });
    nc.show({ message: 'e', persistent: true });
    check('finished, it is an ordinary toast: a new one waits', summary()?.textContent, '+3 more');
    nc.dismiss(ids[0], 'manual');
    check('a freed place goes to the oldest held', shownIds(), [ids[1], q, ids[2]]);

    const r1 = nc.show(job()), r2 = nc.show(job()), r3 = nc.show(job());
    check('three running jobs fill the screen', shownIds(), [r1, r2, r3]);
    const r4 = nc.show(job());
    ok('a fourth running job is still shown, over the limit', shownIds().includes(r4));
    nc.update(r1, { severity: 'success' });
    check('one finishing steps back behind "+N more": back to the limit', shownIds(), [r2, r3, r4]);
    check('…at the front of the queue', nc.held[0]?.id, r1);
    nc.dispose();

    nc = fresh();
    const d = nc.show(job());
    ['a', 'b', 'c'].forEach((m) => nc.show({ message: m, persistent: true }));
    ok("'drop' never drops a running progress toast", shownIds().includes(d));
    check("…it drops the oldest other one", shownIds().length, 3);
    nc.dispose();
}

section('§6 actions on a progress toast');
{
    const nc = fresh();
    let got = null;
    const p = nc.show(job({ actions: [{ label: 'Stop', handler: (n, a) => { got = [n.id, a.label]; } }] }));
    click(toastEl(p).querySelector('.twm-notification__action-btn'));
    check('the action calls its handler', got, [p, 'Stop']);
    ok('a running toast stays up after an action', toastEl(p));
    click(toastEl(p).querySelector('.twm-notification__body'));
    ok('a click on its body does not dismiss it', toastEl(p));
    nc.update(p, { severity: 'success' });
    got = null;
    click(toastEl(p).querySelector('.twm-notification__action-btn'));
    ok('finished, the action still calls its handler', got);
    ok('…and closes it like any toast', !toastEl(p));
    nc.dispose();
}

section('§7 stylesheets');
for (const sheet of ['base.css', 'flexdesk.css']) {
    const text = css(sheet);
    ok(`${sheet}: the collapse toggle`, text.includes('.twm-notification__collapse {'));
    ok(`${sheet}: the status line`, text.includes('.twm-notification__status {'));
    ok(`${sheet}: collapsed hides the details`, /\.twm-notification--collapsed \.twm-notification__body/.test(text));
}

T.done();
