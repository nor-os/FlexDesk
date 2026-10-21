/**
 * STORY-0087 — THE BUILT-IN EDITORS' PARSE, as plain functions (no DOM).
 *
 *   §1  the six are `CELL_EDITORS[type] = {create, parse}`; 'num' and 'date'
 *       name the number and datetime editors
 *   §2  number by `locale`: '1.234,56' (de-DE) and '1,234.56' (en-US) are
 *       1234.56, '1 234,5' (fr-FR) is 1234.5; a separator out of place, a
 *       space included, is refused, never misread
 *   §3  datetime: ISO, and the locale's day/month/year order ('31/12/2026'),
 *       checked (no 31 February), in the table's zone
 *   §4  bool and choice; blank is null for a number, a date and a choice
 *   §5  what an editor shows reads back as the same value
 *
 * Against 0.16 the module does not exist.
 *
 *     node tests/cell_editors_parse.test.mjs
 */
const mod = await import('../src/ui/components/cell_editors.js');
const {
    CELL_EDITORS, EDITOR_MESSAGES, editorTypeOf, parseNumber, parseBool, parseDateTime,
    parseChoice, formatNumberForEdit, formatDateTimeForEdit, numberSeparators, dateOrder,
} = mod;

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond) => check(name, !!cond, true);
const section = (t) => console.log(`\n${t}`);
const val = (r) => (r.ok ? r.value : `REFUSED: ${r.error}`);

section('§1 the six');
check('six editors, by type', Object.keys(CELL_EDITORS), ['text', 'multitext', 'number', 'bool', 'choice', 'datetime']);
ok('each has a create and a parse', Object.values(CELL_EDITORS)
    .every((e) => typeof e.create === 'function' && typeof e.parse === 'function'));
check('num is number, date is datetime, any other name is itself',
    ['num', 'date', 'datetime', 'text', 'duration', null].map(editorTypeOf),
    ['number', 'datetime', 'datetime', 'text', 'duration', 'text']);
check('text parses to itself', val(CELL_EDITORS.text.parse('  a b ')), '  a b ');

section('§2 number by locale');
check('de-DE separators', numberSeparators('de-DE'), { group: '.', decimal: ',' });
check('en-US separators', numberSeparators('en-US'), { group: ',', decimal: '.' });
const de = { locale: 'de-DE' };
const en = { locale: 'en-US' };
check("'1.234,56' under de-DE", val(parseNumber('1.234,56', de)), 1234.56);
check("'1,234.56' under en-US", val(parseNumber('1,234.56', en)), 1234.56);
ok('…and it is a Number', typeof parseNumber('1,234.56', en).value === 'number');
check("'1.234,56' under en-US is refused, not read as 1.23456",
    parseNumber('1.234,56', en), { ok: false, error: EDITOR_MESSAGES.number });
check("'1,234.56' under de-DE is refused too", parseNumber('1,234.56', de).ok, false);
check('groups must be three digits', [parseNumber('12,34', en).ok, parseNumber('1,2345', en).ok], [false, false]);
check('several groups', val(parseNumber('1,234,567.5', en)), 1234567.5);
check('plain, negative, signed, a Unicode minus, exponent',
    ['42', '-3.5', '+7', '−2', '1.5e3', '.5'].map((t) => val(parseNumber(t, en))),
    [42, -3.5, 7, -2, 1500, 0.5]);
const fr = { locale: 'fr-FR' };
check('spaces around the text are ignored', val(parseNumber(' 1234,5 ', fr)), 1234.5);
check("fr-FR groups with a space: '1 234,5', a no-break and a narrow no-break space",
    ['1 234,5', '1\u00a0234,5', '1\u202f234,5', '12 345 678'].map((t) => val(parseNumber(t, fr))),
    [1234.5, 1234.5, 1234.5, 12345678]);
check("fr-FR: a space out of place is refused, not read as 123.4 or 123456.7",
    ['1 23,4', '12 3456,7', '1  234', '1 234, 5', '1 234,5 6'].map((t) => parseNumber(t, fr).ok),
    [false, false, false, false, false]);
check('sv-SE and pl-PL too', [val(parseNumber('1 234,5', { locale: 'sv-SE' })), parseNumber('1 23,4', { locale: 'pl-PL' }).ok],
    [1234.5, false]);
check("'1234 5' is refused in every locale",
    ['en-US', 'de-DE', 'de-CH', 'fr-FR', 'sv-SE'].map((locale) => parseNumber('1234 5', { locale }).ok),
    [false, false, false, false, false]);
check('a space where the locale does not group with one is refused',
    [parseNumber('1 234.5', en).ok, parseNumber('1 234,5', de).ok], [false, false]);
check("'abc', '1.2.3', '-', '' are refused or null",
    ['abc', '1.2.3', '-', '12abc'].map((t) => parseNumber(t, en).ok), [false, false, false, false]);
check('blank is null', [val(parseNumber('', en)), val(parseNumber('   ', en))], [null, null]);
check('an unknown locale falls back to the runtime\'s', parseNumber('1.5', { locale: 'xx-not-a-locale-!!' }).ok, true);
check('the message can be replaced', parseNumber('abc', { messages: { number: 'Keine Zahl' } }).error, 'Keine Zahl');

