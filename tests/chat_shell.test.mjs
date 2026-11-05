/**
 * ══ THE ASSISTANT CHAT SHELL ═════════════════════════════════════════════
 *
 *   §1  a turn: the request, typing dots, text deltas, Markdown, message-end
 *   §2  tool calls: listed, updated by id, finished by the end of the turn
 *   §3  stop: what arrived stays, an empty reply goes, a late chunk is dropped
 *   §3b a backend with no run id: the next send waits for the cancelled run's end
 *   §4  errors: an error message with Retry while it is last; a throwing and a
 *       rejecting send; a late event of an old turn never lands in a new one
 *   §5  the footer: time and copy; copy feedback; formatTime
 *   §6  the controls slot: when it is drawn, meta, updateMeta, a callback that throws
 *   §7  conversations: new, switch, close, rename, titles, reset, refusals in a turn,
 *       the strip going back, scroll kept per tab, onConversationChange
 *   §8  snapshot and restore: round trip, onChange, running tools, setMessages
 *   §9  the mode toggle: labels from the caller, none without modes
 *   §10 the model picker: controlled, actions, text not markup, status, label, none
 *   §11 the welcome and the clear button with its dialog
 *   §12 rename by double-click and F2
 *   §13 a strict StateGuard throws nothing; destroy cancels and removes all
 *   §14 the entry exports it; every class it sets is styled; no literal colours;
 *       the view's remove()
 *
 *     node tests/chat_shell.test.mjs
 *
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
    console.log('chat shell: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent',
                   'CustomEvent', 'localStorage', 'DOMStringMap', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { mountChatShell, CHAT_TRANSPORT_EVENTS, CHAT_SHELL_LABELS } = await import('../src/ui/components/chat_shell.js');
const { CHAT_STATES, CHAT_BUS_EVENTS } = await import('../src/ui/components/chat_state_machine.js');
const { mountConversationView } = await import('../src/ui/components/conversation_view.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failed = 0;
const ok = (name, cond, detail = '') => {
    if (cond) {
        console.log(`  ok   ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL ${name} ${detail}`);
    }
};

/** A transport the test drives: `t.emit` belongs to the latest send. */
function fakeTransport() {
    const t = {
        requests: [],
        emits: [],
        cancelled: [],
        send(request, emit) { t.requests.push(request); t.emits.push(emit); },
        cancel(request) { t.cancelled.push(request); },
        emit(event) { t.emits.at(-1)(event); },
        delta(text) { t.emit({ type: 'text-delta', text }); },
        end(rest = {}) { t.emit({ type: 'message-end', ...rest }); },
    };
    return t;
}

const hosts = [];
function mount(opts = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const transport = opts.transport ?? fakeTransport();
    const chat = mountChatShell(host, { ...opts, transport });
    const q = (s) => host.querySelector(s);
    const all = (s) => [...host.querySelectorAll(s)];
    return { host, chat, transport, q, all };
}
const settle = async (chat) => { await chat.stateMachine.settled(); await Promise.resolve(); };
const click = (n) => n.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (n, k, o = {}) => n.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const tabButtons = (ctx) => ctx.all('.twm-tabs__tab');
const tabLabels = (ctx) => tabButtons(ctx).map((b) => b.querySelector('.twm-tabs__label').textContent);
const activeTabLabel = (ctx) => ctx.q('.twm-tabs__tab--on .twm-tabs__label')?.textContent;
const msgs = (ctx) => ctx.all('.twm-chat__msg');
const lastMsg = (ctx) => msgs(ctx).at(-1);

console.log('§1 a turn');
{
    const ctx = mount({ modes: [{ id: 'ask', label: 'Ask' }], models: { items: [{ id: 'm', label: 'M' }], activeId: 'm' } });
    const { chat, transport: t } = ctx;
    await settle(chat);
    const input = ctx.q('.twm-chat__input');
    input.value = '  hello  ';
    key(input, 'Enter');
    ok('the composer clears', input.value === '');
    ok('is busy at once', chat.isBusy() === true);
    ok('a request with what the transport needs', t.requests[0].text === 'hello' && t.requests[0].mode === 'ask'
        && t.requests[0].model === 'm' && t.requests[0].conversationId === null
        && t.requests[0].tabId === chat.activeConversation(), JSON.stringify(t.requests[0]));
    ok('the user message and a reply', msgs(ctx).length === 2 && msgs(ctx)[0].classList.contains('twm-chat__msg--user'));
    ok('typing dots in the reply', lastMsg(ctx).querySelectorAll('.twm-chat-shell__typing > span').length === 3);
    ok('a second send is refused', chat.send('no') === false && t.requests.length === 1);
    await settle(chat);
    ok('waiting', chat.stateMachine.getState() === CHAT_STATES.WAITING);
    ok('Send became Cancel', ctx.q('.twm-chat__send--cancel') !== null);
    ok('New and Clear are off', ctx.all('.twm-chat-shell__tab-btn').every((b) => b.disabled));
    ok('no footer while it streams', lastMsg(ctx).querySelector('.twm-chat-shell__copy') === null);

    t.delta('**bo');
    t.delta('ld**');
    ok('the dots are gone', lastMsg(ctx).querySelector('.twm-chat-shell__typing') === null);
    ok('Markdown through renderMarkdown', lastMsg(ctx).querySelector('strong')?.textContent === 'bold');
    t.delta('');
    await settle(chat);
    ok('streaming', chat.stateMachine.getState() === CHAT_STATES.STREAMING);

    t.end({ text: 'ignored, text already streamed', conversationId: 'c1' });
    ok('not busy at once', chat.isBusy() === false);
    await settle(chat);
    ok('idle', chat.stateMachine.getState() === CHAT_STATES.IDLE);
    ok('the streamed text stands', chat.messages().at(-1).text === '**bold**');
    ok('the conversation id is kept', t.requests.length === 1 && chat.snapshot().tabs[0].conversationId === 'c1'
        && chat.stateMachine.conversationId === 'c1');
    ok('the composer is back', ctx.q('.twm-chat__send--cancel') === null);
    ok('the footer came', lastMsg(ctx).querySelector('.twm-chat-shell__copy') !== null);

    chat.send('again');
    ok('the id goes out with the next request', t.requests[1].conversationId === 'c1');
    t.end({ text: 'all at once' });
    ok('message-end fills a reply nothing streamed', chat.messages().at(-1).text === 'all at once');
    chat.send('<b>plain</b>');
    ok('a user message is text', msgs(ctx).at(-2).querySelector('.twm-chat__body b') === null);
    t.delta('<img src=x onerror=alert(1)>');
    ok('a reply\'s raw HTML is escaped', lastMsg(ctx).querySelector('img') === null);
    t.end();
    chat.send('nothing');
    t.end();
    ok('a reply with nothing in it is taken out', chat.messages().at(-1).text === 'nothing');
    ok('and its row', lastMsg(ctx).classList.contains('twm-chat__msg--user'));
    let threw = false;
    try { mountChatShell(document.createElement('div'), {}); } catch { threw = true; }
    ok('no transport, no chat', threw);
    ok('an unknown event changes nothing', (() => { chat.send('x'); t.emit({ type: 'nope' }); t.emit(null); const b = chat.isBusy(); t.end({ text: 'y' }); return b; })());
    chat.destroy();
}

