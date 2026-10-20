/**
 * STORY-0088 — THE STAGED-EDIT UNDO RING ON ITS OWN (staged_history.js).
 *
 * Ported from the generic behaviour Tables' grid/staged_history.test.mjs
 * checks — written here against FlexDesk's own module, never imported from
 * Tables:
 *
 *   §1  the delta round-trips, and the ring holds no state of its own
 *   §2  `has`: absent and staged-as-null are different states
 *   §3  a group (a fill, a paste) is one undo, not N
 *   §4  a group replays reversed on the way back
 *   §5  groups nest
 *   §6  an empty group costs nothing
 *   §7  the limit is on entries (default 100), and a group is one
 *   §8  each entry is a before/after delta, not a snapshot
 *   §9  reset: a redo after a commit does nothing
 *   §10 the guards: unknown actions, the undo loop, no writer
 *   §11 the state a toolbar paints from
 *
 * No DOM.
 *
 *     node tests/staged_history.test.mjs
 */
import { ACTIONS, DEFAULT_HISTORY_LIMIT, StagedHistory } from '../widgets.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const ok = (name, cond) => check(name, !!cond, true);
const section = (t) => console.log(`\n${t}`);

/** A stand-in for the grid's staged cells: the ring writes through `apply`,
 *  the way DataTable's staged edits do. */
function ring({ limit } = {}) {
    const staged = new Map();
    const log = [];
    const published = [];
    const history = new StagedHistory({
        limit,
        apply: (entry, direction) => {
            log.push(`${direction}:${entry.row}:${entry.col}`);
            const target = direction === 'undo' ? entry.before : entry.after;
            const key = `${entry.row}:${entry.col}`;
            if (target.has) staged.set(key, target.value);
            else staged.delete(key);
        },
        onState: (state) => { published.push(state); },
    });
    const side = (key) => (staged.has(key) ? { has: true, value: staged.get(key) } : { has: false, value: null });
    const stage = (row, col, value) => {
        const key = `${row}:${col}`;
        const before = side(key);
        staged.set(key, value);
        history.record({ action: 'cell:stage', row, col, before, after: { has: true, value } });
    };
    const unstage = (row, col) => {
        const key = `${row}:${col}`;
        const before = side(key);
        staged.delete(key);
        history.record({ action: 'cell:stage', row, col, before, after: { has: false, value: null } });
    };
    return { history, staged, log, published, stage, unstage };
}

section('§1 the delta round-trips');
{
    const r = ring();
    r.stage(0, 0, 'a');
    r.stage(1, 2, 'b');
    check('two edits are two undo steps', r.history.depth, 2);
    check('both staged', [...r.staged.entries()], [['0:0', 'a'], ['1:2', 'b']]);
    ok('undo reports that it moved', r.history.undo() === true);
    check('the last edit is gone', [...r.staged.entries()], [['0:0', 'a']]);
    ok('the first is still there to undo', r.history.canUndo);
    r.history.undo();
    check('undoing both leaves nothing staged', [...r.staged.entries()], []);
    ok('nothing left to undo', !r.history.canUndo);
    ok('undo on an empty stack says so rather than throwing', r.history.undo() === false);
    r.history.redo();
    r.history.redo();
    check('redo replays them in the order they happened', [...r.staged.entries()], [['0:0', 'a'], ['1:2', 'b']]);
    ok('nothing left to redo', !r.history.canRedo);
    ok('redo on an empty stack says so', r.history.redo() === false);
}

section('§2 absent and staged-as-null are different states');
{
    const r = ring();
    r.stage(3, 1, 'typed');
    r.unstage(3, 1);
    check('the cell is absent, not staged as null', r.staged.has('3:1'), false);
    r.history.undo();
    check('undo restores it as STAGED, with its value', r.staged.get('3:1'), 'typed');
    r.history.redo();
    check('redo makes it ABSENT again, not null', r.staged.has('3:1'), false);

    r.stage(4, 0, null);
    ok('a cell staged as null holds a key with null', r.staged.has('4:0') && r.staged.get('4:0') === null);
    r.history.undo();
    check('undoing it removes the key: no change, not a staged null', r.staged.has('4:0'), false);
    r.history.redo();
    ok('redoing it puts back a key whose value is null', r.staged.has('4:0') && r.staged.get('4:0') === null);
}

