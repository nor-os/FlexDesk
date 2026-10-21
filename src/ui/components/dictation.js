/**
 * ══ DICTATION ═════════════════════════════════════════════════════════════
 *
 * Hold a key, speak, let go: the words appear at the cursor of whatever had
 * focus (FlexDesk STORY-0096). FlexDesk only RECORDS. Turning audio into text
 * is the embedder's `transcribe(blob)`, so no speech service, key or model
 * is in here.
 *
 *     const dictation = attachDictation({
 *         transcribe: async (blob) => (await fetch('/stt', { method: 'POST', body: blob })).text(),
 *         hotkey: 'Ctrl+Space',
 *     });
 *     toolbar.append(dictation.createMicButton());
 *     registerDictationTarget(terminalEl, (text) => term.paste(text));   // dictation_targets.js
 *
 * THE HOTKEY is held, not pressed: keydown starts recording, the keyup of the
 * key or of one of its modifiers (or the window losing focus) stops it and
 * transcribes. It is caught in the capture phase on the window and goes no
 * further, so a terminal never sees Ctrl+Space (which it would send as NUL)
 * and an input never gets the space. Esc while recording discards it.
 *
 * THE TARGET is fixed when recording starts: the element the key event came
 * from (through shadow roots), or for the mic button the element focused last
 * that takes dictation. It is typed into on release even if focus moved
 * while the transcription ran. Text goes through `insertDictatedText`: a
 * registered handler first (a terminal, an editor), else the DOM at the
 * cursor. It is always ONE line — no Enter is ever sent.
 *
 * STARTING FAST: the first word is the one people lose. Once the microphone is
 * open the stream is KEPT for `keepMicMs` after each recording (30 s; the
 * browser shows its recording indicator meanwhile), so the next press starts
 * the recorder inside the keydown handler itself. `prepare()` opens it ahead
 * of time. A cold press waits for `getUserMedia`; a release before the
 * microphone was ready says so instead of transcribing silence. `stats()`
 * reports the last press-to-recording delay.
 *
 * WHEN IT CANNOT RECORD it says why, through the notification centre (the
 * `eventBus`'s `toast:show`, or the toast helpers' bus): a page that is not
 * a secure context (browsers give the microphone only to https and
 * localhost), a browser without `getUserMedia`/`MediaRecorder`, permission
 * refused, no microphone, one held by another program, a transcription that
 * failed, nothing heard, no field to type into (the text is shown, not lost).
 * `onError(code, error)` hears the same.
 *
 * `observe(window)` adds another same-origin window — an iframe holding an
 * embedded form — to the hotkey and focus tracking. `destroy()` removes every
 * listener, stops the microphone, aborts transcriptions in flight and
 * disables the mic buttons it made.
 */

import { getToastBus } from './toast.js';
import { acceptsDictation, deepActiveElement, dictationKind, insertDictatedText, sanitizeDictatedText }
    from '../utils/dictation_targets.js';

/** How long the microphone stays open after a recording, so the next press starts at once. */
export const DICTATION_KEEP_MIC_MS = 30000;

/** A hold shorter than this is a tap, and is discarded rather than transcribed. */
export const DICTATION_MIN_HOLD_MS = 250;

/** Recording formats tried in order when the embedder names none. */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

const MODIFIER_KEYS = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' };

const DEFAULT_LABELS = Object.freeze({
    start: 'Dictate (hold {hotkey})',
    startNoHotkey: 'Dictate',
    stop: 'Stop dictation',
    busy: 'Transcribing…',
    title: 'Dictation',
    insecure: 'The microphone is only available on https or localhost; this page is {origin}.',
    unsupported: 'This browser cannot record audio here.',
    denied: 'Microphone permission was refused. Allow it in the browser\'s site settings.',
    noMic: 'No microphone was found.',
    busyMic: 'The microphone is in use by another program, or could not be opened.',
    notReady: 'The microphone was not ready yet. Hold the key a moment longer.',
    failed: 'Transcription failed: {message}',
    nothing: 'Nothing was heard.',
    noTarget: 'No field had focus. You said: "{text}"',
    declined: 'That field does not take text. You said: "{text}"',
});

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * `'Ctrl+Space'`, `'Alt+Shift+KeyD'`, `'Meta+D'` → `{ ctrl, alt, shift, meta, code }`.
 * The key is a `KeyboardEvent.code`: a letter or digit is widened to `KeyD` /
 * `Digit1`, `Space`, `F1`…, or a code given as is. Throws on no key or two.
 */
