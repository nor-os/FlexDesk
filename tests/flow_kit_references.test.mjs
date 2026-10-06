/**
 * REFERENCE SYNTAXES (36 §3.6) — recognisers for drawing, never a grammar.
 *
 *   §1  the three shipped syntaxes find what they should, and not what they
 *       should not (an unclosed `${`, a `{{` with a space)
 *   §2  format round-trips a path to its text
 *   §3  rename rewrites ONLY the segment that names a step — and a syntax that
 *       has not been told which segment that is renames nothing (a column
 *       called like a step stays itself)
 *   §4  two syntaxes in one text: non-overlapping spans, first start wins
 *   §5  describe is the consumer's; without it a chip reads its path, known
 *   §6  path segments do not split inside brackets or quotes
 *
 * Pure: no jsdom.   node tests/flow_kit_references.test.mjs
 */
import { assertions } from './flow_env.mjs';
import {
    TEMPLATE_REFERENCES as T, FORMULA_REFERENCES as F, PARAMETER_REFERENCES as P, createReferenceSyntax,
    findReferences, tokenize, describeReference, pathSegments, resolveSyntaxes,
} from '../src/flow/kit/references.js';

const t = assertions('flow kit — references');
const paths = (syntax, text) => syntax.find(text).map((m) => m.path);

t.section('§1 what each syntax recognises');
t.check('template: dotted, indexed and quoted paths',
        paths(T, 'a ${steps.fetch.body} b ${row.items[0].id} ${row["a b"]} ${x}'),
        ['steps.fetch.body', 'row.items[0].id', 'row["a b"]', 'x']);
t.check('template: unclosed, empty and digit-first are not references', paths(T, '${a.b ${} ${1a} $ {a}'), []);
t.check('template spans', T.find('xx${a.b}y').map((m) => [m.start, m.end, m.text]), [[2, 8, '${a.b}']]);
t.check('formula: square brackets, spaces inside allowed', paths(F, '[Status] = "New" and [steps.save.inserted] > 0'),
        ['Status', 'steps.save.inserted']);
t.check('formula: not across a line, not nested', paths(F, '[a\nb] [[c]]'), ['c']);
t.check('parameter: a name between double braces', paths(P, '{{intake}} {{ intake }} {{a-b}} {{_x1}}'), ['intake', '_x1']);
t.ok('a pattern without the g flag is made global', createReferenceSyntax({ name: 'x', pattern: /<(\w+)>/,
     format: (p) => `<${p}>` }).find('<a><b>').length === 2);
t.throws('a syntax needs a RegExp', () => createReferenceSyntax({ name: 'x', pattern: '<', format: String }));

t.section('§2 format');
t.check('template', T.format('loop.item.email'), '${loop.item.email}');
t.check('formula', F.format('steps.save.inserted'), '[steps.save.inserted]');
t.check('parameter', P.format('intake'), '{{intake}}');
for (const [syntax, text] of [[T, '${a.b[2]["c d"]}'], [F, '[x y.z]'], [P, '{{n}}']]) {
    t.check(`${syntax.name}: format(find(text).path) is the text`, syntax.format(syntax.find(text)[0].path), text);
}

t.section('§3 rename only the segment that names a step');
{
    const text = 'Hi ${steps.fetch.body} and ${row.fetch} and ${steps.fetchx.y}';
    t.check('a syntax nobody configured renames nothing', T.rename(text, { fetch: 'fetch-2' }), text);
    const scoped = createReferenceSyntax({ name: 't', pattern: T.pattern, format: T.format, stepScope: 'steps' });
    t.check('the segment after the scope word, and only an exact id',
            scoped.rename(text, { fetch: 'fetch-2' }), 'Hi ${steps.fetch-2.body} and ${row.fetch} and ${steps.fetchx.y}');
    t.check('a Map works as well as an object', scoped.rename('${steps.a}', new Map([['a', 'b']])), '${steps.b}');
    const first = createReferenceSyntax({ name: 'f', pattern: F.pattern, format: F.format, stepSegment: () => 0 });
    t.check('a hook for a grammar whose FIRST segment is the step', first.rename('[save.inserted] + [x]', { save: 'save-2' }),
            '[save-2.inserted] + [x]');
    t.check('an empty map is the identity', scoped.rename(text, {}), text);
    t.check('a shipped syntax can be told by assignment', (() => {
        const before = T.stepScope;
        T.stepScope = 'steps';
        try { return T.rename('${steps.a.b}', { a: 'z' }); } finally { T.stepScope = before; }
    })(), '${steps.z.b}');
}

t.section('§4 two syntaxes in one text');
{
    const text = '[intake] = {{intake}} and [a{{b}}]';
    const spans = findReferences(text, [F, P]);
    t.check('non-overlapping, in text order, each with its syntax',
            spans.map((s) => [s.text, s.syntax.name]), [['[intake]', 'formula'], ['{{intake}}', 'parameter'],
                                                         ['[a{{b}}]', 'formula']]);
    t.check('tokenize cuts text and refs', tokenize('a ${b} c', [T]).map((p) => [p.kind, p.text]),
            [['text', 'a '], ['ref', '${b}'], ['text', ' c']]);
    t.check('no syntaxes: one text part', tokenize('a ${b}', []).map((p) => p.kind), ['text']);
    t.check('resolveSyntaxes keeps the ones the map holds', resolveSyntaxes(['formula', 'nope', 'template'],
            { formula: F, template: T }).map((s) => s.name), ['formula', 'template']);
}

t.section('§5 describe');
{
    const [m] = findReferences('${a.b}', [T]);
    t.check('without describe: the path, known, the syntax\'s tone', describeReference(m), { label: 'a.b', tone: 'blue', known: true });
    t.check('a parameter\'s chips have a tone of their own', describeReference(findReferences('{{p}}', [P])[0]).tone, 'violet');
    const custom = createReferenceSyntax({ name: 'c', pattern: T.pattern, format: T.format,
                                           describe: (match, ctx) => ({ label: `${ctx.where} › ${match.path}`,
                                                                        tone: 'amber', known: false }) });
    const [n] = findReferences('${a.b}', [custom]);
    t.check('the consumer\'s words', describeReference(n, { where: 'This row' }),
            { label: 'This row › a.b', tone: 'amber', known: false });
}

t.section('§6 path segments');
t.check('dots, an index, a quoted key with a dot', pathSegments('a.b[0]["c.d"].e').map((s) => s.text),
        ['a', 'b', '[0]', '["c.d"]', 'e']);
t.check('a formula path with spaces', pathSegments('This row.Applicant id').map((s) => s.text), ['This row', 'Applicant id']);

t.done();
