/**
 * REFERENCE SYNTAXES — what a chip is recognised as, supplied by the consumer
 * (36 §3.6).
 *
 * A syntax is a RECOGNISER FOR DRAWING, not a grammar. Which references are
 * valid, and what one means, is the consumer's server's to say; a reference
 * it would refuse still draws as a chip (toned `known: false` by the
 * consumer's `describe`) and is kept exactly as text.
 *
 *     syntax.find(text)          → [{start, end, text, path}]
 *     syntax.format(path)        → the text that refers to `path`
 *     syntax.rename(text, map)   → `text` with every reference to an old step
 *                                  id in `map` pointed at its new id
 *     syntax.describe(match, ctx) → {label, tone, known}   ← the consumer sets this
 *
 * Three ship ready-made: TEMPLATE (`${a.b[0]}`), FORMULA (`[a.b]`) and
 * PARAMETER (`{{name}}`). They are plain objects on purpose: a consumer sets
 * `describe` — and, for a syntax whose paths name steps, `stepSegment` — on
 * the shared object, or makes its own with `createReferenceSyntax`.
 *
 * ══ WHICH SEGMENT NAMES A STEP ═════════════════════════════════════════
 *
 * `rename` rewrites only the segment that names a STEP, and only the consumer
 * knows which one that is — in one grammar it is the segment after a scope
 * word, in another the first. A syntax renames nothing until it is told:
 * `stepScope: 'scope'` says "the segment after `scope`", and `stepSegment:
 * (segments) => index` says anything else. Renaming every segment that happens
 * to equal an old id would rename a column called like a step.
 */

const TEMPLATE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+|\[\d+\]|\["[^"\\]*"\])*)\}/g;
const FORMULA_PATTERN = /\[([^[\]\n]+)\]/g;
const PARAMETER_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/**
 * A path's segments, as `{text, start, end}` over the path: `a.b[0]["c.d"]` →
 * `a`, `b`, `[0]`, `["c.d"]`. A dot inside brackets or quotes does not split.
 */
export function pathSegments(path) {
    const out = [];
    let start = 0;
    let depth = 0;
    let quote = false;
    const s = String(path);
    const push = (end) => { if (end > start) out.push({ text: s.slice(start, end), start, end }); };
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (quote) {
            if (ch === '\\') i += 1;
            else if (ch === '"') quote = false;
            continue;
        }
        if (ch === '"' && depth > 0) { quote = true; continue; }
        if (ch === '[') {
            if (depth === 0) { push(i); start = i; }
            depth += 1;
        } else if (ch === ']' && depth > 0) {
            depth -= 1;
            if (depth === 0) { push(i + 1); start = i + 1; }
        } else if (ch === '.' && depth === 0) {
            push(i);
            start = i + 1;
        }
    }
    push(s.length);
    return out;
}

/**
 * @param {object} o
 * @param {string} o.name
 * @param {RegExp} o.pattern      group 1 is the path; made global if it is not
 * @param {(path: string) => string} o.format
 * @param {(match: object, ctx: object) => {label?: string, tone?: string, known?: boolean}} [o.describe]
 * @param {string|string[]} [o.stepScope]   the segment after this word names a step
 * @param {(segments: string[]) => number} [o.stepSegment]  which segment names a step, or -1
 * @param {string} [o.tone]   its chips' tone when `describe` gives none — two syntaxes in one
 *                            field are two tones
 */
