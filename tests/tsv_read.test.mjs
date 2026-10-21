/**
 * STORY-0090 `fromTSV` — READING TAB-SEPARATED TEXT AS EXCEL WRITES IT.
 *
 * The reading half of what Tables' grid/clipboard tests check, ported (not
 * imported): a plain grid, one cell, empty cells kept, CRLF lines, the
 * newline Excel puts after the last row dropped (LF and CRLF), a quoted cell
 * holding a tab, a newline or doubled quotes read as ONE cell, and the round
 * trip through `toTSV`. Beyond Tables' cases: empty text, a quote inside a
 * cell that does not open one, several empty lines at the end, short lines.
 *
 * Against main before STORY-0090 the suite fails (tsv.js has no fromTSV).
 *
 *     node tests/tsv_read.test.mjs
 */
const { fromTSV, toTSV } = await import('../src/ui/components/tsv.js');
const widgets = await import('../widgets.js').catch(() => null);

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};

if (typeof fromTSV !== 'function') {
    console.error('  FAIL tsv.js exports fromTSV');
    process.exit(1);
}

console.log('\nreading (ported from Tables grid/clipboard.test.mjs)');
check('a simple grid', fromTSV('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
check('a single cell', fromTSV('x'), [['x']]);
check('empty cells are kept', fromTSV('a\t\tb'), [['a', '', 'b']]);
check('CRLF lines', fromTSV('a\tb\r\nc\td'), [['a', 'b'], ['c', 'd']]);

console.log('\nExcel\'s newline after the last row is no row');
check('a trailing newline is dropped', fromTSV('a\tb\n'), [['a', 'b']]);
check('a trailing CRLF is dropped', fromTSV('a\tb\r\n'), [['a', 'b']]);
check('several empty lines at the end are dropped', fromTSV('a\n\n\n'), [['a']]);
check('an empty line inside the block is kept', fromTSV('a\n\nb'), [['a'], [''], ['b']]);

console.log('\nquoted cells, as Excel quotes them');
check('a quoted tab is one cell', fromTSV('"a\tb"\tc'), [['a\tb', 'c']]);
check('a quoted newline is one cell', fromTSV('"line1\nline2"\tc'), [['line1\nline2', 'c']]);
check('doubled quotes are one quote', fromTSV('"say ""hi"""\tc'), [['say "hi"', 'c']]);
check('a quote inside a cell does not open one', fromTSV('5" pipe\tx'), [['5" pipe', 'x']]);
check('a quoted CRLF keeps its CR', fromTSV('"a\r\nb"'), [['a\r\nb']]);

console.log('\nthe round trip');
check('toTSV then fromTSV gives the matrix back',
      fromTSV(toTSV([['a\tb', 'c"d'], ['e\nf', '']])), [['a\tb', 'c"d'], ['e\nf', '']]);
check('nulls are written empty', toTSV([[null, undefined, 0]]), '\t\t0');

console.log('\nedges');
check('empty text is no rows', fromTSV(''), []);
check('null is no rows', fromTSV(null), []);
check('lines keep their own lengths', fromTSV('a\tb\tc\nd'), [['a', 'b', 'c'], ['d']]);

console.log('\nthe barrel');
check('widgets.js exports fromTSV', typeof widgets?.fromTSV, 'function');

if (failures) {
    console.error(`\ntsv_read: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
