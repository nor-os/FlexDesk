/**
 * ══ THE CONVERSATION VIEW (STORY-0057) ═══════════════════════════════════
 *
 *   §1  append, replaceAll, clear, messages(); role classes; the extra slot
 *   §2  appendChunk updates only the last message's DOM; beginStream(null)
 *   §3  scrolling up while streaming stops following and shows Jump to latest;
 *       clicking it follows again; content growing never unpins; a wheel
 *       over a nested scroller does not unpin
 *   §4  Enter submits and clears; Shift+Enter is left to the browser; empty is ignored
 *   §5  setBusy(true) turns Send into Cancel; Esc (anywhere in the view) or a click cancels once,
 *       and that Esc never reaches the ManagedWindow holding the view
 *   §6  a render callback that throws shows plain text and the view keeps working
 *   §7  replaceAll restores 100 messages and scrolls to the bottom
 *   §8  the scroll position is readable and settable; destroy
 *   §9  the composer grows to its cap, on input events
 *   §10 the entry exports it; every class the view sets is styled
 *
 *     node tests/conversation_view.test.mjs
 *
 * jsdom computes no layout, so each transcript gets a fake geometry: a fixed
 * client height and a scroll height that grows with its messages.
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
    console.log('conversation view: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent',
                   'CustomEvent', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { mountConversationView, CONVERSATION_PIN_WITHIN_PX } =
    await import('../src/ui/components/conversation_view.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const key = (el, k, init = {}) => {
    const e = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
};
const typeInto = (input, value) => {
    input.value = value;
    input.selectionStart = input.selectionEnd = value.length;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};

/** Each message is 40px tall; the transcript shows 200px. */
const ROW = 40;
const CLIENT = 200;
function fakeGeometry(log) {
    let top = 0;
    const height = () => log.querySelectorAll('.twm-chat__msg').length * ROW
        + log.querySelectorAll('.twm-chat__msg--tall').length * 400;
    const max = () => Math.max(0, height() - CLIENT);
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: height });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => CLIENT });
    Object.defineProperty(log, 'scrollTop', {
        configurable: true,
        get: () => top,
        set: (v) => { top = Math.max(0, Math.min(max(), Number(v) || 0)); },
    });
    return { max, userScroll(v) { log.scrollTop = v; log.dispatchEvent(new dom.window.Event('scroll')); } };
}
function fresh(opts) {
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    const view = mountConversationView(host, opts);
    const log = host.querySelector('.twm-chat__log');
    const geo = fakeGeometry(log);
    return {
        host, view, log, geo,
        input: host.querySelector('.twm-chat__input'),
        send: host.querySelector('.twm-chat__send'),
        jump: host.querySelector('.twm-chat__jump'),
        rows: () => [...log.querySelectorAll('.twm-chat__msg')],
    };
}

console.log('§1 messages');
{
    const t = fresh();
    const a = t.view.append({ role: 'user', text: 'hello', meta: { n: 1 } });
    const b = t.view.append({ role: 'assistant', text: 'hi <b>there</b>' });
    ok('append returns an id per message', a && b && a !== b);
    ok('two rows in order', t.rows().length === 2 && t.rows()[0].textContent === 'hello');
    ok('role becomes a modifier class', t.rows()[0].classList.contains('twm-chat__msg--user')
        && t.rows()[1].classList.contains('twm-chat__msg--assistant'));
    ok('without a render callback a body is plain text, never markup',
        t.rows()[1].querySelector('b') === null && t.rows()[1].textContent === 'hi <b>there</b>');
    const msgs = t.view.messages();
    ok('messages() returns copies with meta untouched', msgs.length === 2 && msgs[0].meta.n === 1
        && msgs[0].role === 'user' && msgs[0].id === a);
    msgs[0].text = 'changed';
    ok('…that do not write back', t.view.messages()[0].text === 'hello');
    const slot = t.view.slot(a);
    ok('each message has an extra slot inside its row', slot && t.rows()[0].contains(slot)
        && slot.classList.contains('twm-chat__extra'));
    ok('an unknown id has no slot', t.view.slot('nope') === null);
    let threw = false;
    try { t.view.append({ id: a, role: 'user', text: 'dup' }); } catch { threw = true; }
    ok('a duplicate id is refused', threw && t.rows().length === 2);
    t.view.clear();
    ok('clear empties the transcript', t.rows().length === 0 && t.view.messages().length === 0);
    ok('the log is a live region', t.log.getAttribute('role') === 'log');
}