console.log('§2 tool calls');
{
    const ctx = mount();
    const { chat, transport: t } = ctx;
    chat.send('go');
    t.emit({ type: 'tool-use', id: 't1', name: 'read', label: 'Reading a file' });
    t.emit({ type: 'tool-use', id: 't2', name: 'write' });
    await settle(chat);
    ok('a tool use starts the stream', chat.stateMachine.getState() === CHAT_STATES.STREAMING);
    const tools = () => ctx.all('.twm-chat-shell__tool');
    ok('both are listed, the label over the name', tools().length === 2
        && tools()[0].querySelector('.twm-chat-shell__tool-label').textContent === 'Reading a file'
        && tools()[1].querySelector('.twm-chat-shell__tool-label').textContent === 'write');
    ok('running', tools().every((r) => r.classList.contains('twm-chat-shell__tool--running')));
    ok('the dots still show', lastMsg(ctx).querySelector('.twm-chat-shell__typing') !== null);
    t.emit({ type: 'tool-use', id: 't1', status: 'error' });
    ok('an id updates its row', tools().length === 2 && tools()[0].classList.contains('twm-chat-shell__tool--error')
        && tools()[0].querySelector('.twm-chat-shell__tool-label').textContent === 'Reading a file');
    t.emit({ type: 'tool-use', name: 'no id' });
    ok('no id, a new row', tools().length === 3);
    ok('the snapshot of a reply with tools keeps it', chat.snapshot().tabs[0].messages.length === 2);
    t.end();
    ok('a reply with only tools stays', msgs(ctx).length === 2);
    ok('the end finishes what still runs', tools()[1].classList.contains('twm-chat-shell__tool--done')
        && tools()[0].classList.contains('twm-chat-shell__tool--error'));
    ok('they are in the message', chat.messages().at(-1).tools.length === 3);
    chat.destroy();
}

console.log('§3 stop');
{
    const ctx = mount();
    const { chat, transport: t } = ctx;
    chat.send('one');
    await settle(chat);
    click(ctx.q('.twm-chat__send'));
    ok('Cancel calls the transport with the request', t.cancelled.length === 1 && t.cancelled[0].text === 'one');
    ok('an empty reply is taken out', msgs(ctx).length === 1);
    ok('not busy at once', chat.isBusy() === false);
    await settle(chat);
    ok('idle, Send is back', chat.stateMachine.getState() === CHAT_STATES.IDLE && ctx.q('.twm-chat__send--cancel') === null);

    const stale = t.emits.at(-1);
    chat.send('two');
    t.delta('partial');
    t.emit({ type: 'tool-use', id: 't', name: 'x' });
    await settle(chat);
    key(ctx.q('.twm-chat__input'), 'Escape');
    ok('Esc stops too', t.cancelled.length === 2);
    ok('what arrived stays', chat.messages().at(-1).text === 'partial');
    ok('a running tool is stopped', ctx.q('.twm-chat-shell__tool--stopped') !== null);
    ok('the reply has a footer now', lastMsg(ctx).querySelector('.twm-chat-shell__copy') !== null);
    t.delta(' late');
    t.end({ text: 'late', meta: { late: true } });
    ok('a late chunk and end are dropped', chat.messages().at(-1).text === 'partial' && chat.messages().at(-1).meta === undefined);
    stale({ type: 'text-delta', text: 'older' });
    ok('so is an older turn', chat.messages().at(-1).text === 'partial');
    ok('cancel with nothing running', chat.cancel() === false && t.cancelled.length === 2);

    t.cancel = () => { throw new Error('backend gone'); };
    chat.send('three');
    ok('a cancel that throws changes nothing', chat.cancel() === true && !chat.isBusy());
    t.cancel = () => Promise.reject(new Error('backend gone'));
    chat.send('four');
    ok('nor one that rejects', chat.cancel() === true && !chat.isBusy());
    delete t.cancel;
    chat.send('five');
    ok('a transport with no cancel can stop', chat.cancel() === true);
    chat.destroy();
}

