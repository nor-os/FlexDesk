/**
 * THE SETTINGS-SCHEMA SUBSET a step type's `config_schema` may use (36 §3.2).
 *
 * The subset is the one the consumer's SERVER enforces — the keyword set, the
 * type names and every refusal sentence are a port of a Python module
 * (`check_schema` in Tables' workflow engine; the data-flow core's
 * `settings_schema` ports the same one), and a fixture of schemas with both
 * verdicts (`tests/fixtures/flow_kit_settings_schema.json`) is read by both
 * sides so they cannot drift:
 *
 *   type (one name or a list), enum, const, required, properties,
 *   additionalProperties (boolean only), items, minItems/maxItems,
 *   minimum/maximum, minLength/maxLength, format: "uuid";
 *   annotations title, description, default, examples; and any `x-` hint.
 *
 * `oneOf`, `anyOf`, `$ref` and `pattern` are refused for reasons that hold in a
 * browser too: a regular expression is read three ways by three engines (`$`
 * also matches before a final newline in Python and .NET, not in JavaScript),
 * and a union is exactly the construct a generated form cannot draw honestly.
 *
 * THE KIT DRAWS FROM A SCHEMA AND NEVER VALIDATES A VALUE AGAINST ONE: whether
 * a setting is valid is the server's answer, drawn as a finding.
 *
 * ══ SENTENCE FOR SENTENCE ══════════════════════════════════════════════
 *
 * `checkSettingsSchema` returns the FIRST refusal the Python raises, in the
 * Python's words, or `null`. Two quirks are kept on purpose, because "the same
 * sentence" is the contract and a tidier one here would be a drift there:
 *
 *  - four refusals (`properties`, `additionalProperties`, `format`,
 *    `required`) name the path WITHOUT the `<root>` fallback, so at the root
 *    they read `": properties must be an object."`;
 *  - names are quoted the way Python's `repr` quotes them (`'oneOf'`, and
 *    `"it's"` for a name holding an apostrophe).
 *
 * One difference cannot be closed from here: a JavaScript object lists keys
 * that look like integers ("1", "2") first, where a Python dict keeps the
 * document's order. Which refusal is FIRST can then differ for a schema with
 * integer-like property names; the fixture holds none.
 */

export const SETTINGS_SCHEMA_ANNOTATIONS = Object.freeze(['title', 'description', 'default', 'examples']);
export const SETTINGS_SCHEMA_KEYWORDS = Object.freeze([
    'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items',
    'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'format',
]);
export const SETTINGS_SCHEMA_TYPES = Object.freeze(['object', 'array', 'string', 'integer', 'number',
                                                    'boolean', 'null']);

/** The `x-ui-` hints the kit reads (36 §3.2); the server ignores every `x-` key. */
export const UI_HINTS = Object.freeze(['x-ui-widget', 'x-ui-references', 'x-ui-when', 'x-ui-placeholder',
                                       'x-ui-enum-labels', 'x-ui-multiline', 'x-ui-fold']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Python's `repr` of the values a schema refusal quotes. */
export function pyRepr(value) {
    if (value === null || value === undefined) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
        const q = value.includes("'") && !value.includes('"') ? '"' : "'";
        let out = '';
        for (const ch of value) {
            const code = ch.codePointAt(0);
            if (ch === '\\') out += '\\\\';
            else if (ch === q) out += `\\${q}`;
            else if (ch === '\n') out += '\\n';
            else if (ch === '\r') out += '\\r';
            else if (ch === '\t') out += '\\t';
            else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
            else out += ch;
        }
        return q + out + q;
    }
    return JSON.stringify(value);
}

/**
 * The first way `schema` leaves the subset, as the server's sentence, or
 * `null` when it is inside it.
 */
