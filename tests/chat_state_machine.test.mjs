/**
 * ══ THE CONVERSATION STATE MACHINE ═══════════════════════════════════════
 *
 *   §1  starts null, then idle; the happy path; canSend / isProcessing
 *   §2  calls in one tick are queued in order, none throws
 *   §3  cancel, error, reset; a refused transition is refused, not thrown
 *   §4  the guard: an empty message is refused
 *   §5  the bus events and onChange; the mode is opaque
 *   §6  newConversation and loadConversation go back to idle from anywhere
 *
 *     node tests/chat_state_machine.test.mjs
 */

const { ChatStateMachine, CHAT_STATES, CHAT_BUS_EVENTS, CHAT_TRANSITIONS } =
    await import('../src/ui/components/chat_state_machine.js');
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

console.log('§1 the happy path');
{
    const m = new ChatStateMachine();
    ok('null until it has entered idle', m.getState() === null);
    ok('cannot send yet', m.canSend() === false);
    await m.settled();
    await Promise.resolve();
    ok('idle', m.getState() === CHAT_STATES.IDLE);
    ok('can send', m.canSend() === true && m.isProcessing() === false);
    const sent = await m.sendMessage('hello', 'c1');
    ok('send transitions', sent.transitioned === true && m.getState() === CHAT_STATES.WAITING);
    ok('keeps the conversation id', m.conversationId === 'c1');
    ok('waiting is processing', m.isProcessing() === true && m.canSend() === false);
    await m.streamStart();
    ok('streaming', m.getState() === CHAT_STATES.STREAMING && m.isProcessing());
    await m.streamComplete({ text: 'hi' });
    ok('idle again', m.getState() === CHAT_STATES.IDLE);
}

console.log('§2 queued');
{
    const m = new ChatStateMachine();
    const results = await Promise.all([
        m.sendMessage('a'), m.streamStart(), m.streamStart(), m.streamComplete(),
        m.sendMessage('b'), m.cancel(),
    ]);
    ok('every call of one tick took its turn', results.map((r) => r.transitioned).join()
        === 'true,true,false,true,true,true', JSON.stringify(results));
    ok('and the last one holds', m.getState() === CHAT_STATES.IDLE);
    m.sendMessage('c');
    await m.settled();
    ok('settled waits for what was called', m.getState() === CHAT_STATES.WAITING);
}

console.log('§3 cancel, error, reset');
{
    const m = new ChatStateMachine();
    await m.sendMessage('a');
    await m.cancel();
    ok('cancel from waiting', m.getState() === CHAT_STATES.IDLE);
    await m.sendMessage('a');
    await m.streamStart();
    await m.cancel();
    ok('cancel from streaming', m.getState() === CHAT_STATES.IDLE);
    const refused = await m.cancel();
    ok('cancel in idle is refused', refused.transitioned === false && refused.reason === 'missing-transition');

    await m.sendMessage('a');
    await m.error('boom', 'why');
    ok('error', m.getState() === CHAT_STATES.ERROR && m.lastError === 'boom');
    ok('an error can send', m.canSend() === true);
    await m.sendMessage('again');
    ok('send from error clears it', m.getState() === CHAT_STATES.WAITING && m.lastError === null);
    await m.error('boom');
    await m.reset();
    ok('reset from error', m.getState() === CHAT_STATES.IDLE && m.lastError === null);
    await m.sendMessage('a');
    await m.reset();
    ok('reset in flight', m.getState() === CHAT_STATES.IDLE);
    ok('the transitions are named', CHAT_TRANSITIONS.SEND === 'chat:message:send');
}

console.log('§4 the guard');
{
    const m = new ChatStateMachine();
    const r = await m.sendMessage('');
    ok('an empty message is refused', r.transitioned === false && r.reason === 'guard-blocked');
    ok('and nothing moved', m.getState() === CHAT_STATES.IDLE);
}

console.log('§5 observers and the mode');
{
    const bus = new EventBus();
    const heard = [];
    for (const name of Object.values(CHAT_BUS_EVENTS)) bus.on(name, (p) => heard.push([name, p]));
    const changes = [];
    const m = new ChatStateMachine({ eventBus: bus, mode: 'one', onChange: (c) => changes.push(c.state) });
    await m.settled();
    await Promise.resolve();
    await m.sendMessage('hi', 'c9');
    await m.streamStart();
    await m.streamComplete({ text: 'yes', meta: { a: 1 } });
    await m.sendMessage('hi');
    await m.error('bad', 'detail');
    m.setMode('two');
    const payload = (name) => heard.find(([n]) => n === name)?.[1];
    ok('onChange hears every state', changes.join() === 'idle,waiting,streaming,idle,waiting,error', changes.join());
    ok('message sent', payload(CHAT_BUS_EVENTS.MESSAGE_SENT)?.text === 'hi'
        && payload(CHAT_BUS_EVENTS.MESSAGE_SENT)?.mode === 'one'
        && payload(CHAT_BUS_EVENTS.MESSAGE_SENT)?.conversationId === 'c9');
    ok('stream complete carries the payload', payload(CHAT_BUS_EVENTS.STREAM_COMPLETE)?.meta?.a === 1
        && payload(CHAT_BUS_EVENTS.STREAM_COMPLETE)?.conversationId === 'c9');
    ok('error', payload(CHAT_BUS_EVENTS.ERROR)?.message === 'bad' && payload(CHAT_BUS_EVENTS.ERROR)?.detail === 'detail');
    ok('state changed', payload(CHAT_BUS_EVENTS.STATE_CHANGED)?.state === 'idle');
    ok('mode', m.mode === 'two' && payload(CHAT_BUS_EVENTS.MODE_CHANGED)?.mode === 'two');
}

console.log('§6 another conversation');
{
    const bus = new EventBus();
    const heard = [];
    bus.on(CHAT_BUS_EVENTS.CONVERSATION_NEW, () => heard.push('new'));
    bus.on(CHAT_BUS_EVENTS.CONVERSATION_LOADED, (p) => heard.push(p.conversationId));
    const m = new ChatStateMachine({ eventBus: bus });
    await m.sendMessage('a', 'c1');
    await m.streamStart();
    await m.loadConversation('c2');
    ok('load goes back to idle', m.getState() === CHAT_STATES.IDLE && m.conversationId === 'c2');
    await m.sendMessage('a');
    await m.newConversation();
    ok('new goes back to idle', m.getState() === CHAT_STATES.IDLE && m.conversationId === null);
    ok('both are heard, in order', heard.join() === 'c2,new', heard.join());
}

if (failed) {
    console.error(`chat state machine: ${failed} FAILED`);
    process.exit(1);
}
console.log('chat state machine: all passed');
