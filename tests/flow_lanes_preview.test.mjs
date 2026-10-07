/**
 * THE PREVIEW RUNNER: DEBOUNCED, AND THE NEWEST ANSWER WINS (36 §7.7;
 * BRIEF-flows, definition of done 5).
 *
 *   §1  one edit asks once, delayMs after it — not before; a burst of edits
 *       asks ONCE, delayMs after the LAST
 *   §2  OUT OF ORDER: request A is slow, request B is fast; B's answer is
 *       drawn, and A's — arriving after it — is DROPPED, and A's signal was
 *       aborted the moment the newer edit came
 *   §3  an answer arriving after a newer edit, before that edit's request is
 *       even sent, is dropped too
 *   §4  a failure is reported with the provider's error; an aborted request's
 *       failure is not; destroy drops everything still in flight
 *   §5  the two providers are asked together, with the same seq and the same
 *       flow, and each answer is taken on its own
 *
 *     node tests/flow_lanes_preview.test.mjs        (plain node; no DOM)
 */
import { assertions } from './flow_env.mjs';
import { createPreviewRunner } from '../src/flow/lanes/preview.js';

const t = assertions('flow lanes — preview runner');

/** A clock a test moves by hand. */
function manualClock() {
    let now = 0;
    let next = 1;
    const timers = new Map();
    return {
        setTimeout(fn, ms) { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) {
            const until = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, x]) => x.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = until;
        },
        get pending() { return timers.size; },
    };
}

/** A provider whose every call waits until the test answers it. */
function heldProvider() {
    const calls = [];
    const fn = (input) => new Promise((resolve, reject) => calls.push({ input, resolve, reject }));
    return { fn, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

t.section('§1 debounced');
{
    const clock = manualClock();
    const p = heldProvider();
    let n = 0;
    const runner = createPreviewRunner({ preview: p.fn, delayMs: 800, clock, request: () => ({ n: ++n }) });
    runner.schedule();
    clock.advance(799);
    t.check('nothing is asked 799 ms after an edit', p.calls.length, 0);
    clock.advance(1);
    t.check('…and once at 800', p.calls.length, 1);
    runner.schedule();
    clock.advance(500);
    runner.schedule();
    clock.advance(500);
    runner.schedule();
    clock.advance(799);
    t.check('a burst of three edits 500 ms apart: still nothing 799 ms after the LAST', p.calls.length, 1);
    clock.advance(1);
    t.check('…then ONE request for the whole burst', p.calls.length, 2);
    t.check('it read the flow as it was when it was SENT', p.calls[1].input.n, 2);
    t.ok('it carries an AbortSignal', p.calls[1].input.signal && typeof p.calls[1].input.signal.aborted === 'boolean');
    t.check('immediate: asked on the next turn of the clock', (runner.schedule({ immediate: true }), clock.advance(0), p.calls.length), 3);
}

t.section('§2 out of order: the newest answer wins, the stale one is dropped');
{
    const clock = manualClock();
    const p = heldProvider();
    const drawn = [];
    const dropped = [];
    const runner = createPreviewRunner({ preview: p.fn, delayMs: 800, clock, request: () => ({}),
                                         onAnswer: ({ answer, seq }) => drawn.push([answer, seq]),
                                         onDropped: ({ seq }) => dropped.push(seq) });
    runner.schedule();
    clock.advance(800);
    const a = p.calls[0];
    t.check('request A is in flight', [p.calls.length, a.input.signal.aborted], [1, false]);
    runner.schedule();
    t.check('a newer edit ABORTS A at once', a.input.signal.aborted, true);
    clock.advance(800);
    const b = p.calls[1];
    b.resolve('B');
    await flush();
    t.check('B — the newest — answers first and is drawn', drawn, [['B', b.input.seq]]);
    a.resolve('A');
    await flush();
    t.check('A answers LATE, after B: it is DROPPED, and nothing it said is drawn', drawn, [['B', b.input.seq]]);
    t.check('…and the drop is reported', dropped, [a.input.seq]);
    t.ok('the sequence numbers increase', b.input.seq > a.input.seq);
}

t.section('§3 an answer overtaken by an edit that has not been sent yet');
{
    const clock = manualClock();
    const p = heldProvider();
    const drawn = [];
    const runner = createPreviewRunner({ preview: p.fn, delayMs: 800, clock, request: () => ({}),
                                         onAnswer: ({ answer }) => drawn.push(answer) });
    runner.schedule();
    clock.advance(800);
    runner.schedule();            // an edit: its request waits for the debounce
    p.calls[0].resolve('old');
    await flush();
    t.check('the old answer is not drawn, though no newer one has arrived', drawn, []);
    t.check('…and the state says a request is waiting', runner.state.waiting, true);
    clock.advance(800);
    p.calls[1].resolve('new');
    await flush();
    t.check('the newer answer is', drawn, ['new']);
}

t.section('§4 failures, aborts and destroy');
{
    const clock = manualClock();
    const p = heldProvider();
    const errors = [];
    const drawn = [];
    const runner = createPreviewRunner({ preview: p.fn, delayMs: 10, clock, request: () => ({}),
                                         onAnswer: ({ answer }) => drawn.push(answer),
                                         onError: ({ error }) => errors.push(error.message) });
    runner.schedule();
    clock.advance(10);
    p.calls[0].reject(new Error('The source could not be read: connection refused.'));
    await flush();
    t.check('a failure is reported with the provider\'s sentence', errors, ['The source could not be read: connection refused.']);
    runner.schedule();
    clock.advance(10);
    runner.schedule();
    p.calls[1].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await flush();
    t.check('the failure of a request a newer edit aborted is not reported', errors.length, 1);
    clock.advance(10);
    runner.destroy();
    p.calls[2].resolve('after destroy');
    await flush();
    t.check('destroyed: an answer still in flight is drawn nowhere', drawn, []);
    t.check('…and its signal was aborted', p.calls[2].input.signal.aborted, true);
    runner.schedule();
    t.check('a destroyed runner asks nothing more', clock.pending, 0);
    const none = createPreviewRunner({ request: () => ({}), clock });
    none.schedule();
    t.check('with no provider there is nothing to ask, and no timer', [none.enabled, clock.pending], [false, 0]);
}

t.section('§5 both providers, one request each');
{
    const clock = manualClock();
    const pv = heldProvider();
    const ds = heldProvider();
    const got = [];
    const runner = createPreviewRunner({ preview: pv.fn, describe: ds.fn, delayMs: 800, clock,
                                         request: () => ({ text: '{"nodes":[]}' }),
                                         onAnswer: ({ kind, answer }) => got.push([kind, answer]) });
    runner.schedule();
    clock.advance(800);
    t.check('each asked once, with the same seq and the same text',
            [pv.calls.length, ds.calls.length, pv.calls[0].input.seq === ds.calls[0].input.seq, ds.calls[0].input.text],
            [1, 1, true, '{"nodes":[]}']);
    ds.calls[0].resolve('columns');
    await flush();
    t.check('describe answers first and is taken on its own', got, [['describe', 'columns']]);
    t.check('…preview is still busy', runner.state.busy, true);
    pv.calls[0].resolve('rows');
    await flush();
    t.check('then preview', got, [['describe', 'columns'], ['preview', 'rows']]);
    t.check('nothing is busy', runner.state.busy, false);
}

t.done();
