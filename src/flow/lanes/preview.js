/**
 * THE PREVIEW RUNNER — when the lane editor ASKS the consumer's providers, and
 * which answer it believes (36 §7.7). It is the one timer an editor starts,
 * and it only ever asks: a provider decides what a preview reads, how many
 * rows, as whom, and that it writes nothing.
 *
 *  - **Debounced.** `schedule()` (after a committed edit) waits `delayMs` —
 *    800 by default — from the LAST edit, then sends ONE request for the
 *    whole flow to each provider (`preview`, `describe`) it has.
 *  - **The newest answer wins.** Every request carries a sequence number and
 *    an `AbortSignal`. A newer edit aborts the request in flight, and an
 *    answer that is not the newest is DROPPED even when it arrives — a
 *    provider that ignores its signal and answers late changes nothing.
 *  - **A failure is the provider's sentence**, handed to `onError`; the last
 *    answer that was believed stays where it is.
 *
 * PURE apart from the timer, which can be injected (`clock`) so a test can
 * drive it.
 */

export function createPreviewRunner({ preview = null, describe = null, delayMs = 800, request,
                                      onAnswer = null, onError = null, onState = null, onDropped = null,
                                      clock = null } = {}) {
    const timers = {
        set: clock?.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
        clear: clock?.clearTimeout ?? ((h) => clearTimeout(h)),
    };
    const providers = [['preview', preview], ['describe', describe]].filter(([, fn]) => typeof fn === 'function');
    let timer = null;
    let seq = 0;
    let live = null;           // { seq, controller, pending: Set<kind> }
    let destroyed = false;

    const state = () => ({
        enabled: providers.length > 0,
        waiting: timer !== null,
        busy: Boolean(live && live.pending.size > 0),
        seq,
    });
    const told = () => onState?.(state());

    function send() {
        timer = null;
        if (destroyed) return;
        const mine = seq;
        const controller = new AbortController();
        const pending = new Set(providers.map(([kind]) => kind));
        live = { seq: mine, controller, pending };
        const input = { ...(request?.() ?? {}), signal: controller.signal, seq: mine };
        told();
        for (const [kind, fn] of providers) {
            let answer;
            try {
                answer = Promise.resolve(fn(input));
            } catch (err) {
                answer = Promise.reject(err);
            }
            const stale = () => destroyed || mine !== seq || controller.signal.aborted;
            answer.then((value) => {
                if (stale()) { onDropped?.({ kind, seq: mine }); return; }
                pending.delete(kind);
                onAnswer?.({ kind, answer: value, seq: mine });
                told();
            }, (error) => {
                if (stale()) { onDropped?.({ kind, seq: mine }); return; }
                pending.delete(kind);
                onError?.({ kind, error, seq: mine });
                told();
            });
        }
    }

    return {
        get enabled() { return providers.length > 0; },
        get seq() { return seq; },
        get state() { return state(); },
        /** An edit: everything asked before it is stale; ask again `delayMs` after the last one. */
        schedule({ immediate = false } = {}) {
            if (destroyed || !providers.length) return;
            seq += 1;
            if (live) {
                live.controller.abort();
                live = null;
            }
            if (timer !== null) timers.clear(timer);
            timer = timers.set(send, immediate ? 0 : delayMs);
            told();
        },
        /** Ask now, without waiting for the debounce. */
        now() {
            if (destroyed || !providers.length) return;
            seq += 1;
            if (live) {
                live.controller.abort();
                live = null;
            }
            if (timer !== null) timers.clear(timer);
            timer = null;
            send();
        },
        destroy() {
            destroyed = true;
            if (timer !== null) timers.clear(timer);
            timer = null;
            live?.controller.abort();
            live = null;
        },
    };
}
