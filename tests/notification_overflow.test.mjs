/**
 * STORY-0014 NotificationCenter `overflow: 'collapse'` — PAST THE LIMIT, WAIT,
 * DON'T PUSH SOMEBODY ELSE OFF.
 *
 *   §0  without the option the oldest toast leaves, as before
 *   §1  with it, toasts past maxVisible wait behind one "+N more" whose count
 *       rises; every one is in history as it arrives
 *   §2  closing a visible toast brings the oldest waiting one in; the summary
 *       goes when nothing waits
 *   §3  clicking the summary calls summaryAction with what waits, and says so
 *       on the bus
 *
 *     node tests/notification_overflow.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('notification overflow');
const { check, ok, section, document } = T;
const { NotificationCenter } = await import('../src/ui/notification_center.js');

const bus = () => {
    const subs = new Map(), emitted = [];
    return {
        emitted,
        on(name, fn) { (subs.get(name) || subs.set(name, []).get(name)).push(fn); return () => {}; },
        off() {}, once() { return () => {}; },
        emit(name, payload) { emitted.push([name, payload]); (subs.get(name) || []).forEach((f) => f(payload)); },
    };
};
const shown = () => [...document.querySelectorAll('.twm-notification-center__list > [data-notification-id]')]
    .map((el) => el.querySelector('.twm-notification__body').textContent);
const summary = () => document.querySelector('.twm-notification--summary');
const fresh = (opts) => {
    document.getElementById('notification-center-root')?.remove();
    const nc = new NotificationCenter({ eventBus: bus(), maxVisible: 3, ...opts });
    nc.mount(document.body);
    return nc;
};
const sticky = (message) => ({ severity: 'warn', message, persistent: true });

section('§0 without the option');
{
    const nc = fresh();
    for (const m of ['a', 'b', 'c', 'd']) nc.show(sticky(m));
    check('the oldest left', shown(), ['b', 'c', 'd']);
    ok('no summary', !summary());
    nc.dispose();
}

section('§1 collapse: past the limit, wait');
{
    const nc = fresh({ overflow: 'collapse' });
    for (const m of ['a', 'b', 'c', 'd', 'e']) nc.show(sticky(m));
    check('the first three stay', shown(), ['a', 'b', 'c']);
    check('one summary for the rest', summary()?.textContent, '+2 more');
    nc.show(sticky('f'));
    check('its count rises', summary()?.textContent, '+3 more');
    check('every one is in history as it arrives', nc.history.map((h) => h.message), ['a', 'b', 'c', 'd', 'e', 'f']);
    nc.dispose();
}

section('§2 a place frees up');
{
    const nc = fresh({ overflow: 'collapse' });
    const ids = ['a', 'b', 'c', 'd', 'e'].map((m) => nc.show(sticky(m)));
    nc.dismiss(ids[0], 'manual');
    check('the oldest waiting one comes in', shown(), ['b', 'c', 'd']);
    check('the count drops', summary()?.textContent, '+1 more');
    nc.dismiss(ids[1], 'manual');
    check('…until nothing waits', shown(), ['c', 'd', 'e']);
    ok('and the summary is gone', !summary());
    nc.dismiss(ids[4], 'manual');
    check('a visible one closes without a summary to fill from', shown(), ['c', 'd']);
    nc.dispose();
}

section('§3 the summary is reported');
{
    let got = null;
    const nc = fresh({ overflow: 'collapse', summaryAction: (held) => { got = held.map((h) => h.message); } });
    for (const m of ['a', 'b', 'c', 'd', 'e']) nc.show(sticky(m));
    summary().dispatchEvent(new T.window.MouseEvent('click', { bubbles: true }));
    check('summaryAction gets what waits', got, ['d', 'e']);
    ok('and the bus hears it', nc.eventBus.emitted.some(([n]) => n === 'notification:summary'));
    nc.dispose();
}

T.done();
