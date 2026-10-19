/**
 * EDITED ON THE NODE (STORY-0079) — a node's title typed in place
 * (`renameInPlace`) and a type's `inline` settings drawn on the node by the
 * panel's widget registry. Each is a way the editor could be wrong without
 * throwing:
 *
 *   §1  opt-in: without `renameInPlace` and without `inline` nothing changes —
 *       the same markup, a double-click opens nothing, the same text out —
 *       and an `inline` naming a setting the schema lacks is a problem, never
 *       a throw
 *   §2  a double-click on the title shows a text box with the name selected
 *   §3  Enter or leaving the box is ONE `flow:node:label` entry (Ctrl+Z puts
 *       the name back); Escape restores the name and records nothing; the
 *       same name records nothing; the open panel shows the new name
 *   §4  an empty name is refused with a sentence and the name it had stays,
 *       on Enter (the box stays open) and on leaving it (the box closes)
 *   §5  read only: a double-click opens no box, and going read only closes
 *       one that is open, writing nothing
 *   §6  an `inline` number setting on the node and the same setting in the
 *       panel stay in step both ways, each change one `flow:node:config`
 *       entry; the node's control being typed in keeps its element and focus;
 *       an undo redraws both; read only disables the node's control
 *   §7  `setCatalogue` with a changed `inline` rebuilds the node; the same
 *       one keeps it
 *
 *     node tests/flow_canvas_edit_in_place.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow canvas — edited on the node');
const { window: w, document } = t;
const flow = await import('../flow.js');
const { createCanvasEditor, createStepCatalogue } = flow;

const F = (name, direction) => ({ name, direction, port_type: 'FLOW' });
const CATEGORIES = [{ id: 'control', label: 'Flow', tone: 'violet' }];
const SCHEMA = { type: 'object', properties: { count: { type: 'number', title: 'Count' }, note: { type: 'string' } } };
const STEP = { type_id: 'step', label: 'Step', category: 'control', ports: [F('in', 'input'), F('out', 'output')],
               config_schema: SCHEMA };
const COUNTER = { ...STEP, type_id: 'counter', label: 'Counter', inline: ['count'] };
const GRAPH = {
    nodes: [{ id: 'a', type: 'step', label: 'First', config: {}, position: { x: 80, y: 80 } },
            { id: 'b', type: 'counter', config: { count: 3 }, position: { x: 400, y: 80 } }],
    connections: [{ source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
};

const mounted = [];
function mount(opts = {}, types = [STEP, COUNTER], graph = GRAPH) {
    const changes = [];
    const editor = createCanvasEditor(t.host(), {
        catalogue: createStepCatalogue(types, { categories: CATEGORIES }), onChange: (c) => changes.push(c), ...opts });
    editor.load({ graph: structuredClone(graph) });
    mounted.push(editor);
    return { editor, changes, el: editor.el };
}
const nodeEl = (m, id) => m.el.querySelector(`.twm-flow-graph__node[data-node-id="${id}"]`);
const titleOf = (m, id) => nodeEl(m, id).querySelector('.twm-flow-graph__node-title');
const boxOf = (m, id) => nodeEl(m, id)?.querySelector('.twm-flow-graph__node-title-input') ?? null;
const dbl = (target) => target.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
const key = (target, init) => target.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
const labelOf = (m, id) => m.editor.getGraph().nodes.find((x) => x.id === id).label;
const configOf = (m, id) => m.editor.getGraph().nodes.find((x) => x.id === id).config;
const type = (input, value) => { input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
const message = (m) => m.el.querySelector('.twm-flow-graph__message').textContent;

t.section('§1 opt-in: nothing changes without the option and the key');
{
    const plainTypes = [STEP, { ...COUNTER, inline: undefined }];
    const off = mount({}, plainTypes);
    const on = mount({ renameInPlace: true }, plainTypes);
    t.check('the same markup with the option as without', nodeEl(on, 'a').outerHTML, nodeEl(off, 'a').outerHTML);
    t.ok('a type without inline draws no inline settings', !off.el.querySelector('.twm-flow-graph__node-inline'));
    dbl(titleOf(off, 'a'));
    t.ok('without renameInPlace a double-click opens nothing', boxOf(off, 'a') === null && !titleOf(off, 'a').hidden);
    t.check('and records nothing', off.editor.history.depth, 0);
    const withInline = mount({}, [STEP, COUNTER]);
    t.check('the same text out with inline settings drawn', withInline.editor.serialise(), off.editor.serialise());
    t.check('and the same markup on a node of a type without them', nodeEl(withInline, 'a').outerHTML, nodeEl(off, 'a').outerHTML);

    const cat = createStepCatalogue([{ ...COUNTER, inline: ['count', 'nope', 7] }, { ...STEP, type_id: 'bad', inline: 'count' }]);
    t.check('inline() answers the names the schema has', [...cat.inline('counter')], ['count']);
    t.check('…and [] for a type without them', [...cat.inline('bad')], []);
    t.check('a name the schema lacks, and an inline that is not a list, are problems',
            cat.problems.map((p) => p.type_id), ['counter', 'counter', 'bad']);
}

t.section('§2 a double-click on the title shows a text box with the name selected');
{
    const m = mount({ renameInPlace: true });
    dbl(titleOf(m, 'a'));
    const box = boxOf(m, 'a');
    t.ok('a text box is in the header', box !== null && box.type === 'text'
         && box.parentElement.classList.contains('twm-flow-graph__node-head'));
    t.check('holding the name', box.value, 'First');
    t.check('named for what it does', box.getAttribute('aria-label'), 'Rename');
    t.ok('which is focused and selected whole', document.activeElement === box && box.selectionStart === 0
         && box.selectionEnd === 'First'.length);
    t.ok('in the title\'s place', titleOf(m, 'a').hidden === true);
    dbl(titleOf(m, 'b'));
    t.ok('a node with no label of its own offers its type\'s name', boxOf(m, 'b')?.value === 'Counter' && boxOf(m, 'a') === null);
    t.check('and opening and closing records nothing', m.editor.history.depth, 0);
}

t.section('§3 Enter or leaving commits one entry; Escape records nothing');
{
    const m = mount({ renameInPlace: true });
    dbl(titleOf(m, 'a'));
    let box = boxOf(m, 'a');
    box.value = 'Renamed';
    key(box, { key: 'Enter' });
    t.ok('Enter closes the box and draws the new name', boxOf(m, 'a') === null && !titleOf(m, 'a').hidden
         && titleOf(m, 'a').textContent === 'Renamed');
    t.check('the graph holds it', labelOf(m, 'a'), 'Renamed');
    t.check('exactly one undo entry', m.editor.history.depth, 1);
    t.check('a flow:node:label edit', m.editor.history.undoAction, 'flow:node:label');
    t.check('onChange heard it once', m.changes.map((c) => c.action), ['flow:node:label']);
    t.ok('focus is back on the node, where the keys arrive', document.activeElement === nodeEl(m, 'a'));
    key(nodeEl(m, 'a'), { key: 'z', ctrlKey: true });
    t.check('Ctrl+Z puts the previous name back', labelOf(m, 'a'), 'First');
    t.check('…on the node too', titleOf(m, 'a').textContent, 'First');

    // leaving the box commits
    const next = mount({ renameInPlace: true });
    dbl(titleOf(next, 'b'));
    box = boxOf(next, 'b');
    box.value = 'Tally';
    box.blur();
    t.ok('leaving the box closes it', boxOf(next, 'b') === null);
    t.check('and commits', labelOf(next, 'b'), 'Tally');
    t.check('as one entry', [next.editor.history.depth, next.editor.history.undoAction], [1, 'flow:node:label']);

    // Escape
    const esc = mount({ renameInPlace: true });
    dbl(titleOf(esc, 'a'));
    box = boxOf(esc, 'a');
    box.value = 'Never';
    key(box, { key: 'Escape' });
    t.ok('Escape closes the box', boxOf(esc, 'a') === null && !titleOf(esc, 'a').hidden);
    t.check('the previous name is drawn', titleOf(esc, 'a').textContent, 'First');
    t.check('and kept', labelOf(esc, 'a'), 'First');
    t.check('nothing is recorded', [esc.editor.history.depth, esc.changes.length], [0, 0]);

    // the same name
    dbl(titleOf(esc, 'b'));
    key(boxOf(esc, 'b'), { key: 'Enter' });
    t.check('Enter on the name it had records nothing', [esc.editor.history.depth, esc.changes.length, labelOf(esc, 'b')],
            [0, 0, undefined]);

    // the open panel follows
    const p = mount({ renameInPlace: true });
    p.editor.select('a');
    dbl(titleOf(p, 'a'));
    boxOf(p, 'a').value = 'Seen';
    key(boxOf(p, 'a'), { key: 'Enter' });
    t.check('the open panel shows the new name', p.el.querySelector('[data-twm-flow-title]').value, 'Seen');
    t.check('still one entry', p.editor.history.depth, 1);
}

t.section('§4 an empty name is refused with a reason; the name stays');
{
    const m = mount({ renameInPlace: true });
    dbl(titleOf(m, 'a'));
    const box = boxOf(m, 'a');
    box.value = '   ';
    key(box, { key: 'Enter' });
    t.ok('Enter on an empty name keeps the box open', boxOf(m, 'a') === box && box.getAttribute('aria-invalid') === 'true');
    t.check('and says why', message(m), 'A step needs a name: the one it had is kept.');
    t.check('the name it had stays', labelOf(m, 'a'), 'First');
    t.check('nothing is recorded', [m.editor.history.depth, m.changes.length], [0, 0]);
    box.value = 'Again';
    key(box, { key: 'Enter' });
    t.ok('a name typed after it is taken, and the sentence goes', labelOf(m, 'a') === 'Again' && message(m) === ''
         && m.editor.history.depth === 1);

    dbl(titleOf(m, 'a'));
    boxOf(m, 'a').value = '';
    boxOf(m, 'a').blur();
    t.ok('leaving an empty box closes it', boxOf(m, 'a') === null && !titleOf(m, 'a').hidden);
    t.check('with the sentence', message(m), 'A step needs a name: the one it had is kept.');
    t.check('the name it had drawn and kept', [titleOf(m, 'a').textContent, labelOf(m, 'a')], ['Again', 'Again']);
    t.check('and nothing more recorded', m.editor.history.depth, 1);
}

t.section('§5 read only: a double-click opens no editor');
{
    const m = mount({ renameInPlace: true, readOnly: { reason: 'Locked.' } });
    dbl(titleOf(m, 'a'));
    t.ok('no box', boxOf(m, 'a') === null && !titleOf(m, 'a').hidden);
    m.editor.setReadOnly(false);
    dbl(titleOf(m, 'a'));
    boxOf(m, 'a').value = 'Typed';
    m.editor.setReadOnly({ reason: 'Locked again.' });
    t.ok('going read only closes an open box', boxOf(m, 'a') === null && !titleOf(m, 'a').hidden);
    t.check('and writes nothing', [labelOf(m, 'a'), m.editor.history.depth], ['First', 0]);
    dbl(titleOf(m, 'a'));
    t.ok('and a double-click then opens none', boxOf(m, 'a') === null);
}

t.section('§6 an inline setting and the panel stay in step');
{
    const m = mount();
    const inlineBox = () => nodeEl(m, 'b').querySelector('.twm-flow-graph__node-inline [data-field="count"] input');
    const panelBox = () => m.el.querySelector('.twm-flow-graph__aside [data-field="count"] input');
    const inline = inlineBox();
    t.ok('the setting is drawn on the node, by the widget registry', inline !== null && inline.type === 'number'
         && nodeEl(m, 'b').querySelector('.twm-flow-graph__node-inline [data-field="count"] label').textContent === 'Count');
    t.check('showing the node\'s value', inline.value, '3');
    t.ok('only the settings named: no note on the node',
         nodeEl(m, 'b').querySelector('.twm-flow-graph__node-inline [data-field="note"]') === null);
    const rows = [...nodeEl(m, 'b').querySelectorAll('.twm-flow-graph__node-row')];
    t.ok('below the ports', rows.at(-1).nextElementSibling === inline.closest('.twm-flow-graph__node-inline'));

    m.editor.select('b');
    t.check('the panel shows the same value', panelBox().value, '3');
    inline.focus();
    type(inline, '7');
    t.check('typed on the node: the graph holds it', configOf(m, 'b'), { count: 7 });
    t.check('the panel shows it', panelBox().value, '7');
    t.check('one flow:node:config entry', [m.editor.history.depth, m.editor.history.undoAction], [1, 'flow:node:config']);
    t.ok('the node\'s control is the same element, still focused', inlineBox() === inline && document.activeElement === inline);
    type(inline, '75');
    t.check('typing on is the same entry', m.editor.history.depth, 1);

    // the panel, back to the node
    const panel = panelBox();
    panel.focus();
    type(panel, '12');
    t.check('typed in the panel: the graph holds it', configOf(m, 'b'), { count: 12 });
    t.check('the node\'s control shows it', inlineBox().value, '12');
    t.ok('the panel keeps its focus', document.activeElement === panelBox());
    t.ok('one more entry for the panel\'s gesture', m.editor.history.depth === 2 && m.editor.history.undoAction === 'flow:node:config');
    t.check('onChange heard each change', m.changes.map((c) => c.action),
            ['flow:node:config', 'flow:node:config', 'flow:node:config']);

    key(nodeEl(m, 'b'), { key: 'z', ctrlKey: true });
    t.check('an undo puts the value back', configOf(m, 'b'), { count: 75 });
    t.check('on the node', inlineBox().value, '75');
    t.check('and in the panel', panelBox().value, '75');

    type(inlineBox(), '');
    t.check('emptying the node\'s control removes the setting', configOf(m, 'b'), {});
    t.check('…and the panel\'s box is empty', panelBox().value, '');

    m.editor.setReadOnly({ reason: 'Locked.' });
    t.ok('read only disables the node\'s control', inlineBox().disabled === true);
    m.editor.setReadOnly(false);
    t.ok('and enables it again', inlineBox().disabled === false);
}

t.section('§7 setCatalogue: a changed inline rebuilds the node, the same one keeps it');
{
    const m = mount();
    const before = nodeEl(m, 'b');
    m.editor.setCatalogue(createStepCatalogue([STEP, { ...COUNTER }], { categories: CATEGORIES }));
    t.ok('an equal catalogue keeps the node', nodeEl(m, 'b') === before);
    m.editor.setCatalogue(createStepCatalogue([STEP, { ...COUNTER, inline: ['count', 'note'] }], { categories: CATEGORIES }));
    t.ok('a changed inline rebuilds it, with both settings', nodeEl(m, 'b') !== before
         && nodeEl(m, 'b').querySelectorAll('.twm-flow-graph__node-inline [data-field]').length === 2);
    m.editor.setCatalogue(createStepCatalogue([STEP, { ...COUNTER, inline: undefined }], { categories: CATEGORIES }));
    t.ok('and none left draws none', nodeEl(m, 'b').querySelector('.twm-flow-graph__node-inline') === null);
    t.check('the graph and the history are untouched', [m.editor.history.depth, configOf(m, 'b')], [0, { count: 3 }]);
}

for (const ed of mounted) ed.destroy();
t.done();