console.log('§2 appendChunk updates only the last message\'s DOM');
{
    const calls = [];
    const t = fresh({
        render: (m, body, { streaming }) => {
            calls.push({ id: m.id, streaming });
            const p = document.createElement('p');
            p.textContent = m.text;
            body.append(p);
        },
    });
    t.view.append({ role: 'user', text: 'q1' });
    t.view.append({ role: 'assistant', text: 'a1' });
    const slotA = t.view.slot(t.view.messages()[1].id);
    slotA.append(document.createElement('button'));
    const firstRows = t.rows();
    const firstHtml = firstRows.map((r) => r.outerHTML);
    const sid = t.view.beginStream({ role: 'assistant' });
    ok('beginStream appends a streaming message', t.rows().length === 3
        && t.rows()[2].classList.contains('twm-chat__msg--streaming') && t.view.streamingId() === sid);

    const records = [];
    const mo = new dom.window.MutationObserver((rs) => records.push(...rs));
    mo.observe(t.log, { subtree: true, childList: true, characterData: true, attributes: true });
    calls.length = 0;
    t.view.appendChunk('Hel');
    t.view.appendChunk('lo');
    t.view.appendChunk(' world');
    const recs = [...records, ...mo.takeRecords()];
    mo.disconnect();
    const last = t.rows()[2];
    ok('every mutation is inside the streaming message', recs.length > 0
        && recs.every((r) => last.contains(r.target) && r.target !== t.log),
    `${recs.filter((r) => !last.contains(r.target)).length} mutation(s) elsewhere`);
    ok('the earlier rows are the same nodes, unchanged',
        firstRows.every((r, i) => t.rows()[i] === r && r.outerHTML === firstHtml[i]));
    ok('the earlier message keeps its slot content', slotA.querySelector('button') !== null);
    ok('only the streaming message was rendered, once per chunk, marked streaming',
        calls.length === 3 && calls.every((c) => c.id === sid && c.streaming === true));
    ok('the chunks accumulate', last.textContent === 'Hello world'
        && t.view.messages()[2].text === 'Hello world');
    calls.length = 0;
    t.view.endStream();
    ok('endStream renders it once more, unmarked', calls.length === 1 && calls[0].streaming === false
        && !last.classList.contains('twm-chat__msg--streaming') && t.view.streamingId() === null);
    t.view.appendChunk('ignored');
    ok('a chunk with no stream open is ignored', t.view.messages()[2].text === 'Hello world');

    const doneId = t.view.messages()[2].id;
    const before = t.rows().map((r) => r.outerHTML);
    let refused = false;
    try { t.view.beginStream({ id: doneId }); } catch { refused = true; }
    ok('beginStream with an id already present is refused', refused);
    ok('…leaving streamingId() null and no row added', t.view.streamingId() === null
        && t.rows().length === 3 && t.rows().every((r, i) => r.outerHTML === before[i]));
    t.view.appendChunk(' MUTATED');
    ok('…so a chunk after it does not touch the finished message',
        t.view.messages()[2].text === 'Hello world' && t.rows()[2].textContent === 'Hello world');
    const open = t.view.beginStream({ role: 'assistant' });
    refused = false;
    try { t.view.beginStream({ id: doneId }); } catch { refused = true; }
    ok('a refused beginStream leaves an open stream open', refused && t.view.streamingId() === open
        && t.rows()[3].classList.contains('twm-chat__msg--streaming'));
    calls.length = 0;
    t.view.appendChunk('more');
    ok('…and its chunks still go to it', t.view.messages()[3].text === 'more'
        && t.view.messages()[2].text === 'Hello world');
    t.view.endStream();
    const s2 = t.view.beginStream({ id: 'given', role: 'assistant' });
    ok('a stream with a caller id renders streaming on its first draw', s2 === 'given'
        && calls.some((c) => c.id === 'given' && c.streaming === true) && t.view.streamingId() === 'given');
    t.view.endStream();
}

