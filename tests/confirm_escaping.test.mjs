/**
 * ══ CONFIRM DIALOGS SHOW TEXT, NOT MARKUP ════════════════════════════════════
 *
 * BUG-0014. `openConfirm` wrote `message`, `confirmLabel` and `cancelLabel`
 * into `innerHTML`, and `showDeleteConfirmDialog` / `showCloseConfirmDialog`
 * concatenated `itemName` and `itemType` into that message raw. Callers pass
 * user-named items, so a flow named `<img src=x onerror=…>` rendered an image
 * and ran its handler, and a name with an unclosed `<` swallowed the rest of
 * the message. This suite is the regression:
 *
 *   §1  The record's repro: `showDeleteConfirmDialog` with an `<img onerror>`
 *       name creates no element and shows the name literally.
 *   §2  An unclosed `<` swallows nothing; `additionalMessage` still follows on
 *       its own paragraph (a `\n\n`, which the text body breaks on).
 *   §3  `showCloseConfirmDialog` and `showConfirmDialog` — the same.
 *   §4  `openConfirm` itself: message and both labels are text; the buttons
 *       still resolve true / false.
 *   §5  The stylesheet breaks the text body's lines on `\n`.
 *
 *     node tests/confirm_escaping.test.mjs
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
    console.log('confirm escaping: SKIPPED — needs jsdom '
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

const { openConfirm } = await import('../src/ui/components/modal.js');
const {
    showConfirmDialog, showDeleteConfirmDialog, showCloseConfirmDialog,
} = await import('../src/ui/components/confirm_dialog.js');

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
const section = (t) => console.log(`\n${t}`);

/** Open a confirm through `fn` and hand back its parts and the result. */
function open(fn) {
    const before = new Set(document.querySelectorAll('.twm-modal__body-host'));
    const result = fn();
    const host = [...document.querySelectorAll('.twm-modal__body-host')].find((h) => !before.has(h));
    const win = host.closest('.twm-managed-window');
    const message = host.querySelector('.twm-modal__body');
    const btn = (a) => host.querySelector(`[data-action="${a}"]`);
    return {
        host, message, result,
        title: win?.querySelector('.twm-managed-window__title')?.textContent ?? null,
        /** Elements inside the message — a text message has none. */
        elements: message.querySelectorAll('*').length,
        cancel: () => { btn('cancel').click(); return result; },
        confirm: () => { btn('confirm').click(); return result; },
        btn,
    };
}

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 the record\'s repro: an <img onerror> item name');
{
    const payload = '<img src=x onerror=alert(1)>';
    const d = open(() => showDeleteConfirmDialog({ itemName: payload, itemType: 'flow' }));
    check('the message is the name, literally', d.message.textContent, `Delete flow "${payload}"?`);
    ok('no element was created inside the message', d.elements === 0, `${d.elements} element(s)`);
    ok('no <img> anywhere in the document', !document.querySelector('img'));
    check('the title is unchanged', d.title, 'Delete Flow');
    check('cancel resolves false', await d.cancel(), false);
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 an unclosed < swallows nothing; additionalMessage follows');
{
    const d = open(() => showDeleteConfirmDialog({
        itemName: 'a <b', itemType: '<i>flow</i>', additionalMessage: 'Its <u>3</u> uses go too.',
    }));
    check('the whole message is there, as typed',
          d.message.textContent, 'Delete <i>flow</i> "a <b"?\n\nIts <u>3</u> uses go too.');
    ok('no element was created inside the message', d.elements === 0, `${d.elements} element(s)`);
    check('itemType in the title is text', d.title, 'Delete <i>flow</i>');
    check('confirm resolves true', await d.confirm(), true);
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 showCloseConfirmDialog and showConfirmDialog');
{
    const d = open(() => showCloseConfirmDialog({ itemName: '<b>x</b>', itemType: 'tab' }));
    check('the close message shows the name literally', d.message.textContent, 'Close tab "<b>x</b>"?');
    ok('no <b> was created', d.elements === 0);
    check('cancel resolves false', await d.cancel(), false);
}
{
    const d = open(() => showConfirmDialog({
        message: 'Drop <script>window.__ran = 1</script>?', okLabel: '<em>Go</em>', cancelLabel: '<em>No</em>',
    }));
    check('the message is text', d.message.textContent, 'Drop <script>window.__ran = 1</script>?');
    ok('no <script> was created', d.elements === 0 && !document.querySelector('script'));
    check('the OK label is text', d.btn('confirm').textContent, '<em>Go</em>');
    check('the Cancel label is text', d.btn('cancel').textContent, '<em>No</em>');
    check('confirm resolves true', await d.confirm(), true);
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 openConfirm: message and labels are text');
{
    const d = open(() => openConfirm({
        title: 'T', message: '<a href="#">link</a> & more',
        confirmLabel: '<b>Yes</b>', cancelLabel: '</div><div>No', danger: true,
    }));
    check('message', d.message.textContent, '<a href="#">link</a> & more');
    ok('no element in the message', d.elements === 0);
    check('confirm label', d.btn('confirm').textContent, '<b>Yes</b>');
    check('cancel label', d.btn('cancel').textContent, '</div><div>No');
    check('exactly two buttons, and no stray element in the actions',
          d.host.querySelectorAll('.twm-modal__actions *').length, 2);
    ok('the danger button keeps its class', d.btn('confirm').classList.contains('twm-btn--danger'));
    ok('the message carries the text-body class',
       d.message.classList.contains('twm-modal__body--text'));
    check('cancel resolves false', await d.cancel(), false);
}
{
    const d = open(() => openConfirm({ message: undefined }));
    check('an absent message renders empty, not "undefined"', d.message.textContent, '');
    check('default labels', [d.btn('cancel').textContent, d.btn('confirm').textContent], ['Cancel', 'OK']);
    ok('the default confirm is primary', d.btn('confirm').classList.contains('twm-btn--primary'));
    check('confirm resolves true', await d.confirm(), true);
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 the stylesheet breaks the text body on \\n');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const rule = ruleBody(css, '.twm-managed-window--modal .twm-modal__body--text') || '';
    ok('flexdesk.css: .twm-modal__body--text has white-space: pre-line',
       /white-space:\s*pre-line/.test(rule), `rule: ${JSON.stringify(rule)}`);
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
