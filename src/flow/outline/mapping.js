/**
 * THE BLOCK MAPPING — which step roles the outline draws as blocks, and how
 * their ports read (36 §6.2). PURE: no DOM.
 *
 * The consumer says it; the outline guesses nothing about a domain:
 *
 *     blocks: {
 *       start:  { role: 'start', label: 'When it runs' },
 *       end:    { role: 'end' },
 *       step:   { input: 'in', continue: 'out' },
 *       branch: { role: 'branch', arms: { true: 'Then', false: 'Otherwise' },
 *                 entry: { label: 'If … otherwise', sub: 'Condition' } },
 *       fanout: { role: 'fanout', join: { role: 'join', type: 'merge', input: 'in', output: 'out',
 *                                         field: 'join', foot: { all: '…', any: '…' } },
 *                 arm: 'Branch {n}', addArm: 'Add a branch', entry: { … } },
 *       loop:   { role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
 *                 foot: 'Next row', skip: 'Go on with the next row', addInside: 'Add a step to the loop',
 *                 entry: { … } },
 *       arms:   { error: { label: (step) => `If ${step.label} fails`, unconnected: 'fail',
 *                          setting: { label, unconnected, connected: (arm) => … } } },
 *       types:  { 'http-request': { arms: { error: { label: 'If the request fails' } } } },
 *     }
 *
 * `role` on each block names the CATALOGUE role it draws, so a consumer whose
 * types use other role words maps them here. A role nobody mapped is drawn as
 * an ordinary step.
 *
 * ══ PORTS, BY NAME AND THEN BY ORDER ═══════════════════════════════════
 *
 * An ordinary step is entered by `step.input` and carries on by
 * `step.continue`; a type without a port of that name uses its first FLOW
 * input or output instead, in DECLARED order. Every other FLOW output of an
 * ordinary step is an ARM, in declared order — its words from `types` (per
 * type), then `arms` (per port name), then the port's own label.
 *
 * `unconnected` is what the consumer's runtime does with a port nothing is
 * connected to, and only the consumer can say it: `'fail'` (an error port the
 * run cannot go on from) or `'stop'` (the path simply ends). It decides the
 * words of the port's setting; the outline never assumes one.
 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const DEFAULTS = Object.freeze({
    start: { role: 'start', label: null },
    end: { role: 'end' },
    step: { input: 'in', continue: 'out' },
    branch: { role: 'branch', arms: {}, unconnected: 'stop', entry: null, note: null },
    fanout: {
        role: 'fanout',
        join: { role: 'join', type: null, input: 'in', output: 'out', field: 'join', foot: {}, choices: {} },
        arm: 'Branch {n}', addArm: 'Add a branch', entry: null, note: null,
    },
    loop: {
        role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
        foot: 'Next item', skip: 'Go on with the next item', addInside: 'Add a step inside', entry: null, note: null,
    },
    arms: {},
    types: {},
    add: 'Add a step',
});

const DEFAULT_SETTING = Object.freeze({
    stop: 'Stop here',
    fail: 'Fail the run',
    connected: (arm) => `Run the steps under “${arm}”`,
});

/** `fn(arg)` when it is a function, else itself; `fallback` for nullish. */
function word(v, arg, fallback = '') {
    const r = typeof v === 'function' ? v(arg) : v;
    return r === undefined || r === null ? fallback : String(r);
}

function merged(base, over) {
    const out = { ...base };
    if (isObject(over)) for (const [k, v] of Object.entries(over)) out[k] = v;
    return out;
}

/**
 * The consumer's mapping laid over the defaults, read against a catalogue.
 * Accepts its own result again unchanged.
 */
