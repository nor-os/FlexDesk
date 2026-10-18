/**
 * THE STEP CATALOGUE — the list of step types a consumer passes in (36 §3.1).
 *
 * Its field names are the consumer's WIRE names, so a server's node-type list
 * is handed to an editor as it arrives:
 *
 *     { type_id, label, category, role, description, icon,
 *       ports: [{ name, direction: 'input'|'output', port_type: 'FLOW'|'DATA',
 *                 label, required, multiple }],
 *       config_schema, unavailable }
 *
 * Any other key a type carries is kept and ignored.
 *
 * ══ A TYPE MAY DRAW ITS OWN BODY ═══════════════════════════════════════
 *
 * Four optional keys are read by the canvas editor, and only by it:
 *
 *     render(body, node, ctx)   fills the node's body, below its ports, once
 *     update(body, node, ctx)   brings that body up to date on every repaint
 *     size: {w, h}              the node's box in px (either may be left out)
 *     accent                    a tone (`dom.js`'s TONES) the node is marked in
 *
 * A type without them is drawn as every other step is. A `size` that is not
 * positive numbers, an `accent` that is not a tone, a `render` or `update`
 * that is not a function: each is a line in `problems`, and that key is not
 * used.
 *
 * ══ DECLARED PORT ORDER IS MEANING ═════════════════════════════════════
 *
 * A lane reads an operation's first FLOW input as its own lane and the rest as
 * joined lanes; an outline draws a step's other FLOW outputs, after its
 * continuation, as arms in declared order. So `inputs()` and `outputs()` keep
 * the order the type DECLARES and never sort: an earlier pipeline engine
 * sorted a join's inputs by port name, and `in_bottom` came before `in_top`.
 *
 * ══ TONES, NOT COLOURS ═════════════════════════════════════════════════
 *
 * A category names a tone (`dom.js`'s TONES); the stylesheet maps tones to
 * tokens. A category's `layout: 'grid'` draws its entries two to a row in the
 * step picker (the mocks' Data, Integration and Utility groups).
 *
 * ══ A BROKEN TYPE IS LISTED, NEVER THROWN ══════════════════════════════
 *
 * A duplicate id (the first is kept), a type without an id, a port without a
 * name (the port is dropped), a schema outside the subset (the type is kept,
 * its form drawn from what can be drawn): each is a line in `problems`, so a
 * consumer's catalogue with one bad entry still opens an editor.
 */

import { checkSettingsSchema } from './settings_schema.js';
import { TONES } from './dom.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The default id stem for a new step: the type id, made safe for an id. */
export function defaultIdBase(type) {
    return String(type?.type_id ?? type ?? 'step');
}