export function createReferenceSyntax({ name, pattern, format, describe = null, stepScope = null,
                                        stepSegment = null, tone = 'blue' }) {
    if (!(pattern instanceof RegExp)) throw new Error(`Reference syntax "${name}" needs a RegExp pattern.`);
    if (typeof format !== 'function') throw new Error(`Reference syntax "${name}" needs a format(path) function.`);
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const syntax = {
        name: String(name),
        pattern: new RegExp(pattern.source, flags),
        format,
        describe,
        tone,
        stepScope,
        stepSegment,

        find(text) {
            const out = [];
            if (typeof text !== 'string' || !text) return out;
            const re = new RegExp(syntax.pattern.source, syntax.pattern.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                if (m[0] === '') { re.lastIndex += 1; continue; }
                out.push({ start: m.index, end: m.index + m[0].length, text: m[0], path: m[1] ?? m[0] });
            }
            return out;
        },

        /** The index of the segment of `path` that names a step, or -1. */
        stepIndex(path) {
            const segs = pathSegments(path).map((s) => s.text);
            if (typeof syntax.stepSegment === 'function') {
                const i = syntax.stepSegment(segs);
                return Number.isInteger(i) && i >= 0 && i < segs.length ? i : -1;
            }
            const scopes = [].concat(syntax.stepScope ?? []);
            if (!scopes.length) return -1;
            return scopes.includes(segs[0]) && segs.length > 1 ? 1 : -1;
        },

        rename(text, map) {
            if (typeof text !== 'string' || !map) return text;
            const lookup = map instanceof Map ? map : new Map(Object.entries(map));
            if (!lookup.size) return text;
            const matches = syntax.find(text);
            if (!matches.length) return text;
            let out = '';
            let at = 0;
            for (const m of matches) {
                const i = syntax.stepIndex(m.path);
                if (i < 0) continue;
                const seg = pathSegments(m.path)[i];
                if (!lookup.has(seg.text)) continue;
                const path = m.path.slice(0, seg.start) + lookup.get(seg.text) + m.path.slice(seg.end);
                out += text.slice(at, m.start) + syntax.format(path);
                at = m.end;
            }
            return out + text.slice(at);
        },
    };
    return syntax;
}

export const TEMPLATE_REFERENCES = createReferenceSyntax({
    name: 'template', pattern: TEMPLATE_PATTERN, format: (path) => `\${${path}}`,
});
export const FORMULA_REFERENCES = createReferenceSyntax({
    name: 'formula', pattern: FORMULA_PATTERN, format: (path) => `[${path}]`,
});
export const PARAMETER_REFERENCES = createReferenceSyntax({
    name: 'parameter', pattern: PARAMETER_PATTERN, format: (name) => `{{${name}}}`, tone: 'violet',
});

/**
 * Every reference of every syntax in `text`, as non-overlapping spans in text
 * order, each carrying its `syntax`. Where two overlap, the one that starts
 * first wins, then the longer, then the syntax listed first.
 */
export function findReferences(text, syntaxes = []) {
    const all = [];
    syntaxes.forEach((syntax, rank) => {
        for (const m of syntax?.find?.(text) || []) all.push({ ...m, syntax, rank });
    });
    all.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)) || (a.rank - b.rank));
    const out = [];
    let end = -1;
    for (const m of all) {
        if (m.start < end) continue;
        out.push({ start: m.start, end: m.end, text: m.text, path: m.path, syntax: m.syntax });
        end = m.end;
    }
    return out;
}

/** `text` cut into `{text}` and `{ref}` parts, in order — what a chip input draws. */
export function tokenize(text, syntaxes = []) {
    const parts = [];
    let at = 0;
    for (const m of findReferences(text, syntaxes)) {
        if (m.start > at) parts.push({ kind: 'text', text: text.slice(at, m.start) });
        parts.push({ kind: 'ref', text: m.text, match: m });
        at = m.end;
    }
    if (at < String(text ?? '').length) parts.push({ kind: 'text', text: text.slice(at) });
    return parts;
}

/** How a chip reads: the syntax's `describe`, else the path, in the syntax's tone, known. */
export function describeReference(match, ctx = {}) {
    const d = typeof match?.syntax?.describe === 'function' ? match.syntax.describe(match, ctx) : null;
    return {
        label: d?.label ?? match?.path ?? match?.text ?? '',
        tone: d?.tone ?? match?.syntax?.tone ?? null,
        known: d?.known !== false,
    };
}

/** Every syntax name in `names` that `references` (name → syntax) holds, as syntax objects. */
export function resolveSyntaxes(names, references) {
    const map = references instanceof Map ? references : new Map(Object.entries(references || {}));
    return [].concat(names ?? []).map((n) => map.get(n)).filter(Boolean);
}