console.log('§3b a backend with no run id');
{
    // The adapter of docs/components/chat-shell.md, over a backend with one run at
    // a time, whose frames carry no id and which refuses a request while it is busy.
    const backend = {
        busy: false,
        asked: [],
        stops: 0,
        ask(request) {
            if (backend.busy) return Promise.resolve({ ok: false, error: 'busy' });
            backend.busy = true;
            backend.asked.push(request.text);
            return Promise.resolve({ ok: true });
        },
        stop() { backend.stops += 1; },
        finish(frame) { backend.busy = false; frame(); },
    };
    let emit = null;
    let runEnded = null;
    const ended = () => { runEnded?.(); runEnded = null; };
    const bridge = {
        onChunk: ({ chunk }) => emit?.({ type: 'text-delta', text: chunk }),
        onDone: ({ text }) => { emit?.({ type: 'message-end', text }); ended(); },
        onError: ({ error }) => { emit?.({ type: 'error', message: error }); ended(); },
    };
    const transport = {
        async send(request, e) {
            emit = e;
            try {
                const result = await backend.ask(request);
                if (!result.ok) throw new Error(result.error);
            } catch (error) {
                ended();
                throw error;
            }
        },
        cancel: () => new Promise((resolve) => {
            runEnded = resolve;
            backend.stop();
        }),
    };
    const flush = () => new Promise((r) => setTimeout(r));

    const ctx = mount({ transport });
    const { chat } = ctx;
    chat.send('old');
    await flush();
    bridge.onChunk({ chunk: 'kept' });
    ok('cancel stops at once', chat.cancel() === true && !chat.isBusy() && backend.stops === 1);

    ok('the chat can send again at once', chat.send('new') === true && chat.isBusy());
    ok('the new turn shows', chat.messages().some((m) => m.text === 'new'));
    await flush();
    ok('its request waits for the old run', backend.asked.length === 1);
    bridge.onChunk({ chunk: ' LATE-FROM-OLD-RUN' });
    ok('a late chunk does not reach the new reply', chat.messages().at(-1).text === 'new' && !ctx.host.textContent.includes('LATE'));
    backend.finish(() => bridge.onError({ error: 'cancelled' }));
    ok("the old run's report ends nothing", chat.isBusy()
        && !chat.messages().some((m) => m.role === 'error'));
    await flush();
    ok('then the request goes, and is accepted', backend.asked.join() === 'old,new' && chat.isBusy());
    bridge.onChunk({ chunk: 'fresh' });
    backend.finish(() => bridge.onDone({ text: 'fresh' }));
    await flush();
    ok("the new reply is the new run's only", chat.messages().at(-1).text === 'fresh'
        && chat.messages().find((m) => m.text.startsWith('kept')).text === 'kept'
        && !chat.isBusy());

    chat.send('three');
    await flush();
    chat.cancel();
    chat.send('waiting');
    const stops = backend.stops;
    await flush();
    ok('stopping a turn still waiting tells the backend nothing', chat.cancel() === true && backend.stops === stops);
    chat.send('after');
    backend.finish(() => bridge.onError({ error: 'cancelled' }));
    await flush();
    ok('the stopped one is never asked, the next one is',
        !backend.asked.includes('waiting') && backend.asked.at(-1) === 'after');
    backend.finish(() => bridge.onDone({ text: 'done' }));
    await flush();

    chat.send('four');
    await flush();
    chat.cancel();
    chat.send('five');
    const asked = backend.asked.length;
    chat.destroy();
    backend.finish(() => bridge.onError({ error: 'cancelled' }));
    await flush();
    ok('destroy sends nothing that was waiting', backend.asked.length === asked);

    const rejected = fakeTransport();
    rejected.cancel = () => Promise.reject(new Error('backend gone'));
    const r = mount({ transport: rejected });
    r.chat.send('one');
    r.chat.cancel();
    r.chat.send('two');
    ok('a send waits for a cancel that rejects', rejected.requests.length === 1);
    await flush();
    ok('and goes when it has', rejected.requests.at(-1)?.text === 'two');
    r.chat.destroy();

    const plain = fakeTransport();
    const p = mount({ transport: plain });
    p.chat.send('one');
    p.chat.cancel();
    p.chat.send('two');
    ok('a cancel with no promise leaves send synchronous', plain.requests.at(-1)?.text === 'two');
    p.chat.destroy();
}

console.log('§4 errors');
{
    const ctx = mount();
    const { chat, transport: t } = ctx;
    chat.send('first');
    t.delta('some');
    t.emit({ type: 'error', message: 'rate limited' });
    await settle(chat);
    ok('error state', chat.stateMachine.getState() === CHAT_STATES.ERROR && chat.stateMachine.lastError === 'rate limited');
    ok('what arrived stays', msgs(ctx)[1].textContent.includes('some'));
    ok('an error message', lastMsg(ctx).classList.contains('twm-chat__msg--error')
        && lastMsg(ctx).querySelector('.twm-chat__body').textContent === 'rate limited');
    ok('no transport.cancel on an error', t.cancelled.length === 0);
    const retry = lastMsg(ctx).querySelector('.twm-chat-shell__retry');
    ok('Retry while it is last', retry !== null);
    click(retry);
    ok('Retry sends the user message before it', t.requests.at(-1).text === 'first' && t.requests.length === 2);
    ok('the failure loses Retry', ctx.q('.twm-chat-shell__retry') === null);
    await settle(chat);
    ok('waiting again', chat.stateMachine.getState() === CHAT_STATES.WAITING);
    t.emit({ type: 'error' });
    ok('no message, the default words', lastMsg(ctx).querySelector('.twm-chat__body').textContent === CHAT_SHELL_LABELS.unknownError);
    ok('an empty failed reply is out', msgs(ctx).filter((m) => m.classList.contains('twm-chat__msg--assistant')).length === 1);
    chat.destroy();

    const throwing = mount({ transport: { send() { throw new Error('no bridge'); } } });
    throwing.chat.send('x');
    ok('a send that throws is an error', throwing.chat.isBusy() === false
        && lastMsg(throwing).querySelector('.twm-chat__body').textContent === 'no bridge');
    throwing.chat.destroy();

    const rejecting = mount({ transport: { send: async () => { throw new Error('refused'); } } });
    rejecting.chat.send('x');
    ok('still busy until it rejects', rejecting.chat.isBusy() === true);
    await settle(rejecting.chat);
    await new Promise((r) => setTimeout(r));
    ok('a send that rejects is an error', rejecting.chat.isBusy() === false
        && lastMsg(rejecting).querySelector('.twm-chat__body').textContent === 'refused');
    rejecting.chat.destroy();
}