function cleanStem(stem) {
    return String(stem ?? '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'step';
}

const positive = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** A type's `size` as `{w, h}` (either null), or null — with the problem, if any. */
function readSize(raw) {
    if (raw === undefined || raw === null) return { size: null, problem: null };
    const refused = { size: null, problem: 'size must be {w, h} in positive pixels; it is not used.' };
    if (!isPlainObject(raw)) return refused;
    const w = raw.w === undefined ? null : positive(raw.w);
    const h = raw.h === undefined ? null : positive(raw.h);
    if ((raw.w !== undefined && w === null) || (raw.h !== undefined && h === null) || (w === null && h === null)) {
        return refused;
    }
    return { size: Object.freeze({ w, h }), problem: null };
}

function normalisePort(p) {
    return {
        ...p,
        name: String(p.name),
        direction: p.direction === 'output' ? 'output' : 'input',
        port_type: p.port_type ? String(p.port_type) : 'FLOW',
        label: p.label ?? String(p.name),
        required: Boolean(p.required),
        multiple: Boolean(p.multiple),
    };
}

/**
 * @param {object[]} types     the consumer's step types
 * @param {object} [options]
 * @param {{id: string, label: string, tone?: string, layout?: 'list'|'grid'}[]} [options.categories]
 * @param {(type: object) => string} [options.idBase]  a new step's id stem
 */
export function createStepCatalogue(types, { categories = [], idBase = defaultIdBase } = {}) {
    const problems = [];
    const byId = new Map();
    const order = [];
    const sizes = new Map();
    const accents = new Map();

    for (const raw of Array.isArray(types) ? types : []) {
        if (!isPlainObject(raw)) {
            problems.push({ type_id: null, message: 'A step type must be an object.' });
            continue;
        }
        const id = raw.type_id;
        if (typeof id !== 'string' || !id) {
            problems.push({ type_id: null, message: `A step type has no type_id (label: ${raw.label ?? '—'}).` });
            continue;
        }
        if (byId.has(id)) {
            problems.push({ type_id: id, message: `A second step type is called "${id}"; the first is kept.` });
            continue;
        }
        const ports = [];
        for (const p of Array.isArray(raw.ports) ? raw.ports : []) {
            if (!isPlainObject(p) || typeof p.name !== 'string' || !p.name) {
                problems.push({ type_id: id, message: `"${id}" declares a port without a name; it is left out.` });
                continue;
            }
            ports.push(normalisePort(p));
        }
        const schema = isPlainObject(raw.config_schema) ? raw.config_schema : {};
        const refused = raw.config_schema === undefined ? null : checkSettingsSchema(raw.config_schema);
        if (refused) problems.push({ type_id: id, message: `"${id}"'s settings schema: ${refused}` });
        const type = Object.freeze({
            ...raw,
            label: raw.label ?? id,
            category: raw.category ?? null,
            role: raw.role || 'step',
            description: raw.description ?? '',
            icon: raw.icon ?? '',
            ports: Object.freeze(ports.map((p) => Object.freeze(p))),
            config_schema: schema,
            unavailable: raw.unavailable ?? null,
        });
        byId.set(id, type);
        order.push(type);
        const { size, problem } = readSize(raw.size);
        if (problem) problems.push({ type_id: id, message: `"${id}"'s ${problem}` });
        if (size) sizes.set(id, size);
        if (raw.accent !== undefined && raw.accent !== null) {
            if (TONES.includes(raw.accent)) accents.set(id, raw.accent);
            else problems.push({ type_id: id, message: `"${id}"'s accent "${raw.accent}" is not a tone; it is not used.` });
        }
        for (const hook of ['render', 'update']) {
            if (raw[hook] !== undefined && typeof raw[hook] !== 'function') {
                problems.push({ type_id: id, message: `"${id}"'s ${hook} is not a function; it is not used.` });
            }
        }
    }

    const cats = (Array.isArray(categories) ? categories : []).filter(isPlainObject).map((c) => Object.freeze({
        id: String(c.id),
        label: c.label ?? String(c.id),
        tone: TONES.includes(c.tone) ? c.tone : 'grey',
        layout: c.layout === 'grid' ? 'grid' : 'list',
    }));
    const catIndex = new Map(cats.map((c, i) => [c.id, i]));
    // A type whose category nobody listed is not lost: it goes under a group of
    // its own category id, after the listed ones, in the order first seen.
    const extra = [];
    for (const t of order) {
        if (t.category !== null && !catIndex.has(t.category) && !extra.some((c) => c.id === t.category)) {
            extra.push(Object.freeze({ id: String(t.category), label: String(t.category), tone: 'grey', layout: 'list' }));
        }
    }
    if (order.some((t) => t.category === null)) {
        extra.push(Object.freeze({ id: '', label: '', tone: 'grey', layout: 'list' }));
    }
    const allCats = Object.freeze([...cats, ...extra]);
    const rank = (t) => {
        const id = t.category === null ? '' : t.category;
        return allCats.findIndex((c) => c.id === id);
    };
    const sorted = [...order].sort((a, b) => (rank(a) - rank(b))
        || String(a.label).localeCompare(String(b.label)));

    const portsOf = (typeId, direction, flow) => {
        const t = byId.get(typeId);
        if (!t) return [];
        return t.ports.filter((p) => p.direction === direction && (!flow || p.port_type === 'FLOW'));
    };

    return Object.freeze({
        problems: Object.freeze(problems.map((p) => Object.freeze(p))),
        categories: allCats,
        get: (typeId) => byId.get(typeId) ?? null,
        has: (typeId) => byId.has(typeId),
        list: () => [...sorted],
        byCategory: () => allCats
            .map((category) => ({ category, types: sorted.filter((t) => (t.category ?? '') === category.id) }))
            .filter((g) => g.types.length > 0),
        role: (typeId) => byId.get(typeId)?.role || 'step',
        category: (typeId) => {
            const t = byId.get(typeId);
            return t ? allCats.find((c) => c.id === (t.category ?? '')) ?? null : null;
        },
        tone: (typeId) => {
            const t = byId.get(typeId);
            return (t && allCats.find((c) => c.id === (t.category ?? ''))?.tone) || 'grey';
        },
        /** The type's own box, `{w, h}` (either null), or null when it has none. */
        size: (typeId) => sizes.get(typeId) ?? null,
        /** The type's accent tone, or null when it has none. */
        accent: (typeId) => accents.get(typeId) ?? null,
        /** The type's `{render, update}` (`update` may be null), or null when it has no `render`. */
        body: (typeId) => {
            const t = byId.get(typeId);
            const render = typeof t?.render === 'function' ? t.render : null;
            return render ? { render, update: typeof t.update === 'function' ? t.update : null } : null;
        },
        inputs: (typeId, { flow = false } = {}) => portsOf(typeId, 'input', flow),
        outputs: (typeId, { flow = false } = {}) => portsOf(typeId, 'output', flow),
        port: (typeId, name, direction) => byId.get(typeId)?.ports
            .find((p) => p.name === name && (!direction || p.direction === direction)) ?? null,
        /** A new step's id stem for `typeId`, safe to put in an id. */
        idBase: (typeId) => cleanStem(idBase(byId.get(typeId) ?? { type_id: typeId })),
    });
}
