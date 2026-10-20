/**
 * STORY-0089 — `detectSeries` / `projectSeries` (src/ui/components/series.js),
 * the rules of the fill handle, with no DOM.
 *
 * Covers the generic behaviour Tables' web/js/grid/series.test.mjs checks
 * (ported here, not imported from Tables), plus what FlexDesk adds: a series
 * keeps its seed's type (numbers stay numbers, `Date`s stay `Date`s), a seed
 * in reverse order (a fill up or left) runs away from the block, and dates a
 * week apart continue a week apart.
 *
 *     node tests/series.test.mjs
 */
import { detectSeries, projectSeries } from '../src/ui/components/series.js';
import * as widgets from '../widgets.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

console.log('\nexported');
check('widgets.js exports detectSeries', widgets.detectSeries === detectSeries, true);
check('widgets.js exports projectSeries', widgets.projectSeries === projectSeries, true);

console.log('\ndetectSeries (ported from Tables)');
check('single value copies',        detectSeries([5]),                { kind: 'copy', step: 0 });
check('arithmetic step 1',          detectSeries([1, 2]),             { kind: 'number', step: 1 });
check('arithmetic step 5',          detectSeries([0, 5, 10]),         { kind: 'number', step: 5 });
check('descending',                 detectSeries([10, 8, 6]),         { kind: 'number', step: -2 });
check('constant numbers copy',      detectSeries([7, 7, 7]),          { kind: 'copy', step: 0 });
check('irregular numbers cycle',    detectSeries([1, 2, 4]),          { kind: 'cycle', step: 0 });
check('dates step 1 day',           detectSeries(['2026-01-01', '2026-01-02']), { kind: 'date', step: 1 });
check('dates step 7 days',          detectSeries(['2026-01-01', '2026-01-08']), { kind: 'date', step: 7 });
check('plain text cycles',          detectSeries(['a', 'b']),         { kind: 'cycle', step: 0 });
check('text with trailing number',  detectSeries(['Item 1', 'Item 2']),
      { kind: 'text-number', step: 1, prefix: 'Item ', suffix: '', pad: 1 });
check('empty is null',              detectSeries([]),                 null);
check('all blanks is null',         detectSeries([null, '']),         null);

console.log('\ndetectSeries (FlexDesk)');
check('not an array is null',       detectSeries('12'),               null);
check('numeric text is a number',   detectSeries(['1', '2']),         { kind: 'number', step: 1 });
check('numbers and numeric text',   detectSeries([1, '3']),           { kind: 'number', step: 2 });
check('NaN is not a number',        detectSeries([NaN, NaN]),         { kind: 'cycle', step: 0 });
check('a blank breaks the series',  detectSeries([1, null, 3]),       { kind: 'cycle', step: 0 });
check('"12abc" is not a number',    detectSeries(['12abc', '13abc']).kind, 'text-number');
check('Date objects a week apart',  detectSeries([new Date('2026-01-01T00:00:00Z'), new Date('2026-01-08T00:00:00Z')]),
      { kind: 'date', step: 7 });
check('irregular dates cycle',      detectSeries(['2026-01-01', '2026-01-02', '2026-01-05']), { kind: 'cycle', step: 0 });
check('equal dates copy',           detectSeries(['2026-01-01', '2026-01-01']), { kind: 'copy', step: 0 });
check('an impossible date is not a date', detectSeries(['2026-02-30', '2026-02-31']).kind, 'text-number');
check('different prefixes cycle',   detectSeries(['A1', 'B2']),       { kind: 'cycle', step: 0 });
check('equal texts cycle',          detectSeries(['x', 'x']),         { kind: 'cycle', step: 0 });

console.log('\nprojectSeries (ported from Tables; numbers keep their type)');
check('project numbers',    projectSeries([1, 2], 3),                     [3, 4, 5]);
check('project keeps ints', projectSeries([10, 20], 2),                   [30, 40]);
check('project decimals',   projectSeries(['1.5', '2.0'], 2),             ['2.5', '3.0']);
check('project dates',      projectSeries(['2026-01-01', '2026-01-02'], 2),
      ['2026-01-03', '2026-01-04']);
