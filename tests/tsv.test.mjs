/**
 * STORY-0085 `toTSV` / `tsvCell` — TAB-SEPARATED TEXT WITH EXCEL'S QUOTING.
 *
 * The writing half of what Tables' grid/clipboard tests check, ported (not
 * imported): a plain grid is plain text, a cell holding a tab, a newline or a
 * quote is quoted with its quotes doubled, `null`/`undefined` are empty, and
 * there is no newline after the last row. The round trip is checked against a
 * small reader written here, the one Excel's format implies, so a quoted cell
 * comes back as ONE cell.
 *
 * Against main before STORY-0085 the import fails (there is no tsv.js).
 *
 *     node tests/tsv.test.mjs
 */
const { toTSV, tsvCell } = await import('../src/ui/components/tsv.js');
const widgets = await import('../widgets.js').catch(() => null);

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};

/** Excel's TSV, read character by character (a quoted cell may hold tabs
 *  and newlines). Only for the round trip below. */
function read(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

console.log('\nwriting');
check('a simple grid', toTSV([['a', 'b'], ['c', 'd']]), 'a\tb\nc\td');
check('a single cell is its text alone, no newline after it', toTSV([['x']]), 'x');
check('empty cells are kept', toTSV([['a', '', 'b']]), 'a\t\tb');
check('null and undefined are empty, 0 is 0', toTSV([[null, undefined, 0]]), '\t\t0');
check('numbers and booleans as String() gives them', toTSV([[1.5, true, -3]]), '1.5\ttrue\t-3');
check('no trailing newline after the last row', toTSV([['a'], ['b']]).endsWith('\n'), false);
check('an empty matrix is empty text', toTSV([]), '');

console.log('\nquoting, as Excel quotes');
check('a tab is quoted', tsvCell('a\tb'), '"a\tb"');
check('a newline is quoted', tsvCell('line1\nline2'), '"line1\nline2"');
check('a carriage return is quoted', tsvCell('a\rb'), '"a\rb"');
check('a quote is quoted and doubled', tsvCell('say "hi"'), '"say ""hi"""');
check('a plain value is not quoted', tsvCell('plain, text; ok'), 'plain, text; ok');
check('a quoted cell sits between plain ones', toTSV([['x', 'a\tb', 'y']]), 'x\t"a\tb"\ty');

console.log('\nthe round trip');
const grid = [['a\tb', 'c"d'], ['e\nf', ''], ['"', 'plain']];
check('a quoted cell comes back as one cell', read(toTSV(grid)), grid);

console.log('\nthe barrel');
check('widgets.js exports toTSV and tsvCell',
      [typeof widgets?.toTSV, typeof widgets?.tsvCell], ['function', 'function']);

if (failures) {
    console.error(`\ntsv: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
