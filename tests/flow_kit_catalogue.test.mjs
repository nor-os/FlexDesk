/**
 * THE STEP CATALOGUE (36 §3.1).
 *
 *   §1  a consumer's wire shape is read as it arrives, extra keys kept
 *   §2  DECLARED PORT ORDER IS MEANING — inputs and outputs are never sorted
 *       (`in_bottom` declared after `in_top` stays after it)
 *   §3  categories order the list; a type whose category nobody listed is
 *       not lost; tones are names, an unknown one is grey
 *   §4  a broken type is LISTED in `problems`, never thrown
 *   §5  `role` is 'step' for an unknown type; `idBase` is the consumer's stem,
 *       made safe for an id
 *
 * Pure: no jsdom.   node tests/flow_kit_catalogue.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';

const t = assertions('flow kit — catalogue');

const TYPES = [
    { type_id: 'union', label: 'Union', category: 'data', role: 'operation', icon: 'merge',
      ports: [{ name: 'in_top', direction: 'input', port_type: 'FLOW' },
              { name: 'in_bottom', direction: 'input', port_type: 'FLOW' },
              { name: 'out', direction: 'output', port_type: 'FLOW' }], chunk_capable: true },
    { type_id: 'http-request', label: 'HTTP request', category: 'integration', role: 'step',
      ports: [{ name: 'in', direction: 'input', port_type: 'FLOW' },
              { name: 'out', direction: 'output', port_type: 'FLOW' },
              { name: 'error', direction: 'output', port_type: 'FLOW', label: 'Error' },
              { name: 'response', direction: 'output', port_type: 'DATA', label: 'Response' }],
      config_schema: { type: 'object', properties: { url: { type: 'string' } } }, writes: false },
    { type_id: 'condition', label: 'Condition', category: 'control', role: 'branch',
      ports: [{ name: 'in', direction: 'input' }, { name: 'true', direction: 'output' },
              { name: 'false', direction: 'output' }] },
    { type_id: 'log', label: 'Log', category: 'utility' },
    { type_id: 'mystery', label: 'Mystery', category: 'nobody-listed' },
    { type_id: 'loose', label: 'Loose' },
];
const CATEGORIES = [
    { id: 'control', label: 'Flow', tone: 'violet' },
    { id: 'data', label: 'Data', tone: 'teal', layout: 'grid' },
    { id: 'integration', label: 'Integration', tone: 'amber' },
    { id: 'utility', label: 'Utility', tone: 'mauve' },
];

t.section('§1 the wire shape, read as it arrives');
{
    const cat = createStepCatalogue(TYPES, { categories: CATEGORIES });
    const http = cat.get('http-request');
    t.check('label and role', [http.label, http.role], ['HTTP request', 'step']);
    t.ok('an extra key is kept', http.writes === false && cat.get('union').chunk_capable === true);
    t.check('a port with no port_type is FLOW', cat.get('condition').ports.map((p) => p.port_type), ['FLOW', 'FLOW', 'FLOW']);
    t.check('a port with no label is labelled by its name', cat.get('condition').ports[1].label, 'true');
    t.ok('an unknown id is null, and has() says so', cat.get('nope') === null && !cat.has('nope') && cat.has('log'));
    t.ok('the input is not mutated', TYPES[2].ports[0].port_type === undefined);
}

t.section('§2 declared port order is meaning');
{
    const cat = createStepCatalogue(TYPES);
    t.check('a union\'s inputs in declared order, not the alphabet', cat.inputs('union').map((p) => p.name),
            ['in_top', 'in_bottom']);
    t.check('outputs, all of them', cat.outputs('http-request').map((p) => p.name), ['out', 'error', 'response']);
    t.check('outputs, FLOW only', cat.outputs('http-request', { flow: true }).map((p) => p.name), ['out', 'error']);
    t.check('an unknown type has no ports', cat.inputs('nope'), []);
    t.check('a port by name and direction', cat.port('http-request', 'error', 'output')?.label, 'Error');
}

t.section('§3 categories and tones');
{
    const cat = createStepCatalogue(TYPES, { categories: CATEGORIES });
    t.check('list(): categories\' order, then label', cat.list().map((x) => x.type_id),
            ['condition', 'union', 'http-request', 'log', 'mystery', 'loose']);
    t.check('byCategory(): unlisted categories follow, nothing is lost',
            cat.byCategory().map((g) => [g.category.id, g.types.map((x) => x.type_id)]),
            [['control', ['condition']], ['data', ['union']], ['integration', ['http-request']], ['utility', ['log']],
             ['nobody-listed', ['mystery']], ['', ['loose']]]);
    t.check('a tone per type', ['condition', 'union', 'http-request', 'log', 'nope'].map((id) => cat.tone(id)),
            ['violet', 'teal', 'amber', 'grey', 'grey']);
    t.check('a category keeps its layout', cat.category('union').layout, 'grid');
}

t.section('§4 a broken type is listed, never thrown');
{
    const cat = createStepCatalogue([
        { type_id: 'a', label: 'A' },
        { type_id: 'a', label: 'A again' },
        { label: 'No id' },
        'not an object',
        { type_id: 'b', ports: [{ direction: 'input' }, { name: 'in', direction: 'input' }] },
        { type_id: 'c', config_schema: { type: 'object', properties: { x: { type: 'string', pattern: '^a$' } } } },
    ]);
    t.check('the first of two ids is kept', cat.get('a').label, 'A');
    t.check('every problem is a line', cat.problems.map((p) => p.type_id), ['a', null, null, 'b', 'c']);
    t.ok('the schema refusal is the server\'s sentence',
         cat.problems[4].message.includes("x: the keyword 'pattern' is not supported."), cat.problems[4].message);
    t.check('a nameless port is left out, the type kept', cat.inputs('b').map((p) => p.name), ['in']);
    t.ok('a type with a refused schema is still in the list', cat.has('c'));
    t.ok('nothing at all is no catalogue at all, quietly', createStepCatalogue(undefined).list().length === 0);
}

t.section('§5 role and idBase');
{
    const cat = createStepCatalogue([{ type_id: 'prefix-read rows', label: 'Read' }],
                                    { idBase: (type) => type.type_id.replace(/^prefix-/, '') });
    t.check('a type with no role is a step; an unknown type too', [cat.role('prefix-read rows'), cat.role('x')],
            ['step', 'step']);
    t.check('the consumer\'s stem, made safe', cat.idBase('prefix-read rows'), 'read-rows');
    t.check('an unknown type id is its own stem', cat.idBase('wat'), 'wat');
    t.check('the default stem is the type id', createStepCatalogue([{ type_id: 'log' }]).idBase('log'), 'log');
}

t.done();