section('§3 a group is one undo');
{
    const r = ring();
    r.history.beginGroup('fill');
    for (let row = 1; row <= 10; row++) r.stage(row, 0, `v${row}`);
    r.history.endGroup();
    check('ten staged cells', r.staged.size, 10);
    check('one undo step', r.history.depth, 1);
    r.history.undo();
    check('one undo takes all ten back', r.staged.size, 0);
    r.history.redo();
    check('one redo puts all ten back', r.staged.size, 10);
    r.history.beginGroup('one');
    r.stage(20, 0, 'x');
    r.history.endGroup();
    const top = r.history.undoStack.at(-1);
    check('a group of one is that entry, not a batch around it', top.action, 'cell:stage');
}

section('§4 a group replays reversed on the way back');
{
    const r = ring();
    r.stage(0, 0, 'original');
    r.history.beginGroup('paste');
    r.stage(0, 0, 'first');
    r.stage(0, 0, 'second');
    r.stage(1, 0, 'other');
    r.history.endGroup();
    check('the cell holds the last write', r.staged.get('0:0'), 'second');
    r.log.length = 0;
    r.history.undo();
    check('the group unwinds last first', r.log, ['undo:1:0', 'undo:0:0', 'undo:0:0']);
    check('…landing on the value the group started from', r.staged.get('0:0'), 'original');
    r.log.length = 0;
    r.history.redo();
    check('redo replays forwards', r.log, ['redo:0:0', 'redo:0:0', 'redo:1:0']);
    check('…to the last write', r.staged.get('0:0'), 'second');
}

section('§5 groups nest');
{
    const r = ring();
    r.history.beginGroup('paste');
    r.stage(0, 0, 'a');
    r.history.beginGroup('inner');
    r.stage(1, 0, 'b');
    r.history.endGroup();
    r.stage(2, 0, 'c');
    check('the inner group does not close the outer one', r.history.depth, 0);
    r.history.endGroup();
    check('closing the outer one pushes exactly one step', r.history.depth, 1);
    r.history.undo();
    check('one undo takes back everything inside both', r.staged.size, 0);

    // A group left open by a caller that threw is closed by the next undo.
    r.history.redo();
    r.history.beginGroup('left open');
    r.stage(5, 5, 'x');
    ok('an undo with a group open still works', r.history.undo());
    check('…and took back the open group first', r.staged.has('5:5'), false);
}

section('§6 an empty group costs nothing');
{
    const r = ring();
    r.history.beginGroup('a fill that wrote nothing');
    r.history.endGroup();
    check('no undo step', r.history.depth, 0);
    ok('Ctrl+Z is not a keystroke that appears to do nothing', !r.history.canUndo);
    r.history.endGroup();
    check('an endGroup with none open is harmless', r.history.depth, 0);
}

section('§7 the limit is on entries');
{
    check('the default limit is 100', DEFAULT_HISTORY_LIMIT, 100);
    const d = ring();
    check('…and a ring built without one keeps 100', d.history.limit, 100);
    for (let i = 0; i < 130; i++) d.stage(i, 0, `v${i}`);
    check('130 edits keep the last 100', d.history.depth, 100);
    check('…the oldest kept is edit 30', d.history.undoStack[0].row, 30);

    const r = ring({ limit: 3 });
    for (let i = 0; i < 5; i++) r.stage(i, 0, `v${i}`);
    check('the ring keeps its limit and no more', r.history.depth, 3);
    r.history.undo(); r.history.undo(); r.history.undo();
    ok('the oldest two fell off and cannot be undone', !r.history.canUndo);
    check('so the two edits past the limit are still staged', [...r.staged.keys()], ['0:0', '1:0']);

    const g = ring({ limit: 2 });
    g.history.beginGroup('paste');
    for (let i = 0; i < 500; i++) g.stage(i, 1, i);
    g.history.endGroup();
    g.stage(0, 0, 'a');
    check('a 500-cell group is one entry against the limit', g.history.depth, 2);
}

