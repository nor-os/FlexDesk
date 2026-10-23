/**
 * THE MODELER DEMO (STORY-0084) — demo/flow_modeler.html, the page that uses
 * every canvas-editor modeler option of EPIC-0073 together, held where jsdom
 * can hold it (the measured half is demo/flow_modeler_probe.mjs, in headless
 * Edge):
 *
 *   §1  demo/index.html links to it, and it loads its script
 *   §2  it mounts and shows custom node bodies, data connections, a group, a
 *       note and styled lines (an arrow, a dash, a label)
 *   §3  its live badges are repainted by its own timer at least once a second,
 *       and a settings field being typed into keeps the focus
 *   §4  the docs' *Building a modeler* section names every modeler option,
 *       each in a short example
 *
 *     node tests/flow_modeler_demo.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow modeler demo');
const { document } = t;

t.section('§1 demo/index.html opens it');
{
    const index = t.read('demo/index.html');
    t.ok('index.html links to flow_modeler.html', /<a\b[^>]*href="\.\/flow_modeler\.html"/.test(index));
    t.ok('the page loads its script', /<script type="module" src="\.\/flow_modeler\.js">/.test(t.read('demo/flow_modeler.html')));
}

const host = document.createElement('div');
host.id = 'host';
document.body.appendChild(host);
await import('../demo/flow_modeler.js');
const demo = globalThis.window.__flowModeler;
const el = demo.editor.el;
const node = (id) => el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);

t.section('§2 what it shows');
{
    t.ok('the demo is ready', demo.ready === true);
    t.ok('a gain draws its own body, a slider', Boolean(node('scale').querySelector('.twm-flow-graph__node-body input[type="range"]')));
    t.ok('a display draws its own body, a readout', Boolean(node('scope').querySelector('.twm-flow-graph__node-body output')));
    t.check('they carry their accents', [node('scale').dataset.accent, node('scope').dataset.accent], ['amber', 'violet']);
    const graph = demo.editor.getGraph();
    t.check('four lines, every one between data ports', graph.connections.length, 4);
    t.ok('…each drawn', el.querySelectorAll('path.twm-flow-graph__edge').length === 4);
    t.ok('…from a data output to a data input', graph.connections.every((c) => {
        const ports = (id) => demo.catalogue.get(graph.nodes.find((n) => n.id === id).type).ports;
        return ports(c.source).find((p) => p.name === c.sourcePort).port_type === 'DATA'
            && ports(c.target).find((p) => p.name === c.targetPort).port_type === 'DATA';
    }));
    t.check('one group frame, round the two sources', [el.querySelectorAll('.twm-flow-graph__group').length, graph.groups],
            [1, [{ id: 'group', label: 'Inputs', tone: 'teal', nodes: ['wave', 'drift'] }]]);
    t.check('one note', el.querySelectorAll('.twm-flow-graph__note').length, 1);
    t.ok('styled lines: an arrowhead on each', el.querySelectorAll('.twm-flow-graph__edge-arrow').length === 4);
    t.check('a dashed one (the subtracted input)', el.querySelectorAll('path.twm-flow-graph__edge--dashed').length, 1);
    t.check('a labelled one (the gain\'s factor)', [...el.querySelectorAll('.twm-flow-graph__edge-label')].map((l) => l.textContent),
            ['× 1.50']);
}

t.section('§3 live badges, and the focus stays');
{
    const badge = () => node('mix').querySelector('.twm-flow-graph__node-badge')?.textContent;
    demo.editor.select('wave');
    const field = el.querySelector('.twm-flow-panel [data-field="period"] input');
    field.focus();
    const ticks = demo.ticks;
    const seen = new Set([badge()]);
    for (let i = 0; i < 6; i += 1) { await t.tick(170); seen.add(badge()); }
    t.ok('the timer repainted at least once a second', demo.ticks - ticks >= 4, `${demo.ticks - ticks} paints in ~1 s`);
    t.ok('the badge showed more than one value', seen.size >= 2, JSON.stringify([...seen]));
    t.ok('the settings field kept the focus', document.activeElement === field);
    t.check('no edit was recorded', [demo.changes, demo.editor.history.depth], [0, 0]);
    demo.stop();
}

t.section('§4 the docs section names every modeler option');
{
    const docs = t.read('docs/components/flow-canvas-editor.md');
    const at = docs.indexOf('### Building a modeler');
    // The section runs to the next heading of its own level or above (here, the end of the page).
    const after = at < 0 ? -1 : docs.slice(at + 5).search(/\n#{1,3} /);
    const section = at < 0 ? '' : after < 0 ? docs.slice(at) : docs.slice(at, at + 5 + after);
    t.ok('there is a section', section.length > 0);
    const OPTIONS = ['render', 'update', 'size', 'accent', 'setCatalogue', 'connections', 'dataPorts', 'accepts', 'provides',
                     'policy', 'multiSelect', 'clipboard', 'prepareCopy', 'groups', 'notes', 'layout', 'rank', 'edgeStyle',
                     'routing', 'hoverHighlight', 'viewport', 'onViewportChange', 'zoomControls', 'minimap', 'renameInPlace',
                     'inline', 'setNodeValues', 'collapsible'];
    const code = [...section.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
    const missing = OPTIONS.filter((o) => !new RegExp(`\\b${o}\\b`).test(code));
    t.check('every option is in one of its examples', missing, []);
    const listed = OPTIONS.filter((o) => !section.includes(`\`${o}\``));
    t.check('…and named in its list', listed, []);
}

demo.editor.destroy();
t.done();