console.log('§5 the footer');
{
    const writes = [];
    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true, value: { writeText: async (s) => { writes.push(s); } },
    });
    const ctx = mount({ formatTime: (at, message) => `${message.role}@${typeof at}` });
    const { chat, transport: t } = ctx;
    chat.send('hi');
    t.delta('**there**');
    t.end();
    ok('time from formatTime', lastMsg(ctx).querySelector('.twm-chat-shell__time').textContent === 'assistant@string');
    ok('the user message has it too', msgs(ctx)[0].querySelector('.twm-chat-shell__time').textContent === 'user@string');
    const copy = lastMsg(ctx).querySelector('.twm-chat-shell__copy');
    click(copy);
    await new Promise((r) => setTimeout(r));
    ok('copy writes the source text', writes[0] === '**there**');
    ok('and says so', copy.classList.contains('twm-chat-shell__copy--done') && copy.textContent === 'check');
    chat.destroy();

    const none = mount({ formatTime: () => '' });
    none.chat.send('hi');
    ok('an empty time is no element', none.q('.twm-chat-shell__time') === null);
    none.chat.destroy();

    const plain = mount();
    plain.chat.setMessages(plain.chat.activeConversation(), [
        { id: 'a', role: 'user', text: 'x', at: 'not a date' },
        { id: 'b', role: 'user', text: 'y', at: '2026-01-02T03:04:05.000Z' },
        { id: 'c', role: 'user', text: 'z' },
    ]);
    const times = plain.all('.twm-chat-shell__time');
    ok('a date nobody can read shows none, one that can is shown, none without', times.length === 1, String(times.length));

    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true, value: { writeText: async () => { throw new Error('denied'); } },
    });
    const copyDenied = plain.q('.twm-chat-shell__copy');
    click(copyDenied);
    await new Promise((r) => setTimeout(r));
    ok('a refused copy says nothing', !copyDenied.classList.contains('twm-chat-shell__copy--done'));
    plain.chat.destroy();
}

console.log('§6 the controls slot');
{
    const calls = [];
    const ctx = mount({
        renderControls(el, message, chat) {
            calls.push(message.id);
            if (message.meta?.boom) throw new Error('boom');
            const b = document.createElement('button');
            b.className = 'mine';
            b.textContent = message.meta?.undone ? 'Redo' : 'Undo';
            b.onclick = () => chat.updateMeta(message.id, { undone: !message.meta?.undone });
            el.append(b);
        },
    });
    const { chat, transport: t } = ctx;
    chat.send('go');
    t.delta('a');
    ok('not while it streams', calls.length === 0);
    t.end({ meta: { changes: [1, 2] } });
    const id = chat.messages().at(-1).id;
    ok('drawn when the reply ends', calls.length === 1 && calls[0] === id);
    ok('for assistant messages only', msgs(ctx)[0].querySelector('.mine') === null);
    ok('in the message', lastMsg(ctx).querySelector('.twm-chat-shell__controls .mine') !== null);
    ok('meta is handed back', chat.messages().at(-1).meta.changes.length === 2);
    ok('the slot is reachable', chat.controlsSlot(id).querySelector('.mine') !== null);
    click(ctx.q('.mine'));
    ok('updateMeta redraws', ctx.q('.mine').textContent === 'Redo' && ctx.all('.mine').length === 1);
    ok('and keeps the rest', chat.messages().at(-1).meta.changes.length === 2);
    chat.refreshControls(id);
    ok('refreshControls redraws once', calls.length === 3 && ctx.all('.mine').length === 1);
    ok('a re-render of the body leaves it', (() => { chat.send('next'); t.delta('b'); return msgs(ctx)[1].querySelector('.mine') !== null; })());
    t.end();
    const other = chat.newConversation();
    ok('a new one starts bare', ctx.all('.mine').length === 0 && other !== null);
    calls.length = 0;
    chat.switchTo(chat.snapshot().tabs[0].id);
    ok('it comes back with a tab', ctx.all('.mine').length === 2 && calls.length === 2);
    ok('with what it knew', ctx.q('.mine').textContent === 'Redo');
    ok('updateMeta on an unknown id', chat.updateMeta('nope', {}) === false);
    ok('no slot for it', chat.controlsSlot('nope') === null);
    chat.updateMeta(id, { boom: true });
    ok('one that throws leaves the chat working', chat.send('still') === true);
    chat.destroy();
}