export function parseHotkey(spec) {
    const out = { ctrl: false, alt: false, shift: false, meta: false, code: null };
    for (const raw of String(spec).split('+').map((p) => p.trim()).filter(Boolean)) {
        const p = raw.toLowerCase();
        if (p === 'ctrl' || p === 'control') out.ctrl = true;
        else if (p === 'alt' || p === 'option') out.alt = true;
        else if (p === 'shift') out.shift = true;
        else if (p === 'meta' || p === 'cmd' || p === 'super') out.meta = true;
        else {
            if (out.code) throw new Error(`parseHotkey: two keys in "${spec}"`);
            if (/^[a-z]$/.test(p)) out.code = `Key${p.toUpperCase()}`;
            else if (/^[0-9]$/.test(p)) out.code = `Digit${p}`;
            else if (p === 'space') out.code = 'Space';
            else out.code = raw;
        }
    }
    if (!out.code) throw new Error(`parseHotkey: no key in "${spec}"`);
    return out;
}

function matchesHotkey(e, hk) {
    return e.code === hk.code && e.ctrlKey === hk.ctrl && e.altKey === hk.alt
        && e.shiftKey === hk.shift && e.metaKey === hk.meta;
}

/** Whether a keyup ends the hold: the key itself, or one of the modifiers it needs. */
function releasesHotkey(e, hk) {
    if (e.code === hk.code) return true;
    return Object.entries(MODIFIER_KEYS).some(([m, key]) => hk[m] && e.key === key);
}

const swallow = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };

/**
 * @param {object}   opts
 * @param {Function} opts.transcribe        `(blob, { mimeType, durationMs, signal })` → text, or `{ text }`
 * @param {string|null} [opts.hotkey]       held to record; `null` for none (mic button only). Default `'Ctrl+Space'`
 * @param {Window}   [opts.window]          the window to listen on (default the global one)
 * @param {object}   [opts.mediaDevices]    default `navigator.mediaDevices`
 * @param {Function} [opts.MediaRecorder]   default the window's
 * @param {Function} [opts.AudioContext]    for the level meter; without one the meter stays at 0
 * @param {string}   [opts.mimeType]        recording format; default the first the recorder supports
 * @param {number}   [opts.minHoldMs]       shorter holds are discarded (250)
 * @param {number}   [opts.keepMicMs]       keep the microphone open this long after a recording (30000; `Infinity`, or 0)
 * @param {object}   [opts.eventBus]        notifications go out as `toast:show` on it; default the toast helpers' bus
 * @param {Function} [opts.onStateChange]   `(state)` — idle, starting, recording, transcribing
 * @param {Function} [opts.onTranscript]    `(text, target, inserted)` after each transcription
 * @param {Function} [opts.onError]         `(code, error)` for every problem reported
 * @param {object}   [opts.labels]          replaces any of the texts
 */