// beginStream(null) is beginStream(): an empty assistant message, as append(null) is.
{
    const t = fresh();
    let threw = null;
    let id = null;
    try { id = t.view.beginStream(null); } catch (e) { threw = e; }
    ok('beginStream(null) does not throw', threw === null, threw?.message);
    ok('…and streams an empty assistant message', id !== null && t.view.streamingId() === id
        && t.rows().length === 1 && t.rows()[0].classList.contains('twm-chat__msg--assistant')
        && t.rows()[0].classList.contains('twm-chat__msg--streaming'));
    t.view.appendChunk('x');
    t.view.endStream();
    const appended = t.view.append(null);
    const ms = t.view.messages();
    ok('…the same message append(null) builds', ms.length === 2 && ms[0].role === ms[1].role && ms[0].text === 'x'
        && ms[1].text === '' && ms[1].id === appended);
}

console.log('§3 scrolling up during streaming stops auto-scroll; Jump to latest resumes');
{
    const t = fresh();
    for (let i = 0; i < 10; i++) t.view.append({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` });
    ok('pinned: the transcript follows to the bottom', t.log.scrollTop === t.geo.max() && t.view.isPinned());
    ok('…and Jump to latest is hidden', t.jump.hidden === true);
    t.view.beginStream();
    t.view.appendChunk('a');
    ok('a streaming message keeps it at the bottom', t.log.scrollTop === t.geo.max());

    // Content grows below while pinned, then a stale scroll event arrives: still pinned.
    t.view.append({ role: 'system', text: 'grow' });
    t.rows()[t.rows().length - 1].classList.add('twm-chat__msg--tall');
    t.log.dispatchEvent(new dom.window.Event('scroll'));
    ok('content growing below never unpins (scrollTop did not move up)', t.view.isPinned() && t.jump.hidden);
    t.view.appendChunk('b');
    ok('…and the next chunk follows it', t.log.scrollTop === t.geo.max());

    t.geo.userScroll(t.geo.max() - CONVERSATION_PIN_WITHIN_PX - 60);
    ok('scrolling up past the threshold stops following', !t.view.isPinned());
    ok('…and shows Jump to latest', t.jump.hidden === false);
    const held = t.log.scrollTop;
    t.view.appendChunk('c');
    t.view.appendChunk('d');
    t.view.append({ role: 'user', text: 'more' });
    ok('chunks while unpinned leave the reader where they are', t.log.scrollTop === held);
    click(t.jump);
    ok('clicking Jump to latest scrolls to the bottom', t.log.scrollTop === t.geo.max());
    ok('…hides itself and follows again', t.jump.hidden && t.view.isPinned());
    t.view.appendChunk('e');
    ok('…so the next chunk is followed', t.log.scrollTop === t.geo.max());

    t.geo.userScroll(0);
    ok('unpinned again', !t.view.isPinned());
    t.geo.userScroll(t.geo.max() - 10);
    ok('scrolling back down to within the threshold follows again', t.view.isPinned() && t.jump.hidden);

    t.log.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -50 }));
    ok('a wheel up stops following before its scroll is reported', !t.view.isPinned() && !t.jump.hidden);
    t.view.endStream();
}

// A wheel over a scroller nested in a body (a <pre>, a tool-output box)
// scrolls that scroller, not the transcript: the view keeps following.
{
    const t = fresh({
        render: (m, body) => {
            if (m.text !== 'code') { body.textContent = m.text; return; }
            const pre = document.createElement('pre');
            pre.className = 'inner';
            pre.style.overflowY = 'auto';
            pre.textContent = 'line\n'.repeat(30);
            body.append(pre);
        },
    });
    for (let i = 0; i < 19; i++) t.view.append({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` });
    const codeId = t.view.append({ role: 'assistant', text: 'code' });
    const pre = t.log.querySelector('pre.inner');
    Object.defineProperty(pre, 'scrollHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(pre, 'clientHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(pre, 'scrollTop', { configurable: true, writable: true, value: 300 });
    t.view.beginStream();
    t.view.appendChunk('a');
    ok('(nested) pinned at the bottom first', t.view.isPinned() && t.log.scrollTop === t.geo.max());
    const before = t.log.scrollTop;
    pre.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -50, bubbles: true }));
    ok('a wheel up over a nested scroller that can still go up leaves the view following',
        t.view.isPinned() && t.jump.hidden && t.log.scrollTop === before);
    t.view.appendChunk('b');
    t.view.append({ role: 'user', text: 'after' });
    ok('…so the next chunk and message are followed', t.view.isPinned() && t.log.scrollTop === t.geo.max(),
        `scrollTop ${t.log.scrollTop}, max ${t.geo.max()}`);
    const slotBox = document.createElement('div');
    slotBox.style.overflowY = 'scroll';
    Object.defineProperty(slotBox, 'scrollHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(slotBox, 'clientHeight', { configurable: true, get: () => 80 });
    Object.defineProperty(slotBox, 'scrollTop', { configurable: true, writable: true, value: 40 });
    const inner = document.createElement('span');
    slotBox.append(inner);
    t.view.slot(codeId).append(slotBox);
    inner.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -50, bubbles: true }));
    t.view.appendChunk('c');
    ok('…and so does a wheel over a scroller in an extra slot', t.view.isPinned() && t.log.scrollTop === t.geo.max());
    pre.scrollTop = 0;
    pre.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -50, bubbles: true }));
    ok('a nested scroller already at its top passes the wheel on: the view stops following',
        !t.view.isPinned() && !t.jump.hidden);
    click(t.jump);
    const plain = t.rows()[0].querySelector('.twm-chat__body');
    plain.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -50, bubbles: true }));
    ok('a wheel up over a body that does not scroll stops following', !t.view.isPinned());
    t.view.endStream();
}