console.log('§7 conversations');
{
    const changes = [];
    const ctx = mount({ onConversationChange: (c, reason) => changes.push([c.id, reason]) });
    const { chat, transport: t } = ctx;
    ok('one to start with, no close mark', tabLabels(ctx).join() === CHAT_SHELL_LABELS.newConversation
        && ctx.q('.twm-tabs__close') === null);
    const a = chat.activeConversation();
    chat.send('a question that is longer than thirty characters');
    ok('titled from the first message', tabLabels(ctx)[0] === 'a question that is longer than...', tabLabels(ctx)[0]);
    ok('nowhere to go in a turn', chat.newConversation() === null && chat.reset() === false && chat.close(a) === false);
    t.delta('answer');
    t.end({ conversationId: 'c-a' });
    chat.send('second');
    t.end({ text: 'ok' });
    ok('only the first message titles it', tabLabels(ctx)[0].startsWith('a question'));

    const b = chat.newConversation();
    ok('a new tab in front', chat.activeConversation() === b && tabLabels(ctx).length === 2 && ctx.all('.twm-tabs__close').length === 2);
    ok('an empty transcript', msgs(ctx).length === 0);
    ok('no conversation id', chat.stateMachine.conversationId === null);
    ok('heard', changes.at(-1).join() === `${b},new`);

    chat.send('in b');
    await settle(chat);
    click(tabButtons(ctx)[0]);
    ok('a switch in a turn is refused', chat.activeConversation() === b);
    ok('and the strip goes back', ctx.q('.twm-tabs__tab--on') === tabButtons(ctx)[1]);
    ok('switchTo answers false', chat.switchTo(a) === false);
    ok('another tab can close in a turn, the one in front cannot', chat.close(b) === false);
    t.end({ text: 'done' });
    await settle(chat);

    click(tabButtons(ctx)[0]);
    ok('a click switches', chat.activeConversation() === a);
    ok('its messages are back', chat.messages().map((m) => m.text).join() === `a question that is longer than thirty characters,answer,second,ok`);
    ok('its id too', chat.stateMachine.conversationId === 'c-a');
    ok('heard', changes.at(-1).join() === `${a},switch`);
    ok('onto itself nothing', chat.switchTo(a) === false && chat.switchTo('nope') === false);

    // The scroll position of a tab comes back with it.
    const log = ctx.q('.twm-chat__log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 });
    log.scrollTop = 250;
    chat.switchTo(b);
    log.scrollTop = 0;
    chat.switchTo(a);
    ok('scroll comes back per tab', log.scrollTop === 250, String(log.scrollTop));

    ok('rename', chat.rename(a, '  Mine ') === true && tabLabels(ctx)[0] === 'Mine');
    ok('a blank name is refused', chat.rename(a, '   ') === false && tabLabels(ctx)[0] === 'Mine');
    chat.setConversationId(b, 'c-b');
    ok('an id for a tab behind', chat.snapshot().tabs[1].conversationId === 'c-b');
    ok('unknown', chat.setConversationId('nope', 'x') === false);

    chat.send('turn in a');
    ok('a tab behind can close in a turn', chat.close(b) === true && tabLabels(ctx).length === 1 && chat.isBusy());
    ok('the last one cannot, and has no close mark', ctx.q('.twm-tabs__close') === null);
    chat.cancel();
    ok('the last tab stays', chat.close(a) === false);
    await settle(chat);

    const c = chat.newConversation();
    click(ctx.all('.twm-tabs__close')[1]);
    ok('closing the one in front brings up the first', chat.activeConversation() === a && tabLabels(ctx).length === 1);
    ok('heard', changes.at(-1).join() === `${a},close`);
    ok('it is gone', chat.switchTo(c) === false);

    chat.reset();
    ok('reset empties it and its title', msgs(ctx).length === 0 && tabLabels(ctx)[0] === CHAT_SHELL_LABELS.newConversation);
    ok('and its id', chat.snapshot().tabs[0].conversationId === null && chat.stateMachine.conversationId === null);
    ok('heard', changes.at(-1).join() === `${a},reset`);
    chat.send('fresh');
    ok('and titles again', tabLabels(ctx)[0] === 'fresh');
    t.emit({ type: 'error', message: 'x' });
    await settle(chat);
    chat.newConversation();
    await settle(chat);
    ok('another conversation clears an error', chat.stateMachine.getState() === CHAT_STATES.IDLE);
    chat.destroy();

    const titled = mount({ titleFrom: (s) => s.toUpperCase() });
    titled.chat.send('short');
    ok('titleFrom', tabLabels(titled)[0] === 'SHORT');
    titled.chat.destroy();
}

console.log('§8 snapshot and restore');
{
    const seen = [];
    const ctx = mount({ onChange: (s) => seen.push(s) });
    const { chat, transport: t } = ctx;
    chat.send('kept');
    ok('the user message is reported before the reply', seen.at(-1).tabs[0].messages.map((m) => m.text).join() === 'kept');
    ok('an empty reply is not in it', seen.at(-1).tabs[0].messages.length === 1);
    const before = seen.length;
    t.delta('a');
    t.delta('b');
    ok('deltas do not report', seen.length === before);
    ok('a partial reply would be kept', chat.snapshot().tabs[0].messages.at(-1).text === 'ab');
    t.emit({ type: 'tool-use', id: 't1', name: 'x' });
    const midway = JSON.parse(JSON.stringify(chat.snapshot()));
    t.end({ conversationId: 'c1', meta: { n: 1 } });
    ok('the end reports', seen.length === before + 1);
    chat.newConversation();
    const last = JSON.parse(JSON.stringify(seen.at(-1)));
    chat.destroy();

    const back = mount({ conversations: last });
    ok('every tab, and which one is in front', tabLabels(back).length === 2 && back.chat.activeConversation() === last.activeId);
    back.chat.switchTo(last.tabs[0].id);
    await settle(back.chat);
    ok('the messages', back.chat.messages().map((m) => m.text).join() === 'kept,ab');
    ok('ids, tools and meta', back.chat.messages()[1].id === last.tabs[0].messages[1].id
        && back.chat.messages()[1].tools[0].name === 'x' && back.chat.messages()[1].meta.n === 1);
    ok('the conversation id', back.chat.stateMachine.conversationId === 'c1');
    back.chat.send('more');
    ok('it goes on', back.transport.requests[0].conversationId === 'c1' && back.chat.messages().at(-1).text === 'more');
    back.chat.destroy();

    const crashed = mount({ conversations: midway });
    await settle(crashed.chat);
    ok('a tool running when kept comes back stopped', crashed.chat.messages()[1].tools[0].status === 'stopped');
    ok('and it is not busy', !crashed.chat.isBusy() && crashed.chat.stateMachine.getState() === CHAT_STATES.IDLE);
    ok('the footer is there', crashed.all('.twm-chat-shell__copy').length === 2);
    crashed.chat.destroy();

    const odd = mount({ conversations: {
        activeId: 'gone',
        tabs: [{ id: 7, messages: [null, { text: 'no role' }, { role: 'user', text: 'yes' }] }, { id: 'b', title: 'B' }],
    } });
    ok('an unknown active id is the first, ids are strings', odd.chat.activeConversation() === '7');
    ok('a kept message with no role is skipped', odd.chat.messages().length === 1);
    ok('a missing title is the default', tabLabels(odd)[0] === CHAT_SHELL_LABELS.newConversation);
    ok('a number can be asked for', odd.chat.switchTo('b') && odd.chat.switchTo(7));
    odd.chat.destroy();

    const syncing = mount();
    const id = syncing.chat.activeConversation();
    syncing.chat.setMessages(id, [{ role: 'assistant', text: 'from the backend', meta: { x: 1 } }]);
    ok('setMessages shows them', msgs(syncing).length === 1 && syncing.chat.messages()[0].meta.x === 1);
    const tab2 = syncing.chat.newConversation();
    syncing.chat.setMessages(id, [{ role: 'user', text: 'behind' }]);
    ok('one behind waits', msgs(syncing).length === 0);
    syncing.chat.switchTo(id);
    ok('and shows when it comes up', syncing.chat.messages()[0].text === 'behind');
    syncing.chat.send('turn');
    ok('the one a turn writes to refuses', syncing.chat.setMessages(id, []) === false && syncing.chat.setMessages('nope', []) === false);
    ok('another does not', syncing.chat.setMessages(tab2, []) === true);
    syncing.chat.destroy();
}

console.log('§9 the mode toggle');
{
    const chosen = [];
    const bus = new EventBus();
    const heard = [];
    bus.on(CHAT_BUS_EVENTS.MODE_CHANGED, (p) => heard.push(p.mode));
    const ctx = mount({
        eventBus: bus,
        modes: [{ id: 'x', label: 'Read', title: 'Only read' }, { id: 'y', label: 'Write' }],
        mode: 'y',
        onModeChange: (id) => chosen.push(id),
    });
    const { chat, transport: t } = ctx;
    const buttons = ctx.all('.twm-chat-shell__mode');
    ok('labels from the caller', buttons.map((b) => b.textContent).join() === 'Read,Write' && buttons[0].title === 'Only read');
    ok('the mode given', chat.mode() === 'y' && buttons[1].classList.contains('twm-chat-shell__mode--on')
        && buttons[1].getAttribute('aria-pressed') === 'true' && buttons[0].getAttribute('aria-pressed') === 'false');
    click(buttons[0]);
    ok('a click chooses and tells', chat.mode() === 'x' && chosen.join() === 'x' && heard.join() === 'x'
        && buttons[0].classList.contains('twm-chat-shell__mode--on') && !buttons[1].classList.contains('twm-chat-shell__mode--on'));
    click(buttons[0]);
    ok('the one on already, nothing', chosen.length === 1);
    chat.send('hi');
    ok('the request carries it', t.requests[0].mode === 'x');
    ok('setMode does not call back', chat.setMode('y') === true && chosen.length === 1 && buttons[1].classList.contains('twm-chat-shell__mode--on'));
    ok('an unknown one is refused', chat.setMode('z') === false && chat.mode() === 'y');
    chat.destroy();

    const first = mount({ modes: [{ id: 'p', label: 'P' }], mode: 'unknown' });
    ok('an unknown start is the first', first.chat.mode() === 'p');
    first.chat.destroy();

    const none = mount();
    ok('no modes, no toggle', none.q('.twm-chat-shell__modes') === null && none.chat.mode() === null);
    ok('no bar at all with no picker', none.q('.twm-chat-shell__bar').hidden === true);
    none.chat.send('x');
    ok('the request says so', none.transport.requests[0].mode === null && none.transport.requests[0].model === null);
    none.chat.destroy();
}

console.log('§10 the model picker');
{
    const picked = [];
    const actions = [];
    const before = document.querySelectorAll('.twm-chat-shell__model-menu').length;
    const ctx = mount({
        models: {
            items: [
                { id: 'a', label: 'A <b>big</b>', description: '<i>x</i>', tier: 3 },
                { id: 'b', label: 'B' },
                { separator: true },
                { action: 'configure', label: 'Configure...', icon: 'tune', description: 'status' },
            ],
            activeId: 'a',
        },
        onModelSelect: (item) => picked.push(item),
        onModelAction: (action, item) => actions.push([action, item.label]),
    });
    const { chat } = ctx;
    const menu = () => document.querySelectorAll('.twm-chat-shell__model-menu')[before];
    const options = () => [...menu().querySelectorAll('.twm-action-dropdown-option')];
    const btn = ctx.q('.twm-chat-shell__model-btn');
    ok('the active model on the button', ctx.q('.twm-chat-shell__model-label').textContent === 'A <b>big</b>');
    ok('labels and descriptions are text', menu().querySelector('b') === null && menu().querySelector('i') === null
        && options()[0].querySelector('.twm-option-label').textContent === 'A <b>big</b>');
    ok('the active one is marked', options()[0].querySelector('.twm-option-icon').textContent === 'radio_button_checked'
        && options()[1].querySelector('.twm-option-icon').textContent === 'radio_button_unchecked');
    ok('an action has its own icon', options()[2].querySelector('.twm-option-icon').textContent === 'tune');
    ok('a separator', menu().querySelector('.twm-action-dropdown-separator') !== null);
    click(btn);
    ok('the button opens it', menu().hidden === false);
    click(options()[1]);
    ok('selecting hands your item back', picked[0].id === 'b');
    ok('it is controlled: nothing moved', ctx.q('.twm-chat-shell__model-label').textContent === 'A <b>big</b>');
    click(btn);
    click(options()[2]);
    ok('an action calls its own callback', actions[0].join() === 'configure,Configure...' && picked.length === 1);
    click(btn);
    click(options()[0]);
    ok('your own fields come back', picked[1].tier === 3);
    chat.setModels({ activeId: 'b' });
    ok('setModels moves it', ctx.q('.twm-chat-shell__model-label').textContent === 'B'
        && options()[1].querySelector('.twm-option-icon').textContent === 'radio_button_checked');
    chat.send('hi');
    ok('the request carries it', ctx.transport.requests[0].model === 'b');
    chat.setModels({ label: 'Display name' });
    ok('a label wins, and the items stayed', ctx.q('.twm-chat-shell__model-label').textContent === 'Display name' && options().length === 3);
    chat.setModels({ label: null, activeId: 'none' });
    ok('nothing active says so', ctx.q('.twm-chat-shell__model-label').textContent === CHAT_SHELL_LABELS.selectModel);
    const dot = ctx.q('.twm-chat-shell__status');
    ok('no status, no dot', dot.hidden === true);
    chat.setModels({ status: { state: 'ready', label: 'Ready' } });
    ok('a ready dot', !dot.hidden && dot.classList.contains('twm-chat-shell__status--ready') && dot.title === 'Ready');
    chat.setModels({ status: { state: 'pending' } });
    ok('a pending dot', dot.classList.contains('twm-chat-shell__status--pending') && !dot.classList.contains('twm-chat-shell__status--ready'));
    chat.setModels({ status: {} });
    ok('a plain dot', !dot.hidden && dot.className === 'twm-chat-shell__status');
    chat.setModels({ items: [] });
    ok('no items, no button, no bar', btn.hidden === true && ctx.q('.twm-chat-shell__bar').hidden === true);
    chat.setModels({ label: 'Fixed' });
    ok('a label alone brings it back', btn.hidden === false && ctx.q('.twm-chat-shell__bar').hidden === false);
    chat.destroy();
    ok('destroy takes the menu off the body', document.querySelectorAll('.twm-chat-shell__model-menu').length === before);
}

console.log('§11 the welcome and the clear button');
{
    const ctx = mount({ welcome: { icon: 'smart_toy', text: 'Ask me.' } });
    const { chat, transport: t } = ctx;
    const welcome = ctx.q('.twm-chat-shell__welcome');
    ok('shown on an empty transcript', welcome.hidden === false && welcome.textContent.includes('Ask me.')
        && ctx.q('.twm-chat-shell__welcome-icon').textContent === 'smart_toy');
    chat.send('hi');
    ok('gone with a message', welcome.hidden === true);
    t.end({ text: 'ok' });
    const clear = ctx.q('.twm-chat-shell__tab-btn--clear');
    const dialogButton = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label && !ctx.host.contains(b));
    click(clear);
    await new Promise((r) => setTimeout(r));
    ok('clear asks first', dialogButton(CHAT_SHELL_LABELS.clearOk) !== undefined && msgs(ctx).length === 2);
    click(dialogButton(CHAT_SHELL_LABELS.clearCancel));
    await new Promise((r) => setTimeout(r, 5));
    ok('declined, nothing goes', msgs(ctx).length === 2);
    click(clear);
    await new Promise((r) => setTimeout(r));
    click(dialogButton(CHAT_SHELL_LABELS.clearOk));
    await new Promise((r) => setTimeout(r, 5));
    ok('confirmed, it is empty', msgs(ctx).length === 0);
    ok('the welcome is back', welcome.hidden === false);
    await settle(chat);
    const count = document.querySelectorAll('button').length;
    click(clear);
    await new Promise((r) => setTimeout(r));
    ok('nothing to clear, no dialog', document.querySelectorAll('button').length === count);
    const add = ctx.q('.twm-chat-shell__tab-btn');
    click(add);
    ok('the add button adds', tabLabels(ctx).length === 2 && welcome.hidden === false);
    chat.destroy();

    const none = mount();
    ok('no welcome without one', none.q('.twm-chat-shell__welcome') === null);
    const relabelled = mount({ labels: { send: 'Go', add: 'More', input: 'Say' }, placeholder: 'Type' });
    ok('labels and placeholder reach the view', relabelled.q('.twm-chat__send').title === 'Go'
        && relabelled.q('.twm-chat-shell__tab-btn').title === 'More'
        && relabelled.q('.twm-chat__input').getAttribute('aria-label') === 'Say'
        && relabelled.q('.twm-chat__input').placeholder === 'Type');
    none.chat.destroy();
    relabelled.chat.destroy();
}

