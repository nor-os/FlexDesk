/**
 * COLUMN FIT — short columns keep their values; free text takes the room.
 *
 * The measurements below are the ones a BugDesk queue and backlog board
 * actually produced over a real 1,100-record store, where the old even-spread
 * fit clipped the summary in 91 rows of 100 at 1600px and crushed a board's
 * title to 85px at 1100px while every short column kept its width.
 *
 *   §1  room to spare: short columns get their content, text takes the rest
 *   §2  too little room: shrink in order of harm, exact to the pixel
 *   §3  pinned (dragged) columns, forced kinds, and degenerate input
 *
 *     node tests/column_fit.test.mjs
 */

import { fitColumns, COLUMN_FIT } from '../src/ui/components/column_fit.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const sum = (ws) => Math.round(ws.reduce((a, b) => a + b, 0) * 1000) / 1000;
const px = (ws) => ws.map((x) => Math.round(x * 100) / 100);

// A bug queue: Pri, Bug, Type, Summary, Status, Updated, Assignee.
const queue = [
    { natural: 46, header: 40 },
    { natural: 52, header: 44 },
    { natural: 44, header: 50 },
    { natural: 840, typical: 700, header: 90 },
    { natural: 108, typical: 84, header: 64 },
    { natural: 92, header: 84 },
    { natural: 118, typical: 70, header: 88 },
];
// A backlog board: Item, Title, Type, Status, Pts, Criteria, Assignee, Phase, Updated.
const board = [
    { natural: 92, header: 50 },
    { natural: 620, typical: 480, header: 50 },
    { natural: 56, header: 48 },
    { natural: 104, typical: 90, header: 64 },
    { natural: 30, header: 40 },
    { natural: 70, header: 72 },
    { natural: 118, typical: 70, header: 88 },
    { natural: 160, typical: 60, header: 58 },
    { natural: 92, header: 80 },
];

console.log('\n§1 room to spare');
{
    const w = fitColumns(queue, 984);
    check('fills the box exactly', sum(w), 984);
    check('every short column is its full content width, and no wider', px([w[0], w[1], w[2], w[4], w[5], w[6]]), [48, 54, 52, 110, 94, 120]);
    check('the summary takes everything else', px([w[3]]), [984 - (48 + 54 + 52 + 110 + 94 + 120)]);
}
{
    const w = fitColumns(queue, 1700);
    check('with more room than content, text still takes it all (no gaps in short columns)',
        [w[0], w[1], w[2], w[4], w[5], w[6], sum(w)], [48, 54, 52, 110, 94, 120, 1700]);
}
{
    // Two text columns share by what each still needs.
    const w = fitColumns([{ natural: 600 }, { natural: 300 }, { natural: 60 }], 800);
    check('two text columns share the room by need, and fill it', [sum(w), w[2], w[0] > w[1]], [800, 62, true]);
}
{
    const w = fitColumns([{ natural: 60 }, { natural: 90 }, { natural: 70 }], 500);
    check('no text column: the spare room goes to the LAST column only', w, [62, 92, 346]);
}

console.log('\n§2 too little room');
{
    const w = fitColumns(board, 664);
    check('fits exactly — no stray horizontal scrollbar', sum(w), 664);
    check('the title is NOT crushed (it was 85px)', w[1] >= COLUMN_FIT.TEXT_FLOOR - 1e-6, true);
}
{
    const w = fitColumns(board, 800);
    check('at 800px: short columns gave up only their outliers, down to what most values need', px([w[3], w[6], w[7]]), [92, 90, 62]);
    check('...short columns with no outliers kept every value (Item, Type, Pts, Updated)', px([w[0], w[2], w[4], w[8]]), [94, 58, 42, 94]);
    check('...and the title got the rest, close to its readable width', px([w[1]]), [800 - (94 + 58 + 92 + 42 + 74 + 90 + 62 + 94)]);
}
{
    const w = fitColumns(queue, 400);
    check('very narrow: everything at its floor, and it scrolls rather than crushing further', sum(w) > 400, true);
    check('...short columns stop at their floor', Math.min(...[w[0], w[1], w[2], w[4], w[5], w[6]]) >= COLUMN_FIT.FLOOR, true);
    check('...the text column stops at its last floor', w[3], COLUMN_FIT.FLOOR * 2);
}
{
    // Exactness over a sweep of widths: whenever it can fit, it fits to the pixel.
    let bad = [];
    for (let avail = 520; avail <= 1400; avail += 7) {
        const w = fitColumns(board, avail);
        const floorSum = 94 + 80 + 58 + 56 + 42 + 56 + 56 + 56 + 56;
        if (avail >= floorSum && Math.abs(sum(w) - avail) > 0.01) bad.push([avail, sum(w)]);
        if (w.some((x) => x < COLUMN_FIT.FLOOR)) bad.push([avail, 'below floor']);
    }
    check('a sweep from 520px to 1400px: exact whenever the floors fit, never below the floor', bad, []);
}
{
    // Monotone: a wider box never makes any column narrower.
    let bad = [];
    let prev = fitColumns(board, 500);
    for (let avail = 501; avail <= 1500; avail++) {
        const w = fitColumns(board, avail);
        w.forEach((x, i) => { if (x < prev[i] - 1e-6) bad.push([avail, i, prev[i], x]); });
        prev = w;
    }
    check('widening the box never narrows a column', bad.slice(0, 3), []);
}

console.log('\n§3 pinned, forced, degenerate');
{
    const pinned = queue.map((c, i) => (i === 0 ? { ...c, pinned: 48 } : i === 3 ? { ...c, pinned: 300 } : c));
    const w = fitColumns(pinned, 984);
    check('dragged columns keep their width exactly', [w[0], w[3]], [48, 300]);
    check('with the only text column pinned, the spare room goes to the last free column', sum(w), 984);
}
{
    const w = fitColumns([{ natural: 60, text: true }, { natural: 400, text: false }], 900);
    check('a caller can force the kind of a column', [w[1], w[0]], [402, 900 - 402]);
}
check('not laid out yet: content widths', fitColumns(queue, 0).slice(0, 2), [48, 54]);
check('no columns', fitColumns([], 500), []);
check('a header wider than every value is never cut', fitColumns([{ natural: 20, header: 90 }, { natural: 500 }], 700)[0], 92);

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
