/**
 * FINDINGS (36 §3.8) — the consumer's validator's, drawn where they apply.
 *
 *   §1  groupFindings: a Map by node_id, null for the flow; a validator result
 *       `{errors, warnings}` is read as one list; with the graph, a finding
 *       naming a step the graph no longer has goes to the flow — never nowhere
 *   §2  matchFindingField: the LONGEST prefix, at a segment boundary only
 *       (`url` does not match `url2`)
 *   §3  the strip: hidden while empty; "N things to fix before this can be
 *       published."; a line per finding, errors first, the step named by the
 *       consumer; Go to it hands back the finding; warnings alone are "to look
 *       at"; `aria-live="polite"`
 *
 *     node tests/flow_kit_findings.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — findings');
const { groupFindings, matchFindingField, isPathPrefix, createFindingsStrip, findingsList } =
    await import('../src/flow/kit/findings.js');

const F = [
    { code: 'a', message: 'Url needs a value.', severity: 'error', node_id: 'invite', field: 'url' },
    { code: 'b', message: 'The flow has no end.', severity: 'error' },
    { code: 'c', message: 'A step that was removed.', severity: 'error', node_id: 'gone' },
    { code: 'd', message: 'Consider a timeout.', severity: 'warning', node_id: 'invite' },
];

t.section('§1 groupFindings');
{
    const g = groupFindings(F);
    t.check('by node, null for the flow', [...g.keys()], ['invite', null, 'gone']);
    t.check('a step\'s list in order', g.get('invite').map((f) => f.code), ['a', 'd']);
    const graph = { nodes: [{ id: 'invite' }] };
    const h = groupFindings({ errors: F.slice(0, 3), warnings: F.slice(3) }, { graph });
    t.check('a removed step\'s finding goes to the flow', h.get(null).map((f) => f.code), ['b', 'c']);
    t.ok('nothing is lost', [...h.values()].flat().length === 4);
    t.check('findingsList of nothing', findingsList(undefined), []);
}

t.section('§2 matchFindingField');
t.check('the longest prefix', matchFindingField(['headers', 'headers.Authorization', 'url'], 'headers.Authorization.x'),
        'headers.Authorization');
t.check('an index is a boundary', matchFindingField(['rows'], 'rows[0].key'), 'rows');
t.check('not inside a word', matchFindingField(['url'], 'url2'), null);
t.check('no field, no match', matchFindingField(['url'], undefined), null);
t.ok('isPathPrefix', isPathPrefix('a', 'a') && isPathPrefix('a', 'a.b') && !isPathPrefix('a', 'ab') && !isPathPrefix('', 'a'));

t.section('§3 the strip');
{
    const went = [];
    const strip = createFindingsStrip({ onGoTo: (f) => went.push(f.code), nameOf: (id) => ({ invite: 'Send the invitation' }[id] || '') });
    document.body.appendChild(strip.el);
    t.ok('hidden while empty', strip.el.hidden);
    t.check('polite', strip.el.getAttribute('aria-live'), 'polite');
    strip.set([F[3], F[0], F[1]]);
    t.ok('shown', !strip.el.hidden);
    t.check('the count of errors', strip.el.querySelector('.twm-flow-strip__title').textContent,
            '2 things to fix before this can be published.');
    t.check('a line per finding, errors first, the step named', [...strip.el.querySelectorAll('.twm-flow-strip__text')]
            .map((x) => x.textContent), ['Send the invitation — Url needs a value.', 'The flow has no end.',
                                         'Send the invitation — Consider a timeout.']);
    t.press(strip.el.querySelectorAll('.twm-flow-strip__go')[0]);
    t.check('Go to it hands back the finding', went, ['a']);
    strip.set([F[0]]);
    t.check('one', strip.el.querySelector('.twm-flow-strip__title').textContent, '1 thing to fix before this can be published.');
    strip.set([F[3]]);
    t.check('warnings alone are to look at', [strip.el.querySelector('.twm-flow-strip__title').textContent,
            strip.el.classList.contains('twm-flow-strip--warning')], ['1 thing to look at.', true]);
    strip.set({ errors: [], warnings: [] });
    t.ok('emptied, hidden', strip.el.hidden);
    const quiet = createFindingsStrip();
    quiet.set([F[0]]);
    t.ok('no onGoTo: no Go to it', quiet.el.querySelector('.twm-flow-strip__go') === null);
    t.ok('a step nobody named is named by its id', quiet.el.textContent.includes('invite — Url needs a value.'));
}

t.done();