console.log('§12 rename in place');
{
    const ctx = mount();
    const { chat } = ctx;
    chat.rename(chat.activeConversation(), 'Before');
    const dbl = (n) => n.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const field = () => ctx.q('.twm-chat-shell__rename');
    dbl(tabButtons(ctx)[0]);
    ok('a double-click opens a field with the title', field()?.value === 'Before');
    dbl(tabButtons(ctx)[0]);
    ok('only one', ctx.all('.twm-chat-shell__rename').length === 1);
    field().value = 'After';
    key(field(), 'Enter');
    ok('Enter commits', tabLabels(ctx)[0] === 'After' && field() === null);
    key(tabButtons(ctx)[0], 'F2');
    field().value = 'Nope';
    key(field(), 'Escape');
    ok('F2 opens it, Escape leaves it', tabLabels(ctx)[0] === 'After' && field() === null);
    dbl(tabButtons(ctx)[0]);
    field().value = 'Blurred';
    field().dispatchEvent(new window.FocusEvent('blur'));
    ok('leaving commits', tabLabels(ctx)[0] === 'Blurred');
    dbl(tabButtons(ctx)[0]);
    field().value = '   ';
    key(field(), 'Enter');
    ok('blank keeps the title', tabLabels(ctx)[0] === 'Blurred');
    chat.destroy();
}