export function createBlockMapping(blocks = {}, catalogue = null) {
    if (blocks && blocks.__outlineMapping) return blocks;
    const b = isObject(blocks) ? blocks : {};
    const start = merged(DEFAULTS.start, b.start);
    const end = merged(DEFAULTS.end, b.end);
    const step = merged(DEFAULTS.step, b.step);
    const branch = merged(DEFAULTS.branch, b.branch);
    const fanout = merged(DEFAULTS.fanout, b.fanout);
    fanout.join = merged(DEFAULTS.fanout.join, b.fanout?.join);
    const loop = merged(DEFAULTS.loop, b.loop);
    loop.ports = merged(DEFAULTS.loop.ports, b.loop?.ports);
    const arms = isObject(b.arms) ? b.arms : {};
    const types = isObject(b.types) ? b.types : {};

    const roleKind = new Map([
        [start.role, 'start'], [end.role, 'end'], [branch.role, 'branch'], [fanout.role, 'fanout'],
        [fanout.join.role, 'join'], [loop.role, 'loop'],
    ]);

    const typeOf = (typeId) => catalogue?.get?.(typeId) ?? null;
    const flowPorts = (typeId, direction) => (catalogue
        ? (direction === 'input' ? catalogue.inputs(typeId, { flow: true }) : catalogue.outputs(typeId, { flow: true }))
        : []).map((p) => p.name);
    const named = (typeId, direction, want) => {
        const ports = flowPorts(typeId, direction);
        if (want && ports.includes(want)) return want;
        return ports[0] ?? null;
    };

    /** What a type is drawn as: start, end, branch, fanout, join, loop or step. */
    function kindOf(typeId) {
        const role = catalogue?.role ? catalogue.role(typeId) : 'step';
        return roleKind.get(role) ?? 'step';
    }

    function override(typeId) {
        return isObject(types[typeId]) ? types[typeId] : {};
    }

    /** The FLOW input a step is entered by. */
    function input(typeId) {
        const k = kindOf(typeId);
        if (k === 'loop') return named(typeId, 'input', loop.ports.entry);
        if (k === 'join') return named(typeId, 'input', override(typeId).input ?? fanout.join.input);
        return named(typeId, 'input', override(typeId).input ?? step.input);
    }

    /** The FLOW output a step carries on by, or null (a branch, an end). */
    function cont(typeId) {
        const k = kindOf(typeId);
        if (k === 'branch' || k === 'end' || k === 'fanout') return null;
        if (k === 'loop') return flowPorts(typeId, 'output').includes(loop.ports.done) ? loop.ports.done : null;
        if (k === 'join') return named(typeId, 'output', override(typeId).continue ?? fanout.join.output);
        return named(typeId, 'output', override(typeId).continue ?? step.continue);
    }

    /** A step's ARM ports: its other FLOW outputs, in declared order. */
    function armPorts(typeId) {
        const k = kindOf(typeId);
        const outs = flowPorts(typeId, 'output');
        if (k === 'branch') return outs;
        if (k === 'fanout' || k === 'end') return [];
        if (k === 'loop') return outs.filter((p) => p !== loop.ports.body && p !== loop.ports.done);
        const c = cont(typeId);
        return outs.filter((p) => p !== c);
    }

    function portLabel(typeId, port) {
        return catalogue?.port?.(typeId, port, 'output')?.label ?? port;
    }

    /** The step as an arm's `label` function reads it. */
    function stepView(node) {
        const type = typeOf(node?.type);
        return { id: node?.id, label: node?.label || type?.label || node?.id || '', node, type };
    }

    function armSpec(node, port) {
        const o = override(node?.type).arms?.[port];
        const g = arms[port];
        return { ...(isObject(g) ? g : {}), ...(isObject(o) ? o : {}) };
    }

    /** An ordinary step's arm words: per type, then per port, then the port's label. */
    function armLabel(node, port) {
        const spec = armSpec(node, port);
        return word(spec.label, stepView(node), portLabel(node?.type, port));
    }

    /** What the consumer's runtime does with this arm's port left unconnected. */
    function armUnconnected(node, port) {
        const spec = armSpec(node, port);
        return spec.unconnected === 'fail' ? 'fail' : 'stop';
    }

    /** The words of the arm's setting (36 §6.5): its label, the unconnected choice, the connected one. */
    function armSetting(node, port) {
        const spec = armSpec(node, port);
        const g = isObject(arms[port]?.setting) ? arms[port].setting : {};
        const o = isObject(override(node?.type).arms?.[port]?.setting) ? override(node?.type).arms[port].setting : {};
        const setting = { ...g, ...o };
        const label = armLabel(node, port);
        const how = armUnconnected(node, port);
        return {
            label: word(setting.label, stepView(node), label),
            unconnected: word(setting.unconnected, stepView(node), DEFAULT_SETTING[how]),
            connected: word(setting.connected ?? DEFAULT_SETTING.connected, label, ''),
            meaning: how,
            tone: spec.tone ?? (how === 'fail' ? 'fail' : 'arm'),
        };
    }

    /** A branch's arm words (Then, Otherwise; a Switch's port labels). */
    function branchArmLabel(node, port) {
        const o = override(node?.type).arms?.[port];
        if (isObject(o) && o.label !== undefined) return word(o.label, stepView(node), port);
        if (typeof o === 'string') return o;
        const g = branch.arms?.[port];
        if (g !== undefined) return word(isObject(g) ? g.label : g, stepView(node), portLabel(node?.type, port));
        return portLabel(node?.type, port);
    }

    /** The tone a branch's arm is drawn in: 'then', 'else' or 'arm'. */
    function branchArmTone(node, port, index) {
        const g = branch.arms?.[port];
        if (isObject(g) && g.tone) return g.tone;
        return index === 0 ? 'then' : 'else';
    }

    function fanoutArmLabel(n) {
        return word(fanout.arm, n, `Branch ${n}`).replace('{n}', String(n));
    }

    /** The type a new Parallel's closing step is made from. */
    function joinType() {
        if (fanout.join.type && catalogue?.has?.(fanout.join.type)) return fanout.join.type;
        return catalogue?.list?.().find((t) => kindOf(t.type_id) === 'join')?.type_id ?? null;
    }

    function joinValue(joinNode) {
        const field = fanout.join.field;
        const v = joinNode?.config?.[field];
        if (v !== undefined) return v;
        const def = typeOf(joinNode?.type)?.config_schema?.properties?.[field]?.default;
        return def === undefined ? 'all' : def;
    }

    function joinFoot(joinNode, S) {
        const v = joinValue(joinNode);
        const foot = fanout.join.foot?.[v];
        if (foot !== undefined) return word(foot, v, '');
        return v === 'any' ? (S?.joinFootAny ?? 'Then go on when the first finishes')
            : (S?.joinFootAll ?? 'Then wait for every branch');
    }

    /** A block entry's words in the step picker. */
    function entryFor(typeId) {
        const t = typeOf(typeId);
        const k = kindOf(typeId);
        const own = override(typeId).entry;
        const blockEntry = k === 'branch' ? branch.entry : k === 'fanout' ? fanout.entry : k === 'loop' ? loop.entry : null;
        // A block's entry words belong to the block's one type; with several
        // types of one role, only a type that names its own entry gets them.
        const shared = blockEntry && catalogue?.list?.().filter((x) => kindOf(x.type_id) === k).length === 1
            ? blockEntry : null;
        const e = { ...(isObject(shared) ? shared : {}), ...(isObject(own) ? own : {}) };
        return {
            label: e.label ?? t?.label ?? typeId,
            sub: e.sub ?? (e.label ? (t?.label ?? '') : ''),
            description: e.description ?? t?.description ?? '',
        };
    }

    return Object.freeze({
        __outlineMapping: true,
        start, end, step, branch, fanout, loop,
        loopPorts: Object.freeze({ ...loop.ports }),
        kindOf, input, cont, armPorts, armLabel, armUnconnected, armSetting,
        branchArmLabel, branchArmTone, fanoutArmLabel, joinType, joinValue, joinFoot, entryFor, stepView,
        startLabel: (S) => start.label ?? S?.flowStart ?? 'Start',
        loopFoot: (node) => word(loop.foot, stepView(node), 'Next item'),
        loopSkip: (node) => word(loop.skip, stepView(node), 'Go on with the next item'),
        loopAddInside: (node) => word(loop.addInside, stepView(node), 'Add a step inside'),
        fanoutAddArm: (node) => word(fanout.addArm, stepView(node), 'Add a branch'),
        addLabel: () => word(b.add ?? DEFAULTS.add, null, 'Add a step'),
        note: (kind, node) => {
            const n = kind === 'branch' ? branch.note : kind === 'fanout' ? fanout.note : kind === 'loop' ? loop.note : null;
            return n === null || n === undefined ? null : word(n, stepView(node), '');
        },
        joinField: fanout.join.field,
        joinChoices: fanout.join.choices || {},
    });
}

/** What a step is called on the screen: its label, else its type's, else its id. */
export function displayName(node, catalogue) {
    if (!node) return '';
    return node.label || catalogue?.get?.(node.type)?.label || node.id;
}