section('§8 an entry is a delta, not a snapshot');
{
    const r = ring();
    for (let i = 0; i < 50; i++) r.stage(i, 0, `v${i}`);
    r.stage(99, 3, 'last');
    const top = r.history.undoStack.at(-1);
    check('the newest entry names one cell and its two sides, nothing more',
          Object.keys(top).sort(), ['action', 'after', 'before', 'col', 'row']);
    check('…before and after are that cell\'s alone', [top.before, top.after],
          [{ has: false, value: null }, { has: true, value: 'last' }]);
    ok('no entry holds a copy of the staged set',
       r.history.undoStack.every((e) => !(e.before instanceof Map) && !(e.after instanceof Map)
           && JSON.stringify(e).length < 200));
    const g = ring();
    g.history.beginGroup('paste');
    for (let i = 0; i < 1000; i++) g.stage(i, 0, i);
    g.history.endGroup();
    check('a 1,000-cell paste holds 1,000 deltas, once', g.history.undoStack[0].entries.length, 1000);
}

section('§9 reset: a redo after a commit does nothing');
{
    const r = ring();
    r.stage(0, 0, 'a');
    r.history.undo();
    ok('something to redo before the commit', r.history.canRedo);
    r.staged.clear();
    r.history.reset();
    ok('nothing to redo after it', !r.history.canRedo);
    ok('nor anything to undo', !r.history.canUndo);
    check('so a redo does nothing', r.history.redo(), false);
    check('and nothing was written back', r.staged.size, 0);
    r.history.beginGroup('interrupted');
    r.history.reset();
    r.stage(1, 1, 'after');
    check('a reset closes an open group rather than leaving it to swallow what follows', r.history.depth, 1);
}

section('§10 the guards');
{
    const r = ring();
    let threw = null;
    try { r.history.record({ action: 'rows:delete', id: 'r1' }); } catch (err) { threw = err.message; }
    ok('an action the ring does not know is refused', !!threw);
    check('the one action that exists', [...ACTIONS], ['cell:stage']);
    let threwNull = null;
    try { r.history.record(null); } catch (err) { threwNull = err.message; }
    ok('…and so is no entry at all', !!threwNull);

    const looped = new StagedHistory({
        apply: (entry, direction) => {
            looped.record({ action: 'cell:stage', row: 9, col: 9,
                            before: { has: false, value: null }, after: { has: true, value: direction } });
        },
    });
    looped.record({ action: 'cell:stage', row: 0, col: 0,
                    before: { has: false, value: null }, after: { has: true, value: 'x' } });
    looped.undo();
    check('a record raised from inside apply is ignored, so undo cannot feed itself', looped.depth, 0);
    check('…and the redo it produced is the one entry', looped.canRedo, true);

    let noWriter = null;
    try { new StagedHistory({}); } catch (err) { noWriter = err.message; }
    ok('a ring with no writer fails at construction', !!noWriter);
}

section('§11 the state a toolbar paints from');
{
    const r = ring();
    r.published.length = 0;
    r.stage(0, 0, 'a');
    check('recording publishes', r.published.at(-1), { canUndo: true, canRedo: false, depth: 1 });
    r.history.undo();
    check('undoing publishes', r.published.at(-1), { canUndo: false, canRedo: true, depth: 0 });
    r.history.redo();
    check('redoing publishes', r.published.at(-1), { canUndo: true, canRedo: false, depth: 1 });
    r.history.undo();
    r.stage(5, 5, 'new branch');
    check('a new edit after an undo drops the redo branch', r.published.at(-1),
          { canUndo: true, canRedo: false, depth: 1 });
    r.history.reset();
    check('a reset publishes', r.published.at(-1), { canUndo: false, canRedo: false, depth: 0 });
}

if (failures) {
    console.error(`\nstaged history: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