console.log('§13 a strict guard, and destroy');
{
    const { StateGuardService } = await import('../src/core/state_guard.js');
    const { DEFAULT_STATE_GUARD_CONFIG } = await import('../src/core/state_guard_config.js');
    const violations = [];
    const bus = new EventBus();
    bus.on('state-guard:violation', (v) => violations.push(v));
    const guard = new StateGuardService({ eventBus: bus, config: { ...DEFAULT_STATE_GUARD_CONFIG, mode: 'strict' } });
    const ctx = mount({
        modes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        models: { items: [{ id: 'm', label: 'M' }, { action: 'x', label: 'X' }] },
        welcome: { text: 'Hi' },
    });
    const { chat, transport: t } = ctx;
    await settle(chat);
    chat.send('one');
    t.emit({ type: 'tool-use', name: 'x' });
    t.delta('two');
    t.emit({ type: 'error', message: 'three' });
    await settle(chat);
    chat.send('four');
    t.end({ text: 'five', meta: {} });
    chat.newConversation();
    chat.setMode('b');
    ok('nothing is blocked, nothing reported', violations.length === 0, JSON.stringify(violations).slice(0, 200));
    let blocked = false;
    try { document.createElement('div').dataset.noSuchKey = '1'; } catch { blocked = true; }
    ok('and the guard was on', blocked);
    guard.setMode?.('off');

    const dataKeys = new Set(ctx.all('*').flatMap((n) => [...n.attributes].map((a) => a.name)).filter((n) => n.startsWith('data-')));
    ok('the only data key is the strip\'s own', [...dataKeys].join() === 'data-tab-id', [...dataKeys].join());
    chat.destroy();
    ok('destroy removes it', ctx.host.childElementCount === 0);
    chat.destroy();

    const running = mount();
    running.chat.send('x');
    const emit = running.transport.emits[0];
    running.chat.destroy();
    ok('destroy cancels a running turn', running.transport.cancelled.length === 1);
    emit({ type: 'text-delta', text: 'late' });
    emit({ type: 'message-end' });
    ok('and its transport talks to nothing', running.host.childElementCount === 0);
}

