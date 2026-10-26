/**
 * BUG-0033 NotificationCenter toasts — A CARD THE SHEET STYLES, AND BUTTONS
 * THAT CAN BE CLICKED.
 *
 * Toast cards carried the unprefixed `notification` / `notification--<severity>`
 * classes, which no FlexDesk sheet styles, and the sheet animated with a
 * `notification-in` it never defined. A card had no background, no severity
 * border, and inherited the root's `pointer-events: none`, so its buttons were
 * dead.
 *
 *   §1  a toast, its severity, the "+N more" summary and every node inside
 *       carry twm- classes only; a severity change swaps the twm- class
 *   §2  in jsdom's cascade over each sheet, the root takes no pointer events
 *       and the card takes them back; a warn card has the warn border
 *   §3  each sheet: the card rule (background, left border, pointer events,
 *       animation), one rule per coloured severity after it, and every
 *       animation a notification rule uses is a @keyframes the sheet defines
 *   §4  the action button calls its handler; a click on the card closes it
 *
 *     node tests/notification_toast_styles.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const T = await dataTableEnv('notification toast styles');
const { check, ok, section, done, document, window, css, click } = T;
const { NotificationCenter } = await import('../src/ui/notification_center.js');

const bus = () => {
    const subs = new Map();
    return {
        on(name, fn) { (subs.get(name) || subs.set(name, []).get(name)).push(fn); return () => {}; },
        off() {}, once() { return () => {}; },
        emit(name, payload) { (subs.get(name) || []).forEach((f) => f(payload)); },
    };
};
const fresh = (opts) => {
    document.getElementById('notification-center-root')?.remove();
    const nc = new NotificationCenter({ eventBus: bus(), maxVisible: 1, ...opts });
    nc.mount(document.body);
    return nc;
};
const toastEl = (id) => document.querySelector(`[data-notification-id="${id}"]`);
const SHEETS = ['flexdesk.css', 'base.css'];
// Icon glyph spans carry the icon font's class, which is not FlexDesk's to prefix.
const FOREIGN = new Set(['material-symbols-outlined']);
const unprefixed = (root) => [root, ...root.querySelectorAll('[class]')]
    .flatMap((el) => [...el.classList])
    .filter((c) => !c.startsWith('twm-') && !FOREIGN.has(c));

section('§1 twm- classes only');
let warnId;
{
    const nc = fresh({ overflow: 'collapse' });
    let got = 0;
    warnId = nc.show({ severity: 'warn', title: 'Disk', message: 'Almost full', persistent: true,
                       actions: [{ label: 'Free up', handler: () => { got++; } }] });
    nc.show({ severity: 'info', message: 'held', persistent: true });
    const card = toastEl(warnId);
    ok('the card is a twm-notification', card?.classList.contains('twm-notification'));
    ok('…with its severity, prefixed', card?.classList.contains('twm-notification--warn'));
    ok('…and not the bare classes', !card?.classList.contains('notification')
       && !card?.classList.contains('notification--warn'));
    check('nothing in the card is unprefixed', unprefixed(card), []);
    const summary = document.querySelector('.twm-notification--summary');
    ok('the summary is a twm-notification too', summary?.classList.contains('twm-notification'));
    check('…with nothing unprefixed', unprefixed(summary), []);
    check('the live region is prefixed', unprefixed(document.querySelector('[aria-live]')), []);
    nc.update(warnId, { severity: 'error' });
    ok('a severity change swaps the twm- class', card.classList.contains('twm-notification--error')
       && !card.classList.contains('twm-notification--warn'));
    nc.dispose();
    check('(no handler ran)', got, 0);
}

section('§2 the cascade: the card takes pointer events back');
for (const sheet of SHEETS) {
    const style = document.createElement('style');
    style.textContent = css(sheet);
    document.head.appendChild(style);
    const nc = fresh();
    const id = nc.show({ severity: 'warn', message: 'styled', persistent: true,
                         actions: [{ label: 'Go', handler: () => {} }] });
    const card = toastEl(id);
    const root = document.querySelector('.twm-notification-center');
    check(`${sheet}: the root takes none`, window.getComputedStyle(root).pointerEvents, 'none');
    check(`${sheet}: the card takes them`, window.getComputedStyle(card).pointerEvents, 'auto');
    ok(`${sheet}: the card has a background`, window.getComputedStyle(card).backgroundColor !== ''
       && window.getComputedStyle(card).backgroundColor !== 'rgba(0, 0, 0, 0)');
    ok(`${sheet}: the warn border`, /color-warning/.test(window.getComputedStyle(card).borderLeftColor),
       window.getComputedStyle(card).borderLeftColor);
    nc.dispose();
    style.remove();
}

section('§3 the sheets');
for (const sheet of SHEETS) {
    const text = stripComments(css(sheet));
    const card = ruleBody(text, '.twm-notification');
    ok(`${sheet}: a .twm-notification rule`, card);
    ok(`${sheet}: …pointer-events: auto`, /pointer-events:\s*auto/.test(card || ''));
    ok(`${sheet}: …a background`, /background:/.test(card || ''));
    ok(`${sheet}: …a left border`, /border-left:/.test(card || ''));
    ok(`${sheet}: …the entry animation`, /animation:\s*twm-notification-in\b/.test(card || ''));
    const cardAt = text.search(/\.twm-notification\s*\{/);
    for (const [sel, token] of [['.twm-notification--success', '--color-success'],
                                ['.twm-notification--warn', '--color-warning'],
                                ['.twm-notification--error, .twm-notification--fatal', '--color-danger']]) {
        const body = ruleBody(text, sel);
        ok(`${sheet}: ${sel} reads ${token}`, body && body.includes(`border-left-color: var(${token}`));
        ok(`${sheet}: …after the card rule`, text.indexOf(sel.split(',')[0]) > cardAt);
    }
    ok(`${sheet}: no rule for the bare .notification`, !/(^|[\s,}])\.notification(?![-\w])/.test(text));
    const defined = new Set([...text.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
    const used = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => m[1].includes('notification'))
        .flatMap((m) => [...m[2].matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)].map((a) => a[1]))
        .filter((n) => !['none', 'inherit', 'initial', 'unset'].includes(n));
    ok(`${sheet}: the notification rules animate`, used.length >= 2);
    check(`${sheet}: every animation they use is defined here`, [...new Set(used.filter((n) => !defined.has(n)))], []);
    ok(`${sheet}: @keyframes twm-notification-in`, defined.has('twm-notification-in'));
}

section('§4 the buttons work');
{
    const nc = fresh();
    let got = 0;
    const id = nc.show({ severity: 'warn', message: 'act', persistent: true,
                         actions: [{ label: 'Go', handler: () => { got++; } }] });
    click(toastEl(id).querySelector('.twm-notification__action-btn'));
    check('the action ran', got, 1);
    const other = nc.show({ severity: 'info', message: 'close me', persistent: true });
    click(toastEl(other));
    ok('a click on the card closes it', !toastEl(other));
    nc.dispose();
}

done();