section('§3 datetime');
check('en-GB writes day, month, year', dateOrder('en-GB'), ['day', 'month', 'year']);
check('en-US writes month, day, year', dateOrder('en-US'), ['month', 'day', 'year']);
const parts = (d, utc = false) => (d instanceof Date
    ? (utc ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]
        : [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()])
    : d);
const gb = { locale: 'en-GB' };
ok("'31/12/2026' is a Date", parseDateTime('31/12/2026', gb).value instanceof Date);
check("'31/12/2026' (en-GB)", parts(parseDateTime('31/12/2026', gb).value), [2026, 12, 31, 0, 0]);
check("'31.12.2026 08:30' (de-DE)", parts(parseDateTime('31.12.2026 08:30', de).value), [2026, 12, 31, 8, 30]);
check("'12/31/2026' (en-US)", parts(parseDateTime('12/31/2026', en).value), [2026, 12, 31, 0, 0]);
check("'31/12/2026' under en-US: the only reading", parts(parseDateTime('31/12/2026', en).value), [2026, 12, 31, 0, 0]);
check("'01/02/2026' follows the locale", [parts(parseDateTime('01/02/2026', gb).value), parts(parseDateTime('01/02/2026', en).value)],
    [[2026, 2, 1, 0, 0], [2026, 1, 2, 0, 0]]);
check("ISO '2026-12-31'", parts(parseDateTime('2026-12-31', en).value), [2026, 12, 31, 0, 0]);
check("ISO '2026-12-31T08:30'", parts(parseDateTime('2026-12-31T08:30', gb).value), [2026, 12, 31, 8, 30]);
check("ISO with Z is that instant", parseDateTime('2026-12-31T08:30:00Z').value.toISOString(), '2026-12-31T08:30:00.000Z');
check('ISO with an offset', parseDateTime('2026-12-31T10:30+02:00').value.toISOString(), '2026-12-31T08:30:00.000Z');
check("a timestamp written with a space and an offset ('2026-08-24 10:00:00+00:00', as a database writes one)",
    parseDateTime('2026-08-24 10:00:00+00:00').value.toISOString(), '2026-08-24T10:00:00.000Z');
check('a zoneless date under utc is UTC midnight', parseDateTime('2026-12-31', { utc: true }).value.toISOString(), '2026-12-31T00:00:00.000Z');
check('12-hour times', parts(parseDateTime('12/31/2026 2:05 pm', en).value), [2026, 12, 31, 14, 5]);
check('no 31 February, no month 13, no 25 o\'clock, no two-digit year',
    ['31/02/2026', '2026-13-01', '2026-01-01T25:00', '31/12/26', 'tomorrow', '2026/12'].map((t) => parseDateTime(t, gb).ok),
    [false, false, false, false, false, false]);
check('its message', parseDateTime('nope').error, EDITOR_MESSAGES.datetime);
check('blank is null', val(parseDateTime(' ')), null);

section('§4 bool and choice');
check('true words', ['true', 'TRUE', 'yes', 'y', '1', 'on', 'x'].map((t) => val(parseBool(t))), [true, true, true, true, true, true, true]);
check('false words, and blank', ['false', 'No', 'n', '0', 'off', ''].map((t) => val(parseBool(t))), [false, false, false, false, false, false]);
check("'maybe' is refused", parseBool('maybe'), { ok: false, error: EDITOR_MESSAGES.bool });
const opts = { options: ['red', { value: 'g', label: 'Green' }, 3] };
check('an option by its label, any case, trimmed', val(parseChoice('  green ', opts)), 'g');
check('…or by its value', [val(parseChoice('g', opts)), val(parseChoice('red', opts)), val(parseChoice('3', opts))], ['g', 'red', 3]);
check('other text is refused', parseChoice('purple', opts), { ok: false, error: EDITOR_MESSAGES.choice });
check('…unless allowOther', val(parseChoice('purple', { ...opts, allowOther: true })), 'purple');
check('blank is null', val(parseChoice('', opts)), null);

section('§5 what an editor shows reads back');
check('de-DE shows 1234.5 as 1234,5', formatNumberForEdit(1234.5, de), '1234,5');
for (const n of [0, -12.75, 1234567.891, 0.1 + 0.2, 1e21, 5e-7]) {
    check(`${n} round-trips under de-DE and en-US`,
        [val(parseNumber(formatNumberForEdit(n, de), de)), val(parseNumber(formatNumberForEdit(n, en), en))], [n, n]);
}
const d1 = new Date(2026, 11, 31);
const d2 = new Date(2026, 11, 31, 8, 30, 15);
check('a date shows as ISO, a time only when it has one',
    [formatDateTimeForEdit(d1), formatDateTimeForEdit(d2)], ['2026-12-31', '2026-12-31 08:30:15']);
check('…and reads back', [parseDateTime(formatDateTimeForEdit(d1)).value.getTime(), parseDateTime(formatDateTimeForEdit(d2)).value.getTime()],
    [d1.getTime(), d2.getTime()]);
check('in UTC under utc', formatDateTimeForEdit(new Date(Date.UTC(2026, 0, 2, 3, 4)), { utc: true }), '2026-01-02 03:04');

if (failures) {
    console.error(`\ncell editors parse: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