// A scrollbar drag, a key or a touch moves scrollTop before its scroll event
// is dispatched; a chunk landing in between must not snap the reader back.
{
    const t = fresh();
    for (let i = 0; i < 20; i++) t.view.append({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` });
    t.view.beginStream();
    t.view.appendChunk('a');
    ok('(late scroll) pinned at the bottom first', t.view.isPinned() && t.log.scrollTop === t.geo.max());
    t.log.scrollTop = 100;                          // moved; no scroll event yet
    t.view.appendChunk('b');
    ok('a chunk before the scroll event keeps the reader\'s position', t.log.scrollTop === 100);
    ok('…stops following', !t.view.isPinned());
    ok('…and shows Jump to latest', t.jump.hidden === false);
    t.log.dispatchEvent(new dom.window.Event('scroll'));
    ok('the late scroll event leaves it unpinned', !t.view.isPinned() && t.log.scrollTop === 100);
    t.view.endStream();
}

console.log('§4 the composer: Enter submits and clears; Shift+Enter is left to the browser');
{
    const submitted = [];
    const t = fresh({ onSubmit: (text) => submitted.push(text) });
    typeInto(t.input, 'first line');
    const sh = key(t.input, 'Enter', { shiftKey: true });
    ok('Shift+Enter does not submit', submitted.length === 0 && t.input.value === 'first line');
    ok('Shift+Enter is not prevented, so the browser inserts the newline', !sh.defaultPrevented);
    typeInto(t.input, 'first line\nsecond');   // what the browser typed
    const e = key(t.input, 'Enter');
    ok('Enter submits the whole text', submitted.length === 1 && submitted[0] === 'first line\nsecond');
    ok('…clears the composer', t.input.value === '' && t.view.getText() === '');
    ok('…and the newline it would type is suppressed', e.defaultPrevented);
    key(t.input, 'Enter');
    typeInto(t.input, '   ');
    key(t.input, 'Enter');
    ok('an empty or blank composer submits nothing', submitted.length === 1);
    typeInto(t.input, 'by click');
    click(t.send);
    ok('Send submits too', submitted.length === 2 && submitted[1] === 'by click' && t.input.value === '');
    typeInto(t.input, 'ime');
    key(t.input, 'Enter', { isComposing: true });
    ok('Enter during IME composition submits nothing', submitted.length === 2 && t.input.value === 'ime');
    const esc = key(t.input, 'Escape');
    ok('Esc while idle is left alone', !esc.defaultPrevented);
}

console.log('§5 setBusy(true) turns Send into Cancel; Esc anywhere in the view or a click cancels once');
{
    let cancels = 0;
    const submitted = [];
    const t = fresh({ onSubmit: (s) => submitted.push(s), onCancel: () => { cancels++; } });
    ok('idle: the button is Send', t.send.getAttribute('aria-label') === 'Send'
        && !t.send.classList.contains('twm-chat__send--cancel'));
    t.view.setBusy(true);
    ok('busy: the button is Cancel', t.send.getAttribute('aria-label') === 'Cancel'
        && t.send.classList.contains('twm-chat__send--cancel') && t.view.isBusy());
    typeInto(t.input, 'queued');
    key(t.input, 'Enter');
    ok('Enter while busy submits nothing and keeps the text', submitted.length === 0 && t.input.value === 'queued');
    const esc = key(t.input, 'Escape');
    ok('Esc calls cancel once', cancels === 1 && esc.defaultPrevented);
    key(t.input, 'Escape');
    click(t.send);
    ok('…and pressing again in the same busy period does not call it again', cancels === 1);
    t.view.setBusy(true);
    key(t.input, 'Escape');
    ok('setBusy(true) while already busy does not re-arm it', cancels === 1);
    t.view.setBusy(false);
    ok('setBusy(false) turns Cancel back into Send', t.send.getAttribute('aria-label') === 'Send'
        && !t.send.classList.contains('twm-chat__send--cancel'));
    click(t.send);
    ok('…which submits the kept text', submitted.length === 1 && submitted[0] === 'queued' && cancels === 1);
    t.view.setBusy(true);
    click(t.send);
    click(t.send);
    ok('a click on Cancel calls cancel once', cancels === 2);
    t.view.setBusy(false);
    key(t.input, 'Escape');
    ok('Esc when idle does not cancel', cancels === 2);

    t.view.setBusy(true);
    const onButton = key(t.send, 'Escape');
    ok('Esc with focus on the Cancel button cancels', cancels === 3 && onButton.defaultPrevented);
    t.view.setBusy(false);
    t.view.setBusy(true);
    t.view.append({ role: 'user', text: 'x' });
    key(t.rows()[0], 'Escape');
    ok('Esc from inside the transcript cancels', cancels === 4);
    t.view.setBusy(false);
    t.view.setBusy(true);
    key(t.host, 'Escape');
    ok('Esc outside the view is not the view\'s', cancels === 4);
    t.view.setBusy(false);
    const idleEsc = key(t.send, 'Escape');
    ok('Esc on the button while idle is left alone', !idleEsc.defaultPrevented && cancels === 4);
}

// The Esc that cancels is the view's alone: a document-level Escape listener
// (a ManagedWindow's, a slide-out panel's) never sees it, so the window
// holding the conversation stays open.
{
    const { ManagedWindow } = await import('../src/ui/components/managed_window.js');
    let cancels = 0;
    let closes = 0;
    let docEscapes = 0;
    const onDocKey = (e) => { if (e.key === 'Escape') docEscapes++; };
    document.addEventListener('keydown', onDocKey);
    const content = document.createElement('div');
    const win = new ManagedWindow({ id: 'chat-esc', title: 'Chat', content, onClose: () => { closes++; } });
    win.show();
    const view = mountConversationView(content, { onCancel: () => { cancels++; } });
    const input = content.querySelector('.twm-chat__input');
    ok('(window) the view is shown inside an open window', win.isVisible && content.contains(input));
    view.setBusy(true);
    const first = key(input, 'Escape');
    ok('Esc while busy inside a ManagedWindow calls cancel once', cancels === 1 && first.defaultPrevented);
    ok('…and the window stays open', win.isVisible && closes === 0);
    ok('…because the Esc never reaches a document listener', docEscapes === 0);
    key(input, 'Escape');
    key(content.querySelector('.twm-chat__send'), 'Escape');
    ok('a repeat Esc in the same busy period neither cancels again nor closes the window',
        cancels === 1 && win.isVisible && closes === 0 && docEscapes === 0);
    view.setBusy(false);
    key(input, 'Escape');
    ok('Esc while idle is not the view\'s: it reaches the document and the window closes',
        docEscapes === 1 && !win.isVisible && cancels === 1);
    document.removeEventListener('keydown', onDocKey);
    view.destroy();
    win.destroy?.();
}

console.log('§6 a render callback that throws shows plain text and the view keeps working');
{
    const errors = [];
    const t = fresh({
        render: (m, body) => {
            if (m.text.includes('boom')) { body.innerHTML = '<i>half</i>'; throw new Error('bad markup'); }
            body.innerHTML = `<em>${m.text}</em>`;
        },
        onRenderError: (err, m) => errors.push([err.message, m.text]),
    });
    t.view.append({ role: 'assistant', text: 'fine' });
    t.view.append({ role: 'assistant', text: 'boom <x>' });
    const bad = t.rows()[1].querySelector('.twm-chat__body');
    ok('the throwing message shows its plain text', bad.textContent === 'boom <x>'
        && bad.querySelector('i') === null && bad.classList.contains('twm-chat__body--plain'));
    ok('the error is reported with its message', errors.length === 1 && errors[0][0] === 'bad markup'
        && errors[0][1] === 'boom <x>');
    t.view.append({ role: 'assistant', text: 'after' });
    ok('later messages still render through the callback', t.rows()[2].querySelector('em')?.textContent === 'after');
    t.view.beginStream();
    t.view.appendChunk('ok ');
    ok('a stream renders through it', t.rows()[3].querySelector('em')?.textContent === 'ok ');
    t.view.appendChunk('boom');
    ok('a chunk that makes it throw falls back to plain text', t.rows()[3].textContent === 'ok boom'
        && t.rows()[3].querySelector('.twm-chat__body--plain'));
    t.view.appendChunk('!');
    t.view.endStream();
    ok('the stream completes', t.view.messages()[3].text === 'ok boom!' && t.view.streamingId() === null);
    const t2 = fresh({ render: () => { throw new Error('always'); }, onRenderError: () => { throw new Error('and this'); } });
    t2.view.append({ role: 'user', text: 'x' });
    ok('an onRenderError that throws too does not break the view', t2.rows()[0].textContent === 'x');
    const submitted = [];
    const t3 = fresh({ render: () => { throw new Error('no'); }, onSubmit: (s) => submitted.push(s) });
    t3.view.append({ role: 'user', text: 'y' });
    typeInto(t3.input, 'still');
    key(t3.input, 'Enter');
    ok('the composer keeps working', submitted[0] === 'still' && t3.rows()[0].textContent === 'y');
}

console.log('§7 replaceAll restores 100 messages and scrolls to the bottom');
{
    const t = fresh();
    t.view.append({ role: 'user', text: 'old' });
    t.view.beginStream();
    t.geo.userScroll(0);
    const history = Array.from({ length: 100 }, (_, i) => ({ id: `h${i}`, role: i % 2 ? 'assistant' : 'user', text: `msg ${i}` }));
    t.view.replaceAll(history);
    ok('100 rows, in order, the old ones gone', t.rows().length === 100
        && t.rows()[0].textContent === 'msg 0' && t.rows()[99].textContent === 'msg 99');
    ok('ids are kept', t.view.messages()[42].id === 'h42' && t.view.slot('h42') !== null);
    ok('scrolled to the bottom', t.log.scrollTop === t.geo.max() && t.geo.max() === 100 * ROW - CLIENT);
    ok('…and following again with Jump to latest hidden', t.view.isPinned() && t.jump.hidden);
    ok('an open stream is closed by it', t.view.streamingId() === null
        && !t.log.querySelector('.twm-chat__msg--streaming'));
    t.view.append({ role: 'user', text: 'next' });
    ok('a new message after it follows', t.rows().length === 101 && t.log.scrollTop === t.geo.max());
    const id = t.view.append({ role: 'user', text: 'auto' });
    ok('generated ids never collide with restored ones', !history.some((h) => h.id === id));

    const r = fresh();
    const keep = Array.from({ length: 8 }, (_, i) => r.view.append({ role: 'user', text: `k${i}` }));
    r.view.setScrollTop(0);
    const rowsBefore = r.rows();
    let refused = false;
    try { r.view.replaceAll([{ id: 'n1', text: 'a' }, { id: 'n2', text: 'b' }, { id: 'n1', text: 'c' }]); }
    catch { refused = true; }
    ok('replaceAll with a repeated id is refused', refused);
    ok('…and changes nothing: messages, rows and slots as before',
        r.view.messages().map((m) => m.id).join() === keep.join()
        && r.rows().length === 8 && r.rows().every((row, i) => row === rowsBefore[i])
        && keep.every((k) => r.view.slot(k) !== null) && r.view.slot('n1') === null);
    ok('…nor the scroll position', !r.view.isPinned() && r.view.getScrollTop() === 0 && !r.jump.hidden);
    r.view.replaceAll([{ text: 'gen' }, { id: 'm1', text: 'given' }, { id: 'm2', text: 'given too' }]);
    const ids = r.view.messages().map((m) => m.id);
    ok('a generated id in replaceAll avoids every id given later in the list',
        ids.length === 3 && new Set(ids).size === 3 && ids[1] === 'm1' && ids[2] === 'm2');
    const u = fresh();
    u.view.replaceAll([{ id: 'm1', role: 'user', text: 'a' }, { id: 'm2', role: 'user', text: 'b' }]);
    const fresh1 = u.view.append({ role: 'user', text: 'c' });
    ok('…even ones shaped like a generated id', !['m1', 'm2'].includes(fresh1) && u.rows().length === 3);
}

console.log('§8 scroll position; destroy');
{
    const t = fresh();
    for (let i = 0; i < 20; i++) t.view.append({ role: 'user', text: `m${i}` });
    ok('getScrollTop reads it', t.view.getScrollTop() === t.geo.max());
    t.view.setScrollTop(120);
    ok('setScrollTop sets it', t.view.getScrollTop() === 120 && t.log.scrollTop === 120);
    ok('…away from the end, it stops following', !t.view.isPinned() && !t.jump.hidden);
    t.view.append({ role: 'user', text: 'x' });
    ok('…and stays put', t.view.getScrollTop() === 120);
    t.view.setScrollTop(t.geo.max());
    ok('setScrollTop to the end follows again', t.view.isPinned() && t.jump.hidden);
    t.view.setScrollTop(0);
    t.view.scrollToBottom();
    ok('scrollToBottom follows again', t.view.isPinned() && t.view.getScrollTop() === t.geo.max());
    t.view.beginStream();
    t.view.setBusy(true);
    t.view.destroy();
    ok('destroy removes the view', t.host.querySelector('.twm-chat') === null);
    ok('…and forgets its stream and busy state', t.view.streamingId() === null && !t.view.isBusy()
        && t.view.messages().length === 0);
    t.view.destroy();
    ok('destroy twice is harmless', true);
}

console.log('§9 the composer grows to its cap');
{
    const t = fresh({ composerMaxHeight: 120, placeholder: 'Ask' });
    ok('placeholder', t.input.placeholder === 'Ask');
    let sh = 30;
    Object.defineProperty(t.input, 'scrollHeight', { configurable: true, get: () => sh });
    typeInto(t.input, 'a');
    ok('one line: its own height', t.input.style.height === '30px' && t.input.style.overflowY === 'hidden');
    sh = 90;
    const sh1 = key(t.input, 'Enter', { shiftKey: true });
    typeInto(t.input, 'a\n');                    // the browser's newline arrives as an input event
    ok('a newline from Shift+Enter grows it through the input event', !sh1.defaultPrevented
        && t.input.style.height === '90px');
    sh = 400;
    typeInto(t.input, 'long\n'.repeat(20));
    ok('capped, and then it scrolls', t.input.style.height === '120px' && t.input.style.overflowY === 'auto');
    sh = 30;
    key(t.input, 'Enter');
    ok('submitting shrinks it back', t.input.style.height === '30px');
    t.view.setText('set');
    ok('setText fills the composer', t.view.getText() === 'set');
    const t2 = fresh({ labels: { send: 'Go', cancel: 'Stop' } });
    ok('labels are the caller\'s', t2.send.getAttribute('aria-label') === 'Go');
    t2.view.setBusy(true);
    ok('…both of them', t2.send.getAttribute('aria-label') === 'Stop');
}

console.log('§10 entry and CSS');
{
    const widgets = await import('../widgets.js');
    ok('@flexdesk/widgets exports mountConversationView', widgets.mountConversationView === mountConversationView);
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const src = readFileSync(resolvePath(HERE, '../src/ui/components/conversation_view.js'), 'utf8');
    const classes = new Set(src.match(/twm-chat(__[a-z-]+)?(--[a-z-]+)?/g));
    const missing = [...classes].filter((c) => !/(__|--)$/.test(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    ok('every twm-chat class the view sets is styled', missing.length === 0, missing.join(', '));
    ok('no application vocabulary in the source', !/pywebview|ecosim|anthropic|openai|\bllm\b/i.test(src));
}

if (failures) {
    console.error(`\nconversation view: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
