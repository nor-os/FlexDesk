/**
 * THE CANVAS EDITOR'S LINES, STYLED BY THE CONSUMER (STORY-0081) — `edgeStyle`,
 * `routing` and `hoverHighlight`, each opt-in. Each case is a way they could be
 * wrong without throwing:
 *
 *   §1  none of them set: the edge layer, the node layer and serialise() are
 *       what they were — no style, no label layer, no marker, the simple curve
 *   §2  `dashed` puts a dash pattern on the drawn path (a class the sheet gives
 *       `stroke-dasharray`); `tone` and `width` are the sheet's custom properties
 *   §3  `marker: 'arrow'` ends the line with an arrowhead whose tip is the input
 *       port and whose base is where the path ends; a crow's-foot kind draws the
 *       kernel's foot there instead
 *   §4  `label` is drawn at the line's midpoint, in a layer the sheet stacks
 *       above every node; a press on it picks the line
 *   §5  `routing: 'obstacles'`: a line does not cross a step placed between its
 *       ends (every sampled point of the path is outside the step's box); above
 *       the kernel's node limit the lines are simple curves and the strip says so
 *   §6  `hoverHighlight`: entering a node gives its lines the highlighted class
 *       and leaving takes it away; entering a line highlights that line
 *   §7  none of it is an edit: no onChange, nothing to undo
 *
 * Where the label, the arrowhead and the routed line are DRAWN is
 * `demo/flow_canvas_edges_probe.mjs`'s, in a real browser.
 *
 *     node tests/flow_canvas_edge_style.test.mjs
 */
import { flowEnv } from './flow_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await flowEnv('flow canvas — edge styles');
const { window: w } = t;
const { createCanvasEditor, createStepCatalogue, CANVAS_NODE, canvasPortAnchor, canvasNodeBottom } = await import('../flow.js');
const { routeEdge, OBSTACLE_ROUTING_NODE_LIMIT } = await import('../canvas.js');
const { pathPoints, pathMidpoint } = await import('../src/flow/canvas_editor/layout.js');

const sheet = stripComments(t.css('flexdesk.css'));

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const catalogue = createStepCatalogue([
    { type_id: 'start', label: 'Start', role: 'start', category: 'a', ports: [F('out', 'output')] },
    { type_id: 'step', label: 'Step', category: 'a', ports: [F('in', 'input'), F('out', 'output')] },
], { categories: [{ id: 'a', label: 'A', tone: 'teal' }] });

const node = (id, x, y, type = 'step') => ({ id, type, config: {}, position: { x, y } });
const edge = (source, target) => ({ source, target, sourcePort: 'out', targetPort: 'in' });
const GRAPH = {
    nodes: [node('a', 0, 0, 'start'), node('b', 700, 0), node('c', 350, 0)],
    connections: [edge('a', 'b'), edge('c', 'b')],
};

const mounted = [];
function mount(opts = {}, graph = GRAPH) {
    const changes = [];
    const editor = createCanvasEditor(t.host(), { catalogue, onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) }, { fit: false });
    mounted.push(editor);
    return { editor, el: editor.el, changes };
}
const lines = (m) => [...m.el.querySelectorAll('path.twm-flow-graph__edge')];
const lineOf = (m, i) => lines(m)[i];
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const anchorOf = (n, port, direction) => canvasPortAnchor(catalogue, n, port, direction, CANVAS_NODE);
const lastPoint = (d) => pathPoints(d).at(-1);
const near = (p, q, tol = 0.01) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
const enter = (target) => target.dispatchEvent(new w.Event('pointerenter'));
const leave = (target) => target.dispatchEvent(new w.Event('pointerleave'));

