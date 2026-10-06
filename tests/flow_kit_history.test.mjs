/**
 * FLOW HISTORY — undo over whole snapshots, behind the EDITOR'S closed list
 * (36 §3.9). Ported from Tables' designer history suite, the action list now
 * passed in.
 *
 *   §1  the list is the editor's and it is closed: no list is refused, an
 *       action nobody named throws, and "load" and "publish" are not actions
 *       — opening and publishing are baselines
 *   §2  undo and redo walk the snapshots in order; an edit after an undo
 *       empties redo
 *   §3  keyed commits merge within the window — never across an undo — and
 *       typed-then-typed-away is no entry
 *   §4  the limit drops the oldest
 *   §5  a restore cannot record itself; an unchanged state is no entry
 *   §6  keep/adopt only onto a byte-identical state
 *
 * Pure: no jsdom.   node tests/flow_kit_history.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { FlowHistory } from '../src/flow/kit/history.js';

const t = assertions('flow kit — history');
const ACTIONS = Object.freeze(['flow:step:add', 'flow:step:remove', 'flow:step:label', 'flow:step:config',
                               'flow:step:move', 'flow:settings']);
const raises = (fn) => { try { fn(); return false; } catch { return true; } };

function harness(opts = {}) {
    const doc = { state: 'A', restores: [] };
    let clock = 0;
    const h = new FlowHistory({
        actions: ACTIONS,
        restore: (s) => { doc.state = s; doc.restores.push(s); opts.inRestore?.(h, s); },
        now: () => clock,
        ...opts.extra,
    });
    h.baseline(doc.state);
    const edit = (s, action = 'flow:step:add', key = null) => { doc.state = s; return h.commit(s, action, key); };
    return { h, doc, edit, tick: (ms) => { clock += ms; } };
}

t.section('§1 the editor\'s closed list');
t.ok('no list is refused', raises(() => new FlowHistory({ restore: () => {} })));
t.ok('an empty list is refused', raises(() => new FlowHistory({ actions: [], restore: () => {} })));
t.ok('no restore is refused', raises(() => new FlowHistory({ actions: ACTIONS })));
{
    const { h } = harness();
    t.throws('an action nobody named throws, naming it', () => h.commit('B', 'flow:step:paint'), /flow:step:paint/);
    t.ok('opening is not an action', raises(() => h.commit('B', 'flow:load')));
    t.ok('publishing is not an action', raises(() => h.commit('B', 'flow:publish')));
    t.ok('after a baseline nothing to undo or redo', !h.canUndo && !h.canRedo && h.depth === 0);
    t.check('the list is the one passed in, frozen', [h.actions.length, Object.isFrozen(h.actions)], [6, true]);
}

t.section('§2 undo and redo walk the snapshots');
{
    const { h, doc, edit } = harness();
    edit('B');
    edit('C', 'flow:step:remove');
    t.ok('two entries', h.depth === 2 && h.canUndo && !h.canRedo);
    t.check('the next undo undoes a removal', h.undoAction, 'flow:step:remove');
    h.undo();
    t.check('undo restores the state before the last edit', doc.state, 'B');
    h.undo();
    t.ok('and then the one before that', doc.state === 'A' && !h.canUndo && h.canRedo);
    t.ok('undo with nothing left does nothing', h.undo() === false && doc.state === 'A');
    h.redo();
    t.check('redo replays the first edit', doc.state, 'B');
    h.redo();
    t.ok('then the second', doc.state === 'C' && !h.canRedo && h.depth === 2);
    h.undo();
    edit('D');
    t.ok('an edit after an undo empties redo', !h.canRedo && doc.state === 'D');
    h.undo();
    t.check('and undoing it goes back to B, not C', doc.state, 'B');
}

t.section('§3 keyed commits merge, within the window, never across an undo');
{
    const { h, doc, edit, tick } = harness();
    edit('Ax', 'flow:step:label', 'label:read');
    tick(300);
    edit('Axy', 'flow:step:label', 'label:read');
    tick(300);
    edit('Axyz', 'flow:step:label', 'label:read');
    t.check('three keystrokes are one entry', h.depth, 1);
    h.undo();
    t.check('which restores the text before the typing began', doc.state, 'A');
    h.redo();
    tick(2000);
    edit('Axyz!', 'flow:step:label', 'label:read');
    t.check('the first commit after a redo never merges', h.depth, 2);
    tick(2000);
    edit('Axyz!!', 'flow:step:label', 'label:read');
    t.check('the same key after the window does not merge', h.depth, 3);
    tick(100);
    edit('Axyz!!q', 'flow:step:config', 'config:read:limit');
    t.check('a different key does not merge', h.depth, 4);
    tick(100);
    edit('Axyz!!', 'flow:step:config', 'config:read:limit');
    t.check('typed and typed away again is no entry', h.depth, 3);
    edit('Z', 'flow:step:move');
    edit('Z2', 'flow:step:move');
    t.check('an unkeyed action never merges', h.depth, 5);
}
{
    const { h, doc, edit, tick } = harness();
    edit('B', 'flow:step:label', 'label:a');
    tick(10);
    edit('C', 'flow:step:label', 'label:b');
    tick(10);
    h.undo();
    tick(10);
    edit('B2', 'flow:step:label', 'label:a');
    t.check('the first commit after an undo never merges, even inside the window', h.depth, 2);
    h.undo();
    t.check('so undo returns to the state the undo left, not past it', doc.state, 'B');
}

t.section('§4 the limit drops the oldest');
{
    const doc = { state: '0' };
    const h = new FlowHistory({ actions: ACTIONS, restore: (s) => { doc.state = s; }, limit: 3 });
    h.baseline('0');
    for (const s of ['1', '2', '3', '4']) { doc.state = s; h.commit(s, 'flow:step:add'); }
    t.check('only the newest three are kept', h.depth, 3);
    h.undo(); h.undo(); h.undo();
    t.ok('and the oldest reachable state is 1', doc.state === '1' && !h.canUndo);
}

t.section('§5 a restore cannot record itself, and nothing changed is no entry');
{
    let nested = null;
    const { h, doc, edit } = harness({ inRestore: (hist, s) => { nested = hist.commit(`${s}!`, 'flow:step:add'); } });
    edit('B');
    h.undo();
    t.ok('the commit fired from inside restore was ignored', nested === false && h.depth === 0 && h.canRedo);
    t.check('and the document is the restored one', doc.state, 'A');
    const { h: h2 } = harness();
    t.ok('committing the settled state is a no-op', h2.commit('A', 'flow:step:add') === false && h2.depth === 0);
}

t.section('§6 keep and adopt');
{
    const { h, edit } = harness();
    edit('B');
    edit('C');
    h.undo();
    const kept = h.keep();
    const { h: next } = harness();
    t.ok('a successor that loaded a DIFFERENT state refuses the stacks', next.adopt(kept, 'C') === false && !next.canUndo);
    t.ok('one that loaded the same state takes them', next.adopt(kept, 'B') === true
         && next.canUndo && next.canRedo && next.depth === 1);
    t.ok('nothing kept is nothing adopted', next.adopt(undefined, 'B') === false);
    let states = 0;
    const counted = new FlowHistory({ actions: ACTIONS, restore: () => {}, onState: () => { states += 1; } });
    counted.baseline('x');
    counted.commit('y', 'flow:settings', 'settings:name');
    t.check('onState fires for a baseline and a commit', states, 2);
}

t.done();
