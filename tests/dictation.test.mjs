/**
 * ══ DICTATION (STORY-0096) ═══════════════════════════════════════════════
 *
 *   §1  parseHotkey; sanitizeDictatedText makes one line and drops control characters
 *   §2  holding Ctrl+Space records (the recorder starts inside the keydown on a warm
 *       microphone), the key goes no further, and the release types the text at the
 *       cursor of the input that had focus, with an input event
 *   §3  the target is fixed at the press: focus moving during the transcription
 *       does not move the text; a textarea gets a space before a word it would run into
 *   §4  a registered handler (a terminal) is used instead of the DOM, nearest wins,
 *       and no line break or escape ever reaches it; a handler that declines is reported
 *   §5  contenteditable takes the text at its selection
 *   §6  the mic button toggles the same recording, keeps focus in the field (or uses
 *       the field focused last), shows
 *       aria-pressed and a level meter; a button with its own target
 *   §7  a cold microphone: the press waits for getUserMedia and records; a release
 *       before it was ready says so and transcribes nothing; stats() has the latency
 *   §8  every failure is reported through the notification centre: insecure origin,
 *       no MediaRecorder, permission refused, no microphone, transcription failed,
 *       nothing heard, no field (the text is shown)
 *   §9  a tap is discarded; Esc cancels; the window losing focus ends a hold;
 *       other modifier sets and auto-repeat do not start a second recording
 *   §10 the microphone is released after keepMicMs; destroy removes every listener
 *   §11 observe() adds a same-origin iframe: a hold inside it types into its field
 *   §12 Monaco editors from MonacoEditorFactory are targets; a read-only one declines
 *   §13 the entry exports it; every class it sets is styled; no application vocabulary
 *
 *     node tests/dictation.test.mjs
 *
 * jsdom has no microphone, MediaRecorder or AudioContext: each is a fake here
 * that records what was asked of it. jsdom is borrowed from the sibling Tables
 * checkout. Absent, this SKIPS loudly.
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
    console.log('dictation: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent',
                   'CustomEvent', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
const win = dom.window;
const doc = win.document;

const { attachDictation, parseHotkey } = await import('../src/ui/components/dictation.js');
const { registerDictationTarget, sanitizeDictatedText, insertDictatedText } =
    await import('../src/ui/utils/dictation_targets.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };

// ── fakes ─────────────────────────────────────────────────────────────────
class FakeTrack {
    constructor() { this.stopped = false; this.listeners = {}; }
    stop() { this.stopped = true; }
    addEventListener(n, f) { this.listeners[n] = f; }
}
class FakeStream {
    constructor() { this.tracks = [new FakeTrack()]; }
    getTracks() { return this.tracks; }
}
const recorders = [];
class FakeRecorder extends win.EventTarget {
    static isTypeSupported(t) { return t === 'audio/webm;codecs=opus'; }
    constructor(stream, opts) {
        super();
        this.stream = stream;
        this.mimeType = opts?.mimeType ?? '';
        this.state = 'inactive';
        this.startedAt = null;
        recorders.push(this);
    }
    start() { this.state = 'recording'; this.startedAt = performance.now(); }
    stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        setTimeout(() => {
            const e = new win.Event('dataavailable');
            e.data = new Blob(['RIFF-audio'], { type: this.mimeType });
            this.dispatchEvent(e);
            this.dispatchEvent(new win.Event('stop'));
        }, 0);
    }
}
/** getUserMedia that answers at once (warm), later (cold: `release()`), or with an error. */
function fakeDevices({ error = null, manual = false } = {}) {
    const calls = [];
    let releaseFn = null;
    return {
        calls,
        release: () => releaseFn?.(),
        getUserMedia(constraints) {
            calls.push(constraints);
            if (error) return Promise.reject(Object.assign(new Error(error), { name: error }));
            const s = new FakeStream();
            if (!manual) return Promise.resolve(s);
            return new Promise((r) => { releaseFn = () => r(s); });
        },
    };
}
class FakeAudioContext {
    constructor() { this.closed = false; FakeAudioContext.last = this; }
    createAnalyser() {
        return { fftSize: 0, getByteTimeDomainData(buf) { for (let i = 0; i < buf.length; i++) buf[i] = i % 2 ? 178 : 78; } };
    }
    createMediaStreamSource() { return { connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { this.closed = true; }
}
function bus() {
    const toasts = [];
    return { toasts, emit(name, p) { if (name === 'toast:show') toasts.push(p); } };
}

const keydown = (el, init) => {
    const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
    el.dispatchEvent(e);
    return e;
};
const keyup = (el, init) => {
    const e = new win.KeyboardEvent('keyup', { bubbles: true, cancelable: true, composed: true, ...init });
    el.dispatchEvent(e);
    return e;
};
const CTRL_SPACE = { key: ' ', code: 'Space', ctrlKey: true };
const holdFor = (ms) => new Promise((r) => setTimeout(r, ms));

/** A dictation with fakes; `said` is what transcribe answers. */
function make(over = {}) {
    const eventBus = bus();
    const devices = over.devices ?? fakeDevices();
    const calls = [];
    const d = attachDictation({
        window: win,
        mediaDevices: devices,
        MediaRecorder: FakeRecorder,
        AudioContext: FakeAudioContext,
        eventBus,
        minHoldMs: 20,
        transcribe: over.transcribe ?? (async (blob, info) => { calls.push({ blob, info }); return over.said ?? 'hello world'; }),
        ...over.opts,
    });
    return { d, eventBus, devices, calls };
}

const root = doc.getElementById('root');
function field(html) {
    root.innerHTML = html;
    return root.firstElementChild;
}

// ═════════════════════════════════════════════════════════════════════════
console.log('§1 hotkeys and sanitizing');
{
    const h = parseHotkey('Ctrl+Space');
    ok('Ctrl+Space', h.ctrl && !h.alt && !h.shift && !h.meta && h.code === 'Space');
    const g = parseHotkey('Alt+Shift+d');
    ok('a letter widens to its code', g.alt && g.shift && g.code === 'KeyD');
    ok('a digit widens to its code', parseHotkey('Meta+1').code === 'Digit1' && parseHotkey('Cmd+1').meta);
    ok('a code is kept', parseHotkey('Control+F9').code === 'F9');
    let threw = 0;
    try { parseHotkey('Ctrl'); } catch { threw++; }
    try { parseHotkey('Ctrl+A+B'); } catch { threw++; }
    ok('no key, or two, throws', threw === 2);
    ok('line breaks and tabs become spaces', sanitizeDictatedText('ls -la\r\n\tcd ..\n') === 'ls -la cd ..');
    ok('escape and other controls go', sanitizeDictatedText('a\u001b[2Jb\u0000c\u0003\u007f') === 'a[2Jbc');
    ok('runs of spaces collapse', sanitizeDictatedText('  a    b  ') === 'a b');
    ok('null is empty', sanitizeDictatedText(null) === '');
}

console.log('§2 hold to talk into the focused input');
{
    const { d, calls, eventBus } = make();
    await d.prepare();                                   // a warm microphone
    const input = field('<input type="text" value="say  now">');
    input.focus();
    input.setSelectionRange(4, 4);
    let reachedInput = 0;
    input.addEventListener('keydown', () => reachedInput++);
    const before = recorders.length;
    const e = keydown(input, CTRL_SPACE);
    ok('the recorder started inside the keydown', recorders.length === before + 1 && recorders.at(-1).state === 'recording');
    ok('state is recording', d.state() === 'recording' && d.isRecording());
    ok('the key is swallowed (default prevented, never reached the input)', e.defaultPrevented && reachedInput === 0);
    ok('the format is the first the recorder supports', recorders.at(-1).mimeType === 'audio/webm;codecs=opus');
    ok('press-to-record latency is measured and under 150 ms', d.stats().lastStartLatencyMs !== null && d.stats().lastStartLatencyMs < 150,
       String(d.stats().lastStartLatencyMs));
    const rep = keydown(input, { ...CTRL_SPACE, repeat: true });
    ok('auto-repeat is swallowed and starts nothing', rep.defaultPrevented && recorders.length === before + 1);
    let inputs = 0;
    input.addEventListener('input', (ev) => { inputs++; ok('the input event says insertText', ev.inputType === 'insertText' || ev.type === 'input'); });
    await holdFor(40);
    const up = keyup(input, { key: ' ', code: 'Space', ctrlKey: true });
    ok('the keyup is swallowed too', up.defaultPrevented);
    ok('state is transcribing', d.state() === 'transcribing');
    await flush();
    ok('transcribe got the blob and its type', calls.length === 1 && calls[0].blob instanceof Blob
       && calls[0].info.mimeType === 'audio/webm;codecs=opus' && calls[0].info.durationMs >= 20);
    ok('the text went in at the cursor', input.value === 'say hello world now', JSON.stringify(input.value));
    ok('the cursor is after the text', input.selectionStart === input.value.indexOf('hello world') + 'hello world'.length);
    ok('one input event', inputs === 1);
    ok('back to idle, no toast', d.state() === 'idle' && eventBus.toasts.length === 0, JSON.stringify(eventBus.toasts));
    ok('the microphone stays open for the next press', d.stats().micOpen);

    // releasing Ctrl first ends the hold as well
    keydown(input, CTRL_SPACE);
    await holdFor(30);
    keyup(input, { key: 'Control', code: 'ControlLeft' });
    await flush();
    ok('releasing the modifier ends the hold', d.state() === 'idle' && calls.length === 2);
    d.destroy();
}

console.log('§3 the target is fixed at the press');
{
    let finish;
    const { d } = make({ transcribe: () => new Promise((r) => { finish = r; }) });
    await d.prepare();
    root.innerHTML = '<textarea id="a">first</textarea><input id="b" type="text">';
    const a = doc.getElementById('a');
    const b = doc.getElementById('b');
    a.focus();
    a.setSelectionRange(5, 5);
    keydown(a, CTRL_SPACE);
    await holdFor(30);
    keyup(a, { key: ' ', code: 'Space' });
    await flush();
    b.focus();                                    // focus moves while it transcribes
    finish('second part');
    await flush();
    ok('the text went to the field that had focus at the press', a.value === 'first second part' && b.value === '', JSON.stringify([a.value, b.value]));
    ok('a space was put before the word it would have run into', a.value === 'first second part');
    a.value = 'onethree';
    a.setSelectionRange(3, 3);
    await insertDictatedText(a, 'two');
    ok('a word inserted mid-word is spaced on both sides', a.value === 'one two three', JSON.stringify(a.value));
    const p = field('<input type="text" value="end">');
    p.setSelectionRange(3, 3);
    await insertDictatedText(p, '. Next');
    ok('punctuation is not spaced from the word before', p.value === 'end. Next', JSON.stringify(p.value));
    d.destroy();
}

console.log('§3b a new recording while the last one transcribes');
{
    let finish;
    const { d } = make({ transcribe: () => new Promise((r) => { finish = r; }) });
    await d.prepare();
    const input = field('<input type="text">');
    input.focus();
    keydown(input, CTRL_SPACE);
    await holdFor(30);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    keydown(input, CTRL_SPACE);
    ok('a second hold records while the first transcribes', d.state() === 'recording');
    finish('one');
    await flush();
    ok('the first finishing leaves the second recording', d.state() === 'recording' && input.value === 'one', `${d.state()} ${input.value}`);
    d.cancel();
    ok('cancelled, it is idle', d.state() === 'idle');
    d.destroy();
}

console.log('§4 a registered handler (a terminal)');
{
    const { d } = make({ said: 'git status\r\n\u001b[A' });
    await d.prepare();
    root.innerHTML = '<div id="term"><div class="rows"></div><textarea class="helper"></textarea></div>';
    const term = doc.getElementById('term');
    const helper = term.querySelector('.helper');
    const got = [];
    const off = registerDictationTarget(term, (text, ctx) => { got.push([text, ctx.element]); });
    helper.focus();
    keydown(helper, CTRL_SPACE);
    await holdFor(30);
    keyup(helper, { key: ' ', code: 'Space' });
    await flush();
    ok('the handler got the text, not the helper textarea', got.length === 1 && helper.value === '');
    ok('no line break and no escape reached it', got[0]?.[0] === 'git status [A' && !/[\r\n\u001b]/.test(got[0][0]), JSON.stringify(got[0]?.[0]));
    ok('the handler is told which element registered', got[0]?.[1] === term);

    // nearest registration wins
    const inner = doc.createElement('div');
    inner.tabIndex = 0;
    term.append(inner);
    const innerGot = [];
    const offInner = registerDictationTarget(inner, (t) => { innerGot.push(t); });
    await insertDictatedText(inner, 'x');
    ok('the nearest registration wins', innerGot.length === 1 && got.length === 1);
    offInner();
    off();
    await insertDictatedText(helper, 'plain');
    ok('unregistered, the helper textarea is typed into again', helper.value === 'plain');

    // a handler that declines
    d.destroy();
    const declined = make({ said: 'nope' });
    await declined.d.prepare();
    registerDictationTarget(term, () => false);
    helper.value = '';
    helper.focus();
    keydown(helper, CTRL_SPACE);
    await holdFor(30);
    keyup(helper, { key: ' ', code: 'Space' });
    await flush();
    const t = declined.eventBus.toasts.at(-1);
    ok('a declining target is reported with the text', t && t.severity === 'warn' && t.message.includes('nope'), JSON.stringify(t));
    declined.d.destroy();
}

console.log('§5 contenteditable');
{
    const { d } = make({ said: 'brave' });
    await d.prepare();
    const ed = field('<div contenteditable="true">hello world</div>');
    ed.focus();
    const range = doc.createRange();
    range.setStart(ed.firstChild, 6);
    range.collapse(true);
    const sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let inputs = 0;
    ed.addEventListener('input', () => inputs++);
    keydown(ed, CTRL_SPACE);
    await holdFor(30);
    keyup(ed, { key: ' ', code: 'Space' });
    await flush();
    ok('the text is at the selection, spaced from the word after it', ed.textContent === 'hello brave world', JSON.stringify(ed.textContent));
    ok('…and an input event was fired', inputs === 1);
    const child = field('<div contenteditable=""><p id="p">x</p></div>');
    ok('a child of a contenteditable takes text', await insertDictatedText(child.querySelector('#p'), 'y'));
    const off = field('<div contenteditable="false">fixed</div>');
    ok('contenteditable=false does not', !(await insertDictatedText(off, 'y')));
    const ro = field('<input type="text" readonly>');
    ok('a read-only input does not', !(await insertDictatedText(ro, 'y')));
    const num = field('<input type="number">');
    ok('a number input does not', !(await insertDictatedText(num, '5')));
    const email = field('<input type="email" value="a">');
    ok('an email input (no selection API) is appended to', (await insertDictatedText(email, 'b')) && email.value === 'a b');
    d.destroy();
}

console.log('§6 the mic button');
{
    const { d, calls } = make({ said: 'from the button' });
    const input = field('<input type="text">');
    input.focus();
    const btn = d.createMicButton();
    doc.body.append(btn);
    ok('a button with the mic icon and a meter', btn.tagName === 'BUTTON' && btn.type === 'button'
       && btn.querySelector('.twm-dictation-mic__icon')?.textContent === 'mic'
       && !!btn.querySelector('.twm-dictation-mic__meter .twm-dictation-mic__level'));
    ok('its title names the hotkey', btn.title.includes('Ctrl+Space') && btn.getAttribute('aria-pressed') === 'false');
    const md = new win.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(md);
    ok('pressing it does not take focus', md.defaultPrevented);
    btn.click();
    await flush();
    ok('a click starts recording', d.state() === 'recording' && btn.getAttribute('aria-pressed') === 'true'
       && btn.classList.contains('twm-dictation-mic--recording'));
    await tick(40);
    const lvl = Number(btn.style.getPropertyValue('--twm-dictation-level'));
    ok('the level meter moves while listening', d.level() > 0 && lvl > 0, `${d.level()} / ${lvl}`);
    // a hotkey press while the button records neither starts a second one nor stops it
    keydown(input, CTRL_SPACE);
    keyup(input, { key: ' ', code: 'Space' });
    ok('the hotkey does not interfere with a toggled recording', d.state() === 'recording');
    btn.click();
    ok('a second click stops it', d.state() === 'transcribing' && btn.classList.contains('twm-dictation-mic--busy'));
    ok('the meter falls back to 0', Number(btn.style.getPropertyValue('--twm-dictation-level')) === 0);
    await flush();
    ok('the text went into the field that had focus', input.value === 'from the button' && calls.length === 1);
    ok('the button is idle again', btn.getAttribute('aria-pressed') === 'false' && !btn.classList.contains('twm-dictation-mic--busy'));

    // focus on the button itself (Tab, then Enter): the field focused last gets the text
    input.value = '';
    input.focus();
    btn.focus();
    btn.click();
    await flush();
    await tick(30);
    btn.click();
    await flush();
    ok('a keyboard-focused button types into the field focused before it', input.value === 'from the button', JSON.stringify(input.value));
    // a hold over nothing types nowhere, even with a field focused earlier
    input.value = '';
    btn.blur();
    doc.activeElement?.blur?.();
    keydown(doc.body, CTRL_SPACE);
    await tick(30);
    keyup(doc.body, { key: ' ', code: 'Space' });
    await flush();
    ok('a hotkey held over no field does not type into an old one', input.value === '');

    // a button with its own target
    root.innerHTML = '<input id="other" type="text"><div id="tile"></div>';
    const other = doc.getElementById('other');
    const tile = doc.getElementById('tile');
    const got = [];
    registerDictationTarget(tile, (t) => { got.push(t); });
    const own = d.createMicButton({ target: () => tile, className: 'x' });
    ok('className is added', own.classList.contains('x') && own.classList.contains('twm-dictation-mic'));
    other.focus();
    own.click();
    await flush();
    await tick(30);
    own.click();
    await flush();
    ok('its text goes to its own target, not the focused field', got[0] === 'from the button' && other.value === '');
    d.destroy();
    ok('destroy disables the buttons', btn.disabled && own.disabled);
}

console.log('§7 a cold microphone');
{
    const devices = fakeDevices({ manual: true });
    const { d, calls, eventBus } = make({ devices });
    const input = field('<input type="text">');
    input.focus();
    keydown(input, CTRL_SPACE);
    ok('state is starting while the microphone opens', d.state() === 'starting' && devices.calls.length === 1);
    ok('getUserMedia was asked for audio', devices.calls[0]?.audio === true);
    keyup(input, { key: ' ', code: 'Space' });
    devices.release();
    await flush();
    ok('a release before it was ready transcribes nothing', calls.length === 0 && d.state() === 'idle');
    ok('…and says so', eventBus.toasts.some((t) => /not ready/i.test(t.message)), JSON.stringify(eventBus.toasts));
    ok('the microphone, now open, is kept for the next press', d.stats().micOpen);
    d.destroy();

    const dev2 = fakeDevices({ manual: true });
    const cold = make({ devices: dev2 });
    input.focus();
    keydown(input, CTRL_SPACE);
    dev2.release();
    await flush();
    ok('held long enough, a cold press records', cold.d.state() === 'recording');
    ok('stats() has the press-to-record delay', typeof cold.d.stats().lastStartLatencyMs === 'number');
    await tick(30);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    ok('and is transcribed', cold.calls.length === 1 && input.value === 'hello world');
    cold.d.destroy();
}

console.log('§8 failures are reported');
{
    const input = field('<input type="text">');
    input.focus();
    const insecureWin = new JSDOM('<!doctype html><body><input></body>', { url: 'http://desk.lan:5000/' }).window;
    Object.defineProperty(insecureWin, 'isSecureContext', { value: false });
    const b1 = bus();
    const d1 = attachDictation({ window: insecureWin, mediaDevices: fakeDevices(), MediaRecorder: FakeRecorder, eventBus: b1, transcribe: async () => 'x' });
    const i1 = insecureWin.document.querySelector('input');
    i1.focus();
    i1.dispatchEvent(new insecureWin.KeyboardEvent('keydown', { ...CTRL_SPACE, bubbles: true, cancelable: true }));
    ok('an insecure origin is named', b1.toasts.length === 1 && b1.toasts[0].message.includes('https or localhost')
       && b1.toasts[0].message.includes('http://desk.lan:5000'), JSON.stringify(b1.toasts));
    ok('…and nothing records', d1.state() === 'idle');
    d1.destroy();

    const codes = [];
    const b2 = bus();
    const d2 = attachDictation({ window: win, mediaDevices: fakeDevices(), MediaRecorder: undefined, eventBus: b2,
                                 onError: (c) => codes.push(c), transcribe: async () => 'x' });
    d2.toggle();
    ok('no MediaRecorder: unsupported', codes.at(-1) === 'unsupported' && b2.toasts.length === 1);
    d2.destroy();

    for (const [name, code, re] of [['NotAllowedError', 'permission-denied', /permission/i],
                                    ['NotFoundError', 'no-microphone', /no microphone/i],
                                    ['NotReadableError', 'microphone-busy', /in use/i]]) {
        const got = [];
        const { d, eventBus } = make({ devices: fakeDevices({ error: name }), opts: { onError: (c) => got.push(c) } });
        keydown(input, CTRL_SPACE);
        await flush();
        ok(`${name} → ${code}`, got[0] === code && re.test(eventBus.toasts[0]?.message ?? '') && d.state() === 'idle',
           JSON.stringify(eventBus.toasts));
        d.destroy();
    }

    const failing = make({ transcribe: async () => { throw new Error('service down'); } });
    await failing.d.prepare();
    input.focus();
    keydown(input, CTRL_SPACE);
    await tick(30);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    const ft = failing.eventBus.toasts.at(-1);
    ok('a transcription that failed is an error toast with the reason', ft?.severity === 'error' && ft.message.includes('service down'));
    ok('…and back to idle', failing.d.state() === 'idle');
    failing.d.destroy();

    const silent = make({ said: '  \n ' });
    await silent.d.prepare();
    keydown(input, CTRL_SPACE);
    await tick(30);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    ok('nothing heard is said', /nothing/i.test(silent.eventBus.toasts.at(-1)?.message ?? '') && input.value === '');
    silent.d.destroy();

    const nowhere = make({ said: 'lost words', opts: { onTranscript: (t, target, inserted) => { nowhere.heard = [t, target, inserted]; } } });
    await nowhere.d.prepare();
    input.blur();
    root.innerHTML = '';
    nowhere.d.toggle();
    await tick(30);
    nowhere.d.toggle();
    await flush();
    const nt = nowhere.eventBus.toasts.at(-1);
    ok('with no field the text is shown, not lost', nt && nt.message.includes('lost words'), JSON.stringify(nt));
    ok('onTranscript hears it, not inserted', nowhere.heard?.[0] === 'lost words' && nowhere.heard[2] === false);
    nowhere.d.destroy();
}

console.log('§9 taps, Esc, blur, other keys');
{
    const { d, calls } = make({ opts: { minHoldMs: 200 } });
    await d.prepare();
    const input = field('<input type="text">');
    input.focus();
    keydown(input, CTRL_SPACE);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    ok('a tap is discarded', calls.length === 0 && d.state() === 'idle' && input.value === '');
    d.destroy();

    const e2 = make();
    await e2.d.prepare();
    input.focus();
    keydown(input, CTRL_SPACE);
    await tick(30);
    const esc = keydown(input, { key: 'Escape', code: 'Escape' });
    ok('Esc cancels and is swallowed', e2.d.state() === 'idle' && esc.defaultPrevented);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    ok('…and nothing is transcribed', e2.calls.length === 0);
    const plainEsc = keydown(input, { key: 'Escape', code: 'Escape' });
    ok('Esc when not recording is left alone', !plainEsc.defaultPrevented);

    keydown(input, CTRL_SPACE);
    await tick(30);
    win.dispatchEvent(new win.FocusEvent('blur'));
    await flush();
    ok('the window losing focus ends the hold and transcribes', e2.d.state() === 'idle' && e2.calls.length === 1);

    const shifted = keydown(input, { ...CTRL_SPACE, shiftKey: true });
    ok('Ctrl+Shift+Space is not the hotkey', !shifted.defaultPrevented && e2.d.state() === 'idle');
    const plain = keydown(input, { key: ' ', code: 'Space' });
    ok('a plain space is not the hotkey', !plain.defaultPrevented);
    e2.d.destroy();

    const custom = make({ opts: { hotkey: 'Alt+D' } });
    await custom.d.prepare();
    keydown(input, { key: 'd', code: 'KeyD', altKey: true });
    ok('a configured hotkey works', custom.d.state() === 'recording');
    custom.d.cancel();
    keydown(input, CTRL_SPACE);
    ok('…and Ctrl+Space no longer does', custom.d.state() === 'idle');
    custom.d.destroy();

    const none = make({ opts: { hotkey: null } });
    const nb = none.d.createMicButton();
    keydown(input, CTRL_SPACE);
    ok('hotkey null: no key starts it, the button is titled plainly', none.d.state() === 'idle' && nb.title === 'Dictate');
    none.d.destroy();
}

console.log('§10 the microphone is released; destroy');
{
    const { d } = make({ opts: { keepMicMs: 30 } });
    await d.prepare();
    const stream = d.stats().micOpen;
    ok('prepare opens the microphone', stream);
    await tick(60);
    ok('it is released after keepMicMs', !d.stats().micOpen && FakeAudioContext.last.closed);
    d.destroy();

    const zero = make({ opts: { keepMicMs: 0 } });
    const input = field('<input type="text">');
    input.focus();
    keydown(input, CTRL_SPACE);
    await flush();
    await tick(30);
    const track = recorders.at(-1).stream.tracks[0];
    keyup(input, { key: ' ', code: 'Space' });
    ok('keepMicMs 0 stops the track at once', track.stopped && !zero.d.stats().micOpen);
    await flush();
    zero.d.destroy();

    let aborted = null;
    const gone = make({ transcribe: (blob, { signal }) => new Promise(() => { aborted = signal; }) });
    await gone.d.prepare();
    input.focus();
    keydown(input, CTRL_SPACE);
    await tick(30);
    keyup(input, { key: ' ', code: 'Space' });
    await flush();
    gone.d.destroy();
    ok('destroy aborts a transcription in flight', aborted?.aborted === true);
    ok('…and closes the microphone', !gone.d.stats().micOpen);
    const after = keydown(input, CTRL_SPACE);
    ok('after destroy the hotkey is not caught', !after.defaultPrevented && gone.d.state() === 'idle');
    let threw = false;
    try { attachDictation({ window: win }); } catch { threw = true; }
    ok('transcribe is required', threw);
}

console.log('§11 an iframe');
{
    const frame = doc.createElement('iframe');
    root.innerHTML = '';
    root.append(frame);
    const fdoc = frame.contentDocument;
    fdoc.body.innerHTML = '<input type="text" id="f">';
    const { d } = make({ said: 'in the frame' });
    await d.prepare();
    d.observe(frame.contentWindow);
    const fi = fdoc.getElementById('f');
    fi.focus();
    fi.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { ...CTRL_SPACE, bubbles: true, cancelable: true }));
    ok('a hold inside the observed iframe records', d.state() === 'recording');
    await tick(30);
    fi.dispatchEvent(new frame.contentWindow.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    await flush();
    ok('and types into the iframe\'s field', fi.value === 'in the frame', JSON.stringify(fi.value));
    d.destroy();
}

console.log('§12 Monaco editors');
{
    const { MonacoEditorFactory } = await import('../src/editor/monaco_editor_factory.js');
    const edits = [];
    let readOnly = false;
    const fakeEditor = {
        getRawOptions: () => ({ readOnly }),
        getSelections: () => [{ startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 }],
        executeEdits: (src, ops) => { edits.push([src, ops]); return true; },
        pushUndoStop() {},
        onDidContentSizeChange: () => ({ dispose() {} }),
        getContentHeight: () => 100,
        layout() {},
        updateOptions() {},
        onKeyDown() {},
        getValue: () => '',
        dispose() {},
    };
    // initMonaco() asks the AMD `require` for editor.main and takes window.monaco.
    const { initMonaco } = await import('../src/editor/monaco_loader.js');
    win.monaco = { editor: { defineTheme() {}, setTheme() {}, create: () => fakeEditor }, KeyCode: { Enter: 3 } };
    win.require = Object.assign((deps, cb) => cb(), { config() {} });
    await initMonaco('fake/monaco');
    const factory = await new MonacoEditorFactory().init();
    const host = doc.createElement('div');
    host.innerHTML = '<textarea class="inputarea"></textarea>';
    doc.body.append(host);
    let handle = null;
    try { handle = factory.createEditor(host, 'abcdef'); } catch (e) { ok('createEditor with a fake monaco', false, e.message); }
    if (handle) {
        const ins = await insertDictatedText(host.querySelector('textarea'), 'XY\n');
        ok('an editor takes dictation through executeEdits, at its selection', ins && edits.length === 1
           && edits[0][0] === 'dictation' && edits[0][1][0].text === 'XY' && edits[0][1][0].range.startColumn === 3,
           JSON.stringify(edits));
        readOnly = true;
        ok('a read-only editor declines', !(await insertDictatedText(host, 'no')) && edits.length === 1);
        handle.dispose();
        ok('dispose removes the registration (the textarea is typed into again)',
           (await insertDictatedText(host.querySelector('textarea'), 'plain')) && host.querySelector('textarea').value === 'plain');
        const inlineHost = doc.createElement('div');
        doc.body.append(inlineHost);
        readOnly = false;
        const inline = factory.createInlineEditor(inlineHost, '');
        ok('inline editors are targets too', await insertDictatedText(inlineHost, 'v') && edits.length === 2);
        inline.dispose();
    }
}

console.log('§13 entry and CSS');
{
    const widgets = await import('../widgets.js');
    ok('@flexdesk/widgets exports attachDictation, parseHotkey and the target helpers',
       widgets.attachDictation === attachDictation && widgets.parseHotkey === parseHotkey
       && widgets.registerDictationTarget === registerDictationTarget && widgets.insertDictatedText === insertDictatedText);
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const src = readFileSync(resolvePath(HERE, '../src/ui/components/dictation.js'), 'utf8')
        + readFileSync(resolvePath(HERE, '../src/ui/utils/dictation_targets.js'), 'utf8');
    const classes = new Set(src.match(/twm-dictation-mic(__[a-z-]+)?(--[a-z-]+)?/g));
    const missing = [...classes].filter((c) => !/(__|--)$/.test(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    ok('every twm-dictation class it sets is styled', missing.length === 0, missing.join(', '));
    ok('no application vocabulary in the source', !/pywebview|ecosim|anthropic|openai|whisper|aidesk|xterm|\bllm\b|\/api\/stt/i.test(src));
}

if (failures) {
    console.error(`\ndictation: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
