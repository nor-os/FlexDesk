/**
 * THE CANVAS KERNEL'S GENERIC GRAPH LAYER (36 §4.3) — NodePlatform,
 * ConnectorRouter and HistoryService, the half of the old graph layer that
 * knows nothing about what a node is. PURE: runs under plain node.
 *
 * The two things in a graph layer that fail SILENTLY when they are wrong are
 * tested hardest: a legality guard that lets a bad drop through (a server
 * error a user reads as a broken editor), and an undo service that accepts an
 * action nobody declared (a Ctrl+Z that reaches what it must not).
 *
 *   §1  NodePlatform: hydrate keeps the embedder's keys and copies the
 *       position; get/all/port; setPosition and setCollapsed emit unless
 *       silent; a collapsed node offers what `collapsedPorts` says, by
 *       default nothing; on() returns an unsubscribe
 *   §2  ConnectorRouter's generic refusals, IN ORDER — an end gone, a port
 *       gone, a disabled port (its own reason), a self-reference, capacity
 *       (applied and pending edges, counted through `endsOf`) — each with its
 *       sentence, the sentences the embedder's to replace
 *   §3  …and only THEN the policy: it sees the context, its verdict is the
 *       answer, an OFFER is a yes, nothing returned is a plain yes;
 *       `disabledEnds` asks only of the source
 *   §4  stage / unstage / edgesFor / hydrate; remapNodeConnections keeps what
 *       maps and REPORTS what it drops
 *   §5  HistoryService: the hydration gate, record/undo/redo through `apply`,
 *       the closed list (the embedder's sentence when it gives one), a batch
 *       as one entry undone in reverse, the limit, reset, adopt
 *   §6  the constructor trap: an incomplete dependency set fails LOUDLY at
 *       construction — `actions`, `apply`, and a subclass's own `requires`
 *   §7  a diagram's rules as a SUBCLASS — the shape a consumer writes: its
 *       own node building, a collapsed node keeping its key ports, a policy
 *       with an offer and its own sentences, a delta history over its own
 *       actions — so the generic layer is shown to be enough
 *
 *     node tests/canvas_graph.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { NodePlatform } from '../src/canvas/graph/node_platform.js';
import { ConnectorRouter, CONNECTOR_STRINGS } from '../src/canvas/graph/connector_router.js';
import { HistoryService } from '../src/canvas/graph/history_service.js';

const t = assertions('canvas kernel — graph layer');

const port = (id, extra = {}) => ({ id, role: 'port', direction: 'both', type: 'any', allowMultiple: true,
                                    maxConnections: Infinity, disabled: false, meta: {}, ...extra });
const NODES = [
    { id: 'a', label: 'A', position: { x: 10, y: 20 }, ports: [port('out'), port('one', { maxConnections: 1 }),
                                                             port('off', { disabled: true, disabledReason: 'Off is decorative.' }),
                                                             port('dead', { disabled: true })] },
    { id: 'b', label: 'B', ports: [port('in'), port('single', { allowMultiple: false })], extra: { kept: true } },
];

t.section('§1 NodePlatform');
{
    const platform = new NodePlatform();
    const events = [];
    const off = platform.on('moved', (e) => events.push(['moved', e]));
    platform.on('hydrated', (e) => events.push(['hydrated', e]));
    platform.on('collapsed', (e) => events.push(['collapsed', e]));
    platform.hydrate(NODES);
    t.check('hydrate emits the count', events.shift(), ['hydrated', { count: 2 }]);
    t.check('a missing position is (0, 0), a missing size null', [platform.get('b').position, platform.get('b').size],
            [{ x: 0, y: 0 }, null]);
    t.ok('the embedder\'s keys are kept', platform.get('b').label === 'B' && platform.get('b').extra.kept === true);
    t.ok('the position is a COPY', platform.get('a').position !== NODES[0].position);
    t.check('all() in hydration order', platform.all().map((n) => n.id), ['a', 'b']);
    t.check('port(node, port)', platform.port('a', 'one').maxConnections, 1);
    t.ok('an unknown port is null', platform.port('a', 'nope') === null && platform.port('zz', 'out') === null);
    t.check('setPosition returns where it was, and emits', [platform.setPosition('a', { x: 5, y: 6 }), events.shift()],
            [{ x: 10, y: 20 }, ['moved', { id: 'a', before: { x: 10, y: 20 }, after: { x: 5, y: 6 } }]]);
    platform.setPosition('a', { x: 7, y: 7 }, { silent: true });
    t.ok('a silent move emits nothing', events.length === 0 && platform.get('a').position.x === 7);
    t.ok('setPosition on an unknown node is null', platform.setPosition('zz', { x: 0, y: 0 }) === null);
    off();
    platform.setPosition('a', { x: 1, y: 1 });
    t.ok('on() returns an unsubscribe', events.length === 0);
    t.check('visible ports of an open node: all of them', platform.visiblePorts('a').map((p) => p.id), ['out', 'one', 'off', 'dead']);
    platform.setCollapsed('a', true);
    t.check('setCollapsed emits', events.shift(), ['collapsed', { id: 'a', before: false, after: true }]);
    t.check('a collapsed node offers nothing by default', platform.visiblePorts('a'), []);
    const keeping = new NodePlatform({ collapsedPorts: (n) => n.ports.filter((p) => p.id === 'out') });
    keeping.hydrate(NODES.map((n) => ({ ...n, collapsed: true })));
    t.check('…or what collapsedPorts says it keeps', keeping.visiblePorts('a').map((p) => p.id), ['out']);
    t.check('an unknown node has no visible ports', keeping.visiblePorts('zz'), []);
    platform.hydrate([{ id: 'c' }, null, { label: 'no id' }]);
    t.check('hydrate replaces the graph, and skips what has no id', platform.all().map((n) => n.id), ['c']);
}

function build(opts = {}) {
    const platform = new NodePlatform();
    platform.hydrate(NODES);
    const router = new ConnectorRouter({ platform, ...opts });
    return { platform, router };
}
const end = (nodeId, portId) => ({ nodeId, portId });

t.section('§2 the generic refusals, in order');
{
    const { router } = build();
    const no = (v) => (v.ok ? 'ALLOWED' : v.reason);
    t.check('an end gone', no(router.canConnect(end('zz', 'out'), end('b', 'in'))), CONNECTOR_STRINGS.nodeGone);
    t.check('a port gone', no(router.canConnect(end('a', 'nope'), end('b', 'in'))), CONNECTOR_STRINGS.portGone);
    t.check('a disabled port, with its own reason', no(router.canConnect(end('a', 'off'), end('b', 'in'))), 'Off is decorative.');
    t.check('a disabled port with no reason of its own', no(router.canConnect(end('a', 'dead'), end('b', 'in'))),
            CONNECTOR_STRINGS.portDisabled);
    t.check('a disabled TARGET refuses too, by default', no(router.canConnect(end('b', 'in'), end('a', 'off'))), 'Off is decorative.');
    t.check('a self-reference, unless opted in', no(router.canConnect(end('a', 'out'), end('a', 'one'))),
            CONNECTOR_STRINGS.selfReference);
    t.ok('…an end gone is said before a port gone', /node/.test(no(router.canConnect(end('zz', 'nope'), end('b', 'nope')))));
    const self = build({ selfReference: true }).router;
    t.check('opted in, a self-reference is allowed and says so', self.canConnect(end('a', 'out'), end('a', 'one')),
            { ok: true, selfReference: true });
    t.check('an ordinary drop', router.canConnect(end('a', 'out'), end('b', 'in')), { ok: true, selfReference: false });

    router.hydrate([{ id: 'e1', from: 'a', to: 'b', fromPort: 'one', toPort: 'in' }]);
    t.check('a port of capacity one that carries a line', no(router.canConnect(end('a', 'one'), end('b', 'in'))),
            CONNECTOR_STRINGS.portFull(1));
    t.ok('the words count', /its one connection/.test(CONNECTOR_STRINGS.portFull(1)) && /its 3 connections/.test(CONNECTOR_STRINGS.portFull(3)));
    t.check('allowMultiple: false is a capacity of one, counted with PENDING edges too',
            no(router.canConnect(end('a', 'out'), end('b', 'single'), {
                pendingEdges: [{ id: 'staged:1', from: 'a', to: 'b', fromPort: 'out', toPort: 'single' }] })),
            CONNECTOR_STRINGS.portFull(1));
    t.ok('a port with room takes another line', router.canConnect(end('a', 'out'), end('b', 'single')).ok);
    t.check('connectionsAt counts both ends', [router.connectionsAt('a', 'one'), router.connectionsAt('b', 'in'),
                                               router.connectionsAt('b', 'single')], [1, 1, 0]);
    const worded = build({ strings: { nodeGone: 'That box is gone.' } }).router;
    t.check('the sentences are the embedder\'s to replace', worded.canConnect(end('zz', 'x'), end('b', 'in')).reason,
            'That box is gone.');
    t.check('…and the rest keep their defaults', worded.canConnect(end('a', 'nope'), end('b', 'in')).reason,
            CONNECTOR_STRINGS.portGone);
}

t.section('§3 then the policy');
{
    const seen = [];
    const { router } = build({
        policy: (ctx) => {
            seen.push(ctx);
            if (ctx.toPort.id === 'single') return { ok: false, reason: `${ctx.toNode.label} takes nothing from ${ctx.fromNode.label}.` };
            if (ctx.toPort.id === 'in' && ctx.fromPort.id === 'one') return { ok: true, offer: { op: 'widen', port: 'in' } };
            return null;
        },
    });
    t.check('its refusal is the answer, in its words', router.canConnect(end('a', 'out'), end('b', 'single')),
            { ok: false, reason: 'B takes nothing from A.' });
    const ctx = seen.at(-1);
    t.ok('it is handed the nodes, the ports, the pending edges and the router',
         ctx.fromNode.id === 'a' && ctx.toPort.id === 'single' && Array.isArray(ctx.pendingEdges)
         && Array.isArray(ctx.edges) && ctx.router === router && ctx.selfReference === false);
    t.check('an OFFER is a yes', router.canConnect(end('a', 'one'), end('b', 'in')), { ok: true, offer: { op: 'widen', port: 'in' } });
    t.check('nothing returned is a plain yes', router.canConnect(end('a', 'out'), end('b', 'in')), { ok: true, selfReference: false });
    const n = seen.length;
    router.canConnect(end('a', 'off'), end('b', 'in'));
    t.ok('the policy is never asked about what the generic rules already refused', seen.length === n);
    const sourceOnly = build({ disabledEnds: ['source'] }).router;
    t.ok('disabledEnds: [\'source\'] lets a disabled TARGET through to the policy',
         sourceOnly.canConnect(end('b', 'in'), end('a', 'off')).ok
         && !sourceOnly.canConnect(end('a', 'off'), end('b', 'in')).ok);
}

t.section('§4 the edge store');
{
    const { router } = build();
    router.hydrate([{ id: 'e1', from: 'a', to: 'b', fromPort: 'out', toPort: 'in' },
                    { id: 'e2', from: 'b', to: 'c', fromPort: 'single', toPort: 'x' }]);
    t.check('edgesFor finds both directions', router.edgesFor('b').map((e) => e.id), ['e1', 'e2']);
    router.stage({ id: 'staged:1', from: 'a', to: 'b' });
    t.ok('stage records an edge', router.edges.has('staged:1'));
    t.check('unstage returns it', router.unstage('staged:1')?.id, 'staged:1');
    t.ok('…and null for one it does not hold', router.unstage('staged:1') === null);
    const r = router.remapNodeConnections('b', ['in']);
    t.check('a node rebuilt with fewer ports: edges whose port survives are kept, the rest REPORTED',
            { remapped: r.remapped, removed: r.removed.map((e) => e.id), left: [...router.edges.keys()] },
            { remapped: 1, removed: ['e2'], left: ['e1'] });
    router.hydrate([{ id: 'k1', from: 'a', to: 'b', col: 'x' }, { id: 'k2', from: 'a', to: 'b', col: 'y' }]);
    const keyed = router.remapNodeConnections('a', ['col:x'], { endsOf: (e) => ({ from: `col:${e.col}`, to: null }) });
    t.check('endsOf names the ports an edge uses; an end that names none is not checked',
            { remapped: keyed.remapped, removed: keyed.removed.map((e) => e.id) }, { remapped: 1, removed: ['k2'] });
    router.hydrate([{ id: 'n1', from: 'a', to: 'b' }]);
    t.check('an edge naming no port at all always maps', router.remapNodeConnections('a', []).remapped, 1);
}

t.section('§5 HistoryService');
{
    const positions = { a: { x: 0, y: 0 } };
    const applied = [];
    const history = new HistoryService({
        actions: ['node:move', 'node:collapse'],
        apply: (entry, direction) => {
            applied.push(`${entry.action}:${direction}`);
            if (entry.action === 'node:move') positions[entry.id] = { ...(direction === 'undo' ? entry.before : entry.after) };
        },
        onState: (s) => applied.push(`state:${s.canUndo}:${s.canRedo}:${s.depth}`),
        limit: 3,
    });
    history.record('node:move', { id: 'a', before: { x: 0, y: 0 }, after: { x: 9, y: 9 } });
    t.ok('nothing is recorded before hydration — opening is not undoable', !history.canUndo && history.recording === false);
    history.hydrated();
    t.ok('hydrated() starts recording, with empty stacks', history.recording && !history.canUndo && !history.canRedo);
    positions.a = { x: 100, y: 100 };
    history.record('node:move', { id: 'a', before: { x: 0, y: 0 }, after: { x: 100, y: 100 } });
    t.ok('a move after hydration is undoable', history.canUndo);
    applied.length = 0;
    history.undo();
    t.check('undo puts it back through apply, and reports the state', [positions.a, applied], [{ x: 0, y: 0 },
            ['node:move:undo', 'state:false:true:0']]);
    history.redo();
    t.check('redo reapplies it', positions.a, { x: 100, y: 100 });
    t.ok('undo and redo with nothing there are false', (() => { history.reset(); return !history.undo() && !history.redo(); })());
    for (const y of [10, 20, 30, 40]) {
        const before = { ...positions.a };
        positions.a = { x: 0, y };
        history.record('node:move', { id: 'a', before, after: { x: 0, y } });
    }
    t.ok('the limit drops the oldest', history.undoStack.length === 3);
    history.undo(); history.undo(); history.undo();
    t.check('three moves undo in three steps — the fourth was dropped', positions.a, { x: 0, y: 10 });
    history.reset();
    history.record('node:move', { id: 'a', before: { x: 0, y: 10 }, after: { x: 1, y: 1 } });
    history.undo();
    history.record('node:collapse', { id: 'a', before: false, after: true });
    t.ok('a new action invalidates the redo branch', !history.canRedo);
    history.reset();
    history.startBatch('arrange');
    history.record('node:move', { id: 'a', before: { x: 0, y: 0 }, after: { x: 1, y: 0 } });
    history.record('node:move', { id: 'a', before: { x: 1, y: 0 }, after: { x: 2, y: 0 } });
    history.endBatch();
    t.check('a batch is ONE entry', history.undoStack.map((e) => [e.action, e.label, e.entries.length]), [['batch', 'arrange', 2]]);
    applied.length = 0;
    history.undo();
    t.check('…undone in reverse order', [positions.a, applied.filter((a) => !a.startsWith('state'))],
            [{ x: 0, y: 0 }, ['node:move:undo', 'node:move:undo']]);
    history.startBatch('empty');
    history.endBatch();
    t.ok('an empty batch records nothing', !history.canUndo);
    t.throws('an undeclared action cannot be recorded at all', () => history.record('server:apply', {}), /not an undoable action/);
    const worded = new HistoryService({ actions: ['x'], apply() {}, refusal: (a) => `${a} would reach the server.` });
    worded.hydrated();
    t.throws('…and the refusal is the embedder\'s sentence when it gives one', () => worded.record('y', {}), /^y would reach the server\.$/);
    t.check('the closed list is frozen and exactly what was given', [Object.isFrozen(history.actions), history.actions],
            [true, ['node:move', 'node:collapse']]);
    history.reset();
    history.adopt({ undo: [{ action: 'node:move', id: 'a', before: { x: 5, y: 5 }, after: { x: 0, y: 0 } }], redo: [] });
    t.ok('adopt takes a predecessor\'s stacks', history.canUndo && !history.canRedo);
    history.undo();
    t.check('…and they undo here', positions.a, { x: 5, y: 5 });
    const cold = new HistoryService({ actions: ['x'], apply() {} });
    cold.adopt({ undo: [{ action: 'x' }] });
    t.ok('adopt before hydration takes nothing', !cold.canUndo);
}

t.section('§6 an incomplete dependency set fails loudly, at construction');
t.throws('no actions', () => new HistoryService({ apply() {} }), /full dependency set/);
t.throws('no apply', () => new HistoryService({ actions: ['x'] }), /apply/);
t.throws('a subclass\'s own dependency missing', () => new HistoryService({ actions: ['x'], apply() {},
    requires: { platform: {}, router: null } }), /HistoryService needs router\. .*full dependency set/);

t.section('§7 a diagram\'s rules as a subclass — the shape a consumer writes');
{
    // A small "boxes with fields" diagram: a header port that means the box's
    // key, field ports, a key field that a collapsed box keeps, a policy with
    // an OFFER and its own sentences, and a delta history of its own actions.
    class BoxPlatform extends NodePlatform {
        constructor() { super({ collapsedPorts: (n) => n.ports.filter((p) => p.role === 'box' || p.meta.key) }); }
        hydrate(boxes, { visibleFields }) {
            super.hydrate(boxes.map((b) => ({
                id: b.id, box: b, position: b.position,
                ports: [{ id: 'box', role: 'box', meta: { key: true } },
                        ...visibleFields(b).map((f) => ({ id: `field:${f.name}`, role: 'field', meta: { ...f },
                                                         disabled: Boolean(f.locked),
                                                         disabledReason: f.locked ? `${f.name} is locked.` : undefined }))],
            })));
        }
    }
    class BoxRouter extends ConnectorRouter {
        constructor({ platform }) {
            super({
                platform, selfReference: true, disabledEnds: ['source'],
                endsOf: (e) => ({ from: `field:${e.from_field}`, to: e.to_field ? `field:${e.to_field}` : 'box' }),
                strings: { nodeGone: 'That box is no longer on the diagram.' },
                policy: ({ fromNode, toNode, toPort, fromPort }) => {
                    if (toPort.role === 'field' && !toPort.meta.unique) {
                        return { ok: true, offer: { make: 'unique', field: toPort.meta.name },
                                 fromField: fromPort.meta.name, toField: toPort.meta.name };
                    }
                    return { ok: true, fromField: fromPort.meta.name ?? null,
                             toField: toPort.role === 'box' ? 'key' : toPort.meta.name, self: fromNode.id === toNode.id };
                },
            });
        }
    }
    const ACTIONS = ['box:move', 'plan:add'];
    class BoxHistory extends HistoryService {
        constructor({ platform, router, plan, onState }) {
            super({
                actions: ACTIONS, requires: { platform, router, plan }, onState,
                refusal: (a) => `${a} is not undoable: only layout and staged edits are.`,
                apply: (entry, direction) => {
                    if (entry.action === 'box:move') platform.setPosition(entry.id, direction === 'undo' ? entry.before : entry.after, { silent: true });
                    if (entry.action === 'plan:add') {
                        if (direction === 'undo') { plan.pop(); router.unstage(entry.edge.id); } else { plan.push(entry.op); router.stage(entry.edge); }
                    }
                },
            });
            this.platform = platform; this.router = router; this.plan = plan;
        }
    }
    const boxes = [{ id: 'B1', position: { x: 0, y: 0 }, fields: [{ name: 'id', key: true, unique: true }, { name: 'owner', locked: false },
                                                                  { name: 'stamp', locked: true }] },
                   { id: 'B2', fields: [{ name: 'id', key: true, unique: true }, { name: 'code' }] }];
    const platform = new BoxPlatform();
    platform.hydrate(boxes, { visibleFields: (b) => b.fields });
    const router = new BoxRouter({ platform });
    const plan = [];
    const history = new BoxHistory({ platform, router, plan });
    history.hydrated();
    t.check('a drop on the header means the key', router.canConnect(end('B1', 'field:owner'), end('B2', 'box')),
            { ok: true, fromField: 'owner', toField: 'key', self: false });
    t.check('a drop on a non-unique field is an OFFER, not a failure',
            router.canConnect(end('B1', 'field:owner'), end('B2', 'field:code')).offer, { make: 'unique', field: 'code' });
    t.check('a locked field cannot START a line, in the diagram\'s words',
            router.canConnect(end('B1', 'field:stamp'), end('B2', 'box')).reason, 'stamp is locked.');
    t.ok('…but can be dropped on (disabledEnds: source)', router.canConnect(end('B2', 'field:code'), end('B1', 'field:stamp')).ok);
    t.ok('a self-reference is a first-class drop here', router.canConnect(end('B1', 'field:owner'), end('B1', 'box')).self === true);
    t.check('the generic refusals take the diagram\'s words', router.canConnect(end('B9', 'x'), end('B1', 'box')).reason,
            'That box is no longer on the diagram.');
    platform.setCollapsed('B1', true);
    t.check('a collapsed box keeps its header and its key field', platform.visiblePorts('B1').map((p) => p.id),
            ['box', 'field:id']);
    const edge = { id: 'staged:1', from: 'B1', to: 'B2', from_field: 'owner', to_field: null };
    plan.push({ op: 'add_reference' });
    router.stage(edge);
    history.record('plan:add', { op: { op: 'add_reference' }, edge });
    history.undo();
    t.ok('undoing the staged edit takes it out of the plan AND off the diagram', plan.length === 0 && !router.edges.has('staged:1'));
    history.redo();
    t.ok('redo puts both back', plan.length === 1 && router.edges.has('staged:1'));
    t.throws('the diagram\'s closed list refuses in its words', () => history.record('server:apply', {}), /only layout and staged edits/);
    t.throws('and its constructor fails loudly without a plan', () => new BoxHistory({ platform, router }), /needs plan/);
    t.check('remap reads the diagram\'s endsOf', router.remapNodeConnections('B1', ['field:id']).removed.map((e) => e.id), ['staged:1']);
}

t.done();
