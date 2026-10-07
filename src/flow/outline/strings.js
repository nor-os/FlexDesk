/**
 * EVERY WORD THE OUTLINE EDITOR DRAWS, over the kit's (36 §3.13, §6).
 *
 * English, and naming no domain. What a consumer calls a block's parts — what
 * an error port means, what a loop's foot says, what the flow row is called —
 * comes from the BLOCK MAPPING (`mapping.js`), and the consumer's `strings`
 * are laid over these:
 *
 *     const S = createStrings(OUTLINE_STRINGS, options.strings);
 *
 * Names are quoted ‘like this’ in a sentence. A function string takes the
 * names it quotes, already resolved to what the reader sees (a step's label,
 * else its type's label, else its id).
 */

const plural = (n, one, many) => (n === 1 ? one : many.replace('{n}', String(n)));

export const OUTLINE_STRINGS = Object.freeze({
    // ── why a flow cannot be drawn as an outline (36 §6.3) ──────────────
    outline_no_start: 'This flow has no Start step.',
    outline_two_starts: 'This flow has two Start steps.',
    outline_unknown_type: (type) => `‘${type}’ is a step type this editor does not know, so the flow cannot be `
        + 'drawn as an outline.',
    outline_unreachable: (x) => `Nothing leads to ‘${x}’ from Start.`,
    outline_shared_step: (x) => `‘${x}’ is reached from two places that are not one block.`,
    outline_jump_out: (x, y) => `A line from ‘${x}’ leaves its block for ‘${y}’.`,
    outline_two_continuations: (x) => `‘${x}’ continues to two steps; a Parallel step runs branches side by side.`,
    outline_parallel_unjoined: (p) => `The branches of ‘${p}’ do not meet at one Merge.`,
    outline_merge_unpaired: (j) => `‘${j}’ closes no Parallel step.`,
    outline_loop_shape: (l) => `The body of ‘${l}’ does not end at its Next.`,
    loopNextOutside: (x, l) => `‘${x}’ is not inside the body of ‘${l}’, so it cannot go on to its next item.`,
    loopLeaks: (l, y) => `The body of ‘${l}’ reaches ‘${y}’, which runs after the loop.`,
    loopEnteredByNext: (l) => `‘${l}’ is entered by its Next from outside its body.`,
    outline_cycle: (x, y) => `‘${x}’ leads back to ‘${y}’, and only a loop's Next may.`,
    outline_unknown_port: (x, port) => `‘${x}’ has no port called ${port}.`,
    outline_broken_line: (id) => `A line names ‘${id}’, which is not a step in this flow.`,
    outline_after_end: (x, y) => `‘${x}’ ends the run, and a line leaves it for ‘${y}’.`,
    readOnlyBecause: (reason) => `This flow is shown as a list in the order it runs, and cannot be edited here: ${reason}`,

    // ── the list ───────────────────────────────────────────────────────
    stepsHeading: 'Steps',
    stepsCount: (n) => plural(n, '1 step', '{n} steps'),
    findStep: 'Find a step',
    findNothing: (q) => `No step matches “${q}”.`,
    statusKeys: 'Alt+↑ ↓ moves a step · Ctrl+D duplicates · Del removes · Ctrl+Z undoes',
    fold: (x) => `Fold ${x}`,
    unfold: (x) => `Unfold ${x}`,
    menuFor: (x) => `Menu for ${x}`,
    dragToMove: 'Drag to move',
    addStepHere: (where) => `Add a step here — ${where}`,
    removeBranch: (arm) => `Remove ${arm}`,
    armStops: 'Stops here',
    flowStart: 'Start',
    startType: 'Flow',

    // ── where a step is, and where one would go ────────────────────────
    topLevel: 'Top level',
    topLevelFirst: 'Top level · the first step',
    topLevelLast: 'Top level · the last step',
    insidePath: (path) => `Inside ${path}`,
    pathJoin: ' › ',
    gapTop: 'at the top level',
    gapInside: (path) => `inside ${path}`,
    gapAfter: (where, x) => `${where}, after ${x}`,
    gapBefore: (where, x) => `${where}, before ${x}`,
    gapFirst: (where) => `${where}, as the first step`,
    dropInto: (path) => `Into ${path}`,
    dropTop: 'Top level',
    dropBefore: (x) => `before ${x}`,
    dropAfter: (x) => `after ${x}`,
    dropFirst: 'as the first step',
    dropLabel: (where, at) => `${where} · ${at}`,
    dropNowhere: 'Drop it between two steps to move it there.',

    // ── the step menu ──────────────────────────────────────────────────
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveOut: (x) => `Move out of ${x}`,
    moveOutTop: 'Move out',
    wrapIn: 'Wrap in',
    copy: 'Copy',
    cut: 'Cut',
    pasteAfter: 'Paste after',
    renameKey: 'F2',
    keyMoveUp: 'Alt+↑',
    keyMoveDown: 'Alt+↓',
    keyMoveOut: 'Alt+←',
    keyDuplicate: 'Ctrl+D',
    keyCopy: 'Ctrl+C',
    keyCut: 'Ctrl+X',
    keyPaste: 'Ctrl+V',
    keyRemove: 'Del',
    refusedLine: (what, why) => `${what} — ${why}`,
    alreadyFirst: (where) => `already first in ${where}`,
    alreadyLast: (where) => `already last in ${where}`,
    alreadyTop: 'already at the top level',
    theTopLevel: 'the top level',
    nothingCopied: 'nothing is copied',
    readOnlyRefusal: 'the flow is read only',

    // ── why an edit is refused ─────────────────────────────────────────
    endNotLast: (end) => `‘${end}’ ends the run, so it can only be the last step here.`,
    nothingAfterEnd: (end) => `Nothing runs after ‘${end}’.`,
    endsNotLast: (x) => `Every way through ‘${x}’ ends, so it can only be the last step here.`,
    endInLoop: (end, loop) => `‘${end}’ ends the run, and a loop's body cannot: the steps inside ‘${loop}’ end at its next item.`,
    wrapLoopNeverReturns: (x) => `‘${x}’ never goes on, so a loop around it would never reach its next item.`,
    wouldOrphan: (y) => `Nothing would lead to ‘${y}’ any more.`,
    branchToJoinNeeded: (p, j) => `‘${p}’ needs a branch that goes on to ‘${j}’.`,
    unreachableHere: (x) => `Every way through ‘${x}’ ends, so nothing would reach a step after it.`,
    nextOutsideLoop: (x) => `‘${x}’ goes on with the next item of a loop, so it can only go inside one.`,
    intoItself: (x) => `‘${x}’ cannot go inside itself.`,
    lastBranch: (p) => `‘${p}’ needs at least one branch.`,
    armNoContinuation: (x) => `Nothing comes after ‘${x}’ yet, so there is nowhere for those steps to carry on `
        + 'to — add a step after it first.',
    notBlockShaped: (why) => `That would leave a flow the outline cannot draw: ${why}`,
    noJoinType: 'There is no step type that closes a Parallel step.',

    // ── ports drawn as settings (36 §6.5) ──────────────────────────────
    armExitLabel: 'After those steps',
    armExitRejoin: (x) => `Carry on with “${x}”`,
    armExitRejoinEnd: 'Carry on after this step',
    joinSettingLabel: 'When the branches finish',
    joinAll: 'Wait for every branch',
    joinAny: 'Go on when the first one finishes',

    // ── the run overlay (36 §6.7) ──────────────────────────────────────
    runTaken: 'taken',
    runNotTaken: 'not taken',
    runCount: (n) => `×${n}`,
    runState: (state) => ({
        completed: 'completed', failed: 'failed', skipped: 'skipped', running: 'running',
        cancelled: 'cancelled', 'not-reached': 'not reached',
    }[state] ?? String(state ?? '')),
});