t.section('§1 nothing set: nothing changes');
{
    const plain = mount();
    const styledNull = mount({ edgeStyle: () => null });
    const A = GRAPH.nodes[0];
    const B = GRAPH.nodes[1];
    t.check('the first line is the kernel\'s simple curve',
            lineOf(plain, 0).getAttribute('d'),
            routeEdge(anchorOf(A, 'out', 'output'), anchorOf(B, 'in', 'input'), { simple: true }));
    t.ok('no line carries a style attribute', lines(plain).every((l) => !l.hasAttribute('style')));
    t.check('the edge layer holds a line and its hit path per connection, nothing else',
            [...plain.editor.canvas.edgeLayer.children].map((x) => x.getAttribute('class')),
            ['twm-flow-graph__edge', 'twm-flow-graph__edge-hit', 'twm-flow-graph__edge', 'twm-flow-graph__edge-hit']);
    t.ok('the node layer holds only the nodes', [...plain.editor.canvas.nodeLayer.children]
        .every((x) => x.classList.contains('twm-flow-graph__node')));
    t.ok('no label layer', !plain.el.querySelector('.twm-flow-graph__edge-labels'));
    t.check('serialise() is the same with a style hook', styledNull.editor.serialise(), plain.editor.serialise());
    t.check('a style hook that answers null draws the same lines',
            lines(styledNull).map((l) => l.outerHTML), lines(plain).map((l) => l.outerHTML));
    enter(nodeEl(plain, 'b'));
    t.ok('without hoverHighlight a hover highlights nothing',
         !plain.el.querySelector('.twm-flow-graph__edge--highlighted'));
    t.throws('an unknown routing is refused', () => createCanvasEditor(null, { catalogue, routing: 'fancy' }), /routing/);
}