export function attachDictation({
    transcribe,
    hotkey = 'Ctrl+Space',
    window: win = globalThis.window,
    mediaDevices = win?.navigator?.mediaDevices,
    MediaRecorder: Recorder = win?.MediaRecorder,
    AudioContext: AudioCtx = win?.AudioContext ?? win?.webkitAudioContext,
    mimeType = null,
    minHoldMs = DICTATION_MIN_HOLD_MS,
    keepMicMs = DICTATION_KEEP_MIC_MS,
    eventBus = null,
    onStateChange = null,
    onTranscript = null,
    onError = null,
    labels = {},
} = {}) {
    if (typeof transcribe !== 'function') throw new TypeError('attachDictation: transcribe(blob) is required');
    const hk = hotkey ? parseHotkey(hotkey) : null;
    const text = { ...DEFAULT_LABELS, ...labels };
    const hotkeyLabel = hotkey ? String(hotkey) : '';

    let state = 'idle';
    let destroyed = false;
    let stream = null;
    let streamPromise = null;
    let releaseTimer = null;
    let audio = null;              // { ctx, analyser, buf } for the level meter
    let level = 0;
    let rafId = null;
    let session = null;            // the recording in progress
    let lastStartLatencyMs = null;
    let lastFocused = null;
    const pending = new Set();     // AbortControllers of transcriptions in flight
    const buttons = new Set();
    const observed = new Map();    // window -> detach()

    // ── notifications ──────────────────────────────────────────────────────
    function report(code, severity, message, error = null) {
        try { onError?.(code, error); } catch { /* the embedder's */ }
        const bus = eventBus ?? getToastBus();
        const payload = { title: text.title, message, severity, persistent: severity === 'error', durationMs: severity === 'error' ? 0 : 6000 };
        if (bus) bus.emit('toast:show', payload);
        // eslint-disable-next-line no-console
        else console.warn(`[dictation] ${message}`);
    }

    function setState(next) {
        if (state === next) return;
        state = next;
        paintButtons();
        try { onStateChange?.(next); } catch { /* the embedder's */ }
    }

    /** The state once a recording or transcription ended: another one may still be running. */
    function idleState() {
        if (session) setState(session.state);
        else setState(pending.size ? 'transcribing' : 'idle');
    }

    // ── the microphone ─────────────────────────────────────────────────────
    function unavailable() {
        if (win && win.isSecureContext === false) {
            return ['insecure-origin', fill(text.insecure, { origin: win.location?.origin ?? '' })];
        }
        if (typeof mediaDevices?.getUserMedia !== 'function' || typeof Recorder !== 'function') {
            return ['unsupported', text.unsupported];
        }
        return null;
    }

    function openMic() {
        if (stream) return Promise.resolve(stream);
        if (streamPromise) return streamPromise;
        // Called synchronously, inside the key or click handler: no tick is lost,
        // and the browser sees the user's gesture when it asks for permission.
        let asked;
        try { asked = Promise.resolve(mediaDevices.getUserMedia({ audio: true })); } catch (err) { asked = Promise.reject(err); }
        streamPromise = asked
            .then((s) => {
                streamPromise = null;
                if (destroyed) { s.getTracks?.().forEach((t) => t.stop()); throw Object.assign(new Error('destroyed'), { name: 'AbortError' }); }
                stream = s;
                s.getTracks?.().forEach((t) => t.addEventListener?.('ended', () => { if (stream === s) closeMic(); }));
                setupMeter(s);
                return s;
            }, (err) => { streamPromise = null; throw err; });
        return streamPromise;
    }

    function micError(err) {
        const name = err?.name;
        if (name === 'AbortError' && destroyed) return;
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') report('permission-denied', 'warn', text.denied, err);
        else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') report('no-microphone', 'warn', text.noMic, err);
        else report('microphone-busy', 'warn', text.busyMic, err);
    }

    function closeMic() {
        clearTimeout(releaseTimer);
        releaseTimer = null;
        stopMeterLoop();
        stream?.getTracks?.().forEach((t) => t.stop());
        stream = null;
        try { audio?.ctx.close?.(); } catch { /* already closed */ }
        audio = null;
    }

    function scheduleRelease() {
        clearTimeout(releaseTimer);
        releaseTimer = null;
        if (session || !stream || keepMicMs === Infinity) return;
        if (keepMicMs <= 0) { closeMic(); return; }
        releaseTimer = setTimeout(() => { if (!session) closeMic(); }, keepMicMs);
    }

    // ── the level meter ────────────────────────────────────────────────────
    function setupMeter(s) {
        if (typeof AudioCtx !== 'function') return;
        try {
            const ctx = new AudioCtx();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            ctx.createMediaStreamSource(s).connect(analyser);
            audio = { ctx, analyser, buf: new Uint8Array(analyser.fftSize) };
        } catch { audio = null; }
    }

    function sampleLevel() {
        if (!audio) return 0;
        audio.analyser.getByteTimeDomainData(audio.buf);
        let sum = 0;
        for (const v of audio.buf) { const x = (v - 128) / 128; sum += x * x; }
        // Speech sits around an RMS of 0.05–0.3; stretch it so the meter moves.
        return Math.min(1, Math.sqrt(sum / audio.buf.length) * 4);
    }

    function meterFrame() {
        rafId = null;
        if (!session || session.state !== 'recording') return;
        level = sampleLevel();
        paintLevel();
        rafId = (win?.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(meterFrame);
    }

    function stopMeterLoop() {
        if (rafId !== null) (win?.cancelAnimationFrame ?? clearTimeout)(rafId);
        rafId = null;
        level = 0;
        paintLevel();
    }

    // ── recording ──────────────────────────────────────────────────────────
    function pickType() {
        if (mimeType) return mimeType;
        if (typeof Recorder.isTypeSupported !== 'function') return '';
        return PREFERRED_TYPES.find((t) => { try { return Recorder.isTypeSupported(t); } catch { return false; } }) ?? '';
    }

    /** Start the recorder for session `sess` on the open stream, synchronously: on a warm microphone this runs inside the keydown. */
    function beginRecording(sess, s) {
        const type = pickType();
        let rec;
        try { rec = new Recorder(s, type ? { mimeType: type } : undefined); } catch (err) { micError(err); return false; }
        sess.rec = rec;
        sess.chunks = [];
        sess.type = rec.mimeType || type;
        rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size !== 0) sess.chunks.push(e.data); });
        try { rec.start(); } catch (err) { micError(err); return false; }
        sess.state = 'recording';
        sess.startedAt = now();
        lastStartLatencyMs = sess.startedAt - sess.pressedAt;
        clearTimeout(releaseTimer);
        audio?.ctx.resume?.()?.catch?.(() => {});
        setState('recording');
        if (rafId === null) meterFrame();
        return true;
    }

    const now = () => (win?.performance ?? globalThis.performance).now();

    /**
     * The element to type into when none is given: the focused one. For the
     * button (and `start()`), whose own focus is not a field, else the last
     * element that took dictation; a hotkey held over nothing types nowhere.
     */
    function focusedTarget(from, mode) {
        const el = from ?? deepActiveElement(win?.document);
        if (el && acceptsDictation(el)) return el;
        return mode !== 'hold' && lastFocused?.isConnected ? lastFocused : null;
    }

    function saveRange(target) {
        if (dictationKind(target) !== 'editable') return null;
        const sel = target.ownerDocument.getSelection?.();
        return sel && sel.rangeCount && target.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0).cloneRange() : null;
    }

    /**
     * Start recording. `target` (an element, or a function returning one)
     * fixes where the text goes; by default the focused element. `mode`
     * `'hold'` is the hotkey's; `'toggle'` the button's.
     */
    function start({ target = null, mode = 'toggle', from = null } = {}) {
        if (destroyed || session) return false;
        const why = unavailable();
        if (why) { report(why[0], 'warn', why[1]); return false; }
        const resolved = (typeof target === 'function' ? target() : target) ?? focusedTarget(from, mode);
        session = { mode, state: 'starting', pressedAt: now(), target: resolved, savedRange: resolved ? saveRange(resolved) : null, stopRequested: false, cancelled: false };
        const mine = session;
        if (stream) {
            if (!beginRecording(mine, stream)) { session = null; idleState(); scheduleRelease(); }
            return true;
        }
        setState('starting');
        openMic().then((s) => {
            if (session !== mine) { scheduleRelease(); return; }
            if (mine.cancelled) { session = null; idleState(); scheduleRelease(); return; }
            if (mine.stopRequested) {
                session = null;
                idleState();
                report('not-ready', 'info', text.notReady);
                scheduleRelease();
                return;
            }
            if (!beginRecording(mine, s)) { session = null; idleState(); scheduleRelease(); }
        }, (err) => {
            if (session === mine) session = null;
            idleState();
            micError(err);
        });
        return true;
    }

    /** Stop recording and transcribe. A hold shorter than `minHoldMs` is discarded. */
    function stop() {
        const s = session;
        if (!s) return;
        if (s.state === 'starting') { s.stopRequested = true; return; }
        session = null;
        stopMeterLoop();
        const heldMs = now() - s.startedAt;
        const finished = new Promise((resolve) => {
            s.rec.addEventListener('stop', resolve, { once: true });
            s.rec.addEventListener('error', resolve, { once: true });
        });
        try { s.rec.stop(); } catch { /* already inactive */ }
        scheduleRelease();
        if (s.cancelled || heldMs < minHoldMs) { idleState(); return; }
        const ac = new AbortController();
        pending.add(ac);
        setState('transcribing');
        finished.then(async () => {
            const blob = new Blob(s.chunks, s.type ? { type: s.type } : undefined);
            let raw;
            try {
                raw = await transcribe(blob, { mimeType: s.type, durationMs: heldMs, signal: ac.signal });
            } catch (err) {
                if (!ac.signal.aborted) report('transcribe-failed', 'error', fill(text.failed, { message: err?.message ?? String(err) }), err);
                return;
            }
            if (ac.signal.aborted) return;
            const said = sanitizeDictatedText(typeof raw === 'object' && raw !== null ? raw.text : raw);
            if (!said) { report('nothing-heard', 'info', text.nothing); return; }
            let inserted = false;
            try {
                inserted = s.target ? await insertDictatedText(s.target, said, { savedRange: s.savedRange }) : false;
            } catch (err) { inserted = false; void err; }
            if (!inserted) {
                if (s.target) report('declined', 'warn', fill(text.declined, { text: said }));
                else report('no-target', 'info', fill(text.noTarget, { text: said }));
            }
            try { onTranscript?.(said, s.target, inserted); } catch { /* the embedder's */ }
        }).finally(() => {
            pending.delete(ac);
            if (!destroyed) idleState();
        });
    }

    /** Discard the recording in progress, or (when none) the transcriptions in flight. */
    function cancel() {
        const s = session;
        if (s) {
            s.cancelled = true;
            if (s.state === 'recording') stop();
            else { session = null; idleState(); }
            return;
        }
        for (const ac of pending) ac.abort();
        pending.clear();
        idleState();
    }

    function toggle(opts = {}) {
        if (session) {
            if (session.state === 'starting') cancel();
            else stop();
        } else start({ ...opts, mode: 'toggle' });
    }

    /** Open the microphone now (asks permission), so the first press records at once. */
    async function prepare() {
        const why = unavailable();
        if (why) { report(why[0], 'warn', why[1]); return false; }
        try { await openMic(); } catch (err) { micError(err); return false; }
        scheduleRelease();
        return true;
    }

    // ── the hotkey and focus tracking ──────────────────────────────────────
    function observe(w) {
        if (!w || observed.has(w)) return () => {};
        const onKeyDown = (e) => {
            if (session && e.key === 'Escape' && !e.defaultPrevented) { swallow(e); cancel(); return; }
            if (!hk || e.isComposing) return;
            if (session?.mode === 'hold' && (e.code === hk.code)) { swallow(e); return; }   // auto-repeat
            if (!matchesHotkey(e, hk)) return;
            swallow(e);
            if (e.repeat || session) return;
            start({ mode: 'hold', from: e.composedPath?.()[0] ?? e.target });
        };
        const onKeyUp = (e) => {
            if (!hk || session?.mode !== 'hold') return;
            if (!releasesHotkey(e, hk)) return;
            if (e.code === hk.code) swallow(e);
            stop();
        };
        const onBlur = (e) => { if (e.target === w && session?.mode === 'hold') stop(); };
        const onFocusIn = (e) => {
            const el = e.composedPath?.()[0] ?? e.target;
            if (el && !el.closest?.('.twm-dictation-mic') && acceptsDictation(el)) lastFocused = el;
        };
        w.addEventListener('keydown', onKeyDown, true);
        w.addEventListener('keyup', onKeyUp, true);
        w.addEventListener('blur', onBlur);
        w.addEventListener('focusin', onFocusIn, true);
        const detach = () => {
            w.removeEventListener('keydown', onKeyDown, true);
            w.removeEventListener('keyup', onKeyUp, true);
            w.removeEventListener('blur', onBlur);
            w.removeEventListener('focusin', onFocusIn, true);
            observed.delete(w);
        };
        observed.set(w, detach);
        return detach;
    }

    if (win) observe(win);

    // ── the mic button ─────────────────────────────────────────────────────
    function paintButton(entry) {
        const { el } = entry;
        const recording = state === 'recording' || state === 'starting';
        el.classList.toggle('twm-dictation-mic--recording', recording);
        el.classList.toggle('twm-dictation-mic--busy', state === 'transcribing');
        el.setAttribute('aria-pressed', recording ? 'true' : 'false');
        const idle = hotkeyLabel ? fill(text.start, { hotkey: hotkeyLabel }) : text.startNoHotkey;
        el.title = recording ? text.stop : state === 'transcribing' ? text.busy : idle;
        el.setAttribute('aria-label', el.title);
        el.disabled = destroyed;
    }

    function paintButtons() {
        for (const entry of buttons) {
            // A button that was in the document and has left it is forgotten.
            if (entry.el.isConnected) entry.placed = true;
            else if (entry.placed) { buttons.delete(entry); continue; }
            paintButton(entry);
        }
        paintLevel();
    }

    function paintLevel() {
        for (const { el } of buttons) el.style.setProperty('--twm-dictation-level', level.toFixed(3));
    }

    /**
     * A button that toggles recording and shows a level meter while it
     * listens. `target` (an element, or a function returning one) sends its
     * text to one place — a tile's terminal — instead of the last focused
     * field. Pressing it does not take focus from the field.
     */
    function createMicButton({ target = null, className = '' } = {}) {
        const doc = win.document;
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = `twm-dictation-mic${className ? ` ${className}` : ''}`;
        const icon = doc.createElement('span');
        icon.className = 'material-symbols-outlined twm-dictation-mic__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'mic';
        const meter = doc.createElement('span');
        meter.className = 'twm-dictation-mic__meter';
        meter.setAttribute('aria-hidden', 'true');
        const bar = doc.createElement('span');
        bar.className = 'twm-dictation-mic__level';
        meter.append(bar);
        el.append(icon, meter);
        el.addEventListener('mousedown', (e) => e.preventDefault());   // keep the field focused
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (destroyed) return;
            toggle({ target });
        });
        const entry = { el, placed: false };
        buttons.add(entry);
        paintButton(entry);
        paintLevel();
        return el;
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const detach of [...observed.values()]) detach();
        if (session) { session.cancelled = true; if (session.state === 'recording') { try { session.rec.stop(); } catch { /* inactive */ } } }
        session = null;
        for (const ac of pending) ac.abort();
        pending.clear();
        closeMic();
        state = 'idle';
        level = 0;
        for (const entry of buttons) paintButton(entry);
        paintLevel();
        buttons.clear();
    }

    return {
        start: (opts) => start({ ...opts, mode: 'toggle' }),
        stop,
        cancel,
        toggle,
        prepare,
        /** Close the microphone now (it reopens on the next press). */
        release: () => { if (!session) closeMic(); },
        observe,
        createMicButton,
        state: () => state,
        isRecording: () => state === 'recording',
        /** The input level, 0..1, while recording. */
        level: () => level,
        stats: () => ({ lastStartLatencyMs, micOpen: !!stream, pending: pending.size }),
        destroy,
    };
}
