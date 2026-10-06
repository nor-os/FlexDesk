/**
 * THE SETTINGS-SCHEMA SUBSET, HELD TO THE SERVER'S WORDS (36 §3.2, §8).
 *
 *   §1  every case of the shared fixture gets the fixture's verdict, sentence
 *       for sentence — the fixture is what the consumer's server reads too
 *       (it was run against Tables' `check_schema` when it was written: 30 of
 *       30 alike)
 *   §2  the keyword, annotation and type sets are the server's — compared
 *       with the sibling Tables checkout's `schema.py` when there is one
 *   §3  fields come in the schema's order, required marked; a title or the
 *       key in words labels each
 *   §4  `x-ui-when` draws a field only while its sibling holds one of the
 *       values — the stored value, else the sibling's default — and a
 *       malformed hint never hides a field
 *   §5  Python's quoting, for the names a refusal quotes
 *
 * Pure: no jsdom.   node tests/flow_kit_settings_schema.test.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { assertions } from './flow_env.mjs';
import {
    checkSettingsSchema, fieldsFromSchema, fieldVisible, visibleFields, whenKeys, titleOf, pyRepr,
    SETTINGS_SCHEMA_KEYWORDS, SETTINGS_SCHEMA_ANNOTATIONS, SETTINGS_SCHEMA_TYPES,
} from '../src/flow/kit/settings_schema.js';

const t = assertions('flow kit — settings schema');
const fixture = JSON.parse(t.read('tests/fixtures/flow_kit_settings_schema.json'));

t.section('§1 the shared fixture, sentence for sentence');
t.ok('the fixture has cases of both verdicts',
     fixture.cases.some((c) => c.verdict === null) && fixture.cases.some((c) => typeof c.verdict === 'string'));
for (const c of fixture.cases) t.check(c.name, checkSettingsSchema(c.schema), c.verdict);

t.section('§2 the keyword sets are the server\'s');
{
    const py = resolvePath(t.root, '../Tables/services/tables-api/src/tables/workflow/engine/schema.py');
    if (existsSync(py)) {
        const text = readFileSync(py, 'utf8');
        const setOf = (name) => {
            const m = new RegExp(`${name}\\s*=\\s*frozenset\\(\\s*\\{([^}]*)\\}`).exec(text);
            return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort() : null;
        };
        t.check('keywords', [...SETTINGS_SCHEMA_KEYWORDS].sort(), setOf('_KEYWORDS'));
        t.check('annotations', [...SETTINGS_SCHEMA_ANNOTATIONS].sort(), setOf('_ANNOTATIONS'));
        t.check('type names', [...SETTINGS_SCHEMA_TYPES].sort(), setOf('_TYPES'));
    } else {
        console.log('  (no sibling Tables checkout beside this one: the sets are held by §1\'s fixture alone)');
    }
    t.ok('pattern, oneOf, anyOf and $ref are not keywords',
         !['pattern', 'oneOf', 'anyOf', '$ref'].some((k) => SETTINGS_SCHEMA_KEYWORDS.includes(k)));
}

t.section('§3 fields in the schema\'s order');
{
    const fields = fieldsFromSchema({
        properties: { level: { type: 'string' }, max_attempts: { type: 'integer' }, url: { title: 'Address' } },
        required: ['url'],
    });
    t.check('keys in order', fields.map((f) => f.key), ['level', 'max_attempts', 'url']);
    t.check('required marked', fields.map((f) => f.required), [false, false, true]);
    t.check('a key in words', titleOf('max_attempts', {}), 'Max attempts');
    t.check('a title wins', titleOf('url', { title: 'Address' }), 'Address');
    t.check('no schema, no fields', fieldsFromSchema(undefined), []);
    t.check('a non-object property spec is drawn from nothing', fieldsFromSchema({ properties: { a: 5 } })[0].spec, {});
}

t.section('§4 x-ui-when');
{
    const fields = fieldsFromSchema({ properties: {
        auth_mode: { type: 'string', enum: ['none', 'oauth', 'key'], default: 'none' },
        client_id: { type: 'string', 'x-ui-when': { field: 'auth_mode', in: ['oauth'] } },
        api_key: { type: 'string', 'x-ui-when': { field: 'auth_mode', in: ['key'] } },
        odd: { type: 'string', 'x-ui-when': { field: 'auth_mode' } },
        loose: { type: 'string', 'x-ui-when': 'auth_mode' },
    } });
    t.check('the default applies while the sibling is absent', visibleFields(fields, {}).map((f) => f.key),
            ['auth_mode', 'odd', 'loose']);
    t.check('a stored value shows its fields', visibleFields(fields, { auth_mode: 'oauth' }).map((f) => f.key),
            ['auth_mode', 'client_id', 'odd', 'loose']);
    t.ok('a hint naming a sibling nobody has hides on its value alone',
         fieldVisible({ spec: { 'x-ui-when': { field: 'ghost', in: [undefined] } } }, {}, fields));
    t.check('the keys a change to which redraws the form', [...whenKeys(fields)], ['auth_mode']);
}

t.section('§5 Python quoting');
t.check('a plain name', pyRepr('oneOf'), "'oneOf'");
t.check('an apostrophe', pyRepr("it's"), '"it\'s"');
t.check('both quotes', pyRepr('a\'b"c'), "'a\\'b\"c'");
t.check('a backslash and a newline', pyRepr('a\\b\nc'), "'a\\\\b\\nc'");
t.check('booleans and null', [pyRepr(true), pyRepr(false), pyRepr(null)], ['True', 'False', 'None']);

t.done();