t.section('§2 dashed, tone, width');
{
    const seen = [];
    const m = mount({ edgeStyle: (c, ctx) => {
        seen.push({ c, ctx });
        return c.source === 'a' ? { dashed: true, tone: 'amber', width: 3 } : { tone: 'nonsense', width: -1 };
    } });
    const [first, second] = lines(m);
    t.ok('a dashed style puts the dashed class on the drawn path', first.classList.contains('twm-flow-graph__edge--dashed'));
    t.ok('…which the sheet draws as a dash pattern',
         /stroke-dasharray:\s*\d/.test(ruleBody(sheet, '.twm-flow-graph__edge--dashed') || ''));
    t.ok('an undashed line has no dash', !second.classList.contains('twm-flow-graph__edge--dashed'));
    t.check('the tone is the custom property the line\'s stroke reads',
            first.style.getPropertyValue('--twm-canvas-edge-stroke'), 'var(--twm-flow-amber-fg)');
    t.check('the width likewise', first.style.getPropertyValue('--twm-canvas-edge-width'), '3');
    t.ok('the sheet reads both, falling back to the old stroke and width',
         /stroke:\s*var\(--twm-canvas-edge-stroke,\s*#8fb4d8\)/.test(ruleBody(sheet, '.twm-flow-graph__edge'))
         && /stroke-width:\s*var\(--twm-canvas-edge-width,\s*1\.6\)/.test(ruleBody(sheet, '.twm-flow-graph__edge')));
    t.ok('an unknown tone and a width that is not positive are ignored', !second.hasAttribute('style'));
    const ctx = seen.find((x) => x.c.source === 'a').ctx;
    t.ok('the hook is handed the connection and both steps', ctx.source.id === 'a' && ctx.target.id === 'b'
         && ctx.back === false);
    ctx.source.position.x = 9999;
    t.check('…as copies', m.editor.getGraph().nodes[0].position.x, 0);
}

t.section('§3 the marker');
{
    const m = mount({ edgeStyle: (c) => ({ marker: c.source === 'a' ? 'arrow' : 'zero-or-many' }) });
    const B = GRAPH.nodes[1];
    const port = anchorOf(B, 'in', 'input');
    const head = m.el.querySelector('.twm-flow-graph__edge-arrow');
    t.ok('an arrowhead is drawn', Boolean(head));
    const tip = pathPoints(head.getAttribute('d'))[0];
    t.ok('its tip is on the input port', near(tip, port), JSON.stringify(tip));
    const end = lastPoint(lineOf(m, 0).getAttribute('d'));
    t.ok('the line ends at the arrowhead\'s base, outside the node', near(end, { x: port.x - 9, y: port.y }),
         JSON.stringify(end));
    const base = pathPoints(head.getAttribute('d')).slice(1, 3);
    t.ok('…which is across the line', base.every((p) => p.x === end.x) && base[0].y < end.y && base[1].y > end.y);
    t.ok('the arrowhead is drawn after its line, under the hit path',
         lineOf(m, 0).nextElementSibling === head && head.nextElementSibling.classList.contains('twm-flow-graph__edge-hit'));
    const foot = m.el.querySelector('g.twm-edge__marker');
    t.ok('a crow\'s-foot kind draws the kernel\'s foot', foot?.classList.contains('twm-edge__marker--zero-or-many')
         && foot.classList.contains('twm-flow-graph__edge-foot'));
    t.ok('…and the sheet tones the foot and fills the arrowhead',
         /fill:\s*var\(--twm-canvas-edge-stroke/.test(ruleBody(sheet, '.twm-flow-graph__edge-arrow') || '')
         && sheet.includes('.twm-flow-graph__edge-foot line'));
}

t.section('§4 the label');
{
    const m = mount({ edgeStyle: (c) => (c.source === 'a' ? { label: 'feeds' } : { label: '' }) });
    const tags = [...m.el.querySelectorAll('.twm-flow-graph__edge-label')];
    t.check('one label, for the line that has one', tags.map((x) => x.textContent), ['feeds']);
    const mid = pathMidpoint(lineOf(m, 0).getAttribute('d'));
    t.check('it is placed at the line\'s midpoint', [parseFloat(tags[0].style.left), parseFloat(tags[0].style.top)],
            [mid.x, mid.y]);
    const layer = m.el.querySelector('.twm-flow-graph__edge-labels');
    t.ok('in the node layer', layer.parentElement === m.editor.canvas.nodeLayer);
    t.ok('which the sheet stacks above the nodes and centres on its point',
         /z-index:\s*[1-9]/.test(ruleBody(sheet, '.twm-flow-graph__edge-labels') || '')
         && /position:\s*absolute/.test(ruleBody(sheet, '.twm-flow-graph__edge-labels') || '')
         && !/z-index/.test(ruleBody(sheet, '.twm-flow-graph__node') || '')
         && /translate\(-50%,\s*-50%\)/.test(ruleBody(sheet, '.twm-flow-graph__edge-label') || ''));
    m.editor.load({ graph: { ...structuredClone(GRAPH), nodes: [...structuredClone(GRAPH.nodes), node('d', 0, 300)] } },
                  { fit: false });
    t.ok('a step added later is still under the label layer (stacked, not ordered)',
         m.editor.canvas.nodeLayer.contains(layer) && Boolean(nodeEl(m, 'd')));
    const selects = [];
    const s = mount({ edgeStyle: () => ({ label: 'x' }), onSelect: (x) => selects.push(x) });
    s.el.querySelector('.twm-flow-graph__edge-label')
        .dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    t.check('a press on a label picks its line', selects.at(-1)?.kind, 'connection');
}

t.section('§5 routing round the steps');
{
    const inside = (p, n, pad = 0) => p.x > n.position.x - pad && p.x < n.position.x + CANVAS_NODE.width + pad
        && p.y > n.position.y - pad && p.y < canvasNodeBottom(catalogue, n, CANVAS_NODE) + pad;
    const crosses = (d, n, pad = 0) => pathPoints(d, { steps: 200 }).some((p) => inside(p, n, pad));
    const C = GRAPH.nodes[2];
    const simple = mount();
    t.ok('the probe sees the simple curve cross the step between its ends',
         crosses(lineOf(simple, 0).getAttribute('d'), C));
    const routed = mount({ routing: 'obstacles' });
    t.ok('with routing: \'obstacles\' the line does not cross it', !crosses(lineOf(routed, 0).getAttribute('d'), C),
         lineOf(routed, 0).getAttribute('d'));
    t.ok('…nor come within 4px of it', !crosses(lineOf(routed, 0).getAttribute('d'), C, 4));
    for (const [label, offset] of [['higher', -40], ['lower', 40]]) {
        const g = structuredClone(GRAPH);
        g.nodes[1].position.y += offset;
        const m = mount({ routing: 'obstacles' }, g);
        t.ok(`…and with its target ${label}`, !crosses(lineOf(m, 0).getAttribute('d'), C), lineOf(m, 0).getAttribute('d'));
    }
    t.ok('a line between neighbours with nothing between them is the plain curve',
         lineOf(routed, 1).getAttribute('d') === lineOf(simple, 1).getAttribute('d'));
    t.ok('nothing to say about routing under the limit', !routed.el.querySelector('.twm-flow-strip__line'));

    const many = structuredClone(GRAPH);
    for (let i = 0; i < OBSTACLE_ROUTING_NODE_LIMIT; i += 1) many.nodes.push(node(`n${i}`, (i % 10) * 300, 400 + Math.floor(i / 10) * 200));
    const over = mount({ routing: 'obstacles' }, many);
    t.ok(`with more than ${OBSTACLE_ROUTING_NODE_LIMIT} steps the line is the simple curve`,
         lineOf(over, 0).getAttribute('d') === lineOf(simple, 0).getAttribute('d'));
    const said = over.el.querySelector('.twm-flow-strip__line[data-code="canvas-routing-simple"]');
    t.ok('…and the strip says so', Boolean(said) && /plain curves/.test(said.textContent), said?.textContent);
    over.editor.setFindings([{ code: 'mine', message: 'Mine.', severity: 'error' }]);
    t.check('…beside the consumer\'s own findings',
            [...over.el.querySelectorAll('.twm-flow-strip__line')].map((x) => x.dataset.code).sort(),
            ['canvas-routing-simple', 'mine']);
    over.editor.load({ graph: structuredClone(GRAPH) }, { fit: false });
    t.check('back under the limit the sentence goes and the consumer\'s stays',
            [...over.el.querySelectorAll('.twm-flow-strip__line')].map((x) => x.dataset.code), ['mine']);
    t.ok('and the line is routed again', !crosses(lineOf(over, 0).getAttribute('d'), C));
    const plainOver = mount({}, many);
    t.ok('without routing: \'obstacles\' nothing is said at any size', !plainOver.el.querySelector('.twm-flow-strip__line'));
}

t.section('§6 hover highlights the attached lines');
{
    const m = mount({ hoverHighlight: true });
    const lit = () => lines(m).map((l) => l.classList.contains('twm-flow-graph__edge--highlighted'));
    t.check('nothing is highlighted at first', lit(), [false, false]);
    enter(nodeEl(m, 'a'));
    t.check('entering a node highlights its lines', lit(), [true, false]);
    leave(nodeEl(m, 'a'));
    t.check('leaving it takes the highlight away', lit(), [false, false]);
    enter(nodeEl(m, 'b'));
    t.check('a node with two lines highlights both', lit(), [true, true]);
    const before = lines(m);
    t.ok('in place: no line was rebuilt', before.every((l, i) => l === lines(m)[i]));
    m.editor.select('c');
    t.check('a repaint keeps the highlight while the pointer is there', lit(), [true, true]);
    leave(nodeEl(m, 'b'));
    t.check('and leaving takes it away', lit(), [false, false]);
    const hits = [...m.el.querySelectorAll('.twm-flow-graph__edge-hit')];
    enter(hits[1]);
    t.check('entering a line highlights that line', lit(), [false, true]);
    leave(hits[1]);
    t.check('and leaving it takes it away', lit(), [false, false]);
    t.ok('the sheet draws the highlight',
         /stroke:\s*var\(--twm-flow-focus\)/.test(ruleBody(sheet, '.twm-flow-graph__edge--highlighted') || ''));
}

t.section('§7 none of it is an edit');
{
    const m = mount({ edgeStyle: () => ({ dashed: true, marker: 'arrow', label: 'x' }), routing: 'obstacles',
                      hoverHighlight: true });
    enter(nodeEl(m, 'a'));
    leave(nodeEl(m, 'a'));
    m.editor.select('a');
    t.check('no onChange', m.changes.length, 0);
    t.ok('nothing to undo', !m.editor.history.canUndo);
    t.ok('the graph is what was loaded', m.editor.serialise() === mount({}).editor.serialise());
}

for (const e of mounted) e.destroy();
t.done();