console.log('§14 entry, CSS and the view');
{
    const widgets = await import('../widgets.js');
    ok('the entry exports the names', typeof widgets.mountChatShell === 'function'
        && typeof widgets.ChatStateMachine === 'function' && !!widgets.CHAT_STATES && !!widgets.CHAT_TRANSITIONS
        && !!widgets.CHAT_BUS_EVENTS && !!widgets.CHAT_TRANSPORT_EVENTS && !!widgets.CHAT_SHELL_LABELS);
    ok('the transport event names', Object.values(CHAT_TRANSPORT_EVENTS).join() === 'text-delta,tool-use,message-end,error');

    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const source = readFileSync(resolvePath(HERE, '../src/ui/components/chat_shell.js'), 'utf8');
    const setByCode = new Set(source.match(/twm-chat-shell[a-z_-]*/g));
    setByCode.delete('twm-chat-shell__tool--');
    setByCode.delete('twm-chat-shell__status--');
    for (const status of ['running', 'done', 'error', 'stopped']) setByCode.add(`twm-chat-shell__tool--${status}`);
    for (const state of ['ready', 'pending']) setByCode.add(`twm-chat-shell__status--${state}`);
    const missing = [...setByCode].filter((c) => !css.includes(`.${c}`));
    ok('every class it sets is styled', missing.length === 0, missing.join(', '));

    const start = css.indexOf('/* ── The assistant chat shell');
    const end = css.indexOf('/* ══ FLOW · KIT');
    const rules = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
    const literal = rules.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    ok('no literal colour in its rules', literal.length === 0, literal.join(', '));
    const tokens = [...new Set(rules.match(/var\(--[a-z0-9-]+\)/g))].map((v) => v.slice(4, -1));
    const tokenFile = readFileSync(resolvePath(HERE, '../css/tokens.css'), 'utf8');
    const undefinedTokens = tokens.filter((name) => !tokenFile.includes(`${name}:`));
    ok('every token it reads exists', undefinedTokens.length === 0, undefinedTokens.join(', '));
    for (const name of ['twm-chat-shell-typing', 'twm-chat-shell-pulse']) {
        ok(`@keyframes ${name}`, rules.includes(`@keyframes ${name}`));
    }

    const words = /\b(simulation|economy|economic|scenario|dsl|namespace|stock|godley|ecosim|ecoagent|bugdesk|project)\b/i;
    const machineSource = readFileSync(resolvePath(HERE, '../src/ui/components/chat_state_machine.js'), 'utf8');
    const doc = readFileSync(resolvePath(HERE, '../docs/components/chat-shell.md'), 'utf8');
    ok('no application word in its code, machine or doc', ![source, machineSource, doc].some((s) => words.test(s)));

    const host = document.createElement('div');
    document.body.append(host);
    const view = mountConversationView(host);
    const a = view.append({ role: 'user', text: 'a' });
    const b = view.append({ role: 'user', text: 'b' });
    view.slot(a).textContent = 'kept';
    ok('view.remove takes one out', view.remove(b) === true && view.messages().length === 1
        && host.querySelectorAll('.twm-chat__msg').length === 1);
    ok('and leaves the other, slot and all', view.slot(a).textContent === 'kept');
    ok('its slot is gone', view.slot(b) === null);
    ok('an unknown id', view.remove('nope') === false);
    const s = view.beginStream();
    ok('an open stream on it is over', view.remove(s) === true && view.streamingId() === null);
    view.appendChunk('nowhere');
    ok('and takes no more', view.messages().length === 1);
    view.destroy();
}

if (failed) {
    console.error(`chat shell: ${failed} FAILED`);
    process.exit(1);
}
console.log('chat shell: all passed');
process.exit(0);
