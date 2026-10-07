/**
 * THE LANE LAYOUT, PURE (36 §7.3, §8) — and spike S-lanes (BRIEF-flows).
 *
 *   §1  layoutLanes over the fixture set (`fixtures/flow_lanes_layouts.json`):
 *       the Pipeline mock, the mock with its feeder listed first, a fork,
 *       nested feeders, a feeder never pulled left, feeders before forks, an
 *       unconnected step, a three-lane union, and the three refusals
 *   §2  S-LANES: the mock reproduced — Programmes at column 1 in lane 1, the
 *       join at column 2 in lane 0 — and with the feeder listed FIRST the join
 *       still sits in the main lane; the earlier layout (EcoSim's buildLanes,
 *       copied below verbatim) on the same input puts it in the feeder's lane
 *   §3  placeLanes: the mock's own coordinates, at all three sizes — cards,
 *       bands, the straight wires, the join's elbow and its port dot, the
 *       surface size
 *   §4  the order of the nodes array decides nothing but the roots' order:
 *       every permutation of the mock's nodes gives the same lanes
 *   §5  roundedPath: corners rounded, never past half a segment
 *
 *     node tests/flow_lanes_layout.test.mjs        (plain node; no DOM)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertions } from './flow_env.mjs';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';
import { LANE_GEOMETRY, layoutLanes, placeLanes, roundedPath } from '../src/flow/lanes/layout.js';
import { CATEGORIES, MOCK_PIPELINE, TYPES } from './fixtures/flow_lanes_fixture.mjs';

const t = assertions('flow lanes — layout');
const catalogue = createStepCatalogue(TYPES, { categories: CATEGORIES });
const fixture = JSON.parse(t.read('tests/fixtures/flow_lanes_layouts.json'));

const pipelineOf = (c) => ({
    nodes: c.nodes.map(([id, type]) => ({ id, type, config: {} })),
    connections: c.connections.map(([id, sourceId, targetId, targetPort]) => ({ id, sourceId, sourcePort: 'out',
                                                                                targetId, targetPort })),
    parameters: {},
});
const lanesOf = (layout) => layout.lanes.map((l) => l.steps.map((s) => [s.id, s.column]));
const wiresOf = (layout) => layout.wires.map((w) => [w.kind, w.from, w.to, w.toPort]);

t.section('§1 the fixture set');
for (const c of fixture.cases) {
    const layout = layoutLanes(pipelineOf(c), catalogue);
    t.check(`${c.name}: lanes`, lanesOf(layout), c.lanes);
    t.check(`${c.name}: kinds and parents`, layout.lanes.map((l) => [l.kind, l.parent]), c.kinds);
    t.check(`${c.name}: wires`, wiresOf(layout), c.wires);
    t.check(`${c.name}: problems`, layout.problems.map((p) => [p.code, p.node_id]), c.problems);
    if (c.unconnected) t.check(`${c.name}: flagged`, layout.lanes.map((l) => l.unconnected), c.unconnected);
    if (c.slots) {
        for (const [conn, [slot, slots]] of Object.entries(c.slots)) {
            const w = layout.wires.find((x) => x.connection === conn);
            t.check(`${c.name}: ${conn} enters slot ${slot} of ${slots}`, [w?.slot, w?.slots], [slot, slots]);
        }
    }
    if (c.cycle) t.check(`${c.name}: the set-aside line is marked`, layout.wires.filter((w) => w.cycle).map((w) => w.connection), c.cycle);
    t.ok(`${c.name}: every problem says what it is, with a sentence`, layout.problems.every((p) => typeof p.message === 'string' && p.message.length > 20));
    t.check(`${c.name}: columns`, layout.columns, c.lanes.length ? Math.max(...c.lanes.flat().map(([, col]) => col)) + 1 : 0);
}

t.section('§2 S-lanes — the mock, and the join that stays in its lane');
{
    const mock = layoutLanes(MOCK_PIPELINE, catalogue);
    t.check('Programmes is in lane 1 at column 1', mock.at.prog, { lane: 1, column: 1, position: 0 });
    t.check('the join is in lane 0 at column 2', mock.at.join, { lane: 0, column: 2, position: 2 });
    const first = { ...MOCK_PIPELINE, nodes: [MOCK_PIPELINE.nodes[2], ...MOCK_PIPELINE.nodes.filter((n) => n.id !== 'prog')] };
    const ours = layoutLanes(first, catalogue);
    t.check('with Programmes listed first: the join is STILL in lane 0, the main lane', ours.at.join.lane, 0);
    t.check('…and lane 0 is still the portal\'s', ours.lanes[0].steps.map((s) => s.id),
            ['src', 'intake', 'join', 'tidy', 'rename', 'sink']);

    // EcoSim, html/js_new/ui/components/pipeline_flow_canvas.js:61-108, verbatim
    // but for its comments (EcoSim 06dc01e). Its join belongs to whichever lane
    // reaches it first.
    function buildLanes(nodes, connections) {
        if (!nodes.length) return [];
        const outgoing = new Map();
        const incoming = new Map();
        for (const conn of connections) {
            if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
            outgoing.get(conn.sourceId).push(conn.targetId);
            if (!incoming.has(conn.targetId)) incoming.set(conn.targetId, []);
            incoming.get(conn.targetId).push(conn.sourceId);
        }
        const sources = nodes.filter(n => !incoming.has(n.id) || incoming.get(n.id).length === 0);
        if (sources.length === 0 && nodes.length > 0) {
            sources.push(nodes[0]);
        }
        const lanes = [];
        const visited = new Set();
        for (const source of sources) {
            const lane = [];
            let current = source.id;
            while (current && !visited.has(current)) {
                visited.add(current);
                lane.push(current);
                const targets = outgoing.get(current) || [];
                current = targets.find(t => !visited.has(t)) ?? null;
            }
            if (lane.length > 0) lanes.push(lane);
        }
        for (const n of nodes) {
            if (!visited.has(n.id)) {
                lanes.push([n.id]);
                visited.add(n.id);
            }
        }
        return lanes;
    }
    const theirs = buildLanes(first.nodes, first.connections);
    const lane = theirs.findIndex((l) => l.includes('join'));
    t.check('EcoSim\'s buildLanes, same input: the join is in the FEEDER\'s lane', theirs[lane][0], 'prog');
    t.check('…which swallows the rest of the flow', theirs, [['prog', 'join', 'tidy', 'rename', 'sink'], ['src', 'intake']]);
    t.check('…and in the mock\'s own order it happened to be right', buildLanes(MOCK_PIPELINE.nodes, MOCK_PIPELINE.connections),
            [['src', 'intake', 'join', 'tidy', 'rename', 'sink'], ['prog']]);
    // The copy is checked against the source when the sibling checkout exists.
    const ecosim = join(t.root, '../EcoSim/html/js_new/ui/components/pipeline_flow_canvas.js');
    if (existsSync(ecosim)) {
        const src = readFileSync(ecosim, 'utf8');
        const strip = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
        const theirsText = src.slice(src.indexOf('function buildLanes('), src.indexOf('// ── Component'));
        t.ok('the copy is EcoSim\'s buildLanes, token for token', strip(theirsText) === strip(buildLanes.toString()));
    } else {
        t.ok('no EcoSim checkout beside this one: the copy stands as written', true);
    }
}

t.section('§3 placeLanes — the mocks\' coordinates');
{
    const layout = layoutLanes(MOCK_PIPELINE, catalogue);
    const p = placeLanes(layout, 'regular');
    const card = (id) => p.cards.find((c) => c.id === id);
    t.check('regular: the numbers are the mock\'s CW, CH, GAP, LANE_PAD, LANE_GAP',
            [p.geometry.width, p.geometry.height, p.geometry.gap, p.geometry.lanePad, p.geometry.laneGap], [200, 62, 30, 12, 26]);
    t.check('regular: x = 12 + column·230, y = lane·112 + 12', [card('src'), card('prog'), card('sink')].map((c) => [c.x, c.y]),
            [[12, 12], [242, 124], [1162, 12]]);
    t.check('regular: the bands', p.bands.map((b) => [b.top, b.height]), [[0, 86], [112, 86]]);
    t.check('regular: the surface is the mock\'s laneW × laneH', [p.width, p.height], [1374, 198]);
    const lane = p.wires.find((w) => w.from === 'src');
    t.check('regular: a lane wire runs from the tip (x+196) to the next notch (x+12), mid-card', lane.d, 'M208 43H254');
    const join = p.wires.find((w) => w.kind === 'join');
    t.check('regular: the join\'s elbow — right from Programmes, up into the join\'s bottom centre', join.points,
            [{ x: 438, y: 155 }, { x: 572, y: 155 }, { x: 572, y: 74 }]);
    t.check('regular: …rounded', join.d, 'M438 155H562Q572 155 572 145V74');
    t.check('regular: …with the port dot at the join\'s bottom centre', join.port, { x: 572, y: 74 });

    const s = placeLanes(layout, 'strip');
    const sc = (id) => s.cards.find((c) => c.id === id);
    t.check('strip: 92 × 26 cards, 102 apart, lanes 40 apart', [sc('intake'), sc('prog')].map((c) => [c.x, c.y, c.w, c.h]),
            [[102, 0, 92, 26], [102, 40, 92, 26]]);
    t.check('strip: the surface is the PipelineStep mock\'s 602 × 66', [s.width, s.height], [602, 66]);
    t.check('strip: a lane wire is the mock\'s, x 90 → 108', s.wires.find((w) => w.from === 'src').d, 'M90 13H108');
    const sj = s.wires.find((w) => w.kind === 'join');
    t.check('strip: the join\'s elbow is the mock\'s, from (192, 53) to (250, 26)', [sj.points[0], sj.points[2]],
            [{ x: 192, y: 53 }, { x: 250, y: 26 }]);
    t.check('strip: no port dot', sj.port, null);

    const m = placeLanes(layout, 'small');
    const mc = (id) => m.cards.find((c) => c.id === id);
    t.check('small: the PipelineInWorkflow mock\'s 160 × 50, x = 10 + column·184, y 8 and 92',
            [mc('src'), mc('prog')].map((c) => [c.x, c.y, c.w, c.h]), [[10, 8, 160, 50], [194, 92, 160, 50]]);
    t.check('small: a lane wire is the mock\'s, colX + 156 → next + 10', m.wires.find((w) => w.from === 'src').d, 'M166 33H204');
    const mj = m.wires.find((w) => w.kind === 'join');
    t.check('small: the elbow starts at the mock\'s (350, 117) and ends at the join\'s bottom', [mj.points[0], mj.port],
            [{ x: 350, y: 117 }, { x: 458, y: 58 }]);

    const union = layoutLanes(pipelineOf(fixture.cases.find((c) => c.name.startsWith('a union'))), catalogue);
    const up = placeLanes(union, 'regular');
    const dots = up.wires.filter((w) => w.kind === 'join').map((w) => [w.toPort, w.port.x]);
    t.check('two joined inputs enter at a third and two thirds of the card, in declared order',
            dots.sort(), [['in_2', 242 + 200 / 3], ['in_3', 242 + 400 / 3]].sort());
    const fork = layoutLanes(pipelineOf(fixture.cases.find((c) => c.name.startsWith('a fork'))), catalogue);
    const fp = placeLanes(fork, 'regular').wires.find((w) => w.kind === 'fork');
    t.check('a fork leaves the forking card\'s bottom centre, down, then right into the new lane',
            fp.points, [{ x: 342, y: 74 }, { x: 342, y: 155 }, { x: 484, y: 155 }]);
    t.check('the geometry names are frozen', Object.isFrozen(LANE_GEOMETRY.regular), true);
}

t.section('§4 the nodes array\'s order decides only the roots\' order');
{
    const want = JSON.stringify(lanesOf(layoutLanes(MOCK_PIPELINE, catalogue)));
    const perms = (list) => (list.length <= 1 ? [list]
        : list.flatMap((x, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest])));
    let all = 0;
    let same = 0;
    for (const order of perms(MOCK_PIPELINE.nodes)) {
        all += 1;
        const got = JSON.stringify(lanesOf(layoutLanes({ ...MOCK_PIPELINE, nodes: order }, catalogue)));
        if (got === want) same += 1;
    }
    t.check('every one of the 5,040 orders of the mock\'s steps draws the same lanes', [all, same], [5040, 5040]);
}

t.section('§5 roundedPath');
{
    t.check('a straight line', roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 10), 'M0 0H10');
    t.check('an elbow, rounded by 10', roundedPath([{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }], 10),
            'M0 50H90Q100 50 100 40V0');
    t.check('a short leg rounds by half of it, never past it', roundedPath([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 30 }], 10),
            'M0 0H4Q8 0 8 4V30');
    t.check('two corners', roundedPath([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 10 }], 10),
            'M0 0V30Q0 40 10 40H50Q60 40 60 30V10');
}

t.done();