check('project text series',projectSeries(['Item 1', 'Item 2'], 2),       ['Item 3', 'Item 4']);
check('project copies one', projectSeries(['x'], 3),                      ['x', 'x', 'x']);
check('project cycles',     projectSeries(['a', 'b'], 5),                 ['a', 'b', 'a', 'b', 'a']);
check('ctrl forces copy',   projectSeries([1, 2], 3, { forceCopy: true }), [1, 2, 1]);
check('padded text series', projectSeries(['INV-001', 'INV-002'], 2),     ['INV-003', 'INV-004']);

console.log('\nprojectSeries (FlexDesk)');
check('the story: 1,2 three further gives 3,4,5', projectSeries([1, 2], 3), [3, 4, 5]);
check('numeric text stays text',    projectSeries(['1', '2'], 3),         ['3', '4', '5']);
check('one number repeats',         projectSeries([7], 3),                [7, 7, 7]);
check('number decimals, no float drift', projectSeries([0.1, 0.2], 3),    [0.3, 0.4, 0.5]);
check('number decimals from the widest seed', projectSeries([1.5, 2], 2), [2.5, 3]);
check('descending numbers',         projectSeries([10, 8], 3),            [6, 4, 2]);
check('dates a week apart continue a week apart',
      projectSeries(['2026-10-05', '2026-10-12'], 3), ['2026-10-19', '2026-10-26', '2026-11-02']);
check('Date seeds give Dates',
      projectSeries([new Date('2026-01-01T00:00:00Z'), new Date('2026-01-08T00:00:00Z')], 2)
          .map((d) => d instanceof Date && d.toISOString()),
      ['2026-01-15T00:00:00.000Z', '2026-01-22T00:00:00.000Z']);
check('dates across a month end',   projectSeries(['2026-01-30', '2026-01-31'], 2), ['2026-02-01', '2026-02-02']);
check('any other block cycles',     projectSeries([1, 2, 4], 4),          [1, 2, 4, 1]);
check('mixed block cycles',         projectSeries(['a', 1, null], 4),     ['a', 1, null, 'a']);
check('ctrl repeats a date series', projectSeries(['2026-01-01', '2026-01-08'], 3, { forceCopy: true }),
      ['2026-01-01', '2026-01-08', '2026-01-01']);
check('ctrl repeats a text series', projectSeries(['Item 1', 'Item 2'], 2, { forceCopy: true }), ['Item 1', 'Item 2']);
check('ctrl on one value repeats it', projectSeries([5], 2, { forceCopy: true }), [5, 5]);
check('blanks repeat as blanks',    projectSeries([null, ''], 3),         [null, '', null]);
check('suffix kept',                projectSeries(['Q1 2026', 'Q2 2026'], 1), ['Q1 2026']);
check('suffix kept: a number then text', projectSeries(['row 1a', 'row 2a'], 2), ['row 3a', 'row 4a']);
check('text series below zero',     projectSeries(['v1', 'v0'], 2),       ['v-1', 'v-2']);
check('count 0 is nothing',         projectSeries([1, 2], 0),             []);
check('negative count is nothing',  projectSeries([1, 2], -3),            []);
check('an empty seed is nothing',   projectSeries([], 3),                 []);
check('a pure function: the seed is untouched', (() => {
    const seed = [1, 2];
    projectSeries(seed, 3);
    return seed;
})(), [1, 2]);

console.log('\nin reverse (a fill up or left hands the block reversed)');
// The block 3,4 filled two cells up: the seed in fill order is [4, 3], and
// the cells above get 2 (next to the block) then 1.
check('numbers run away from the block', projectSeries([4, 3], 2), [2, 1]);
check('dates run back a week at a time', projectSeries(['2026-01-15', '2026-01-08'], 2), ['2026-01-01', '2025-12-25']);
check('a cycle stays aligned: c sits above a,b,c', projectSeries(['c', 'b', 'a'], 4), ['c', 'b', 'a', 'c']);

if (failures) { console.error(`\nseries: ${failures} assertion(s) FAILED`); process.exit(1); }
console.log('\nall assertions passed');