export function checkSettingsSchema(schema, path = '') {
    const where = path || '<root>';
    if (!isPlainObject(schema)) return `${where}: a schema must be an object.`;
    for (const [key, value] of Object.entries(schema)) {
        if (SETTINGS_SCHEMA_ANNOTATIONS.includes(key) || key.startsWith('x-')) continue;
        if (!SETTINGS_SCHEMA_KEYWORDS.includes(key)) return `${where}: the keyword ${pyRepr(key)} is not supported.`;
        if (key === 'type') {
            for (const n of (Array.isArray(value) ? value : [value])) {
                if (!SETTINGS_SCHEMA_TYPES.includes(n)) return `${where}: unknown type ${pyRepr(n)}.`;
            }
        } else if (key === 'properties') {
            if (!isPlainObject(value)) return `${path}: properties must be an object.`;
            for (const [name, sub] of Object.entries(value)) {
                const refused = checkSettingsSchema(sub, path ? `${path}.${name}` : name);
                if (refused) return refused;
            }
        } else if (key === 'items') {
            const refused = checkSettingsSchema(value, `${path}[]`);
            if (refused) return refused;
        } else if (key === 'additionalProperties' && typeof value !== 'boolean') {
            return `${path}: additionalProperties must be true or false.`;
        } else if (key === 'format' && value !== 'uuid') {
            return `${path}: only format 'uuid' is supported.`;
        } else if (key === 'required' && !(Array.isArray(value) && value.every((v) => typeof v === 'string'))) {
            return `${path}: required must be a list of names.`;
        }
    }
    return null;
}

/** The settings a schema declares, in the schema's order: `[{key, spec, required}]`. */
export function fieldsFromSchema(schema) {
    const props = isPlainObject(schema?.properties) ? schema.properties : {};
    const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
    return Object.entries(props).map(([key, spec]) => ({
        key, spec: isPlainObject(spec) ? spec : {}, required: required.has(key),
    }));
}

/** A setting's label: its `title`, else its key in words (`max_attempts` → "Max attempts"). */
export function titleOf(key, spec = {}) {
    if (spec?.title) return String(spec.title);
    const words = String(key).replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The first JSON-Schema type a spec names (a list's first), or undefined. */
export function primaryType(spec) {
    return Array.isArray(spec?.type) ? spec.type[0] : spec?.type;
}

/** Every type a spec admits, as a list. */
export function admittedTypes(spec) {
    return [].concat(spec?.type ?? []);
}

/**
 * Is `field` drawn while the step's settings are `value`? Its `x-ui-when`
 * (`{field, in}`) names a sibling; the sibling's stored value — or, absent,
 * its schema `default`, which is what the server will apply — must be one of
 * `in`. A hint that names no sibling, or is malformed, never hides a field: a
 * setting nobody can reach is worse than one drawn too often.
 */
export function fieldVisible(field, value, fields = []) {
    const when = field?.spec?.['x-ui-when'];
    if (!isPlainObject(when) || typeof when.field !== 'string' || !Array.isArray(when.in)) return true;
    const sibling = fields.find((f) => f.key === when.field);
    const stored = value && typeof value === 'object' ? value[when.field] : undefined;
    const current = stored !== undefined ? stored : sibling?.spec?.default;
    return when.in.some((v) => v === current);
}

/** The fields drawn for `value`, honouring every `x-ui-when`. */
export function visibleFields(fields, value) {
    return fields.filter((f) => fieldVisible(f, value, fields));
}

/** The keys some field's `x-ui-when` reads — a change to one of them repaints the panel. */
export function whenKeys(fields) {
    const keys = new Set();
    for (const f of fields) {
        const when = f?.spec?.['x-ui-when'];
        if (isPlainObject(when) && typeof when.field === 'string') keys.add(when.field);
    }
    return keys;
}

/** A spec's `x-ui-enum-labels` word for `v`, or `v` as text. */
export function enumLabel(spec, v) {
    const words = spec?.['x-ui-enum-labels'];
    return isPlainObject(words) && words[v] !== undefined ? String(words[v]) : String(v);
}
